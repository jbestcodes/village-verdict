export const GAME_STATES = [
  'WAITING',
  'READY',
  'SECRET_WORD',
  'DISCUSSION',
  'VOTING',
  'RESULTS',
  'PLAY_AGAIN',
] as const;

export type GameState = (typeof GAME_STATES)[number];

export const isGameState = (value: unknown): value is GameState => {
  return (
    value === 'WAITING' ||
    value === 'READY' ||
    value === 'SECRET_WORD' ||
    value === 'DISCUSSION' ||
    value === 'VOTING' ||
    value === 'RESULTS' ||
    value === 'PLAY_AGAIN'
  );
};
