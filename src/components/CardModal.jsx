import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, CheckSquare, List as ListIcon, Trash2, Plus, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter, pointerWithin } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';
import useBoardStore from '../store/useBoardStore';
import dayjs from 'dayjs';
import SortableChecklistItem from './SortableChecklistItem';

const CardModal = () => {
    const {
        editingItem,
        closeModal,
        workspaces,
        currentView,
        updateList,
        updateCard,
        addChecklist,
        removeChecklist,
        updateChecklist,
        addChecklistItem,
        updateChecklistItem,
        removeChecklistItem,
        removeCard,
        removeList, // 加入 removeList
        openModal,
        addDependency,
        removeDependency,
        updateDependency,
        updateTaskDate // Add this
    } = useBoardStore();

    const sensors = useDragSensors();
    const [searchTerm, setSearchTerm] = useState('');
    const [connectingSide, setConnectingSide] = useState(null); // { itemId?: string, side: 'start' | 'end', title?: string }
    const [tempOffset, setTempOffset] = useState(0);
    const [activeChecklistItem, setActiveChecklistItem] = useState(null); // 拖動中的待辦清單項目

    // ─── 日期輸入緩衝層 ───────────────────────────────────────────────
    // 設計意圖：日期 input 是「受控輸入」，若直接綁定 store 的值，
    // 則每次 onChange → store 更新 → 元件重渲染 → 輸入框失焦（跳掉）。
    // 解法：用 local state 作為緩衝，onChange 只更新 local state（不觸發 re-render 來源的 store 寫入），
    // onBlur 時才寫入 store，同時用 useEffect 監聽外部日期變化（如依賴排程自動調整）並同步回來。
    const [localStartDate, setLocalStartDate] = useState('');
    const [localEndDate, setLocalEndDate] = useState('');
    // 用 ref 追蹤目前 itemId，確保切換不同任務時能重置 local state
    const currentItemIdRef = useRef(null);
    // ─────────────────────────────────────────────────────────────────

    // ESC key handler for closing modals
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (connectingSide) {
                    setConnectingSide(null);
                    setSearchTerm('');
                    setTempOffset(0);
                } else {
                    closeModal();
                }
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [connectingSide, closeModal]);

    // ESC key handler 之前就要完成 local state 初始化
    // 切換任務（itemId 變動）時重置 local date state；
    // 當 store 中的日期被外部更新（如依賴排程自動調整）且使用者沒有在 focus 中時也同步
    const editingItemId = editingItem?.itemId;
    useEffect(() => {
        if (!editingItemId) return;
        // 跨 itemId 切換時，必定重設
        currentItemIdRef.current = editingItemId;
        // 從 workspaces 中重新找日期（而非 currentItem，因為此時 currentItem 可能尚未算好）
        const ws = workspaces.find(w => w.id === editingItem?.workspaceId);
        const board = ws?.boards.find(b => b.id === editingItem?.boardId);
        const { type, listId, cardId, checklistId } = editingItem || {};
        let foundStart = '', foundEnd = '';
        if (board) {
            if (type === 'list') {
                const l = board.lists.find(l => l.id === editingItemId);
                foundStart = l?.startDate || '';
                foundEnd   = l?.endDate   || '';
            } else if (type === 'card') {
                const l = board.lists.find(l => l.id === listId);
                const c = l?.cards.find(c => c.id === editingItemId);
                foundStart = c?.startDate || '';
                foundEnd   = c?.endDate   || '';
            } else if (type === 'checklistitem') {
                const l  = board.lists.find(l => l.id === listId);
                const c  = l?.cards.find(c => c.id === cardId);
                const cl = c?.checklists?.find(cl => cl.id === checklistId);
                const cli = cl?.items?.find(i => i.id === editingItemId);
                foundStart = cli?.startDate || '';
                foundEnd   = cli?.endDate   || '';
            }
        }
        setLocalStartDate(foundStart);
        setLocalEndDate(foundEnd);
    // 只監聽 itemId 變動；外部日期重排時刻意不同步（避免覆蓋使用者正在輸入的值）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingItemId]);

    if (!editingItem) return null;

    const { type, itemId, listId, boardId, workspaceId, cardId, checklistId } = editingItem;
    const ws = workspaces.find(w => w.id === workspaceId);
    const board = ws?.boards.find(b => b.id === boardId);

    // Fetch data based on type
    const list = (type === 'list')
        ? board?.lists.find(l => l.id === itemId)
        : board?.lists.find(l => l.id === listId);

    const card = (type === 'card')
        ? list?.cards.find(c => c.id === itemId)
        : (type === 'checklistitem' ? list?.cards.find(c => c.id === cardId) : null);

    const checklist = type === 'checklistitem'
        ? card?.checklists.find(cl => cl.id === checklistId)
        : null;

    const checklistItem = type === 'checklistitem'
        ? checklist?.items.find(cli => cli.id === itemId)
        : null;

    const currentItem = type === 'list' ? list : (type === 'card' ? card : checklistItem);

    if (!currentItem) return null;

    // Get all potential tasks to link
    const allAvailableTasks = [];
    if (board) {
        (board.lists || []).forEach(l => {
            allAvailableTasks.push({ id: l.id, title: `📁 ${l.title}`, type: 'list' });
            (l.cards || []).forEach(c => {
                if (c.id !== itemId) {
                    allAvailableTasks.push({ id: c.id, title: `📄 ${c.title}`, type: 'card' });
                }
                (c.checklists || []).forEach(cl => {
                    (cl.items || []).forEach(cli => {
                        allAvailableTasks.push({ id: cli.id, title: `• ${cli.title}`, type: 'checklist' });
                    });
                });
            });
        });
    }

    const DependencyTags = ({ targetId, side, onAdd, small = false }) => {
        const deps = (board?.dependencies || []).filter(d =>
            (d.toId === targetId && (d.toSide === side || !d.toSide)) ||
            (d.fromId === targetId && (d.fromSide === side || !d.fromSide))
        );

        if (deps.length === 0) {
            return (
                <button
                    onClick={onAdd}
                    className={`w-full font-bold text-slate-400 border border-dashed border-slate-200 rounded hover:bg-slate-100 hover:text-primary transition-colors flex items-center justify-center gap-1 ${small ? 'py-0.5 text-[7px]' : 'py-1 text-[9px]'
                        }`}
                >
                    <Plus size={small ? 6 : 8} /> 設定依賴
                </button>
            );
        }

        return (
            <div className="flex flex-col gap-1 mt-1">
                {deps.map(d => {
                    const isIncoming = d.toId === targetId && d.toSide === side;
                    const otherId = isIncoming ? d.fromId : d.toId;
                    const otherSide = isIncoming ? d.fromSide : d.toSide;
                    const otherTask = allAvailableTasks.find(t => t.id === otherId);

                    return (
                        <div
                            key={d.id}
                            onClick={onAdd}
                            className="flex items-center justify-between px-2 py-0.5 rounded border border-slate-200 bg-slate-50 shadow-sm group/dep animate-in fade-in slide-in-from-top-1 duration-150 cursor-pointer hover:border-slate-300 transition-colors"
                        >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                    {isIncoming ? '被動' : '主動'}
                                </span>
                                <span className="truncate text-[9px] font-bold text-slate-600 max-w-[80px]">
                                    {otherId === (connectingSide?.itemId || itemId || targetId) ? '自己' : (otherTask?.title.replace(/📁 |📄 |• /, '') || '未知')}
                                </span>
                                <span className="text-[8px] font-black px-1 rounded bg-slate-200 text-slate-600">
                                    {otherSide === 'start' ? '起' : '止'}
                                </span>
                                {d.offset !== 0 && d.offset !== undefined && (
                                    <span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1 rounded border border-slate-200">
                                        {d.offset > 0 ? `+${d.offset}` : d.offset}d
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <div className="flex flex-col opacity-0 group-hover/dep:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => updateDependency(workspaceId, boardId, d.id, { offset: (d.offset || 0) + 1 })}
                                        className="text-[8px] hover:text-slate-600 leading-none"
                                    >▲</button>
                                    <button
                                        onClick={() => updateDependency(workspaceId, boardId, d.id, { offset: (d.offset || 0) - 1 })}
                                        className="text-[8px] hover:text-slate-600 leading-none"
                                    >▼</button>
                                </div>
                                <button
                                    onClick={() => removeDependency(workspaceId, boardId, d.id)}
                                    className="opacity-0 group-hover/dep:opacity-100 text-slate-300 hover:text-red-400 ml-1 transition-all"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleUpdate = (updates) => {
        // 如果是更新日期，使用帶有自動排程的 action
        if (updates.startDate || updates.endDate) {
            updateTaskDate(
                workspaceId,
                boardId,
                type,
                itemId,
                updates,
                listId,
                cardId,
                checklistId
            );
        } else {
            // 其他更新照舊
            if (type === 'card') {
                updateCard(workspaceId, boardId, listId, itemId, updates);
            } else if (type === 'list') {
                updateList(workspaceId, boardId, itemId, updates);
            } else if (type === 'checklistitem') {
                updateChecklistItem(workspaceId, boardId, listId, cardId, checklistId, itemId, updates);
            }
        }
    };

    const getProgress = (items = []) => {
        if (items.length === 0) return 0;
        const completed = items.filter(i => i.status === 'completed').length;
        return Math.round((completed / items.length) * 100);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full bg-status-${currentItem.status || 'todo'}`}></div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {type === 'list' ? '列表設定' : (type === 'card' ? '卡片詳情' : '待辦事項詳情')}
                        </span>
                    </div>
                    <button onClick={closeModal} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-all hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Content Scroll Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    {/* Title Area */}
                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                            {type === 'list' ? '列表名稱' : '卡片名稱'}
                        </label>
                        <input
                            type="text"
                            value={currentItem.title}
                            onChange={(e) => handleUpdate({ title: e.target.value })}
                            className="w-full text-2xl font-bold text-slate-800 bg-transparent border-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 -ml-2"
                            placeholder={type === 'list' ? "輸入列表名稱..." : (type === 'card' ? "輸入卡片名稱..." : "輸入事項名稱...")}
                        />
                        {type === 'card' && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 ml-1">
                                <span>在 </span>
                                <span className="underline decoration-slate-200">{list?.title}</span>
                                <span> 列表內</span>
                            </div>
                        )}
                        {type === 'checklistitem' && (
                            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400 ml-1">
                                <button onClick={() => openModal('list', list.id)} className="underline decoration-slate-200 hover:text-primary transition-colors">{list?.title}</button>
                                <span>/</span>
                                <button onClick={() => openModal('card', card.id, list.id)} className="underline decoration-slate-200 hover:text-primary transition-colors">{card?.title}</button>
                                <span>/</span>
                                <span className="text-slate-500 font-medium">{checklist?.title}</span>
                            </div>
                        )}
                    </section>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Status Selector */}
                        <section className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <ListIcon size={12} /> 狀態
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {['todo', 'delayed', 'completed', 'unsure', 'onhold'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => handleUpdate({ status: s })}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${currentItem.status === s
                                            ? `bg-status-${s} text-white border-transparent shadow-sm scale-105`
                                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                            }`}
                                    >
                                        {s === 'todo' ? '進行中' : s === 'delayed' ? '延遲' : s === 'completed' ? '完成' : s === 'unsure' ? '不確定' : '暫緩'}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Dates Area */}
                        <section className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Calendar size={12} /> 日期範圍
                            </label>
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1.5">
                                    <input
                                        type="date"
                                        max="9999-12-31"
                                        // 設計意圖：value 綁定 local state（非 store），
                                        // 避免每次 onChange -> store 寫入 -> 重新渲染 -> 輸入框失焦的問題
                                        value={localStartDate}
                                        onChange={(e) => setLocalStartDate(e.target.value)}
                                        onBlur={(e) => {
                                            // 離開輸入框時才將日期寫入 store
                                            if (e.target.value !== (currentItem.startDate || '')) {
                                                handleUpdate({ startDate: e.target.value });
                                            }
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    />
                                    {(currentView === 'board' || currentView === 'gantt') && (
                                        <DependencyTags
                                            targetId={itemId}
                                            side="start"
                                            onAdd={() => setConnectingSide({ side: 'start' })}
                                        />
                                    )}
                                </div>
                                <div className="pt-2 text-slate-300">→</div>
                                <div className="flex-1 space-y-1.5">
                                    <input
                                        type="date"
                                        max="9999-12-31"
                                        // 同上：value 綁定 local state，onBlur 才寫入 store
                                        value={localEndDate}
                                        onChange={(e) => setLocalEndDate(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value !== (currentItem.endDate || '')) {
                                                handleUpdate({ endDate: e.target.value });
                                            }
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    />
                                    {(currentView === 'board' || currentView === 'gantt') && (
                                        <DependencyTags
                                            targetId={itemId}
                                            side="end"
                                            onAdd={() => setConnectingSide({ side: 'end' })}
                                        />
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Card-only sections: Description and Checklists */}
                    {type === 'card' && (
                        <>
                            {/* Description */}
                            <section className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">內容描述</label>
                                <textarea
                                    value={card.description || ''}
                                    onChange={(e) => handleUpdate({ description: e.target.value })}
                                    className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-primary focus:bg-white transition-all resize-none"
                                    placeholder="輸入更多詳細資訊..."
                                />
                            </section>

                            {/* Checklists */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <CheckSquare size={12} /> 待辦清單
                                    </label>
                                    <button
                                        onClick={() => addChecklist(workspaceId, boardId, listId, itemId)}
                                        className="text-[10px] font-bold text-primary hover:underline bg-primary/5 px-2 py-1 rounded"
                                    >+ 新增清單</button>
                                </div>

                                {/* 統一的拖動上下文 - 支援跨清單拖動 */}
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={pointerWithin}
                                    onDragStart={(event) => {
                                        const { active } = event;
                                        if (active.data.current?.type === 'checklistitem') {
                                            setActiveChecklistItem(active.data.current.item);
                                        }
                                    }}
                                    onDragOver={(event) => {
                                        const { active, over } = event;
                                        if (!over) return;

                                        const activeData = active.data.current;
                                        const overData = over.data.current;

                                        if (!activeData || !overData) return;

                                        const sourceChecklistId = activeData.checklistId;
                                        const targetChecklistId = overData.checklistId;

                                        // 只在跨清單時處理
                                        if (sourceChecklistId !== targetChecklistId) {
                                            const sourceChecklist = card.checklists.find(cl => cl.id === sourceChecklistId);
                                            const targetChecklist = card.checklists.find(cl => cl.id === targetChecklistId);

                                            if (!sourceChecklist || !targetChecklist) return;

                                            const itemToMove = sourceChecklist.items.find(i => i.id === active.id);
                                            if (!itemToMove) return;

                                            // 檢查項目是否已經在目標清單中
                                            const isAlreadyInTarget = targetChecklist.items.some(i => i.id === active.id);

                                            if (!isAlreadyInTarget) {
                                                // 從來源清單移除
                                                const newSourceItems = sourceChecklist.items.filter(i => i.id !== active.id);
                                                updateChecklist(workspaceId, boardId, listId, itemId, sourceChecklistId, { items: newSourceItems });

                                                // 加入目標清單（插入到 over 項目之前）
                                                const targetIndex = targetChecklist.items.findIndex(i => i.id === over.id);
                                                const newTargetItems = [...targetChecklist.items];
                                                newTargetItems.splice(targetIndex >= 0 ? targetIndex : newTargetItems.length, 0, itemToMove);
                                                updateChecklist(workspaceId, boardId, listId, itemId, targetChecklistId, { items: newTargetItems });
                                            } else {
                                                // 已在目標清單中，只需重新排序
                                                const oldIndex = targetChecklist.items.findIndex(i => i.id === active.id);
                                                const newIndex = targetChecklist.items.findIndex(i => i.id === over.id);
                                                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                                                    const newItems = arrayMove(targetChecklist.items, oldIndex, newIndex);
                                                    updateChecklist(workspaceId, boardId, listId, itemId, targetChecklistId, { items: newItems });
                                                }
                                            }
                                        }
                                    }}
                                    onDragEnd={(event) => {
                                        const { active, over } = event;

                                        // 清除拖動狀態
                                        setActiveChecklistItem(null);

                                        if (!over || active.id === over.id) return;

                                        const activeData = active.data.current;
                                        const overData = over.data.current;

                                        const sourceChecklistId = activeData.checklistId;
                                        const targetChecklistId = overData.checklistId;

                                        if (sourceChecklistId === targetChecklistId) {
                                            // 同清單內排序
                                            const checklist = card.checklists.find(cl => cl.id === sourceChecklistId);
                                            const oldIndex = checklist.items.findIndex(i => i.id === active.id);
                                            const newIndex = checklist.items.findIndex(i => i.id === over.id);
                                            if (oldIndex !== newIndex) {
                                                const newItems = arrayMove(checklist.items, oldIndex, newIndex);
                                                updateChecklist(workspaceId, boardId, listId, itemId, sourceChecklistId, { items: newItems });
                                            }
                                        }
                                        // 跨清單移動已在 onDragOver 中處理
                                    }}
                                >
                                    <div className="space-y-4">
                                        {(card.checklists || []).map((cl) => {
                                            const progress = getProgress(cl.items);
                                            return (
                                                <div key={cl.id} className="space-y-2">
                                                    <div className="flex items-center gap-3">
                                                        <CheckSquare size={16} className="text-primary" />
                                                        <input
                                                            type="text"
                                                            value={cl.title}
                                                            onChange={(e) => updateChecklist(workspaceId, boardId, listId, itemId, cl.id, { title: e.target.value })}
                                                            className="flex-1 font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0 text-sm"
                                                        />
                                                        <button
                                                            onClick={() => removeChecklist(workspaceId, boardId, listId, itemId, cl.id)}
                                                            className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-400 rounded transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3 ml-7">
                                                        <span className="text-[9px] font-bold text-slate-400 w-6">{progress}%</span>
                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                                                        </div>
                                                    </div>
                                                    <div className="ml-7 space-y-0.5">
                                                        <SortableContext items={(cl.items || []).map(i => i.id)} strategy={verticalListSortingStrategy}>
                                                            {(cl.items || []).map((cli) => (
                                                                <SortableChecklistItem
                                                                    key={cli.id}
                                                                    item={cli}
                                                                    workspaceId={workspaceId}
                                                                    boardId={boardId}
                                                                    listId={listId}
                                                                    cardId={itemId}
                                                                    checklistId={cl.id}
                                                                    updateChecklistItem={updateChecklistItem}
                                                                    removeChecklistItem={removeChecklistItem}
                                                                    openModal={openModal}
                                                                />
                                                            ))}
                                                        </SortableContext>
                                                        <button onClick={() => addChecklistItem(workspaceId, boardId, listId, itemId, cl.id)} className="text-[10px] font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1.5 pt-1"><Plus size={12} /> 新增項目</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* 拖動預覽層 */}
                                    <DragOverlay>
                                        {activeChecklistItem ? (
                                            <div className="flex items-center gap-2 bg-white shadow-2xl rounded-lg px-3 py-2 border-2 border-primary/30 opacity-95">
                                                <input
                                                    type="checkbox"
                                                    checked={activeChecklistItem.status === 'completed'}
                                                    readOnly
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-primary pointer-events-none"
                                                />
                                                <span className={`text-xs font-medium ${activeChecklistItem.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                                    {activeChecklistItem.title || '待辦事項內容...'}
                                                </span>
                                            </div>
                                        ) : null}
                                    </DragOverlay>
                                </DndContext>

                                {(card.checklists || []).length === 0 && (
                                    <div className="p-8 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-300 text-sm gap-2">
                                        <CheckSquare size={32} className="opacity-20" />
                                        這裡還沒有待辦清單，點擊上方新增一個。
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button
                        onClick={() => {
                            if (confirm(`確定要刪除這${type === 'list' ? '個列表' : (type === 'card' ? '張卡片' : '個待辦事項')}嗎？您可以隨時使用 Ctrl+Z 復原。`)) {
                                if (type === 'list') {
                                    removeList(workspaceId, boardId, itemId);
                                } else if (type === 'card') {
                                    removeCard(workspaceId, boardId, listId, itemId);
                                } else if (type === 'checklistitem') {
                                    removeChecklistItem(workspaceId, boardId, listId, cardId, checklistId, itemId);
                                }
                                closeModal();
                            }
                        }}
                        className="flex items-center gap-2 text-red-500 hover:bg-red-50 text-xs font-bold px-4 py-2 rounded-xl transition-all border border-transparent hover:border-red-100"
                    >
                        <Trash2 size={16} /> 刪除{type === 'list' ? '列表' : (type === 'card' ? '卡片' : '待辦項目')}
                    </button>
                    <div className="flex gap-2">
                        <button onClick={closeModal} className="btn-outline text-xs px-5 py-2 rounded-xl">取消</button>
                        <button onClick={closeModal} className="btn-primary text-xs px-6 py-2 rounded-xl shadow-md font-bold">儲存並關閉</button>
                    </div>
                </div>
            </div>

            {/* Dependency Selection Modal - 支援看板與甘特圖模式 */}
            {(currentView === 'board' || currentView === 'gantt') && connectingSide && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-primary/20">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs font-bold text-slate-600 truncate max-w-[80%] uppercase tracking-wider">
                                🔗 依賴設定：{connectingSide.title || currentItem.title}
                            </span>
                            <button
                                onClick={() => { setConnectingSide(null); setSearchTerm(''); setTempOffset(0); }}
                                className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-all hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">依賴位移 (天)</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setTempOffset(prev => prev - 1)} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:text-primary transition-colors text-xs font-bold w-8 h-8 flex items-center justify-center shadow-sm">-</button>
                                    <input
                                        type="number"
                                        value={tempOffset}
                                        onChange={(e) => setTempOffset(parseInt(e.target.value) || 0)}
                                        className="w-12 text-center bg-transparent border-none font-bold text-sm focus:ring-0"
                                    />
                                    <button onClick={() => setTempOffset(prev => prev + 1)} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:text-primary transition-colors text-xs font-bold w-8 h-8 flex items-center justify-center shadow-sm">+</button>
                                </div>
                                <span className="text-[9px] text-slate-400 flex-1 italic text-right">
                                    {tempOffset === 0 ? '無位移' : `${tempOffset > 0 ? '晚' : '早'} ${Math.abs(tempOffset)} 天`}
                                </span>
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="搜尋要指定的列表、卡片或待辦項目..."
                                    className="w-full text-sm border border-slate-200 rounded-xl p-3 pl-10 focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-slate-50 focus:bg-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Plus size={16} />
                                </div>
                            </div>

                            <div className="max-h-[300px] overflow-y-auto bg-white border border-slate-100 rounded-xl divide-y divide-slate-50 no-scrollbar">
                                {/* Special "Self" Option */}
                                <div className="p-2 px-3 flex items-center justify-between gap-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200 group sticky top-0 z-10 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-xs font-black text-slate-600">依賴當前任務 (自己)</span>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => {
                                                const newType = 'ss'; // start-to-start
                                                addDependency(workspaceId, boardId, {
                                                    fromId: connectingSide.itemId || itemId, fromSide: 'start',
                                                    toId: connectingSide.itemId || itemId, toSide: connectingSide.side,
                                                    offset: tempOffset,
                                                    type: newType
                                                });
                                                setConnectingSide(null);
                                                setSearchTerm('');
                                                setTempOffset(0);
                                            }}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[10px] font-black text-slate-600 rounded-lg border border-slate-200 hover:border-slate-300 transition-all shadow-sm whitespace-nowrap"
                                        >依賴其「起始」</button>
                                        <button
                                            onClick={() => {
                                                const newType = connectingSide.side === 'start' ? 'fs' : 'ff';
                                                addDependency(workspaceId, boardId, {
                                                    fromId: connectingSide.itemId || itemId, fromSide: 'end',
                                                    toId: connectingSide.itemId || itemId, toSide: connectingSide.side,
                                                    offset: tempOffset,
                                                    type: newType
                                                });
                                                setConnectingSide(null);
                                                setSearchTerm('');
                                                setTempOffset(0);
                                            }}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[10px] font-black text-slate-600 rounded-lg border border-slate-200 hover:border-slate-300 transition-all shadow-sm whitespace-nowrap"
                                        >依賴其「完成」</button>
                                    </div>
                                </div>

                                {allAvailableTasks
                                    .filter(t => t.id !== (connectingSide.itemId || itemId) && t.title.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(t => (
                                        <div key={t.id} className="p-2 px-3 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors group">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span className="text-xs font-bold text-slate-700 truncate">{t.title}</span>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => {
                                                        const newType = connectingSide.side === 'start' ? 'ss' : 'sf';
                                                        addDependency(workspaceId, boardId, {
                                                            fromId: t.id, fromSide: 'start',
                                                            toId: connectingSide.itemId || itemId, toSide: connectingSide.side,
                                                            offset: tempOffset,
                                                            type: newType
                                                        });
                                                        setConnectingSide(null);
                                                        setSearchTerm('');
                                                        setTempOffset(0);
                                                    }}
                                                    className="px-3 py-1.5 bg-white hover:bg-primary/5 text-[10px] font-black text-slate-500 hover:text-primary rounded-lg border border-slate-200 hover:border-primary/20 transition-all shadow-sm whitespace-nowrap"
                                                >依賴其「起始」</button>
                                                <button
                                                    onClick={() => {
                                                        const newType = connectingSide.side === 'start' ? 'fs' : 'ff';
                                                        addDependency(workspaceId, boardId, {
                                                            fromId: t.id, fromSide: 'end',
                                                            toId: connectingSide.itemId || itemId, toSide: connectingSide.side,
                                                            offset: tempOffset,
                                                            type: newType
                                                        });
                                                        setConnectingSide(null);
                                                        setSearchTerm('');
                                                        setTempOffset(0);
                                                    }}
                                                    className="px-3 py-1.5 bg-white hover:bg-primary/5 text-[10px] font-black text-slate-500 hover:text-primary rounded-lg border border-slate-200 hover:border-primary/20 transition-all shadow-sm whitespace-nowrap"
                                                >依賴其「完成」</button>
                                            </div>
                                        </div>
                                    ))}
                                {allAvailableTasks.filter(t => t.id !== (connectingSide.itemId || itemId) && t.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                    <div className="p-8 text-center text-slate-400 text-xs italic">找不到符合的任務...</div>
                                )}
                            </div>
                        </div>

                        {/* Dependency Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <button
                                onClick={() => {
                                    if (confirm('確定要清除此端點的所有依賴連結嗎？')) {
                                        const sideToClear = connectingSide.side;
                                        const idToClear = connectingSide.itemId || itemId;
                                        const relatedDeps = (board?.dependencies || []).filter(d =>
                                            (d.toId === idToClear && d.toSide === sideToClear) ||
                                            (d.fromId === idToClear && d.fromSide === sideToClear)
                                        );
                                        relatedDeps.forEach(d => removeDependency(workspaceId, boardId, d.id));
                                        setConnectingSide(null);
                                        setSearchTerm('');
                                        setTempOffset(0);
                                    }
                                }}
                                className="flex items-center gap-2 text-red-500 hover:bg-red-50 text-xs font-bold px-4 py-2 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                                <Trash2 size={16} /> 清除此端所有依賴
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setConnectingSide(null); setSearchTerm(''); setTempOffset(0); }}
                                    className="btn-outline text-xs px-5 py-2 rounded-xl"
                                >取消</button>
                                <button
                                    onClick={() => { setConnectingSide(null); setSearchTerm(''); setTempOffset(0); }}
                                    className="btn-primary text-xs px-6 py-2 rounded-xl shadow-md font-bold"
                                >儲存並關閉</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CardModal;
