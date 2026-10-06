import type { Dependency, TaskNode } from '../../types';
import { buildTaskTreeClonePlan, type TaskTreeClonePlan } from '../../features/taskClonePlan';
import type { MindMapDirection } from './MindMapNode';

export type MindMapCopyClipboard = Readonly<{
  mode: 'copy';
  boardId: string;
  rootIds: readonly string[];
  nodes: Readonly<Record<string, TaskNode>>;
  dependencies: readonly Dependency[];
  createdAt: number;
}>;

export type MindMapCutClipboard = Readonly<{
  mode: 'cut';
  boardId: string;
  rootIds: readonly string[];
  sourceStructureFingerprint: string;
  createdAt: number;
}>;

export type MindMapClipboard = MindMapCopyClipboard | MindMapCutClipboard;

export const normalizeMindMapForestRoots = (
  selectedTaskIds: readonly string[],
  nodes: Readonly<Record<string, TaskNode>>,
) => {
  const selected = new Set(selectedTaskIds);
  return Array.from(selected).filter(taskId => {
    const visited = new Set<string>([taskId]);
    let parentId = nodes[taskId]?.parentId || null;
    while (parentId && nodes[parentId] && !visited.has(parentId)) {
      if (selected.has(parentId)) return false;
      visited.add(parentId);
      parentId = nodes[parentId].parentId;
    }
    return true;
  });
};

export const collectMindMapForestTaskIds = (
  rootIds: readonly string[],
  nodes: Readonly<Record<string, TaskNode>>,
) => {
  const childrenByParent = new Map<string, TaskNode[]>();
  Object.values(nodes).forEach(node => {
    if (!node.parentId || node.isArchived) return;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  });
  childrenByParent.forEach(children => children.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const node = nodes[taskId];
    if (!node || node.isArchived) return;
    result.push(taskId);
    (childrenByParent.get(taskId) || []).forEach(child => visit(child.id));
  };
  rootIds.forEach(visit);
  return result;
};

export const getMindMapCutStructureFingerprint = (
  boardId: string,
  rootIds: readonly string[],
  nodes: Readonly<Record<string, TaskNode>>,
) => JSON.stringify({
  boardId,
  placementKind: 'primary',
  rootIds: [...rootIds],
  nodes: collectMindMapForestTaskIds(rootIds, nodes)
    .map(id => nodes[id])
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(node => ({
      id: node.id,
      parentId: node.parentId,
      order: node.order,
      isArchived: Boolean(node.isArchived),
    })),
});

const cloneSnapshotNode = (node: TaskNode): TaskNode => JSON.parse(JSON.stringify(node)) as TaskNode;

export const createMindMapCopyClipboard = (
  boardId: string,
  rootIds: readonly string[],
  nodes: Readonly<Record<string, TaskNode>>,
  dependencies: readonly Dependency[],
  createdAt = Date.now(),
): MindMapCopyClipboard => {
  const forestIds = new Set(collectMindMapForestTaskIds(rootIds, nodes));
  const snapshotNodes = Object.fromEntries(
    [...forestIds].map(id => [id, cloneSnapshotNode(nodes[id])]),
  );
  const snapshotDependencies = dependencies
    .filter(dependency => forestIds.has(dependency.fromId) && forestIds.has(dependency.toId))
    .map(dependency => ({ ...dependency }));
  return Object.freeze({
    mode: 'copy' as const,
    boardId,
    rootIds: Object.freeze([...rootIds]),
    nodes: Object.freeze(snapshotNodes),
    dependencies: Object.freeze(snapshotDependencies),
    createdAt,
  });
};

export const createMindMapCutClipboard = (
  boardId: string,
  rootIds: readonly string[],
  nodes: Readonly<Record<string, TaskNode>>,
  createdAt = Date.now(),
): MindMapCutClipboard => Object.freeze({
  mode: 'cut' as const,
  boardId,
  rootIds: Object.freeze([...rootIds]),
  sourceStructureFingerprint: getMindMapCutStructureFingerprint(boardId, rootIds, nodes),
  createdAt,
});

export type MindMapCutPastePlan = Readonly<{
  updatesById: Readonly<Record<string, Partial<TaskNode>>>;
  rootIds: readonly string[];
  affectedTaskIds: readonly string[];
  reindexedTaskIds: readonly string[];
  destinationParentId: string | null;
  sideBefore: Readonly<Record<string, MindMapDirection | null>>;
  sideAfter: Readonly<Record<string, MindMapDirection | null>>;
}>;

const getSiblings = (nodes: Readonly<Record<string, TaskNode>>, boardId: string, parentId: string | null) => (
  Object.values(nodes)
    .filter(node => node.boardId === boardId && !node.isArchived && (node.parentId || null) === parentId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
);

export const planMindMapCutPasteAfter = (input: Readonly<{
  clipboard: MindMapCutClipboard;
  anchorTaskId: string;
  nodes: Readonly<Record<string, TaskNode>>;
  sideOverrides: Readonly<Record<string, MindMapDirection>>;
  anchorSide: MindMapDirection;
}>): MindMapCutPastePlan => {
  const { clipboard, anchorTaskId, nodes } = input;
  const anchor = nodes[anchorTaskId];
  if (!anchor || anchor.isArchived || anchor.boardId !== clipboard.boardId) throw new Error('貼上目標已失效。');
  if (getMindMapCutStructureFingerprint(clipboard.boardId, clipboard.rootIds, nodes) !== clipboard.sourceStructureFingerprint) {
    throw new Error('剪下來源已變更，請重新剪下。');
  }
  const forestIds = new Set(collectMindMapForestTaskIds(clipboard.rootIds, nodes));
  if (forestIds.has(anchorTaskId)) throw new Error('不能貼在剪下來源或其子任務之後。');
  const destinationParentId = anchor.parentId || null;
  const affectedParents = new Set<string | null>([
    destinationParentId,
    ...clipboard.rootIds.map(rootId => nodes[rootId]?.parentId || null),
  ]);
  const updatesById: Record<string, Partial<TaskNode>> = {};
  const reindexedTaskIds = new Set<string>();

  affectedParents.forEach(parentId => {
    const rootsInScope = new Set(clipboard.rootIds.filter(rootId => (nodes[rootId]?.parentId || null) === parentId));
    let sequence = getSiblings(nodes, clipboard.boardId, parentId).filter(node => !rootsInScope.has(node.id));
    if (parentId === destinationParentId) {
      const anchorIndex = sequence.findIndex(node => node.id === anchorTaskId);
      if (anchorIndex < 0) throw new Error('貼上錨點不在目的層級。');
      const movingRoots = clipboard.rootIds.map(rootId => nodes[rootId]);
      sequence = [...sequence.slice(0, anchorIndex + 1), ...movingRoots, ...sequence.slice(anchorIndex + 1)];
    }
    sequence.forEach((node, index) => {
      if (!Number.isSafeInteger(index)) throw new Error('排序超出安全整數範圍。');
      const nextParentId = clipboard.rootIds.includes(node.id) ? destinationParentId : node.parentId;
      if (node.order !== index || node.parentId !== nextParentId) {
        updatesById[node.id] = { parentId: nextParentId, order: index };
        reindexedTaskIds.add(node.id);
      }
    });
  });

  const sideBefore: Record<string, MindMapDirection | null> = {};
  const sideAfter: Record<string, MindMapDirection | null> = {};
  clipboard.rootIds.forEach(rootId => {
    sideBefore[rootId] = input.sideOverrides[rootId] || null;
    sideAfter[rootId] = destinationParentId === null ? input.anchorSide : null;
  });
  return {
    updatesById,
    rootIds: clipboard.rootIds,
    affectedTaskIds: Array.from(new Set([anchorTaskId, ...Object.keys(updatesById), ...forestIds])),
    reindexedTaskIds: [...reindexedTaskIds],
    destinationParentId,
    sideBefore,
    sideAfter,
  };
};

export type MindMapCopyPastePlan = Readonly<{
  clonePlan: TaskTreeClonePlan;
  updatesById: Readonly<Record<string, Partial<TaskNode>>>;
  reindexedTaskIds: readonly string[];
  destinationParentId: string | null;
}>;

export const planMindMapCopyPasteAfter = (input: Readonly<{
  clipboard: MindMapCopyClipboard;
  anchorTaskId: string;
  currentNodes: Readonly<Record<string, TaskNode>>;
  now: number;
  createTaskId: () => string;
  createNoteId: () => string;
  createDependencyId: () => string;
}>): MindMapCopyPastePlan => {
  const anchor = input.currentNodes[input.anchorTaskId];
  if (!anchor || anchor.isArchived || anchor.boardId !== input.clipboard.boardId) throw new Error('貼上目標已失效。');
  const destinationParentId = anchor.parentId || null;
  const siblings = getSiblings(input.currentNodes, input.clipboard.boardId, destinationParentId);
  const anchorIndex = siblings.findIndex(node => node.id === anchor.id);
  if (anchorIndex < 0) throw new Error('貼上錨點不在目的層級。');
  const rootOrders = Object.fromEntries(
    input.clipboard.rootIds.map((rootId, index) => [rootId, anchorIndex + 1 + index]),
  );
  const updatesById: Record<string, Partial<TaskNode>> = {};
  siblings.forEach((sibling, index) => {
    const nextOrder = index <= anchorIndex ? index : index + input.clipboard.rootIds.length;
    if (!Number.isSafeInteger(nextOrder)) throw new Error('排序超出安全整數範圍。');
    if (sibling.order !== nextOrder) updatesById[sibling.id] = { order: nextOrder };
  });
  const clonePlan = buildTaskTreeClonePlan({
    sourceRootIds: input.clipboard.rootIds,
    sourceNodes: input.clipboard.nodes,
    dependencies: input.clipboard.dependencies,
    destinationParentId,
    rootOrders,
    now: input.now,
    createTaskId: input.createTaskId,
    createNoteId: input.createNoteId,
    createDependencyId: input.createDependencyId,
    includeInternalDependencies: true,
    suffixRootTitles: true,
  });
  return {
    clonePlan,
    updatesById,
    reindexedTaskIds: Object.keys(updatesById),
    destinationParentId,
  };
};
