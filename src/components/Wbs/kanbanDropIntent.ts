import type { TaskNode, TaskStatus } from '../../types';

export const KANBAN_PARENT_LOCK_DELAY_MS = 750;
export const KANBAN_PARENT_UNLOCK_GRACE_MS = 200;
export const KANBAN_MOBILE_LOCK_TOLERANCE_PX = 20;

export type KanbanDropPhase = 'idle' | 'same-parent' | 'arming' | 'locked' | 'invalid';
export type KanbanDropPosition = 'before' | 'after' | 'append';
export type KanbanDropTargetKind = 'task-anchor' | 'parent-group' | 'child-empty-lane';

export type KanbanResolvedDropTarget = {
  kind: KanbanDropTargetKind;
  parentId: string | null;
  parentKey: string;
  anchorNodeId: string | null;
  position: KanbanDropPosition;
  order: number;
  nodeType: TaskNode['nodeType'];
  workspaceId: string;
  boardId: string;
  sameParent: boolean;
  valid: boolean;
  invalidReason: string | null;
};

export type KanbanDropIntentState = {
  phase: KanbanDropPhase;
  sourceNodeId: string | null;
  sourceParentId: string | null;
  candidateParentId: string | null;
  lockedParentId: string | null;
  anchorNodeId: string | null;
  position: KanbanDropPosition | null;
  targetKind: KanbanDropTargetKind | null;
  startedAt: number | null;
  outsideSince: number | null;
  progress: number;
  invalidReason: string | null;
  target: KanbanResolvedDropTarget | null;
};

export type ResolveKanbanDropTargetInput = {
  draggedNodeId: string;
  targetKind: KanbanDropTargetKind;
  targetNodeId?: string | null;
  targetParentId?: string | null;
  position: KanbanDropPosition;
  nodes: Record<string, TaskNode>;
  canMove: boolean;
};

export const kanbanParentKey = (parentId: string | null | undefined) => parentId || 'root';

export const createIdleKanbanDropState = (): KanbanDropIntentState => ({
  phase: 'idle',
  sourceNodeId: null,
  sourceParentId: null,
  candidateParentId: null,
  lockedParentId: null,
  anchorNodeId: null,
  position: null,
  targetKind: null,
  startedAt: null,
  outsideSince: null,
  progress: 0,
  invalidReason: null,
  target: null,
});

export const beginKanbanDropIntent = (source: TaskNode): KanbanDropIntentState => ({
  ...createIdleKanbanDropState(),
  sourceNodeId: source.id,
  sourceParentId: source.parentId || null,
});

export const isKanbanDescendantOf = (
  nodeId: string,
  possibleAncestorId: string,
  nodes: Record<string, TaskNode>,
) => {
  let current = nodes[nodeId]?.parentId || null;
  const visited = new Set<string>();

  while (current) {
    if (current === possibleAncestorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = nodes[current]?.parentId || null;
  }

  return false;
};

const getGroupNodes = (
  parentId: string | null,
  boardId: string,
  nodes: Record<string, TaskNode>,
  excludeId?: string,
) => Object.values(nodes)
  .filter((node) => (
    node &&
    !node.isArchived &&
    node.id !== excludeId &&
    (node.parentId || null) === (parentId || null) &&
    node.boardId === boardId
  ))
  .sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id));

export const getKanbanAppendOrder = (
  parentId: string | null,
  boardId: string,
  nodes: Record<string, TaskNode>,
  excludeId?: string,
) => getGroupNodes(parentId, boardId, nodes, excludeId)
  .reduce((max, node) => Math.max(max, node.order), -1) + 1;

const invalidTarget = (
  input: ResolveKanbanDropTargetInput,
  parentId: string | null,
  anchorNodeId: string | null,
  reason: string,
): KanbanResolvedDropTarget => {
  const draggedNode = input.nodes[input.draggedNodeId];
  const parentNode = parentId ? input.nodes[parentId] : null;
  const anchorNode = anchorNodeId ? input.nodes[anchorNodeId] : null;
  const destinationNode = parentNode || anchorNode || draggedNode;

  return {
    kind: input.targetKind,
    parentId,
    parentKey: kanbanParentKey(parentId),
    anchorNodeId,
    position: input.position,
    order: draggedNode?.order || 0,
    nodeType: draggedNode?.nodeType || 'task',
    workspaceId: destinationNode?.workspaceId || draggedNode?.workspaceId || '',
    boardId: destinationNode?.boardId || draggedNode?.boardId || '',
    sameParent: Boolean(draggedNode && kanbanParentKey(draggedNode.parentId) === kanbanParentKey(parentId)),
    valid: false,
    invalidReason: reason,
  };
};

export const resolveKanbanDropTarget = (
  input: ResolveKanbanDropTargetInput,
): KanbanResolvedDropTarget => {
  const draggedNode = input.nodes[input.draggedNodeId];
  if (!draggedNode || draggedNode.isArchived) {
    return invalidTarget(input, null, null, '來源任務已不存在，請重新拖曳');
  }

  const anchorNode = input.targetNodeId ? input.nodes[input.targetNodeId] : null;
  const hasExplicitParent = input.targetParentId !== undefined;
  const parentId = input.targetKind === 'task-anchor'
    ? (anchorNode?.parentId || null)
    : (hasExplicitParent ? (input.targetParentId || null) : null);
  const anchorNodeId = input.targetKind === 'task-anchor' ? (anchorNode?.id || null) : null;

  if (!input.canMove) {
    return invalidTarget(input, parentId, anchorNodeId, '你沒有移動任務的權限');
  }
  if (input.targetKind === 'task-anchor' && (!anchorNode || anchorNode.isArchived)) {
    return invalidTarget(input, parentId, anchorNodeId, '目標任務已不存在');
  }
  if (input.targetKind !== 'task-anchor' && !hasExplicitParent) {
    return invalidTarget(input, parentId, anchorNodeId, '找不到目標父層');
  }
  if (anchorNodeId === draggedNode.id || parentId === draggedNode.id) {
    return invalidTarget(input, parentId, anchorNodeId, '不能放到原任務本身');
  }
  if (parentId && isKanbanDescendantOf(parentId, draggedNode.id, input.nodes)) {
    return invalidTarget(input, parentId, anchorNodeId, '不能放到自己的下層任務中');
  }
  if (parentId && (!input.nodes[parentId] || input.nodes[parentId].isArchived)) {
    return invalidTarget(input, parentId, anchorNodeId, '目標父層已不存在');
  }

  const destinationNode = (parentId ? input.nodes[parentId] : null) || anchorNode || draggedNode;
  const destinationBoardId = destinationNode.boardId || draggedNode.boardId;
  const order = input.position === 'append'
    ? getKanbanAppendOrder(parentId, destinationBoardId, input.nodes, draggedNode.id)
    : (anchorNode?.order || 0) + (input.position === 'after' ? 0.5 : -0.5);

  return {
    kind: input.targetKind,
    parentId,
    parentKey: kanbanParentKey(parentId),
    anchorNodeId,
    position: input.position,
    order,
    nodeType: parentId ? 'task' : (draggedNode.nodeType || 'task'),
    workspaceId: destinationNode.workspaceId || draggedNode.workspaceId,
    boardId: destinationBoardId,
    sameParent: (
      kanbanParentKey(draggedNode.parentId) === kanbanParentKey(parentId) &&
      draggedNode.boardId === destinationBoardId
    ),
    valid: true,
    invalidReason: null,
  };
};

const stateWithTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
): KanbanDropIntentState => ({
  ...state,
  anchorNodeId: target.anchorNodeId,
  position: target.position,
  targetKind: target.kind,
  invalidReason: target.invalidReason,
  target,
});

export const selectSameParentKanbanTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
): KanbanDropIntentState => stateWithTarget({
  ...state,
  phase: 'same-parent',
  candidateParentId: null,
  lockedParentId: null,
  startedAt: null,
  outsideSince: null,
  progress: 1,
}, target);

export const armKanbanTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
  now: number,
): KanbanDropIntentState => stateWithTarget({
  ...state,
  phase: 'arming',
  candidateParentId: target.parentId,
  lockedParentId: null,
  startedAt: now,
  outsideSince: null,
  progress: 0,
}, target);

export const updateArmingKanbanTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
  now: number,
): KanbanDropIntentState => {
  const startedAt = state.startedAt ?? now;
  return stateWithTarget({
    ...state,
    progress: Math.min(1, Math.max(0, (now - startedAt) / KANBAN_PARENT_LOCK_DELAY_MS)),
    outsideSince: null,
  }, target);
};

export const lockKanbanTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
): KanbanDropIntentState => stateWithTarget({
  ...state,
  phase: 'locked',
  candidateParentId: target.parentId,
  lockedParentId: target.parentId,
  outsideSince: null,
  progress: 1,
}, target);

export const markKanbanLockedOutside = (
  state: KanbanDropIntentState,
  now: number,
): KanbanDropIntentState => ({
  ...state,
  anchorNodeId: null,
  position: null,
  targetKind: null,
  outsideSince: state.outsideSince ?? now,
  target: null,
});

export const invalidateKanbanTarget = (
  state: KanbanDropIntentState,
  target: KanbanResolvedDropTarget,
): KanbanDropIntentState => stateWithTarget({
  ...state,
  phase: 'invalid',
  candidateParentId: null,
  lockedParentId: null,
  startedAt: null,
  outsideSince: null,
  progress: 0,
}, target);

export const isKanbanDropCommittable = (state: KanbanDropIntentState) => Boolean(
  state.target?.valid &&
  state.position &&
  (
    state.phase === 'same-parent' ||
    (state.phase === 'locked' && state.target.parentKey === kanbanParentKey(state.lockedParentId))
  )
);

const rollupStatus = (children: TaskNode[], current: TaskStatus): TaskStatus => {
  if (children.length === 0) return current;
  const completedCount = children.filter((child) => child.status === 'completed').length;
  if (completedCount === children.length) return 'completed';
  if (completedCount > 0 || children.some((child) => child.status === 'in_progress')) return 'in_progress';
  return 'todo';
};

const collectAncestorIds = (parentId: string | null, nodes: Record<string, TaskNode>) => {
  const result: string[] = [];
  const visited = new Set<string>();
  let current = parentId;
  while (current && nodes[current] && !visited.has(current)) {
    visited.add(current);
    result.push(current);
    current = nodes[current].parentId || null;
  }
  return result;
};

export const buildKanbanMoveUpdates = (
  draggedNodeId: string,
  target: KanbanResolvedDropTarget,
  nodes: Record<string, TaskNode>,
  now = Date.now(),
) => {
  const draggedNode = nodes[draggedNodeId];
  if (!draggedNode || !target.valid) return {} as Record<string, Partial<TaskNode>>;

  const movedNodes: Record<string, TaskNode> = {
    ...nodes,
    [draggedNodeId]: {
      ...draggedNode,
      parentId: target.parentId,
      nodeType: target.nodeType,
      workspaceId: target.workspaceId || draggedNode.workspaceId,
      boardId: target.boardId || draggedNode.boardId,
      order: target.order,
      updatedAt: now,
    },
  };
  const updates: Record<string, Partial<TaskNode>> = {};
  const sourceGroupKey = `${kanbanParentKey(draggedNode.parentId)}::${draggedNode.boardId}`;
  const destinationGroupKey = `${target.parentKey}::${target.boardId}`;
  const groups = [
    { key: sourceGroupKey, parentId: draggedNode.parentId || null, boardId: draggedNode.boardId },
    { key: destinationGroupKey, parentId: target.parentId, boardId: target.boardId },
  ].filter((group, index, all) => all.findIndex((candidate) => candidate.key === group.key) === index);

  groups.forEach((group) => {
    const source = group.key === destinationGroupKey ? movedNodes : nodes;
    const siblings = getGroupNodes(
      group.parentId,
      group.boardId,
      source,
      group.key === sourceGroupKey && group.key !== destinationGroupKey ? draggedNodeId : undefined,
    );
    siblings.forEach((node, index) => {
      updates[node.id] = { ...(updates[node.id] || {}), order: index };
      movedNodes[node.id] = { ...movedNodes[node.id], order: index };
    });
  });

  updates[draggedNodeId] = {
    ...(updates[draggedNodeId] || {}),
    parentId: target.parentId,
    nodeType: target.nodeType,
    workspaceId: target.workspaceId || draggedNode.workspaceId,
    boardId: target.boardId || draggedNode.boardId,
    updatedAt: now,
  };
  movedNodes[draggedNodeId] = {
    ...movedNodes[draggedNodeId],
    ...(updates[draggedNodeId] as TaskNode),
  };

  const ancestorIds = Array.from(new Set([
    ...collectAncestorIds(draggedNode.parentId || null, movedNodes),
    ...collectAncestorIds(target.parentId, movedNodes),
  ])).sort((left, right) => (
    collectAncestorIds(right, movedNodes).length - collectAncestorIds(left, movedNodes).length
  ));

  ancestorIds.forEach((parentId) => {
    const parent = movedNodes[parentId];
    if (!parent) return;
    const children = Object.values(movedNodes).filter((node) => (
      node && !node.isArchived && node.parentId === parentId
    ));
    const status = rollupStatus(children, parent.status);
    if (status === parent.status) return;
    updates[parentId] = { ...(updates[parentId] || {}), status, updatedAt: now };
    movedNodes[parentId] = { ...parent, status, updatedAt: now };
  });

  return updates;
};
