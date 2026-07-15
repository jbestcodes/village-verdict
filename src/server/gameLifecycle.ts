import { MIN_PLAYERS } from '../shared/gameConfig';
import type { GameState } from '../shared/gameState';

export const getNextGameState = (currentState: GameState, playerCount: number): GameState => {
  if (currentState === 'WAITING') {
    return playerCount >= MIN_PLAYERS ? 'SECRET_WORD' : 'WAITING';
  }
  if (currentState === 'READY') {
    return 'SECRET_WORD';
  }
  if (currentState === 'SECRET_WORD') {
    return 'DISCUSSION';
  }
  if (currentState === 'DISCUSSION') {
    return 'VOTING';
  }
  if (currentState === 'VOTING') {
    return 'RESULTS';
  }
  if (currentState === 'RESULTS') {
    return 'PLAY_AGAIN';
  }

  return currentState;
};
