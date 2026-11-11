import type { IncomingMessage } from 'node:http';

import { runActorTransaction, type ActorQueryPort } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';

const MAX_PREFERENCES_BODY_BYTES = 64 * 1024;
const BOARD_REF_MAX = 512;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

type LayoutPreferences = {
  workspaceSidebarWidth?: number;
  taskWorkbenchWidth?: number;
  taskWorkbenchUnplacedRatio?: number;
  goalCollapsedColumns?: string[];
};

type Operation =
  | { kind: 'layout-read' | 'layout-update' }
  | { kind: 'filter-read' | 'filter-upsert' | 'filter-delete'; boardRef: string; expectedVersion?: 6 };

type ProjectIdentity = { id: string; tenantId: string; legacyBoardId: string };

type PreferenceRow = {
  account_id: string;
  preference_version: number;
  filters: unknown;
  created_at: Date;
  updated_at: Date;
};

export interface PreferencesHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    const control = Array.from(decoded).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    return decoded && decoded.length <= BOARD_REF_MAX && decoded !== '.' && decoded !== '..'
      && !decoded.includes('/') && !decoded.includes('\\') && !control ? decoded : null;
  } catch {
    return null;
  }
}

function operationFor(rawUrl: string | undefined, method: string | undefined): Operation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  let url: URL;
  try { url = new URL(rawUrl, 'http://127.0.0.1'); } catch { return null; }
  if (rawUrl !== `${url.pathname}${url.search}`) return null;
  if (url.pathname === '/api/v1/preferences/layout' && !url.search) {
    if (method === 'GET') return { kind: 'layout-read' };
    if (method === 'PATCH') return { kind: 'layout-update' };
    return null;
  }
  const parts = url.pathname.split('/');
  if (parts.length !== 6 || parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1'
      || parts[3] !== 'preferences' || parts[4] !== 'task-filters') return null;
  const boardRef = decodeSegment(parts[5] ?? '');
  if (!boardRef) return null;
  if (method === 'GET' && !url.search) return { kind: 'filter-read', boardRef };
  if (method === 'PUT' && !url.search) return { kind: 'filter-upsert', boardRef };
  if (method === 'DELETE') {
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => key !== 'expectedVersion') || new Set(keys).size !== keys.length) return null;
    const rawVersion = url.searchParams.get('expectedVersion');
    if (rawVersion === null && !url.search) return { kind: 'filter-delete', boardRef };
    if (rawVersion === '6' && keys.length === 1) return { kind: 'filter-delete', boardRef, expectedVersion: 6 };
  }
  return null;
}

function isNamespace(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try { return new URL(rawUrl, 'http://127.0.0.1').pathname.startsWith('/api/v1/preferences/'); }
  catch { return false; }
}

function errorResult(error: unknown, requestId: string): PreferencesHttpResult {
  const kernelError = asKernelError(error);
  return {
    matched: true,
    status: kernelError.httpStatus,
    body: { error: {
      code: kernelError.code,
      requestId,
      retryable: kernelError.httpStatus === 429 || kernelError.httpStatus >= 500,
    } },
  };
}

function normalizeLayout(value: unknown, partial = false): LayoutPreferences {
  if (!isRecord(value)) throw new KernelError('DOMAIN_DATA_INVALID', 'Layout preferences are invalid', 400);
  const allowed = new Set([
    'workspaceSidebarWidth', 'taskWorkbenchWidth', 'taskWorkbenchUnplacedRatio', 'goalCollapsedColumns',
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Layout preference field is unsupported', 400);
  }
  const result: LayoutPreferences = {};
  const numberField = (key: keyof LayoutPreferences, min: number, max: number) => {
    const candidate = value[key];
    if (candidate === undefined && partial) return;
    if (candidate === undefined) return;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < min || candidate > max) {
      throw new KernelError('DOMAIN_DATA_INVALID', `${key} is invalid`, 400);
    }
    (result as Record<string, unknown>)[key] = candidate;
  };
  numberField('workspaceSidebarWidth', 154, 520);
  numberField('taskWorkbenchWidth', 182, 560);
  numberField('taskWorkbenchUnplacedRatio', 0.18, 0.82);
  if (value.goalCollapsedColumns !== undefined) {
    if (!Array.isArray(value.goalCollapsedColumns) || value.goalCollapsedColumns.length > 32
        || value.goalCollapsedColumns.some(column => typeof column !== 'string' || column.length > 64)) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'goalCollapsedColumns is invalid', 400);
    }
    result.goalCollapsedColumns = [...new Set(value.goalCollapsedColumns as string[])];
  }
  return result;
}

function layoutFromProfile(value: unknown): LayoutPreferences {
  if (!isRecord(value) || !isRecord(value.layout)) return {};
  const stored = value.layout;
  const result: LayoutPreferences = {};
  if (typeof stored.workspaceSidebarWidth === 'number' && Number.isFinite(stored.workspaceSidebarWidth)
      && stored.workspaceSidebarWidth >= 154 && stored.workspaceSidebarWidth <= 520) {
    result.workspaceSidebarWidth = stored.workspaceSidebarWidth;
  }
  if (typeof stored.taskWorkbenchWidth === 'number' && Number.isFinite(stored.taskWorkbenchWidth)
      && stored.taskWorkbenchWidth >= 182 && stored.taskWorkbenchWidth <= 560) {
    result.taskWorkbenchWidth = stored.taskWorkbenchWidth;
  }
  if (typeof stored.taskWorkbenchUnplacedRatio === 'number' && Number.isFinite(stored.taskWorkbenchUnplacedRatio)
      && stored.taskWorkbenchUnplacedRatio >= 0.18 && stored.taskWorkbenchUnplacedRatio <= 0.82) {
    result.taskWorkbenchUnplacedRatio = stored.taskWorkbenchUnplacedRatio;
  }
  if (Array.isArray(stored.goalCollapsedColumns)) {
    result.goalCollapsedColumns = [...new Set(stored.goalCollapsedColumns.filter(
      (column): column is string => typeof column === 'string' && column.length <= 64,
    ))].slice(0, 32);
  }
  return result;
}

async function readOrUpdateLayout(port: ActorQueryPort, updates?: LayoutPreferences): Promise<LayoutPreferences> {
  const result = await port.query<{ ui_preferences: unknown }>(`
    SELECT ui_preferences FROM projed_core.profiles
     WHERE id = projed_core.current_actor_user_id_v1()
     ${updates ? 'FOR UPDATE' : ''}
  `);
  if (result.rows.length !== 1) throw new KernelError('ACTOR_INVALID', 'Session profile is unavailable', 401);
  const currentValue = isRecord(result.rows[0]!.ui_preferences) ? result.rows[0]!.ui_preferences : {};
  const currentLayout = layoutFromProfile(currentValue);
  if (!updates) return currentLayout;
  const nextLayout = { ...currentLayout, ...updates };
  const nextPreferences = { ...currentValue, layout: nextLayout };
  const updated = await port.query<{ ui_preferences: unknown }>(`
    UPDATE projed_core.profiles SET ui_preferences = $1::jsonb, updated_at = now()
     WHERE id = projed_core.current_actor_user_id_v1()
     RETURNING ui_preferences
  `, [JSON.stringify(nextPreferences)]);
  if (updated.rows.length !== 1) throw new KernelError('ACTOR_INVALID', 'Session profile is unavailable', 401);
  return layoutFromProfile(updated.rows[0]!.ui_preferences);
}

async function resolveVisibleProject(port: ActorQueryPort, boardRef: string): Promise<ProjectIdentity> {
  const result = await port.query<{ id: string; tenant_id: string; legacy_board_id: string }>(`
    SELECT id::text, tenant_id::text, legacy_board_id
      FROM projed_core.projects
     WHERE (id::text = $1 OR legacy_board_id = $1)
       AND projed_core.actor_has_board_capability_v1(tenant_id, id, 'read_board')
     ORDER BY id
     LIMIT 2
  `, [boardRef]);
  if (result.rows.length !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Board is unavailable', 404);
  return { id: result.rows[0]!.id, tenantId: result.rows[0]!.tenant_id, legacyBoardId: result.rows[0]!.legacy_board_id };
}

function preferenceData(row: PreferenceRow, project: ProjectIdentity) {
  return {
    accountId: row.account_id,
    projectId: project.legacyBoardId,
    preferenceVersion: row.preference_version,
    filters: row.filters,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function readTaskFilter(port: ActorQueryPort, boardRef: string) {
  const project = await resolveVisibleProject(port, boardRef);
  const result = await port.query<PreferenceRow>(`
    SELECT account_id::text, preference_version, filters, created_at, updated_at
      FROM projed_core.account_board_task_filter_preferences
     WHERE account_id = projed_core.current_actor_user_id_v1() AND project_id = $1::uuid
  `, [project.id]);
  return result.rows[0] ? preferenceData(result.rows[0], project) : null;
}

function parseFilterUpdate(value: unknown): {
  expectedVersion: 4 | 5 | 6 | null;
  expectedUpdatedAt?: string;
  filters: Record<string, unknown>;
} {
  if (!isRecord(value) || Object.keys(value).some(key => !['expectedVersion', 'expectedUpdatedAt', 'filters'].includes(key))
      || (value.expectedVersion !== null && value.expectedVersion !== 4
        && value.expectedVersion !== 5 && value.expectedVersion !== 6)
      || !isRecord(value.filters)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Task filter preference is invalid', 400);
  }
  const encoded = JSON.stringify(value.filters);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_PREFERENCES_BODY_BYTES) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Task filter preference is too large', 413);
  }
  if (value.expectedUpdatedAt !== undefined
      && (typeof value.expectedUpdatedAt !== 'string' || !ISO_RE.test(value.expectedUpdatedAt)
        || !Number.isFinite(Date.parse(value.expectedUpdatedAt)))) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Task filter expectedUpdatedAt is invalid', 400);
  }
  return {
    expectedVersion: value.expectedVersion,
    filters: value.filters,
    ...(value.expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: value.expectedUpdatedAt as string }),
  };
}

async function upsertTaskFilter(port: ActorQueryPort, boardRef: string, input: ReturnType<typeof parseFilterUpdate>) {
  const project = await resolveVisibleProject(port, boardRef);
  if (input.expectedVersion === null) {
    const inserted = await port.query(`
      INSERT INTO projed_core.account_board_task_filter_preferences(
        account_id, tenant_id, project_id, preference_version, filters
      ) VALUES (projed_core.current_actor_user_id_v1(), $1::uuid, $2::uuid, 6, $3::jsonb)
      ON CONFLICT DO NOTHING
    `, [project.tenantId, project.id, JSON.stringify(input.filters)]);
    if (inserted.rowCount !== 1) throw new KernelError('REVISION_CONFLICT', 'Task filter preference changed', 409);
    return null;
  }
  const updated = await port.query(`
    UPDATE projed_core.account_board_task_filter_preferences
       SET preference_version = 6, filters = $3::jsonb, updated_at = now()
     WHERE account_id = projed_core.current_actor_user_id_v1()
       AND project_id = $1::uuid
       AND preference_version = $2
       ${input.expectedUpdatedAt ? 'AND updated_at = $4::timestamptz' : ''}
  `, [project.id, input.expectedVersion, JSON.stringify(input.filters), ...(input.expectedUpdatedAt ? [input.expectedUpdatedAt] : [])]);
  if (updated.rowCount !== 1) throw new KernelError('REVISION_CONFLICT', 'Task filter preference changed', 409);
  return null;
}

async function removeTaskFilter(port: ActorQueryPort, boardRef: string, expectedVersion?: 6) {
  const project = await resolveVisibleProject(port, boardRef);
  const removed = await port.query(`
    DELETE FROM projed_core.account_board_task_filter_preferences
     WHERE account_id = projed_core.current_actor_user_id_v1()
       AND project_id = $1::uuid
       ${expectedVersion === undefined ? '' : 'AND preference_version = $2'}
  `, expectedVersion === undefined ? [project.id] : [project.id, expectedVersion]);
  if (expectedVersion !== undefined && removed.rowCount !== 1) {
    throw new KernelError('REVISION_CONFLICT', 'Task filter preference changed', 409);
  }
  return null;
}

export function createPreferencesHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
) {
  return async (request: IncomingMessage, requestId: string): Promise<PreferencesHttpResult> => {
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      if (!isNamespace(request.url)) return { matched: false };
      request.resume();
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
    }
    if (!resolveActor) {
      if (request.method !== 'GET') request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (request.method !== 'GET' && !isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      if (actor.entry !== 'main') {
        request.resume();
        throw new KernelError('ACCESS_DENIED', 'Main Session entry is required', 403);
      }
      assertExpectedActor(request, actor);
      let data: unknown;
      if (operation.kind === 'layout-read') {
        data = await runActorTransaction(database, config, actor, port => readOrUpdateLayout(port));
      } else if (operation.kind === 'layout-update') {
        const body = await readJsonBody(request, MAX_PREFERENCES_BODY_BYTES);
        if (Object.keys(body).length !== 1 || !('updates' in body)) {
          throw new KernelError('DOMAIN_DATA_INVALID', 'Layout preference request is invalid', 400);
        }
        const updates = normalizeLayout(body.updates, true);
        data = await runActorTransaction(database, config, actor, port => readOrUpdateLayout(port, updates));
      } else if (operation.kind === 'filter-read') {
        data = await runActorTransaction(database, config, actor, port => readTaskFilter(port, operation.boardRef));
      } else if (operation.kind === 'filter-upsert') {
        const body = await readJsonBody(request, MAX_PREFERENCES_BODY_BYTES);
        const input = parseFilterUpdate(body);
        data = await runActorTransaction(database, config, actor, port => upsertTaskFilter(port, operation.boardRef, input));
      } else if (operation.kind === 'filter-delete') {
        data = await runActorTransaction(database, config, actor,
          port => removeTaskFilter(port, operation.boardRef, operation.expectedVersion));
      } else {
        throw new KernelError('DOMAIN_DATA_INVALID', 'Preference operation is invalid', 400);
      }
      return { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
