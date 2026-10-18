// @ts-nocheck
import React from 'react';
import { X } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useRecordDraftGuard } from '../hooks/useRecordDraftGuard';
import { toast } from '../store/useToastStore';
import { markLeftPanelClosed, markLeftPanelOpened } from '../utils/leftPanelEscapeStack';
import { usePanelPreview } from './panelPreviewContext';
import {
  clampTaskDetailsModalSize,
  getTaskDetailsModalDefaultSize,
  getTaskDetailsModalMaximumSize,
  getTaskDetailsModalMinimumSize,
} from './taskDetailsModalSizing';
import { isPrimaryPointerActivation } from '../interactions/pointerActivation';

const BOARD_WORKSPACE_VIEWS = ['list', 'mindmap', 'board', 'goal', 'gantt', 'calendar'];
const SETTINGS_SCOPE_VIEWS = ['settings', 'calendar_subscriptions'];
const TITLE_INPUT_CLASS =
  'min-w-0 flex-1 rounded border border-primary/30 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

const isTextInputEvent = (event) => {
  const target = event.target;
  return target?.closest?.('input, textarea, select, [contenteditable="true"]');
};

const Sidebar = () => {
  const { previewedPanel } = usePanelPreview();
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
    setContextMenuState,
    pendingWorkspaceTitleEditId,
    setPendingWorkspaceTitleEditId,
    pendingWorkspaceCreateRequestId,
    clearCreateWorkspaceRequest,
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
  const getViewport = React.useCallback(() => ({
    width: typeof window === 'undefined' ? 1120 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  }), []);
  const [workspaceModalSize, setWorkspaceModalSize] = React.useState(() => (
    getTaskDetailsModalDefaultSize(getViewport())
  ));
  const workspaceModalMinimumSize = getTaskDetailsModalMinimumSize(getViewport());
  const workspaceModalMaximumSize = getTaskDetailsModalMaximumSize(getViewport());
  const isSettingsScopeView = SETTINGS_SCOPE_VIEWS.includes(currentView);
  const { canCreateBoard, canEditBoardSettings } = useBoardPermissions();
  const guardRecordDraft = useRecordDraftGuard();

  React.useEffect(() => {
    const handleViewportResize = () => {
      setWorkspaceModalSize(previousSize => clampTaskDetailsModalSize(previousSize, getViewport()));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [getViewport]);

  React.useEffect(() => {
    if (!isSidebarOpen) {
      markLeftPanelClosed('workspace-sidebar');
      return undefined;
    }
    markLeftPanelOpened('workspace-sidebar');
    return () => markLeftPanelClosed('workspace-sidebar');
  }, [isSidebarOpen]);

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
    // A newly-created board is represented by a temporary local id until the
    // backend returns its canonical project id. Do not open the title editor
    // against that id; the update would race the create request and attempt to
    // resolve a project that does not exist yet.
    if (!workspace || !board || board.id.startsWith('b_')) return;
    startBoardTitleEdit(workspace, board);
    setPendingBoardTitleEdit(null);
  }, [pendingBoardTitleEdit, setPendingBoardTitleEdit, startBoardTitleEdit, workspaces]);

  const handleWorkspaceContextMenu = (event, workspace) => {
    event.preventDefault();
    setContextMenuState({
      kind: 'workspace',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      workspaceId: workspace.id,
      title: workspace.title,
    });
  };

  const handleSidebarContextMenu = (event) => {
    const target = event.target;
    if (target?.closest?.('[data-sidebar-workspace-group="true"], button, input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    event.preventDefault();
    setContextMenuState({
      kind: 'sidebar',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      title: '工作區',
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

  const openCreateWorkspaceDialog = React.useCallback(() => {
    setNewWorkspaceTitle('');
    setNewWorkspaceError('');
    setIsCreateWorkspaceOpen(true);
  }, []);

  React.useEffect(() => {
    if (!pendingWorkspaceCreateRequestId) return;
    openCreateWorkspaceDialog();
    clearCreateWorkspaceRequest();
  }, [clearCreateWorkspaceRequest, openCreateWorkspaceDialog, pendingWorkspaceCreateRequestId]);

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

  if (!isSidebarOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.detail > 1) return;
        if (event.target === event.currentTarget && isPrimaryPointerActivation(event)) {
          setSidebarOpen(false);
        }
      }}
      data-sidebar-backdrop="true"
    >
      <aside
        id="workspace-board-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="工作區與看板"
        className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        style={{
          width: workspaceModalSize.width,
          height: workspaceModalSize.height,
          minWidth: workspaceModalMinimumSize.width,
          minHeight: workspaceModalMinimumSize.height,
          maxWidth: workspaceModalMaximumSize.width,
          maxHeight: workspaceModalMaximumSize.height,
          resize: 'both',
        }}
        onMouseDown={(event) => event.stopPropagation()}
        data-sidebar-panel="expanded"
        data-layout-region="workspace-sidebar"
        data-sidebar-inline="true"
        data-sidebar-popup="true"
        data-sidebar-modal-dialog="true"
        data-ui-container="workspace-sidebar"
        data-panel-previewed={previewedPanel === 'workspace-sidebar' ? 'workspace-sidebar' : undefined}
      >
      <div
        className={previewedPanel === 'workspace-sidebar' ? 'flex h-full w-full flex-col ring-2 ring-inset ring-primary-400/95' : 'flex h-full w-full flex-col'}
        data-panel-preview-subtree={previewedPanel === 'workspace-sidebar' ? 'workspace-sidebar' : undefined}
      >
        <div
          className={previewedPanel === 'workspace-sidebar' ? 'relative border border-primary-500 bg-primary-50/70 px-3 py-2.5 ring-2 ring-inset ring-primary-500' : 'relative border border-slate-200/90 bg-slate-100/90 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.06)]'}
          data-sidebar-control-area="true"
          data-panel-preview-source={previewedPanel === 'workspace-sidebar' ? 'workspace-sidebar' : undefined}
        >
          <div className="flex items-center gap-2">
            <div
              className="min-w-0 shrink-0 px-1 py-1"
              data-sidebar-title="true"
            >
              <div className="whitespace-nowrap text-sm font-black text-slate-700">
                工作區與看板
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="關閉工作區與看板"
              aria-label="關閉工作區與看板"
              data-sidebar-collapse-toggle="true"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/90 p-3"
          onContextMenu={handleSidebarContextMenu}
          data-sidebar-workspace-list="true"
        >
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <section
                key={ws.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                data-sidebar-workspace-group="true"
              >
                <div
                  className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5"
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
                      data-workspace-title-input="true"
                    />
                  ) : (
                    <span
                      tabIndex={0}
                      data-sidebar-workspace-title="true"
                      onKeyDown={(event) => {
                        if (isTextInputEvent(event)) return;
                        if (event.key === 'F2') {
                          event.preventDefault();
                          startWorkspaceTitleEdit(ws);
                        }
                      }}
                      className="min-w-0 flex-1 truncate rounded text-left text-sm font-semibold text-slate-700 outline-none transition-colors hover:text-primary focus:ring-2 focus:ring-primary/30"
                      title="右鍵開啟選單，F2 重新命名"
                    >
                      {ws.title}
                    </span>
                  )}
                </div>

                <div className="grid gap-2 p-2 sm:grid-cols-2" data-sidebar-board-tree="true">
                  {ws.boards.length ? ws.boards.map((board) => {
                    const isCurrentBoard = activeBoardId === board.id;
                    const isMainBoardActive = isCurrentBoard && (BOARD_WORKSPACE_VIEWS.includes(currentView) || isSettingsScopeView);
                    const isEditingBoard = editingBoard?.workspaceId === ws.id && editingBoard?.boardId === board.id;
                    const boardItemTitle = isSettingsScopeView && isCurrentBoard
                      ? '點擊回到看板'
                      : undefined;
                    const handleBoardClick = () => {
                      const switchToBoard = () => {
                        switchBoard(ws.id, board.id);
                        setSidebarOpen(false);
                      };
                      if (isCurrentBoard && isMainBoardActive) {
                        switchToBoard();
                        return;
                      }
                      void guardRecordDraft(switchToBoard, {
                        title: isCurrentBoard ? '返回看板？' : '切換看板？',
                        message: '切換看板會離開目前紀錄；若尚未完成本機保存，請先決定是否存草稿。',
                      });
                    };

                    return (
                      <div
                        key={board.id}
                        role="button"
                        tabIndex={0}
                        data-sidebar-board-row="true"
                        data-sidebar-current-settings-project={isSettingsScopeView && isCurrentBoard ? 'true' : undefined}
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
                        className={`group/item flex min-h-[66px] w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                          isMainBoardActive
                            ? 'cursor-pointer border-primary bg-primary text-white shadow-md ring-1 ring-primary/20'
                            : 'cursor-pointer border-slate-200 bg-slate-50/80 text-slate-700 hover:border-primary/30 hover:bg-white hover:shadow-sm'
                        }`}
                      >
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
                            data-board-title-input="true"
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
                      </div>
                    );
                  }) : (
                    <p className="col-span-full px-2 py-2 text-xs text-slate-400">
                      此工作區尚未建立看板
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

      </div>

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
    </div>
  );
};

export default Sidebar;
