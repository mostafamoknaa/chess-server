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
        email: `${username}@timer.com`,
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
            console.log(`[${username}] Connected`);
            socket.emit("create-game", JSON.stringify({ token, ...prefs }));
            resolve({ socket, userId: login.data.user.id });
        });
        socket.on("game-start", (data) => {
            const gameData = JSON.parse(data);
            console.log(`[${username}] GAME STARTED! ID: ${gameData.gameId}, Time: ${gameData.timeLimit}m`);
        });
        socket.on("game-update", (data) => {
            const gameData = JSON.parse(data);
            if (gameData.status === "Completed") {
                console.log(`[${username}] GAME COMPLETED! Winner: ${gameData.winner}, Result: ${gameData.result}`);
            }
        });
    });
};

const main = async () => {
    console.log("--- Starting Game Timer Test ---");

    // Test with a 0.1 minute (6 seconds) limit
    const timestamp = Date.now();
    const p1 = await setupPlayer(`white_${timestamp}`, { difficulty: 1, timeLimit: 0.1, side: "white" });
    const p2 = await setupPlayer(`black_${timestamp}`, { difficulty: 1, timeLimit: 0.1, side: "black" });

    console.log("\nWaiting for timeout (approx 6-8 seconds)...");

    setTimeout(() => {
        console.log("\nTest run finished. If logic is correct, Black should win because White didn't move.");
        process.exit(0);
    }, 10000);
};

main().catch(console.error);
