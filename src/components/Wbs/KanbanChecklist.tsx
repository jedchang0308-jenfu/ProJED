/**
 * KanbanChecklist — 遞迴渲染 WBS Level 3+ 子節點為下層任務
 * 設計意圖：在 KanbanCard 內部呈現深層子節點，保留 WBS 階層關係。
 * 每一層透過 depth 增加縮排，左側拖曳把手負責排序，標題支援行內編輯。
 * 
 * 【編輯功能】點擊任務標題可行內編輯，Enter 或失焦即儲存，ESC 取消。
 * 【拖曳功能】每個任務現在是可拖曳元素，支援跨卡片及升級至列表等操作。
 */
import React, { useState, useRef, useEffect } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import dayjs from 'dayjs';
import { Input } from '../ui/Input';
import { useLongPress } from '../../hooks/useLongPress';
import type { TaskStatus, TaskNode } from '../../types';
import { TaskDragHandle } from './TaskDragHandle';

interface KanbanChecklistProps {
  parentId: string;   // 父節點 ID (Level 2 或更深)
  depth?: number;     // 遞迴深度，用於縮排計算
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  ancestorIds?: string[];
}

/** 狀態對應的文字色 */
const statusTextMap: Record<TaskStatus, string> = {
  todo: 'text-slate-600',
  in_progress: 'text-blue-600',
  completed: 'text-emerald-600 line-through',
  delayed: 'text-orange-600',
  unsure: 'text-purple-600',
  onhold: 'text-slate-400 line-through',
};

const isFromTaskDragHandle = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('[data-task-drag-handle="true"]'));

// =====================================================
// ChecklistItem — 單一可拖曳任務（抽出為獨立元件，
// 使每個 item 可以各自持有 useSortable hook）
// =====================================================
interface ChecklistItemProps {
  child: TaskNode;
  depth: number;
  editingId: string | null;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (e: React.MouseEvent, child: TaskNode) => void;
  onSave: (child: TaskNode) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, child: TaskNode) => void;
  onEditValueChange: (val: string) => void;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  ancestorIds?: string[];
}

const ChecklistItem: React.FC<ChecklistItemProps> = ({
  child: initialChild,
  depth,
  editingId,
  editValue,
  inputRef,
  onStartEdit,
  onSave,
  onKeyDown,
  onEditValueChange,
  previewNodes,
  previewParentIndex,
  ancestorIds = [],
}) => {
  const storeChild = useWbsStore(s => s.nodes[initialChild.id]);
  const child = previewNodes?.[initialChild.id] || storeChild;
  const storeGrandchildIds = useWbsStore(s => s.parentNodesIndex[initialChild.id]);
  const grandchildIds = previewParentIndex?.[initialChild.id] || storeGrandchildIds;
  const childId = child?.id || initialChild.id;
  const isInvalidChild = !child || child.isArchived || ancestorIds.includes(childId);

  const status = child?.status || 'todo';
  const isDueToday = status !== 'completed' && !!child?.endDate && dayjs(child.endDate).isSame(dayjs(), 'day');
  const hasGrandchildren = grandchildIds && grandchildIds.length > 0;
  const isEditing = editingId === childId;
  const showStartDate = useBoardStore(s => s.showStartDate);

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === childId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === childId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;

  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(childId, wbsDependencies);
  const isEndDateEffectivelyLocked = lockStatus.endLocked || Boolean(child?.isDurationLocked);

  // 每個任務都是可拖曳元素
  // data.type = 'wbs-checklist' 供 handleDragEnd 辨識
  // data.parentId 記錄當前父節點，用於跨階層移動後的 Roll-up 計算
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: childId,
    data: {
      type: 'wbs-checklist',
      nodeId: childId,
      parentId: child?.parentId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 手機長按開啟右鍵選單（500ms，長於拖曳的 250ms，移動超過 8px 則取消）
  const longPressHandlers = useLongPress(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!child) return;
      useBoardStore.getState().setContextMenuState({
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId: child.id,
        title: child.title || '未命名任務',
      });
    },
    { delay: 500, tolerance: 8 }
  );

  const checklistLongPressHandlers = {
    ...longPressHandlers,
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      if (isFromTaskDragHandle(e.target)) return;
      longPressHandlers.onTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent) => {
      e.stopPropagation();
      longPressHandlers.onTouchMove(e);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      longPressHandlers.onTouchEnd(e);
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.stopPropagation();
      longPressHandlers.onTouchCancel(e);
    },
  };

  // Keep hooks above this guard so archived/missing/cyclic nodes do not change hook order.
  if (isInvalidChild || !child) return null;

  return (
    <div ref={setNodeRef} style={style}>
      {/* 單一待辦項目列 — 拖曳只由左側把手啟動，避免影響手機捲動 */}
      <div
        {...checklistLongPressHandlers}
        className={`kanban-checklist-item relative kanban-scroll-touch flex items-center gap-1.5 py-1 group rounded transition-colors ${
          isDragging
            ? 'opacity-40 bg-primary/5'
            : isSelectingMode
              ? isSelfNode
                ? 'bg-amber-50 ring-1 ring-inset ring-amber-400 cursor-crosshair'
                : 'hover:bg-amber-50/60 cursor-crosshair'
              : `hover:bg-slate-50 ${isEditing ? 'cursor-default' : ''}`
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          useBoardStore.getState().setContextMenuState({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            nodeId: child.id,
            title: child.title || '未命名任務',
          });
        }}
      >

        {/* 拖曳把手 */}
        <TaskDragHandle
          attributes={attributes}
          listeners={listeners}
          disabled={isEditing || isSelectingMode}
          size="sm"
        />

        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onVoiceResult={onEditValueChange}
            onBlur={() => onSave(child)}
            onKeyDown={(e) => onKeyDown(e, child)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            voiceEnabled
            className="h-auto min-w-0 flex-1 rounded border border-primary bg-white px-1 py-0.5 text-xs text-slate-700 outline-none ring-1 ring-primary/30 focus:ring-1 focus:ring-primary/30 focus:ring-offset-0"
          />
        ) : (
          <span
            className={`text-xs leading-tight flex-1 truncate cursor-text hover:text-primary transition-colors ${statusTextMap[status]}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onStartEdit(e, child)}
            title="點擊以編輯任務名稱"
          >
            {child.title || '未命名任務'}
          </span>
        )}

        {/* 日期標籤區 — 選取模式：顯示可點擊按鈕；一般模式：顯示日期 */}
        {isSelectingMode ? (
          <div className="flex items-center gap-1 ml-1">
            {/* 開始日按鈕 */}
            <button
              onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(child.id, 'start', child.title); }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold transition-all ${
                isSelfStart
                  ? 'bg-amber-100 border-amber-400 text-amber-700 ring-1 ring-amber-300'
                  : 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100 cursor-crosshair'
              }`}
            >
              <Link size={8} />
              <span>開始 {child.startDate ? dayjs(child.startDate).format('MM/DD') : '...'}</span>
            </button>
            {/* 結束日按鈕 */}
            <button
              onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(child.id, 'end', child.title); }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold transition-all ${
                isSelfEnd
                  ? 'bg-amber-100 border-amber-400 text-amber-700 ring-1 ring-amber-300'
                  : 'bg-purple-50 border-purple-300 text-purple-600 hover:bg-purple-100 cursor-crosshair'
              }`}
            >
              <Link size={8} />
              <span>結束 {child.endDate ? dayjs(child.endDate).format('MM/DD') : '...'}</span>
            </button>
          </div>
        ) : (
          <>
          {/* 日期區間標籤 */}
          {!isEditing && ((showStartDate && child.startDate) || child.endDate) && (
          <span 
            className={`text-[9px] rounded px-1.5 py-0.5 flex-shrink-0 ml-1 flex items-center gap-0.5 ${
              isDueToday
                ? 'border border-orange-300 bg-orange-50 text-orange-600 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]'
                : `border ${isEndDateEffectivelyLocked ? 'border-dashed border-slate-400 opacity-80 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white text-slate-400'}`
            }`}
            title={isEndDateEffectivelyLocked ? (child.isDurationLocked ? '因工期鎖定，由開始日期推算' : '此日期由依賴關係計算') : ''}
          >
            {showStartDate && (
                <>
                    <span className={lockStatus.startLocked ? 'underline decoration-dashed decoration-slate-400 opacity-70' : ''}>
                        {child.startDate
                          ? dayjs(child.startDate).year() !== dayjs().year()
                            ? dayjs(child.startDate).format('YY/MM/DD')
                            : dayjs(child.startDate).format('MM/DD')
                          : '...'}
                    </span>
                    <span className="opacity-50">→</span>
                </>
            )}
            <span className={isEndDateEffectivelyLocked ? 'underline decoration-dashed decoration-slate-400 opacity-70' : ''}>
                {child.endDate ? (dayjs(child.endDate).year() !== dayjs().year()
                  ? dayjs(child.endDate).format('YY/MM/DD')
                  : dayjs(child.endDate).format('MM/DD')) : '...'}
            </span>
          </span>
          )}
          </>
        )}

        {/* 子項目數量指示器 (僅在有更深子節點時顯示) */}
        {hasGrandchildren && (
          <span className="text-[9px] text-slate-400 bg-slate-100 rounded px-1 flex-shrink-0">
            {grandchildIds.length}
          </span>
        )}
      </div>

      {/* 遞迴渲染更深層的子節點 */}
      {hasGrandchildren && (
        <KanbanChecklist
          parentId={child.id}
          depth={depth + 1}
          previewNodes={previewNodes}
          previewParentIndex={previewParentIndex}
          ancestorIds={ancestorIds}
        />
      )}
    </div>
  );
};

// =====================================================
// KanbanChecklist — 主要容器元件
// =====================================================
export const KanbanChecklist: React.FC<KanbanChecklistProps> = ({ parentId, depth = 0, previewNodes, previewParentIndex, ancestorIds = [] }) => {
  const isRecursiveParent = ancestorIds.includes(parentId);
  const nextAncestorIds = [...ancestorIds, parentId];
  const nextAncestorKey = nextAncestorIds.join('|');
  // 訂閱該父節點的子節點 ID 陣列
  const storeChildIds = useWbsStore(s => s.parentNodesIndex[parentId]);
  const childIds = previewParentIndex?.[parentId] || storeChildIds;
  const updateNode = useWbsStore(s => s.updateNode);
  const statusFilters = useBoardStore(s => s.statusFilters);

  // 行內編輯狀態管理（在容器層統一管理，避免多個 item 同時進入編輯模式）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 進入編輯模式時自動聚焦並全選文字
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /** 開始編輯 */
  const handleStartEdit = (e: React.MouseEvent, child: TaskNode) => {
    e.stopPropagation();
    setEditingId(child.id);
    setEditValue(child.title || '');
  };

  /** 儲存變更 */
  const handleSave = (child: TaskNode) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== child.title) {
      updateNode(child.id, { title: trimmed, updatedAt: Date.now() });
    }
    setEditingId(null);
  };

  /** 鍵盤事件 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, child: TaskNode) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(child);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  // 取得子節點的完整資料，按 order 排序
  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;
    const nextAncestors = new Set(nextAncestorKey.split('|'));
    return (childIds || [])
      .filter(id => !nextAncestors.has(id))
      .map(id => nodes[id])
      .filter(n => n && !n.isArchived && statusFilters[n.status || 'todo'])
      .sort((a, b) => a.order - b.order);
  }, [childIds, statusFilters, previewNodes, nextAncestorKey]);

  // 無子節點則不渲染
  if (isRecursiveParent || children.length === 0) return null;

  return (
    <div className={depth === 0 ? 'kanban-checklist-root mt-2 pt-2 border-t border-slate-100' : ''}>
      <SortableContext items={children.map(child => child.id)} strategy={verticalListSortingStrategy}>
        {children.map(child => (
          <ChecklistItem
            key={child.id}
            child={child}
            depth={depth}
            editingId={editingId}
            editValue={editValue}
            inputRef={inputRef}
            onStartEdit={handleStartEdit}
            onSave={handleSave}
            onKeyDown={handleKeyDown}
            onEditValueChange={setEditValue}
            previewNodes={previewNodes}
            previewParentIndex={previewParentIndex}
            ancestorIds={nextAncestorIds}
          />
        ))}
      </SortableContext>
    </div>
  );
};
