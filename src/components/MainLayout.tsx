import React, { useCallback, useEffect } from 'react';
import {
  BookOpenText,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Columns,
  LineChart,
  ListChecks,
  LockKeyhole,
  Menu,
  Network,
  Redo2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useUndoStore from '../store/useUndoStore';
import useRagStore from '../store/useRagStore';
import useRecordStore from '../store/useRecordStore';
import { useMemberStore } from '../store/useMemberStore';
import { useMeetingModeExitGuard } from '../hooks/useMeetingModeExitGuard';
import { useRecordDraftGuard } from '../hooks/useRecordDraftGuard';
import { useMeetingRecordAvailability } from '../utils/meetingRecordAvailability';
import { cn } from '../utils/cn';
import Sidebar from './Sidebar';
import { GlobalContextMenu } from './GlobalContextMenu';
import { BoardShareDialog } from './BoardMembersPanel';
import RagSidebar from './Rag/RagSidebar';
import RecordSidebar from './Records/RecordSidebar';
import { closeTaskWorkbenchPanel, toggleTaskWorkbenchPanel } from './taskWorkbenchPanelCommands';
import { topbarClassNames } from './ui/compactTokens';
import { ModeSwitcher, type ModeSwitcherOption } from './ui/ModeSwitcher';
import { StatusFilterBar } from './ui/StatusFilterBar';
import type { ViewMode } from '../types';
import { getTopOpenLeftPanel } from '../utils/leftPanelEscapeStack';
import {
  PanelPreviewProvider,
  type PanelPreviewId,
} from './panelPreviewContext';
import {
  selectPendingTaskFilterRefreshCount,
  useDeferredTaskFilterRefreshStore,
} from '../features/taskFilters/deferredRefresh';
import { useWbsStore } from '../store/useWbsStore';
import { clearTaskSelection } from '../utils/taskInteractions';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const {
    currentView,
    getActiveBoard,
    getActiveWorkspace,
    setView,
    isSidebarOpen,
    setSidebarOpen,
    dependencySelection,
  } = useBoardStore();

  const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndoStore();
  const pendingTaskFilterRefreshCount = useDeferredTaskFilterRefreshStore(selectPendingTaskFilterRefreshCount);
  const { isOpen: isRagOpen, togglePanel: toggleRagPanel } = useRagStore();
  const {
    isPanelOpen: isRecordOpen,
    isPanelCollapsed: isRecordPanelCollapsed,
    isMeetingMode,
    startMeetingRecord,
    isTaskSelectionMode,
  } = useRecordStore();
  const requestExitMeetingMode = useMeetingModeExitGuard();
  const guardRecordDraft = useRecordDraftGuard();
  const boardMemberCount = useMemberStore(state => state.boardMembers.length);
  const [isShareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [previewedPanel, setPreviewedPanel] = React.useState<PanelPreviewId | null>(null);
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();

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
  const isSystemPageView = isSettingsScopeView || currentView === 'records';
  const isMobileBoardOnly = isMeetingRecordUnavailable;
  const canPreviewPanels = !isMobileBoardOnly;
  const mobileBlockedViews = React.useMemo(() => new Set<ViewMode>(['list', 'mindmap', 'gantt', 'calendar']), []);

  const handlePanelPreview = useCallback((panel: PanelPreviewId) => {
    if (!canPreviewPanels) return;
    setPreviewedPanel(panel);
  }, [canPreviewPanels]);

  const handleModeChange = (nextView: ViewMode) => {
    if (isMobileBoardOnly && nextView !== 'board') return;
    setView(nextView);
  };

  const handleApplyTaskFilterRefresh = useCallback(() => {
    const appliedCount = useDeferredTaskFilterRefreshStore.getState().applyPendingStatusChanges();
    if (appliedCount === 0) return;

    // Refresh both node-driven projections and list roots whose memoization is
    // keyed by the active filter object.
    useWbsStore.setState(state => ({ nodes: { ...state.nodes } }));
    useBoardStore.setState(state => ({ statusFilters: { ...state.statusFilters } }));
  }, []);

  const returnToBoard = useCallback(() => {
    setView(activeWorkspace && activeBoard ? 'board' : 'home');
  }, [activeBoard, activeWorkspace, setView]);

  const handleToggleMobileTaskWorkbench = useCallback(() => {
    if (isMobileBoardOnly) setSidebarOpen(false);
    setView(activeWorkspace && activeBoard ? 'board' : 'home');
    toggleTaskWorkbenchPanel();
  }, [activeBoard, activeWorkspace, isMobileBoardOnly, setSidebarOpen, setView]);

  const handleToggleWorkspaceSidebar = useCallback(() => {
    if (isMobileBoardOnly && !isSidebarOpen) closeTaskWorkbenchPanel();
    setSidebarOpen(!isSidebarOpen);
  }, [isMobileBoardOnly, isSidebarOpen, setSidebarOpen]);

  const handleStartMeetingRecord = () => {
    if (isMeetingRecordUnavailable) return;
    if (isMeetingMode) {
      void requestExitMeetingMode();
      return;
    }
    void guardRecordDraft(() => startMeetingRecord(), {
      title: '新增會議記錄？',
      message: '新增會議記錄會切到會議紀錄流程；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const modeSwitcherOptions: ModeSwitcherOption<ViewMode>[] = [
    { value: 'board', label: '看板模式', icon: <Columns size={13} /> },
    { value: 'list', label: '清單模式', icon: <ListChecks size={13} /> },
    { value: 'mindmap', label: '心智圖模式', icon: <Network size={13} /> },
    { value: 'gantt', label: '甘特圖模式', icon: <LineChart size={13} /> },
    {
      value: 'calendar',
      label: '日曆模式',
      icon: <CalendarDays size={13} />,
      title: '日曆功能開發中，內容可能尚未穩定',
    },
  ];
  useEffect(() => {
    if (!isMobileBoardOnly || !activeWorkspace || !activeBoard) return;
    if (!mobileBlockedViews.has(currentView)) return;
    setView('board');
  }, [activeBoard, activeWorkspace, currentView, isMobileBoardOnly, mobileBlockedViews, setView]);

  useEffect(() => {
    if (canPreviewPanels) return;
    setPreviewedPanel(null);
  }, [canPreviewPanels]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
      const target = event.target as HTMLElement;
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isEditable) return;

      if (event.key === 'Escape') {
        const hasBlockingOverlay = Boolean(document.querySelector([
          '[data-task-details-modal="true"]',
          '[data-filter-menu-panel]',
          '[data-mode-switcher-menu="true"]',
          '[data-tag-picker-panel]',
          '[data-workspace-create-dialog="true"]',
          '.global-dialog-content',
        ].join(','))) || Boolean(useBoardStore.getState().contextMenuState?.isOpen);
        const topLeftPanel = hasBlockingOverlay ? null : getTopOpenLeftPanel();

        if (topLeftPanel) {
          event.preventDefault();
          if (topLeftPanel === 'task-workbench') {
            closeTaskWorkbenchPanel();
          } else {
            setSidebarOpen(false);
          }
          return;
        }

        if (!hasBlockingOverlay) {
          clearTaskSelection();
        }
      }

      if (event.key === 'Escape' && isSystemPageView) {
        event.preventDefault();
        returnToBoard();
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
  }, [canRedo, canUndo, isSystemPageView, redo, returnToBoard, setSidebarOpen, undo]);

  return (
    <PanelPreviewProvider value={{ previewedPanel, setPreviewedPanel }}>
      <div className="flex h-screen flex-col bg-slate-100 text-slate-800" data-mobile-density="compact">
      <nav
        className="app-main-nav z-40 flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-300/80 bg-white/95 px-2 shadow-[0_1px_8px_rgba(15,23,42,0.08)] backdrop-blur sm:px-3"
        data-layout-region="topbar"
        data-app-topbar="true"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={handleToggleWorkspaceSidebar}
            onPointerEnter={() => handlePanelPreview('workspace-sidebar')}
            onPointerLeave={() => setPreviewedPanel(null)}
            onFocus={() => handlePanelPreview('workspace-sidebar')}
            onBlur={() => setPreviewedPanel(null)}
            className={cn(
              topbarClassNames.iconButton,
              'mr-1 sm:mr-2',
              previewedPanel === 'workspace-sidebar' && 'z-50 border-primary-500 bg-primary-100 text-primary-800 ring-2 ring-primary-300 shadow-[0_0_0_4px_rgba(99,102,241,0.28)]',
            )}
            title={isSidebarOpen ? '收合側欄' : '展開側欄'}
            aria-label={isSidebarOpen ? '收合工作區選單' : '展開工作區選單'}
            data-main-sidebar-toggle="true"
          >
            <Menu size={18} />
          </button>
          <button
            type="button"
            onClick={handleToggleMobileTaskWorkbench}
            onPointerEnter={() => handlePanelPreview('task-workbench')}
            onPointerLeave={() => setPreviewedPanel(null)}
            onFocus={() => handlePanelPreview('task-workbench')}
            onBlur={() => setPreviewedPanel(null)}
            className={cn(
              topbarClassNames.iconButton,
              'text-primary-700 hover:text-primary-700',
              previewedPanel === 'task-workbench' && 'z-50 border-primary-500 bg-primary-100 text-primary-800 ring-2 ring-primary-300 shadow-[0_0_0_4px_rgba(99,102,241,0.28)]',
            )}
            title="開啟或收合全域任務平台"
            aria-label="開啟或收合全域任務平台"
            data-mobile-task-workbench-nav-entry="true"
          >
            <ClipboardList size={17} />
          </button>

          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium sm:gap-2"
            data-topbar-context-group="true"
          >
            {isSettingsScopeView && (
              <>
                <ChevronRight size={14} className="hidden text-slate-300 sm:block" />
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
                <ChevronRight size={14} className="hidden text-slate-300 sm:block" />
                <span className="font-bold text-slate-700">回收桶</span>
              </>
            ) : null}

            {isBoardWorkspaceView && activeWorkspace && activeBoard ? (
              <>
                <h1
                  title={`目前位置：${activeWorkspace.title} / ${activeBoard.title}`}
                  data-topbar-board-title="true"
                  className="app-board-title min-w-[1.5rem] shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 sm:px-2 sm:text-sm"
                >
                  {activeBoard.title}
                </h1>

                <div
                  className="ml-0 flex shrink-0 items-center gap-1 sm:ml-[10px]"
                  data-topbar-board-controls="true"
                >
                  {!isMobileBoardOnly ? (
                    <ModeSwitcher
                      value={currentView}
                      options={modeSwitcherOptions}
                      onChange={handleModeChange}
                      disabled={isSelectingMode}
                      disabledTitle={isMeetingMode ? '紀錄中先離開紀錄再切換檢視' : '選取模式中無法切換檢視'}
                    />
                  ) : null}

                  {isTaskFilterView ? (
                    <StatusFilterBar
                      compactLabel
                      pendingUpdateCount={pendingTaskFilterRefreshCount}
                      onApplyPendingUpdate={handleApplyTaskFilterRefresh}
                    />
                  ) : null}

                  <div className="ml-1 hidden items-center gap-1 border-l border-slate-300 pl-2 sm:flex">
                    <button
                      id="btn-undo"
                      type="button"
                      onClick={undo}
                      disabled={!canUndo()}
                      title={canUndo() ? `復原：${lastUndoLabel}\nCtrl+Z` : '沒有可復原的操作'}
                      className={cn(topbarClassNames.iconButton, !canUndo() && 'text-slate-300 hover:border-slate-300 hover:bg-white hover:text-slate-300')}
                    >
                      <Undo2 size={15} />
                    </button>
                    <button
                      id="btn-redo"
                      type="button"
                      onClick={redo}
                      disabled={!canRedo()}
                      title={canRedo() ? `重做：${lastRedoLabel}\nCtrl+Shift+Z` : '沒有可重做的操作'}
                      className={cn(topbarClassNames.iconButton, !canRedo() && 'text-slate-300 hover:border-slate-300 hover:bg-white hover:text-slate-300')}
                    >
                      <Redo2 size={15} />
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {currentView === 'home' ? (
              <>
                <ChevronRight size={14} className="hidden text-slate-300 sm:block" />
                <span className="font-bold text-slate-700">工作區總覽</span>
              </>
            ) : null}
          </div>
        </div>

        <div
          className="relative z-20 flex shrink-0 items-center gap-1 rounded-lg sm:gap-2"
          data-topbar-action-group="true"
        >
          {isBoardWorkspaceView && activeWorkspace && activeBoard ? (
            <div className="hidden shrink-0 items-center sm:flex">
              <button
                type="button"
                onClick={() => setShareDialogOpen(true)}
                className={cn(
                  'btn-outline h-7 shrink-0 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
                  topbarClassNames.textButton,
                  'hover:border-blue-400 hover:text-blue-600',
                )}
                title="分享看板"
                data-board-share-open
              >
                <span>分享</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                  {boardMemberCount}
                </span>
              </button>
            </div>
          ) : null}

          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
          {!isMeetingRecordUnavailable && (isMeetingMode ? (
            <div
              role="status"
              data-active-record-kind="meeting"
              className={cn(
                'btn-outline flex h-7 shrink-0 cursor-default px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
                topbarClassNames.textButton,
                'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
              )}
              title="已開啟會議紀錄；離開請使用右側紀錄欄的離開紀錄。"
            >
              <BookOpenText size={14} className="text-blue-600" />
              <span className="hidden lg:inline">紀錄中</span>
            </div>
          ) : isNonMeetingRecordOpen ? (
            <div
              role="status"
              data-active-record-kind="work-log"
              className={cn(
                'btn-outline flex h-7 shrink-0 cursor-default px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
                topbarClassNames.textButton,
                'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
              )}
              title="已開啟個人紀錄；若要新增會議記錄，請先離開目前紀錄。"
            >
              <BookOpenText size={14} className="text-blue-600" />
              <span className="hidden lg:inline">紀錄中</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartMeetingRecord}
              className={cn(
                'btn-outline flex h-7 shrink-0 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
                topbarClassNames.textButton,
                'hover:border-emerald-400 hover:text-emerald-600',
              )}
              title="新增會議記錄，切到看板並開啟右側紀錄欄"
            >
              <span className="hidden lg:inline">新增會議記錄</span>
            </button>
          ))}

          {!isMeetingMode && !isRecordOpen ? (
            <div className="group relative shrink-0">
              <button
                type="button"
                aria-disabled="true"
                aria-describedby="work-log-unavailable-tooltip"
                data-work-log-unavailable="true"
                onClick={(event) => event.preventDefault()}
                className={cn(
                  'btn-outline flex h-7 shrink-0 cursor-not-allowed px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
                  topbarClassNames.textButton,
                  'border-slate-200 bg-slate-50 text-slate-400',
                )}
              >
                <LockKeyhole size={14} aria-hidden="true" />
                <span className="hidden xl:inline">新增個人紀錄</span>
              </button>
              <div
                id="work-log-unavailable-tooltip"
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-max max-w-[220px] rounded-md border border-slate-200 bg-slate-800 px-3 py-2 text-xs leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                個人紀錄功能目前尚未開放，敬請期待。
              </div>
            </div>
          ) : null}

          </div>

          <button
            type="button"
            onClick={toggleRagPanel}
            className={cn(
              'btn-outline flex h-7 shrink-0 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm',
              topbarClassNames.textButton,
              isRagOpen ? 'border-blue-400 bg-blue-50 text-blue-600' : 'hover:border-blue-400 hover:text-blue-600',
            )}
            title="問AI"
            aria-label="問AI"
            data-ai-analysis-open="true"
          >
            <Sparkles size={14} className={isRagOpen ? 'text-blue-500' : 'text-slate-400'} />
            <span>問AI</span>
          </button>
        </div>
      </nav>

      <BoardShareDialog open={isShareDialogOpen} onOpenChange={setShareDialogOpen} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className={`relative flex h-full min-w-0 flex-1 flex-col ${meetingRecordReserveClass}`} data-app-main="true">
          {children}
        </main>

        <RecordSidebar />
        <RagSidebar />
      </div>

        <GlobalContextMenu />
      </div>
    </PanelPreviewProvider>
  );
};

export default MainLayout;
