// @ts-nocheck
import React from 'react';
import { Trash2, RotateCcw, ShieldAlert } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useDialogStore from '../store/useDialogStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import dayjs from 'dayjs';
import { toast } from '../store/useToastStore';

const RecycleBinView = () => {
    const { getActiveBoard, activeWorkspaceId, activeBoardId, workspaces } = useBoardStore();
    const board = getActiveBoard();
    const workspace = workspaces.find(item => item.id === activeWorkspaceId);
    const updateNode = useWbsStore(s => s.updateNode);
    const permanentlyDeleteNodes = useWbsStore(s => s.permanentlyDeleteNodes);
    const { canEditTask, canDeleteTask } = useBoardPermissions();
    // get nodes from WBS store
    const nodes = useWbsStore(s => s.nodes);
    const parentNodesIndex = useWbsStore(s => s.parentNodesIndex);
    const [isDeleting, setIsDeleting] = React.useState(false);

    if (!board || !activeBoardId) return (
        <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50">
            請選擇一個看板
        </div>
    );

    // 收集所有已封存的 TaskNode
    const archivedItems = Object.values(nodes).filter(n => n && n.boardId === activeBoardId && n.isArchived);

    // 依據封存時間排序 (新的在前)
    archivedItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const canEmptyTrash = canDeleteTask && archivedItems.length > 0 && !isDeleting;
    const targetLabel = `${workspace?.title || '未選擇工作區'} / ${board.title}`;

    const collectPermanentDeleteScope = (rootIds: string[]) => {
        const scope = new Set<string>();
        rootIds.forEach(rootId => {
            const root = nodes[rootId];
            if (!root) return;
            const pending = [rootId];
            while (pending.length > 0) {
                const nodeId = pending.pop();
                if (!nodeId || scope.has(nodeId)) continue;
                const node = nodes[nodeId];
                if (!node || node.workspaceId !== root.workspaceId || node.boardId !== root.boardId) continue;
                scope.add(nodeId);
                (parentNodesIndex[nodeId] || []).forEach(childId => pending.push(childId));
            }
        });
        return scope;
    };

    const handleRestore = (item: any) => {
        if (!canEditTask) return;
        updateNode(item.id, { isArchived: false, updatedAt: Date.now() });
    };

    const handlePermanentDelete = async (item: any) => {
        if (!canDeleteTask || isDeleting) return;
        const deleteCount = collectPermanentDeleteScope([item.id]).size;
        const scopeText = deleteCount > 1 ? `及其 ${deleteCount - 1} 個子任務` : '';
        const confirmMsg = `確定要永久刪除任務「${item.title || '未命名任務'}」${scopeText}嗎？此動作無法復原。`;
        const confirmed = await useDialogStore.getState().showConfirm(confirmMsg);
        if (!confirmed) return;

        setIsDeleting(true);
        try {
            const removedCount = await permanentlyDeleteNodes([item.id]);
            toast.success(`已永久刪除 ${removedCount} 筆任務。`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '永久刪除失敗，封存任務仍保留在回收桶。');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleEmptyTrash = async () => {
        if (!canEmptyTrash) return;
        const deleteCount = collectPermanentDeleteScope(archivedItems.map(item => item.id)).size;
        const confirmed = await useDialogStore.getState().showConfirm(
            `確定要清空「${board.title}」的目前看板回收桶嗎？將永久刪除 ${deleteCount} 筆封存任務，且無法復原。`
        );
        if (!confirmed) return;

        setIsDeleting(true);
        try {
            const removedCount = await permanentlyDeleteNodes(archivedItems.map(item => item.id));
            toast.success(`已永久刪除 ${removedCount} 筆任務。`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '清空回收桶失敗，未完成的封存項目仍保留。');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden" data-recycle-bin-view="current-board">
            {/* Header / Toolbar */}
            <div className="min-h-14 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between gap-3 px-3 py-2 sm:px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        <Trash2 size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 leading-tight">目前看板回收桶</h2>
                        <span className="hidden text-[10px] text-slate-400 font-medium sm:block">
                            目標：{targetLabel}。封存任務可還原；永久刪除後無法復原。
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
                        <span className="hidden sm:inline">清空回收桶</span>
                        <span className="sm:hidden">清空</span>
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="max-w-4xl mx-auto">
                    {archivedItems.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-16 text-center shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-600 mb-2">目前看板沒有封存任務。</h3>
                            <p className="text-sm text-slate-400">只有 {board.title} 的封存任務會顯示在這裡。</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="hidden sm:grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 p-4 border-b border-slate-100 bg-slate-50/80 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <div className="w-14 text-center">類型</div>
                                <div>名稱</div>
                                <div>原始位置</div>
                                <div className="w-32 text-right">封存時間</div>
                                <div className="w-24 text-center">操作</div>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {archivedItems.map((item, idx) => (
                                    <div key={`${item.id}-${idx}`} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[auto_1fr_1fr_auto_auto] gap-3 sm:gap-4 px-3 sm:px-4 py-3 items-center hover:bg-slate-50/80 transition-colors group">
                                        
                                        <div className="hidden w-14 sm:flex justify-center">
                                            <div className={`text-[10px] font-bold px-2 py-1 rounded-full w-full-max text-center border ${
                                                item.nodeType === 'group' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                                'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            }`}>
                                                任務
                                            </div>
                                        </div>

                                        <div className="min-w-0 pr-2 sm:pr-4" title={item.title}>
                                            <div className="truncate text-sm font-bold text-slate-700">{item.title || '(未命名)'}</div>
                                            <div className="mt-0.5 text-[11px] font-medium text-slate-400 sm:hidden">
                                                {item.updatedAt ? dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm') : '封存時間未知'}
                                            </div>
                                        </div>

                                        <div className="hidden text-xs text-slate-500 truncate pr-4 sm:flex items-center gap-1.5">
                                            <span className="text-slate-400">所在於:</span>
                                            <span className="font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.parentId ? nodes[item.parentId]?.title || '(已知父節點)' : board.title}</span>
                                        </div>

                                        <div className="hidden w-32 text-right text-xs text-slate-400 font-medium whitespace-nowrap font-mono sm:block">
                                            {item.updatedAt ? dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm') : '未知'}
                                        </div>

                                        <div className="w-20 sm:w-24 flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => handleRestore(item)}
                                                disabled={!canEditTask || isDeleting}
                                                className={`p-1.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${canEditTask ? 'hover:border-emerald-300 hover:bg-emerald-100' : ''}`}
                                                title="還原至原處"
                                                aria-label={`還原任務 ${item.title || '未命名任務'}`}
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDelete(item)}
                                                disabled={!canDeleteTask || isDeleting}
                                                className={`p-1.5 rounded border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${canDeleteTask ? 'hover:border-rose-500 hover:bg-rose-500 hover:text-white' : ''}`}
                                                title="永久刪除"
                                                aria-label={`永久刪除任務 ${item.title || '未命名任務'}`}
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
