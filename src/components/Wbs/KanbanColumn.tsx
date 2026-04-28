/**
 * KanbanColumn — 渲染 WBS Level 1 (根節點) 為 Kanban 列表直行
 * 設計意圖：取代舊版 List.tsx 在看板中的角色。
 * 每個列表欄對應一個 WBS 根群組，欄內的卡片為該群組的 Level 2 子節點。
 * 
 * 【編輯功能】點擊群組標題可行內編輯，Enter 或失焦即儲存，ESC 取消。
 */
import React, { useRef, useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanCard } from './KanbanCard';
import { Button } from '../ui/Button';
import type { TaskNode } from '../../types';

interface KanbanColumnProps {
  nodeId: string;   // Level 1 (根) TaskNode 的 ID
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId }) => {
  const node = useWbsStore(s => s.nodes[nodeId]);
  const progress = useWbsStore(s => s.getNodeProgress(nodeId));
  const addNode = useWbsStore(s => s.addNode);
  const updateNode = useWbsStore(s => s.updateNode);
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);

  // 群組標題行內編輯狀態
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 進入編輯模式時自動聚焦並全選文字
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  /** 開始編輯群組標題 */
  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(node?.title || '');
    setIsEditing(true);
  };

  /** 儲存群組標題變更 */
  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node?.title) {
      updateNode(nodeId, { title: trimmed, updatedAt: Date.now() });
    }
    setIsEditing(false);
  };

  /** 鍵盤事件：Enter 儲存，ESC 取消 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // 訂閱 Level 2 子節點 ID 陣列
  const childIds = useWbsStore(s => s.parentNodesIndex[nodeId]);

  // 取得排序後的子節點 (Level 2 卡片)
  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    return (childIds || [])
      .map(id => state.nodes[id])
      .filter(n => n && !n.isArchived && statusFilters[n.status || 'todo'])
      .sort((a, b) => a.order - b.order);
  }, [childIds, statusFilters]);

  // dnd-kit 列表拖動（列表之間的排序）
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
    }
  });

  // dnd-kit 卡片放置區域
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `${nodeId}-drop`,
    data: {
      type: 'wbs-column',
      nodeId,
    }
  });

  const columnStyle = {
    transform: CSS.Transform.toString(columnTransform),
    transition: columnTransition,
  };

  if (!node) return null;

  const status = node.status || 'todo';

  /** 在此列表中新增一個 Level 2 任務 */
  const handleAddCard = () => {
    const newNode: TaskNode = {
      id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      workspaceId: activeWorkspaceId || '',
      boardId: node.boardId,
      parentId: nodeId,   // 掛在這個 Level 1 節點底下
      title: '新任務',
      status: 'todo',
      nodeType: 'task',
      order: children.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addNode(newNode);
  };

  return (
    <div
      ref={setColumnNodeRef}
      style={columnStyle}
      className={`flex-shrink-0 w-[270px] flex flex-col max-h-full bg-slate-100/50 rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${
        isColumnDragging ? 'opacity-50 shadow-2xl scale-105 rotate-1' : ''
      }`}
    >
      {/* 列表頭部 (Header) — 右鍵/長按觸發全域選單 */}
      <div
        className="p-3 flex flex-col gap-2 group bg-white/40 hover:bg-white transition-colors"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuState({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, title: node.title || '未命名群組' });
        }}
      >
        <div className="flex items-center gap-2">
          {/* 拖動手柄 — 編輯模式下停用，避免衝突 */}
          <div
            {...(isEditing ? {} : columnAttributes)}
            {...(isEditing ? {} : columnListeners)}
            className={`transition-colors p-1 -ml-1 touch-none ${
              isEditing
                ? 'cursor-default text-slate-200 opacity-30'
                : 'cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500'
            }`}
            onClick={(e) => e.stopPropagation()}
            title={isEditing ? '' : '拖動列表'}
          >
            <GripVertical size={16} />
          </div>

          {/* 列表標題 — 點擊可行內編輯 */}
          <div className="flex items-center justify-between flex-1">
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <div className={`w-2.5 h-2.5 rounded-full bg-status-${status} shrink-0`} />

              {isEditing ? (
                /* 編輯模式：第入圖層的 input */
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 font-bold text-sm bg-white border border-primary rounded px-1.5 py-0.5 outline-none ring-2 ring-primary/30 text-slate-700 min-w-0"
                />
              ) : (
                /* 一般模式：點擊觸發編輯 */
                <h3
                  className={`font-bold text-sm truncate cursor-text hover:text-primary transition-colors ${
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

        {/* 統計資訊 */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 ml-7">
          <div className="flex items-center gap-1">
            <span className="font-bold">{children.length}</span>
            <span>項任務</span>
          </div>
          {/* 進度百分比 */}
          <div className="flex items-center gap-1">
            <span className="font-bold">{Math.round(progress)}%</span>
          </div>
          {/* 進度條 */}
          <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden max-w-[80px]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress === 100 ? 'bg-emerald-400' : progress > 0 ? 'bg-blue-400' : 'bg-slate-200'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 卡片放置區域 (Drop Zone) */}
      <div
        ref={setDropNodeRef}
        className={`flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-slate-200 transition-colors ${
          isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''
        }`}
      >
        <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {children.map(child => (
            <KanbanCard key={child.id} nodeId={child.id} columnId={nodeId} />
          ))}
        </SortableContext>

        {/* 新增卡片按鈕 */}
        <Button
          variant="dashed"
          size="none"
          fullWidth
          onClick={handleAddCard}
          className="py-2 px-3 text-xs font-bold gap-2 group mt-2"
        >
          <Plus size={14} className="group-hover:scale-110 transition-transform" />
          新增任務
        </Button>
      </div>
    </div>
  );
};
