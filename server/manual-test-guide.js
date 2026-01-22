// Manual Test Guide for Chess Events
// Run this in browser console after connecting to the game

// 1. TEST RESIGN EVENT
// Player 1 emits resign:
socket.emit('move', JSON.stringify({ move: 'resign' }));

// Player 2 should listen for:
socket.on('player-resigned', (data) => {
  const { resignedPlayer, winner } = JSON.parse(data);
  console.log('✅ Resign Event:', { resignedPlayer, winner });
});

// 2. TEST DRAW REQUEST EVENT  
// Player 1 requests draw:
socket.emit('draw-request');

// Player 2 should listen for:
socket.on('draw-offer', (data) => {
  const { requesterId } = JSON.parse(data);
  console.log('✅ Draw Offer Event:', { requesterId });
});

// Player 2 accepts draw:
socket.emit('draw-response', JSON.stringify({ accepted: true }));

// 3. TEST CHECKMATE EVENT
// Both players listen for:
socket.on('game-update', (data) => {
  const gameState = JSON.parse(data);
  if (gameState.result === 'Checkmate') {
    console.log('✅ Checkmate Event:', { result: gameState.result, winner: gameState.winner });
  }
});

// Scholar's mate moves (for quick checkmate test):
// 1. e4 e5
// 2. Bc4 Nc6  
// 3. Qh5 Nf6
// 4. Qxf7# (checkmate)

console.log('Copy and paste the above code sections to test each event manually');