import React from 'react';
import { Layout, Plus, ChevronRight, LayoutDashboard, Menu, ChevronLeft, Trash2 } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';

const Sidebar = ({ isOpen, toggle }) => {
    const { workspaces, activeBoardId, switchBoard, showHome, isSidebarOpen, setSidebarOpen, removeBoard, removeWorkspace } = useBoardStore();

    return (
        <aside className={`bg-white border-r border-slate-200 flex-shrink-0 transition-all duration-300 ease-in-out z-30 shadow-sm relative overflow-hidden ${isSidebarOpen ? 'w-64' : 'w-10'}`}>
            {!isSidebarOpen ? (
                <div className="flex-1 flex flex-col items-center pt-4 gap-4 h-full bg-slate-50/30">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-1.5 hover:bg-slate-100 rounded-full text-primary transition-colors"
                        title="展開工作區選單"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <div className="h-full w-px bg-slate-100" />
                </div>
            ) : (
                <div className="w-64 h-full flex flex-col">
                    {/* Sidebar Header */}
                    <div className="h-14 p-4 border-b-2 border-slate-200 flex items-center justify-between bg-slate-50">
                        <span className="font-bold text-xs text-slate-500 uppercase tracking-wider">工作區選單</span>
                        <div className="flex items-center gap-1">
                            <button onClick={showHome} className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors" title="回到首頁">
                                <LayoutDashboard size={14} />
                            </button>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                                title="收疊工作區選單"
                            >
                                <ChevronLeft size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Workspace List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-4">
                        {workspaces.map((ws) => (
                            <div key={ws.id} className="space-y-1">
                                <div className="px-3 py-2 flex items-center justify-between group">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{ws.title}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button
                                            onClick={() => switchBoard(ws.id, ws.boards[0]?.id)}
                                            className="p-1 hover:bg-primary-light hover:text-primary rounded text-slate-400"
                                            title="新增看板"
                                        >
                                            <Plus size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm(`確定要刪除工作區「${ws.title}」及其所有看板嗎？`)) {
                                                    removeWorkspace(ws.id);
                                                    showHome();
                                                }
                                            }}
                                            className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-slate-300"
                                            title="刪除工作區"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    {ws.boards.map((board) => (
                                        <button
                                            key={board.id}
                                            onClick={() => switchBoard(ws.id, board.id)}
                                            className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${activeBoardId === board.id
                                                ? 'bg-primary text-white shadow-md'
                                                : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                        >
                                            <LayoutDashboard size={16} className={activeBoardId === board.id ? 'text-white' : 'text-slate-400'} />
                                            <span className="text-sm font-medium truncate flex-1">{board.title}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`確定要刪除看板「${board.title}」嗎？`)) {
                                                        removeBoard(ws.id, board.id);
                                                        if (activeBoardId === board.id) showHome();
                                                    }
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded text-inherit transition-all"
                                                title="刪除看板"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                P
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-700 truncate">ProJED User</div>
                                <div className="text-xs text-slate-400 truncate">pro@example.com</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
