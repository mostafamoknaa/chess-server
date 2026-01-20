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
        email: `${username}@test.com`,
        username: username,
        name: username,
        password: "password123",
    };
    await registerUser(user).catch(() => { }); // Ignore error if already exists
    const login = await loginUser({ email: user.email, password: user.password });
    if (!login.success) {
        console.error(`[${username}] Login failed: ${login.message}`);
        return null;
    }
    const token = login.data.token;
    const socket = io(SOCKET_URL);

    return new Promise((resolve) => {
        socket.on("connect", () => {
            console.log(`[${username}] Connected`);
            socket.emit("create-game", JSON.stringify({ token, ...prefs }));
            resolve({ socket, token });
        });
        socket.on("create-game-response", (msg) => {
            console.log(`[${username}] Queue Status: ${msg}`);
        });
        socket.on("game-start", (data) => {
            const gameData = JSON.parse(data);
            console.log(`[${username}] GAME STARTED! ID: ${gameData.gameId}, Side: ${gameData.whiteUser === login.data.user.id ? 'White' : 'Black'}, Dif: ${gameData.difficulty}, Time: ${gameData.timeLimit}`);
        });
    });
};

const main = async () => {
    console.log("--- Starting Matchmaking Logic Test ---");

    // Scenario 1: Same preferences (Dif 2, 15min) -> Should Match
    console.log("\nScenario 1: Same Preferences (Expect Match)");
    const timestamp = Date.now();
    await setupPlayer(`p1_${timestamp}`, { difficulty: 2, timeLimit: 15, side: "white" });
    await setupPlayer(`p2_${timestamp}`, { difficulty: 2, timeLimit: 15, side: "black" });

    // Scenario 2: Different Difficulty (Dif 3 vs Dif 4) -> Should NOT Match
    console.log("\nScenario 2: Different Difficulty (Expect No Match)");
    await setupPlayer(`p3_${timestamp}`, { difficulty: 3, timeLimit: 30, side: "random" });
    await setupPlayer(`p4_${timestamp}`, { difficulty: 4, timeLimit: 30, side: "random" });

    // Scenario 3: Same Side (White vs White) -> Should NOT Match
    console.log("\nScenario 3: Same Side Preference (Expect No Match)");
    await setupPlayer(`p5_${timestamp}`, { difficulty: 5, timeLimit: "none", side: "white" });
    await setupPlayer(`p6_${timestamp}`, { difficulty: 5, timeLimit: "none", side: "white" });

    setTimeout(() => {
        console.log("\nTest run finished. Check logs above for 'GAME STARTED' messages.");
        process.exit(0);
    }, 8000);
};

main().catch(console.error);
