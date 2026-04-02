/**
 * useCalendarSyncStore — Google Calendar 同步狀態管理
 *
 * 設計意圖 (Design Intent)：
 * 獨立於 useBoardStore，專責管理 Google Calendar 同步的狀態與操作。
 * 職責分離原則：useBoardStore 管理任務資料，此 Store 管理同步狀態。
 *
 * 資料流：
 * 1. UI 觸發 connect() → 向用戶請求 OAuth 授權
 * 2. 授權成功 → isConnected = true
 * 3. UI 觸發 syncAll() → 從 useBoardStore 取出所有任務 → 呼叫 googleCalendarService.syncAll()
 * 4. 同步結果更新 lastSyncAt / error
 *
 * Event ID 快取 (eventIdCache)：
 * - 儲存 { projedId → googleEventId } 的對照表
 * - 用於 syncItem 時直接定位 Google Event，避免每次全量讀取
 * - 持久化至 localStorage，跨 session 保留
 */

import { create } from 'zustand';
import { googleCalendarService } from '../services/googleCalendarService';
import useBoardStore from './useBoardStore';
import type { CalendarSyncState, SyncableItem, SyncResult, Workspace } from '../types';

// ── 常數 ─────────────────────────────────────────────────
const EVENT_ID_CACHE_KEY = 'google_calendar_event_id_cache';

// ── 輔助：從 localStorage 讀取 Event ID 快取 ─────────────
function loadEventIdCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EVENT_ID_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ── 輔助：將所有工作區的任務扁平化為 SyncableItem[] ─────
function flattenAllItems(workspaces: Workspace[]): SyncableItem[] {
  const items: SyncableItem[] = [];

  workspaces.forEach(ws => {
    (ws.boards || []).forEach(board => {
      (board.lists || []).forEach(list => {
        if (list.isArchived) return;

        // 列表本身（若有日期）
        if (list.startDate || list.endDate) {
          items.push({
            id: list.id,
            title: list.title,
            type: 'list',
            status: list.status || 'todo',
            startDate: list.startDate,
            endDate: list.endDate,
          });
        }

        // 卡片
        (list.cards || []).forEach(card => {
          if (card.isArchived) return;
          if (card.startDate || card.endDate) {
            items.push({
              id: card.id,
              title: card.title,
              type: 'card',
              status: card.status || 'todo',
              startDate: card.startDate,
              endDate: card.endDate,
              notes: card.notes,
            });
          }

          // 待辦清單項目
          (card.checklists || []).forEach(cl => {
            if (cl.isArchived) return;
            (cl.items || []).forEach(cli => {
              if (cli.isArchived) return;
              if (cli.startDate || cli.endDate) {
                items.push({
                  id: cli.id,
                  title: cli.title || '未命名項目',
                  type: 'checklist',
                  status: cli.status || 'todo',
                  startDate: cli.startDate,
                  endDate: cli.endDate,
                });
              }
            });
          });
        });
      });
    });
  });

  return items;
}

// ── Store 型別定義 ───────────────────────────────────────

interface CalendarSyncActions {
  /** 初始化 Google Calendar OAuth 工具（App mount 時呼叫一次） */
  initialize: () => void;
  /** 連接 Google Calendar（觸發 OAuth 授權） */
  connect: () => void;
  /** 斷開連接（撤銷授權 + 清除快取） */
  disconnect: () => void;
  /** 全量同步所有工作區的任務至 Google Calendar */
  syncAll: () => Promise<SyncResult | null>;
  /** 單筆即時同步（編輯任務時觸發） */
  syncItem: (item: SyncableItem) => Promise<void>;
  /** 清除所有同步資料（刪除 Google Calendar 上的日曆） */
  clearAll: () => Promise<void>;
  /** Event ID 快取 */
  eventIdCache: Record<string, string>;
}

type CalendarSyncStore = CalendarSyncState & CalendarSyncActions;

// ── Store 實作 ───────────────────────────────────────────

const useCalendarSyncStore = create<CalendarSyncStore>()((set, get) => ({
  // ── 初始狀態 ──
  isConnected: googleCalendarService.isTokenValid(),
  isSyncing: false,
  lastSyncAt: null,
  error: null,
  eventIdCache: loadEventIdCache(),

  // ── Actions ──

  initialize: () => {
    googleCalendarService.init((_token: string) => {
      // OAuth 授權成功的 callback
      set({ isConnected: true, error: null });
      // 自動觸發全量同步
      get().syncAll();
    });

    // 檢查是否已有有效 token（頁面重整後恢復狀態）
    if (googleCalendarService.isTokenValid()) {
      set({ isConnected: true });
    }
  },

  connect: () => {
    googleCalendarService.requestToken();
  },

  disconnect: () => {
    googleCalendarService.revokeToken();
    set({
      isConnected: false,
      lastSyncAt: null,
      error: null,
      eventIdCache: {},
    });
    localStorage.removeItem(EVENT_ID_CACHE_KEY);
  },

  syncAll: async () => {
    const { isConnected, eventIdCache } = get();
    if (!isConnected) {
      set({ error: '請先連接 Google Calendar' });
      return null;
    }

    set({ isSyncing: true, error: null });

    try {
      // 從 useBoardStore 取得所有工作區的任務
      const workspaces = useBoardStore.getState().workspaces;
      const items = flattenAllItems(workspaces);

      console.log(`📋 共有 ${items.length} 個項目需要同步`);

      const { result, updatedCache } = await googleCalendarService.syncAll(items, eventIdCache);

      // 持久化 Event ID 快取
      localStorage.setItem(EVENT_ID_CACHE_KEY, JSON.stringify(updatedCache));

      set({
        isSyncing: false,
        lastSyncAt: Date.now(),
        error: null,
        eventIdCache: updatedCache,
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '同步失敗';
      console.error('❌ Google Calendar 同步失敗:', err);

      // 若為授權問題，重置連接狀態
      if (msg.includes('401') || msg.includes('未授權')) {
        set({ isConnected: false });
      }

      set({ isSyncing: false, error: msg });
      return null;
    }
  },

  syncItem: async (item: SyncableItem) => {
    const { isConnected, eventIdCache } = get();
    if (!isConnected) return;

    try {
      const googleEventId = eventIdCache[item.id];
      const newEventId = await googleCalendarService.syncItem(item, googleEventId);

      if (newEventId && newEventId !== googleEventId) {
        // 更新快取
        const updatedCache = { ...get().eventIdCache, [item.id]: newEventId };
        localStorage.setItem(EVENT_ID_CACHE_KEY, JSON.stringify(updatedCache));
        set({ eventIdCache: updatedCache });
      }
    } catch (err) {
      console.error('❌ 單筆同步失敗:', err);
    }
  },

  clearAll: async () => {
    set({ isSyncing: true, error: null });
    try {
      await googleCalendarService.clearAll();
      localStorage.removeItem(EVENT_ID_CACHE_KEY);
      set({
        isSyncing: false,
        lastSyncAt: null,
        eventIdCache: {},
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清除失敗';
      set({ isSyncing: false, error: msg });
    }
  },
}));

export default useCalendarSyncStore;
