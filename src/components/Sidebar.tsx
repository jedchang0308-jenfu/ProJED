// @ts-nocheck
import React from 'react';
import { ChevronLeft, ChevronRight, LayoutDashboard, LogOut, NotebookText, Plus, Settings, X } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
import useTaskZoneStore from '../store/useTaskZoneStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { toast } from '../store/useToastStore';

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
    addWorkspace,
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
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = React.useState(false);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = React.useState('');
  const [newWorkspaceError, setNewWorkspaceError] = React.useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = React.useState(false);
  const isSettingsScopeView = SETTINGS_SCOPE_VIEWS.includes(currentView);
  const taskZoneCount = useTaskZoneStore((state) => state.getUnplacedCount());
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

  const handleWorkspaceTitleKeyDown = (event, workspace) => {
    if (isTextInputEvent(event)) return;
    if (event.key !== 'F2') return;
    event.preventDefault();
    startWorkspaceTitleEdit(workspace);
  };

  const openCreateWorkspaceDialog = React.useCallback(() => {
    setNewWorkspaceTitle('');
    setNewWorkspaceError('');
    setIsCreateWorkspaceOpen(true);
  }, []);

  const closeCreateWorkspaceDialog = React.useCallback(() => {
    if (isCreatingWorkspace) return;
    setIsCreateWorkspaceOpen(false);
    setNewWorkspaceTitle('');
    setNewWorkspaceError('');
  }, [isCreatingWorkspace]);

  const handleCreateWorkspaceSubmit = React.useCallback(async (event) => {
    event.preventDefault();
    const title = newWorkspaceTitle.trim();
    if (!title) {
      setNewWorkspaceError('請輸入工作區名稱。');
      return;
    }

    setIsCreatingWorkspace(true);
    setNewWorkspaceError('');
    try {
      const createdWorkspace = await addWorkspace(title);
      toast.success(`已建立工作區「${createdWorkspace.title || title}」。`);
      setIsCreateWorkspaceOpen(false);
      setNewWorkspaceTitle('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '建立工作區失敗，請稍後再試。';
      setNewWorkspaceError(message);
      toast.error(message);
    } finally {
      setIsCreatingWorkspace(false);
    }
  }, [addWorkspace, newWorkspaceTitle]);

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
          <button
            onClick={() => setView('task_zone')}
            className={`relative rounded-full p-1.5 transition-colors ${
              currentView === 'task_zone'
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-100 hover:text-primary'
            }`}
            title="任務專區"
          >
            <NotebookText size={18} />
            {taskZoneCount > 0 ? (
              <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-4 text-white">
                {taskZoneCount}
              </span>
            ) : null}
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openCreateWorkspaceDialog}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                title="新增工作區"
                aria-label="新增工作區"
                data-sidebar-create-workspace-button="true"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
                title="收合工作區選單"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setView('task_zone')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                currentView === 'task_zone'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-primary'
              }`}
              data-sidebar-task-zone="true"
            >
              <NotebookText size={16} className={currentView === 'task_zone' ? 'text-white/90' : 'text-slate-400'} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">任務專區</span>
              {taskZoneCount > 0 ? (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  currentView === 'task_zone' ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-600'
                }`}>
                  {taskZoneCount}
                </span>
              ) : null}
            </button>

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
                    <span
                      tabIndex={0}
                      data-sidebar-workspace-title="true"
                      onKeyDown={(event) => handleWorkspaceTitleKeyDown(event, ws)}
                      className="min-w-0 flex-1 truncate rounded text-left text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      title="右鍵開啟選單，F2 重新命名"
                    >
                      {ws.title}
                    </span>
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
                        data-sidebar-board-row="true"
                        data-sidebar-current-settings-project={isCurrentSettingsProject ? 'true' : undefined}
                        title={boardItemTitle}
                        onClick={handleBoardClick}
                        onContextMenu={(event) => handleBoardContextMenu(event, ws, board)}
                        onKeyDown={(event) => {
                          if (isTextInputEvent(event)) return;
                          if (event.key === 'F2') {
                            event.preventDefault();
                            if (canEditBoardSettings) {
                              startBoardTitleEdit(ws, board);
                            }
                            return;
                          }
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
                          <span
                            data-sidebar-board-title="true"
                            className="min-w-0 flex-1 truncate rounded text-left text-sm font-medium"
                            title={canEditBoardSettings ? '點擊開啟看板，右鍵開啟選單，F2 重新命名' : '點擊開啟看板'}
                          >
                            {board.title}
                          </span>
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

      {isCreateWorkspaceOpen ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          data-workspace-create-dialog="true"
        >
          <form
            onSubmit={handleCreateWorkspaceSubmit}
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">新增工作區</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  工作區用來收納同一個團隊、部門或大型協作範圍下的看板。
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateWorkspaceDialog}
                disabled={isCreatingWorkspace}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="取消新增工作區"
                aria-label="取消新增工作區"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-sm font-semibold text-slate-700" htmlFor="new-workspace-title">
              工作區名稱
            </label>
            <input
              id="new-workspace-title"
              value={newWorkspaceTitle}
              autoFocus
              onChange={(event) => {
                setNewWorkspaceTitle(event.target.value);
                if (newWorkspaceError) setNewWorkspaceError('');
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="例如：研發部"
              aria-invalid={newWorkspaceError ? 'true' : 'false'}
              aria-describedby={newWorkspaceError ? 'new-workspace-error' : undefined}
              disabled={isCreatingWorkspace}
            />
            {newWorkspaceError ? (
              <p id="new-workspace-error" role="alert" className="mt-2 text-sm font-medium text-red-600">
                {newWorkspaceError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateWorkspaceDialog}
                disabled={isCreatingWorkspace}
                className="rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isCreatingWorkspace || !newWorkspaceTitle.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {isCreatingWorkspace ? '建立中...' : '建立'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
};

export default Sidebar;
