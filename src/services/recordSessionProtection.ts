import type { MeetingDraftRecoverySaveResult } from './meetingDraftRecoveryService';
import type { MeetingDraftRecoverySnapshotV2 } from '../types';

export type RecordSessionScope = { accountId: string; identity: string; workspaceId: string; boardId: string };
export type RecordSessionCheckpoint = {
  snapshot: MeetingDraftRecoverySnapshotV2;
  completion: Promise<MeetingDraftRecoverySaveResult>;
};
let checkpoint: { scope: RecordSessionScope; save: () => RecordSessionCheckpoint | null } | null = null;
const explicitLogouts = new Set<string>();

export const markRecordSessionLogout = (accountId: string) => { explicitLogouts.add(accountId); };
export const cancelRecordSessionLogout = (accountId: string) => { explicitLogouts.delete(accountId); };
export const isRecordSessionLogout = (accountId: string) => explicitLogouts.has(accountId);

export function registerRecordSessionCheckpoint(scope: RecordSessionScope, save: () => RecordSessionCheckpoint | null) {
  const registration = { scope, save };
  checkpoint = registration;
  return () => { if (checkpoint === registration) checkpoint = null; };
}

/** Called synchronously before clearing an editor; it uses the old hook's scope and sequence. */
export function checkpointRecordSession(scope: RecordSessionScope): RecordSessionCheckpoint | null {
  if (isRecordSessionLogout(scope.accountId) || !checkpoint
      || Object.entries(scope).some(([key, value]) => checkpoint?.scope[key as keyof RecordSessionScope] !== value)) return null;
  return checkpoint.save();
}
