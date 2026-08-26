// @ts-nocheck
import { create } from 'zustand';
import useAuthStore from './useAuthStore';
import useUndoStore from './useUndoStore';
import { workspaceService, boardService } from '../services/dataBackend';
import type { BoardStore, ViewMode } from '../types';
import type { BoardContextMenuState } from '../types';
import type { TaskHostMode, TaskInteractionLocation, TaskInteractionSurfaceId } from '../interactions/task/types';
import {
    createDefaultTaskDisplaySettings,
    readBoardTaskDisplaySettings,
    writeBoardTaskDisplaySettings,
} from '../features/taskFilters';

// ===== Helper: 取得當前登入使用者的 uid =====
const getUserId = (): string => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('使用者未登入');
    return user.uid;
};

// ===== 本機視圖與狀態持久化輔助函式 =====
const VIEW_STORAGE_KEY = 'projed-last-view';
const WS_STORAGE_KEY = 'projed-last-ws';
const BOARD_STORAGE_KEY = 'projed-last-board';
const MODAL_STORAGE_KEY = 'projed-last-modal';

const getDefaultDisplaySettings = () => ({
    showDependencies: createDefaultTaskDisplaySettings().showDependencies,
    showStartDate: createDefaultTaskDisplaySettings().showStartDate,
    showTags: createDefaultTaskDisplaySettings().showTags,
    showTagNames: createDefaultTaskDisplaySettings().showTagNames,
});

const getStoredDisplaySettings = () => {
    try {
        return readBoardTaskDisplaySettings(useAuthStore.getState().user?.uid ?? null);
    } catch { /* ignore */ }
    return getDefaultDisplaySettings();
};

const safeSetItem = (key: string, value: string | null) => {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch { /* ignore */ }
};

const getStoredView = () => {
    try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY);
        if (stored && ['list', 'mindmap', 'board', 'gantt', 'calendar', 'records', 'calendar_subscriptions', 'settings', 'recycle_bin'].includes(stored)) {
            return stored as ViewMode;
        }
    } catch { /* ignore */ }
    return 'home' as ViewMode;
};

const viewToTaskHostMode = (view: ViewMode): TaskHostMode => {
    if (view === 'mindmap' || view === 'board' || view === 'gantt' || view === 'calendar') return view;
    return 'list';
};

const viewToTaskSurfaceId = (view: ViewMode): TaskInteractionSurfaceId => {
    switch (view) {
        case 'mindmap': return 'mindmap.node';
        case 'board': return 'board.card';
        case 'gantt': return 'gantt.task-bar';
        case 'calendar': return 'calendar.segment';
        default: return 'list.row';
    }
};

const createTaskInteractionId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `task-interaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeTaskContextMenuState = (state: BoardContextMenuState, currentView: ViewMode): BoardContextMenuState => {
    if (state.kind !== 'task') return state;
    const interactionLocation: TaskInteractionLocation = state.interactionLocation || {
        hostMode: viewToTaskHostMode(currentView),
        origin: 'mode-primary',
    };
    return {
        ...state,
        interactionLocation,
        surfaceId: state.surfaceId || viewToTaskSurfaceId(currentView),
        interactionId: state.interactionId || createTaskInteractionId(),
    };
};

const getStoredId = (key: string) => {
    try { return localStorage.getItem(key) || null; } catch { return null; }
};

const getStoredModal = () => {
    try {
        if (typeof window !== 'undefined' && window.location.search.includes('modal=')) {
            return null;
        }
        const stored = localStorage.getItem(MODAL_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return null;
};

const cloneBoardDisplaySnapshot = (state) => ({
    showDependencies: Boolean(state.showDependencies),
    showStartDate: Boolean(state.showStartDate),
    showTags: Boolean(state.showTags),
    showTagNames: Boolean(state.showTagNames),
});

const writeBoardDisplaySnapshot = (snapshot) => writeBoardTaskDisplaySettings(
    snapshot,
    useAuthStore.getState().user?.uid ?? null,
);

const applyBoardDisplaySnapshot = (set, snapshot) => {
    writeBoardDisplaySnapshot(snapshot);
    set({
        showDependencies: snapshot.showDependencies,
        showStartDate: snapshot.showStartDate,
        showTags: snapshot.showTags,
        showTagNames: snapshot.showTagNames,
    });
};

const pushBoardDisplayUndo = (set, label, before, after) => {
    useUndoStore.getState().pushUndo({
        label,
        scope: 'filter',
        undo: () => applyBoardDisplaySnapshot(set, before),
        redo: () => applyBoardDisplaySnapshot(set, after),
    });
};

const useBoardStore = create<BoardStore>()(
    (set, get) => ({
        workspaces: [],
        activeWorkspaceId: getStoredId(WS_STORAGE_KEY),
        activeBoardId: getStoredId(BOARD_STORAGE_KEY),
        currentView: getStoredView(),
        // The global task workbench is the default left-side workspace.
        // Keep the workspace/board navigator available from the top-left menu
        // without competing with the task workbench on initial load.
        isSidebarOpen: false,
        editingItem: getStoredModal(),
        ...getStoredDisplaySettings(),
        dependencySelection: null,
        contextMenuState: null,
        lastTaskInteractionLocation: null,
        lastTaskInteractionSurfaceId: null,
        lastTaskInteractionId: null,
        selectedTaskId: null,
        pendingTitleEditNodeId: null,
        pendingTitleEditInitialValue: null,
        pendingWorkspaceTitleEditId: null,
        pendingWorkspaceCreateRequestId: null,
        pendingBoardTitleEdit: null,

        // ===== 基本 setters =====
        setWorkspaces: (workspaces) => set({ workspaces }),
        setActiveWorkspace: (id) => {
            safeSetItem(WS_STORAGE_KEY, id);
            set({ activeWorkspaceId: id, selectedTaskId: null });
        },
        setActiveBoard: (id) => {
            safeSetItem(BOARD_STORAGE_KEY, id);
            set({ activeBoardId: id, selectedTaskId: null });
        },
        setView: (view) => {
            safeSetItem(VIEW_STORAGE_KEY, view);
            set({ currentView: view, selectedTaskId: null });
        },
        setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
        setDependencySelection: (state) => set({ dependencySelection: state }),
        // Opening a task menu moves the pointer onto the full-screen outside-click
        // layer, so the task's hover preview would otherwise disappear immediately.
        // Keep the menu target selected while the menu is open; closeContextMenu
        // remains responsible for clearing it when the menu is dismissed.
        setContextMenuState: (state) => set((currentState) => {
            const normalizedState = state ? normalizeTaskContextMenuState(state, currentState.currentView) : null;
            const taskState = normalizedState?.kind === 'task' ? normalizedState : null;
            return {
                contextMenuState: normalizedState,
                selectedTaskId: taskState ? taskState.nodeId : currentState.selectedTaskId,
                lastTaskInteractionLocation: taskState?.interactionLocation || currentState.lastTaskInteractionLocation,
                lastTaskInteractionSurfaceId: taskState?.surfaceId || currentState.lastTaskInteractionSurfaceId,
                lastTaskInteractionId: taskState?.interactionId || currentState.lastTaskInteractionId,
            };
        }),
        setSelectedTaskId: (nodeId) => set({ selectedTaskId: nodeId }),
        setPendingTitleEditNodeId: (nodeId, initialValue = null) => set({
            pendingTitleEditNodeId: nodeId,
            pendingTitleEditInitialValue: nodeId ? initialValue : null,
        }),
        setPendingWorkspaceTitleEditId: (workspaceId) => set({ pendingWorkspaceTitleEditId: workspaceId }),
        requestCreateWorkspace: () => set({ pendingWorkspaceCreateRequestId: Date.now() }),
        clearCreateWorkspaceRequest: () => set({ pendingWorkspaceCreateRequestId: null }),
        setPendingBoardTitleEdit: (target) => set({ pendingBoardTitleEdit: target }),

        // ===== Workspace CRUD =====
        addWorkspace: async (title) => {
            const userId = getUserId();
            const workspaceTitle = title?.trim() || '我的工作區';
            const createdWorkspace = await workspaceService.create(userId, workspaceTitle);
            if (!createdWorkspace?.id) {
                throw new Error('建立工作區失敗：後端未回傳工作區識別碼。');
            }

            safeSetItem(WS_STORAGE_KEY, createdWorkspace.id);
            safeSetItem(BOARD_STORAGE_KEY, null);
            safeSetItem(VIEW_STORAGE_KEY, 'home');
            set((state) => {
                const exists = state.workspaces.some(ws => ws.id === createdWorkspace.id);
                return {
                    workspaces: exists
                        ? state.workspaces.map(ws => ws.id === createdWorkspace.id ? { ...createdWorkspace, boards: ws.boards || [] } : ws)
                        : [...state.workspaces, { ...createdWorkspace, boards: createdWorkspace.boards || [] }],
                    activeWorkspaceId: createdWorkspace.id,
                    activeBoardId: null,
                    currentView: 'home',
                };
            });
            return createdWorkspace;
        },

        removeWorkspace: async (wsId) => {
            await workspaceService.delete(wsId);
            set((state) => {
                const deletedWorkspace = state.workspaces.find(ws => ws.id === wsId);
                const deletedBoardIds = new Set((deletedWorkspace?.boards || []).map(board => board.id));
                const isActiveWorkspaceDeleted = state.activeWorkspaceId === wsId;
                const isActiveBoardDeleted = Boolean(state.activeBoardId && deletedBoardIds.has(state.activeBoardId));
                const shouldClearContextMenu = state.contextMenuState?.kind === 'workspace'
                    && state.contextMenuState.workspaceId === wsId;
                const shouldClearEditingItem = state.editingItem?.workspaceId === wsId
                    || Boolean(state.editingItem?.boardId && deletedBoardIds.has(state.editingItem.boardId));

                if (isActiveWorkspaceDeleted) safeSetItem(WS_STORAGE_KEY, null);
                if (isActiveWorkspaceDeleted || isActiveBoardDeleted) safeSetItem(BOARD_STORAGE_KEY, null);
                if (isActiveWorkspaceDeleted || isActiveBoardDeleted) safeSetItem(VIEW_STORAGE_KEY, 'home');
                if (shouldClearEditingItem) safeSetItem(MODAL_STORAGE_KEY, null);

                return {
                    workspaces: state.workspaces.filter(ws => ws.id !== wsId),
                    activeWorkspaceId: isActiveWorkspaceDeleted ? null : state.activeWorkspaceId,
                    activeBoardId: isActiveWorkspaceDeleted || isActiveBoardDeleted ? null : state.activeBoardId,
                    currentView: isActiveWorkspaceDeleted || isActiveBoardDeleted ? 'home' : state.currentView,
                    editingItem: shouldClearEditingItem ? null : state.editingItem,
                    selectedTaskId: isActiveWorkspaceDeleted || isActiveBoardDeleted ? null : state.selectedTaskId,
                    pendingTitleEditNodeId: isActiveWorkspaceDeleted || isActiveBoardDeleted ? null : state.pendingTitleEditNodeId,
                    pendingTitleEditInitialValue: isActiveWorkspaceDeleted || isActiveBoardDeleted ? null : state.pendingTitleEditInitialValue,
                    pendingWorkspaceTitleEditId: state.pendingWorkspaceTitleEditId === wsId ? null : state.pendingWorkspaceTitleEditId,
                    pendingBoardTitleEdit: state.pendingBoardTitleEdit?.workspaceId === wsId ? null : state.pendingBoardTitleEdit,
                    contextMenuState: shouldClearContextMenu ? null : state.contextMenuState,
                };
            });
        },

        updateWorkspaceTitle: (workspaceId, newTitle) => {
            const title = newTitle.trim();
            if (!title) return;
            const oldWorkspace = get().workspaces.find(ws => ws.id === workspaceId);
            const oldTitle = oldWorkspace?.title;
            if (!oldTitle || oldTitle === title) return;

            set((state) => ({
                workspaces: state.workspaces.map(ws =>
                    ws.id === workspaceId ? { ...ws, title } : ws
                )
            }));
            workspaceService.update(workspaceId, { title }).catch(console.error);

            useUndoStore.getState().pushUndo({
                label: '修改工作區名稱',
                scope: 'workspace',
                entityIds: [workspaceId],
                undo: () => get().updateWorkspaceTitle(workspaceId, oldTitle),
                redo: () => get().updateWorkspaceTitle(workspaceId, title),
            });
        },

        // 切換 UI 顯示
        toggleDependencies: () => {
            const before = cloneBoardDisplaySnapshot(get());
            const after = { ...before, showDependencies: !before.showDependencies };
            applyBoardDisplaySnapshot(set, after);
            pushBoardDisplayUndo(set, '切換依賴顯示', before, after);
        },
        toggleStartDate: () => {
            const before = cloneBoardDisplaySnapshot(get());
            const after = { ...before, showStartDate: !before.showStartDate };
            applyBoardDisplaySnapshot(set, after);
            pushBoardDisplayUndo(set, '切換開始時間顯示', before, after);
        },
        toggleTags: () => {
            const before = cloneBoardDisplaySnapshot(get());
            const after = { ...before, showTags: !before.showTags };
            applyBoardDisplaySnapshot(set, after);
            pushBoardDisplayUndo(set, '切換標籤顯示', before, after);
        },
        toggleTagNames: () => {
            const before = cloneBoardDisplaySnapshot(get());
            const after = { ...before, showTagNames: !before.showTagNames };
            applyBoardDisplaySnapshot(set, after);
            pushBoardDisplayUndo(set, '切換標籤名稱顯示', before, after);
        },
        hydrateTaskDisplayPrefs: () => set(getStoredDisplaySettings()),

        // ===== Navigation =====
        showHome: () => {
            safeSetItem(BOARD_STORAGE_KEY, null);
            safeSetItem(VIEW_STORAGE_KEY, 'home');
            safeSetItem(MODAL_STORAGE_KEY, null);
            set({
                activeBoardId: null,
                currentView: 'home',
                editingItem: null
            });
        },

        openModal: (type, itemId, listId, extra = {}) => {
            const { activeWorkspaceId, activeBoardId } = get();
            const newItem = {
                type,
                itemId,
                listId,
                boardId: activeBoardId || '',
                workspaceId: activeWorkspaceId || '',
                ...extra
            };
            safeSetItem(MODAL_STORAGE_KEY, JSON.stringify(newItem));
            set({ editingItem: newItem });
        },

        closeModal: () => {
            safeSetItem(MODAL_STORAGE_KEY, null);
            set({ editingItem: null });
        },

        switchBoard: (workspaceId, boardId) => {
            const { workspaces } = get();
            const ws = workspaces.find(w => w.id === workspaceId);
            const board = ws?.boards.find(b => b.id === boardId);
            // Optimistic rows use a local-only id until Supabase returns the
            // canonical project id. Never route the app into a board that the
            // backend cannot resolve yet, even if the pending row is clicked.
            if (board && !board.id.startsWith('b_')) {
                safeSetItem(WS_STORAGE_KEY, workspaceId);
                safeSetItem(BOARD_STORAGE_KEY, boardId);
                safeSetItem(VIEW_STORAGE_KEY, 'board');
                set({
                    activeWorkspaceId: workspaceId,
                    activeBoardId: boardId,
                    currentView: 'board'
                });
            }
        },

        updateBoardTitle: (workspaceId, boardId, newTitle) => {
            const title = newTitle.trim();
            if (!title) return;
            const oldBoard = get().workspaces
                .find(ws => ws.id === workspaceId)
                ?.boards.find(board => board.id === boardId);
            const oldTitle = oldBoard?.title;
            if (!oldTitle || oldTitle === title) return;

            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== workspaceId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b =>
                            b.id === boardId ? { ...b, title } : b
                        )
                    };
                })
            }));
            boardService.update(workspaceId, boardId, { title }).catch(console.error);

            useUndoStore.getState().pushUndo({
                label: '修改看板名稱',
                scope: 'board',
                entityIds: [boardId],
                undo: () => get().updateBoardTitle(workspaceId, boardId, oldTitle),
                redo: () => get().updateBoardTitle(workspaceId, boardId, title),
            });
        },

        moveBoardToWorkspace: async (workspaceId, boardId, targetWorkspaceId, expectedBoardTitle) => {
            const { workspaces } = get();
            const sourceWorkspace = workspaces.find(ws => ws.id === workspaceId);
            const board = sourceWorkspace?.boards.find(item => item.id === boardId);
            if (!board) throw new Error('Board not found in source workspace.');

            await boardService.moveToWorkspace(workspaceId, boardId, targetWorkspaceId, expectedBoardTitle);

            safeSetItem(WS_STORAGE_KEY, targetWorkspaceId);
            safeSetItem(BOARD_STORAGE_KEY, boardId);
            safeSetItem(VIEW_STORAGE_KEY, 'board');
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id === workspaceId) {
                        return { ...ws, boards: ws.boards.filter(item => item.id !== boardId) };
                    }
                    if (ws.id === targetWorkspaceId) {
                        const alreadyExists = ws.boards.some(item => item.id === boardId);
                        return {
                            ...ws,
                            boards: alreadyExists
                                ? ws.boards.map(item => item.id === boardId ? { ...item, ...board, order: Date.now() } : item)
                                : [...ws.boards, { ...board, order: Date.now() }],
                        };
                    }
                    return ws;
                }),
                activeWorkspaceId: targetWorkspaceId,
                activeBoardId: boardId,
                currentView: 'board',
            }));
        },

        // ===== Derived Getters =====
        getActiveBoard: () => {
            const { workspaces, activeWorkspaceId, activeBoardId } = get();
            const ws = workspaces.find(w => w.id === activeWorkspaceId);
            return ws?.boards.find(b => b.id === activeBoardId);
        },

        getActiveWorkspace: () => {
            const { workspaces, activeWorkspaceId } = get();
            return workspaces.find(w => w.id === activeWorkspaceId);
        },

        // ===== Board CRUD =====
        addBoard: (workspaceId, boardName) => {
            const targetWorkspaceId = workspaceId || get().activeWorkspaceId || get().workspaces[0]?.id;
            if (!targetWorkspaceId) {
                console.error('[useBoardStore] Cannot add board: no active workspace.');
                return;
            }

            const tempId = 'b_' + Date.now();
            // Keep the optimistic row visible while the request is pending, but
            // do not make the temporary id active. Supabase resolves legacy
            // board ids through `projects`, so loading/synchronising this id
            // before the create request succeeds produces a blank board and a
            // noisy "project not found" error.
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== targetWorkspaceId) return ws;
                    return {
                        ...ws,
                        boards: [...ws.boards, {
                            id: tempId,
                            title: boardName,
                            dependencies: [],
                            order: Date.now(),
                            createdAt: Date.now()
                        }]
                    };
                }),
            }));
            boardService.create(targetWorkspaceId, boardName)
                .then((createdBoard) => {
                    const activateCreatedBoard = (board) => {
                        safeSetItem(WS_STORAGE_KEY, targetWorkspaceId);
                        safeSetItem(BOARD_STORAGE_KEY, board.id);
                        safeSetItem(VIEW_STORAGE_KEY, 'board');
                        set((state) => ({
                            workspaces: state.workspaces.map(ws => {
                                if (ws.id !== targetWorkspaceId) return ws;
                                const exists = ws.boards.some(item => item.id === board.id);
                                return {
                                    ...ws,
                                    boards: exists
                                        ? ws.boards.map(item => item.id === board.id ? board : item)
                                        : [...ws.boards, board],
                                };
                            }),
                            activeWorkspaceId: targetWorkspaceId,
                            activeBoardId: board.id,
                            currentView: 'board',
                        }));
                    };

                    const removeCreatedBoard = async (command) => {
                        const boardId = command.entityIds?.[0];
                        if (!boardId) return;
                        await boardService.delete(targetWorkspaceId, boardId);
                        set((state) => {
                            const isActiveBoardDeleted = state.activeBoardId === boardId;
                            const shouldClearEditingItem = state.editingItem?.boardId === boardId;
                            if (isActiveBoardDeleted) {
                                safeSetItem(BOARD_STORAGE_KEY, null);
                                safeSetItem(VIEW_STORAGE_KEY, 'home');
                            }
                            if (shouldClearEditingItem) safeSetItem(MODAL_STORAGE_KEY, null);

                            return {
                                workspaces: state.workspaces.map(ws => {
                                    if (ws.id !== targetWorkspaceId) return ws;
                                    return { ...ws, boards: ws.boards.filter(board => board.id !== boardId) };
                                }),
                                activeBoardId: isActiveBoardDeleted ? null : state.activeBoardId,
                                currentView: isActiveBoardDeleted ? 'home' : state.currentView,
                                editingItem: shouldClearEditingItem ? null : state.editingItem,
                                pendingBoardTitleEdit: state.pendingBoardTitleEdit?.boardId === boardId
                                    ? null
                                    : state.pendingBoardTitleEdit,
                            };
                        });
                    };

                    const recreateCreatedBoard = async (command) => {
                        const recreatedBoard = await boardService.create(targetWorkspaceId, boardName);
                        command.entityIds = [recreatedBoard.id];
                        activateCreatedBoard(recreatedBoard);
                    };

                    safeSetItem(WS_STORAGE_KEY, targetWorkspaceId);
                    safeSetItem(BOARD_STORAGE_KEY, createdBoard.id);
                    safeSetItem(VIEW_STORAGE_KEY, 'board');
                    set((state) => ({
                        workspaces: state.workspaces.map(ws => {
                            if (ws.id !== targetWorkspaceId) return ws;
                            const resolvedBoard = {
                                ...createdBoard,
                                title: ws.boards.find(board => board.id === tempId)?.title || createdBoard.title,
                            };
                            const hasCreatedBoard = ws.boards.some(board => board.id === createdBoard.id);
                            return {
                                ...ws,
                                boards: hasCreatedBoard
                                    ? ws.boards.map(board => board.id === createdBoard.id ? resolvedBoard : board)
                                    : ws.boards.map(board => board.id === tempId ? resolvedBoard : board),
                            };
                        }),
                        activeWorkspaceId: targetWorkspaceId,
                        activeBoardId: createdBoard.id,
                        currentView: 'board',
                        pendingBoardTitleEdit: state.pendingBoardTitleEdit?.boardId === tempId
                            ? { workspaceId: targetWorkspaceId, boardId: createdBoard.id }
                            : state.pendingBoardTitleEdit,
                    }));
                    const command = {
                        label: '新增看板',
                        scope: 'board',
                        entityIds: [createdBoard.id],
                        undo: () => removeCreatedBoard(command),
                        redo: () => recreateCreatedBoard(command),
                    };
                    useUndoStore.getState().pushUndo(command);
                })
                .catch((error) => {
                    console.error('[useBoardStore] Board create failed:', error);
                    set((state) => {
                        const isActivePendingBoard = state.activeBoardId === tempId;
                        const shouldClearPendingTitle = state.pendingBoardTitleEdit?.boardId === tempId;
                        if (isActivePendingBoard) {
                            safeSetItem(BOARD_STORAGE_KEY, null);
                            safeSetItem(VIEW_STORAGE_KEY, 'home');
                        }
                        return {
                            workspaces: state.workspaces.map(ws => ws.id === targetWorkspaceId
                                ? { ...ws, boards: ws.boards.filter(board => board.id !== tempId) }
                                : ws),
                            activeBoardId: isActivePendingBoard ? null : state.activeBoardId,
                            currentView: isActivePendingBoard ? 'home' : state.currentView,
                            pendingBoardTitleEdit: shouldClearPendingTitle ? null : state.pendingBoardTitleEdit,
                        };
                    });
                });
            return tempId;
        },

        removeBoard: (wsId, bId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return { ...ws, boards: ws.boards.filter(b => b.id !== bId) };
                })
            }));
            boardService.delete(wsId, bId).catch(console.error);
        },

        // ===== Export / Import =====
        exportData: () => {
            console.log("現由 useWbsStore 處理.");
        },

        importData: async (jsonData: string | object) => {
             console.log("現由 useWbsStore 處理.");
        },
    })
);

export default useBoardStore;
