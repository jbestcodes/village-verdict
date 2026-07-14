import { context, redis, reddit } from '@devvit/web/server';
import { MAX_PLAYERS, MIN_PLAYERS } from '../shared/gameConfig';
import { isGameState, type GameState } from '../shared/gameState';
import type { CompletedGame, JoinLobbyResult, LeaveLobbyResult, LobbyPlayer, LobbyState, WinningSide } from '../shared/lobby';
import type { PlayerPromptState } from '../shared/prompt';
import { isRole, type CurrentPlayerRole, type Role } from '../shared/role';
import type { SubmitVoteResult, VotingPlayer, VotingState } from '../shared/voting';
import { getNextGameState } from './gameLifecycle';
import { getExistingPromptForGame, getPromptForGame, assignPromptStatesForGame, getPromptStateForPlayer } from './promptService';

const activeGameKey = (postId: string): string => `village-verdict:active-game:${postId}`;
const gameKey = (postId: string, gameId: string, name: string): string => `village-verdict:game:${postId}:${gameId}:${name}`;
const lobbyKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'lobby');
const gameStateKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'state');
const rolesKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'roles');
const alivePlayersKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'alive-players');
const phaseTimerKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'phase-timer');
const votesKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'votes');
const votingResultKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'voting-result');
const archiveKey = (postId: string, gameId: string): string => gameKey(postId, gameId, 'archive');
const completedGameKey = (postId: string, username: string): string => `village-verdict:completed-game:${postId}:${username}`;

const DISCUSSION_DURATION_MS = 30_000;
const VOTING_DURATION_MS = 60_000;

type GameContext = { postId: string; gameId: string; players: LobbyPlayer[]; gameState: GameState };
type StoredLobby = { players: LobbyPlayer[] };
type PhaseTimer = { inProgressEndsAt: string | null; votingEndsAt: string | null };
type VotingResult = { eliminatedUsername: string | null; eliminatedRole: Role | null; talliedAt: string };
type ArchivedGame = CompletedGame & { players: LobbyPlayer[]; roles: Record<string, Role>; votes: Record<string, string>; prompt: LobbyState['prompt']; timer: PhaseTimer };

export const getCurrentLobby = async (): Promise<LobbyState> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  return toLobbyState(game, username);
};

export const joinCurrentLobby = async (): Promise<JoinLobbyResult> => joinActiveGame();

export const playAgain = async (): Promise<JoinLobbyResult> => joinActiveGame();

export const leaveCurrentLobby = async (): Promise<LeaveLobbyResult> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  const isJoined = game.players.some((player) => player.username === username);
  if (!isJoined) return { lobby: await toLobbyState(game, username), left: false, reason: 'not_joined' };
  if (game.gameState !== 'WAITING' && game.gameState !== 'READY') return { lobby: await toLobbyState(game, username), left: false, reason: 'started' };

  const players = game.players.filter((player) => player.username !== username);
  const gameState = getNextGameState(game.gameState, players.length);
  const nextGame = { ...game, players, gameState };
  await Promise.all([writeStoredLobby(nextGame), writeGameState(nextGame)]);
  return { lobby: await toLobbyState(nextGame, username), left: true };
};

export const getCurrentPlayerRole = async (): Promise<CurrentPlayerRole> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  if (!isRoleVisibleState(game.gameState) || !game.players.some((player) => player.username === username)) return { role: null };
  const role = (await readRoles(game))[username];
  return isRole(role) ? { role } : { role: null };
};

export const getCurrentPlayerPrompt = async (): Promise<{ prompt: PlayerPromptState | null }> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  if (!isRoleVisibleState(game.gameState) || !game.players.some((player) => player.username === username)) return { prompt: null };
  const prompt = await getPromptStateForPlayer(game.postId, game.gameId, username);
  if (prompt) return { prompt };
  const roles = await readRoles(game);
  const assignments = await assignPromptStatesForGame(game.postId, game.gameId, game.players.map((player) => player.username), roles);
  return { prompt: assignments[username] ?? null };
};

export const getVotingState = async (): Promise<VotingState> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  return buildVotingState(game, username);
};

export const submitCurrentVote = async (targetPlayer: string): Promise<SubmitVoteResult> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  const alivePlayers = await readAlivePlayers(game);
  const rejected = async (reason: NonNullable<SubmitVoteResult['reason']>): Promise<SubmitVoteResult> => ({ votingState: await buildVotingState(game, username), accepted: false, reason });
  if (game.gameState !== 'VOTING') return rejected('not_voting');
  if (!game.players.some((player) => player.username === username)) return rejected('not_joined');
  if (!alivePlayers.includes(username)) return rejected('not_alive');
  if (targetPlayer === username) return rejected('self_vote');
  if (!alivePlayers.includes(targetPlayer)) return rejected('target_not_alive');
  const votes = await readVotes(game);
  if (votes[username] === targetPlayer) return rejected('already_submitted');
  await writeVotes(game, { ...votes, [username]: targetPlayer });
  return { votingState: await buildVotingState(game, username), accepted: true };
};

const joinActiveGame = async (): Promise<JoinLobbyResult> => {
  const username = await getCurrentUsername();
  const game = await syncGameState(await getActiveGame(getPostId()));
  const alreadyJoined = game.players.some((player) => player.username === username);
  if (alreadyJoined) return { lobby: await toLobbyState(game, username), joined: false, reason: 'already_joined' };
  if (game.gameState !== 'WAITING') return { lobby: await toLobbyState(game, username), joined: false, reason: 'started' };
  if (game.players.length >= MAX_PLAYERS) return { lobby: await toLobbyState(game, username), joined: false, reason: 'full' };
  const players = [...game.players, { username, joinedAt: new Date().toISOString() }];
  const nextGame = { ...game, players, gameState: getNextGameState(game.gameState, players.length) };
  await Promise.all([writeStoredLobby(nextGame), writeGameState(nextGame), redis.set(completedGameKey(game.postId, username), '')]);
  return { lobby: await toLobbyState(nextGame, username), joined: true };
};

const getActiveGame = async (postId: string): Promise<GameContext> => {
  const gameId = await redis.get(activeGameKey(postId));
  if (!gameId) return createFreshGame(postId);
  const [storedLobby, gameState] = await Promise.all([readStoredLobby(postId, gameId), readGameState(postId, gameId)]);
  return { postId, gameId, players: storedLobby.players, gameState };
};

const createFreshGame = async (postId: string): Promise<GameContext> => {
  const game: GameContext = { postId, gameId: `game-${globalThis.crypto.randomUUID()}`, players: [], gameState: 'WAITING' };
  await Promise.all([redis.set(activeGameKey(postId), game.gameId), writeStoredLobby(game), writeGameState(game)]);
  return game;
};

const syncGameState = async (game: GameContext): Promise<GameContext> => {
  if (game.gameState === 'IN_PROGRESS') return syncInProgressState(game);
  if (game.gameState === 'VOTING') return syncVotingState(game);
  const gameState = getNextGameState(game.gameState, game.players.length);
  if (gameState === game.gameState) return game;
  const nextGame = { ...game, gameState };
  if (gameState === 'IN_PROGRESS') {
    await Promise.all([assignRoles(nextGame), getPromptForGame(game.postId, game.gameId), initializeAlivePlayers(nextGame), initializeInProgressTimer(nextGame)]);
    const roles = await readRoles(nextGame);
    await assignPromptStatesForGame(game.postId, game.gameId, nextGame.players.map((player) => player.username), roles);
  }
  await writeGameState(nextGame);
  return nextGame;
};

const syncInProgressState = async (game: GameContext): Promise<GameContext> => {
  const timer = await readPhaseTimer(game);
  if (!timer.inProgressEndsAt) {
    await Promise.all([initializeAlivePlayers(game), initializeInProgressTimer(game)]);
    return game;
  }
  if (new Date(timer.inProgressEndsAt).getTime() > Date.now()) return game;
  await startVoting(game);
  const nextGame = { ...game, gameState: 'VOTING' as const };
  await writeGameState(nextGame);
  return nextGame;
};

const syncVotingState = async (game: GameContext): Promise<GameContext> => {
  const timer = await readPhaseTimer(game);
  if (!timer.votingEndsAt) {
    await startVoting(game);
    return game;
  }
  if (new Date(timer.votingEndsAt).getTime() > Date.now()) return game;
  const result = await tallyVotes(game);
  return finishGame(game, result);
};

const finishGame = async (game: GameContext, result: VotingResult): Promise<GameContext> => {
  const [roles, votes, prompt, timer] = await Promise.all([readRoles(game), readVotes(game), getExistingPromptForGame(game.postId, game.gameId), readPhaseTimer(game)]);
  const winningSide: WinningSide = result.eliminatedRole === 'IMPOSTOR' ? 'VILLAGERS' : 'IMPOSTOR';
  const completedGame: CompletedGame = { gameId: game.gameId, eliminatedUsername: result.eliminatedUsername, eliminatedRole: result.eliminatedRole, winningSide, finishedAt: new Date().toISOString() };
  const archive: ArchivedGame = { ...completedGame, players: game.players, roles, votes, prompt, timer };
  const freshGame: GameContext = { postId: game.postId, gameId: `game-${globalThis.crypto.randomUUID()}`, players: [], gameState: 'WAITING' };
  await Promise.all([
    redis.set(archiveKey(game.postId, game.gameId), JSON.stringify(archive)),
    redis.set(activeGameKey(game.postId), freshGame.gameId),
    writeStoredLobby(freshGame),
    writeGameState(freshGame),
    ...game.players.map((player) => redis.set(completedGameKey(game.postId, player.username), game.gameId)),
  ]);
  return freshGame;
};

const assignRoles = async (game: GameContext): Promise<void> => {
  if (game.players.length === 0) return;
  const existingRoles = await readRoles(game);
  if (hasCompleteRoleSet(existingRoles, game.players)) return;
  const impostorIndex = Math.floor(Math.random() * game.players.length);
  const roles: Record<string, Role> = {};
  game.players.forEach((player, index) => { roles[player.username] = index === impostorIndex ? 'IMPOSTOR' : 'VILLAGER'; });
  await redis.set(rolesKey(game.postId, game.gameId), JSON.stringify(roles));
};

const initializeAlivePlayers = async (game: GameContext): Promise<void> => {
  if ((await readAlivePlayers(game)).length > 0) return;
  await writeAlivePlayers(game, game.players.map((player) => player.username));
};

const initializeInProgressTimer = async (game: GameContext): Promise<void> => {
  const timer = await readPhaseTimer(game);
  if (timer.inProgressEndsAt) return;
  await writePhaseTimer(game, { inProgressEndsAt: new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString(), votingEndsAt: null });
};

const startVoting = async (game: GameContext): Promise<void> => {
  const [timer, alivePlayers] = await Promise.all([readPhaseTimer(game), readAlivePlayers(game)]);
  await Promise.all([writeAlivePlayers(game, alivePlayers.length > 0 ? alivePlayers : game.players.map((player) => player.username)), writePhaseTimer(game, { inProgressEndsAt: timer.inProgressEndsAt, votingEndsAt: timer.votingEndsAt ?? new Date(Date.now() + VOTING_DURATION_MS).toISOString() })]);
};

const tallyVotes = async (game: GameContext): Promise<VotingResult> => {
  const existingResult = await readVotingResult(game);
  if (existingResult) return existingResult;
  const [alivePlayers, votes, roles] = await Promise.all([readAlivePlayers(game), readVotes(game), readRoles(game)]);
  const counts = alivePlayers.map((username) => ({ username, count: Object.entries(votes).filter(([voter, target]) => alivePlayers.includes(voter) && target === username).length }));
  const mostVotes = counts.length === 0 ? 0 : Math.max(...counts.map((entry) => entry.count));
  const tiedPlayers = counts.filter((entry) => entry.count === mostVotes).map((entry) => entry.username);
  const eliminatedUsername = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)] ?? null;
  const result: VotingResult = { eliminatedUsername, eliminatedRole: eliminatedUsername ? roles[eliminatedUsername] ?? null : null, talliedAt: new Date().toISOString() };
  await Promise.all([writeAlivePlayers(game, eliminatedUsername ? alivePlayers.filter((username) => username !== eliminatedUsername) : alivePlayers), writeVotingResult(game, result)]);
  return result;
};

const buildVotingState = async (game: GameContext, currentUsername: string): Promise<VotingState> => {
  const [alivePlayerNames, votes, timer, result] = await Promise.all([readAlivePlayers(game), readVotes(game), readPhaseTimer(game), readVotingResult(game)]);
  const alivePlayers = alivePlayerNames.length > 0 ? alivePlayerNames : game.players.map((player) => player.username);
  return { gameState: game.gameState, alivePlayers: alivePlayers.map((username): VotingPlayer => ({ username, isCurrentUser: username === currentUsername })), selectedTarget: votes[currentUsername] ?? null, votingEndsAt: game.gameState === 'VOTING' ? timer.votingEndsAt : null, eliminatedUsername: result?.eliminatedUsername ?? null, eliminatedRole: result?.eliminatedRole ?? null, canVote: game.gameState === 'VOTING' && alivePlayers.includes(currentUsername) };
};

const toLobbyState = async (game: GameContext, username: string): Promise<LobbyState> => ({ postId: game.postId, gameId: game.gameId, players: game.players, gameState: game.gameState, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, currentUsername: username, hasJoined: game.players.some((player) => player.username === username), prompt: isRoleVisibleState(game.gameState) ? await getExistingPromptForGame(game.postId, game.gameId) : null, completedGame: await getCompletedGame(game.postId, username) });

const getCompletedGame = async (postId: string, username: string): Promise<CompletedGame | null> => {
  const completedGameId = await redis.get(completedGameKey(postId, username));
  if (!completedGameId) return null;
  const value = await redis.get(archiveKey(postId, completedGameId));
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  return isArchivedGame(parsed) ? { gameId: parsed.gameId, eliminatedUsername: parsed.eliminatedUsername, eliminatedRole: parsed.eliminatedRole, winningSide: parsed.winningSide, finishedAt: parsed.finishedAt } : null;
};

const readStoredLobby = async (postId: string, gameId: string): Promise<StoredLobby> => parseStoredLobby(await redis.get(lobbyKey(postId, gameId)));
const writeStoredLobby = async (game: GameContext): Promise<void> => { await redis.set(lobbyKey(game.postId, game.gameId), JSON.stringify({ players: game.players })); };
const readGameState = async (postId: string, gameId: string): Promise<GameState> => { const value = await redis.get(gameStateKey(postId, gameId)); return isGameState(value) ? value : 'WAITING'; };
const writeGameState = async (game: GameContext): Promise<void> => { await redis.set(gameStateKey(game.postId, game.gameId), game.gameState); };
const readRoles = async (game: GameContext): Promise<Record<string, Role>> => parseRoles(await redis.get(rolesKey(game.postId, game.gameId)));
const readAlivePlayers = async (game: GameContext): Promise<string[]> => parseStringArray(await redis.get(alivePlayersKey(game.postId, game.gameId)), game.players.map((player) => player.username));
const writeAlivePlayers = async (game: GameContext, players: string[]): Promise<void> => { await redis.set(alivePlayersKey(game.postId, game.gameId), JSON.stringify(players)); };
const readPhaseTimer = async (game: GameContext): Promise<PhaseTimer> => parsePhaseTimer(await redis.get(phaseTimerKey(game.postId, game.gameId)));
const writePhaseTimer = async (game: GameContext, timer: PhaseTimer): Promise<void> => { await redis.set(phaseTimerKey(game.postId, game.gameId), JSON.stringify(timer)); };
const readVotes = async (game: GameContext): Promise<Record<string, string>> => parseVotes(await redis.get(votesKey(game.postId, game.gameId)));
const writeVotes = async (game: GameContext, votes: Record<string, string>): Promise<void> => { await redis.set(votesKey(game.postId, game.gameId), JSON.stringify(votes)); };
const readVotingResult = async (game: GameContext): Promise<VotingResult | null> => parseVotingResult(await redis.get(votingResultKey(game.postId, game.gameId)));
const writeVotingResult = async (game: GameContext, result: VotingResult): Promise<void> => { await redis.set(votingResultKey(game.postId, game.gameId), JSON.stringify(result)); };

const getPostId = (): string => { if (!context.postId) throw new Error('Missing Devvit post context'); return context.postId; };
const getCurrentUsername = async (): Promise<string> => { const username = await reddit.getCurrentUsername(); if (!username) throw new Error('Missing Reddit user context'); return username; };
const isRoleVisibleState = (state: GameState): boolean => state === 'IN_PROGRESS' || state === 'VOTING';
const hasCompleteRoleSet = (roles: Record<string, Role>, players: LobbyPlayer[]): boolean => players.length > 0 && players.filter((player) => roles[player.username] === 'IMPOSTOR').length === 1 && players.every((player) => isRole(roles[player.username])) && Object.keys(roles).every((username) => players.some((player) => player.username === username));
const parseStoredLobby = (value: string | null | undefined): StoredLobby => { if (!value) return { players: [] }; const parsed: unknown = JSON.parse(value); return isStoredLobby(parsed) ? parsed : { players: [] }; };
const parseRoles = (value: string | null | undefined): Record<string, Role> => { if (!value) return {}; const parsed: unknown = JSON.parse(value); return isStoredRoles(parsed) ? parsed : {}; };
const parseStringArray = (value: string | null | undefined, fallback: string[]): string[] => { if (!value) return fallback; const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : fallback; };
const parsePhaseTimer = (value: string | null | undefined): PhaseTimer => { if (!value) return { inProgressEndsAt: null, votingEndsAt: null }; const parsed: unknown = JSON.parse(value); return isPhaseTimer(parsed) ? parsed : { inProgressEndsAt: null, votingEndsAt: null }; };
const parseVotes = (value: string | null | undefined): Record<string, string> => { if (!value) return {}; const parsed: unknown = JSON.parse(value); return isStoredVotes(parsed) ? parsed : {}; };
const parseVotingResult = (value: string | null | undefined): VotingResult | null => { if (!value) return null; const parsed: unknown = JSON.parse(value); return isVotingResult(parsed) ? parsed : null; };
const isStoredLobby = (value: unknown): value is StoredLobby => typeof value === 'object' && value !== null && 'players' in value && Array.isArray(value.players) && value.players.every((player) => typeof player === 'object' && player !== null && 'username' in player && 'joinedAt' in player && typeof player.username === 'string' && typeof player.joinedAt === 'string');
const isStoredRoles = (value: unknown): value is Record<string, Role> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(isRole);
const isPhaseTimer = (value: unknown): value is PhaseTimer => typeof value === 'object' && value !== null && 'inProgressEndsAt' in value && 'votingEndsAt' in value && (typeof value.inProgressEndsAt === 'string' || value.inProgressEndsAt === null) && (typeof value.votingEndsAt === 'string' || value.votingEndsAt === null);
const isStoredVotes = (value: unknown): value is Record<string, string> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === 'string');
const isVotingResult = (value: unknown): value is VotingResult => typeof value === 'object' && value !== null && 'eliminatedUsername' in value && 'eliminatedRole' in value && 'talliedAt' in value && (typeof value.eliminatedUsername === 'string' || value.eliminatedUsername === null) && (isRole(value.eliminatedRole) || value.eliminatedRole === null) && typeof value.talliedAt === 'string';
const isArchivedGame = (value: unknown): value is ArchivedGame => typeof value === 'object' && value !== null && 'gameId' in value && 'eliminatedUsername' in value && 'eliminatedRole' in value && 'winningSide' in value && 'finishedAt' in value && typeof value.gameId === 'string' && (typeof value.eliminatedUsername === 'string' || value.eliminatedUsername === null) && (isRole(value.eliminatedRole) || value.eliminatedRole === null) && (value.winningSide === 'VILLAGERS' || value.winningSide === 'IMPOSTOR') && typeof value.finishedAt === 'string';
