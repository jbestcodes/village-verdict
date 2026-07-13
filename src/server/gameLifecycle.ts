import { MIN_PLAYERS } from '../shared/lobby';
import type { GameState } from '../shared/gameState';

export const getNextGameState = (currentState: GameState, playerCount: number): GameState => {
  if (currentState === 'WAITING') {
    return playerCount >= MIN_PLAYERS ? 'READY' : 'WAITING';
  }

  if (currentState === 'READY') {
    return playerCount >= MIN_PLAYERS ? 'IN_PROGRESS' : 'WAITING';
  }

  return currentState;
};
