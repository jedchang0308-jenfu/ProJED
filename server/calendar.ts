import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { runActorTransaction, type ActorQueryPort, type ServerActorV1 } from './actorTransaction.js';
import { buildCalendarIcs, CALENDAR_FEED_TASK_LIMIT } from './calendarIcs.js';
import {
  calendarDateTypes,
  calendarProjectIncluded,
  calendarProjectRequiresManage,
  calendarProjectSelectedUsers,
  matchesCalendarTask,
  normalizeCalendarFilters,
  type CalendarFeedTask,
} from './calendarModel.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import { KernelError } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[a-f0-9]{64}$/;
const STATUS_SET = new Set(['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold']);
const MAX_SCOPE_ITEMS = 100;
const CALENDAR_FEED_SCAN_PAGE_SIZE = 500;

type SubscriptionRow = {
  id: string;
  owner_user_id: string;
  name: string;
  filters_json: unknown;
  is_active: boolean;
  expires_at: Date | null;
  last_accessed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type Project = { id: string; tenantId: string; legacyBoardId: string; title: string; legacyWorkspaceId: string; workspaceTitle: string };

type CalendarTaskRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  legacy_task_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_ids: string[];
  collaborator_ids: string[];
  tag_ids: string[];
  start_date: string | null;
  end_date: string | null;
  updated_at: Date;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const uniqueStrings = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.length > MAX_SCOPE_ITEMS
      || value.some(item => typeof item !== 'string' || item.trim() === '' || item.length > 512)) {
    throw new KernelError('DOMAIN_DATA_INVALID', `${field} is invalid`, 400);
  }
  const result = [...new Set(value as string[])];
  if (result.length !== value.length) throw new KernelError('DOMAIN_DATA_INVALID', `${field} contains duplicates`, 400);
  return result;
};

function mapSubscription(row: SubscriptionRow) {
  return {
    id: row.id,
    name: row.name,
    filters: row.filters_json,
    isActive: row.is_active,
    expiresAt: row.expires_at?.toISOString() ?? null,
    lastAccessedAt: row.last_accessed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function tokenPair(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export const calendarFeedPath = (token: string) => `/api/v1/calendar-feeds/${encodeURIComponent(token)}.ics`;
export const calendarTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function resolveWorkspace(port: ActorQueryPort, workspaceRef: string) {
  const result = await port.query<{ id: string; legacy_workspace_id: string; title: string }>(`
    SELECT id::text, legacy_workspace_id, title FROM projed_core.tenants
     WHERE id::text = $1 OR legacy_workspace_id = $1 ORDER BY id LIMIT 2
  `, [workspaceRef]);
  if (result.rows.length !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Workspace is unavailable', 404);
  return result.rows[0]!;
}

async function resolveProject(port: ActorQueryPort, boardRef: string, tenantIds: readonly string[]): Promise<Project> {
  const result = await port.query<{
    id: string; tenant_id: string; legacy_board_id: string; title: string;
    legacy_workspace_id: string; workspace_title: string;
  }>(`
    SELECT project.id::text, project.tenant_id::text, project.legacy_board_id, project.title,
           tenant.legacy_workspace_id, tenant.title AS workspace_title
      FROM projed_core.projects project
      JOIN projed_core.tenants tenant ON tenant.id = project.tenant_id
     WHERE (project.id::text = $1 OR project.legacy_board_id = $1)
       AND project.tenant_id = ANY($2::uuid[])
       AND projed_core.actor_has_board_capability_v1(project.tenant_id, project.id, 'read_board')
     ORDER BY project.id LIMIT 2
  `, [boardRef, tenantIds]);
  if (result.rows.length !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Board is unavailable', 404);
  const row = result.rows[0]!;
  return {
    id: row.id, tenantId: row.tenant_id, legacyBoardId: row.legacy_board_id, title: row.title,
    legacyWorkspaceId: row.legacy_workspace_id, workspaceTitle: row.workspace_title,
  };
}

async function normalizeTagIds(port: ActorQueryPort, tenantId: string, value: unknown): Promise<string[]> {
  const refs = uniqueStrings(value, 'calendar tag ids');
  const result: string[] = [];
  for (const ref of refs) {
    const rows = await port.query<{ id: string }>(`
      SELECT id::text FROM projed_core.task_tags
       WHERE tenant_id = $1::uuid AND (id::text = $2 OR legacy_tag_id = $2)
       ORDER BY id LIMIT 2
    `, [tenantId, ref]);
    if (rows.rows.length !== 1) throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar tag is unavailable', 400);
    result.push(rows.rows[0]!.id);
  }
  return result;
}

async function normalizeV4Filters(
  port: ActorQueryPort,
  value: unknown,
  actorUserId: string,
): Promise<Record<string, unknown>> {
  if (!isRecord(value) || value.version !== 4 || value.v4_scope_type !== 'per_board_filter_snapshot'
      || Object.keys(value).some(key => !['version', 'v4_scope_type', 'workspace_ids', 'project_ids', 'board_filters'].includes(key))) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar filters must use the v4 per-board snapshot contract', 400);
  }
  const workspaceRefs = uniqueStrings(value.workspace_ids, 'calendar workspace ids');
  const projectRefs = uniqueStrings(value.project_ids, 'calendar project ids');
  if (workspaceRefs.length === 0 || projectRefs.length === 0 || !isRecord(value.board_filters)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar scope is empty', 400);
  }
  const boardFilters = value.board_filters;
  const workspaces = [];
  for (const ref of workspaceRefs) workspaces.push(await resolveWorkspace(port, ref));
  const tenantIds = workspaces.map(workspace => workspace.id);
  const projects: Project[] = [];
  for (const ref of projectRefs) projects.push(await resolveProject(port, ref, tenantIds));
  if (new Set(projects.map(project => project.id)).size !== projects.length
      || Object.keys(boardFilters).length !== projectRefs.length) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar board snapshots do not match the selected boards', 400);
  }
  const normalizedSnapshots: Record<string, unknown> = {};
  let includedCount = 0;
  for (let index = 0; index < projects.length; index += 1) {
    const project = projects[index]!;
    const inputRef = projectRefs[index]!;
    const rawSnapshot = [inputRef, project.id, project.legacyBoardId]
      .map(key => boardFilters[key]).find(candidate => candidate !== undefined);
    if (!isRecord(rawSnapshot) || Object.keys(rawSnapshot).some(key => !['included', 'date_types', 'filters'].includes(key))
        || typeof rawSnapshot.included !== 'boolean' || !isRecord(rawSnapshot.filters)) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar board snapshot is invalid', 400);
    }
    const rawDateTypes = uniqueStrings(rawSnapshot.date_types, 'calendar date types');
    if (rawDateTypes.some(type => type !== 'start_date' && type !== 'due_date')
        || (rawSnapshot.included && rawDateTypes.length === 0)) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar event dates are invalid', 400);
    }
    const filter = rawSnapshot.filters;
    if (Object.keys(filter).some(key => !['statuses', 'due', 'people', 'tagIds', 'keyword'].includes(key))
        || !isRecord(filter.due) || !isRecord(filter.people)
        || typeof filter.due.includeOverdue !== 'boolean'
        || (filter.due.upcomingWithinDays !== null && (!Number.isInteger(filter.due.upcomingWithinDays)
          || Number(filter.due.upcomingWithinDays) < 0 || Number(filter.due.upcomingWithinDays) > 365))
        || typeof filter.people.includeUnassigned !== 'boolean' || typeof filter.keyword !== 'string'
        || filter.keyword.length > 512) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar task filter is invalid', 400);
    }
    const statuses = uniqueStrings(filter.statuses, 'calendar statuses');
    const people = uniqueStrings(filter.people.ids, 'calendar people');
    if (statuses.some(status => !STATUS_SET.has(status)) || people.some(person => !UUID_RE.test(person))) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar task filter selection is invalid', 400);
    }
    if (people.length > 0) {
      const active = await port.query<{ user_id: string }>(`
        SELECT user_id::text FROM projed_core.tenant_members
         WHERE tenant_id = $1::uuid AND status = 'active' AND user_id = ANY($2::uuid[])
      `, [project.tenantId, people]);
      if (new Set(active.rows.map(row => row.user_id)).size !== people.length) {
        throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar assignee is unavailable', 400);
      }
    }
    const requiresManage = rawSnapshot.included
      && (people.length === 0 || filter.people.includeUnassigned === true
        || people.some(person => person !== actorUserId));
    if (requiresManage) {
      const allowed = await port.query<{ allowed: boolean }>(`
        SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'manage_board_members') AS allowed
      `, [project.tenantId, project.id]);
      if (allowed.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Calendar scope requires board management', 403);
    }
    const tagIds = await normalizeTagIds(port, project.tenantId, filter.tagIds);
    normalizedSnapshots[project.id] = {
      included: rawSnapshot.included,
      date_types: rawDateTypes,
      filters: {
        statuses,
        due: {
          includeOverdue: filter.due.includeOverdue,
          upcomingWithinDays: filter.due.upcomingWithinDays,
        },
        people: { ids: people, includeUnassigned: filter.people.includeUnassigned },
        tagIds,
        keyword: filter.keyword.trim(),
      },
    };
    if (rawSnapshot.included) includedCount += 1;
  }
  if (includedCount === 0) throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar must include at least one board', 400);
  return {
    version: 4,
    v4_scope_type: 'per_board_filter_snapshot',
    workspace_ids: [...new Set(projects.map(project => project.tenantId))],
    project_ids: projects.map(project => project.id),
    board_filters: normalizedSnapshots,
  };
}

export async function normalizeCalendarInput(
  port: ActorQueryPort,
  value: unknown,
): Promise<{ name: string; filters: Record<string, unknown> }> {
  if (!isRecord(value) || Object.keys(value).some(key => !['name', 'filters'].includes(key))
      || typeof value.name !== 'string') {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar subscription input is invalid', 400);
  }
  const name = value.name.trim();
  if (!name || name.length > 160) throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar name is invalid', 400);
  const actor = await port.query<{ id: string }>('SELECT projed_core.current_actor_user_id_v1()::text AS id');
  const actorUserId = actor.rows[0]?.id;
  if (!actorUserId) throw new KernelError('ACTOR_INVALID', 'Session profile is unavailable', 401);
  return { name, filters: await normalizeV4Filters(port, value.filters, actorUserId) };
}

export class CalendarRepository {
  async list(port: ActorQueryPort) {
    const rows = await port.query<SubscriptionRow>(`
      SELECT id::text, owner_user_id::text, name, filters_json, is_active, expires_at,
             last_accessed_at, created_at, updated_at
        FROM projed_core.calendar_subscriptions
       WHERE owner_user_id = projed_core.current_actor_user_id_v1()
       ORDER BY created_at DESC, id
    `);
    return rows.rows.map(mapSubscription);
  }

  async listReferences(port: ActorQueryPort) {
    const workspaces = await port.query<{ id: string; legacy_workspace_id: string; title: string }>(`
      SELECT id::text, legacy_workspace_id, title FROM projed_core.tenants ORDER BY sort_order NULLS LAST, created_at, id
    `);
    const boards = await port.query<{
      id: string; tenant_id: string; legacy_board_id: string; title: string;
      legacy_workspace_id: string; workspace_title: string;
    }>(`
      SELECT project.id::text, project.tenant_id::text, project.legacy_board_id, project.title,
             tenant.legacy_workspace_id, tenant.title AS workspace_title
        FROM projed_core.projects project JOIN projed_core.tenants tenant ON tenant.id = project.tenant_id
       ORDER BY tenant.sort_order NULLS LAST, project.sort_order NULLS LAST, project.created_at, project.id
    `);
    return {
      workspaces: workspaces.rows.map(row => ({ id: row.id, appWorkspaceId: row.legacy_workspace_id, name: row.title })),
      boards: boards.rows.map(row => ({
        id: row.id, appBoardId: row.legacy_board_id, name: row.title, workspaceId: row.tenant_id,
        appWorkspaceId: row.legacy_workspace_id, workspaceName: row.workspace_title,
        path: `${row.workspace_title} / ${row.title}`,
      })),
    };
  }

  async create(port: ActorQueryPort, input: { name: string; filters: Record<string, unknown> }) {
    const pair = tokenPair();
    const id = randomUUID();
    const inserted = await port.query<SubscriptionRow>(`
      INSERT INTO projed_core.calendar_subscriptions(id, owner_user_id, name, token_hash, filters_json)
      VALUES ($1::uuid, projed_core.current_actor_user_id_v1(), $2, $3, $4::jsonb)
      RETURNING id::text, owner_user_id::text, name, filters_json, is_active, expires_at,
                last_accessed_at, created_at, updated_at
    `, [id, input.name, pair.hash, JSON.stringify(input.filters)]);
    return { subscription: mapSubscription(inserted.rows[0]!), feedUrl: calendarFeedPath(pair.token) };
  }

  async update(port: ActorQueryPort, id: string, input: { name: string; filters: Record<string, unknown> }) {
    const updated = await port.query<SubscriptionRow>(`
      UPDATE projed_core.calendar_subscriptions
         SET name = $2, filters_json = $3::jsonb, updated_at = now()
       WHERE id = $1::uuid AND owner_user_id = projed_core.current_actor_user_id_v1()
       RETURNING id::text, owner_user_id::text, name, filters_json, is_active, expires_at,
                 last_accessed_at, created_at, updated_at
    `, [id, input.name, JSON.stringify(input.filters)]);
    if (updated.rows.length !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar subscription is unavailable', 404);
    return mapSubscription(updated.rows[0]!);
  }

  async setActive(port: ActorQueryPort, id: string, active: boolean): Promise<void> {
    const updated = await port.query(`
      UPDATE projed_core.calendar_subscriptions SET is_active = $2, updated_at = now()
       WHERE id = $1::uuid AND owner_user_id = projed_core.current_actor_user_id_v1()
    `, [id, active]);
    if (updated.rowCount !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar subscription is unavailable', 404);
  }

  async rotate(port: ActorQueryPort, id: string): Promise<string> {
    const pair = tokenPair();
    const updated = await port.query(`
      UPDATE projed_core.calendar_subscriptions
         SET token_hash = $2, is_active = true, updated_at = now()
       WHERE id = $1::uuid AND owner_user_id = projed_core.current_actor_user_id_v1()
    `, [id, pair.hash]);
    if (updated.rowCount !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar subscription is unavailable', 404);
    return calendarFeedPath(pair.token);
  }

  async delete(port: ActorQueryPort, id: string): Promise<void> {
    const removed = await port.query(`
      DELETE FROM projed_core.calendar_subscriptions
       WHERE id = $1::uuid AND owner_user_id = projed_core.current_actor_user_id_v1()
    `, [id]);
    if (removed.rowCount !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar subscription is unavailable', 404);
  }
}

export async function resolveCalendarFeedActor(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  tokenHash: string,
): Promise<{ actor: ServerActorV1; subscriptionId: string }> {
  if (!HASH_RE.test(tokenHash)) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
  const lease = await database.checkout();
  let started = false;
  try {
    await lease.client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    started = true;
    await lease.client.query(`
      SELECT set_config('projed.calendar_feed_token_hash', $1, true),
             set_config('statement_timeout', $2, true), set_config('lock_timeout', $3, true),
             set_config('idle_in_transaction_session_timeout', $4, true)
    `, [tokenHash, `${config.profile.runtime.timeouts.statementMillis}ms`, `${config.profile.runtime.timeouts.lockMillis}ms`,
      `${config.profile.runtime.timeouts.idleInTransactionMillis}ms`]);
    const subscription = await lease.client.query<{ id: string; owner_user_id: string }>(`
      SELECT id::text, owner_user_id::text FROM projed_core.calendar_subscriptions WHERE token_hash = $1
    `, [tokenHash]);
    const subscriptionRow = subscription.rows[0];
    if (!subscriptionRow) {
      await lease.client.query('ROLLBACK');
      started = false;
      lease.release();
      throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
    }
    await lease.client.query("SELECT set_config('projed.calendar_feed_owner_user_id', $1, true)", [subscriptionRow.owner_user_id]);
    const guard = await lease.client.query<{ active: boolean; revision: string }>(`
      SELECT active, revision::text FROM projed_core.account_authorization_guards WHERE local_user_id = $1::uuid
    `, [subscriptionRow.owner_user_id]);
    await lease.client.query('COMMIT');
    started = false;
    lease.release();
    const guardRow = guard.rows[0];
    if (!guardRow?.active) throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
    return {
      subscriptionId: subscriptionRow.id,
      actor: {
        principalId: `calendar-feed:${subscriptionRow.id}`,
        localUserId: subscriptionRow.owner_user_id,
        entry: 'main',
        contextId: randomUUID(),
        expiresAtMs: Date.now() + config.profile.runtime.timeouts.requestMillis + 1000,
        accountGuardRevision: guardRow.revision,
      },
    };
  } catch (error) {
    if (started) {
      try { await lease.client.query('ROLLBACK'); } catch { lease.release(true); throw error; }
    }
    lease.release();
    throw error;
  }
}

export async function buildCalendarFeed(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  tokenHash: string,
): Promise<string> {
  const resolved = await resolveCalendarFeedActor(database, config, tokenHash);
  return runActorTransaction(database, config, resolved.actor, async port => {
    const subscriptions = await port.query<SubscriptionRow>(`
      SELECT id::text, owner_user_id::text, name, filters_json, is_active, expires_at,
             last_accessed_at, created_at, updated_at
        FROM projed_core.calendar_subscriptions
       WHERE id = $1::uuid AND token_hash = $2 AND owner_user_id = projed_core.current_actor_user_id_v1()
       FOR SHARE
    `, [resolved.subscriptionId, tokenHash]);
    const subscription = subscriptions.rows[0];
    if (!subscription) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
    if (!subscription.is_active || (subscription.expires_at && subscription.expires_at.getTime() <= Date.now())) {
      throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
    }
    const filters = normalizeCalendarFilters(subscription.filters_json);
    const projects = await port.query<{
      id: string; tenant_id: string; legacy_board_id: string; title: string;
      legacy_workspace_id: string; workspace_title: string; can_manage: boolean;
    }>(`
      SELECT project.id::text, project.tenant_id::text, project.legacy_board_id, project.title,
             tenant.legacy_workspace_id, tenant.title AS workspace_title,
             projed_core.actor_has_board_capability_v1(project.tenant_id, project.id, 'manage_board_members') AS can_manage
        FROM projed_core.projects project JOIN projed_core.tenants tenant ON tenant.id = project.tenant_id
       WHERE (project.tenant_id = ANY($1::uuid[]) OR project.id = ANY($2::uuid[]))
         AND projed_core.actor_has_board_capability_v1(project.tenant_id, project.id, 'read_board')
       ORDER BY project.id
    `, [filters.workspaceIds, filters.projectIds]);
    const allowedProjects: typeof projects.rows = [];
    for (const project of projects.rows) {
      if (!calendarProjectIncluded(filters, project.id)) continue;
      if (calendarProjectRequiresManage(filters, project.id, subscription.owner_user_id) && !project.can_manage) continue;
      const selectedUsers = calendarProjectSelectedUsers(filters, project.id, subscription.owner_user_id);
      if (selectedUsers.length > 0) {
        const active = await port.query<{ user_id: string }>(`
          SELECT user_id::text FROM projed_core.tenant_members
           WHERE tenant_id = $1::uuid AND status = 'active' AND user_id = ANY($2::uuid[])
        `, [project.tenant_id, selectedUsers]);
        if (new Set(active.rows.map(row => row.user_id)).size !== selectedUsers.length) continue;
      }
      allowedProjects.push(project);
    }
    const projectIds = allowedProjects.map(project => project.id);
    const tasks: CalendarFeedTask[] = [];
    let cursorUpdatedAt: Date | null = null;
    let cursorId: string | null = null;
    let exhausted = projectIds.length === 0;
    while (!exhausted && tasks.length <= CALENDAR_FEED_TASK_LIMIT) {
      const taskRows: { rows: CalendarTaskRow[] } = await port.query<CalendarTaskRow>(`
        SELECT item.id::text, item.tenant_id::text, item.project_id::text, item.legacy_task_id,
               item.title, item.description, item.status, item.assignee_ids::text[], item.collaborator_ids::text[],
               COALESCE(tags.tag_ids, ARRAY[]::text[]) AS tag_ids,
               to_char(item.start_date, 'YYYY-MM-DD') AS start_date,
               to_char(item.end_date, 'YYYY-MM-DD') AS end_date, item.updated_at
          FROM projed_core.wbs_items item
          LEFT JOIN LATERAL (
            SELECT array_agg(link.tag_id::text ORDER BY link.tag_id) AS tag_ids
              FROM projed_core.wbs_item_tags link WHERE link.item_id = item.id
          ) tags ON true
         WHERE item.project_id = ANY($1::uuid[]) AND NOT item.archived
           AND COALESCE(item.node_type, 'task') <> 'group'
           AND ($2::timestamptz IS NULL OR (item.updated_at, item.id) < ($2::timestamptz, $3::uuid))
         ORDER BY item.updated_at DESC, item.id DESC
         LIMIT $4
      `, [projectIds, cursorUpdatedAt, cursorId, CALENDAR_FEED_SCAN_PAGE_SIZE]);
      exhausted = taskRows.rows.length < CALENDAR_FEED_SCAN_PAGE_SIZE;
      const tail: CalendarTaskRow | undefined = taskRows.rows.at(-1);
      if (tail) {
        cursorUpdatedAt = tail.updated_at;
        cursorId = tail.id;
      }
      for (const row of taskRows.rows) {
        const task: CalendarFeedTask = {
          id: row.id, tenantId: row.tenant_id, projectId: row.project_id, legacyTaskId: row.legacy_task_id,
          title: row.title, description: row.description, status: row.status, assigneeIds: row.assignee_ids,
          collaboratorIds: row.collaborator_ids, tagIds: row.tag_ids, startDate: row.start_date,
          endDate: row.end_date, updatedAt: row.updated_at,
        };
        if (matchesCalendarTask(task, filters, subscription.owner_user_id)
            && calendarDateTypes(filters, task.projectId)
              .some(type => type === 'start_date' ? task.startDate : task.endDate)) {
          tasks.push(task);
          if (tasks.length > CALENDAR_FEED_TASK_LIMIT) break;
        }
      }
    }
    const taskLimitReached = tasks.length > CALENDAR_FEED_TASK_LIMIT;
    if (taskLimitReached) tasks.length = CALENDAR_FEED_TASK_LIMIT;
    const tenantIds = [...new Set(allowedProjects.map(project => project.tenant_id))];
    const members = tenantIds.length === 0 ? { rows: [] as Array<{
      tenant_id: string; user_id: string; member_email: string | null; member_display_name: string | null;
    }> } : await port.query<{
      tenant_id: string; user_id: string; member_email: string | null; member_display_name: string | null;
    }>(`
      SELECT tenant_id::text, user_id::text, member_email, member_display_name
        FROM projed_core.tenant_members WHERE tenant_id = ANY($1::uuid[]) AND status = 'active'
    `, [tenantIds]);
    const memberLabels = new Map(members.rows.map(row => [
      `${row.tenant_id}:${row.user_id}`, row.member_display_name || row.member_email || row.user_id.slice(0, 8),
    ]));
    const dateTypesByProjectId = new Map(projectIds.map(projectId => [projectId, calendarDateTypes(filters, projectId)]));
    const ics = buildCalendarIcs({
      subscriptionId: subscription.id,
      name: subscription.name,
      tasks,
      dateTypesByProjectId,
      tenantNameById: new Map(allowedProjects.map(project => [project.tenant_id, project.workspace_title])),
      projectNameById: new Map(allowedProjects.map(project => [project.id, project.title])),
      workspaceRefById: new Map(allowedProjects.map(project => [project.tenant_id, project.legacy_workspace_id])),
      boardRefById: new Map(allowedProjects.map(project => [project.id, project.legacy_board_id])),
      memberLabelById: memberLabels,
      appBaseUrl: config.publicAppUrl,
      taskLimitReached,
    });
    await port.query(`
      UPDATE projed_core.calendar_subscriptions SET last_accessed_at = now()
       WHERE id = $1::uuid AND owner_user_id = projed_core.current_actor_user_id_v1()
    `, [subscription.id]);
    return ics;
  });
}
