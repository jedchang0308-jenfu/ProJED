/**
 * useCalendarSync — Google Calendar 同步 React Hook
 *
 * 設計意圖 (Design Intent)：
 * 在 React 元件生命週期中管理 Google Calendar 同步邏輯：
 * 1. 初始化：mount 時初始化 GSI OAuth 工具
 * 2. 提供同步 API 給 UI 使用（connect, syncAll, disconnect）
 *
 * 使用方式：
 * 在 App.tsx 或 AuthGate 中呼叫一次即可，所有 UI 元件
 * 透過 useCalendarSyncStore 直接讀取同步狀態。
 *
 * 注意：自動同步（監聽資料變動）已移除，避免頻繁 API 呼叫。
 * 改為手動觸發同步（點擊按鈕）或編輯後延遲同步單筆。
 */

import { useEffect } from 'react';
import useCalendarSyncStore from '../store/useCalendarSyncStore';

/**
 * useCalendarSync — 初始化 Google Calendar 同步
 *
 * @description
 * 在 App mount 時呼叫一次，負責：
 * 1. 初始化 Google Identity Services
 * 2. 若已有有效 token，自動恢復連接狀態
 *
 * @example
 * ```tsx
 * function App() {
 *   useCalendarSync();
 *   return <MainLayout>...</MainLayout>;
 * }
 * ```
 */
export function useCalendarSync(): void {
  const initialize = useCalendarSyncStore(s => s.initialize);

  useEffect(() => {
    // 初始化 GSI OAuth 工具（僅執行一次）
    initialize();
  }, [initialize]);
}

export default useCalendarSync;
