import { create } from 'zustand';
import type { InboxItem, InboxItemType } from '../types';

const QUICK_CAPTURE_STORAGE_KEY = 'projed.quickCapture.inboxItems';

const readItems = (): InboxItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(QUICK_CAPTURE_STORAGE_KEY);
    if (!stored) return [];
    const items = JSON.parse(stored);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

const writeItems = (items: InboxItem[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUICK_CAPTURE_STORAGE_KEY, JSON.stringify(items));
};

const normalizeTitle = (text: string) => {
  const firstLine = text.trim().split(/\r?\n/).find(Boolean);
  return firstLine?.slice(0, 80).trim() || '未命名快記';
};

type QuickCaptureInput = {
  text: string;
  itemType?: InboxItemType;
  createdBy?: string | null;
};

interface QuickCaptureStore {
  items: InboxItem[];
  addItem: (input: QuickCaptureInput) => InboxItem | null;
  markPromoted: (itemId: string, taskNodeId: string) => void;
  markCompleted: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  clearCompleted: () => void;
}

const sortItems = (items: InboxItem[]) => [...items].sort((a, b) => b.createdAt - a.createdAt);

const useQuickCaptureStore = create<QuickCaptureStore>((set, get) => ({
  items: sortItems(readItems()),

  addItem: ({ text, itemType = 'note', createdBy = null }) => {
    const trimmedText = text.trim();
    if (!trimmedText) return null;

    const now = Date.now();
    const item: InboxItem = {
      id: `inbox_${now}_${Math.random().toString(36).slice(2, 8)}`,
      title: normalizeTitle(trimmedText),
      note: trimmedText,
      itemType,
      captureStatus: 'untriaged',
      syncStatus: 'pending',
      createdBy,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archivedAt: null,
      suggestedDueDate: null,
      confirmedDueDate: null,
      promotedTaskNodeId: null,
    };

    const nextItems = sortItems([item, ...get().items]);
    writeItems(nextItems);
    set({ items: nextItems });
    return item;
  },

  markPromoted: (itemId, taskNodeId) => {
    const now = Date.now();
    const nextItems = sortItems(get().items.map(item => (
      item.id === itemId
        ? { ...item, promotedTaskNodeId: taskNodeId, updatedAt: now }
        : item
    )));
    writeItems(nextItems);
    set({ items: nextItems });
  },

  markCompleted: (itemId) => {
    const now = Date.now();
    const nextItems = sortItems(get().items.map(item => (
      item.id === itemId
        ? { ...item, captureStatus: 'completed', completedAt: now, updatedAt: now }
        : item
    )));
    writeItems(nextItems);
    set({ items: nextItems });
  },

  removeItem: (itemId) => {
    const nextItems = get().items.filter(item => item.id !== itemId);
    writeItems(nextItems);
    set({ items: nextItems });
  },

  clearCompleted: () => {
    const nextItems = get().items.filter(item => item.captureStatus !== 'completed');
    writeItems(nextItems);
    set({ items: nextItems });
  },
}));

export { QUICK_CAPTURE_STORAGE_KEY };
export default useQuickCaptureStore;
