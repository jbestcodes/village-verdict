import { context, redis, reddit } from '@devvit/web/server';
import { isGameState, type GameState } from '../shared/gameState';
import { MAX_PLAYERS, MIN_PLAYERS, type JoinLobbyResult, type LobbyPlayer, type LobbyState } from '../shared/lobby';
import { isRole, type CurrentPlayerRole, type Role } from '../shared/role';
import type { SubmitVoteResult, VotingPlayer, VotingState } from '../shared/voting';
import { getNextGameState } from './gameLifecycle';

const lobbyKey = (postId: string) => `village-verdict:lobby:${postId}`;
const gameStateKey = (postId: string) => `village-verdict:game-state:${postId}`;
const rolesKey = (postId: string) => `village-verdict:roles:${postId}`;
const alivePlayersKey = (postId: string) => `village-verdict:alive-players:${postId}`;
const phaseTimerKey = (postId: string) => `village-verdict:phase-timer:${postId}`;
const votesKey = (postId: string) => `village-verdict:votes:${postId}`;
const votingResultKey = (postId: string) => `village-verdict:voting-result:${postId}`;

const DISCUSSION_DURATION_MS = 30_000;
const VOTING_DURATION_MS = 60_000;

type StoredLobby = {
  players: LobbyPlayer[];
};

type PhaseTimer = {
  inProgressEndsAt: string | null;
  votingEndsAt: string | null;
};

type VotingResult = {
  eliminatedUsername: string | null;
  talliedAt: string;
};

export const getCurrentLobby = async (): Promise<LobbyState> => {
  const postId = getPostId();
  const username = await getCurrentUsername();
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId), readGameState(postId)]);
  const nextGameState = await syncGameState(postId, gameState, storedLobby.players);

  return toLobbyState(postId, storedLobby.players, nextGameState, username);
};

export const joinCurrentLobby = async (): Promise<JoinLobbyResult> => {
  const postId = getPostId();
  const username = await getCurrentUsername();
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId), readGameState(postId)]);
  const syncedGameState = await syncGameState(postId, gameState, storedLobby.players);
  const alreadyJoined = storedLobby.players.some((player) => player.username === username);

  if (alreadyJoined) {
    return {
      lobby: toLobbyState(postId, storedLobby.players, syncedGameState, username),
      joined: false,
      reason: 'already_joined',
    };
  }

  if (syncedGameState !== 'WAITING') {
    return {
      lobby: toLobbyState(postId, storedLobby.players, syncedGameState, username),
      joined: false,
      reason: 'started',
    };
  }

  if (storedLobby.players.length >= MAX_PLAYERS) {
    return {
      lobby: toLobbyState(postId, storedLobby.players, syncedGameState, username),
      joined: false,
      reason: 'full',
    };
  }

  const players = [...storedLobby.players, { username, joinedAt: new Date().toISOString() }];
  const nextGameState = getNextGameState(gameState, players.length);
  await Promise.all([redis.set(lobbyKey(postId), JSON.stringify({ players })), writeGameState(postId, nextGameState)]);

  return {
    lobby: toLobbyState(postId, players, nextGameState, username),
    joined: true,
  };
};

export const getCurrentPlayerRole = async (): Promise<CurrentPlayerRole> => {
  const postId = getPostId();
  const username = await getCurrentUsername();
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId), readGameState(postId)]);
  const nextGameState = await syncGameState(postId, gameState, storedLobby.players);

  if (!isRoleVisibleState(nextGameState) || !storedLobby.players.some((player) => player.username === username)) {
    return { role: null };
  }

  const roles = await readRoles(postId);
  const role = roles[username];

  return isRole(role) ? { role } : { role: null };
};

export const getVotingState = async (): Promise<VotingState> => {
  const postId = getPostId();
  const username = await getCurrentUsername();
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId), readGameState(postId)]);
  const nextGameState = await syncGameState(postId, gameState, storedLobby.players);

  return buildVotingState(postId, storedLobby.players, nextGameState, username);
};

export const submitCurrentVote = async (targetPlayer: string): Promise<SubmitVoteResult> => {
  const postId = getPostId();
  const username = await getCurrentUsername();
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId), readGameState(postId)]);
  const nextGameState = await syncGameState(postId, gameState, storedLobby.players);
  const alivePlayers = await readAlivePlayers(postId, storedLobby.players);

  if (nextGameState !== 'VOTING') {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'not_voting',
    };
  }

  if (!storedLobby.players.some((player) => player.username === username)) {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'not_joined',
    };
  }

  if (!alivePlayers.includes(username)) {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'not_alive',
    };
  }

  if (targetPlayer === username) {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'self_vote',
    };
  }

  if (!alivePlayers.includes(targetPlayer)) {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'target_not_alive',
    };
  }

  const votes = await getCurrentVotes(postId);

  if (votes[username] === targetPlayer) {
    return {
      votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
      accepted: false,
      reason: 'already_submitted',
    };
  }

  await writeVotes(postId, { ...votes, [username]: targetPlayer });

  return {
    votingState: await buildVotingState(postId, storedLobby.players, nextGameState, username),
    accepted: true,
  };
};

export const getCurrentVotes = async (postId: string): Promise<Record<string, string>> => {
  const value = await redis.get(votesKey(postId));

  if (!value) {
    return {};
  }

  const parsed: unknown = JSON.parse(value);

  if (!isStoredVotes(parsed)) {
    return {};
  }

  return parsed;
};

const getPostId = (): string => {
  if (!context.postId) {
    throw new Error('Missing Devvit post context');
  }

  return context.postId;
};

const getCurrentUsername = async (): Promise<string> => {
  const username = await reddit.getCurrentUsername();

  if (!username) {
    throw new Error('Missing Reddit user context');
  }

  return username;
};

const readStoredLobby = async (postId: string): Promise<StoredLobby> => {
  const value = await redis.get(lobbyKey(postId));

  if (!value) {
    return { players: [] };
  }

  const parsed: unknown = JSON.parse(value);

  if (!isStoredLobby(parsed)) {
    return { players: [] };
  }

  return parsed;
};

const readGameState = async (postId: string): Promise<GameState> => {
  const value = await redis.get(gameStateKey(postId));

  return isGameState(value) ? value : 'WAITING';
};

const writeGameState = async (postId: string, gameState: GameState): Promise<void> => {
  await redis.set(gameStateKey(postId), gameState);
};

const syncGameState = async (postId: string, gameState: GameState, players: LobbyPlayer[]): Promise<GameState> => {
  if (gameState === 'IN_PROGRESS') {
    return syncInProgressState(postId, players);
  }

  if (gameState === 'VOTING') {
    return syncVotingState(postId, players);
  }

  const nextGameState = getNextGameState(gameState, players.length);

  if (nextGameState !== gameState) {
    if (nextGameState === 'IN_PROGRESS') {
      await Promise.all([assignRoles(postId, players), initializeAlivePlayers(postId, players), initializeInProgressTimer(postId)]);
    }

    await writeGameState(postId, nextGameState);
  }

  return nextGameState;
};

const syncInProgressState = async (postId: string, players: LobbyPlayer[]): Promise<GameState> => {
  const timer = await readPhaseTimer(postId);

  if (!timer.inProgressEndsAt) {
    await Promise.all([initializeAlivePlayers(postId, players), initializeInProgressTimer(postId)]);
    return 'IN_PROGRESS';
  }

  if (new Date(timer.inProgressEndsAt).getTime() > Date.now()) {
    return 'IN_PROGRESS';
  }

  await startVoting(postId, players);
  await writeGameState(postId, 'VOTING');

  return 'VOTING';
};

const syncVotingState = async (postId: string, players: LobbyPlayer[]): Promise<GameState> => {
  const timer = await readPhaseTimer(postId);

  if (!timer.votingEndsAt) {
    await startVoting(postId, players);
    return 'VOTING';
  }

  if (new Date(timer.votingEndsAt).getTime() > Date.now()) {
    return 'VOTING';
  }

  await tallyVotes(postId, players);
  await writeGameState(postId, 'RESULTS');

  return 'RESULTS';
};

const assignRoles = async (postId: string, players: LobbyPlayer[]): Promise<void> => {
  if (players.length === 0) {
    return;
  }

  const existingRoles = await readRoles(postId);

  if (hasCompleteRoleSet(existingRoles, players)) {
    return;
  }

  const impostorIndex = Math.floor(Math.random() * players.length);
  const roles: Record<string, Role> = {};

  players.forEach((player, index) => {
    roles[player.username] = index === impostorIndex ? 'IMPOSTOR' : 'VILLAGER';
  });

  await redis.set(rolesKey(postId), JSON.stringify(roles));
};

const readRoles = async (postId: string): Promise<Record<string, Role>> => {
  const value = await redis.get(rolesKey(postId));

  if (!value) {
    return {};
  }

  const parsed: unknown = JSON.parse(value);

  if (!isStoredRoles(parsed)) {
    return {};
  }

  return parsed;
};

const initializeAlivePlayers = async (postId: string, players: LobbyPlayer[]): Promise<void> => {
  const alivePlayers = await readAlivePlayers(postId, players);

  if (alivePlayers.length > 0) {
    return;
  }

  await writeAlivePlayers(
    postId,
    players.map((player) => player.username)
  );
};

const initializeInProgressTimer = async (postId: string): Promise<void> => {
  const timer = await readPhaseTimer(postId);

  if (timer.inProgressEndsAt) {
    return;
  }

  await writePhaseTimer(postId, {
    inProgressEndsAt: new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString(),
    votingEndsAt: null,
  });
};

const startVoting = async (postId: string, players: LobbyPlayer[]): Promise<void> => {
  const timer = await readPhaseTimer(postId);
  const alivePlayers = await readAlivePlayers(postId, players);
  const nextAlivePlayers = alivePlayers.length > 0 ? alivePlayers : players.map((player) => player.username);

  await Promise.all([
    writeAlivePlayers(postId, nextAlivePlayers),
    writePhaseTimer(postId, {
      inProgressEndsAt: timer.inProgressEndsAt,
      votingEndsAt: timer.votingEndsAt ?? new Date(Date.now() + VOTING_DURATION_MS).toISOString(),
    }),
  ]);
};

const tallyVotes = async (postId: string, players: LobbyPlayer[]): Promise<void> => {
  const existingResult = await readVotingResult(postId);

  if (existingResult) {
    return;
  }

  const alivePlayers = await readAlivePlayers(postId, players);
  const votes = await getCurrentVotes(postId);
  const voteCounts = alivePlayers.map((username) => ({
    username,
    count: Object.entries(votes).filter(
      ([voterUsername, targetUsername]) => alivePlayers.includes(voterUsername) && targetUsername === username
    ).length,
  }));
  const mostVotes = voteCounts.length > 0 ? Math.max(...voteCounts.map((voteCount) => voteCount.count)) : 0;
  const tiedPlayers = voteCounts.filter((voteCount) => voteCount.count === mostVotes).map((voteCount) => voteCount.username);
  const randomTiedPlayer = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
  const eliminatedUsername = randomTiedPlayer ?? null;
  const nextAlivePlayers = eliminatedUsername ? alivePlayers.filter((username) => username !== eliminatedUsername) : alivePlayers;

  await Promise.all([
    writeAlivePlayers(postId, nextAlivePlayers),
    writeVotingResult(postId, {
      eliminatedUsername,
      talliedAt: new Date().toISOString(),
    }),
  ]);
};

const buildVotingState = async (
  postId: string,
  players: LobbyPlayer[],
  gameState: GameState,
  currentUsername: string
): Promise<VotingState> => {
  const [alivePlayerNames, votes, timer, votingResult] = await Promise.all([
    readAlivePlayers(postId, players),
    getCurrentVotes(postId),
    readPhaseTimer(postId),
    readVotingResult(postId),
  ]);
  const fallbackAlivePlayers = players.map((player) => player.username);
  const alivePlayers = alivePlayerNames.length > 0 ? alivePlayerNames : fallbackAlivePlayers;

  return {
    gameState,
    alivePlayers: alivePlayers.map((username): VotingPlayer => ({ username, isCurrentUser: username === currentUsername })),
    selectedTarget: votes[currentUsername] ?? null,
    votingEndsAt: gameState === 'VOTING' ? timer.votingEndsAt : null,
    eliminatedUsername: votingResult?.eliminatedUsername ?? null,
    canVote: gameState === 'VOTING' && alivePlayers.includes(currentUsername),
  };
};

const readAlivePlayers = async (postId: string, players: LobbyPlayer[]): Promise<string[]> => {
  const value = await redis.get(alivePlayersKey(postId));

  if (!value) {
    return players.map((player) => player.username);
  }

  const parsed: unknown = JSON.parse(value);

  if (!isStringArray(parsed)) {
    return players.map((player) => player.username);
  }

  return parsed;
};

const writeAlivePlayers = async (postId: string, alivePlayers: string[]): Promise<void> => {
  await redis.set(alivePlayersKey(postId), JSON.stringify(alivePlayers));
};

const readPhaseTimer = async (postId: string): Promise<PhaseTimer> => {
  const value = await redis.get(phaseTimerKey(postId));

  if (!value) {
    return { inProgressEndsAt: null, votingEndsAt: null };
  }

  const parsed: unknown = JSON.parse(value);

  if (!isPhaseTimer(parsed)) {
    return { inProgressEndsAt: null, votingEndsAt: null };
  }

  return parsed;
};

const writePhaseTimer = async (postId: string, timer: PhaseTimer): Promise<void> => {
  await redis.set(phaseTimerKey(postId), JSON.stringify(timer));
};

const writeVotes = async (postId: string, votes: Record<string, string>): Promise<void> => {
  await redis.set(votesKey(postId), JSON.stringify(votes));
};

const readVotingResult = async (postId: string): Promise<VotingResult | null> => {
  const value = await redis.get(votingResultKey(postId));

  if (!value) {
    return null;
  }

  const parsed: unknown = JSON.parse(value);

  if (!isVotingResult(parsed)) {
    return null;
  }

  return parsed;
};

const writeVotingResult = async (postId: string, result: VotingResult): Promise<void> => {
  await redis.set(votingResultKey(postId), JSON.stringify(result));
};

const toLobbyState = (
  postId: string,
  players: LobbyPlayer[],
  gameState: GameState,
  currentUsername: string
): LobbyState => ({
  postId,
  players,
  gameState,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  currentUsername,
  hasJoined: players.some((player) => player.username === currentUsername),
});

const isStoredLobby = (value: unknown): value is StoredLobby => {
  if (typeof value !== 'object' || value === null || !('players' in value)) {
    return false;
  }

  return Array.isArray(value.players) && value.players.every(isLobbyPlayer);
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

const isStoredRoles = (value: unknown): value is Record<string, Role> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isRole);
};

const hasCompleteRoleSet = (roles: Record<string, Role>, players: LobbyPlayer[]): boolean => {
  const playerNames = players.map((player) => player.username);
  const impostorCount = playerNames.filter((username) => roles[username] === 'IMPOSTOR').length;
  const allPlayersHaveRoles = playerNames.every((username) => isRole(roles[username]));
  const onlyCurrentPlayersHaveRoles = Object.keys(roles).every((username) => playerNames.includes(username));

  return impostorCount === 1 && allPlayersHaveRoles && onlyCurrentPlayersHaveRoles;
};

const isRoleVisibleState = (gameState: GameState): boolean => {
  return gameState === 'IN_PROGRESS' || gameState === 'VOTING' || gameState === 'RESULTS';
};

const isStoredVotes = (value: unknown): value is Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((voteTarget) => typeof voteTarget === 'string');
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

const isPhaseTimer = (value: unknown): value is PhaseTimer => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'inProgressEndsAt' in value &&
    'votingEndsAt' in value &&
    (typeof value.inProgressEndsAt === 'string' || value.inProgressEndsAt === null) &&
    (typeof value.votingEndsAt === 'string' || value.votingEndsAt === null)
  );
};

const isVotingResult = (value: unknown): value is VotingResult => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'eliminatedUsername' in value &&
    'talliedAt' in value &&
    (typeof value.eliminatedUsername === 'string' || value.eliminatedUsername === null) &&
    typeof value.talliedAt === 'string'
  );
};
