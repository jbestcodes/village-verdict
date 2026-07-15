import { redis } from '@devvit/web/server';
import type { PlayerSecretWord, PromptPair } from '../shared/prompt';
import type { Role } from '../shared/role';

const promptPairKey = (postId: string, gameId: string): string => `village-verdict:prompt-pair:${postId}:${gameId}`;

const curatedPairData: ReadonlyArray<readonly [string, string, string]> = [
  ['fruit', 'Apple', 'Pear'], ['fruit', 'Orange', 'Tangerine'], ['fruit', 'Banana', 'Plantain'], ['animals', 'Cat', 'Dog'], ['animals', 'Lion', 'Tiger'], ['animals', 'Horse', 'Donkey'], ['birds', 'Eagle', 'Hawk'], ['birds', 'Raven', 'Crow'], ['sea-life', 'Whale', 'Orca'], ['sea-life', 'Octopus', 'Squid'], ['food', 'Coffee', 'Tea'], ['food', 'Burger', 'Pizza'], ['food', 'Taco', 'Burrito'], ['dessert', 'Cake', 'Pie'], ['dessert', 'Ice Cream', 'Gelato'], ['nature', 'Ocean', 'Sea'], ['nature', 'Forest', 'Jungle'], ['weather', 'Rain', 'Snow'], ['weather', 'Wind', 'Breeze'], ['transport', 'Car', 'Motorcycle'], ['transport', 'Train', 'Bus'], ['transport', 'Plane', 'Helicopter'], ['music', 'Keyboard', 'Piano'], ['music', 'Guitar', 'Violin'], ['technology', 'Android', 'iPhone'], ['technology', 'Laptop', 'Tablet'], ['home', 'House', 'Apartment'], ['home', 'Chair', 'Sofa'], ['clothing', 'Jacket', 'Coat'], ['clothing', 'Shoe', 'Boot'], ['school', 'Pencil', 'Pen'], ['sports', 'Football', 'Rugby'], ['sports', 'Basketball', 'Volleyball'], ['places', 'City', 'Town'], ['space', 'Comet', 'Asteroid'], ['fantasy', 'Wizard', 'Witch'], ['art', 'Painting', 'Drawing'], ['games', 'Chess', 'Checkers'], ['garden', 'Rose', 'Tulip'],
];

const slugify = (value: string): string => value.toLowerCase().replaceAll(' ', '-');

export const curatedPromptPairs: readonly PromptPair[] = curatedPairData.map(([category, villagerWord, impostorWord]) => ({
  id: `${category}-${slugify(villagerWord)}-${slugify(impostorWord)}`,
  villagerWord,
  impostorWord,
  category,
}));

export class PromptService {
  async getPromptPairForGame(postId: string, gameId: string): Promise<PromptPair> {
    const existingPair = await this.getExistingPromptPairForGame(postId, gameId);
    if (existingPair) return existingPair;

    const pair = curatedPromptPairs[Math.floor(Math.random() * curatedPromptPairs.length)];
    if (!pair) throw new Error('No prompt pairs are configured');

    await redis.set(promptPairKey(postId, gameId), JSON.stringify(pair), { nx: true });
    const storedPair = await this.getExistingPromptPairForGame(postId, gameId);
    if (!storedPair) throw new Error('Failed to create prompt pair');
    return storedPair;
  }

  async getExistingPromptPairForGame(postId: string, gameId: string): Promise<PromptPair | null> {
    const value = await redis.get(promptPairKey(postId, gameId));
    if (!value) return null;
    const parsed = parseJson(value);
    return isPromptPair(parsed) ? parsed : null;
  }

  async getSecretWordForPlayer(postId: string, gameId: string, role: Role): Promise<PlayerSecretWord> {
    const pair = await this.getPromptPairForGame(postId, gameId);
    return { secretWord: role === 'IMPOSTOR' ? pair.impostorWord : pair.villagerWord };
  }
}

const isPromptPair = (value: unknown): value is PromptPair => {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    'villagerWord' in value &&
    'impostorWord' in value &&
    'category' in value &&
    typeof value.id === 'string' &&
    typeof value.villagerWord === 'string' &&
    typeof value.impostorWord === 'string' &&
    (typeof value.category === 'string' || value.category === null)
  );
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const promptService = new PromptService();
export const getPromptPairForGame = (postId: string, gameId: string): Promise<PromptPair> => promptService.getPromptPairForGame(postId, gameId);
export const getExistingPromptPairForGame = (postId: string, gameId: string): Promise<PromptPair | null> => promptService.getExistingPromptPairForGame(postId, gameId);
export const getSecretWordForPlayer = (postId: string, gameId: string, role: Role): Promise<PlayerSecretWord> => promptService.getSecretWordForPlayer(postId, gameId, role);
