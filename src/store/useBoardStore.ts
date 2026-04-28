// @ts-nocheck
import { create } from 'zustand';
import useAuthStore from './useAuthStore';
import { workspaceService, boardService } from '../services/firestoreService';
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

const safeSetItem = (key: string, value: string | null) => {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch { /* ignore */ }
};

const getStoredView = () => {
    try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY);
        if (stored && ['list', 'board', 'gantt', 'calendar'].includes(stored)) {
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
        statusFilters: {
            todo: true,
            in_progress: true,
            delayed: true,
            completed: true,
            unsure: true,
            onhold: true,
        },
        dependencySelection: null,
        dependencyMenuState: null,
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
        setDependencyMenuState: (state) => set({ dependencyMenuState: state }),
        setContextMenuState: (state) => set({ contextMenuState: state }),

        // ===== Workspace CRUD =====
        addWorkspace: (title) => {
            const userId = getUserId();
            const tempId = 'ws_' + Date.now();
            set((state) => ({
                workspaces: [...state.workspaces, {
                    id: tempId,
                    title: title || '我的工作區',
                    boards: [],
                    ownerId: userId,
                    members: [userId],
                    order: Date.now(),
                    createdAt: Date.now()
                }]
            }));
            workspaceService.create(userId, title).catch(console.error);
        },

        removeWorkspace: (wsId) => {
            set((state) => ({
                workspaces: state.workspaces.filter(ws => ws.id !== wsId)
            }));
            workspaceService.delete(wsId).catch(console.error);
        },

        toggleStatusFilter: (status) => set((state) => ({
            statusFilters: {
                ...state.statusFilters,
                [status]: !state.statusFilters[status]
            }
        })),

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
            const tempId = 'b_' + Date.now();
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== workspaceId) return ws;
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
                })
            }));
            boardService.create(workspaceId, boardName).catch(console.error);
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
