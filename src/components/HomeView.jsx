import React from 'react';
import { Plus, Layout as LayoutIcon, Trello, Trash2 } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';

const HomeView = () => {
    const { workspaces, switchBoard, addBoard } = useBoardStore();

    const handleCreateBoard = () => {
        const name = prompt("請輸入新看板名稱：", "新專案");
        if (name) {
            const currentWorkspaces = useBoardStore.getState().workspaces;
            if (currentWorkspaces.length > 0) {
                addBoard(currentWorkspaces[0].id, name);
            } else {
                // Fallback (though App.jsx should handle this)
                const wsId = 'ws_' + Date.now();
                useBoardStore.getState().addWorkspace("我的工作區");
                setTimeout(() => {
                    const ws = useBoardStore.getState().workspaces;
                    if (ws.length > 0) addBoard(ws[0].id, name);
                }, 0);
            }
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex items-center gap-3">
                    <div className="p-2 bg-primary-light rounded-lg">
                        <Trello className="text-primary w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">我的工作區</h2>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {workspaces.flatMap(ws => ws.boards.map(board => (
                        <div key={board.id} className="relative group">
                            <button
                                onClick={() => switchBoard(ws.id, board.id)}
                                className="w-full h-28 p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-primary hover:shadow-lg transition-all overflow-hidden"
                            >
                                <div className="relative z-10">
                                    <h3 className="font-bold text-slate-800 group-hover:text-primary transition-colors">{board.title}</h3>
                                    <p className="text-xs text-slate-400 font-medium mt-1">{ws.title}</p>
                                </div>
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <LayoutIcon size={48} />
                                </div>
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-primary transform translate-y-full group-hover:translate-y-0 transition-transform"></div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`確定要刪除看板「${board.title}」嗎？`)) {
                                        useBoardStore.getState().removeBoard(ws.id, board.id);
                                    }
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-white shadow-sm border border-slate-100 rounded-lg text-slate-300 hover:text-red-500 hover:border-red-100 opacity-0 group-hover:opacity-100 transition-all z-20"
                                title="刪除看板"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )))}

                    <button
                        onClick={handleCreateBoard}
                        className="h-28 p-4 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary hover:bg-slate-50 transition-all"
                    >
                        <Plus size={24} />
                        <span className="text-sm font-bold">建立新看板</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HomeView;
