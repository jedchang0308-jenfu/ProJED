/**
 * useBoardStore — 全域看板狀態管理 (Firestore 版)
 * 設計意圖：作為前端快取層，所有 CRUD 操作即時更新本地狀態，
 * 同時非同步寫入 Firestore。遠端資料變動透過 useFirestoreSync Hook
 * 的 onSnapshot 監聽器自動回寫至此 Store。
 *
 * 與舊版差異：
 * 1. 移除 Zustand persist — 資料由 Firestore 持久化
 * 2. 移除 Undo/Redo (past/future) — 不適用於文件級同步場景
 * 3. 所有 CRUD actions 改為呼叫 firestoreService
 * 4. Cards 使用扁平集合 (按 listId 歸屬)，拖曳跨列表時只需更新 listId
 */
import { create } from 'zustand';
import dayjs from 'dayjs';
import { arrayMove } from '@dnd-kit/sortable';
import useDialogStore from './useDialogStore';
import useAuthStore from './useAuthStore';
import useUndoStore from './useUndoStore';
import {
    workspaceService, boardService, listService, cardService, dependencyService
} from '../services/firestoreService';
import type {
    Board, BoardStore, TaskStatus,
    OverriddenDates, Card, List
} from '../types';
import { useCalendarStore } from './useCalendarStore';

// === 工作天推算工具函式 ===
const addWorkingDays = (startDateStr: string, offsetDays: number): string => {
    let current = dayjs(startDateStr);
    let remaining = offsetDays;
    const isHolidayFn = useCalendarStore.getState().isHoliday;

    if (remaining > 0) {
        while (remaining > 0) {
            current = current.add(1, 'day');
            if (!isHolidayFn(current.format('YYYYMMDD'))) {
                remaining -= 1;
            }
        }
    } else if (remaining < 0) {
        while (remaining < 0) {
            current = current.subtract(1, 'day');
            if (!isHolidayFn(current.format('YYYYMMDD'))) {
                remaining += 1;
            }
        }
    }
    return current.format('YYYY-MM-DD');
};

const getWorkingDaysDiff = (startStr: string, endStr: string): number => {
    let current = dayjs(startStr);
    const end = dayjs(endStr);
    let diff = 0;
    const isHolidayFn = useCalendarStore.getState().isHoliday;
    
    if (end.isBefore(current)) {
        while (current.isAfter(endStr, 'day')) {
            current = current.subtract(1, 'day');
            if (!isHolidayFn(current.format('YYYYMMDD'))) diff -= 1;
        }
    } else {
        while (current.isBefore(endStr, 'day')) {
            current = current.add(1, 'day');
            if (!isHolidayFn(current.format('YYYYMMDD'))) diff += 1;
        }
    }
    return diff;
};

// ===== 依賴排程計算（保持不變）=====
export const calculateCascadedDates = (board: Board, overriddenDates: OverriddenDates = {}): Map<string, { startDate: string; endDate: string }> => {
    const intermediateDates = new Map();
    if (!board.dependencies || board.dependencies.length === 0) return intermediateDates;

    const getCurrentTask = (id: string) => {
        for (const l of board.lists) {
            if (l.id === id) return { ...l, type: 'list' };
            for (const c of l.cards) {
                if (c.id === id) return { ...c, type: 'card', listId: l.id };
                for (const cl of c.checklists || []) {
                    for (const cli of cl.items || []) {
                        if (cli.id === id) return {
                            ...cli, type: 'checklist', listId: l.id, cardId: c.id, checklistId: cl.id
                        };
                    }
                }
            }
        }
        return null;
    };

    const inDegree = new Map<string, number>();
    const adjList = new Map<string, typeof board.dependencies>();

    board.dependencies.forEach(dep => {
        if (dep.fromId === dep.toId) {
            if (!inDegree.has(dep.fromId)) inDegree.set(dep.fromId, 0);
            return;
        }
        if (!inDegree.has(dep.fromId)) inDegree.set(dep.fromId, 0);
        if (!inDegree.has(dep.toId)) inDegree.set(dep.toId, 0);
        if (!adjList.has(dep.fromId)) adjList.set(dep.fromId, []);
        const edges = adjList.get(dep.fromId);
        if (edges) edges.push(dep);
        inDegree.set(dep.toId, (inDegree.get(dep.toId) ?? 0) + 1);
    });

    let queue = Array.from(inDegree.entries())
        .filter(([_, degree]) => degree === 0)
        .map(([id]) => id);

    if (queue.length === 0 && inDegree.size > 0) {
        queue.push(Array.from(inDegree.keys())[0]);
    }

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const edges = adjList.get(currentId) || [];
        const currentTask = getCurrentTask(currentId);
        if (!currentTask) continue;

        const hasAnyDate = currentTask.startDate || currentTask.endDate
            || overriddenDates[currentId]?.startDate || overriddenDates[currentId]?.endDate
            || intermediateDates.has(currentId);

        let currentStartStr = intermediateDates.get(currentId)?.startDate
            || overriddenDates[currentId]?.startDate
            || currentTask.startDate
            || dayjs().format('YYYY-MM-DD');

        let currentEndStr = intermediateDates.get(currentId)?.endDate
            || overriddenDates[currentId]?.endDate
            || currentTask.endDate
            || dayjs(currentStartStr).add(1, 'day').format('YYYY-MM-DD');

        if (!hasAnyDate) {
            (edges as typeof board.dependencies).forEach(dep => {
                const newDegree = inDegree.get(dep.toId)! - 1;
                inDegree.set(dep.toId, newDegree);
                if (newDegree === 0) queue.push(dep.toId);
            });
            continue;
        }

        // Self-Dependencies (設定執行工作天)
        const selfDeps = board.dependencies.filter(d => d.fromId === currentId && d.toId === currentId);
        selfDeps.forEach(dep => {
            const offsetDays = dep.offset || 0;
            if (dep.fromSide === 'start' && dep.toSide === 'end') {
                currentEndStr = addWorkingDays(currentStartStr, offsetDays);
            } else if (dep.fromSide === 'end' && dep.toSide === 'start') {
                currentStartStr = addWorkingDays(currentEndStr, 1 + offsetDays);
            }
        });

        intermediateDates.set(currentId, { startDate: currentStartStr, endDate: currentEndStr });

        // Propagate to successors
        edges.forEach(dep => {
            const successor = getCurrentTask(dep.toId);
            if (!successor) return;
            const sStartStr = intermediateDates.get(successor.id)?.startDate
                || overriddenDates[successor.id]?.startDate
                || successor.startDate
                || dayjs().format('YYYY-MM-DD');
            const sEndStr = intermediateDates.get(successor.id)?.endDate
                || overriddenDates[successor.id]?.endDate
                || successor.endDate
                || addWorkingDays(sStartStr, 1);
            
            // 計算原先排定的「工作天天數」，以便後續推擠時能維持相同的執行工作天
            const durationWd = getWorkingDaysDiff(sStartStr, sEndStr);

            let idealStart = sStartStr;
            const offsetDays = dep.offset || 0;
            if (dep.fromSide === 'end' && dep.toSide === 'start') {
                idealStart = addWorkingDays(currentEndStr, 1 + offsetDays);
            } else if (dep.fromSide === 'start' && dep.toSide === 'start') {
                idealStart = addWorkingDays(currentStartStr, offsetDays);
            } else if (dep.fromSide === 'end' && dep.toSide === 'end') {
                const idealEnd = addWorkingDays(currentEndStr, offsetDays);
                idealStart = addWorkingDays(idealEnd, -durationWd);
            } else if (dep.fromSide === 'start' && dep.toSide === 'end') {
                const idealEnd = addWorkingDays(currentStartStr, offsetDays);
                idealStart = addWorkingDays(idealEnd, -durationWd);
            }
            
            overriddenDates[successor.id] = { startDate: idealStart, endDate: addWorkingDays(idealStart, durationWd) };

            const prevIdeal = intermediateDates.get(successor.id);
            if (!prevIdeal || dayjs(idealStart).isAfter(dayjs(prevIdeal.startDate))) {
                intermediateDates.set(successor.id, { startDate: idealStart, endDate: addWorkingDays(idealStart, durationWd) });
            }

            const newDegree = (inDegree.get(dep.toId) ?? 0) - 1;
            inDegree.set(dep.toId, newDegree);
            if (newDegree === 0) queue.push(dep.toId);
        });
    }

    return intermediateDates;
};

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

const safeSetItem = (key, value) => {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch { /* ignore */ }
};

const getStoredView = () => {
    try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY);
        if (stored && ['list', 'board', 'gantt', 'calendar'].includes(stored)) {
            return stored as import('../types').ViewMode;
        }
    } catch { /* ignore */ }
    return 'home' as import('../types').ViewMode;
};

const getStoredId = (key) => {
    try { return localStorage.getItem(key) || null; } catch { return null; }
};

const getStoredModal = () => {
    try {
        if (typeof window !== 'undefined' && window.location.search.includes('modal=')) {
            // 如果網址有 Deep link，優先從網址讀取（放行給 App.tsx 處理），不要讀取快取的 modal
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
        // 初始化時從 localStorage 讀取上次的視圖（僅工作視圖，首次或非工作視圖則為 home）
        currentView: getStoredView(),
        isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
        editingItem: getStoredModal(),
        statusFilters: {
            todo: true,
            delayed: true,
            completed: true,
            unsure: true,
            onhold: true,
        },


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
            // 設計意圖：切換視圖時同步寫入 localStorage，記住工作位置
            try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
            set({ currentView: view });
        },
        setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

        // ===== Workspace CRUD =====
        addWorkspace: (title) => {
            const userId = getUserId();
            // 樂觀更新：先更新本地 UI，再寫入 Firestore
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
            // 非同步寫入 Firestore（onSnapshot 會用真實 ID 覆蓋 tempId）
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

        // ===== Drag & Drop Reordering =====
        reorderLists: (wsId, bId, activeId, overId) => {
            // 記錄排序前的舊順序，供 undo 還原
            const snapState = get();
            const snapWs = snapState.workspaces.find(w => w.id === wsId);
            const snapBoard = snapWs?.boards.find(b => b.id === bId);
            const oldListIds = (snapBoard?.lists || []).map(l => l.id);
            useUndoStore.getState().pushUndo({
                label: '重新排列列表',
                undo: () => {
                    // 直接用舊 ID 順序覆蓋，不從新執行 reorderLists
                    set((st) => ({
                        workspaces: st.workspaces.map(w => {
                            if (w.id !== wsId) return w;
                            return {
                                ...w,
                                boards: w.boards.map(b => {
                                    if (b.id !== bId) return b;
                                    const sorted = [...b.lists].sort(
                                        (a, b2) => oldListIds.indexOf(a.id) - oldListIds.indexOf(b2.id)
                                    );
                                    listService.batchUpdateOrder(wsId, bId,
                                        sorted.map((l, i) => ({ id: l.id, order: i }))
                                    ).catch(console.error);
                                    return { ...b, lists: sorted };
                                })
                            };
                        })
                    }));
                },
                redo: () => get().reorderLists(wsId, bId, activeId, overId),
            });
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            
                            const oldIndex = b.lists.findIndex(l => l.id === activeId);
                            const newIndex = b.lists.findIndex(l => l.id === overId);
                            const newLists = arrayMove(b.lists, oldIndex, newIndex);

                            // 非同步更新 Firestore order
                            listService.batchUpdateOrder(wsId, bId,
                                newLists.map((l, i) => ({ id: l.id, order: i }))
                            ).catch(console.error);
                            return { ...b, lists: newLists };
                        })
                    };
                })
            }));
        },

        moveCardToList: (wsId, bId, cardId, sourceListId, targetListId, targetIndex = null) => {
            // 記錄移動前的來源列表與位置，供 undo 還原
            const snapWs2 = get().workspaces.find(w => w.id === wsId);
            const snapBoard2 = snapWs2?.boards.find(b => b.id === bId);
            const sourceListSnap = snapBoard2?.lists.find(l => l.id === sourceListId);
            const originalIndex = (sourceListSnap?.cards || []).findIndex(c => c.id === cardId);
            useUndoStore.getState().pushUndo({
                label: '移動卡片',
                undo: () => get().moveCardToList(wsId, bId, cardId, targetListId, sourceListId, originalIndex),
                redo: () => get().moveCardToList(wsId, bId, cardId, sourceListId, targetListId, targetIndex),
            });
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const sourceList = b.lists.find(l => l.id === sourceListId);
                            const card = sourceList?.cards.find(c => c.id === cardId);
                            if (!card) return b;

                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (sourceListId === targetListId) {
                                        if (l.id === sourceListId) {
                                            const newCards = l.cards.filter(c => c.id !== cardId);
                                            const updatedCard = { ...card, listId: targetListId };
                                            if (targetIndex !== null && targetIndex >= 0 && targetIndex <= newCards.length) {
                                                newCards.splice(targetIndex, 0, updatedCard);
                                            } else {
                                                newCards.push(updatedCard);
                                            }
                                            // 更新 Firestore order
                                            cardService.batchUpdateOrder(wsId, bId,
                                                newCards.map((c, i) => ({ id: c.id, order: i, listId: targetListId }))
                                            ).catch(console.error);
                                            return { ...l, cards: newCards };
                                        }
                                        return l;
                                    } else {
                                        if (l.id === sourceListId) {
                                            return { ...l, cards: l.cards.filter(c => c.id !== cardId) };
                                        }
                                        if (l.id === targetListId) {
                                            const newCards = [...(l.cards || [])];
                                            const updatedCard = { ...card, listId: targetListId };
                                            if (targetIndex !== null && targetIndex >= 0 && targetIndex <= newCards.length) {
                                                newCards.splice(targetIndex, 0, updatedCard);
                                            } else {
                                                newCards.push(updatedCard);
                                            }
                                            // 更新 listId 和 order
                                            cardService.batchUpdateOrder(wsId, bId,
                                                newCards.map((c, i) => ({ id: c.id, order: i, listId: targetListId }))
                                            ).catch(console.error);
                                            return { ...l, cards: newCards };
                                        }
                                        return l;
                                    }
                                })
                            };
                        })
                    };
                })
            }));
        },

        reorderCardsInList: (wsId, bId, listId, activeId, overId) => {
            // 記錄排序前的舊卡片順序，供 undo 還原
            const snapWs3 = get().workspaces.find(w => w.id === wsId);
            const snapBoard3 = snapWs3?.boards.find(b => b.id === bId);
            const listSnap = snapBoard3?.lists.find(l => l.id === listId);
            const oldCardIds = (listSnap?.cards || []).map(c => c.id);
            useUndoStore.getState().pushUndo({
                label: '重新排列卡片',
                undo: () => {
                    // 直接用舊 ID 順序覆蓋，不從新執行 reorderCardsInList
                    set((st) => ({
                        workspaces: st.workspaces.map(w => {
                            if (w.id !== wsId) return w;
                            return {
                                ...w,
                                boards: w.boards.map(b => {
                                    if (b.id !== bId) return b;
                                    return {
                                        ...b,
                                        lists: b.lists.map(l => {
                                            if (l.id !== listId) return l;
                                            const sorted = [...l.cards].sort(
                                                (a, b2) => oldCardIds.indexOf(a.id) - oldCardIds.indexOf(b2.id)
                                            );
                                            cardService.batchUpdateOrder(wsId, bId,
                                                sorted.map((c, i) => ({ id: c.id, order: i }))
                                            ).catch(console.error);
                                            return { ...l, cards: sorted };
                                        })
                                    };
                                })
                            };
                        })
                    }));
                },
                redo: () => get().reorderCardsInList(wsId, bId, listId, activeId, overId),
            });
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== listId) return l;

                                    const oldIndex = l.cards.findIndex(c => c.id === activeId);
                                    const newIndex = l.cards.findIndex(c => c.id === overId);
                                    const newCards = arrayMove(l.cards, oldIndex, newIndex);

                                    cardService.batchUpdateOrder(wsId, bId,
                                        newCards.map((c, i) => ({ id: c.id, order: i }))
                                    ).catch(console.error);
                                    return { ...l, cards: newCards };
                                })
                            };
                        })
                    };
                })
            }));
        },

        moveChecklistItemToCard: (wsId, bId, itemId, sourceListId, sourceCardId, sourceChecklistId, targetListId, targetCardId, targetIndex = null) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const sourceList = b.lists.find(l => l.id === sourceListId);
                            const sourceCard = sourceList?.cards.find(c => c.id === sourceCardId);
                            const sourceChecklist = sourceCard?.checklists?.find(cl => cl.id === sourceChecklistId);
                            const item = sourceChecklist?.items?.find(i => i.id === itemId);
                            if (!item) return b;

                            const newBoard = {
                                ...b,
                                lists: b.lists.map(l => {
                                    let updatedCards = l.cards || [];
                                    if (l.id === sourceListId) {
                                        updatedCards = updatedCards.map(c => {
                                            if (c.id === sourceCardId) {
                                                const newCard = {
                                                    ...c,
                                                    checklists: (c.checklists || []).map(cl => {
                                                        if (cl.id === sourceChecklistId) {
                                                            return { ...cl, items: cl.items.filter(i => i.id !== itemId) };
                                                        }
                                                        return cl;
                                                    })
                                                };
                                                // 更新來源卡片的 checklists
                                                cardService.update(wsId, bId, c.id, { checklists: newCard.checklists }).catch(console.error);
                                                return newCard;
                                            }
                                            return c;
                                        });
                                    }
                                    if (l.id === targetListId) {
                                        updatedCards = updatedCards.map(c => {
                                            if (c.id === targetCardId) {
                                                let targetChecklists = c.checklists || [];
                                                if (targetChecklists.length === 0) {
                                                    targetChecklists = [{
                                                        id: 'cl_' + Date.now(),
                                                        title: '待辦清單',
                                                        showCompleted: true,
                                                        items: []
                                                    }];
                                                }
                                                const newCard = {
                                                    ...c,
                                                    checklists: targetChecklists.map((cl, idx) => {
                                                        if (idx === 0) {
                                                            const newItems = [...(cl.items || [])];
                                                            if (targetIndex !== null && targetIndex >= 0 && targetIndex <= newItems.length) {
                                                                newItems.splice(targetIndex, 0, item);
                                                            } else {
                                                                newItems.push(item);
                                                            }
                                                            return { ...cl, items: newItems };
                                                        }
                                                        return cl;
                                                    })
                                                };
                                                cardService.update(wsId, bId, c.id, { checklists: newCard.checklists }).catch(console.error);
                                                return newCard;
                                            }
                                            return c;
                                        });
                                    }
                                    return { ...l, cards: updatedCards };
                                })
                            };
                            return newBoard;
                        })
                    };
                })
            }));
        },

        reorderChecklistItems: (wsId, bId, listId, cardId, checklistId, activeId, overId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== listId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cardId) return c;
                                            const newCard = {
                                                ...c,
                                                checklists: (c.checklists || []).map(cl => {
                                                    if (cl.id !== checklistId) return cl;
                                                    const oldIndex = (cl.items || []).findIndex(i => i.id === activeId);
                                                    const newIndex = (cl.items || []).findIndex(i => i.id === overId);
                                                    return { ...cl, items: arrayMove(cl.items || [], oldIndex, newIndex) };
                                                })
                                            };
                                            cardService.update(wsId, bId, c.id, { checklists: newCard.checklists }).catch(console.error);
                                            return newCard;
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        // ===== Navigation =====
        showHome: () => set({
            activeBoardId: null,
            currentView: 'home',
            editingItem: null
        }),

        openModal: (type, itemId, listId, extra = {}) => {
            const { activeWorkspaceId, activeBoardId } = get();
            set({
                editingItem: {
                    type,
                    itemId,
                    listId,
                    boardId: activeBoardId || '',
                    workspaceId: activeWorkspaceId || '',
                    ...extra
                }
            });
        },

        closeModal: () => set({ editingItem: null }),

        // ===== Card CRUD =====
        updateCard: (wsId, bId, lId, cId, updates) => {
            // 取得操作前的舊值，供 undo 使用
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const list = board?.lists.find(l => l.id === lId);
            const oldCard = list?.cards.find(c => c.id === cId);
            if (oldCard) {
                // 只擷取被更新欄位的舊值，供 undo 精確還原
                const oldCardAsAny = oldCard as unknown as Record<string, unknown>;
                const oldValues = Object.fromEntries(
                    Object.keys(updates).map(k => [k, oldCardAsAny[k]])
                ) as Partial<Card>;
                useUndoStore.getState().pushUndo({
                    label: '修改卡片',
                    undo: () => get().updateCard(wsId, bId, lId, cId, oldValues),
                    redo: () => get().updateCard(wsId, bId, lId, cId, updates),
                });
            }
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c =>
                                            c.id === cId ? { ...c, ...updates } : c
                                        )
                                    };
                                })
                            };
                        })
                    };
                })
            }));
            // 非同步寫入 Firestore
            cardService.update(wsId, bId, cId, updates).catch(console.error);
        },

        updateList: (wsId, bId, lId, updates) => {
            // 取得操作前的舊值，供 undo 使用
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const oldList = board?.lists.find(l => l.id === lId);
            if (oldList) {
                const oldListAsAny = oldList as unknown as Record<string, unknown>;
                const oldValues = Object.fromEntries(
                    Object.keys(updates).map(k => [k, oldListAsAny[k]])
                ) as Partial<List>;
                useUndoStore.getState().pushUndo({
                    label: '修改列表',
                    undo: () => get().updateList(wsId, bId, lId, oldValues),
                    redo: () => get().updateList(wsId, bId, lId, updates),
                });
            }
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l =>
                                    l.id === lId ? { ...l, ...updates } : l
                                )
                            };
                        })
                    };
                })
            }));
            listService.update(wsId, bId, lId, updates).catch(console.error);
        },

        switchBoard: (workspaceId, boardId) => {
            const { workspaces } = get();
            const ws = workspaces.find(w => w.id === workspaceId);
            const board = ws?.boards.find(b => b.id === boardId);
            if (board) {
                // 切換看板時清空 Undo/Redo 堆疊，避免跨看板的操作紀錄混用
                useUndoStore.getState().clear();
                set({
                    activeWorkspaceId: workspaceId,
                    activeBoardId: boardId,
                    currentView: 'board'
                });
                // 同步清理無效的依賴線
                get().cleanBoardDependencies(workspaceId, boardId);
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

        // ===== Dependency CRUD =====
        addDependency: (wsId, bId, dependency) => {
            const tempId = 'dep_' + Date.now();
            const newDep = { ...dependency, id: tempId };
            let added = false;
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const deps = b.dependencies || [];
                            const exists = deps.some(d =>
                                d.fromId === dependency.fromId &&
                                d.fromSide === dependency.fromSide &&
                                d.toId === dependency.toId &&
                                d.toSide === dependency.toSide
                            );
                            if (exists) return b;
                            added = true;
                            return { ...b, dependencies: [...deps, newDep] };
                        })
                    };
                })
            }));
            if (added) {
                dependencyService.create(wsId, bId, dependency).catch(console.error);
                get().fixBoardDependencies(wsId, bId);
                // 記錄可撤銷指令：undo = 刪除剛新增的依賴
                useUndoStore.getState().pushUndo({
                    label: '新增依賴關係',
                    undo: () => get().removeDependency(wsId, bId, tempId),
                    redo: () => get().addDependency(wsId, bId, dependency),
                });
            }
        },

        removeDependency: (wsId, bId, depId) => {
            // 先取得被刪除的依賴資料，供 undo 重建
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const dep = (board?.dependencies || []).find(d => d.id === depId);
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return { ...b, dependencies: (b.dependencies || []).filter(d => d.id !== depId) };
                        })
                    };
                })
            }));
            dependencyService.delete(wsId, bId, depId).catch(console.error);
            get().fixBoardDependencies(wsId, bId);
            // 記錄可撤銷指令：undo = 重新新增被刪除的依賴
            if (dep) {
                const { id, ...depWithoutId } = dep;
                useUndoStore.getState().pushUndo({
                    label: '刪除依賴關係',
                    undo: () => get().addDependency(wsId, bId, depWithoutId),
                    redo: () => get().removeDependency(wsId, bId, depId),
                });
            }
        },

        updateDependency: (wsId, bId, depId, updates) => {
            // 取得舊的依賴值供 undo 使用
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const oldDep = (board?.dependencies || []).find(d => d.id === depId);
            if (oldDep) {
                const oldDepAsAny = oldDep as unknown as Record<string, unknown>;
                const oldValues = Object.fromEntries(
                    Object.keys(updates).map(k => [k, oldDepAsAny[k]])
                );
                useUndoStore.getState().pushUndo({
                    label: '修改依賴關係',
                    undo: () => get().updateDependency(wsId, bId, depId, oldValues),
                    redo: () => get().updateDependency(wsId, bId, depId, updates),
                });
            }
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                dependencies: (b.dependencies || []).map(d =>
                                    d.id === depId ? { ...d, ...updates } : d
                                )
                            };
                        })
                    };
                })
            }));
            dependencyService.update(wsId, bId, depId, updates).catch(console.error);
            get().fixBoardDependencies(wsId, bId);
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

        // ===== fixBoardDependencies =====
        fixBoardDependencies: (wsId, bId) => {
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            if (!board || !board.dependencies || board.dependencies.length === 0) return;

            const intermediateDates = calculateCascadedDates(board, {});
            const getCurrentTask = (id: string) => {
                for (const l of board.lists) {
                    if (l.id === id) return { ...l, type: 'list' };
                    for (const c of l.cards) {
                        if (c.id === id) return { ...c, type: 'card', listId: l.id };
                        for (const cl of c.checklists || []) {
                            for (const cli of cl.items || []) {
                                if (cli.id === id) return { ...cli, type: 'checklist', listId: l.id, cardId: c.id, checklistId: cl.id };
                            }
                        }
                    }
                }
                return null;
            };

            const updatesQueue: Array<{ type: string; id: string; listId?: string; cardId?: string; checklistId?: string; updates: { startDate: string; endDate: string } }> = [];

            intermediateDates.forEach((dates, id) => {
                const task = getCurrentTask(id);
                if (!task) return;
                const hasStart = !!task.startDate;
                const hasEnd = !!task.endDate;
                if (!hasStart && !hasEnd) return;
                const rawStart = task.startDate || dates.startDate;
                const rawEnd = task.endDate || dates.endDate;
                if (rawStart !== dates.startDate || rawEnd !== dates.endDate) {
                    const taskAny = task as Record<string, unknown>;
                    updatesQueue.push({ type: task.type, id: task.id, listId: taskAny.listId as string | undefined, cardId: taskAny.cardId as string | undefined, checklistId: taskAny.checklistId as string | undefined, updates: dates });
                }
            });

            updatesQueue.forEach(u => {
                if (u.type === 'list') state.updateList(wsId, bId, u.id, u.updates);
                else if (u.type === 'card') state.updateCard(wsId, bId, u.listId || '', u.id, u.updates);
                else if (u.type === 'checklist') state.updateChecklistItem(wsId, bId, u.listId || '', u.cardId || '', u.checklistId || '', u.id, u.updates);
            });
        },

        cleanBoardDependencies: (wsId, bId) => {
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            if (!board) return;

            const validIds = new Set<string>();
            (board.lists || []).forEach(l => {
                validIds.add(l.id);
                (l.cards || []).forEach(c => {
                    validIds.add(c.id);
                    (c.checklists || []).forEach(cl => {
                        (cl.items || []).forEach(cli => {
                            validIds.add(cli.id);
                        });
                    });
                });
            });

            const originalDeps = board.dependencies || [];
            const invalidDeps = originalDeps.filter(d => !validIds.has(d.fromId) || !validIds.has(d.toId));
            if (invalidDeps.length === 0) return;

            const cleanedDeps = originalDeps.filter(d => validIds.has(d.fromId) && validIds.has(d.toId));
            set((state) => ({
                workspaces: state.workspaces.map(w => {
                    if (w.id !== wsId) return w;
                    return {
                        ...w,
                        boards: w.boards.map(b => {
                            if (b.id !== bId) return b;
                            return { ...b, dependencies: cleanedDeps };
                        })
                    };
                })
            }));
            // 刪除無效依賴
            invalidDeps.forEach(d => {
                dependencyService.delete(wsId, bId, d.id).catch(console.error);
            });
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
                            lists: [],
                            dependencies: [],
                            order: Date.now(),
                            createdAt: Date.now()
                        }]
                    };
                })
            }));
            boardService.create(workspaceId, boardName).catch(console.error);
        },

        // ===== List CRUD =====
        addList: (workspaceId, boardId, title) => {
            const tempId = 'l_' + Date.now();
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== workspaceId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== boardId) return b;
                            return {
                                ...b,
                                lists: [...(b.lists || []), {
                                    id: tempId,
                                    title: title || '新列表',
                                    status: 'todo' as TaskStatus,
                                    cards: [],
                                    ganttVisible: true,
                                    order: Date.now(),
                                    createdAt: Date.now()
                                }]
                            };
                        })
                    };
                })
            }));
            listService.create(workspaceId, boardId, title).catch((err) => {
                console.error(err);
            });
            // 記錄可撤銷指令：undo = 軟刪除剛新增的列表、redo = 還原它
            useUndoStore.getState().pushUndo({
                label: '新增列表',
                undo: () => get().removeList(workspaceId, boardId, tempId),
                redo: () => get().restoreList(workspaceId, boardId, tempId),
            });
        },

        addCard: (workspaceId, boardId, listId, title) => {
            const tempId = 'c_' + Date.now();
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== workspaceId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== boardId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== listId) return l;
                                    return {
                                        ...l,
                                        cards: [...(l.cards || []), {
                                            id: tempId,
                                            title: title || '新卡片',
                                            status: 'todo' as TaskStatus,
                                            checklists: [],
                                            ganttVisible: true,
                                            listId: listId,
                                            order: Date.now(),
                                            createdAt: Date.now()
                                        }]
                                    };
                                })
                            };
                        })
                    };
                })
            }));
            cardService.create(workspaceId, boardId, listId, title).catch(console.error);
            // 記錄可撤銷指令：undo = 軟刪除剛新增的卡片、redo = 還原它
            useUndoStore.getState().pushUndo({
                label: '新增卡片',
                undo: () => get().removeCard(workspaceId, boardId, listId, tempId),
                redo: () => get().restoreCard(workspaceId, boardId, listId, tempId),
            });
        },

        // ===== Checklist CRUD（嵌入式，更新整個 Card 文件）=====
        addChecklist: (wsId, bId, lId, cId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklist = {
                                                id: 'cl_' + Date.now(),
                                                title: '待辦清單',
                                                showCompleted: true,
                                                items: []
                                            };
                                            const newCard = { ...c, checklists: [...(c.checklists || []), newChecklist] };
                                            cardService.update(wsId, bId, cId, { checklists: newCard.checklists }).catch(console.error);
                                            return newCard;
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        removeChecklist: (wsId, bId, lId, cId, clId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const now = Date.now();
                                            const newChecklists = (c.checklists || []).map(cl =>
                                                cl.id === clId ? { ...cl, isArchived: true, archivedAt: now } : cl
                                            );
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        updateChecklist: (wsId, bId, lId, cId, clId, updates) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).map(cl =>
                                                cl.id === clId ? { ...cl, ...updates } : cl
                                            );
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        addChecklistItem: (wsId, bId, lId, cId, clId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).map(cl => {
                                                if (cl.id !== clId) return cl;
                                                return {
                                                    ...cl,
                                                    items: [...(cl.items || []), {
                                                        id: 'cli_' + Date.now(),
                                                        title: '',
                                                        status: 'todo' as TaskStatus,
                                                        startDate: '',
                                                        endDate: ''
                                                    }]
                                                };
                                            });
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },
        updateChecklistItem: (wsId, bId, lId, cId, clId, cliId, updates) => {
            // 取得操作前的舊值，供 undo 使用
            const snapState2 = get();
            const snapWs4 = snapState2.workspaces.find(w => w.id === wsId);
            const snapBoard4 = snapWs4?.boards.find(b => b.id === bId);
            const snapList4 = snapBoard4?.lists.find(l => l.id === lId);
            const snapCard4 = snapList4?.cards.find(c => c.id === cId);
            const snapCl4 = snapCard4?.checklists?.find(cl => cl.id === clId);
            const oldItem = snapCl4?.items?.find(cli => cli.id === cliId);
            if (oldItem) {
                const oldItemAsAny = oldItem as unknown as Record<string, unknown>;
                const oldValues = Object.fromEntries(
                    Object.keys(updates).map(k => [k, oldItemAsAny[k]])
                );
                useUndoStore.getState().pushUndo({
                    label: '修改待辦項目',
                    undo: () => get().updateChecklistItem(wsId, bId, lId, cId, clId, cliId, oldValues),
                    redo: () => get().updateChecklistItem(wsId, bId, lId, cId, clId, cliId, updates),
                });
            }
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).map(cl => {
                                                if (cl.id !== clId) return cl;
                                                return {
                                                    ...cl,
                                                    items: (cl.items || []).map(cli =>
                                                        cli.id === cliId ? { ...cli, ...updates } : cli
                                                    )
                                                };
                                            });
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        updateTaskDate: (wsId, bId, taskType, taskId, updates, listId = null, cardId = null, checklistId = null) => {
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            if (!board) return;

            // 更新目標任務
            if (taskType === 'list') state.updateList(wsId, bId, taskId, updates);
            else if (taskType === 'card') state.updateCard(wsId, bId, listId || '', taskId, updates);
            else if (taskType === 'checklist' || taskType === 'checklistitem') state.updateChecklistItem(wsId, bId, listId || '', cardId || '', checklistId || '', taskId, updates);

            // 強制執行依賴排程
            get().fixBoardDependencies(wsId, bId);
        },

        // ===== Delete operations =====
        removeChecklistItem: (wsId, bId, lId, cId, clId, cliId) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const updatedLists = b.lists.map(l => {
                                if (l.id !== lId) return l;
                                return {
                                    ...l,
                                    cards: l.cards.map(c => {
                                        if (c.id !== cId) return c;
                                        const now = Date.now();
                                        const newChecklists = (c.checklists || []).map(cl => {
                                            if (cl.id !== clId) return cl;
                                            return { ...cl, items: (cl.items || []).map(cli => cli.id === cliId ? { ...cli, isArchived: true, archivedAt: now } : cli) };
                                        });
                                        cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                        return { ...c, checklists: newChecklists };
                                    })
                                };
                            });
                            const updatedDeps = (b.dependencies || []).filter(d =>
                                d.fromId !== cliId && d.toId !== cliId
                            );
                            // 刪除相關依賴
                            (b.dependencies || []).filter(d => d.fromId === cliId || d.toId === cliId)
                                .forEach(d => dependencyService.delete(wsId, bId, d.id).catch(console.error));
                            return { ...b, lists: updatedLists, dependencies: updatedDeps };
                        })
                    };
                })
            }));
        },

        removeCard: (wsId, bId, lId, cId) => {
            get().updateCard(wsId, bId, lId, cId, { isArchived: true, archivedAt: Date.now() });
        },

        restoreCard: (wsId, bId, lId, cId) => {
            get().updateCard(wsId, bId, lId, cId, { isArchived: false });
        },

        permanentDeleteCard: (wsId, bId, lId, cId) => {
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const targetCard = board?.lists.find(l => l.id === lId)?.cards.find(c => c.id === cId);
            const childIds = (targetCard?.checklists || []).flatMap(cl => (cl.items || []).map(i => i.id));
            const idsToRemove = [cId, ...childIds];

            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const depsToRemove = (b.dependencies || []).filter(d =>
                                idsToRemove.includes(d.fromId) || idsToRemove.includes(d.toId)
                            );
                            depsToRemove.forEach(d => dependencyService.delete(wsId, bId, d.id).catch(console.error));
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return { ...l, cards: l.cards.filter(c => c.id !== cId) };
                                }),
                                dependencies: (b.dependencies || []).filter(d =>
                                    !idsToRemove.includes(d.fromId) && !idsToRemove.includes(d.toId)
                                )
                            };
                        })
                    };
                })
            }));
            cardService.delete(wsId, bId, cId).catch(console.error);
            get().fixBoardDependencies(wsId, bId);
        },

        restoreChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).map(cl =>
                                                cl.id === clId ? { ...cl, isArchived: false, archivedAt: undefined } : cl
                                            );
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        permanentDeleteChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).filter(cl => cl.id !== clId);
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        restoreChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            return {
                                ...b,
                                lists: b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            const newChecklists = (c.checklists || []).map(cl => {
                                                if (cl.id !== clId) return cl;
                                                return { ...cl, items: (cl.items || []).map(cli => cli.id === cliId ? { ...cli, isArchived: false, archivedAt: undefined } : cli) };
                                            });
                                            cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                            return { ...c, checklists: newChecklists };
                                        })
                                    };
                                })
                            };
                        })
                    };
                })
            }));
        },

        permanentDeleteChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => {
            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const updatedLists = b.lists.map(l => {
                                if (l.id !== lId) return l;
                                return {
                                    ...l,
                                    cards: l.cards.map(c => {
                                        if (c.id !== cId) return c;
                                        const newChecklists = (c.checklists || []).map(cl => {
                                            if (cl.id !== clId) return cl;
                                            return { ...cl, items: (cl.items || []).filter(cli => cli.id !== cliId) };
                                        });
                                        cardService.update(wsId, bId, cId, { checklists: newChecklists }).catch(console.error);
                                        return { ...c, checklists: newChecklists };
                                    })
                                };
                            });
                            // 清理相依性
                            const updatedDeps = (b.dependencies || []).filter(d => d.fromId !== cliId && d.toId !== cliId);
                            (b.dependencies || []).filter(d => d.fromId === cliId || d.toId === cliId)
                                .forEach(d => dependencyService.delete(wsId, bId, d.id).catch(console.error));
                                
                            return { ...b, lists: updatedLists, dependencies: updatedDeps };
                        })
                    };
                })
            }));
        },

        removeList: (wsId, bId, lId) => {
            get().updateList(wsId, bId, lId, { isArchived: true, archivedAt: Date.now() });
        },

        restoreList: (wsId, bId, lId) => {
            get().updateList(wsId, bId, lId, { isArchived: false });
        },

        permanentDeleteList: (wsId, bId, lId) => {
            const state = get();
            const ws = state.workspaces.find(w => w.id === wsId);
            const board = ws?.boards.find(b => b.id === bId);
            const targetList = board?.lists.find(l => l.id === lId);
            const cardIds = (targetList?.cards || []).map(c => c.id);
            const cliIds = (targetList?.cards || []).flatMap(c => (c.checklists || []).flatMap(cl => (cl.items || []).map(i => i.id)));
            const idsToRemove = [lId, ...cardIds, ...cliIds];

            set((state) => ({
                workspaces: state.workspaces.map(ws => {
                    if (ws.id !== wsId) return ws;
                    return {
                        ...ws,
                        boards: ws.boards.map(b => {
                            if (b.id !== bId) return b;
                            const depsToRemove = (b.dependencies || []).filter(d =>
                                idsToRemove.includes(d.fromId) || idsToRemove.includes(d.toId)
                            );
                            depsToRemove.forEach(d => dependencyService.delete(wsId, bId, d.id).catch(console.error));
                            return {
                                ...b,
                                lists: b.lists.filter(l => l.id !== lId),
                                dependencies: (b.dependencies || []).filter(d =>
                                    !idsToRemove.includes(d.fromId) && !idsToRemove.includes(d.toId)
                                )
                            };
                        })
                    };
                })
            }));
            // 刪除列表文件
            listService.delete(wsId, bId, lId).catch(console.error);
            // 刪除列表下的所有卡片文件
            cardIds.forEach(cId => cardService.delete(wsId, bId, cId).catch(console.error));
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
            const { workspaces } = get();
            const dataStr = JSON.stringify({ version: "2.0", workspaces }, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = `ProJED_Backup_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        },

        importData: async (jsonData: string | object) => {
            try {
                const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData as Record<string, unknown>;
                const userId = getUserId();

                if (Array.isArray(parsed)) {
                    // ===== 舊版格式（列表陣列）=====
                    // 設計意圖：將舊版扁平列表陣列轉換為 Workspace 結構，
                    // 然後寫入 Firestore，讓 onSnapshot 自動更新畫面。
                    const wsId = 'ws_import_' + Date.now();
                    const boardId = 'b_import_' + Date.now();
                    const importedWorkspace: import('../types').Workspace = {
                        id: wsId,
                        title: '匯入的工作區',
                        ownerId: userId,
                        members: [userId],
                        order: Date.now(),
                        createdAt: Date.now(),
                        boards: [{
                            id: boardId,
                            title: `復原的看板 (舊版) - ${dayjs().format('MM/DD HH:mm')}`,
                            lists: (parsed as Record<string, unknown>[]).map((oldList: Record<string, unknown>, i: number) => ({
                                id: (oldList.id as string) || 'l_' + Date.now() + '_' + i,
                                title: (oldList.title as string) || '無標題列表',
                                status: ((oldList.status as string) || 'todo') as TaskStatus,
                                ganttVisible: oldList.ganttVisible !== false,
                                cards: ((oldList.cards as Record<string, unknown>[]) || []).map((oldCard: Record<string, unknown>, j: number) => ({
                                    id: (oldCard.id as string) || 'c_' + Date.now() + '_' + i + '_' + j,
                                    title: (oldCard.title as string) || '無標題卡片',
                                    status: ((oldCard.status as string) || 'todo') as TaskStatus,
                                    ganttVisible: oldCard.ganttVisible !== false,
                                    startDate: (oldCard.startDate as string) || '',
                                    endDate: (oldCard.endDate as string) || '',
                                    notes: (oldCard.notes as string) || '',
                                    checklists: ((oldCard.checklists as Record<string, unknown>[]) || []).length > 0 ? [{
                                        id: 'cl_' + Date.now() + '_' + i + '_' + j,
                                        title: '舊版待辦事項',
                                        showCompleted: true,
                                        items: (oldCard.checklists as Record<string, unknown>[]).map((oldItem: Record<string, unknown>, k: number) => ({
                                            id: (oldItem.id as string) || 'cli_' + Date.now() + '_' + i + '_' + j + '_' + k,
                                            title: (oldItem.title as string) || (oldItem.text as string) || '',
                                            status: ((oldItem.status as string) || ((oldItem.completed as boolean) ? 'completed' : 'todo')) as TaskStatus,
                                            startDate: (oldItem.startDate as string) || '',
                                            endDate: (oldItem.endDate as string) || ''
                                        }))
                                    }] : []
                                })),
                                order: i,
                                createdAt: Date.now()
                            })),
                            dependencies: [],
                            order: Date.now(),
                            createdAt: Date.now()
                        }]
                    };
                    // 寫入 Firestore（onSnapshot 自動接收並更新畫面）
                    const { writeImportedWorkspacesToFirestore } = await import('../utils/migration');
                    const success = await writeImportedWorkspacesToFirestore(userId, [importedWorkspace]);
                    if (success) {
                        alert("舊版資料匯入完成！已建立「復原的看板」。\n（註：舊版依賴線結構不同，已捨棄。）");
                    } else {
                        alert("匯入失敗，請查看 Console 了解詳情。");
                    }
                } else if (parsed.version === "2.0" && Array.isArray(parsed.workspaces)) {
                    // ===== 新版備份格式 =====
                    const confirmed = await useDialogStore.getState().showConfirm("偵測到新版完全備份檔，匯入資料將新增到您的工作區中。確定要繼續嗎？");
                    if (confirmed) {
                        const workspaces = (parsed.workspaces as import('../types').Workspace[]).map(ws => ({
                            ...ws,
                            ownerId: userId,
                            members: [userId]
                        }));
                        // 寫入 Firestore（onSnapshot 自動接收並更新畫面）
                        const { writeImportedWorkspacesToFirestore } = await import('../utils/migration');
                        const success = await writeImportedWorkspacesToFirestore(userId, workspaces);
                        if (success) {
                            alert("新版資料匯入成功！");
                        } else {
                            alert("匯入失敗，請查看 Console 了解詳情。");
                        }
                    }
                } else {
                    alert("備份檔格式不支援或已損毀。");
                }
            } catch (error) {
                console.error("匯入失敗:", error);
                alert("匯入失敗，請確認檔案格式是否正確。");
            }
        },
    })
);

export default useBoardStore;
