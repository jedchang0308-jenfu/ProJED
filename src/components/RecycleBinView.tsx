import React from 'react';
import { Trash2, RotateCcw, ShieldAlert } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import dayjs from 'dayjs';

const RecycleBinView = () => {
    const { 
        getActiveBoard, activeWorkspaceId, 
        restoreList, restoreCard, restoreChecklist, restoreChecklistItem,
        permanentDeleteList, permanentDeleteCard, permanentDeleteChecklist, permanentDeleteChecklistItem 
    } = useBoardStore();
    const board = getActiveBoard();

    if (!board) return (
        <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50">
            請選擇一個看板
        </div>
    );

    // 收集所有已封存的 List 與 Card
    const archivedItems = [];

    (board.lists || []).forEach(list => {
        if (list.isArchived) {
            archivedItems.push({
                type: 'list',
                id: list.id,
                title: list.title,
                archivedAt: list.archivedAt,
                parentId: board.id,
                parentTitle: board.title,
                item: list
            });
        }
        
        (list.cards || []).forEach(card => {
            if (card.isArchived) {
                archivedItems.push({
                    type: 'card',
                    id: card.id,
                    title: card.title,
                    archivedAt: card.archivedAt,
                    parentId: list.id,
                    parentTitle: list.title,
                    item: card
                });
            }

            (card.checklists || []).forEach(cl => {
                if (cl.isArchived) {
                    archivedItems.push({
                        type: 'checklist',
                        id: cl.id,
                        title: cl.title,
                        archivedAt: cl.archivedAt,
                        parentId: card.id,
                        parentListId: list.id,
                        parentTitle: card.title,
                        item: cl
                    });
                }

                (cl.items || []).forEach(cli => {
                    if (cli.isArchived) {
                        archivedItems.push({
                            type: 'checklistitem',
                            id: cli.id,
                            title: cli.title,
                            archivedAt: cli.archivedAt,
                            parentId: cl.id,
                            parentCardId: card.id,
                            parentListId: list.id,
                            parentTitle: cl.title,
                            item: cli
                        });
                    }
                });
            });
        });
    });

    // 依據封存時間排序 (新的在前)
    archivedItems.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));

    const handleRestore = (item) => {
        if (item.type === 'list') {
            restoreList(activeWorkspaceId, board.id, item.id);
        } else if (item.type === 'card') {
            restoreCard(activeWorkspaceId, board.id, item.parentId, item.id);
        } else if (item.type === 'checklist') {
            restoreChecklist(activeWorkspaceId, board.id, item.parentListId, item.parentId, item.id);
        } else if (item.type === 'checklistitem') {
            restoreChecklistItem(activeWorkspaceId, board.id, item.parentListId, item.parentCardId, item.parentId, item.id);
        }
    };

    const handlePermanentDelete = async (item) => {
        const typeName = item.type === 'list' ? '列表' : (item.type === 'card' ? '卡片' : (item.type === 'checklist' ? '待辦清單' : '待辦項目'));
        const confirmMsg = `確定要永久刪除${typeName}「${item.title}」嗎？此動作無法復原！`;
        const confirmed = await useDialogStore.getState().showConfirm(confirmMsg);
        
        if (confirmed) {
            if (item.type === 'list') {
                permanentDeleteList(activeWorkspaceId, board.id, item.id);
            } else if (item.type === 'card') {
                permanentDeleteCard(activeWorkspaceId, board.id, item.parentId, item.id);
            } else if (item.type === 'checklist') {
                permanentDeleteChecklist(activeWorkspaceId, board.id, item.parentListId, item.parentId, item.id);
            } else if (item.type === 'checklistitem') {
                permanentDeleteChecklistItem(activeWorkspaceId, board.id, item.parentListId, item.parentCardId, item.parentId, item.id);
            }
        }
    };

    const handleEmptyTrash = async () => {
        if (archivedItems.length === 0) return;
        const confirmed = await useDialogStore.getState().showConfirm('您確定要「清空」資源回收桶嗎？所有項目都會被永久刪除且無法復原！');
        
        if (confirmed) {
            archivedItems.forEach(item => {
                if (item.type === 'list') {
                    permanentDeleteList(activeWorkspaceId, board.id, item.id);
                } else if (item.type === 'card') {
                    permanentDeleteCard(activeWorkspaceId, board.id, item.parentId, item.id);
                } else if (item.type === 'checklist') {
                    permanentDeleteChecklist(activeWorkspaceId, board.id, item.parentListId, item.parentId, item.id);
                } else if (item.type === 'checklistitem') {
                    permanentDeleteChecklistItem(activeWorkspaceId, board.id, item.parentListId, item.parentCardId, item.parentId, item.id);
                }
            });
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
            {/* Header / Toolbar */}
            <div className="h-14 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                        <Trash2 size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 leading-tight">資源回收桶</h2>
                        <span className="text-[10px] text-slate-400 font-medium">包含已被刪除的列表與卡片。它們將保留於此直到您手動清空。</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleEmptyTrash}
                        disabled={archivedItems.length === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${archivedItems.length > 0 ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-transparent'}`}
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
                            <h3 className="text-lg font-bold text-slate-600 mb-2">資源回收桶是空的</h3>
                            <p className="text-sm text-slate-400">所有被刪除的任務與列表都會寄放在這裡。</p>
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
                                    <div key={`${item.type}-${item.id}-${idx}`} className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-4 py-3 items-center hover:bg-slate-50/80 transition-colors group">
                                        
                                        <div className="w-14 flex justify-center">
                                            <div className={`text-[10px] font-bold px-2 py-1 rounded-full w-full-max text-center border ${
                                                item.type === 'list' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                                item.type === 'card' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                item.type === 'checklist' ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                                'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {item.type === 'list' ? '列表' : (item.type === 'card' ? '卡片' : (item.type === 'checklist' ? '待辦清單' : '待辦項目'))}
                                            </div>
                                        </div>

                                        <div className="font-bold text-sm text-slate-700 truncate pr-4" title={item.title}>
                                            {item.title || '(未命名)'}
                                        </div>

                                        <div className="text-xs text-slate-500 truncate pr-4 flex items-center gap-1.5" title={item.parentTitle}>
                                            <span className="text-slate-400">所在於:</span>
                                            <span className="font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.parentTitle || '(未知)'}</span>
                                        </div>

                                        <div className="w-32 text-right text-xs text-slate-400 font-medium whitespace-nowrap font-mono">
                                            {item.archivedAt ? dayjs(item.archivedAt).format('YYYY-MM-DD HH:mm') : '未知'}
                                        </div>

                                        <div className="w-24 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleRestore(item)}
                                                className="p-1.5 bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 text-slate-400 rounded transition-all shadow-sm"
                                                title="還原至原處"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDelete(item)}
                                                className="p-1.5 bg-white border border-slate-200 hover:bg-rose-500 hover:border-rose-500 hover:text-white text-slate-400 rounded transition-all shadow-sm"
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
