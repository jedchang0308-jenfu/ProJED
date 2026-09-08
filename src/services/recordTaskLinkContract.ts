import type { RecordTaskLinkRole } from '../types';

export type RecordTaskLinkIdentity = {
  nodeId: string;
  role: RecordTaskLinkRole;
};

export class RecordTaskLinkResolutionError extends Error {
  readonly code = 'RECORD_TASK_LINK_UNRESOLVED';

  constructor(readonly nodeIds: readonly string[]) {
    super('會議紀錄任務關聯無法完整保存，請先確認任務已在目前看板。');
    this.name = 'RecordTaskLinkResolutionError';
  }
}

export class RecordTaskLinkIntegrityError extends Error {
  readonly code = 'RECORD_TASK_LINK_INTEGRITY_MISMATCH';

  constructor() {
    super('會議紀錄任務關聯未完整保存，請重試。');
    this.name = 'RecordTaskLinkIntegrityError';
  }
}

const getIdentityKey = ({ nodeId, role }: RecordTaskLinkIdentity) => `${nodeId}\u0000${role}`;

export const uniqueRecordTaskLinkIdentities = (
  links: readonly RecordTaskLinkIdentity[],
): RecordTaskLinkIdentity[] => {
  const seen = new Set<string>();
  return links.filter(link => {
    const key = getIdentityKey(link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const recordTaskLinkIdentityKeys = (
  links: readonly RecordTaskLinkIdentity[],
): string[] => uniqueRecordTaskLinkIdentities(links)
  .map(getIdentityKey)
  .sort();

export const assertRecordTaskLinkSet = (
  requested: readonly RecordTaskLinkIdentity[],
  persisted: readonly RecordTaskLinkIdentity[],
): void => {
  const requestedKeys = recordTaskLinkIdentityKeys(requested);
  const persistedKeys = recordTaskLinkIdentityKeys(persisted);
  if (
    requestedKeys.length !== persistedKeys.length
    || requestedKeys.some((key, index) => key !== persistedKeys[index])
  ) {
    throw new RecordTaskLinkIntegrityError();
  }
};
