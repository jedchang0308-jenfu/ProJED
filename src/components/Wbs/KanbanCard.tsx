/**
 * KanbanCard — 渲染 WBS Level 2 節點為可拖曳的 Kanban 任務卡
 * 設計意圖：取代舊版 Card.tsx，資料來源改為 useWbsStore 的 TaskNode。
 * 卡片內部嵌入 KanbanChecklist 以遞迴呈現 Level 3+ 的下層任務。
 * 
 * 【標題功能】卡片採閱讀優先；任務名稱編輯集中在任務詳情頁。
 */
import React, { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, CheckSquare, ChevronDown, ChevronRight, Link } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { KanbanChecklist } from './KanbanChecklist';
import { KanbanDependencyContext } from '../BoardView';
import { isMobileTaskActionMode, MobileTaskActionContext } from './mobileTaskActionContext';
import { Badge } from '../ui/Badge';
import { useLongPress } from '../../hooks/useLongPress';
import { useTagStore } from '../../store/useTagStore';
import { getNodeTags } from '../../utils/tags';
import { TagChip } from '../Tags/TagChip';
import dayjs from 'dayjs';
import type { TaskStatus } from '../../types';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { useTouchTapGuard } from '../../hooks/useTouchTapGuard';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { TaskDateBadge } from './TaskDateBadge';
import { KanbanInsertionMarker } from './KanbanInsertionMarker';

interface KanbanCardProps {
  nodeId: string;       // Level 2 TaskNode 的 ID
  columnId: string;     // 所屬的 Level 1 列表 ID（用於 DnD 跨列識別）
  previewNodes?: Record<string, any> | null;
  previewParentIndex?: Record<string, string[]> | null;
  filterProjection?: TaskFilterResultProjection | null;
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

const statusBorderColorMap: Record<TaskStatus, string> = {
  todo: 'border-l-slate-300',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-emerald-400',
  delayed: 'border-l-orange-500',
  unsure: 'border-l-purple-500',
  onhold: 'border-l-slate-300',
};

const isFromChecklistItem = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('.kanban-checklist-item[data-task-id]'));

export const KanbanCard: React.FC<KanbanCardProps> = ({ nodeId, columnId, previewNodes, previewParentIndex, filterProjection }) => {
  const storeNode = useWbsStore(s => s.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const progress = useWbsStore(s => s.getNodeProgress(nodeId));
  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const showStartDate = useBoardStore(s => s.showStartDate);
  const showTags = useBoardStore(s => s.showTags);
  const selectedTaskId = useBoardStore(s => s.selectedTaskId);
  const tags = useTagStore(s => s.tags);
  const { canMoveTask, canCreateDependency } = useBoardPermissions();
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const mobileTaskAction = React.useContext(MobileTaskActionContext);
  const mobileActionMode = isMobileTaskActionMode();
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
  const touchTapGuard = useTouchTapGuard();

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
    disabled: !canMoveTask || isSelectingMode || isRecordCaptureMode || mobileActionMode,
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
    disabled: !canMoveTask || activeType === 'wbs-card',
    data: {
      type: 'wbs-card-drop',
      nodeId,
      columnId,
    },
  });

  const { setNodeRef: setChecklistDropRef, isOver: isChecklistDropOver } = useDroppable({
    id: `${nodeId}-checklist-drop`,
    disabled: !canMoveTask || !['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType || '') || activeNodeId === nodeId,
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragSurfaceBindings = mobileActionMode || isSelectingMode || isRecordCaptureMode
    ? {}
    : { ...attributes, ...listeners };

  const status = node?.status || 'todo';
  const nodeTags = getNodeTags(node, tags);
  const canDropIntoChecklist = canMoveTask && ['wbs-column', 'wbs-card'].includes(activeType || '') && activeNodeId !== nodeId;
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

  // 手機長按進入精簡 action rail；非手機觸控才保留原本完整選單 fallback。
  const longPressHandlers = useLongPress(
    (e) => {
      if (!node) return;
      if (mobileActionMode) {
        mobileTaskAction?.begin({ id: nodeId, title: node.title, status: node.status }, e);
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      setContextMenuState({ kind: 'task', isOpen: true, x: touch.clientX, y: touch.clientY, nodeId, title: node.title });
    },
    { delay: 500, tolerance: 8 }
  );

  const cardLongPressHandlers = {
    ...longPressHandlers,
    onTouchStart: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      touchTapGuard.handlers.onTouchStart(e);
      longPressHandlers.onTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      if (mobileTaskAction?.isActive(nodeId)) {
        mobileTaskAction.move(e);
        return;
      }
      touchTapGuard.handlers.onTouchMove(e);
      longPressHandlers.onTouchMove(e);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      if (mobileTaskAction?.isActive(nodeId)) {
        touchTapGuard.handlers.onTouchEnd(e);
        mobileTaskAction.end(e);
        longPressHandlers.onTouchEnd(e);
        return;
      }
      touchTapGuard.handlers.onTouchEnd(e);
      longPressHandlers.onTouchEnd(e);
    },
    onTouchCancel: (e: React.TouchEvent) => {
      if (isFromChecklistItem(e.target)) return;
      if (mobileTaskAction?.isActive(nodeId)) {
        touchTapGuard.handlers.onTouchCancel(e);
        mobileTaskAction.cancel(e);
        longPressHandlers.onTouchCancel(e);
        return;
      }
      touchTapGuard.handlers.onTouchCancel(e);
      longPressHandlers.onTouchCancel(e);
    },
    onClickCapture: (e: React.MouseEvent) => {
      touchTapGuard.handlers.onClickCapture(e);
      if (!e.isPropagationStopped()) longPressHandlers.onClickCapture(e);
    },
  };

  // Keep all hooks above this guard so missing data never changes hook order.
  if (!node) return null;

  return (
    <div
      ref={mergedRef}
      style={style}
      {...dragSurfaceBindings}
      {...cardLongPressHandlers}
      onClick={(e) => {
        if (isRecordCaptureMode) {
          e.preventDefault();
          e.stopPropagation();
          insertRecordTaskMention(nodeId, node.title || nodeId);
          return;
        }
        if (isDragging || isSelectingMode || isTaskPrimaryActionTarget(e.target)) return;
        selectAndOpenTaskDetails(nodeId);
      }}
      onContextMenu={(e) => {
          e.preventDefault();
          if (isRecordCaptureMode) return;
          setContextMenuState({ kind: 'task', isOpen: true, x: e.clientX, y: e.clientY, nodeId, title: node.title });
      }}
      data-task-id={nodeId}
      data-mobile-drop-target={nodeId}
      data-task-drag-surface="true"
      data-task-drag-surface-kind="kanban-card"
      data-kanban-drag-source-placeholder={isDragging ? 'true' : undefined}
      data-task-selected={selectedTaskId === nodeId ? 'true' : undefined}
      data-touch-tap-guard="true"
      className={`kanban-task-card mobile-pan-item relative kanban-scroll-touch bg-white border border-l-[3px] ${statusBorderColorMap[status as TaskStatus] || statusBorderColorMap.todo} rounded-lg shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all group mb-[6px] ${
        isDragging
          ? 'border-transparent bg-transparent shadow-none'
          : isRecordCaptureMode
            ? isRecordSelected
              ? 'cursor-pointer border-blue-500 bg-blue-50 ring-2 ring-blue-300 shadow-md'
              : 'cursor-pointer border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-md'
          : isSelectingMode
            ? isSelfNode
              ? 'border-amber-400 ring-2 ring-amber-300 shadow-md'
              : 'border-slate-200 hover:border-amber-300 hover:shadow-md cursor-crosshair'
            : 'cursor-pointer border-slate-200 hover:border-primary/40 hover:bg-primary/[0.02] hover:shadow-md'
      } ${!isDragging && selectedTaskId === nodeId ? 'ring-2 ring-primary/35 bg-primary/[0.03]' : ''}`}
    >
      {isDragging ? (
        <KanbanInsertionMarker className="px-[9px] py-2" />
      ) : (
      <div className="kanban-task-card-body flex items-start px-[9px] py-[6px]">
        {/* 卡片內容 — root surface 承接拖曳，互動子元件由 sensor 層防誤觸 */}
        <div className="flex-1 min-w-0">
          {/* 標題列 */}
          <div className="kanban-task-title-row flex items-start justify-between gap-1">
            <div className="kanban-task-title-content flex items-center gap-1 flex-1 min-w-0">
              {/* 行內編輯：編輯模式 → input；一般模式 → 點擊觸發編輯 */}
              {isRecordCaptureMode ? (
                <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isRecordSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white'
                }`}>
                  {isRecordSelected ? <Check size={11} /> : null}
                </span>
              ) : null}

              <h4
                className={`task-title-text text-sm font-medium leading-tight flex-1 truncate transition-colors ${
                  statusTextColorMap[status as TaskStatus]
                }`}
                onClick={(e) => {
                  if (isRecordCaptureMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    insertRecordTaskMention(nodeId, node.title || nodeId);
                  }
                }}
                title={node.title || '未命名任務'}
              >
                {node.title || '未命名任務'}
              </h4>
            </div>
          </div>

          {/* 日期與進度指標 */}
          {showTags && nodeTags.length > 0 && (
            <div className="mt-px flex max-w-full flex-wrap gap-0.5">
              {nodeTags.slice(0, 4).map(tag => (
                <TagChip key={tag.id} tag={tag} compact />
              ))}
              {nodeTags.length > 4 && (
                <span className="rounded-sm bg-slate-100 px-1 py-0 text-[9px] font-semibold text-slate-500">
                  +{nodeTags.length - 4}
                </span>
              )}
            </div>
          )}

          {(isSelectingMode || node.startDate || node.endDate || hasChildren) && (
            <div onPointerDown={(e) => e.stopPropagation()} className="kanban-task-meta flex flex-wrap items-center gap-1 mt-px text-[10px] text-slate-400">

              {/* 選取模式：始終顯示兩顆日期按鈕（無日期時顯示 "..."） */}
              {isSelectingMode ? (
                <>
                  {/* 開始日按鈕 — 始終顯示 */}
                  <button
                    disabled={!canCreateDependency}
                    onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                    className={`flex items-center gap-1 px-1.5 py-0 rounded-full border text-[10px] font-semibold transition-all ${
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
                    disabled={!canCreateDependency}
                    onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                    className={`flex items-center gap-1 px-1.5 py-0 rounded-full border text-[10px] font-semibold transition-all ${
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
              <TaskDateBadge
                startDate={node.startDate}
                endDate={node.endDate}
                status={status}
                showStartDate={showStartDate}
                startLocked={lockStatus.startLocked}
                endLocked={lockStatus.endLocked}
                durationLocked={Boolean(node.isDurationLocked)}
              />

              {/* 子節點完成進度 */}
              {hasChildren && (
                <Badge
                  variant={childStats.completed === childStats.total ? 'success' : 'default'}
                  size="sm"
                  icon={<CheckSquare size={10} />}
                >
                  <span className="font-semibold">{childStats.completed}/{childStats.total}</span>
                </Badge>
              )}
              </> /* end normal mode */
              )}
            </div>
          )}

          {/* 進度條 (僅在有子節點時顯示) */}
          {hasChildren && (
            <div className="kanban-task-progress mt-px">
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
              className={`kanban-checklist-section mt-px rounded-md border transition-[background-color,border-color,box-shadow] duration-100 ${
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
                className="kanban-checklist-toggle flex items-center gap-0.5 px-1 py-0 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isChecklistExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{isChecklistExpanded ? '收合' : '展開'}下層任務</span>
              </button>

              {isChecklistExpanded && (
                <div className="kanban-checklist-body px-0.5 pb-0">
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
            className={`kanban-card-dropzone mt-px rounded-md transition-[height,opacity] duration-100 ${
              showChecklistDropZone ? 'h-6 opacity-100' : 'h-0 overflow-hidden opacity-0'
            }`}
          >
            {showChecklistDropZone ? <KanbanInsertionMarker compact className="px-1" /> : null}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
