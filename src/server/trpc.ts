import { TRPCError, initTRPC } from '@trpc/server';
import { getCurrentLobby, getCurrentPlayerRole, getVotingState, joinCurrentLobby, submitCurrentVote } from './lobby';

const t = initTRPC.create();

const parseSubmitVoteInput = (value: unknown): { targetPlayer: string } => {
  if (typeof value !== 'object' || value === null || !('targetPlayer' in value) || typeof value.targetPlayer !== 'string') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Missing target player' });
  }

  return {
    targetPlayer: value.targetPlayer,
  };
};

export const appRouter = t.router({
  lobby: t.router({
    get: t.procedure.query(() => getCurrentLobby()),
    join: t.procedure.mutation(() => joinCurrentLobby()),
  }),
  role: t.router({
    current: t.procedure.query(() => getCurrentPlayerRole()),
  }),
  voting: t.router({
    getVotingState: t.procedure.query(() => getVotingState()),
    submitVote: t.procedure.input(parseSubmitVoteInput).mutation(({ input }) => submitCurrentVote(input.targetPlayer)),
  }),
});

export type AppRouter = typeof appRouter;
