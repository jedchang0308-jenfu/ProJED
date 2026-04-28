// @ts-nocheck
import React from 'react';
import { Layout, Plus, ChevronRight, LayoutDashboard, Menu, ChevronLeft, Trash2, Download, Upload, LogOut } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
import useDialogStore from '../store/useDialogStore';
import { useWbsStore } from '../store/useWbsStore';

const Sidebar = ({ isOpen, toggle }) => {
    const { workspaces, activeBoardId, switchBoard, showHome, isSidebarOpen, setSidebarOpen, removeBoard, removeWorkspace, currentView, setView } = useBoardStore();

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
                                            onClick={async () => {
                                                const name = await useDialogStore.getState().showPrompt("請輸入看板名稱：");
                                                if (name && name.trim()) useBoardStore.getState().addBoard(ws.id, name);
                                            }}
                                            className="p-1 hover:bg-primary-light hover:text-primary rounded text-slate-400"
                                            title="新增看板"
                                        >
                                            <Plus size={14} />
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除工作區「${ws.title}」及其所有看板嗎？您可以隨時使用 Ctrl+Z 復原。`);
                                                if (confirmed) {
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
                                        <div
                                            key={board.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => switchBoard(ws.id, board.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    switchBoard(ws.id, board.id);
                                                }
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors group/item cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 ${activeBoardId === board.id
                                                ? 'bg-primary text-white shadow-md'
                                                : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                        >
                                            <LayoutDashboard size={16} className={activeBoardId === board.id ? 'text-white' : 'text-slate-400'} />
                                            <span className="text-sm font-medium truncate flex-1">{board.title}</span>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除看板「${board.title}」嗎？您可以隨時使用 Ctrl+Z 復原。`);
                                                    if (confirmed) {
                                                        removeBoard(ws.id, board.id);
                                                        if (activeBoardId === board.id) showHome();
                                                    }
                                                }}
                                                className={`p-1 rounded transition-all opacity-0 group-hover/item:opacity-100 ${activeBoardId === board.id ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-200 text-slate-400'}`}
                                                title="刪除看板"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Recycle Bin Button */}
                    <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                        <button
                            onClick={() => setView('recycle_bin')}
                            className={`w-full px-3 py-2 rounded-lg flex items-center gap-3 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/50 ${currentView === 'recycle_bin'
                                ? 'bg-rose-500 text-white shadow-md font-bold text-sm tracking-wide'
                                : 'text-slate-600 hover:bg-white hover:text-rose-600 hover:shadow-sm font-medium text-sm'
                                }`}
                        >
                            <Trash2 size={16} className={currentView === 'recycle_bin' ? 'text-white/90' : 'text-slate-400 group-hover:text-rose-500'} />
                            <span className="truncate flex-1 text-left">資源回收桶</span>
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                {(useAuthStore.getState().user?.displayName || 'U')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-700 truncate">{useAuthStore.getState().user?.displayName || '使用者'}</div>
                                <div className="text-xs text-slate-400 truncate">{useAuthStore.getState().user?.email || ''}</div>
                            </div>
                            <button
                                onClick={() => useAuthStore.getState().signOut()}
                                className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-colors"
                                title="登出"
                            >
                                <LogOut size={14} />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => useWbsStore.getState().exportData()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
                            >
                                <Download size={14} />
                                匯出 WBS
                            </button>
                            <label className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors cursor-pointer">
                                <Upload size={14} />
                                匯入 JSON
                                <input 
                                    type="file" 
                                    accept=".json" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                            useWbsStore.getState().importData(event.target?.result as string);
                                        };
                                        reader.readAsText(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
