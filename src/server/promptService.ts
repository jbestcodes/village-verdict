import { redis } from '@devvit/web/server';
import type { PlayerSecretWord, PromptPair } from '../shared/prompt';
import type { Role } from '../shared/role';

const promptPairKey = (postId: string, gameId: string): string => `village-verdict:prompt-pair:${postId}:${gameId}`;

type CuratedWordGroup = { category: string; words: readonly string[] };

// Each neighbouring pair is intentionally closely related while remaining distinct.
const curatedWordGroups: readonly CuratedWordGroup[] = [
  { category: 'fruit', words: ['Apple', 'Pear', 'Peach', 'Plum', 'Mango', 'Papaya', 'Cherry', 'Grape', 'Lemon', 'Lime', 'Orange', 'Tangerine', 'Banana', 'Plantain', 'Melon', 'Watermelon'] },
  { category: 'animals', words: ['Dog', 'Wolf', 'Fox', 'Coyote', 'Lion', 'Tiger', 'Leopard', 'Panther', 'Horse', 'Donkey', 'Zebra', 'Giraffe', 'Rabbit', 'Hare', 'Mouse', 'Rat'] },
  { category: 'birds', words: ['Eagle', 'Hawk', 'Falcon', 'Owl', 'Raven', 'Crow', 'Parrot', 'Macaw', 'Swan', 'Goose', 'Duck', 'Penguin', 'Robin', 'Sparrow', 'Finch', 'Canary'] },
  { category: 'sea-life', words: ['Shark', 'Dolphin', 'Whale', 'Orca', 'Octopus', 'Squid', 'Crab', 'Lobster', 'Seal', 'Walrus', 'Turtle', 'Seahorse', 'Starfish', 'Jellyfish', 'Clam', 'Oyster'] },
  { category: 'food', words: ['Coffee', 'Tea', 'Cocoa', 'Milk', 'Bread', 'Toast', 'Butter', 'Cheese', 'Pizza', 'Burger', 'Taco', 'Burrito', 'Soup', 'Stew', 'Salad', 'Sandwich'] },
  { category: 'desserts', words: ['Cake', 'Pie', 'Cookie', 'Brownie', 'Ice Cream', 'Gelato', 'Donut', 'Muffin', 'Pancake', 'Waffle', 'Jam', 'Honey', 'Sugar', 'Caramel', 'Chocolate', 'Vanilla'] },
  { category: 'nature', words: ['Beach', 'Desert', 'Forest', 'Jungle', 'River', 'Lake', 'Ocean', 'Sea', 'Mountain', 'Hill', 'Valley', 'Canyon', 'Island', 'Peninsula', 'Waterfall', 'Glacier'] },
  { category: 'weather', words: ['Rain', 'Snow', 'Sleet', 'Hail', 'Wind', 'Breeze', 'Storm', 'Thunder', 'Lightning', 'Rainbow', 'Cloud', 'Fog', 'Sunshine', 'Moonlight', 'Sunset', 'Dawn'] },
  { category: 'seasons', words: ['Spring', 'Summer', 'Autumn', 'Winter', 'Morning', 'Noon', 'Evening', 'Night', 'Weekday', 'Weekend', 'Holiday', 'Vacation', 'Birthday', 'Anniversary', 'Festival', 'Parade'] },
  { category: 'transport', words: ['Car', 'Motorcycle', 'Bicycle', 'Scooter', 'Train', 'Bus', 'Tram', 'Subway', 'Plane', 'Helicopter', 'Boat', 'Ship', 'Taxi', 'Ambulance', 'Fire Truck', 'Tractor'] },
  { category: 'music', words: ['Keyboard', 'Piano', 'Guitar', 'Violin', 'Drum', 'Trumpet', 'Flute', 'Saxophone', 'Song', 'Melody', 'Rhythm', 'Harmony', 'Concert', 'Festival', 'Singer', 'Dancer'] },
  { category: 'technology', words: ['Phone', 'Laptop', 'Tablet', 'Computer', 'Keyboard', 'Mouse', 'Monitor', 'Screen', 'Camera', 'Microphone', 'Speaker', 'Headphones', 'Router', 'Modem', 'Website', 'App'] },
  { category: 'home', words: ['House', 'Apartment', 'Cabin', 'Tent', 'Kitchen', 'Bedroom', 'Bathroom', 'Garage', 'Door', 'Window', 'Roof', 'Wall', 'Chair', 'Sofa', 'Table', 'Desk'] },
  { category: 'clothing', words: ['Shirt', 'Sweater', 'Jacket', 'Coat', 'Jeans', 'Trousers', 'Dress', 'Skirt', 'Shoe', 'Boot', 'Sandal', 'Sneaker', 'Hat', 'Cap', 'Scarf', 'Glove'] },
  { category: 'school', words: ['Book', 'Notebook', 'Paper', 'Card', 'Pencil', 'Pen', 'Marker', 'Crayon', 'Ruler', 'Compass', 'Eraser', 'Sharpener', 'Teacher', 'Student', 'Classroom', 'Library'] },
  { category: 'sports', words: ['Football', 'Soccer', 'Basketball', 'Volleyball', 'Tennis', 'Badminton', 'Baseball', 'Cricket', 'Swimming', 'Running', 'Cycling', 'Boxing', 'Skating', 'Skiing', 'Surfing', 'Climbing'] },
  { category: 'places', words: ['City', 'Village', 'Town', 'Suburb', 'Museum', 'Gallery', 'Theater', 'Cinema', 'Restaurant', 'Cafe', 'Bakery', 'Market', 'Hospital', 'Clinic', 'School', 'University'] },
  { category: 'space', words: ['Sun', 'Moon', 'Star', 'Planet', 'Comet', 'Asteroid', 'Meteor', 'Satellite', 'Rocket', 'Spaceship', 'Galaxy', 'Nebula', 'Astronaut', 'Alien', 'Telescope', 'Observatory'] },
  { category: 'fantasy', words: ['Wizard', 'Witch', 'Knight', 'Dragon', 'Castle', 'Fortress', 'King', 'Queen', 'Prince', 'Princess', 'Sword', 'Shield', 'Potion', 'Spell', 'Treasure', 'Map'] },
  { category: 'art', words: ['Painting', 'Drawing', 'Sketch', 'Portrait', 'Sculpture', 'Statue', 'Photo', 'Poster', 'Canvas', 'Easel', 'Brush', 'Palette', 'Color', 'Pattern', 'Frame', 'Gallery'] },
  { category: 'jobs', words: ['Doctor', 'Nurse', 'Teacher', 'Chef', 'Farmer', 'Gardener', 'Pilot', 'Driver', 'Artist', 'Writer', 'Actor', 'Musician', 'Scientist', 'Engineer', 'Detective', 'Firefighter'] },
  { category: 'games', words: ['Chess', 'Checkers', 'Cards', 'Dice', 'Puzzle', 'Riddle', 'Maze', 'Quiz', 'Controller', 'Joystick', 'Arcade', 'Console', 'Board Game', 'Video Game', 'Toy', 'Doll'] },
  { category: 'body', words: ['Hand', 'Foot', 'Arm', 'Leg', 'Eye', 'Ear', 'Nose', 'Mouth', 'Heart', 'Brain', 'Bone', 'Muscle', 'Smile', 'Laugh', 'Whisper', 'Shout'] },
  { category: 'garden', words: ['Flower', 'Rose', 'Tulip', 'Daisy', 'Tree', 'Pine', 'Oak', 'Maple', 'Grass', 'Moss', 'Leaf', 'Seed', 'Garden', 'Park', 'Farm', 'Orchard'] },
];

const slugify = (value: string): string => value.toLowerCase().replaceAll(' ', '-');

export const curatedPromptPairs: readonly PromptPair[] = curatedWordGroups.flatMap(({ category, words }) =>
  words.slice(0, -1).map((villagerWord, index) => ({
    id: `${category}-${slugify(villagerWord)}-${slugify(words[index + 1] ?? '')}`,
    villagerWord,
    impostorWord: words[index + 1] ?? '',
    category,
  })),
);

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
