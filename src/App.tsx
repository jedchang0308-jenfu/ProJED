/**
 * App.tsx — 應用程式根元件 (Firestore 版)
 * 設計意圖：
 * 1. AuthGate 確保使用者登入後才能使用主應用
 * 2. useFirestoreSync 建立即時監聽，遠端資料變動自動同步
 * 3. AppContent 負責舊版資料遷移檢查與視圖切換
 *
 * 遷移流程說明：
 * - 使用者登入後，立即檢查 localStorage 是否有舊版資料
 * - 若有，則觸發 migrateLocalStorageToFirestore
 * - 遷移完成後，由 onSnapshot 自動更新畫面，無須手動 reload
 * - 若無舊版資料，跳過遷移
 */
import React, { useEffect, useRef } from 'react';
import useBoardStore from './store/useBoardStore';
import useAuthStore from './store/useAuthStore';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { useCalendarSync } from './hooks/useCalendarSync';
import { migrateLocalStorageToFirestore } from './utils/migration';
import AuthGate from './components/AuthGate';
import MainLayout from './components/MainLayout';
import HomeView from './components/HomeView';
import BoardView from './components/BoardView';
import GanttView from './components/GanttView';
import CalendarView from './components/CalendarView';
import RecycleBinView from './components/RecycleBinView';
import CardModal from './components/CardModal';
import GlobalDialog from './components/GlobalDialog';

/**
 * AppContent — 主應用內容（已通過 AuthGate 認證）
 * 設計意圖：useFirestoreSync 必須在認證後的子元件中啟動，
 * 確保 user 一定存在。
 */
function AppContent() {
  const { currentView, workspaces, activeWorkspaceId, activeBoardId } = useBoardStore();
  const user = useAuthStore(s => s.user);
  // 確保遷移只執行一次，不因 re-render 重複觸發
  const migrationDone = useRef(false);

  // 啟動 Firestore 即時同步監聽
  useFirestoreSync();

  // 啟動 Google Calendar 同步初始化（準備 OAuth 工具，不會自動彈窗）
  useCalendarSync();

  // ===== 舊版資料遷移 =====
  // 設計意圖：在登入後立即執行（不等 onSnapshot 結果），
  // 若 localStorage 有舊資料就寫入 Firestore，
  // onSnapshot 會自動接收新寫入的文件並更新畫面。
  useEffect(() => {
    if (!user || migrationDone.current) return;
    migrationDone.current = true;

    const hasLegacyStorage = localStorage.getItem('projed-storage') || localStorage.getItem('projed_data');
    if (!hasLegacyStorage) {
      console.log('[Migration] 無舊版資料，跳過遷移。');
      return;
    }

    console.log('[Migration] 偵測到 Local Storage 舊資料，開始遷移到 Firestore...');
    migrateLocalStorageToFirestore(user.uid).then((success) => {
      if (success) {
        console.log('[Migration] 遷移完成！onSnapshot 將自動更新畫面。');
        // 不需要 reload：onSnapshot 監聽到 Firestore 新資料後會自動更新 Store
      }
    });
  }, [user?.uid]); // 只在 user 改變時重新評估

  // ===== 自動建立預設工作區（全新使用者）=====
  // 設計意圖：等待 onSnapshot 結果 3 秒後，若仍無任何工作區，
  // 表示為全新使用者，自動建立一個預設工作區。
  useEffect(() => {
    if (!user) return;

    const hasLegacyData = localStorage.getItem('projed-storage') || localStorage.getItem('projed_data');
    // 若有遷移資料，等待遷移完成，不自動建立
    if (hasLegacyData) return;

    const timer = setTimeout(() => {
      const currentWorkspaces = useBoardStore.getState().workspaces;
      if (currentWorkspaces.length === 0) {
        console.log('[Init] 全新使用者，自動建立預設工作區。');
        useBoardStore.getState().addWorkspace('我的工作區');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [user?.uid]);

  // ===== 看板切換時清理無效依賴 =====
  useEffect(() => {
    if (activeWorkspaceId && activeBoardId) {
      useBoardStore.getState().cleanBoardDependencies(activeWorkspaceId, activeBoardId);
    }
  }, [activeBoardId]);

  const renderContent = () => {
    switch (currentView) {
      case 'home':   return <HomeView />;
      case 'board':  return <BoardView />;
      case 'gantt':  return <GanttView />;
      case 'calendar': return <CalendarView />;
      case 'recycle_bin': return <RecycleBinView />;
      default:       return <HomeView />;
    }
  };

  return (
    <MainLayout>
      {renderContent()}
      <CardModal />
      <GlobalDialog />
    </MainLayout>
  );
}

function App() {
  return (
    <AuthGate>
      <AppContent />
    </AuthGate>
  );
}

export default App;
