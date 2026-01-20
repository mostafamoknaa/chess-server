const { Chess } = require("chess.js");

// Mock Environment
const redisStore = {
    games: {},
    users: {}
};

const redisClient = {
    hGet: async (ns, key) => redisStore[ns][key],
    hSet: async (ns, key, val) => { redisStore[ns][key] = val; },
    hDel: async (ns, key) => { delete redisStore[ns][key]; }
};

const io = {
    to: (room) => ({
        emit: (event, data) => console.log(`[IO to ${room}] EMIT ${event}: `, data)
    })
};

const publisher = {
    publish: (channel, data) => console.log(`[REDIS PUB ${channel}]: `, data)
};

const gameTimers = new Map();

// Simulation helper
function createSocket(userId, gameId) {
    return {
        userId,
        to: (room) => ({
            emit: (event, data) => console.log(`[Socket ${userId} to ${room}] EMIT ${event}: `, data)
        }),
        emit: (event, data) => console.log(`[Socket ${userId} EMIT ${event}]: `, data)
    };
}

async function runSimulation() {
    const userIdA = "user_white";
    const userIdB = "user_black";
    const gameId = "test_game_123";

    const initialGameState = {
        gameId,
        whiteUser: userIdA,
        blackUser: userIdB,
        boardState: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        moves: [],
        status: "In Progress"
    };

    // Setup initial state
    redisStore.games[gameId] = JSON.stringify(initialGameState);
    redisStore.users[userIdA] = gameId;
    redisStore.users[userIdB] = gameId;

    const socketA = createSocket(userIdA, gameId);
    const socketB = createSocket(userIdB, gameId);

    console.log("--- SCENARIO 1: RESIGNATION ---");
    {
        const game = JSON.parse(await redisClient.hGet("games", gameId));
        const newGameState = {
            ...game,
            status: "Completed",
            winner: userIdB,
            result: "Resignation",
        };
        console.log("Simulation: User A resigns");
        publisher.publish("game-update", JSON.stringify({ gameId, newGameState }));
        io.to(gameId).emit("game-update", JSON.stringify(newGameState));
    }

    console.log("\n--- SCENARIO 2: DRAW REQUEST (REJECT) ---");
    {
        // Reset game
        redisStore.games[gameId] = JSON.stringify(initialGameState);
        console.log("Simulation: User A requests draw");
        socketA.to(gameId).emit("draw-request", JSON.stringify({ requesterId: userIdA }));
        
        console.log("Simulation: User B rejects draw");
        socketB.to(gameId).emit("draw-rejected", JSON.stringify({ responderId: userIdB }));
    }

    console.log("\n--- SCENARIO 3: DRAW REQUEST (ACCEPT) ---");
    {
        // Reset game
        redisStore.games[gameId] = JSON.stringify(initialGameState);
        console.log("Simulation: User A requests draw");
        socketA.to(gameId).emit("draw-request", JSON.stringify({ requesterId: userIdA }));

        console.log("Simulation: User B accepts draw");
        const game = JSON.parse(await redisClient.hGet("games", gameId));
        const newGameState = {
            ...game,
            status: "Completed",
            winner: null,
            result: "Draw",
        };
        publisher.publish("game-update", JSON.stringify({ gameId, newGameState }));
        io.to(gameId).emit("game-update", JSON.stringify(newGameState));
    }

    console.log("\n--- SCENARIO 4: CHECKMATE ---");
    {
        // Setup Fool's Mate position for White to be checkmated
        const chess = new Chess();
        chess.move("f3"); chess.move("e5");
        chess.move("g4"); chess.move("Qh4#");
        
        const game = {
            ...initialGameState,
            boardState: chess.fen(),
            moves: chess.history(),
            status: "Completed",
            winner: userIdB,
            result: "Checkmate"
        };
        console.log("Simulation: Black delivers Fool's Mate");
        publisher.publish("game-update", JSON.stringify({ gameId, newGameState: game }));
        io.to(gameId).emit("game-update", JSON.stringify(game));
    }
}

runSimulation();
