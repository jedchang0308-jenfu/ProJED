import { createHash, randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';

import { resolveBoard, resolveWorkspace } from './domainRead.js';
import { KernelError } from './errors.js';
import type { ActorQueryPort } from './actorTransaction.js';

export interface RagScope {
  tenantId: string;
  projectId: string | null;
}

export interface RagMatch {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  citation: {
    documentId: string;
    chunkId: string;
    sourceTable: string;
    sourceId: string;
    sourceType: string;
    title: string;
  };
}

export interface RagAccessLogInput {
  model: 'gemini-3.1-flash-lite' | 'gemini-3.5-flash';
  query: string;
  chunkIds: string[];
  answerLength: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMBEDDING_DIMENSIONS = 3072;
const MAX_LIVE_CONTEXT_BYTES = 64 * 1024;
const MAX_LIVE_BOARDS = 100;
const MAX_LIVE_TASKS = 250;
const MAX_LIVE_DEPENDENCIES = 200;
const MAX_LIVE_MEMBERS = 200;

interface AllowedRow extends QueryResultRow {
  allowed: boolean;
}

function accessDenied(): never {
  throw new KernelError('ACCESS_DENIED', 'Actor is not authorized to read this RAG scope', 403);
}

function invalidRagRequest(): never {
  throw new KernelError('DOMAIN_DATA_INVALID', 'RAG request is invalid', 400);
}

function boundaryInvalid(): never {
  throw new KernelError('DB_BOUNDARY_INVALID', 'RAG source data is invalid', 503);
}

function assertUuid(value: string): void {
  if (typeof value !== 'string' || !UUID_RE.test(value)) invalidRagRequest();
}

function validateScope(scope: RagScope): void {
  if (!scope || typeof scope !== 'object') invalidRagRequest();
  assertUuid(scope.tenantId);
  if (scope.projectId !== null) assertUuid(scope.projectId);
}

async function authorizeScope(port: ActorQueryPort, scope: RagScope): Promise<void> {
  validateScope(scope);
  const result = await port.query<AllowedRow>(`
    SELECT CASE
      WHEN $2::uuid IS NULL
        THEN projed_core.actor_has_workspace_capability_v1($1::uuid, 'read_workspace')
      ELSE projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'read_board')
    END AS allowed
  `, [scope.tenantId, scope.projectId]);
  if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) accessDenied();
}

export async function resolveRagScope(
  port: ActorQueryPort,
  workspaceRef: string,
  projectRef: string | null,
): Promise<RagScope> {
  if (projectRef === null) {
    const workspace = await resolveWorkspace(port, workspaceRef);
    const scope = { tenantId: workspace.id, projectId: null };
    await authorizeScope(port, scope);
    return scope;
  }

  const board = await resolveBoard(port, workspaceRef, projectRef);
  const scope = { tenantId: board.tenantId, projectId: board.id };
  await authorizeScope(port, scope);
  return scope;
}

/** Completeness describes only the actor's currently visible corpus. */
export async function hasIncompleteRagIndex(port: ActorQueryPort, scope: RagScope): Promise<boolean> {
  validateScope(scope);
  const result = await port.query<{ incomplete: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM projed_core.documents document
      LEFT JOIN LATERAL (
        SELECT version.id, version.content_hash FROM projed_core.document_versions version
        WHERE version.tenant_id=document.tenant_id AND version.document_id=document.id
        ORDER BY version.version DESC LIMIT 1
      ) latest ON true
      WHERE document.tenant_id=$1::uuid AND ($2::uuid IS NULL OR document.project_id=$2::uuid)
        AND document.rag_enabled AND (
          latest.id IS NULL OR latest.content_hash IS DISTINCT FROM document.content_hash
          OR NOT EXISTS (SELECT 1 FROM projed_core.document_chunks chunk
            WHERE chunk.tenant_id=document.tenant_id AND chunk.document_id=document.id
              AND chunk.document_version_id=latest.id)
          OR EXISTS (SELECT 1 FROM projed_core.document_chunks chunk
            WHERE chunk.tenant_id=document.tenant_id AND chunk.document_id=document.id
              AND chunk.document_version_id=latest.id AND NOT EXISTS (
                SELECT 1 FROM projed_core.document_embeddings embedding
                WHERE embedding.tenant_id=chunk.tenant_id AND embedding.chunk_id=chunk.id
                  AND embedding.provider='google' AND embedding.model='gemini-embedding-001'
                  AND embedding.dimensions=3072 AND embedding.content_hash=document.content_hash))
        )
    ) AS incomplete
  `, [scope.tenantId, scope.projectId]);
  if (result.rows.length !== 1 || typeof result.rows[0]?.incomplete !== 'boolean') boundaryInvalid();
  return result.rows[0]!.incomplete;
}

interface RagReadRow extends QueryResultRow {
  scope_authorized: boolean;
  chunk_id: string | null;
  document_id: string | null;
  title: string | null;
  content: string | null;
  similarity: number | null;
  source_table: string | null;
  source_id: string | null;
  source_type: string | null;
}

function validateQueryVector(vector: number[]): number[] {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) invalidRagRequest();
  if (vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) invalidRagRequest();
  const rounded = vector.map(value => Math.fround(value));
  if (rounded.some(value => !Number.isFinite(value))) invalidRagRequest();
  return rounded;
}

export async function readRagKnowledge(
  port: ActorQueryPort,
  scope: RagScope,
  vector: number[],
  threshold: number,
  count: number,
): Promise<RagMatch[]> {
  validateScope(scope);
  const queryVector = validateQueryVector(vector);
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1
      || !Number.isSafeInteger(count) || count < 1 || count > 50) {
    invalidRagRequest();
  }

  const result = await port.query<RagReadRow>(`
    WITH authorized_scope AS MATERIALIZED (
      SELECT tenant.id AS tenant_id, $2::uuid AS project_id
        FROM projed_core.tenants tenant
       WHERE tenant.id = $1::uuid
         AND CASE WHEN $2::uuid IS NULL
           THEN projed_core.actor_has_workspace_capability_v1(tenant.id, 'read_workspace')
           ELSE EXISTS (
             SELECT 1 FROM projed_core.projects project
              WHERE project.tenant_id = tenant.id AND project.id = $2::uuid
           ) AND projed_core.actor_has_board_capability_v1(tenant.id, $2::uuid, 'read_board')
         END
    ),
    scope_status AS MATERIALIZED (
      SELECT EXISTS (SELECT 1 FROM authorized_scope) AS scope_authorized
    ),
    authorized_documents AS MATERIALIZED (
      SELECT document.id, document.tenant_id, document.project_id, document.title,
             document.source_table, document.source_id, document.source_type, document.content_hash
        FROM projed_core.documents document
        JOIN authorized_scope scope ON scope.tenant_id = document.tenant_id
         AND (scope.project_id IS NULL OR scope.project_id = document.project_id)
       WHERE document.rag_enabled
         AND document.source_table IS NOT NULL
         AND document.source_id IS NOT NULL
    ),
    latest_versions AS MATERIALIZED (
      SELECT version.tenant_id, version.document_id, version.id, version.version, version.content_hash
        FROM projed_core.document_versions version
        JOIN (
          SELECT candidate.document_id, max(candidate.version) AS max_version
            FROM projed_core.document_versions candidate
            JOIN authorized_documents document
              ON document.tenant_id = candidate.tenant_id AND document.id = candidate.document_id
           GROUP BY candidate.document_id
        ) latest ON latest.document_id = version.document_id AND latest.max_version = version.version
    ),
    eligible_chunks AS MATERIALIZED (
      SELECT document.id AS document_id, document.tenant_id, document.project_id,
             document.title, document.source_table, document.source_id, document.source_type,
             chunk.id AS chunk_id, chunk.content, embedding.embedding
        FROM authorized_documents document
        JOIN latest_versions version
          ON version.tenant_id = document.tenant_id AND version.document_id = document.id
         AND version.content_hash = document.content_hash
        JOIN projed_core.document_chunks chunk
          ON chunk.tenant_id = document.tenant_id AND chunk.document_id = document.id
         AND chunk.document_version_id = version.id
        JOIN projed_core.document_embeddings embedding
          ON embedding.tenant_id = chunk.tenant_id AND embedding.chunk_id = chunk.id
         AND embedding.provider = 'google'
         AND embedding.model = 'gemini-embedding-001'
         AND embedding.dimensions = 3072
         AND embedding.content_hash = document.content_hash
    ),
    query_vector AS MATERIALIZED (
      SELECT $3::real[] AS vector
    ),
    scored_chunks AS MATERIALIZED (
      SELECT chunk.*,
             cosine.similarity
        FROM eligible_chunks chunk
        CROSS JOIN query_vector query
        CROSS JOIN LATERAL (
          SELECT LEAST(1::double precision, GREATEST(-1::double precision,
                 SUM(query_component.value::double precision * source_component.value::double precision)
                   / NULLIF(
                       SQRT(SUM(query_component.value::double precision * query_component.value::double precision))
                       * SQRT(SUM(source_component.value::double precision * source_component.value::double precision)),
                       0
                     ))) AS similarity
            FROM unnest(query.vector) WITH ORDINALITY AS query_component(value, component_index)
            JOIN unnest(chunk.embedding) WITH ORDINALITY AS source_component(value, component_index)
              ON source_component.component_index = query_component.component_index
        ) cosine
    )
    SELECT status.scope_authorized,
           ranked_result.chunk_id::text AS chunk_id,
           ranked_result.document_id::text AS document_id,
           ranked_result.title, ranked_result.content, ranked_result.similarity,
           ranked_result.source_table, ranked_result.source_id::text AS source_id, ranked_result.source_type
      FROM scope_status status
      LEFT JOIN LATERAL (
        SELECT scored.chunk_id, scored.document_id, scored.title, scored.content, scored.similarity,
               scored.source_table, scored.source_id, scored.source_type
          FROM scored_chunks scored
         WHERE scored.similarity IS NOT NULL AND scored.similarity >= $4::double precision
         ORDER BY scored.similarity DESC, scored.document_id, scored.chunk_id
         LIMIT $5::integer
      ) ranked_result ON true
     ORDER BY ranked_result.similarity DESC NULLS LAST, ranked_result.document_id, ranked_result.chunk_id
  `, [scope.tenantId, scope.projectId, queryVector, threshold, count]);

  if (result.rows.length === 0 || result.rows[0]?.scope_authorized !== true) accessDenied();
  return result.rows.flatMap((row: RagReadRow) => {
    if (row.chunk_id === null) return [];
    if (row.document_id === null || row.title === null || row.content === null
        || row.source_table === null || row.source_id === null || row.source_type === null
        || typeof row.similarity !== 'number' || !Number.isFinite(row.similarity)) {
      boundaryInvalid();
    }
    return [{
      chunkId: row.chunk_id,
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      similarity: row.similarity,
      citation: {
        documentId: row.document_id,
        chunkId: row.chunk_id,
        sourceTable: row.source_table,
        sourceId: row.source_id,
        sourceType: row.source_type,
        title: row.title,
      },
    }];
  });
}

interface LiveSnapshotRow extends QueryResultRow {
  scope_authorized: boolean;
  workspace_id: string | null;
  workspace_title: string | null;
  project_id: string | null;
  boards: unknown;
  tasks: unknown;
  dependencies: unknown;
  members: unknown;
  boards_truncated: boolean;
  tasks_truncated: boolean;
  dependencies_truncated: boolean;
  members_truncated: boolean;
}

function jsonRows(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    boundaryInvalid();
  }
  void label;
  return value;
}

export async function readLiveRagSnapshot(port: ActorQueryPort, scope: RagScope): Promise<string> {
  validateScope(scope);
  const result = await port.query<LiveSnapshotRow>(`
    WITH authorized_scope AS MATERIALIZED (
      SELECT tenant.id, tenant.legacy_workspace_id, tenant.title,
             (SELECT project.legacy_board_id
                FROM projed_core.projects project
               WHERE $2::uuid IS NOT NULL AND project.tenant_id = tenant.id AND project.id = $2::uuid
               LIMIT 1) AS requested_project_id
        FROM projed_core.tenants tenant
       WHERE tenant.id = $1::uuid
         AND CASE WHEN $2::uuid IS NULL
           THEN projed_core.actor_has_workspace_capability_v1(tenant.id, 'read_workspace')
           ELSE EXISTS (
             SELECT 1 FROM projed_core.projects project
              WHERE project.tenant_id = tenant.id AND project.id = $2::uuid
           ) AND projed_core.actor_has_board_capability_v1(tenant.id, $2::uuid, 'read_board')
         END
    ),
    scope_status AS MATERIALIZED (
      SELECT EXISTS (SELECT 1 FROM authorized_scope) AS scope_authorized
    ),
    board_candidates AS MATERIALIZED (
      SELECT project.id, project.legacy_board_id, project.title, project.sort_order, project.created_at
        FROM projed_core.projects project
        JOIN authorized_scope scope ON scope.id = project.tenant_id
       WHERE $2::uuid IS NULL OR project.id = $2::uuid
       ORDER BY project.sort_order NULLS LAST, project.created_at, project.id
       LIMIT 101
    ),
    visible_boards AS MATERIALIZED (
      SELECT * FROM board_candidates
       ORDER BY sort_order NULLS LAST, created_at, id
       LIMIT 100
    ),
    task_candidates AS MATERIALIZED (
      SELECT item.id, board.legacy_board_id, board.sort_order AS board_sort_order, board.created_at AS board_created_at,
             item.legacy_task_id, item.title, item.status, item.start_date, item.end_date,
             item.assignee_ids[1:20]::text[] AS assignee_ids,
             cardinality(item.assignee_ids) > 20 AS assignees_truncated,
             item.sort_order, item.created_at
        FROM projed_core.wbs_items item
        JOIN visible_boards board ON board.id = item.project_id
       WHERE item.tenant_id = $1::uuid AND NOT item.archived
       ORDER BY board.sort_order NULLS LAST, board.created_at, board.id,
                item.sort_order, item.created_at, item.id
       LIMIT 251
    ),
    dependency_candidates AS MATERIALIZED (
      SELECT dependency.id, board.legacy_board_id, board.sort_order AS board_sort_order,
             dependency.legacy_dependency_id, dependency.from_side, dependency.to_side,
             dependency.offset_value, from_item.legacy_task_id AS from_task_id,
             to_item.legacy_task_id AS to_task_id,
             dependency.created_at, board.created_at AS board_created_at
        FROM projed_core.wbs_dependencies dependency
        JOIN visible_boards board ON board.id = dependency.project_id
        JOIN projed_core.wbs_items from_item
          ON from_item.tenant_id = dependency.tenant_id AND from_item.project_id = dependency.project_id
         AND from_item.id = dependency.from_id AND NOT from_item.archived
        JOIN projed_core.wbs_items to_item
          ON to_item.tenant_id = dependency.tenant_id AND to_item.project_id = dependency.project_id
         AND to_item.id = dependency.to_id AND NOT to_item.archived
       WHERE dependency.tenant_id = $1::uuid
       ORDER BY board.sort_order NULLS LAST, board.created_at, board.id, dependency.created_at, dependency.id
       LIMIT 201
    ),
    member_candidates AS MATERIALIZED (
      SELECT member.project_id, board.legacy_board_id, board.sort_order AS board_sort_order,
             member.user_id, member.role, left(member.member_display_name, 100) AS display_name,
             member.created_at, board.created_at AS board_created_at
        FROM projed_core.project_members member
        JOIN visible_boards board ON board.id = member.project_id
       WHERE member.tenant_id = $1::uuid
       ORDER BY board.sort_order NULLS LAST, board.created_at, board.id, member.created_at, member.user_id
       LIMIT 201
    )
    SELECT status.scope_authorized,
           scope.legacy_workspace_id AS workspace_id,
           left(scope.title, 256) AS workspace_title,
           scope.requested_project_id AS project_id,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'projectId', board.legacy_board_id,
               'title', left(board.title, 256),
               'titleTruncated', length(board.title) > 256
             ) ORDER BY board.sort_order NULLS LAST, board.created_at, board.id)
               FROM visible_boards board
           ), '[]'::jsonb) AS boards,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'projectId', task.legacy_board_id,
               'taskId', task.legacy_task_id,
               'title', left(task.title, 256),
               'titleTruncated', length(task.title) > 256,
               'status', task.status,
               'startDate', task.start_date,
               'endDate', task.end_date,
               'assigneeIds', COALESCE(task.assignee_ids, ARRAY[]::text[]),
               'assigneesTruncated', task.assignees_truncated
             ) ORDER BY task.board_sort_order NULLS LAST, task.board_created_at, task.legacy_board_id,
                      task.sort_order, task.created_at, task.id)
               FROM (SELECT * FROM task_candidates ORDER BY board_sort_order NULLS LAST, board_created_at,
                     legacy_board_id, sort_order, created_at, id LIMIT 250) task
           ), '[]'::jsonb) AS tasks,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'projectId', dependency.legacy_board_id,
               'dependencyId', dependency.legacy_dependency_id,
               'fromTaskId', dependency.from_task_id,
               'fromSide', dependency.from_side,
               'toTaskId', dependency.to_task_id,
               'toSide', dependency.to_side,
               'offset', dependency.offset_value
             ) ORDER BY dependency.board_sort_order NULLS LAST, dependency.board_created_at,
                      dependency.legacy_board_id, dependency.created_at, dependency.id)
               FROM (SELECT * FROM dependency_candidates ORDER BY board_sort_order NULLS LAST,
                     board_created_at, legacy_board_id, created_at, id LIMIT 200) dependency
           ), '[]'::jsonb) AS dependencies,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'projectId', member.legacy_board_id,
               'userId', member.user_id,
               'role', member.role,
               'displayName', member.display_name
             ) ORDER BY member.board_sort_order NULLS LAST, member.board_created_at,
                      member.legacy_board_id, member.created_at, member.user_id)
               FROM (SELECT * FROM member_candidates ORDER BY board_sort_order NULLS LAST,
                     board_created_at, legacy_board_id, created_at, user_id LIMIT 200) member
           ), '[]'::jsonb) AS members,
           (SELECT count(*) > 100 FROM board_candidates) AS boards_truncated,
           (SELECT count(*) > 250 FROM task_candidates) AS tasks_truncated,
           (SELECT count(*) > 200 FROM dependency_candidates) AS dependencies_truncated,
           (SELECT count(*) > 200 FROM member_candidates) AS members_truncated
      FROM scope_status status
      LEFT JOIN authorized_scope scope ON true
  `, [scope.tenantId, scope.projectId]);

  const row = result.rows[0];
  if (!row || row.scope_authorized !== true || !row.workspace_id || !row.workspace_title
      || (scope.projectId !== null && !row.project_id)) accessDenied();
  if (typeof row.boards_truncated !== 'boolean' || typeof row.tasks_truncated !== 'boolean'
      || typeof row.dependencies_truncated !== 'boolean' || typeof row.members_truncated !== 'boolean') {
    boundaryInvalid();
  }

  const boards = jsonRows(row.boards, 'boards');
  const tasks = jsonRows(row.tasks, 'tasks');
  const dependencies = jsonRows(row.dependencies, 'dependencies');
  const members = jsonRows(row.members, 'members');
  const payload: Record<string, unknown> = {
    scope: {
      workspaceId: row.workspace_id,
      workspaceTitle: row.workspace_title,
      projectId: row.project_id,
      requestedRange: scope.projectId === null ? 'workspace-visible-boards' : 'one-board',
      authorization: 'current-actor-rag-and-source-row-policy',
      taskFilter: 'archived=false',
      dependencyFilter: 'both-endpoints-archived=false',
      limits: {
        boards: MAX_LIVE_BOARDS,
        tasks: MAX_LIVE_TASKS,
        dependencies: MAX_LIVE_DEPENDENCIES,
        members: MAX_LIVE_MEMBERS,
      },
    },
    boards,
    tasks,
    dependencies,
    members,
    truncated: {
      boards: row.boards_truncated,
      tasks: row.tasks_truncated,
      dependencies: row.dependencies_truncated,
      members: row.members_truncated,
      byteBudget: false,
    },
  };

  const arrays = [
    { name: 'tasks', items: tasks },
    { name: 'dependencies', items: dependencies },
    { name: 'members', items: members },
    { name: 'boards', items: boards },
  ];
  const truncation = payload.truncated as Record<string, unknown>;
  let serialized = JSON.stringify(payload);
  while (Buffer.byteLength(serialized, 'utf8') > MAX_LIVE_CONTEXT_BYTES) {
    const array = arrays.find(candidate => candidate.items.length > 0);
    if (!array) boundaryInvalid();
    array.items.pop();
    truncation[array.name] = true;
    truncation.byteBudget = true;
    serialized = JSON.stringify(payload);
  }
  return serialized;
}

export async function writeRagAccessLog(
  port: ActorQueryPort,
  scope: RagScope,
  input: RagAccessLogInput,
): Promise<void> {
  validateScope(scope);
  if ((input.model !== 'gemini-3.1-flash-lite' && input.model !== 'gemini-3.5-flash')
      || typeof input.query !== 'string' || input.query.trim().length === 0 || input.query.length > 4000
      || !Array.isArray(input.chunkIds) || input.chunkIds.length > 50
      || input.chunkIds.some(id => typeof id !== 'string' || !UUID_RE.test(id))
      || !Number.isSafeInteger(input.answerLength) || input.answerLength < 0 || input.answerLength > 256 * 1024) {
    invalidRagRequest();
  }

  const result = await port.query<{ id: string }>(`
    WITH authorized_scope AS MATERIALIZED (
      SELECT tenant.id AS tenant_id, $2::uuid AS project_id
        FROM projed_core.tenants tenant
       WHERE tenant.id = $1::uuid
         AND CASE WHEN $2::uuid IS NULL
           THEN projed_core.actor_has_workspace_capability_v1(tenant.id, 'read_workspace')
           ELSE projed_core.actor_has_board_capability_v1(tenant.id, $2::uuid, 'read_board')
         END
    )
    INSERT INTO projed_core.llm_access_logs (
      id, tenant_id, project_id, actor_id, provider, model, prompt_hash,
      retrieved_chunk_ids, response_metadata
    )
    SELECT $3::uuid, scope.tenant_id, scope.project_id,
           projed_core.current_actor_user_id_v1(), 'google', $4::text, $5::text,
           $6::uuid[], jsonb_build_object('answerLength', $7::integer)
      FROM authorized_scope scope
    RETURNING id::text AS id
  `, [
    scope.tenantId,
    scope.projectId,
    randomUUID(),
    input.model,
    createHash('sha256').update(input.query, 'utf8').digest('hex'),
    input.chunkIds,
    input.answerLength,
  ]);
  if (result.rowCount !== 1) accessDenied();
}
