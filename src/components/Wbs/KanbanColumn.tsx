import React from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Link } from 'lucide-react';
import dayjs from 'dayjs';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import { Button } from '../ui/Button';
import { KanbanCard } from './KanbanCard';
import type { TaskNode } from '../../types';
import { useLongPress } from '../../hooks/useLongPress';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { isTaskPrimaryActionTarget, prepareNewTaskNaming, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { isMobileTaskActionMode, MobileTaskActionContext } from './mobileTaskActionContext';
import { useTouchTapGuard } from '../../hooks/useTouchTapGuard';

interface KanbanColumnProps {
  nodeId: string;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  filterProjection?: TaskFilterResultProjection | null;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId, previewNodes, previewParentIndex, filterProjection }) => {
  const storeNode = useWbsStore((state) => state.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const progress = useWbsStore((state) => state.getNodeProgress(nodeId));
  const addNode = useWbsStore((state) => state.addNode);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const selectedTaskId = useBoardStore((state) => state.selectedTaskId);
  const { canCreateTask, canMoveTask, canCreateDependency } = useBoardPermissions();
  const touchTapGuard = useTouchTapGuard();

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const mobileTaskAction = React.useContext(MobileTaskActionContext);
  const mobileActionMode = isMobileTaskActionMode();
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;
  const { active, over } = useDndContext();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId;

  const storeChildIds = useWbsStore((state) => state.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;

  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;

    return (childIds || [])
      .map((id) => nodes[id])
      .filter((child) => child && !child.isArchived && (!filterProjection || filterProjection.visibleTaskIds.has(child.id)))
      .sort((a, b) => a.order - b.order);
  }, [childIds, filterProjection, previewNodes]);

  const {
    attributes: columnAttributes,
    listeners: columnListeners,
    setNodeRef: setColumnNodeRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: isColumnDragging,
  } = useSortable({
    id: nodeId,
    disabled: !canMoveTask || isSelectingMode || mobileActionMode,
    data: {
      type: 'wbs-column',
      nodeId,
    },
  });

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `${nodeId}-drop`,
    disabled: !canMoveTask,
    data: {
      type: 'wbs-column',
      nodeId,
    },
  });

  const columnStyle = {
    transform: CSS.Transform.toString(columnTransform),
    transition: columnTransition,
  };
  const columnHeaderDragBindings = mobileActionMode || isSelectingMode
    ? {}
    : { ...columnAttributes, ...columnListeners };

  const status = node?.status || 'todo';
  const isDueToday = status !== 'completed' && !!node?.endDate && dayjs(node.endDate).isSame(dayjs(), 'day');
  const overData = over?.data.current;
  const overNodeId = overData?.nodeId;
  const nodes = previewNodes || useWbsStore.getState().nodes;
  const isOverColumnDescendant = (() => {
    if (!overNodeId) return false;
    if (overNodeId === nodeId) return true;

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
  const isChecklistLayerTargeted = Boolean(
    overData?.type === 'wbs-checklist-drop' ||
    (activeType === 'wbs-checklist' && overData?.type === 'wbs-checklist')
  );
  const isCardLayerTargeted = Boolean(
    active &&
    activeNodeId !== nodeId &&
    ['wbs-card', 'wbs-checklist'].includes(activeType || '') &&
    !isChecklistLayerTargeted &&
    (isOver || overData?.nodeId === nodeId || isOverColumnDescendant)
  );

  const handleAddCard = () => {
    if (!canCreateTask) return;
    if (!node) return;
    const newNode: TaskNode = {
      id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      workspaceId: activeWorkspaceId || '',
      boardId: node.boardId,
      parentId: nodeId,
      title: '新任務',
      status: 'todo',
      nodeType: 'task',
      order: children.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addNode(newNode);
    prepareNewTaskNaming(newNode.id);
  };

  // 手機長按進入精簡 action rail；非手機觸控保留完整選單 fallback。
  const longPressHandlers = useLongPress(
    (e) => {
      if (!node) return;
      if (mobileActionMode) {
        mobileTaskAction?.begin({ id: nodeId, title: node.title, status: node.status }, e);
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId,
        title: node.title || '未命名任務',
      });
    },
    { delay: 500, tolerance: 8 }
  );

  const columnHeaderTouchHandlers = {
    ...longPressHandlers,
    onTouchStart: (e: React.TouchEvent) => {
      touchTapGuard.handlers.onTouchStart(e);
      longPressHandlers.onTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (mobileTaskAction?.isActive(nodeId)) {
        mobileTaskAction.move(e);
        return;
      }
      touchTapGuard.handlers.onTouchMove(e);
      longPressHandlers.onTouchMove(e);
    },
    onTouchEnd: (e: React.TouchEvent) => {
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
  if (!node) {
    return null;
  }

  return (
    <div
      ref={setColumnNodeRef}
      style={columnStyle}
      data-kanban-column="true"
      className={`flex max-h-full w-[270px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/75 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all ${
        isColumnDragging ? 'scale-105 rotate-1 opacity-50 shadow-2xl' : ''
      }`}
    >
      <div
        {...columnHeaderDragBindings}
        {...columnHeaderTouchHandlers}
        data-task-id={nodeId}
        data-mobile-drop-target={nodeId}
        data-task-drag-surface="true"
        data-task-drag-surface-kind="kanban-column-header"
        data-task-selected={selectedTaskId === nodeId ? 'true' : undefined}
        data-touch-tap-guard="true"
        data-kanban-column-header="true"
        className={`group mobile-pan-item flex flex-col gap-1 border-b border-slate-200/70 bg-white px-[10px] py-[8px] transition-colors hover:bg-primary/[0.02] ${
            isSelectingMode
                ? isSelfNode
                    ? 'cursor-crosshair ring-2 ring-inset ring-amber-400 bg-amber-50/50'
                    : 'cursor-crosshair hover:bg-amber-50/30'
                : ''
        } ${selectedTaskId === nodeId ? 'ring-2 ring-inset ring-primary/30 bg-primary/[0.04]' : ''}`}
        onClick={(event) => {
          if (isSelectingMode || isTaskPrimaryActionTarget(event.target)) return;
          selectAndOpenTaskDetails(nodeId);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenuState({
            kind: 'task',
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
            nodeId,
            title: node.title || '未命名任務',
          });
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
              <h3
                className={`task-title-text truncate text-sm font-medium transition-colors hover:text-primary ${
                  status === 'completed' ? 'text-emerald-600' : 'text-slate-700'
                }`}
                title={node.title || '未命名任務'}
              >
                {node.title || '未命名任務'}
              </h3>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <span className="font-bold">{children.length}</span>
            <span>任務</span>
          </div>

          {/* 日期區 — 選取模式顯示可點擊按鈕，一般模式顯示原始日期標籤 */}
          {isSelectingMode ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 開始日按鈕 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfStart
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100 cursor-crosshair'
                }`}
                title="點擊選取此列表的開始日為依賴目標"
              >
                <Link size={9} />
                <span>開始 {node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
              </button>
              {/* 結束日按鈕 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfEnd
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-purple-50 border-purple-300 text-purple-600 hover:bg-purple-100 cursor-crosshair'
                }`}
                title="點擊選取此列表的結束日為依賴目標"
              >
                <Link size={9} />
                <span>結束 {node.endDate ? dayjs(node.endDate).format('MM/DD') : '...'}</span>
              </button>
            </div>
          ) : (
          <>{( (showStartDate && node.startDate) || node.endDate) && (
            <div className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium ${
              isDueToday
                ? 'border border-orange-300 bg-orange-50 text-orange-600 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]'
                : 'bg-slate-200/50 text-slate-500'
            }`}>
              {showStartDate && (
                  <>
                      <span>
                        {node.startDate
                          ? dayjs(node.startDate).year() !== dayjs().year()
                            ? dayjs(node.startDate).format('YY/MM/DD')
                            : dayjs(node.startDate).format('MM/DD')
                          : '...'}
                      </span>
                      <span className="opacity-50">至</span>
                  </>
              )}
              <span>
                {node.endDate
                  ? dayjs(node.endDate).year() !== dayjs().year()
                    ? dayjs(node.endDate).format('YY/MM/DD')
                    : dayjs(node.endDate).format('MM/DD')
                  : '...'}
              </span>
            </div>
          )}</>
          )}

          <div className="flex items-center gap-1">
            <span className="font-bold">{Math.round(progress)}%</span>
          </div>

          <div className="h-1 max-w-[80px] flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress === 100 ? 'bg-emerald-400' : progress > 0 ? 'bg-blue-400' : 'bg-slate-200'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div
        ref={setDropNodeRef}
        className={`scroll-container mobile-pan-surface flex-1 overflow-y-auto px-[8px] py-[8px] scrollbar-thin scrollbar-thumb-slate-200 border rounded-md transition-[background-color,border-color,box-shadow] duration-100 mx-0 mb-0 ${
          isCardLayerTargeted ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : 'border-transparent'
        }`}
        data-mobile-pan-surface="kanban-column"
      >
        <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <KanbanCard
              key={child.id}
              nodeId={child.id}
              columnId={nodeId}
              previewNodes={previewNodes}
              previewParentIndex={previewParentIndex}
              filterProjection={filterProjection}
            />
          ))}
        </SortableContext>

        <div className="mt-[6px]">
          <Button
            type="button"
            variant="dashed"
            size="none"
            fullWidth
            disabled={!canCreateTask}
            onClick={handleAddCard}
            data-kanban-add-task-button="true"
            className="gap-1.5 px-[10px] py-[5px] text-xs font-semibold group"
          >
            <Plus size={14} className="transition-transform group-hover:scale-110" />
            新增任務
          </Button>
        </div>

        <div className="mobile-pan-rail" data-mobile-pan-rail="kanban-column" aria-hidden="true" />
      </div>
    </div>
  );
};
