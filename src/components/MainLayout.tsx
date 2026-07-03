import React, { useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Columns,
  Layout,
  LineChart,
  ListChecks,
  Menu,
  Network,
  Redo2,
  SquarePen,
  Sparkles,
  Undo2,
  UserPlus,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useUndoStore from '../store/useUndoStore';
import useRagStore from '../store/useRagStore';
import useRecordStore from '../store/useRecordStore';
import { useMemberStore } from '../store/useMemberStore';
import { useMeetingModeExitGuard } from '../hooks/useMeetingModeExitGuard';
import { useRecordDraftGuard } from '../hooks/useRecordDraftGuard';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import Sidebar from './Sidebar';
import { GlobalContextMenu } from './GlobalContextMenu';
import { BoardShareDialog } from './BoardMembersPanel';
import RagSidebar from './Rag/RagSidebar';
import RecordSidebar from './Records/RecordSidebar';
import { compactIconButtonClass } from './ui/compactTokens';
import { ModeSwitcher, type ModeSwitcherOption } from './ui/ModeSwitcher';
import { StatusFilterBar } from './ui/StatusFilterBar';
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
    openNewRecord,
    isTaskSelectionMode,
  } = useRecordStore();
  const requestExitMeetingMode = useMeetingModeExitGuard();
  const guardRecordDraft = useRecordDraftGuard();
  const boardMemberCount = useMemberStore(state => state.boardMembers.length);
  const [isShareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [isSmallViewport, setIsSmallViewport] = React.useState(false);
  const isCoarsePointer = useCoarsePointer();

  const isNonMeetingRecordOpen = isRecordOpen && !isMeetingMode;
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
  const isBoardWorkspaceView = ['list', 'mindmap', 'board', 'gantt', 'calendar', 'records'].includes(currentView);
  const isTaskFilterView = ['list', 'mindmap', 'board', 'gantt', 'calendar'].includes(currentView);
  const isSettingsScopeView = currentView === 'settings' || currentView === 'calendar_subscriptions';
  const isMobileBoardOnly = isCoarsePointer || isSmallViewport;
  const mobileBlockedViews = React.useMemo(() => new Set<ViewMode>(['list', 'mindmap', 'gantt', 'calendar', 'records']), []);

  const handleModeChange = (nextView: ViewMode) => {
    if (isMobileBoardOnly && nextView !== 'board') return;
    setView(nextView);
  };

  const exitSettings = useCallback(() => {
    setView(activeWorkspace && activeBoard ? 'board' : 'home');
  }, [activeBoard, activeWorkspace, setView]);

  const handleStartMeetingRecord = () => {
    if (isMeetingMode) {
      void requestExitMeetingMode();
      return;
    }
    void guardRecordDraft(() => startMeetingRecord(), {
      title: '新增會議記錄？',
      message: '新增會議記錄會切到會議紀錄流程；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const handleStartWorkLog = () => {
    void guardRecordDraft(() => openNewRecord('work_log'), {
      title: '新增個人紀錄？',
      message: '新增個人紀錄會開啟新的紀錄草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const modeSwitcherOptions: ModeSwitcherOption<ViewMode>[] = [
    { value: 'list', label: '清單', icon: <ListChecks size={13} /> },
    { value: 'mindmap', label: '心智圖', icon: <Network size={13} /> },
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
      label: '紀錄庫',
      icon: <BookOpenText size={13} />,
      title: '查看與整理會議紀錄、會後會議紀錄與個人工作紀錄',
    },
  ];
  const visibleModeSwitcherOptions = isMobileBoardOnly
    ? modeSwitcherOptions.filter(option => option.value === 'board')
    : modeSwitcherOptions;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 640px)');
    const updateSmallViewport = () => setIsSmallViewport(query.matches);
    updateSmallViewport();
    query.addEventListener?.('change', updateSmallViewport);
    return () => query.removeEventListener?.('change', updateSmallViewport);
  }, []);

  useEffect(() => {
    if (!isMobileBoardOnly || !activeWorkspace || !activeBoard) return;
    if (!mobileBlockedViews.has(currentView)) return;
    setView('board');
  }, [activeBoard, activeWorkspace, currentView, isMobileBoardOnly, mobileBlockedViews, setView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
      const target = event.target as HTMLElement;
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isEditable) return;

      if (event.key === 'Escape' && isSettingsScopeView) {
        event.preventDefault();
        exitSettings();
        return;
      }

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
  }, [canRedo, canUndo, exitSettings, isSettingsScopeView, redo, undo]);

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-800" data-mobile-density="compact">
      <nav className="app-main-nav z-40 flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 shadow-sm sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="mr-1 rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 sm:mr-2"
            title={isSidebarOpen ? '收合側欄' : '展開側欄'}
          >
            <Menu size={18} />
          </button>

          <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium sm:gap-2">
            <Layout className="h-5 w-5 shrink-0 text-primary" />
            <span className="shrink-0 font-bold text-slate-700">ProJED</span>

            {isSettingsScopeView && (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="font-bold text-slate-700">設定</span>
                {currentView === 'calendar_subscriptions' ? (
                  <>
                    <ChevronRight size={14} className="text-slate-300" />
                    <span className="font-bold text-slate-500">日曆訂閱</span>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={exitSettings}
                  className="ml-2 inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-primary/40 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  title="離開設定 (Esc)"
                >
                  <ArrowLeft size={13} />
                  <span className="hidden sm:inline">離開設定</span>
                  <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">Esc</span>
                </button>
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
                <span className="shrink-0 text-slate-300" aria-hidden="true">/</span>
                <h1
                  contentEditable
                  suppressContentEditableWarning
                  title={`目前位置：${activeWorkspace.title} / ${activeBoard.title}`}
                  onBlur={(event) => updateBoardTitle(activeWorkspace.id, activeBoard.id, event.currentTarget.innerText)}
                  className="app-board-title min-w-[1.5rem] max-w-[4.5rem] cursor-text truncate rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 hover:bg-slate-100 focus:bg-white focus:outline-primary sm:max-w-[180px] sm:px-2 sm:text-sm md:max-w-[260px]"
                >
                  {activeBoard.title}
                </h1>

                <div className="ml-0 flex items-center gap-1 border-l-0 border-slate-200 pl-0 sm:ml-[10px] sm:gap-[8px] sm:border-l sm:pl-[10px]">
                  <ModeSwitcher
                    value={currentView}
                    options={visibleModeSwitcherOptions}
                    onChange={handleModeChange}
                    disabled={isSelectingMode}
                    disabledTitle={isMeetingMode ? '紀錄中先離開紀錄再切換檢視' : '選取模式中無法切換檢視'}
                  />

                  {isTaskFilterView ? (
                    <StatusFilterBar compactLabel />
                  ) : null}

                  <div className="ml-0 hidden items-center gap-px border-l border-slate-200 pl-[8px] sm:flex">
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

        <div className="relative z-20 flex shrink-0 items-center gap-1 sm:gap-2">
          {isBoardWorkspaceView && activeWorkspace && activeBoard ? (
            <button
              type="button"
              onClick={() => setShareDialogOpen(true)}
              className="btn-outline flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-all hover:border-blue-400 hover:text-blue-600 sm:h-8 sm:px-3 sm:text-sm"
              title="分享看板"
              data-board-share-open
            >
              <UserPlus size={14} className="text-slate-400" />
              <span>分享</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                {boardMemberCount}
              </span>
            </button>
          ) : null}

          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
          {isMeetingMode ? (
            <div
              role="status"
              data-active-record-kind="meeting"
              className="btn-outline flex h-7 shrink-0 cursor-default items-center gap-1.5 whitespace-nowrap border-blue-200 bg-blue-50 px-2 text-xs text-blue-700 sm:h-8 sm:px-3 sm:text-sm"
              title="已開啟會議紀錄；離開請使用右側紀錄欄的離開紀錄。"
            >
              <BookOpenText size={14} className="text-blue-600" />
              <span className="hidden lg:inline">紀錄中</span>
            </div>
          ) : isNonMeetingRecordOpen ? (
            <div
              role="status"
              data-active-record-kind="work-log"
              className="btn-outline flex h-7 shrink-0 cursor-default items-center gap-1.5 whitespace-nowrap border-blue-200 bg-blue-50 px-2 text-xs text-blue-700 sm:h-8 sm:px-3 sm:text-sm"
              title="已開啟個人紀錄；若要新增會議記錄，請先離開目前紀錄。"
            >
              <BookOpenText size={14} className="text-blue-600" />
              <span className="hidden lg:inline">紀錄中</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartMeetingRecord}
              className="btn-outline flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-all hover:border-emerald-400 hover:text-emerald-600 sm:h-8 sm:px-3 sm:text-sm"
              title="新增會議記錄，切到看板並開啟右側紀錄欄"
            >
              <SquarePen size={14} className="text-slate-400" />
              <span className="hidden lg:inline">新增會議記錄</span>
            </button>
          )}

          {!isMeetingMode && !isRecordOpen ? (
            <button
              type="button"
              onClick={handleStartWorkLog}
              className="btn-outline flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-all hover:border-slate-400 hover:text-slate-700 sm:h-8 sm:px-3 sm:text-sm"
              title="新增個人紀錄開發中，內容可能尚未穩定"
            >
              <BriefcaseBusiness size={14} className="text-slate-400" />
              <span className="hidden xl:inline">新增個人紀錄(開發中)</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleRagPanel}
            className={`btn-outline flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-all sm:h-8 sm:px-3 sm:text-sm ${
              isRagOpen ? 'border-blue-400 bg-blue-50 text-blue-600' : 'hover:border-blue-400 hover:text-blue-600'
            }`}
            title="開啟 AI 全域分析"
          >
            <Sparkles size={14} className={isRagOpen ? 'text-blue-500' : 'text-slate-400'} />
            <span className="hidden lg:inline">AI 分析</span>
          </button>
          </div>
        </div>
      </nav>

      <BoardShareDialog open={isShareDialogOpen} onOpenChange={setShareDialogOpen} />

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
