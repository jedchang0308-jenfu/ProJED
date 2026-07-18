/**
 * KanbanChecklist — 遞迴渲染 WBS Level 3+ 子節點為下層任務
 * 設計意圖：在 KanbanCard 內部呈現深層子節點，保留 WBS 階層關係。
 * 每一層透過 depth 增加縮排，整個任務列 root surface 負責排序，標題編輯集中在任務詳情頁。
 * 
 * 【拖曳功能】每個任務現在是可拖曳元素，支援跨卡片及升級至列表等操作。
 */
import React from 'react';
import { useDndContext } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Link } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { KanbanDependencyContext } from '../BoardView';
import dayjs from 'dayjs';
import type { TaskStatus, TaskNode } from '../../types';
import { useTagStore } from '../../store/useTagStore';
import { getNodeTags } from '../../utils/tags';
import { TagChip } from '../Tags/TagChip';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { TaskDateBadge } from './TaskDateBadge';
import { useTaskGestureSurface } from './taskDrag/useTaskGestureSurface';

interface KanbanChecklistProps {
  parentId: string;   // 父節點 ID (Level 2 或更深)
  depth?: number;     // 遞迴深度，用於縮排計算
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  ancestorIds?: string[];
  filterProjection?: TaskFilterResultProjection | null;
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

// =====================================================
// ChecklistItem — 單一可拖曳任務（抽出為獨立元件，
// 使每個 item 可以各自持有 useSortable hook）
// =====================================================
interface ChecklistItemProps {
  child: TaskNode;
  depth: number;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  ancestorIds?: string[];
  filterProjection?: TaskFilterResultProjection | null;
}

const ChecklistItem: React.FC<ChecklistItemProps> = ({
  child: initialChild,
  depth,
  previewNodes,
  previewParentIndex,
  ancestorIds = [],
  filterProjection,
}) => {
  const storeChild = useWbsStore(s => s.nodes[initialChild.id]);
  const child = previewNodes?.[initialChild.id] || storeChild;
  const storeGrandchildIds = useWbsStore(s => s.parentNodesIndex[initialChild.id]);
  const grandchildIds = previewParentIndex?.[initialChild.id] || storeGrandchildIds;
  const childId = child?.id || initialChild.id;
  const isInvalidChild = !child || child.isArchived || ancestorIds.includes(childId);

  const status = child?.status || 'todo';
  const tags = useTagStore(s => s.tags);
  const nodeTags = getNodeTags(child, tags);
  const hasGrandchildren = grandchildIds && grandchildIds.length > 0;
  const showStartDate = useBoardStore(s => s.showStartDate);
  const showTags = useBoardStore(s => s.showTags);
  const selectedTaskId = useBoardStore(s => s.selectedTaskId);
  const { canMoveTask, canCreateDependency } = useBoardPermissions();
  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isRecordSelectionMode = useRecordStore(s => s.isTaskSelectionMode);
  const recordDraft = useRecordStore(s => s.draft);
  const insertRecordTaskMention = useRecordStore(s => s.insertTaskMentionAtCursor);
  const isRecordCaptureMode = isRecordSelectionMode;
  const isRecordSelected = recordDraft?.taskLinks.some(link => link.nodeId === childId) ?? false;
  const isSelfStart = isSelectingMode && dependencySelection?.id === childId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === childId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;

  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(childId, wbsDependencies);
  const taskGesture = useTaskGestureSurface({
    task: { id: childId, title: child?.title, status: child?.status },
    sourceKind: 'checklist-row',
    disabled: isSelectingMode || isRecordCaptureMode,
    onNonMobileLongPress: (event) => {
      if (!child) return;
      event.preventDefault();
      event.stopPropagation();
      const touch = event.touches[0];
      useBoardStore.getState().setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId: child.id,
        title: child.title || '未命名任務',
      });
    },
  });

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
    disabled: !canMoveTask || isSelectingMode || isRecordCaptureMode || taskGesture.mobileActionMode,
    data: {
      type: 'wbs-checklist',
      nodeId: childId,
      parentId: child?.parentId,
    },
  });

  const freezeDesktopTaskLayout = Boolean(active && ['wbs-card', 'wbs-checklist'].includes(activeType || ''));
  const style = {
    transform: freezeDesktopTaskLayout ? undefined : CSS.Transform.toString(transform),
    transition: freezeDesktopTaskLayout ? undefined : transition,
    minHeight: taskGesture.activeSurfaceHeight ?? undefined,
  };
  const isDragPlaceholder = isDragging || taskGesture.isActive;

  const dragSurfaceBindings = taskGesture.mobileActionMode || isSelectingMode || isRecordCaptureMode
    ? {}
    : { ...attributes, ...listeners };

  // Keep hooks above this guard so archived/missing/cyclic nodes do not change hook order.
  if (isInvalidChild || !child) return null;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'pointer-events-none' : undefined}>
      {/* 單一待辦項目列 — root surface 承接拖曳，互動子元件由 sensor 層防誤觸 */}
      <div
        {...dragSurfaceBindings}
        {...taskGesture.handlers}
        className={`kanban-checklist-item relative kanban-scroll-touch flex min-h-[18px] items-center gap-1 py-0 group rounded transition-colors ${
          isDragPlaceholder
            ? 'kanban-drag-source-placeholder pointer-events-none bg-transparent shadow-none ring-0'
            : isRecordCaptureMode
              ? isRecordSelected
                ? 'cursor-pointer bg-blue-50 ring-1 ring-inset ring-blue-400'
                : 'cursor-pointer hover:bg-blue-50/60'
            : isSelectingMode
              ? isSelfNode
                ? 'bg-amber-50 ring-1 ring-inset ring-amber-400 cursor-crosshair'
                : 'hover:bg-amber-50/60 cursor-crosshair'
              : 'cursor-pointer hover:bg-slate-50'
        } ${!isDragPlaceholder && selectedTaskId === child.id ? 'bg-primary/[0.05] ring-1 ring-inset ring-primary/30' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 2}px` }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isRecordCaptureMode) return;
          useBoardStore.getState().setContextMenuState({
            kind: 'task',
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            nodeId: child.id,
            title: child.title || '未命名任務',
          });
        }}
        onClick={(e) => {
          if (isRecordCaptureMode) {
            e.preventDefault();
            e.stopPropagation();
            insertRecordTaskMention(child.id, child.title || child.id);
            return;
          }
          if (isDragPlaceholder || isSelectingMode || isTaskPrimaryActionTarget(e.target)) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          selectAndOpenTaskDetails(child.id);
        }}
        data-task-id={child.id}
        data-mobile-drop-target={child.id}
        data-task-drop-surface-kind="checklist-row"
        data-desktop-drop-surface="true"
        data-desktop-drop-id={child.id}
        data-task-drag-surface="true"
        data-task-drag-surface-kind="checklist-row"
        data-kanban-drag-source-placeholder={isDragPlaceholder ? 'true' : undefined}
        data-desktop-task-hover-preview={!isDragPlaceholder && !isSelectingMode && !isRecordCaptureMode ? 'true' : undefined}
        data-task-selected={selectedTaskId === child.id ? 'true' : undefined}
        data-touch-tap-guard="true"
      >
        {isRecordCaptureMode ? (
          <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            isRecordSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white'
          }`}>
            {isRecordSelected ? <Check size={9} /> : null}
          </span>
        ) : null}

        <span
          className={`task-title-text text-xs font-medium leading-tight flex-1 truncate transition-colors ${statusTextMap[status]}`}
          onClick={(e) => {
            if (isRecordCaptureMode) {
              e.preventDefault();
              e.stopPropagation();
              insertRecordTaskMention(child.id, child.title || child.id);
            }
          }}
          title={child.title || '未命名任務'}
        >
          {child.title || '未命名任務'}
        </span>

        {/* 日期標籤區 — 選取模式：顯示可點擊按鈕；一般模式：顯示日期 */}
        {isSelectingMode ? (
          <div className="flex items-center gap-0.5 ml-0.5">
            {/* 開始日按鈕 */}
            <button
              disabled={!canCreateDependency}
              onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(child.id, 'start', child.title); }}
              className={`flex items-center gap-0.5 px-1 py-0 rounded-full border text-[9px] font-semibold transition-all ${
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
              disabled={!canCreateDependency}
              onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(child.id, 'end', child.title); }}
              className={`flex items-center gap-0.5 px-1 py-0 rounded-full border text-[9px] font-semibold transition-all ${
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
          <TaskDateBadge
            startDate={child.startDate}
            endDate={child.endDate}
            status={status}
            showStartDate={showStartDate}
            startLocked={lockStatus.startLocked}
            endLocked={lockStatus.endLocked}
            durationLocked={Boolean(child.isDurationLocked)}
            surface="checklist"
            className="ml-0.5"
          />
          </>
        )}

        {/* 子項目數量指示器 (僅在有更深子節點時顯示) */}
        {hasGrandchildren && (
          <span className="text-[9px] text-slate-400 bg-slate-100 rounded px-1 flex-shrink-0">
            {grandchildIds.length}
          </span>
        )}
      </div>

      {!isDragPlaceholder && showTags && nodeTags.length > 0 && (
        <div className="ml-6 mt-px flex flex-wrap gap-0.5">
          {nodeTags.slice(0, 3).map(tag => (
            <TagChip key={tag.id} tag={tag} compact />
          ))}
        </div>
      )}

      {/* 遞迴渲染更深層的子節點 */}
      {!isDragPlaceholder && hasGrandchildren && (
        <KanbanChecklist
          parentId={child.id}
          depth={depth + 1}
          previewNodes={previewNodes}
          previewParentIndex={previewParentIndex}
          ancestorIds={ancestorIds}
          filterProjection={filterProjection}
        />
      )}
    </div>
  );
};

// =====================================================
// KanbanChecklist — 主要容器元件
// =====================================================
export const KanbanChecklist: React.FC<KanbanChecklistProps> = ({ parentId, depth = 0, previewNodes, previewParentIndex, ancestorIds = [], filterProjection }) => {
  const isRecursiveParent = ancestorIds.includes(parentId);
  const nextAncestorIds = [...ancestorIds, parentId];
  const nextAncestorKey = nextAncestorIds.join('|');
  // 訂閱該父節點的子節點 ID 陣列
  const storeChildIds = useWbsStore(s => s.parentNodesIndex[parentId]);
  const childIds = previewParentIndex?.[parentId] || storeChildIds;

  // 取得子節點的完整資料，按 order 排序
  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;
    const nextAncestors = new Set(nextAncestorKey.split('|'));
    return (childIds || [])
      .filter(id => !nextAncestors.has(id))
      .map(id => nodes[id])
      .filter(n => n && !n.isArchived && (!filterProjection || filterProjection.visibleTaskIds.has(n.id)))
      .sort((a, b) => a.order - b.order);
  }, [childIds, filterProjection, previewNodes, nextAncestorKey]);

  // 無子節點則不渲染
  if (isRecursiveParent || children.length === 0) return null;

  return (
    <div className={depth === 0 ? 'kanban-checklist-root mt-px pt-px border-t border-slate-100' : ''}>
      <SortableContext items={children.map(child => child.id)} strategy={verticalListSortingStrategy}>
        {children.map(child => (
          <ChecklistItem
            key={child.id}
            child={child}
            depth={depth}
            previewNodes={previewNodes}
            previewParentIndex={previewParentIndex}
            ancestorIds={nextAncestorIds}
            filterProjection={filterProjection}
          />
        ))}
      </SortableContext>
    </div>
  );
};
