// server.js - Backend with User Authentication
// Install dependencies: npm install express socket.io cors sqlite3 body-parser uuid

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
	origin: "*",
	methods: ["GET", "POST"]
  }
});

// Initialize SQLite database
const db = new sqlite3.Database('./chinese_tiles.db', (err) => {
  if (err) {
	console.error('Database connection error:', err);
  } else {
	console.log('Connected to SQLite database');
  }
});

// Create tables
db.serialize(() => {
  // Users table
  db.run(`
	CREATE TABLE IF NOT EXISTS users (
	  user_id TEXT PRIMARY KEY,
	  firebase_uid TEXT UNIQUE NOT NULL,
	  email TEXT NOT NULL,
	  username TEXT NOT NULL,
	  photo_url TEXT,
	  created_at INTEGER NOT NULL,
	  last_login INTEGER NOT NULL,
	  games_played INTEGER DEFAULT 0,
	  games_won INTEGER DEFAULT 0,
	  games_lost INTEGER DEFAULT 0
	)
  `, (err) => {
	if (err) console.error('Error creating users table:', err);
	else console.log('Users table ready');
  });

  // Rooms table
  db.run(`
	CREATE TABLE IF NOT EXISTS rooms (
	  room_id TEXT PRIMARY KEY,
	  status TEXT NOT NULL,
	  created_by_user_id TEXT,
	  created_at INTEGER NOT NULL,
	  started_at INTEGER,
	  ended_at INTEGER,
	  winner TEXT,
	  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
	)
  `, (err) => {
	if (err) console.error('Error creating rooms table:', err);
	else console.log('Rooms table ready');
  });

  // Players table (updated with user_id)
  db.run(`
	CREATE TABLE IF NOT EXISTS players (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  room_id TEXT NOT NULL,
	  user_id TEXT NOT NULL,
	  socket_id TEXT NOT NULL,
	  player_id TEXT NOT NULL,
	  player_symbol TEXT NOT NULL,
	  joined_at INTEGER NOT NULL,
	  FOREIGN KEY (room_id) REFERENCES rooms(room_id),
	  FOREIGN KEY (user_id) REFERENCES users(user_id)
	)
  `, (err) => {
	if (err) console.error('Error creating players table:', err);
	else console.log('Players table ready');
  });

  // Game moves table
  db.run(`
	CREATE TABLE IF NOT EXISTS game_moves (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  room_id TEXT NOT NULL,
	  move_number INTEGER NOT NULL,
	  player_symbol TEXT NOT NULL,
	  board_state TEXT NOT NULL,
	  game_phase TEXT NOT NULL,
	  timestamp INTEGER NOT NULL,
	  FOREIGN KEY (room_id) REFERENCES rooms(room_id)
	)
  `, (err) => {
	if (err) console.error('Error creating game_moves table:', err);
	else console.log('Game moves table ready');
  });
});

// In-memory store
const activeRooms = new Map();
const matchmakingQueue = [];
const userSockets = new Map(); // Map user_id to socket

console.log('Server initializing...');

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============== USER MANAGEMENT API ==============

// Register or login user
app.post('/api/auth/login', (req, res) => {
  const { firebaseUid, email, displayName, photoURL } = req.body;

  console.log('Login attempt:', email);

  if (!firebaseUid || !email || !displayName) {
	return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check if user exists
  db.get(
	'SELECT * FROM users WHERE firebase_uid = ?',
	[firebaseUid],
	(err, user) => {
	  if (err) {
		console.error('Database error:', err);
		return res.status(500).json({ error: 'Database error' });
	  }

	  if (user) {
		// Update last login
		console.log('users exists')
		const now = Date.now();
		db.run(
		  'UPDATE users SET last_login = ?, photo_url = ? WHERE firebase_uid = ?',
		  [now, photoURL, firebaseUid],
		  (err) => {
			if (err) {
			  console.error('Error updating user:', err);
			  return res.status(500).json({ error: 'Update failed' });
			}
			console.log('User logged in:', email);
			res.json({
			  userId: user.user_id,
			  email: user.email,
			  username: user.username,
			  photoUrl: photoURL || user.photo_url,
			  gamesPlayed: user.games_played,
			  gamesWon: user.games_won,
			  gamesLost: user.games_lost
			});
		  }
		);
	  } else {
		// Create new user
		const userId = uuidv4();
		const now = Date.now();

		db.run(
		  `INSERT INTO users (user_id, firebase_uid, email, username, photo_url, created_at, last_login)
		   VALUES (?, ?, ?, ?, ?, ?, ?)`,
		  [userId, firebaseUid, email, displayName, photoURL, now, now],
		  (err) => {
			if (err) {
			  console.error('Error creating user:', err);
			  return res.status(500).json({ error: 'User creation failed' });
			}
			console.log('New user created:', email, 'ID:', userId);
			res.json({
			  userId,
			  email,
			  username: displayName,
			  photoUrl: photoURL,
			  gamesPlayed: 0,
			  gamesWon: 0,
			  gamesLost: 0
			});
		  }
		);
	  }
	}
  );
});

// Get user profile
app.get('/api/users/:firebaseUid', (req, res) => {
  const { firebaseUid } = req.params;

  console.log('Fetching user profile:', firebaseUid);

  db.get(
	'SELECT user_id, email, username, photo_url, games_played, games_won, games_lost, created_at FROM users WHERE firebase_uid = ?',
	[firebaseUid],
	(err, user) => {
	  if (err) {
		console.error('Database error:', err);
		return res.status(500).json({ error: 'Database error' });
	  }
	  if (!user) {
		return res.status(404).json({ error: 'User not found' });
	  }
	  res.json({
		user_id: user.user_id,
		email: user.email,
		username: user.username,
		photoUrl: user.photo_url,
		gamesPlayed: user.games_played,
		gamesWon: user.games_won,
		gamesLost: user.games_lost
	  });
	}
  );
});

// Update username
app.put('/api/users/:userId/username', (req, res) => {
  const { userId } = req.params;
  const { username } = req.body;

  console.log('Updating username for:', userId, 'to:', username);

  if (!username || username.length < 3) {
	return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  db.run(
	'UPDATE users SET username = ? WHERE user_id = ?',
	[username, userId],
	function(err) {
	  if (err) {
		console.error('Error updating username:', err);
		return res.status(500).json({ error: 'Update failed' });
	  }
	  if (this.changes === 0) {
		return res.status(404).json({ error: 'User not found' });
	  }
	  console.log('Username updated successfully');
	  res.json({ success: true, username });
	}
  );
});

// Setup user profile (initial setup)
app.post('/api/user/setup', (req, res) => {
  const { userId, username } = req.body;

  console.log('User setup attempt for:', userId);

  if (!userId || !username) {
	return res.status(400).json({ error: 'Missing userId or username' });
  }

  if (username.length < 3) {
	return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  const photoUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(username)}`;

  db.run(
	'UPDATE users SET username = ?, photo_url = ? WHERE user_id = ?',
	[username, photoUrl, userId],
	function(err) {
	  if (err) {
		console.error('Error during user setup:', err);
		return res.status(500).json({ error: 'Setup failed' });
	  }
	  if (this.changes === 0) {
		return res.status(404).json({ error: 'User not found' });
	  }

	  // Fetch and return updated user profile
	  db.get(
		'SELECT user_id, email, username, photo_url, games_played, games_won, games_lost, created_at FROM users WHERE user_id = ?',
		[userId],
		(err, user) => {
		  if (err) {
			console.error('Error fetching user after setup:', err);
			return res.status(500).json({ error: 'Failed to retrieve user profile' });
		  }
		  console.log('User setup completed:', userId, user.photo_url);
		  res.json({ success: true, user });
		}
	  );
	}
  );
});

// Update win stats endpoint
app.post('/api/update_win', (req, res) => {
  const { userId } = req.body;

  console.log('Updating win stats for user:', userId);

  if (!userId) {
	return res.status(400).json({ error: 'User ID is required' });
  }

  db.run(
	`UPDATE users
	 SET games_played = games_played + 1,
		 games_won = games_won + 1
	 WHERE firebase_uid = ?`,
	[userId],
	(err) => {
	  if (err) {
		console.error('Error updating win stats:', userId, err);
		return res.status(500).json({ error: 'Failed to update stats' });
	  } else {
		console.log('Win stats updated:', userId);
		res.json({ success: true, message: 'Win stats updated' });
	  }
	}
  );
});

// Update lost stats endpoint
app.post('/api/update_lost', (req, res) => {
  const { userId } = req.body;

  console.log('Updating lost stats for user:', userId);

  if (!userId) {
	return res.status(400).json({ error: 'User ID is required' });
  }

  db.run(
	`UPDATE users
	 SET games_played = games_played + 1,
		 games_lost = games_lost + 1
	 WHERE firebase_uid = ?`,
	[userId],
	(err) => {
	  if (err) {
		console.error('Error updating lost stats:', userId, err);
		return res.status(500).json({ error: 'Failed to update stats' });
	  } else {
		console.log('Lost stats updated:', userId);
		res.json({ success: true, message: 'Lost stats updated' });
	  }
	}
  );
});

// Update game stats
function updateUserStats(userId, won) {
  return new Promise((resolve, reject) => {
	const incrementWon = won ? 1 : 0;
	const incrementLost = won ? 0 : 1;

	db.run(
	  `UPDATE users
	   SET games_played = games_played + 1,
		   games_won = games_won + ?,
		   games_lost = games_lost + ?
	   WHERE firebase_uid = ?`,
	  [incrementWon, incrementLost, userId],
	  (err) => {
		if (err) {
		  console.error('Error updating user stats:', err);
		  reject(err);
		} else {
		  console.log('Stats updated for user:', userId, 'Won:', won);
		  resolve();
		}
	  }
	);
  });
}

// ============== DATABASE HELPERS ==============

function saveRoomToDB(roomId, status, createdByUserId) {
  return new Promise((resolve, reject) => {
	const now = Date.now();
	db.run(
	  `INSERT INTO rooms (room_id, status, created_by_user_id, created_at) VALUES (?, ?, ?, ?)`,
	  [roomId, status, createdByUserId, now],
	  (err) => {
		if (err) {
		  console.error('Error saving room to DB:', err);
		  reject(err);
		} else {
		  console.log('Room saved to DB:', roomId);
		  resolve();
		}
	  }
	);
  });
}

function updateRoomStatus(roomId, status, additionalData = {}) {
  return new Promise((resolve, reject) => {
	let query = 'UPDATE rooms SET status = ?';
	const params = [status];

	if (additionalData.winner) {
	  query += ', winner = ?, ended_at = ?';
	  params.push(additionalData.winner, Date.now());
	} else if (status === 'active') {
	  query += ', started_at = ?';
	  params.push(Date.now());
	}

	query += ' WHERE room_id = ?';
	params.push(roomId);

	db.run(query, params, (err) => {
	  if (err) {
		console.error('Error updating room status:', err);
		reject(err);
	  } else {
		console.log('Room status updated:', roomId, status);
		resolve();
	  }
	});
  });
}

function savePlayerToDB(roomId, userId, socketId, playerId, playerSymbol) {
  return new Promise((resolve, reject) => {
	db.run(
	  `INSERT INTO players (room_id, user_id, socket_id, player_id, player_symbol, joined_at)
	   VALUES (?, ?, ?, ?, ?, ?)`,
	  [roomId, userId, socketId, playerId, playerSymbol, Date.now()],
	  (err) => {
		if (err) {
		  console.error('Error saving player to DB:', err);
		  reject(err);
		} else {
		  console.log('Player saved to DB:', playerId, 'User:', userId, 'in room', roomId);
		  resolve();
		}
	  }
	);
  });
}

function saveMoveToDB(roomId, moveNumber, playerSymbol, boardState, gamePhase) {
  return new Promise((resolve, reject) => {
	db.run(
	  `INSERT INTO game_moves (room_id, move_number, player_symbol, board_state, game_phase, timestamp)
	   VALUES (?, ?, ?, ?, ?, ?)`,
	  [roomId, moveNumber, playerSymbol, JSON.stringify(boardState), gamePhase, Date.now()],
	  (err) => {
		if (err) {
		  console.error('Error saving move to DB:', err);
		  reject(err);
		} else {
		  console.log('Move saved to DB for room:', roomId);
		  resolve();
		}
	  }
	);
  });
}

// ============== MATCHMAKING ==============

function tryMatchmaking() {
  console.log('Checking matchmaking queue. Current size:', matchmakingQueue.length);

  if (matchmakingQueue.length >= 2) {
	const player1 = matchmakingQueue.shift();
	const player2 = matchmakingQueue.shift();

	const roomId = generateRoomId();

	console.log('Matchmaking: Pairing players', player1.userId, 'and', player2.userId);

	const room = {
	  roomId,
	  players: [
		{ socketId: player1.socketId, userId: player1.userId, playerId: 'player1', playerSymbol: 'X', username: player1.username },
		{ socketId: player2.socketId, userId: player2.userId, playerId: 'player2', playerSymbol: 'O', username: player2.username }
	  ],
	  gameState: {
		board: Array(9).fill(null),
		currentPlayer: 'X',
		gamePhase: 'placement',
		piecesPlaced: { X: 0, O: 0 }
	  },
	  moveCount: 0,
	  createdAt: Date.now()
	};

	activeRooms.set(roomId, room);

	saveRoomToDB(roomId, 'active', player1.userId).then(() => {
	  savePlayerToDB(roomId, player1.userId, player1.socketId, 'player1', 'X');
	  savePlayerToDB(roomId, player2.userId, player2.socketId, 'player2', 'O');
	  updateRoomStatus(roomId, 'active');
	});

	player1.socket.join(roomId);
	player2.socket.join(roomId);

	player1.socket.emit('matchFound', {
	  roomId,
	  playerId: 'player1',
	  playerSymbol: 'X',
	  opponent: player2.username
	});

	player2.socket.emit('matchFound', {
	  roomId,
	  playerId: 'player2',
	  playerSymbol: 'O',
	  opponent: player1.username
	});

	io.to(roomId).emit('gameStart', { currentPlayer: 'X' });

	console.log('Match created. Room:', roomId);
  }
}

// ============== SOCKET.IO HANDLERS ==============

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Authenticate socket with user
  socket.on('authenticate', ({ userId, username }) => {
	console.log('Socket authenticated:', socket.id, 'User:', userId);
	socket.userId = userId;
	socket.username = username;
	userSockets.set(userId, socket);
  });

  // Create a private room
  socket.on('createRoom', () => {
	if (!socket.userId) {
	  socket.emit('error', { message: 'Not authenticated' });
	  return;
	}

	const roomId = generateRoomId();
	const playerId = 'player1';
	const playerSymbol = 'X';

	const room = {
	  roomId,
	  players: [{
		socketId: socket.id,
		userId: socket.userId,
		playerId,
		playerSymbol,
		username: socket.username
	  }],
	  gameState: {
		board: Array(9).fill(null),
		currentPlayer: 'X',
		gamePhase: 'placement',
		piecesPlaced: { X: 0, O: 0 }
	  },
	  moveCount: 0,
	  createdAt: Date.now()
	};

	activeRooms.set(roomId, room);
	socket.join(roomId);

	saveRoomToDB(roomId, 'waiting', socket.userId).then(() => {
	  savePlayerToDB(roomId, socket.userId, socket.id, playerId, playerSymbol);
	});

	console.log('Private room created:', roomId, 'by user:', socket.userId);

	socket.emit('roomCreated', { roomId, playerId, playerSymbol });
  });

  // Join matchmaking queue
  socket.on('joinMatchmaking', () => {
	if (!socket.userId) {
	  socket.emit('error', { message: 'Not authenticated' });
	  return;
	}

	console.log('Player joining matchmaking:', socket.userId);

	const alreadyInQueue = matchmakingQueue.some(p => p.userId === socket.userId);

	if (alreadyInQueue) {
	  console.log('Player already in matchmaking queue:', socket.userId);
	  return;
	}

	matchmakingQueue.push({
	  socketId: socket.id,
	  userId: socket.userId,
	  username: socket.username,
	  socket
	});

	socket.emit('matchmakingJoined', { position: matchmakingQueue.length });

	console.log('Player added to matchmaking. Queue size:', matchmakingQueue.length);

	tryMatchmaking();
  });

  // Leave matchmaking queue
  socket.on('leaveMatchmaking', () => {
	const index = matchmakingQueue.findIndex(p => p.userId === socket.userId);
	if (index !== -1) {
	  matchmakingQueue.splice(index, 1);
	  console.log('Player left matchmaking:', socket.userId, 'Queue size:', matchmakingQueue.length);
	  socket.emit('matchmakingLeft');
	}
  });

  // Join an existing private room
  socket.on('joinRoom', ({ roomId }) => {
	if (!socket.userId) {
	  socket.emit('error', { message: 'Not authenticated' });
	  return;
	}

	const room = activeRooms.get(roomId);

	console.log('Join room attempt:', roomId, 'by user:', socket.userId);

	if (!room) {
	  console.log('Room not found:', roomId);
	  socket.emit('error', { message: 'Room not found' });
	  return;
	}

	if (room.players.length >= 2) {
	  console.log('Room full:', roomId);
	  socket.emit('error', { message: 'Room is full' });
	  return;
	}

	const playerId = 'player2';
	const playerSymbol = 'O';

	room.players.push({
	  socketId: socket.id,
	  userId: socket.userId,
	  playerId,
	  playerSymbol,
	  username: socket.username
	});

	socket.join(roomId);

	savePlayerToDB(roomId, socket.userId, socket.id, playerId, playerSymbol).then(() => {
	  updateRoomStatus(roomId, 'active');
	});

	console.log('Player joined room:', roomId, 'User:', socket.userId);

	socket.emit('roomJoined', {
	  roomId,
	  playerId,
	  playerSymbol,
	  opponent: room.players[0].username
	});

	// Notify player 1 about opponent
	io.to(room.players[0].socketId).emit('opponentJoined', {
	  opponent: socket.username
	});

	io.to(roomId).emit('gameStart', { currentPlayer: room.gameState.currentPlayer });

	console.log('Game started in room:', roomId);
  });

  // Handle game moves
  socket.on('makeMove', (data) => {
	const { roomId, board, currentPlayer, gamePhase, piecesPlaced, animateCell } = data;
	const room = activeRooms.get(roomId);

	if (!room) {
	  console.log('Room not found for move:', roomId);
	  return;
	}

	room.gameState = { board, currentPlayer, gamePhase, piecesPlaced };
	room.moveCount++;

	console.log('Move made in room:', roomId, 'by user:', socket.userId, 'Move #', room.moveCount);

	const playerSymbol = currentPlayer === 'X' ? 'O' : 'X';
	saveMoveToDB(roomId, room.moveCount, playerSymbol, board, gamePhase);

	const winner = checkWinner(board);
	if (winner) {
	  console.log('Winner detected in room:', roomId, 'Winner:', winner);
	  updateRoomStatus(roomId, 'finished', { winner });

	  // Update player stats
	  room.players.forEach(player => {
		const won = player.playerSymbol === winner;
		updateUserStats(player.userId, won);
	  });
	}

	io.to(roomId).emit('moveMade', {
	  board,
	  currentPlayer,
	  gamePhase,
	  piecesPlaced,
	  animateCell
	});
  });

  // Handle disconnection
  socket.on('disconnect', () => {
	console.log('Client disconnected:', socket.id, 'User:', socket.userId);

	if (socket.userId) {
	  userSockets.delete(socket.userId);
	}

	const queueIndex = matchmakingQueue.findIndex(p => p.socketId === socket.id);
	if (queueIndex !== -1) {
	  matchmakingQueue.splice(queueIndex, 1);
	  console.log('Player removed from matchmaking queue');
	}

	for (const [roomId, room] of activeRooms.entries()) {
	  const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

	  if (playerIndex !== -1) {
		console.log('Player left room:', roomId);
		socket.to(roomId).emit('playerLeft');
		updateRoomStatus(roomId, 'abandoned');
		activeRooms.delete(roomId);
		console.log('Room deleted:', roomId);
		break;
	  }
	}
  });
});

// Helper function to check for winner
function checkWinner(board) {
  const winningCombos = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6]
  ];

  for (let combo of winningCombos) {
	const [a, b, c] = combo;
	if (board[a] && board[a] === board[b] && board[a] === board[c]) {
	  return board[a];
	}
  }
  return null;
}

// Cleanup old rooms
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const cutoffTime = now - ONE_DAY;

  db.run(
	`DELETE FROM rooms WHERE created_at < ? AND status != 'active'`,
	[cutoffTime],
	function(err) {
	  if (err) {
		console.error('Error cleaning up old rooms:', err);
	  } else if (this.changes > 0) {
		console.log('Cleaned up', this.changes, 'old rooms from database');
	  }
	}
  );
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Waiting for connections...');
});

// ============== API ENDPOINTS ==============

app.get('/health', (req, res) => {
  res.json({
	status: 'ok',
	activeRooms: activeRooms.size,
	matchmakingQueue: matchmakingQueue.length,
	connectedUsers: userSockets.size,
	timestamp: new Date().toISOString()
  });
});

app.get('/rooms', (req, res) => {
  const roomsList = Array.from(activeRooms.entries()).map(([id, room]) => ({
	roomId: id,
	players: room.players.length,
	gamePhase: room.gameState.gamePhase,
	moveCount: room.moveCount
  }));
  res.json({ rooms: roomsList });
});

app.get('/stats', (req, res) => {
  db.all(
	`SELECT
	  COUNT(*) as total_games,
	  SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as completed_games,
	  SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) as abandoned_games,
	  SUM(CASE WHEN winner = 'X' THEN 1 ELSE 0 END) as x_wins,
	  SUM(CASE WHEN winner = 'O' THEN 1 ELSE 0 END) as o_wins
	FROM rooms`,
	[],
	(err, rows) => {
	  if (err) {
		res.status(500).json({ error: err.message });
	  } else {
		res.json(rows[0]);
	  }
	}
  );
});

app.get('/room/:roomId/history', (req, res) => {
  const { roomId } = req.params;

  db.all(
	`SELECT * FROM game_moves WHERE room_id = ? ORDER BY move_number ASC`,
	[roomId],
	(err, rows) => {
	  if (err) {
		res.status(500).json({ error: err.message });
	  } else {
		const moves = rows.map(row => ({
		  ...row,
		  board_state: JSON.parse(row.board_state)
		}));
		res.json({ roomId, moves });
	  }
	}
  );
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  console.log('Fetching leaderboard...');

  db.all(
	`SELECT user_id, username, photo_url, games_played, games_won, games_lost,
			ROUND(CAST(games_won AS FLOAT) / NULLIF(games_played, 0) * 100, 1) as win_rate
	 FROM users
	 WHERE games_played > 0
	 ORDER BY games_won DESC, win_rate DESC
	 LIMIT 100`,
	[],
	(err, rows) => {
	  if (err) {
		console.error('Error fetching leaderboard:', err);
		res.status(500).json({ error: err.message });
	  } else {
		console.log('Leaderboard fetched:', rows.length, 'users');
		res.json(rows);
	  }
	}
  );
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
	if (err) {
	  console.error('Error closing database:', err);
	} else {
	  console.log('Database connection closed');
	}
	process.exit(0);
  });
});