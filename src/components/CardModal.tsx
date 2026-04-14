/**
 * CardModal.tsx — 任務詳情彈出視窗
 *
 * 設計意圖：
 * 1. 顯示任務的名稱、狀態、日期範圍、清單待辦等詳情。
 * 2. 日期若被「依賴關係」鎖定（被動端點），則輸入框不可編輯。
 * 3. 依賴關係的符號（a, b, c...）在日期下方唯讀顯示，修改請至清單模式。
 * 4. 不再包含「設定依賴」功能，此功能已移至 ListView 清單模式。
 */
import { useState, useEffect, useRef } from 'react';
import { X, Calendar, CheckSquare, List as ListIcon, Trash2, Plus, Lock, MoreHorizontal, Share } from 'lucide-react';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import useBoardStore from '../store/useBoardStore';
import dayjs from 'dayjs';
import SortableChecklistItem from './SortableChecklistItem';
import useDialogStore from '../store/useDialogStore';

const CardModal = () => {
    const {
        editingItem,
        closeModal,
        workspaces,
        updateList,
        updateCard,
        addChecklist,
        removeChecklist,
        updateChecklist,
        addChecklistItem,
        updateChecklistItem,
        removeChecklistItem,
        removeCard,
        removeList,
        openModal,
        updateTaskDate
    } = useBoardStore();

    const sensors = useDragSensors();
    const [activeChecklistItem, setActiveChecklistItem] = useState<any>(null);

    // ─── 日期輸入緩衝層 ────────────────────────────────────────────────
    // 設計意圖：日期 input 是「受控輸入」，若直接綁定 store 的值，
    // 則每次 onChange → store 更新 → 元件重渲染 → 輸入框失焦（跳掉）。
    // 解法：用 local state 作為緩衝，onBlur 時才寫入 store。
    const [localStartDate, setLocalStartDate] = useState('');
    const [localEndDate, setLocalEndDate] = useState('');
    const currentItemIdRef = useRef<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handlePinToHome = async () => {
        if (!editingItem) return;
        setIsMenuOpen(false);

        // 此時 URL 已由 useEffect 自動更新為含此任務的 deep link 網址
        const shareUrl = window.location.href;

        // 取得任務名稱（用於分享標題）
        const ws = useBoardStore.getState().workspaces.find(w => w.id === editingItem.workspaceId);
        const board = ws?.boards.find(b => b.id === editingItem.boardId);
        const { type, itemId, listId } = editingItem;
        let taskTitle = 'ProJED 任務';
        if (type === 'card') {
            const list = board?.lists.find(l => l.id === listId);
            const card = list?.cards.find(c => c.id === itemId);
            if (card?.title) taskTitle = card.title;
        } else if (type === 'list') {
            const list = board?.lists.find(l => l.id === itemId);
            if (list?.title) taskTitle = list.title;
        }

        // ① 優先使用 Web Share API（手機原生介面，包含「加到主畫面」選項）
        //    在 PWA 獨立模式下，這是唯一能呼叫系統分享的方式
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `ProJED - ${taskTitle}`,
                    text: `快速開啟任務：${taskTitle}`,
                    url: shareUrl,
                });
            } catch (err) {
                // 使用者取消分享屬於正常操作，不需提示錯誤
                if ((err as Error).name !== 'AbortError') {
                    console.error('[PWA] 分享失敗:', err);
                }
            }
        } else {
            // ② 桌面 / 不支援 Web Share API 的環境：自動複製網址到剪貼板並提示
            try {
                await navigator.clipboard.writeText(shareUrl);
                useDialogStore.getState().showConfirm(
                    '【建立桌面捷徑】\n\n' +
                    '✅ 此任務的專屬連結已複製到剪貼板！\n\n在手機上，請用瀏覽器開啟該連結，再點擊「分享」→「加到主畫面」即可建立捷徑。'
                );
            } catch {
                useDialogStore.getState().showConfirm(
                    '【建立桌面捷徑】\n\n請複製網址列的網址，在手機上用瀏覽器開啟後，點擊「分享」→「加到主畫面」建立捷徑。'
                );
            }
        }
    };
    // ─────────────────────────────────────────────────────────────────

    // 同步 URL 狀態：不管點開哪個任務，網址列都即時跟隨變動 (和 Trello 一樣)
    const hasOpenedRef = useRef(false);
    
    useEffect(() => {
        if (editingItem) {
            hasOpenedRef.current = true;
            const { type, itemId, boardId, workspaceId, listId } = editingItem;
            const url = new URL(window.location.href);
            url.searchParams.set('modal', type);
            url.searchParams.set('itemId', itemId);
            if (listId) {
                url.searchParams.set('listId', listId as string);
            } else {
                url.searchParams.delete('listId');
            }
            url.searchParams.set('boardId', boardId);
            url.searchParams.set('wsId', workspaceId);
            window.history.replaceState(null, '', url.toString());
        } else {
            // Modal 關閉時，清空捷徑參數（僅限曾經打開過的狀況，避免初次載入就洗掉外部捷徑參數）
            if (hasOpenedRef.current) {
                const url = new URL(window.location.href);
                url.searchParams.delete('modal');
                url.searchParams.delete('itemId');
                url.searchParams.delete('listId');
                url.searchParams.delete('boardId');
                url.searchParams.delete('wsId');
                window.history.replaceState(null, '', url.pathname);
            }
        }
    }, [editingItem]);

    // ESC 關閉 Modal
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [closeModal]);

    // 切換任務（itemId 變動）時重置 local date state
    const editingItemId = editingItem?.itemId;
    useEffect(() => {
        if (!editingItemId) return;
        currentItemIdRef.current = editingItemId;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingItemId]);

    if (!editingItem) return null;

    const { type, itemId, boardId, workspaceId } = editingItem;
    // 明確轉型：listId/cardId/checklistId 可能為 undefined，以 '' 額外處理
    const listId = (editingItem.listId as string | undefined) ?? '';
    const cardId = (editingItem.cardId as string | undefined) ?? '';
    const checklistId = (editingItem.checklistId as string | undefined) ?? '';
    const ws = workspaces.find(w => w.id === workspaceId);
    const board = ws?.boards.find(b => b.id === boardId);

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

    // ─── 依賴關係 & 鎖定邏輯 ──────────────────────────────────────────
    const deps = board?.dependencies || [];

    // 「被動端點」：此任務是依賴關係的「目標端」→ 日期由系統控制，鎖定
    const isStartLocked = deps.some(d => d.toId === itemId && d.toSide === 'start');
    const isEndLocked   = deps.some(d => d.toId === itemId && d.toSide === 'end');

    // 依賴字母符號與 ListView 同步：依照 dep.id 排序，a, b, c...
    const allDepsSorted = [...deps].sort((a, b) => a.id.localeCompare(b.id));
    const depCharMap = new Map<string, string>();
    allDepsSorted.forEach((d, i) => {
        depCharMap.set(d.id, String.fromCharCode(97 + i)); // 'a', 'b', 'c'...
    });

    // 取得與這個任務某個 side 有關的所有依賴
    const getDepsForSide = (side: 'start' | 'end') =>
        deps.filter(d =>
            (d.fromId === itemId && d.fromSide === side) ||
            (d.toId   === itemId && d.toSide   === side)
        );

    /**
     * DependencyBadges — 內嵌式字母圓圈得录
     * 設計意圖：小巧房字母圓圈，勇展依賴關係數量與類別，不占版位。
     */
    const DependencyBadges = ({ side }: { side: 'start' | 'end' }) => {
        const sideDeps = getDepsForSide(side);
        // 過濾掉自我任務綁定的主動端 (通常是起始日)，只在被動端 (截止日) 標示
        const filteredDeps = sideDeps.filter(d => !(d.fromId === d.toId && d.fromId === itemId && d.fromSide === side));
        if (filteredDeps.length === 0) return null;
        return (
            <div className="flex items-center gap-0.5 flex-shrink-0">
                {filteredDeps.map(d => {
                    const isSelf = d.fromId === d.toId;
                    const isPassive = d.toId === itemId && d.toSide === side;
                    
                    if (isSelf) {
                        return (
                            <span
                                key={d.id}
                                title="執行天數"
                                className="bg-slate-100 border border-slate-200 text-slate-500 rounded text-[9px] font-bold whitespace-nowrap px-1.5 py-0.5 shadow-sm cursor-help"
                            >
                                {d.offset || 0} 工作天
                            </span>
                        );
                    }

                    const char = depCharMap.get(d.id) || '?';
                    return (
                        <span
                            key={d.id}
                            title={isPassive ? `被動跟隨 (${char})` : `主動影響 (${char})`}
                            className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-black text-white shadow-sm
                                ${isPassive ? 'bg-slate-400' : 'bg-slate-700'}`}
                        >
                            {char}
                        </span>
                    );
                })}
            </div>
        );
    };

    const handleUpdate = (updates: Record<string, any>) => {
        if ('startDate' in updates || 'endDate' in updates) {
            // 設計意圖：updateTaskDate 的 taskType 不含 'checklistitem'，需轉換
            const taskType = type === 'checklistitem' ? 'checklist' : type as 'list' | 'card' | 'checklist';
            updateTaskDate(
                workspaceId,
                boardId,
                taskType,
                itemId,
                updates,
                listId || null,
                cardId || null,
                checklistId || null
            );
        } else {
            if (type === 'card') {
                updateCard(workspaceId, boardId, listId as string, itemId, updates);
            } else if (type === 'list') {
                updateList(workspaceId, boardId, itemId, updates);
            } else if (type === 'checklistitem') {
                updateChecklistItem(workspaceId, boardId, listId as string, cardId as string, checklistId as string, itemId, updates);
            }
        }
    };

    const getProgress = (items: any[] = []) => {
        const activeItems = items.filter(i => !i.isArchived);
        if (activeItems.length === 0) return 0;
        const completed = activeItems.filter(i => i.status === 'completed').length;
        return Math.round((completed / activeItems.length) * 100);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2 md:gap-3">
                        {/* 手機版：左側關閉按鈕 */}
                        <button onClick={closeModal} className="md:hidden p-2 -ml-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-all hover:text-slate-600">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-3 ml-1 md:ml-0">
                            <div className={`w-3 h-3 rounded-full bg-status-${(currentItem as any).status || 'todo'}`}></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                {type === 'list' ? '列表設定' : (type === 'card' ? '卡片詳情' : '待辦事項詳情')}
                            </span>
                        </div>
                    </div>
                    {/* 右側按鈕區 */}
                    <div className="flex items-center gap-1">
                        {/* 設定鈕 (三個點) - 電腦及手機版共用 */}
                        <div className="relative">
                            <button 
                                title="設定" 
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-all hover:text-slate-600"
                            >
                                <MoreHorizontal size={20} />
                            </button>
                            {isMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <button 
                                            className="w-full text-left px-4 py-3 text-sm font-bold text-slate-600 hover:text-primary hover:bg-primary/5 flex items-center gap-3 transition-colors"
                                            onClick={handlePinToHome}
                                        >
                                            <Share size={16} /> 釘選到手機桌面
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        {/* 電腦版：右側關閉按鈕 */}
                        <button onClick={closeModal} className="hidden md:block p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-all hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
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
                            value={(currentItem as any).title}
                            onChange={(e) => handleUpdate({ title: e.target.value })}
                            className="w-full text-2xl font-bold text-slate-800 bg-transparent border-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 -ml-2"
                            placeholder={type === 'list' ? '輸入列表名稱...' : (type === 'card' ? '輸入卡片名稱...' : '輸入事項名稱...')}
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
                                <button onClick={() => openModal('list', list!.id, '')} className="underline decoration-slate-200 hover:text-primary transition-colors">{list?.title}</button>
                                <span>/</span>
                                <button onClick={() => openModal('card', card!.id, list!.id)} className="underline decoration-slate-200 hover:text-primary transition-colors">{card?.title}</button>
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
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${(currentItem as any).status === s
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
                                {/* 起始日 */}
                                <div className="flex-1">
                                    <div className="relative">
                                        <input
                                            type="date"
                                            max="9999-12-31"
                                            value={localStartDate}
                                            disabled={isStartLocked}
                                            onChange={(e) => setLocalStartDate(e.target.value)}
                                            onClick={() => {
                                                if (!localStartDate && !isStartLocked) {
                                                    const today = dayjs().format('YYYY-MM-DD');
                                                    setLocalStartDate(today);
                                                    handleUpdate({ startDate: today });
                                                }
                                            }}
                                            onBlur={(e) => {
                                                if (!isStartLocked && e.target.value !== ((currentItem as any).startDate || '')) {
                                                    handleUpdate({ startDate: e.target.value });
                                                }
                                            }}
                                            title={isStartLocked ? '起始日受依賴關係鎖定，請至清單模式解除依賴後再修改' : ''}
                                            className={`w-full px-3 py-2 border rounded-lg text-sm font-medium transition-all outline-none
                                                ${isStartLocked
                                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-70 pr-7'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-primary/20'
                                                }`}
                                        />
                                        {isStartLocked && (
                                            <Lock size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        )}
                                        {/* 字母圓圈—懸浮於輸入框右上角 */}
                                        <div className="absolute -top-2.5 right-0 flex gap-0.5">
                                            <DependencyBadges side="start" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 text-slate-300">→</div>

                                {/* 截止日 */}
                                <div className="flex-1">
                                    <div className="relative">
                                        <input
                                            type="date"
                                            max="9999-12-31"
                                            value={localEndDate}
                                            disabled={isEndLocked}
                                            onChange={(e) => setLocalEndDate(e.target.value)}
                                            onClick={() => {
                                                if (!localEndDate && !isEndLocked) {
                                                    const today = dayjs().format('YYYY-MM-DD');
                                                    setLocalEndDate(today);
                                                    handleUpdate({ endDate: today });
                                                }
                                            }}
                                            onBlur={(e) => {
                                                if (!isEndLocked && e.target.value !== ((currentItem as any).endDate || '')) {
                                                    handleUpdate({ endDate: e.target.value });
                                                }
                                            }}
                                            title={isEndLocked ? '截止日受依賴關係鎖定，請至清單模式解除依賴後再修改' : ''}
                                            className={`w-full px-3 py-2 border rounded-lg text-sm font-medium transition-all outline-none
                                                ${isEndLocked
                                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-70 pr-7'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-primary/20'
                                                }`}
                                        />
                                        {isEndLocked && (
                                            <Lock size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        )}
                                        {/* 字母圓圈—懸浮於輸入框右上角 */}
                                        <div className="absolute -top-2.5 right-0 flex gap-0.5">
                                            <DependencyBadges side="end" />
                                        </div>
                                    </div>
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
                                    value={(card as any)?.description || ''}
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
                                        if (sourceChecklistId !== targetChecklistId) {
                                            const sourceChecklist = card?.checklists.find(cl => cl.id === sourceChecklistId);
                                            const targetChecklist = card?.checklists.find(cl => cl.id === targetChecklistId);
                                            if (!sourceChecklist || !targetChecklist) return;
                                            const itemToMove = sourceChecklist.items.find(i => i.id === active.id);
                                            if (!itemToMove) return;
                                            const isAlreadyInTarget = targetChecklist.items.some(i => i.id === active.id);
                                            if (!isAlreadyInTarget) {
                                                const newSourceItems = sourceChecklist.items.filter(i => i.id !== active.id);
                                                updateChecklist(workspaceId, boardId, listId, itemId, sourceChecklistId, { items: newSourceItems });
                                                const targetIndex = targetChecklist.items.findIndex(i => i.id === over.id);
                                                const newTargetItems = [...targetChecklist.items];
                                                newTargetItems.splice(targetIndex >= 0 ? targetIndex : newTargetItems.length, 0, itemToMove);
                                                updateChecklist(workspaceId, boardId, listId, itemId, targetChecklistId, { items: newTargetItems });
                                            } else {
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
                                        setActiveChecklistItem(null);
                                        if (!over || active.id === over.id) return;
                                        const activeData = active.data.current;
                                        const overData = over.data.current;
                                        const sourceChecklistId = activeData?.checklistId;
                                        const targetChecklistId = overData?.checklistId;
                                        if (sourceChecklistId === targetChecklistId) {
                                            const cl = card?.checklists.find(cl => cl.id === sourceChecklistId);
                                            if (!cl) return;
                                            const oldIndex = cl.items.findIndex(i => i.id === active.id);
                                            const newIndex = cl.items.findIndex(i => i.id === over.id);
                                            if (oldIndex !== newIndex) {
                                                const newItems = arrayMove(cl.items, oldIndex, newIndex);
                                                updateChecklist(workspaceId, boardId, listId, itemId, sourceChecklistId, { items: newItems });
                                            }
                                        }
                                    }}
                                >
                                    <div className="space-y-4">
                                        {(card?.checklists || []).filter(cl => !cl.isArchived).map((cl) => {
                                            const activeItems = (cl.items || []).filter(i => !i.isArchived);
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
                                                        <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                                            {activeItems.map((cli) => (
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

                                {(card?.checklists || []).filter(cl => !cl.isArchived).length === 0 && (
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
                        onClick={async () => {
                            const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除這${type === 'list' ? '個列表' : (type === 'card' ? '張卡片' : '個待辦事項')}嗎？您可以隨時使用 Ctrl+Z 復原。`);
                            if (confirmed) {
                                if (type === 'list') {
                                    removeList(workspaceId, boardId, itemId);
                                } else if (type === 'card') {
                                    removeCard(workspaceId, boardId, listId, itemId);
                                } else if (type === 'checklistitem') {
                                    removeChecklistItem(workspaceId, boardId, listId, cardId!, checklistId!, itemId);
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
        </div>
    );
};

export default CardModal;
