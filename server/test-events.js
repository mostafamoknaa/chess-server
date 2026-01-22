const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3101";
const SOCKET_URL = "http://localhost:4101";

let playerA = {
  username: "testuserA_" + Date.now(),
  email: "testuserA_" + Date.now() + "@example.com",
  name: "Test User A",
  password: "password123",
  socket: null,
  token: null,
  id: null
};

let playerB = {
  username: "testuserB_" + Date.now(),
  email: "testuserB_" + Date.now() + "@example.com",
  name: "Test User B",
  password: "password123",
  socket: null,
  token: null,
  id: null
};

async function registerAndLogin(user) {
  console.log(`Registering ${user.username}...`);
  try {
    const registerRes = await fetch(`${SERVER_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, username: user.username, name: user.name, password: user.password })
    });
    const registerData = await registerRes.json();

    if (!registerData.success && registerData.message !== "Email or Username already exists") {
      console.error(`Registration failed for ${user.username}:`, registerData.message);
    }

    // Verify email hack (since we can't click email link easily, we'll manually update DB or just login if isVerified is not strictly enforced on this specific server logic for testing - checking index.js line 203: yes it is enforced.)
    // Actually, looking at index.js, there is a /verify-email endpoint. But we need the token.
    // Wait, the register response returns the user object. Does it verify automatically? No, line 166: isVerified: true in prisma.create!!!
    // Oh, wait, I saw line 166: isVerified: true in index.js.
    // Let's re-read index.js line 166.
    // Yes: `isVerified: true,` is hardcoded in `app.post("/register")`.
    // So verification is skipped for now in the code implementation unless I misread it. 
    // Let's assume it IS verified.

    console.log(`Logging in ${user.username}...`);
    const loginRes = await fetch(`${SERVER_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password })
    });
    const loginData = await loginRes.json();

    if (loginData.success) {
      user.token = loginData.data.token;
      user.id = loginData.data.user.id;
      console.log(`Logged in ${user.username}. ID: ${user.id}`);
      return true;
    } else {
      console.error(`Login failed for ${user.username}:`, loginData.message);
      return false;
    }
  } catch (e) {
    console.error(`Error registering/logging in ${user.username}:`, e);
    return false;
  }
}

function connectSocket(user) {
  return new Promise((resolve) => {
    user.socket = io(SOCKET_URL);
    user.socket.on("connect", () => {
      console.log(`${user.username} connected to socket.`);
      resolve();
    });
    user.socket.on("create-game-response", (msg) => {
      console.log(`${user.username} create-game-response: ${msg}`);
    });
    user.socket.on("connect_error", (err) => {
      console.log(`${user.username} connect_error: ${err.message}`);
    });
  });
}

function createGame(user, prefs) {
  console.log(`${user.username} creating game with prefs:`, prefs);
  user.socket.emit("create-game", { token: user.token, ...prefs });
}

async function runTests() {
  // 1. Setup Users
  if (!(await registerAndLogin(playerA))) return;
  if (!(await registerAndLogin(playerB))) return;

  await connectSocket(playerA);
  await connectSocket(playerB);

  // --- TEST 1: Basic Game Start & Resign ---
  console.log("\n--- TEST 1: Resign ---");
  let gameId;

  // Promise to wait for game start
  const gameStartPromise = new Promise((resolve) => {
    playerA.socket.once("game-start", (data) => {
      const game = JSON.parse(data);
      gameId = game.gameId;
      console.log(`Game started! ID: ${gameId}`);
      resolve(game);
    });
  });

  // Create game (Prefs must match)
  const prefs = { difficulty: "5", timeLimit: "10", side: "random" };
  createGame(playerA, prefs);
  createGame(playerB, prefs);

  await gameStartPromise;

  // Player A moves (optional, but good for realism)
  // We need to know who is white to make a valid move.
  // However, resign doesn't require turn.

  // Player B resigns
  console.log(`${playerB.username} resigning...`);
  playerB.socket.emit("move", JSON.stringify({ move: "resign" }));

  await new Promise(resolve => setTimeout(resolve, 1000));
  // Listen for game end? 
  // Ideally we should have listened for "game-update" or "player-resigned"
  // But for this script, let's just observe logs for now or add listeners.

  // --- TEST 2: Draw Request & Accept ---
  console.log("\n--- TEST 2: Draw Accept ---");

  // Start new game
  const gameStartPromise2 = new Promise((resolve) => {
    playerA.socket.once("game-start", (data) => {
      const game = JSON.parse(data);
      gameId = game.gameId;
      console.log(`Game 2 started! ID: ${gameId}`);
      resolve(game);
    });
  });

  createGame(playerA, prefs);
  createGame(playerB, prefs);

  await gameStartPromise2;

  // Player A requests draw
  console.log(`${playerA.username} requesting draw...`);
  playerA.socket.emit("draw-request");

  // Player B listens for draw-offer
  await new Promise((resolve) => {
    playerB.socket.once("draw-offer", (data) => {
      console.log(`${playerB.username} received draw offer from ${JSON.parse(data).requesterId}`);
      resolve();
    });
  });

  // Player B accepts
  console.log(`${playerB.username} accepting draw...`);
  playerB.socket.emit("draw-response", JSON.stringify({ accepted: true }));

  await new Promise(resolve => setTimeout(resolve, 1000));


  // --- TEST 3: Draw Request & Reject ---
  console.log("\n--- TEST 3: Draw Reject ---");

  // Start new game
  const gameStartPromise3 = new Promise((resolve) => {
    playerA.socket.once("game-start", (data) => {
      const game = JSON.parse(data);
      gameId = game.gameId;
      console.log(`Game 3 started! ID: ${gameId}`);
      resolve(game);
    });
  });

  createGame(playerA, prefs);
  createGame(playerB, prefs);

  await gameStartPromise3;

  // Player A requests draw
  console.log(`${playerA.username} requesting draw...`);
  playerA.socket.emit("draw-request");

  // Player B listens for draw-offer
  await new Promise((resolve) => {
    playerB.socket.once("draw-offer", (data) => {
      console.log(`${playerB.username} received draw offer.`);
      resolve();
    });
  });

  // Player B rejects
  console.log(`${playerB.username} rejecting draw...`);
  playerB.socket.emit("draw-response", JSON.stringify({ accepted: false }));

  // Player A listens for rejection
  await new Promise((resolve) => {
    playerA.socket.once("draw-rejected", (data) => {
      console.log(`${playerA.username} received draw REJECTION.`);
      resolve();
    });
  });

  console.log("\nAll tests completed.");
  process.exit(0);
}

runTests();