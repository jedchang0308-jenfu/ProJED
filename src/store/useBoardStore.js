import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import dayjs from 'dayjs';

export const calculateCascadedDates = (board, overriddenDates = {}) => {
    const intermediateDates = new Map();
    if (!board.dependencies || board.dependencies.length === 0) return intermediateDates;

    // Helper to get task by id
    const getCurrentTask = (id) => {
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

    const inDegree = new Map();
    const adjList = new Map();
    
    // Initialize nodes
    board.dependencies.forEach(dep => {
        if (dep.fromId === dep.toId) {
            if (!inDegree.has(dep.fromId)) inDegree.set(dep.fromId, 0);
            return; 
        }

        if (!inDegree.has(dep.fromId)) inDegree.set(dep.fromId, 0);
        if (!inDegree.has(dep.toId)) inDegree.set(dep.toId, 0);
        
        if (!adjList.has(dep.fromId)) adjList.set(dep.fromId, []);
        adjList.get(dep.fromId).push(dep);
        inDegree.set(dep.toId, inDegree.get(dep.toId) + 1);
    });

    let queue = Array.from(inDegree.entries())
        .filter(([_, degree]) => degree === 0)
        .map(([id]) => id);

    if (queue.length === 0 && inDegree.size > 0) {
        queue.push(Array.from(inDegree.keys())[0]);
    }

    while (queue.length > 0) {
        const currentId = queue.shift();
        const edges = adjList.get(currentId) || [];
        
        const currentTask = getCurrentTask(currentId);
        if (!currentTask) continue;
        
        let currentStartStr = intermediateDates.get(currentId)?.startDate 
                              || overriddenDates[currentId]?.startDate 
                              || currentTask.startDate 
                              || dayjs().format('YYYY-MM-DD');
                              
        let currentEndStr = intermediateDates.get(currentId)?.endDate 
                            || overriddenDates[currentId]?.endDate 
                            || currentTask.endDate 
                            || dayjs(currentStartStr).add(1, 'day').format('YYYY-MM-DD');

        // 1. Process Self-Dependencies
        const selfDeps = board.dependencies.filter(d => d.fromId === currentId && d.toId === currentId);
        selfDeps.forEach(dep => {
            const offsetDays = dep.offset || 0;
            if (dep.fromSide === 'start' && dep.toSide === 'end') {
                currentEndStr = dayjs(currentStartStr).add(offsetDays, 'day').format('YYYY-MM-DD');
            } else if (dep.fromSide === 'end' && dep.toSide === 'start') {
                currentStartStr = dayjs(currentEndStr).add(1 + offsetDays, 'day').format('YYYY-MM-DD');
            }
        });

        intermediateDates.set(currentId, { startDate: currentStartStr, endDate: currentEndStr });

        // 2. Propagate to successors
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
                            || dayjs(sStartStr).add(1, 'day').format('YYYY-MM-DD');
                            
            const duration = dayjs(sEndStr).diff(dayjs(sStartStr), 'day');

            let idealStart = sStartStr;
            const offsetDays = dep.offset || 0;
            if (dep.fromSide === 'end' && dep.toSide === 'start') {
                idealStart = dayjs(currentEndStr).add(1 + offsetDays, 'day').format('YYYY-MM-DD');
            } else if (dep.fromSide === 'start' && dep.toSide === 'start') {
                idealStart = dayjs(currentStartStr).add(offsetDays, 'day').format('YYYY-MM-DD');
            } else if (dep.fromSide === 'end' && dep.toSide === 'end') {
                const idealEnd = dayjs(currentEndStr).add(offsetDays, 'day').format('YYYY-MM-DD');
                idealStart = dayjs(idealEnd).subtract(duration, 'day').format('YYYY-MM-DD');
            } else if (dep.fromSide === 'start' && dep.toSide === 'end') {
                const idealEnd = dayjs(currentStartStr).add(offsetDays, 'day').format('YYYY-MM-DD');
                idealStart = dayjs(idealEnd).subtract(duration, 'day').format('YYYY-MM-DD');
            }
            
            const idealEnd = dayjs(idealStart).add(duration, 'day').format('YYYY-MM-DD');

            const prevIdeal = intermediateDates.get(successor.id);
            if (!prevIdeal || dayjs(idealStart).isAfter(dayjs(prevIdeal.startDate))) {
                intermediateDates.set(successor.id, { startDate: idealStart, endDate: idealEnd });
            }

            const newDegree = inDegree.get(dep.toId) - 1;
            inDegree.set(dep.toId, newDegree);
            if (newDegree === 0) queue.push(dep.toId);
        });
    }

    return intermediateDates;
};

const useBoardStore = create(
    persist(
        (set, get) => ({
            workspaces: [],
            activeWorkspaceId: null,
            activeBoardId: null,
            currentView: 'home', // 'home', 'board', 'gantt'
            isSidebarOpen: true,
            editingItem: null, // { type, itemId, listId, boardId, workspaceId }
            statusFilters: {
                todo: true,
                delayed: true,
                completed: true,
                unsure: true,
                onhold: true,
            },
            past: [],
            future: [],

            // Private helper to capture state
            recordHistory: () => {
                const { workspaces, past } = get();
                const MAX_HISTORY = 50;
                set({
                    past: [...past.slice(-(MAX_HISTORY - 1)), JSON.parse(JSON.stringify(workspaces))],
                    future: []
                });
            },

            undo: () => {
                const { past, future, workspaces } = get();
                if (past.length === 0) return;

                const previous = past[past.length - 1];
                const newPast = past.slice(0, past.length - 1);

                set({
                    workspaces: previous,
                    past: newPast,
                    future: [JSON.parse(JSON.stringify(workspaces)), ...future]
                });
            },

            redo: () => {
                const { past, future, workspaces } = get();
                if (future.length === 0) return;

                const next = future[0];
                const newFuture = future.slice(1);

                set({
                    workspaces: next,
                    past: [...past, JSON.parse(JSON.stringify(workspaces))],
                    future: newFuture
                });
            },

            // Actions
            setWorkspaces: (workspaces) => set({ workspaces }),
            setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
            setActiveBoard: (id) => set({ activeBoardId: id }),
            setView: (view) => set({ currentView: view }),
            setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

            addWorkspace: (title) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: [...state.workspaces, {
                        id: 'ws_' + Date.now(),
                        title: title || '我的工作區',
                        boards: []
                    }]
                }));
            },

            toggleStatusFilter: (status) => set((state) => ({
                statusFilters: {
                    ...state.statusFilters,
                    [status]: !state.statusFilters[status]
                }
            })),

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
                        boardId: activeBoardId,
                        workspaceId: activeWorkspaceId,
                        ...extra
                    }
                });
            },

            closeModal: () => set({ editingItem: null }),

            updateCard: (wsId, bId, lId, cId, updates, noHistory = false) => {
                if (!noHistory) get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c =>
                                                            c.id === cId ? { ...c, ...updates } : c
                                                        )
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            updateList: (wsId, bId, lId, updates, noHistory = false) => {
                if (!noHistory) get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l =>
                                                l.id === lId ? { ...l, ...updates } : l
                                            )
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            switchBoard: (workspaceId, boardId) => {
                const { workspaces } = get();
                const ws = workspaces.find(w => w.id === workspaceId);
                const board = ws?.boards.find(b => b.id === boardId);

                if (board) {
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
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === workspaceId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b =>
                                    b.id === boardId ? { ...b, title: newTitle } : b
                                )
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            addDependency: (wsId, bId, dependency) => {
                get().recordHistory();
                let added = false;
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        const deps = b.dependencies || [];
                                        const exists = deps.some(d =>
                                            d.fromId === dependency.fromId &&
                                            d.fromSide === dependency.fromSide &&
                                            d.toId === dependency.toId &&
                                            d.toSide === dependency.toSide
                                        );
                                        if (exists) return b;
                                        added = true;
                                        return { ...b, dependencies: [...deps, { ...dependency, id: 'dep_' + Date.now() }] };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
                if (added) get().fixBoardDependencies(wsId, bId);
            },
            removeDependency: (wsId, bId, depId) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return { ...b, dependencies: (b.dependencies || []).filter(d => d.id !== depId) };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
                get().fixBoardDependencies(wsId, bId);
            },

            updateDependency: (wsId, bId, depId, updates) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            dependencies: (b.dependencies || []).map(d =>
                                                d.id === depId ? { ...d, ...updates } : d
                                            )
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
                get().fixBoardDependencies(wsId, bId);
            },

            // Derived
            getActiveBoard: () => {
                const { workspaces, activeWorkspaceId, activeBoardId } = get();
                const ws = workspaces.find(w => w.id === activeWorkspaceId);
                return ws?.boards.find(b => b.id === activeBoardId);
            },

            getActiveWorkspace: () => {
                const { workspaces, activeWorkspaceId } = get();
                return workspaces.find(w => w.id === activeWorkspaceId);
            },
            
            fixBoardDependencies: (wsId, bId) => {
                console.log("[fixBoardDependencies] Triggered for wsId:", wsId, "bId:", bId);
                get().recordHistory();
                const state = get();
                const ws = state.workspaces.find(w => w.id === wsId);
                const board = ws?.boards.find(b => b.id === bId);
                
                if (!board) {
                    console.log("[fixBoardDependencies] Error: Board not found");
                    return;
                }
                if (!board.dependencies || board.dependencies.length === 0) {
                    console.log("[fixBoardDependencies] Notice: No dependencies on this board");
                    return;
                }

                const intermediateDates = calculateCascadedDates(board, {});

                const updatesQueue = [];
                const getCurrentTask = (id) => {
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

                intermediateDates.forEach((dates, id) => {
                    const task = getCurrentTask(id);
                    if (!task) return;

                    // 設計意圖：若任務本身完全沒有日期資訊，跳過 cascade 更新。
                    // 舊邏輯的 BUG：以「今天/明天」填補空日期再比對，
                    // 導致只設了單邊日期（或完全無日期）的任務被錯誤覆蓋。
                    const hasStart = !!task.startDate;
                    const hasEnd   = !!task.endDate;
                    if (!hasStart && !hasEnd) return; // 完全無日期，跳過

                    // 若只有單邊日期，用 cascade 值本身當比對基準，避免假性差異
                    const rawStart = task.startDate || dates.startDate;
                    const rawEnd   = task.endDate   || dates.endDate;

                    if (rawStart !== dates.startDate || rawEnd !== dates.endDate) {
                        updatesQueue.push({ type: task.type, id: task.id, listId: task.listId, cardId: task.cardId, checklistId: task.checklistId, updates: dates });
                    }
                });

                console.log("[fixBoardDependencies] Finished loop. Updates to apply:", updatesQueue);

                updatesQueue.forEach(u => {
                    if (u.type === 'list') state.updateList(wsId, bId, u.id, u.updates, true);
                    else if (u.type === 'card') state.updateCard(wsId, bId, u.listId, u.id, u.updates, true);
                    else if (u.type === 'checklist') state.updateChecklistItem(wsId, bId, u.listId, u.cardId, u.checklistId, u.id, u.updates, true);
                });
            },

            cleanBoardDependencies: (wsId, bId) => {
                const state = get();
                const ws = state.workspaces.find(w => w.id === wsId);
                const board = ws?.boards.find(b => b.id === bId);
                if (!board) return;

                // 1. 收集該看板所有合法的 ID
                const validIds = new Set();
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

                // 2. 過濾無效依賴
                const originalDeps = board.dependencies || [];
                const cleanedDeps = originalDeps.filter(d =>
                    validIds.has(d.fromId) && validIds.has(d.toId)
                );

                // 3. 只有在真的有變動時才執行 set
                if (cleanedDeps.length === originalDeps.length) return;

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
            },

            addBoard: (workspaceId, boardName) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === workspaceId) {
                            return {
                                ...ws,
                                boards: [...ws.boards, {
                                    id: 'b_' + Date.now(),
                                    title: boardName,
                                    lists: [],
                                    dependencies: []
                                }]
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            addList: (workspaceId, boardId, title) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === workspaceId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === boardId) {
                                        return {
                                            ...b,
                                            lists: [...(b.lists || []), {
                                                id: 'l_' + Date.now(),
                                                title: title || '新列表',
                                                status: 'todo',
                                                cards: [],
                                                ganttVisible: true
                                            }]
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            addCard: (workspaceId, boardId, listId, title) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === workspaceId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === boardId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === listId) {
                                                    return {
                                                        ...l,
                                                        cards: [...(l.cards || []), {
                                                            id: 'c_' + Date.now(),
                                                            title: title || '新卡片',
                                                            status: 'todo',
                                                            checklists: [],
                                                            ganttVisible: true
                                                        }]
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            addChecklist: (wsId, bId, lId, cId) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c => {
                                                            if (c.id === cId) {
                                                                const newChecklist = {
                                                                    id: 'cl_' + Date.now(),
                                                                    title: '待辦清單',
                                                                    showCompleted: true,
                                                                    items: []
                                                                };
                                                                return { ...c, checklists: [...(c.checklists || []), newChecklist] };
                                                            }
                                                            return c;
                                                        })
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            removeChecklist: (wsId, bId, lId, cId, clId) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c => {
                                                            if (c.id === cId) {
                                                                return { ...c, checklists: (c.checklists || []).filter(cl => cl.id !== clId) };
                                                            }
                                                            return c;
                                                        })
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            updateChecklist: (wsId, bId, lId, cId, clId, updates) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c => {
                                                            if (c.id === cId) {
                                                                return {
                                                                    ...c,
                                                                    checklists: (c.checklists || []).map(cl =>
                                                                        cl.id === clId ? { ...cl, ...updates } : cl
                                                                    )
                                                                };
                                                            }
                                                            return c;
                                                        })
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            addChecklistItem: (wsId, bId, lId, cId, clId) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c => {
                                                            if (c.id === cId) {
                                                                return {
                                                                    ...c,
                                                                    checklists: (c.checklists || []).map(cl => {
                                                                        if (cl.id === clId) {
                                                                            return {
                                                                                ...cl,
                                                                                items: [...(cl.items || []), {
                                                                                    id: 'cli_' + Date.now(),
                                                                                    title: '',
                                                                                    status: 'todo',
                                                                                    startDate: '',
                                                                                    endDate: ''
                                                                                }]
                                                                            };
                                                                        }
                                                                        return cl;
                                                                    })
                                                                };
                                                            }
                                                            return c;
                                                        })
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            updateChecklistItem: (wsId, bId, lId, cId, clId, cliId, updates, noHistory = false) => {
                if (!noHistory) get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id === wsId) {
                            return {
                                ...ws,
                                boards: ws.boards.map(b => {
                                    if (b.id === bId) {
                                        return {
                                            ...b,
                                            lists: b.lists.map(l => {
                                                if (l.id === lId) {
                                                    return {
                                                        ...l,
                                                        cards: l.cards.map(c => {
                                                            if (c.id === cId) {
                                                                return {
                                                                    ...c,
                                                                    checklists: (c.checklists || []).map(cl => {
                                                                        if (cl.id === clId) {
                                                                            return {
                                                                                ...cl,
                                                                                items: (cl.items || []).map(cli =>
                                                                                    cli.id === cliId ? { ...cli, ...updates } : cli
                                                                                )
                                                                            };
                                                                        }
                                                                        return cl;
                                                                    })
                                                                };
                                                            }
                                                            return c;
                                                        })
                                                    };
                                                }
                                                return l;
                                            })
                                        };
                                    }
                                    return b;
                                })
                            };
                        }
                        return ws;
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            // Auto-scheduling Action
            updateTaskDate: (wsId, bId, taskType, taskId, updates, listId = null, cardId = null, checklistId = null, noHistory = false, originalDates = null, dragType = 'move') => {
                if (!noHistory) get().recordHistory();

                const state = get();
                const ws = state.workspaces.find(w => w.id === wsId);
                const board = ws?.boards.find(b => b.id === bId);
                if (!board) return;

                // Create helper to find old task details to calculate deltaDays
                const findTask = (id) => {
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

                const oldTask = findTask(taskId);
                const oldStartStr = originalDates?.startDate || oldTask?.startDate;
                const newStartStr = updates.startDate;
                const oldEndStr = originalDates?.endDate || oldTask?.endDate;
                const newEndStr = updates.endDate;
                
                let deltaDays = 0;
                
                if (dragType === 'left' && oldStartStr && newStartStr) {
                    deltaDays = dayjs(newStartStr).diff(dayjs(oldStartStr), 'day');
                } else if (dragType === 'right' && oldEndStr && newEndStr) {
                    deltaDays = dayjs(newEndStr).diff(dayjs(oldEndStr), 'day');
                } else if (dragType === 'move') {
                    if (oldStartStr && newStartStr) {
                        deltaDays = dayjs(newStartStr).diff(dayjs(oldStartStr), 'day');
                    } else if (oldEndStr && newEndStr) {
                        deltaDays = dayjs(newEndStr).diff(dayjs(oldEndStr), 'day');
                    }
                }
                console.log("[updateTaskDate] Task:", taskId, "dragType:", dragType, "deltaDays:", deltaDays, "originalDates passed:", originalDates);

                // 1. Update the target task first
                if (taskType === 'list') state.updateList(wsId, bId, taskId, updates, true);
                else if (taskType === 'card') state.updateCard(wsId, bId, listId, taskId, updates, true);
                else if (taskType === 'checklist') state.updateChecklistItem(wsId, bId, listId, cardId, checklistId, taskId, updates, true);

                if (deltaDays === 0) return; // No shift needed
                console.log("[updateTaskDate] Triggering fixBoardDependencies to strictly enforce all dependencies.");
                
                // Option A: Strictly enforce dependencies across the board 
                // after every date update to guarantee 100% adherence.
                get().fixBoardDependencies(wsId, bId);
            },

            removeChecklistItem: (wsId, bId, lId, cId, clId, cliId) => {
                get().recordHistory();
                set((state) => {
                    const newWorkspaces = state.workspaces.map(ws => {
                        if (ws.id !== wsId) return ws;
                        return {
                            ...ws,
                            boards: ws.boards.map(b => {
                                if (b.id !== bId) return b;
                                // 1. Filter out the checklist item
                                const updatedLists = b.lists.map(l => {
                                    if (l.id !== lId) return l;
                                    return {
                                        ...l,
                                        cards: l.cards.map(c => {
                                            if (c.id !== cId) return c;
                                            return {
                                                ...c,
                                                checklists: (c.checklists || []).map(cl => {
                                                    if (cl.id !== clId) return cl;
                                                    return {
                                                        ...cl,
                                                        items: (cl.items || []).filter(cli => cli.id !== cliId)
                                                    };
                                                })
                                            };
                                        })
                                    };
                                });
                                // 2. Synchronize dependencies: remove any referencing the deleted item
                                const updatedDeps = (b.dependencies || []).filter(d =>
                                    d.fromId !== cliId && d.toId !== cliId
                                );
                                return { ...b, lists: updatedLists, dependencies: updatedDeps };
                            })
                        };
                    });
                    return { workspaces: newWorkspaces };
                });
            },

            // 刪除卡片 (同步清理依賴)
            removeCard: (wsId, bId, lId, cId) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: state.workspaces.map(ws => {
                        if (ws.id !== wsId) return ws;
                        return {
                            ...ws,
                            boards: ws.boards.map(b => {
                                if (b.id !== bId) return b;

                                // 找出該卡片下所有的 checklist item IDs，也要一起清理
                                const targetCard = b.lists.find(l => l.id === lId)?.cards.find(c => c.id === cId);
                                const childIds = (targetCard?.checklists || []).flatMap(cl => (cl.items || []).map(i => i.id));
                                const idsToRemove = [cId, ...childIds];

                                return {
                                    ...b,
                                    lists: b.lists.map(l => {
                                        if (l.id !== lId) return l;
                                        return {
                                            ...l,
                                            cards: l.cards.filter(c => c.id !== cId)
                                        };
                                    }),
                                    dependencies: (b.dependencies || []).filter(d =>
                                        !idsToRemove.includes(d.fromId) && !idsToRemove.includes(d.toId)
                                    )
                                };
                            })
                        };
                    })
                }));
            },

            // 刪除列表 (同步清理所有下屬卡片與待辦的依賴)
            removeList: (wsId, bId, lId) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: state.workspaces.map(ws => {
                        if (ws.id !== wsId) return ws;
                        return {
                            ...ws,
                            boards: ws.boards.map(b => {
                                if (b.id !== bId) return b;

                                // 找出該列表下所有卡片與待辦的 ID
                                const targetList = b.lists.find(l => l.id === lId);
                                const cardIds = (targetList?.cards || []).map(c => c.id);
                                const cliIds = (targetList?.cards || []).flatMap(c => (c.checklists || []).flatMap(cl => (cl.items || []).map(i => i.id)));
                                const idsToRemove = [lId, ...cardIds, ...cliIds];

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
            },

            // 刪除看板
            removeBoard: (wsId, bId) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: state.workspaces.map(ws => {
                        if (ws.id !== wsId) return ws;
                        return {
                            ...ws,
                            boards: ws.boards.filter(b => b.id !== bId)
                        };
                    })
                }));
            },

            // 刪除工作區
            removeWorkspace: (wsId) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: state.workspaces.filter(ws => ws.id !== wsId)
                }));
            },

            // 匯出資料
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

            // 匯入資料 (安全模式)
            importData: (jsonData) => {
                try {
                    const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
                    get().recordHistory();
                    
                    // 判斷是否為舊版陣列格式 (Legacy List[])
                    if (Array.isArray(parsed)) {
                        const { activeWorkspaceId } = get();
                        if (!activeWorkspaceId) {
                            alert("請先建立並切換到一個工作區再匯入舊版資料。");
                            return;
                        }
                        
                        // 轉換邏輯
                        const newBoardId = 'b_' + Date.now();
                        const newBoard = {
                            id: newBoardId,
                            title: `復原的看板 (舊版) - ${dayjs().format('MM/DD HH:mm')}`,
                            lists: parsed.map(oldList => ({
                                id: oldList.id || 'l_' + Date.now() + Math.random(),
                                title: oldList.title || '無標題列表',
                                status: oldList.status || 'todo',
                                ganttVisible: oldList.ganttVisible !== false,
                                cards: (oldList.cards || []).map(oldCard => ({
                                    id: oldCard.id || 'c_' + Date.now() + Math.random(),
                                    title: oldCard.title || '無標題卡片',
                                    status: oldCard.status || 'todo',
                                    ganttVisible: oldCard.ganttVisible !== false,
                                    startDate: oldCard.startDate || '',
                                    endDate: oldCard.endDate || '',
                                    notes: oldCard.notes || '',
                                    checklists: (oldCard.checklists || []).length > 0 ? [{
                                        id: 'cl_' + Date.now() + Math.random(),
                                        title: '舊版待辦事項',
                                        showCompleted: true,
                                        items: oldCard.checklists.map(oldItem => ({
                                            id: oldItem.id || 'cli_' + Date.now() + Math.random(),
                                            title: oldItem.title || oldItem.text || '',
                                            status: oldItem.status || (oldItem.completed ? 'completed' : 'todo'),
                                            startDate: oldItem.startDate || '',
                                            endDate: oldItem.endDate || ''
                                        }))
                                    }] : []
                                }))
                            })),
                            dependencies: [] // 略過舊版依賴，因結構差異太大且舊版依賴問題多
                        };
                        
                        set(state => ({
                            workspaces: state.workspaces.map(ws => 
                                ws.id === activeWorkspaceId 
                                    ? { ...ws, boards: [...ws.boards, newBoard] }
                                    : ws
                            )
                        }));
                        alert("舊版資料以安全模式匯入完成！已建立「復原的看板」。\n（註：舊版依賴線結構不同，已捨棄。）");
                    } 
                    // 判斷是否為新版格式
                    else if (parsed.version === "2.0" && Array.isArray(parsed.workspaces)) {
                        if (confirm("偵測到新版完全備份檔，匯入將會「覆蓋」目前所有工作區的資料。確定要繼續嗎？")) {
                            set({ workspaces: parsed.workspaces, activeWorkspaceId: null, activeBoardId: null });
                            alert("新版資料匯入成功！");
                        }
                    } else {
                        alert("備份檔格式不支援或已損毀。");
                    }
                } catch (error) {
                    console.error("匯入失敗:", error);
                    alert("匯入失敗，請確認檔案格式是否正確。");
                }
            },
        }),
        {
            name: 'projed-storage',
            partialize: (state) => {
                const { past, future, ...persistedState } = state;
                return persistedState;
            },
        }
    )
);

export default useBoardStore;
