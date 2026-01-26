const express = require("express");
const path = require("path");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: (origin, callback) => {
      // Allows any origin, including 'null' (for local files)
      callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});
const jsonwebtoken = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { Resend } = require("resend");
const bcrypt = require("bcrypt");
const redis = require("redis");
const chess = require("chess.js");
const cors = require("cors");
let Stockfish;
try {
  Stockfish = require("stockfish");
} catch (e) {
  console.warn("Stockfish module not found or broken. AI games will not work.");
  Stockfish = () => {
    return {
      postMessage: () => { },
      onmessage: () => { },
    };
  };
}

require("dotenv").config();
const secretKey = process.env.SECRET_KEY;
const resendKey = process.env.RESEND_API_KEY;
var redisUrl = process.env.REDIS_URL;
const resendEmail = process.env.RESEND_EMAIL;
const node_env = process.env.NODE_ENV;

const prisma = new PrismaClient();
const resend = new Resend(resendKey);

if (node_env === "development" && !redisUrl) {
  redisUrl = "redis://localhost:6379";
}

console.log("Redis URL:", redisUrl);

const publisher = redis.createClient({
  url: redisUrl,
});
const subscriber = publisher.duplicate();
const redisClient = publisher.duplicate();

var matchQueue = [];
const gameTimers = new Map();

app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chess Master | Play Chess Online</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --bg-dark: #0f172a;
            --text-light: #f8fafc;
            --text-dim: #94a3b8;
            --accent: #818cf8;
            --glass: rgba(255, 255, 255, 0.05);
            --glass-border: rgba(255, 255, 255, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-light);
            line-height: 1.6;
            overflow-x: hidden;
        }

        .background-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 50%);
            pointer-events: none;
            z-index: -1;
        }

        nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 5%;
            background: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 1.5rem;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .logo-icon {
            font-size: 2rem;
            color: var(--primary);
        }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 2rem;
        }

        .nav-links a {
            text-decoration: none;
            color: var(--text-light);
            font-weight: 600;
            transition: color 0.3s;
        }

        .nav-links a:hover {
            color: var(--primary);
        }

        .btn-play {
            background: var(--primary);
            padding: 0.75rem 1.5rem;
            border-radius: 50px;
            color: white !important;
            transition: transform 0.3s, background 0.3s !important;
        }

        .btn-play:hover {
            background: var(--primary-hover);
            transform: translateY(-2px);
        }

        main {
            padding: 4rem 5%;
        }

        .hero {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 4rem;
            align-items: center;
            min-height: 70vh;
        }

        .hero-content h1 {
            font-size: 4rem;
            font-weight: 800;
            line-height: 1.1;
            margin-bottom: 1.5rem;
        }

        .accent {
            color: var(--primary);
        }

        .hero-content p {
            font-size: 1.25rem;
            color: var(--text-dim);
            margin-bottom: 2.5rem;
            max-width: 600px;
        }

        .hero-btns {
            display: flex;
            gap: 1.5rem;
        }

        .btn {
            padding: 1rem 2rem;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            transition: all 0.3s;
        }

        .btn.primary {
            background: var(--primary);
            color: white;
        }

        .btn.primary:hover {
            background: var(--primary-hover);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
        }

        .btn.secondary {
            background: var(--glass);
            color: var(--text-light);
            border: 1px solid var(--glass-border);
        }

        .btn.secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-3px);
        }

        .chess-board-preview {
            display: grid;
            grid-template-rows: repeat(4, 1fr);
            width: 100%;
            aspect-ratio: 1;
            border: 8px solid var(--glass-border);
            border-radius: 16px;
            overflow: hidden;
            transform: perspective(1000px) rotateY(-15deg) rotateX(10deg);
            box-shadow: 20px 40px 60px rgba(0, 0, 0, 0.5);
        }

        .board-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
        }

        .cell.white { background: #e2e8f0; }
        .cell.black { background: #475569; }

        .features {
            padding: 8rem 0;
            text-align: center;
        }

        .features h2 {
            font-size: 2.5rem;
            margin-bottom: 4rem;
        }

        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }

        .feature-card {
            background: var(--glass);
            border: 1px solid var(--glass-border);
            padding: 3rem 2rem;
            border-radius: 24px;
            transition: transform 0.3s, border-color 0.3s;
        }

        .feature-card:hover {
            transform: translateY(-10px);
            border-color: var(--primary);
        }

        .feature-card .icon {
            font-size: 3rem;
            margin-bottom: 1.5rem;
        }

        .feature-card h3 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }

        .feature-card p {
            color: var(--text-dim);
        }

        footer {
            text-align: center;
            padding: 4rem;
            border-top: 1px solid var(--glass-border);
            color: var(--text-dim);
        }

        @media (max-width: 968px) {
            .hero {
                grid-template-columns: 1fr;
                text-align: center;
            }
            
            .hero-content h1 {
                font-size: 3rem;
            }

            .hero-content p {
                margin-inline: auto;
            }

            .hero-btns {
                justify-content: center;
            }

            .hero-image {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="background-overlay"></div>
    <nav>
        <div class="logo">
            <span class="logo-icon">♟</span>
            <span class="logo-text">ChessMaster</span>
        </div>
        <div class="nav-links">
            <a href="#features">Features</a>
            <a href="#play" class="btn-play">Play Now</a>
        </div>
    </nav>

    <main>
        <section class="hero">
            <div class="hero-content">
                <h1>Master the Game of <span class="accent">Kings</span></h1>
                <p>Experience the ultimate online chess platform. Play against friends, test your skills with AI, and join a global community of players.</p>
                <div class="hero-btns">
                    <a href="#play" class="btn primary">Get Started</a>
                    <a href="#features" class="btn secondary">Learn More</a>
                </div>
            </div>
            <div class="hero-image">
                <div class="chess-board-preview">
                    <div class="board-row">
                        <div class="cell white"></div><div class="cell black"></div><div class="cell white"></div><div class="cell black"></div>
                    </div>
                    <div class="board-row">
                        <div class="cell black"></div><div class="cell white"></div><div class="cell black"></div><div class="cell white"></div>
                    </div>
                    <div class="board-row">
                        <div class="cell white"></div><div class="cell black"></div><div class="cell white"></div><div class="cell black"></div>
                    </div>
                    <div class="board-row">
                        <div class="cell black"></div><div class="cell white"></div><div class="cell black"></div><div class="cell white"></div>
                    </div>
                </div>
            </div>
        </section>

        <section id="features" class="features">
            <h2>Why Play on <span class="accent">ChessMaster?</span></h2>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="icon">⚡</div>
                    <h3>Real-time Play</h3>
                    <p>Experience seamless, low-latency games with players around the world.</p>
                </div>
                <div class="feature-card">
                    <div class="icon">🤖</div>
                    <h3>AI Challenges</h3>
                    <p>Sharpen your skills against our advanced Stockfish-powered AI.</p>
                </div>
                <div class="feature-card">
                    <div class="icon">🏆</div>
                    <h3>Global Rankings</h3>
                    <p>Track your progress and climb the leaderboard as you win games.</p>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <p>&copy; 2026 ChessMaster. All rights reserved.</p>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const cards = document.querySelectorAll('.feature-card');
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }
                });
            }, { threshold: 0.1 });

            cards.forEach(card => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                card.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
                observer.observe(card);
            });

            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth'
                        });
                    }
                });
            });
        });
    </script>
</body>
</html>`);
});

const generateResponse = (message, success, data) => {
  if (!success) {
    return {
      message,
      success,
    };
  }
  return {
    message,
    success,
    data,
  };
};

const sendVerificationEmail = async (email, token) => {
  await resend.emails.send({
    to: email,
    from: resendEmail,
    subject: "Verify your email",
    html: `Click on the link to verify your email: <a href="http://chess-server.manangandhi.tech/rest/verify-email?token=${token}">Verify</a>`,
  });
};

const generateNewGameState = (gameId, whiteUser, blackUser, difficulty, timeLimit) => {
  const game = new chess.Chess();
  console.log("Game:", game.fen());
  return {
    gameId,
    whiteUser,
    blackUser,
    boardState: game.fen(),
    moves: [],
    status: "In Progress",
    difficulty,
    timeLimit,
  };
};

// AI Move Generation with Stockfish
const getAIMove = (fen, difficulty = "medium") => {
  return new Promise((resolve, reject) => {
    const engine = Stockfish();
    let bestMove = null;

    // Difficulty settings: depth and skill level
    const difficultySettings = {
      easy: { depth: 1, skillLevel: 0 },
      medium: { depth: 5, skillLevel: 5 },
      hard: { depth: 10, skillLevel: 10 },
      expert: { depth: 15, skillLevel: 20 },
    };

    const settings = difficultySettings[difficulty.toLowerCase()] || difficultySettings.medium;

    engine.onmessage = (event) => {
      const message = event.data || event;

      if (typeof message === 'string' && message.startsWith('bestmove')) {
        const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (match) {
          bestMove = match[1];
          engine.postMessage('quit');
          resolve(bestMove);
        }
      }
    };

    // Initialize engine
    engine.postMessage('uci');
    engine.postMessage('isready');
    engine.postMessage(`setoption name Skill Level value ${settings.skillLevel}`);
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${settings.depth}`);

    // Timeout fallback
    setTimeout(() => {
      if (!bestMove) {
        engine.postMessage('quit');
        reject(new Error('AI move timeout'));
      }
    }, 10000);
  });
};

app.use(express.json());

app.post("/register", async (req, res) => {
  const { email, username, name, password } = req.body;
  if (!email || !username || !name || !password) {
    return res.json(generateResponse("Please provide all fields", false, null));
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  var user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        username,
        name,
        isVerified: true,
        password: hashedPassword,
      },
    });
  } catch (e) {
    return res.json(
      generateResponse("Email or Username already exists", false, null)
    );
  }
  if (user) {
    const token = jsonwebtoken.sign({ id: user.id }, secretKey);
    sendVerificationEmail(user.email, token);
    user.password = undefined;
    return res.json(
      generateResponse(
        "You have been registered succesfully, please verify your Email ID.",
        true,
        user
      )
    );
  }
  res.json(generateResponse("Something went wrong", false, null));
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.json(generateResponse("Please provide all fields", false, null));
  }
  const user = await prisma.user.findFirst({
    where: {
      email,
    },
  });
  if (!user) {
    return res.json(generateResponse("Invalid credentials", false, null));
  }
  if (!user.isVerified) {
    return res.json(
      generateResponse("Please verify your email to login", false, null)
    );
  }
  if (user) {
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.json(generateResponse("Invalid credentials", false, null));
    }
    user.password = undefined;
    const token = jsonwebtoken.sign({ id: user.id }, secretKey);
    return res.json(
      generateResponse("You have been logged in successfully", true, {
        user,
        token,
      })
    );
  }
  res.json(generateResponse("Invalid credentials", false, null));
});

app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  const decoded = jsonwebtoken.verify(token, secretKey);
  if (decoded) {
    const user = await prisma.user.update({
      where: {
        id: decoded.id,
      },
      data: {
        isVerified: true,
      },
    });
    if (user) {
      return res.json(
        generateResponse(
          "Your email has been verified successfully",
          true,
          null
        )
      );
    }
  }
  res.json(generateResponse("Invalid token", false, null));
});

app.get("/resend-verification-email", async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.json(generateResponse("Please provide email", false, null));
  }
  const user = await prisma.user.findFirst({
    where: {
      email,
    },
  });
  if (!user) {
    return res.json(generateResponse("User not found", false, null));
  }
  if (user.isVerified) {
    return res.json(generateResponse("Email already verified", false, null));
  }
  const token = jsonwebtoken.sign({ id: user.id }, secretKey);
  sendVerificationEmail(user.email, token);
  res.json(generateResponse("Verification email sent", true, null));
});

app.get("/getUser", async (req, res) => {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.json(
      generateResponse("Missing Authentication Header", false, null)
    );
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  const decoded = jsonwebtoken.verify(token, secretKey);
  if (decoded) {
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.id,
      },
    });
    if (user) {
      user.password = undefined;
      return res.json(generateResponse("User found", true, user));
    } else {
      return res.json(generateResponse("User not found", false, null));
    }
  }
});

app.get("/refreshToken", async (req, res) => {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.json(
      generateResponse("Missing Authentication Header", false, null)
    );
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  const decoded = jsonwebtoken.verify(token, secretKey);
  if (decoded) {
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.id,
      },
    });
    if (user) {
      const newToken = jsonwebtoken.sign({ id: user.id }, secretKey);
      return res.json(
        generateResponse("Token refreshed", true, { token: newToken })
      );
    }
  }
  res.json(generateResponse("Invalid token", false, null));
});

app.get("/getUserData", async (req, res) => {
  const { id } = req.query;
  const { authorization } = req.headers;
  if (!id) {
    return res.json(generateResponse("Please provide user ID", false, null));
  }
  if (!authorization) {
    return res.json(
      generateResponse("Missing Authentication Header", false, null)
    );
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  const user = await prisma.user.findFirst({
    where: {
      id: id,
    },
  });
  if (user) {
    user.password = undefined;
    return res.json(generateResponse("User found", true, user));
  }
  res.json(generateResponse("User not found", false, null));
});

app.get("/getUserGames", async (req, res) => {
  const { id } = req.query;
  const { authorization } = req.headers;
  if (!id) {
    return res.json(generateResponse("Please provide user ID", false, null));
  }
  if (!authorization) {
    return res.json(
      generateResponse("Missing Authentication Header", false, null)
    );
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  const games = await prisma.game.findMany({
    where: {
      OR: [
        {
          whiteUserId: id,
        },
        {
          blackUserId: id,
        },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  if (games) {
    var res_games = [];
    games.forEach((game) => {
      game.gameId = game.id;
      game.whiteUser = game.whiteUserId;
      game.blackUser = game.blackUserId;
      delete game.whiteUserId;
      delete game.blackUserId;
      delete game.id;
      res_games.push(game);
    });
    return res.json(generateResponse("Games found", true, res_games));
  }
  res.json(generateResponse("Games not found", false, null));
});

app.get("/searchUser", async (req, res) => {
  const { username } = req.query;
  const { authorization } = req.headers;
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.json(generateResponse("Invalid token", false, null));
  }
  if (!username) {
    return res.json(generateResponse("Please provide username", false, null));
  }
  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: username,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      username: true,
      name: true,
    },
  });
  return res.json(generateResponse("Search Complete", true, users));
});

io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("create-game", async (data) => {
    let parsedData;
    try {
      parsedData = typeof data === "string" ? JSON.parse(data) : data;
    } catch (e) {
      console.error("DEBUG: Failed to parse create-game data:", e);
      return;
    }

    const { token, difficulty, timeLimit, side } = parsedData;
    if (!token) {
      return;
    }
    const decoded = jsonwebtoken.verify(token, secretKey);
    if (decoded) {
      const user = await prisma.user.findFirst({
        where: {
          id: decoded.id,
        },
      });
      if (!user) {
        return;
      }
      socket.userId = user.id;
      const parsedDifficulty = difficulty !== undefined ? parseInt(difficulty) : NaN;
      const parsedTimeLimit = parseFloat(timeLimit) || 0;

      socket.gamePrefs = {
        difficulty: isNaN(parsedDifficulty) ? null : parsedDifficulty,
        timeLimit: isNaN(parsedTimeLimit) ? 0 : parsedTimeLimit,
        side: (side || "random").toLowerCase()
      };

      redisClient.lPush("online-users", socket.userId);
      const gameId = await redisClient.hGet("users", user.id);
      if (gameId) {
        console.log("User ", user, " in game:", gameId);
        socket.join(gameId);
        const gameState = JSON.parse(await redisClient.hGet("games", gameId));
        socket.emit("game-start", JSON.stringify(gameState));
        return;
      }

      if (user) {
        user.password = undefined;
        console.log(`User ${user.username} looking for game. Prefs:`, JSON.stringify(socket.gamePrefs));

        // Find potential opponent in matchQueue
        let opponentIndex = matchQueue.findIndex(sq => {
          if (sq.userId === socket.userId) return false;

          if (!sq.gamePrefs) return false;

          if (sq.gamePrefs.difficulty !== socket.gamePrefs.difficulty) return false;
          if (sq.gamePrefs.timeLimit !== socket.gamePrefs.timeLimit) return false;

          // Side compatibility check
          const mySide = socket.gamePrefs.side;
          const oppSide = sq.gamePrefs.side;

          if (mySide === "white" && oppSide === "white") return false;
          if (mySide === "black" && oppSide === "black") return false;

          return true;
        });

        if (opponentIndex !== -1) {
          const opponent = matchQueue.splice(opponentIndex, 1)[0];
          const gameId = Math.random().toString(36).substring(10);
          console.log(`Match found! Game ID: ${gameId} between ${user.userId} and ${opponent.userId}`);

          socket.join(gameId);
          opponent.join(gameId);

          // Determine sides
          let whiteUser, blackUser;
          const mySide = socket.gamePrefs.side;
          const oppSide = opponent.gamePrefs.side;

          if (mySide === "white") {
            whiteUser = socket.userId;
            blackUser = opponent.userId;
          } else if (mySide === "black") {
            whiteUser = opponent.userId;
            blackUser = socket.userId;
          } else if (oppSide === "white") {
            whiteUser = opponent.userId;
            blackUser = socket.userId;
          } else if (oppSide === "black") {
            whiteUser = socket.userId;
            blackUser = opponent.userId;
          } else {
            // Both are random
            if (Math.random() > 0.5) {
              whiteUser = socket.userId;
              blackUser = opponent.userId;
            } else {
              whiteUser = opponent.userId;
              blackUser = socket.userId;
            }
          }

          const gameState = generateNewGameState(
            gameId,
            whiteUser,
            blackUser,
            socket.gamePrefs.difficulty,
            socket.gamePrefs.timeLimit
          );

          redisClient.hSet("games", gameId, JSON.stringify(gameState));
          redisClient.hSet("users", socket.userId, gameId);
          redisClient.hSet("users", opponent.userId, gameId);

          // Start Game Timer
          if (socket.gamePrefs.timeLimit) {
            const duration = parseFloat(socket.gamePrefs.timeLimit) * 60 * 1000;
            const timerId = setTimeout(() => {
              handleGameTimeout(gameId);
            }, duration);
            gameTimers.set(gameId, timerId);
            console.log(`Timer started for game ${gameId}: ${duration}ms`);
          }

          io.to(gameId).emit("game-start", JSON.stringify(gameState));
          publisher.publish(
            "game-start",
            JSON.stringify({ gameId, gameState })
          );
        } else {
          // Remove any existing entries for this user to avoid stale preferences
          matchQueue = matchQueue.filter(sq => sq.userId !== socket.userId);
          matchQueue.push(socket);
          console.log(`User ${user.username} added to match queue. Size: ${matchQueue.length}`);
          socket.emit("create-game-response", "Waiting for opponent with same preferences");
        }
      } else {
        console.log("User not found in DB");
      }
    }
  });

  socket.on("create-game-ai", async (data) => {
    const { token, difficulty } = JSON.parse(data);
    if (!token) {
      return;
    }
    const decoded = jsonwebtoken.verify(token, secretKey);
    if (decoded) {
      const user = await prisma.user.findFirst({
        where: {
          id: decoded.id,
        },
      });
      if (!user) {
        return;
      }
      socket.userId = user.id;
      redisClient.lPush("online-users", socket.userId);

      // Check if user is already in a game
      const existingGameId = await redisClient.hGet("users", user.id);
      if (existingGameId) {
        console.log("User ", user, " already in game:", existingGameId);
        socket.join(existingGameId);
        const gameState = JSON.parse(await redisClient.hGet("games", existingGameId));
        socket.emit("game-start", JSON.stringify(gameState));
        return;
      }

      // Create AI game
      const gameId = Math.random().toString(36).substring(10);
      const aiUserId = "AI";
      console.log("Creating AI game with ID:", gameId, "Difficulty:", difficulty || "medium");

      socket.join(gameId);
      const gameState = generateNewGameState(
        gameId,
        socket.userId,
        aiUserId,
        null, // No PVP numerical difficulty for AI
        null  // No time limit for AI
      );

      // Store AI difficulty in game state
      gameState.isAI = true;
      gameState.aiDifficulty = difficulty || "medium";

      redisClient.hSet("games", gameId, JSON.stringify(gameState));
      redisClient.hSet("users", user.id, gameId);

      socket.emit("game-start", JSON.stringify(gameState));
      console.log("AI game started:", gameState);

      // Publish to database
      publisher.publish(
        "game-start",
        JSON.stringify({ gameId, gameState })
      );
    }
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected");
    if (!socket.userId) {
      return;
    }
    await redisClient.lRem("online-users", 0, socket.userId);
    if (matchQueue.includes(socket)) {
      matchQueue = matchQueue.filter((user) => user !== socket);
    }
    if (socket.userId) {
      const gameId = await redisClient.hGet("users", socket.userId);
      setTimeout(async () => {
        var userIndex = await redisClient.lPos("online-users", socket.userId);
        console.log(userIndex);
        if (userIndex !== null) {
          console.log("User reconnected");
          return;
        }
        if (socket.userId) {
          if (gameId) {
            const gameState = JSON.parse(
              await redisClient.hGet("games", gameId)
            );
            if (gameState) {
              if (gameState.status !== "Completed") {
                const newGameState = {
                  ...gameState,
                  status: "Completed",
                  result: "Opponent Disconnection",
                  winner:
                    gameState.whiteUser === socket.userId
                      ? gameState.blackUser
                      : gameState.whiteUser,
                };
                publisher.publish(
                  "game-update",
                  JSON.stringify({ gameId, newGameState })
                );
                redisClient.hDel("games", gameId);
                redisClient.hDel("users", gameState.whiteUser);
                redisClient.hDel("users", gameState.blackUser);

                const timer = gameTimers.get(gameId);
                if (timer) {
                  clearTimeout(timer);
                  gameTimers.delete(gameId);
                }

                io.to(gameId).emit("game-update", JSON.stringify(newGameState));
              }
            }
          }
        }
      }, 1 * 60 * 1000);
    }
  });

  socket.on("move", async (data) => {
    const { move } = JSON.parse(data);
    const userId = socket.userId;
    if (!userId) {
      console.log("User not found");
      return;
    }
    const gameId = await redisClient.hGet("users", userId);
    if (!gameId) {
      console.log("Game not found");
      return;
    }
    console.log("Move:", move);
    console.log("Game State:", await redisClient.hGet("games", gameId));
    var game = JSON.parse(await redisClient.hGet("games", gameId));
    if (!game) {
      console.log("Game not found");
      return;
    }
    if (game.status === "Completed") {
      return socket.emit("invalid-move", "Game already completed");
    }
    if (game.whiteUser !== userId && game.blackUser !== userId) {
      console.log("User not in game");
      console.log(game);
      console.log(
        "White:",
        game.whiteUser,
        "Black:",
        game.blackUser,
        "User:",
        userId
      );
      return;
    }
    if (move === "resign") {
      const opponentId = game.whiteUser === userId ? game.blackUser : game.whiteUser;
      const newGameState = {
        ...game,
        boardState: game.boardState,
        status: "Completed",
        winner: opponentId,
        result: "Resignation",
      };

      // Notify opponent about resignation
      io.to(gameId).emit("player-resigned", JSON.stringify({ resignedPlayer: userId, winner: opponentId }));

      publisher.publish(
        "game-update",
        JSON.stringify({ gameId, newGameState })
      );
      redisClient.hDel("games", gameId);
      redisClient.hDel("users", game.whiteUser);
      redisClient.hDel("users", game.blackUser);

      const timer = gameTimers.get(gameId);
      if (timer) {
        clearTimeout(timer);
        gameTimers.delete(gameId);
      }

      io.to(gameId).emit("game-update", JSON.stringify(newGameState));
      return;
    }
    const userColor = game.whiteUser === userId ? "w" : "b";
    if (userColor !== game.boardState.split(" ")[1]) {
      console.log(
        "User color:",
        userColor,
        "Board color:",
        game.boardState.split(" ")[1]
      );
      return socket.emit("invalid-move", "Not your turn");
    }

    const chessGame = new chess.Chess();
    chessGame.load(game.boardState);
    console.log("Game:", chessGame.fen());
    try {
      chessGame.move(move);
      console.log("Move:", chessGame.history());
    } catch (e) {
      console.log("Invalid move:", e);
      return socket.emit("invalid-move", "Invalid move");
    }
    if (chessGame.isCheckmate()) {
      console.log("Checkmate");
      const winner = chessGame.turn() === "w" ? game.blackUser : game.whiteUser;
      game = {
        ...game,
        status: "Completed",
        winner: winner,
        result: "Checkmate",
      };
    }
    if (chessGame.isStalemate()) {
      console.log("Stalemate");
      game = {
        ...game,
        status: "Completed",
        result: "Stalemate",
      };
    }
    if (chessGame.isDraw()) {
      console.log("Draw");
      game = {
        ...game,
        status: "Completed",
        result: "Draw",
      };
    }
    console.log("Game:", chessGame.ascii());
    const newGameState = {
      ...game,
      boardState: chessGame.fen(),
      moves: [...game.moves, chessGame.history()[0]],
    };
    publisher.publish("game-update", JSON.stringify({ gameId, newGameState }));
    if (newGameState.status !== "Completed") {
      redisClient.hSet("games", gameId, JSON.stringify(newGameState));
    }
    if (newGameState.status === "Completed") {
      redisClient.hDel("games", gameId);
      redisClient.hDel("users", game.whiteUser);
      redisClient.hDel("users", game.blackUser);

      const timer = gameTimers.get(gameId);
      if (timer) {
        clearTimeout(timer);
        gameTimers.delete(gameId);
      }
    }
    io.to(gameId).emit("game-update", JSON.stringify(newGameState));

    // Auto-trigger AI move if this is an AI game and game is not completed
    if (newGameState.isAI && newGameState.status !== "Completed") {
      console.log("Triggering AI move for game:", gameId);

      // Give a small delay for better UX
      setTimeout(async () => {
        try {
          const currentGame = JSON.parse(await redisClient.hGet("games", gameId));
          if (!currentGame || currentGame.status === "Completed") {
            return;
          }

          const aiMove = await getAIMove(currentGame.boardState, currentGame.aiDifficulty);
          console.log("AI move:", aiMove);

          const aiChessGame = new chess.Chess();
          aiChessGame.load(currentGame.boardState);
          aiChessGame.move(aiMove);

          let updatedGame = { ...currentGame };

          // Check game end conditions
          if (aiChessGame.isCheckmate()) {
            console.log("AI Checkmate");
            const winner = aiChessGame.turn() === "w" ? currentGame.blackUser : currentGame.whiteUser;
            updatedGame = {
              ...updatedGame,
              status: "Completed",
              winner: winner,
              result: "Checkmate",
            };
          }
          if (aiChessGame.isStalemate()) {
            console.log("AI Stalemate");
            updatedGame = {
              ...updatedGame,
              status: "Completed",
              result: "Stalemate",
            };
          }
          if (aiChessGame.isDraw()) {
            console.log("AI Draw");
            updatedGame = {
              ...updatedGame,
              status: "Completed",
              result: "Draw",
            };
          }

          const aiGameState = {
            ...updatedGame,
            boardState: aiChessGame.fen(),
            moves: [...currentGame.moves, aiChessGame.history()[aiChessGame.history().length - 1]],
          };

          publisher.publish("game-update", JSON.stringify({ gameId, newGameState: aiGameState }));

          if (aiGameState.status !== "Completed") {
            redisClient.hSet("games", gameId, JSON.stringify(aiGameState));
          } else {
            redisClient.hDel("games", gameId);
            redisClient.hDel("users", currentGame.whiteUser);
            if (currentGame.blackUser !== "AI") {
              redisClient.hDel("users", currentGame.blackUser);
            }
          }

          io.to(gameId).emit("game-update", JSON.stringify(aiGameState));
        } catch (error) {
          console.error("AI move error:", error);
        }
      }, 500);
    }
  });

  socket.on("react", async (data) => {
    var userId = socket.userId;
    if (!data) {
      console.log("No reaction");
      return;
    }
    if (!userId) {
      console.log("User not found");
      return;
    }
    const gameId = await redisClient.hGet("users", userId);
    if (!gameId) {
      console.log("Game not found");
      return;
    }
    data = JSON.parse(data);
    data = {
      user: userId,
      reaction: data["reaction"],
    };
    console.log("Reaction:", data);
    io.to(gameId).emit("react", JSON.stringify(data));
  });

  socket.on("draw-request", async () => {
    const userId = socket.userId;
    if (!userId) return;
    const gameId = await redisClient.hGet("users", userId);
    if (!gameId) return;
    const game = JSON.parse(await redisClient.hGet("games", gameId));
    if (!game || game.status === "Completed") return;

    const opponentId = game.whiteUser === userId ? game.blackUser : game.whiteUser;
    if (opponentId === "AI") return; // AI doesn't handle draws yet

    // Notify opponent about draw request
    io.to(gameId).emit("draw-offer", JSON.stringify({ requesterId: userId }));

    socket.to(gameId).emit("draw-request", JSON.stringify({ requesterId: userId }));
    console.log(`Draw requested by ${userId} in game ${gameId}`);
  });

  socket.on("draw-response", async (data) => {
    const userId = socket.userId;
    if (!userId) return;
    const { accepted } = JSON.parse(data);
    const gameId = await redisClient.hGet("users", userId);
    if (!gameId) return;
    const game = JSON.parse(await redisClient.hGet("games", gameId));
    if (!game || game.status === "Completed") return;

    if (accepted) {
      const newGameState = {
        ...game,
        status: "Completed",
        winner: null,
        result: "Draw",
      };

      publisher.publish(
        "game-update",
        JSON.stringify({ gameId, newGameState })
      );

      redisClient.hDel("games", gameId);
      redisClient.hDel("users", game.whiteUser);
      redisClient.hDel("users", game.blackUser);

      const timer = gameTimers.get(gameId);
      if (timer) {
        clearTimeout(timer);
        gameTimers.delete(gameId);
      }

      io.to(gameId).emit("game-update", JSON.stringify(newGameState));
      console.log(`Game ${gameId} ended as Draw (Accepted)`);
    } else {
      socket.to(gameId).emit("draw-rejected", JSON.stringify({ responderId: userId }));
      console.log(`Draw request in game ${gameId} was rejected by ${userId}`);
    }
  });
});

const handleGameTimeout = async (gameId) => {
  const gameStr = await redisClient.hGet("games", gameId);
  if (!gameStr) return;

  const game = JSON.parse(gameStr);
  if (game.status === "Completed") return;

  console.log(`Game ${gameId} timed out.`);

  // Determine winner based on whose turn it is
  // FEN format: "board turn castling enpassant halfmove fullmove"
  const turn = game.boardState.split(" ")[1];
  const winner = turn === "w" ? game.blackUser : game.whiteUser;

  const newGameState = {
    ...game,
    status: "Completed",
    winner: winner,
    result: "Timeout",
  };

  publisher.publish(
    "game-update",
    JSON.stringify({ gameId, newGameState })
  );

  redisClient.hDel("games", gameId);
  redisClient.hDel("users", game.whiteUser);
  redisClient.hDel("users", game.blackUser);
  gameTimers.delete(gameId);

  io.to(gameId).emit("game-update", JSON.stringify(newGameState));
};

publisher.connect();
subscriber.connect();
redisClient.connect();

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const SOCKET_PORT = process.env.SOCKET_PORT || 4100;
server.listen(SOCKET_PORT, () => {
  console.log(`Socket server is running on http://localhost:${SOCKET_PORT}`);
});

subscriber.subscribe("game-update", async function (message, channel) {
  const { gameId, newGameState } = JSON.parse(message);
  try {
    const game = await prisma.game.update({
      where: {
        id: gameId,
      },
      data: {
        boardState: newGameState.boardState,
        moves: newGameState.moves,
        status: newGameState.status,
        winnerId: newGameState.winner === "AI" ? null : (newGameState.winner || null),
        result: newGameState.result || null,
      },
    });
  } catch (e) {
    console.log(e);
  }
});

subscriber.subscribe("game-start", async function (message, channel) {
  const { gameId, gameState } = JSON.parse(message);
  try {
    const game = await prisma.game.create({
      data: {
        id: gameId,
        whiteUserId: gameState.whiteUser,
        blackUserId: gameState.blackUser === "AI" ? null : gameState.blackUser,
        boardState: gameState.boardState,
        moves: gameState.moves,
        status: "In Progress",
        difficulty: (gameState.difficulty !== undefined && gameState.difficulty !== null && !isNaN(parseInt(gameState.difficulty))) ? parseInt(gameState.difficulty) : null,
        timeLimit: parseFloat(gameState.timeLimit) || 0,
      },
    });
  } catch (e) {
    console.log(e);
  }
});
