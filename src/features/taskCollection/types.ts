import type {
  DependencySide,
  KnowledgeRecord,
  TaskCollectionRecord,
  RecordTaskLink,
  TaskDetailNoteRichContent,
  TaskStatus,
} from '../../types';

export const TASK_COLLECTION_SCHEMA_VERSION = 1 as const;
export const TASK_COLLECTION_LIMITS = {
  taskCount: 500,
  dependencyCount: 1000,
  activityCount: 5000,
  relatedRecordCount: 200,
  relatedRecordExcerptChars: 2000,
  snapshotUtf8Bytes: 2 * 1024 * 1024,
  contentUtf8Bytes: 512 * 1024,
  annotationChars: 500,
} as const;

export type TaskCollectionDetailNoteSnapshot = {
  id: string;
  title: string;
  content: string;
  richContent: TaskDetailNoteRichContent | null;
};

export type TaskCollectionNodeSnapshot = {
  id: string;
  storageId: string;
  parentId: string | null;
  parentStorageId: string | null;
  title: string;
  description: string | null;
  detailNotes: TaskCollectionDetailNoteSnapshot[];
  status: TaskStatus;
  assigneeIds: string[];
  collaboratorIds: string[];
  tagIds: string[];
  startDate: string | null;
  endDate: string | null;
  isDurationLocked: boolean;
  nodeType: 'group' | 'milestone' | 'task';
  kanbanStageId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  assignees?: Array<{ userId: string; displayName: string | null }>;
  collaborators?: Array<{ userId: string; displayName: string | null }>;
  tags?: Array<{ id: string; name: string; color: string | null }>;
};

export type TaskCollectionDependencySnapshot = {
  id: string;
  fromId: string;
  fromSide: DependencySide;
  toId: string;
  toSide: DependencySide;
  offsetDays: number | null;
  kind?: 'internal' | 'boundary';
  scope?: 'internal' | 'boundary';
  from?: { taskId: string; storageId: string | null; title: string; side: DependencySide };
  to?: { taskId: string; storageId: string | null; title: string; side: DependencySide };
  offset?: number;
  fromStorageId?: string | null;
  toStorageId?: string | null;
  boundaryItemId?: string | null;
  boundaryItemTitle?: string | null;
};

export type TaskCollectionActivitySnapshot = {
  id: string;
  eventType: string;
  entityTable: string;
  entityId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
  actor?: { userId: string | null; displayName: string | null };
  occurredAt?: number;
};

export type TaskCollectionLinkedRecordSnapshot = {
  id: string;
  type: Exclude<KnowledgeRecord['type'], 'task_collection'>;
  title: string;
  content: string;
  status: KnowledgeRecord['status'];
  visibility: KnowledgeRecord['visibility'];
  occurredAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  recordedBy: string | null;
  taskLinks: Array<Pick<RecordTaskLink, 'nodeId' | 'role'>>;
  linkRoles?: RecordTaskLink['role'][];
  excerpt?: string;
};

export type TaskCollectionHistoryCoverage = {
  activityEvents: number;
  linkedRecords: number;
  oldestActivityAt: number | null;
  newestActivityAt: number | null;
};

export type TaskCollectionSnapshot = {
  schemaVersion: typeof TASK_COLLECTION_SCHEMA_VERSION;
  rootItemId: string;
  rootStorageId: string | null;
  sourceWorkspaceId: string;
  sourceBoardId: string;
  sourceBoardTitle: string | null;
  collectedAt: number;
  sourceRootUpdatedAt: number;
  nodes: TaskCollectionNodeSnapshot[];
  dependencies: TaskCollectionDependencySnapshot[];
  activityEvents: TaskCollectionActivitySnapshot[];
  linkedRecords: TaskCollectionLinkedRecordSnapshot[];
  historyCoverage: TaskCollectionHistoryCoverage;
  schema: 'task-collection-v1';
  collectedBy: { userId: string; displayName: string | null };
  annotation: string | null;
  source: {
    workspaceId: string;
    workspaceTitle: string;
    boardId: string;
    boardTitle: string;
    rootTaskId: string;
    rootStorageId: string;
  };
  history: { coverage: TaskCollectionHistoryCoverage; events: TaskCollectionActivitySnapshot[] };
  relatedRecords: { coverage: 'project_visible_only'; records: TaskCollectionLinkedRecordSnapshot[] };
  counts: { tasks: number; archivedDescendants: number; dependencies: number; activities: number; relatedRecords: number };
};

export type TaskCollectionSnapshotV1 = TaskCollectionSnapshot;

export type TaskCollectionMetadata = {
  taskCollection: TaskCollectionSnapshot;
  collectionOperationId: string;
  collectionVersion: number;
  collectionSchemaVersion: typeof TASK_COLLECTION_SCHEMA_VERSION;
  collectionSnapshotHash: string;
  sourceRootItemId: string;
  sourceRootStorageId: string;
};

export type TaskCollectionPreview = {
  operationId: string;
  rootItemId: string;
  sourceBoardId: string;
  subtreeNodeCount: number;
  dependencyCount: number;
  activityEventCount: number;
  linkedRecordCount: number;
  nextVersion: number;
  snapshotHash: string;
  previewToken: string;
  snapshot: TaskCollectionSnapshot;
};

export type TaskCollectionResult = {
  record: TaskCollectionRecord;
  preview: TaskCollectionPreview;
  recordId: string;
  operationId: string;
  sourceRootTaskId: string;
  collectionVersion: number;
  collectedAt: number;
  sourceRootUpdatedAt: number;
  taskCount: number;
  summary: TaskCollectionSummary;
};

export type TaskCollectionSummary = {
  recordId: string;
  title: string;
  collectionVersion: number;
  occurredAt: number;
  sourceBoardTitle: string | null;
  taskCount: number;
  historyCoverage: TaskCollectionHistoryCoverage;
};

export type DeleteImpact = {
  blocked: boolean;
  unknown: boolean;
  reasons: string[];
  taskCollectionCount: number;
};
