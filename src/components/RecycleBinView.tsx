// @ts-nocheck
import React from 'react';
import { Trash2, RotateCcw, ShieldAlert } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useDialogStore from '../store/useDialogStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import dayjs from 'dayjs';

const RecycleBinView = () => {
    const { getActiveBoard, activeWorkspaceId, activeBoardId, workspaces } = useBoardStore();
    const board = getActiveBoard();
    const workspace = workspaces.find(item => item.id === activeWorkspaceId);
    const updateNode = useWbsStore(s => s.updateNode);
    const removeNode = useWbsStore(s => s.removeNode);
    const { canEditTask, canDeleteTask } = useBoardPermissions();
    // get nodes from WBS store
    const nodes = useWbsStore(s => s.nodes);

    if (!board || !activeBoardId) return (
        <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50">
            請選擇一個看板
        </div>
    );

    // 收集所有已封存的 TaskNode
    const archivedItems = Object.values(nodes).filter(n => n && n.boardId === activeBoardId && n.isArchived);

    // 依據封存時間排序 (新的在前)
    archivedItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const canEmptyTrash = canDeleteTask && archivedItems.length > 0;
    const targetLabel = `${workspace?.title || '未選擇工作區'} / ${board.title}`;

    const handleRestore = (item: any) => {
        if (!canEditTask) return;
        updateNode(item.id, { isArchived: false, updatedAt: Date.now() });
    };

    const handlePermanentDelete = async (item: any) => {
        if (!canDeleteTask) return;
        const typeName = '任務';
        const confirmMsg = `確定要永久刪除${typeName}「${item.title}」嗎？此動作無法復原！`;
        const confirmed = await useDialogStore.getState().showConfirm(confirmMsg);
        
        if (confirmed) {
            removeNode(item.id);
        }
    };

    const handleEmptyTrash = async () => {
        if (!canEmptyTrash) return;
        const confirmed = await useDialogStore.getState().showConfirm(
            `確定要清空「${board.title}」的目前看板回收桶嗎？將永久刪除 ${archivedItems.length} 筆已刪除任務，且無法復原。`
        );
        
        if (confirmed) {
            archivedItems.forEach(item => {
                removeNode(item.id);
            });
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden" data-recycle-bin-view="current-board">
            {/* Header / Toolbar */}
            <div className="h-14 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        <Trash2 size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 leading-tight">目前看板回收桶</h2>
                        <span className="text-[10px] text-slate-400 font-medium">
                            目標：{targetLabel}。包含此看板已被刪除的任務，直到你手動還原或清空。
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleEmptyTrash}
                        disabled={!canEmptyTrash}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${canEmptyTrash ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-transparent'}`}
                    >
                        <ShieldAlert size={16} />
                        清空回收桶
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="max-w-4xl mx-auto">
                    {archivedItems.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-16 text-center shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-600 mb-2">目前看板沒有已刪除任務。</h3>
                            <p className="text-sm text-slate-400">只有 {board.title} 的已刪除任務會顯示在這裡。</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 p-4 border-b border-slate-100 bg-slate-50/80 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <div className="w-14 text-center">類型</div>
                                <div>名稱</div>
                                <div>原始位置</div>
                                <div className="w-32 text-right">刪除時間</div>
                                <div className="w-24 text-center">操作</div>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {archivedItems.map((item, idx) => (
                                    <div key={`${item.id}-${idx}`} className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-4 py-3 items-center hover:bg-slate-50/80 transition-colors group">
                                        
                                        <div className="w-14 flex justify-center">
                                            <div className={`text-[10px] font-bold px-2 py-1 rounded-full w-full-max text-center border ${
                                                item.nodeType === 'group' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                                'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            }`}>
                                                任務
                                            </div>
                                        </div>

                                        <div className="font-bold text-sm text-slate-700 truncate pr-4" title={item.title}>
                                            {item.title || '(未命名)'}
                                        </div>

                                        <div className="text-xs text-slate-500 truncate pr-4 flex items-center gap-1.5">
                                            <span className="text-slate-400">所在於:</span>
                                            <span className="font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.parentId ? nodes[item.parentId]?.title || '(已知父節點)' : board.title}</span>
                                        </div>

                                        <div className="w-32 text-right text-xs text-slate-400 font-medium whitespace-nowrap font-mono">
                                            {item.updatedAt ? dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm') : '未知'}
                                        </div>

                                        <div className="w-24 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleRestore(item)}
                                                disabled={!canEditTask}
                                                className={`p-1.5 bg-white border border-slate-200 text-slate-400 rounded transition-all shadow-sm ${canEditTask ? 'hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600' : 'cursor-not-allowed opacity-50'}`}
                                                title="還原至原處"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDelete(item)}
                                                disabled={!canDeleteTask}
                                                className={`p-1.5 bg-white border border-slate-200 text-slate-400 rounded transition-all shadow-sm ${canDeleteTask ? 'hover:bg-rose-500 hover:border-rose-500 hover:text-white' : 'cursor-not-allowed opacity-50'}`}
                                                title="永久刪除"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecycleBinView;
