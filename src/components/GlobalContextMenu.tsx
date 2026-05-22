import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, Plus, Trash2, GitBranch, CornerLeftUp, CornerRightDown } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import type { TaskNode } from '../types';
import { TaskDetailsModal } from './TaskDetailsModal';
import { toast } from '../store/useToastStore';

export const GlobalContextMenu: React.FC = () => {
  const contextMenuState = useBoardStore((state) => state.contextMenuState);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const currentView = useBoardStore((state) => state.currentView);
  const setDependencySelection = useBoardStore((state) => state.setDependencySelection);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const toggleStartDate = useBoardStore((state) => state.toggleStartDate);
  const addNode = useWbsStore((state) => state.addNode);
  const removeNode = useWbsStore((state) => state.removeNode);
  const updateNode = useWbsStore((state) => state.updateNode);
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null);
  const openedAtRef = useRef(0);

  const IGNORE_OPENING_TOUCH_MS = 750;

  // 支援依賴關係選取的模式 (看板 & 清單)
  const isDependencySupportedView = currentView === 'board' || currentView === 'list';

  /** 進入依賴選取模式：自動開啟開始日顯示 */
  const enterDependencyMode = (side: 'start' | 'end') => {
    if (!contextMenuState) return;
    if (!showStartDate) toggleStartDate();
    setDependencySelection({ id: contextMenuState.nodeId, side, title: contextMenuState.title });
    setContextMenuState(null);
  };

  useEffect(() => {
    if (!contextMenuState) return;

    const close = () => setContextMenuState(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const handleOpenTaskDetails = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      if (customEvent.detail?.taskId) {
        setDetailsNodeId(customEvent.detail.taskId);
      }
    };

    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', handleKey);
    document.addEventListener('open-task-details', handleOpenTaskDetails);

    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('open-task-details', handleOpenTaskDetails);
    };
  }, [contextMenuState, setContextMenuState]);

  useLayoutEffect(() => {
    if (contextMenuState?.isOpen) {
      openedAtRef.current = performance.now();
    }
  }, [contextMenuState?.isOpen, contextMenuState?.nodeId, contextMenuState?.x, contextMenuState?.y]);

  const closeFromOutsideEvent = (event: React.PointerEvent | React.MouseEvent) => {
    const elapsed = performance.now() - openedAtRef.current;

    if (elapsed < IGNORE_OPENING_TOUCH_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setContextMenuState(null);
  };

  const handleAddChild = () => {
    if (!contextMenuState) return;

    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    if (!node) return;

    if (node.status === 'completed') {
      toast.warning('已完成的任務不能新增子任務。');
      setContextMenuState(null);
      return;
    }

    const childrenIds = state.parentNodesIndex[contextMenuState.nodeId] || [];
    const newNode: TaskNode = {
      id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: node.workspaceId,
      boardId: node.boardId,
      parentId: node.id,
      title: '新任務',
      status: 'todo',
      nodeType: 'task',
      order: childrenIds.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addNode(newNode);
    setContextMenuState(null);
  };

  const handleMoveUp = () => {
    if (!contextMenuState) return;
    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    
    if (!node || !node.parentId) {
      toast.warning('已經是最上層任務，無法再往上移動。');
      setContextMenuState(null);
      return;
    }

    const parentNode = state.nodes[node.parentId];
    if (!parentNode) return;

    const newParentId = parentNode.parentId;
    
    updateNode(node.id, { 
      parentId: newParentId,
      order: parentNode.order + 0.1
    });
    
    setContextMenuState(null);
  };

  const handleMoveDown = () => {
    if (!contextMenuState) return;
    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    if (!node) return;

    const siblings = (state.parentNodesIndex[node.parentId || 'root'] || [])
      .map(id => state.nodes[id])
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
      
    const currentIndex = siblings.findIndex(s => s.id === node.id);
    
    if (currentIndex <= 0) {
      toast.warning('沒有前一個相鄰的任務，無法往下移動成為其子任務。');
      setContextMenuState(null);
      return;
    }
    
    const prevSibling = siblings[currentIndex - 1];
    
    if (prevSibling.status === 'completed') {
      toast.warning('無法移動到已完成的任務之下。');
      setContextMenuState(null);
      return;
    }
    
    const newParentId = prevSibling.id;
    const newSiblings = state.parentNodesIndex[newParentId] || [];
    const maxOrder = newSiblings.length > 0 
      ? Math.max(...newSiblings.map(id => state.nodes[id]?.order || 0)) 
      : 0;
    
    updateNode(node.id, { 
      parentId: newParentId,
      order: maxOrder + 1
    });
    
    setContextMenuState(null);
  };

  const handleOpenDetails = () => {
    if (!contextMenuState) return;

    setDetailsNodeId(contextMenuState.nodeId);
    setContextMenuState(null);
  };

  const handleDelete = () => {
    if (!contextMenuState) return;

    if (window.confirm(`確定要刪除「${contextMenuState.title}」嗎？`)) {
      removeNode(contextMenuState.nodeId);
    }
    setContextMenuState(null);
  };

  const MENU_WIDTH = 220;
  const MENU_HEIGHT = isDependencySupportedView ? 320 : 250;

  const menuX =
    contextMenuState?.isOpen
      ? Math.min(contextMenuState.x, Math.max(12, window.innerWidth - MENU_WIDTH))
      : 0;
  const menuY =
    contextMenuState?.isOpen
      ? Math.min(contextMenuState.y, Math.max(12, window.innerHeight - MENU_HEIGHT))
      : 0;

  return (
    <>
      {contextMenuState?.isOpen && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onPointerDown={closeFromOutsideEvent}
            onContextMenu={closeFromOutsideEvent}
          />
          <div
            onClick={(event) => event.stopPropagation()}
            className="fixed z-[9999] flex w-52 flex-col rounded-lg border border-gray-200 bg-white py-1.5 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800"
            style={{ top: menuY, left: menuX }}
          >
          <div className="mb-1 border-b border-gray-100 px-3 py-1.5 dark:border-gray-700/50">
            <p className="truncate text-xs font-semibold text-gray-500" title={contextMenuState.title}>
              {contextMenuState.title}
            </p>
          </div>

          <button
            onClick={handleOpenDetails}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FileText size={14} className="flex-shrink-0 text-indigo-500" />
            <span>更多詳情選項</span>
          </button>

          {/* 依賴關係—在看板及清單模式下顯示 */}
          {isDependencySupportedView && (
            <>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => enterDependencyMode('start')}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-amber-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <GitBranch size={14} className="flex-shrink-0 text-amber-500" />
                <span>設定依賴關係（開始日）</span>
              </button>
              <button
                onClick={() => enterDependencyMode('end')}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-purple-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <GitBranch size={14} className="flex-shrink-0 text-purple-500" />
                <span>設定依賴關係（結束日）</span>
              </button>
            </>
          )}

          <button
            onClick={handleAddChild}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Plus size={14} className="flex-shrink-0 text-blue-500" />
            <span>新增子任務</span>
          </button>

          <button
            onClick={handleMoveUp}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <CornerLeftUp size={14} className="flex-shrink-0 text-emerald-500" />
            <span>往上一階</span>
          </button>

          <button
            onClick={handleMoveDown}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <CornerRightDown size={14} className="flex-shrink-0 text-emerald-500" />
            <span>往下一階</span>
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          <button
            onClick={handleDelete}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 size={14} className="flex-shrink-0 text-red-500" />
            <span>刪除任務</span>
          </button>
          </div>
        </>
      )}

      {detailsNodeId && (
        <TaskDetailsModal nodeId={detailsNodeId} onClose={() => setDetailsNodeId(null)} />
      )}
    </>
  );
};
