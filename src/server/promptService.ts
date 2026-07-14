import { redis } from '@devvit/web/server';
import type { Role } from '../shared/role';
import type { PlayerPromptState, PromptPair, PromptSource } from '../shared/prompt';

const promptKey = (postId: string, gameId: string): string => `village-verdict:prompt:${postId}:${gameId}`;
const promptAssignmentsKey = (postId: string, gameId: string): string => `village-verdict:prompt-assignments:${postId}:${gameId}`;

type PromptCandidate = Pick<PromptPair, 'id' | 'firstWord' | 'secondWord' | 'source' | 'category'>;

const curatedPromptPairs: readonly PromptCandidate[] = [
  { id: 'apple-pear', firstWord: 'Apple', secondWord: 'Pear', source: 'CURATED', category: 'food' },
  { id: 'beach-desert', firstWord: 'Beach', secondWord: 'Desert', source: 'CURATED', category: 'nature' },
  { id: 'pizza-burger', firstWord: 'Pizza', secondWord: 'Burger', source: 'CURATED', category: 'food' },
  { id: 'summer-winter', firstWord: 'Summer', secondWord: 'Winter', source: 'CURATED', category: 'seasons' },
  { id: 'dog-wolf', firstWord: 'Dog', secondWord: 'Wolf', source: 'CURATED', category: 'animals' },
  { id: 'coffee-tea', firstWord: 'Coffee', secondWord: 'Tea', source: 'CURATED', category: 'food' },
  { id: 'forest-jungle', firstWord: 'Forest', secondWord: 'Jungle', source: 'CURATED', category: 'nature' },
  { id: 'train-bus', firstWord: 'Train', secondWord: 'Bus', source: 'CURATED', category: 'travel' },
  { id: 'mountain-hill', firstWord: 'Mountain', secondWord: 'Hill', source: 'CURATED', category: 'nature' },
  { id: 'ocean-lake', firstWord: 'Ocean', secondWord: 'Lake', source: 'CURATED', category: 'nature' },
  { id: 'cat-mouse', firstWord: 'Cat', secondWord: 'Mouse', source: 'CURATED', category: 'animals' },
  { id: 'river-stream', firstWord: 'River', secondWord: 'Stream', source: 'CURATED', category: 'nature' },
  { id: 'moon-sun', firstWord: 'Moon', secondWord: 'Sun', source: 'CURATED', category: 'space' },
  { id: 'candle-flashlight', firstWord: 'Candle', secondWord: 'Flashlight', source: 'CURATED', category: 'objects' },
  { id: 'chair-sofa', firstWord: 'Chair', secondWord: 'Sofa', source: 'CURATED', category: 'furniture' },
  { id: 'book-notebook', firstWord: 'Book', secondWord: 'Notebook', source: 'CURATED', category: 'objects' },
  { id: 'rain-snow', firstWord: 'Rain', secondWord: 'Snow', source: 'CURATED', category: 'weather' },
  { id: 'fire-water', firstWord: 'Fire', secondWord: 'Water', source: 'CURATED', category: 'elements' },
  { id: 'salt-pepper', firstWord: 'Salt', secondWord: 'Pepper', source: 'CURATED', category: 'food' },
  { id: 'mirror-window', firstWord: 'Mirror', secondWord: 'Window', source: 'CURATED', category: 'home' },
  { id: 'shoe-sandal', firstWord: 'Shoe', secondWord: 'Sandal', source: 'CURATED', category: 'fashion' },
  { id: 'hat-cap', firstWord: 'Hat', secondWord: 'Cap', source: 'CURATED', category: 'fashion' },
  { id: 'spider-ant', firstWord: 'Spider', secondWord: 'Ant', source: 'CURATED', category: 'animals' },
  { id: 'frog-toad', firstWord: 'Frog', secondWord: 'Toad', source: 'CURATED', category: 'animals' },
  { id: 'bicycle-skateboard', firstWord: 'Bicycle', secondWord: 'Skateboard', source: 'CURATED', category: 'transport' },
  { id: 'guitar-piano', firstWord: 'Guitar', secondWord: 'Piano', source: 'CURATED', category: 'music' },
  { id: 'lamp-chandelier', firstWord: 'Lamp', secondWord: 'Chandelier', source: 'CURATED', category: 'home' },
  { id: 'pencil-marker', firstWord: 'Pencil', secondWord: 'Marker', source: 'CURATED', category: 'school' },
  { id: 'blanket-quilt', firstWord: 'Blanket', secondWord: 'Quilt', source: 'CURATED', category: 'home' },
  { id: 'sword-shield', firstWord: 'Sword', secondWord: 'Shield', source: 'CURATED', category: 'fantasy' },
  { id: 'lantern-torch', firstWord: 'Lantern', secondWord: 'Torch', source: 'CURATED', category: 'objects' },
  { id: 'violin-drum', firstWord: 'Violin', secondWord: 'Drum', source: 'CURATED', category: 'music' },
  { id: 'rocket-satellite', firstWord: 'Rocket', secondWord: 'Satellite', source: 'CURATED', category: 'space' },
  { id: 'sunset-dawn', firstWord: 'Sunset', secondWord: 'Dawn', source: 'CURATED', category: 'nature' },
  { id: 'river-ocean', firstWord: 'River', secondWord: 'Ocean', source: 'CURATED', category: 'nature' },
  { id: 'meadow-field', firstWord: 'Meadow', secondWord: 'Field', source: 'CURATED', category: 'nature' },
  { id: 'cactus-fern', firstWord: 'Cactus', secondWord: 'Fern', source: 'CURATED', category: 'nature' },
  { id: 'cookie-cake', firstWord: 'Cookie', secondWord: 'Cake', source: 'CURATED', category: 'food' },
  { id: 'soup-salad', firstWord: 'Soup', secondWord: 'Salad', source: 'CURATED', category: 'food' },
  { id: 'bread-butter', firstWord: 'Bread', secondWord: 'Butter', source: 'CURATED', category: 'food' },
  { id: 'jam-honey', firstWord: 'Jam', secondWord: 'Honey', source: 'CURATED', category: 'food' },
  { id: 'peanut-nutmeg', firstWord: 'Peanut', secondWord: 'Nutmeg', source: 'CURATED', category: 'food' },
  { id: 'cereal-toast', firstWord: 'Cereal', secondWord: 'Toast', source: 'CURATED', category: 'food' },
  { id: 'lemon-orange', firstWord: 'Lemon', secondWord: 'Orange', source: 'CURATED', category: 'food' },
  { id: 'grape-berry', firstWord: 'Grape', secondWord: 'Berry', source: 'CURATED', category: 'food' },
  { id: 'potato-rice', firstWord: 'Potato', secondWord: 'Rice', source: 'CURATED', category: 'food' },
  { id: 'pasta-noodle', firstWord: 'Pasta', secondWord: 'Noodle', source: 'CURATED', category: 'food' },
  { id: 'pancake-waffle', firstWord: 'Pancake', secondWord: 'Waffle', source: 'CURATED', category: 'food' },
  { id: 'mango-peach', firstWord: 'Mango', secondWord: 'Peach', source: 'CURATED', category: 'food' },
  { id: 'sushi-taco', firstWord: 'Sushi', secondWord: 'Taco', source: 'CURATED', category: 'food' },
  { id: 'pasta-bread', firstWord: 'Pasta', secondWord: 'Bread', source: 'CURATED', category: 'food' },
  { id: 'honey-jam', firstWord: 'Honey', secondWord: 'Jam', source: 'CURATED', category: 'food' },
  { id: 'sugar-salt', firstWord: 'Sugar', secondWord: 'Salt', source: 'CURATED', category: 'food' },
  { id: 'pepper-chili', firstWord: 'Pepper', secondWord: 'Chili', source: 'CURATED', category: 'food' },
  { id: 'mug-cup', firstWord: 'Mug', secondWord: 'Cup', source: 'CURATED', category: 'home' },
  { id: 'table-desk', firstWord: 'Table', secondWord: 'Desk', source: 'CURATED', category: 'home' },
  { id: 'clock-watch', firstWord: 'Clock', secondWord: 'Watch', source: 'CURATED', category: 'objects' },
  { id: 'phone-laptop', firstWord: 'Phone', secondWord: 'Laptop', source: 'CURATED', category: 'technology' },
  { id: 'keyboard-mouse', firstWord: 'Keyboard', secondWord: 'Mouse', source: 'CURATED', category: 'technology' },
  { id: 'screen-monitor', firstWord: 'Screen', secondWord: 'Monitor', source: 'CURATED', category: 'technology' },
  { id: 'router-modem', firstWord: 'Router', secondWord: 'Modem', source: 'CURATED', category: 'technology' },
  { id: 'camera-lens', firstWord: 'Camera', secondWord: 'Lens', source: 'CURATED', category: 'technology' },
  { id: 'pen-ink', firstWord: 'Pen', secondWord: 'Ink', source: 'CURATED', category: 'school' },
  { id: 'paper-card', firstWord: 'Paper', secondWord: 'Card', source: 'CURATED', category: 'school' },
  { id: 'ruler-compass', firstWord: 'Ruler', secondWord: 'Compass', source: 'CURATED', category: 'school' },
  { id: 'pencil-eraser', firstWord: 'Pencil', secondWord: 'Eraser', source: 'CURATED', category: 'school' },
  { id: 'glove-mitten', firstWord: 'Glove', secondWord: 'Mitten', source: 'CURATED', category: 'fashion' },
  { id: 'jacket-coat', firstWord: 'Jacket', secondWord: 'Coat', source: 'CURATED', category: 'fashion' },
  { id: 'scarf-gloves', firstWord: 'Scarf', secondWord: 'Gloves', source: 'CURATED', category: 'fashion' },
  { id: 'sneaker-boot', firstWord: 'Sneaker', secondWord: 'Boot', source: 'CURATED', category: 'fashion' },
  { id: 'pillow-cushion', firstWord: 'Pillow', secondWord: 'Cushion', source: 'CURATED', category: 'home' },
  { id: 'mirror-picture', firstWord: 'Mirror', secondWord: 'Picture', source: 'CURATED', category: 'home' },
  { id: 'garden-yard', firstWord: 'Garden', secondWord: 'Yard', source: 'CURATED', category: 'home' },
  { id: 'roof-wall', firstWord: 'Roof', secondWord: 'Wall', source: 'CURATED', category: 'home' },
  { id: 'door-window', firstWord: 'Door', secondWord: 'Window', source: 'CURATED', category: 'home' },
  { id: 'car-bus', firstWord: 'Car', secondWord: 'Bus', source: 'CURATED', category: 'travel' },
  { id: 'plane-boat', firstWord: 'Plane', secondWord: 'Boat', source: 'CURATED', category: 'travel' },
  { id: 'map-compass', firstWord: 'Map', secondWord: 'Compass', source: 'CURATED', category: 'travel' },
  { id: 'hotel-hostel', firstWord: 'Hotel', secondWord: 'Hostel', source: 'CURATED', category: 'travel' },
  { id: 'museum-zoo', firstWord: 'Museum', secondWord: 'Zoo', source: 'CURATED', category: 'places' },
  { id: 'beach-park', firstWord: 'Beach', secondWord: 'Park', source: 'CURATED', category: 'places' },
  { id: 'castle-fortress', firstWord: 'Castle', secondWord: 'Fortress', source: 'CURATED', category: 'places' },
  { id: 'forest-meadow', firstWord: 'Forest', secondWord: 'Meadow', source: 'CURATED', category: 'nature' },
  { id: 'volcano-mountain', firstWord: 'Volcano', secondWord: 'Mountain', source: 'CURATED', category: 'nature' },
  { id: 'island-peninsula', firstWord: 'Island', secondWord: 'Peninsula', source: 'CURATED', category: 'nature' },
  { id: 'aurora-starlight', firstWord: 'Aurora', secondWord: 'Starlight', source: 'CURATED', category: 'space' },
  { id: 'comet-asteroid', firstWord: 'Comet', secondWord: 'Asteroid', source: 'CURATED', category: 'space' },
  { id: 'galaxy-universe', firstWord: 'Galaxy', secondWord: 'Universe', source: 'CURATED', category: 'space' },
  { id: 'river-waterfall', firstWord: 'River', secondWord: 'Waterfall', source: 'CURATED', category: 'nature' },
  { id: 'sun-moon', firstWord: 'Sun', secondWord: 'Moon', source: 'CURATED', category: 'space' },
  { id: 'star-planet', firstWord: 'Star', secondWord: 'Planet', source: 'CURATED', category: 'space' },
  { id: 'bridge-road', firstWord: 'Bridge', secondWord: 'Road', source: 'CURATED', category: 'travel' },
  { id: 'city-village', firstWord: 'City', secondWord: 'Village', source: 'CURATED', category: 'places' },
  { id: 'library-archive', firstWord: 'Library', secondWord: 'Archive', source: 'CURATED', category: 'places' },
  { id: 'bakery-cafe', firstWord: 'Bakery', secondWord: 'Cafe', source: 'CURATED', category: 'places' },
  { id: 'garden-park', firstWord: 'Garden', secondWord: 'Park', source: 'CURATED', category: 'places' },
  { id: 'river-valley', firstWord: 'River', secondWord: 'Valley', source: 'CURATED', category: 'nature' },
  { id: 'desert-savanna', firstWord: 'Desert', secondWord: 'Savanna', source: 'CURATED', category: 'nature' },
  { id: 'wheat-corn', firstWord: 'Wheat', secondWord: 'Corn', source: 'CURATED', category: 'food' },
  { id: 'pine-oak', firstWord: 'Pine', secondWord: 'Oak', source: 'CURATED', category: 'nature' },
];

class PromptService {
  async getPromptForGame(postId: string, gameId: string): Promise<PromptPair> {
    const existingPrompt = await this.readPrompt(postId, gameId);
    if (existingPrompt) {
      return existingPrompt;
    }

    const candidate = this.getPromptCandidates()[Math.floor(Math.random() * this.getPromptCandidates().length)];
    if (!candidate) {
      throw new Error('No prompt pairs are configured');
    }

    const prompt: PromptPair = {
      id: candidate.id,
      firstWord: candidate.firstWord,
      secondWord: candidate.secondWord,
      source: candidate.source,
      category: candidate.category,
      createdAt: new Date().toISOString(),
    };

    await redis.set(promptKey(postId, gameId), JSON.stringify(prompt), { nx: true });

    const storedPrompt = await this.readPrompt(postId, gameId);
    if (!storedPrompt) {
      throw new Error('Failed to create prompt');
    }

    return storedPrompt;
  }

  async getExistingPromptForGame(postId: string, gameId: string): Promise<PromptPair | null> {
    return this.readPrompt(postId, gameId);
  }

  async assignPromptStatesForGame(postId: string, gameId: string, players: readonly string[], roles: Record<string, Role>): Promise<Record<string, PlayerPromptState>> {
    const prompt = await this.getPromptForGame(postId, gameId);
    const existingAssignments = await this.readPromptAssignments(postId, gameId);
    if (Object.keys(existingAssignments).length > 0) {
      return existingAssignments;
    }

    const assignments: Record<string, PlayerPromptState> = {};
    players.forEach((username) => {
      const isImpostor = roles[username] === 'IMPOSTOR';
      assignments[username] = {
        promptId: prompt.id,
        firstWord: prompt.firstWord,
        secondWord: prompt.secondWord,
        secretWord: isImpostor ? prompt.secondWord : prompt.firstWord,
        isImpostor,
        source: prompt.source,
        category: prompt.category,
        createdAt: prompt.createdAt,
      };
    });

    await redis.set(promptAssignmentsKey(postId, gameId), JSON.stringify(assignments));
    return assignments;
  }

  async getPromptStateForPlayer(postId: string, gameId: string, username: string): Promise<PlayerPromptState | null> {
    const assignments = await this.readPromptAssignments(postId, gameId);
    return assignments[username] ?? null;
  }

  private getPromptCandidates(): readonly PromptCandidate[] {
    return curatedPromptPairs;
  }

  private async readPrompt(postId: string, gameId: string): Promise<PromptPair | null> {
    const value = await redis.get(promptKey(postId, gameId));
    if (!value) {
      return null;
    }

    const parsed: unknown = JSON.parse(value);
    return this.isPromptPair(parsed) ? parsed : null;
  }

  private async readPromptAssignments(postId: string, gameId: string): Promise<Record<string, PlayerPromptState>> {
    const value = await redis.get(promptAssignmentsKey(postId, gameId));
    if (!value) {
      return {};
    }

    const parsed: unknown = JSON.parse(value);
    return this.isPromptAssignments(parsed) ? parsed : {};
  }

  private isPromptPair(value: unknown): value is PromptPair {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    return (
      'id' in value &&
      'firstWord' in value &&
      'secondWord' in value &&
      'source' in value &&
      'category' in value &&
      'createdAt' in value &&
      typeof value.id === 'string' &&
      typeof value.firstWord === 'string' &&
      typeof value.secondWord === 'string' &&
      (value.source === 'CURATED' || value.source === 'USER_SUBMITTED' || value.source === 'MODERATOR_APPROVED' || value.source === 'AI_GENERATED') &&
      (typeof value.category === 'string' || value.category === null) &&
      typeof value.createdAt === 'string'
    );
  }

  private isPromptAssignments(value: unknown): value is Record<string, PlayerPromptState> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.values(value).every((entry) => this.isPromptState(entry));
  }

  private isPromptState(value: unknown): value is PlayerPromptState {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    return (
      'promptId' in value &&
      'firstWord' in value &&
      'secondWord' in value &&
      'secretWord' in value &&
      'isImpostor' in value &&
      'source' in value &&
      'category' in value &&
      'createdAt' in value &&
      typeof value.promptId === 'string' &&
      typeof value.firstWord === 'string' &&
      typeof value.secondWord === 'string' &&
      typeof value.secretWord === 'string' &&
      typeof value.isImpostor === 'boolean' &&
      (value.source === 'CURATED' || value.source === 'USER_SUBMITTED' || value.source === 'MODERATOR_APPROVED' || value.source === 'AI_GENERATED') &&
      (typeof value.category === 'string' || value.category === null) &&
      typeof value.createdAt === 'string'
    );
  }
}

export const promptService = new PromptService();
export const getPromptForGame = (postId: string, gameId: string): Promise<PromptPair> => promptService.getPromptForGame(postId, gameId);
export const getExistingPromptForGame = (postId: string, gameId: string): Promise<PromptPair | null> => promptService.getExistingPromptForGame(postId, gameId);
export const assignPromptStatesForGame = (postId: string, gameId: string, players: readonly string[], roles: Record<string, Role>): Promise<Record<string, PlayerPromptState>> =>
  promptService.assignPromptStatesForGame(postId, gameId, players, roles);
export const getPromptStateForPlayer = (postId: string, gameId: string, username: string): Promise<PlayerPromptState | null> => promptService.getPromptStateForPlayer(postId, gameId, username);
