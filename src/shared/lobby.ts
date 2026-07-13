import type { GameState } from './gameState';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export type LobbyPlayer = {
  username: string;
  joinedAt: string;
};

export type LobbyState = {
  postId: string;
  players: LobbyPlayer[];
  gameState: GameState;
  minPlayers: number;
  maxPlayers: number;
  currentUsername: string;
  hasJoined: boolean;
};

export type JoinLobbyResult = {
  lobby: LobbyState;
  joined: boolean;
  reason?: 'already_joined' | 'full' | 'started';
};
