import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { isGameState } from '../shared/gameState';
import { isRole } from '../shared/role';
import type {
  CurrentPlayerRole,
  CompletedGame,
  JoinLobbyResult,
  LeaveLobbyResult,
  LobbyPlayer,
  LobbyState,
  PlayerSecretWord,
  SubmitVoteResult,
  VotingPlayer,
  VotingState,
} from '../shared/api';

const client = createTRPCUntypedClient<AnyRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});

export const trpc = {
  lobby: {
    get: {
      query: async (): Promise<LobbyState> => parseLobbyState(await client.query('lobby.get')),
    },
    join: {
      mutate: async (): Promise<JoinLobbyResult> => parseJoinLobbyResult(await client.mutation('lobby.join')),
    },
    leave: {
      mutate: async (): Promise<LeaveLobbyResult> => parseLeaveLobbyResult(await client.mutation('lobby.leave')),
    },
    continueWaiting: {
      mutate: async (): Promise<LobbyState> => parseLobbyState(await client.mutation('lobby.continueWaiting')),
    },
    playAgain: {
      mutate: async (): Promise<JoinLobbyResult> => parseJoinLobbyResult(await client.mutation('lobby.playAgain')),
    },
  },
  role: {
    current: {
      query: async (): Promise<CurrentPlayerRole> => parseCurrentPlayerRole(await client.query('role.current')),
    },
  },
  prompt: {
    current: {
      query: async (): Promise<{ prompt: PlayerSecretWord | null }> => parseCurrentPlayerPrompt(await client.query('prompt.current')),
    },
  },
  voting: {
    getVotingState: {
      query: async (): Promise<VotingState> => parseVotingState(await client.query('voting.getVotingState')),
    },
    submitVote: {
      mutate: async (targetPlayer: string): Promise<SubmitVoteResult> =>
        parseSubmitVoteResult(await client.mutation('voting.submitVote', { targetPlayer })),
    },
  },
};

const parseJoinLobbyResult = (value: unknown): JoinLobbyResult => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('lobby' in value) ||
    !('joined' in value) ||
    typeof value.joined !== 'boolean'
  ) {
    throw new Error('Invalid join lobby response');
  }

  const lobby = parseLobbyState(value.lobby);
  const reason = parseJoinReason(value);

  return reason ? { lobby, joined: value.joined, reason } : { lobby, joined: value.joined };
};

const parseLeaveLobbyResult = (value: unknown): LeaveLobbyResult => {
  if (typeof value !== 'object' || value === null || !('lobby' in value) || !('left' in value) || typeof value.left !== 'boolean') {
    throw new Error('Invalid leave lobby response');
  }

  if ('reason' in value && value.reason !== undefined && value.reason !== 'not_joined' && value.reason !== 'started') {
    throw new Error('Invalid leave reason response');
  }

  const lobby = parseLobbyState(value.lobby);
  if ('reason' in value && (value.reason === 'not_joined' || value.reason === 'started')) {
    return { lobby, left: value.left, reason: value.reason };
  }

  return { lobby, left: value.left };
};

const parseLobbyState = (value: unknown): LobbyState => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('postId' in value) ||
    !('gameId' in value) ||
    !('players' in value) ||
    !('gameState' in value) ||
    !('minPlayers' in value) ||
    !('maxPlayers' in value) ||
    !('currentUsername' in value) ||
    !('hasJoined' in value) ||
    !('waitingEndsAt' in value) ||
    !('wordRevealEndsAt' in value) ||
    !('discussionEndsAt' in value) ||
    !('completedGame' in value) ||
    typeof value.postId !== 'string' ||
    typeof value.gameId !== 'string' ||
    !Array.isArray(value.players) ||
    !isGameState(value.gameState) ||
    typeof value.minPlayers !== 'number' ||
    typeof value.maxPlayers !== 'number' ||
    typeof value.currentUsername !== 'string' ||
    typeof value.hasJoined !== 'boolean' ||
    !(typeof value.waitingEndsAt === 'string' || value.waitingEndsAt === null) ||
    !(typeof value.wordRevealEndsAt === 'string' || value.wordRevealEndsAt === null) ||
    !(typeof value.discussionEndsAt === 'string' || value.discussionEndsAt === null) ||
    !(value.completedGame === null || isCompletedGame(value.completedGame))
  ) {
    throw new Error('Invalid lobby response');
  }

  if (!value.players.every(isLobbyPlayer)) {
    throw new Error('Invalid lobby player response');
  }

  return {
    postId: value.postId,
    gameId: value.gameId,
    players: value.players,
    gameState: value.gameState,
    minPlayers: value.minPlayers,
    maxPlayers: value.maxPlayers,
    currentUsername: value.currentUsername,
    hasJoined: value.hasJoined,
    waitingEndsAt: value.waitingEndsAt,
    wordRevealEndsAt: value.wordRevealEndsAt,
    discussionEndsAt: value.discussionEndsAt,
    completedGame: value.completedGame,
  };
};

const isCompletedGame = (value: unknown): value is CompletedGame => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'gameId' in value &&
    'majorityWord' in value &&
    'differentWord' in value &&
    'differentWordUsername' in value &&
    'winningSide' in value &&
    'finishedAt' in value &&
    typeof value.gameId === 'string' &&
    typeof value.majorityWord === 'string' &&
    typeof value.differentWord === 'string' &&
    typeof value.differentWordUsername === 'string' &&
    (value.winningSide === 'VILLAGERS' || value.winningSide === 'IMPOSTOR') &&
    typeof value.finishedAt === 'string'
  );
};

const parseCurrentPlayerPrompt = (value: unknown): { prompt: PlayerSecretWord | null } => {
  if (typeof value !== 'object' || value === null || !('prompt' in value)) {
    throw new Error('Invalid current prompt response');
  }

  if (value.prompt === null) {
    return { prompt: null };
  }

  if (isPlayerSecretWord(value.prompt)) {
    return { prompt: value.prompt };
  }

  throw new Error('Invalid current prompt response');
};

const isPlayerSecretWord = (value: unknown): value is PlayerSecretWord => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'secretWord' in value &&
    typeof value.secretWord === 'string'
  );
};

const parseJoinReason = (value: object): JoinLobbyResult['reason'] => {
  if (!('reason' in value) || value.reason === undefined) {
    return undefined;
  }

  if (value.reason === 'already_joined' || value.reason === 'full' || value.reason === 'started') {
    return value.reason;
  }

  throw new Error('Invalid join reason response');
};

const parseCurrentPlayerRole = (value: unknown): CurrentPlayerRole => {
  if (typeof value !== 'object' || value === null || !('role' in value)) {
    throw new Error('Invalid current role response');
  }

  if (value.role === null) {
    return { role: null };
  }

  if (isRole(value.role)) {
    return { role: value.role };
  }

  throw new Error('Invalid current role response');
};

const parseSubmitVoteResult = (value: unknown): SubmitVoteResult => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('votingState' in value) ||
    !('accepted' in value) ||
    typeof value.accepted !== 'boolean'
  ) {
    throw new Error('Invalid submit vote response');
  }

  const votingState = parseVotingState(value.votingState);
  const reason = parseSubmitVoteReason(value);

  return reason ? { votingState, accepted: value.accepted, reason } : { votingState, accepted: value.accepted };
};

const parseVotingState = (value: unknown): VotingState => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('gameState' in value) ||
    !('alivePlayers' in value) ||
    !('selectedTarget' in value) ||
    !('votingEndsAt' in value) ||
    !('resultsEndsAt' in value) ||
    !('eliminatedUsername' in value) ||
    !('canVote' in value) ||
    !isGameState(value.gameState) ||
    !Array.isArray(value.alivePlayers) ||
    !(typeof value.selectedTarget === 'string' || value.selectedTarget === null) ||
    !(typeof value.votingEndsAt === 'string' || value.votingEndsAt === null) ||
    !(typeof value.resultsEndsAt === 'string' || value.resultsEndsAt === null) ||
    !(typeof value.eliminatedUsername === 'string' || value.eliminatedUsername === null) ||
    typeof value.canVote !== 'boolean'
  ) {
    throw new Error('Invalid voting state response');
  }

  if (!value.alivePlayers.every(isVotingPlayer)) {
    throw new Error('Invalid voting player response');
  }

  return {
    gameState: value.gameState,
    alivePlayers: value.alivePlayers,
    selectedTarget: value.selectedTarget,
    votingEndsAt: value.votingEndsAt,
    resultsEndsAt: value.resultsEndsAt,
    eliminatedUsername: value.eliminatedUsername,
    canVote: value.canVote,
  };
};

const parseSubmitVoteReason = (value: object): SubmitVoteResult['reason'] => {
  if (!('reason' in value) || value.reason === undefined) {
    return undefined;
  }

  if (
    value.reason === 'not_voting' ||
    value.reason === 'not_joined' ||
    value.reason === 'not_alive' ||
    value.reason === 'self_vote' ||
    value.reason === 'target_not_alive' ||
    value.reason === 'already_submitted'
  ) {
    return value.reason;
  }

  throw new Error('Invalid submit vote reason response');
};

const isLobbyPlayer = (value: unknown): value is LobbyPlayer => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'username' in value &&
    'joinedAt' in value &&
    typeof value.username === 'string' &&
    typeof value.joinedAt === 'string'
  );
};

const isVotingPlayer = (value: unknown): value is VotingPlayer => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'username' in value && 'isCurrentUser' in value && typeof value.username === 'string' && typeof value.isCurrentUser === 'boolean';
};
