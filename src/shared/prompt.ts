export type PromptPair = {
  id: string;
  villagerWord: string;
  impostorWord: string;
  category: string | null;
};

export type PlayerSecretWord = {
  secretWord: string;
};
