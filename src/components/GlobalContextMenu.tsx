import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, FileText, Plus, Trash2, GitBranch, CornerLeftUp, CornerRightDown, ChevronRight, UserRound } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import type { TaskNode } from '../types';
import { TaskDetailsModal } from './TaskDetailsModal';
import { toast } from '../store/useToastStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';

export const GlobalContextMenu: React.FC = () => {
  const contextMenuState = useBoardStore((state) => state.contextMenuState);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const setPendingTitleEditNodeId = useBoardStore((state) => state.setPendingTitleEditNodeId);
  const currentView = useBoardStore((state) => state.currentView);
  const setDependencySelection = useBoardStore((state) => state.setDependencySelection);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const toggleStartDate = useBoardStore((state) => state.toggleStartDate);
  const addNode = useWbsStore((state) => state.addNode);
  const removeNode = useWbsStore((state) => state.removeNode);
  const updateNode = useWbsStore((state) => state.updateNode);
  const duplicateNodeTree = useWbsStore((state) => state.duplicateNodeTree);
  const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, canAssignTask, canCreateDependency } = useBoardPermissions();
  const boardMembers = useMemberStore((state) => state.boardMembers);
  const membersLoading = useMemberStore((state) => state.loading);
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null);
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 12, maxHeight: 320 });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef(0);

  const IGNORE_OPENING_TOUCH_MS = 750;
  const MENU_WIDTH = 220;
  const VIEWPORT_PADDING = 12;
  const isDependencySupportedView = currentView === 'board' || currentView === 'list';
  const currentNode = contextMenuState ? useWbsStore.getState().nodes[contextMenuState.nodeId] : null;
  const assigneeOptions = boardMembers.map(member => ({
    id: member.userId,
    label: member.profile?.displayName || member.profile?.email || member.userId,
    role: member.role,
  }));
  const currentAssigneeLabel =
    assigneeOptions.find(member => member.id === currentNode?.assigneeId)?.label ||
    (currentNode?.assigneeId ? '已離開成員' : '未指派');

  const enterDependencyMode = (side: 'start' | 'end') => {
    if (!canCreateDependency) return;
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
      setIsAssigneeMenuOpen(false);
    }
  }, [contextMenuState?.isOpen, contextMenuState?.nodeId, contextMenuState?.x, contextMenuState?.y]);

  useLayoutEffect(() => {
    if (!contextMenuState?.isOpen) return;

    const updateMenuPosition = () => {
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || MENU_WIDTH;
      const maxHeight = Math.max(160, viewportHeight - VIEWPORT_PADDING * 2);
      const fullMenuHeight = menuRef.current?.scrollHeight || menuRect?.height || 0;
      const menuHeight = Math.min(fullMenuHeight, maxHeight);

      const left = Math.min(
        Math.max(VIEWPORT_PADDING, contextMenuState.x),
        Math.max(VIEWPORT_PADDING, viewportWidth - menuWidth - VIEWPORT_PADDING),
      );

      const desiredTop = contextMenuState.y;
      const availableBottom = viewportHeight - desiredTop - VIEWPORT_PADDING;
      const top = menuHeight > 0 && menuHeight > availableBottom
        ? Math.max(VIEWPORT_PADDING, viewportHeight - menuHeight - VIEWPORT_PADDING)
        : Math.max(VIEWPORT_PADDING, desiredTop);

      setMenuPosition({ left, top, maxHeight });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.visualViewport?.addEventListener('resize', updateMenuPosition);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.visualViewport?.removeEventListener('resize', updateMenuPosition);
    };
  }, [MENU_WIDTH, VIEWPORT_PADDING, contextMenuState?.isOpen, contextMenuState?.nodeId, contextMenuState?.x, contextMenuState?.y, isDependencySupportedView]);

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
    if (!canCreateTask) return;
    if (!contextMenuState) return;

    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    if (!node) return;

    if (node.status === 'completed') {
      toast.warning('已完成的任務不能新增下層任務。');
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
    setPendingTitleEditNodeId(newNode.id);
    setContextMenuState(null);
  };

  const handleAddSibling = () => {
    if (!canCreateTask) return;
    if (!contextMenuState) return;

    const state = useWbsStore.getState();
    const node = state.nodes[contextMenuState.nodeId];
    if (!node) return;

    const parentNode = node.parentId ? state.nodes[node.parentId] : null;
    if (parentNode?.status === 'completed') {
      toast.warning('已完成的父任務不能新增同階任務。');
      setContextMenuState(null);
      return;
    }

    const siblings = (state.parentNodesIndex[node.parentId || 'root'] || [])
      .map(id => state.nodes[id])
      .filter(Boolean)
      .filter(sibling => sibling.boardId === node.boardId)
      .sort((a, b) => a.order - b.order);
    const currentIndex = siblings.findIndex(sibling => sibling.id === node.id);
    const nextSibling = currentIndex >= 0 ? siblings[currentIndex + 1] : null;
    const order = nextSibling ? (node.order + nextSibling.order) / 2 : node.order + 1;

    const newNode: TaskNode = {
      id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: node.workspaceId,
      boardId: node.boardId,
      parentId: node.parentId || null,
      title: '新任務',
      status: 'todo',
      nodeType: node.parentId ? 'task' : node.nodeType,
      order,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addNode(newNode);
    setPendingTitleEditNodeId(newNode.id);
    setContextMenuState(null);
  };

  const handleMarkCompleted = () => {
    if (!canEditTask) return;
    if (!contextMenuState) return;

    updateNode(contextMenuState.nodeId, { status: 'completed' });
    setContextMenuState(null);
  };

  const handleAssign = (assigneeId?: string) => {
    if (!canAssignTask) return;
    if (!contextMenuState) return;

    updateNode(contextMenuState.nodeId, {
      assigneeId: assigneeId || undefined,
      updatedAt: Date.now(),
    });
    setContextMenuState(null);
  };

  const handleMoveUp = () => {
    if (!canMoveTask) return;
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

    updateNode(node.id, {
      parentId: parentNode.parentId,
      order: parentNode.order + 0.1,
    });

    setContextMenuState(null);
  };

  const handleMoveDown = () => {
    if (!canMoveTask) return;
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
      toast.warning('沒有前一個相鄰的任務，無法往下移動成為其下層任務。');
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
      order: maxOrder + 1,
    });

    setContextMenuState(null);
  };

  const handleDuplicate = async () => {
    if (!canCreateTask) return;
    if (!contextMenuState) return;

    try {
      const result = await duplicateNodeTree(contextMenuState.nodeId, {
        includeInternalDependencies: true,
        canCreateDependency,
      });
      if (result) {
        const dependencyText = result.dependencyCount > 0
          ? `，包含 ${result.dependencyCount} 個內部依賴`
          : '';
        toast.success(`已複製 ${result.nodeCount} 個任務${dependencyText}。`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '複製任務失敗。');
    } finally {
      setContextMenuState(null);
    }
  };

  const handleOpenDetails = () => {
    if (!contextMenuState) return;

    setDetailsNodeId(contextMenuState.nodeId);
    setContextMenuState(null);
  };

  const handleDelete = () => {
    if (!canDeleteTask) return;
    if (!contextMenuState) return;

    if (window.confirm(`確定要刪除「${contextMenuState.title}」嗎？`)) {
      removeNode(contextMenuState.nodeId);
    }
    setContextMenuState(null);
  };

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
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
            className="fixed z-[9999] flex w-[220px] flex-col overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800"
            style={{ top: menuPosition.top, left: menuPosition.left, maxHeight: menuPosition.maxHeight }}
          >
            <div className="mb-1 border-b border-gray-100 px-3 py-1.5 dark:border-gray-700/50">
              <p className="truncate text-xs font-semibold text-gray-500" title={contextMenuState.title}>
                {contextMenuState.title}
              </p>
            </div>

            <button
              onClick={handleOpenDetails}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <FileText size={14} className="flex-shrink-0 text-indigo-500" />
              <span>更多詳情選項</span>
            </button>

            <button
              onClick={handleMarkCompleted}
              disabled={!canEditTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-emerald-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500" />
              <span>標示為已完成</span>
            </button>

            <div>
              <button
                type="button"
                onClick={() => setIsAssigneeMenuOpen(current => !current)}
                disabled={!canAssignTask}
                className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <UserRound size={14} className="flex-shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1">
                  <span className="block">指派人</span>
                  <span className="block truncate text-[11px] text-gray-400">{currentAssigneeLabel}</span>
                </span>
                <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isAssigneeMenuOpen ? 'rotate-90' : ''}`} />
              </button>

              {isAssigneeMenuOpen && (
                <div className="border-y border-gray-100 bg-gray-50/80 py-1 dark:border-gray-700 dark:bg-gray-900/30">
                  <button
                    type="button"
                    onClick={() => handleAssign(undefined)}
                    disabled={!canAssignTask}
                    className={`flex min-h-8 w-full items-center gap-2 px-8 py-1.5 text-left text-xs transition-colors hover:bg-white dark:hover:bg-gray-700 ${
                      !currentNode?.assigneeId ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    未指派
                  </button>
                  {membersLoading && assigneeOptions.length === 0 && (
                    <div className="px-8 py-1.5 text-xs text-gray-400">載入成員中...</div>
                  )}
                  {!membersLoading && assigneeOptions.length === 0 && (
                    <div className="px-8 py-1.5 text-xs text-gray-400">沒有可指派成員</div>
                  )}
                  {assigneeOptions.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleAssign(member.id)}
                      disabled={!canAssignTask}
                      className={`flex min-h-8 w-full items-center gap-2 px-8 py-1.5 text-left text-xs transition-colors hover:bg-white dark:hover:bg-gray-700 ${
                        currentNode?.assigneeId === member.id ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{member.label}</span>
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        {member.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleAddSibling}
              disabled={!canCreateTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Plus size={14} className="flex-shrink-0 text-sky-500" />
              <span>新增同階任務</span>
            </button>

            <button
              onClick={handleAddChild}
              disabled={!canCreateTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Plus size={14} className="flex-shrink-0 text-blue-500" />
              <span>新增下層任務</span>
            </button>

            <button
              onClick={() => void handleDuplicate()}
              disabled={!canCreateTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Copy size={14} className="flex-shrink-0 text-slate-500" />
              <span>複製任務</span>
            </button>

            {isDependencySupportedView && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={() => enterDependencyMode('start')}
                  disabled={!canCreateDependency}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-amber-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <GitBranch size={14} className="flex-shrink-0 text-amber-500" />
                  <span>設定依賴關係（開始日）</span>
                </button>
                <button
                  onClick={() => enterDependencyMode('end')}
                  disabled={!canCreateDependency}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-purple-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <GitBranch size={14} className="flex-shrink-0 text-purple-500" />
                  <span>設定依賴關係（結束日）</span>
                </button>
              </>
            )}

            <button
              onClick={handleMoveUp}
              disabled={!canMoveTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <CornerLeftUp size={14} className="flex-shrink-0 text-emerald-500" />
              <span>往上一階</span>
            </button>

            <button
              onClick={handleMoveDown}
              disabled={!canMoveTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <CornerRightDown size={14} className="flex-shrink-0 text-emerald-500" />
              <span>往下一階</span>
            </button>

            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

            <button
              onClick={handleDelete}
              disabled={!canDeleteTask}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
