const io = require("socket.io-client");

const client = io("http://localhost:4100");

client.on("connect", () => {
  console.log("✅ Connected to server");
  
  // Test events listeners
  client.on("player-resigned", (data) => {
    console.log("✅ RESIGN EVENT:", JSON.parse(data));
  });
  
  client.on("draw-offer", (data) => {
    console.log("✅ DRAW OFFER EVENT:", JSON.parse(data));
  });
  
  client.on("game-update", (data) => {
    const gameState = JSON.parse(data);
    if (gameState.result === "Checkmate") {
      console.log("✅ CHECKMATE EVENT:", { result: gameState.result, winner: gameState.winner });
    }
  });
  
  console.log("Event listeners set up. Use browser to test actual gameplay.");
});

client.on("disconnect", () => {
  console.log("Disconnected");
});

// Keep running
console.log("Test client running. Press Ctrl+C to exit.");