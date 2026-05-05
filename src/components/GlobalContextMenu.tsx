import React, { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, GitBranch } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import type { TaskNode } from '../types';
import { TaskDetailsModal } from './TaskDetailsModal';

export const GlobalContextMenu: React.FC = () => {
  const contextMenuState = useBoardStore((state) => state.contextMenuState);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const currentView = useBoardStore((state) => state.currentView);
  const setDependencySelection = useBoardStore((state) => state.setDependencySelection);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const toggleStartDate = useBoardStore((state) => state.toggleStartDate);
  const addNode = useWbsStore((state) => state.addNode);
  const removeNode = useWbsStore((state) => state.removeNode);
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null);

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

    window.addEventListener('scroll', close, true);
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenuState, setContextMenuState]);

  const handleAddChild = () => {
    if (!contextMenuState) return;

    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    if (!node) return;

    if (node.status === 'completed') {
      window.alert('已完成的任務不能新增子任務。');
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

  const menuX =
    contextMenuState?.isOpen
      ? Math.min(contextMenuState.x, Math.max(12, window.innerWidth - 220))
      : 0;
  const menuY =
    contextMenuState?.isOpen
      ? Math.min(contextMenuState.y, Math.max(12, window.innerHeight - 210))
      : 0;

  return (
    <>
      {contextMenuState?.isOpen && (
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

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          <button
            onClick={handleDelete}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 size={14} className="flex-shrink-0 text-red-500" />
            <span>刪除任務</span>
          </button>
        </div>
      )}

      {detailsNodeId && (
        <TaskDetailsModal nodeId={detailsNodeId} onClose={() => setDetailsNodeId(null)} />
      )}
    </>
  );
};
