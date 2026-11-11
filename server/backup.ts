import { createHash, randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import { CollaborationWriteRepository } from './collaborationWrite.js';
import {
  DomainReadRepository,
  resolveBoard,
  resolveWorkspace,
  validTaskDetailNotes,
  type BoardIdentity,
  type DomainDependency,
  type DomainTask,
  type DomainTaskTag,
} from './domainRead.js';
import { KernelError, type KernelErrorCode } from './errors.js';
import { TaskTrackingRepository } from './taskTracking.js';

const BACKUP_FORMAT = 'projed-backup';
const BACKUP_SCHEMA_VERSION = 3;
const BACKUP_MAX_TASKS = 10_000;
const BACKUP_MAX_DEPENDENCIES = 30_000;
const PLAN_TTL_MS = 10 * 60_000;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TASK_STATUSES = new Set(['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold']);
const NODE_TYPES = new Set(['group', 'milestone', 'task']);
const TAG_COLORS = new Set(['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black', 'gray']);
const SIDES = new Set(['start', 'end']);
const MODES = new Set(['copy_to_new_board', 'replace_current_board']);
const INCLUDED_DOMAINS = [
  '看板名稱', '進行中與封存任務', '任務說明與詳細筆記', '父子階層與排序',
  '任務依賴', '任務使用的工作區標籤', '追蹤副本與投影位置',
];
const INCLUDED_DOMAINS_V2 = INCLUDED_DOMAINS.slice(0, -1);
const EXCLUDED_DOMAINS = [
  '工作區成員與看板權限', '會議與工作紀錄', '附件與外部檔案',
  '行事曆訂閱與連結金鑰', '稽核、活動與 RAG 衍生資料', '其他工作區與看板',
];

type BackupMode = 'copy_to_new_board' | 'replace_current_board';
type BackupErrorCode = Extract<KernelErrorCode,
  | 'INVALID_FILE' | 'CHECKSUM_MISMATCH' | 'UNSUPPORTED_VERSION' | 'PERMISSION_DENIED'
  | 'TARGET_CHANGED' | 'CROSS_BOARD_ID_COLLISION' | 'OUT_OF_PACKAGE_REFERENCE'
  | 'IMPORT_ROLLED_BACK' | 'VERIFY_MISMATCH' | 'BACKEND_UNSUPPORTED'>;

type PortableTask = {
  sourceId: string; parentSourceId: string | null; title: string; detailNotes?: unknown[];
  description?: string; status: DomainTask['status']; assigneeIds?: string[]; assigneeId?: string;
  collaboratorIds: string[]; tagSourceIds: string[]; startDate?: string; endDate?: string;
  isDurationLocked: boolean; nodeType: NonNullable<DomainTask['nodeType']>;
  kanbanStageSourceId?: string; order: number; createdAt?: number; updatedAt?: number; isArchived: boolean;
};
type PortableDependency = {
  sourceId: string; fromSourceId: string; fromSide: 'start' | 'end';
  toSourceId: string; toSide: 'start' | 'end'; offset: number;
};
type PortableTag = { sourceId: string; name: string; color: DomainTaskTag['color']; order: number };
type PortableReference = {
  sourceId: string; taskSourceId: string; parentSourceId: string | null;
  order: number; kanbanStageSourceId?: string; revision: number;
};
type BackupPayload = {
  board: { title: string }; tasks: PortableTask[]; dependencies: PortableDependency[];
  tags: PortableTag[]; trackingReferences?: PortableReference[];
};
type BackupPackage = {
  format: typeof BACKUP_FORMAT; schemaVersion: 2 | 3; packageId: string; createdAt: string;
  source: {
    appVersion: string; backend: 'supabase' | 'local-test' | 'http'; workspaceId: string;
    workspaceTitle?: string; boardId: string; boardTitle: string;
  };
  scope: { type: 'board' };
  manifest: {
    entities: { tasks: number; dependencies: number; tags: number; trackingReferences?: number };
    includes: string[]; excludes: string[]; canonicalization: 'json-sort-v1';
    checksum: { algorithm: 'SHA-256'; value: string };
  };
  payload: BackupPayload;
};
type BackupTarget = { workspaceId: string; workspaceTitle: string; boardId?: string; boardTitle: string };
export type BackupCounts = {
  create: number; update: number; delete: number; keep: number; dependencies: number;
  tagsToCreate: number; tagsToReuse: number; unresolvedPeople: number; blockingRecordLinks: number;
  trackingReferences?: number;
};
export type BackupPlan = {
  planId: string; executionId: string; packageId: string; createdAt: string; expiresAt: string;
  mode: BackupMode; target: BackupTarget; allowed: boolean; expectedTargetFingerprint: string | null;
  counts: BackupCounts; warnings: string[];
  blockers: Array<{ code: BackupErrorCode; message: string }>;
  confirmationPhrase?: string;
};
export type BackupExecutionResult = {
  executionId: string; mode: BackupMode; targetWorkspaceId: string; targetBoardId: string;
  targetBoardTitle: string; counts: BackupCounts; warnings: string[];
  sourceTaskIdMap: Record<string, string>; sourceTrackingReferenceIdMap?: Record<string, string>;
  postWriteFingerprint: string; idempotentReplay: boolean;
};
type TrackingReference = {
  id: string; taskId: string; workspaceId: string; boardId: string; sourceBoardId: string;
  parentPlacementId: string | null; order: number; kanbanStageId?: string; revision: number;
  createdAt: number; updatedAt: number; removedAt?: number;
};
export type BoardBackupSource = {
  workspaceId: string; workspaceTitle?: string; boardId: string; boardTitle: string;
  tasks: DomainTask[]; dependencies: DomainDependency[]; tags: DomainTaskTag[];
  trackingReferences?: TrackingReference[];
};

function backupError(code: BackupErrorCode, message: string, status = 400): never {
  throw new KernelError(code, message, status);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) backupError('INVALID_FILE', `${label} is invalid`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 10_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) backupError('INVALID_FILE', `${label} is invalid`);
  return value;
}

function optionalText(value: unknown, label: string, max = 10_000): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : text(value, label, max);
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    backupError('INVALID_FILE', `${label} is invalid`);
  }
  return value as string[];
}

function finite(value: unknown, label: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    backupError('INVALID_FILE', `${label} is invalid`);
  }
  return value;
}

function optionalFinite(value: unknown, label: string): number | undefined {
  return value === undefined || value === null ? undefined : finite(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') backupError('INVALID_FILE', `${label} is invalid`);
  return value;
}

function parseTask(value: unknown, index: number): PortableTask {
  const input = record(value, `task ${index + 1}`);
  const status = text(input.status, 'task status') as DomainTask['status'];
  const nodeType = text(input.nodeType, 'task nodeType') as NonNullable<DomainTask['nodeType']>;
  if (!TASK_STATUSES.has(status) || !NODE_TYPES.has(nodeType)) backupError('INVALID_FILE', 'task enum is invalid');
  if (input.detailNotes !== undefined && !validTaskDetailNotes(input.detailNotes)) {
    backupError('INVALID_FILE', 'task detailNotes are invalid');
  }
  const assigneeIds = input.assigneeIds === undefined ? undefined : stringList(input.assigneeIds, 'task assigneeIds');
  const parentSourceId = input.parentSourceId === null ? null : text(input.parentSourceId, 'task parentSourceId');
  const startDate = optionalText(input.startDate, 'task startDate', 10);
  const endDate = optionalText(input.endDate, 'task endDate', 10);
  if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))
      || (startDate && endDate && startDate > endDate)) backupError('INVALID_FILE', 'task dates are invalid');
  return {
    sourceId: text(input.sourceId, 'task sourceId', 512), parentSourceId,
    title: text(input.title, 'task title'),
    ...(input.detailNotes === undefined ? {} : { detailNotes: input.detailNotes as unknown[] }),
    ...(optionalText(input.description, 'task description') === undefined ? {} : { description: input.description as string }),
    status,
    ...(assigneeIds === undefined ? {} : { assigneeIds }),
    ...(optionalText(input.assigneeId, 'task assigneeId', 512) === undefined ? {} : { assigneeId: input.assigneeId as string }),
    collaboratorIds: stringList(input.collaboratorIds, 'task collaboratorIds'),
    tagSourceIds: stringList(input.tagSourceIds, 'task tagSourceIds'),
    ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}),
    isDurationLocked: booleanValue(input.isDurationLocked, 'task isDurationLocked'), nodeType,
    ...(optionalText(input.kanbanStageSourceId, 'task kanbanStageSourceId', 512) === undefined
      ? {} : { kanbanStageSourceId: input.kanbanStageSourceId as string }),
    order: finite(input.order, 'task order', true),
    ...(optionalFinite(input.createdAt, 'task createdAt') === undefined ? {} : { createdAt: input.createdAt as number }),
    ...(optionalFinite(input.updatedAt, 'task updatedAt') === undefined ? {} : { updatedAt: input.updatedAt as number }),
    isArchived: booleanValue(input.isArchived, 'task isArchived'),
  };
}

function parseDependency(value: unknown, index: number): PortableDependency {
  const input = record(value, `dependency ${index + 1}`);
  const fromSide = text(input.fromSide, 'dependency fromSide') as 'start' | 'end';
  const toSide = text(input.toSide, 'dependency toSide') as 'start' | 'end';
  if (!SIDES.has(fromSide) || !SIDES.has(toSide)) backupError('INVALID_FILE', 'dependency side is invalid');
  return {
    sourceId: text(input.sourceId, 'dependency sourceId', 512),
    fromSourceId: text(input.fromSourceId, 'dependency fromSourceId', 512), fromSide,
    toSourceId: text(input.toSourceId, 'dependency toSourceId', 512), toSide,
    offset: finite(input.offset, 'dependency offset'),
  };
}

function parseTag(value: unknown, index: number): PortableTag {
  const input = record(value, `tag ${index + 1}`);
  const color = text(input.color, 'tag color') as DomainTaskTag['color'];
  if (!TAG_COLORS.has(color)) backupError('INVALID_FILE', 'tag color is invalid');
  return { sourceId: text(input.sourceId, 'tag sourceId', 512), name: text(input.name, 'tag name', 120),
    color, order: finite(input.order, 'tag order', true) };
}

function parseReference(value: unknown, index: number): PortableReference {
  const input = record(value, `tracking reference ${index + 1}`);
  const revision = finite(input.revision, 'tracking reference revision', true);
  if (revision < 1) backupError('INVALID_FILE', 'tracking reference revision is invalid');
  return {
    sourceId: text(input.sourceId, 'tracking reference sourceId', 512),
    taskSourceId: text(input.taskSourceId, 'tracking reference taskSourceId', 512),
    parentSourceId: input.parentSourceId === null ? null : text(input.parentSourceId, 'tracking reference parentSourceId', 512),
    order: finite(input.order, 'tracking reference order'),
    ...(optionalText(input.kanbanStageSourceId, 'tracking reference kanbanStageSourceId', 512) === undefined
      ? {} : { kanbanStageSourceId: input.kanbanStageSourceId as string }),
    revision,
  };
}

function validatePayload(payload: BackupPayload): void {
  if (payload.tasks.length > BACKUP_MAX_TASKS || (payload.trackingReferences?.length ?? 0) > BACKUP_MAX_TASKS
      || payload.dependencies.length > BACKUP_MAX_DEPENDENCIES) backupError('INVALID_FILE', 'backup entity limit exceeded', 413);
  const taskIds = new Set<string>();
  for (const task of payload.tasks) {
    if (taskIds.has(task.sourceId)) backupError('INVALID_FILE', 'duplicate task id');
    taskIds.add(task.sourceId);
  }
  const tagIds = new Set<string>();
  const tagNames = new Set<string>();
  for (const tag of payload.tags) {
    const name = tag.name.trim().toLocaleLowerCase();
    if (tagIds.has(tag.sourceId) || tagNames.has(name)) backupError('INVALID_FILE', 'duplicate tag');
    tagIds.add(tag.sourceId); tagNames.add(name);
  }
  const dependencyIds = new Set<string>();
  for (const dependency of payload.dependencies) {
    if (dependencyIds.has(dependency.sourceId)
        || !taskIds.has(dependency.fromSourceId) || !taskIds.has(dependency.toSourceId)) {
      backupError('INVALID_FILE', 'dependency graph is invalid');
    }
    dependencyIds.add(dependency.sourceId);
  }
  const references = payload.trackingReferences ?? [];
  const referenceIds = new Set(references.map(item => item.sourceId));
  if (referenceIds.size !== references.length) backupError('INVALID_FILE', 'duplicate tracking reference');
  const referenceScopes = new Set<string>();
  for (const reference of references) {
    if (!taskIds.has(reference.taskSourceId)) backupError('OUT_OF_PACKAGE_REFERENCE', 'tracking reference task is outside the package');
    if (reference.parentSourceId && !taskIds.has(reference.parentSourceId) && !referenceIds.has(reference.parentSourceId)) {
      backupError('OUT_OF_PACKAGE_REFERENCE', 'tracking reference parent is outside the package');
    }
    const scope = `${reference.taskSourceId}\u0000${reference.parentSourceId ?? ''}`;
    if (referenceScopes.has(scope)) backupError('INVALID_FILE', 'duplicate tracking reference scope');
    referenceScopes.add(scope);
  }
  const referenceById = new Map(references.map(reference => [reference.sourceId, reference]));
  for (const reference of references) {
    const visited = new Set([reference.sourceId]);
    let parent = reference.parentSourceId;
    while (parent && referenceById.has(parent)) {
      if (visited.has(parent)) backupError('INVALID_FILE', 'tracking reference hierarchy contains a cycle');
      visited.add(parent);
      parent = referenceById.get(parent)?.parentSourceId ?? null;
    }
  }
  const taskById = new Map(payload.tasks.map(task => [task.sourceId, task]));
  for (const task of payload.tasks) {
    if (task.parentSourceId && !taskIds.has(task.parentSourceId)) backupError('INVALID_FILE', 'task parent is outside the package');
    if (task.kanbanStageSourceId && !taskIds.has(task.kanbanStageSourceId)) backupError('INVALID_FILE', 'task stage is outside the package');
    if (task.tagSourceIds.some(id => !tagIds.has(id)) || new Set(task.tagSourceIds).size !== task.tagSourceIds.length) {
      backupError('INVALID_FILE', 'task tags are invalid');
    }
    const primary = task.assigneeIds?.length ? task.assigneeIds : task.assigneeId ? [task.assigneeId] : [];
    if (new Set(primary).size !== primary.length || new Set(task.collaboratorIds).size !== task.collaboratorIds.length
        || primary.some(id => task.collaboratorIds.includes(id))) backupError('INVALID_FILE', 'task assignments are invalid');
    const visited = new Set([task.sourceId]);
    let parent = task.parentSourceId;
    while (parent) {
      if (visited.has(parent)) backupError('INVALID_FILE', 'task hierarchy contains a cycle');
      visited.add(parent); parent = taskById.get(parent)?.parentSourceId ?? null;
    }
  }
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = normalizeStable(child);
    return result;
  }, {});
}

function canonicalPayload(payload: BackupPayload): string {
  return JSON.stringify(normalizeStable({
    board: payload.board,
    tasks: [...payload.tasks].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    dependencies: [...payload.dependencies].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    tags: [...payload.tags].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    ...(payload.trackingReferences
      ? { trackingReferences: [...payload.trackingReferences].sort((a, b) => a.sourceId.localeCompare(b.sourceId)) }
      : {}),
  }));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseBackupPackage(value: unknown): BackupPackage {
  const input = record(value, 'backup package');
  const schemaVersion = input.schemaVersion;
  if (input.format !== BACKUP_FORMAT || (schemaVersion !== 2 && schemaVersion !== BACKUP_SCHEMA_VERSION)) {
    backupError('UNSUPPORTED_VERSION', 'backup version is unsupported');
  }
  const source = record(input.source, 'backup source');
  const scope = record(input.scope, 'backup scope');
  const manifest = record(input.manifest, 'backup manifest');
  const entities = record(manifest.entities, 'backup manifest entities');
  const checksum = record(manifest.checksum, 'backup checksum');
  const payloadInput = record(input.payload, 'backup payload');
  const board = record(payloadInput.board, 'backup board');
  if (scope.type !== 'board' || manifest.canonicalization !== 'json-sort-v1' || checksum.algorithm !== 'SHA-256') {
    backupError('UNSUPPORTED_VERSION', 'backup contract is unsupported');
  }
  const backend = source.backend;
  if (backend !== 'supabase' && backend !== 'local-test' && backend !== 'http') backupError('INVALID_FILE', 'backup backend is invalid');
  if (!Array.isArray(payloadInput.tasks) || !Array.isArray(payloadInput.dependencies) || !Array.isArray(payloadInput.tags)
      || (payloadInput.trackingReferences !== undefined && !Array.isArray(payloadInput.trackingReferences))) {
    backupError('INVALID_FILE', 'backup payload collections are invalid');
  }
  const payload: BackupPayload = {
    board: { title: text(board.title, 'backup board title', 500) },
    tasks: payloadInput.tasks.map(parseTask), dependencies: payloadInput.dependencies.map(parseDependency),
    tags: payloadInput.tags.map(parseTag),
    ...(payloadInput.trackingReferences === undefined
      ? {} : { trackingReferences: payloadInput.trackingReferences.map(parseReference) }),
  };
  validatePayload(payload);
  const packageId = text(input.packageId, 'packageId', 64);
  const createdAt = text(input.createdAt, 'createdAt', 64);
  if (!UUID_RE.test(packageId) || !UTC_ISO_RE.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
    backupError('INVALID_FILE', 'backup identity is invalid');
  }
  const expectedChecksum = text(checksum.value, 'checksum', 64).toLowerCase();
  if (!SHA256_RE.test(expectedChecksum) || sha256(canonicalPayload(payload)) !== expectedChecksum) {
    backupError('CHECKSUM_MISMATCH', 'backup checksum does not match');
  }
  const expectedIncludes = schemaVersion === 3 ? INCLUDED_DOMAINS : INCLUDED_DOMAINS_V2;
  const includes = stringList(manifest.includes, 'manifest includes');
  const excludes = stringList(manifest.excludes, 'manifest excludes');
  const expectedReferenceCount = payload.trackingReferences?.length;
  if (schemaVersion === 2
      && (payload.trackingReferences !== undefined || entities.trackingReferences !== undefined)) {
    backupError('INVALID_FILE', 'V2 backup cannot contain V3 tracking references');
  }
  if (JSON.stringify(includes) !== JSON.stringify(expectedIncludes)
      || JSON.stringify(excludes) !== JSON.stringify(EXCLUDED_DOMAINS)
      || entities.tasks !== payload.tasks.length || entities.dependencies !== payload.dependencies.length
      || entities.tags !== payload.tags.length
      || (schemaVersion === 3 && entities.trackingReferences !== expectedReferenceCount)) {
    backupError('INVALID_FILE', 'backup manifest does not match the payload');
  }
  const boardTitle = text(source.boardTitle, 'source boardTitle', 500);
  if (boardTitle !== payload.board.title) backupError('INVALID_FILE', 'backup board title does not match');
  return {
    format: BACKUP_FORMAT, schemaVersion, packageId, createdAt,
    source: {
      appVersion: text(source.appVersion, 'source appVersion', 128), backend,
      workspaceId: text(source.workspaceId, 'source workspaceId', 512),
      ...(optionalText(source.workspaceTitle, 'source workspaceTitle', 500) ? { workspaceTitle: source.workspaceTitle as string } : {}),
      boardId: text(source.boardId, 'source boardId', 512), boardTitle,
    },
    scope: { type: 'board' },
    manifest: {
      entities: { tasks: payload.tasks.length, dependencies: payload.dependencies.length, tags: payload.tags.length,
        ...(payload.trackingReferences ? { trackingReferences: payload.trackingReferences.length } : {}) },
      includes, excludes, canonicalization: 'json-sort-v1', checksum: { algorithm: 'SHA-256', value: expectedChecksum },
    },
    payload,
  };
}

function parseTarget(value: unknown): BackupTarget {
  const input = record(value, 'backup target');
  return {
    workspaceId: text(input.workspaceId, 'target workspaceId', 512),
    workspaceTitle: text(input.workspaceTitle, 'target workspaceTitle', 500),
    ...(optionalText(input.boardId, 'target boardId', 512) ? { boardId: input.boardId as string } : {}),
    boardTitle: text(input.boardTitle, 'target boardTitle', 500),
  };
}

export function parsePlanRequest(value: unknown): { package: BackupPackage; mode: BackupMode; target: BackupTarget } {
  const input = record(value, 'backup plan request');
  const mode = text(input.mode, 'backup mode') as BackupMode;
  if (!MODES.has(mode)) backupError('INVALID_FILE', 'backup mode is invalid');
  return { package: parseBackupPackage(input.package), mode, target: parseTarget(input.target) };
}

export function parseExecuteRequest(value: unknown): { package: BackupPackage; plan: BackupPlan; newBoardTitle?: string } {
  const input = record(value, 'backup execute request');
  const packageValue = parseBackupPackage(input.package);
  const rawPlan = record(input.plan, 'backup plan');
  const mode = text(rawPlan.mode, 'plan mode') as BackupMode;
  if (!MODES.has(mode)) backupError('INVALID_FILE', 'plan mode is invalid');
  const executionId = text(rawPlan.executionId, 'executionId', 64);
  const planId = text(rawPlan.planId, 'planId', 64);
  const expiresAt = text(rawPlan.expiresAt, 'expiresAt', 64);
  const createdAt = text(rawPlan.createdAt, 'plan createdAt', 64);
  if (![executionId, planId].every(id => UUID_RE.test(id)) || !UTC_ISO_RE.test(expiresAt) || !UTC_ISO_RE.test(createdAt)) {
    backupError('INVALID_FILE', 'plan identity is invalid');
  }
  const expectedTargetFingerprint = rawPlan.expectedTargetFingerprint;
  if (expectedTargetFingerprint !== null
      && (typeof expectedTargetFingerprint !== 'string' || !SHA256_RE.test(expectedTargetFingerprint))) {
    backupError('INVALID_FILE', 'plan fingerprint is invalid');
  }
  return {
    package: packageValue,
    plan: {
      planId, executionId, packageId: text(rawPlan.packageId, 'plan packageId', 64), createdAt, expiresAt,
      mode, target: parseTarget(rawPlan.target), allowed: rawPlan.allowed === true,
      expectedTargetFingerprint,
      counts: record(rawPlan.counts, 'plan counts') as unknown as BackupCounts,
      warnings: stringList(rawPlan.warnings, 'plan warnings'),
      blockers: Array.isArray(rawPlan.blockers) ? rawPlan.blockers as BackupPlan['blockers'] : [],
      ...(optionalText(rawPlan.confirmationPhrase, 'confirmationPhrase', 500)
        ? { confirmationPhrase: rawPlan.confirmationPhrase as string } : {}),
    },
    ...(optionalText(input.newBoardTitle, 'newBoardTitle', 500) ? { newBoardTitle: input.newBoardTitle as string } : {}),
  };
}

function emptyCounts(): BackupCounts {
  return { create: 0, update: 0, delete: 0, keep: 0, dependencies: 0,
    tagsToCreate: 0, tagsToReuse: 0, unresolvedPeople: 0, blockingRecordLinks: 0 };
}

async function assertWorkspaceCapability(port: ActorQueryPort, tenantId: string, capability: string): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(
    'SELECT projed_core.actor_has_workspace_capability_v1($1::uuid, $2::text) AS allowed', [tenantId, capability]);
  if (result.rows[0]?.allowed !== true) backupError('PERMISSION_DENIED', 'workspace permission is required', 403);
}

async function assertBoardCapabilities(port: ActorQueryPort, board: BoardIdentity, capabilities: string[]): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(`
    SELECT COALESCE(bool_and(projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, capability)), false) AS allowed
      FROM unnest($3::text[]) AS capability
  `, [board.tenantId, board.id, capabilities]);
  if (result.rows[0]?.allowed !== true) backupError('PERMISSION_DENIED', 'board management permission is required', 403);
}

export class BackupRepository {
  constructor(
    private readonly reads = new DomainReadRepository(),
    private readonly tracking = new TaskTrackingRepository(),
    private readonly collaboration = new CollaborationWriteRepository(),
  ) {}

  async readBoardSource(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<BoardBackupSource> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const workspaces = await this.reads.listWorkspaces(port);
    const tasks = await this.reads.listTasks(port, workspaceRef, boardRef);
    const dependencies = await this.reads.listDependencies(port, workspaceRef, boardRef);
    const tags = await this.reads.listTags(port, workspaceRef);
    const allReferences = await this.tracking.list(port, workspaceRef);
    const workspace = workspaces.find(item => item.id === board.legacyWorkspaceId);
    const boardValue = workspace?.boards.find(item => item.id === board.legacyBoardId);
    if (!workspace || !boardValue) backupError('PERMISSION_DENIED', 'board is unavailable', 403);
    const tagIds = new Set(tasks.flatMap(task => task.tagIds));
    const references = (allReferences as TrackingReference[])
      .filter(reference => reference.workspaceId === board.legacyWorkspaceId && reference.boardId === board.legacyBoardId);
    return {
      workspaceId: board.legacyWorkspaceId, workspaceTitle: workspace.title,
      boardId: board.legacyBoardId, boardTitle: boardValue.title, tasks, dependencies,
      tags: tags.filter(tag => tagIds.has(tag.id)),
      ...(references.length ? { trackingReferences: references } : {}),
    };
  }

  async readBoardFingerprint(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<string> {
    const source = await this.readBoardSource(port, workspaceRef, boardRef);
    return sha256(JSON.stringify(normalizeStable({
      ...source,
      tasks: [...source.tasks].sort((a, b) => a.id.localeCompare(b.id)),
      dependencies: [...source.dependencies].sort((a, b) => a.id.localeCompare(b.id)),
      tags: [...source.tags].sort((a, b) => a.id.localeCompare(b.id)),
      trackingReferences: [...(source.trackingReferences ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    })));
  }

  async planImport(port: ActorQueryPort, request: { package: BackupPackage; mode: BackupMode; target: BackupTarget }): Promise<BackupPlan> {
    return this.buildPlan(port, request);
  }

  private async buildPlan(port: ActorQueryPort, request: {
    package: BackupPackage; mode: BackupMode; target: BackupTarget;
  }): Promise<BackupPlan> {
    const now = new Date();
    const blockers: BackupPlan['blockers'] = [];
    const warnings: string[] = [];
    const counts = emptyCounts();
    counts.dependencies = request.package.payload.dependencies.length;
    if (request.package.payload.trackingReferences?.length) counts.trackingReferences = request.package.payload.trackingReferences.length;
    const target = { ...request.target };
    let tenantId: string | null = null;
    try {
      const workspace = await resolveWorkspace(port, request.target.workspaceId);
      tenantId = workspace.id;
      const workspaceValue = (await this.reads.listWorkspaces(port)).find(item => item.id === workspace.legacyWorkspaceId);
      if (workspaceValue) target.workspaceTitle = workspaceValue.title;
    } catch (error) {
      if (error instanceof KernelError
          && (error.code === 'RESOURCE_NOT_FOUND' || error.code === 'ACCESS_DENIED' || error.code === 'PERMISSION_DENIED')) {
        blockers.push({ code: 'PERMISSION_DENIED', message: '目標工作區不存在或不可存取。' });
      } else throw error;
    }
    let existingTags: DomainTaskTag[] = [];
    let knownUsers = new Set<string>();
    if (tenantId) {
      existingTags = await this.reads.listTags(port, request.target.workspaceId);
      const members = await port.query<{ user_id: string }>(`
        SELECT user_id::text AS user_id FROM projed_core.tenant_members
         WHERE tenant_id = $1::uuid AND status = 'active'
      `, [tenantId]);
      knownUsers = new Set(members.rows.map(row => row.user_id));
    }
    const tagsByName = new Map(existingTags.map(tag => [tag.name.trim().toLocaleLowerCase(), tag]));
    for (const tag of request.package.payload.tags) {
      const matched = tagsByName.get(tag.name.trim().toLocaleLowerCase());
      if (matched) {
        counts.tagsToReuse += 1;
        if (matched.color !== tag.color) warnings.push(`標籤「${tag.name}」沿用目標工作區的 ${matched.color} 顏色。`);
      } else counts.tagsToCreate += 1;
    }
    const people = new Set<string>();
    for (const task of request.package.payload.tasks) {
      (task.assigneeIds?.length ? task.assigneeIds : task.assigneeId ? [task.assigneeId] : []).forEach(id => people.add(id));
      task.collaboratorIds.forEach(id => people.add(id));
    }
    counts.unresolvedPeople = [...people].filter(id => !knownUsers.has(id)).length;
    if (counts.unresolvedPeople) warnings.push(`${counts.unresolvedPeople} 位負責人或協作者不在目標工作區，匯入時會清除其指派。`);

    let expectedTargetFingerprint: string | null = null;
    if (request.mode === 'copy_to_new_board') {
      counts.create = request.package.payload.tasks.length;
      if (tenantId) {
        try { await assertWorkspaceCapability(port, tenantId, 'create_board'); }
        catch { blockers.push({ code: 'PERMISSION_DENIED', message: '你沒有在目標工作區建立看板的權限。' }); }
      }
    } else if (!request.target.boardId) {
      blockers.push({ code: 'INVALID_FILE', message: '取代模式缺少目標看板。' });
    } else if (tenantId) {
      try {
        const board = await resolveBoard(port, request.target.workspaceId, request.target.boardId);
        await assertBoardCapabilities(port, board, [
          'read_board', 'create_task', 'edit_task', 'delete_task', 'manage_task_reference',
          'create_dependency', 'delete_dependency',
        ]);
        await port.authorizeBackupGuard(board.tenantId, board.id);
        const boardValue = (await this.reads.listWorkspaces(port)).find(item => item.id === board.legacyWorkspaceId)
          ?.boards.find(item => item.id === board.legacyBoardId);
        if (boardValue) target.boardTitle = boardValue.title;
        if (request.package.source.workspaceId !== board.legacyWorkspaceId
            || request.package.source.boardId !== board.legacyBoardId) blockers.push({
          code: 'CROSS_BOARD_ID_COLLISION',
          message: '只有同一張看板建立的備份可以取代目前內容；請改用複製成新看板。',
        });
        await port.authorizeTaskTrackingDerivedRead(board.tenantId);
        const tasks = await this.reads.listTasks(port, request.target.workspaceId, request.target.boardId);
        const packageIds = new Set(request.package.payload.tasks.map(task => task.sourceId));
        const targetIds = new Set(tasks.map(task => task.id));
        counts.update = request.package.payload.tasks.filter(task => targetIds.has(task.sourceId)).length;
        counts.keep = counts.update;
        counts.create = request.package.payload.tasks.length - counts.update;
        const removedStorageIds = tasks.filter(task => !packageIds.has(task.id)).map(task => task.storageId);
        counts.delete = removedStorageIds.length;
        if (removedStorageIds.length) {
          const links = await port.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM projed_core.record_task_links
             WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND item_id = ANY($3::uuid[])
          `, [board.tenantId, board.id, removedStorageIds]);
          counts.blockingRecordLinks = Number(links.rows[0]?.count ?? 0);
          const externalReferences = await port.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM projed_core.task_tracking_references
             WHERE tenant_id = $1::uuid AND task_project_id = $2::uuid
               AND task_id = ANY($3::uuid[]) AND target_project_id <> $2::uuid
          `, [board.tenantId, board.id, removedStorageIds]);
          if (counts.blockingRecordLinks > 0) blockers.push({
            code: 'OUT_OF_PACKAGE_REFERENCE',
            message: `有 ${counts.blockingRecordLinks} 個紀錄連結指向將被移除的任務，已阻擋取代。`,
          });
          if (Number(externalReferences.rows[0]?.count ?? 0) > 0) blockers.push({
            code: 'OUT_OF_PACKAGE_REFERENCE', message: '將被移除的任務仍有其他看板的追蹤副本。',
          });
        }
        const externalTargetReferences = await port.query<{ count: string }>(`
          SELECT count(*)::text AS count FROM projed_core.task_tracking_references
           WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid
             AND task_project_id <> $2::uuid AND removed_at IS NULL
        `, [board.tenantId, board.id]);
        if (Number(externalTargetReferences.rows[0]?.count ?? 0) > 0) blockers.push({
          code: 'OUT_OF_PACKAGE_REFERENCE', message: '目標看板含來源在其他看板的追蹤副本，不能以單看板備份取代。',
        });
        expectedTargetFingerprint = await this.readBoardFingerprint(port, board.legacyWorkspaceId, board.legacyBoardId);
      } catch (error) {
        if (error instanceof KernelError && (error.code === 'PERMISSION_DENIED' || error.code === 'ACCESS_DENIED')) {
          blockers.push({ code: 'PERMISSION_DENIED', message: '你沒有取代目前看板內容的權限。' });
        } else if (error instanceof KernelError && error.code === 'RESOURCE_NOT_FOUND') {
          blockers.push({ code: 'PERMISSION_DENIED', message: '目標看板不存在或不可存取。' });
        } else throw error;
      }
    }
    return {
      planId: randomUUID(), executionId: randomUUID(), packageId: request.package.packageId,
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
      mode: request.mode, target, allowed: blockers.length === 0, expectedTargetFingerprint,
      counts, warnings, blockers,
      ...(request.mode === 'replace_current_board' ? { confirmationPhrase: target.boardTitle } : {}),
    };
  }

  // Execute is intentionally one actor transaction.  The receipt and all
  // board mutations commit or roll back together.
  async executeImport(
    port: ActorQueryPort,
    request: { package: BackupPackage; plan: BackupPlan; newBoardTitle?: string },
  ): Promise<BackupExecutionResult> {
    return this.executeImportTransaction(port, request);
  }

  private async executeImportTransaction(
    port: ActorQueryPort,
    request: { package: BackupPackage; plan: BackupPlan; newBoardTitle?: string },
  ): Promise<BackupExecutionResult> {
    if (request.plan.packageId !== request.package.packageId) {
      backupError('INVALID_FILE', 'backup plan does not match the package');
    }
    const workspace = await resolveWorkspace(port, request.plan.target.workspaceId);
    let replaceBoard: BoardIdentity | null = null;
    if (request.plan.mode === 'copy_to_new_board') {
      await assertWorkspaceCapability(port, workspace.id, 'create_board');
    } else {
      if (!request.plan.target.boardId) backupError('INVALID_FILE', 'replacement target is missing');
      replaceBoard = await resolveBoard(port, request.plan.target.workspaceId, request.plan.target.boardId);
      await assertBoardCapabilities(port, replaceBoard, [
        'read_board', 'create_task', 'edit_task', 'delete_task', 'manage_task_reference',
        'create_dependency', 'delete_dependency',
      ]);
    }
    const requestHash = sha256(JSON.stringify(normalizeStable({
      package: request.package, mode: request.plan.mode, target: request.plan.target,
      expectedTargetFingerprint: request.plan.expectedTargetFingerprint,
      newBoardTitle: request.newBoardTitle ?? null,
    })));
    const existing = await port.query<{ request_hash: string; result: BackupExecutionResult | null }>(`
      SELECT request_hash, result FROM projed_core.backup_import_executions
       WHERE tenant_id = $1::uuid AND execution_id = $2::uuid FOR UPDATE
    `, [workspace.id, request.plan.executionId]);
    if (existing.rows.length) {
      const row = existing.rows[0]!;
      if (row.request_hash !== requestHash || !row.result) {
        backupError('IMPORT_ROLLED_BACK', 'execution id is already bound', 409);
      }
      return { ...row.result, idempotentReplay: true };
    }
    if (Date.parse(request.plan.expiresAt) <= Date.now()) backupError('TARGET_CHANGED', 'backup plan expired', 409);
    await port.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:backup:' || $1::text, 0))", [workspace.id]);
    if (replaceBoard) {
      await port.query(`SELECT revision FROM projed_core.resource_revisions
        WHERE tenant_id = $1::uuid AND project_id = $2::uuid FOR UPDATE`, [workspace.id, replaceBoard.id]);
    }
    const receiptAfterLock = await port.query<{ request_hash: string; result: BackupExecutionResult | null }>(`
      SELECT request_hash, result FROM projed_core.backup_import_executions
       WHERE tenant_id = $1::uuid AND execution_id = $2::uuid FOR UPDATE
    `, [workspace.id, request.plan.executionId]);
    if (receiptAfterLock.rows.length) {
      const row = receiptAfterLock.rows[0]!;
      if (row.request_hash !== requestHash || !row.result) {
        backupError('IMPORT_ROLLED_BACK', 'execution id is already bound', 409);
      }
      return { ...row.result, idempotentReplay: true };
    }
    const refreshed = await this.buildPlan(port, {
      package: request.package, mode: request.plan.mode, target: request.plan.target,
    });
    if (!refreshed.allowed) {
      const blocker = refreshed.blockers[0];
      backupError(blocker?.code ?? 'IMPORT_ROLLED_BACK', blocker?.message ?? 'backup plan is blocked', 409);
    }
    if (request.plan.mode === 'replace_current_board'
        && refreshed.expectedTargetFingerprint !== request.plan.expectedTargetFingerprint) {
      backupError('TARGET_CHANGED', 'target board changed after preview', 409);
    }
    const insertedReceipt = await port.query(`
      INSERT INTO projed_core.backup_import_executions(tenant_id, execution_id, actor_id, request_hash)
      VALUES ($1::uuid, $2::uuid, projed_core.current_actor_user_id_v1(), $3)
      ON CONFLICT DO NOTHING
    `, [workspace.id, request.plan.executionId, requestHash]);
    if (insertedReceipt.rowCount !== 1) backupError('IMPORT_ROLLED_BACK', 'execution id is already bound', 409);

    let targetBoard: BoardIdentity;
    let targetBoardTitle: string;
    if (request.plan.mode === 'copy_to_new_board') {
      const boardTitle = request.newBoardTitle?.trim() || request.package.payload.board.title;
      const created = await this.collaboration.createBoard(port, workspace.legacyWorkspaceId, { title: boardTitle });
      targetBoard = await resolveBoard(port, workspace.legacyWorkspaceId, created.id);
      targetBoardTitle = created.title;
    } else {
      targetBoard = replaceBoard!;
      targetBoardTitle = refreshed.target.boardTitle;
    }

    const activeMembers = await port.query<{ user_id: string }>(`
      SELECT user_id::text AS user_id FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid AND status = 'active'
    `, [workspace.id]);
    const knownUsers = new Set(activeMembers.rows.map(row => row.user_id));
    const existingTags = await this.reads.listTags(port, workspace.legacyWorkspaceId);
    const tagsByName = new Map(existingTags.map(tag => [tag.name.trim().toLocaleLowerCase(), tag]));
    const tagMap = new Map<string, string>();
    const newTags: Array<{ id: string; legacyTagId: string; name: string; color: string; order: number }> = [];
    for (const tag of request.package.payload.tags) {
      const matched = tagsByName.get(tag.name.trim().toLocaleLowerCase());
      if (matched) tagMap.set(tag.sourceId, matched.storageId);
      else {
        const id = randomUUID();
        tagMap.set(tag.sourceId, id);
        newTags.push({ id, legacyTagId: id, name: tag.name, color: tag.color, order: existingTags.length + newTags.length });
      }
    }
    if (newTags.length) {
      await port.query(`
        INSERT INTO projed_core.task_tags(id, tenant_id, legacy_tag_id, name, color, sort_order)
        SELECT value.id, $1::uuid, value.legacy_tag_id, value.name, value.color, value.sort_order
          FROM jsonb_to_recordset($2::jsonb)
            AS value(id uuid, legacy_tag_id text, name text, color text, sort_order double precision)
      `, [workspace.id, JSON.stringify(newTags.map(tag => ({
        id: tag.id, legacy_tag_id: tag.legacyTagId, name: tag.name, color: tag.color, sort_order: tag.order,
      })))]);
    }

    const existingTasks = await this.reads.listTasks(port, workspace.legacyWorkspaceId, targetBoard.legacyBoardId);
    const existingByLegacy = new Map(existingTasks.map(task => [task.id, task]));
    const storageBySource = new Map<string, string>();
    const legacyBySource = new Map<string, string>();
    for (const task of request.package.payload.tasks) {
      const existingTask = request.plan.mode === 'replace_current_board' ? existingByLegacy.get(task.sourceId) : undefined;
      storageBySource.set(task.sourceId, existingTask?.storageId ?? randomUUID());
      legacyBySource.set(task.sourceId, request.plan.mode === 'replace_current_board' ? task.sourceId : randomUUID());
    }
    const taskRows = request.package.payload.tasks.map(task => {
      const primary = (task.assigneeIds?.length ? task.assigneeIds : task.assigneeId ? [task.assigneeId] : [])
        .filter(id => UUID_RE.test(id) && knownUsers.has(id));
      const collaborators = task.collaboratorIds
        .filter(id => UUID_RE.test(id) && knownUsers.has(id) && !primary.includes(id));
      return {
        id: storageBySource.get(task.sourceId), legacy_task_id: legacyBySource.get(task.sourceId),
        title: task.title, detail_notes: task.detailNotes ?? [], description: task.description ?? null,
        status: task.status, assignee_ids: primary, collaborator_ids: collaborators,
        start_date: task.startDate ?? null, end_date: task.endDate ?? null,
        duration_locked: task.isDurationLocked, node_type: task.nodeType,
        kanban_stage_id: task.kanbanStageSourceId ? legacyBySource.get(task.kanbanStageSourceId) ?? null : null,
        sort_order: task.order, archived: task.isArchived,
      };
    });
    if (taskRows.length) {
      await port.query(`
        INSERT INTO projed_core.wbs_items(
          id, tenant_id, project_id, legacy_task_id, parent_id, title, detail_notes, description,
          status, assignee_ids, collaborator_ids, tag_ids, start_date, end_date, duration_locked,
          node_type, kanban_stage_id, sort_order, archived
        )
        SELECT value.id, $1::uuid, $2::uuid, value.legacy_task_id, NULL, value.title,
               value.detail_notes, value.description, value.status, value.assignee_ids,
               value.collaborator_ids, ARRAY[]::uuid[], value.start_date, value.end_date,
               value.duration_locked, value.node_type, value.kanban_stage_id, value.sort_order, value.archived
          FROM jsonb_to_recordset($3::jsonb) AS value(
            id uuid, legacy_task_id text, title text, detail_notes jsonb, description text,
            status text, assignee_ids uuid[], collaborator_ids uuid[], start_date date, end_date date,
            duration_locked boolean, node_type text, kanban_stage_id text, sort_order double precision, archived boolean
          )
        ON CONFLICT (tenant_id, project_id, legacy_task_id) DO UPDATE SET
          parent_id = NULL, title = EXCLUDED.title, detail_notes = EXCLUDED.detail_notes,
          description = EXCLUDED.description, status = EXCLUDED.status,
          assignee_ids = EXCLUDED.assignee_ids, collaborator_ids = EXCLUDED.collaborator_ids,
          start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
          duration_locked = EXCLUDED.duration_locked, node_type = EXCLUDED.node_type,
          kanban_stage_id = EXCLUDED.kanban_stage_id, sort_order = EXCLUDED.sort_order,
          archived = EXCLUDED.archived, updated_at = now()
      `, [workspace.id, targetBoard.id, JSON.stringify(taskRows)]);
      const parentRows = request.package.payload.tasks.map(task => ({
        id: storageBySource.get(task.sourceId),
        parent_id: task.parentSourceId ? storageBySource.get(task.parentSourceId) ?? null : null,
      }));
      await port.query(`
        UPDATE projed_core.wbs_items item SET parent_id = value.parent_id, updated_at = now()
          FROM jsonb_to_recordset($3::jsonb) AS value(id uuid, parent_id uuid)
         WHERE item.tenant_id = $1::uuid AND item.project_id = $2::uuid AND item.id = value.id
      `, [workspace.id, targetBoard.id, JSON.stringify(parentRows)]);
    }

    if (request.plan.mode === 'replace_current_board') {
      const retained = [...storageBySource.values()];
      if (retained.length) {
        await port.query(`DELETE FROM projed_core.wbs_items
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND NOT (id = ANY($3::uuid[]))`,
        [workspace.id, targetBoard.id, retained]);
      } else {
        await port.query('DELETE FROM projed_core.wbs_items WHERE tenant_id = $1::uuid AND project_id = $2::uuid',
          [workspace.id, targetBoard.id]);
      }
    }
    await port.query('DELETE FROM projed_core.wbs_item_tags WHERE tenant_id = $1::uuid AND project_id = $2::uuid',
      [workspace.id, targetBoard.id]);
    const assignmentRows = request.package.payload.tasks.flatMap(task => task.tagSourceIds.map(tagSourceId => ({
      item_id: storageBySource.get(task.sourceId), tag_id: tagMap.get(tagSourceId),
    })));
    if (assignmentRows.length) await port.query(`
      INSERT INTO projed_core.wbs_item_tags(tenant_id, project_id, item_id, tag_id)
      SELECT $1::uuid, $2::uuid, value.item_id, value.tag_id
        FROM jsonb_to_recordset($3::jsonb) AS value(item_id uuid, tag_id uuid)
    `, [workspace.id, targetBoard.id, JSON.stringify(assignmentRows)]);

    await port.query('DELETE FROM projed_core.wbs_dependencies WHERE tenant_id = $1::uuid AND project_id = $2::uuid',
      [workspace.id, targetBoard.id]);
    const dependencyRows = request.package.payload.dependencies.map(dependency => ({
      id: randomUUID(), legacy_dependency_id: randomUUID(),
      from_id: storageBySource.get(dependency.fromSourceId), from_side: dependency.fromSide,
      to_id: storageBySource.get(dependency.toSourceId), to_side: dependency.toSide, offset_value: dependency.offset,
    }));
    if (dependencyRows.length) await port.query(`
      INSERT INTO projed_core.wbs_dependencies(
        id, tenant_id, project_id, legacy_dependency_id, from_id, from_side, to_id, to_side, offset_value
      )
      SELECT value.id, $1::uuid, $2::uuid, value.legacy_dependency_id, value.from_id,
             value.from_side, value.to_id, value.to_side, value.offset_value
        FROM jsonb_to_recordset($3::jsonb) AS value(
          id uuid, legacy_dependency_id text, from_id uuid, from_side text,
          to_id uuid, to_side text, offset_value double precision
        )
    `, [workspace.id, targetBoard.id, JSON.stringify(dependencyRows)]);

    const currentTargetReferences = await port.query<{ id: string; revision: string }>(`
      SELECT id::text AS id, revision::text FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid AND removed_at IS NULL
    `, [workspace.id, targetBoard.id]);
    const currentReferenceIds = new Set(currentTargetReferences.rows.map(row => row.id));
    if (currentTargetReferences.rows.some(row => row.revision === '9223372036854775807')) {
      backupError('IMPORT_ROLLED_BACK', 'tracking reference revision is exhausted', 409);
    }
    const referenceIdBySource = new Map<string, string>();
    for (const reference of request.package.payload.trackingReferences ?? []) {
      referenceIdBySource.set(reference.sourceId,
        request.plan.mode === 'replace_current_board' && UUID_RE.test(reference.sourceId)
          && currentReferenceIds.has(reference.sourceId) ? reference.sourceId : randomUUID());
    }
    const retainedReferenceIds = [...referenceIdBySource.values()];
    if (retainedReferenceIds.length) {
      await port.query(`DELETE FROM projed_core.task_tracking_references
        WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid AND removed_at IS NULL
          AND NOT (id = ANY($3::uuid[]))`, [workspace.id, targetBoard.id, retainedReferenceIds]);
    } else {
      await port.query(`DELETE FROM projed_core.task_tracking_references
        WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid AND removed_at IS NULL`,
      [workspace.id, targetBoard.id]);
    }
    const referenceRows = (request.package.payload.trackingReferences ?? []).map(reference => ({
      id: referenceIdBySource.get(reference.sourceId), task_id: storageBySource.get(reference.taskSourceId),
      parent_placement_id: reference.parentSourceId
        ? referenceIdBySource.get(reference.parentSourceId)
          ?? (storageBySource.has(reference.parentSourceId) ? `primary:${legacyBySource.get(reference.parentSourceId)}` : null)
        : null,
      sort_order: reference.order,
      kanban_stage_id: reference.kanbanStageSourceId ? legacyBySource.get(reference.kanbanStageSourceId) ?? null : null,
      revision: reference.revision,
    }));
    if (referenceRows.length) await port.query(`
      INSERT INTO projed_core.task_tracking_references(
        id, tenant_id, task_project_id, task_id, target_project_id, parent_placement_id,
        sort_order, kanban_stage_id, revision, created_by
      )
      SELECT value.id, $1::uuid, $2::uuid, value.task_id, $2::uuid, value.parent_placement_id,
             value.sort_order, value.kanban_stage_id, value.revision,
             projed_core.current_actor_user_id_v1()
        FROM jsonb_to_recordset($3::jsonb) AS value(
          id uuid, task_id uuid, parent_placement_id text, sort_order double precision,
          kanban_stage_id text, revision bigint
        )
      ON CONFLICT (id) DO UPDATE SET
        task_project_id = EXCLUDED.task_project_id, task_id = EXCLUDED.task_id,
        target_project_id = EXCLUDED.target_project_id,
        parent_placement_id = EXCLUDED.parent_placement_id, sort_order = EXCLUDED.sort_order,
        kanban_stage_id = EXCLUDED.kanban_stage_id,
        revision = projed_core.task_tracking_references.revision + 1,
        removed_by = NULL, removed_at = NULL, updated_at = now()
    `, [workspace.id, targetBoard.id, JSON.stringify(referenceRows)]);

    const boardRevision = await port.query(`UPDATE projed_core.resource_revisions
      SET revision = revision + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND revision < 9223372036854775807`,
    [workspace.id, targetBoard.id]);
    if (boardRevision.rowCount !== 1) backupError('IMPORT_ROLLED_BACK', 'board revision is unavailable', 503);
    if (newTags.length) {
      const workspaceRevision = await port.query(`UPDATE projed_core.resource_revisions
        SET revision = revision + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND project_id IS NULL AND revision < 9223372036854775807`, [workspace.id]);
      if (workspaceRevision.rowCount !== 1) backupError('IMPORT_ROLLED_BACK', 'workspace revision is unavailable', 503);
    }
    const postWriteFingerprint = await this.readBoardFingerprint(port, workspace.legacyWorkspaceId, targetBoard.legacyBoardId);
    const result: BackupExecutionResult = {
      executionId: request.plan.executionId, mode: request.plan.mode,
      targetWorkspaceId: workspace.legacyWorkspaceId, targetBoardId: targetBoard.legacyBoardId,
      targetBoardTitle, counts: refreshed.counts, warnings: refreshed.warnings,
      sourceTaskIdMap: Object.fromEntries(legacyBySource),
      ...(referenceIdBySource.size ? { sourceTrackingReferenceIdMap: Object.fromEntries(referenceIdBySource) } : {}),
      postWriteFingerprint, idempotentReplay: false,
    };
    const completed = await port.query(`UPDATE projed_core.backup_import_executions
      SET result = $3::jsonb, updated_at = now()
      WHERE tenant_id = $1::uuid AND execution_id = $2::uuid AND result IS NULL`,
    [workspace.id, request.plan.executionId, JSON.stringify(result)]);
    if (completed.rowCount !== 1) backupError('IMPORT_ROLLED_BACK', 'backup receipt could not be completed', 503);
    return result;
  }
}
