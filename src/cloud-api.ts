import { makeFunctionReference } from 'convex/server';
import type { StudyFile } from './study-library';

export type Credentials = { deviceToken?: string };
export type CloudDraft = { source: string; revision: number; updatedAt: number };
export type Account = { owner: string; name: string; expiresAt: number | null };
export type SaveArgs = Credentials & { source: string; baseRevision: number; operationId: string };
export type SaveResult = { status: 'saved' | 'conflict'; revision: number };
export type CloudStudyFile = Omit<StudyFile, 'sync'> & { version: number };
export type FileRevision = Pick<CloudStudyFile, 'id' | 'version'>;
export type SaveFileArgs = { file: Omit<StudyFile, 'sync'>; baseVersion: number };
export type SaveFileResult =
  { status: 'saved'; file: CloudStudyFile } | { status: 'conflict'; file: CloudStudyFile | null };

export const padApi = {
  session: makeFunctionReference<'query', Credentials, Account | null>('pad:session'),
  get: makeFunctionReference<'query', Credentials, CloudDraft | null>('pad:get'),
  save: makeFunctionReference<'mutation', SaveArgs, SaveResult>('pad:save'),
  disconnect: makeFunctionReference<'mutation', { deviceToken: string }, null>('pad:disconnect'),
  files: makeFunctionReference<'query', Credentials, FileRevision[]>('pad:files'),
  file: makeFunctionReference<'query', Credentials & { id: string }, CloudStudyFile | null>(
    'pad:file',
  ),
  saveFile: makeFunctionReference<'mutation', Credentials & SaveFileArgs, SaveFileResult>(
    'pad:saveFile',
  ),
};
