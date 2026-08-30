import type { ActivityEvent, Dependency, KnowledgeRecord, TaskDetailNote, TaskNode } from '../../types';
import type {
  TaskCollectionActivitySnapshot,
  TaskCollectionDependencySnapshot,
  TaskCollectionLinkedRecordSnapshot,
  TaskCollectionNodeSnapshot,
  TaskCollectionSnapshot,
} from './types';
import { TASK_COLLECTION_SCHEMA_VERSION } from './types';

export type TaskCollectionSnapshotInput = {
  workspaceId: string;
  workspaceTitle?: string | null;
  boardId: string;
  boardTitle?: string | null;
  rootItemId: string;
  collectedAt: number;
  collectedBy?: { userId: string; displayName: string | null };
  annotation?: string | null;
  nodes: TaskNode[];
  dependencies: Dependency[];
  activityEvents: ActivityEvent[];
  linkedRecords: KnowledgeRecord[];
};

const normalizeNote = (note: TaskDetailNote): TaskCollectionNodeSnapshot['detailNotes'][number] => ({
  id: note.id,
  title: note.title || '',
  content: note.content || '',
  richContent: note.richContent ?? null,
});
const safeEpoch = (value: number | undefined) => value !== undefined && Number.isSafeInteger(value) ? value : 0;

export const collectTaskSubtreeNodeIds = (nodes: TaskNode[], rootItemId: string): string[] => {
  const byParent = new Map<string | null, TaskNode[]>();
  nodes.forEach(node => byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]));
  const root = nodes.find(node => node.id === rootItemId);
  if (!root) return [];
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (node: TaskNode) => {
    if (visiting.has(node.id)) throw new Error(`Task collection source contains a parent cycle at ${node.id}.`);
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    result.push(node.id);
    (byParent.get(node.id) ?? [])
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .forEach(visit);
    visiting.delete(node.id);
    visited.add(node.id);
  };
  visit(root);
  return result;
};

const normalizeNode = (node: TaskNode, allNodesById: Map<string, TaskNode>, isRoot: boolean): TaskCollectionNodeSnapshot => ({
  id: node.id,
  storageId: node.storageId ?? node.id,
  parentId: isRoot ? null : (node.parentId ?? null),
  parentStorageId: isRoot ? null : (node.parentId ? (allNodesById.get(node.parentId)?.storageId ?? node.parentId) : null),
  title: node.title || '',
  description: node.description ?? null,
  detailNotes: (node.detailNotes ?? []).map(normalizeNote),
  status: node.status,
  assigneeIds: Array.from(new Set(node.assigneeIds ?? (node.assigneeId ? [node.assigneeId] : []))).sort(),
  collaboratorIds: Array.from(new Set(node.collaboratorIds ?? [])).sort(),
  tagIds: Array.from(new Set(node.tagIds ?? [])).sort(),
  startDate: node.startDate ?? null,
  endDate: node.endDate ?? null,
  isDurationLocked: Boolean(node.isDurationLocked),
  nodeType: node.nodeType ?? 'task',
  kanbanStageId: node.kanbanStageId ?? null,
  order: Number.isSafeInteger(node.order) ? node.order : 0,
  createdAt: safeEpoch(node.createdAt),
  updatedAt: safeEpoch(node.updatedAt),
  isArchived: Boolean(node.isArchived),
  assignees: Array.from(new Set(node.assigneeIds ?? (node.assigneeId ? [node.assigneeId] : []))).sort().map(userId => ({ userId, displayName: null })),
  collaborators: Array.from(new Set(node.collaboratorIds ?? [])).sort().map(userId => ({ userId, displayName: null })),
  tags: Array.from(new Set(node.tagIds ?? [])).sort().map(id => ({ id, name: '', color: null })),
});

const ACTIVITY_PAYLOAD_KEYS = new Set([
  'taskId', 'taskTitle', 'dependencyId', 'fromId', 'fromSide', 'toId', 'toSide',
  'offset', 'source', 'sourceTaskId', 'operationId', 'before', 'after',
]);
const ACTIVITY_BEFORE_AFTER_KEYS = new Set([
  'status', 'parentId', 'order', 'kanbanStageId', 'startDate', 'endDate',
  'isDurationLocked', 'isArchived', 'assigneeIds', 'assigneeId', 'assigneeNames',
  'collaboratorIds', 'collaboratorNames', 'tagIds', 'tagNames', 'offset',
]);
const sanitizeActivityValue = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (Array.isArray(value)) return value.map(sanitizeActivityValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeActivityValue(item)]));
  }
  return null;
};
const sanitizeActivityPayload = (payload: Record<string, unknown> | undefined): Record<string, unknown> => {
  const source = payload ?? {};
  return Object.fromEntries(Object.entries(source)
    .filter(([key]) => ACTIVITY_PAYLOAD_KEYS.has(key))
    .map(([key, value]) => {
      if ((key === 'before' || key === 'after') && value && typeof value === 'object' && !Array.isArray(value)) {
        const filtered = Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .filter(([nestedKey]) => ACTIVITY_BEFORE_AFTER_KEYS.has(nestedKey))
          .map(([nestedKey, nestedValue]) => [nestedKey, sanitizeActivityValue(nestedValue)]));
        return [key, filtered];
      }
      return [key, sanitizeActivityValue(value)];
    }));
};

const normalizeActivity = (event: ActivityEvent): TaskCollectionActivitySnapshot => ({
  id: event.id ?? `${event.eventType}:${event.entityId ?? 'none'}:${event.createdAt ?? 0}`,
  eventType: event.eventType,
  entityTable: event.entityTable,
  entityId: event.entityId ?? null,
  actorId: event.actorId ?? null,
  payload: sanitizeActivityPayload(event.payload),
  createdAt: Number.isSafeInteger(event.createdAt) ? event.createdAt! : 0,
  actor: { userId: event.actorId ?? null, displayName: null },
  occurredAt: Number.isSafeInteger(event.createdAt) ? event.createdAt! : 0,
});

const normalizeDependency = (dependency: Dependency): TaskCollectionDependencySnapshot => ({
  id: dependency.id,
  fromId: dependency.fromId,
  fromSide: dependency.fromSide,
  toId: dependency.toId,
  toSide: dependency.toSide,
  offsetDays: dependency.offset ?? 0,
});

const normalizeRecord = (record: KnowledgeRecord): TaskCollectionLinkedRecordSnapshot => ({
  id: record.id,
  type: record.type as 'meeting' | 'work_log',
  title: record.title || '',
  content: record.content || '',
  status: record.status,
  visibility: record.visibility,
  occurredAt: record.occurredAt ?? null,
  startedAt: record.startedAt ?? null,
  endedAt: record.endedAt ?? null,
  recordedBy: record.recordedBy ?? null,
  taskLinks: record.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
  linkRoles: Array.from(new Set(record.taskLinks.map(link => link.role))).sort(),
  excerpt: record.content.replace(/\s+/g, ' ').trim().slice(0, 2000),
});

export const buildTaskCollectionSnapshot = (input: TaskCollectionSnapshotInput): TaskCollectionSnapshot => {
  const ids = new Set<string>();
  const storageIds = new Set<string>();
  input.nodes.forEach(node => {
    if (ids.has(node.id)) throw new Error(`Task collection source contains duplicate node identity: ${node.id}`);
    ids.add(node.id);
    const storageId = node.storageId ?? node.id;
    if (storageIds.has(storageId)) throw new Error(`Task collection source contains duplicate storage identity: ${storageId}`);
    storageIds.add(storageId);
  });
  const nodeIds = collectTaskSubtreeNodeIds(input.nodes, input.rootItemId);
  if (!nodeIds.length) throw new Error(`Task collection root not found: ${input.rootItemId}`);
  const idSet = new Set(nodeIds);
  const allNodesById = new Map(input.nodes.map(node => [node.id, node]));
  const selectedNodes = nodeIds.map(id => input.nodes.find(node => node.id === id)).filter(Boolean) as TaskNode[];
  if (selectedNodes.some(node => node.workspaceId !== input.workspaceId || node.boardId !== input.boardId)) {
    throw new Error('Task collection source crosses workspace/board scope.');
  }
  const rootNode = allNodesById.get(input.rootItemId);
  const orderedNodes = [...selectedNodes].sort((a, b) => (a.storageId ?? a.id).localeCompare(b.storageId ?? b.id));
  const dependencies = input.dependencies
    .filter(dependency => idSet.has(dependency.fromId) || idSet.has(dependency.toId))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(dependency => ({
      ...normalizeDependency(dependency),
      kind: idSet.has(dependency.fromId) && idSet.has(dependency.toId) ? 'internal' as const : 'boundary' as const,
      scope: idSet.has(dependency.fromId) && idSet.has(dependency.toId) ? 'internal' as const : 'boundary' as const,
      from: {
        taskId: dependency.fromId,
        storageId: allNodesById.get(dependency.fromId)?.storageId ?? (idSet.has(dependency.fromId) ? dependency.fromId : null),
        title: allNodesById.get(dependency.fromId)?.title ?? dependency.fromId,
        side: dependency.fromSide,
      },
      to: {
        taskId: dependency.toId,
        storageId: allNodesById.get(dependency.toId)?.storageId ?? (idSet.has(dependency.toId) ? dependency.toId : null),
        title: allNodesById.get(dependency.toId)?.title ?? dependency.toId,
        side: dependency.toSide,
      },
      offset: dependency.offset ?? 0,
      fromStorageId: allNodesById.get(dependency.fromId)?.storageId ?? null,
      toStorageId: allNodesById.get(dependency.toId)?.storageId ?? null,
      boundaryItemId: !idSet.has(dependency.fromId) ? dependency.fromId : !idSet.has(dependency.toId) ? dependency.toId : null,
      boundaryItemTitle: !idSet.has(dependency.fromId) ? allNodesById.get(dependency.fromId)?.title ?? null : !idSet.has(dependency.toId) ? allNodesById.get(dependency.toId)?.title ?? null : null,
    }));
  const dependencyIds = new Set(dependencies.map(dependency => dependency.id));
  const activityEvents = input.activityEvents
    .filter(event => event.boardId === input.boardId && ((event.entityTable === 'wbs_items' && Boolean(event.entityId && idSet.has(event.entityId))) || (event.entityTable === 'wbs_dependencies' && Boolean(event.entityId && dependencyIds.has(event.entityId)))))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id ?? '').localeCompare(b.id ?? ''))
    .map(normalizeActivity);
  const linkedRecords = input.linkedRecords
    .filter(record => record.type !== 'task_collection' && record.status === 'published' && record.visibility !== 'private')
    .filter(record => record.taskLinks.some(link => idSet.has(link.nodeId)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(normalizeRecord);
  const activityTimes = activityEvents.map(event => event.createdAt).filter(Number.isFinite);
  const historyCoverage = {
    activityEvents: activityEvents.length,
    linkedRecords: linkedRecords.length,
    oldestActivityAt: activityTimes.length ? Math.min(...activityTimes) : null,
    newestActivityAt: activityTimes.length ? Math.max(...activityTimes) : null,
  };
  return {
    schemaVersion: TASK_COLLECTION_SCHEMA_VERSION,
    rootItemId: input.rootItemId,
    rootStorageId: rootNode?.storageId ?? rootNode?.id ?? null,
    sourceWorkspaceId: input.workspaceId,
    sourceBoardId: input.boardId,
    sourceBoardTitle: input.boardTitle ?? null,
    collectedAt: input.collectedAt,
    sourceRootUpdatedAt: rootNode?.updatedAt ?? input.collectedAt,
    nodes: orderedNodes.map(node => normalizeNode(node, allNodesById, node.id === input.rootItemId)),
    dependencies,
    activityEvents,
    linkedRecords,
    historyCoverage,
    schema: 'task-collection-v1',
    collectedBy: input.collectedBy ?? { userId: 'unknown', displayName: null },
    annotation: input.annotation ?? null,
    source: {
      workspaceId: input.workspaceId,
      workspaceTitle: input.workspaceTitle ?? input.workspaceId,
      boardId: input.boardId,
      boardTitle: input.boardTitle ?? input.boardId,
      rootTaskId: input.rootItemId,
      rootStorageId: rootNode?.storageId ?? rootNode?.id ?? input.rootItemId,
    },
    history: { coverage: historyCoverage, events: activityEvents },
    relatedRecords: { coverage: 'project_visible_only', records: linkedRecords },
    counts: {
      tasks: selectedNodes.length,
      archivedDescendants: selectedNodes.slice(1).filter(node => node.isArchived).length,
      dependencies: dependencies.length,
      activities: activityEvents.length,
      relatedRecords: linkedRecords.length,
    },
  };
};
