import type { Dependency, TagColor, TaskNode, TaskStatus, TaskTag } from '../../types';
import {
  BACKUP_FORMAT,
  BACKUP_MAX_DEPENDENCIES,
  BACKUP_MAX_FILE_BYTES,
  BACKUP_MAX_TASKS,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  type BackupInspection,
  type BackupExecutionResult,
  type BackupPackageV2,
  type BackupPayloadV2,
  type BoardBackupSource,
  type PortableDependencyV2,
  type PortableTagV2,
  type PortableTaskV2,
} from './types';

const INCLUDED_DOMAINS = [
  '看板名稱',
  '進行中與封存任務',
  '任務說明與詳細筆記',
  '父子階層與排序',
  '任務依賴',
  '任務使用的工作區標籤',
];

const EXCLUDED_DOMAINS = [
  '工作區成員與看板權限',
  '會議與工作紀錄',
  '附件與外部檔案',
  '行事曆訂閱與連結金鑰',
  '稽核、活動與 RAG 衍生資料',
  '其他工作區與看板',
];

const TASK_STATUSES = new Set<TaskStatus>([
  'todo',
  'in_progress',
  'delayed',
  'completed',
  'unsure',
  'onhold',
]);

const TAG_COLORS = new Set<TagColor>([
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
  'gray',
]);

const LEGACY_VERSIONS = new Set(['wbs-1.0', 'wbs-1.1', 'wbs-1.2', 'wbs-2.0']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `backup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isString = (value: unknown): value is string => typeof value === 'string';
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const validateBackupFileSize = (size: number): void => {
  if (!Number.isFinite(size) || size < 0 || size > BACKUP_MAX_FILE_BYTES) {
    throw new BackupError('INVALID_FILE', `備份檔超過 ${BACKUP_MAX_FILE_BYTES / 1024 / 1024} MiB 安全上限。`);
  }
};

const normalizeStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeStableValue);
  if (!isRecord(value)) return value;

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((result, key) => {
      const child = value[key];
      if (child !== undefined) result[key] = normalizeStableValue(child);
      return result;
    }, {});
};

export const canonicalizeBackupPayload = (payload: BackupPayloadV2): string => {
  const normalized: BackupPayloadV2 = {
    board: payload.board,
    tasks: [...payload.tasks].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    dependencies: [...payload.dependencies].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    tags: [...payload.tags].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
  return JSON.stringify(normalizeStableValue(normalized));
};

export const calculateBackupChecksum = async (payload: BackupPayloadV2): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new BackupError('BACKEND_UNSUPPORTED', '目前執行環境不支援 SHA-256，無法建立或驗證備份。');
  }
  const bytes = new TextEncoder().encode(canonicalizeBackupPayload(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const calculateStableFingerprint = async (value: unknown): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new BackupError('BACKEND_UNSUPPORTED', '目前執行環境不支援 SHA-256，無法驗證匯入內容。');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeStableValue(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const compareBackupSemantics = async (
  packageValue: BackupPackageV2,
  source: BoardBackupSource,
  result: BackupExecutionResult
): Promise<{ valid: boolean; expectedFingerprint: string; actualFingerprint: string }> => {
  const targetIdBySourceId = new Map(Object.entries(result.sourceTaskIdMap));
  const sourceIdByTargetId = new Map(
    Array.from(targetIdBySourceId, ([sourceId, targetId]) => [targetId, sourceId])
  );
  const packageTaskIds = new Set(packageValue.payload.tasks.map(task => task.sourceId));
  let valid = targetIdBySourceId.size === packageTaskIds.size
    && sourceIdByTargetId.size === targetIdBySourceId.size
    && Array.from(packageTaskIds).every(sourceId => targetIdBySourceId.has(sourceId));

  const actualTaskBySourceId = new Map<string, BoardBackupSource['tasks'][number]>();
  source.tasks.forEach(task => {
    const sourceId = sourceIdByTargetId.get(task.id);
    if (!sourceId || actualTaskBySourceId.has(sourceId)) {
      valid = false;
      return;
    }
    actualTaskBySourceId.set(sourceId, task);
  });
  if (source.tasks.length !== packageValue.payload.tasks.length) valid = false;

  const expectedTagNameById = new Map(
    packageValue.payload.tags.map(tag => [tag.sourceId, tag.name.trim().toLocaleLowerCase()])
  );
  const actualTagNameById = new Map(
    source.tags.map(tag => [tag.id, tag.name.trim().toLocaleLowerCase()])
  );
  const personRetention = new Map<string, boolean[]>();
  const recordPersonRetention = (id: string | undefined, retained: boolean) => {
    if (!id) return;
    personRetention.set(id, [...(personRetention.get(id) ?? []), retained]);
  };

  const expectedTasks: unknown[] = [];
  const actualTasks: unknown[] = [];
  packageValue.payload.tasks.forEach(task => {
    const actual = actualTaskBySourceId.get(task.sourceId);
    const actualAssignee = actual?.assigneeId;
    if (actualAssignee && actualAssignee !== task.assigneeId) valid = false;
    recordPersonRetention(task.assigneeId, actualAssignee === task.assigneeId);
    const expectedCollaborators = new Set(task.collaboratorIds);
    const actualCollaborators = [...(actual?.collaboratorIds ?? [])].sort();
    if (actualCollaborators.some(id => !expectedCollaborators.has(id))) valid = false;
    task.collaboratorIds.forEach(id => recordPersonRetention(id, actualCollaborators.includes(id)));

    const expectedTagNames = task.tagSourceIds
      .map(id => expectedTagNameById.get(id) ?? `missing:${id}`)
      .sort();
    const actualTagNames = (actual?.tagIds ?? [])
      .map(id => actualTagNameById.get(id) ?? `missing:${id}`)
      .sort();
    const commonExpected = {
      sourceId: task.sourceId,
      parentSourceId: task.parentSourceId,
      title: task.title,
      detailNotes: task.detailNotes ?? [],
      description: task.description ?? null,
      status: task.status,
      assigneeId: actualAssignee ?? null,
      collaboratorIds: actualCollaborators,
      tagNames: expectedTagNames,
      startDate: task.startDate ?? null,
      endDate: task.endDate ?? null,
      isDurationLocked: task.isDurationLocked,
      nodeType: task.nodeType,
      kanbanStageSourceId: task.kanbanStageSourceId ?? null,
      order: task.order,
      isArchived: task.isArchived,
    };
    expectedTasks.push(commonExpected);
    actualTasks.push({
      sourceId: task.sourceId,
      parentSourceId: actual?.parentId ? sourceIdByTargetId.get(actual.parentId) ?? actual.parentId : null,
      title: actual?.title,
      detailNotes: actual?.detailNotes ?? [],
      description: actual?.description ?? null,
      status: actual?.status,
      assigneeId: actualAssignee ?? null,
      collaboratorIds: actualCollaborators,
      tagNames: actualTagNames,
      startDate: actual?.startDate ?? null,
      endDate: actual?.endDate ?? null,
      isDurationLocked: Boolean(actual?.isDurationLocked),
      nodeType: actual?.nodeType ?? 'task',
      kanbanStageSourceId: actual?.kanbanStageId
        ? sourceIdByTargetId.get(actual.kanbanStageId) ?? actual.kanbanStageId
        : null,
      order: actual?.order,
      isArchived: Boolean(actual?.isArchived),
    });
  });

  const removedPeople = Array.from(personRetention.values()).filter(states => {
    if (states.some(Boolean) && states.some(state => !state)) valid = false;
    return states.every(state => !state);
  }).length;
  if (removedPeople !== result.counts.unresolvedPeople) valid = false;

  const expectedDependencies = packageValue.payload.dependencies.map(dependency => ({
    fromSourceId: dependency.fromSourceId,
    fromSide: dependency.fromSide,
    toSourceId: dependency.toSourceId,
    toSide: dependency.toSide,
    offset: dependency.offset,
  }));
  const actualDependencies = source.dependencies.map(dependency => ({
    fromSourceId: sourceIdByTargetId.get(dependency.fromId) ?? `missing:${dependency.fromId}`,
    fromSide: dependency.fromSide,
    toSourceId: sourceIdByTargetId.get(dependency.toId) ?? `missing:${dependency.toId}`,
    toSide: dependency.toSide,
    offset: dependency.offset ?? 0,
  }));
  const dependencyKey = (dependency: typeof expectedDependencies[number]) =>
    [dependency.fromSourceId, dependency.fromSide, dependency.toSourceId, dependency.toSide, dependency.offset].join('|');
  expectedDependencies.sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right)));
  actualDependencies.sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right)));
  expectedTasks.sort((left, right) => String((left as { sourceId: string }).sourceId).localeCompare(String((right as { sourceId: string }).sourceId)));
  actualTasks.sort((left, right) => String((left as { sourceId: string }).sourceId).localeCompare(String((right as { sourceId: string }).sourceId)));

  const expectedSemantic = {
    integrityValid: true,
    boardTitle: result.targetBoardTitle,
    tasks: expectedTasks,
    dependencies: expectedDependencies,
  };
  const actualSemantic = {
    integrityValid: valid,
    boardTitle: source.boardTitle,
    tasks: actualTasks,
    dependencies: actualDependencies,
  };
  const [expectedFingerprint, actualFingerprint] = await Promise.all([
    calculateStableFingerprint(expectedSemantic),
    calculateStableFingerprint(actualSemantic),
  ]);
  return { valid, expectedFingerprint, actualFingerprint };
};

const toPortableTask = (
  task: TaskNode,
  kanbanStageSourceId = task.kanbanStageId,
  parentSourceId = task.parentId && task.parentId !== task.boardId ? task.parentId : null,
): PortableTaskV2 => ({
  sourceId: task.id,
  parentSourceId,
  title: task.title,
  detailNotes: task.detailNotes?.map(note => ({ ...note })),
  description: task.description,
  status: task.status,
  assigneeId: task.assigneeId,
  collaboratorIds: [...(task.collaboratorIds ?? [])],
  tagSourceIds: [...(task.tagIds ?? [])],
  startDate: task.startDate,
  endDate: task.endDate,
  isDurationLocked: Boolean(task.isDurationLocked),
  nodeType: task.nodeType ?? 'task',
  kanbanStageSourceId,
  order: task.order,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  isArchived: Boolean(task.isArchived),
});

const toPortableDependency = (dependency: Dependency): PortableDependencyV2 => ({
  sourceId: dependency.id,
  fromSourceId: dependency.fromId,
  fromSide: dependency.fromSide,
  toSourceId: dependency.toId,
  toSide: dependency.toSide,
  offset: dependency.offset ?? 0,
});

const toPortableTag = (tag: TaskTag): PortableTagV2 => ({
  sourceId: tag.id,
  name: tag.name,
  color: tag.color,
  order: tag.order,
});

export const buildBackupPayload = (source: BoardBackupSource): BackupPayloadV2 => {
  const scopedTasks = source.tasks.filter(task =>
    task.workspaceId === source.workspaceId && task.boardId === source.boardId
  );
  const taskIds = new Set(scopedTasks.map(task => task.id));
  const taskById = new Map(scopedTasks.map(task => [task.id, task]));
  const canonicalParentId = (task: TaskNode) => {
    const parentId = task.parentId && task.parentId !== task.boardId ? task.parentId : null;
    if (!parentId || taskIds.has(parentId)) return parentId;

    // Local test sanitization marks detached/cyclic nodes archived without
    // re-rooting them in the visible tree. Preserve their content as archived
    // roots in a board backup; active orphans still fail closed below.
    return task.isArchived ? null : parentId;
  };
  const canonicalStageId = (task: TaskNode) => {
    const stageId = task.kanbanStageId;
    if (!stageId || taskIds.has(stageId)) return stageId;
    const legacyStageId = stageId.startsWith('list_') ? stageId : `list_${stageId}`;
    if (taskIds.has(legacyStageId)) return legacyStageId;

    // Older local imports may lose the stage ID while keeping the task tree.
    // Recover only when the parent chain identifies an unambiguous root group.
    const visited = new Set<string>();
    let parentId = task.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = taskById.get(parentId);
      if (!parent) break;
      if (parent.nodeType === 'group' && !parent.parentId) return parent.id;
      parentId = parent.parentId;
    }
    return stageId;
  };
  const referencedTagIds = new Set(scopedTasks.flatMap(task => task.tagIds ?? []));

  const dependencies = source.dependencies.filter(dependency =>
    taskIds.has(dependency.fromId) && taskIds.has(dependency.toId)
  );
  const danglingDependency = source.dependencies.find(dependency =>
    taskIds.has(dependency.fromId) !== taskIds.has(dependency.toId)
  );
  if (danglingDependency) {
    throw new BackupError('INVALID_FILE', `依賴 ${danglingDependency.id} 有一端不屬於來源看板，無法建立一致備份。`);
  }

  const tags = source.tags.filter(tag =>
    tag.workspaceId === source.workspaceId && referencedTagIds.has(tag.id)
  );
  const availableTagIds = new Set(tags.map(tag => tag.id));
  const missingTagId = Array.from(referencedTagIds).find(tagId => !availableTagIds.has(tagId));
  if (missingTagId) {
    throw new BackupError('INVALID_FILE', `任務引用的標籤 ${missingTagId} 無法從後端讀取，請重新整理後再備份。`);
  }

  return {
    board: { title: source.boardTitle },
    tasks: scopedTasks.map(task => toPortableTask(task, canonicalStageId(task), canonicalParentId(task))),
    dependencies: dependencies.map(toPortableDependency),
    tags: tags.map(toPortableTag),
  };
};

export const createBackupPackage = async (
  source: BoardBackupSource,
  backend: 'supabase' | 'local-test',
  appVersion = '0.0.0'
): Promise<BackupPackageV2> => {
  const payload = buildBackupPayload(source);
  validateBackupPayload(payload);
  const checksum = await calculateBackupChecksum(payload);

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    packageId: createUuid(),
    createdAt: new Date().toISOString(),
    source: {
      appVersion,
      backend,
      workspaceId: source.workspaceId,
      boardId: source.boardId,
      boardTitle: source.boardTitle,
    },
    scope: { type: 'board' },
    manifest: {
      entities: {
        tasks: payload.tasks.length,
        dependencies: payload.dependencies.length,
        tags: payload.tags.length,
      },
      includes: [...INCLUDED_DOMAINS],
      excludes: [...EXCLUDED_DOMAINS],
      canonicalization: 'json-sort-v1',
      checksum: {
        algorithm: 'SHA-256',
        value: checksum,
      },
    },
    payload,
  };
};

const readRequiredString = (value: unknown, label: string): string => {
  if (!isString(value) || !value.trim()) {
    throw new BackupError('INVALID_FILE', `${label} 缺少有效文字。`);
  }
  return value;
};

const readOptionalString = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return readRequiredString(value, label);
};

const readStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some(item => !isString(item) || !item.trim())) {
    throw new BackupError('INVALID_FILE', `${label} 必須是文字陣列。`);
  }
  return value as string[];
};

const readRequiredBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new BackupError('INVALID_FILE', `${label} 必須是布林值。`);
  return value;
};

const readRequiredInteger = (value: unknown, label: string): number => {
  if (!isFiniteNumber(value) || !Number.isInteger(value)) {
    throw new BackupError('INVALID_FILE', `${label} 必須是整數。`);
  }
  return value;
};

const readOptionalFiniteNumber = (value: unknown, label: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isFiniteNumber(value)) throw new BackupError('INVALID_FILE', `${label} 必須是有效數字。`);
  return value;
};

const parsePortableTask = (value: unknown, index: number): PortableTaskV2 => {
  if (!isRecord(value)) throw new BackupError('INVALID_FILE', `第 ${index + 1} 個任務格式不正確。`);
  const status = readRequiredString(value.status, `任務 ${index + 1} status`) as TaskStatus;
  if (!TASK_STATUSES.has(status)) throw new BackupError('INVALID_FILE', `任務 ${index + 1} status 不受支援。`);
  const nodeType = readRequiredString(value.nodeType, `任務 ${index + 1} nodeType`);
  if (!['group', 'milestone', 'task'].includes(nodeType)) {
    throw new BackupError('INVALID_FILE', `任務 ${index + 1} nodeType 不受支援。`);
  }
  const order = readRequiredInteger(value.order, `任務 ${index + 1} order`);
  if (value.detailNotes !== undefined && (!Array.isArray(value.detailNotes) || value.detailNotes.some(note =>
    !isRecord(note) || !isString(note.id) || !isString(note.title) || !isString(note.content)
  ))) {
    throw new BackupError('INVALID_FILE', `任務 ${index + 1} 的詳細筆記格式不正確。`);
  }

  return {
    sourceId: readRequiredString(value.sourceId, `任務 ${index + 1} sourceId`),
    parentSourceId: value.parentSourceId === null
      ? null
      : readRequiredString(value.parentSourceId, `任務 ${index + 1} parentSourceId`),
    title: readRequiredString(value.title, `任務 ${index + 1} title`),
    detailNotes: value.detailNotes as PortableTaskV2['detailNotes'],
    description: readOptionalString(value.description, `任務 ${index + 1} description`),
    status,
    assigneeId: readOptionalString(value.assigneeId, `任務 ${index + 1} assigneeId`),
    collaboratorIds: readStringArray(value.collaboratorIds ?? [], `任務 ${index + 1} collaboratorIds`),
    tagSourceIds: readStringArray(value.tagSourceIds ?? [], `任務 ${index + 1} tagSourceIds`),
    startDate: readOptionalString(value.startDate, `任務 ${index + 1} startDate`),
    endDate: readOptionalString(value.endDate, `任務 ${index + 1} endDate`),
    isDurationLocked: readRequiredBoolean(value.isDurationLocked, `任務 ${index + 1} isDurationLocked`),
    nodeType: nodeType as PortableTaskV2['nodeType'],
    kanbanStageSourceId: readOptionalString(value.kanbanStageSourceId, `任務 ${index + 1} kanbanStageSourceId`),
    order,
    createdAt: readOptionalFiniteNumber(value.createdAt, `任務 ${index + 1} createdAt`),
    updatedAt: readOptionalFiniteNumber(value.updatedAt, `任務 ${index + 1} updatedAt`),
    isArchived: readRequiredBoolean(value.isArchived, `任務 ${index + 1} isArchived`),
  };
};

const parsePortableDependency = (value: unknown, index: number): PortableDependencyV2 => {
  if (!isRecord(value)) throw new BackupError('INVALID_FILE', `第 ${index + 1} 個依賴格式不正確。`);
  const fromSide = readRequiredString(value.fromSide, `依賴 ${index + 1} fromSide`);
  const toSide = readRequiredString(value.toSide, `依賴 ${index + 1} toSide`);
  if (!['start', 'end'].includes(fromSide) || !['start', 'end'].includes(toSide)) {
    throw new BackupError('INVALID_FILE', `依賴 ${index + 1} 的端點格式不正確。`);
  }
  const offset = readRequiredInteger(value.offset, `依賴 ${index + 1} offset`);
  return {
    sourceId: readRequiredString(value.sourceId, `依賴 ${index + 1} sourceId`),
    fromSourceId: readRequiredString(value.fromSourceId, `依賴 ${index + 1} fromSourceId`),
    fromSide: fromSide as PortableDependencyV2['fromSide'],
    toSourceId: readRequiredString(value.toSourceId, `依賴 ${index + 1} toSourceId`),
    toSide: toSide as PortableDependencyV2['toSide'],
    offset,
  };
};

const parsePortableTag = (value: unknown, index: number): PortableTagV2 => {
  if (!isRecord(value)) throw new BackupError('INVALID_FILE', `第 ${index + 1} 個標籤格式不正確。`);
  const color = readRequiredString(value.color, `標籤 ${index + 1} color`) as TagColor;
  if (!TAG_COLORS.has(color)) throw new BackupError('INVALID_FILE', `標籤 ${index + 1} color 不受支援。`);
  const order = readRequiredInteger(value.order, `標籤 ${index + 1} order`);
  return {
    sourceId: readRequiredString(value.sourceId, `標籤 ${index + 1} sourceId`),
    name: readRequiredString(value.name, `標籤 ${index + 1} name`),
    color,
    order,
  };
};

const parsePayload = (value: unknown): BackupPayloadV2 => {
  if (!isRecord(value) || !isRecord(value.board)) {
    throw new BackupError('INVALID_FILE', '備份 payload 或 board 格式不正確。');
  }
  if (!Array.isArray(value.tasks) || !Array.isArray(value.dependencies) || !Array.isArray(value.tags)) {
    throw new BackupError('INVALID_FILE', '備份 payload 缺少 tasks、dependencies 或 tags 陣列。');
  }
  return {
    board: { title: readRequiredString(value.board.title, '看板名稱') },
    tasks: value.tasks.map(parsePortableTask),
    dependencies: value.dependencies.map(parsePortableDependency),
    tags: value.tags.map(parsePortableTag),
  };
};

export const validateBackupPayload = (payload: BackupPayloadV2): void => {
  if (!isString(payload.board.title) || !payload.board.title.trim()) {
    throw new BackupError('INVALID_FILE', '看板名稱缺少有效文字。');
  }
  if (payload.tasks.length > BACKUP_MAX_TASKS) {
    throw new BackupError('INVALID_FILE', `備份含 ${payload.tasks.length} 個任務，超過 ${BACKUP_MAX_TASKS} 個安全上限。`);
  }
  if (payload.dependencies.length > BACKUP_MAX_DEPENDENCIES) {
    throw new BackupError('INVALID_FILE', `備份含 ${payload.dependencies.length} 個依賴，超過 ${BACKUP_MAX_DEPENDENCIES} 個安全上限。`);
  }

  const taskIds = new Set<string>();
  payload.tasks.forEach(task => {
    if (!isString(task.sourceId) || !task.sourceId.trim()) throw new BackupError('INVALID_FILE', '任務缺少 sourceId。');
    if (taskIds.has(task.sourceId)) throw new BackupError('INVALID_FILE', `任務 ID ${task.sourceId} 重複。`);
    taskIds.add(task.sourceId);
  });
  const tagIds = new Set<string>();
  const normalizedTagNames = new Set<string>();
  payload.tags.forEach(tag => {
    if (tagIds.has(tag.sourceId)) throw new BackupError('INVALID_FILE', `標籤 ID ${tag.sourceId} 重複。`);
    tagIds.add(tag.sourceId);
    const normalizedName = tag.name.trim().toLocaleLowerCase();
    if (!normalizedName || normalizedTagNames.has(normalizedName)) {
      throw new BackupError('INVALID_FILE', `標籤名稱「${tag.name}」重複或無效。`);
    }
    normalizedTagNames.add(normalizedName);
  });
  const dependencyIds = new Set<string>();
  payload.dependencies.forEach(dependency => {
    if (dependencyIds.has(dependency.sourceId)) {
      throw new BackupError('INVALID_FILE', `依賴 ID ${dependency.sourceId} 重複。`);
    }
    dependencyIds.add(dependency.sourceId);
    if (!taskIds.has(dependency.fromSourceId) || !taskIds.has(dependency.toSourceId)) {
      throw new BackupError('INVALID_FILE', `依賴 ${dependency.sourceId} 指向不存在的任務。`);
    }
  });

  const taskById = new Map(payload.tasks.map(task => [task.sourceId, task]));
  payload.tasks.forEach(task => {
    if (task.parentSourceId && !taskIds.has(task.parentSourceId)) {
      throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 的父任務不存在。`);
    }
    if (task.tagSourceIds.some(tagId => !tagIds.has(tagId))) {
      throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 引用了不存在的標籤。`);
    }
    if (new Set(task.tagSourceIds).size !== task.tagSourceIds.length) {
      throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 有重複的標籤引用。`);
    }
    if (new Set(task.collaboratorIds).size !== task.collaboratorIds.length) {
      throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 有重複的協作者引用。`);
    }
    if (task.kanbanStageSourceId && !taskIds.has(task.kanbanStageSourceId)) {
      throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 的看板階段不存在。`);
    }
    const visited = new Set<string>([task.sourceId]);
    let parentId = task.parentSourceId;
    while (parentId) {
      if (visited.has(parentId)) throw new BackupError('INVALID_FILE', `任務 ${task.sourceId} 形成父子循環。`);
      visited.add(parentId);
      parentId = taskById.get(parentId)?.parentSourceId ?? null;
    }
  });
};

const parseV2Package = async (value: Record<string, unknown>): Promise<BackupPackageV2> => {
  if (value.format !== BACKUP_FORMAT || value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupError('UNSUPPORTED_VERSION', `不支援的備份格式或版本：${String(value.schemaVersion ?? value.format ?? 'unknown')}。`);
  }
  if (!isRecord(value.source) || !isRecord(value.manifest) || !isRecord(value.scope)) {
    throw new BackupError('INVALID_FILE', '備份缺少 source、scope 或 manifest。');
  }
  if (!isRecord(value.manifest.entities) || !isRecord(value.manifest.checksum)) {
    throw new BackupError('INVALID_FILE', '備份 manifest 格式不正確。');
  }
  if (value.scope.type !== 'board') throw new BackupError('UNSUPPORTED_VERSION', '目前只支援單看板備份。');

  const packageId = readRequiredString(value.packageId, 'packageId');
  const createdAt = readRequiredString(value.createdAt, 'createdAt');
  if (!UUID_PATTERN.test(packageId)) throw new BackupError('INVALID_FILE', 'packageId 必須是 UUID。');
  if (!UTC_ISO_PATTERN.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
    throw new BackupError('INVALID_FILE', 'createdAt 必須是 UTC ISO-8601 時間。');
  }
  if (value.source.backend !== 'supabase' && value.source.backend !== 'local-test') {
    throw new BackupError('INVALID_FILE', 'source backend 不受支援。');
  }
  if (value.manifest.canonicalization !== 'json-sort-v1') {
    throw new BackupError('UNSUPPORTED_VERSION', '備份 canonicalization 不受支援。');
  }
  if (value.manifest.checksum.algorithm !== 'SHA-256') {
    throw new BackupError('UNSUPPORTED_VERSION', '備份 checksum 演算法不受支援。');
  }

  const payload = parsePayload(value.payload);
  validateBackupPayload(payload);
  const checksum = readRequiredString(value.manifest.checksum.value, 'checksum');
  const actualChecksum = await calculateBackupChecksum(payload);
  if (checksum.toLowerCase() !== actualChecksum) {
    throw new BackupError('CHECKSUM_MISMATCH', '備份檔完整性驗證失敗，檔案可能已損壞或被修改。');
  }
  const expectedCounts = {
    tasks: payload.tasks.length,
    dependencies: payload.dependencies.length,
    tags: payload.tags.length,
  };
  if (
    value.manifest.entities.tasks !== expectedCounts.tasks
    || value.manifest.entities.dependencies !== expectedCounts.dependencies
    || value.manifest.entities.tags !== expectedCounts.tags
  ) {
    throw new BackupError('INVALID_FILE', '備份 manifest 數量與 payload 不一致。');
  }
  const includes = readStringArray(value.manifest.includes, 'manifest includes');
  const excludes = readStringArray(value.manifest.excludes, 'manifest excludes');
  if (JSON.stringify(includes) !== JSON.stringify(INCLUDED_DOMAINS)
    || JSON.stringify(excludes) !== JSON.stringify(EXCLUDED_DOMAINS)) {
    throw new BackupError('INVALID_FILE', '備份 manifest 的包含或排除範圍與 V2 契約不一致。');
  }

  const sourceBoardTitle = readRequiredString(value.source.boardTitle, 'source boardTitle');
  if (sourceBoardTitle !== payload.board.title) {
    throw new BackupError('INVALID_FILE', 'source boardTitle 與 payload 看板名稱不一致。');
  }

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    packageId,
    createdAt,
    source: {
      appVersion: readRequiredString(value.source.appVersion, 'source appVersion'),
      backend: value.source.backend,
      workspaceId: readRequiredString(value.source.workspaceId, 'source workspaceId'),
      boardId: readRequiredString(value.source.boardId, 'source boardId'),
      boardTitle: sourceBoardTitle,
    },
    scope: { type: 'board' },
    manifest: {
      entities: expectedCounts,
      includes,
      excludes,
      canonicalization: 'json-sort-v1',
      checksum: { algorithm: 'SHA-256', value: actualChecksum },
    },
    payload,
  };
};

const normalizeLegacyNodes = (value: unknown): TaskNode[] => {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return candidates.filter(isRecord).map((node, index) => ({
    id: readRequiredString(node.id, `舊版任務 ${index + 1} id`),
    workspaceId: readRequiredString(node.workspaceId, `舊版任務 ${index + 1} workspaceId`),
    boardId: readRequiredString(node.boardId, `舊版任務 ${index + 1} boardId`),
    parentId: node.parentId === null || node.parentId === undefined ? null : String(node.parentId),
    title: readRequiredString(node.title, `舊版任務 ${index + 1} title`),
    detailNotes: Array.isArray(node.detailNotes) ? node.detailNotes as TaskNode['detailNotes'] : undefined,
    description: isString(node.description) ? node.description : undefined,
    status: TASK_STATUSES.has(node.status as TaskStatus) ? node.status as TaskStatus : 'todo',
    assigneeId: isString(node.assigneeId) ? node.assigneeId : undefined,
    collaboratorIds: Array.isArray(node.collaboratorIds) ? node.collaboratorIds.filter(isString) : [],
    tagIds: Array.isArray(node.tagIds) ? node.tagIds.filter(isString) : [],
    startDate: isString(node.startDate) ? node.startDate : undefined,
    endDate: isString(node.endDate) ? node.endDate : undefined,
    isDurationLocked: Boolean(node.isDurationLocked),
    nodeType: ['group', 'milestone', 'task'].includes(String(node.nodeType))
      ? node.nodeType as TaskNode['nodeType']
      : 'task',
    kanbanStageId: isString(node.kanbanStageId) ? node.kanbanStageId : undefined,
    order: isFiniteNumber(node.order) ? node.order : index,
    createdAt: isFiniteNumber(node.createdAt) ? node.createdAt : undefined,
    updatedAt: isFiniteNumber(node.updatedAt) ? node.updatedAt : undefined,
    isArchived: Boolean(node.isArchived),
  }));
};

const readLegacyBoardTitle = (value: unknown, workspaceId: string, boardId: string): string => {
  if (!Array.isArray(value)) return '舊版匯入看板';
  const workspace = value.find(item => isRecord(item) && item.id === workspaceId);
  if (!isRecord(workspace) || !Array.isArray(workspace.boards)) return '舊版匯入看板';
  const board = workspace.boards.find(item => isRecord(item) && item.id === boardId);
  return isRecord(board) && isString(board.title) && board.title.trim() ? board.title : '舊版匯入看板';
};

const adaptLegacyPackage = async (value: Record<string, unknown>): Promise<BackupInspection> => {
  const legacyVersion = isString(value.version) ? value.version : 'unversioned';
  if (legacyVersion !== 'unversioned' && !LEGACY_VERSIONS.has(legacyVersion)) {
    throw new BackupError('UNSUPPORTED_VERSION', `不支援的舊版 WBS 格式：${legacyVersion}。`);
  }
  const nodes = normalizeLegacyNodes(value.nodes);
  if (nodes.length === 0) throw new BackupError('INVALID_FILE', '舊版備份沒有可辨識的單看板任務資料。');
  const scopes = new Map<string, { workspaceId: string; boardId: string }>();
  nodes.forEach(node => scopes.set(`${node.workspaceId}\u0000${node.boardId}`, {
    workspaceId: node.workspaceId,
    boardId: node.boardId,
  }));
  if (scopes.size !== 1) {
    throw new BackupError(
      'LEGACY_SCOPE_AMBIGUOUS',
      `這份舊版檔案包含 ${scopes.size} 個看板，不能直接合併到單一看板。請改用可分離的單看板備份。`
    );
  }
  const scope = Array.from(scopes.values())[0];
  const nodeIds = new Set(nodes.map(node => node.id));
  const dependencies = (Array.isArray(value.dependencies) ? value.dependencies : [])
    .filter(isRecord)
    .map((dependency, index): Dependency => {
      const fromId = readRequiredString(dependency.fromId, `舊版依賴 ${index + 1} fromId`);
      const toId = readRequiredString(dependency.toId, `舊版依賴 ${index + 1} toId`);
      if (!nodeIds.has(fromId) || !nodeIds.has(toId)) {
        throw new BackupError('INVALID_FILE', `舊版依賴 ${index + 1} 指向不在單看板備份中的任務。`);
      }
      return {
      id: isString(dependency.id) ? dependency.id : `legacy-dependency-${index}`,
      fromId,
      fromSide: dependency.fromSide === 'start' ? 'start' : 'end',
      toId,
      toSide: dependency.toSide === 'start' ? 'start' : 'end',
      offset: isFiniteNumber(dependency.offset) ? dependency.offset : 0,
      };
    });
  const referencedTagIds = new Set(nodes.flatMap(node => node.tagIds ?? []));
  const tags = (Array.isArray(value.tags) ? value.tags : [])
    .filter(isRecord)
    .filter(tag => referencedTagIds.has(String(tag.id)))
    .map((tag, index): TaskTag => ({
      id: readRequiredString(tag.id, `舊版標籤 ${index + 1} id`),
      workspaceId: scope.workspaceId,
      name: readRequiredString(tag.name, `舊版標籤 ${index + 1} name`),
      color: TAG_COLORS.has(tag.color as TagColor) ? tag.color as TagColor : 'green',
      order: isFiniteNumber(tag.order) ? tag.order : index,
    }));
  const boardTitle = readLegacyBoardTitle(value.workspaces, scope.workspaceId, scope.boardId);
  const packageValue = await createBackupPackage({
    ...scope,
    boardTitle,
    tasks: nodes,
    dependencies,
    tags,
  }, 'local-test', `legacy-${legacyVersion}`);

  return {
    package: packageValue,
    sourceKind: 'legacy-converted',
    legacyVersion,
    compatibleModes: ['copy_to_new_board', 'replace_current_board'],
    warnings: ['這是舊版 WBS 單看板資料，已轉成 V2 檢查格式；不包含其他 ProJED 資料。'],
  };
};

export const inspectBackupText = async (text: string): Promise<BackupInspection> => {
  const bytes = new TextEncoder().encode(text).byteLength;
  validateBackupFileSize(bytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('INVALID_FILE', '檔案不是有效的 JSON 備份。');
  }
  if (!isRecord(parsed)) throw new BackupError('INVALID_FILE', '備份最外層格式不正確。');
  if (parsed.format === BACKUP_FORMAT || 'schemaVersion' in parsed) {
    const packageValue = await parseV2Package(parsed);
    return {
      package: packageValue,
      sourceKind: 'v2',
      compatibleModes: ['copy_to_new_board', 'replace_current_board'],
      warnings: [],
    };
  }
  return adaptLegacyPackage(parsed);
};

export const stringifyBackupPackage = (packageValue: BackupPackageV2): string =>
  JSON.stringify(packageValue, null, 2);

export const buildBackupFilename = (packageValue: BackupPackageV2): string => {
  const safeTitle = packageValue.payload.board.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'board';
  const safeBoardId = packageValue.source.boardId
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 16);
  const date = packageValue.createdAt.slice(0, 10);
  return `projed-${safeTitle}-${safeBoardId}-${date}.backup.json`;
};
