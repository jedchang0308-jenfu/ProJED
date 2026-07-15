// @ts-nocheck
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Copy, FileText, Plus, Trash2, GitBranch, CornerLeftUp, CornerRightDown, ChevronRight, UserRound, Pencil, LayoutDashboard, X } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import type { TaskNode } from '../types';
import { TaskDetailsModal } from './TaskDetailsModal';
import TaskAssignmentPicker from './TaskAssignmentPicker';
import { toast } from '../store/useToastStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import useDialogStore from '../store/useDialogStore';
import useAuthStore from '../store/useAuthStore';
import { boardService } from '../services/dataBackend';
import {
  OPEN_TASK_DETAILS_EVENT,
  isTextInputTarget,
  prepareNewTaskNaming,
  selectAndOpenTaskDetails,
} from '../utils/taskInteractions';
import { getTaskAssigneeIds } from '../utils/taskAssignments';

export const GlobalContextMenu: React.FC = () => {
  const contextMenuState = useBoardStore((state) => state.contextMenuState);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const selectedTaskId = useBoardStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useBoardStore((state) => state.setSelectedTaskId);
  const setPendingWorkspaceTitleEditId = useBoardStore((state) => state.setPendingWorkspaceTitleEditId);
  const requestCreateWorkspace = useBoardStore((state) => state.requestCreateWorkspace);
  const setPendingBoardTitleEdit = useBoardStore((state) => state.setPendingBoardTitleEdit);
  const workspaces = useBoardStore((state) => state.workspaces);
  const activeBoardId = useBoardStore((state) => state.activeBoardId);
  const addBoard = useBoardStore((state) => state.addBoard);
  const removeBoard = useBoardStore((state) => state.removeBoard);
  const moveBoardToWorkspace = useBoardStore((state) => state.moveBoardToWorkspace);
  const removeWorkspace = useBoardStore((state) => state.removeWorkspace);
  const switchBoard = useBoardStore((state) => state.switchBoard);
  const showHome = useBoardStore((state) => state.showHome);
  const currentView = useBoardStore((state) => state.currentView);
  const setDependencySelection = useBoardStore((state) => state.setDependencySelection);
  const showStartDate = useBoardStore((state) => state.showStartDate);
  const toggleStartDate = useBoardStore((state) => state.toggleStartDate);
  const addNode = useWbsStore((state) => state.addNode);
  const removeNode = useWbsStore((state) => state.removeNode);
  const updateNode = useWbsStore((state) => state.updateNode);
  const duplicateNodeTree = useWbsStore((state) => state.duplicateNodeTree);
  const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, canAssignTask, canCreateDependency, canCreateBoard, canDeleteWorkspace, canEditBoardSettings, canMoveBoardBetweenWorkspaces } = useBoardPermissions();
  const currentUserId = useAuthStore((state) => state.user?.uid);
  const workspaceMembers = useMemberStore((state) => state.workspaceMembers);
  const currentBoardAccess = useMemberStore((state) => state.currentBoardAccess);
  const boardMembers = useMemberStore((state) => state.boardMembers);
  const membersLoading = useMemberStore((state) => state.loading);
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null);
  const [transferBoardTarget, setTransferBoardTarget] = useState(null);
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 12, maxHeight: 320 });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef(0);

  const IGNORE_OPENING_TOUCH_MS = 750;
  const MENU_WIDTH = 220;
  const VIEWPORT_PADDING = 12;
  const isDependencySupportedView = currentView === 'board' || currentView === 'list';
  const menuKind = contextMenuState?.kind || 'task';
  const isTaskMenu = menuKind === 'task';
  const currentNode = isTaskMenu && contextMenuState ? useWbsStore.getState().nodes[contextMenuState.nodeId] : null;
  const getWorkspace = (workspaceId: string) => workspaces.find(workspace => workspace.id === workspaceId);
  const getWorkspaceRole = (workspaceId: string) => {
    if (currentBoardAccess?.workspaceId === workspaceId) return currentBoardAccess.workspaceRole;
    return workspaceMembers.find(member => member.workspaceId === workspaceId && member.userId === currentUserId && member.status === 'active')?.role;
  };
  const isWorkspaceOwner = (workspaceId: string) => {
    const workspace = getWorkspace(workspaceId);
    return Boolean(currentUserId && workspace?.ownerId === currentUserId);
  };
  const canCreateBoardInWorkspace = (workspaceId: string) => {
    if (currentBoardAccess?.workspaceId === workspaceId && canCreateBoard) return true;
    if (isWorkspaceOwner(workspaceId)) return true;
    const role = getWorkspaceRole(workspaceId);
    return role === 'owner' || role === 'admin' || role === 'project_manager';
  };
  const canDeleteWorkspaceInWorkspace = (workspaceId: string) => {
    if (currentBoardAccess?.workspaceId === workspaceId && canDeleteWorkspace) return true;
    if (isWorkspaceOwner(workspaceId)) return true;
    return getWorkspaceRole(workspaceId) === 'owner';
  };
  const canEditBoardSettingsInWorkspace = (workspaceId: string) => {
    if (currentBoardAccess?.workspaceId === workspaceId && canEditBoardSettings) return true;
    if (isWorkspaceOwner(workspaceId)) return true;
    const role = getWorkspaceRole(workspaceId);
    return role === 'owner' || role === 'admin' || role === 'project_manager';
  };
  const canMoveBoardFromWorkspace = (workspaceId: string) => {
    if (currentBoardAccess?.workspaceId === workspaceId && canMoveBoardBetweenWorkspaces) return true;
    if (
      currentBoardAccess?.workspaceId === workspaceId &&
      ['owner', 'admin', 'project_manager'].includes(currentBoardAccess.boardRole || '')
    ) return true;
    if (isWorkspaceOwner(workspaceId)) return true;
    const role = getWorkspaceRole(workspaceId);
    return role === 'owner' || role === 'admin' || role === 'project_manager';
  };
  const assigneeOptions = boardMembers.map(member => ({
    id: member.userId,
    label: member.profile?.displayName || member.profile?.email || member.userId,
    role: member.role,
  }));
  const currentPrimaryIds = getTaskAssigneeIds(currentNode);
  const currentAssigneeLabel = currentPrimaryIds.length === 0
    ? '未指派'
    : currentPrimaryIds.length > 1
      ? `共同主責 ${currentPrimaryIds.length} 人`
      : assigneeOptions.find(member => member.id === currentPrimaryIds[0])?.label || `已離開成員 (${currentPrimaryIds[0]})`;

  const enterDependencyMode = (side: 'start' | 'end') => {
    if (!canCreateDependency) return;
    if (!contextMenuState) return;
    if (!showStartDate) toggleStartDate();
    setDependencySelection({ id: contextMenuState.nodeId, side, title: contextMenuState.title });
    setContextMenuState(null);
  };

  useEffect(() => {
    const handleOpenTaskDetails = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      if (customEvent.detail?.taskId) {
        setSelectedTaskId(customEvent.detail.taskId);
        setDetailsNodeId(customEvent.detail.taskId);
      }
    };

    document.addEventListener(OPEN_TASK_DETAILS_EVENT, handleOpenTaskDetails);

    return () => {
      document.removeEventListener(OPEN_TASK_DETAILS_EVENT, handleOpenTaskDetails);
    };
  }, [setSelectedTaskId]);

  useEffect(() => {
    if (!contextMenuState) return;

    const close = () => setContextMenuState(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenuState, setContextMenuState]);

  useEffect(() => {
    const handleTaskShortcut = (event: KeyboardEvent) => {
      if (!selectedTaskId || detailsNodeId || contextMenuState?.isOpen) return;
      if (!['list', 'board', 'gantt'].includes(currentView)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextInputTarget(event.target)) return;
      if (event.isComposing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        selectAndOpenTaskDetails(selectedTaskId);
      }
    };

    window.addEventListener('keydown', handleTaskShortcut);
    return () => window.removeEventListener('keydown', handleTaskShortcut);
  }, [
    contextMenuState?.isOpen,
    currentView,
    detailsNodeId,
    selectedTaskId,
  ]);

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
    prepareNewTaskNaming(newNode.id);
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
    prepareNewTaskNaming(newNode.id);
    setContextMenuState(null);
  };

  const handleMarkCompleted = () => {
    if (!canEditTask) return;
    if (!contextMenuState) return;

    updateNode(contextMenuState.nodeId, { status: 'completed' });
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

    selectAndOpenTaskDetails(contextMenuState.nodeId);
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

  const handleRenameWorkspace = () => {
    if (!contextMenuState || contextMenuState.kind !== 'workspace') return;
    setPendingWorkspaceTitleEditId(contextMenuState.workspaceId);
    setContextMenuState(null);
  };

  const handleCreateWorkspace = () => {
    requestCreateWorkspace();
    setContextMenuState(null);
  };

  const handleAddBoardToWorkspace = () => {
    if (!contextMenuState || contextMenuState.kind !== 'workspace') return;
    if (!canCreateBoardInWorkspace(contextMenuState.workspaceId)) return;
    const boardId = addBoard(contextMenuState.workspaceId, '未命名看板');
    if (boardId) {
      setPendingBoardTitleEdit({ workspaceId: contextMenuState.workspaceId, boardId });
    }
    setContextMenuState(null);
  };

  const handleDeleteWorkspace = async () => {
    if (!contextMenuState || contextMenuState.kind !== 'workspace') return;
    if (!canDeleteWorkspaceInWorkspace(contextMenuState.workspaceId)) return;
    const { workspaceId, title } = contextMenuState;
    const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除工作區「${title}」嗎？這會一併刪除底下的看板。`);
    if (confirmed) {
      setIsDeletingWorkspace(true);
      try {
        await removeWorkspace(workspaceId);
        toast.success(`已刪除工作區「${title}」。`);
      } catch (error) {
        console.error('[GlobalContextMenu] delete workspace failed:', error);
        toast.error(error instanceof Error ? error.message : '刪除工作區失敗，請重新整理後再試。');
      } finally {
        setIsDeletingWorkspace(false);
      }
    }
    setContextMenuState(null);
  };

  const handleOpenBoard = () => {
    if (!contextMenuState || contextMenuState.kind !== 'board') return;
    switchBoard(contextMenuState.workspaceId, contextMenuState.boardId);
    setContextMenuState(null);
  };

  const handleRenameBoard = () => {
    if (!contextMenuState || contextMenuState.kind !== 'board') return;
    setPendingBoardTitleEdit({
      workspaceId: contextMenuState.workspaceId,
      boardId: contextMenuState.boardId,
    });
    setContextMenuState(null);
  };

  const handleAddSiblingBoard = () => {
    if (!contextMenuState || contextMenuState.kind !== 'board') return;
    if (!canCreateBoardInWorkspace(contextMenuState.workspaceId)) return;
    const boardId = addBoard(contextMenuState.workspaceId, '未命名看板');
    if (boardId) {
      setPendingBoardTitleEdit({ workspaceId: contextMenuState.workspaceId, boardId });
    }
    setContextMenuState(null);
  };

  const handleOpenTransferBoard = () => {
    if (!contextMenuState || contextMenuState.kind !== 'board') return;
    if (!canMoveBoardFromWorkspace(contextMenuState.workspaceId)) return;
    setTransferBoardTarget({
      workspaceId: contextMenuState.workspaceId,
      boardId: contextMenuState.boardId,
      title: contextMenuState.title,
    });
    setContextMenuState(null);
  };

  const handleDeleteBoard = async () => {
    if (!contextMenuState || contextMenuState.kind !== 'board') return;
    if (!canEditBoardSettingsInWorkspace(contextMenuState.workspaceId)) return;
    const { workspaceId, boardId, title } = contextMenuState;
    const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除看板「${title}」嗎？`);
    if (confirmed) {
      removeBoard(workspaceId, boardId);
      if (activeBoardId === boardId) {
        showHome();
      }
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

            {menuKind === 'sidebar' ? (
              <button
                onClick={handleCreateWorkspace}
                className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                data-context-menu-create-workspace="true"
              >
                <Plus size={14} className="flex-shrink-0 text-sky-500" />
                <span>新增工作區</span>
              </button>
            ) : menuKind === 'workspace' ? (
              <>
                <button
                  onClick={handleCreateWorkspace}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  data-context-menu-create-workspace="true"
                >
                  <Plus size={14} className="flex-shrink-0 text-sky-500" />
                  <span>新增工作區</span>
                </button>
                <button
                  onClick={handleRenameWorkspace}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Pencil size={14} className="flex-shrink-0 text-indigo-500" />
                  <span>重新命名工作區</span>
                </button>
                <button
                  onClick={handleAddBoardToWorkspace}
                  disabled={!canCreateBoardInWorkspace(contextMenuState.workspaceId)}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Plus size={14} className="flex-shrink-0 text-sky-500" />
                  <span>新增看板</span>
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={() => void handleDeleteWorkspace()}
                  disabled={isDeletingWorkspace || !canDeleteWorkspaceInWorkspace(contextMenuState.workspaceId)}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} className="flex-shrink-0 text-red-500" />
                  <span>{isDeletingWorkspace ? '刪除中...' : '刪除工作區'}</span>
                </button>
              </>
            ) : menuKind === 'board' ? (
              <>
                <button
                  onClick={handleOpenBoard}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <LayoutDashboard size={14} className="flex-shrink-0 text-indigo-500" />
                  <span>開啟看板</span>
                </button>
                <button
                  onClick={handleRenameBoard}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Pencil size={14} className="flex-shrink-0 text-indigo-500" />
                  <span>重新命名看板</span>
                </button>
                <button
                  onClick={handleAddSiblingBoard}
                  disabled={!canCreateBoardInWorkspace(contextMenuState.workspaceId)}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Plus size={14} className="flex-shrink-0 text-sky-500" />
                  <span>新增看板</span>
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={handleOpenTransferBoard}
                  disabled={!canMoveBoardFromWorkspace(contextMenuState.workspaceId) || workspaces.length < 2}
                  title={workspaces.length < 2 ? '需要至少兩個工作區才能移動看板' : undefined}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <ArrowRightLeft size={14} className="flex-shrink-0 text-indigo-500" />
                  <span>移動到工作區</span>
                </button>
                <button
                  onClick={() => void handleDeleteBoard()}
                  disabled={!canEditBoardSettingsInWorkspace(contextMenuState.workspaceId)}
                  className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} className="flex-shrink-0 text-red-500" />
                  <span>刪除看板</span>
                </button>
              </>
            ) : (
              <>
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
                  <span className="block">主責／協作</span>
                  <span className="block truncate text-[11px] text-gray-400">{currentAssigneeLabel}</span>
                </span>
                <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isAssigneeMenuOpen ? 'rotate-90' : ''}`} />
              </button>

              {isAssigneeMenuOpen && (
                <div className="border-y border-gray-100 bg-gray-50/80 py-1 dark:border-gray-700 dark:bg-gray-900/30">
                  {currentNode ? (
                    <TaskAssignmentPicker
                      node={currentNode}
                      options={assigneeOptions}
                      membersLoading={membersLoading}
                      disabled={!canAssignTask}
                      inline
                      onChange={(primaryIds, collaboratorIds) => updateNode(currentNode.id, {
                        assigneeIds: primaryIds,
                        collaboratorIds,
                        updatedAt: Date.now(),
                      })}
                    />
                  ) : null}
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
              </>
            )}
          </div>
        </>
      )}

      {detailsNodeId && (
        <TaskDetailsModal nodeId={detailsNodeId} onClose={() => setDetailsNodeId(null)} />
      )}
      {transferBoardTarget && (
        <BoardWorkspaceTransferDialog
          sourceWorkspaceId={transferBoardTarget.workspaceId}
          boardId={transferBoardTarget.boardId}
          boardTitle={transferBoardTarget.title}
          workspaces={workspaces}
          onClose={() => setTransferBoardTarget(null)}
          onMove={moveBoardToWorkspace}
        />
      )}
    </>
  );
};

const TRANSFER_REASON_LABELS = {
  source_and_target_are_same: '來源與目標工作區相同',
  source_project_manager_required: '需要來源專案管理權限',
  target_workspace_admin_required: '需要目標工作區 owner/admin 權限',
  project_transfer_locked: '此專案已鎖定禁止搬移',
};

const BoardWorkspaceTransferDialog = ({
  sourceWorkspaceId,
  boardId,
  boardTitle,
  workspaces,
  onClose,
  onMove,
}) => {
  const targetOptions = workspaces.filter(workspace => workspace.id !== sourceWorkspaceId);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(targetOptions[0]?.id || '');
  const [preview, setPreview] = useState(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');
  const selectedTarget = workspaces.find(workspace => workspace.id === targetWorkspaceId);
  const sourceWorkspace = workspaces.find(workspace => workspace.id === sourceWorkspaceId);
  const counts = preview?.counts || {};
  const canSubmit = Boolean(preview && !preview.blocked && confirmTitle.trim() === boardTitle && !isMoving);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.isComposing || isMoving) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isMoving, onClose]);

  useEffect(() => {
    if (!targetWorkspaceId) return;
    let cancelled = false;
    setIsPreviewLoading(true);
    setError('');
    setPreview(null);

    boardService.previewWorkspaceTransfer(sourceWorkspaceId, boardId, targetWorkspaceId)
      .then(result => {
        if (!cancelled) setPreview(result);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : '無法取得搬移預覽');
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceWorkspaceId, boardId, targetWorkspaceId]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsMoving(true);
    setError('');
    try {
      await onMove(sourceWorkspaceId, boardId, targetWorkspaceId, confirmTitle.trim());
      toast.success('專案已移動到目標工作區');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '專案搬移失敗');
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ArrowRightLeft size={17} className="text-indigo-500" />
              移動到工作區
            </div>
            <p className="mt-1 truncate text-sm text-slate-500" title={boardTitle}>{boardTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-400">來源工作區</label>
              <div className="min-h-10 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {sourceWorkspace?.title || sourceWorkspaceId}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-400">目標工作區</label>
              <select
                value={targetWorkspaceId}
                onChange={(event) => {
                  setTargetWorkspaceId(event.target.value);
                  setConfirmTitle('');
                }}
                className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {targetOptions.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>{workspace.title}</option>
                ))}
              </select>
            </div>
          </div>

          {isPreviewLoading ? (
            <div className="border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              正在檢查搬移風險...
            </div>
          ) : null}

          {preview ? (
            <div className="grid gap-3 border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <TransferCount label="任務" value={counts.tasks} />
                <TransferCount label="依賴" value={counts.dependencies} />
                <TransferCount label="標籤" value={counts.tagsToMap ?? counts.remappedTags} />
                <TransferCount label="文件" value={counts.documents} />
                <TransferCount label="紀錄" value={counts.records} />
                <TransferCount label="RAG 重建" value={counts.ragDocumentsToResync ?? counts.ragJobsCreated} />
              </div>
              <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <div>保留成員：{counts.preservedMembers ?? 0}</div>
                <div>移除非目標工作區成員：{counts.removedMembers ?? 0}</div>
                <div>撤銷待處理邀請：{counts.pendingInvitesToRevoke ?? counts.revokedInvites ?? 0}</div>
              </div>
              {preview.blocked ? (
                <div className="flex gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    {(preview.reasons || []).map(reason => (
                      <div key={reason}>{TRANSFER_REASON_LABELS[reason] || reason}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-400">輸入專案名稱確認</label>
            <input
              value={confirmTitle}
              onChange={(event) => setConfirmTitle(event.target.value)}
              placeholder={boardTitle}
              className="h-10 w-full border border-slate-300 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              disabled={!preview || preview.blocked || isMoving}
            />
          </div>

          {error ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="h-10 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="h-10 bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isMoving ? '搬移中...' : `移動到 ${selectedTarget?.title || '工作區'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const TransferCount = ({ label, value }) => (
  <div className="border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">{value ?? 0}</div>
  </div>
);
