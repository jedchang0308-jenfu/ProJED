/**
 * useCalendarSyncStore — Google Calendar 同步狀態管理 (Pure State)
 *
 * 設計意圖 (Design Intent)：
 * 此 Store 僅負責這四個 UI 驅動屬性。所有的非同步操作與 Google Calendar API 
 * 已全數轉移至 googleCalendarService.ts 與 useCalendarSync.ts 中。
 */

import { create } from 'zustand';
import { googleCalendarService } from '../services/googleCalendarService';

export interface CalendarSyncState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
}

export interface CalendarSyncActions {
  setIsConnected: (connected: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncAt: (timestamp: number | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

type CalendarSyncStoreType = CalendarSyncState & CalendarSyncActions;

const useCalendarSyncStore = create<CalendarSyncStoreType>()((set) => ({
  isConnected: googleCalendarService.isTokenValid(),
  isSyncing: false,
  lastSyncAt: null,
  error: null,

  setIsConnected: (connected) => set({ isConnected: connected }),
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncAt: (timestamp) => set({ lastSyncAt: timestamp }),
  setError: (error) => set({ error }),
  reset: () => set({ isConnected: false, isSyncing: false, lastSyncAt: null, error: null }),
}));

export default useCalendarSyncStore;
