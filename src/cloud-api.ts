import { makeFunctionReference } from 'convex/server';

export type Credentials = { deviceToken?: string };
export type CloudDraft = { source: string; revision: number; updatedAt: number };
export type Account = { owner: string; name: string; expiresAt: number | null };
export type SaveArgs = Credentials & { source: string; baseRevision: number; operationId: string };
export type SaveResult = { status: 'saved' | 'conflict'; revision: number };

export const padApi = {
  session: makeFunctionReference<'query', Credentials, Account | null>('pad:session'),
  get: makeFunctionReference<'query', Credentials, CloudDraft | null>('pad:get'),
  save: makeFunctionReference<'mutation', SaveArgs, SaveResult>('pad:save'),
  disconnect: makeFunctionReference<'mutation', { deviceToken: string }, null>('pad:disconnect'),
};
