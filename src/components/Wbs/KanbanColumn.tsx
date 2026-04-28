import React, { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { KanbanCard } from './KanbanCard';
import type { TaskNode } from '../../types';

interface KanbanColumnProps {
  nodeId: string;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId }) => {
  const node = useWbsStore((state) => state.nodes[nodeId]);
  const progress = useWbsStore((state) => state.getNodeProgress(nodeId));
  const addNode = useWbsStore((state) => state.addNode);
  const updateNode = useWbsStore((state) => state.updateNode);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const statusFilters = useBoardStore((state) => state.statusFilters);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);

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
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const childIds = useWbsStore((state) => state.parentNodesIndex[nodeId]);

  const children = React.useMemo(() => {
    const state = useWbsStore.getState();

    return (childIds || [])
      .map((id) => state.nodes[id])
      .filter((child) => child && !child.isArchived && statusFilters[child.status || 'todo'])
      .sort((a, b) => a.order - b.order);
  }, [childIds, statusFilters]);

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

  return (
    <div
      ref={setColumnNodeRef}
      style={columnStyle}
      className={`flex max-h-full w-[270px] flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100/50 shadow-sm transition-all ${
        isColumnDragging ? 'scale-105 rotate-1 opacity-50 shadow-2xl' : ''
      }`}
    >
      <div
        className="group flex flex-col gap-2 bg-white/40 p-3 transition-colors hover:bg-white"
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
          <div
            {...(isEditing ? {} : columnAttributes)}
            {...(isEditing ? {} : columnListeners)}
            className={`-ml-1 p-1 transition-colors touch-none ${
              isEditing
                ? 'cursor-default text-slate-200 opacity-30'
                : 'cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing'
            }`}
            onClick={(event) => event.stopPropagation()}
            title={isEditing ? '' : '拖曳群組'}
          >
            <GripVertical size={16} />
          </div>

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
                  onClick={(event) => event.stopPropagation()}
                  className="min-w-0 flex-1 rounded border border-primary bg-white px-1.5 py-0.5 text-sm font-bold text-slate-700 outline-none ring-2 ring-primary/30"
                />
              ) : (
                <h3
                  className={`truncate text-sm font-bold transition-colors hover:text-primary ${
                    status === 'completed' ? 'text-emerald-600' : 'text-slate-700'
                  }`}
                  onClick={handleStartEdit}
                  title="點擊以編輯群組名稱"
                >
                  {node.title || '未命名群組'}
                </h3>
              )}
            </div>
          </div>
        </div>

        <div className="ml-7 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <span className="font-bold">{children.length}</span>
            <span>任務</span>
          </div>

          {(node.startDate || node.endDate) && (
            <div className="flex items-center gap-1 rounded-sm bg-slate-200/50 px-1.5 py-0.5 font-medium text-slate-500">
              <span>
                {node.startDate
                  ? dayjs(node.startDate).year() !== dayjs().year()
                    ? dayjs(node.startDate).format('YY/MM/DD')
                    : dayjs(node.startDate).format('MM/DD')
                  : '...'}
              </span>
              <span className="opacity-50">至</span>
              <span>
                {node.endDate
                  ? dayjs(node.endDate).year() !== dayjs().year()
                    ? dayjs(node.endDate).format('YY/MM/DD')
                    : dayjs(node.endDate).format('MM/DD')
                  : '...'}
              </span>
            </div>
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
        className={`flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-slate-200 transition-colors ${
          isOver ? 'bg-primary/5 ring-2 ring-inset ring-primary/20' : ''
        }`}
      >
        <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <KanbanCard key={child.id} nodeId={child.id} columnId={nodeId} />
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
