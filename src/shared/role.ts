export type Role = 'VILLAGER' | 'IMPOSTOR';

export type CurrentPlayerRole = {
  role: Role | null;
};

export const isRole = (value: unknown): value is Role => {
  return value === 'VILLAGER' || value === 'IMPOSTOR';
};
