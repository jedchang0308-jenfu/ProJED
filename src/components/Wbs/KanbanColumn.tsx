import React, { useEffect, useRef, useState } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Link } from 'lucide-react';
import dayjs from 'dayjs';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { KanbanCard } from './KanbanCard';
import type { TaskNode } from '../../types';
import { useLongPress } from '../../hooks/useLongPress';

interface KanbanColumnProps {
  nodeId: string;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId, previewNodes, previewParentIndex }) => {
  const storeNode = useWbsStore((state) => state.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const progress = useWbsStore((state) => state.getNodeProgress(nodeId));
  const addNode = useWbsStore((state) => state.addNode);
  const updateNode = useWbsStore((state) => state.updateNode);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const statusFilters = useBoardStore((state) => state.statusFilters);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);

  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;
  const { active, over } = useDndContext();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const addTaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditValue(node?.title || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node?.title) {
      updateNode(nodeId, { title: trimmed, updatedAt: Date.now() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const storeChildIds = useWbsStore((state) => state.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;

  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;

    return (childIds || [])
      .map((id) => nodes[id])
      .filter((child) => child && !child.isArchived && statusFilters[child.status || 'todo'])
      .sort((a, b) => a.order - b.order);
  }, [childIds, statusFilters, previewNodes]);

  const {
    attributes: columnAttributes,
    listeners: columnListeners,
    setNodeRef: setColumnNodeRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: isColumnDragging,
  } = useSortable({
    id: nodeId,
    data: {
      type: 'wbs-column',
      nodeId,
    },
  });

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `${nodeId}-drop`,
    data: {
      type: 'wbs-column',
      nodeId,
    },
  });

  const columnStyle = {
    transform: CSS.Transform.toString(columnTransform),
    transition: columnTransition,
  };

  if (!node) {
    return null;
  }

  const status = node.status || 'todo';
  const isDueToday = status !== 'completed' && !!node.endDate && dayjs(node.endDate).isSame(dayjs(), 'day');
  const overData = over?.data.current;
  const overNodeId = overData?.nodeId;
  const nodes = previewNodes || useWbsStore.getState().nodes;
  const isOverColumnDescendant = (() => {
    if (!overNodeId) return false;
    if (overNodeId === nodeId) return true;

    let current = nodes[overNodeId]?.parentId;
    while (current) {
      if (current === nodeId) return true;
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

  const handleAddCard = (title?: string) => {
    const trimmedTitle = title?.trim();
    const newNode: TaskNode = {
      id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      workspaceId: activeWorkspaceId || '',
      boardId: node.boardId,
      parentId: nodeId,
      title: trimmedTitle || '新任務',
      status: 'todo',
      nodeType: 'task',
      order: children.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addNode(newNode);
  };

  const handleAddTaskSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleAddCard(newTaskTitle);
    setNewTaskTitle('');
    addTaskInputRef.current?.focus();
  };

  // 手機長按開啟右鍵選單（500ms，長於拖曳的 250ms，移動超過 8px 則取消）
  const longPressHandlers = useLongPress(
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      setContextMenuState({
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId,
        title: node.title || '未命名群組',
      });
    },
    { delay: 500, tolerance: 8 }
  );

  return (
    <div
      ref={setColumnNodeRef}
      style={columnStyle}
      className={`flex max-h-none w-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100/50 shadow-sm transition-all sm:max-h-full sm:w-[270px] ${
        isColumnDragging ? 'scale-105 rotate-1 opacity-50 shadow-2xl' : ''
      }`}
    >
      <div
        {...(isEditing || isSelectingMode ? {} : columnAttributes)}
        {...(isEditing || isSelectingMode ? {} : columnListeners)}
        {...longPressHandlers}
        className={`group flex flex-col gap-2 bg-white/40 p-3 transition-colors hover:bg-white ${
            isSelectingMode
                ? isSelfNode
                    ? 'cursor-crosshair ring-2 ring-inset ring-amber-400 bg-amber-50/50'
                    : 'cursor-crosshair hover:bg-amber-50/30'
                : isEditing ? '' : 'cursor-grab active:cursor-grabbing touch-none'
        }`}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenuState({
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
            nodeId,
            title: node.title || '未命名群組',
          });
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full bg-status-${status}`} />

              {isEditing ? (
                <input
                  ref={titleInputRef}
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="min-w-0 flex-1 rounded border border-primary bg-white px-1.5 py-0.5 text-sm font-bold text-slate-700 outline-none ring-2 ring-primary/30"
                />
              ) : (
                <h3
                  className={`truncate text-sm font-bold transition-colors hover:text-primary ${
                    status === 'completed' ? 'text-emerald-600' : 'text-slate-700'
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleStartEdit}
                  title="點擊以編輯群組名稱"
                >
                  {node.title || '未命名群組'}
                </h3>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <span className="font-bold">{children.length}</span>
            <span>任務</span>
          </div>

          {/* 日期區 — 選取模式顯示可點擊按鈕，一般模式顯示原始日期標籤 */}
          {isSelectingMode ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 開始日按鈕 */}
              <button
                onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all ${
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
                onClick={(e) => { e.stopPropagation(); kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all ${
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
        className={`flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-slate-200 border rounded-md transition-[background-color,border-color,box-shadow] duration-100 mx-1 mb-1 ${
          isCardLayerTargeted ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : 'border-transparent'
        }`}
      >
        <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <KanbanCard
              key={child.id}
              nodeId={child.id}
              columnId={nodeId}
              previewNodes={previewNodes}
              previewParentIndex={previewParentIndex}
            />
          ))}
        </SortableContext>

        <form className="mt-2 space-y-2" onSubmit={handleAddTaskSubmit}>
          <Input
            ref={addTaskInputRef}
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="輸入任務名稱"
            className="h-9 bg-white text-xs"
          />
          <Button
            type="submit"
            variant="dashed"
            size="none"
            fullWidth
            className="gap-2 py-2 px-3 text-xs font-bold group"
          >
            <Plus size={14} className="transition-transform group-hover:scale-110" />
            新增任務
          </Button>
        </form>
      </div>
    </div>
  );
};
