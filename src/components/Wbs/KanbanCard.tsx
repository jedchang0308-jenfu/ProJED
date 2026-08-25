/**
 * KanbanCard — 渲染 WBS Level 2 節點為可拖曳的 Kanban 任務卡
 * 設計意圖：取代舊版 Card.tsx，資料來源改為 useWbsStore 的 TaskNode。
 * 卡片內部嵌入 KanbanChecklist 以遞迴呈現 Level 3+ 的下層任務。
 * 
 * 【標題功能】卡片採閱讀優先；任務名稱編輯集中在任務詳情頁。
 */
import React, { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronRight, Link } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { KanbanChecklist } from './KanbanChecklist';
import { KanbanDependencyContext } from '../BoardView';
import { useTagStore } from '../../store/useTagStore';
import { getNodeTags } from '../../utils/tags';
import { KanbanTagSticker } from '../Tags/KanbanTagSticker';
import dayjs from 'dayjs';
import type { TaskStatus } from '../../types';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { isTaskPrimaryActionTarget } from '../../utils/taskInteractions';
import { useTaskInteractionBinding } from '../../interactions/task/useTaskInteractionBinding';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { TaskDateBadge } from './TaskDateBadge';
import { useTaskGestureSurface } from './taskDrag/useTaskGestureSurface';
import {
  TASK_CHILD_DROP_HIGHLIGHT_EVENT,
  TASK_CHILD_DROP_SUCCESS_EVENT,
  type TaskChildDropSuccessDetail,
} from './taskDrag/taskChildDropFeedback';
import { taskStatusTitleClass } from '../ui/taskStatusStyles';

interface KanbanCardProps {
  nodeId: string;       // Level 2 TaskNode 的 ID
  columnId: string;     // 所屬的 Level 1 列表 ID（用於 DnD 跨列識別）
  previewNodes?: Record<string, any> | null;
  previewParentIndex?: Record<string, string[]> | null;
  filterProjection?: TaskFilterResultProjection | null;
}

const isFromChecklistItem = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('.kanban-checklist-item[data-task-id]'));

export const KanbanCard: React.FC<KanbanCardProps> = ({ nodeId, columnId, previewNodes, previewParentIndex, filterProjection }) => {
  const storeNode = useWbsStore(s => s.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const showTags = useBoardStore(s => s.showTags);
  const selectedTaskId = useBoardStore(s => s.selectedTaskId);
  const tags = useTagStore(s => s.tags);
  const { canMoveTask, canCreateDependency } = useBoardPermissions();
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);
  const cardScopeRef = useRef<HTMLDivElement | null>(null);

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isRecordSelectionMode = useRecordStore(s => s.isTaskSelectionMode);
  const recordDraft = useRecordStore(s => s.draft);
  const insertRecordTaskMention = useRecordStore(s => s.insertTaskMentionAtCursor);
  const isRecordCaptureMode = isRecordSelectionMode;
  const isRecordSelected = recordDraft?.taskLinks.some(link => link.nodeId === nodeId) ?? false;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;
  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const taskGesture = useTaskGestureSurface({
    task: { id: nodeId, title: node?.title, status: node?.status },
    sourceKind: 'kanban-card',
    disabled: isSelectingMode || isRecordCaptureMode,
    onNonMobileLongPress: (event) => {
      if (!node) return;
      event.preventDefault();
      const touch = event.touches[0];
      void interactionBinding.openMenu({ x: touch.clientX, y: touch.clientY });
    },
  });

  // Canonical child state keeps filtered-empty drag/drop semantics intact;
  // visible child state owns the on-card expand/collapse affordance.
  const storeChildIds = useWbsStore(s => s.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;

  const hasChildren = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;
    return (childIds || []).some(id => {
      const child = nodes[id];
      return Boolean(child && !child.isArchived);
    });
  }, [childIds, previewNodes]);
  const hasVisibleChildren = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;
    return (childIds || []).some(id => {
      const child = nodes[id];
      return Boolean(
        child &&
        !child.isArchived &&
        (!filterProjection || filterProjection.visibleTaskIds.has(child.id)),
      );
    });
  }, [childIds, filterProjection, previewNodes]);
  const checklistToggleLabel = isChecklistExpanded ? '收合下層任務' : '展開下層任務';
  const checklistRegionId = `kanban-checklist-${nodeId}`;

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
    disabled: !canMoveTask || isSelectingMode || isRecordCaptureMode || taskGesture.mobileActionMode,
    data: {
      type: 'wbs-card',
      nodeId,
      columnId,  // 讓 DragEnd 知道此卡片來自哪一列
    }
  });
  const interactionBinding = useTaskInteractionBinding({
    taskId: nodeId,
    title: node?.title,
    surfaceId: 'board.card',
    nodeRole: node?.nodeType || 'task',
    transientOwners: [
      ...(isSelectingMode ? ['dependency-selection' as const] : []),
      ...(isRecordCaptureMode ? ['record-capture' as const] : []),
      ...(taskGesture.isActive ? ['mobile-action-mode' as const] : []),
    ],
  });
  const setCardScopeRef = React.useCallback((element: HTMLDivElement | null) => {
    cardScopeRef.current = element;
    setNodeRef(element);
  }, [setNodeRef]);

  const isDragPlaceholder = isDragging || taskGesture.isActive;
  // The source surface starts the gesture, but the sortable placeholder owns
  // the complete source + subtree scope and must retain that full height.
  const placeholderScopeHeight = isDragPlaceholder
    ? cardScopeRef.current?.getBoundingClientRect().height
    : undefined;
  const freezeDesktopTaskLayout = Boolean(active && ['wbs-card', 'wbs-checklist'].includes(activeType || ''));
  const style = {
    transform: freezeDesktopTaskLayout ? undefined : CSS.Transform.toString(transform),
    transition: freezeDesktopTaskLayout ? undefined : transition,
    minHeight: placeholderScopeHeight
      ?? taskGesture.activeSurfaceHeight
      ?? (isDragging ? active?.rect.current.initial?.height : undefined),
  };

  const dragSurfaceBindings = taskGesture.mobileActionMode || isSelectingMode || isRecordCaptureMode
    ? {}
    : { ...attributes, ...listeners };

  const status = node?.status || 'todo';
  const nodeTags = getNodeTags(node, tags);
  const showChecklistSurface = hasVisibleChildren;
  const [isRecentlyChildDropped, setIsRecentlyChildDropped] = useState(false);

  React.useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChildDropSuccess = (event: Event) => {
      const detail = (event as CustomEvent<TaskChildDropSuccessDetail>).detail;
      if (!detail) return;
      if (detail.targetNodeId === nodeId) setIsChecklistExpanded(true);
    };
    const handleChildDropHighlight = (event: Event) => {
      const detail = (event as CustomEvent<TaskChildDropSuccessDetail>).detail;
      if (!detail) return;
      if (detail.sourceNodeId !== nodeId) return;
      setIsRecentlyChildDropped(true);
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => setIsRecentlyChildDropped(false), 1400);
    };
    window.addEventListener(TASK_CHILD_DROP_SUCCESS_EVENT, handleChildDropSuccess);
    window.addEventListener(TASK_CHILD_DROP_HIGHLIGHT_EVENT, handleChildDropHighlight);
    return () => {
      window.removeEventListener(TASK_CHILD_DROP_SUCCESS_EVENT, handleChildDropSuccess);
      window.removeEventListener(TASK_CHILD_DROP_HIGHLIGHT_EVENT, handleChildDropHighlight);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, [nodeId]);

  const cardLongPressHandlers = {
    ...taskGesture.handlers,
    onTouchStart: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      taskGesture.handlers.onTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      taskGesture.handlers.onTouchMove(e);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      taskGesture.handlers.onTouchEnd(e);
    },
    onTouchCancel: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      taskGesture.handlers.onTouchCancel(e);
    },
  };

  // Keep all hooks above this guard so missing data never changes hook order.
  if (!node) return null;

  return (
    <div
      ref={setCardScopeRef}
      style={style}
      data-task-id={nodeId}
      data-kanban-drag-source-placeholder={isDragPlaceholder ? 'true' : undefined}
      data-task-surface-scope="true"
      data-desktop-task-hover-scope="true"
      data-task-child-drop-target="true"
      data-task-child-drop-level="L2"
      data-task-hover-scope-kind="card"
      data-task-hover-scope-source-id={nodeId}
      data-task-hover-has-descendants={hasChildren ? 'true' : undefined}
      data-kanban-card-visual="framed-elevated"
      data-task-hierarchy-level="L2"
      data-task-child-drop-committed={isRecentlyChildDropped ? 'true' : undefined}
      className={`kanban-task-card relative mb-[6px] rounded-lg border border-slate-300 bg-surface-task shadow-[0_2px_7px_rgba(15,23,42,0.14)] transition-shadow ${
        isDragPlaceholder ? 'kanban-drag-origin-placeholder pointer-events-none !border-transparent bg-transparent shadow-none' : ''
      } ${
        isRecentlyChildDropped ? 'ring-2 ring-primary/50 ring-offset-1' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 h-px w-px opacity-0"
        data-task-direct-child-title-anchor="true"
        style={{
          left: 'calc(9px + 2px + var(--kanban-checklist-body-pad-x, 4px) + var(--kanban-checklist-base, 4px))',
        }}
      />
      {isDragPlaceholder ? (
        <div
          className="w-full"
          data-kanban-drag-source-placeholder-neutral="true"
          aria-hidden="true"
        />
      ) : (
      <>
        {/* 來源 surface 與子樹 surface 為 sibling；scope 只負責版面與整棵樹的排序位移。 */}
          <div
            {...dragSurfaceBindings}
            {...cardLongPressHandlers}
            onClick={(e) => {
              if (isRecordCaptureMode) {
                e.preventDefault();
                e.stopPropagation();
                insertRecordTaskMention(nodeId, node.title || nodeId);
                return;
              }
              if (isSelectingMode || isTaskPrimaryActionTarget(e.target)) return;
              // Compatibility contract: selectAndOpenTaskDetails(nodeId) is dispatched by the interaction kernel.
              void interactionBinding.dispatch('pointer.primary');
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (isRecordCaptureMode) return;
              void interactionBinding.openMenu({ x: e.clientX, y: e.clientY });
            }}
            data-task-id={nodeId}
            data-mobile-drop-target={nodeId}
            data-task-drop-surface-kind="kanban-card"
            data-desktop-drop-surface="true"
            data-desktop-drop-id={nodeId}
            data-task-drag-surface="true"
            data-task-drag-surface-kind="kanban-card"
            data-task-surface-source="true"
            data-desktop-task-hover-preview={!isSelectingMode && !isRecordCaptureMode ? 'true' : undefined}
            data-task-selected={selectedTaskId === nodeId ? 'true' : undefined}
            data-touch-tap-guard="true"
            data-task-touch-gesture-surface={taskGesture.touchGestureEnabled ? 'true' : undefined}
            data-task-card-primary="true"
            data-mobile-task-card-primary="true"
            className={`kanban-task-card-body mobile-pan-item kanban-scroll-touch group min-w-0 px-[9px] py-[6px] transition-[background-color,box-shadow] ${
              showChecklistSurface ? 'rounded-t-[7px]' : 'rounded-[7px]'
            } ${
              isRecordCaptureMode
                ? isRecordSelected
                  ? 'cursor-pointer bg-primary-light ring-2 ring-inset ring-primary/30'
                  : 'cursor-pointer hover:bg-primary/[0.03]'
                : isSelectingMode
                  ? isSelfNode
                    ? 'cursor-crosshair bg-amber-50 ring-2 ring-inset ring-amber-300'
                    : 'cursor-crosshair hover:bg-amber-50/40'
                  : 'cursor-pointer hover:bg-slate-50/70'
            }`}
          >
            {/* 標題列 */}
          <div
            className="kanban-task-title-row flex items-start justify-between gap-1"
          >
            <div className="kanban-task-title-content flex items-center gap-1 flex-1 min-w-0">
              {/* 行內編輯：編輯模式 → input；一般模式 → 點擊觸發編輯 */}
              <h4
                className={`task-title-text relative min-w-0 flex-1 pr-2 text-sm font-medium leading-tight transition-colors ${taskStatusTitleClass[status as TaskStatus]}`}
                aria-label={node.title || '未命名任務'}
                data-task-title-slot="true"
                data-task-id={nodeId}
                onClick={(e) => {
                  if (isRecordCaptureMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    insertRecordTaskMention(nodeId, node.title || nodeId);
                  }
                }}
              >
                <span
                  className="inline-block max-w-full truncate align-top"
                  data-task-id={nodeId}
                >
                  {node.title || '未命名任務'}
                </span>
              </h4>
              {showTags && nodeTags.length > 0 ? (
                <KanbanTagSticker tags={nodeTags} />
              ) : null}
              {isRecordCaptureMode ? (
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isRecordSelected ? 'border-primary bg-primary text-white' : 'border-primary/40 bg-white'
                  }`}
                  data-task-record-capture-checkbox="true"
                >
                  {isRecordSelected ? <Check size={11} /> : null}
                </span>
              ) : null}
              {hasVisibleChildren ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChecklistExpanded(current => !current);
                  }}
                  className="kanban-checklist-toggle relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors after:absolute after:-inset-1 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-expanded={isChecklistExpanded}
                  aria-controls={checklistRegionId}
                  aria-label={checklistToggleLabel}
                  title={checklistToggleLabel}
                  data-kanban-checklist-toggle="true"
                  data-kanban-checklist-state={isChecklistExpanded ? 'expanded' : 'collapsed'}
                >
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className={`transition-transform duration-150 ${isChecklistExpanded ? 'rotate-90' : ''}`}
                  />
                </button>
              ) : null}
            </div>
            {!isSelectingMode && (
              <TaskDateBadge
                startDate={node.startDate}
                endDate={node.endDate}
                status={status}
                showStartDate={false}
                startLocked={lockStatus.startLocked}
                endLocked={lockStatus.endLocked}
                durationLocked={Boolean(node.isDurationLocked)}
                surface="checklist"
                className="ml-0.5 self-center"
              />
            )}
          </div>

          {isSelectingMode && (
            <div onPointerDown={(e) => e.stopPropagation()} className="kanban-task-meta flex flex-wrap items-center gap-1 mt-px text-[10px] text-slate-400">

              {/* 選取模式：始終顯示兩顆日期按鈕（無日期時顯示 "..."） */}
              {/* 開始日按鈕 — 始終顯示 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                className={`flex items-center gap-1 px-1.5 py-0 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfStart
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-primary-light border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm cursor-crosshair'
                }`}
                title="點擊選取此開始日作為依賴目標"
              >
                <Link size={9} />
                <span>開始 {node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
              </button>
              {/* 結束日按鈕 — 始終顯示 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                className={`flex items-center gap-1 px-1.5 py-0 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfEnd
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-primary-light border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm cursor-crosshair'
                }`}
                title="點擊選取此結束日作為依賴目標"
              >
                <Link size={9} />
                <span>結束 {node.endDate ? dayjs(node.endDate).format('MM/DD') : '...'}</span>
              </button>
            </div>
          )}
          </div>

          {/* Level 3+ 下層任務展開區 */}
          {showChecklistSurface && (
            <div
              id={checklistRegionId}
              className={`kanban-checklist-section mx-[9px] mb-[6px] mt-1 rounded-md border-l-2 border-slate-300/80 transition-[background-color,box-shadow] duration-100 ${
                isChecklistExpanded ? 'bg-surface-subtask' : 'bg-transparent'
              }`}
              data-task-id={nodeId}
              data-kanban-checklist-visual="inset-rail"
              data-kanban-card-subtree-scope="true"
              data-task-surface-subtree="true"
            >
              {hasVisibleChildren && isChecklistExpanded && (
                <div className="kanban-checklist-body px-1 pb-0.5">
                  <KanbanChecklist
                    parentId={nodeId}
                    depth={0}
                    previewNodes={previewNodes}
                    previewParentIndex={previewParentIndex}
                    filterProjection={filterProjection}
                  />
                </div>
              )}
            </div>
          )}
      </>
      )}
    </div>
  );
};
