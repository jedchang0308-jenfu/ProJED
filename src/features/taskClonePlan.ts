import type { Dependency, TaskNode } from '../types';

export type TaskTreeClonePlan = Readonly<{
  sourceRootIds: readonly string[];
  rootIds: readonly string[];
  nodes: readonly TaskNode[];
  dependencies: readonly Dependency[];
  idMap: ReadonlyMap<string, string>;
}>;

export type BuildTaskTreeClonePlanInput = Readonly<{
  sourceRootIds: readonly string[];
  sourceNodes: Readonly<Record<string, TaskNode>>;
  dependencies: readonly Dependency[];
  destinationParentId: string | null;
  rootOrders: Readonly<Record<string, number>>;
  now: number;
  createTaskId: () => string;
  createNoteId: () => string;
  createDependencyId: () => string;
  includeInternalDependencies?: boolean;
  suffixRootTitles?: boolean;
}>;

const collectSourceForest = (
  sourceRootIds: readonly string[],
  sourceNodes: Readonly<Record<string, TaskNode>>,
) => {
  const childrenByParent = new Map<string, TaskNode[]>();
  Object.values(sourceNodes).forEach(node => {
    if (!node.parentId || node.isArchived) return;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  });
  childrenByParent.forEach(children => children.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
  const visited = new Set<string>();
  const result: TaskNode[] = [];
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = sourceNodes[nodeId];
    if (!node || node.isArchived) return;
    result.push(node);
    (childrenByParent.get(nodeId) || []).forEach(child => visit(child.id));
  };
  sourceRootIds.forEach(visit);
  return result;
};

export const buildTaskTreeClonePlan = (input: BuildTaskTreeClonePlanInput): TaskTreeClonePlan => {
  const sourceRootIds = Array.from(new Set(input.sourceRootIds));
  const sourceForest = collectSourceForest(sourceRootIds, input.sourceNodes);
  if (sourceForest.length === 0 || sourceRootIds.some(rootId => !sourceForest.some(node => node.id === rootId))) {
    throw new Error('複製來源森林不完整。');
  }
  const sourceIds = new Set(sourceForest.map(node => node.id));
  const idMap = new Map(sourceForest.map(node => [node.id, input.createTaskId()]));
  if (new Set(idMap.values()).size !== idMap.size) throw new Error('複製計畫產生重複任務識別碼。');
  const rootSet = new Set(sourceRootIds);
  const normalizedChildOrderById = new Map<string, number>();
  const childrenByParent = new Map<string, TaskNode[]>();
  sourceForest.forEach(node => {
    if (!node.parentId || rootSet.has(node.id)) return;
    const siblings = childrenByParent.get(node.parentId) || [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  });
  childrenByParent.forEach(siblings => {
    siblings
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .forEach((node, index) => normalizedChildOrderById.set(node.id, index));
  });

  const nodes = sourceForest.map(source => {
    const id = idMap.get(source.id);
    if (!id) throw new Error(`無法解析複製任務 ${source.id}。`);
    const isRoot = rootSet.has(source.id);
    const parentId = isRoot
      ? input.destinationParentId
      : source.parentId
        ? idMap.get(source.parentId) || null
        : null;
    const rootOrder = input.rootOrders[source.id];
    if (isRoot && !Number.isSafeInteger(rootOrder)) throw new Error('貼上根任務排序必須是安全整數。');
    return {
      ...source,
      id,
      storageId: undefined,
      parentId,
      title: isRoot && input.suffixRootTitles !== false ? `${source.title || '未命名任務'}（副本）` : source.title,
      detailNotes: source.detailNotes?.map(note => ({ ...note, id: input.createNoteId() })),
      assigneeIds: source.assigneeIds ? [...source.assigneeIds] : undefined,
      collaboratorIds: source.collaboratorIds ? [...source.collaboratorIds] : undefined,
      tagIds: source.tagIds ? [...source.tagIds] : undefined,
      order: isRoot ? rootOrder : normalizedChildOrderById.get(source.id) ?? 0,
      createdAt: input.now,
      updatedAt: input.now,
      isArchived: false,
      isTrackingReference: undefined,
      trackingReferenceId: undefined,
      trackingReferenceParentPlacementId: undefined,
      canonicalTaskId: undefined,
    } satisfies TaskNode;
  });

  const dependencies = input.includeInternalDependencies === false
    ? []
    : input.dependencies
      .filter(dependency => sourceIds.has(dependency.fromId) && sourceIds.has(dependency.toId))
      .map(dependency => ({
        ...dependency,
        id: input.createDependencyId(),
        fromId: idMap.get(dependency.fromId) || dependency.fromId,
        toId: idMap.get(dependency.toId) || dependency.toId,
      }));

  return {
    sourceRootIds,
    rootIds: sourceRootIds.map(rootId => {
      const cloneId = idMap.get(rootId);
      if (!cloneId) throw new Error(`無法解析複製根任務 ${rootId}。`);
      return cloneId;
    }),
    nodes,
    dependencies,
    idMap,
  };
};
