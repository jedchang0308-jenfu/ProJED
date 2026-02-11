import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

            removeChecklistItem: (wsId, bId, lId, cId, clId, cliId) => {
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
                                                                                items: (cl.items || []).filter(cli => cli.id !== cliId)
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

            // 刪除卡片
            removeCard: (wsId, bId, lId, cId) => {
                get().recordHistory();
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
                                            cards: l.cards.filter(c => c.id !== cId)
                                        };
                                    })
                                };
                            })
                        };
                    })
                }));
            },

            // 刪除列表
            removeList: (wsId, bId, lId) => {
                get().recordHistory();
                set((state) => ({
                    workspaces: state.workspaces.map(ws => {
                        if (ws.id !== wsId) return ws;
                        return {
                            ...ws,
                            boards: ws.boards.map(b => {
                                if (b.id !== bId) return b;
                                return {
                                    ...b,
                                    lists: b.lists.filter(l => l.id !== lId)
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
