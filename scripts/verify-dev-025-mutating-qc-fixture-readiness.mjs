import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKER_RE = /(?:QC-)?DEV-025/i;

const args = new Set(process.argv.slice(2));
const selfCheck = args.has('--self-check');
const runActorPreview = args.has('--actor-preview') || process.env.DEV025_QC_RUN_ACTOR_PREVIEW === 'true';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEV025_QC_SOURCE_TENANT_ID',
  'DEV025_QC_TARGET_TENANT_ID',
  'DEV025_QC_DENIED_TENANT_ID',
  'DEV025_QC_PROJECT_ID',
  'DEV025_QC_EXPECTED_PROJECT_NAME',
];

const min = (key, fallback) => {
  const value = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const thresholds = {
  tasks: min('DEV025_QC_MIN_TASKS', 5),
  dependencies: min('DEV025_QC_MIN_DEPENDENCIES', 2),
  distinctTags: min('DEV025_QC_MIN_DISTINCT_TAGS', 2),
  records: min('DEV025_QC_MIN_RECORDS', 2),
  recordTaskLinks: min('DEV025_QC_MIN_RECORD_TASK_LINKS', 1),
  documents: min('DEV025_QC_MIN_DOCUMENTS', 1),
  ragDocuments: min('DEV025_QC_MIN_RAG_DOCUMENTS', 1),
  pendingInvites: min('DEV025_QC_MIN_PENDING_INVITES', 1),
  sourceProjectMembers: min('DEV025_QC_MIN_SOURCE_PROJECT_MEMBERS', 3),
  preservedMembers: min('DEV025_QC_MIN_PRESERVED_MEMBERS', 1),
  removedMembers: min('DEV025_QC_MIN_REMOVED_MEMBERS', 1),
};

const results = [];
const add = (name, ok, details = undefined) => results.push({ name, ok, details });

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const metadataHasMarker = value => {
  if (!isObject(value)) return false;
  const candidates = [
    value.qcDev,
    value.dev,
    value.fixture,
    value.qcFixture,
    value.projedQcFixture,
    value.testFixture,
  ];
  return candidates.some(item => typeof item === 'string' && MARKER_RE.test(item));
};

const entityHasMarker = entity =>
  Boolean(entity) &&
  (
    (typeof entity.name === 'string' && MARKER_RE.test(entity.name)) ||
    metadataHasMarker(entity.metadata)
  );

const assertNoError = (label, error) => {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
};

const countRows = async (supabase, table, filters) => {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  assertNoError(`count ${table}`, error);
  return count ?? 0;
};

const listRows = async (supabase, table, select, filters) => {
  let query = supabase.from(table).select(select);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  assertNoError(`select ${table}`, error);
  return data ?? [];
};

const summarize = () => {
  const failed = results.filter(result => !result.ok);
  const payload = {
    ok: failed.length === 0,
    mode: selfCheck ? 'self-check' : 'fixture-readiness',
    mutates_database: false,
    results,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (failed.length > 0) process.exit(1);
};

if (selfCheck) {
  add('script exposes guarded fixture-readiness mode', true);
  add('required fixture env contract is documented in script', requiredEnv.length >= 7, requiredEnv);
  add('default thresholds match QA-DEV-025 minimum fixture shape', thresholds.tasks === 5 && thresholds.sourceProjectMembers === 3, thresholds);
  add('script has no move RPC execution path', true);
  summarize();
  process.exit(0);
}

for (const key of requiredEnv) {
  const value = process.env[key];
  add(`env:${key}`, Boolean(value), value ? 'set' : 'missing');
}

for (const key of [
  'DEV025_QC_SOURCE_TENANT_ID',
  'DEV025_QC_TARGET_TENANT_ID',
  'DEV025_QC_DENIED_TENANT_ID',
  'DEV025_QC_PROJECT_ID',
]) {
  add(`uuid:${key}`, UUID_RE.test(process.env[key] ?? ''), 'must be a UUID');
}

const sourceTenantId = process.env.DEV025_QC_SOURCE_TENANT_ID;
const targetTenantId = process.env.DEV025_QC_TARGET_TENANT_ID;
const deniedTenantId = process.env.DEV025_QC_DENIED_TENANT_ID;
const projectId = process.env.DEV025_QC_PROJECT_ID;
const expectedProjectName = process.env.DEV025_QC_EXPECTED_PROJECT_NAME;

add('fixture tenants are distinct', sourceTenantId !== targetTenantId && sourceTenantId !== deniedTenantId && targetTenantId !== deniedTenantId);

if (results.some(result => !result.ok)) summarize();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

const [{ data: sourceTenant, error: sourceTenantError }, { data: targetTenant, error: targetTenantError }, { data: deniedTenant, error: deniedTenantError }] = await Promise.all([
  supabase.from('tenants').select('id,name,metadata').eq('id', sourceTenantId).maybeSingle(),
  supabase.from('tenants').select('id,name,metadata').eq('id', targetTenantId).maybeSingle(),
  supabase.from('tenants').select('id,name,metadata').eq('id', deniedTenantId).maybeSingle(),
]);
assertNoError('source tenant', sourceTenantError);
assertNoError('target tenant', targetTenantError);
assertNoError('denied tenant', deniedTenantError);

const { data: project, error: projectError } = await supabase
  .from('projects')
  .select('id,tenant_id,name,metadata')
  .eq('id', projectId)
  .maybeSingle();
assertNoError('project', projectError);

add('source fixture workspace exists', Boolean(sourceTenant));
add('target fixture workspace exists', Boolean(targetTenant));
add('denied fixture workspace exists', Boolean(deniedTenant));
add('fixture project exists', Boolean(project));
add('fixture project currently belongs to source workspace', project?.tenant_id === sourceTenantId);
add('expected project name matches fixture', project?.name === expectedProjectName);
add('fixture project is not transfer locked', !['true', '1', 'yes'].includes(String(project?.metadata?.transferLocked ?? '').toLowerCase()));
add('fixture source workspace is marked for DEV-025 QC', entityHasMarker(sourceTenant));
add('fixture target workspace is marked for DEV-025 QC', entityHasMarker(targetTenant));
add('fixture denied workspace is marked for DEV-025 QC', entityHasMarker(deniedTenant));
add('fixture project is marked for DEV-025 QC', entityHasMarker(project));

if (results.some(result => !result.ok)) summarize();

const [
  taskCount,
  dependencyCount,
  documentCount,
  ragDocumentCount,
  recordCount,
  recordTaskLinkCount,
  pendingInviteCount,
  sourceProjectMembers,
  targetTenantMembers,
  tagRows,
] = await Promise.all([
  countRows(supabase, 'wbs_items', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  countRows(supabase, 'wbs_dependencies', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  countRows(supabase, 'documents', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  countRows(supabase, 'documents', [['tenant_id', sourceTenantId], ['project_id', projectId], ['rag_enabled', true]]),
  countRows(supabase, 'knowledge_records', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  countRows(supabase, 'record_task_links', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  countRows(supabase, 'board_invites', [['tenant_id', sourceTenantId], ['project_id', projectId], ['status', 'pending']]),
  listRows(supabase, 'project_members', 'user_id,role', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
  listRows(supabase, 'tenant_members', 'user_id,role,status', [['tenant_id', targetTenantId], ['status', 'active']]),
  listRows(supabase, 'wbs_item_tags', 'tag_id', [['tenant_id', sourceTenantId], ['project_id', projectId]]),
]);

const targetMemberIds = new Set(targetTenantMembers.map(row => row.user_id));
const preservedMembers = sourceProjectMembers.filter(row => targetMemberIds.has(row.user_id)).length;
const removedMembers = sourceProjectMembers.length - preservedMembers;
const distinctTags = new Set(tagRows.map(row => row.tag_id)).size;

const counts = {
  tasks: taskCount,
  dependencies: dependencyCount,
  distinctTags,
  records: recordCount,
  recordTaskLinks: recordTaskLinkCount,
  documents: documentCount,
  ragDocuments: ragDocumentCount,
  pendingInvites: pendingInviteCount,
  sourceProjectMembers: sourceProjectMembers.length,
  targetActiveMembers: targetTenantMembers.length,
  preservedMembers,
  removedMembers,
};

for (const [key, expected] of Object.entries(thresholds)) {
  add(`fixture minimum:${key}`, counts[key] >= expected, { actual: counts[key], expected });
}

if (runActorPreview) {
  const actorToken = process.env.DEV025_QC_ACTOR_ACCESS_TOKEN;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  add('actor preview env:SUPABASE_ANON_KEY', Boolean(anonKey), anonKey ? 'set' : 'missing');
  add('actor preview env:DEV025_QC_ACTOR_ACCESS_TOKEN', Boolean(actorToken), actorToken ? 'set' : 'missing');
  if (actorToken && anonKey) {
    const actorClient = createClient(process.env.SUPABASE_URL, anonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${actorToken}`,
        },
      },
    });
    const { data: preview, error: previewError } = await actorClient.rpc('preview_project_workspace_transfer', {
      source_tenant_id: sourceTenantId,
      project_id: projectId,
      target_tenant_id: targetTenantId,
    });
    add('actor preview RPC succeeds', !previewError, previewError?.message);
    add('actor preview is not blocked for selected fixture', preview && preview.blocked === false, preview?.reasons ?? null);
  }
}

summarize();
