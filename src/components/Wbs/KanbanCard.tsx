/**
 * KanbanCard — 渲染 WBS Level 2 節點為可拖曳的 Kanban 任務卡
 * 設計意圖：取代舊版 Card.tsx，資料來源改為 useWbsStore 的 TaskNode。
 * 卡片內部嵌入 KanbanChecklist 以遞迴呈現 Level 3+ 的下層任務。
 * 
 * 【標題功能】卡片採閱讀優先；任務名稱編輯集中在任務詳情頁。
 */
import React, { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext, useDroppable } from '@dnd-kit/core';
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
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { TaskDateBadge } from './TaskDateBadge';
import { useTaskGestureSurface } from './taskDrag/useTaskGestureSurface';
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
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);
  const { active, over } = useDndContext();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId;
  const taskGesture = useTaskGestureSurface({
    task: { id: nodeId, title: node?.title, status: node?.status },
    sourceKind: 'kanban-card',
    disabled: isSelectingMode || isRecordCaptureMode,
    onNonMobileLongPress: (event) => {
      if (!node) return;
      event.preventDefault();
      const touch = event.touches[0];
      setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId,
        title: node.title,
      });
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
  const setCardScopeRef = React.useCallback((element: HTMLDivElement | null) => {
    cardScopeRef.current = element;
    setNodeRef(element);
  }, [setNodeRef]);

  // 此卡片同時是放置區：可接收 wbs-checklist 或 wbs-card 的拖入（降級操作）
  // 使用獨立 id `${nodeId}-card-drop` 區分「被拖動中的卡片」和「作為放置區的卡片」
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${nodeId}-card-drop`,
    disabled: !canMoveTask || activeType === 'wbs-card',
    data: {
      type: 'wbs-card-drop',
      nodeId,
      columnId,
    },
  });

  const { setNodeRef: setChecklistDropRef, isOver: isChecklistDropOver } = useDroppable({
    id: `${nodeId}-checklist-drop`,
    disabled: !canMoveTask || hasChildren || !['wbs-column', 'wbs-card'].includes(activeType || '') || activeNodeId === nodeId,
    data: {
      type: 'wbs-checklist-drop',
      nodeId,
      columnId,
    },
  });

  const { setNodeRef: setChecklistAreaDropRef, isOver: isChecklistAreaDropOver } = useDroppable({
    id: `${nodeId}-checklist-area-drop`,
    disabled: !canMoveTask || !hasChildren || activeType === 'wbs-checklist' || !['wbs-column', 'wbs-card'].includes(activeType || '') || activeNodeId === nodeId,
    data: {
      type: 'wbs-checklist-drop',
      nodeId,
      columnId,
    },
  });

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
  const canDropIntoChecklist = canMoveTask && ['wbs-column', 'wbs-card'].includes(activeType || '') && activeNodeId !== nodeId;
  const showChecklistAppendSurface = canDropIntoChecklist && !hasChildren;
  const showChecklistSurface = hasVisibleChildren || (canDropIntoChecklist && hasChildren);
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
      data-task-hover-scope-kind="card"
      data-task-hover-scope-source-id={nodeId}
      data-task-hover-has-descendants={hasChildren ? 'true' : undefined}
      data-kanban-card-visual="framed-elevated"
      data-task-hierarchy-level="L2"
      className={`kanban-task-card relative mb-[6px] rounded-lg border border-slate-300 bg-surface-task shadow-[0_2px_7px_rgba(15,23,42,0.14)] transition-shadow ${
        isDragPlaceholder ? 'pointer-events-none !border-transparent bg-transparent shadow-none' : ''
      }`}
    >
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
            ref={setDropRef}
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
              selectAndOpenTaskDetails(nodeId);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (isRecordCaptureMode) return;
              setContextMenuState({ kind: 'task', isOpen: true, x: e.clientX, y: e.clientY, nodeId, title: node.title });
            }}
            data-task-id={nodeId}
            data-mobile-drop-target={nodeId}
            data-task-drop-surface-kind="kanban-card"
            data-desktop-drop-surface="true"
            data-desktop-drop-id={activeType === 'wbs-checklist' ? `${nodeId}-card-drop` : nodeId}
            data-task-drag-surface="true"
            data-task-drag-surface-kind="kanban-card"
            data-task-surface-source="true"
            data-desktop-task-hover-preview={!isSelectingMode && !isRecordCaptureMode ? 'true' : undefined}
            data-task-selected={selectedTaskId === nodeId ? 'true' : undefined}
            data-touch-tap-guard="true"
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

              {/* 行內編輯：編輯模式 → input；一般模式 → 點擊觸發編輯 */}
              {isRecordCaptureMode ? (
                <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isRecordSelected ? 'border-primary bg-primary text-white' : 'border-primary/40 bg-white'
                }`}>
                  {isRecordSelected ? <Check size={11} /> : null}
                </span>
              ) : null}

              <h4
                className={`task-title-text relative min-w-0 flex-1 pr-2 text-sm font-medium leading-tight transition-colors ${taskStatusTitleClass[status as TaskStatus]}`}
                aria-label={node.title || '未命名任務'}
                onClick={(e) => {
                  if (isRecordCaptureMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    insertRecordTaskMention(nodeId, node.title || nodeId);
                  }
                }}
              >
                <span className="block truncate">{node.title || '未命名任務'}</span>
              </h4>
              {showTags && nodeTags.length > 0 ? (
                <KanbanTagSticker tags={nodeTags} />
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
              ref={setChecklistAreaDropRef}
              className={`kanban-checklist-section mx-[9px] mb-[6px] mt-1 rounded-md border-l-2 border-slate-300/80 transition-[background-color,box-shadow] duration-100 ${
                isChecklistTargeted
                  ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                  : isChecklistExpanded
                    ? 'bg-surface-subtask'
                    : 'bg-transparent'
              }`}
              data-task-id={nodeId}
              data-task-drop-surface-kind="checklist-drop"
              data-desktop-drop-surface="true"
              data-desktop-drop-id={`${nodeId}-checklist-area-drop`}
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

          <div
            ref={setChecklistDropRef}
            className={`kanban-card-dropzone absolute inset-x-2 bottom-1 h-7 rounded-md opacity-0 ${
              showChecklistAppendSurface ? 'z-20' : '-z-10 pointer-events-none'
            }`}
            data-task-id={nodeId}
            data-task-drop-surface-kind="checklist-drop"
            data-desktop-drop-surface={showChecklistAppendSurface ? 'true' : undefined}
            data-desktop-drop-id={showChecklistAppendSurface ? `${nodeId}-checklist-drop` : undefined}
            data-desktop-checklist-append-anchor={showChecklistAppendSurface ? 'true' : undefined}
            data-desktop-dropzone-layout="overlay"
            aria-hidden="true"
          />
      </>
      )}
    </div>
  );
};
