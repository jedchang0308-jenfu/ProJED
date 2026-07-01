import { create } from 'zustand';
import { inboxService } from '../services/dataBackend';
import type { InboxItem, InboxItemPromotionInput, InboxItemPromotionResult, InboxItemType } from '../types';

const QUICK_CAPTURE_STORAGE_KEY = 'projed.quickCapture.inboxItems';
const QUICK_CAPTURE_ANON_KEY = 'projed.quickCapture.anonymousOwnerKey';
const OUTBOX_SCHEMA_VERSION = 2;

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getAnonymousOwnerKey = () => {
  if (typeof window === 'undefined') return 'server-anonymous';
  const existing = localStorage.getItem(QUICK_CAPTURE_ANON_KEY);
  if (existing) return existing;
  const key = createId('anon');
  localStorage.setItem(QUICK_CAPTURE_ANON_KEY, key);
  return key;
};

const parseQuickMemo = (text: string) => {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const firstSentence = trimmed.match(/^(.+?[。.!?？]|[^。.!?？\n]+)/)?.[1]?.trim();
  const title = (lines[0] || firstSentence || '未命名備忘').slice(0, 80).trim() || '未命名備忘';
  const detailText = trimmed === title ? '' : trimmed.replace(title, '').trim();
  const today = new Date();
  const toDateString = (date: Date) => date.toISOString().slice(0, 10);
  const explicitDate = trimmed.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/)?.[1];
  const slashDate = trimmed.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/);
  let suggestedDueDate: string | null = null;

  if (explicitDate) {
    const date = new Date(explicitDate);
    if (!Number.isNaN(date.getTime())) suggestedDueDate = toDateString(date);
  } else if (trimmed.includes('明天')) {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    suggestedDueDate = toDateString(date);
  } else if (trimmed.includes('今天')) {
    suggestedDueDate = toDateString(today);
  } else if (trimmed.includes('下週') || trimmed.includes('下周')) {
    const date = new Date(today);
    date.setDate(date.getDate() + 7);
    suggestedDueDate = toDateString(date);
  } else if (slashDate) {
    const year = today.getFullYear();
    const date = new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2]));
    if (!Number.isNaN(date.getTime())) suggestedDueDate = toDateString(date);
  }

  return { title, detailText, suggestedDueDate };
};

const normalizeItem = (raw: Partial<InboxItem> & Record<string, unknown>): InboxItem | null => {
  const rawText = String(raw.rawText || raw.note || '').trim();
  if (!rawText) return null;
  const parsed = parseQuickMemo(rawText);
  const now = Date.now();
  const schemaVersion = Number(raw.schemaVersion || 1);
  const createdAuthUserId = (raw.createdAuthUserId ?? raw.createdBy ?? null) as string | null;
  const clientMutationId = String(raw.clientMutationId || raw.id || createId('memo_client'));

  return {
    id: String(raw.id || createId('memo')),
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    cloudId: (raw.cloudId as string | null | undefined) ?? null,
    clientMutationId,
    title: String(raw.title || parsed.title),
    rawText,
    note: rawText,
    detailText: (raw.detailText as string | null | undefined) ?? parsed.detailText,
    itemType: (raw.itemType as InboxItemType | undefined) ?? 'todo',
    captureStatus: (raw.captureStatus as InboxItem['captureStatus'] | undefined) ?? 'untriaged',
    syncStatus: (raw.syncStatus as InboxItem['syncStatus'] | undefined) ?? 'pending',
    createdBy: (raw.createdBy as string | null | undefined) ?? createdAuthUserId,
    createdAuthUserId,
    anonymousOwnerKey: (raw.anonymousOwnerKey as string | null | undefined) ?? (createdAuthUserId ? null : getAnonymousOwnerKey()),
    requiresOwnershipConfirmation: Boolean(raw.requiresOwnershipConfirmation ?? !createdAuthUserId),
    sourceWorkspaceId: (raw.sourceWorkspaceId as string | null | undefined) ?? null,
    sourceBoardId: (raw.sourceBoardId as string | null | undefined) ?? null,
    lastSyncError: (raw.lastSyncError as string | null | undefined) ?? null,
    migratedFromLocalOnly: Boolean(raw.migratedFromLocalOnly ?? schemaVersion < OUTBOX_SCHEMA_VERSION),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || raw.createdAt || now),
    completedAt: (raw.completedAt as number | null | undefined) ?? null,
    archivedAt: (raw.archivedAt as number | null | undefined) ?? null,
    suggestedDueDate: (raw.suggestedDueDate as string | null | undefined) ?? parsed.suggestedDueDate,
    confirmedDueDate: (raw.confirmedDueDate as string | null | undefined) ?? null,
    promotedTaskNodeId: (raw.promotedTaskNodeId as string | null | undefined) ?? null,
    promotedAt: (raw.promotedAt as number | null | undefined) ?? null,
    promotionClientMutationId: (raw.promotionClientMutationId as string | null | undefined) ?? null,
  };
};

const readItems = (): InboxItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(QUICK_CAPTURE_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => normalizeItem(item)).filter((item): item is InboxItem => Boolean(item));
  } catch {
    return [];
  }
};

const writeItems = (items: InboxItem[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUICK_CAPTURE_STORAGE_KEY, JSON.stringify(items));
};

type QuickCaptureInput = {
  text: string;
  itemType?: InboxItemType;
  createdBy?: string | null;
  sourceWorkspaceId?: string | null;
  sourceBoardId?: string | null;
};

type PromoteMemoInput = Omit<InboxItemPromotionInput, 'inboxItemId' | 'title' | 'description' | 'endDate'>;

interface QuickCaptureStore {
  items: InboxItem[];
  isSyncing: boolean;
  addItem: (input: QuickCaptureInput) => InboxItem | null;
  syncWithCloud: (userId: string | null) => Promise<void>;
  claimAnonymousItems: (userId: string) => Promise<void>;
  promoteItem: (itemId: string, input: PromoteMemoInput) => Promise<InboxItemPromotionResult>;
  markCompleted: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  clearCompleted: () => void;
}

const sortItems = (items: InboxItem[]) => [...items].sort((a, b) => b.createdAt - a.createdAt);

const mergeCloudItem = (localItems: InboxItem[], cloudItem: InboxItem) => {
  const match = localItems.find(item =>
    item.cloudId === cloudItem.cloudId ||
    item.cloudId === cloudItem.id ||
    item.clientMutationId === cloudItem.clientMutationId
  );
  const merged = match
    ? { ...match, ...cloudItem, id: match.id, cloudId: cloudItem.cloudId || cloudItem.id, syncStatus: 'synced' as const }
    : { ...cloudItem, id: cloudItem.cloudId || cloudItem.id, syncStatus: 'synced' as const };
  return [merged, ...localItems.filter(item => item !== match)];
};

export const isQuickMemoVisibleForUser = (item: InboxItem, userId: string | null | undefined) => {
  if (item.captureStatus === 'archived') return false;
  if (item.requiresOwnershipConfirmation && !item.createdAuthUserId) return true;
  if (!userId) return !item.createdAuthUserId;
  return item.createdAuthUserId === userId || item.createdBy === userId;
};

const useQuickCaptureStore = create<QuickCaptureStore>((set, get) => ({
  items: sortItems(readItems()),
  isSyncing: false,

  addItem: ({ text, itemType = 'todo', createdBy = null, sourceWorkspaceId = null, sourceBoardId = null }) => {
    const trimmedText = text.trim();
    if (!trimmedText) return null;

    const now = Date.now();
    const parsed = parseQuickMemo(trimmedText);
    const item: InboxItem = {
      id: createId('memo'),
      schemaVersion: OUTBOX_SCHEMA_VERSION,
      cloudId: null,
      clientMutationId: createId('memo_client'),
      title: parsed.title,
      rawText: trimmedText,
      note: trimmedText,
      detailText: parsed.detailText,
      itemType,
      captureStatus: 'untriaged',
      syncStatus: 'pending',
      createdBy,
      createdAuthUserId: createdBy,
      anonymousOwnerKey: createdBy ? null : getAnonymousOwnerKey(),
      requiresOwnershipConfirmation: !createdBy,
      sourceWorkspaceId,
      sourceBoardId,
      lastSyncError: null,
      migratedFromLocalOnly: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archivedAt: null,
      suggestedDueDate: parsed.suggestedDueDate,
      confirmedDueDate: null,
      promotedTaskNodeId: null,
      promotedAt: null,
      promotionClientMutationId: null,
    };

    const nextItems = sortItems([item, ...get().items]);
    writeItems(nextItems);
    set({ items: nextItems });
    return item;
  },

  syncWithCloud: async (userId) => {
    if (!userId) return;
    const state = get();
    const syncable = state.items.filter(item =>
      item.createdAuthUserId === userId &&
      !item.requiresOwnershipConfirmation &&
      ['pending', 'failed'].includes(item.syncStatus) &&
      item.captureStatus === 'untriaged'
    );

    if (syncable.length > 0) {
      const syncingItems = state.items.map(item =>
        syncable.includes(item) ? { ...item, syncStatus: 'syncing' as const, lastSyncError: null } : item
      );
      writeItems(syncingItems);
      set({ items: sortItems(syncingItems), isSyncing: true });
    } else {
      set({ isSyncing: true });
    }

    let nextItems = get().items;
    for (const item of syncable) {
      try {
        const synced = await inboxService.upsert(userId, item);
        nextItems = mergeCloudItem(nextItems, synced);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextItems = nextItems.map(existing =>
          existing.id === item.id
            ? { ...existing, syncStatus: 'failed' as const, lastSyncError: message, updatedAt: Date.now() }
            : existing
        );
      }
      writeItems(sortItems(nextItems));
      set({ items: sortItems(nextItems) });
    }

    try {
      const cloudItems = await inboxService.list();
      nextItems = cloudItems.reduce((items, cloudItem) => mergeCloudItem(items, cloudItem), get().items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nextItems = get().items.map(item =>
        item.createdAuthUserId === userId && item.syncStatus === 'syncing'
          ? { ...item, syncStatus: 'failed' as const, lastSyncError: message, updatedAt: Date.now() }
          : item
      );
    }

    const sorted = sortItems(nextItems);
    writeItems(sorted);
    set({ items: sorted, isSyncing: false });
  },

  claimAnonymousItems: async (userId) => {
    const now = Date.now();
    const nextItems = get().items.map(item =>
      item.requiresOwnershipConfirmation && !item.createdAuthUserId
        ? {
            ...item,
            createdAuthUserId: userId,
            createdBy: userId,
            requiresOwnershipConfirmation: false,
            syncStatus: 'pending' as const,
            updatedAt: now,
          }
        : item
    );
    writeItems(sortItems(nextItems));
    set({ items: sortItems(nextItems) });
    await get().syncWithCloud(userId);
  },

  promoteItem: async (itemId, input) => {
    const item = get().items.find(candidate => candidate.id === itemId || candidate.cloudId === itemId);
    if (!item) throw new Error('找不到備忘項目。');
    if (item.syncStatus !== 'synced' || !item.cloudId) throw new Error('同步後才能轉任務。');
    if (item.captureStatus !== 'untriaged') throw new Error('只有待整理備忘可以轉任務。');

    const result = await inboxService.promote({
      ...input,
      inboxItemId: item.cloudId,
      title: item.title,
      description: item.detailText || item.rawText || item.note || null,
      endDate: item.confirmedDueDate || item.suggestedDueDate || null,
    });

    const nextItems = get().items.map(existing =>
      existing.id === item.id || existing.cloudId === item.cloudId
        ? { ...existing, ...result.item, id: existing.id, cloudId: result.item.cloudId || result.item.id, syncStatus: 'synced' as const }
        : existing
    );
    writeItems(sortItems(nextItems));
    set({ items: sortItems(nextItems) });
    return result;
  },

  markCompleted: (itemId) => {
    const now = Date.now();
    const item = get().items.find(candidate => candidate.id === itemId || candidate.cloudId === itemId);
    const nextItems = sortItems(get().items.map(candidate => (
      candidate.id === itemId || candidate.cloudId === itemId
        ? { ...candidate, captureStatus: 'completed', completedAt: now, updatedAt: now }
        : candidate
    )));
    writeItems(nextItems);
    set({ items: nextItems });
    if (item?.cloudId && item.syncStatus === 'synced') {
      inboxService.markCompleted(item.cloudId).catch(error => console.warn('[quickMemo] complete sync failed:', error));
    }
  },

  removeItem: (itemId) => {
    const now = Date.now();
    const item = get().items.find(candidate => candidate.id === itemId || candidate.cloudId === itemId);
    const nextItems = sortItems(get().items.map(candidate => (
      candidate.id === itemId || candidate.cloudId === itemId
        ? { ...candidate, captureStatus: 'archived', archivedAt: now, updatedAt: now }
        : candidate
    )));
    writeItems(nextItems);
    set({ items: nextItems });
    if (item?.cloudId && item.syncStatus === 'synced') {
      inboxService.archive(item.cloudId).catch(error => console.warn('[quickMemo] archive sync failed:', error));
    }
  },

  clearCompleted: () => {
    const nextItems = get().items.filter(item => item.captureStatus !== 'completed');
    writeItems(nextItems);
    set({ items: nextItems });
  },
}));

export { QUICK_CAPTURE_STORAGE_KEY, parseQuickMemo };
export default useQuickCaptureStore;
