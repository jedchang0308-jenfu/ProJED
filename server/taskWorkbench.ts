import { randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import { resolveBoard, resolveWorkspace, type BoardIdentity, validTaskDetailNotes } from './domainRead.js';
import { KernelError } from './errors.js';

const UNPLACED_BOARD_ID = '__task_workbench_unplaced__';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_STATUSES = new Set(['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold']);
const NODE_TYPES = new Set(['group', 'milestone', 'task']);
const POSITIONS = new Set(['before', 'after', 'append']);
const MAX_TASKS_PER_PLACEMENT = 200;

type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';
type NodeType = 'group' | 'milestone' | 'task';

export interface StoredWorkbenchTask {
  id: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  title: string;
  detailNotes: unknown[];
  description?: string;
  status: TaskStatus;
  assigneeIds: string[];
  assigneeId?: string;
  collaboratorIds: string[];
  tagIds: string[];
  startDate?: string;
  endDate?: string;
  isDurationLocked?: boolean;
  nodeType: NodeType;
  kanbanStageId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export type TaskOwnershipRef =
  | { kind: 'board'; workspaceId: string; boardId: string }
  | { kind: 'account_unplaced' };

export interface PlacementScope {
  ownership: TaskOwnershipRef;
  parentId: string | null;
}

export interface MoveTaskSubtreeCommand {
  commandVersion: 2;
  operationId: string;
  rootTaskId: string;
  expectedSubtreeIds: string[];
  source: TaskOwnershipRef;
  destination: PlacementScope & {
    anchorTaskId: string | null;
    position: 'before' | 'after' | 'append';
  };
  clientPlatform: 'desktop' | 'mobile';
}

export interface TaskPlacementCanonicalNode {
  id: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  order: number;
  nodeType: NodeType;
  kanbanStageId?: string;
  updatedAt: number;
}

export interface MoveTaskSubtreeResult {
  operationId: string;
  status: 'committed';
  direction: 'to_board' | 'to_unplaced';
  movedTaskIds: string[];
  canonicalNodes: TaskPlacementCanonicalNode[];
  affectedScopes: PlacementScope[];
  activityLoggedRemotely: true;
}

type UnplacedRow = {
  legacy_task_id: string;
  workspace_legacy_id: string;
  task: unknown;
  sort_order: number;
  created_at_ms: string;
  updated_at_ms: string;
};

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Resource is unavailable', 404);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Task workbench payload is invalid');
  return value as Record<string, unknown>;
}

function reference(value: unknown, label: string, max = 512): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value || value.length > max) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function optionalReference(value: unknown, label: string): string | null {
  return value === null ? null : reference(value, label);
}

function stringList(value: unknown, label: string, uuidOnly = false): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'
      || item.trim() === '' || item.length > 512 || (uuidOnly && !UUID_RE.test(item)))) {
    invalid(`${label} is invalid`);
  }
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) invalid(`${label} contains duplicate values`);
  return unique;
}

function timestamp(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function date(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DATE_RE.test(value)) invalid(`${label} is invalid`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid`);
  return value;
}

function normalizeTask(value: unknown, expectedId?: string): StoredWorkbenchTask {
  const input = record(value);
  const now = Date.now();
  const id = reference(input.id, 'task id');
  if (expectedId !== undefined && id !== expectedId) invalid('Task id does not match the request path');
  const workspaceId = reference(input.workspaceId, 'workspace id');
  if (input.boardId !== UNPLACED_BOARD_ID) invalid('Unplaced task board is invalid');
  const parentId = optionalReference(input.parentId, 'parent task id');
  if (parentId === id) invalid('Task cannot be its own parent');
  const title = reference(input.title, 'task title', 500);
  const status = reference(input.status, 'task status', 32);
  if (!TASK_STATUSES.has(status)) invalid('Task status is invalid');
  const detailNotes = input.detailNotes ?? [];
  if (!validTaskDetailNotes(detailNotes)) invalid('Task detail notes are invalid');
  if (input.description !== undefined && typeof input.description !== 'string') invalid('Task description is invalid');
  const assigneeIds = stringList(input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []), 'assignee ids', true);
  const collaboratorIds = stringList(input.collaboratorIds ?? [], 'collaborator ids', true)
    .filter(candidate => !assigneeIds.includes(candidate));
  const tagIds = stringList(input.tagIds ?? [], 'tag ids');
  const startDate = date(input.startDate, 'start date');
  const endDate = date(input.endDate, 'end date');
  if (startDate && endDate && startDate > endDate) invalid('Task date order is invalid');
  if (input.isDurationLocked !== undefined && typeof input.isDurationLocked !== 'boolean') {
    invalid('Task duration lock is invalid');
  }
  const nodeType = input.nodeType === undefined ? 'task' : reference(input.nodeType, 'node type', 32);
  if (!NODE_TYPES.has(nodeType)) invalid('Task node type is invalid');
  if (input.kanbanStageId !== undefined && typeof input.kanbanStageId !== 'string') {
    invalid('Task kanban stage is invalid');
  }
  if (typeof input.order !== 'number' || !Number.isFinite(input.order)
      || input.order < 0 || input.order > Number.MAX_SAFE_INTEGER) {
    invalid('Task order is invalid');
  }
  if (input.isArchived !== undefined && typeof input.isArchived !== 'boolean') invalid('Task archive state is invalid');
  const createdAt = timestamp(input.createdAt, now);
  const updatedAt = timestamp(input.updatedAt, now);
  return {
    id,
    workspaceId,
    boardId: UNPLACED_BOARD_ID,
    parentId,
    title,
    detailNotes,
    ...(input.description === undefined ? {} : { description: input.description }),
    status: status as TaskStatus,
    assigneeIds,
    ...(assigneeIds[0] ? { assigneeId: assigneeIds[0] } : {}),
    collaboratorIds,
    tagIds,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(input.isDurationLocked === undefined ? {} : { isDurationLocked: input.isDurationLocked }),
    nodeType: nodeType as NodeType,
    ...(input.kanbanStageId ? { kanbanStageId: input.kanbanStageId } : {}),
    order: Number(input.order),
    createdAt,
    updatedAt,
    isArchived: input.isArchived === true,
  };
}

function taskFromUnplacedRow(row: UnplacedRow): StoredWorkbenchTask {
  const base = normalizeTask({
    ...record(row.task),
    id: row.legacy_task_id,
    workspaceId: row.workspace_legacy_id,
    boardId: UNPLACED_BOARD_ID,
    order: row.sort_order,
    createdAt: Number(row.created_at_ms),
    updatedAt: Number(row.updated_at_ms),
  });
  return base;
}

function ownership(value: unknown, label: string): TaskOwnershipRef {
  const input = record(value);
  const keys = Object.keys(input).sort().join('|');
  if (input.kind === 'account_unplaced' && keys === 'kind') return { kind: 'account_unplaced' };
  if (input.kind === 'board' && keys === 'boardId|kind|workspaceId') {
    return {
      kind: 'board',
      workspaceId: reference(input.workspaceId, `${label} workspace id`),
      boardId: reference(input.boardId, `${label} board id`),
    };
  }
  invalid(`${label} ownership is invalid`);
}

export function normalizePlacementCommand(value: unknown): MoveTaskSubtreeCommand {
  const input = record(value);
  if (Object.keys(input).sort().join('|') !== 'clientPlatform|commandVersion|destination|expectedSubtreeIds|operationId|rootTaskId|source') {
    invalid('Task placement command shape is invalid');
  }
  if (input.commandVersion !== 2) invalid('Task placement command version is invalid');
  const operationId = reference(input.operationId, 'operation id', 255);
  const rootTaskId = reference(input.rootTaskId, 'root task id');
  const expectedSubtreeIds = stringList(input.expectedSubtreeIds, 'expected subtree ids');
  if (expectedSubtreeIds.length < 1 || expectedSubtreeIds.length > MAX_TASKS_PER_PLACEMENT
      || expectedSubtreeIds[0] !== rootTaskId) invalid('Expected subtree ids are invalid');
  const source = ownership(input.source, 'source');
  const destinationInput = record(input.destination);
  if (Object.keys(destinationInput).sort().join('|') !== 'anchorTaskId|ownership|parentId|position') {
    invalid('Task placement destination shape is invalid');
  }
  const destinationOwnership = ownership(destinationInput.ownership, 'destination');
  if (source.kind === destinationOwnership.kind) invalid('Task placement must cross the unplaced boundary');
  const parentId = optionalReference(destinationInput.parentId, 'destination parent id');
  const anchorTaskId = optionalReference(destinationInput.anchorTaskId, 'destination anchor id');
  if (typeof destinationInput.position !== 'string' || !POSITIONS.has(destinationInput.position)) {
    invalid('Task placement position is invalid');
  }
  if ((destinationInput.position === 'append' && anchorTaskId !== null)
      || (destinationInput.position !== 'append' && anchorTaskId === null)) {
    invalid('Task placement anchor does not match the requested position');
  }
  if (destinationOwnership.kind === 'account_unplaced' && parentId !== null) {
    invalid('Unplaced destination must be a root scope');
  }
  if (input.clientPlatform !== 'desktop' && input.clientPlatform !== 'mobile') {
    invalid('Task placement client platform is invalid');
  }
  return {
    commandVersion: 2,
    operationId,
    rootTaskId,
    expectedSubtreeIds,
    source,
    destination: {
      ownership: destinationOwnership,
      parentId,
      anchorTaskId,
      position: destinationInput.position as MoveTaskSubtreeCommand['destination']['position'],
    },
    clientPlatform: input.clientPlatform,
  };
}

function subtreeIds(rootId: string, tasks: StoredWorkbenchTask[]): string[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (!byId.has(rootId)) notFound();
  const children = new Map<string, StoredWorkbenchTask[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const bucket = children.get(task.parentId) ?? [];
    bucket.push(task);
    children.set(task.parentId, bucket);
  }
  children.forEach(bucket => bucket.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) invalid('Task hierarchy contains a cycle');
    seen.add(id);
    result.push(id);
    (children.get(id) ?? []).forEach(child => visit(child.id));
  };
  visit(rootId);
  return result;
}

function assertExactSubtree(command: MoveTaskSubtreeCommand, tasks: StoredWorkbenchTask[]): void {
  const actual = subtreeIds(command.rootTaskId, tasks);
  if (actual.some(id => tasks.find(task => task.id === id)?.isArchived === true)) {
    invalid('Archived tasks cannot be moved through the task workbench');
  }
  if (actual.length !== command.expectedSubtreeIds.length
      || actual.some((id, index) => id !== command.expectedSubtreeIds[index])) {
    invalid('Task placement command does not contain the exact canonical subtree');
  }
}

function insertionIndex(tasks: StoredWorkbenchTask[], command: MoveTaskSubtreeCommand): number {
  if (command.destination.position === 'append') return tasks.length;
  const index = tasks.findIndex(task => task.id === command.destination.anchorTaskId);
  if (index < 0) notFound();
  return index + (command.destination.position === 'after' ? 1 : 0);
}

function canonical(task: StoredWorkbenchTask): TaskPlacementCanonicalNode {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    boardId: task.boardId,
    parentId: task.parentId,
    order: task.order,
    nodeType: task.nodeType,
    ...(task.kanbanStageId ? { kanbanStageId: task.kanbanStageId } : {}),
    updatedAt: task.updatedAt,
  };
}

function taskBody(task: StoredWorkbenchTask): Record<string, unknown> {
  return { ...task };
}

async function listUnplacedRows(port: ActorQueryPort, lock = false): Promise<UnplacedRow[]> {
  const result = await port.query<UnplacedRow>(`
    SELECT legacy_task_id, workspace_legacy_id, task, sort_order,
           floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms,
           floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS updated_at_ms
      FROM projed_core.unplaced_tasks
     WHERE owner_id = projed_core.current_actor_user_id_v1()
     ORDER BY sort_order, updated_at, legacy_task_id
     ${lock ? 'FOR UPDATE' : ''}
  `);
  return result.rows;
}

async function bumpRevision(port: ActorQueryPort, board: BoardIdentity): Promise<void> {
  const result = await port.query(`
    UPDATE projed_core.resource_revisions
       SET revision = revision + 1, updated_at = now()
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND revision < 9223372036854775807
  `, [board.tenantId, board.id]);
  if (result.rowCount !== 1) throw new KernelError('DB_BOUNDARY_INVALID', 'Resource revision is unavailable', 503);
}

async function boardTasks(port: ActorQueryPort, board: BoardIdentity, lock = false): Promise<StoredWorkbenchTask[]> {
  if (lock) {
    await port.query(`
      SELECT id FROM projed_core.wbs_items
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
       ORDER BY id FOR UPDATE
    `, [board.tenantId, board.id]);
  }
  const result = await port.query<{
    legacy_task_id: string; parent_legacy_id: string | null; title: string; detail_notes: unknown;
    description: string | null; status: TaskStatus; assignee_ids: string[]; collaborator_ids: string[];
    tag_ids: string[]; start_date: string | null; end_date: string | null; duration_locked: boolean | null;
    node_type: NodeType | null; kanban_stage_id: string | null; sort_order: number; archived: boolean;
    created_at_ms: string; updated_at_ms: string;
  }>(`
    SELECT item.legacy_task_id, parent.legacy_task_id AS parent_legacy_id, item.title, item.detail_notes,
           item.description, item.status, item.assignee_ids::text[], item.collaborator_ids::text[],
           COALESCE(tags.legacy_tag_ids, ARRAY[]::text[]) AS tag_ids,
           to_char(item.start_date, 'YYYY-MM-DD') AS start_date,
           to_char(item.end_date, 'YYYY-MM-DD') AS end_date,
           item.duration_locked, item.node_type, item.kanban_stage_id, item.sort_order, item.archived,
           floor(extract(epoch FROM item.created_at) * 1000)::bigint::text AS created_at_ms,
           floor(extract(epoch FROM item.updated_at) * 1000)::bigint::text AS updated_at_ms
      FROM projed_core.wbs_items item
      LEFT JOIN projed_core.wbs_items parent
        ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
      LEFT JOIN LATERAL (
        SELECT array_agg(tag.legacy_tag_id ORDER BY tag.sort_order, tag.id) AS legacy_tag_ids
          FROM projed_core.wbs_item_tags assignment
          JOIN projed_core.task_tags tag
            ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
         WHERE assignment.tenant_id = item.tenant_id
           AND assignment.project_id = item.project_id AND assignment.item_id = item.id
      ) tags ON true
     WHERE item.tenant_id = $1::uuid AND item.project_id = $2::uuid
     ORDER BY item.sort_order, item.updated_at, item.id
  `, [board.tenantId, board.id]);
  return result.rows.map(row => normalizeTask({
    id: row.legacy_task_id,
    workspaceId: board.legacyWorkspaceId,
    boardId: UNPLACED_BOARD_ID,
    parentId: row.parent_legacy_id,
    title: row.title,
    detailNotes: row.detail_notes,
    ...(row.description === null ? {} : { description: row.description }),
    status: row.status,
    assigneeIds: row.assignee_ids,
    collaboratorIds: row.collaborator_ids,
    tagIds: row.tag_ids,
    ...(row.start_date === null ? {} : { startDate: row.start_date }),
    ...(row.end_date === null ? {} : { endDate: row.end_date }),
    ...(row.duration_locked === null ? {} : { isDurationLocked: row.duration_locked }),
    nodeType: row.node_type ?? 'task',
    ...(row.kanban_stage_id === null ? {} : { kanbanStageId: row.kanban_stage_id }),
    order: row.sort_order,
    createdAt: Number(row.created_at_ms),
    updatedAt: Number(row.updated_at_ms),
    isArchived: row.archived,
  })).map(task => ({ ...task, boardId: board.legacyBoardId }));
}

async function resolveBoardParent(
  port: ActorQueryPort,
  board: BoardIdentity,
  parentRef: string | null,
): Promise<string | null> {
  if (parentRef === null) return null;
  const result = await port.query<{ id: string }>(`
    SELECT id::text AS id FROM projed_core.wbs_items
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid
       AND (id::text = $3 OR legacy_task_id = $3)
     LIMIT 2
  `, [board.tenantId, board.id, parentRef]);
  if (result.rows.length !== 1) notFound();
  return result.rows[0]!.id;
}

async function assertAssignments(port: ActorQueryPort, board: BoardIdentity, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const result = await port.query<{ user_id: string }>(`
    SELECT member.user_id::text AS user_id
      FROM projed_core.project_members member
      JOIN projed_core.tenant_members tenant_member
        ON tenant_member.tenant_id = member.tenant_id AND tenant_member.user_id = member.user_id
     WHERE member.tenant_id = $1::uuid AND member.project_id = $2::uuid
       AND member.user_id = ANY($3::uuid[]) AND tenant_member.status = 'active'
  `, [board.tenantId, board.id, unique]);
  if (new Set(result.rows.map(row => row.user_id)).size !== unique.length) {
    invalid('Task assignments must be active target-board members');
  }
}

async function resolveTagIds(port: ActorQueryPort, board: BoardIdentity, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const result = await port.query<{ id: string; legacy_tag_id: string }>(`
    SELECT id::text AS id, legacy_tag_id FROM projed_core.task_tags
     WHERE tenant_id = $1::uuid AND (id::text = ANY($2::text[]) OR legacy_tag_id = ANY($2::text[]))
  `, [board.tenantId, refs]);
  const byRef = new Map<string, string>();
  result.rows.forEach(row => { byRef.set(row.id, row.id); byRef.set(row.legacy_tag_id, row.id); });
  if (refs.some(ref => !byRef.has(ref))) invalid('Task tags are unavailable in the target workspace');
  return refs.map(ref => byRef.get(ref)!);
}

async function logPlacement(
  port: ActorQueryPort,
  board: BoardIdentity,
  command: MoveTaskSubtreeCommand,
  direction: 'to_board' | 'to_unplaced',
): Promise<void> {
  await port.query(`
    INSERT INTO projed_core.activity_events(
      id, tenant_id, project_id, actor_id, event_type, entity_table, entity_ref, payload
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, projed_core.current_actor_user_id_v1(),
      'task_moved', 'wbs_items', $4, $5::jsonb
    )
  `, [randomUUID(), board.tenantId, board.id, command.rootTaskId, JSON.stringify({
    operationId: command.operationId,
    direction,
    source: command.source,
    target: command.destination.ownership,
  })]);
}

function parseStoredPlacementResult(value: unknown, operationId: string): MoveTaskSubtreeResult {
  const result = record(value);
  if (result.status !== 'committed' || result.operationId !== operationId
      || (result.direction !== 'to_board' && result.direction !== 'to_unplaced')
      || !Array.isArray(result.movedTaskIds) || !Array.isArray(result.canonicalNodes)
      || !Array.isArray(result.affectedScopes) || result.activityLoggedRemotely !== true) {
    throw new KernelError('DB_BOUNDARY_INVALID', 'Stored task placement result is invalid', 503);
  }
  return result as unknown as MoveTaskSubtreeResult;
}

async function authorizePlacementReplay(
  port: ActorQueryPort,
  command: MoveTaskSubtreeCommand,
): Promise<void> {
  if (command.source.kind === 'account_unplaced') {
    if (command.destination.ownership.kind !== 'board') invalid('Target board is required');
    const target = await resolveBoard(
      port,
      command.destination.ownership.workspaceId,
      command.destination.ownership.boardId,
    );
    await port.authorizeTaskPlacement(target.tenantId, target.id, 'to_board');
    return;
  }
  const source = await resolveBoard(port, command.source.workspaceId, command.source.boardId);
  await port.authorizeTaskPlacement(source.tenantId, source.id, 'to_unplaced');
}

export class TaskWorkbenchRepository {
  async list(port: ActorQueryPort): Promise<StoredWorkbenchTask[]> {
    return (await listUnplacedRows(port)).map(taskFromUnplacedRow).filter(task => !task.isArchived);
  }

  async upsert(port: ActorQueryPort, taskId: string, value: unknown): Promise<StoredWorkbenchTask> {
    const task = normalizeTask(value, reference(taskId, 'task id'));
    if (task.isArchived) invalid('Archived tasks cannot be stored in the unplaced workbench');
    await resolveWorkspace(port, task.workspaceId);
    await port.query(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('projed:unplaced:' || projed_core.current_actor_user_id_v1()::text, 0)
      )
    `);
    const existing = (await listUnplacedRows(port, true)).map(taskFromUnplacedRow);
    const byId = new Map(existing.map(candidate => [candidate.id, candidate]));
    byId.set(task.id, task);
    const ancestors = new Set([task.id]);
    let ancestor = task.parentId ? byId.get(task.parentId) : undefined;
    if (task.parentId && !ancestor) invalid('Unplaced task parent is unavailable');
    while (ancestor) {
      if (ancestors.has(ancestor.id)) invalid('Unplaced task hierarchy contains a cycle');
      ancestors.add(ancestor.id);
      if (!ancestor.parentId) break;
      ancestor = byId.get(ancestor.parentId);
      if (!ancestor) invalid('Unplaced task ancestor is unavailable');
    }
    const result = await port.query<UnplacedRow>(`
      INSERT INTO projed_core.unplaced_tasks(
        owner_id, legacy_task_id, workspace_legacy_id, task, sort_order, created_at, updated_at
      ) VALUES (
        projed_core.current_actor_user_id_v1(), $1, $2, $3::jsonb, $4,
        to_timestamp($5::double precision / 1000), to_timestamp($6::double precision / 1000)
      )
      ON CONFLICT (owner_id, legacy_task_id) DO UPDATE SET
        workspace_legacy_id = EXCLUDED.workspace_legacy_id,
        task = EXCLUDED.task,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
      RETURNING legacy_task_id, workspace_legacy_id, task, sort_order,
                floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms,
                floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS updated_at_ms
    `, [task.id, task.workspaceId, JSON.stringify(taskBody(task)), task.order, task.createdAt, Date.now()]);
    if (!result.rows[0]) throw new KernelError('DB_BOUNDARY_INVALID', 'Unplaced task was not stored', 503);
    return taskFromUnplacedRow(result.rows[0]);
  }

  async remove(port: ActorQueryPort, taskId: string): Promise<void> {
    const id = reference(taskId, 'task id');
    await port.query(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('projed:unplaced:' || projed_core.current_actor_user_id_v1()::text, 0)
      )
    `);
    const child = await port.query<{ has_child: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM projed_core.unplaced_tasks
         WHERE owner_id = projed_core.current_actor_user_id_v1()
           AND nullif(task ->> 'parentId', '') = $1
      ) AS has_child
    `, [id]);
    if (child.rows[0]?.has_child) invalid('Unplaced task with children cannot be removed individually');
    const result = await port.query(`
      DELETE FROM projed_core.unplaced_tasks
       WHERE owner_id = projed_core.current_actor_user_id_v1() AND legacy_task_id = $1
    `, [id]);
    if (result.rowCount !== 1) notFound();
  }

  async place(port: ActorQueryPort, unsafeCommand: unknown): Promise<MoveTaskSubtreeResult> {
    const command = normalizePlacementCommand(unsafeCommand);
    const commandJson = JSON.stringify(command);
    await port.query(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('projed:unplaced:' || projed_core.current_actor_user_id_v1()::text, 0)
      )
    `);
    await port.query(`
      INSERT INTO projed_core.task_workbench_placement_operations(owner_id, operation_id, command)
      VALUES (projed_core.current_actor_user_id_v1(), $1, $2::jsonb)
      ON CONFLICT (owner_id, operation_id) DO NOTHING
    `, [command.operationId, commandJson]);
    const operation = await port.query<{ command_matches: boolean; result: unknown | null }>(`
      SELECT command = $2::jsonb AS command_matches, result
        FROM projed_core.task_workbench_placement_operations
       WHERE owner_id = projed_core.current_actor_user_id_v1() AND operation_id = $1
       FOR UPDATE
    `, [command.operationId, commandJson]);
    if (!operation.rows[0]) throw new KernelError('DB_BOUNDARY_INVALID', 'Task placement ledger is unavailable', 503);
    if (!operation.rows[0].command_matches) {
      throw new KernelError('TASK_PLACEMENT_IDEMPOTENCY_CONFLICT', 'Operation id was used by another command', 409);
    }
    if (operation.rows[0].result) {
      await authorizePlacementReplay(port, command);
      return parseStoredPlacementResult(operation.rows[0].result, command.operationId);
    }

    const result = command.source.kind === 'account_unplaced'
      ? await this.toBoard(port, command)
      : await this.toUnplaced(port, command);
    const stored = await port.query(`
      UPDATE projed_core.task_workbench_placement_operations
         SET result = $2::jsonb, updated_at = now()
       WHERE owner_id = projed_core.current_actor_user_id_v1()
         AND operation_id = $1 AND result IS NULL
    `, [command.operationId, JSON.stringify(result)]);
    if (stored.rowCount !== 1) throw new KernelError('DB_BOUNDARY_INVALID', 'Task placement result was not stored', 503);
    return result;
  }

  private async toBoard(port: ActorQueryPort, command: MoveTaskSubtreeCommand): Promise<MoveTaskSubtreeResult> {
    if (command.destination.ownership.kind !== 'board') invalid('Target board is required');
    const target = await resolveBoard(
      port,
      command.destination.ownership.workspaceId,
      command.destination.ownership.boardId,
    );
    await port.authorizeTaskPlacement(target.tenantId, target.id, 'to_board');
    await port.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:placement:board:' || $1, 0))", [target.id]);
    const unplaced = (await listUnplacedRows(port, true)).map(taskFromUnplacedRow);
    assertExactSubtree(command, unplaced);
    const root = unplaced.find(task => task.id === command.rootTaskId)!;
    const sourceParentId = root.parentId;
    const sourceSiblings = unplaced
      .filter(task => task.parentId === sourceParentId && !command.expectedSubtreeIds.includes(task.id))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const targetTasks = await boardTasks(port, target, true);
    const targetParentStorageId = await resolveBoardParent(port, target, command.destination.parentId);
    const destinationSiblings = targetTasks
      .filter(task => task.parentId === command.destination.parentId && !task.isArchived)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const index = insertionIndex(destinationSiblings, command);
    const collision = targetTasks.find(task => command.expectedSubtreeIds.includes(task.id));
    if (collision) throw new KernelError('TASK_PLACEMENT_IDENTITY_CONFLICT', 'Target board already contains a moved task id', 409);

    const moved = command.expectedSubtreeIds.map(id => unplaced.find(task => task.id === id)!);
    const storageByLegacy = new Map<string, string>();
    const tagIdsByTask = new Map<string, string[]>();
    for (const task of moved) {
      await assertAssignments(port, target, [...task.assigneeIds, ...task.collaboratorIds]);
      tagIdsByTask.set(task.id, await resolveTagIds(port, target, task.tagIds));
      storageByLegacy.set(task.id, randomUUID());
    }
    for (const task of moved) {
      const isRoot = task.id === command.rootTaskId;
      const parentStorageId = isRoot
        ? targetParentStorageId
        : task.parentId ? storageByLegacy.get(task.parentId) ?? null : null;
      if (!isRoot && task.parentId && !parentStorageId) invalid('Expected subtree ids must list parents before children');
      const nodeType = isRoot && command.destination.parentId ? 'task' : task.nodeType;
      await port.query(`
        INSERT INTO projed_core.wbs_items(
          id, tenant_id, project_id, legacy_task_id, parent_id, title, detail_notes, description,
          status, assignee_ids, collaborator_ids, tag_ids, start_date, end_date, duration_locked,
          node_type, kanban_stage_id, sort_order, archived, created_at, updated_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8,
          $9, $10::uuid[], $11::uuid[], '{}'::uuid[], $12::date, $13::date, $14,
          $15, $16, $17, $18, to_timestamp($19::double precision / 1000), now()
        )
      `, [
        storageByLegacy.get(task.id), target.tenantId, target.id, task.id, parentStorageId,
        task.title, JSON.stringify(task.detailNotes), task.description ?? null, task.status,
        task.assigneeIds, task.collaboratorIds, task.startDate ?? null, task.endDate ?? null,
        task.isDurationLocked ?? null, nodeType, task.kanbanStageId ?? null, isRoot ? 0 : task.order,
        task.isArchived, task.createdAt,
      ]);
      const tagIds = tagIdsByTask.get(task.id) ?? [];
      if (tagIds.length > 0) {
        await port.query(`
          INSERT INTO projed_core.wbs_item_tags(tenant_id, project_id, item_id, tag_id)
          SELECT $1::uuid, $2::uuid, $3::uuid, tag_id FROM unnest($4::uuid[]) AS tag_id
        `, [target.tenantId, target.id, storageByLegacy.get(task.id), tagIds]);
      }
    }
    const removed = await port.query(`
      DELETE FROM projed_core.unplaced_tasks
       WHERE owner_id = projed_core.current_actor_user_id_v1() AND legacy_task_id = ANY($1::text[])
    `, [command.expectedSubtreeIds]);
    if (removed.rowCount !== command.expectedSubtreeIds.length) {
      throw new KernelError('DB_BOUNDARY_INVALID', 'Task placement source changed during commit', 409);
    }
    for (let order = 0; order < sourceSiblings.length; order += 1) {
      await port.query(`
        UPDATE projed_core.unplaced_tasks
           SET sort_order = $2, task = jsonb_set(task, '{order}', to_jsonb($2::double precision), true), updated_at = now()
         WHERE owner_id = projed_core.current_actor_user_id_v1() AND legacy_task_id = $1
      `, [sourceSiblings[order]!.id, order]);
    }
    const destinationOrder = [...destinationSiblings];
    destinationOrder.splice(index, 0, { ...root, workspaceId: target.legacyWorkspaceId, boardId: target.legacyBoardId });
    for (let order = 0; order < destinationOrder.length; order += 1) {
      await port.query(`
        UPDATE projed_core.wbs_items SET sort_order = $4, updated_at = now()
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_task_id = $3
      `, [target.tenantId, target.id, destinationOrder[order]!.id, order]);
    }
    await bumpRevision(port, target);
    await logPlacement(port, target, command, 'to_board');
    const afterBoard = await boardTasks(port, target);
    const afterUnplaced = (await listUnplacedRows(port)).map(taskFromUnplacedRow);
    const canonicalNodes = [
      ...afterBoard.filter(task => command.expectedSubtreeIds.includes(task.id)
        || task.parentId === command.destination.parentId).map(canonical),
      ...afterUnplaced.filter(task => task.parentId === sourceParentId).map(canonical),
    ];
    return {
      operationId: command.operationId,
      status: 'committed',
      direction: 'to_board',
      movedTaskIds: [...command.expectedSubtreeIds],
      canonicalNodes,
      affectedScopes: [
        { ownership: { kind: 'account_unplaced' }, parentId: sourceParentId },
        { ownership: command.destination.ownership, parentId: command.destination.parentId },
      ],
      activityLoggedRemotely: true,
    };
  }

  private async toUnplaced(port: ActorQueryPort, command: MoveTaskSubtreeCommand): Promise<MoveTaskSubtreeResult> {
    if (command.source.kind !== 'board' || command.destination.ownership.kind !== 'account_unplaced') {
      invalid('Source board is required');
    }
    const source = await resolveBoard(port, command.source.workspaceId, command.source.boardId);
    await port.authorizeTaskPlacement(source.tenantId, source.id, 'to_unplaced');
    await port.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:placement:board:' || $1, 0))", [source.id]);
    const sourceTasks = await boardTasks(port, source, true);
    assertExactSubtree(command, sourceTasks);
    const root = sourceTasks.find(task => task.id === command.rootTaskId)!;
    const sourceParentId = root.parentId;
    const sourceSiblings = sourceTasks
      .filter(task => task.parentId === sourceParentId && !command.expectedSubtreeIds.includes(task.id))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const storage = await port.query<{ id: string; legacy_task_id: string }>(`
      SELECT id::text AS id, legacy_task_id FROM projed_core.wbs_items
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_task_id = ANY($3::text[])
    `, [source.tenantId, source.id, command.expectedSubtreeIds]);
    if (storage.rows.length !== command.expectedSubtreeIds.length) {
      throw new KernelError('DB_BOUNDARY_INVALID', 'Task placement source identity is incomplete', 409);
    }
    const storageIds = storage.rows.map(row => row.id);
    const trackingReferences = await port.query<{ blocked: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM projed_core.task_tracking_references
         WHERE tenant_id = $1::uuid AND task_project_id = $2::uuid
           AND task_id = ANY($3::uuid[])
      ) AS blocked
    `, [source.tenantId, source.id, storageIds]);
    if (trackingReferences.rows[0]?.blocked) {
      throw new KernelError(
        'TRACKING_REFERENCE_BLOCKS_UNPLACED',
        'Tasks with tracking references cannot be moved to unplaced storage',
        409,
      );
    }
    const references = await port.query<{ blocked: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM projed_core.wbs_dependencies
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid
           AND (from_id = ANY($3::uuid[]) OR to_id = ANY($3::uuid[]))
        UNION ALL
        SELECT 1 FROM projed_core.record_task_links
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND item_id = ANY($3::uuid[])
      ) AS blocked
    `, [source.tenantId, source.id, storageIds]);
    if (references.rows[0]?.blocked) {
      throw new KernelError('TASK_PLACEMENT_LINKED', 'Linked tasks cannot be moved to unplaced storage', 409);
    }
    const unplaced = (await listUnplacedRows(port, true)).map(taskFromUnplacedRow);
    if (unplaced.some(task => command.expectedSubtreeIds.includes(task.id))) {
      throw new KernelError('TASK_PLACEMENT_IDENTITY_CONFLICT', 'Unplaced storage already contains a moved task id', 409);
    }
    const destinationSiblings = unplaced
      .filter(task => task.parentId === null && !task.isArchived)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const index = insertionIndex(destinationSiblings, command);
    const moved = command.expectedSubtreeIds.map(id => sourceTasks.find(task => task.id === id)!);
    const now = Date.now();
    for (const task of moved) {
      const isRoot = task.id === command.rootTaskId;
      const unplacedTask: StoredWorkbenchTask = {
        ...task,
        workspaceId: source.legacyWorkspaceId,
        boardId: UNPLACED_BOARD_ID,
        parentId: isRoot ? null : task.parentId,
        order: isRoot ? 0 : task.order,
        updatedAt: now,
      };
      await port.query(`
        INSERT INTO projed_core.unplaced_tasks(
          owner_id, legacy_task_id, workspace_legacy_id, task, sort_order, created_at, updated_at
        ) VALUES (
          projed_core.current_actor_user_id_v1(), $1, $2, $3::jsonb, $4,
          to_timestamp($5::double precision / 1000), now()
        )
      `, [task.id, source.legacyWorkspaceId, JSON.stringify(taskBody(unplacedTask)), unplacedTask.order, task.createdAt]);
    }
    for (const task of [...moved].reverse()) {
      const deleted = await port.query(`
        DELETE FROM projed_core.wbs_items
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_task_id = $3
      `, [source.tenantId, source.id, task.id]);
      if (deleted.rowCount !== 1) throw new KernelError('DB_BOUNDARY_INVALID', 'Task placement source changed during commit', 409);
    }
    for (let order = 0; order < sourceSiblings.length; order += 1) {
      await port.query(`
        UPDATE projed_core.wbs_items SET sort_order = $4, updated_at = now()
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_task_id = $3
      `, [source.tenantId, source.id, sourceSiblings[order]!.id, order]);
    }
    const destinationOrder = [...destinationSiblings];
    destinationOrder.splice(index, 0, { ...root, workspaceId: source.legacyWorkspaceId, boardId: UNPLACED_BOARD_ID, parentId: null });
    for (let order = 0; order < destinationOrder.length; order += 1) {
      await port.query(`
        UPDATE projed_core.unplaced_tasks
           SET sort_order = $2, task = jsonb_set(task, '{order}', to_jsonb($2::double precision), true), updated_at = now()
         WHERE owner_id = projed_core.current_actor_user_id_v1() AND legacy_task_id = $1
      `, [destinationOrder[order]!.id, order]);
    }
    await bumpRevision(port, source);
    await logPlacement(port, source, command, 'to_unplaced');
    const afterBoard = await boardTasks(port, source);
    const afterUnplaced = (await listUnplacedRows(port)).map(taskFromUnplacedRow);
    const canonicalNodes = [
      ...afterUnplaced.filter(task => command.expectedSubtreeIds.includes(task.id) || task.parentId === null).map(canonical),
      ...afterBoard.filter(task => task.parentId === sourceParentId).map(canonical),
    ];
    return {
      operationId: command.operationId,
      status: 'committed',
      direction: 'to_unplaced',
      movedTaskIds: [...command.expectedSubtreeIds],
      canonicalNodes,
      affectedScopes: [
        { ownership: command.source, parentId: sourceParentId },
        { ownership: { kind: 'account_unplaced' }, parentId: null },
      ],
      activityLoggedRemotely: true,
    };
  }
}
