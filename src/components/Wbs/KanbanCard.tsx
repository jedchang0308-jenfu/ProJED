/**
 * KanbanCard — 渲染 WBS Level 2 節點為可拖曳的 Kanban 任務卡
 * 設計意圖：取代舊版 Card.tsx，資料來源改為 useWbsStore 的 TaskNode。
 * 卡片內部嵌入 KanbanChecklist 以遞迴呈現 Level 3+ 的下層任務。
 * 
 * 【編輯功能】點擊卡片標題可行內編輯任務名稱，Enter 或失焦即儲存，ESC 取消。
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, CheckSquare, ChevronDown, ChevronRight, ListPlus, Link } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanChecklist } from './KanbanChecklist';
import { KanbanDependencyContext } from '../BoardView';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { useLongPress } from '../../hooks/useLongPress';
import dayjs from 'dayjs';
import type { TaskStatus } from '../../types';
import { TaskDragHandle } from './TaskDragHandle';

interface KanbanCardProps {
  nodeId: string;       // Level 2 TaskNode 的 ID
  columnId: string;     // 所屬的 Level 1 列表 ID（用於 DnD 跨列識別）
  previewNodes?: Record<string, any> | null;
  previewParentIndex?: Record<string, string[]> | null;
}

/** 狀態色彩對應 */
const statusTextColorMap: Record<TaskStatus, string> = {
  todo: 'text-slate-600',
  in_progress: 'text-blue-600',
  completed: 'text-emerald-500',
  delayed: 'text-orange-500',
  unsure: 'text-purple-500',
  onhold: 'text-slate-400',
};

const isFromTaskDragHandle = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('[data-task-drag-handle="true"]'));

export const KanbanCard: React.FC<KanbanCardProps> = ({ nodeId, columnId, previewNodes, previewParentIndex }) => {
  const storeNode = useWbsStore(s => s.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const progress = useWbsStore(s => s.getNodeProgress(nodeId));
  const updateNode = useWbsStore(s => s.updateNode);
  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const isEndDateEffectivelyLocked = lockStatus.endLocked || node?.isDurationLocked;
  const showStartDate = useBoardStore(s => s.showStartDate);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;
  // 行內編輯狀態
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);
  const { active, over } = useDndContext();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId;

  // 進入編輯模式時自動聚焦並全選文字
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  /** 開始編輯：儲存目前標題做為初始值 */
  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(node?.title || '');
    setIsEditing(true);
  };

  /** 儲存變更：trimmed 後若有內容才更新，空字串不儲存 */
  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node?.title) {
      updateNode(nodeId, { title: trimmed, updatedAt: Date.now() });
    }
    setIsEditing(false);
  };

  /** 鍵盤事件：Enter 儲存，ESC 取消 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // 訂閱子節點 (Level 3) ID 陣列，用於顯示進度統計
  const storeChildIds = useWbsStore(s => s.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;

  // 計算子節點的完成數量
  const childStats = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;
    const children = (childIds || [])
      .map(id => nodes[id])
      .filter(n => n && !n.isArchived);
    const total = children.length;
    const completed = children.filter(c => c.status === 'completed').length;
    return { total, completed };
  }, [childIds, previewNodes]);
  const hasChildren = childStats.total > 0;

  // dnd-kit 拖動邏輯（此卡片可被拖動）
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: nodeId,
    data: {
      type: 'wbs-card',
      nodeId,
      columnId,  // 讓 DragEnd 知道此卡片來自哪一列
    }
  });

  // 此卡片同時是放置區：可接收 wbs-checklist 或 wbs-card 的拖入（降級操作）
  // 使用獨立 id `${nodeId}-card-drop` 區分「被拖動中的卡片」和「作為放置區的卡片」
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${nodeId}-card-drop`,
    disabled: activeType === 'wbs-card',
    data: {
      type: 'wbs-card-drop',
      nodeId,
      columnId,
    },
  });

  const { setNodeRef: setChecklistDropRef, isOver: isChecklistDropOver } = useDroppable({
    id: `${nodeId}-checklist-drop`,
    disabled: !['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType || '') || activeNodeId === nodeId,
    data: {
      type: 'wbs-checklist-drop',
      nodeId,
      columnId,
    },
  });

  const { setNodeRef: setChecklistAreaDropRef, isOver: isChecklistAreaDropOver } = useDroppable({
    id: `${nodeId}-checklist-area-drop`,
    disabled: !hasChildren || activeType === 'wbs-checklist' || !['wbs-column', 'wbs-card'].includes(activeType || '') || activeNodeId === nodeId,
    data: {
      type: 'wbs-checklist-drop',
      nodeId,
      columnId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const status = node?.status || 'todo';
  const isDueToday = status !== 'completed' && !!node?.endDate && dayjs(node.endDate).isSame(dayjs(), 'day');
  const canDropIntoChecklist = ['wbs-column', 'wbs-card'].includes(activeType || '') && activeNodeId !== nodeId;
  const showChecklistDropZone = canDropIntoChecklist && !hasChildren;
  const overData = over?.data.current;
  const overNodeId = overData?.nodeId;
  const isOverChecklistDescendant = (() => {

    if (activeType !== 'wbs-checklist' || overData?.type !== 'wbs-checklist' || !overNodeId) {
      return false;
    }

    const nodes = previewNodes || useWbsStore.getState().nodes;
    let current = nodes[overNodeId]?.parentId;
    const visited = new Set<string>();

    while (current) {
      if (current === nodeId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      current = nodes[current]?.parentId || null;
    }

    return false;
  })();
  const isChecklistTargeted = isChecklistAreaDropOver || isChecklistDropOver || isOverChecklistDescendant;

  // 合併兩個 ref：讓同一個 DOM 元素同時具備「可拖動」和「可放置」的能力
  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    setNodeRef(el);
    setDropRef(el);
  }, [setNodeRef, setDropRef]);

  // 手機長按開啟右鍵選單（500ms，長於拖曳的 250ms，移動超過 8px 則取消）
  const longPressHandlers = useLongPress(
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!node) return;
      setContextMenuState({ isOpen: true, x: touch.clientX, y: touch.clientY, nodeId, title: node.title });
    },
    { delay: 500, tolerance: 8 }
  );

  const cardLongPressHandlers = {
    ...longPressHandlers,
    onTouchStart: (e: React.TouchEvent) => {
      if (isFromTaskDragHandle(e.target)) return;
      longPressHandlers.onTouchStart(e);
    },
  };

  // Keep all hooks above this guard so missing data never changes hook order.
  if (!node) return null;

  return (
    <div
      ref={mergedRef}
      style={style}
      {...cardLongPressHandlers}
      onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuState({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, title: node.title });
      }}
      className={`kanban-task-card relative kanban-scroll-touch bg-white border rounded-lg shadow-sm transition-all group mb-2 ${
        isDragging
          ? 'opacity-60 shadow-md border-slate-200'
          : isSelectingMode
            ? isSelfNode
              ? 'border-amber-400 ring-2 ring-amber-300 shadow-md'
              : 'border-slate-200 hover:border-amber-300 hover:shadow-md cursor-crosshair'
            : `border-slate-200 hover:border-primary hover:shadow-md ${isEditing ? 'cursor-default' : ''}`
      }`}
    >
      <div className="kanban-task-card-body flex items-start p-2.5">
        {/* 卡片內容 — 只有左側把手可拖曳，避免手機滑動畫面時誤觸 */}
        <div className="flex-1 min-w-0">
          {/* 標題列 */}
          <div className="kanban-task-title-row flex items-start justify-between gap-2">
            <div className="kanban-task-title-content flex items-center gap-1.5 flex-1 min-w-0">
              {/* 拖曳把手 */}
              {/* 行內編輯：編輯模式 → input；一般模式 → 點擊觸發編輯 */}
              <TaskDragHandle
                attributes={attributes}
                listeners={listeners}
                disabled={isEditing || isSelectingMode}
                className="-ml-1"
              />

              {isEditing ? (
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onVoiceResult={setEditValue}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  voiceEnabled
                  className="h-auto min-w-0 flex-1 rounded border border-primary bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-700 outline-none ring-2 ring-primary/30 focus:ring-2 focus:ring-primary/30 focus:ring-offset-0"
                />
              ) : (
                <h4
                  className={`text-sm font-semibold leading-tight flex-1 truncate cursor-text hover:text-primary transition-colors ${
                    statusTextColorMap[status as TaskStatus]
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleStartEdit}
                  title="點擊以編輯任務名稱"
                >
                  {node.title || '未命名任務'}
                </h4>
              )}
            </div>
          </div>

          {/* 日期與進度指標 */}
          {(isSelectingMode || node.startDate || node.endDate || hasChildren) && (
            <div onPointerDown={(e) => e.stopPropagation()} className="kanban-task-meta flex flex-wrap items-center gap-1.5 mt-2 text-[10px] text-slate-400">

              {/* 選取模式：始終顯示兩顆日期按鈕（無日期時顯示 "..."） */}
              {isSelectingMode ? (
                <>
                  {/* 開始日按鈕 — 始終顯示 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold transition-all ${
                      isSelfStart
                        ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                        : 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100 hover:border-blue-400 hover:shadow-sm cursor-crosshair'
                    }`}
                    title="點擊選取此開始日作為依賴目標"
                  >
                    <Link size={9} />
                    <span>開始 {node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
                  </button>
                  {/* 結束日按鈕 — 始終顯示 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold transition-all ${
                      isSelfEnd
                        ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                        : 'bg-purple-50 border-purple-300 text-purple-600 hover:bg-purple-100 hover:border-purple-400 hover:shadow-sm cursor-crosshair'
                    }`}
                    title="點擊選取此結束日作為依賴目標"
                  >
                    <Link size={9} />
                    <span>結束 {node.endDate ? dayjs(node.endDate).format('MM/DD') : '...'}</span>
                  </button>
                </>
              ) : (
                // 一般模式：原始日期 Badge 顯示
                <>
              {/* 日期區間 */}
              {( (showStartDate && node.startDate) || node.endDate) && (
                <Badge variant={isDueToday ? 'warning' : 'default'} size="sm" icon={<Calendar size={10} />}>
                  {showStartDate && (
                      <>
                          <span className={lockStatus.startLocked ? 'underline decoration-dashed decoration-slate-400 underline-offset-[3px] opacity-70' : ''} title={lockStatus.startLocked ? '此日期由依賴推算' : ''}>
                            {node.startDate ? (dayjs(node.startDate).year() !== dayjs().year() ? dayjs(node.startDate).format('YY/MM/DD') : dayjs(node.startDate).format('MM/DD')) : '...'}
                          </span>
                          <span className="opacity-50">→</span>
                      </>
                  )}
                  <span className={isEndDateEffectivelyLocked ? 'underline decoration-dashed decoration-slate-400 underline-offset-[3px] opacity-70' : ''} title={isEndDateEffectivelyLocked ? (node.isDurationLocked ? '因工期鎖定，由開始日期推算' : '此日期由依賴推算') : ''}>
                    {node.endDate ? (dayjs(node.endDate).year() !== dayjs().year() ? dayjs(node.endDate).format('YY/MM/DD') : dayjs(node.endDate).format('MM/DD')) : '...'}
                  </span>
                </Badge>
              )}

              {/* 子節點完成進度 */}
              {hasChildren && (
                <Badge
                  variant={childStats.completed === childStats.total ? 'success' : 'default'}
                  size="sm"
                  icon={<CheckSquare size={10} />}
                >
                  <span className="font-bold">{childStats.completed}/{childStats.total}</span>
                </Badge>
              )}
              </> /* end normal mode */
              )}
            </div>
          )}

          {/* 進度條 (僅在有子節點時顯示) */}
          {hasChildren && (
            <div className="kanban-task-progress mt-2">
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    progress === 100 ? 'bg-emerald-400' : progress > 0 ? 'bg-blue-400' : 'bg-slate-200'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Level 3+ 下層任務展開區 */}
          {hasChildren && (
            <div
              ref={setChecklistAreaDropRef}
              className={`kanban-checklist-section mt-2 rounded-md border transition-[background-color,border-color,box-shadow] duration-100 ${
                isChecklistTargeted
                  ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                  : 'border-transparent'
              }`}
            >
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChecklistExpanded(!isChecklistExpanded);
                }}
                className="kanban-checklist-toggle flex items-center gap-1 px-1.5 py-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isChecklistExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{isChecklistExpanded ? '收合' : '展開'}下層任務</span>
              </button>

              {isChecklistExpanded && (
                <div className="kanban-checklist-body px-1 pb-1">
                  <KanbanChecklist
                    parentId={nodeId}
                    depth={0}
                    previewNodes={previewNodes}
                    previewParentIndex={previewParentIndex}
                  />
                </div>
              )}
            </div>
          )}

          <div
            ref={setChecklistDropRef}
            className={`kanban-card-dropzone mt-2 flex items-center justify-center rounded-md border border-dashed transition-[height,opacity,background-color,border-color,color] duration-100 ${
              showChecklistDropZone ? 'h-12 opacity-100' : 'h-0 overflow-hidden border-transparent opacity-0'
            } border-slate-300 bg-slate-50 text-slate-400`}
          >
            <ListPlus size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};
