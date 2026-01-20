const io = require("socket.io-client");
const http = require("http");

const API_URL = "http://localhost:3100";
const SOCKET_URL = "http://localhost:4100";

const registerUser = (userData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(`${API_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(JSON.parse(data)));
        });
        req.on("error", reject);
        req.write(JSON.stringify(userData));
        req.end();
    });
};

const loginUser = (userData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(JSON.parse(data)));
        });
        req.on("error", reject);
        req.write(JSON.stringify(userData));
        req.end();
    });
};

const setupPlayer = async (username, prefs) => {
    const user = {
        email: `${username}@bug.com`,
        username: username,
        name: username,
        password: "password123",
    };
    await registerUser(user).catch(() => { });
    const login = await loginUser({ email: user.email, password: user.password });
    const token = login.data.token;
    const socket = io(SOCKET_URL);

    return new Promise((resolve) => {
        socket.on("connect", () => {
            console.log(`[${username}] Connected with prefs:`, prefs);
            socket.emit("create-game", { token, ...prefs });
            resolve({ socket, userId: login.data.user.id });
        });
        socket.on("game-start", (data) => {
            const gameData = JSON.parse(data);
            console.log(`[${username}] GAME STARTED! ID: ${gameData.gameId}, Dif: ${gameData.difficulty}, Time: ${gameData.timeLimit}`);
        });
    });
};

const main = async () => {
    console.log("--- Reproducing Reported Matchmaking Bug ---");

    const timestamp = Date.now();
    // P1: difficulty 3, timeLimit 15, side white
    await setupPlayer(`p1_${timestamp}`, { difficulty: 3, timeLimit: 15, side: "white" });

    // P2: difficulty 4, timeLimit 30, side white
    // They should NOT match
    await setupPlayer(`p2_${timestamp}`, { difficulty: 4, timeLimit: 30, side: "white" });

    setTimeout(() => {
        console.log("\nIf you don't see any 'GAME STARTED' messages above, the bug is NOT reproduced with these inputs.");
        process.exit(0);
    }, 5000);
};

main().catch(console.error);
