export type PlayerSymbol = 'X' | 'O';

export type GamePhase = 'placement' | 'movement';

export type AppGameState = 'login' | 'menu' | 'waiting' | 'matchmaking' | 'playing' | 'profileSetup';

export interface BackendUser {
  userId: string;
  username?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  needsSetup?: boolean;
  gamesWon?: number;
  gamesLost?: number;
}

export interface FirebaseAuthUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export type Board = Array<PlayerSymbol | null>;

export interface SocketClient {
  on: (event: string, handler: (data?: unknown) => void) => void;
  emit: (event: string, data?: unknown) => void;
  disconnect?: () => void;
}

export interface MovePayload {
  roomId?: string;
  board: Board;
  currentPlayer: PlayerSymbol;
  gamePhase: GamePhase;
  piecesPlaced: Record<PlayerSymbol, number>;
  animateCell?: number;
}
