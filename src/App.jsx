import React, { useEffect } from 'react';
import useBoardStore from './store/useBoardStore';
import { migrateLegacyData } from './utils/migration';
import MainLayout from './components/MainLayout';
import HomeView from './components/HomeView';
import BoardView from './components/BoardView';
import GanttView from './components/GanttView';
import CardModal from './components/CardModal';

function App() {
  const { currentView, workspaces, setWorkspaces } = useBoardStore();

  useEffect(() => {
    // Run migration if no data exists in the new store
    if (workspaces.length === 0) {
      console.log("Checking for legacy data...");
      const migrated = migrateLegacyData();
      if (migrated) {
        window.location.reload();
      } else {
        // If truly fresh user, add a default workspace
        useBoardStore.getState().addWorkspace("我的工作區");
      }
    }
  }, [workspaces]);

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
    </MainLayout>
  );
}

export default App;
