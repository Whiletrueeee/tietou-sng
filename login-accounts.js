// 管理员账号名单。每个账号使用一个对象，账号名区分大小写。
//
// 添加或重置密码：
// 1. 在项目目录运行：node login-accounts.js "新账号名"
// 2. 按提示输入此站专用的密码，再按回车。
// 3. 把输出的整个 { ... }, 复制到下面的方括号内。
//    重置密码时替换原来的条目，移除账号时删除整个条目。
// 4. 保存并重新发布本文件。
//
// 名单和密码校验值会随网页公开。不要填写真实密码或使用其他网站的密码。
const accounts = [
  // 在这里粘贴生成的账号条目。
];

const iterations = 600000;

if (typeof window !== "undefined") {
  window.sngAccounts = {
    find(username) {
      return accounts.find((account) => account.username === username);
    },

    async verify(account, password) {
      if (!account || password.length < 6 || password.length > 128) return false;
      const subtle = window.crypto?.subtle;
      if (!subtle) throw new Error("请通过 HTTPS 或 localhost 打开网页后登录。");
      const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits({
        name: "PBKDF2",
        salt: new TextEncoder().encode(account.salt),
        iterations,
        hash: "SHA-256"
      }, key, 256);
      const hash = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
      return hash === account.passwordHash;
    }
  };
} else if (require.main === module) {
  const { pbkdf2Sync, randomBytes } = require("node:crypto");
  const readline = require("node:readline/promises");

  async function printAccount() {
    const username = (process.argv[2] || "").trim();
    if ([...username].length < 2 || [...username].length > 20) {
      throw new Error('用法：node login-accounts.js "账号名"（账号名为 2–20 个字符）');
    }
    const input = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      const password = await input.question("输入此站专用密码（6–128 个字符，输入时可见）：");
      if (password.length < 6 || password.length > 128) throw new Error("密码长度需要为 6–128 个字符。");
      const salt = randomBytes(16).toString("hex");
      const passwordHash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
      console.log(JSON.stringify({ username, salt, passwordHash }, null, 2) + ",");
    } finally {
      input.close();
    }
  }

  printAccount().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
