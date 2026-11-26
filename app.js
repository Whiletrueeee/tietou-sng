const storageKey = "friend-sng-app-state-v4-clean-seats";
["friend-sng-app-state-v3", "friend-sng-app-state-v2", "friend-sng-app-state"].forEach((key) => {
  localStorage.removeItem(key);
});
const maxPlayers = 8;
const actionSeconds = 20;
const longThinkSeconds = 60;

const roomPresets = [
  { id: "spade", code: "SPADE", name: "黑桃", symbol: "♠", state: "等待开局", blindMinutes: 8, startingChips: 10000, blindStartIndex: 0, blindLevel: "50 / 100", maxBlindIndex: 6, bumpBlindOnElimination: false },
  { id: "heart", code: "HEART", name: "红桃", symbol: "♥", state: "报名中", blindMinutes: 10, startingChips: 10000, blindStartIndex: 0, blindLevel: "50 / 100", maxBlindIndex: 6, bumpBlindOnElimination: false },
  { id: "club", code: "CLUB", name: "梅花", symbol: "♣", state: "等待开局", blindMinutes: 12, startingChips: 20000, blindStartIndex: 2, blindLevel: "100 / 200", maxBlindIndex: 6, bumpBlindOnElimination: false },
  { id: "diamond", code: "DIAMOND", name: "方片", symbol: "♦", state: "等待开局", blindMinutes: 15, startingChips: 15000, blindStartIndex: 1, blindLevel: "75 / 150", maxBlindIndex: 6, bumpBlindOnElimination: false }
];

const aiNames = ["阿俊", "小林", "Mia", "Leo", "小周", "Nina", "阿峰", "Ken"];
const aiAvatars = ["🧭", "🦊", "🎩", "🧢", "🕶️", "🎲", "🌙", "⚡"];
const positions = ["BTN", "SB", "BB", "UTG", "HJ", "CO", "MP", "LJ"];
const blindSchedule = [
  { small: 50, big: 100 },
  { small: 75, big: 150 },
  { small: 100, big: 200 },
  { small: 150, big: 300 },
  { small: 200, big: 400 },
  { small: 300, big: 600 },
  { small: 500, big: 1000 }
];
const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const suits = ["♠", "♥", "♦", "♣"];
const equitySuitOptions = ["?", "♠", "♥", "♣", "♦"];
const equityRankOptions = ["?", ...ranks];
const AI_CONFIG = {
  profiles: [
    { id: "balanced", label: "均衡", tightness: 0.55, aggression: 0.48, bluffFrequency: 0.08, callCuriosity: 0.28, skill: 0.82 },
    { id: "tight-aggressive", label: "紧凶", tightness: 0.72, aggression: 0.7, bluffFrequency: 0.06, callCuriosity: 0.18, skill: 0.78 },
    { id: "loose-aggressive", label: "松凶", tightness: 0.3, aggression: 0.78, bluffFrequency: 0.16, callCuriosity: 0.36, skill: 0.62 },
    { id: "calling-station", label: "跟注", tightness: 0.38, aggression: 0.25, bluffFrequency: 0.04, callCuriosity: 0.68, skill: 0.55 },
    { id: "careful", label: "谨慎", tightness: 0.64, aggression: 0.38, bluffFrequency: 0.07, callCuriosity: 0.24, skill: 0.72 },
    { id: "beginner", label: "新手", tightness: 0.5, aggression: 0.42, bluffFrequency: 0.12, callCuriosity: 0.44, skill: 0.42 }
  ],
  noBet: {
    weak: { check: 0.8, bet: 0.2, allin: 0 },
    medium: { check: 0.55, bet: 0.45, allin: 0 },
    strong: { check: 0.25, bet: 0.72, allin: 0.03 },
    veryStrong: { check: 0.15, bet: 0.76, allin: 0.09 }
  },
  facingBet: {
    weak: { fold: 0.72, call: 0.25, raise: 0.03, allin: 0 },
    medium: { fold: 0.34, call: 0.54, raise: 0.11, allin: 0.01 },
    strong: { fold: 0.05, call: 0.54, raise: 0.36, allin: 0.05 },
    veryStrong: { fold: 0.01, call: 0.24, raise: 0.55, allin: 0.2 }
  },
  betFractions: {
    weak: [0.33, 0.5],
    medium: [0.33, 0.5],
    strong: [0.5, 0.66, 0.75],
    veryStrong: [0.5, 0.66, 0.75, 1]
  },
  stackPlan: {
    shortStackBb: 8,
    shoveStackBb: 5,
    lowSpr: 3,
    mediumSpr: 7,
    highSpr: 10,
    deepStackBb: 18,
    awkwardRemainderBb: 3
  }
};

const defaultRooms = roomPresets.map((room, index) => ({
  ...room,
  seats: Array(maxPlayers).fill(null),
  host: "",
  ready: {},
  gameStarted: false,
  rounds: makeRounds(aiNames, index)
}));

const appState = loadState();
let activeRoomId = appState.activeRoomId || defaultRooms[0].id;
let currentUser = "";
const loginSessionKey = "sng-managed-login";
let timerId = null;
let aiTimeoutId = null;
let autoNextHandTimeoutId = null;
let clockTimerId = null;
let timerStartedAt = Date.now();
let timerDeadlineAt = 0;
let timerDurationSeconds = 0;
let pendingChipAnimations = [];
let pendingCardAnimations = [];
let seatActionMenu = null;
let activeEquityCardIndex = 0;
let equityGuessCards = [{ suit: "?", rank: "?" }, { suit: "?", rank: "?" }];
const multiplayer = {
  socket: null,
  connected: false,
  applyingRemote: false,
  reconnectTimer: null,
  clientId: `${Date.now()}-${Math.random().toString(16).slice(2)}`
};

const authPanel = document.getElementById("authPanel");
const dashboard = document.getElementById("dashboard");
const dashboardTitle = document.getElementById("dashboardTitle");
const lobbyView = document.getElementById("lobbyView");
const roomDetail = document.getElementById("roomDetail");
const roomGrid = document.getElementById("roomGrid");
const gameView = document.getElementById("gameView");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberMeInput = document.getElementById("rememberMe");
const savedUsers = document.getElementById("savedUsers");
const authFormTitle = document.getElementById("authFormTitle");
const authFormHint = document.getElementById("authFormHint");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authMessage = document.getElementById("authMessage");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const activeUser = document.getElementById("activeUser");
const logoutBtn = document.getElementById("logoutBtn");
const roomList = document.getElementById("roomList");
const backToLobbyBtn = document.getElementById("backToLobbyBtn");
const enterGameBtn = document.getElementById("enterGameBtn");
const backToRoomBtn = document.getElementById("backToRoomBtn");
const roomCode = document.getElementById("roomCode");
const roomName = document.getElementById("roomName");
const hostLine = document.getElementById("hostLine");
const roomState = document.getElementById("roomState");
const fillAiBtn = document.getElementById("fillAiBtn");
const tableSeats = document.getElementById("tableSeats");
const blindLevel = document.getElementById("blindLevel");
const nextBlind = document.getElementById("nextBlind");
const seatHint = document.getElementById("seatHint");
const statChips = document.getElementById("statChips");
const statBlindTime = document.getElementById("statBlindTime");
const statWinner = document.getElementById("statWinner");
const blindTime = document.getElementById("blindTime");
const startingChips = document.getElementById("startingChips");
const blindStartLevel = document.getElementById("blindStartLevel");
const maxBlindLevel = document.getElementById("maxBlindLevel");
const bumpBlindOnElimination = document.getElementById("bumpBlindOnElimination");
const saveRoomBtn = document.getElementById("saveRoomBtn");
const saveNote = document.getElementById("saveNote");
const permissionNote = document.getElementById("permissionNote");
const settingsPanel = document.querySelector(".settings-panel");
const deviceList = document.getElementById("deviceList");
const rankingGrid = document.getElementById("rankingGrid");
const addRoundBtn = document.getElementById("addRoundBtn");
const clearRoundsBtn = document.getElementById("clearRoundsBtn");
const toggleReadyBtn = document.getElementById("toggleReadyBtn");
const startGameBtn = document.getElementById("startGameBtn");
const closeRoomGameBtn = document.getElementById("closeRoomGameBtn");
const readySummary = document.getElementById("readySummary");
const gameBlindLevel = document.getElementById("gameBlindLevel");
const gameElapsedTime = document.getElementById("gameElapsedTime");
const blindCountdown = document.getElementById("blindCountdown");
const gamePot = document.getElementById("gamePot");
const gameSeats = document.getElementById("gameSeats");
const communityCards = document.getElementById("communityCards");
const tableHand = document.getElementById("tableHand");
const playerStack = document.getElementById("playerStack");
const turnLabel = document.getElementById("turnLabel");
const turnTimerBar = document.getElementById("turnTimerBar");
const foldBtn = document.getElementById("foldBtn");
const callBtn = document.getElementById("callBtn");
const raiseBtn = document.getElementById("raiseBtn");
const longThinkBtn = document.getElementById("longThinkBtn");
const showHandBtn = document.getElementById("showHandBtn");
const raiseMenu = document.getElementById("raiseMenu");
const raiseSlider = document.getElementById("raiseSlider");
const raiseValue = document.getElementById("raiseValue");
const chipAnimationLayer = document.getElementById("chipAnimationLayer");
const closeGameBtn = document.getElementById("closeGameBtn");
const actionLog = document.getElementById("actionLog");
const logToggleBtn = document.getElementById("logToggleBtn");
const handLogDrawer = document.getElementById("handLogDrawer");
const closeLogBtn = document.getElementById("closeLogBtn");
const equityToggleBtn = document.getElementById("equityToggleBtn");
const equityDrawer = document.getElementById("equityDrawer");
const closeEquityBtn = document.getElementById("closeEquityBtn");
const equityCards = document.getElementById("equityCards");
const equitySuitPicker = document.getElementById("equitySuitPicker");
const equityRankPicker = document.getElementById("equityRankPicker");
const calculateEquityBtn = document.getElementById("calculateEquityBtn");
const equityResult = document.getElementById("equityResult");
const rankingModal = document.getElementById("rankingModal");
const modalTitle = document.getElementById("modalTitle");
const modalRankList = document.getElementById("modalRankList");
const closeModalBtn = document.getElementById("closeModalBtn");

function makeRounds(players, offset) {
  return Array.from({ length: 5 }, (_, index) => {
    const shift = (index + offset) % players.length;
    return [...players.slice(shift), ...players.slice(0, shift)];
  });
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  const baseState = { users: [], devices: [], rooms: defaultRooms, activeRoomId: defaultRooms[0].id, currentUser: "", view: "lobby" };
  if (!saved) return baseState;

  try {
    const parsed = JSON.parse(saved);
    return {
      users: (parsed.users || []).map((user) => ({ username: typeof user === "string" ? user : user.username })).filter((user) => user.username),
      devices: parsed.devices || [],
      rooms: mergeRooms(parsed.rooms || []),
      activeRoomId: parsed.activeRoomId || defaultRooms[0].id,
      currentUser: parsed.currentUser || "",
      view: parsed.view || "lobby"
    };
  } catch {
    return baseState;
  }
}

function mergeRooms(savedRooms) {
  return defaultRooms.map((defaultRoom) => {
    const savedRoom = savedRooms.find((room) => room.id === defaultRoom.id || room.name === defaultRoom.name);
    if (!savedRoom) return { ...defaultRoom };
    const migratedSeats = Array.isArray(savedRoom.seats)
      ? savedRoom.seats
      : (savedRoom.members || []).map((name, index) => ({ id: `user-${name}`, name, isAi: false, seat: index, stack: savedRoom.startingChips || defaultRoom.startingChips, folded: false }));
    const mergedRoom = {
      ...defaultRoom,
      ...savedRoom,
      code: defaultRoom.code,
      name: defaultRoom.name,
      symbol: defaultRoom.symbol,
      blindStartIndex: savedRoom.blindStartIndex ?? blindIndexFromLevel(savedRoom.blindLevel || defaultRoom.blindLevel),
      maxBlindIndex: normalizeBlindIndex(savedRoom.maxBlindIndex ?? defaultRoom.maxBlindIndex),
      bumpBlindOnElimination: Boolean(savedRoom.bumpBlindOnElimination ?? defaultRoom.bumpBlindOnElimination),
      eliminationBlindBump: Number(savedRoom.eliminationBlindBump || 0),
      blindLevel: savedRoom.blindLevel || defaultRoom.blindLevel,
      seats: fixedSeatSlots(normalizeSeats(migratedSeats, savedRoom.startingChips || defaultRoom.startingChips), savedRoom.startingChips || defaultRoom.startingChips),
      ready: savedRoom.ready || {},
      game: savedRoom.game || null,
      aiNameCooldown: Array.isArray(savedRoom.aiNameCooldown) ? savedRoom.aiNameCooldown.filter(Boolean) : [],
      rounds: normalizeRounds(savedRoom.rounds || defaultRoom.rounds)
    };
    if (!mergedRoom.gameStarted) syncReadyWithSeats(mergedRoom);
    return mergedRoom;
  });
}

function blindIndexFromLevel(level) {
  const normalized = String(level || "").replace(/,/g, "");
  const index = blindSchedule.findIndex((blind) => `${blind.small} / ${blind.big}` === normalized);
  return index >= 0 ? index : 0;
}

function blindLabel(index) {
  const blind = blindSchedule[Math.max(0, Math.min(index, blindSchedule.length - 1))] || blindSchedule[0];
  return `${formatNumber(blind.small)} / ${formatNumber(blind.big)}`;
}

function normalizeBlindIndex(index) {
  const parsed = Number(index ?? blindSchedule.length - 1);
  const safeIndex = Number.isFinite(parsed) ? parsed : blindSchedule.length - 1;
  return Math.max(0, Math.min(safeIndex, blindSchedule.length - 1));
}

function cappedBlindIndex(room, index) {
  const maxIndex = normalizeBlindIndex(room.maxBlindIndex);
  const parsed = Number(index);
  const safeIndex = Number.isFinite(parsed) ? parsed : 0;
  return Math.max(0, Math.min(safeIndex, maxIndex));
}

function blindIndexForHand(room, handNo) {
  const startIndex = normalizeBlindIndex(room.blindStartIndex ?? blindIndexFromLevel(room.blindLevel));
  const timeSteps = Math.floor((Math.max(1, handNo) - 1) / 3);
  const eliminationSteps = Number(room.eliminationBlindBump || 0);
  return cappedBlindIndex(room, startIndex + timeSteps + eliminationSteps);
}

function doubledBlindIndex(room, baseIndex) {
  const currentIndex = cappedBlindIndex(room, baseIndex);
  const capIndex = normalizeBlindIndex(room.maxBlindIndex);
  const currentBlind = blindSchedule[currentIndex];
  const doubledIndex = blindSchedule.findIndex((blind, index) => (
    index > currentIndex &&
    blind.small >= currentBlind.small * 2 &&
    blind.big >= currentBlind.big * 2
  ));
  return Math.min(doubledIndex >= 0 ? doubledIndex : capIndex, capIndex);
}

function normalizeSeatForSlot(seat, index, stack) {
  if (!seat) return null;
  return {
    id: seat.id || `seat-${index}-${seat.name}`,
    name: seat.name,
    isAi: Boolean(seat.isAi),
    avatar: seat.isAi ? (seat.avatar || legacyAiAvatar(seat)) : null,
    aiProfile: seat.isAi ? (seat.aiProfile || legacyAiProfile(seat)) : null,
    seat: index,
    stack: Number(seat.stack || stack),
    folded: Boolean(seat.folded),
    chipPile: Number(seat.chipPile || 0),
    eliminated: Boolean(seat.eliminated),
    eliminationPlace: seat.eliminationPlace || null
  };
}

function legacyAiAvatar(seat) {
  const seed = [...String(seat?.id || seat?.name || "ai")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return aiAvatars[seed % aiAvatars.length];
}

function legacyAiProfile(seat) {
  const profiles = AI_CONFIG.profiles || [];
  const seed = [...String(seat?.id || `seat-${seat?.seat || 0}`)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return profiles.length ? { ...profiles[seed % profiles.length] } : null;
}

function normalizeSeats(seats, stack) {
  const rawSeats = Array.isArray(seats) ? seats : [];
  const safeSeats = Array(maxPlayers).fill(null);
  const sourceLooksSlotted = rawSeats.length >= maxPlayers || rawSeats.some((seat, index) => !seat && index < maxPlayers);
  rawSeats.slice(0, maxPlayers).forEach((seat, index) => {
    if (!seat) return;
    const storedIndex = Number(seat.seat);
    const targetIndex = !sourceLooksSlotted && Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < maxPlayers
      ? storedIndex
      : index;
    if (safeSeats[targetIndex]) return;
    safeSeats[targetIndex] = normalizeSeatForSlot(seat, targetIndex, stack);
  });
  return safeSeats;
}

function fixedSeatSlots(seats, stack) {
  const rawSeats = Array.isArray(seats) ? seats : [];
  return Array.from({ length: maxPlayers }, (_, index) => normalizeSeatForSlot(rawSeats[index], index, stack));
}

function normalizeRounds(rounds) {
  return rounds.map((round) => [...new Set(round.filter(Boolean))].slice(0, maxPlayers)).filter(Boolean).slice(0, 5);
}

function saveState() {
  appState.activeRoomId = activeRoomId;
  appState.currentUser = currentUser;
  localStorage.setItem(storageKey, JSON.stringify(appState));
  if (multiplayer.connected && !multiplayer.applyingRemote) sendSharedState();
}

function sharedStatePayload() {
  return {
    users: appState.users || [],
    devices: appState.devices || [],
    rooms: appState.rooms || [],
    updatedAt: Date.now()
  };
}

function applySharedState(shared) {
  if (!shared) {
    sendSharedState();
    return;
  }
  multiplayer.applyingRemote = true;
  appState.users = Array.isArray(shared.users) ? shared.users : appState.users;
  appState.devices = Array.isArray(shared.devices) ? shared.devices : appState.devices;
  appState.rooms = mergeRooms(Array.isArray(shared.rooms) ? shared.rooms : []);
  if (!appState.rooms.some((room) => room.id === activeRoomId)) activeRoomId = appState.rooms[0]?.id || defaultRooms[0].id;
  localStorage.setItem(storageKey, JSON.stringify({ ...appState, activeRoomId, currentUser }));
  multiplayer.applyingRemote = false;
  renderSavedUsers();
  if (currentUser) renderDashboard();
}

function sendSharedState() {
  if (!multiplayer.socket || multiplayer.socket.readyState !== WebSocket.OPEN) return;
  multiplayer.socket.send(JSON.stringify({
    type: "sync",
    clientId: multiplayer.clientId,
    shared: sharedStatePayload()
  }));
}

function connectMultiplayer() {
  if (!("WebSocket" in window) || location.protocol === "file:") return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}`);
  multiplayer.socket = socket;
  socket.addEventListener("open", () => {
    multiplayer.connected = true;
  });
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "state") applySharedState(payload.shared);
    } catch (error) {
      console.warn("联机状态解析失败", error);
    }
  });
  socket.addEventListener("close", scheduleMultiplayerReconnect);
  socket.addEventListener("error", scheduleMultiplayerReconnect);
}

function scheduleMultiplayerReconnect() {
  multiplayer.connected = false;
  if (multiplayer.reconnectTimer || location.protocol === "file:") return;
  multiplayer.reconnectTimer = window.setTimeout(() => {
    multiplayer.reconnectTimer = null;
    connectMultiplayer();
  }, 1600);
}

function canDriveSharedGame(room) {
  return !multiplayer.connected || isHost(room);
}

function getActiveRoom() {
  return appState.rooms.find((room) => room.id === activeRoomId) || appState.rooms[0];
}

function getSeatedPlayers(room) {
  return normalizeSeats(room.seats, room.startingChips).filter((seat) => seat && !seat.eliminated);
}

function currentSeatIndex(room) {
  return normalizeSeats(room.seats, room.startingChips).findIndex((seat) => seat?.name === currentUser && !seat.isAi && !seat.eliminated);
}

function roomSeatSnapshot(room) {
  if (room.gameStarted && room.game?.seats) {
    return normalizeSeats(room.game.seats, room.startingChips);
  }
  room.seats = normalizeSeats(room.seats, room.startingChips);
  syncReadyWithSeats(room);
  return room.seats;
}

function refreshRoomBoard(room) {
  const roomSeats = roomSeatSnapshot(room);
  const players = getSeatedPlayers({ ...room, seats: roomSeats });
  roomState.textContent = room.gameStarted ? "牌局中" : room.state;
  seatHint.textContent = room.gameStarted && room.game ? `阶段：${room.game.phase} · 底池 ${formatNumber(room.game.pot)}` : "点击座位入座或管理 AI";
  statBlindTime.textContent = room.gameStarted && room.game ? room.game.phase : `${room.blindMinutes} 分钟`;
  statWinner.textContent = room.gameStarted && room.game ? currentPlayer(room)?.name || "等待行动" : room.rounds[0]?.[0] || "-";
  renderTableSeats(tableSeats, roomSeats, "seat", !room.gameStarted);
  fillAiBtn.classList.toggle("is-hidden", !isHost(room) || room.gameStarted);
  fillAiBtn.disabled = room.seats.every(Boolean);
  renderReadyPanel(room, players);
}

function syncReadyWithSeats(room) {
  const nextReady = {};
  getSeatedPlayers(room).forEach((player) => {
    nextReady[player.name] = player.isAi ? true : Boolean(room.ready?.[player.name]);
  });
  room.ready = nextReady;
}

function liveSeatIndexes(seats) {
  return seats.map((seat, index) => seat && !seat.folded && !seat.eliminated ? index : -1).filter((index) => index >= 0);
}

function activeSeatIndexes(seats) {
  return seats.map((seat, index) => seat && !seat.folded && !seat.eliminated && seat.stack > 0 ? index : -1).filter((index) => index >= 0);
}

function nextSeatIndex(indexes, fromIndex) {
  if (!indexes.length) return null;
  if (fromIndex == null || fromIndex < 0) return indexes[0];
  return indexes.find((index) => index > fromIndex) ?? indexes[0];
}

function tableSeatOrderIndexes(seats, predicate = (seat) => Boolean(seat)) {
  return (Array.isArray(seats) ? seats : [])
    .map((seat, index) => predicate(seat, index) ? index : -1)
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
}

function nextTableSeatIndex(seats, indexes, fromIndex) {
  const allowed = new Set(indexes);
  const ordered = tableSeatOrderIndexes(seats, (seat, index) => allowed.has(index));
  if (!ordered.length) return null;
  if (fromIndex == null || fromIndex < 0) return ordered[0];
  const currentOrderIndex = ordered.indexOf(fromIndex);
  if (currentOrderIndex >= 0) return ordered[(currentOrderIndex + 1) % ordered.length];
  return ordered.find((index) => index > fromIndex) ?? ordered[0];
}

function markActed(game, seatIndex) {
  game.actedSeats = [...new Set([...(game.actedSeats || []), seatIndex])];
}

function isHost(room) {
  return Boolean(currentUser && room.host === currentUser);
}

function isReady(room, playerName) {
  const player = getSeatedPlayers(room).find((seat) => seat.name === playerName);
  return Boolean(player?.isAi || room.ready[playerName]);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function placeLabel(place) {
  return `第 ${place} 名`;
}

function heroElimination(room, hero) {
  if (room.eliminatedPlayers?.[currentUser]) return room.eliminatedPlayers[currentUser];
  if (!hero || hero.stack > 0) return null;
  const playersInHand = (room.game?.seats || []).filter(Boolean).length || getSeatedPlayers(room).length;
  const bustedBeforeHero = (room.game?.seats || []).filter((seat) => seat && seat.name !== currentUser && seat.stack <= 0).length;
  return { place: Math.max(2, playersInHand - bustedBeforeHero), stack: 0 };
}

function renderSavedUsers() {
  savedUsers.innerHTML = "";
  const title = document.createElement("span");
  title.className = "saved-users-title";
  title.textContent = appState.users.length ? "已保存账号" : "暂无已保存账号";
  savedUsers.appendChild(title);
  appState.users.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `账号：${user.username}`;
    button.addEventListener("click", () => {
      usernameInput.value = user.username;
      passwordInput.focus();
    });
    savedUsers.appendChild(button);
  });
}

function renderDevices() {
  deviceList.innerHTML = "";
  const devices = appState.devices.slice(-4).reverse();
  if (!devices.length) {
    const item = document.createElement("li");
    item.textContent = "登录后会显示本地保存的设备记录";
    deviceList.appendChild(item);
    return;
  }
  devices.forEach((device) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${device.name}</span><strong>${device.time}</strong>`;
    deviceList.appendChild(item);
  });
}

function renderLobby() {
  stopTimer();
  dashboardTitle.textContent = "四个花色房间";
  lobbyView.classList.remove("is-hidden");
  roomDetail.classList.add("is-hidden");
  gameView.classList.add("is-hidden");
  roomList.innerHTML = "";

  appState.rooms.forEach((room) => {
    const players = getSeatedPlayers(room);
    const card = document.createElement("article");
    card.className = `room-card ${room.id}`;
    card.innerHTML = `
      <div class="suit-mark" aria-hidden="true">${room.symbol}</div>
      <div class="room-card-main">
        <p class="eyebrow">${room.code}</p>
        <h2>${room.name}</h2>
        <div class="room-meta">
          <span>${players.length} / ${maxPlayers} 人</span>
          <span>${room.host ? `房主ID ${room.host}` : "暂无房主"}</span>
          <span>${formatNumber(room.startingChips)} 筹码</span>
        </div>
      </div>
      <button class="primary-action room-enter" type="button">进入房间</button>
    `;
    card.querySelector("button").addEventListener("click", () => enterRoom(room.id));
    roomList.appendChild(card);
  });
}

function enterRoom(roomId) {
  activeRoomId = roomId;
  const room = getActiveRoom();
  if (!room.host) room.host = currentUser;
  appState.view = "room";
  saveNote.textContent = "";
  saveState();
  renderDashboard();
}

function sitAtSeat(index) {
  const room = getActiveRoom();
  keepSeatSlots(room);
  if (room.gameStarted || room.seats[index]) return;
  const existingIndex = currentSeatIndex(room);
  if (existingIndex >= 0) room.seats[existingIndex] = null;
  room.seats[index] = { id: `user-${currentUser}`, name: currentUser, isAi: false, seat: index, stack: room.startingChips, folded: false };
  room.ready[currentUser] = false;
  if (!room.host) room.host = currentUser;
  syncReadyWithSeats(room);
  saveState();
  refreshRoomBoard(room);
}

function renderRoom() {
  const room = getActiveRoom();
  const roomSeats = roomSeatSnapshot(room);
  const players = getSeatedPlayers({ ...room, seats: roomSeats });
  dashboardTitle.textContent = room.name;
  lobbyView.classList.add("is-hidden");
  roomDetail.classList.remove("is-hidden");
  gameView.classList.add("is-hidden");
  roomCode.textContent = room.code;
  roomName.textContent = `${room.symbol} ${room.name}`;
  hostLine.textContent = room.host ? `房主ID：${room.host}` : "房主：进入房间后自动产生";
  roomState.textContent = room.gameStarted ? "牌局中" : room.state;
  blindLevel.textContent = room.blindLevel;
  nextBlind.textContent = `${String(room.blindMinutes).padStart(2, "0")}:00 后涨盲`;
  seatHint.textContent = room.gameStarted && room.game ? `阶段：${room.game.phase} · 底池 ${formatNumber(room.game.pot)}` : "点击座位入座或管理 AI";
  statChips.textContent = formatNumber(room.startingChips);
  statBlindTime.textContent = room.gameStarted && room.game ? room.game.phase : `${room.blindMinutes} 分钟`;
  statWinner.textContent = room.gameStarted && room.game ? currentPlayer(room)?.name || "等待行动" : room.rounds[0]?.[0] || "-";
  blindTime.value = String(room.blindMinutes);
  startingChips.value = room.startingChips;
  blindStartLevel.value = String(room.blindStartIndex ?? blindIndexFromLevel(room.blindLevel));
  maxBlindLevel.value = String(normalizeBlindIndex(room.maxBlindIndex));
  bumpBlindOnElimination.checked = Boolean(room.bumpBlindOnElimination);
  renderTableSeats(tableSeats, roomSeats, "seat", !room.gameStarted);
  renderReadyPanel(room, players);
  renderSettings(room);
}

function renderSettings(room) {
  const hostCanEdit = isHost(room) && !room.gameStarted;
  const showSettings = !room.gameStarted;
  roomGrid.classList.toggle("host-layout", showSettings);
  settingsPanel.classList.toggle("is-hidden", !showSettings);
  if (!showSettings) return;
  settingsPanel.classList.toggle("locked-panel", !hostCanEdit);
  blindTime.disabled = !hostCanEdit;
  startingChips.disabled = !hostCanEdit;
  blindStartLevel.disabled = !hostCanEdit;
  maxBlindLevel.disabled = !hostCanEdit;
  bumpBlindOnElimination.disabled = !hostCanEdit;
  saveRoomBtn.disabled = !hostCanEdit;
  saveRoomBtn.textContent = hostCanEdit ? "保存房间设置" : "设置已锁定";
  permissionNote.textContent = hostCanEdit ? "你是本房间房主，可以在开局前修改设置。" : "房间设置已锁定，仅房主可修改。";
}

function renderReadyPanel(room, players) {
  const seatedIndex = currentSeatIndex(room);
  const readyCount = players.filter((player) => isReady(room, player.name)).length;
  const waitingReady = players.some((player) => player.name !== room.host && !isReady(room, player.name));
  const current = currentPlayer(room);
  readySummary.textContent = room.gameStarted && room.game
    ? `牌局中 · ${room.game.phase} · 底池 ${formatNumber(room.game.pot)} · ${current ? `当前行动：${current.name}` : "等待下一手"}`
    : seatedIndex < 0
      ? `当前 ${players.length}/${maxPlayers} 人，先选择座位。`
      : players.length < 2
        ? `当前 ${players.length}/${maxPlayers} 人，至少 2 人才能开局。`
      : `当前 ${readyCount}/${players.length} 人已准备，${isHost(room) ? "房主可开局。" : "等待房主开局。"}`;
  toggleReadyBtn.disabled = seatedIndex < 0 || room.gameStarted;
  toggleReadyBtn.textContent = isReady(room, currentUser) ? "取消准备" : "准备";
  closeRoomGameBtn.classList.toggle("is-hidden", !isHost(room));
  closeRoomGameBtn.disabled = !isHost(room) || !room.gameStarted;
  startGameBtn.disabled = !isHost(room) || seatedIndex < 0 || players.length < 2 || waitingReady || room.gameStarted;
  startGameBtn.textContent = room.gameStarted ? "牌局已开始" : "房主开局";
  enterGameBtn.textContent = room.gameStarted ? "进入牌局" : "进入游戏";
}

function renderTableSeats(container, seats, className, selectable = false) {
  container.innerHTML = "";
  const room = getActiveRoom();
  if (className === "seat") {
    renderRoomSeatButtons(container, seats, selectable);
    return;
  }
  const rawSeats = Array.isArray(seats) ? seats : [];
  const safeSeats = rawSeats;
  const seatItems = gameSeatRenderItems(safeSeats);
  seatItems.forEach(({ index, player, visualIndex }) => {
    const seatNode = document.createElement("div");
    const activeTurn = className === "game-seat" && room.game?.currentIndex === index;
    const isDealer = className === "game-seat" && room.game?.dealerIndex === index;
    const isEliminated = Boolean(player?.eliminated);
    const seatStatus = isEliminated
      ? `${player.eliminationPlace ? placeLabel(player.eliminationPlace) : "已淘汰"} · 下次加油`
      : player?.isAi ? "AI" : isReady(getActiveRoom(), player.name) ? "已准备" : "未准备";
    seatNode.dataset.seatIndex = String(index);
    seatNode.className = `${className} ${className}-${visualIndex} seat-color-${index + 1}${player ? "" : " empty-seat"}${player?.name === currentUser && !player.isAi ? " my-seat" : ""}${player?.folded ? " folded-seat" : ""}${isEliminated ? " eliminated-seat" : ""}${activeTurn ? " active-turn" : ""}`;
    if (player) {
      const avatar = player.isAi ? `<i class="ai-avatar" aria-label="AI形象">${player.avatar || legacyAiAvatar(player)}</i>` : "";
      seatNode.innerHTML = `<strong>${avatar}${player.name}</strong><div class="seat-bottom"><small class="seat-stack">${formatNumber(player.stack || 0)}</small>${renderSeatHoleCards(player, room, className)}</div><em>${seatStatus}</em>${isDealer && !isEliminated ? "<i class=\"dealer-button\">D</i>" : ""}`;
    } else {
      seatNode.innerHTML = "<div class=\"seat-placeholder\"><strong>空位</strong><em>可入座</em></div>";
    }
    if (selectable && (!player || player.isAi || player.name === currentUser)) {
      seatNode.setAttribute("role", "button");
      seatNode.tabIndex = 0;
      seatNode.addEventListener("click", () => showSeatActionMenu(index, seatNode));
      seatNode.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showSeatActionMenu(index, seatNode);
        }
      });
    }
    container.appendChild(seatNode);
  });
}

function renderRoomSeatButtons(container, seats, selectable) {
  const room = getActiveRoom();
  const safeSeats = normalizeSeats(seats, room.startingChips);
  for (let index = 0; index < maxPlayers; index += 1) {
    const player = safeSeats[index];
    const isEliminated = Boolean(player?.eliminated);
    const seatStatus = isEliminated
      ? `${player.eliminationPlace ? placeLabel(player.eliminationPlace) : "已淘汰"} · 下次加油`
      : player?.isAi ? "AI" : player ? (isReady(room, player.name) ? "已准备" : "未准备") : "可入座";
    const showHostBadge = player?.name === room.host;
    const seatNode = document.createElement("button");
    seatNode.type = "button";
    seatNode.className = `seat seat-control seat-${index + 1} seat-color-${index + 1}${player ? "" : " empty-seat"}${player?.name === currentUser && !player.isAi ? " my-seat" : ""}${isEliminated ? " eliminated-seat" : ""}`;
    seatNode.dataset.seatIndex = String(index);
    seatNode.innerHTML = player
      ? `<strong>${player.isAi ? `<i class="ai-avatar" aria-label="AI形象">${player.avatar || legacyAiAvatar(player)}</i>` : ""}${player.name}</strong><small>${formatNumber(player.stack || 0)}</small><em>${seatStatus}</em>${showHostBadge ? "<i class=\"host-chip\">房</i>" : ""}`
      : `<div class="seat-placeholder"><strong>座位 ${index + 1}</strong><em>空位 · 点击管理</em></div>`;
    seatNode.disabled = !selectable || Boolean(player && !player.isAi && player.name !== currentUser);
    if (!seatNode.disabled) seatNode.addEventListener("click", () => showSeatActionMenu(index, seatNode));
    container.appendChild(seatNode);
  }
}

function keepSeatSlots(room) {
  room.seats = normalizeSeats(room.seats, room.startingChips);
}

function updateRoomSeat(index, seat) {
  const room = getActiveRoom();
  keepSeatSlots(room);
  room.seats[index] = seat ? normalizeSeatForSlot(seat, index, room.startingChips) : null;
  syncReadyWithSeats(room);
  saveState();
  renderRoom();
  renderRankings();
}

function gameSeatRenderItems(seats) {
  const occupied = seats
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => Boolean(player));
  const heroOrderIndex = occupied.findIndex(({ player }) => player.name === currentUser && !player.isAi);
  const ordered = heroOrderIndex >= 0
    ? [...occupied.slice(heroOrderIndex), ...occupied.slice(0, heroOrderIndex)]
    : occupied;
  const slots = visualSlotsForCount(ordered.length);
  return ordered.map((item, orderIndex) => ({ ...item, visualIndex: slots[orderIndex] || item.index + 1 }));
}

function visualSlotsForCount(count) {
  const layouts = {
    1: [5],
    2: [5, 1],
    3: [5, 8, 2],
    4: [5, 7, 1, 3],
    5: [5, 8, 2, 6, 4],
    6: [5, 8, 2, 6, 4, 1],
    7: [5, 6, 7, 8, 2, 3, 4],
    8: [5, 6, 7, 8, 1, 2, 3, 4]
  };
  return layouts[Math.max(1, Math.min(count, maxPlayers))] || layouts[8];
}

function renderSeatHoleCards(player, room, className) {
  if (className !== "game-seat" || !player) return "";
  if (player.eliminated) return "";
  const isHero = player.name === currentUser && !player.isAi;
  const reveal = Boolean(isHero || (room.game?.handOver && !player.folded) || player.showCards);
  const cards = reveal && player.hole?.length ? player.hole : ["?", "?"];
  return `<span class="seat-hole-cards ${reveal ? "revealed" : "hidden-hole"}${player.folded && !player.showCards ? " folded-hole" : ""}">${cards.map((card) => `<i class="mini-card ${isRedCard(card) ? "red" : ""} ${card === "?" ? "mini-card-back" : ""}">${card === "?" ? "" : card}</i>`).join("")}</span>`;
}

function nextAiName(room) {
  const usedNames = new Set(getSeatedPlayers(room).map((seat) => seat.name));
  const cooldown = new Set(room.aiNameCooldown || []);
  const available = aiNames.filter((name) => !usedNames.has(name));
  const preferred = available.filter((name) => !cooldown.has(name));
  const pool = preferred.length ? preferred : available;
  if (!pool.length) return `AI-${Date.now().toString().slice(-4)}`;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  room.aiNameCooldown = (room.aiNameCooldown || []).filter((name) => name !== picked);
  return picked;
}

function randomAiAvatar(room) {
  const used = new Set(getSeatedPlayers(room).filter((seat) => seat.isAi).map((seat) => seat.avatar).filter(Boolean));
  const available = aiAvatars.filter((avatar) => !used.has(avatar));
  const pool = available.length ? available : aiAvatars;
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomAiProfile() {
  const profiles = AI_CONFIG.profiles || [];
  const profile = profiles[Math.floor(Math.random() * profiles.length)] || profiles[0];
  return profile ? { ...profile } : null;
}

function addAiAtSeat(index) {
  const room = getActiveRoom();
  keepSeatSlots(room);
  if (room.gameStarted || room.seats[index] || !isHost(room)) return;
  const aiName = nextAiName(room);
  room.ready[aiName] = true;
  updateRoomSeat(index, { id: `ai-${index}-${Date.now()}`, name: aiName, isAi: true, avatar: randomAiAvatar(room), aiProfile: randomAiProfile(), seat: index, stack: room.startingChips, folded: false, hole: [] });
}

function fillEmptySeatsWithAi() {
  const room = getActiveRoom();
  keepSeatSlots(room);
  if (room.gameStarted || !isHost(room)) return;
  room.seats.forEach((seat, index) => {
    if (seat) return;
    const aiName = nextAiName(room);
    room.ready[aiName] = true;
    room.seats[index] = normalizeSeatForSlot({
      id: `ai-${index}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: aiName,
      isAi: true,
      avatar: randomAiAvatar(room),
      aiProfile: randomAiProfile(),
      seat: index,
      stack: room.startingChips,
      folded: false,
      hole: []
    }, index, room.startingChips);
  });
  syncReadyWithSeats(room);
  saveState();
  renderDashboard();
}

function kickAiAtSeat(index) {
  const room = getActiveRoom();
  keepSeatSlots(room);
  const seat = room.seats?.[index];
  if (room.gameStarted || !isHost(room) || !seat?.isAi) return;
  delete room.ready[seat.name];
  room.aiNameCooldown = [...new Set([...(room.aiNameCooldown || []), seat.name])].slice(-aiNames.length);
  updateRoomSeat(index, null);
}

function closeSeatActionMenu() {
  seatActionMenu?.parentElement?.classList.remove("menu-open");
  seatActionMenu?.remove();
  seatActionMenu = null;
}

function seatActionButton(label, handler, className = "ghost-action") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    closeSeatActionMenu();
    handler();
  });
  return button;
}

function showSeatActionMenu(index, anchor) {
  const room = getActiveRoom();
  if (room.gameStarted) return;
  keepSeatSlots(room);
  const seat = room.seats[index];
  closeSeatActionMenu();
  anchor.classList.add("menu-open");
  seatActionMenu = document.createElement("div");
  seatActionMenu.className = `seat-action-menu seat-action-menu-${index + 1}`;
  seatActionMenu.innerHTML = `<strong>${seat?.name || `座位 ${index + 1}`}</strong>`;
  if (!seat) {
    seatActionMenu.appendChild(seatActionButton(currentSeatIndex(room) >= 0 ? "换到这里" : "坐到这里", () => sitAtSeat(index), "primary-action"));
    if (isHost(room)) seatActionMenu.appendChild(seatActionButton("添加 AI", () => addAiAtSeat(index)));
  } else if (seat.isAi && isHost(room)) {
    seatActionMenu.appendChild(seatActionButton("踢出 AI", () => kickAiAtSeat(index), "ghost-action danger-action"));
  } else {
    const note = document.createElement("small");
    note.textContent = seat.name === currentUser ? "这是你当前的座位" : "该座位已被玩家占用";
    seatActionMenu.appendChild(note);
  }
  seatActionMenu.appendChild(seatActionButton("取消", () => {}, "ghost-action"));
  anchor.appendChild(seatActionMenu);
}

function toggleReady() {
  const room = getActiveRoom();
  if (currentSeatIndex(room) < 0) return;
  room.ready[currentUser] = !room.ready[currentUser];
  saveState();
  renderDashboard();
}

function startGame() {
  const room = getActiveRoom();
  keepSeatSlots(room);
  const players = getSeatedPlayers(room);
  if (!isHost(room) || currentSeatIndex(room) < 0 || players.length < 2 || players.some((player) => player.name !== room.host && !isReady(room, player.name))) return;
  room.ready[currentUser] = true;
  room.gameStarted = true;
  room.state = "牌局中";
  room.eliminationBlindBump = 0;
  room.eliminatedPlayers = {};
  room.gameStartedAt = Date.now();
  room.blindLevelStartedAt = room.gameStartedAt;
  room.blindLevel = blindLabel(cappedBlindIndex(room, room.blindStartIndex ?? blindIndexFromLevel(room.blindLevel)));
  room.game = createGameState(room, false);
  appState.view = "game";
  saveState();
  renderDashboard();
}

function createGameState(room, shouldBackfill = false) {
  keepSeatSlots(room);
  if (shouldBackfill) ensureRoomHasPlayers(room);
  if (!room.gameStartedAt) room.gameStartedAt = Date.now();
  if (!room.blindLevelStartedAt) room.blindLevelStartedAt = room.gameStartedAt;
  const shuffled = createDeck();
  const seats = room.seats.map((seat, index) => {
    if (!seat) return null;
    if (seat.eliminated) return { ...seat, seat: index, stack: 0, folded: true, bet: 0, chipPile: 0, chipPileAnimatingUntil: 0, hole: [] };
    const stack = Number(seat.stack || room.startingChips);
    return { ...seat, seat: index, stack, handStartStack: stack, folded: false, bet: 0, chipPile: 0, chipPileAnimatingUntil: 0, hole: [shuffled.pop(), shuffled.pop()] };
  });
  const activeIndexes = tableSeatOrderIndexes(seats, (seat) => seat && !seat.eliminated);
  const handNo = (room.game?.handNo || 0) + 1;
  const blindIndex = blindIndexForHand(room, handNo);
  if (room.game?.blindIndex !== undefined && room.game.blindIndex !== blindIndex) {
    room.blindLevelStartedAt = Date.now();
  }
  const blinds = blindSchedule[blindIndex];
  const previousDealerIndex = room.game?.dealerIndex;
  const dealerIndex = previousDealerIndex == null ? activeIndexes[0] : nextTableSeatIndex(seats, activeIndexes, previousDealerIndex);
  const smallBlindIndex = activeIndexes.length === 2 ? dealerIndex : nextTableSeatIndex(seats, activeIndexes, dealerIndex);
  const bigBlindIndex = nextTableSeatIndex(seats, activeIndexes, smallBlindIndex);
  const firstActionIndex = activeIndexes.length === 2 ? smallBlindIndex : nextTableSeatIndex(seats, activeIndexes, bigBlindIndex);
  const smallPaid = Math.min(seats[smallBlindIndex]?.stack || 0, blinds.small);
  const bigPaid = Math.min(seats[bigBlindIndex]?.stack || 0, blinds.big);
  const pot = smallPaid + bigPaid;
  if (seats[smallBlindIndex]) {
    seats[smallBlindIndex].stack -= smallPaid;
    seats[smallBlindIndex].bet = smallPaid;
    seats[smallBlindIndex].chipPile = smallPaid;
    seats[smallBlindIndex].chipPileAnimatingUntil = Date.now() + 620;
    if (smallPaid > 0) queueChipAnimation(smallBlindIndex, smallPaid, "bet");
  }
  if (seats[bigBlindIndex]) {
    seats[bigBlindIndex].stack -= bigPaid;
    seats[bigBlindIndex].bet = bigPaid;
    seats[bigBlindIndex].chipPile = bigPaid;
    seats[bigBlindIndex].chipPileAnimatingUntil = Date.now() + 620;
    if (bigPaid > 0) queueChipAnimation(bigBlindIndex, bigPaid, "bet");
  }
  room.blindLevel = blindLabel(blindIndex);
  return {
    phase: "翻牌前",
    seats,
    pot,
    deck: shuffled,
    handOver: false,
    actedCount: 0,
    actedSeats: [],
    currentBet: blinds.big,
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentIndex: firstActionIndex,
    blindIndex,
    community: [],
    handNo,
    log: [`第 ${handNo} 手开始`, `${seats[smallBlindIndex]?.name || "SB"} 下小盲 ${formatNumber(smallPaid)}`, `${seats[bigBlindIndex]?.name || "BB"} 下大盲 ${formatNumber(bigPaid)}`]
  };
}

function ensurePlayableGame(room) {
  const gameSeats = Array.isArray(room.game?.seats) ? room.game.seats.filter(Boolean) : [];
  if (room.game && gameSeats.length >= 2 && (room.game.currentIndex != null || room.game.streetPause || room.game.handOver)) return;
  if (!room.game || gameSeats.length < 2 || room.game.currentIndex == null) {
    if (getSeatedPlayers(room).length < 2) {
      appState.view = "room";
      room.gameStarted = false;
      room.state = "等待开局";
      room.game = null;
      saveState();
      return;
    }
    room.gameStarted = true;
    room.state = "牌局中";
    room.game = createGameState(room, false);
    saveState();
  }
}

function ensureRoomHasPlayers(room) {
  if (!Array.isArray(room.seats)) room.seats = Array(maxPlayers).fill(null);
  if (!getSeatedPlayers(room).some((seat) => seat.name === currentUser && !seat.isAi)) {
    const firstEmpty = room.seats.findIndex((seat) => !seat);
    if (firstEmpty >= 0) {
      room.seats[firstEmpty] = { id: `user-${currentUser}`, name: currentUser || "玩家", isAi: false, seat: firstEmpty, stack: room.startingChips, folded: false, hole: [] };
      room.ready[currentUser] = true;
    }
  }
  const usedNames = new Set(getSeatedPlayers(room).map((seat) => seat.name));
  while (getSeatedPlayers(room).length < 2) {
    const emptyIndex = room.seats.findIndex((seat) => !seat);
    const aiName = aiNames.find((name) => !usedNames.has(name)) || `AI-${emptyIndex + 1}`;
    room.seats[emptyIndex] = { id: `ai-${emptyIndex}`, name: aiName, isAi: true, avatar: randomAiAvatar(room), aiProfile: randomAiProfile(), seat: emptyIndex, stack: room.startingChips, folded: false, hole: [] };
    room.ready[aiName] = true;
    usedNames.add(aiName);
  }
}

function closeCurrentGame() {
  const room = getActiveRoom();
  stopTimer();
  room.gameStarted = false;
  room.state = "等待开局";
  room.game = null;
  room.ready = {};
  room.eliminationBlindBump = 0;
  room.eliminatedPlayers = {};
  room.gameStartedAt = 0;
  room.blindLevelStartedAt = 0;
  room.blindLevel = blindLabel(cappedBlindIndex(room, room.blindStartIndex ?? blindIndexFromLevel(room.blindLevel)));
  room.seats = room.seats.map((seat, index) => seat ? { ...seat, seat: index, stack: room.startingChips, folded: false, hole: [], eliminated: false, eliminationPlace: null } : null);
  appState.view = "room";
  saveState();
  renderDashboard();
}

function createDeck() {
  return suits
    .flatMap((suit) => ranks.map((rank) => `${rank}${suit}`))
    .sort(() => Math.random() - 0.5);
}

function renderRankings() {
  const room = getActiveRoom();
  const host = isHost(room);
  addRoundBtn.disabled = !host;
  clearRoundsBtn.disabled = !host || room.rounds.length === 0;
  rankingGrid.innerHTML = "";
  room.rounds.slice(0, 5).forEach((round, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "round-card";
    const title = document.createElement("h3");
    title.textContent = `第 ${room.rounds.length - index} 轮`;
    const list = document.createElement("div");
    list.className = "ranking-list";
    round.slice(0, 4).forEach((player, playerIndex) => {
      const row = document.createElement("div");
      row.className = "rank-row";
      row.innerHTML = `<span>#${playerIndex + 1}</span><strong>${player}</strong><span>${scoreLabel(playerIndex)}</span>`;
      list.appendChild(row);
    });
    const more = document.createElement("p");
    more.className = "round-more";
    more.textContent = round.length > 4 ? `查看完整 ${round.length} 人排名` : "查看本轮明细";
    card.append(title, list, more);
    card.addEventListener("click", () => openRankingModal(round, room.rounds.length - index));
    rankingGrid.appendChild(card);
  });
}

function openRankingModal(round, roundNo, title = "") {
  modalTitle.textContent = title || `第 ${roundNo} 轮完整排名`;
  modalRankList.innerHTML = "";
  round.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "modal-rank-row";
    row.innerHTML = `<span>#${index + 1}</span><strong>${player}</strong><em>${scoreLabel(index)}</em>`;
    modalRankList.appendChild(row);
  });
  rankingModal.classList.remove("is-hidden");
}

function scoreLabel(index) {
  return ["冠军", "亚军", "季军", "第 4 名", "第 5 名", "第 6 名", "第 7 名", "第 8 名"][index] || "出局";
}

function renderGame() {
  const room = getActiveRoom();
  ensurePlayableGame(room);
  dashboardTitle.textContent = "牌局";
  lobbyView.classList.add("is-hidden");
  roomDetail.classList.add("is-hidden");
  gameView.classList.remove("is-hidden");
  gameBlindLevel.textContent = room.blindLevel;
  closeGameBtn.classList.toggle("is-hidden", !isHost(room));
  gamePot.textContent = formatNumber(room.game.pot);
  const hero = room.game.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
  const eliminated = heroElimination(room, hero);
  playerStack.textContent = eliminated
    ? `0 筹码 · ${placeLabel(eliminated.place)}，下次加油`
    : `${formatNumber(hero?.stack || room.startingChips)} 筹码`;
  callBtn.textContent = actionLabel(room);
  updateGameClocks(room);
  renderCommunity(room.game);
  renderHand(room.game);
  renderTableSeats(gameSeats, room.game.seats || room.seats, "game-seat");
  renderActionState(room);
  renderTableActionMarkers(room.game);
  playQueuedChipAnimations();
  playQueuedCardAnimations();
  startTimer();
}

function updateGameClocks(room) {
  const now = Date.now();
  const startedAt = Number(room.gameStartedAt || room.game?.startedAt || now);
  const blindStartedAt = Number(room.blindLevelStartedAt || startedAt);
  const blindSeconds = Math.max(1, Number(room.blindMinutes || 8) * 60);
  gameElapsedTime.textContent = formatDuration((now - startedAt) / 1000);
  blindCountdown.textContent = formatDuration(blindSeconds - ((now - blindStartedAt) / 1000));
}

function startClockTimer(room) {
  if (clockTimerId) window.clearInterval(clockTimerId);
  updateGameClocks(room);
  clockTimerId = window.setInterval(() => {
    const activeRoom = getActiveRoom();
    if (appState.view !== "game" || !activeRoom.gameStarted) {
      if (clockTimerId) window.clearInterval(clockTimerId);
      clockTimerId = null;
      return;
    }
    updateGameClocks(activeRoom);
  }, 1000);
}

function renderCommunity(game) {
  const visibleCards = [...game.community];
  while (visibleCards.length < 5) visibleCards.push("?");
  communityCards.innerHTML = visibleCards.map((card) => `<div class="card ${isRedCard(card) ? "red" : ""} ${card === "?" ? "card-back" : ""}">${card}</div>`).join("");
}

function renderHand(game) {
  tableHand.innerHTML = "";
}

function isRedCard(card) {
  return card.includes("♥") || card.includes("♦");
}

function currentPlayer(room) {
  if (room.game?.streetPause) return null;
  return room.game?.seats?.[room.game.currentIndex] || null;
}

function toCallFor(player, game) {
  return Math.max(0, (game?.currentBet || 0) - (player?.bet || 0));
}

function actionLabel(room) {
  const player = currentPlayer(room);
  const amount = toCallFor(player, room.game);
  return amount > 0 ? `跟注 ${formatNumber(amount)}` : "过牌";
}

function renderActionState(room) {
  const player = currentPlayer(room);
  const isHero = player?.name === currentUser && !player.isAi && !room.game.handOver;
  turnLabel.textContent = room.game.handOver ? "本手结束" : player ? `${player.name}${isHero ? "，轮到你行动" : " 正在行动"}` : "等待下一手";
  if (room.game.handOver) {
    const hero = room.game.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
    const canChooseShow = Boolean(hero && !hero.showCards && Date.now() < (room.game.showHandUntil || 0));
    foldBtn.disabled = !canChooseShow;
    callBtn.disabled = !canChooseShow;
    longThinkBtn.disabled = true;
    raiseBtn.classList.add("is-hidden");
    showHandBtn.classList.add("is-hidden");
    foldBtn.textContent = "摊牌展示";
    callBtn.textContent = "盖牌结束";
  } else {
    foldBtn.disabled = !isHero;
    callBtn.disabled = !isHero;
    raiseBtn.disabled = !isHero;
    longThinkBtn.disabled = !isHero || longThinkAlreadyUsed(room);
    longThinkBtn.textContent = longThinkAlreadyUsed(room) ? "已长考" : "长考";
    raiseBtn.classList.remove("is-hidden");
    foldBtn.textContent = "弃牌";
    callBtn.textContent = actionLabel(room);
    raiseBtn.textContent = "加注";
    renderShowHandButton(room);
  }
  renderRaiseControls(room, isHero);
  renderActionLog(room);
}

function renderShowHandButton(room) {
  const hero = room.game.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
  const canShow = Boolean(room.game.handOver && hero?.folded && !hero.showCards && Date.now() < (room.game.showHandUntil || 0));
  showHandBtn.classList.toggle("is-hidden", !canShow);
}

function showHeroHand(room) {
  const hero = room.game?.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
  if (!hero || Date.now() > (room.game.showHandUntil || 0)) return;
  hero.showCards = true;
  room.game.showHandUntil = 0;
  room.game.log.push(`${hero.name} 摊牌展示`);
  saveState();
  renderDashboard();
}

function muckHeroHand(room) {
  const hero = room.game?.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
  if (!hero || Date.now() > (room.game.showHandUntil || 0)) return;
  room.game.showHandUntil = 0;
  room.game.log.push(`${hero.name} 盖牌结束`);
  saveState();
  renderDashboard();
}

function renderActionLog(room) {
  actionLog.innerHTML = room.game.log.map((line) => `<span>${colorizeLogLine(line, room)}</span>`).join("");
}

function colorizeLogLine(line, room) {
  const seats = room.game?.seats || [];
  return seats.filter(Boolean).reduce((html, seat) => {
    const pattern = new RegExp(escapeRegExp(seat.name), "g");
    return html.replace(pattern, `<b class="log-player seat-text-${seat.seat + 1}">${seat.name}</b>`);
  }, escapeHtml(line));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderEquityPicker() {
  equityCards.querySelectorAll("[data-equity-card]").forEach((button) => {
    const index = Number(button.dataset.equityCard);
    const card = equityGuessCards[index];
    button.textContent = `${card.suit} ${card.rank}`;
    button.classList.toggle("is-selected", index === activeEquityCardIndex);
  });
  equitySuitPicker.innerHTML = equitySuitOptions.map((suit) => `<button type="button" data-equity-suit="${suit}" class="${equityGuessCards[activeEquityCardIndex].suit === suit ? "is-selected" : ""}">${suit}</button>`).join("");
  equityRankPicker.innerHTML = equityRankOptions.map((rank) => `<button type="button" data-equity-rank="${rank}" class="${equityGuessCards[activeEquityCardIndex].rank === rank ? "is-selected" : ""}">${rank}</button>`).join("");
}

function setEquityCardPart(type, value) {
  equityGuessCards[activeEquityCardIndex][type] = value;
  equityResult.textContent = "选择完成后点击计算胜率。";
  renderEquityPicker();
}

function equityCardToText(card) {
  return card.suit === "?" || card.rank === "?" ? "?" : `${card.rank}${card.suit}`;
}

function cardMatchesGuess(card, guess) {
  const parsed = parseCard(card);
  return (guess.suit === "?" || parsed.suit === guess.suit) && (guess.rank === "?" || parsed.rank === guess.rank);
}

function uniqueGuessCards(cards) {
  const concrete = cards.map(equityCardToText).filter((card) => card !== "?");
  return concrete.length === new Set(concrete).size;
}

function possibleOpponentHands(deck, guesses) {
  if (!uniqueGuessCards(guesses)) return [];
  const first = deck.filter((card) => cardMatchesGuess(card, guesses[0]));
  const second = deck.filter((card) => cardMatchesGuess(card, guesses[1]));
  const hands = [];
  const seen = new Set();
  first.forEach((cardA) => {
    second.forEach((cardB) => {
      if (cardA === cardB) return;
      const key = [cardA, cardB].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      hands.push([cardA, cardB]);
    });
  });
  return hands;
}

function calculateEquity() {
  const room = getActiveRoom();
  const game = room.game;
  const hero = game?.seats?.find((seat) => seat?.name === currentUser && !seat.isAi);
  if (!game || !hero?.hole?.length) {
    equityResult.textContent = "进入牌局并拿到手牌后才能计算。";
    return;
  }
  const knownCards = [...hero.hole, ...game.community];
  const dead = new Set(knownCards);
  const deck = createDeck().filter((card) => !dead.has(card));
  const opponentHands = possibleOpponentHands(deck, equityGuessCards);
  if (!opponentHands.length) {
    equityResult.textContent = "对手手牌范围无效，可能选到了已出现的牌或两张相同牌。";
    return;
  }
  const result = runEquitySimulation(hero.hole, game.community, deck, opponentHands);
  equityResult.innerHTML = `
    <strong>胜率 ${result.winRate}%</strong>
    <span>落后 ${result.loseRate}% · 平局 ${result.tieRate}%</span>
    <span>对手范围 ${formatNumber(opponentHands.length)} 组 · 抽样 ${formatNumber(result.samples)} 次</span>
    <em>Outs：${result.outs.length ? result.outs.slice(0, 8).join("、") + (result.outs.length > 8 ? "..." : "") : "暂无明显 outs"}</em>
  `;
}

function runEquitySimulation(heroHole, community, deck, opponentHands) {
  const knownBoard = [...community];
  const missingBoardCount = 5 - knownBoard.length;
  const maxSamples = missingBoardCount <= 1 && opponentHands.length <= 240 ? 8000 : 3600;
  const sampleCount = Math.min(maxSamples, Math.max(900, opponentHands.length * 24));
  let wins = 0;
  let ties = 0;
  let losses = 0;
  const outsMap = new Map();
  for (let index = 0; index < sampleCount; index += 1) {
    const opp = opponentHands[index % opponentHands.length];
    const remaining = deck.filter((card) => !opp.includes(card));
    const board = [...knownBoard, ...drawCards(remaining, missingBoardCount)];
    const heroScore = evaluateBest([...heroHole, ...board]);
    const oppScore = evaluateBest([...opp, ...board]);
    const compare = compareScore(heroScore, oppScore);
    if (compare > 0) wins += 1;
    else if (compare === 0) ties += 1;
    else {
      losses += 1;
      if (missingBoardCount > 0) collectOuts(outsMap, heroHole, knownBoard, opp, remaining);
    }
  }
  const total = wins + ties + losses || 1;
  return {
    winRate: percent(wins / total),
    tieRate: percent(ties / total),
    loseRate: percent(losses / total),
    samples: total,
    outs: [...outsMap.entries()].sort((a, b) => b[1] - a[1]).map(([card]) => card)
  };
}

function collectOuts(outsMap, heroHole, community, opponentHole, remaining) {
  const candidates = remaining.filter((card) => !opponentHole.includes(card));
  candidates.forEach((turnCard) => {
    const board = [...community, turnCard];
    const fillerCount = 5 - board.length;
    const filler = candidates.filter((card) => card !== turnCard).slice(0, fillerCount);
    if (board.length + filler.length < 5) return;
    const heroScore = evaluateBest([...heroHole, ...board, ...filler]);
    const oppScore = evaluateBest([...opponentHole, ...board, ...filler]);
    if (compareScore(heroScore, oppScore) > 0) outsMap.set(turnCard, (outsMap.get(turnCard) || 0) + 1);
  });
}

function drawCards(deck, count) {
  const pool = [...deck];
  const picked = [];
  while (picked.length < count && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function percent(value) {
  return (value * 100).toFixed(1);
}

function renderRaiseControls(room, isHero) {
  if (!isHero || room.game.handOver) {
    raiseMenu.classList.add("is-hidden");
    return;
  }
  const player = currentPlayer(room);
  const minRaise = Math.min(player.stack, Math.max(room.game.currentBet + 200 - (player.bet || 0), toCallFor(player, room.game) + 50));
  const maxRaise = player.stack;
  raiseSlider.min = String(Math.max(0, Math.min(minRaise, maxRaise)));
  raiseSlider.max = String(Math.max(0, maxRaise));
  raiseSlider.step = "50";
  if (!Number(raiseSlider.value) || Number(raiseSlider.value) < Number(raiseSlider.min) || Number(raiseSlider.value) > maxRaise) {
    raiseSlider.value = String(Math.max(0, Math.min(minRaise, maxRaise)));
  }
  updateRaiseValue();
}

function updateRaiseValue() {
  raiseValue.textContent = formatNumber(Number(raiseSlider.value || 0));
}

function longThinkKey(room) {
  const game = room.game;
  return game ? `${game.handNo}-${game.phase}-${game.currentIndex}` : "";
}

function longThinkAlreadyUsed(room) {
  return Boolean(room.game?.longThinkUsed?.[longThinkKey(room)]);
}

function extendThinkTime() {
  const room = getActiveRoom();
  const player = currentPlayer(room);
  if (!player || player.isAi || player.name !== currentUser || longThinkAlreadyUsed(room) || !timerDeadlineAt) return;
  room.game.longThinkUsed = room.game.longThinkUsed || {};
  room.game.longThinkUsed[longThinkKey(room)] = true;
  timerDurationSeconds += longThinkSeconds;
  timerDeadlineAt += longThinkSeconds * 1000;
  longThinkBtn.disabled = true;
  longThinkBtn.textContent = "已长考";
  saveState();
}

function setRaisePreset(preset) {
  const room = getActiveRoom();
  const player = currentPlayer(room);
  if (!player) return;
  const pot = room.game.pot || 0;
  const amounts = {
    third: Math.ceil(pot / 3),
    half: Math.ceil(pot / 2),
    fifth: Math.ceil(pot / 5),
    pot,
    allin: player.stack
  };
  const min = Number(raiseSlider.min || 0);
  const max = Number(raiseSlider.max || player.stack);
  raiseSlider.value = String(Math.max(min, Math.min(max, amounts[preset] || min)));
  document.querySelectorAll("[data-raise-preset]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.raisePreset === preset);
  });
  updateRaiseValue();
  commitRaiseAmount();
}

function commitRaiseAmount() {
  const amount = Number(raiseSlider.value || 0);
  if (!amount) return;
  raiseMenu.classList.add("is-hidden");
  applyAction("加注", amount);
}

function startTimer() {
  stopTimer();
  const room = getActiveRoom();
  const game = room.game;
  if (!game) return;
  startClockTimer(room);
  if (game.streetPause) {
    turnLabel.textContent = "等待发牌，2 秒后进入下一圈";
    startProgressTimer(2, () => {
      const activeRoom = getActiveRoom();
      if (appState.view === "game" && activeRoom.game?.streetPause && canDriveSharedGame(activeRoom)) {
        advanceStreetOrShowdown(activeRoom);
        saveState();
        renderDashboard();
      }
    });
    return;
  }
  if (game.handOver) {
    turnLabel.textContent = "本手结束，6 秒后自动下一手";
    startProgressTimer(6, () => {
      const activeRoom = getActiveRoom();
      if (appState.view === "game" && activeRoom.game?.handOver && canDriveSharedGame(activeRoom)) startNextHand();
    });
    return;
  }

  const player = currentPlayer(room);
  if (player?.isAi) {
    const thinkingSeconds = 1 + Math.random() * 2;
    turnLabel.textContent = `${player.name} 思考中`;
    startProgressTimer(thinkingSeconds, () => {
      const activeRoom = getActiveRoom();
      if (canDriveSharedGame(activeRoom)) aiAct();
    });
    return;
  }

  startProgressTimer(actionSeconds, () => {
    const activeRoom = getActiveRoom();
    const player = currentPlayer(activeRoom);
    if (player?.name === currentUser && !player.isAi) {
      const canCheck = toCallFor(player, activeRoom.game) <= 0;
      activeRoom.game.log.push(canCheck ? `${player.name} 超时自动过牌` : `${player.name} 超时自动弃牌`);
      applyAction(canCheck ? "跟注" : "弃牌");
    }
  });
}

function startProgressTimer(durationSeconds, onComplete) {
  let completed = false;
  timerStartedAt = Date.now();
  timerDurationSeconds = durationSeconds;
  timerDeadlineAt = timerStartedAt + durationSeconds * 1000;
  turnTimerBar.style.width = "100%";
  timerId = window.setInterval(() => {
    const leftMs = Math.max(0, timerDeadlineAt - Date.now());
    const left = Math.max(0, Math.min(1, leftMs / (timerDurationSeconds * 1000)));
    turnTimerBar.style.width = `${left * 100}%`;
    if (left <= 0 && !completed) {
      completed = true;
      stopTimer();
      onComplete();
    }
  }, 120);
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  if (aiTimeoutId) window.clearTimeout(aiTimeoutId);
  if (autoNextHandTimeoutId) window.clearTimeout(autoNextHandTimeoutId);
  if (clockTimerId) window.clearInterval(clockTimerId);
  timerId = null;
  aiTimeoutId = null;
  autoNextHandTimeoutId = null;
  clockTimerId = null;
  timerDeadlineAt = 0;
  timerDurationSeconds = 0;
}

function aiAct() {
  const room = getActiveRoom();
  if (appState.view !== "game") return;
  const game = room.game;
  const player = currentPlayer(room);
  if (!game || !player?.isAi || player.stack <= 0 || player.folded || player.eliminated) return;
  const decision = decideAiAction(room, player);
  logAiDecision(decision);
  if (decision.action === "fold") applyAction("弃牌");
  else if (decision.action === "call" || decision.action === "check") applyAction("跟注");
  else applyAction("加注", decision.amount);
}

function decideAiAction(room, player) {
  const game = room.game;
  const strength = aiHandStrength(player, game);
  const bucket = strengthBucket(strength);
  const stack = Number(player.stack || 0);
  const pot = Math.max(1, Number(game.pot || 0));
  const amountToCall = toCallFor(player, game);
  const currentBet = Number(game.currentBet || 0);
  const bigBlind = blindSchedule[game.blindIndex]?.big || 100;
  const betPressure = amountToCall > 0 ? amountToCall / pot : 0;
  const potOdds = amountToCall > 0 ? amountToCall / (pot + amountToCall) : 0;
  const profile = aiProfile(player);
  const perceivedStrength = clamp(strength + (Math.random() - 0.5) * (1 - profile.skill) * 0.12, 0, 1);
  const perceivedBucket = strengthBucket(perceivedStrength);
  const aggression = profile.aggression;
  const positionMod = aiPositionModifier(game, player.seat);
  const effectiveStack = aiEffectiveStack(game, player);
  const spr = effectiveStack / pot;
  const stackBb = stack / bigBlind;
  const callStackRatio = stack > 0 ? amountToCall / stack : 1;
  const madeCategory = aiMadeCategory(player, game);
  const shortStack = stackBb <= AI_CONFIG.stackPlan.shortStackBb;
  const deepStack = stackBb >= AI_CONFIG.stackPlan.deepStackBb || spr >= AI_CONFIG.stackPlan.highSpr;
  const context = { room, game, player, strength, perceivedStrength, bucket: perceivedBucket, actualBucket: bucket, profile, stack, pot, amountToCall, currentBet, bigBlind, betPressure, potOdds, aggression, positionMod, effectiveStack, spr, stackBb, callStackRatio, madeCategory, shortStack, deepStack };
  return amountToCall <= 0 ? decideAiNoBet(context) : decideAiFacingBet(context);
}

function decideAiNoBet(context) {
  const { bucket, stack, bigBlind, aggression, positionMod, shortStack, deepStack, spr, stackBb, madeCategory, game, player, profile } = context;
  const weights = { ...AI_CONFIG.noBet[bucket] };
  const aggressionBoost = (aggression - 0.5) * 0.34 + positionMod;
  weights.bet = Math.max(0, weights.bet + aggressionBoost);
  weights.check = Math.max(0, weights.check - aggressionBoost * 0.65);
  const streetBluffFactor = game.phase === "河牌" ? 0.45 : 1;
  if (bucket === "weak" && Math.random() > profile.bluffFrequency * streetBluffFactor) {
    weights.bet *= 0.35;
    weights.check += 0.22;
  }
  if (game.phase === "河牌" && bucket === "weak") weights.bet *= 0.45;
  if (shortStack && (bucket === "strong" || bucket === "veryStrong")) {
    weights.allin += bucket === "veryStrong" ? 0.22 : 0.1;
    weights.bet *= 0.65;
  }
  if (!shortStack && stackBb > AI_CONFIG.stackPlan.shortStackBb) weights.allin = 0;
  if (deepStack && bucket === "medium") {
    weights.bet *= 0.68;
    weights.check += 0.18;
  }
  if (deepStack && bucket === "strong" && (madeCategory == null || madeCategory <= 1)) {
    weights.bet *= 0.58;
    weights.check += 0.28;
  }
  if (deepStack && bucket === "veryStrong" && (madeCategory == null || madeCategory <= 1)) {
    weights.bet *= 0.72;
    weights.check += 0.14;
  }
  if (spr >= AI_CONFIG.stackPlan.mediumSpr && bucket !== "veryStrong") weights.allin = 0;
  const action = chooseWeightedAction(weights);
  const amount = action === "allin" ? stack : action === "bet" ? pickAiBetAmount(context) : 0;
  return {
    ...context,
    action,
    amount,
    availableActions: ["check", "bet", "allin"],
    reason: aiReason(context, action, `${bucket} hand + no current bet${player.stack <= bigBlind * 8 ? " + short stack" : ""}`)
  };
}

function decideAiFacingBet(context) {
  const { bucket, stack, amountToCall, betPressure, potOdds, aggression, positionMod, shortStack, deepStack, spr, stackBb, callStackRatio, madeCategory, profile } = context;
  const weights = { ...AI_CONFIG.facingBet[bucket] };
  const pressurePenalty = Math.max(0, betPressure - 0.25);
  if (bucket === "weak") {
    weights.fold += pressurePenalty * (0.7 + profile.tightness * 0.5);
    weights.call += profile.callCuriosity * 0.08;
    weights.call -= pressurePenalty * 0.5;
    weights.raise -= pressurePenalty * 0.12;
  } else if (bucket === "medium") {
    weights.fold += pressurePenalty * (0.3 + profile.tightness * 0.35);
    weights.call += profile.callCuriosity * 0.14;
    weights.call -= pressurePenalty * 0.22;
    weights.raise -= pressurePenalty * 0.06;
  } else {
    weights.raise += (aggression - 0.5) * 0.25 + positionMod;
    weights.call -= (aggression - 0.5) * 0.12;
  }
  if (betPressure < 0.25 && bucket !== "weak") {
    weights.call += 0.16;
    weights.fold *= 0.45;
  }
  if (shortStack) {
    weights.raise *= 0.35;
    if (bucket === "strong" || bucket === "veryStrong") weights.allin += 0.25;
    if (bucket === "weak" || bucket === "medium") weights.fold += 0.18;
  }
  if (callStackRatio > 0.28 && (bucket === "weak" || bucket === "medium")) {
    weights.fold += callStackRatio;
    weights.call *= 0.65;
    weights.raise *= 0.35;
  }
  if (deepStack && bucket === "strong" && (madeCategory == null || madeCategory <= 1)) {
    weights.raise *= 0.35;
    weights.allin = 0;
    weights.call += 0.24;
  }
  if (deepStack && bucket === "veryStrong" && madeCategory != null && madeCategory <= 1) {
    weights.raise *= 0.62;
    weights.allin *= 0.25;
    weights.call += 0.16;
  }
  if (!shortStack && (spr > AI_CONFIG.stackPlan.lowSpr || stackBb > AI_CONFIG.stackPlan.shortStackBb)) {
    weights.allin *= bucket === "veryStrong" && madeCategory != null && madeCategory >= 2 ? 0.55 : 0;
  }
  if (potOdds > 0.38 && bucket === "medium") {
    weights.fold += 0.18;
    weights.call *= 0.78;
  }
  if (profile.style === "calling-station" && bucket !== "weak" && betPressure < 0.75) {
    weights.call += 0.22;
    weights.raise *= 0.62;
  }
  if (profile.tightness > 0.65 && (bucket === "weak" || bucket === "medium")) {
    weights.fold += 0.16;
    weights.call *= 0.82;
  }
  if (amountToCall >= stack) {
    weights.raise = 0;
    weights.allin = 0;
  }
  if (bucket === "veryStrong") weights.fold *= 0.2;
  const action = chooseWeightedAction(weights);
  const raiseAmount = pickAiRaiseAmount(context);
  const selected = action === "raise" && raiseAmount <= amountToCall ? "call" : action;
  const amount = selected === "allin" ? stack : selected === "raise" ? raiseAmount : 0;
  return {
    ...context,
    action: selected,
    amount,
    availableActions: ["fold", "call", "raise", "allin"],
    reason: aiReason(context, selected, `${bucket} hand + ${pressureLabel(betPressure)} bet pressure`)
  };
}

function aiEffectiveStack(game, player) {
  const opponentStacks = activeSeatIndexes(game.seats)
    .map((index) => game.seats[index])
    .filter((seat) => seat && seat.seat !== player.seat)
    .map((seat) => Number(seat.stack || 0) + Number(seat.bet || 0));
  const largestOpponent = Math.max(0, ...opponentStacks);
  return Math.max(1, Math.min(Number(player.stack || 0), largestOpponent || Number(player.stack || 0)));
}

function aiMadeCategory(player, game) {
  if (!game.community?.length || !player?.hole?.length) return null;
  return evaluateBest([...player.hole, ...game.community])?.[0] ?? 0;
}

function aiHandStrength(player, game) {
  if (!player?.hole?.length) return 0;
  if (!game.community?.length) return preflopStrength(player.hole);
  const score = evaluateBest([...player.hole, ...game.community]);
  const category = score?.[0] || 0;
  const top = Math.max(...score.slice(1), 2);
  const kicker = Math.min(0.08, top / 180);
  const base = [0.18, 0.38, 0.56, 0.68, 0.76, 0.8, 0.9, 0.97, 1][category] || 0.18;
  return clamp(base + kicker, 0, 1);
}

function preflopStrength(hole) {
  const [a, b] = hole.map(parseCard).sort((left, right) => right.value - left.value);
  const high = a.value;
  const low = b.value;
  const gap = high - low;
  let score = 0.08 + ((high + low) / 28) * 0.34;
  if (high === low) score = 0.42 + (high / 14) * 0.38;
  if (a.suit === b.suit) score += 0.05;
  if (gap === 1) score += 0.05;
  else if (gap === 2) score += 0.025;
  else if (gap >= 5) score -= 0.06;
  if (high === 14) score += 0.08;
  if (high === 13) score += 0.04;
  if (high >= 10 && low >= 10) score += 0.1;
  if (high === 14 && low >= 13) score += 0.12;
  if (high <= 7 && low <= 3 && a.suit !== b.suit) score -= 0.1;
  return clamp(score, 0.04, 0.98);
}

function strengthBucket(strength) {
  if (strength >= 0.75) return "veryStrong";
  if (strength >= 0.5) return "strong";
  if (strength >= 0.25) return "medium";
  return "weak";
}

function aiProfile(player) {
  return player?.aiProfile || legacyAiProfile(player) || AI_CONFIG.profiles[0];
}

function aiPositionModifier(game, seatIndex) {
  const order = activeSeatOrderFrom(game, game.dealerIndex);
  const position = order.indexOf(seatIndex);
  if (position < 0 || order.length <= 2) return 0;
  const lateCut = Math.ceil(order.length * 0.66);
  if (position >= lateCut) return 0.08;
  if (position <= 1) return -0.06;
  return 0;
}

function activeSeatOrderFrom(game, fromIndex) {
  const active = activeSeatIndexes(game.seats);
  const ordered = tableSeatOrderIndexes(game.seats, (seat, index) => active.includes(index));
  if (!ordered.length) return [];
  const start = nextTableSeatIndex(game.seats, ordered, fromIndex);
  const startIndex = ordered.indexOf(start);
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

function pickAiBetAmount(context) {
  const { bucket, pot, stack, bigBlind, shortStack } = context;
  if (shortStack && stack <= bigBlind * AI_CONFIG.stackPlan.shoveStackBb) return stack;
  const fractions = AI_CONFIG.betFractions[bucket] || AI_CONFIG.betFractions.medium;
  const fraction = fractions[Math.floor(Math.random() * fractions.length)];
  const raw = Math.max(bigBlind, Math.round((pot * fraction) / 50) * 50);
  return sensibleAiWager(raw, context, "bet");
}

function pickAiRaiseAmount(context) {
  const { amountToCall, pot, stack, bigBlind, bucket, shortStack } = context;
  if (shortStack && (bucket === "strong" || bucket === "veryStrong")) return stack;
  const fractions = AI_CONFIG.betFractions[bucket] || AI_CONFIG.betFractions.strong;
  const fraction = fractions[Math.floor(Math.random() * fractions.length)];
  const extra = Math.max(bigBlind, Math.round((pot * fraction) / 50) * 50);
  return sensibleAiWager(amountToCall + extra, context, "raise");
}

function sensibleAiWager(rawAmount, context, mode) {
  const { bucket, stack, bigBlind, spr, stackBb, madeCategory, shortStack, deepStack, amountToCall } = context;
  if (stack <= 0) return 0;
  let amount = Math.min(stack, Math.max(0, rawAmount));
  const canShove = shortStack || spr <= AI_CONFIG.stackPlan.lowSpr || (bucket === "veryStrong" && madeCategory != null && madeCategory >= 2);
  if (!canShove && amount >= stack * 0.72) {
    amount = Math.max(mode === "raise" ? amountToCall + bigBlind : bigBlind, Math.floor(stack * 0.45 / 50) * 50);
  }
  if (deepStack && bucket !== "veryStrong") {
    const capRatio = bucket === "strong" ? 0.28 : 0.18;
    amount = Math.min(amount, Math.max(bigBlind, Math.floor(stack * capRatio / 50) * 50));
  }
  if (deepStack && bucket === "veryStrong" && madeCategory != null && madeCategory <= 1) {
    amount = Math.min(amount, Math.max(bigBlind, Math.floor(stack * 0.32 / 50) * 50));
  }
  const remaining = stack - amount;
  if (remaining > 0 && remaining < bigBlind * AI_CONFIG.stackPlan.awkwardRemainderBb) {
    amount = canShove ? stack : Math.max(mode === "raise" ? amountToCall + bigBlind : bigBlind, stack - bigBlind * AI_CONFIG.stackPlan.awkwardRemainderBb);
  }
  if (stackBb > AI_CONFIG.stackPlan.deepStackBb && !canShove) amount = Math.min(amount, Math.max(bigBlind, Math.floor(stack * 0.35 / 50) * 50));
  return Math.min(stack, Math.max(0, Math.round(amount / 50) * 50));
}

function chooseWeightedAction(weights) {
  const entries = Object.entries(weights).map(([action, weight]) => [action, Math.max(0, Number(weight) || 0)]);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return entries[0]?.[0] || "check";
  let roll = Math.random() * total;
  for (const [action, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

function pressureLabel(value) {
  if (value < 0.25) return "low";
  if (value < 0.5) return "normal";
  if (value < 1) return "high";
  return "very high";
}

function aiReason(context, action, base) {
  if (action === "allin") return `${base} -> All-in`;
  if (action === "raise") return `${base} -> Raise`;
  if (action === "bet") return `${base} -> Bet`;
  if (action === "fold") return `${base} -> Fold`;
  if (action === "call") return `${base} -> Call`;
  return `${base} -> Check`;
}

function logAiDecision(decision) {
  console.debug("AI Decision", {
    street: decision.game.phase,
    holeCards: decision.player.hole,
    board: decision.game.community,
    handStrength: Number(decision.strength.toFixed(3)),
    perceivedStrength: Number(decision.perceivedStrength.toFixed(3)),
    bucket: decision.bucket,
    pot: decision.pot,
    amountToCall: decision.amountToCall,
    betPressure: Number(decision.betPressure.toFixed(3)),
    potOdds: Number(decision.potOdds.toFixed(3)),
    stack: decision.stack,
    stackBb: Number(decision.stackBb.toFixed(1)),
    effectiveStack: decision.effectiveStack,
    spr: Number(decision.spr.toFixed(2)),
    madeCategory: decision.madeCategory,
    position: decision.player.seat,
    aggression: Number(decision.aggression.toFixed(2)),
    personality: decision.profile.label || decision.profile.id,
    tightness: Number(decision.profile.tightness.toFixed(2)),
    bluffFrequency: Number(decision.profile.bluffFrequency.toFixed(2)),
    availableActions: decision.availableActions,
    selectedAction: decision.action,
    amount: decision.amount,
    reason: decision.reason
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyAction(action, raiseAmount = null) {
  const room = getActiveRoom();
  const game = room.game;
  const player = currentPlayer(room);
  if (!game || !player || game.handOver) return;
  if (player.isAi && !canDriveSharedGame(room)) return;
  if (!player.isAi && player.name !== currentUser) return;

  if (action === "弃牌") {
    queueCardAnimation(player.seat, player.hole || [], "fold");
    player.folded = true;
    player.lastAction = "fold";
    game.log.push(`${player.name} 弃牌`);
    markActed(game, player.seat);
  } else if (action === "加注") {
    const targetAmount = raiseAmount == null ? game.currentBet + 200 - (player.bet || 0) : Number(raiseAmount);
    const amount = Math.min(player.stack, Math.max(0, targetAmount));
    player.stack -= amount;
    player.bet = (player.bet || 0) + amount;
    player.chipPile = (player.chipPile || 0) + amount;
    player.chipPileAnimatingUntil = Date.now() + 620;
    player.lastAction = player.stack <= 0 ? "allin" : "raise";
    game.pot += amount;
    game.currentBet = Math.max(game.currentBet, player.bet);
    game.log.push(player.stack <= 0 ? `${player.name} All in ${formatNumber(player.bet)}` : `${player.name} 加注到 ${formatNumber(game.currentBet)}`);
    if (amount > 0) queueChipAnimation(player.seat, amount, "bet");
    game.actedCount = 0;
    game.actedSeats = [player.seat];
  } else {
    const amount = Math.min(player.stack, toCallFor(player, game));
    player.stack -= amount;
    player.bet = (player.bet || 0) + amount;
    player.chipPile = (player.chipPile || 0) + amount;
    player.chipPileAnimatingUntil = Date.now() + 620;
    player.lastAction = amount > 0 ? (player.stack <= 0 ? "allin" : "call") : "check";
    game.pot += amount;
    game.log.push(amount > 0 ? (player.stack <= 0 ? `${player.name} All in ${formatNumber(player.bet)}` : `${player.name} 跟注 ${formatNumber(amount)}`) : `${player.name} 过牌`);
    if (amount > 0) queueChipAnimation(player.seat, amount, "bet");
    markActed(game, player.seat);
  }
  game.actedCount += 1;
  advanceTurn(room);
  saveState();
  renderDashboard();
}

function advanceTurn(room) {
  const game = room.game;
  const live = liveSeatIndexes(game.seats);
  if (live.length <= 1) {
    finishHand(room, live[0]);
    return;
  }
  if (bettingRoundComplete(game)) {
    if (game.community.length < 5) startStreetPause(room);
    else showdown(room);
    return;
  }
  game.currentIndex = nextTableSeatIndex(game.seats, activeSeatIndexes(game.seats), game.currentIndex);
}

function bettingRoundComplete(game) {
  const canAct = activeSeatIndexes(game.seats);
  if (!canAct.length) return true;
  return canAct.every((index) => {
    const seat = game.seats[index];
    return (game.actedSeats || []).includes(index) && (seat.bet || 0) === (game.currentBet || 0);
  });
}

function startStreetPause(room) {
  const game = room.game;
  game.streetPause = true;
  game.currentIndex = null;
  game.log.push("等待发牌");
}

function advanceStreetOrShowdown(room) {
  const game = room.game;
  game.streetPause = false;
  game.actedCount = 0;
  game.actedSeats = [];
  game.currentBet = 0;
  game.seats.forEach((seat) => {
    if (seat?.chipPile > 0) queueChipAnimation(seat.seat, seat.chipPile, "collect");
    if (seat) {
      seat.bet = 0;
      seat.chipPile = 0;
      seat.chipPileAnimatingUntil = 0;
      seat.lastAction = "";
    }
  });
  if (game.community.length === 0) {
    game.community.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
    game.phase = "翻牌";
    game.log.push("发出翻牌");
  } else if (game.community.length === 3) {
    game.community.push(game.deck.pop());
    game.phase = "转牌";
    game.log.push("发出转牌");
  } else if (game.community.length === 4) {
    game.community.push(game.deck.pop());
    game.phase = "河牌";
    game.log.push("发出河牌");
  } else {
    showdown(room);
    return;
  }
  const canAct = activeSeatIndexes(game.seats);
  game.currentIndex = nextTableSeatIndex(game.seats, canAct, game.dealerIndex);
  if (game.currentIndex == null) {
    if (game.community.length < 5) startStreetPause(room);
    else showdown(room);
  }
}

function queueChipAnimation(seatIndex, amount, type) {
  pendingChipAnimations.push({ seatIndex, amount, type });
}

function chipTier(amount) {
  return Math.max(1, Math.min(12, Math.ceil(Number(amount || 0) / 500)));
}

function chipTierClass(amount) {
  return `chip-tier-${chipTier(amount)}`;
}

function queueCardAnimation(seatIndex, cards, type) {
  pendingCardAnimations.push({ seatIndex, cards: [...(cards || [])], type });
}

function renderTableActionMarkers(game) {
  if (!chipAnimationLayer) return;
  chipAnimationLayer.querySelectorAll(".table-marker").forEach((marker) => marker.remove());
  const tableRect = chipAnimationLayer.getBoundingClientRect();
  if (!tableRect.width || !tableRect.height) return;
  const potRect = document.querySelector(".game-pot").getBoundingClientRect();
  const potPoint = {
    x: potRect.left - tableRect.left + potRect.width / 2,
    y: potRect.top - tableRect.top + potRect.height / 2
  };
  game.seats.forEach((seat) => {
    if (!seat || seat.folded) return;
    const seatPoint = seatCenter(seat.seat, tableRect);
    const point = tableBetPoint(seatPoint, potPoint);
    if (seat.chipPile > 0 && Number(seat.chipPileAnimatingUntil || 0) <= Date.now()) {
      chipAnimationLayer.appendChild(makeTableMarker(`table-chip table-marker ${chipTierClass(seat.chipPile)}`, formatNumber(seat.chipPile), point));
      if (seat.lastAction === "allin") {
        chipAnimationLayer.appendChild(makeTableMarker("action-badge allin-badge table-marker", "ALL IN", { x: point.x, y: point.y + 34 }));
      }
    } else if (seat.lastAction === "check") {
      chipAnimationLayer.appendChild(makeTableMarker("action-badge check-badge table-marker", "CHECK", point));
    } else if (seat.lastAction === "allin") {
      chipAnimationLayer.appendChild(makeTableMarker("action-badge allin-badge table-marker", "ALL IN", point));
    }
  });
  renderWinnerMarkers(game, tableRect, potPoint);
}

function renderWinnerMarkers(game, tableRect, potPoint) {
  if (!game.handOver || !game.winner) return;
  const winners = Array.isArray(game.winner) ? game.winner : [game.winner];
  const names = winners.map((winner) => winner.name).join("、");
  chipAnimationLayer.appendChild(makeTableMarker("winner-summary table-marker", `${names} 赢得 ${formatNumber(game.lastPot || 0)}`, { x: potPoint.x + 132, y: potPoint.y }));
  winners.forEach((winner) => {
    const seatPoint = seatCenter(winner.seat, tableRect);
    chipAnimationLayer.appendChild(makeTableMarker("winner-crown table-marker", "♛", { x: seatPoint.x + 58, y: seatPoint.y - 38 }));
  });
}

function makeTableMarker(className, text, point) {
  const marker = document.createElement("span");
  marker.className = className;
  if (className.includes("table-chip")) marker.dataset.amount = text;
  else marker.textContent = text;
  marker.style.left = `${point.x}px`;
  marker.style.top = `${point.y}px`;
  return marker;
}

function playQueuedChipAnimations() {
  if (!pendingChipAnimations.length || !chipAnimationLayer) return;
  const animations = [...pendingChipAnimations];
  pendingChipAnimations = [];
  window.requestAnimationFrame(() => {
    const tableRect = chipAnimationLayer.getBoundingClientRect();
    const potRect = document.querySelector(".game-pot").getBoundingClientRect();
    const potPoint = {
      x: potRect.left - tableRect.left + potRect.width / 2,
      y: potRect.top - tableRect.top + potRect.height / 2
    };
    animations.forEach((animation, index) => {
      const seatPoint = seatCenter(animation.seatIndex, tableRect);
      const tablePoint = tableBetPoint(seatPoint, potPoint);
      const from = animation.type === "collect" ? tablePoint : animation.type === "pot-win" ? potPoint : seatPoint;
      const to = animation.type === "collect" ? potPoint : animation.type === "pot-win" ? seatPoint : tablePoint;
      const chip = document.createElement("span");
      chip.className = `flying-chip ${chipTierClass(animation.amount)} ${animation.type === "collect" ? "collect-chip" : ""}${animation.type === "pot-win" ? " pot-win-chip" : ""}`;
      chip.innerHTML = animation.type === "pot-win" ? `<strong>POT</strong><em>${formatNumber(animation.amount)}</em>` : `<em>${formatNumber(animation.amount)}</em>`;
      chip.style.setProperty("--from-x", `${from.x}px`);
      chip.style.setProperty("--from-y", `${from.y}px`);
      chip.style.setProperty("--to-x", `${to.x}px`);
      chip.style.setProperty("--to-y", `${to.y}px`);
      chip.style.animationDelay = `${index * 70}ms`;
      chipAnimationLayer.appendChild(chip);
      window.setTimeout(() => chip.remove(), 980 + index * 70);
    });
    if (animations.some((animation) => animation.type === "bet")) {
      window.setTimeout(() => {
        const room = getActiveRoom();
        if (!room?.game) return;
        const now = Date.now();
        room.game.seats.forEach((seat) => {
          if (seat?.chipPileAnimatingUntil && seat.chipPileAnimatingUntil <= now) delete seat.chipPileAnimatingUntil;
        });
        renderDashboard();
      }, 640);
    }
  });
}

function playQueuedCardAnimations() {
  if (!pendingCardAnimations.length || !chipAnimationLayer) return;
  const animations = [...pendingCardAnimations];
  pendingCardAnimations = [];
  window.requestAnimationFrame(() => {
    const tableRect = chipAnimationLayer.getBoundingClientRect();
    const potRect = document.querySelector(".game-pot").getBoundingClientRect();
    const potPoint = {
      x: potRect.left - tableRect.left + potRect.width / 2,
      y: potRect.top - tableRect.top + potRect.height / 2
    };
    animations.forEach((animation, animationIndex) => {
      const cardPoints = seatCardPoints(animation.seatIndex, tableRect);
      const fallback = seatCenter(animation.seatIndex, tableRect);
      const cards = animation.cards.length ? animation.cards : ["?", "?"];
      cards.slice(0, 2).forEach((card, cardIndex) => {
        const from = cardPoints[cardIndex] || {
          x: fallback.x + (cardIndex === 0 ? -13 : 13),
          y: fallback.y
        };
        const cardNode = document.createElement("span");
        cardNode.className = `flying-card ${isRedCard(card) ? "red" : ""} ${card === "?" ? "card-back" : ""}`;
        cardNode.textContent = card === "?" ? "" : card;
        cardNode.style.setProperty("--from-x", `${from.x}px`);
        cardNode.style.setProperty("--from-y", `${from.y}px`);
        cardNode.style.setProperty("--to-x", `${potPoint.x + (cardIndex === 0 ? -8 : 8)}px`);
        cardNode.style.setProperty("--to-y", `${potPoint.y}px`);
        cardNode.style.animationDelay = `${animationIndex * 70 + cardIndex * 45}ms`;
        chipAnimationLayer.appendChild(cardNode);
        window.setTimeout(() => cardNode.remove(), 850 + animationIndex * 70 + cardIndex * 45);
      });
    });
  });
}

function seatCenter(seatIndex, tableRect) {
  const seatElement = document.querySelector(`.game-seat[data-seat-index="${seatIndex}"]`);
  if (!seatElement) return { x: tableRect.width / 2, y: tableRect.height / 2 };
  const rect = seatElement.getBoundingClientRect();
  return {
    x: rect.left - tableRect.left + rect.width / 2,
    y: rect.top - tableRect.top + rect.height / 2
  };
}

function seatCardPoints(seatIndex, tableRect) {
  const seatElement = document.querySelector(`.game-seat[data-seat-index="${seatIndex}"]`);
  if (!seatElement) return [];
  return [...seatElement.querySelectorAll(".mini-card")].slice(0, 2).map((card) => {
    const rect = card.getBoundingClientRect();
    return {
      x: rect.left - tableRect.left + rect.width / 2,
      y: rect.top - tableRect.top + rect.height / 2
    };
  });
}

function tableBetPoint(seatPoint, potPoint) {
  return {
    x: seatPoint.x + (potPoint.x - seatPoint.x) * 0.34,
    y: seatPoint.y + (potPoint.y - seatPoint.y) * 0.34
  };
}

function finishHand(room, winnerIndex) {
  const winner = room.game.seats[winnerIndex] || getSeatedPlayers(room)[0];
  const wonPot = room.game.pot;
  collectVisibleChipPiles(room.game);
  if (winner) winner.stack += room.game.pot;
  if (winner) queueChipAnimation(winner.seat, wonPot, "pot-win");
  room.game.winner = winner ? [{ name: winner.name, seat: winner.seat }] : [];
  room.game.lastPot = wonPot;
  room.game.log.push(`${winner?.name || "玩家"} 赢得底池`);
  room.game.pot = 0;
  room.game.handOver = true;
  room.game.showHandUntil = Date.now() + 2000;
  room.game.currentIndex = winnerIndex;
  window.setTimeout(() => {
    const activeRoom = getActiveRoom();
    if (activeRoom.game?.handOver && !activeRoom.game?.seats?.find((seat) => seat?.name === currentUser && !seat.isAi)?.showCards) renderDashboard();
  }, 2050);
}

function showdown(room) {
  const game = room.game;
  const live = game.seats.map((seat, index) => seat && !seat.folded ? index : -1).filter((index) => index >= 0);
  const scored = live.map((index) => ({ index, score: evaluateBest([...game.seats[index].hole, ...game.community]) }));
  scored.sort((a, b) => compareScore(b.score, a.score));
  const winners = scored.filter((item) => compareScore(item.score, scored[0].score) === 0);
  const share = Math.floor(game.pot / winners.length);
  const wonPot = game.pot;
  collectVisibleChipPiles(game);
  winners.forEach((item) => {
    game.seats[item.index].stack += share;
    queueChipAnimation(item.index, share, "pot-win");
  });
  game.winner = winners.map((item) => ({ name: game.seats[item.index].name, seat: item.index }));
  game.lastPot = wonPot;
  game.log.push(`摊牌：${winners.map((item) => game.seats[item.index].name).join("、")} 获胜`);
  game.pot = 0;
  game.handOver = true;
  game.showHandUntil = Date.now() + 2000;
  game.currentIndex = winners[0].index;
  window.setTimeout(() => {
    const activeRoom = getActiveRoom();
    if (activeRoom.game?.handOver && !activeRoom.game?.seats?.find((seat) => seat?.name === currentUser && !seat.isAi)?.showCards) renderDashboard();
  }, 2050);
}

function collectVisibleChipPiles(game) {
  game.seats.forEach((seat) => {
    if (!seat || !(seat.chipPile > 0)) return;
    queueChipAnimation(seat.seat, seat.chipPile, "collect");
    seat.chipPile = 0;
    seat.chipPileAnimatingUntil = 0;
    seat.bet = 0;
  });
}

function startNextHand() {
  const room = getActiveRoom();
  const previousSeats = room.game?.seats || room.seats;
  const playersBeforeHand = previousSeats.filter((seat) => seat && !seat.eliminated).length;
  const bustedPlayers = previousSeats
    .filter((seat) => seat && !seat.eliminated && seat.stack <= 0)
    .sort((a, b) => Number(a.handStartStack || 0) - Number(b.handStartStack || 0) || a.seat - b.seat);
  const bustedCount = bustedPlayers.length;
  if (bustedCount > 0) {
    room.eliminatedPlayers = room.eliminatedPlayers || {};
    bustedPlayers.forEach((seat, index) => {
      room.eliminatedPlayers[seat.name] = { stack: 0, place: Math.max(2, playersBeforeHand - index) };
    });
  }
  if (bustedCount > 0 && room.bumpBlindOnElimination) {
    const nextHandNo = (room.game?.handNo || 1) + 1;
    const beforeIndex = blindIndexForHand(room, nextHandNo);
    let targetIndex = beforeIndex;
    for (let count = 0; count < bustedCount; count += 1) {
      targetIndex = doubledBlindIndex(room, targetIndex);
    }
    room.eliminationBlindBump = Number(room.eliminationBlindBump || 0) + Math.max(0, targetIndex - beforeIndex);
    const afterIndex = blindIndexForHand(room, nextHandNo);
    if (afterIndex > beforeIndex) {
      room.pendingBlindLog = `淘汰涨盲：${bustedCount} 人出局，盲注升至 ${blindLabel(afterIndex)}`;
    }
  }
  room.seats = previousSeats.map((seat, index) => {
    if (!seat) return null;
    if (seat.stack <= 0) {
      const eliminated = room.eliminatedPlayers?.[seat.name] || {};
      return {
        ...seat,
        seat: index,
        stack: 0,
        folded: true,
        hole: [],
        bet: 0,
        chipPile: 0,
        chipPileAnimatingUntil: 0,
        eliminated: true,
        eliminationPlace: eliminated.place || seat.eliminationPlace || null
      };
    }
    return { ...seat, seat: index, folded: false, hole: [], bet: 0, chipPile: 0, chipPileAnimatingUntil: 0 };
  });
  const remaining = getSeatedPlayers(room);
  if (remaining.length <= 1) {
    const champion = remaining[0]?.name || room.game?.seats.find(Boolean)?.name || "玩家";
    const finalRanking = tournamentRanking(room, champion);
    room.state = "已结束";
    room.gameStarted = false;
    room.rounds.unshift(finalRanking);
    room.rounds = room.rounds.slice(0, 5);
    room.game = null;
    appState.view = "room";
    saveState();
    renderDashboard();
    openRankingModal(finalRanking, 1, "本局最终排名");
    return;
  }
  room.game = createGameState(room, false);
  if (room.pendingBlindLog) {
    room.game.log.splice(1, 0, room.pendingBlindLog);
    room.pendingBlindLog = "";
  }
  room.gameStarted = true;
  saveState();
  renderDashboard();
}

function tournamentRanking(room, champion) {
  const allNames = (room.game?.seats || room.seats).filter(Boolean).map((seat) => seat.name);
  const eliminated = Object.entries(room.eliminatedPlayers || {})
    .sort(([, a], [, b]) => Number(a.place || maxPlayers) - Number(b.place || maxPlayers))
    .map(([name]) => name);
  return [champion, ...eliminated, ...allNames.filter((name) => name !== champion && !eliminated.includes(name))].slice(0, maxPlayers);
}

function evaluateBest(cards) {
  return combinations(cards, 5).map(evaluateFive).sort((a, b) => compareScore(b, a))[0];
}

function combinations(items, size) {
  const result = [];
  function walk(start, picked) {
    if (picked.length === size) {
      result.push(picked);
      return;
    }
    for (let index = start; index < items.length; index += 1) walk(index + 1, [...picked, items[index]]);
  }
  walk(0, []);
  return result;
}

function evaluateFive(cards) {
  const parsed = cards.map(parseCard).sort((a, b) => b.value - a.value);
  const values = parsed.map((card) => card.value);
  const flush = parsed.every((card) => card.suit === parsed[0].suit);
  const straight = straightHigh(values);
  const groups = [...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  if (flush && straight) return [8, straight];
  if (groups[0].count === 4) return [7, groups[0].value, groups.find((group) => group.count === 1).value];
  if (groups[0].count === 3 && groups[1]?.count === 2) return [6, groups[0].value, groups[1].value];
  if (flush) return [5, ...values];
  if (straight) return [4, straight];
  if (groups[0].count === 3) return [3, groups[0].value, ...groups.filter((group) => group.count === 1).map((group) => group.value)];
  if (groups[0].count === 2 && groups[1]?.count === 2) return [2, groups[0].value, groups[1].value, groups.find((group) => group.count === 1).value];
  if (groups[0].count === 2) return [1, groups[0].value, ...groups.filter((group) => group.count === 1).map((group) => group.value)];
  return [0, ...values];
}

function parseCard(card) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { suit, rank, value: ranks.indexOf(rank) + 2 };
}

function straightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const run = unique.slice(index, index + 5);
    if (run[0] - run[4] === 4) return run[0];
  }
  return 0;
}

function compareScore(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

function renderDashboard() {
  activeUser.textContent = currentUser ? `${currentUser} 已登录${multiplayer.connected ? " · 联机" : ""}` : "未登录";
  if (appState.view === "game") renderGame();
  else if (appState.view === "room") {
    stopTimer();
    renderRoom();
    renderRankings();
  } else renderLobby();
  renderDevices();
}

function showDashboard() {
  authPanel.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
  renderDashboard();
}

function rememberUser(username) {
  const existing = appState.users.find((user) => user.username === username);
  if (!existing) appState.users.push({ username });
}

function setAuthMode(mode) {
  const registering = mode === "register";
  authFormTitle.textContent = registering ? "申请账号" : "账号登录";
  authFormHint.textContent = registering
    ? "请联系管理员开通账号。拿到账号和密码后，返回登录即可进入大厅。"
    : "使用管理员提供的账号和密码登录。";
  loginForm.hidden = registering;
  backToLoginBtn.hidden = !registering;
  if (registering) passwordInput.value = "";
  authMessage.textContent = "";
  authModeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.authMode === mode));
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(loginSessionKey));
    const account = window.sngAccounts?.find(saved?.username);
    if (account && account.passwordHash === saved.passwordHash) {
      currentUser = account.username;
      showDashboard();
    } else {
      sessionStorage.removeItem(loginSessionKey);
    }
  } catch {
    // 无法读取会话时继续显示登录页。
  }
}

function addDevice(username) {
  const now = new Date();
  appState.devices.push({
    name: `${username} · ${navigator.platform || "Web 设备"}`,
    time: now.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  });
  appState.devices = appState.devices.slice(-8);
}

authModeButtons.forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
backToLoginBtn.addEventListener("click", () => {
  setAuthMode("login");
  usernameInput.focus();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (loginForm.hidden || authSubmitBtn.disabled || !username || !password) return;
  authSubmitBtn.disabled = true;
  authMessage.className = "auth-message";
  authMessage.textContent = "正在验证账号...";
  try {
    if (!window.sngAccounts) throw new Error("账号名单加载失败，请刷新页面或联系管理员。");
    const account = window.sngAccounts.find(username);
    const valid = await window.sngAccounts.verify(account, password);
    if (loginForm.hidden) return;
    if (!valid) throw new Error("账号或密码不正确，请核对输入或联系管理员。");
    sessionStorage.setItem(loginSessionKey, JSON.stringify({ username, passwordHash: account.passwordHash }));
    currentUser = username;
    appState.view = "lobby";
    if (rememberMeInput.checked) rememberUser(username);
    addDevice(username);
    passwordInput.value = "";
    saveState();
    showDashboard();
  } catch (error) {
    authMessage.className = "auth-message is-error";
    authMessage.textContent = error.message;
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  currentUser = "";
  sessionStorage.removeItem(loginSessionKey);
  appState.view = "lobby";
  stopTimer();
  saveState();
  dashboard.classList.add("is-hidden");
  authPanel.classList.remove("is-hidden");
  renderSavedUsers();
});

setAuthMode("login");

backToLobbyBtn.addEventListener("click", () => {
  appState.view = "lobby";
  saveNote.textContent = "";
  saveState();
  renderDashboard();
});

enterGameBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  if (!room.gameStarted) {
    saveNote.textContent = "需要多人准备后由房主开局。";
    return;
  }
  appState.view = "game";
  saveState();
  renderDashboard();
});

fillAiBtn.addEventListener("click", fillEmptySeatsWithAi);

backToRoomBtn.addEventListener("click", () => {
  appState.view = "room";
  saveState();
  renderDashboard();
});

document.addEventListener("click", (event) => {
  if (seatActionMenu && !event.target.closest(".seat-action-menu") && !event.target.closest(".seat")) closeSeatActionMenu();
});
toggleReadyBtn.addEventListener("click", toggleReady);
startGameBtn.addEventListener("click", startGame);
closeRoomGameBtn.addEventListener("click", closeCurrentGame);
foldBtn.addEventListener("click", () => {
  raiseMenu.classList.add("is-hidden");
  const room = getActiveRoom();
  if (room.game?.handOver) {
    showHeroHand(room);
    return;
  }
  applyAction("弃牌");
});
callBtn.addEventListener("click", () => {
  raiseMenu.classList.add("is-hidden");
  const room = getActiveRoom();
  if (room.game?.handOver) {
    muckHeroHand(room);
    return;
  }
  applyAction("跟注");
});
raiseBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  if (room.game?.handOver) startNextHand();
  else {
    renderRaiseControls(room, true);
    raiseMenu.classList.toggle("is-hidden");
  }
});
showHandBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  showHeroHand(room);
});
raiseSlider.addEventListener("input", updateRaiseValue);
raiseSlider.addEventListener("change", commitRaiseAmount);
document.querySelectorAll("[data-raise-preset]").forEach((button) => {
  button.addEventListener("click", () => setRaisePreset(button.dataset.raisePreset));
});
longThinkBtn.addEventListener("click", extendThinkTime);
closeGameBtn.addEventListener("click", closeCurrentGame);
equityToggleBtn.addEventListener("click", () => {
  equityDrawer.classList.toggle("is-hidden");
  renderEquityPicker();
});
closeEquityBtn.addEventListener("click", () => equityDrawer.classList.add("is-hidden"));
equityCards.addEventListener("click", (event) => {
  const button = event.target.closest("[data-equity-card]");
  if (!button) return;
  activeEquityCardIndex = Number(button.dataset.equityCard);
  renderEquityPicker();
});
equitySuitPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-equity-suit]");
  if (button) setEquityCardPart("suit", button.dataset.equitySuit);
});
equityRankPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-equity-rank]");
  if (button) setEquityCardPart("rank", button.dataset.equityRank);
});
calculateEquityBtn.addEventListener("click", calculateEquity);
logToggleBtn.addEventListener("click", () => handLogDrawer.classList.toggle("is-hidden"));
closeLogBtn.addEventListener("click", () => handLogDrawer.classList.add("is-hidden"));

closeModalBtn.addEventListener("click", () => rankingModal.classList.add("is-hidden"));
rankingModal.addEventListener("click", (event) => {
  if (event.target === rankingModal) rankingModal.classList.add("is-hidden");
});

saveRoomBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  if (!isHost(room) || room.gameStarted) return;
  room.blindMinutes = Number(blindTime.value);
  room.startingChips = Number(startingChips.value);
  room.maxBlindIndex = normalizeBlindIndex(maxBlindLevel.value);
  room.blindStartIndex = Math.min(normalizeBlindIndex(blindStartLevel.value), room.maxBlindIndex);
  room.eliminationBlindBump = 0;
  room.bumpBlindOnElimination = bumpBlindOnElimination.checked;
  room.blindLevel = blindLabel(room.blindStartIndex);
  saveState();
  renderDashboard();
  saveNote.textContent = `${room.name} 已保存：${formatNumber(room.startingChips)} 筹码，${room.blindMinutes} 分钟涨盲，${room.blindLevel} 起始，最高 ${blindLabel(room.maxBlindIndex)}${room.bumpBlindOnElimination ? "，淘汰涨盲开启" : ""}`;
});

maxBlindLevel.addEventListener("change", () => {
  if (Number(blindStartLevel.value) > Number(maxBlindLevel.value)) {
    blindStartLevel.value = maxBlindLevel.value;
  }
});

addRoundBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  if (!isHost(room)) return;
  const names = getSeatedPlayers(room).map((player) => player.name);
  const nextRound = (names.length ? names : aiNames).slice(0, maxPlayers).sort(() => Math.random() - 0.5);
  room.rounds.unshift(nextRound);
  room.rounds = room.rounds.slice(0, 5);
  saveState();
  renderRoom();
  renderRankings();
});

clearRoundsBtn.addEventListener("click", () => {
  const room = getActiveRoom();
  if (!isHost(room)) return;
  room.rounds = [];
  saveState();
  renderRoom();
  renderRankings();
});

async function connectIfServerAvailable() {
  if (location.protocol === "file:") return;
  try {
    const response = await fetch("/api/health");
    if (response.ok && (await response.json()).service === "sng-poker") connectMultiplayer();
  } catch {
    // 静态站点仍可登录并使用本地功能。
  }
}

renderSavedUsers();
restoreSession();
connectIfServerAvailable();
