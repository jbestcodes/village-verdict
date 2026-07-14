import type { GameState } from './gameState';
import type { Role } from './role';

export type VotingPlayer = {
  username: string;
  isCurrentUser: boolean;
};

export type VotingState = {
  gameState: GameState;
  alivePlayers: VotingPlayer[];
  selectedTarget: string | null;
  votingEndsAt: string | null;
  eliminatedUsername: string | null;
  eliminatedRole: Role | null;
  canVote: boolean;
};

export type SubmitVoteResult = {
  votingState: VotingState;
  accepted: boolean;
  reason?: 'not_voting' | 'not_joined' | 'not_alive' | 'self_vote' | 'target_not_alive' | 'already_submitted';
};
