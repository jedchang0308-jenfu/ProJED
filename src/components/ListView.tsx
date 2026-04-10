/**
 * ListView.tsx — 清單模式視圖
 *
 * 設計意圖：
 * 作為所有任務的「底層資料展示位置」，以全版面表格清單呈現
 * 三層任務結構（列表 → 卡片 → 待辦項目），並顯示完整的
 * 狀態、日期與備註欄位。其他視圖（看板/甘特/月曆）皆以
 * 此模式的資料為來源，用不同 UI 呈現。
 *
 * 架構決策：
 * 1. 複用 SharedTaskSidebar 的 dnd-kit 邏輯（拖曳排序）
 * 2. 全版面表格佈局，帶有欄位標頭（名稱、狀態、起始日、截止日、備註）
 * 3. 點擊任務開啟 CardModal（維持現有行為）
 * 4. 狀態篩選器 + 層級篩選器（複用現有邏輯）
 */
import React, { useState, useMemo, useEffect } from 'react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import {
    ChevronDown, ChevronRight, Folder, FileText, Plus,
    GripVertical, AlignLeft, Calendar, Tag, StickyNote, Link,
    X, Trash2, Edit2, ArrowRight
} from 'lucide-react';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';

// ── 狀態樣式對照表 ──────────────────────────────────────────────
const STATUS_CONFIG = {
    todo:      { label: '進行中', dot: 'bg-status-todo',      badge: 'bg-status-todo/10 text-status-todo border-status-todo/30' },
    delayed:   { label: '延遲',   dot: 'bg-status-delayed',   badge: 'bg-status-delayed/10 text-status-delayed border-status-delayed/30' },
    completed: { label: '完成',   dot: 'bg-status-completed', badge: 'bg-status-completed/10 text-status-completed border-status-completed/30' },
    unsure:    { label: '不確定', dot: 'bg-status-unsure',    badge: 'bg-status-unsure/10 text-status-unsure border-status-unsure/30' },
    onhold:    { label: '暫緩',   dot: 'bg-status-onhold',    badge: 'bg-status-onhold/10 text-status-onhold border-status-onhold/30' },
} as const;

// ── 單列可拖曳元件 ────────────────────────────────────────────────
const SortableListRow = ({
    item,
    onClick,
    onAddChild,
    onToggleCollapse,
    isCollapsed,
    dependencySelection,
    onDependencySelect,
    dependencyMarkers,
}: {
    item: any;
    onClick: (item: any) => void;
    onAddChild?: (item: any) => void;
    onToggleCollapse?: (id: string) => void;
    isCollapsed?: boolean;
    dependencySelection?: { id: string; side: 'start' | 'end'; title: string } | null;
    onDependencySelect?: (id: string, side: 'start' | 'end', title: string) => void;
    dependencyMarkers?: Record<string, Array<{ id: string, label: string, role: 'active' | 'passive' }>>;
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        data: { type: item.type, item },
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
    };

    // 各層縮排量
    const indentPx = item.type === 'list' ? 0 : item.type === 'card' ? 24 : 48;
    const statusCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.todo;
    const hasChildren = item.type === 'list' || item.type === 'card';

    const isSelectingMode = !!dependencySelection;
    const isSelfStart = isSelectingMode && dependencySelection.id === item.id && dependencySelection.side === 'start';
    const isSelfEnd = isSelectingMode && dependencySelection.id === item.id && dependencySelection.side === 'end';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-stretch border-b border-slate-100 hover:bg-primary/[0.02] transition-colors
                ${isDragging ? 'opacity-50 bg-slate-100' : ''}
                ${item.type === 'list' ? 'bg-slate-50/80' : 'bg-white'}
                ${isSelectingMode ? 'hover:bg-transparent' : ''}
            `}
        >
            {/* ── 名稱欄（左固定，帶縮排、展開、拖曳把手）── */}
            <div
                className={`flex items-center gap-1 w-[350px] flex-shrink-0 py-1.5 pr-3 cursor-pointer select-none transition-opacity ${isSelectingMode ? 'opacity-50 pointer-events-none' : ''}`}
                style={{ paddingLeft: `${12 + indentPx}px` }}
                onClick={() => onClick(item)}
            >
                {/* 拖曳把手 */}
                <div
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size={13} />
                </div>

                {/* 展開/收疊按鈕 */}
                {hasChildren && onToggleCollapse ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleCollapse(item.id); }}
                        className="flex-shrink-0 p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-all"
                    >
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                ) : (
                    <div className="flex-shrink-0 w-[21px]" />
                )}

                {/* 類型圖示 */}
                <div className="flex-shrink-0 mr-1">
                    {item.type === 'list'      && <Folder   size={13} className="text-primary/60" />}
                    {item.type === 'card'      && <FileText size={12} className="text-slate-400" />}
                    {item.type === 'checklist' && <div className="w-2 h-2 rounded-full border-2 border-slate-300 mt-0.5" />}
                </div>

                {/* 任務名稱 */}
                <span className={`truncate
                    ${item.type === 'list'      ? 'text-[13px] font-black text-slate-800' : ''}
                    ${item.type === 'card'      ? 'text-[12px] font-semibold text-slate-700' : ''}
                    ${item.type === 'checklist' ? 'text-[11px] text-slate-500 italic' : ''}
                `}>
                    {item.title}
                </span>

                {/* 新增子項按鈕 */}
                {hasChildren && onAddChild && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddChild(item); }}
                        className="ml-1 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-primary transition-all flex-shrink-0"
                        title={item.type === 'list' ? '新增卡片' : '新增待辦項目'}
                    >
                        <Plus size={11} />
                    </button>
                )}
            </div>

            {/* ── 狀態欄 ── */}
            <div className={`flex items-center justify-center w-24 flex-shrink-0 border-l border-slate-100 px-2 transition-opacity ${isSelectingMode ? 'opacity-50' : ''}`}>
                {item.status && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                    </span>
                )}
            </div>

            {/* ── 起始日欄 ── */}
            <div 
                className={`flex items-center group/date relative w-36 flex-shrink-0 border-l border-slate-100 px-3 transition-all
                    ${isSelfStart ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                    ${isSelectingMode && !isSelfStart ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
                `}
                onClick={isSelectingMode && !isSelfStart && onDependencySelect ? (e) => { e.stopPropagation(); onDependencySelect(item.id, 'start', item.title); } : undefined}
            >
                <div className="flex items-center gap-1.5 flex-1 pr-4 whitespace-nowrap overflow-hidden">
                    {item.startDate ? (
                        <span className="text-[11px] text-slate-500 font-medium">{item.startDate}</span>
                    ) : (
                        <span className="text-[10px] text-slate-200">—</span>
                    )}
                    {(dependencyMarkers?.[`${item.id}_start`] || []).length > 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            {dependencyMarkers![`${item.id}_start`].map(m => (
                                <span key={m.id} title={m.role === 'active' ? '前置任務 (主動驅動)' : '後置任務 (被動跟隨)'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-bold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-slate-800' : 'bg-slate-400'}`}>
                                    {m.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* 建立依賴按鈕 */}
                {!isDragging && onDependencySelect && !isSelectingMode && (
                     <button
                        onClick={(e) => { e.stopPropagation(); onDependencySelect(item.id, 'start', item.title); }}
                        className="absolute right-1 p-1 rounded-sm text-slate-400 hover:text-amber-600 hover:bg-amber-100 transition-all opacity-0 group-hover/date:opacity-100"
                        title="設定起始日依賴"
                     >
                        <Link size={11} />
                     </button>
                )}
                {isSelectingMode && !isSelfStart && (
                    <div className="absolute right-1 p-1 text-amber-500 opacity-0 group-hover/date:opacity-100 transition-opacity">
                        <Link size={11} />
                    </div>
                )}
            </div>

            {/* ── 截止日欄 ── */}
            <div 
                className={`flex items-center group/date relative w-36 flex-shrink-0 border-l border-slate-100 px-3 transition-all
                    ${isSelfEnd ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                    ${isSelectingMode && !isSelfEnd ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
                `}
                onClick={isSelectingMode && !isSelfEnd && onDependencySelect ? (e) => { e.stopPropagation(); onDependencySelect(item.id, 'end', item.title); } : undefined}
            >
                <div className="flex items-center gap-1.5 flex-1 pr-4 whitespace-nowrap overflow-hidden">
                    {item.endDate ? (
                        <span className={`text-[11px] font-medium ${
                            item.status !== 'completed' && item.endDate < new Date().toISOString().slice(0,10)
                                ? 'text-status-delayed' : 'text-slate-500'
                        }`}>{item.endDate}</span>
                    ) : (
                        <span className="text-[10px] text-slate-200">—</span>
                    )}
                    {(dependencyMarkers?.[`${item.id}_end`] || []).length > 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            {dependencyMarkers![`${item.id}_end`].map(m => (
                                <span key={m.id} title={m.role === 'active' ? '前置任務 (主動驅動)' : '後置任務 (被動跟隨)'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-bold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-slate-800' : 'bg-slate-400'}`}>
                                    {m.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* 建立依賴按鈕 */}
                {!isDragging && onDependencySelect && !isSelectingMode && (
                     <button
                        onClick={(e) => { e.stopPropagation(); onDependencySelect(item.id, 'end', item.title); }}
                        className="absolute right-1 p-1 rounded-sm text-slate-400 hover:text-amber-600 hover:bg-amber-100 transition-all opacity-0 group-hover/date:opacity-100"
                        title="設定截止日依賴"
                     >
                        <Link size={11} />
                     </button>
                )}
                {isSelectingMode && !isSelfEnd && (
                    <div className="absolute right-1 p-1 text-amber-500 opacity-0 group-hover/date:opacity-100 transition-opacity">
                        <Link size={11} />
                    </div>
                )}
            </div>

            {/* ── 備註欄 ── */}
            <div className={`flex items-center flex-1 min-w-[200px] border-l border-slate-100 px-3 overflow-hidden transition-opacity ${isSelectingMode ? 'opacity-50' : ''}`}>
                {item.notes ? (
                    <span className="text-[11px] text-slate-400 truncate italic">{item.notes}</span>
                ) : (
                    <span className="text-[10px] text-slate-200">—</span>
                )}
            </div>
        </div>
    );
};


// ── 主元件 ───────────────────────────────────────────────────────
const ListView = () => {
    const {
        activeWorkspaceId,
        activeBoardId,
        workspaces,
        statusFilters,
        toggleStatusFilter,
        openModal,
        reorderLists,
        moveCardToList,
        reorderCardsInList,
        moveChecklistItemToCard,
        reorderChecklistItems,
        addList,
        addCard,
        addChecklist,
        addChecklistItem,
        updateChecklistItem,
        addDependency,
        removeDependency,
        updateDependency,
    } = useBoardStore();

    const sensors = useDragSensors();
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [activeSortableItem, setActiveSortableItem] = useState<any>(null);
    const [layerFilters, setLayerFilters] = useState({ list: true, card: true, checklist: true });
    
    // 依賴選取狀態
    const [dependencySelection, setDependencySelection] = useState<{ id: string; side: 'start' | 'end'; title: string } | null>(null);
    const [dependencyMenuState, setDependencyMenuState] = useState<{ id: string; side: 'start' | 'end'; title: string } | null>(null);

    // 監聽 ESC 鍵取消選取模式或視窗
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (dependencyMenuState) setDependencyMenuState(null);
                else if (dependencySelection) setDependencySelection(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dependencySelection]);

    const activeWs    = workspaces.find(w => w.id === activeWorkspaceId);
    const activeBoard = activeWs?.boards.find(b => b.id === activeBoardId);

    // 依賴關係標註邏輯 (將所有依賴關係轉換為標籤與角色)
    const dependencyMarkers = useMemo(() => {
        if (!activeBoard) return {};
        
        const getLabel = (index: number) => {
            let label = '';
            let i = index;
            while (i >= 0) {
                label = String.fromCharCode(97 + (i % 26)) + label;
                i = Math.floor(i / 26) - 1;
            }
            return label;
        };

        const markers: Record<string, Array<{ id: string, label: string, role: 'active' | 'passive' }>> = {};

        // 固定排序確保字母不會亂跳
        const sortedDeps = [...(activeBoard.dependencies || [])].sort((a, b) => a.id.localeCompare(b.id));

        sortedDeps.forEach((dep, index) => {
            const label = getLabel(index);
            
            const fromKey = `${dep.fromId}_${dep.fromSide}`;
            if (!markers[fromKey]) markers[fromKey] = [];
            markers[fromKey].push({ id: dep.id, label, role: 'active' });

            const toKey = `${dep.toId}_${dep.toSide}`;
            if (!markers[toKey]) markers[toKey] = [];
            markers[toKey].push({ id: dep.id, label, role: 'passive' });
        });

        return markers;
    }, [activeBoard?.dependencies]);

    const getTaskTitleFromBoard = (id: string) => {
        if (!activeBoard) return '未知項目';
        for (const l of activeBoard.lists) {
            if (l.id === id) return l.title;
            for (const c of l.cards) {
                if (c.id === id) return c.title;
                for (const cl of c.checklists || []) {
                    for (const cli of cl.items || []) {
                        if (cli.id === id) return (cli as any).title || (cli as any).content || '子項目';
                    }
                }
            }
        }
        return '未知項目';
    };

    // 狀態列表（供篩選器按鈕使用）
    const statuses = [
        { key: 'todo',      label: '進行中', color: 'bg-status-todo' },
        { key: 'delayed',   label: '延遲',   color: 'bg-status-delayed' },
        { key: 'completed', label: '完成',   color: 'bg-status-completed' },
        { key: 'unsure',    label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold',    label: '暫緩',   color: 'bg-status-onhold' },
    ] as const;

    // ── 資料扁平化（與 GanttView / CalendarView 邏輯一致）──────────
    const flattenedItems = useMemo(() => {
        if (!activeBoard) return [];
        const items: any[] = [];
        (activeBoard.lists || []).forEach(list => {
            if (list.isArchived) return;
            const listStatus = list.status || 'todo';
            const isListCollapsed = collapsedIds.has(list.id);

            if (layerFilters.list && statusFilters[listStatus as keyof typeof statusFilters]) {
                items.push({ ...list, type: 'list' });
            }
            if (isListCollapsed) return;

            (list.cards || []).forEach(card => {
                if (card.isArchived) return;
                const cardStatus = card.status || 'todo';
                if (!statusFilters[cardStatus as keyof typeof statusFilters]) return;

                const isCardCollapsed = collapsedIds.has(card.id);
                if (layerFilters.card) {
                    items.push({ ...card, type: 'card', listId: list.id });
                }
                if (!isCardCollapsed && layerFilters.checklist) {
                    (card.checklists || []).forEach(cl => {
                        if (cl.isArchived) return;
                        (cl.items || []).forEach(cli => {
                            if (cli.isArchived) return;
                            const cliStatus = cli.status || 'todo';
                            if (!statusFilters[cliStatus as keyof typeof statusFilters]) return;
                            items.push({
                                ...cli, type: 'checklist',
                                listId: list.id, cardId: card.id, checklistId: cl.id,
                                title: cli.title || '未命名項目',
                            });
                        });
                    });
                }
            });
        });
        return items;
    }, [activeBoard, layerFilters, statusFilters, collapsedIds]);

    // ── 展開/收疊 ────────────────────────────────────────────────
    const toggleCollapse = (id: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    // ── 點擊開啟 Modal ────────────────────────────────────────────
    const handleItemClick = (item: any) => {
        if (item.type === 'list') openModal('list', item.id, item.id);
        else if (item.type === 'card') openModal('card', item.id, item.listId);
        else if (item.type === 'checklist') openModal('checklistitem', item.id, item.listId, { cardId: item.cardId, checklistId: item.checklistId });
    };

    // ── 新增子項目 ────────────────────────────────────────────────
    const handleAddList = async () => {
        const title = await useDialogStore.getState().showPrompt('請輸入列表名稱：', '新列表');
        if (title && title.trim()) {
            addList(activeWorkspaceId!, activeBoardId!, title.trim());
        }
    };

    const handleAddChild = async (item: any) => {
        const { showPrompt } = useDialogStore.getState();
        if (item.type === 'list') {
            const title = await showPrompt('請輸入卡片名稱：', '新卡片');
            if (title && title.trim()) {
                addCard(activeWorkspaceId!, activeBoardId!, item.id, title.trim());
            }
        } else if (item.type === 'card') {
            const title = await showPrompt('請輸入待辦項目名稱：', '新項目');
            if (title !== null) {
                let clId = item.checklists?.[0]?.id;
                if (!clId) {
                    addChecklist(activeWorkspaceId!, activeBoardId!, item.listId, item.id);
                    const latestBoard = useBoardStore.getState().getActiveBoard();
                    const latestCard = latestBoard?.lists.find(l => l.id === item.listId)?.cards.find(c => c.id === item.id);
                    clId = latestCard?.checklists?.[0]?.id;
                }
                if (clId) {
                    addChecklistItem(activeWorkspaceId!, activeBoardId!, item.listId, item.id, clId);
                    if (title.trim()) {
                        const updatedBoard = useBoardStore.getState().getActiveBoard();
                        const updatedCard = updatedBoard?.lists.find(l => l.id === item.listId)?.cards.find(c => c.id === item.id);
                        const newestItem = updatedCard?.checklists?.[0]?.items?.slice(-1)[0];
                        if (newestItem) {
                            updateChecklistItem(activeWorkspaceId!, activeBoardId!, item.listId, item.id, clId, newestItem.id, { title: title.trim() });
                        }
                    }
                }
            }
        }
    };

    // ── 拖曳結束處理（與 SharedTaskSidebar 相同邏輯）───────────────
    const handleSortableDragEnd = (event: any) => {
        const { active, over } = event;
        setActiveSortableItem(null);
        if (!over || active.id === over.id || !activeBoard) return;

        const activeItem = active.data.current?.item;
        const overItem   = over.data.current?.item;
        if (!activeItem || !overItem) return;

        if (activeItem.type === 'list') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            reorderLists(activeWorkspaceId!, activeBoardId!, activeItem.id, targetListId);
        } else if (activeItem.type === 'card') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            if (activeItem.listId === targetListId) {
                const targetCardId = overItem.type === 'card' ? overItem.id : (overItem.type === 'checklist' ? overItem.cardId : null);
                if (targetCardId) {
                    reorderCardsInList(activeWorkspaceId!, activeBoardId!, activeItem.listId, activeItem.id, targetCardId);
                } else {
                    moveCardToList(activeWorkspaceId!, activeBoardId!, activeItem.id, activeItem.listId, targetListId, 0);
                }
            } else {
                const targetList = activeBoard.lists.find(l => l.id === targetListId);
                const targetListCards = targetList?.cards || [];
                let targetIndex: number | null = null;
                if (overItem.type === 'card') targetIndex = targetListCards.findIndex(c => c.id === overItem.id);
                else if (overItem.type === 'checklist') targetIndex = targetListCards.findIndex(c => c.id === overItem.cardId) + 1;
                moveCardToList(activeWorkspaceId!, activeBoardId!, activeItem.id, activeItem.listId, targetListId, targetIndex !== -1 ? targetIndex : 0);
            }
        } else if (activeItem.type === 'checklist') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            const targetCardId = overItem.type === 'list' ? null : (overItem.type === 'card' ? overItem.id : overItem.cardId);
            if (!targetCardId) return;

            if (activeItem.cardId === targetCardId) {
                const targetChecklistItemId = overItem.type === 'checklist' ? overItem.id : null;
                if (targetChecklistItemId) {
                    reorderChecklistItems(activeWorkspaceId!, activeBoardId!, activeItem.listId, activeItem.cardId, activeItem.checklistId, activeItem.id, targetChecklistItemId);
                }
            } else {
                const targetList = activeBoard.lists.find(l => l.id === targetListId);
                const targetCard = targetList?.cards?.find(c => c.id === targetCardId);
                const targetChecklist = targetCard?.checklists?.[0];
                const targetItems = targetChecklist?.items || [];
                let targetIndex: number | null = null;
                if (overItem.type === 'checklist') targetIndex = targetItems.findIndex(i => i.id === overItem.id);
                moveChecklistItemToCard(activeWorkspaceId!, activeBoardId!, activeItem.id, activeItem.listId, activeItem.cardId, activeItem.checklistId, targetListId, targetCardId, targetIndex !== -1 ? targetIndex : null);
            }
        }
    };

    // ── 依賴關係設定 ────────────────────────────────────────────────
    const handleDependencySelect = async (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => {
        if (!dependencySelection) {
            // Check if there are dependencies connected to this specific date field
            const hasExisting = (activeBoard?.dependencies || []).some(
                dep => (dep.fromId === targetId && dep.fromSide === targetSide) || 
                       (dep.toId === targetId && dep.toSide === targetSide)
            );
            if (hasExisting) {
                // 如果已經有關聯，開啟管理選單
                setDependencyMenuState({ id: targetId, side: targetSide, title: targetTitle });
            } else {
                // 如果完全沒有關聯，直接進入選取模式
                setDependencySelection({ id: targetId, side: targetSide, title: targetTitle });
            }
        } else {
            // 完成選取
            if (dependencySelection.id === targetId && dependencySelection.side === targetSide) {
                // 不得完全相同 (同任務同端點)
                setDependencySelection(null);
                return;
            }

            const isSelfDependency = dependencySelection.id === targetId;
            const promptMessage = isSelfDependency
                ? `請設定任務 [${dependencySelection.title}] 的執行天數 (將綁定起始與截止日)：\n(注意：單位為「工作天」，偏移 0 代表 1 個工作天，依此類推)`
                : `請設定 [${dependencySelection.title}] 依賴於 [${targetTitle}] 的偏移工作天：\n(正數代表延後，負數代表提前，將自動跳過假日)`;

            const offsetStr = await useDialogStore.getState().showPrompt(
                promptMessage,
                '0'
            );
            
            if (offsetStr !== null && offsetStr.trim() !== '') {
                const offset = parseInt(offsetStr, 10);
                if (!isNaN(offset)) {
                    // dependencySelection 代表要被賦予依賴的任務 (Successor / toId)
                    // target 代表所參考的目標任務 (Predecessor / fromId)
                    addDependency(activeWorkspaceId!, activeBoardId!, {
                        fromId: targetId,
                        fromSide: targetSide,
                        toId: dependencySelection.id,
                        toSide: dependencySelection.side,
                        offset
                    });
                }
            }
            setDependencySelection(null);
        }
    };

    // ── 空狀態畫面 ────────────────────────────────────────────────
    if (!activeBoard) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                請選擇一個看板
            </div>
        );
    }

    // ── 渲染 ──────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            
            {/* ── 依賴管理對話窗 ── */}
            {dependencyMenuState && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setDependencyMenuState(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col m-4" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Link size={16} className="text-primary" />
                                <span>{dependencyMenuState.title} ({dependencyMenuState.side === 'start' ? '起始日' : '截止日'}) 依賴關係設定</span>
                            </h3>
                            <button onClick={() => setDependencyMenuState(null)} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        
                        {/* List */}
                        <div className="p-3 max-h-[50vh] overflow-y-auto bg-slate-50 space-y-2">
                            {(activeBoard?.dependencies || []).filter(dep => 
                                (dep.fromId === dependencyMenuState.id && dep.fromSide === dependencyMenuState.side) || 
                                (dep.toId === dependencyMenuState.id && dep.toSide === dependencyMenuState.side)
                            ).map(dep => {
                                const isSelfPassive = dep.toId === dependencyMenuState.id; // Self is passive if we are the destination of the arrow
                                const otherId = isSelfPassive ? dep.fromId : dep.toId;
                                const otherSide = isSelfPassive ? dep.fromSide : dep.toSide;
                                const otherTitle = getTaskTitleFromBoard(otherId);
                                
                                return (
                                    <div key={dep.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm w-fit ${isSelfPassive ? 'bg-slate-400 text-white' : 'bg-slate-800 text-white'}`}>
                                                    {isSelfPassive ? '被動跟隨' : '主動影響'}
                                                </span>
                                                <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                                    <ArrowRight size={14} className={isSelfPassive ? "text-slate-400" : "text-slate-800"} />
                                                    <span>{otherTitle} ({otherSide === 'start' ? '起始日' : '截止日'})</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 min-w-[60px] text-center">
                                                偏移 {dep.offset || 0} 工作天
                                            </span>
                                            <button 
                                                title="修改天數"
                                                onClick={async () => {
                                                    const res = await useDialogStore.getState().showPrompt(`修改與 [${otherTitle}] 的關聯偏移工作天 (正數延後，負數提前)：`, String(dep.offset || 0));
                                                    if (res !== null && res.trim() !== '') {
                                                        const offset = parseInt(res, 10);
                                                        if (!isNaN(offset)) updateDependency(activeWorkspaceId!, activeBoardId!, dep.id, { offset });
                                                    }
                                                }}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button 
                                                title="解除關聯"
                                                onClick={() => removeDependency(activeWorkspaceId!, activeBoardId!, dep.id)}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-white">
                            <button
                                onClick={() => {
                                    setDependencySelection(dependencyMenuState);
                                    setDependencyMenuState(null);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2 bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <Plus size={16} />
                                <span>在此日期新增另一筆關聯...</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* ── Toolbar ── */}
            <div className="h-12 border-b border-slate-200 bg-white/60 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 gap-4">
                {/* 狀態篩選器 */}
                <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto no-scrollbar py-2 flex-1">
                    {statuses.map(s => (
                        <button
                            key={s.key}
                            onClick={() => toggleStatusFilter(s.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${
                                statusFilters[s.key]
                                    ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                                    : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${s.color}`} />
                            <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* 層級篩選器 */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg flex-shrink-0">
                    {(['list', 'card', 'checklist'] as const).map(key => (
                        <button
                            key={key}
                            onClick={() => setLayerFilters(prev => ({ ...prev, [key]: !prev[key] }))}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                layerFilters[key] ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'
                            }`}
                        >
                            {key === 'list' ? '列表' : key === 'card' ? '卡片' : '待辦'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── 表頭 ── */}
            <div className="flex items-center border-b-2 border-slate-200 bg-slate-50 shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {/* 名稱欄 — 固定寬度留空間給備註 */}
                <div className="flex items-center gap-1.5 w-[350px] flex-shrink-0 px-4 py-2">
                    <AlignLeft size={11} />
                    <span>任務名稱</span>
                </div>
                {/* 固定寬欄 */}
                <div className="flex items-center gap-1.5 w-24 flex-shrink-0 border-l border-slate-200 px-2 py-2 justify-center">
                    <Tag size={11} />
                    <span>狀態</span>
                </div>
                <div className="flex items-center gap-1.5 w-36 flex-shrink-0 border-l border-slate-200 px-3 py-2">
                    <Calendar size={11} />
                    <span>起始日</span>
                </div>
                <div className="flex items-center gap-1.5 w-36 flex-shrink-0 border-l border-slate-200 px-3 py-2">
                    <Calendar size={11} />
                    <span>截止日</span>
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px] border-l border-slate-200 px-3 py-2">
                    <StickyNote size={11} />
                    <span>備註</span>
                </div>
            </div>

            {/* ── 主體（可捲動的任務清單）── */}
            <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar-thin">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={(e) => setActiveSortableItem(e.active.data.current?.item)}
                    onDragEnd={handleSortableDragEnd}
                >
                    <SortableContext
                        items={flattenedItems.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {/* 最小寬度確保欄位在小螢幕不跑版 */}
                        <div className="min-w-[850px]">
                            {flattenedItems.map(item => (
                                <SortableListRow
                                    key={`${item.type}-${item.id}`}
                                    item={item}
                                    onClick={handleItemClick}
                                    onToggleCollapse={toggleCollapse}
                                    isCollapsed={collapsedIds.has(item.id)}
                                    onAddChild={handleAddChild}
                                    dependencySelection={dependencySelection}
                                    onDependencySelect={handleDependencySelect}
                                    dependencyMarkers={dependencyMarkers}
                                />
                            ))}

                            {/* 空白狀態提示 */}
                            {flattenedItems.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                                    <AlignLeft size={36} className="mb-3 opacity-50" />
                                    <p className="text-sm font-medium">目前沒有任務</p>
                                    <p className="text-xs mt-1 opacity-70">請新增列表或調整篩選條件</p>
                                </div>
                            )}
                        </div>
                    </SortableContext>

                    {/* 拖曳預覽層 */}
                    <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                        {activeSortableItem ? (
                            <div className="opacity-95 shadow-xl ring-2 ring-primary/20 bg-white rounded-md overflow-hidden cursor-grabbing min-w-[400px]">
                                <SortableListRow
                                    item={activeSortableItem}
                                    onClick={() => {}}
                                    isCollapsed={collapsedIds.has(activeSortableItem.id)}
                                    dependencySelection={dependencySelection}
                                    dependencyMarkers={dependencyMarkers}
                                />
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>

                {/* ── 新增列表按鈕 ── */}
                <div className="px-4 py-3 min-w-[850px]">
                    <button
                        onClick={handleAddList}
                        className="w-full py-2 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 hover:text-primary hover:bg-primary/5 border border-dashed border-slate-200 hover:border-primary/30 rounded-lg transition-all"
                    >
                        <Plus size={14} />
                        <span>新增列表</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ListView;
