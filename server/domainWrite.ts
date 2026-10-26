import { randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import {
  DomainReadRepository,
  type BoardIdentity,
  type DomainDependency,
  type DomainTask,
  type DomainTaskTag,
  type PermissionCapability,
  resolveBoard,
  resolveWorkspace,
  validTaskDetailNotes,
} from './domainRead.js';
import { KernelError } from './errors.js';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_STATUSES = new Set(['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold']);
const NODE_TYPES = new Set(['group', 'milestone', 'task']);
const TAG_COLORS = new Set(['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black', 'gray']);
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export interface DomainTaskCreate {
  id: string;
  parentId: string | null;
  title: string;
  detailNotes?: unknown[];
  description?: string | null;
  status: DomainTask['status'];
  assigneeIds?: string[];
  assigneeId?: string;
  collaboratorIds?: string[];
  tagIds?: string[];
  startDate?: string | null;
  endDate?: string | null;
  isDurationLocked?: boolean | null;
  nodeType?: DomainTask['nodeType'] | null;
  kanbanStageId?: string | null;
  order: number;
  isArchived?: boolean;
}

export type DomainTaskUpdate = Partial<Omit<DomainTaskCreate, 'id'>>;

export interface DomainTaskTagCreate {
  id: string;
  name: string;
  color: DomainTaskTag['color'];
  order: number;
}

export type DomainTaskTagUpdate = Partial<Omit<DomainTaskTagCreate, 'id'>>;
export type DomainDependencyCreate = Omit<DomainDependency, 'id'> & { id?: string };

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Resource is unavailable', 404);
}

function nonEmpty(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) invalid(`${name} is invalid`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${name} is invalid`);
  return value;
}

function optionalDate(value: unknown, name: string): string | null {
  if (value === null) return null;
  const parsed = typeof value === 'string' && DATE_RE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function referenceList(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) invalid(`${name} is invalid`);
  return [...new Set(value.map(item => reference(item, name)))];
}

function uniqueIds(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !UUID_RE.test(item))) {
    invalid(`${name} is invalid`);
  }
  return [...new Set(value as string[])];
}

function reference(value: unknown, name: string): string {
  return nonEmpty(value, name, 255);
}

async function assertCapability(
  port: ActorQueryPort,
  board: BoardIdentity,
  capability: PermissionCapability,
): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(`
    SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, $3::text) AS allowed
  `, [board.tenantId, board.id, capability]);
  if (result.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
}

async function assertCanWriteTags(port: ActorQueryPort, tenantId: string): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(`
    SELECT projed_core.actor_can_write_tags_v1($1::uuid) AS allowed
  `, [tenantId]);
  if (result.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
}

async function resolveTaskId(port: ActorQueryPort, board: BoardIdentity, taskRef: string): Promise<string> {
  const result = await port.query<{ id: string }>(`
    SELECT id::text AS id
      FROM projed_core.wbs_items
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid
       AND (id::text = $3 OR legacy_task_id = $3)
     LIMIT 2
  `, [board.tenantId, board.id, reference(taskRef, 'task reference')]);
  if (result.rows.length !== 1) notFound();
  return result.rows[0]!.id;
}

async function resolveOptionalTaskId(
  port: ActorQueryPort,
  board: BoardIdentity,
  taskRef: string | null,
): Promise<string | null> {
  return taskRef === null ? null : resolveTaskId(port, board, taskRef);
}

async function resolveTagIds(port: ActorQueryPort, tenantId: string, refs: string[]): Promise<string[]> {
  const unique = [...new Set(refs.map(value => reference(value, 'tag reference')))];
  if (unique.length === 0) return [];
  const result = await port.query<{ id: string; legacy_tag_id: string }>(`
    SELECT id::text AS id, legacy_tag_id
      FROM projed_core.task_tags
     WHERE tenant_id = $1::uuid
       AND (id::text = ANY($2::text[]) OR legacy_tag_id = ANY($2::text[]))
  `, [tenantId, unique]);
  const byRef = new Map<string, string>();
  for (const row of result.rows) {
    byRef.set(row.id, row.id);
    byRef.set(row.legacy_tag_id, row.id);
  }
  if (unique.some(value => !byRef.has(value))) notFound();
  return unique.map(value => byRef.get(value)!);
}

async function assertProjectMembers(port: ActorQueryPort, board: BoardIdentity, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const result = await port.query<{ user_id: string }>(`
    SELECT member.user_id::text AS user_id
      FROM projed_core.project_members member
      JOIN projed_core.tenant_members tenant_member
        ON tenant_member.tenant_id = member.tenant_id AND tenant_member.user_id = member.user_id
     WHERE member.tenant_id = $1::uuid AND member.project_id = $2::uuid
       AND member.user_id = ANY($3::uuid[]) AND tenant_member.status = 'active'
  `, [board.tenantId, board.id, userIds]);
  if (new Set(result.rows.map(row => row.user_id)).size !== userIds.length) invalid('Task assignments must be board members');
}

function normalizeAssignments(input: Pick<DomainTaskCreate, 'assigneeIds' | 'assigneeId' | 'collaboratorIds'>): {
  assigneeIds: string[];
  collaboratorIds: string[];
} {
  const primary = input.assigneeIds !== undefined
    ? uniqueIds(input.assigneeIds, 'assigneeIds')
    : input.assigneeId === undefined
      ? []
      : uniqueIds(input.assigneeId ? [input.assigneeId] : [], 'assigneeId');
  const primarySet = new Set(primary);
  const collaborators = uniqueIds(input.collaboratorIds ?? [], 'collaboratorIds')
    .filter(id => !primarySet.has(id));
  return { assigneeIds: primary, collaboratorIds: collaborators };
}

async function setTaskTags(
  port: ActorQueryPort,
  board: BoardIdentity,
  taskId: string,
  tagRefs: string[],
): Promise<void> {
  const tagIds = await resolveTagIds(port, board.tenantId, tagRefs);
  await port.query(`
    DELETE FROM projed_core.wbs_item_tags
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND item_id = $3::uuid
  `, [board.tenantId, board.id, taskId]);
  if (tagIds.length > 0) {
    await port.query(`
      INSERT INTO projed_core.wbs_item_tags(tenant_id, project_id, item_id, tag_id)
      SELECT $1::uuid, $2::uuid, $3::uuid, tag_id
        FROM unnest($4::uuid[]) AS tag_id
    `, [board.tenantId, board.id, taskId, tagIds]);
  }
}

function validateCreate(input: DomainTaskCreate): void {
  if (!isRecord(input)) invalid('Task input is invalid');
  const known = new Set([
    'id', 'parentId', 'title', 'detailNotes', 'description', 'status', 'assigneeIds', 'assigneeId', 'collaboratorIds',
    'tagIds', 'startDate', 'endDate', 'isDurationLocked', 'nodeType', 'kanbanStageId', 'order', 'isArchived',
  ]);
  if (Object.keys(input).some(key => !known.has(key))) invalid('Task input contains an unsupported field');
  reference(input.id, 'task id');
  if (input.parentId !== null && typeof input.parentId !== 'string') invalid('parentId is invalid');
  nonEmpty(input.title, 'task title', 500);
  if (!TASK_STATUSES.has(input.status)) invalid('task status is invalid');
  finite(input.order, 'task order');
  if (input.detailNotes !== undefined && !validTaskDetailNotes(input.detailNotes)) invalid('task detail notes are invalid');
  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') invalid('task description is invalid');
  if (input.startDate !== undefined) optionalDate(input.startDate, 'startDate');
  if (input.endDate !== undefined) optionalDate(input.endDate, 'endDate');
  if (input.startDate && input.endDate && input.startDate > input.endDate) invalid('Task date order is invalid');
  if (input.tagIds !== undefined) referenceList(input.tagIds, 'tagIds');
  if (input.isDurationLocked !== undefined && input.isDurationLocked !== null && typeof input.isDurationLocked !== 'boolean') {
    invalid('isDurationLocked is invalid');
  }
  if (input.isArchived !== undefined && typeof input.isArchived !== 'boolean') invalid('isArchived is invalid');
  if (input.nodeType !== undefined && input.nodeType !== null && !NODE_TYPES.has(input.nodeType)) invalid('nodeType is invalid');
  if (input.kanbanStageId !== undefined && input.kanbanStageId !== null) nonEmpty(input.kanbanStageId, 'kanbanStageId', 255);
}

export class DomainWriteRepository {
  constructor(private readonly readRepository = new DomainReadRepository()) {}

  async createTask(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    input: DomainTaskCreate,
  ): Promise<DomainTask> {
    validateCreate(input);
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'create_task');
    const assignments = normalizeAssignments(input);
    if (assignments.assigneeIds.length > 0 || assignments.collaboratorIds.length > 0) {
      await assertCapability(port, board, 'assign_task');
      await assertProjectMembers(port, board, [...new Set([...assignments.assigneeIds, ...assignments.collaboratorIds])]);
    }
    const parentId = await resolveOptionalTaskId(port, board, input.parentId);
    const storageId = UUID_RE.test(input.id) ? input.id : randomUUID();
    await port.query(`
      INSERT INTO projed_core.wbs_items(
        id, tenant_id, project_id, legacy_task_id, parent_id, title, detail_notes, description,
        status, assignee_ids, collaborator_ids, tag_ids, start_date, end_date, duration_locked,
        node_type, kanban_stage_id, sort_order, archived
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8,
        $9, $10::uuid[], $11::uuid[], '{}'::uuid[], $12::date, $13::date, $14,
        $15, $16, $17, $18
      )
    `, [
      storageId, board.tenantId, board.id, input.id, parentId, input.title, JSON.stringify(input.detailNotes ?? []),
      input.description ?? null, input.status, assignments.assigneeIds, assignments.collaboratorIds,
      input.startDate ?? null, input.endDate ?? null, input.isDurationLocked ?? null,
      input.nodeType ?? null, input.kanbanStageId ?? null, input.order, input.isArchived ?? false,
    ]);
    await setTaskTags(port, board, storageId, input.tagIds ?? []);
    const created = (await this.readRepository.listTasks(port, workspaceRef, boardRef)).find(task => task.id === input.id);
    if (!created) notFound();
    return created;
  }

  async updateTask(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    taskRef: string,
    updates: DomainTaskUpdate,
  ): Promise<DomainTask> {
    if (!isRecord(updates)) invalid('Task update is invalid');
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const taskId = await resolveTaskId(port, board, taskRef);
    const keys = Object.keys(updates);
    const known = new Set([
      'parentId', 'title', 'detailNotes', 'description', 'status', 'assigneeIds', 'assigneeId', 'collaboratorIds',
      'tagIds', 'startDate', 'endDate', 'isDurationLocked', 'nodeType', 'kanbanStageId', 'order', 'isArchived',
    ]);
    if (keys.some(key => !known.has(key))) invalid('Task update contains an unsupported field');

    const requiresMove = keys.some(key => key === 'parentId' || key === 'order' || key === 'kanbanStageId');
    const requiresAssign = keys.some(key => key === 'assigneeIds' || key === 'assigneeId' || key === 'collaboratorIds');
    const requiresEdit = keys.some(key => ![
      'parentId', 'order', 'kanbanStageId', 'assigneeIds', 'assigneeId', 'collaboratorIds',
    ].includes(key));
    if (requiresMove) await assertCapability(port, board, 'move_task');
    if (requiresAssign) await assertCapability(port, board, 'assign_task');
    if (requiresEdit) await assertCapability(port, board, 'edit_task');

    const columns: string[] = [];
    const values: unknown[] = [board.tenantId, board.id, taskId];
    const add = (column: string, value: unknown, cast = ''): void => {
      values.push(value);
      columns.push(`${column} = $${values.length}${cast}`);
    };
    if (hasOwn(updates, 'parentId')) add('parent_id', await resolveOptionalTaskId(port, board, updates.parentId ?? null), '::uuid');
    if (hasOwn(updates, 'title')) add('title', nonEmpty(updates.title, 'task title', 500));
    if (hasOwn(updates, 'detailNotes')) {
      if (!validTaskDetailNotes(updates.detailNotes)) invalid('task detail notes are invalid');
      add('detail_notes', JSON.stringify(updates.detailNotes), '::jsonb');
    }
    if (hasOwn(updates, 'description')) {
      if (updates.description !== null && typeof updates.description !== 'string') invalid('task description is invalid');
      add('description', updates.description ?? null);
    }
    if (hasOwn(updates, 'status')) {
      if (!TASK_STATUSES.has(updates.status ?? '')) invalid('task status is invalid');
      add('status', updates.status);
    }
    const dateChange = hasOwn(updates, 'startDate') || hasOwn(updates, 'endDate');
    const current = requiresAssign || dateChange
      ? await port.query<{
          assignee_ids: string[]; collaborator_ids: string[]; start_date: string | null; end_date: string | null;
        }>(`
        SELECT assignee_ids::text[], collaborator_ids::text[],
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date
          FROM projed_core.wbs_items WHERE id = $1::uuid
      `, [taskId])
      : null;
    if (requiresAssign) {
      const assignments = normalizeAssignments({
        assigneeIds: hasOwn(updates, 'assigneeIds') ? updates.assigneeIds : hasOwn(updates, 'assigneeId') ? undefined : current!.rows[0]!.assignee_ids,
        assigneeId: hasOwn(updates, 'assigneeId') ? updates.assigneeId : undefined,
        collaboratorIds: hasOwn(updates, 'collaboratorIds') ? updates.collaboratorIds : current!.rows[0]!.collaborator_ids,
      });
      await assertProjectMembers(port, board, [...new Set([...assignments.assigneeIds, ...assignments.collaboratorIds])]);
      add('assignee_ids', assignments.assigneeIds, '::uuid[]');
      add('collaborator_ids', assignments.collaboratorIds, '::uuid[]');
    }
    if (hasOwn(updates, 'startDate')) add('start_date', optionalDate(updates.startDate ?? null, 'startDate'), '::date');
    if (hasOwn(updates, 'endDate')) add('end_date', optionalDate(updates.endDate ?? null, 'endDate'), '::date');
    if (dateChange) {
      const startDate = hasOwn(updates, 'startDate') ? optionalDate(updates.startDate ?? null, 'startDate') : current!.rows[0]!.start_date;
      const endDate = hasOwn(updates, 'endDate') ? optionalDate(updates.endDate ?? null, 'endDate') : current!.rows[0]!.end_date;
      if (startDate && endDate && startDate > endDate) invalid('Task date order is invalid');
    }
    if (hasOwn(updates, 'isDurationLocked')) {
      if (updates.isDurationLocked !== null && typeof updates.isDurationLocked !== 'boolean') invalid('isDurationLocked is invalid');
      add('duration_locked', updates.isDurationLocked ?? null);
    }
    if (hasOwn(updates, 'nodeType')) {
      if (updates.nodeType !== null && !NODE_TYPES.has(updates.nodeType ?? '')) invalid('nodeType is invalid');
      add('node_type', updates.nodeType ?? null);
    }
    if (hasOwn(updates, 'kanbanStageId')) {
      if (updates.kanbanStageId !== null) nonEmpty(updates.kanbanStageId, 'kanbanStageId', 255);
      add('kanban_stage_id', updates.kanbanStageId ?? null);
    }
    if (hasOwn(updates, 'order')) add('sort_order', finite(updates.order, 'task order'));
    if (hasOwn(updates, 'isArchived')) {
      if (typeof updates.isArchived !== 'boolean') invalid('isArchived is invalid');
      add('archived', updates.isArchived);
    }
    if (columns.length > 0) {
      columns.push('updated_at = now()');
      const result = await port.query(`
        UPDATE projed_core.wbs_items SET ${columns.join(', ')}
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
      `, values);
      if (result.rowCount !== 1) notFound();
    }
    if (hasOwn(updates, 'tagIds')) {
      await setTaskTags(port, board, taskId, referenceList(updates.tagIds ?? [], 'tagIds'));
    }
    const updated = (await this.readRepository.listTasks(port, workspaceRef, boardRef)).find(task => task.storageId === taskId);
    if (!updated) notFound();
    return updated;
  }

  async batchUpdateTasks(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    updates: Array<{ id: string; data: DomainTaskUpdate }>,
  ): Promise<DomainTask[]> {
    if (!Array.isArray(updates) || updates.length < 1 || updates.length > 200) invalid('Task batch size is invalid');
    const results: DomainTask[] = [];
    for (const update of updates) {
      if (!isRecord(update) || typeof update.id !== 'string' || !isRecord(update.data)) invalid('Task batch item is invalid');
      results.push(await this.updateTask(port, workspaceRef, boardRef, update.id, update.data));
    }
    return results;
  }

  async deleteTask(port: ActorQueryPort, workspaceRef: string, boardRef: string, taskRef: string): Promise<void> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'delete_task');
    const taskId = await resolveTaskId(port, board, taskRef);
    const result = await port.query(`
      DELETE FROM projed_core.wbs_items
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
    `, [board.tenantId, board.id, taskId]);
    if (result.rowCount !== 1) notFound();
  }

  async createTag(port: ActorQueryPort, workspaceRef: string, input: DomainTaskTagCreate): Promise<DomainTaskTag> {
    if (!isRecord(input) || Object.keys(input).some(key => !['id', 'name', 'color', 'order'].includes(key))) {
      invalid('Tag input is invalid');
    }
    reference(input.id, 'tag id');
    nonEmpty(input.name, 'tag name', 120);
    if (!TAG_COLORS.has(input.color)) invalid('tag color is invalid');
    finite(input.order, 'tag order');
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertCanWriteTags(port, workspace.id);
    const storageId = UUID_RE.test(input.id) ? input.id : randomUUID();
    await port.query(`
      INSERT INTO projed_core.task_tags(id, tenant_id, legacy_tag_id, name, color, sort_order)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `, [storageId, workspace.id, input.id, input.name, input.color, input.order]);
    const created = (await this.readRepository.listTags(port, workspaceRef)).find(tag => tag.storageId === storageId);
    if (!created) notFound();
    return created;
  }

  async updateTag(
    port: ActorQueryPort,
    workspaceRef: string,
    tagRef: string,
    updates: DomainTaskTagUpdate,
  ): Promise<DomainTaskTag> {
    if (!isRecord(updates)) invalid('Tag update is invalid');
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertCanWriteTags(port, workspace.id);
    const keys = Object.keys(updates);
    if (keys.some(key => !['name', 'color', 'order'].includes(key))) invalid('Tag update contains an unsupported field');
    const values: unknown[] = [workspace.id, reference(tagRef, 'tag reference')];
    const columns: string[] = [];
    const add = (column: string, value: unknown): void => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };
    if (hasOwn(updates, 'name')) add('name', nonEmpty(updates.name, 'tag name', 120));
    if (hasOwn(updates, 'color')) {
      if (!TAG_COLORS.has(updates.color ?? '')) invalid('tag color is invalid');
      add('color', updates.color);
    }
    if (hasOwn(updates, 'order')) add('sort_order', finite(updates.order, 'tag order'));
    if (columns.length > 0) {
      columns.push('updated_at = now()');
      const result = await port.query(`
        UPDATE projed_core.task_tags SET ${columns.join(', ')}
         WHERE tenant_id = $1::uuid AND (id::text = $2 OR legacy_tag_id = $2)
      `, values);
      if (result.rowCount !== 1) notFound();
    }
    const updated = (await this.readRepository.listTags(port, workspaceRef)).find(tag => tag.id === tagRef || tag.storageId === tagRef);
    if (!updated) notFound();
    return updated;
  }

  async deleteTag(port: ActorQueryPort, workspaceRef: string, tagRef: string): Promise<void> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertCanWriteTags(port, workspace.id);
    const result = await port.query(`
      DELETE FROM projed_core.task_tags
       WHERE tenant_id = $1::uuid AND (id::text = $2 OR legacy_tag_id = $2)
    `, [workspace.id, reference(tagRef, 'tag reference')]);
    if (result.rowCount !== 1) notFound();
  }

  async setTaskTags(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    taskRef: string,
    tagRefs: string[],
  ): Promise<DomainTask> {
    const checkedTagRefs = referenceList(tagRefs, 'tagIds');
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'edit_task');
    const taskId = await resolveTaskId(port, board, taskRef);
    await setTaskTags(port, board, taskId, checkedTagRefs);
    const updated = (await this.readRepository.listTasks(port, workspaceRef, boardRef)).find(task => task.storageId === taskId);
    if (!updated) notFound();
    return updated;
  }

  async setDependency(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    input: DomainDependencyCreate,
  ): Promise<DomainDependency> {
    if (!isRecord(input) || Object.keys(input).some(key => !['id', 'fromId', 'fromSide', 'toId', 'toSide', 'offset'].includes(key))) {
      invalid('Dependency input is invalid');
    }
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'create_dependency');
    if (!['start', 'end'].includes(input.fromSide) || !['start', 'end'].includes(input.toSide)) invalid('Dependency side is invalid');
    if (input.offset !== undefined) finite(input.offset, 'dependency offset');
    const fromId = await resolveTaskId(port, board, input.fromId);
    const toId = await resolveTaskId(port, board, input.toId);
    if (fromId === toId && input.fromSide === input.toSide) invalid('Dependency cannot use the same endpoint twice');
    const externalId = input.id === undefined ? randomUUID() : reference(input.id, 'dependency id');
    const storageId = UUID_RE.test(externalId) ? externalId : randomUUID();
    await port.query(`
      INSERT INTO projed_core.wbs_dependencies(
        id, tenant_id, project_id, legacy_dependency_id, from_id, from_side, to_id, to_side, offset_value
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::uuid, $8, $9)
      ON CONFLICT (tenant_id, project_id, legacy_dependency_id) DO UPDATE SET
        from_id = EXCLUDED.from_id, from_side = EXCLUDED.from_side,
        to_id = EXCLUDED.to_id, to_side = EXCLUDED.to_side, offset_value = EXCLUDED.offset_value
    `, [storageId, board.tenantId, board.id, externalId, fromId, input.fromSide, toId, input.toSide, input.offset ?? 0]);
    const dependency = (await this.readRepository.listDependencies(port, workspaceRef, boardRef)).find(item => item.id === externalId);
    if (!dependency) notFound();
    return dependency;
  }

  async updateDependency(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    dependencyRef: string,
    updates: Partial<Omit<DomainDependency, 'id'>>,
  ): Promise<DomainDependency> {
    if (!isRecord(updates)) invalid('Dependency update is invalid');
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'create_dependency');
    const keys = Object.keys(updates);
    if (keys.some(key => !['fromId', 'fromSide', 'toId', 'toSide', 'offset'].includes(key))) invalid('Dependency update contains an unsupported field');
    const checkedRef = reference(dependencyRef, 'dependency reference');
    const existing = await port.query<{
      legacy_dependency_id: string; from_id: string; from_side: DomainDependency['fromSide'];
      to_id: string; to_side: DomainDependency['toSide'];
    }>(`
      SELECT legacy_dependency_id, from_id::text AS from_id, from_side, to_id::text AS to_id, to_side
        FROM projed_core.wbs_dependencies
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
         AND (id::text = $3 OR legacy_dependency_id = $3)
       LIMIT 2
    `, [board.tenantId, board.id, checkedRef]);
    if (existing.rows.length !== 1) notFound();
    const current = existing.rows[0]!;
    const nextFromId = hasOwn(updates, 'fromId') ? await resolveTaskId(port, board, updates.fromId!) : current.from_id;
    const nextToId = hasOwn(updates, 'toId') ? await resolveTaskId(port, board, updates.toId!) : current.to_id;
    const nextFromSide = hasOwn(updates, 'fromSide') ? updates.fromSide : current.from_side;
    const nextToSide = hasOwn(updates, 'toSide') ? updates.toSide : current.to_side;
    if (!['start', 'end'].includes(nextFromSide ?? '') || !['start', 'end'].includes(nextToSide ?? '')) {
      invalid('Dependency side is invalid');
    }
    if (nextFromId === nextToId && nextFromSide === nextToSide) invalid('Dependency cannot use the same endpoint twice');
    const values: unknown[] = [board.tenantId, board.id, checkedRef];
    const columns: string[] = [];
    const add = (column: string, value: unknown, cast = ''): void => {
      values.push(value);
      columns.push(`${column} = $${values.length}${cast}`);
    };
    if (hasOwn(updates, 'fromId')) add('from_id', nextFromId, '::uuid');
    if (hasOwn(updates, 'fromSide')) {
      if (!['start', 'end'].includes(updates.fromSide ?? '')) invalid('Dependency side is invalid');
      add('from_side', updates.fromSide);
    }
    if (hasOwn(updates, 'toId')) add('to_id', nextToId, '::uuid');
    if (hasOwn(updates, 'toSide')) {
      if (!['start', 'end'].includes(updates.toSide ?? '')) invalid('Dependency side is invalid');
      add('to_side', updates.toSide);
    }
    if (hasOwn(updates, 'offset')) add('offset_value', updates.offset === undefined ? null : finite(updates.offset, 'dependency offset'));
    if (columns.length > 0) {
      const result = await port.query(`
        UPDATE projed_core.wbs_dependencies SET ${columns.join(', ')}
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid
           AND (id::text = $3 OR legacy_dependency_id = $3)
      `, values);
      if (result.rowCount !== 1) notFound();
    }
    const updated = (await this.readRepository.listDependencies(port, workspaceRef, boardRef))
      .find(item => item.id === current.legacy_dependency_id);
    if (!updated) notFound();
    return updated;
  }

  async deleteDependency(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    dependencyRef: string,
  ): Promise<void> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await assertCapability(port, board, 'delete_dependency');
    const result = await port.query(`
      DELETE FROM projed_core.wbs_dependencies
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
         AND (id::text = $3 OR legacy_dependency_id = $3)
    `, [board.tenantId, board.id, reference(dependencyRef, 'dependency reference')]);
    if (result.rowCount !== 1) notFound();
  }
}
