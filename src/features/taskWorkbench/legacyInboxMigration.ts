import type { InboxItem } from '../../types';

/** Return only legacy Inbox items that can be safely adopted by this account. */
export const selectOwnedLegacyInboxItems = (
  items: readonly InboxItem[],
  accountId: string | null | undefined,
): InboxItem[] => {
  if (typeof accountId !== 'string' || accountId.length === 0) return [];

  return items
    .filter(item => item.createdBy === accountId
      && item.captureStatus === 'untriaged'
      && !item.promotedTaskNodeId)
    .sort((left, right) => right.createdAt - left.createdAt);
};
