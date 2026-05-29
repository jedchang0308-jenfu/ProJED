// @ts-nocheck
import { create } from 'zustand';
import useAuthStore from './useAuthStore';
import { workspaceService, boardService } from '../services/dataBackend';
import type { BoardStore, ViewMode } from '../types';

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
const FILTER_STORAGE_KEY = 'projed-filters';

const getDefaultFilters = () => ({
    statusFilters: {
        todo: true,
        in_progress: true,
        delayed: true,
        completed: true,
        unsure: true,
        onhold: true,
    },
    showDependencies: true,
    showStartDate: true,
    showTags: true,
    dueWithinDays: null,
    selectedAssigneeIds: [],
});

const getStoredFilters = () => {
    try {
        const stored = localStorage.getItem(FILTER_STORAGE_KEY);
        if (stored) {
            return { ...getDefaultFilters(), ...JSON.parse(stored) };
        }
    } catch { /* ignore */ }
    return getDefaultFilters();
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
        if (stored && ['list', 'board', 'gantt', 'calendar', 'calendar_subscriptions'].includes(stored)) {
            return stored as ViewMode;
        }
    } catch { /* ignore */ }
    return 'home' as ViewMode;
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

const useBoardStore = create<BoardStore>()(
    (set, get) => ({
        workspaces: [],
        activeWorkspaceId: getStoredId(WS_STORAGE_KEY),
        activeBoardId: getStoredId(BOARD_STORAGE_KEY),
        currentView: getStoredView(),
        isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
        editingItem: getStoredModal(),
        ...getStoredFilters(),
        dependencySelection: null,
        contextMenuState: null,

        // ===== 基本 setters =====
        setWorkspaces: (workspaces) => set({ workspaces }),
        setActiveWorkspace: (id) => {
            safeSetItem(WS_STORAGE_KEY, id);
            set({ activeWorkspaceId: id });
        },
        setActiveBoard: (id) => {
            safeSetItem(BOARD_STORAGE_KEY, id);
            set({ activeBoardId: id });
        },
        setView: (view) => {
            safeSetItem(VIEW_STORAGE_KEY, view);
            set({ currentView: view });
        },
        setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
        setDependencySelection: (state) => set({ dependencySelection: state }),
        setContextMenuState: (state) => set({ contextMenuState: state }),

        // ===== Workspace CRUD =====
        addWorkspace: (title) => {
            const userId = getUserId();
            const tempId = 'ws_' + Date.now();
            safeSetItem(WS_STORAGE_KEY, tempId);
            set((state) => ({
                workspaces: [...state.workspaces, {
                    id: tempId,
                    title: title || '我的工作區',
                    boards: [],
                    ownerId: userId,
                    members: [userId],
                    order: Date.now(),
                    createdAt: Date.now()
                }],
                activeWorkspaceId: tempId,
            }));
            workspaceService.create(userId, title)
                .then((createdWorkspace) => {
                    set((state) => ({
                        workspaces: state.workspaces.map(ws =>
                            ws.id === tempId ? { ...createdWorkspace, boards: ws.boards } : ws
                        ),
                        activeWorkspaceId: state.activeWorkspaceId === tempId ? createdWorkspace.id : state.activeWorkspaceId,
                    }));
                    if (get().activeWorkspaceId === createdWorkspace.id) {
                        safeSetItem(WS_STORAGE_KEY, createdWorkspace.id);
                    }
                })
                .catch(console.error);
        },

        removeWorkspace: (wsId) => {
            set((state) => ({
                workspaces: state.workspaces.filter(ws => ws.id !== wsId)
            }));
            workspaceService.delete(wsId).catch(console.error);
        },

        toggleStatusFilter: (status) => set((state) => {
            const newFilters = {
                ...state.statusFilters,
                [status]: !state.statusFilters[status]
            };
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: newFilters,
                showDependencies: state.showDependencies,
                showStartDate: state.showStartDate,
                showTags: state.showTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: state.selectedAssigneeIds
            }));
            return { statusFilters: newFilters };
        }),

        // 切換 UI 顯示
        toggleDependencies: () => set((state) => {
            const newDeps = !state.showDependencies;
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: newDeps,
                showStartDate: state.showStartDate,
                showTags: state.showTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: state.selectedAssigneeIds
            }));
            return { showDependencies: newDeps };
        }),
        toggleStartDate: () => set((state) => {
            const newStart = !state.showStartDate;
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: state.showDependencies,
                showStartDate: newStart,
                showTags: state.showTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: state.selectedAssigneeIds
            }));
            return { showStartDate: newStart };
        }),
        toggleTags: () => set((state) => {
            const newTags = !state.showTags;
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: state.showDependencies,
                showStartDate: state.showStartDate,
                showTags: newTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: state.selectedAssigneeIds
            }));
            return { showTags: newTags };
        }),
        setDueWithinDays: (days) => set((state) => {
            const nextDays = days === null || days === undefined ? null : Math.max(0, Math.min(365, Math.floor(days)));
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: state.showDependencies,
                showStartDate: state.showStartDate,
                showTags: state.showTags,
                dueWithinDays: nextDays,
                selectedAssigneeIds: state.selectedAssigneeIds
            }));
            return { dueWithinDays: nextDays };
        }),
        toggleAssigneeFilter: (assigneeId) => set((state) => {
            const currentIds = Array.isArray(state.selectedAssigneeIds) ? state.selectedAssigneeIds : [];
            const nextAssigneeIds = currentIds.includes(assigneeId)
                ? currentIds.filter(id => id !== assigneeId)
                : [...currentIds, assigneeId];
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: state.showDependencies,
                showStartDate: state.showStartDate,
                showTags: state.showTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: nextAssigneeIds
            }));
            return { selectedAssigneeIds: nextAssigneeIds };
        }),
        clearAssigneeFilters: () => set((state) => {
            safeSetItem(FILTER_STORAGE_KEY, JSON.stringify({
                statusFilters: state.statusFilters,
                showDependencies: state.showDependencies,
                showStartDate: state.showStartDate,
                showTags: state.showTags,
                dueWithinDays: state.dueWithinDays,
                selectedAssigneeIds: []
            }));
            return { selectedAssigneeIds: [] };
        }),

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
            if (board) {
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
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== workspaceId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b =>
                            b.id === boardId ? { ...b, title: newTitle } : b
                        )
                    };
                })
            }));
            boardService.update(workspaceId, boardId, { title: newTitle }).catch(console.error);
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
            safeSetItem(WS_STORAGE_KEY, targetWorkspaceId);
            safeSetItem(BOARD_STORAGE_KEY, tempId);
            safeSetItem(VIEW_STORAGE_KEY, 'board');
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
                activeWorkspaceId: targetWorkspaceId,
                activeBoardId: tempId,
                currentView: 'board',
            }));
            boardService.create(targetWorkspaceId, boardName)
                .then((createdBoard) => {
                    set((state) => ({
                        workspaces: state.workspaces.map(ws => {
                            if (ws.id !== targetWorkspaceId) return ws;
                            return {
                                ...ws,
                                boards: ws.boards.map(board =>
                                    board.id === tempId ? createdBoard : board
                                ),
                            };
                        }),
                        activeBoardId: state.activeBoardId === tempId ? createdBoard.id : state.activeBoardId,
                    }));
                    if (get().activeBoardId === createdBoard.id) {
                        safeSetItem(BOARD_STORAGE_KEY, createdBoard.id);
                    }
                })
                .catch(console.error);
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
