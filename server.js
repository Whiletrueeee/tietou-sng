const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { promisify } = require("util");

const port = Number(process.env.PORT || 3100);
// Bind to all interfaces so a reverse proxy or another device can reach the app.
const host = process.env.HOST || "0.0.0.0";
const root = __dirname;
const stateFile = path.join(root, "server-state.json");
const accountFile = path.join(root, "accounts.json");
const managedAccountsFile = path.join(root, "managed-accounts.json");
const loginScript = path.join(root, "login-accounts.js");
const adminPassword = process.env.SNG_ADMIN_PASSWORD || "123456";
const pbkdf2 = promisify(crypto.pbkdf2);
const publicFiles = new Set(["/index.html", "/app.js", "/styles.css", "/admin.html"]);
const clients = new Set();
const sessions = new Map();

let sharedState = readSharedState();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url).catch((error) => {
      console.error(error);
      sendJson(response, 500, { error: "服务器暂时无法处理请求" });
    });
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  if (requested === "/sng-account-manager.html") {
    response.writeHead(302, { Location: "./admin.html", "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (request.method === "GET" && requested === "/login-accounts.js") {
    try {
      const config = readLoginConfig();
      const list = JSON.stringify(mergedAccounts(config).map(({ username, salt, passwordHash }) => ({ username, salt, passwordHash })));
      const script = config.source.replace(config.list[0], () => "const accounts = " + list + ";");
      response.writeHead(200, { "Content-Type": mimeTypes[".js"], "Cache-Control": "no-store" });
      response.end(script);
    } catch (error) {
      console.error(error);
      response.writeHead(500);
      response.end("Account configuration unavailable");
    }
    return;
  }
  if (!publicFiles.has(requested)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const filePath = path.join(root, requested);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
});

server.on("upgrade", (request, socket) => {
  if (request.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));

  socket.isAlive = true;
  clients.add(socket);
  send(socket, { type: "state", shared: sharedState });

  socket.on("data", (buffer) => {
    const message = decodeFrame(buffer);
    if (!message) return;
    try {
      const payload = JSON.parse(message);
      if (payload.type === "sync" && payload.shared) {
        sharedState = payload.shared;
        writeSharedState(sharedState);
        broadcast({ type: "state", shared: sharedState }, socket);
      }
    } catch (error) {
      send(socket, { type: "error", message: error.message });
    }
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

server.listen(port, host, () => {
  console.log(`SNG multiplayer server running at http://${host}:${port}`);
});

function readSharedState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const safe = sanitizeSharedState(raw);
    if (JSON.stringify(raw) !== JSON.stringify(safe)) writeSharedState(safe);
    return safe;
  } catch {
    return null;
  }
}

function sanitizeSharedState(state) {
  if (!state || typeof state !== "object") return null;
  return {
    ...state,
    users: Array.isArray(state.users)
      ? state.users
        .map((user) => ({ username: typeof user === "string" ? user : user?.username }))
        .filter((user) => user.username)
      : []
  };
}

function readAccounts() {
  try {
    const accounts = JSON.parse(fs.readFileSync(accountFile, "utf8"));
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  fs.writeFileSync(accountFile, JSON.stringify(accounts, null, 2));
}

function readLoginConfig() {
  const source = fs.readFileSync(loginScript, "utf8");
  const list = /^const accounts = (\[\]|\[[\s\S]*?^\]);/m.exec(source);
  const settings = /^const iterations = ([1-9]\d*);\r?$/m.exec(source);
  if (!list || !settings) throw new Error("无法读取 login-accounts.js");
  const body = list[1].slice(1, -1).replace(/^\s*\/\/[^\r\n]*$/gm, "").trim().replace(/,$/, "");
  return { source, list, accounts: JSON.parse("[" + body + "]"), iterations: Number(settings[1]) };
}

function readManagedAccounts() {
  try {
    const accounts = JSON.parse(fs.readFileSync(managedAccountsFile, "utf8"));
    if (!Array.isArray(accounts)) throw new Error("管理员账号库格式无效");
    return accounts;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function mergedAccounts(config) {
  const accounts = new Map(config.accounts.map(account => [account.username, account]));
  for (const account of readManagedAccounts()) accounts.set(account.username, account);
  return [...accounts.values()];
}

async function handleAdminAccounts(request, response) {
  const supplied = String(request.headers.authorization || "");
  const expected = "Basic " + Buffer.from("lbj:" + adminPassword).toString("base64");
  const digest = value => crypto.createHash("sha256").update(value).digest();
  if (!crypto.timingSafeEqual(digest(supplied), digest(expected))) {
    sendJson(response, 401, { error: "管理员账号或密码不正确" });
    return;
  }
  if (request.method !== "GET" && request.method !== "POST") {
    sendJson(response, 405, { error: "不支持此操作" });
    return;
  }
  const config = readLoginConfig();
  if (request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: "请求格式不正确" });
      return;
    }
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const validationError = validateCredentials(username, password);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await pbkdf2(password, salt, config.iterations, 32, "sha256")).toString("hex");
    const accounts = readManagedAccounts().filter(account => account.username !== username);
    accounts.push({ username, password, salt, passwordHash });
    const pendingFile = managedAccountsFile + ".tmp";
    fs.writeFileSync(pendingFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
    fs.renameSync(pendingFile, managedAccountsFile);
  }
  const accounts = mergedAccounts(config).map(({ username, password }) => ({ username, password: password ?? null }));
  sendJson(response, 200, { accounts });
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/admin/accounts") {
    await handleAdminAccounts(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "sng-poker" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/session") {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(token);
      sendJson(response, 401, { error: "登录已过期" });
      return;
    }
    sendJson(response, 200, { username: session.username });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/register") {
    sendJson(response, 403, { error: "请联系管理员开通账号" });
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/api/login") {
    sendJson(response, 404, { error: "接口不存在" });
    return;
  }
  const body = await readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const validationError = validateCredentials(username, password);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const accounts = readAccounts();
  const existing = accounts.find((account) => account.username === username);
  if (!existing || !(await verifyPassword(password, existing))) {
    sendJson(response, 401, { error: "账号或密码不正确" });
    return;
  }
  existing.lastLoginAt = new Date().toISOString();
  writeAccounts(accounts);
  const session = createSession(username);
  sendJson(response, 200, { username, token: session.token });
}

function validateCredentials(username, password) {
  const usernameLength = [...username].length;
  if (usernameLength < 2 || usernameLength > 20 || /[\u0000-\u001f]/.test(username)) return "账号长度需要为 2-20 个字符";
  if (password.length < 6 || password.length > 128) return "密码长度需要为 6-128 个字符";
  return "";
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10000) request.destroy(new Error("请求体过大"));
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("请求格式不正确"));
      }
    });
    request.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve({ salt, passwordHash: derivedKey.toString("hex") });
    });
  });
}

async function verifyPassword(password, account) {
  const record = await hashPassword(password, account.salt);
  const expected = Buffer.from(account.passwordHash, "hex");
  const actual = Buffer.from(record.passwordHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return { token };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function writeSharedState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(sanitizeSharedState(state), null, 2));
}

function broadcast(payload, except = null) {
  clients.forEach((client) => {
    if (client !== except) send(client, payload);
  });
}

function send(socket, payload) {
  if (socket.destroyed) return;
  const data = Buffer.from(JSON.stringify(payload));
  const header = data.length < 126
    ? Buffer.from([0x81, data.length])
    : data.length < 65536
      ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
      : null;
  if (!header) return;
  socket.write(Buffer.concat([header, data]));
}

function decodeFrame(buffer) {
  if (buffer.length < 6) return "";
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return "";
  const masked = Boolean(buffer[1] & 0x80);
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    return "";
  }
  if (!masked) return buffer.slice(offset, offset + length).toString();
  const mask = buffer.slice(offset, offset + 4);
  offset += 4;
  const data = buffer.slice(offset, offset + length);
  for (let index = 0; index < data.length; index += 1) data[index] ^= mask[index % 4];
  return data.toString();
}
