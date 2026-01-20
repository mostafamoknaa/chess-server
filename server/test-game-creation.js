const io = require("socket.io-client");
const http = require("http");

// API URL (Port 3100)
const API_URL = "http://localhost:3100";
// Socket URL (Port 4100)
const SOCKET_URL = "http://localhost:4100";

let gamesStarted = 0;

const registerUser = (userData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(
            `${API_URL}/register`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse register response: ${data}`));
                    }
                });
            }
        );
        req.on("error", reject);
        req.write(JSON.stringify(userData));
        req.end();
    });
};

const loginUser = (userData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(
            `${API_URL}/login`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse login response: ${data}`));
                    }
                });
            }
        );
        req.on("error", reject);
        req.write(JSON.stringify(userData));
        req.end();
    });
};

const connectSocket = (token, name) => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
        console.log(`[${name}] Connected to socket: ${socket.id}`);
        console.log(`[${name}] Requesting create-game...`);
        socket.emit("create-game", JSON.stringify({ token }));
    });

    socket.on("create-game-response", (msg) => {
        console.log(`[${name}] Server Response: ${msg}`);
    });

    socket.on("game-start", (data) => {
        const gameData = JSON.parse(data);
        console.log(`[${name}] SUCCESS: GAME STARTED!`);
        console.log(`[${name}] Game ID: ${gameData.gameId}`);
        console.log(`[${name}] Players: (White: ${gameData.whiteUser}) vs (Black: ${gameData.blackUser})`);
        console.log(`[${name}] Initial Board: ${gameData.boardState}`);

        gamesStarted++;
        if (gamesStarted === 2) {
            console.log("\n--- TEST COMPLETED SUCCESSFULLY ---");
            setTimeout(() => process.exit(0), 1000);
        }
    });

    socket.on("connect_error", (err) => {
        console.error(`[${name}] Connection Error:`, err.message);
    });

    return socket;
};

const main = async () => {
    const timestamp = Date.now();
    const user1 = {
        email: `player1_${timestamp}@example.com`,
        username: `player1_${timestamp}`,
        name: "Player One",
        password: "password123",
    };

    const user2 = {
        email: `player2_${timestamp}@example.com`,
        username: `player2_${timestamp}`,
        name: "Player Two",
        password: "password123",
    };

    try {
        console.log("--- Step 1: Registering/Logging In Users ---");

        console.log(`Registering ${user1.username}...`);
        const reg1 = await registerUser(user1);
        if (!reg1.success) throw new Error(`Player 1 Registration failed: ${reg1.message}`);

        console.log(`Logging in ${user1.username}...`);
        const login1 = await loginUser({ email: user1.email, password: user1.password });
        if (!login1.success) throw new Error(`Player 1 Login failed: ${login1.message}`);
        const token1 = login1.data.token;
        console.log("Player 1 Logged In");
        console.log(`TOKEN 1: ${token1}\n`);

        console.log(`Registering ${user2.username}...`);
        const reg2 = await registerUser(user2);
        if (!reg2.success) throw new Error(`Player 2 Registration failed: ${reg2.message}`);

        console.log(`Logging in ${user2.username}...`);
        const login2 = await loginUser({ email: user2.email, password: user2.password });
        if (!login2.success) throw new Error(`Player 2 Login failed: ${login2.message}`);
        const token2 = login2.data.token;
        console.log("Player 2 Logged In");
        console.log(`TOKEN 2: ${token2}\n`);

        console.log("--- Step 2: Connecting Sockets and Creating Game ---");
        const socket1 = connectSocket(token1, "Player 1");

        // Delay Player 2 slightly to ensure they enter the queue separately
        setTimeout(() => {
            const socket2 = connectSocket(token2, "Player 2");
        }, 1500);

        // Fail-safe timeout
        setTimeout(() => {
            if (gamesStarted < 2) {
                console.error("\n--- TEST FAILED: Timeout waiting for game-start ---");
                process.exit(1);
            }
        }, 15000);

    } catch (error) {
        console.error("\n--- TEST FAILED ---");
        console.error("Error:", error.message);
        process.exit(1);
    }
};

main();
