interface ServerToClientEvents {
  noArg: () => void;
  basicEmit: (a: number, b: string, c: Buffer) => void;
  withAck: (d: string, callback: (e: number) => void) => void;
  message: (data: string) => void;
  
  // Game-specific events
  matchmakingJoined: (data: { position: number }) => void;
  matchmakingLeft: () => void;
  matchFound: (data: { roomId: string; playerId: string; playerSymbol: string; opponent: string }) => void;
  roomCreated: (data: { roomId: string; playerId: string; playerSymbol: string }) => void;
  roomJoined: (data: { roomId: string; playerId: string; playerSymbol: string; opponent: string }) => void;
  opponentJoined: (data: { opponent: string }) => void;
  gameStart: (data: { currentPlayer: string }) => void;
  moveMade: (data: {
    board: (string | null)[];
    currentPlayer: string;
    gamePhase: string;
    piecesPlaced: Record<string, number>;
    animateCell?: number;
  }) => void;
  playerLeft: () => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  hello: () => void;
  sendMessage: (message: string) => void;
  
  // Game-specific events
  authenticate: (data: { userId: string; username: string }) => void;
  joinMatchmaking: () => void;
  leaveMatchmaking: () => void;
  createRoom: () => void;
  joinRoom: (data: { roomId: string }) => void;
  makeMove: (data: {
    roomId: string;
    board: (string | null)[];
    currentPlayer: string;
    gamePhase: string;
    piecesPlaced: Record<string, number>;
    animateCell?: number;
  }) => void;
}
