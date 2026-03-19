import React, { useEffect, useRef } from 'react';
import useBoardStore from './store/useBoardStore';
import { migrateLegacyData } from './utils/migration';
import MainLayout from './components/MainLayout';
import HomeView from './components/HomeView';
import BoardView from './components/BoardView';
import GanttView from './components/GanttView';
import CardModal from './components/CardModal';
import GlobalDialog from './components/GlobalDialog';

function App() {
  const { currentView, workspaces, activeWorkspaceId, activeBoardId } = useBoardStore();
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    
    // Run migration if no data exists in the new store
    if (workspaces.length === 0) {
      initAttempted.current = true;
      console.log("Checking for legacy data...");
      const migrated = migrateLegacyData();
      if (migrated) {
        window.location.reload();
      } else {
        // If truly fresh user, add a default workspace
        // setTimeout ensures Zustand has finished its current render cycle
        setTimeout(() => {
          useBoardStore.getState().addWorkspace("我的工作區");
        }, 0);
      }
    }
  }, [workspaces.length]); // Only run when workspace count changes (init)

  useEffect(() => {
    // 只有在看板 ID 切換時才執行一次性清理，避免死循環
    if (activeWorkspaceId && activeBoardId) {
      useBoardStore.getState().cleanBoardDependencies(activeWorkspaceId, activeBoardId);
    }
  }, [activeBoardId]); // 關鍵：只監聽看板 ID 變動

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <HomeView />;
      case 'board':
        return <BoardView />;
      case 'gantt':
        return <GanttView />;
      default:
        return <HomeView />;
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

export default App;
