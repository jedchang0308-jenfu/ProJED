import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import pg, { type Client } from 'pg';

import {
  loadSourceProfile,
  sha256,
  validateRuntimeBinding,
  validateRuntimeDatabaseUrl,
  type RuntimeBinding,
  type SourceProfile,
} from '../server/config.js';
import {
  validateSupabaseSourceBinding,
  validateSupabaseSourceUrl,
  type SupabaseSourceBindingV1,
} from './dev139-supabase-source-contract.js';

type Mode = 'plan' | 'apply' | 'reconcile';
type Row = Record<string, unknown>;

type TableSpec = {
  target: string;
  sourceRelation: string;
  columns: readonly string[];
  sourceSql: string;
  transform?: (row: Row) => Row;
};

const { Client: PgClient } = pg;
const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
// Preserve PostgreSQL JSON separately from SQL NULL. The default pg parser
// collapses JSON literal null and SQL NULL to the same JS value, and its
// parameter encoder otherwise treats JSON strings as unquoted SQL text.
// Keep the database's jsonb text, including arbitrary-precision numbers; do
// not round-trip it through JSON.parse/JS number during copy or reconciliation.
class SnapshotJson {
  constructor(readonly text: string) {}
}
const snapshotTypes = {
  getTypeParser: ((oid: number, format = 'text') => {
    if ((oid === 114 || oid === 3802) && format === 'text') {
      return (raw: string) => new SnapshotJson(raw);
    }
    // pg's Date parser truncates PostgreSQL microseconds to milliseconds.
    // Both transactions use UTC/ISO output, so native date/timestamp text is
    // stable for reconciliation and preserves precision when inserted again.
    if ((oid === 1082 || oid === 1114 || oid === 1184) && format === 'text') {
      return (raw: string) => raw;
    }
    return format === 'binary'
      ? pg.types.getTypeParser(oid, 'binary')
      : pg.types.getTypeParser(oid, 'text');
  }) as typeof pg.types.getTypeParser,
};

const table = (
  target: string,
  sourceRelation: string,
  columns: readonly string[],
  sourceSql: string,
  transform?: (row: Row) => Row,
): TableSpec => ({ target, sourceRelation, columns, sourceSql, ...(transform ? { transform } : {}) });

const TABLES: readonly TableSpec[] = [
  table('profiles', 'public.profiles', [
    'id', 'email', 'display_name', 'external_auth_provider', 'external_auth_id', 'ui_preferences', 'created_at', 'updated_at',
  ], `
    SELECT id, email, display_name, external_auth_provider, external_auth_id,
           COALESCE(ui_preferences, '{}'::jsonb) AS ui_preferences, created_at, updated_at
      FROM public.profiles ORDER BY id
  `),
  table('tenants', 'public.tenants', ['id', 'legacy_workspace_id', 'title', 'owner_id', 'sort_order', 'created_at', 'updated_at'], `
    SELECT id, COALESCE(NULLIF(legacy_workspace_id, ''), id::text) AS legacy_workspace_id,
           name AS title, owner_id, NULL::float8 AS sort_order, created_at, updated_at
      FROM public.tenants ORDER BY id
  `),
  table('projects', 'public.projects', ['id', 'tenant_id', 'legacy_board_id', 'title', 'sort_order', 'created_by', 'created_at', 'updated_at'], `
    SELECT id, tenant_id, COALESCE(NULLIF(legacy_board_id, ''), id::text) AS legacy_board_id,
           name AS title, sort_order::float8 AS sort_order, created_by, created_at, updated_at
      FROM public.projects ORDER BY tenant_id, id
  `),
  table('tenant_members', 'public.tenant_members', [
    'tenant_id', 'user_id', 'role', 'status', 'member_email', 'member_display_name', 'created_at', 'updated_at',
  ], `
    SELECT member.tenant_id, member.user_id, member.role::text, member.status::text,
           profile.email AS member_email, profile.display_name AS member_display_name,
           member.created_at, member.updated_at
      FROM public.tenant_members member
      JOIN public.profiles profile ON profile.id = member.user_id
     ORDER BY member.tenant_id, member.user_id
  `),
  table('project_members', 'public.project_members', [
    'tenant_id', 'project_id', 'user_id', 'role', 'member_email', 'member_display_name', 'created_at', 'updated_at',
  ], `
    SELECT member.tenant_id, member.project_id, member.user_id, member.role::text,
           profile.email AS member_email, profile.display_name AS member_display_name,
           member.created_at, member.updated_at
      FROM public.project_members member
      JOIN public.profiles profile ON profile.id = member.user_id
     ORDER BY member.project_id, member.user_id
  `),
  table('board_role_permissions', 'public.board_role_permissions', ['tenant_id', 'project_id', 'role', 'capabilities', 'updated_at'], `
    SELECT tenant_id, project_id, role::text, capabilities::text[], updated_at
      FROM public.board_role_permissions ORDER BY project_id, role
  `),
  table('actor_scope_access', 'public.tenant_members', ['local_user_id', 'tenant_id', 'project_id', 'active', 'scope_revision', 'updated_at'], `
    SELECT member.user_id AS local_user_id, member.tenant_id, NULL::uuid AS project_id,
           member.status::text = 'active' AS active, 1::bigint AS scope_revision, member.updated_at
      FROM public.tenant_members member
    UNION ALL
    SELECT member.user_id, member.tenant_id, member.project_id,
           tenant_member.status::text = 'active' AS active, 1::bigint, member.updated_at
      FROM public.project_members member
      JOIN public.tenant_members tenant_member
        ON tenant_member.tenant_id = member.tenant_id AND tenant_member.user_id = member.user_id
     ORDER BY tenant_id, local_user_id, project_id NULLS FIRST
  `),
  table('resource_revisions', 'public.tenants', ['tenant_id', 'project_id', 'revision', 'updated_at'], `
    SELECT tenant.id AS tenant_id, NULL::uuid AS project_id, 1::bigint AS revision, tenant.updated_at
      FROM public.tenants tenant
    UNION ALL
    SELECT project.tenant_id, project.id, 1::bigint, project.updated_at
      FROM public.projects project
     ORDER BY tenant_id, project_id NULLS FIRST
  `),
  table('task_tags', 'public.task_tags', ['id', 'tenant_id', 'legacy_tag_id', 'name', 'color', 'sort_order', 'created_at', 'updated_at'], `
    SELECT id, tenant_id, COALESCE(NULLIF(legacy_tag_id, ''), id::text) AS legacy_tag_id,
           name, color, sort_order::float8 AS sort_order, created_at, updated_at
      FROM public.task_tags ORDER BY tenant_id, id
  `),
  table('wbs_items', 'public.wbs_items', [
    'id', 'tenant_id', 'project_id', 'legacy_task_id', 'parent_id', 'title', 'detail_notes', 'description',
    'status', 'assignee_ids', 'collaborator_ids', 'tag_ids', 'start_date', 'end_date', 'duration_locked',
    'node_type', 'kanban_stage_id', 'sort_order', 'archived', 'created_at', 'updated_at',
  ], `
    SELECT item.id, item.tenant_id, item.project_id,
           COALESCE(NULLIF(item.legacy_node_id, ''), item.id::text) AS legacy_task_id,
           item.parent_id, item.title, COALESCE(item.detail_notes, '[]'::jsonb) AS detail_notes,
           item.description, item.status::text,
           ARRAY(SELECT DISTINCT value FROM unnest(
             COALESCE(item.assignee_ids, '{}'::uuid[]) ||
             CASE WHEN item.assignee_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[item.assignee_id] END
           ) value ORDER BY value)::uuid[] AS assignee_ids,
           COALESCE(item.collaborator_ids, '{}'::uuid[])::uuid[] AS collaborator_ids,
           COALESCE((
             SELECT array_agg(assignment.tag_id ORDER BY assignment.tag_id)
               FROM public.wbs_item_tags assignment WHERE assignment.item_id = item.id
           ), '{}'::uuid[]) AS tag_ids,
           item.start_date, item.end_date, item.is_duration_locked AS duration_locked,
           item.item_type::text AS node_type, item.kanban_stage_id,
           item.sort_order::float8 AS sort_order, item.is_archived AS archived,
           item.created_at, item.updated_at
      FROM public.wbs_items item
     ORDER BY item.depth, item.path, item.id
  `),
  table('wbs_item_tags', 'public.wbs_item_tags', ['tenant_id', 'project_id', 'item_id', 'tag_id'], `
    SELECT tenant_id, project_id, item_id, tag_id
      FROM public.wbs_item_tags ORDER BY project_id, item_id, tag_id
  `),
  table('wbs_dependencies', 'public.wbs_dependencies', [
    'id', 'tenant_id', 'project_id', 'legacy_dependency_id', 'from_id', 'from_side', 'to_id', 'to_side', 'offset_value',
  ], `
    SELECT id, tenant_id, project_id,
           COALESCE(NULLIF(legacy_dependency_id, ''), id::text) AS legacy_dependency_id,
           from_item_id AS from_id, from_side::text, to_item_id AS to_id, to_side::text,
           offset_days::float8 AS offset_value
      FROM public.wbs_dependencies ORDER BY project_id, id
  `),
  table('board_invites', 'public.board_invites', [
    'id', 'tenant_id', 'project_id', 'legacy_workspace_id', 'legacy_board_id', 'email', 'invited_by',
    'status', 'default_role', 'token_hash', 'expires_at', 'accepted_at', 'revoked_at', 'created_at', 'updated_at',
  ], `
    SELECT invite.id, invite.tenant_id, invite.project_id,
           COALESCE(NULLIF(tenant.legacy_workspace_id, ''), tenant.id::text) AS legacy_workspace_id,
           COALESCE(NULLIF(project.legacy_board_id, ''), project.id::text) AS legacy_board_id,
           lower(btrim(invite.email)) AS email, invite.invited_by,
           invite.status::text, invite.default_role::text, invite.token_hash,
           invite.expires_at, invite.accepted_at, invite.revoked_at, invite.created_at, invite.updated_at
      FROM public.board_invites invite
      JOIN public.tenants tenant ON tenant.id = invite.tenant_id
      JOIN public.projects project ON project.id = invite.project_id AND project.tenant_id = invite.tenant_id
     ORDER BY invite.id
  `),
  table('documents', 'public.documents', [
    'id', 'tenant_id', 'project_id', 'source_type', 'source_table', 'source_id', 'title',
    'content_hash', 'visibility', 'rag_enabled', 'metadata', 'created_by', 'updated_by', 'created_at', 'updated_at',
  ], `
    SELECT id, tenant_id, project_id, source_type::text, source_table, source_id, title,
           content_hash, visibility::text, rag_enabled, metadata, created_by, updated_by, created_at, updated_at
      FROM public.documents ORDER BY tenant_id, id
  `),
  table('document_versions', 'public.document_versions', [
    'id', 'tenant_id', 'document_id', 'version', 'content', 'content_hash', 'metadata', 'created_at',
  ], `
    SELECT id, tenant_id, document_id, version, content, content_hash, metadata, created_at
      FROM public.document_versions ORDER BY document_id, version, id
  `),
  table('document_chunks', 'public.document_chunks', [
    'id', 'tenant_id', 'document_id', 'document_version_id', 'chunk_index', 'content', 'token_count', 'metadata', 'created_at',
  ], `
    SELECT id, tenant_id, document_id, document_version_id, chunk_index, content, token_count, metadata, created_at
      FROM public.document_chunks ORDER BY document_id, document_version_id, chunk_index, id
  `),
  table('document_embeddings', 'public.document_embeddings', [
    'id', 'tenant_id', 'chunk_id', 'provider', 'model', 'dimensions', 'embedding', 'content_hash', 'created_at',
  ], `
    SELECT id, tenant_id, chunk_id, provider, model, dimensions,
           embedding::real[] AS embedding, content_hash, created_at
      FROM public.document_embeddings ORDER BY chunk_id, provider, model, dimensions, id
  `),
  table('rag_sync_jobs', 'public.rag_sync_jobs', [
    'id', 'tenant_id', 'provider', 'target_store_id', 'source_document_id', 'status',
    'last_synced_at', 'error', 'metadata', 'created_at', 'updated_at',
  ], `
    SELECT id, tenant_id, provider, target_store_id, source_document_id, status::text,
           last_synced_at, error, metadata, created_at, updated_at
      FROM public.rag_sync_jobs ORDER BY tenant_id, id
  `),
  table('external_rag_objects', 'public.external_rag_objects', [
    'id', 'tenant_id', 'provider', 'document_id', 'external_object_id', 'metadata', 'created_at', 'updated_at',
  ], `
    SELECT id, tenant_id, provider, document_id, external_object_id, metadata, created_at, updated_at
      FROM public.external_rag_objects ORDER BY tenant_id, id
  `),
  table('knowledge_records', 'public.knowledge_records', [
    'id', 'tenant_id', 'project_id', 'legacy_record_id', 'record_type', 'title', 'content', 'participants_text',
    'occurred_at', 'started_at', 'ended_at', 'recorded_by', 'status', 'visibility', 'rag_enabled',
    'source_document_id', 'metadata', 'created_by', 'updated_by', 'created_at', 'updated_at',
  ], `
    SELECT id, tenant_id, project_id, legacy_record_id, record_type::text, title, content,
           participants_text, occurred_at, started_at, ended_at, recorded_by, status::text,
           visibility::text, rag_enabled, source_document_id,
           COALESCE(metadata, '{}'::jsonb) AS metadata,
           created_by, updated_by, created_at, updated_at
      FROM public.knowledge_records ORDER BY project_id, id
  `),
  table('record_task_links', 'public.record_task_links', [
    'id', 'tenant_id', 'project_id', 'record_id', 'item_id', 'role', 'created_by', 'created_at',
  ], `
    SELECT id, tenant_id, project_id, record_id, item_id, role::text, created_by, created_at
      FROM public.record_task_links ORDER BY record_id, item_id, role
  `),
  table('activity_events', 'public.activity_events', [
    'id', 'tenant_id', 'project_id', 'actor_id', 'event_type', 'entity_table', 'entity_id', 'entity_ref', 'payload', 'created_at',
  ], `
    SELECT id, tenant_id, project_id, actor_id, event_type, entity_table,
           CASE WHEN entity_id::text ~* '${UUID_PATTERN}' THEN entity_id::uuid ELSE NULL::uuid END AS entity_id,
           CASE WHEN entity_id IS NOT NULL AND entity_id::text !~* '${UUID_PATTERN}' THEN entity_id::text ELSE NULL::text END AS entity_ref,
           COALESCE(payload, '{}'::jsonb) AS payload, created_at
      FROM public.activity_events ORDER BY tenant_id, created_at, id
  `),
  table('audit_logs', 'public.audit_logs', [
    'id', 'tenant_id', 'project_id', 'actor_id', 'action', 'entity_table', 'entity_id', 'entity_ref',
    'before_data', 'after_data', 'created_at',
  ], `
    SELECT id, tenant_id, NULL::uuid AS project_id, actor_id, action, entity_table,
           CASE WHEN entity_id::text ~* '${UUID_PATTERN}' THEN entity_id::uuid ELSE NULL::uuid END AS entity_id,
           CASE WHEN entity_id IS NOT NULL AND entity_id::text !~* '${UUID_PATTERN}' THEN entity_id::text ELSE NULL::text END AS entity_ref,
           before_data, after_data, created_at
      FROM public.audit_logs ORDER BY tenant_id, created_at, id
  `),
  table('llm_access_logs', 'public.llm_access_logs', [
    'id', 'tenant_id', 'project_id', 'actor_id', 'provider', 'model', 'prompt_hash',
    'retrieved_chunk_ids', 'response_metadata', 'created_at',
  ], `
    SELECT id, tenant_id, project_id, actor_id, provider, model, prompt_hash,
           retrieved_chunk_ids, response_metadata, created_at
      FROM public.llm_access_logs ORDER BY tenant_id, created_at, id
  `),
  table('unplaced_tasks', 'public.task_workbench_unplaced_items', ['owner_id', 'legacy_task_id', 'workspace_legacy_id', 'task', 'sort_order', 'created_at', 'updated_at'], `
    SELECT owner_id, id AS legacy_task_id, workspace_id AS workspace_legacy_id, task,
           sort_order::float8 AS sort_order, created_at, updated_at
      FROM public.task_workbench_unplaced_items ORDER BY owner_id, id
  `),
  table('quick_task_capture_receipts', 'private.quick_task_capture_receipts', ['owner_id', 'capture_id', 'title_hash', 'committed_at'], `
    SELECT owner_id, capture_id, encode(title_hash, 'hex') AS title_hash, committed_at
      FROM private.quick_task_capture_receipts ORDER BY owner_id, capture_id
  `),
  table('task_workbench_placement_operations', 'public.task_workbench_placement_operations', ['owner_id', 'operation_id', 'command', 'result', 'created_at', 'updated_at'], `
    SELECT owner_id, operation_id,
           jsonb_build_object(
             'legacy', true, 'direction', direction, 'rootTaskId', root_task_id, 'taskIds', task_ids,
             'sourceKind', source_kind, 'targetKind', target_kind,
             'sourceWorkspaceId', source_workspace_id, 'sourceBoardId', source_board_id,
             'targetWorkspaceId', target_workspace_id, 'targetBoardId', target_board_id,
             'targetParentTaskId', target_parent_task_id, 'anchorTaskId', anchor_task_id,
             'position', position, 'status', status, 'errorCode', error_code,
             'clientPlatform', client_platform, 'elapsedMs', elapsed_ms
           ) AS command,
           result, created_at, updated_at
      FROM public.task_workbench_placement_operations ORDER BY owner_id, operation_id
  `),
  table('task_tracking_references', 'public.wbs_item_placements', [
    'id', 'tenant_id', 'task_project_id', 'task_id', 'target_project_id', 'parent_placement_id',
    'sort_order', 'kanban_stage_id', 'revision', 'created_by', 'removed_by', 'removed_at', 'created_at', 'updated_at',
  ], `
    SELECT placement.id, placement.tenant_id, task.project_id AS task_project_id, placement.task_id,
           placement.project_id AS target_project_id, placement.parent_placement_id::text,
           placement.sort_order::float8, placement.kanban_stage_id, placement.revision::bigint,
           placement.created_by, placement.removed_by, placement.removed_at,
           placement.created_at, placement.updated_at
      FROM public.wbs_item_placements placement
      JOIN public.wbs_items task ON task.tenant_id = placement.tenant_id AND task.id = placement.task_id
     WHERE placement.placement_kind = 'tracking_reference'
     ORDER BY placement.tenant_id, placement.id
  `),
  table('task_tracking_reference_operations', 'public.task_tracking_reference_operations', [
    'tenant_id', 'operation_id', 'actor_id', 'request_hash', 'result', 'created_at', 'updated_at',
  ], `
    SELECT tenant_id, operation_id, actor_id, request_hash, result,
           action, status, error_code, created_at, updated_at
      FROM public.task_tracking_reference_operations ORDER BY tenant_id, operation_id
  `, (row) => ({
    tenant_id: row.tenant_id,
    operation_id: row.operation_id,
    actor_id: row.actor_id,
    request_hash: typeof row.request_hash === 'string' && /^[0-9a-f]{64}$/u.test(row.request_hash)
      ? row.request_hash
      : digest({ action: row.action, status: row.status, errorCode: row.error_code }),
    result: row.result,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })),
  table('backup_import_executions', 'private.backup_import_executions', [
    'tenant_id', 'execution_id', 'actor_id', 'request_hash', 'result', 'created_at', 'updated_at',
  ], `
    SELECT tenant_id, execution_id, actor_id, package_id, import_mode, target_project_id,
           status, result, created_at, updated_at
      FROM private.backup_import_executions ORDER BY tenant_id, execution_id
  `, (row) => ({
    tenant_id: row.tenant_id,
    execution_id: row.execution_id,
    actor_id: row.actor_id,
    request_hash: digest({
      packageId: row.package_id, importMode: row.import_mode, targetProjectId: row.target_project_id,
    }),
    result: row.result,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })),
  table('account_board_task_filter_preferences', 'public.account_board_task_filter_preferences', [
    'account_id', 'tenant_id', 'project_id', 'preference_version', 'filters', 'created_at', 'updated_at',
  ], `
    SELECT preference.account_id, project.tenant_id, preference.project_id,
           preference.preference_version, preference.filters, preference.created_at, preference.updated_at
      FROM public.account_board_task_filter_preferences preference
      JOIN public.projects project ON project.id = preference.project_id
     ORDER BY preference.account_id, preference.project_id
  `),
  table('calendar_subscriptions', 'public.calendar_subscriptions', [
    'id', 'owner_user_id', 'name', 'token_hash', 'filters_json', 'is_active', 'expires_at',
    'last_accessed_at', 'created_at', 'updated_at',
  ], `
    SELECT id, owner_user_id, name, token_hash, filters_json, is_active, expires_at,
           last_accessed_at, created_at, updated_at
      FROM public.calendar_subscriptions ORDER BY owner_user_id, id
  `),
];

const BLOCKERS = [
  ['public.llm_access_logs', 'WHERE project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects project WHERE project.id = public.llm_access_logs.project_id AND project.tenant_id = public.llm_access_logs.tenant_id)'],
  ['public.documents', 'WHERE project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects project WHERE project.id = public.documents.project_id AND project.tenant_id = public.documents.tenant_id)'],
  ['public.document_versions', 'WHERE NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.id = public.document_versions.document_id AND document.tenant_id = public.document_versions.tenant_id)'],
  ['public.document_chunks', 'WHERE NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.id = public.document_chunks.document_id AND document.tenant_id = public.document_chunks.tenant_id) OR (document_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_versions version WHERE version.id = public.document_chunks.document_version_id AND version.document_id = public.document_chunks.document_id AND version.tenant_id = public.document_chunks.tenant_id))'],
  ['public.document_embeddings', 'WHERE NOT EXISTS (SELECT 1 FROM public.document_chunks chunk WHERE chunk.id = public.document_embeddings.chunk_id AND chunk.tenant_id = public.document_embeddings.tenant_id)'],
  ['public.rag_sync_jobs', 'WHERE source_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.id = public.rag_sync_jobs.source_document_id AND document.tenant_id = public.rag_sync_jobs.tenant_id)'],
  ['public.external_rag_objects', 'WHERE NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.id = public.external_rag_objects.document_id AND document.tenant_id = public.external_rag_objects.tenant_id)'],
  ['public.inbox_items', ''],
  ['public.meeting_capture_sessions', ''],
  ['public.meeting_capture_segments', ''],
  ['public.meeting_pointer_intervals', ''],
  ['public.meeting_analysis_runs', ''],
  ['public.meeting_transcript_segments', ''],
  ['public.meeting_segment_resolutions', ''],
  ['public.meeting_task_match_results', ''],
  ['private.meeting_draft_projections', ''],
  ['private.meeting_artifact_cleanup', ''],
  ['private.meeting_ai_budget_months', ''],
  ['private.meeting_ai_usage_attempts', ''],
  ['public.task_tracking_reference_staging', ''],
  ['public.task_workbench_placement_operations', "WHERE status <> 'committed' OR result IS NULL"],
  ['public.task_tracking_reference_operations', "WHERE status <> 'committed' OR request_hash !~ '^[0-9a-f]{64}$' OR result IS NULL"],
  ['private.backup_import_executions', "WHERE status <> 'succeeded' OR result IS NULL"],
  ['private.quick_task_oauth_clients', ''],
  ['public.knowledge_records', 'WHERE rag_enabled'],
  ['public.knowledge_records', 'WHERE source_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.id = public.knowledge_records.source_document_id AND document.tenant_id = public.knowledge_records.tenant_id)'],
  ['public.tenants', "WHERE owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_members member WHERE member.tenant_id = public.tenants.id AND member.user_id = public.tenants.owner_id AND member.status::text = 'active')"],
  ['public.activity_events', 'WHERE entity_table IS NULL'],
  ['public.audit_logs', 'WHERE tenant_id IS NULL OR entity_table IS NULL'],
  ['public.wbs_item_placements', "WHERE placement_kind = 'tracking_reference' AND created_by IS NULL"],
  ['public.projects', 'WHERE abs(sort_order::numeric) > 9007199254740991'],
  ['public.task_tags', 'WHERE abs(sort_order::numeric) > 9007199254740991'],
  ['public.wbs_items', 'WHERE abs(sort_order::numeric) > 9007199254740991'],
  ['public.task_workbench_unplaced_items', 'WHERE abs(sort_order::numeric) > 9007199254740991'],
  ['public.wbs_item_placements', 'WHERE abs(sort_order::numeric) > 9007199254740991'],
] as const;

const APP_SOURCE_SCHEMAS = ['public', 'private'] as const;
const APP_SOURCE_RELATION_KINDS = new Set(['r', 'p', 'm', 'f']);
const CLASSIFIED_SOURCE_RELATIONS = new Set([
  ...TABLES.map(({ sourceRelation }) => sourceRelation),
  ...BLOCKERS.map(([relation]) => relation),
]);

export interface SourceCatalogRelation {
  readonly schema_name: string;
  readonly relation_name: string;
  readonly relation_kind: string;
  readonly extension_owned: boolean;
}

export function findUnclassifiedSourceRelations(
  relations: readonly SourceCatalogRelation[],
  classifiedRelations: ReadonlySet<string> = CLASSIFIED_SOURCE_RELATIONS,
): readonly SourceCatalogRelation[] {
  return relations.filter((relation) => (
    APP_SOURCE_SCHEMAS.includes(relation.schema_name as (typeof APP_SOURCE_SCHEMAS)[number])
      && APP_SOURCE_RELATION_KINDS.has(relation.relation_kind)
      && !relation.extension_owned
      && !classifiedRelations.has(`${relation.schema_name}.${relation.relation_name}`)
  ));
}

function canonical(value: unknown): string {
  if (value instanceof SnapshotJson) return `json:${value.text}`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('hex'));
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function snapshotSummary(snapshot: ReadonlyMap<string, readonly Row[]>) {
  return Object.fromEntries([...snapshot.entries()].map(([name, rows]) => [name, {
    count: rows.length,
    sha256: digest(rows.map(row => canonical(row)).sort()),
  }]));
}

function snapshotId(snapshot: ReadonlyMap<string, readonly Row[]>): string {
  return digest(snapshotSummary(snapshot));
}

async function readSource(client: Client): Promise<Map<string, Row[]>> {
  const result = new Map<string, Row[]>();
  for (const spec of TABLES) {
    const rows = (await client.query<Row>(spec.sourceSql)).rows;
    const transformed = spec.transform ? rows.map(spec.transform) : rows;
    const missingColumn = transformed.flatMap(row => spec.columns.filter(column => !(column in row)))[0];
    if (missingColumn) {
      throw Object.assign(new Error(`Source projection missing ${spec.target}.${missingColumn}`), {
        code: `SOURCE_PROJECTION_INVALID_${spec.target.toUpperCase()}_${missingColumn.toUpperCase()}`,
      });
    }
    result.set(spec.target, transformed);
  }
  return result;
}

async function readTarget(client: Client): Promise<Map<string, Row[]>> {
  const result = new Map<string, Row[]>();
  for (const spec of TABLES) {
    const projection = spec.columns.map(column => `target.${column}`).join(', ');
    result.set(spec.target, (await client.query<Row>(
      `SELECT ${projection} FROM projed_core.${spec.target} target`,
    )).rows);
  }
  return result;
}

async function readSourceRelationCatalog(client: Client): Promise<readonly SourceCatalogRelation[]> {
  const result = await client.query<SourceCatalogRelation>(`
    SELECT relation_namespace.nspname AS schema_name,
           source_relation.relname AS relation_name,
           source_relation.relkind::text AS relation_kind,
           EXISTS (
             SELECT 1
               FROM pg_catalog.pg_depend extension_dependency
              WHERE extension_dependency.classid = 'pg_catalog.pg_class'::regclass
                AND extension_dependency.objid = source_relation.oid
                AND extension_dependency.deptype = 'e'
           ) AS extension_owned
      FROM pg_catalog.pg_class source_relation
      JOIN pg_catalog.pg_namespace relation_namespace
        ON relation_namespace.oid = source_relation.relnamespace
     WHERE relation_namespace.nspname = ANY($1::text[])
       AND source_relation.relkind IN ('r', 'p', 'm', 'f')
       -- Declarative partition children are covered by their root; regular INHERITS children need their own classification.
       AND NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_inherits partition_edge
           JOIN pg_catalog.pg_class parent_relation
             ON parent_relation.oid = partition_edge.inhparent
           JOIN pg_catalog.pg_namespace parent_namespace
             ON parent_namespace.oid = parent_relation.relnamespace
          WHERE source_relation.relispartition
            AND partition_edge.inhrelid = source_relation.oid
            AND parent_namespace.nspname = ANY($1::text[])
       )
     ORDER BY relation_namespace.nspname, source_relation.relname
  `, [APP_SOURCE_SCHEMAS]);
  return result.rows;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteRelation(schema: string, relation: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(relation)}`;
}

async function sourcePreflight(client: Client) {
  const found: Array<{ domain: string; count: number | null }> = [];
  const emptySourceRelations: Array<{ domain: string; count: 0 }> = [];
  const catalog = await readSourceRelationCatalog(client);
  for (const relation of findUnclassifiedSourceRelations(catalog)) {
    // Counts are safe metadata only; do not SELECT any unknown relation rows.
    // Foreign tables may invoke an external FDW, so identify them without reading them.
    const count = relation.relation_kind === 'f'
      ? null
      : (await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${quoteRelation(relation.schema_name, relation.relation_name)}`,
      )).rows[0]?.count ?? 0;
    const domain = `UNKNOWN_SOURCE_RELATION ${quoteRelation(relation.schema_name, relation.relation_name)}`;
    // An actually empty relation has no snapshot data to lose. Keep its name
    // in diagnostics; populated or unreadable/foreign relations still stop.
    if (count === 0) emptySourceRelations.push({ domain, count });
    else found.push({ domain, count });
  }
  for (const [relation, where] of BLOCKERS) {
    const exists = await client.query<{ relation: string | null }>('SELECT to_regclass($1) AS relation', [relation]);
    if (!exists.rows[0]?.relation) continue;
    const count = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${relation} ${where}`);
    if ((count.rows[0]?.count ?? 0) > 0) found.push({ domain: `${relation}${where ? ` ${where}` : ''}`, count: count.rows[0]!.count });
  }
  return { blockers: found, emptySourceRelations };
}

async function insertSnapshot(client: Client, snapshot: ReadonlyMap<string, readonly Row[]>): Promise<void> {
  for (const spec of TABLES) {
    const rows = snapshot.get(spec.target) ?? [];
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const values: unknown[] = [];
      const tuples = batch.map((row, rowIndex) => `(${spec.columns.map((column, columnIndex) => {
        const value = row[column];
        values.push(value instanceof SnapshotJson ? value.text : value);
        return `$${rowIndex * spec.columns.length + columnIndex + 1}`;
      }).join(', ')})`);
      try {
        await client.query(
          `INSERT INTO projed_core.${spec.target} (${spec.columns.join(', ')}) VALUES ${tuples.join(', ')}`,
          values,
        );
      } catch (error) {
        const constraint = typeof error === 'object' && error && 'constraint' in error
          && typeof error.constraint === 'string'
          ? `_${error.constraint.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}`
          : '';
        throw Object.assign(new Error(`Import rejected for ${spec.target}`), {
          code: `IMPORT_${spec.target.toUpperCase()}_FAILED${constraint}`,
        });
      }
    }
  }
}

function readJson<T>(path: string): T {
  const bytes = readFileSync(resolve(path));
  return JSON.parse(bytes.toString('utf8')) as T;
}

function validateDisposableSourceUrl(raw: string, binding: RuntimeBinding): string {
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || Number(url.port || '5432') !== binding.databasePort || url.search || url.hash
      || url.password.length === 0) {
    throw Object.assign(new Error('Source URL is outside the disposable migration binding'), { code: 'BINDING_INVALID' });
  }
  return raw;
}

async function validateSource(
  client: Client,
  expected?: SupabaseSourceBindingV1,
): Promise<void> {
  const identity = await client.query<{
    database_name: string; role_name: string; read_only: boolean; isolation_level: string;
  }>(`
    SELECT current_database() AS database_name, current_user AS role_name,
           current_setting('transaction_read_only') = 'on' AS read_only,
           current_setting('transaction_isolation') AS isolation_level
  `);
  const row = identity.rows[0];
  if (!row || !row.read_only || row.isolation_level !== 'repeatable read'
      || (expected && (row.database_name !== expected.databaseName || row.role_name !== expected.readerRole))) {
    throw Object.assign(new Error('Source snapshot identity or transaction boundary mismatch'), {
      code: 'SOURCE_IDENTITY_INVALID',
    });
  }
}

async function validateTarget(client: Client, profile: SourceProfile, binding: RuntimeBinding): Promise<void> {
  const identity = await client.query<{
    database_name: string;
    role_name: string;
    is_superuser: boolean;
    bypass_rls: boolean;
    can_create_database: boolean;
    can_create_role: boolean;
    can_replicate: boolean;
    has_protected_membership: boolean;
  }>(`
    SELECT current_database() AS database_name, current_user AS role_name,
           role.rolsuper AS is_superuser, role.rolbypassrls AS bypass_rls,
           role.rolcreatedb AS can_create_database, role.rolcreaterole AS can_create_role,
           role.rolreplication AS can_replicate,
           EXISTS (
             SELECT 1
               FROM pg_catalog.pg_roles protected_role
              WHERE protected_role.rolname = ANY($1::text[])
                AND pg_catalog.pg_has_role(current_user, protected_role.oid, 'MEMBER')
           ) AS has_protected_membership
      FROM pg_catalog.pg_roles role WHERE role.rolname = current_user
  `, [[profile.roles.owner, profile.roles.migrator, profile.roles.runtime]]);
  const row = identity.rows[0];
  if (!row || row.database_name !== binding.databaseName || row.role_name !== profile.roles.importer
      || row.is_superuser || row.bypass_rls || row.can_create_database || row.can_create_role
      || row.can_replicate || row.has_protected_membership) {
    throw Object.assign(new Error('Importer identity mismatch'), { code: 'IMPORTER_IDENTITY_INVALID' });
  }
  const ledger = await client.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version',
  );
  if (ledger.rows.length !== profile.migrations.length || profile.migrations.some((migration, index) => (
    ledger.rows[index]?.version !== migration.version
      || ledger.rows[index]?.checksum !== binding.migrationSha256[migration.path]
  ))) throw Object.assign(new Error('Target migration ledger mismatch'), { code: 'TARGET_LEDGER_MISMATCH' });
}

async function main(): Promise<void> {
  const mode = process.argv[2] as Mode | undefined;
  if (mode !== 'plan' && mode !== 'apply' && mode !== 'reconcile') {
    throw Object.assign(new Error('Mode must be plan, apply or reconcile'), { code: 'MODE_INVALID' });
  }
  const targetOption = process.argv[3] ?? '--target=disposable';
  if (process.argv.length > 4 || (targetOption !== '--target=disposable' && targetOption !== '--target=managed')) {
    throw Object.assign(new Error('Target option must be --target=disposable or --target=managed'), { code: 'MODE_INVALID' });
  }
  const managed = targetOption === '--target=managed';
  const expectedProfilePath = resolve(managed
    ? 'config/dev-139/s3-managed.profile.json'
    : 'config/dev-139/s3-read-disposable.profile.json');
  const profilePath = resolve(process.env.PROJED_SOURCE_PROFILE ?? expectedProfilePath);
  if (profilePath !== expectedProfilePath) {
    throw Object.assign(new Error('Migration profile is outside the selected target contract'), { code: 'BINDING_INVALID' });
  }
  const bindingPath = process.env.PROJED_RUNTIME_BINDING_FILE;
  const sourceBindingPath = process.env.PROJED_MIGRATION_SOURCE_BINDING_FILE;
  const sourceRaw = process.env.PROJED_MIGRATION_SOURCE_DATABASE_URL;
  const targetRaw = process.env.PROJED_MIGRATION_TARGET_DATABASE_URL;
  if (!bindingPath || !sourceRaw || !targetRaw || (managed ? !sourceBindingPath : Boolean(sourceBindingPath))) {
    throw Object.assign(new Error('Migration environment is incomplete'), { code: 'CONFIG_INCOMPLETE' });
  }
  const loadedProfile = loadSourceProfile(profilePath);
  const profile = loadedProfile.profile;
  const binding = readJson<RuntimeBinding>(bindingPath);
  validateRuntimeBinding(binding, profile, loadedProfile.sha256);
  if (profile.migrations.some(migration => (
    binding.migrationSha256[migration.path] !== sha256(readFileSync(resolve(migration.path)))
  ))) {
    throw Object.assign(new Error('Migration source bytes do not match the runtime binding'), { code: 'BINDING_INVALID' });
  }
  const sourceBinding = managed
    ? validateSupabaseSourceBinding(readJson<SupabaseSourceBindingV1>(sourceBindingPath!))
    : undefined;
  const sourceUrl = sourceBinding
    ? validateSupabaseSourceUrl(sourceRaw, sourceBinding)
    : validateDisposableSourceUrl(sourceRaw, binding);
  const targetUrl = validateRuntimeDatabaseUrl(targetRaw, {
    ...binding,
    runtimeRole: profile.roles.importer,
  }).toString();
  const source = new PgClient({ connectionString: sourceUrl, application_name: 'projed-dev139-source-snapshot', types: snapshotTypes });
  const target = new PgClient({ connectionString: targetUrl, application_name: `projed-dev139-${mode}`, types: snapshotTypes });
  await Promise.all([source.connect(), target.connect()]);
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await source.query("SET LOCAL TIME ZONE 'UTC'");
    await source.query("SET LOCAL DateStyle = 'ISO, YMD'");
    await source.query('SET LOCAL extra_float_digits = 3');
    // Fail rather than mistake rows hidden by RLS for an empty/full snapshot.
    // This setting does not grant permission to bypass a row security policy.
    await source.query('SET LOCAL row_security = off');
    await validateSource(source, sourceBinding);
    const { blockers, emptySourceRelations } = await sourcePreflight(source);
    if (blockers.length > 0) {
      await source.query('ROLLBACK');
      console.log(JSON.stringify({ status: 'BLOCKED', mode, blockers, emptySourceRelations }));
      process.exitCode = 2;
      return;
    }

    await target.query(mode === 'apply' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query("SET LOCAL TIME ZONE 'UTC'");
    await target.query("SET LOCAL DateStyle = 'ISO, YMD'");
    await target.query('SET LOCAL extra_float_digits = 3');
    if (mode === 'apply') await target.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:dev139:initial-snapshot-import', 0))");
    await validateTarget(target, profile, binding);
    const sourceSnapshot = await readSource(source);
    const before = await readTarget(target);
    const targetCount = [...before.values()].reduce((sum, rows) => sum + rows.length, 0);
    if ((mode === 'plan' || mode === 'apply') && targetCount > 0) {
      blockers.push({ domain: 'target:not_empty', count: targetCount });
    }
    if (blockers.length > 0) {
      await target.query('ROLLBACK');
      await source.query('ROLLBACK');
      console.log(JSON.stringify({
        status: 'BLOCKED', mode, snapshotId: snapshotId(sourceSnapshot),
        tables: snapshotSummary(sourceSnapshot), blockers, emptySourceRelations,
      }));
      process.exitCode = 2;
      return;
    }
    if (mode === 'apply') await insertSnapshot(target, sourceSnapshot);
    const targetSnapshot = mode === 'apply' ? await readTarget(target) : before;
    const sourceDigest = snapshotId(sourceSnapshot);
    const targetDigest = snapshotId(targetSnapshot);
    const matches = sourceDigest === targetDigest;
    if ((mode === 'apply' || mode === 'reconcile') && !matches) {
      throw Object.assign(new Error('Source and target reconciliation differ'), { code: 'RECONCILIATION_MISMATCH' });
    }
    await target.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    await source.query('ROLLBACK');
    console.log(JSON.stringify({
      status: 'PASS', mode, snapshotId: sourceDigest, targetSnapshotId: targetDigest,
      matches, tables: snapshotSummary(sourceSnapshot), emptySourceRelations,
    }));
  } catch (error) {
    try { await target.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    try { await source.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    throw error;
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code : 'MIGRATION_FAILED';
    console.error(JSON.stringify({ status: 'FAIL', code }));
    process.exitCode = 1;
  }
}
