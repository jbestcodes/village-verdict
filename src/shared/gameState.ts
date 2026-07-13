export const GAME_STATES = [
  'WAITING',
  'READY',
  'IN_PROGRESS',
  'VOTING',
  'RESULTS',
  'FINISHED',
] as const;

export type GameState = (typeof GAME_STATES)[number];

export const isGameState = (value: unknown): value is GameState => {
  return (
    value === 'WAITING' ||
    value === 'READY' ||
    value === 'IN_PROGRESS' ||
    value === 'VOTING' ||
    value === 'RESULTS' ||
    value === 'FINISHED'
  );
};
