// @ts-nocheck
import { useEffect, useCallback } from 'react';
import useCalendarSyncStore from '../store/useCalendarSyncStore';
import { googleCalendarService } from '../services/googleCalendarService';
import useBoardStore from '../store/useBoardStore';
import type { SyncableItem, SyncResult } from '../types';

/**
 * useCalendarSync — Google Calendar 同步 Facade Hook
 *
 * 設計意圖 (Design Intent)：
 * 擔任 Controller 角色，介於 React UI 與 googleCalendarService 之間。
 * 所有組件都透過此 Hook 取得同步狀態與觸發操作。
 */
export function useCalendarSync(options: { autoInit?: boolean } = {}) {
  // 嚴格使用 selector 取值，避免無效的 re-render 循環
  const isConnected = useCalendarSyncStore(s => s.isConnected);
  const isSyncing = useCalendarSyncStore(s => s.isSyncing);
  const lastSyncAt = useCalendarSyncStore(s => s.lastSyncAt);
  const error = useCalendarSyncStore(s => s.error);

  const setIsConnected = useCalendarSyncStore(s => s.setIsConnected);
  const setIsSyncing = useCalendarSyncStore(s => s.setIsSyncing);
  const setLastSyncAt = useCalendarSyncStore(s => s.setLastSyncAt);
  const setError = useCalendarSyncStore(s => s.setError);
  const reset = useCalendarSyncStore(s => s.reset);

  const autoInit = options.autoInit === true;

  const syncAll = useCallback(async (): Promise<SyncResult | null> => {
    if (!googleCalendarService.isTokenValid()) {
      setError('請先連接 Google Calendar');
      return null;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const workspaces = useBoardStore.getState().workspaces;
      const result = await googleCalendarService.syncAll(workspaces);
      
      setIsSyncing(false);
      setLastSyncAt(Date.now());
      setError(null);
      
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '同步失敗';
      console.error('❌ Google Calendar 同步失敗:', err);

      if (msg.includes('401') || msg.includes('未授權')) {
        setIsConnected(false);
      }

      setIsSyncing(false);
      setError(msg);
      return null;
    }
  }, [setIsSyncing, setLastSyncAt, setError, setIsConnected]);

  const initialize = useCallback(() => {
    googleCalendarService.init((token: string) => {
      setIsConnected(true);
      setError(null);
      
      // 自動觸發背景同步，但不拋出錯誤打斷流程
      syncAll().catch(e => console.error('OAuth 授權後自動同步發生異常:', e));
    });

    if (googleCalendarService.isTokenValid()) {
      setIsConnected(true);
    }
  }, [setIsConnected, setError, syncAll]);

  useEffect(() => {
    if (autoInit) {
      initialize();
    }
  }, [initialize, autoInit]);

  const connect = useCallback(() => {
    googleCalendarService.requestToken();
  }, []);

  const disconnect = useCallback(() => {
    googleCalendarService.revokeToken();
    reset();
  }, [reset]);

  const syncItem = useCallback(async (item: SyncableItem) => {
    if (!googleCalendarService.isTokenValid()) return;
    try {
      await googleCalendarService.syncItem(item);
    } catch (err) {
      console.error('❌ 單筆同步失敗:', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      await googleCalendarService.clearAll();
      setIsSyncing(false);
      setLastSyncAt(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清除失敗';
      setIsSyncing(false);
      setError(msg);
    }
  }, [setIsSyncing, setLastSyncAt, setError]);

  return {
    isConnected,
    isSyncing,
    lastSyncAt,
    error,
    initialize,
    connect,
    disconnect,
    syncAll,
    syncItem,
    clearAll
  };
}

export default useCalendarSync;
