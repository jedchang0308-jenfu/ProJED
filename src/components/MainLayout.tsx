import React, { useEffect } from 'react';
import {
  BookOpenText,
  CalendarDays,
  ChevronRight,
  Columns,
  Layout,
  LineChart,
  ListChecks,
  Menu,
  Redo2,
  SquarePen,
  Sparkles,
  Undo2,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useUndoStore from '../store/useUndoStore';
import useRagStore from '../store/useRagStore';
import useRecordStore from '../store/useRecordStore';
import { toast } from '../store/useToastStore';
import Sidebar from './Sidebar';
import { GlobalContextMenu } from './GlobalContextMenu';
import RagSidebar from './Rag/RagSidebar';
import RecordSidebar from './Records/RecordSidebar';
import { compactIconButtonClass } from './ui/compactTokens';
import { ModeSwitcher, type ModeSwitcherOption } from './ui/ModeSwitcher';
import type { ViewMode } from '../types';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const {
    currentView,
    getActiveBoard,
    getActiveWorkspace,
    updateBoardTitle,
    setView,
    isSidebarOpen,
    setSidebarOpen,
    dependencySelection,
  } = useBoardStore();

  const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndoStore();
  const { isOpen: isRagOpen, togglePanel: toggleRagPanel } = useRagStore();
  const {
    isPanelOpen: isRecordOpen,
    isPanelCollapsed: isRecordPanelCollapsed,
    isMeetingMode,
    startMeetingRecord,
    exitMeetingMode,
    isTaskSelectionMode,
  } = useRecordStore();

  const isSelectingMode = Boolean(dependencySelection || isTaskSelectionMode || isMeetingMode);
  const meetingRecordReserveClass =
    isMeetingMode && isRecordOpen
      ? isRecordPanelCollapsed
        ? 'pb-12 sm:pb-0'
        : 'pb-[48vh] sm:pb-0'
      : '';
  const lastUndoLabel = undoStack.length > 0 ? undoStack[undoStack.length - 1].label : '';
  const lastRedoLabel = redoStack.length > 0 ? redoStack[redoStack.length - 1].label : '';
  const activeBoard = getActiveBoard();
  const activeWorkspace = getActiveWorkspace();
  const isBoardWorkspaceView = ['list', 'board', 'gantt', 'calendar', 'records'].includes(currentView);

  const developmentViewWarnings: Partial<Record<ViewMode, string>> = {
    calendar: '日曆功能仍在開發中，顯示內容與操作流程可能尚未穩定。',
    records: '紀錄功能仍在開發中，資料保存與流程可能尚未穩定。',
  };

  const handleModeChange = (nextView: ViewMode) => {
    const warning = developmentViewWarnings[nextView];
    if (warning) toast.warning(warning);
    setView(nextView);
  };

  const modeSwitcherOptions: ModeSwitcherOption<ViewMode>[] = [
    { value: 'list', label: '清單', icon: <ListChecks size={13} /> },
    { value: 'board', label: '看板', icon: <Columns size={13} /> },
    { value: 'gantt', label: '甘特', icon: <LineChart size={13} /> },
    {
      value: 'calendar',
      label: '日曆(開發中)',
      icon: <CalendarDays size={13} />,
      title: '日曆功能開發中，內容可能尚未穩定',
    },
    {
      value: 'records',
      label: '紀錄庫(開發中)',
      icon: <BookOpenText size={13} />,
      title: '查看會議與工作紀錄總覽，功能仍在開發中',
    },
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
      const target = event.target as HTMLElement;
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isEditable) return;

      if (ctrlOrCmd && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        if (canUndo()) undo();
      } else if (ctrlOrCmd && ((event.shiftKey && event.key === 'z') || event.key === 'y')) {
        event.preventDefault();
        if (canRedo()) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo, redo, undo]);

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-800">
      <nav className="z-40 flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="mr-2 rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100"
            title={isSidebarOpen ? '收合側欄' : '展開側欄'}
          >
            <Menu size={18} />
          </button>

          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Layout className="h-5 w-5 shrink-0 text-primary" />
            <span className="hidden font-bold text-slate-700 sm:inline">ProJED</span>

            {(currentView === 'settings' || currentView === 'calendar_subscriptions') && (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="font-bold text-slate-700">設定</span>
                {currentView === 'calendar_subscriptions' ? (
                  <>
                    <ChevronRight size={14} className="text-slate-300" />
                    <span className="font-bold text-slate-500">日曆訂閱</span>
                  </>
                ) : null}
              </>
            )}

            {currentView === 'recycle_bin' ? (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="font-bold text-slate-700">回收桶</span>
              </>
            ) : null}

            {isBoardWorkspaceView && activeWorkspace && activeBoard ? (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="whitespace-nowrap text-slate-400">{activeWorkspace.title}</span>
                <ChevronRight size={14} className="text-slate-300" />
                <h1
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => updateBoardTitle(activeWorkspace.id, activeBoard.id, event.currentTarget.innerText)}
                  className="max-w-[150px] cursor-text truncate rounded px-2 py-0.5 font-bold text-slate-800 hover:bg-slate-100 focus:bg-white focus:outline-primary sm:max-w-[300px]"
                >
                  {activeBoard.title}
                </h1>

                <div className="ml-[10px] flex items-center gap-[8px] border-l border-slate-200 pl-[10px]">
                  <ModeSwitcher
                    value={currentView}
                    options={modeSwitcherOptions}
                    onChange={handleModeChange}
                    disabled={isSelectingMode}
                    disabledTitle="選取模式中無法切換檢視"
                  />

                  <div className="ml-0 flex items-center gap-px border-l border-slate-200 pl-[8px]">
                    <button
                      id="btn-undo"
                      type="button"
                      onClick={undo}
                      disabled={!canUndo()}
                      title={canUndo() ? `復原：${lastUndoLabel}\nCtrl+Z` : '沒有可復原的操作'}
                      className={canUndo() ? compactIconButtonClass() : `${compactIconButtonClass()} cursor-not-allowed text-slate-300`}
                    >
                      <Undo2 size={15} />
                    </button>
                    <button
                      id="btn-redo"
                      type="button"
                      onClick={redo}
                      disabled={!canRedo()}
                      title={canRedo() ? `重做：${lastRedoLabel}\nCtrl+Shift+Z` : '沒有可重做的操作'}
                      className={canRedo() ? compactIconButtonClass() : `${compactIconButtonClass()} cursor-not-allowed text-slate-300`}
                    >
                      <Redo2 size={15} />
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {currentView === 'home' ? (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="font-bold text-slate-700">工作區總覽</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => (isMeetingMode ? exitMeetingMode() : startMeetingRecord())}
            className={`btn-outline flex h-7 items-center gap-1.5 px-2 text-xs transition-all sm:h-8 sm:px-3 sm:text-sm ${
              isRecordOpen || isMeetingMode ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'hover:border-emerald-400 hover:text-emerald-600'
            }`}
            title={isMeetingMode ? '結束會議模式，保留目前紀錄草稿' : '開始會議紀錄，切到看板並開啟速記欄'}
          >
            <SquarePen size={14} className={isRecordOpen ? 'text-emerald-500' : 'text-slate-400'} />
            <span className="hidden lg:inline">{isMeetingMode ? '結束會議' : '會議紀錄'}</span>
          </button>

          <button
            type="button"
            onClick={toggleRagPanel}
            className={`btn-outline flex h-7 items-center gap-1.5 px-2 text-xs transition-all sm:h-8 sm:px-3 sm:text-sm ${
              isRagOpen ? 'border-blue-400 bg-blue-50 text-blue-600' : 'hover:border-blue-400 hover:text-blue-600'
            }`}
            title="開啟 AI 全域分析"
          >
            <Sparkles size={14} className={isRagOpen ? 'text-blue-500' : 'text-slate-400'} />
            <span className="hidden lg:inline">AI 分析</span>
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className={`relative flex h-full min-w-0 flex-1 flex-col ${meetingRecordReserveClass}`}>
          {children}
        </main>

        <RecordSidebar />
        <RagSidebar />
      </div>

      <GlobalContextMenu />
    </div>
  );
};

export default MainLayout;
