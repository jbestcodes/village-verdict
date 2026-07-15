import type { GameState } from './gameState';

export type LobbyPlayer = {
  username: string;
  joinedAt: string;
};

export type LobbyState = {
  postId: string;
  gameId: string;
  players: LobbyPlayer[];
  gameState: GameState;
  minPlayers: number;
  maxPlayers: number;
  currentUsername: string;
  hasJoined: boolean;
  waitingEndsAt: string | null;
  wordRevealEndsAt: string | null;
  discussionEndsAt: string | null;
  completedGame: CompletedGame | null;
};

export type WinningSide = 'VILLAGERS' | 'IMPOSTOR';

export type CompletedGame = {
  gameId: string;
  majorityWord: string;
  differentWord: string;
  differentWordUsername: string;
  winningSide: WinningSide;
  finishedAt: string;
};

export type JoinLobbyResult = {
  lobby: LobbyState;
  joined: boolean;
  reason?: 'already_joined' | 'full' | 'started';
};

export type LeaveLobbyResult = {
  lobby: LobbyState;
  left: boolean;
  reason?: 'not_joined' | 'started';
};
