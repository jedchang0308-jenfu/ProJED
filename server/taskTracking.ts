import { createHash, randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import { resolveBoard, resolveWorkspace, validTaskDetailNotes, type BoardIdentity } from './domainRead.js';
import { KernelError, type KernelErrorCode } from './errors.js';

const PRIMARY_PREFIX = 'primary:';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const POSITIONS = new Set(['before', 'after', 'append']);
const MAX_SUBTREE = 200;

type Position = 'before' | 'after' | 'append';
type TrackingRow = {
  id: string;
  task_id: string;
  workspace_id: string;
  target_board_id: string;
  source_board_id: string;
  parent_placement_id: string | null;
  sort_order: number;
  kanban_stage_id: string | null;
  revision: string;
  created_at_ms: string;
  updated_at_ms: string;
  removed_at_ms: string | null;
};

type TrackingReference = {
  id: string;
  taskId: string;
  workspaceId: string;
  boardId: string;
  sourceBoardId: string;
  parentPlacementId: string | null;
  order: number;
  kanbanStageId?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  removedAt?: number;
};

type StagedReference = {
  referenceId: string;
  taskId: string;
  workspaceId: string;
  sourceBoardId: string;
  originalBoardId: string;
  originalParentPlacementId: string | null;
  originalOrder: number;
  order: number;
  revision: number;
  stagedAt: number;
  updatedAt: number;
};

type Mutation = {
  operationId: string;
  sourcePlacementId: string;
  expectedRevision?: number;
  expectedSubtreeIds?: string[];
  targetBoardId?: string;
  targetParentPlacementId?: string | null;
  anchorPlacementId?: string | null;
  position?: Position;
};

type Placement = {
  id: string;
  taskId: string;
  parentPlacementId: string | null;
  order: number;
  projectId: string;
};

function trackingError(code: KernelErrorCode, message: string, status: number): never {
  throw new KernelError(code, message, status);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    trackingError('DOMAIN_DATA_INVALID', 'Tracking reference input is invalid', 400);
  }
  return value as Record<string, unknown>;
}

function ref(value: unknown, label: string, max = 512): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value || value.length > max) {
    trackingError('DOMAIN_DATA_INVALID', `${label} is invalid`, 400);
  }
  return value;
}

function revision(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    trackingError('DOMAIN_DATA_INVALID', 'expectedRevision is invalid', 400);
  }
  return Number(value);
}

function stringList(value: unknown, required: boolean): string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SUBTREE
      || value.some(item => typeof item !== 'string' || !UUID_RE.test(item))) {
    trackingError('DOMAIN_DATA_INVALID', 'expectedSubtreeIds is invalid', 400);
  }
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) trackingError('DOMAIN_DATA_INVALID', 'expectedSubtreeIds contains duplicates', 400);
  return unique;
}

function parseMutation(value: unknown, kind: string): Mutation {
  const input = record(value);
  const allowed = new Set([
    'operationId', 'sourcePlacementId', 'expectedRevision', 'expectedSubtreeIds',
    'targetBoardId', 'targetParentPlacementId', 'anchorPlacementId', 'position', 'clientPlatform',
  ]);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    trackingError('DOMAIN_DATA_INVALID', 'Tracking reference input contains unknown fields', 400);
  }
  const operationId = ref(input.operationId, 'operationId', 255);
  const sourcePlacementId = ref(input.sourcePlacementId, 'sourcePlacementId');
  if (!UUID_RE.test(operationId)) trackingError('DOMAIN_DATA_INVALID', 'operationId must be a UUID', 400);
  if (input.clientPlatform !== undefined && input.clientPlatform !== 'web' && input.clientPlatform !== 'local-test') {
    trackingError('DOMAIN_DATA_INVALID', 'clientPlatform is invalid', 400);
  }
  const needsSubtree = ['move', 'stage', 'remove'].includes(kind);
  const parsed: Mutation = {
    operationId,
    sourcePlacementId,
    expectedRevision: revision(input.expectedRevision),
    expectedSubtreeIds: stringList(input.expectedSubtreeIds, needsSubtree),
  };
  if (['move', 'place-staged'].includes(kind)) {
    parsed.targetBoardId = ref(input.targetBoardId, 'targetBoardId');
    parsed.targetParentPlacementId = input.targetParentPlacementId === null
      ? null : ref(input.targetParentPlacementId, 'targetParentPlacementId');
    parsed.anchorPlacementId = input.anchorPlacementId === undefined || input.anchorPlacementId === null
      ? null : ref(input.anchorPlacementId, 'anchorPlacementId');
    if (input.position !== undefined && (typeof input.position !== 'string' || !POSITIONS.has(input.position))) {
      trackingError('INVALID_PARENT', 'Tracking reference position is invalid', 400);
    }
    parsed.position = (input.position ?? 'append') as Position;
    if (parsed.position === 'append' && parsed.anchorPlacementId !== null) {
      trackingError('INVALID_PARENT', 'append cannot specify an anchor', 400);
    }
  }
  return parsed;
}

function milliseconds(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) trackingError('DB_BOUNDARY_INVALID', 'Timestamp is invalid', 503);
  return parsed;
}

function mapReference(row: TrackingRow): TrackingReference {
  const revisionValue = Number(row.revision);
  if (!Number.isSafeInteger(revisionValue) || revisionValue < 1 || !Number.isFinite(row.sort_order)) {
    trackingError('DB_BOUNDARY_INVALID', 'Tracking reference row is invalid', 503);
  }
  const removedAt = milliseconds(row.removed_at_ms);
  return {
    id: row.id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    boardId: row.target_board_id,
    sourceBoardId: row.source_board_id,
    parentPlacementId: row.parent_placement_id,
    order: row.sort_order,
    ...(row.kanban_stage_id ? { kanbanStageId: row.kanban_stage_id } : {}),
    revision: revisionValue,
    createdAt: milliseconds(row.created_at_ms)!,
    updatedAt: milliseconds(row.updated_at_ms)!,
    ...(removedAt === undefined ? {} : { removedAt }),
  };
}

const referenceSelect = `
  SELECT reference.id::text AS id, task.legacy_task_id AS task_id,
         tenant.legacy_workspace_id AS workspace_id,
         target_project.legacy_board_id AS target_board_id,
         source_project.legacy_board_id AS source_board_id,
         reference.parent_placement_id, reference.sort_order, reference.kanban_stage_id,
         reference.revision::text,
         floor(extract(epoch FROM reference.created_at) * 1000)::bigint::text AS created_at_ms,
         floor(extract(epoch FROM reference.updated_at) * 1000)::bigint::text AS updated_at_ms,
         CASE WHEN reference.removed_at IS NULL THEN NULL
           ELSE floor(extract(epoch FROM reference.removed_at) * 1000)::bigint::text END AS removed_at_ms
    FROM projed_core.task_tracking_references reference
    JOIN projed_core.tenants tenant ON tenant.id = reference.tenant_id
    JOIN projed_core.projects target_project
      ON target_project.tenant_id = reference.tenant_id AND target_project.id = reference.target_project_id
    JOIN projed_core.projects source_project
      ON source_project.tenant_id = reference.tenant_id AND source_project.id = reference.task_project_id
    JOIN projed_core.wbs_items task
      ON task.tenant_id = reference.tenant_id
     AND task.project_id = reference.task_project_id AND task.id = reference.task_id
`;

async function assertCapability(port: ActorQueryPort, board: BoardIdentity, capability: string): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(`
    SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, $3::text) AS allowed
  `, [board.tenantId, board.id, capability]);
  if (result.rows[0]?.allowed !== true) trackingError('PERMISSION_DENIED', 'Actor cannot manage tracking references', 403);
}

async function beginOperation(
  port: ActorQueryPort,
  tenantId: string,
  input: Mutation,
  kind: string,
): Promise<unknown | undefined> {
  const requestHash = operationHash(input, kind);
  const inserted = await port.query(`
    INSERT INTO projed_core.task_tracking_reference_operations(
      tenant_id, operation_id, actor_id, request_hash
    ) VALUES ($1::uuid, $2, projed_core.current_actor_user_id_v1(), $3)
    ON CONFLICT DO NOTHING
  `, [tenantId, input.operationId, requestHash]);
  if (inserted.rowCount === 1) return undefined;
  const existing = await readOperation(port, tenantId, input, kind);
  if (existing === undefined) {
    trackingError('OPERATION_ID_CONFLICT', 'operationId was already used by a different actor', 409);
  }
  return existing;
}

function operationHash(input: Mutation, kind: string): string {
  const canonical = {
    kind,
    sourcePlacementId: input.sourcePlacementId,
    expectedRevision: input.expectedRevision ?? null,
    expectedSubtreeIds: input.expectedSubtreeIds ?? null,
    targetBoardId: input.targetBoardId ?? null,
    targetParentPlacementId: input.targetParentPlacementId ?? null,
    anchorPlacementId: input.anchorPlacementId ?? null,
    position: input.position ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function readOperation(
  port: ActorQueryPort,
  tenantId: string,
  input: Mutation,
  kind: string,
): Promise<unknown | undefined> {
  const requestHash = operationHash(input, kind);
  const existing = await port.query<{ request_hash: string; result: unknown }>(`
    SELECT request_hash, result
      FROM projed_core.task_tracking_reference_operations
     WHERE tenant_id = $1::uuid AND operation_id = $2
     FOR UPDATE
  `, [tenantId, input.operationId]);
  if (existing.rows.length === 0) return undefined;
  if (existing.rows.length !== 1 || existing.rows[0]!.request_hash !== requestHash) {
    trackingError('OPERATION_ID_CONFLICT', 'operationId was already used by a different request or actor', 409);
  }
  if (existing.rows[0]!.result === null) {
    trackingError('DB_BOUNDARY_INVALID', 'Tracking operation receipt is incomplete', 503);
  }
  return existing.rows[0]!.result;
}

async function completeOperation(port: ActorQueryPort, tenantId: string, operationId: string, result: unknown): Promise<void> {
  const updated = await port.query(`
    UPDATE projed_core.task_tracking_reference_operations
       SET result = $3::jsonb, updated_at = now()
     WHERE tenant_id = $1::uuid AND operation_id = $2 AND result IS NULL
  `, [tenantId, operationId, JSON.stringify(result)]);
  if (updated.rowCount !== 1) trackingError('DB_BOUNDARY_INVALID', 'Tracking operation receipt could not be committed', 503);
}

async function readReference(port: ActorQueryPort, tenantId: string, referenceId: string, active?: boolean): Promise<TrackingReference> {
  const result = await port.query<TrackingRow>(`${referenceSelect}
   WHERE reference.tenant_id = $1::uuid AND reference.id = $2::uuid
     AND ($3::boolean IS NULL OR (reference.removed_at IS NULL) = $3::boolean)
  `, [tenantId, referenceId, active ?? null]);
  if (result.rows.length !== 1) trackingError('NOT_FOUND', 'Tracking reference was not found', 404);
  return mapReference(result.rows[0]!);
}

async function subtreeIds(port: ActorQueryPort, tenantId: string, rootId: string, removed: boolean): Promise<string[]> {
  const result = await port.query<{ id: string }>(`
    WITH RECURSIVE subtree AS (
      SELECT id, ARRAY[id::text] AS path
        FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND id = $2::uuid
         AND (removed_at IS NOT NULL) = $3::boolean
      UNION ALL
      SELECT child.id, subtree.path || child.id::text
        FROM subtree
        JOIN projed_core.task_tracking_references child
          ON child.tenant_id = $1::uuid
         AND child.parent_placement_id = subtree.id::text
         AND (child.removed_at IS NOT NULL) = $3::boolean
       WHERE NOT child.id::text = ANY(subtree.path)
         AND cardinality(subtree.path) < ${MAX_SUBTREE + 1}
    )
    SELECT reference.id::text AS id
      FROM subtree
      JOIN projed_core.task_tracking_references reference
        ON reference.tenant_id = $1::uuid AND reference.id = subtree.id
     ORDER BY subtree.path
     FOR UPDATE OF reference
  `, [tenantId, rootId, removed]);
  if (result.rows.length < 1) trackingError('NOT_FOUND', 'Tracking reference subtree was not found', 404);
  if (result.rows.length > MAX_SUBTREE) trackingError('DOMAIN_DATA_INVALID', 'Tracking reference subtree is too large', 409);
  return result.rows.map(row => row.id);
}

function assertSubtree(actual: string[], expected: string[] | undefined): void {
  if (!expected || actual.length !== expected.length) {
    trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
  }
  const expectedSet = new Set(expected);
  if (actual.some(id => !expectedSet.has(id))) trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
}

async function resolvePlacement(
  port: ActorQueryPort,
  board: BoardIdentity,
  placementId: string | null,
): Promise<Placement | null> {
  if (placementId === null) return null;
  if (placementId.startsWith(PRIMARY_PREFIX)) {
    const taskRef = placementId.slice(PRIMARY_PREFIX.length);
    if (!taskRef) trackingError('INVALID_PARENT', 'Primary placement is invalid', 400);
    const result = await port.query<{
      id: string; task_id: string; parent_task_id: string | null; sort_order: number;
    }>(`
      SELECT item.id::text AS id, item.legacy_task_id AS task_id,
             parent.legacy_task_id AS parent_task_id, item.sort_order
        FROM projed_core.wbs_items item
        LEFT JOIN projed_core.wbs_items parent
          ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
       WHERE item.tenant_id = $1::uuid AND item.project_id = $2::uuid
         AND (item.id::text = $3 OR item.legacy_task_id = $3) AND NOT item.archived
       LIMIT 2
    `, [board.tenantId, board.id, taskRef]);
    if (result.rows.length !== 1) trackingError('INVALID_PARENT', 'Primary placement is unavailable', 409);
    const row = result.rows[0]!;
    return {
      id: `${PRIMARY_PREFIX}${row.task_id}`,
      taskId: row.id,
      parentPlacementId: row.parent_task_id ? `${PRIMARY_PREFIX}${row.parent_task_id}` : null,
      order: row.sort_order,
      projectId: board.id,
    };
  }
  if (!UUID_RE.test(placementId)) trackingError('INVALID_PARENT', 'Reference placement is invalid', 400);
  const result = await port.query<{
    id: string; task_id: string; parent_placement_id: string | null; sort_order: number; target_project_id: string;
  }>(`
    SELECT id::text AS id, task_id::text AS task_id, parent_placement_id, sort_order,
           target_project_id::text AS target_project_id
      FROM projed_core.task_tracking_references
     WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid
       AND id = $3::uuid AND removed_at IS NULL
  `, [board.tenantId, board.id, placementId]);
  if (result.rows.length !== 1) trackingError('INVALID_PARENT', 'Reference placement is unavailable', 409);
  const row = result.rows[0]!;
  return {
    id: row.id,
    taskId: row.task_id,
    parentPlacementId: row.parent_placement_id,
    order: row.sort_order,
    projectId: row.target_project_id,
  };
}

async function assertNoCycle(
  port: ActorQueryPort,
  board: BoardIdentity,
  rootTaskId: string,
  targetParentId: string | null,
  movedIds: ReadonlySet<string>,
): Promise<void> {
  let placementId = targetParentId;
  const visited = new Set<string>();
  while (placementId) {
    if (movedIds.has(placementId) || visited.has(placementId)) {
      trackingError('CYCLE_DETECTED', 'Tracking reference cannot be placed inside its subtree', 409);
    }
    visited.add(placementId);
    if (visited.size > MAX_SUBTREE) trackingError('CYCLE_DETECTED', 'Tracking placement ancestry is invalid', 409);
    const placement = await resolvePlacement(port, board, placementId);
    if (!placement) break;
    if (placement.taskId === rootTaskId) {
      trackingError('CYCLE_DETECTED', 'Tracking reference cannot be placed below its canonical task', 409);
    }
    const canonicalAncestor = await port.query<{ found: boolean }>(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM projed_core.wbs_items
         WHERE tenant_id = $1::uuid AND id = $2::uuid
        UNION ALL
        SELECT parent.id, parent.parent_id
          FROM ancestors child
          JOIN projed_core.wbs_items parent
            ON parent.tenant_id = $1::uuid AND parent.id = child.parent_id
      )
      SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $3::uuid) AS found
    `, [board.tenantId, placement.taskId, rootTaskId]);
    if (canonicalAncestor.rows[0]?.found) {
      trackingError('CYCLE_DETECTED', 'Tracking reference cannot be placed below its canonical descendant', 409);
    }
    placementId = placement.parentPlacementId;
  }
}

async function targetOrder(
  port: ActorQueryPort,
  board: BoardIdentity,
  parentId: string | null,
  anchorId: string | null,
  position: Position,
  excludedReferenceIds: readonly string[],
): Promise<number> {
  const result = await port.query<{ placement_id: string; sort_order: number }>(`
    SELECT placement_id, sort_order FROM (
      SELECT 'primary:' || item.legacy_task_id AS placement_id, item.sort_order
        FROM projed_core.wbs_items item
        LEFT JOIN projed_core.wbs_items parent
          ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
       WHERE item.tenant_id = $1::uuid AND item.project_id = $2::uuid AND NOT item.archived
         AND CASE WHEN $3::text IS NULL THEN item.parent_id IS NULL
           ELSE $3::text = 'primary:' || parent.legacy_task_id END
      UNION ALL
      SELECT reference.id::text AS placement_id, reference.sort_order
        FROM projed_core.task_tracking_references reference
       WHERE reference.tenant_id = $1::uuid AND reference.target_project_id = $2::uuid
         AND reference.removed_at IS NULL
         AND reference.parent_placement_id IS NOT DISTINCT FROM $3::text
         AND NOT (reference.id = ANY($4::uuid[]))
    ) siblings
    ORDER BY sort_order, placement_id
  `, [board.tenantId, board.id, parentId, excludedReferenceIds]);
  const siblings = result.rows;
  if (position === 'append') return siblings.length ? siblings[siblings.length - 1]!.sort_order + 1 : 0;
  const anchorIndex = siblings.findIndex(item => item.placement_id === anchorId);
  if (anchorIndex < 0) trackingError('INVALID_PARENT', 'Tracking reference anchor is outside the target scope', 409);
  const anchorOrder = siblings[anchorIndex]!.sort_order;
  const neighbor = position === 'before' ? siblings[anchorIndex - 1] : siblings[anchorIndex + 1];
  const candidate = neighbor
    ? (neighbor.sort_order + anchorOrder) / 2
    : anchorOrder + (position === 'before' ? -1 : 1);
  if (!Number.isFinite(candidate) || candidate === anchorOrder || candidate === neighbor?.sort_order) {
    trackingError('REVISION_CONFLICT', 'Tracking reference sibling order has no remaining gap', 409);
  }
  return candidate;
}

async function assertNoDuplicate(
  port: ActorQueryPort,
  board: BoardIdentity,
  taskId: string,
  parentId: string | null,
  excludedIds: readonly string[] = [],
): Promise<void> {
  const duplicate = await port.query<{ found: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND target_project_id = $2::uuid AND task_id = $3::uuid
         AND parent_placement_id IS NOT DISTINCT FROM $4::text AND removed_at IS NULL
         AND NOT (id = ANY($5::uuid[]))
    ) AS found
  `, [board.tenantId, board.id, taskId, parentId, excludedIds]);
  if (duplicate.rows[0]?.found) trackingError('DUPLICATE_REFERENCE', 'A tracking reference already exists at the target', 409);
}

async function bumpBoardRevisions(port: ActorQueryPort, tenantId: string, projectIds: readonly string[]): Promise<void> {
  const ids = [...new Set(projectIds)];
  const updated = await port.query(`
    UPDATE projed_core.resource_revisions SET revision = revision + 1, updated_at = now()
     WHERE tenant_id = $1::uuid AND project_id = ANY($2::uuid[]) AND revision < 9223372036854775807
  `, [tenantId, ids]);
  if (updated.rowCount !== ids.length) trackingError('DB_BOUNDARY_INVALID', 'Board revision is unavailable', 503);
}

export class TaskTrackingRepository {
  async capability(): Promise<{ supported: true }> {
    return { supported: true };
  }

  async list(port: ActorQueryPort, workspaceRef: string): Promise<TrackingReference[]> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const result = await port.query<TrackingRow>(`${referenceSelect}
     WHERE reference.tenant_id = $1::uuid AND reference.removed_at IS NULL
     ORDER BY target_project.legacy_board_id, reference.sort_order, reference.id
    `, [workspace.id]);
    return result.rows.map(mapReference);
  }

  async listStaged(port: ActorQueryPort, workspaceRef: string): Promise<StagedReference[]> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const result = await port.query<{
      reference_id: string; task_id: string; workspace_id: string; source_board_id: string;
      original_board_id: string; original_parent_placement_id: string | null;
      original_sort_order: number; sort_order: number; revision: string;
      staged_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT staging.reference_root_id::text AS reference_id,
             task.legacy_task_id AS task_id, tenant.legacy_workspace_id AS workspace_id,
             source_project.legacy_board_id AS source_board_id,
             original_project.legacy_board_id AS original_board_id,
             staging.original_parent_placement_id, staging.original_sort_order,
             staging.sort_order, reference.revision::text,
             floor(extract(epoch FROM staging.staged_at) * 1000)::bigint::text AS staged_at_ms,
             floor(extract(epoch FROM staging.updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.task_tracking_reference_staging staging
        JOIN projed_core.task_tracking_references reference
          ON reference.tenant_id = staging.tenant_id AND reference.id = staging.reference_root_id
        JOIN projed_core.wbs_items task
          ON task.tenant_id = reference.tenant_id
         AND task.project_id = reference.task_project_id AND task.id = reference.task_id
        JOIN projed_core.tenants tenant ON tenant.id = staging.tenant_id
        JOIN projed_core.projects source_project
          ON source_project.tenant_id = reference.tenant_id AND source_project.id = reference.task_project_id
        JOIN projed_core.projects original_project
          ON original_project.tenant_id = staging.tenant_id AND original_project.id = staging.original_project_id
       WHERE staging.tenant_id = $1::uuid
       ORDER BY staging.sort_order, staging.reference_root_id
    `, [workspace.id]);
    return result.rows.map(row => ({
      referenceId: row.reference_id,
      taskId: row.task_id,
      workspaceId: row.workspace_id,
      sourceBoardId: row.source_board_id,
      originalBoardId: row.original_board_id,
      originalParentPlacementId: row.original_parent_placement_id,
      originalOrder: row.original_sort_order,
      order: row.sort_order,
      revision: Number(row.revision),
      stagedAt: milliseconds(row.staged_at_ms)!,
      updatedAt: milliseconds(row.updated_at_ms)!,
    }));
  }

  async listCanonicalTasks(port: ActorQueryPort, workspaceRef: string, unsafeTaskIds: unknown): Promise<unknown[]> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    if (!Array.isArray(unsafeTaskIds) || unsafeTaskIds.length > MAX_SUBTREE
        || unsafeTaskIds.some(id => typeof id !== 'string' || id.length < 1 || id.length > 512)) {
      trackingError('DOMAIN_DATA_INVALID', 'taskIds are invalid', 400);
    }
    const taskIds = [...new Set(unsafeTaskIds as string[])];
    if (taskIds.length === 0) return [];
    const result = await port.query<{
      storage_id: string; legacy_task_id: string; workspace_id: string; board_id: string;
      parent_legacy_id: string | null; title: string; detail_notes: unknown; description: string | null;
      status: string; assignee_ids: string[]; collaborator_ids: string[]; tag_ids: string[];
      start_date: string | null; end_date: string | null; duration_locked: boolean | null;
      node_type: string | null; kanban_stage_id: string | null; sort_order: number; archived: boolean;
      created_at_ms: string; updated_at_ms: string;
    }>(`
      WITH RECURSIVE selected(id) AS (
        SELECT item.id
          FROM projed_core.wbs_items item
         WHERE item.tenant_id = $1::uuid
           AND (item.id::text = ANY($2::text[]) OR item.legacy_task_id = ANY($2::text[]))
        UNION
        SELECT parent.id
          FROM selected child
          JOIN projed_core.wbs_items child_item
            ON child_item.tenant_id = $1::uuid AND child_item.id = child.id
          JOIN projed_core.wbs_items parent
            ON parent.tenant_id = child_item.tenant_id
           AND parent.project_id = child_item.project_id AND parent.id = child_item.parent_id
      )
      SELECT item.id::text AS storage_id, item.legacy_task_id,
             tenant.legacy_workspace_id AS workspace_id, project.legacy_board_id AS board_id,
             parent.legacy_task_id AS parent_legacy_id, item.title, item.detail_notes, item.description,
             item.status, item.assignee_ids::text[], item.collaborator_ids::text[],
             COALESCE(tags.legacy_tag_ids, ARRAY[]::text[]) AS tag_ids,
             to_char(item.start_date, 'YYYY-MM-DD') AS start_date,
             to_char(item.end_date, 'YYYY-MM-DD') AS end_date,
             item.duration_locked, item.node_type, item.kanban_stage_id, item.sort_order, item.archived,
             floor(extract(epoch FROM item.created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM item.updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM selected
        JOIN projed_core.wbs_items item ON item.tenant_id = $1::uuid AND item.id = selected.id
        JOIN projed_core.tenants tenant ON tenant.id = item.tenant_id
        JOIN projed_core.projects project ON project.tenant_id = item.tenant_id AND project.id = item.project_id
        LEFT JOIN projed_core.wbs_items parent
          ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
        LEFT JOIN LATERAL (
          SELECT array_agg(tag.legacy_tag_id ORDER BY tag.sort_order, tag.id) AS legacy_tag_ids
            FROM projed_core.wbs_item_tags assignment
            JOIN projed_core.task_tags tag ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
           WHERE assignment.tenant_id = item.tenant_id
             AND assignment.project_id = item.project_id AND assignment.item_id = item.id
        ) tags ON true
       ORDER BY item.sort_order, item.id
    `, [workspace.id, taskIds]);
    return result.rows.map(row => {
      if (!validTaskDetailNotes(row.detail_notes)) trackingError('DB_BOUNDARY_INVALID', 'Task notes are invalid', 503);
      return {
        id: row.legacy_task_id,
        storageId: row.storage_id,
        workspaceId: row.workspace_id,
        boardId: row.board_id,
        parentId: row.parent_legacy_id,
        title: row.title,
        detailNotes: row.detail_notes,
        ...(row.description === null ? {} : { description: row.description }),
        status: row.status,
        assigneeIds: row.assignee_ids,
        ...(row.assignee_ids[0] ? { assigneeId: row.assignee_ids[0] } : {}),
        collaboratorIds: row.collaborator_ids,
        tagIds: row.tag_ids,
        ...(row.start_date === null ? {} : { startDate: row.start_date }),
        ...(row.end_date === null ? {} : { endDate: row.end_date }),
        ...(row.duration_locked === null ? {} : { isDurationLocked: row.duration_locked }),
        ...(row.node_type === null ? {} : { nodeType: row.node_type }),
        ...(row.kanban_stage_id === null ? {} : { kanbanStageId: row.kanban_stage_id }),
        order: row.sort_order,
        createdAt: milliseconds(row.created_at_ms),
        updatedAt: milliseconds(row.updated_at_ms),
        isArchived: row.archived,
      };
    });
  }

  async create(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<TrackingReference> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const input = parseMutation(unsafeInput, 'create');
    if (!input.sourcePlacementId.startsWith(PRIMARY_PREFIX)) {
      trackingError('NOT_FOUND', 'A primary placement is required', 404);
    }
    const taskRef = input.sourcePlacementId.slice(PRIMARY_PREFIX.length);
    const source = await port.query<{
      id: string; project_id: string; board_id: string; parent_task_id: string | null;
      sort_order: number; kanban_stage_id: string | null;
    }>(`
      SELECT item.id::text AS id, item.project_id::text AS project_id,
             project.legacy_board_id AS board_id, parent.legacy_task_id AS parent_task_id,
             item.sort_order, item.kanban_stage_id
        FROM projed_core.wbs_items item
        JOIN projed_core.projects project
          ON project.tenant_id = item.tenant_id AND project.id = item.project_id
        LEFT JOIN projed_core.wbs_items parent
          ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
       WHERE item.tenant_id = $1::uuid AND (item.id::text = $2 OR item.legacy_task_id = $2)
         AND NOT item.archived
       LIMIT 2
    `, [workspace.id, taskRef]);
    if (source.rows.length !== 1) trackingError('NOT_FOUND', 'Canonical task was not found', 404);
    const row = source.rows[0]!;
    const board = await resolveBoard(port, workspaceRef, row.board_id);
    await assertCapability(port, board, 'manage_task_reference');
    const replay = await beginOperation(port, workspace.id, input, 'create');
    if (replay !== undefined) return replay as TrackingReference;
    const parentId = row.parent_task_id ? `${PRIMARY_PREFIX}${row.parent_task_id}` : null;
    await assertNoDuplicate(port, board, row.id, parentId);
    const order = await targetOrder(port, board, parentId, input.sourcePlacementId, 'after', []);
    const id = randomUUID();
    await port.query(`
      INSERT INTO projed_core.task_tracking_references(
        id, tenant_id, task_project_id, task_id, target_project_id,
        parent_placement_id, sort_order, kanban_stage_id, created_by
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $3::uuid,
        $5, $6, $7, projed_core.current_actor_user_id_v1()
      )
    `, [id, workspace.id, row.project_id, row.id, parentId, order, row.kanban_stage_id]);
    await bumpBoardRevisions(port, workspace.id, [row.project_id]);
    const created = await readReference(port, workspace.id, id, true);
    await completeOperation(port, workspace.id, input.operationId, created);
    return created;
  }

  async move(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<TrackingReference> {
    return this.moveOrPlace(port, workspaceRef, unsafeInput, false);
  }

  async placeStaged(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<TrackingReference> {
    return this.moveOrPlace(port, workspaceRef, unsafeInput, true);
  }

  private async moveOrPlace(
    port: ActorQueryPort,
    workspaceRef: string,
    unsafeInput: unknown,
    staged: boolean,
  ): Promise<TrackingReference> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const kind = staged ? 'place-staged' : 'move';
    const input = parseMutation(unsafeInput, kind);
    if (!UUID_RE.test(input.sourcePlacementId)) trackingError('NOT_FOUND', 'Tracking reference was not found', 404);
    const target = await resolveBoard(port, workspaceRef, input.targetBoardId!);
    await assertCapability(port, target, 'manage_task_reference');
    const existing = await readOperation(port, workspace.id, input, kind);
    if (existing !== undefined) {
      const replaySource = await readReference(port, workspace.id, input.sourcePlacementId);
      const replaySourceBoard = await resolveBoard(port, workspaceRef, replaySource.boardId);
      await assertCapability(port, replaySourceBoard, 'manage_task_reference');
      return existing as TrackingReference;
    }
    let expectedSubtree = input.expectedSubtreeIds;
    let source: TrackingReference;
    if (staged) {
      const stage = await port.query<{ subtree_ids: string[] }>(`
        SELECT subtree_ids::text[] AS subtree_ids
          FROM projed_core.task_tracking_reference_staging
         WHERE tenant_id = $1::uuid AND reference_root_id = $2::uuid
           AND owner_id = projed_core.current_actor_user_id_v1()
         FOR UPDATE
      `, [workspace.id, input.sourcePlacementId]);
      if (stage.rows.length !== 1) trackingError('NOT_FOUND', 'Staged tracking reference was not found', 404);
      expectedSubtree = stage.rows[0]!.subtree_ids;
      source = await readReference(port, workspace.id, input.sourcePlacementId, false);
    } else {
      source = await readReference(port, workspace.id, input.sourcePlacementId, true);
      const sourceBoard = await resolveBoard(port, workspaceRef, source.boardId);
      await assertCapability(port, sourceBoard, 'manage_task_reference');
    }
    const replay = await beginOperation(port, workspace.id, input, kind);
    if (replay !== undefined) return replay as TrackingReference;
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) {
      trackingError('REVISION_CONFLICT', 'Tracking reference revision changed', 409);
    }
    const actualSubtree = await subtreeIds(port, workspace.id, source.id, staged);
    assertSubtree(actualSubtree, expectedSubtree);
    const movedSet = new Set(actualSubtree);
    const parent = await resolvePlacement(port, target, input.targetParentPlacementId!);
    if (input.targetParentPlacementId !== null && !parent) trackingError('INVALID_PARENT', 'Target parent is unavailable', 409);
    await assertNoCycle(port, target, (await port.query<{ task_id: string }>(`
      SELECT task_id::text AS task_id FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [workspace.id, source.id])).rows[0]!.task_id, input.targetParentPlacementId!, movedSet);
    if (input.anchorPlacementId && movedSet.has(input.anchorPlacementId)) {
      trackingError('CYCLE_DETECTED', 'Tracking reference anchor is inside the moved subtree', 409);
    }
    const sourceDb = await port.query<{ task_id: string; target_project_id: string }>(`
      SELECT task_id::text AS task_id, target_project_id::text AS target_project_id
        FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [workspace.id, source.id]);
    const taskId = sourceDb.rows[0]!.task_id;
    const sourceProjectId = sourceDb.rows[0]!.target_project_id;
    await assertNoDuplicate(port, target, taskId, input.targetParentPlacementId!, actualSubtree);
    const order = await targetOrder(
      port,
      target,
      input.targetParentPlacementId!,
      input.anchorPlacementId!,
      input.position!,
      actualSubtree,
    );
    const updated = await port.query(`
      UPDATE projed_core.task_tracking_references
         SET target_project_id = $3::uuid,
             parent_placement_id = CASE WHEN id = $4::uuid THEN $5::text ELSE parent_placement_id END,
             sort_order = CASE WHEN id = $4::uuid THEN $6::double precision ELSE sort_order END,
             removed_at = NULL, removed_by = NULL, revision = revision + 1, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
         AND revision < 9223372036854775807
    `, [workspace.id, actualSubtree, target.id, source.id, input.targetParentPlacementId, order]);
    if (updated.rowCount !== actualSubtree.length) trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
    if (staged) {
      const deleted = await port.query(`
        DELETE FROM projed_core.task_tracking_reference_staging
         WHERE tenant_id = $1::uuid AND reference_root_id = $2::uuid
           AND owner_id = projed_core.current_actor_user_id_v1()
      `, [workspace.id, source.id]);
      if (deleted.rowCount !== 1) trackingError('REVISION_CONFLICT', 'Staged tracking reference changed', 409);
    }
    await bumpBoardRevisions(port, workspace.id, [sourceProjectId, target.id]);
    const moved = await readReference(port, workspace.id, source.id, true);
    await completeOperation(port, workspace.id, input.operationId, moved);
    return moved;
  }

  async stage(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<StagedReference> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const input = parseMutation(unsafeInput, 'stage');
    if (!UUID_RE.test(input.sourcePlacementId)) trackingError('NOT_FOUND', 'Tracking reference was not found', 404);
    const existing = await readOperation(port, workspace.id, input, 'stage');
    if (existing !== undefined) {
      const replaySource = await readReference(port, workspace.id, input.sourcePlacementId);
      const replayBoard = await resolveBoard(port, workspaceRef, replaySource.boardId);
      await assertCapability(port, replayBoard, 'manage_task_reference');
      return existing as StagedReference;
    }
    const source = await readReference(port, workspace.id, input.sourcePlacementId, true);
    const board = await resolveBoard(port, workspaceRef, source.boardId);
    await assertCapability(port, board, 'manage_task_reference');
    const replay = await beginOperation(port, workspace.id, input, 'stage');
    if (replay !== undefined) return replay as StagedReference;
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) {
      trackingError('REVISION_CONFLICT', 'Tracking reference revision changed', 409);
    }
    const actualSubtree = await subtreeIds(port, workspace.id, source.id, false);
    assertSubtree(actualSubtree, input.expectedSubtreeIds);
    const dbSource = await port.query<{ target_project_id: string; task_project_id: string }>(`
      SELECT target_project_id::text AS target_project_id, task_project_id::text AS task_project_id
        FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [workspace.id, source.id]);
    const order = await port.query<{ next_order: number }>(`
      SELECT COALESCE(max(sort_order) + 1, 0)::double precision AS next_order
        FROM projed_core.task_tracking_reference_staging
       WHERE tenant_id = $1::uuid AND owner_id = projed_core.current_actor_user_id_v1()
    `, [workspace.id]);
    const inserted = await port.query(`
      INSERT INTO projed_core.task_tracking_reference_staging(
        tenant_id, owner_id, reference_root_id, source_project_id, original_project_id,
        original_parent_placement_id, original_sort_order, subtree_ids, sort_order
      ) VALUES (
        $1::uuid, projed_core.current_actor_user_id_v1(), $2::uuid, $3::uuid, $4::uuid,
        $5, $6, $7::uuid[], $8
      ) ON CONFLICT DO NOTHING
    `, [workspace.id, source.id, dbSource.rows[0]!.task_project_id, dbSource.rows[0]!.target_project_id,
      source.parentPlacementId, source.order, actualSubtree, order.rows[0]!.next_order]);
    if (inserted.rowCount !== 1) trackingError('DUPLICATE_REFERENCE', 'Tracking reference is already staged', 409);
    const removed = await port.query(`
      UPDATE projed_core.task_tracking_references
         SET removed_at = now(), removed_by = projed_core.current_actor_user_id_v1(),
             revision = revision + 1, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
         AND removed_at IS NULL AND revision < 9223372036854775807
    `, [workspace.id, actualSubtree]);
    if (removed.rowCount !== actualSubtree.length) trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
    await bumpBoardRevisions(port, workspace.id, [board.id]);
    const stagedRows = await this.listStaged(port, workspaceRef);
    const stagedResult = stagedRows.find(item => item.referenceId === source.id);
    if (!stagedResult) trackingError('DB_BOUNDARY_INVALID', 'Staged tracking reference is unavailable', 503);
    await completeOperation(port, workspace.id, input.operationId, stagedResult);
    return stagedResult;
  }

  async remove(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<void> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const input = parseMutation(unsafeInput, 'remove');
    if (!UUID_RE.test(input.sourcePlacementId)) trackingError('NOT_FOUND', 'Tracking reference was not found', 404);
    const existing = await readOperation(port, workspace.id, input, 'remove');
    if (existing !== undefined) {
      const replaySource = await readReference(port, workspace.id, input.sourcePlacementId);
      const replayBoard = await resolveBoard(port, workspaceRef, replaySource.boardId);
      await assertCapability(port, replayBoard, 'manage_task_reference');
      return;
    }
    const source = await readReference(port, workspace.id, input.sourcePlacementId, true);
    const board = await resolveBoard(port, workspaceRef, source.boardId);
    await assertCapability(port, board, 'manage_task_reference');
    const replay = await beginOperation(port, workspace.id, input, 'remove');
    if (replay !== undefined) return;
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) {
      trackingError('REVISION_CONFLICT', 'Tracking reference revision changed', 409);
    }
    const actualSubtree = await subtreeIds(port, workspace.id, source.id, false);
    assertSubtree(actualSubtree, input.expectedSubtreeIds);
    const removed = await port.query(`
      UPDATE projed_core.task_tracking_references
         SET removed_at = now(), removed_by = projed_core.current_actor_user_id_v1(),
             revision = revision + 1, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
         AND removed_at IS NULL AND revision < 9223372036854775807
    `, [workspace.id, actualSubtree]);
    if (removed.rowCount !== actualSubtree.length) trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
    await bumpBoardRevisions(port, workspace.id, [board.id]);
    await completeOperation(port, workspace.id, input.operationId, { removed: true, referenceId: source.id });
  }

  async restore(port: ActorQueryPort, workspaceRef: string, unsafeInput: unknown): Promise<TrackingReference> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await port.authorizeTaskTrackingDerivedRead(workspace.id);
    const input = parseMutation(unsafeInput, 'restore');
    if (!UUID_RE.test(input.sourcePlacementId)) trackingError('NOT_FOUND', 'Tracking reference was not found', 404);
    const existing = await readOperation(port, workspace.id, input, 'restore');
    if (existing !== undefined) {
      const replaySource = await readReference(port, workspace.id, input.sourcePlacementId);
      const replayBoard = await resolveBoard(port, workspaceRef, replaySource.boardId);
      await assertCapability(port, replayBoard, 'manage_task_reference');
      return existing as TrackingReference;
    }
    const source = await readReference(port, workspace.id, input.sourcePlacementId, false);
    const staged = await port.query<{ found: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM projed_core.task_tracking_reference_staging
         WHERE tenant_id = $1::uuid AND $2::uuid = ANY(subtree_ids)
      ) AS found
    `, [workspace.id, source.id]);
    if (staged.rows[0]?.found) trackingError('REVISION_CONFLICT', 'Staged tracking references must be placed from the workbench', 409);
    const board = await resolveBoard(port, workspaceRef, source.boardId);
    await assertCapability(port, board, 'manage_task_reference');
    const replay = await beginOperation(port, workspace.id, input, 'restore');
    if (replay !== undefined) return replay as TrackingReference;
    if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) {
      trackingError('REVISION_CONFLICT', 'Tracking reference revision changed', 409);
    }
    const actualSubtree = await subtreeIds(port, workspace.id, source.id, true);
    const dbSource = await port.query<{ task_id: string }>(`
      SELECT task_id::text AS task_id FROM projed_core.task_tracking_references
       WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [workspace.id, source.id]);
    await assertNoDuplicate(port, board, dbSource.rows[0]!.task_id, source.parentPlacementId, actualSubtree);
    const restored = await port.query(`
      UPDATE projed_core.task_tracking_references
         SET removed_at = NULL, removed_by = NULL, revision = revision + 1, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
         AND removed_at IS NOT NULL AND revision < 9223372036854775807
    `, [workspace.id, actualSubtree]);
    if (restored.rowCount !== actualSubtree.length) trackingError('REVISION_CONFLICT', 'Tracking reference subtree changed', 409);
    await bumpBoardRevisions(port, workspace.id, [board.id]);
    const result = await readReference(port, workspace.id, source.id, true);
    await completeOperation(port, workspace.id, input.operationId, result);
    return result;
  }
}
