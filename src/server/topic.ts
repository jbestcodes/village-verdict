import { redis } from '@devvit/web/server';
import type { DiscussionTopic } from '../shared/topic';

const topicKey = (postId: string, gameId: string): string => `village-verdict:topic:${postId}:${gameId}`;

type TopicCandidate = Pick<DiscussionTopic, 'id' | 'prompt' | 'source' | 'category'>;

// Keep topic selection behind this source boundary so curated prompts can later be
// replaced or supplemented by submitted, approved, categorized, or generated topics.
const curatedTopics: readonly TopicCandidate[] = [
  { id: 'pineapple-pizza', prompt: 'Pineapple belongs on pizza. Agree or disagree?', source: 'CURATED', category: 'food' },
  { id: 'programming-language', prompt: "What's the most overrated programming language?", source: 'CURATED', category: 'technology' },
  { id: 'cats-or-dogs', prompt: 'Cats or dogs?', source: 'CURATED', category: 'lifestyle' },
  { id: 'android-or-iphone', prompt: 'Android or iPhone?', source: 'CURATED', category: 'technology' },
  { id: 'coffee-or-tea', prompt: 'Coffee or tea?', source: 'CURATED', category: 'food' },
  { id: 'movie-sequel', prompt: 'Which movie deserved a sequel?', source: 'CURATED', category: 'movies' },
  { id: 'invisible-day', prompt: 'You wake up invisible for one day. What do you do?', source: 'CURATED', category: 'hypothetical' },
  { id: 'aliens-landed', prompt: "Aliens have landed. Convince the village you're human.", source: 'CURATED', category: 'hypothetical' },
  { id: 'ban-food', prompt: 'If you could ban one food forever, what would it be?', source: 'CURATED', category: 'food' },
  { id: 'argument-opinion', prompt: "What's one opinion that always starts an argument?", source: 'CURATED', category: 'opinions' },
  { id: 'best-breakfast', prompt: 'What is the best breakfast food?', source: 'CURATED', category: 'food' },
  { id: 'useless-talent', prompt: 'What is your most useless talent?', source: 'CURATED', category: 'personal' },
  { id: 'perfect-weekend', prompt: 'Describe your perfect weekend.', source: 'CURATED', category: 'lifestyle' },
  { id: 'time-travel', prompt: 'Would you rather visit the past or the future?', source: 'CURATED', category: 'hypothetical' },
  { id: 'comfort-show', prompt: 'What show can you rewatch forever?', source: 'CURATED', category: 'entertainment' },
  { id: 'best-season', prompt: 'Which season is the best, and why?', source: 'CURATED', category: 'lifestyle' },
  { id: 'superpower', prompt: 'Which superpower sounds useful but would actually be inconvenient?', source: 'CURATED', category: 'hypothetical' },
  { id: 'unpopular-food', prompt: 'What food do you love that most people dislike?', source: 'CURATED', category: 'food' },
  { id: 'phone-app', prompt: 'Which phone app could you not live without?', source: 'CURATED', category: 'technology' },
  { id: 'book-adaptation', prompt: 'Which book needs a faithful screen adaptation?', source: 'CURATED', category: 'books' },
  { id: 'childhood-game', prompt: 'What childhood game deserves a comeback?', source: 'CURATED', category: 'nostalgia' },
  { id: 'one-rule', prompt: 'If you could add one rule everyone had to follow, what would it be?', source: 'CURATED', category: 'hypothetical' },
  { id: 'best-smell', prompt: 'What is the best smell in the world?', source: 'CURATED', category: 'lifestyle' },
  { id: 'worst-chore', prompt: 'What is the worst household chore?', source: 'CURATED', category: 'lifestyle' },
  { id: 'fictional-home', prompt: 'Which fictional world would you choose to live in?', source: 'CURATED', category: 'fiction' },
  { id: 'late-night-snack', prompt: 'What is the ultimate late-night snack?', source: 'CURATED', category: 'food' },
  { id: 'school-subject', prompt: 'Which school subject should be taught differently?', source: 'CURATED', category: 'education' },
  { id: 'board-game', prompt: 'What board game ruins friendships fastest?', source: 'CURATED', category: 'games' },
  { id: 'one-invention', prompt: 'Which invention improved daily life the most?', source: 'CURATED', category: 'technology' },
  { id: 'travel-destination', prompt: 'Where would you go if you could leave tonight?', source: 'CURATED', category: 'travel' },
  { id: 'soup-sandwich', prompt: 'Is soup a meal or a side dish?', source: 'CURATED', category: 'food' },
  { id: 'theme-song', prompt: 'What song would be your personal theme song?', source: 'CURATED', category: 'music' },
  { id: 'minor-inconvenience', prompt: 'What minor inconvenience annoys you far too much?', source: 'CURATED', category: 'opinions' },
  { id: 'best-holiday', prompt: 'Which holiday has the best traditions?', source: 'CURATED', category: 'lifestyle' },
  { id: 'deserted-island', prompt: 'What three non-essential items would you bring to a deserted island?', source: 'CURATED', category: 'hypothetical' },
  { id: 'unnecessary-upgrade', prompt: 'What product gets upgraded far more often than necessary?', source: 'CURATED', category: 'technology' },
  { id: 'restaurant-chain', prompt: 'Which restaurant chain deserves more respect?', source: 'CURATED', category: 'food' },
  { id: 'small-luxury', prompt: 'What small luxury is worth paying extra for?', source: 'CURATED', category: 'lifestyle' },
  { id: 'dream-job', prompt: 'What job would you try for a year if money did not matter?', source: 'CURATED', category: 'hypothetical' },
  { id: 'fictional-sidekick', prompt: 'Which fictional sidekick would be the best roommate?', source: 'CURATED', category: 'fiction' },
  { id: 'pizza-topping', prompt: 'What pizza topping does not get enough credit?', source: 'CURATED', category: 'food' },
  { id: 'first-contact', prompt: 'What should humanity say first to extraterrestrials?', source: 'CURATED', category: 'hypothetical' },
  { id: 'best-video-game', prompt: 'What video game has the best soundtrack?', source: 'CURATED', category: 'games' },
  { id: 'morning-person', prompt: 'Are morning people born that way or made?', source: 'CURATED', category: 'lifestyle' },
  { id: 'museum-exhibit', prompt: 'What would you put in a museum exhibit about modern life?', source: 'CURATED', category: 'culture' },
  { id: 'old-tech', prompt: 'Which piece of old technology do you miss?', source: 'CURATED', category: 'nostalgia' },
  { id: 'perfect-sandwich', prompt: 'What makes the perfect sandwich?', source: 'CURATED', category: 'food' },
  { id: 'instant-skill', prompt: 'Which skill would you download into your brain instantly?', source: 'CURATED', category: 'hypothetical' },
  { id: 'best-animated-film', prompt: 'What is the greatest animated film of all time?', source: 'CURATED', category: 'movies' },
  { id: 'social-rule', prompt: 'Which unspoken social rule should disappear?', source: 'CURATED', category: 'opinions' },
  { id: 'weekend-without-internet', prompt: 'Could you happily spend a weekend without the internet?', source: 'CURATED', category: 'technology' },
];

export const getTopicForGame = async (postId: string, gameId: string): Promise<DiscussionTopic> => {
  const existingTopic = await readTopic(postId, gameId);

  if (existingTopic) {
    return existingTopic;
  }

  const candidate = curatedTopics[Math.floor(Math.random() * curatedTopics.length)];

  if (!candidate) {
    throw new Error('No discussion topics are configured');
  }

  const topic: DiscussionTopic = { ...candidate, createdAt: new Date().toISOString() };
  await redis.set(topicKey(postId, gameId), JSON.stringify(topic), { nx: true });

  const storedTopic = await readTopic(postId, gameId);

  if (!storedTopic) {
    throw new Error('Failed to create discussion topic');
  }

  return storedTopic;
};

export const getExistingTopicForGame = async (postId: string, gameId: string): Promise<DiscussionTopic | null> => readTopic(postId, gameId);

const readTopic = async (postId: string, gameId: string): Promise<DiscussionTopic | null> => {
  const value = await redis.get(topicKey(postId, gameId));

  if (!value) {
    return null;
  }

  const parsed: unknown = JSON.parse(value);

  return isDiscussionTopic(parsed) ? parsed : null;
};

const isDiscussionTopic = (value: unknown): value is DiscussionTopic => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'id' in value &&
    'prompt' in value &&
    'source' in value &&
    'category' in value &&
    'createdAt' in value &&
    typeof value.id === 'string' &&
    typeof value.prompt === 'string' &&
    value.source === 'CURATED' &&
    (typeof value.category === 'string' || value.category === null) &&
    typeof value.createdAt === 'string'
  );
};
