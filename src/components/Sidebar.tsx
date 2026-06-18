// @ts-nocheck
import React from 'react';
import { ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';

const BOARD_WORKSPACE_VIEWS = ['list', 'board', 'gantt', 'calendar'];
const SETTINGS_SCOPE_VIEWS = ['settings', 'calendar_subscriptions'];
const TITLE_INPUT_CLASS =
  'min-w-0 flex-1 rounded border border-primary/30 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

const isTextInputEvent = (event) => {
  const target = event.target;
  return target?.closest?.('input, textarea, select, [contenteditable="true"]');
};

const Sidebar = () => {
  const {
    workspaces,
    activeBoardId,
    switchBoard,
    isSidebarOpen,
    setSidebarOpen,
    updateWorkspaceTitle,
    updateBoardTitle,
    currentView,
    setView,
    setContextMenuState,
    pendingWorkspaceTitleEditId,
    setPendingWorkspaceTitleEditId,
    pendingBoardTitleEdit,
    setPendingBoardTitleEdit,
  } = useBoardStore();

  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState(null);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = React.useState('');
  const [editingBoard, setEditingBoard] = React.useState(null);
  const [boardTitleDraft, setBoardTitleDraft] = React.useState('');
  const isSettingsScopeView = SETTINGS_SCOPE_VIEWS.includes(currentView);
  const { canCreateBoard, canDeleteWorkspace, canEditBoardSettings } = useBoardPermissions();
  const canOpenWorkspaceContextMenu = canCreateBoard || canDeleteWorkspace;

  const startWorkspaceTitleEdit = React.useCallback((workspace) => {
    setEditingBoard(null);
    setBoardTitleDraft('');
    setEditingWorkspaceId(workspace.id);
    setWorkspaceTitleDraft(workspace.title || '');
  }, []);

  const cancelWorkspaceTitleEdit = React.useCallback(() => {
    setEditingWorkspaceId(null);
    setWorkspaceTitleDraft('');
  }, []);

  const commitWorkspaceTitleEdit = React.useCallback((workspace) => {
    const title = workspaceTitleDraft.trim();
    if (title && title !== workspace.title) {
      updateWorkspaceTitle(workspace.id, title);
    }
    cancelWorkspaceTitleEdit();
  }, [cancelWorkspaceTitleEdit, updateWorkspaceTitle, workspaceTitleDraft]);

  const startBoardTitleEdit = React.useCallback((workspace, board) => {
    setEditingWorkspaceId(null);
    setWorkspaceTitleDraft('');
    setEditingBoard({ workspaceId: workspace.id, boardId: board.id });
    setBoardTitleDraft(board.title || '');
  }, []);

  const cancelBoardTitleEdit = React.useCallback(() => {
    setEditingBoard(null);
    setBoardTitleDraft('');
  }, []);

  const commitBoardTitleEdit = React.useCallback((workspace, board) => {
    const title = boardTitleDraft.trim();
    if (title && title !== board.title) {
      updateBoardTitle(workspace.id, board.id, title);
    }
    cancelBoardTitleEdit();
  }, [boardTitleDraft, cancelBoardTitleEdit, updateBoardTitle]);

  React.useEffect(() => {
    if (!pendingWorkspaceTitleEditId) return;
    const workspace = workspaces.find((item) => item.id === pendingWorkspaceTitleEditId);
    if (workspace) {
      startWorkspaceTitleEdit(workspace);
    }
    setPendingWorkspaceTitleEditId(null);
  }, [pendingWorkspaceTitleEditId, setPendingWorkspaceTitleEditId, startWorkspaceTitleEdit, workspaces]);

  React.useEffect(() => {
    if (!pendingBoardTitleEdit) return;
    const workspace = workspaces.find((item) => item.id === pendingBoardTitleEdit.workspaceId);
    const board = workspace?.boards.find((item) => item.id === pendingBoardTitleEdit.boardId);
    if (workspace && board) {
      startBoardTitleEdit(workspace, board);
    }
    setPendingBoardTitleEdit(null);
  }, [pendingBoardTitleEdit, setPendingBoardTitleEdit, startBoardTitleEdit, workspaces]);

  const handleWorkspaceContextMenu = (event, workspace) => {
    event.preventDefault();
    if (!canOpenWorkspaceContextMenu) return;
    setContextMenuState({
      kind: 'workspace',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      workspaceId: workspace.id,
      title: workspace.title,
    });
  };

  const handleBoardContextMenu = (event, workspace, board) => {
    event.preventDefault();
    if (!canCreateBoard && !canEditBoardSettings) return;
    setContextMenuState({
      kind: 'board',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      workspaceId: workspace.id,
      boardId: board.id,
      title: board.title,
    });
  };

  return (
    <aside className={`relative z-30 flex-shrink-0 overflow-hidden border-r border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-10'}`}>
      {!isSidebarOpen ? (
        <div className="flex h-full flex-1 flex-col items-center gap-4 bg-slate-50/30 pt-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-1.5 text-primary transition-colors hover:bg-slate-100"
            title="展開工作區選單"
          >
            <ChevronRight size={18} />
          </button>
          <div className="w-px flex-1 bg-slate-100" />
          <button
            onClick={() => setView('settings')}
            className={`mb-3 rounded-full p-1.5 transition-colors ${
              isSettingsScopeView
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-100 hover:text-primary'
            }`}
            title="設定"
          >
            <Settings size={18} />
          </button>
        </div>
      ) : (
        <div className="flex h-full w-64 flex-col">
          <div className="flex h-14 items-center justify-between border-b-2 border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold text-slate-500">工作區選單</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200"
              title="收合工作區選單"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-2">
            {workspaces.map((ws) => (
              <div key={ws.id} className="space-y-1">
                <div
                  className="group flex items-center justify-between gap-2 px-3 py-2"
                  onContextMenu={(event) => handleWorkspaceContextMenu(event, ws)}
                >
                  {editingWorkspaceId === ws.id ? (
                    <input
                      value={workspaceTitleDraft}
                      autoFocus
                      onChange={(event) => setWorkspaceTitleDraft(event.target.value)}
                      onBlur={() => commitWorkspaceTitleEdit(ws)}
                      onKeyDown={(event) => {
                        if (event.nativeEvent?.isComposing) return;
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelWorkspaceTitleEdit();
                        }
                      }}
                      className={TITLE_INPUT_CLASS}
                      aria-label="編輯工作區名稱"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startWorkspaceTitleEdit(ws)}
                      className="min-w-0 flex-1 truncate rounded text-left text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      title="點擊改名，右鍵開啟選單"
                    >
                      {ws.title}
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {ws.boards.map((board) => {
                    const isCurrentBoard = activeBoardId === board.id;
                    const isMainBoardActive = isCurrentBoard && BOARD_WORKSPACE_VIEWS.includes(currentView);
                    const isCurrentSettingsProject = isSettingsScopeView && isCurrentBoard;
                    const isBoardSwitchLocked = isSettingsScopeView;
                    const isEditingBoard = editingBoard?.workspaceId === ws.id && editingBoard?.boardId === board.id;
                    const boardItemTitle = isSettingsScopeView
                      ? isCurrentBoard
                        ? '目前正在此專案設定中'
                        : '請先離開設定頁面再切換專案'
                      : undefined;
                    const handleBoardClick = () => {
                      if (isBoardSwitchLocked) return;
                      switchBoard(ws.id, board.id);
                    };

                    return (
                      <div
                        key={board.id}
                        role="button"
                        tabIndex={0}
                        aria-disabled={isBoardSwitchLocked && !isCurrentBoard}
                        data-sidebar-current-settings-project={isCurrentSettingsProject ? 'true' : undefined}
                        title={boardItemTitle}
                        onClick={handleBoardClick}
                        onContextMenu={(event) => handleBoardContextMenu(event, ws, board)}
                        onKeyDown={(event) => {
                          if (isTextInputEvent(event)) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleBoardClick();
                          }
                        }}
                        className={`group/item flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                          isMainBoardActive
                            ? 'cursor-pointer bg-primary text-white shadow-md'
                            : isCurrentSettingsProject
                              ? 'cursor-default border border-primary/20 bg-primary-light/40 text-primary shadow-sm'
                              : isBoardSwitchLocked
                                ? 'cursor-not-allowed text-slate-300 opacity-70'
                                : 'cursor-pointer text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <LayoutDashboard
                          size={16}
                          className={
                            isMainBoardActive
                              ? 'text-white'
                              : isCurrentSettingsProject
                                ? 'text-primary'
                                : 'text-slate-400'
                          }
                        />

                        {isEditingBoard ? (
                          <input
                            value={boardTitleDraft}
                            autoFocus
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setBoardTitleDraft(event.target.value)}
                            onBlur={() => commitBoardTitleEdit(ws, board)}
                            onKeyDown={(event) => {
                              if (event.nativeEvent?.isComposing) return;
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelBoardTitleEdit();
                              }
                            }}
                            className={`${TITLE_INPUT_CLASS} text-sm ${isMainBoardActive ? 'text-slate-700' : ''}`}
                            aria-label="編輯看板名稱"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canEditBoardSettings) return;
                              startBoardTitleEdit(ws, board);
                            }}
                            className="min-w-0 flex-1 truncate rounded text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                            title={canEditBoardSettings ? '點擊改名，右鍵開啟選單' : '你沒有編輯看板設定的權限'}
                          >
                            {board.title}
                          </button>
                        )}

                        {isCurrentSettingsProject ? (
                          <span className="shrink-0 rounded border border-primary/20 bg-white px-1.5 py-0.5 text-[11px] font-bold text-primary">
                            設定中
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-2">
            <button
              onClick={() => setView('settings')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isSettingsScopeView
                  ? 'bg-primary text-sm font-bold tracking-wide text-white shadow-md'
                  : 'text-sm font-medium text-slate-600 hover:bg-white hover:text-primary hover:shadow-sm'
              }`}
            >
              <Settings size={16} className={isSettingsScopeView ? 'text-white/90' : 'text-slate-400'} />
              <span className="min-w-0 flex-1 truncate text-left">設定</span>
            </button>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-sm">
                {(useAuthStore.getState().user?.displayName || 'U')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-700">{useAuthStore.getState().user?.displayName || '使用者'}</div>
                <div className="truncate text-xs text-slate-400">{useAuthStore.getState().user?.email || ''}</div>
              </div>
              <button
                onClick={() => useAuthStore.getState().signOut()}
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="登出"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
