import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import dayjs from 'dayjs';

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
            updateTaskDate: (wsId, bId, taskType, taskId, updates, listId = null, cardId = null, checklistId = null, noHistory = false) => {
                if (!noHistory) get().recordHistory();

                const state = get();
                const ws = state.workspaces.find(w => w.id === wsId);
                const board = ws?.boards.find(b => b.id === bId);
                if (!board) return;

                // 1. Update the target task first
                if (taskType === 'list') state.updateList(wsId, bId, taskId, updates, true);
                else if (taskType === 'card') state.updateCard(wsId, bId, listId, taskId, updates, true);
                else if (taskType === 'checklist') state.updateChecklistItem(wsId, bId, listId, cardId, checklistId, taskId, updates, true);

                // 2. Recursive Auto-scheduling Helper
                // We need to re-fetch state in recursion because multiple updates happen
                const scheduleSuccessors = (targetId, currentStart, currentEnd) => {
                    const currentBoard = get().workspaces.find(w => w.id === wsId)?.boards.find(b => b.id === bId);
                    if (!currentBoard?.dependencies) return;

                    // Helper to find task details in the *current* state
                    const findTask = (id) => {
                        for (const l of currentBoard.lists) {
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

                    currentBoard.dependencies.forEach(dep => {
                        if (dep.fromId === targetId) {
                            const successor = findTask(dep.toId);
                            if (!successor) return;

                            // import dayjs is assumed to be available in store or we use window.dayjs if injected, 
                            // but better to rely on what is available. 
                            // Since we cannot easily import inside a function in basic JS without module system,
                            // Ensure dayjs is imported at top of file. 
                            // Assuming dayjs is available as we will add import.
                            const sStart = successor.startDate || dayjs().format('YYYY-MM-DD');
                            const sEnd = successor.endDate || dayjs(sStart).add(1, 'day').format('YYYY-MM-DD');
                            const sGap = dayjs(sEnd).diff(dayjs(sStart), 'day');

                            let nextStart = sStart;
                            let nextEnd = sEnd;
                            let needsUpdate = false;

                            if (dep.fromSide === 'end' && dep.toSide === 'start') { // FS
                                if (dayjs(sStart).isBefore(dayjs(currentEnd).add(1, 'day'))) {
                                    nextStart = dayjs(currentEnd).add(1, 'day').format('YYYY-MM-DD');
                                    nextEnd = dayjs(nextStart).add(sGap, 'day').format('YYYY-MM-DD');
                                    needsUpdate = true;
                                }
                            } else if (dep.fromSide === 'start' && dep.toSide === 'start') { // SS
                                if (dayjs(sStart).isBefore(dayjs(currentStart))) {
                                    nextStart = currentStart;
                                    nextEnd = dayjs(nextStart).add(sGap, 'day').format('YYYY-MM-DD');
                                    needsUpdate = true;
                                }
                            } else if (dep.fromSide === 'end' && dep.toSide === 'end') { // FF
                                if (dayjs(sEnd).isBefore(dayjs(currentEnd))) {
                                    nextEnd = currentEnd;
                                    nextStart = dayjs(nextEnd).subtract(sGap, 'day').format('YYYY-MM-DD');
                                    needsUpdate = true;
                                }
                            } else if (dep.fromSide === 'start' && dep.toSide === 'end') { // SF
                                if (dayjs(sEnd).isBefore(dayjs(currentStart))) {
                                    nextEnd = currentStart;
                                    nextStart = dayjs(nextEnd).subtract(sGap, 'day').format('YYYY-MM-DD');
                                    needsUpdate = true;
                                }
                            }

                            if (needsUpdate) {
                                const sUpdates = { startDate: nextStart, endDate: nextEnd };
                                if (successor.type === 'list') get().updateList(wsId, bId, successor.id, sUpdates, true);
                                else if (successor.type === 'card') get().updateCard(wsId, bId, successor.listId, successor.id, sUpdates, true);
                                else if (successor.type === 'checklist') get().updateChecklistItem(wsId, bId, successor.listId, successor.cardId, successor.checklistId, successor.id, sUpdates, true);

                                scheduleSuccessors(successor.id, nextStart, nextEnd);
                            }
                        }
                    });
                };

                // Trigger scheduling
                const newStart = updates.startDate || (taskType === 'list' ? board.lists.find(l => l.id === taskId)?.startDate : (taskType === 'card' ? board.lists.flatMap(l => l.cards).find(c => c.id === taskId)?.startDate : null));
                const newEnd = updates.endDate || (taskType === 'list' ? board.lists.find(l => l.id === taskId)?.endDate : (taskType === 'card' ? board.lists.flatMap(l => l.cards).find(c => c.id === taskId)?.endDate : null));

                if (newStart && newEnd) {
                    scheduleSuccessors(taskId, newStart, newEnd);
                }
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
