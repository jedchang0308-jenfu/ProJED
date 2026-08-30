import type { TaskNode } from '../../types';
import { TaskTrackingError } from './errors';
import {
  activeTrackingReferences,
  assertTrackingReferenceInvariant,
  createTrackingReferenceId,
  getReferenceSubtree,
  isPrimaryPlacementId,
  primaryPlacementId,
} from './model';
import type {
  CreateTrackingReferenceInput,
  MoveTrackingReferenceInput,
  TaskTrackingReference,
  TrackingReferenceMutation,
  TrackingReferenceService,
} from './types';

export const TASK_TRACKING_REFERENCES_STORAGE_KEY = 'projed-local-test.taskTrackingReferences.v1';
const STORAGE_KEY = TASK_TRACKING_REFERENCES_STORAGE_KEY;
let memoryReferences: TaskTrackingReference[] = [];

type LocalTrackingTestFault = {
  operation?: 'create' | 'move' | 'remove' | 'restore';
  failNext?: boolean;
  message?: string;
};

/**
 * Failure injection is deliberately test-only and lives outside persistence.
 * It exercises the same provider boundary used by the UI without creating a
 * production state or leaving a ghost reference behind.
 */
const consumeLocalTrackingTestFault = (operation: LocalTrackingTestFault['operation']) => {
  if (typeof window === 'undefined') return;
  const mode = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE;
  // The browser verifier runs against the Vite development server, whose
  // mode is `development` rather than `test`.  Keep this hook unavailable in
  // production builds while allowing both test runners to exercise the
  // provider boundary.
  if (mode !== 'test' && mode !== 'development') return;
  const host = window as Window & { __projedTaskTrackingTestFault?: LocalTrackingTestFault };
  const fault = host.__projedTaskTrackingTestFault;
  if (!fault?.failNext || (fault.operation && fault.operation !== operation)) return;
  host.__projedTaskTrackingTestFault = { ...fault, failNext: false };
  throw new Error(fault.message || '追蹤副本操作失敗，原位置已保留。');
};

const read = (): TaskTrackingReference[] => {
  try {
    if (typeof localStorage === 'undefined') return memoryReferences;
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return memoryReferences;
  }
};

const write = (references: TaskTrackingReference[]) => {
  memoryReferences = references;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(references));
  } catch {
    // Local-test persistence is best effort; the in-memory copy remains usable.
  }
};

const operationResult = new Map<string, { fingerprint: string; result: TaskTrackingReference | null }>();

const operationFingerprint = (value: Record<string, unknown>) => JSON.stringify(value);

const replayOperation = (operationId: string | undefined, fingerprint: string) => {
  if (!operationId) return undefined;
  const existing = operationResult.get(operationId);
  if (!existing) return undefined;
  if (existing.fingerprint !== fingerprint) {
    throw new TaskTrackingError('OPERATION_ID_CONFLICT', '相同 operationId 不可重用於不同內容。');
  }
  if (!existing.result) throw new TaskTrackingError('NOT_FOUND', '追蹤副本操作結果不存在。');
  return existing.result;
};

const rememberOperation = (operationId: string | undefined, fingerprint: string, result: TaskTrackingReference | null) => {
  if (operationId) operationResult.set(operationId, { fingerprint, result });
};

const parseSource = (sourcePlacementId: string) => {
  if (isPrimaryPlacementId(sourcePlacementId)) return { taskId: sourcePlacementId.slice(primaryPlacementId('').length) };
  return { referenceId: sourcePlacementId };
};

type LocalPlacementContext = Pick<
  TaskTrackingReference,
  'id' | 'taskId' | 'workspaceId' | 'boardId' | 'parentPlacementId' | 'order'
> & {
  placementKind: 'primary' | 'tracking_reference';
  removedAt?: number;
};

/**
 * Local-test must resolve the same placement identity that the Supabase RPC
 * accepts.  In particular, a primary placement is an ephemeral
 * `primary:<taskId>` id, while a tracking placement is persisted by its own
 * id.  Treating a primary anchor as "not found" silently produces the wrong
 * before/after order and makes local browser evidence diverge from TEST.
 */
const resolveLocalPlacement = (
  placementId: string | null | undefined,
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
): LocalPlacementContext | null => {
  if (!placementId) return null;
  if (isPrimaryPlacementId(placementId)) {
    const taskId = placementId.slice(primaryPlacementId('').length);
    const task = tasks.find(item => item.id === taskId);
    if (!task || task.isArchived) return null;
    return {
      id: placementId,
      taskId: task.id,
      workspaceId: task.workspaceId,
      boardId: task.boardId,
      parentPlacementId: task.parentId ? primaryPlacementId(task.parentId) : null,
      order: task.order,
      placementKind: 'primary',
    };
  }
  const reference = references.find(item => item.id === placementId);
  if (!reference) return null;
  return {
    id: reference.id,
    taskId: reference.taskId,
    workspaceId: reference.workspaceId,
    boardId: reference.boardId,
    parentPlacementId: reference.parentPlacementId,
    order: reference.order,
    placementKind: 'tracking_reference',
    removedAt: reference.removedAt,
  };
};

export const createLocalTaskTrackingReferenceService = (
  getTasks: () => readonly TaskNode[],
): TrackingReferenceService => ({
  async getCapability() {
    return { supported: true };
  },

  async listByWorkspace(workspaceId) {
    return read().filter(reference => reference.workspaceId === workspaceId && !reference.removedAt);
  },

  async listCanonicalTasksByIds(workspaceId, taskIds) {
    const requested = new Set(taskIds);
    return getTasks().filter(task => task.workspaceId === workspaceId && requested.has(task.id));
  },

  async create(workspaceId, input: CreateTrackingReferenceInput) {
    consumeLocalTrackingTestFault('create');
    const operationId = input.operationId;
    const fingerprint = operationFingerprint({ action: 'create', workspaceId, sourcePlacementId: input.sourcePlacementId, expectedRevision: input.expectedRevision });
    const replay = replayOperation(operationId, fingerprint);
    if (replay) return replay;
    const tasks = getTasks();
    const parsed = parseSource(input.sourcePlacementId);
    const task = 'taskId' in parsed
      ? tasks.find(item => item.id === parsed.taskId)
      : tasks.find(item => item.id === read().find(reference => reference.id === parsed.referenceId)?.taskId);
    if (!task || task.isArchived) throw new TaskTrackingError('NOT_FOUND', '找不到可追蹤的主要任務。');
    if (task.workspaceId !== workspaceId) throw new TaskTrackingError('CROSS_WORKSPACE_UNSUPPORTED', '追蹤副本必須位於同一工作區。');
    const references = read();
    const sourceParentPlacementId = task.parentId ? primaryPlacementId(task.parentId) : null;
    const siblings = activeTrackingReferences(references).filter(reference =>
      reference.taskId === task.id && reference.boardId === task.boardId && reference.parentPlacementId === sourceParentPlacementId
    );
    const order = task.order + (siblings.length + 1) * 0.0001;
    assertTrackingReferenceInvariant(references, task, { boardId: task.boardId, parentPlacementId: sourceParentPlacementId });
    const now = Date.now();
    const created: TaskTrackingReference = {
      id: createTrackingReferenceId(),
      taskId: task.id,
      workspaceId,
      boardId: task.boardId,
      sourceBoardId: task.boardId,
      parentPlacementId: sourceParentPlacementId,
      order,
      kanbanStageId: task.kanbanStageId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const shifted = references.map(reference => (
      !reference.removedAt
        && reference.boardId === task.boardId
        && reference.parentPlacementId === sourceParentPlacementId
        && reference.order > task.order
        ? { ...reference, order: reference.order + 1, revision: reference.revision + 1, updatedAt: now }
        : reference
    ));
    write([...shifted, created]);
    rememberOperation(operationId, fingerprint, created);
    return created;
  },

  async move(workspaceId, input: MoveTrackingReferenceInput) {
    consumeLocalTrackingTestFault('move');
    const operationId = input.operationId;
    const fingerprint = operationFingerprint({ action: 'move', workspaceId, sourcePlacementId: input.sourcePlacementId, expectedRevision: input.expectedRevision, targetBoardId: input.targetBoardId, targetParentPlacementId: input.targetParentPlacementId, anchorPlacementId: input.anchorPlacementId ?? null, position: input.position ?? 'append' });
    const replay = replayOperation(operationId, fingerprint);
    if (replay) return replay;
    const references = read();
    const source = references.find(reference => reference.id === input.sourcePlacementId && !reference.removedAt);
    if (!source) throw new TaskTrackingError('NOT_FOUND', '找不到追蹤副本。');
    if (source.workspaceId !== workspaceId) {
      throw new TaskTrackingError('CROSS_WORKSPACE_UNSUPPORTED', '追蹤副本只能在同一工作區內搬移。');
    }
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) {
      throw new TaskTrackingError('REVISION_CONFLICT', '追蹤副本已被其他人更新，請重新載入。');
    }
    if (input.targetBoardId.trim() === '') throw new TaskTrackingError('NOT_FOUND', '目標看板不存在。');
    const tasks = getTasks();
    const targetParent = resolveLocalPlacement(input.targetParentPlacementId, tasks, references);
    if (input.targetParentPlacementId && (!targetParent || targetParent.removedAt)) {
      throw new TaskTrackingError('INVALID_PARENT', '目標父層不存在或已不可用。');
    }
    if (targetParent && (targetParent.workspaceId !== workspaceId || targetParent.boardId !== input.targetBoardId)) {
      throw new TaskTrackingError('INVALID_PARENT', '目標父層不屬於目標看板。');
    }
    if (targetParent?.taskId === source.taskId) {
      throw new TaskTrackingError('CYCLE_DETECTED', '追蹤副本不能成為自己的父層。');
    }
    // Match the server-side recursive ancestor check: a reference for task A
    // cannot be placed below A's canonical descendant (or a reference whose
    // placement ancestry eventually reaches A), even when the direct parent
    // itself has a different task id.
    const visitedParentPlacements = new Set<string>();
    let ancestorPlacementId = targetParent?.id ?? null;
    while (ancestorPlacementId) {
      if (visitedParentPlacements.has(ancestorPlacementId)) {
        throw new TaskTrackingError('CYCLE_DETECTED', '追蹤副本父層鏈形成循環。');
      }
      visitedParentPlacements.add(ancestorPlacementId);
      const ancestor = resolveLocalPlacement(ancestorPlacementId, tasks, references);
      if (!ancestor || ancestor.removedAt) {
        throw new TaskTrackingError('INVALID_PARENT', '目標父層鏈包含不存在或已不可用的位置。');
      }
      if (ancestor.taskId === source.taskId) {
        throw new TaskTrackingError('CYCLE_DETECTED', '追蹤副本不能放在自身 canonical 子孫下。');
      }
      ancestorPlacementId = ancestor.parentPlacementId;
    }
    const subtree = getReferenceSubtree(references, source.id);
    const subtreePlacementIds = new Set(subtree.map(item => item.id));
    if (input.targetParentPlacementId && subtreePlacementIds.has(input.targetParentPlacementId)) {
      throw new TaskTrackingError('CYCLE_DETECTED', '追蹤副本不能搬到自己的子樹下。');
    }
    const duplicate = activeTrackingReferences(references).some(reference =>
      reference.id !== source.id
      && reference.taskId === source.taskId
      && reference.boardId === input.targetBoardId
      && reference.parentPlacementId === input.targetParentPlacementId
    );
    if (duplicate) throw new TaskTrackingError('DUPLICATE_REFERENCE', '同一任務在相同位置已有追蹤副本。');
    const now = Date.now();
    const position = input.position ?? 'append';
    const anchor = resolveLocalPlacement(input.anchorPlacementId, tasks, references);
    if (position !== 'before' && position !== 'after' && input.anchorPlacementId) {
      throw new TaskTrackingError('INVALID_PARENT', 'append 不可指定排序錨點。');
    }
    if (position === 'before' || position === 'after') {
      if (!anchor || anchor.removedAt || anchor.workspaceId !== workspaceId || anchor.boardId !== input.targetBoardId) {
        throw new TaskTrackingError('INVALID_PARENT', '排序錨點不存在或不屬於目標看板。');
      }
      if (anchor.parentPlacementId !== (input.targetParentPlacementId ?? null)) {
        throw new TaskTrackingError('INVALID_PARENT', '排序錨點與目標父層不一致。');
      }
      if (subtreePlacementIds.has(anchor.id)) {
        throw new TaskTrackingError('CYCLE_DETECTED', '追蹤副本不能搬到自己的子樹下。');
      }
    }
    let nextOrder = source.order;
    if (position === 'before' && anchor) nextOrder = anchor.order - 0.0001;
    if (position === 'after' && anchor) nextOrder = anchor.order + 0.0001;
    if (position === 'append') {
      const primarySiblingOrders = tasks
        .filter(task => !task.isArchived
          && task.workspaceId === workspaceId
          && task.boardId === input.targetBoardId
          && (task.parentId ? primaryPlacementId(task.parentId) : null) === (input.targetParentPlacementId ?? null))
        .map(task => task.order);
      const referenceSiblingOrders = activeTrackingReferences(references)
        .filter(reference => reference.workspaceId === workspaceId
          && reference.boardId === input.targetBoardId
          && reference.parentPlacementId === (input.targetParentPlacementId ?? null))
        .map(reference => reference.order);
      const siblingOrders = [...primarySiblingOrders, ...referenceSiblingOrders];
      nextOrder = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
    }
    const subtreeIds = new Set(subtree.map(item => item.id));
    const moved = { ...source, boardId: input.targetBoardId, parentPlacementId: input.targetParentPlacementId, order: nextOrder, revision: source.revision + 1, updatedAt: now };
    const next = references.map(reference => {
      if (!subtreeIds.has(reference.id)) return reference;
      if (reference.id === source.id) return moved;
      return { ...reference, boardId: input.targetBoardId, revision: reference.revision + 1, updatedAt: now };
    });
    write(next);
    rememberOperation(operationId, fingerprint, moved);
    return moved;
  },

  async remove(workspaceId, input: TrackingReferenceMutation) {
    consumeLocalTrackingTestFault('remove');
    const fingerprint = operationFingerprint({ action: 'remove', workspaceId, sourcePlacementId: input.sourcePlacementId, expectedRevision: input.expectedRevision });
    const existing = input.operationId ? operationResult.get(input.operationId) : undefined;
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new TaskTrackingError('OPERATION_ID_CONFLICT', '相同 operationId 不可重用於不同內容。');
      return;
    }
    const references = read();
    const source = references.find(reference => reference.id === input.sourcePlacementId && !reference.removedAt);
    if (!source || source.workspaceId !== workspaceId) throw new TaskTrackingError('NOT_FOUND', '找不到追蹤副本。');
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) throw new TaskTrackingError('REVISION_CONFLICT', '追蹤副本已被其他人更新，請重新載入。');
    const now = Date.now();
    const subtree = new Set(getReferenceSubtree(references, source.id).map(item => item.id));
    write(references.map(reference => subtree.has(reference.id) ? { ...reference, removedAt: now, updatedAt: now, revision: reference.revision + 1 } : reference));
    rememberOperation(input.operationId, fingerprint, null);
  },

  async restore(workspaceId, input: TrackingReferenceMutation) {
    consumeLocalTrackingTestFault('restore');
    const fingerprint = operationFingerprint({ action: 'restore', workspaceId, sourcePlacementId: input.sourcePlacementId, expectedRevision: input.expectedRevision });
    const replay = replayOperation(input.operationId, fingerprint);
    if (replay) return replay;
    const references = read();
    const source = references.find(reference => reference.id === input.sourcePlacementId && reference.removedAt);
    if (!source || source.workspaceId !== workspaceId) throw new TaskTrackingError('NOT_FOUND', '找不到可還原的追蹤副本。');
    const subtree = getReferenceSubtree(
      references.map(reference => reference.removedAt ? { ...reference, removedAt: undefined } : reference),
      source.id,
    );
    const subtreeIds = new Set(subtree.map(reference => reference.id));
    const duplicate = activeTrackingReferences(references).some(reference =>
      !subtreeIds.has(reference.id)
      && reference.taskId === source.taskId
      && reference.boardId === source.boardId
      && reference.parentPlacementId === source.parentPlacementId,
    );
    if (duplicate) throw new TaskTrackingError('DUPLICATE_REFERENCE', '原位置已有同一任務的追蹤副本。');
    const now = Date.now();
    const restored = { ...source, removedAt: undefined, revision: source.revision + 1, updatedAt: now };
    write(references.map(reference => {
      if (!subtreeIds.has(reference.id)) return reference;
      return {
        ...reference,
        removedAt: undefined,
        revision: reference.revision + 1,
        updatedAt: now,
      };
    }));
    rememberOperation(input.operationId, fingerprint, restored);
    return restored;
  },
});

export const resetLocalTaskTrackingReferences = () => {
  operationResult.clear();
  write([]);
};

export const readLocalTaskTrackingReferences = (): TaskTrackingReference[] => read();

export const writeLocalTaskTrackingReferences = (references: TaskTrackingReference[]) => write(references);
