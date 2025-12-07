import { useState, useEffect } from 'react';
import { Copy, Check, LogOut, User, Send } from 'lucide-react';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';

import { signInWithGoogle, signOutUser, onAuthStateChange } from './firebaseConfig';
import type {
  AppGameState,
  BackendUser,
  FirebaseAuthUser,
  PlayerSymbol,
  GamePhase,
  Board,
} from './types';

// API Configuration
const API_URL = 'https://chinese-tiles.onrender.com:10000';

export default function ChineseTilesMultiplayer() {
  // Auth state
  const [user, setUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
    
  // Lobby state
  // Added 'profileSetup'
  const [gameState, setGameState] = useState<AppGameState>('login');
  const [roomId, setRoomId] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerSymbol, setPlayerSymbol] = useState<PlayerSymbol | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [queuePosition, setQueuePosition] = useState<number>(0);
    
  // Game state
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<PlayerSymbol>('X');
  const [gamePhase, setGamePhase] = useState<GamePhase>('placement');
  const [piecesPlaced, setPiecesPlaced] = useState<Record<PlayerSymbol, number>>({ X: 0, O: 0 });
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [winner, setWinner] = useState<PlayerSymbol | null>(null);
  const [animatingCells, setAnimatingCells] = useState<Set<number>>(new Set());
  const [winningLine, setWinningLine] = useState<number[]>([]);
  const [invalidMove, setInvalidMove] = useState<number | null>(null);

  // Profile Setup state
  const [newUsername, setNewUsername] = useState<string>('');
  const [usernameError, setUsernameError] = useState<string>('');
    
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  console.log('Component state:', { user: user?.email, gameState, roomId, playerId, playerSymbol });

  // Helper to generate DiceBear avatar URL
  const generateAvatarUrl = (seed?: string) => {
    // We use the pixel-art style for simplicity
    return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed || 'default')}`;
  };

  // Check user setup status after login
  useEffect(() => {
    if (user) {
      // Check if the user needs to set up their profile (e.g., if it's their first login)
      // This 'needsSetup' property would come from your backend login response.
      if (user.needsSetup) {
        setGameState('profileSetup');
        setNewUsername(user.username || ''); // Pre-fill if a temporary name exists
      } else {
        setGameState('menu');
      }
    }
  }, [user]);

  // Initialize Firebase auth listener
  useEffect(() => {
    console.log('Setting up Firebase auth listener');
    
    // Uncomment this when Firebase is configured:

    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        console.log('Firebase user detected:', firebaseUser.email);

        // if user is logged in, no need to login him, just fetch his stats

        await fetchPlayer(firebaseUser.uid);
      } else {
        console.log('No Firebase user');
        setUser(null);
        setGameState('login');
        setLoading(false);
      }
    });
    
    return () => unsubscribe();

  }, []);

  // Fetch player data from backend
  const fetchPlayer = async (firebaseUid: string) => {
    try {
      console.log('Fetching player data for UID:', firebaseUid);
      const response = await fetch(`${API_URL}/api/users/${firebaseUid}`);
      if (!response.ok) throw new Error('Failed to fetch user data');
      const userData = await response.json();
      console.log('Player data fetched:', userData);
      setUser({
        ...userData,
        userId: userData.userId ?? userData.id ?? firebaseUid,
        photoUrl: userData.photoUrl ?? null,
        email: userData.email ?? null,
      } as BackendUser);
      setLoading(false);
      setGameState('menu');
    } catch (error) {
      console.error('Error fetching player data:', error);
      setUser(null);
      setGameState('login');
      setLoading(false);
    }
  };

  // Login user to backend
  const loginUser = async (firebaseUser: FirebaseAuthUser) => {
    try {
      console.log('Logging in user to backend:', firebaseUser.email);
      
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        })
      });

      if (!response.ok) throw new Error('Login failed');

      const userData = await response.json();
      console.log('Backend login successful:', userData);

      console.log(userData.username === firebaseUser.displayName || !userData.username ? 'user needs setup' : 'no needsSetup flag from backend');
      
      setUser({
        ...userData,
        userId: userData.userId ?? userData.id ?? firebaseUser.uid,
        photoUrl: userData.photoUrl ?? firebaseUser.photoURL ?? null,
        email: userData.email ?? firebaseUser.email ?? null,
        // Assuming backend sets this flag
        needsSetup: userData.username === firebaseUser.displayName || !userData.username,
      } as BackendUser);
      setLoading(false);
    } catch (error) {
      console.error('Error logging in:', error);
      setLoading(false);
    }
  };
  
  // Update user profile function (Mocked)
  const updateUserProfile = async () => {
    if (newUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters long.');
      return;
    }
    
    // Mock backend call
    console.log(`Submitting profile setup for user ${user?.userId} with username: ${newUsername}`);
    
    try {
        const response = await fetch(`${API_URL}/api/user/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user?.userId, username: newUsername })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update profile.');
        }
        
        // Mock success update
        setUser(prevUser => ({
          ...(prevUser ?? {}),
          username: newUsername,
          photoUrl: generateAvatarUrl(newUsername),
          needsSetup: false, // Profile setup complete
        } as BackendUser));
        setUsernameError('');
        setGameState('menu');

    } catch (error) {
        console.error('Error setting up profile:', error);
        setUsernameError(error instanceof Error ? error.message : 'An error occurred');
    }
  };


  // Initialize socket connection
  useEffect(() => {
    if (!user || user.needsSetup) return;

    console.log('Initializing socket connection for user:', user.userId);

    const socketClient: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL);
    setSocket(socketClient);

    socketClient.emit('authenticate', {
      userId: user.userId,
      username: user.username || '',
    });

    socketClient.on('matchmakingJoined', (data) => {
      console.log('Matchmaking joined:', data);
      setQueuePosition(data.position);
      setGameState('matchmaking');
    });

    socketClient.on('matchmakingLeft', () => {
      console.log('Matchmaking left');
      setGameState('menu');
    });

    socketClient.on('matchFound', (data) => {
      console.log('Match found:', data);
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setPlayerSymbol(data.playerSymbol as PlayerSymbol);
      setOpponent(data.opponent);
      setGameState('playing');
    });

    socketClient.on('roomCreated', (data) => {
      console.log('Room created:', data);
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setPlayerSymbol(data.playerSymbol as PlayerSymbol);
      setGameState('waiting');
    });

    socketClient.on('roomJoined', (data) => {
      console.log('Room joined:', data);
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setPlayerSymbol(data.playerSymbol as PlayerSymbol);
      setOpponent(data.opponent);
      setGameState('playing');
    });

    socketClient.on('opponentJoined', (data) => {
      console.log('Opponent joined:', data);
      setOpponent(data.opponent);
    });

    socketClient.on('gameStart', (data) => {
      console.log('Game start:', data);
      setGameState('playing');
      setCurrentPlayer(data.currentPlayer as PlayerSymbol);
    });

    socketClient.on('moveMade', (data) => {
      console.log('Move made:', data);
      setBoard(data.board as Board);
      setCurrentPlayer(data.currentPlayer as PlayerSymbol);
      setGamePhase(data.gamePhase as GamePhase);
      setPiecesPlaced(data.piecesPlaced);
      setSelectedPiece(null);
      if (data.animateCell !== undefined) {
        animateCell(data.animateCell);
      }
    });

    socketClient.on('playerLeft', () => {
      console.log('Player left');
      alert('Opponent left the game');
      resetToMenu();
    });

    socketClient.on('error', (data) => {
      console.error('Socket error:', data);
      alert(data.message);
    });

    return () => {
      socketClient.disconnect();
    };
  }, [user]);


  // Check for winner
  useEffect(() => {
    const winningCombos = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    for (const combo of winningCombos) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        setWinner(board[a]);
        setWinningLine(combo);
        console.log('Winner found:', board[a]);
        return;
      }
    }
  }, [board]);

  // Update stats when game ends
  useEffect(() => {
    if (winner && user && roomId && playerId && playerSymbol) {
      console.log('Updating stats for game end. Winner:', winner);
      
      const updateStats = async () => {
        try {
          const isWinner = winner === playerSymbol;
          const endpoint = isWinner ? '/api/update_win' : '/api/update_lost';

          console.log("Sending stats update to backend:", { userId: user.userId, endpoint });
          
          const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.userId })
          });

          if (!response.ok) {
            throw new Error('Failed to update stats');
          }

          const data = await response.json();
          console.log('Stats updated:', data);
        } catch (error) {
          console.error('Error updating stats:', error);
        }
      };

      updateStats();
    }
  }, [winner, user, roomId, playerId, playerSymbol]);

  const isAdjacent = (from: number, to: number) => {
    const fromRow = Math.floor(from / 3);
    const fromCol = from % 3;
    const toRow = Math.floor(to / 3);
    const toCol = to % 3;
    
    const rowDiff = Math.abs(fromRow - toRow);
    const colDiff = Math.abs(fromCol - toCol);
    
    const adjacent = rowDiff <= 1 && colDiff <= 1 && (rowDiff + colDiff > 0);
    console.log('Adjacency check:', from, 'to', to, '=', adjacent);
    return adjacent;
  };

  const animateCell = (index: number) => {
    setAnimatingCells(prev => new Set([...prev, index]));
    setTimeout(() => {
      setAnimatingCells(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 400);
  };

  const showInvalidMove = (index: number) => {
    setInvalidMove(index);
    setTimeout(() => setInvalidMove(null), 500);
  };

  const handleCellClick = (index: number) => {
    console.log('Cell clicked:', index);
    
    if (winner || currentPlayer !== playerSymbol) {
      console.log('Not your turn or game ended');
      return;
    }

    if (gamePhase === 'placement') {
      if (board[index] !== null) return;
      
      const newBoard = [...board];
      newBoard[index] = currentPlayer;
      const newPiecesPlaced = { ...piecesPlaced };
      newPiecesPlaced[currentPlayer]++;
      
      const newGamePhase = (newPiecesPlaced.X === 3 && newPiecesPlaced.O === 3) ? 'movement' : 'placement';
      const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';
      
      console.log('Placing piece at:', index);
      
      socket?.emit('makeMove', {
        roomId,
        board: newBoard,
        currentPlayer: nextPlayer,
        gamePhase: newGamePhase,
        piecesPlaced: newPiecesPlaced,
        animateCell: index
      });
      
      setBoard(newBoard);
      setCurrentPlayer(nextPlayer);
      setGamePhase(newGamePhase);
      setPiecesPlaced(newPiecesPlaced);
      animateCell(index);
    } else if (gamePhase === 'movement') {
      if (selectedPiece === null) {
        if (board[index] === currentPlayer) {
          setSelectedPiece(index);
          console.log('Piece selected:', index);
        }
      } else {
        if (board[index] === null) {
          if (isAdjacent(selectedPiece, index)) {
            const newBoard = [...board];
            newBoard[selectedPiece] = null;
            newBoard[index] = currentPlayer;
            const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';
            
            console.log('Moving piece from', selectedPiece, 'to', index);
            
            socket?.emit('makeMove', {
              roomId,
              board: newBoard,
              currentPlayer: nextPlayer,
              gamePhase: 'movement',
              piecesPlaced,
              animateCell: index
            });
            
            setBoard(newBoard);
            setCurrentPlayer(nextPlayer);
            setSelectedPiece(null);
            animateCell(index);
          } else {
            console.log('Invalid move: not adjacent');
            showInvalidMove(index);
          }
        } else if (board[index] === currentPlayer) {
          setSelectedPiece(index);
          console.log('Changed selection to:', index);
        }
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      console.log('Starting Google sign in...');
      // Uncomment when Firebase is configured:
      const userData = await signInWithGoogle();
      // Map firebase config return shape to our FirebaseAuthUser
      await loginUser(userData);
          } catch (error) {
      console.error('Sign in error:', error);
      alert('Sign in failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('Signing out...');
      // Uncomment when Firebase is configured:
      await signOutUser();
      
      setUser(null);
      setGameState('login');
      socket?.disconnect?.();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const joinMatchmaking = () => {
    console.log('Joining matchmaking...');
    socket?.emit('joinMatchmaking');
  };

  const leaveMatchmaking = () => {
    console.log('Leaving matchmaking...');
    socket?.emit('leaveMatchmaking');
    setGameState('menu');
  };

  const createRoom = () => {
    console.log('Creating room...');
    socket?.emit('createRoom');
  };

  const joinRoom = () => {
    if (!inputRoomId.trim()) return;
    console.log('Joining room:', inputRoomId);
    socket?.emit('joinRoom', { roomId: inputRoomId.toUpperCase() });
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    console.log('Room ID copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const resetToMenu = () => {
    console.log('Resetting to menu');
    setGameState('menu');
    setRoomId('');
    setInputRoomId('');
    setPlayerId(null);
    setPlayerSymbol(null);
    setOpponent(null);
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setGamePhase('placement');
    setPiecesPlaced({ X: 0, O: 0 });
    setSelectedPiece(null);
    setWinner(null);
    setWinningLine([]);
  };

  // ------------------------------------
  // RENDER LOGIC
  // ------------------------------------

  // Loading screen
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-neutral-200 border-t-neutral-800 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-neutral-500 tracking-wider">Loading...</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (gameState === 'login') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-5xl font-light tracking-wider text-neutral-800 mb-2">
              CHINESE TILES
            </h1>
            <p className="text-xs tracking-widest text-neutral-400 uppercase">
              Carreaux Chinois
            </p>
          </div>

          <div className="w-full bg-white border border-neutral-200 p-8 space-y-6">
            <p className="text-center text-sm text-neutral-600 mb-6">
              Sign in to play online with your friends!
            </p>
            
            <button
              onClick={handleGoogleSignIn}
              className="w-full px-6 py-3 bg-white border-2 border-neutral-800 text-neutral-800 
                          hover:bg-neutral-800 hover:text-white transition-all duration-300
                          flex items-center justify-center gap-3 text-sm tracking-wider uppercase"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        <h3 className='text-center text-sm text-neutral-600 mb-6 italic'>Made with ❤️ by Ayomide</h3>
        </div>
      </div>
    );
  }

  // Profile Setup Screen
  if (gameState === 'profileSetup' && user) {
    const avatarUrl = generateAvatarUrl(newUsername);

    return (
        <div className="flex items-center justify-center min-h-screen bg-neutral-50">
            <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
                <div className="text-center">
                    <h1 className="text-4xl font-light tracking-wider text-neutral-800 mb-1">
                        WELCOME!
                    </h1>
                    <p className="text-xs tracking-widest text-neutral-400 uppercase">
                        Setup your profile
                    </p>
                </div>

                <div className="w-full bg-white border border-neutral-200 p-8 text-center space-y-6">
                    <div className="flex flex-col items-center">
                        <img 
                            src={avatarUrl} 
                            alt="Your Avatar" 
                            className="w-20 h-20 rounded-full border-4 border-neutral-200 mb-4 transition-all duration-300"
                        />
                        <p className="text-xs text-neutral-500">Your avatar updates as you type. This action is irreversible.</p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="username" className="text-sm font-medium text-neutral-600 block text-left">
                            Choose a Username
                        </label>
                        <input
                            id="username"
                            type="text"
                            placeholder="e.g., TileMaster64"
                            value={newUsername}
                            onChange={(e) => {
                                setNewUsername(e.target.value);
                                console.log('Username input changed:', e.target.value);
                                if (usernameError) setUsernameError(''); // Clear error on change
                            }}
                            className={`w-full px-4 py-3 border ${usernameError ? 'border-red-500' : 'border-neutral-300'} text-sm tracking-wider
                                        focus:outline-none focus:ring-1 ${usernameError ? 'focus:ring-red-500' : 'focus:ring-neutral-800'} transition-all`}
                            maxLength={16}
                        />
                        {usernameError && (
                            <p className="text-xs text-red-500 text-left">{usernameError}</p>
                        )}
                    </div>

                    <button
                        onClick={updateUserProfile}
                        disabled={newUsername.length < 3}
                        className="w-full px-8 py-3 bg-neutral-800 text-white text-sm tracking-widest uppercase
                                    hover:bg-neutral-700 transition-all duration-300
                                    disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        Save Profile <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
  }

  // Menu screen
  if (gameState === 'menu') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-4xl font-light tracking-wider text-neutral-800 mb-1">
              CHINESE TILES
            </h1>
            <p className="text-xs tracking-widest text-neutral-400 uppercase">
              Multiplayer
            </p>
          </div>

          {user && (
            <div className="w-full bg-white border border-neutral-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Use the dynamically generated photoUrl */}
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={user.username || 'User avatar'} className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
                    <User size={20} className="text-neutral-500" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-neutral-800">{user.username}</p>
                  <p className="text-xs text-neutral-500">{user.gamesWon} Wins - {user.gamesLost} Losses</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-neutral-100 rounded transition-all"
                title="Sign out"
              >
                <LogOut size={18} className="text-neutral-500" />
              </button>
            </div>
          )}

          <div className="w-full space-y-4">
            <button
              onClick={joinMatchmaking}
              className="w-full px-8 py-4 bg-neutral-800 text-white text-sm tracking-widest uppercase
                          hover:bg-neutral-700 transition-all duration-300"
            >
              Find Match
            </button>

            <button
              onClick={createRoom}
              className="w-full px-8 py-4 border-2 border-neutral-800 text-neutral-800 text-sm tracking-widest uppercase
                          hover:bg-neutral-800 hover:text-white transition-all duration-300"
            >
              Create Private Room
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-300"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-neutral-50 text-neutral-400 tracking-wider">OR</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter Room Code"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-neutral-300 text-center text-sm tracking-widest uppercase
                            focus:outline-none focus:border-neutral-800 transition-all"
                maxLength={6}
              />
              <button
                onClick={joinRoom}
                disabled={!inputRoomId.trim()}
                className="w-full px-8 py-3 border border-neutral-800 text-neutral-800 text-sm tracking-widest uppercase
                            hover:bg-neutral-800 hover:text-white transition-all duration-300
                            disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Matchmaking screen
  if (gameState === 'matchmaking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-4xl font-light tracking-wider text-neutral-800 mb-1">
              CHINESE TILES
            </h1>
            <p className="text-xs tracking-widest text-neutral-400 uppercase mb-8">
              Finding opponent
            </p>
          </div>

          <div className="w-full bg-white border border-neutral-200 p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 border-4 border-neutral-200 border-t-neutral-800 rounded-full animate-spin"></div>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-neutral-500 tracking-wider uppercase">Searching for match</p>
              <p className="text-xs text-neutral-400">
                Players in queue: {queuePosition}
              </p>
            </div>
          </div>

          <button
            onClick={leaveMatchmaking}
            className="px-8 py-2.5 border border-neutral-300 text-neutral-600 text-xs tracking-widest uppercase
                        hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-all duration-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Waiting for opponent screen
  if (gameState === 'waiting') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-4xl font-light tracking-wider text-neutral-800 mb-1">
              CHINESE TILES
            </h1>
            <p className="text-xs tracking-widest text-neutral-400 uppercase mb-8">
              Waiting for opponent
            </p>
          </div>

          <div className="w-full bg-white border border-neutral-200 p-8 text-center space-y-4">
            <p className="text-sm text-neutral-500 tracking-wider uppercase">Room Code</p>
            <div className="flex items-center justify-center gap-3">
              <div className="text-3xl font-light tracking-widest text-neutral-800">
                {roomId}
              </div>
              <button
                onClick={copyRoomId}
                className="p-2 hover:bg-neutral-100 rounded transition-all"
                title="Copy room code"
              >
                {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} className="text-neutral-400" />}
              </button>
            </div>
            <p className="text-xs text-neutral-400 pt-4">
              Share this code with your opponent
            </p>
          </div>

          <button
            onClick={resetToMenu}
            className="px-8 py-2.5 border border-neutral-300 text-neutral-600 text-xs tracking-widest uppercase
                        hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-all duration-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Game screen
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50">
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes flashRed {
          0%, 100% { background-color: white; }
          50% { background-color: #ef4444; }
        }
        .animate-slide-up { animation: slideUp 0.4s ease-out; }
        .animate-scale-in { animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .animate-pulse { animation: pulse 0.6s ease-in-out; }
        .animate-flash-red { animation: flashRed 0.5s ease-in-out; }
      `}</style>
      
      <div className="flex flex-col items-center gap-8 p-8">
        <div className="text-center animate-slide-up">
          <h1 className="text-4xl font-light tracking-wider text-neutral-800 mb-1">
            CHINESE TILES
          </h1>
          <p className="text-xs tracking-widest text-neutral-400 uppercase">
            Room: {roomId} · You: {playerSymbol} vs {opponent || 'Waiting...'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {winner ? (
            <div className="text-center animate-scale-in">
              <div className="text-sm tracking-wide text-neutral-500 mb-2">WINNER</div>
              <div className="text-5xl font-light text-neutral-800 animate-pulse">
                {winner}
              </div>
              <div className="text-xs text-neutral-400 mt-2">
                {winner === playerSymbol ? 'You won! 🎉' : 'You lost'}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-light transition-all duration-300 ${
                  currentPlayer === 'X' ? 'opacity-100 scale-110' : 'opacity-20 scale-100'
                }`}>
                  X
                </div>
                <div className="w-px h-8 bg-neutral-300"></div>
                <div className={`text-3xl font-light transition-all duration-300 ${
                  currentPlayer === 'O' ? 'opacity-100 scale-110' : 'opacity-20 scale-100'
                }`}>
                  O
                </div>
              </div>
              
              <div className="text-xs tracking-wider text-neutral-400 uppercase transition-opacity duration-300">
                {currentPlayer === playerSymbol ? (
                  gamePhase === 'placement' ? (
                    <span>Your turn · Place piece {piecesPlaced[currentPlayer]}/3</span>
                  ) : (
                    <span>Your turn · {selectedPiece !== null ? 'Select adjacent cell' : 'Select piece'}</span>
                  )
                ) : (
                  <span>Opponent's turn</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <div className="grid grid-cols-3 gap-0 bg-neutral-200 p-0.5">
            {board.map((cell, index) => {
              const isWinningCell = winningLine.includes(index);
              const isAnimating = animatingCells.has(index);
              const isInvalid = invalidMove === index;
              
              return (
                <div
                  key={index}
                  onClick={() => handleCellClick(index)}
                  className={`
                    w-24 h-24 bg-white flex items-center justify-center
                    transition-all duration-200
                    ${currentPlayer !== playerSymbol ? 'cursor-not-allowed opacity-50' : 'hover:bg-neutral-50 cursor-pointer'}
                    ${selectedPiece === index ? 'bg-neutral-100 ring-2 ring-neutral-400 ring-inset' : ''}
                    ${isWinningCell ? 'bg-neutral-800!' : ''}
                    ${isInvalid ? 'animate-flash-red' : ''}
                  `}
                >
                  {cell && (
                    <span className={`
                      text-5xl font-light select-none transition-all duration-200
                      ${cell === 'X' ? 'text-neutral-800' : 'text-neutral-500'}
                      ${isWinningCell ? 'text-white!' : ''}
                      ${selectedPiece === index ? 'scale-110' : 'scale-100'}
                      ${isAnimating ? 'animate-scale-in' : ''}
                    `}>
                      {cell}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {winner && (
          <button
            onClick={resetToMenu}
            className="mt-4 px-8 py-3 bg-neutral-800 text-white text-sm tracking-widest uppercase
                        hover:bg-neutral-700 transition-all duration-300 animate-slide-up"
          >
            Return to Menu
          </button>
        )}

        {!winner && (
          <button
            onClick={resetToMenu}
            className="px-8 py-2.5 border border-neutral-300 text-neutral-600 text-xs tracking-widest uppercase
                        hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-all duration-300"
          >
            Leave Game
          </button>
        )}
      </div>
    </div>
  );
}