export type PromptSource = 'CURATED' | 'USER_SUBMITTED' | 'MODERATOR_APPROVED' | 'AI_GENERATED';

export type PromptPair = {
  id: string;
  firstWord: string;
  secondWord: string;
  source: PromptSource;
  category: string | null;
  createdAt: string;
};

export type PlayerPromptState = {
  promptId: string;
  firstWord: string;
  secondWord: string;
  secretWord: string;
  isImpostor: boolean;
  source: PromptSource;
  category: string | null;
  createdAt: string;
};
