import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKER_RE = /(?:QC-)?DEV-025/i;

const args = new Set(process.argv.slice(2));
const runMutatingFixture = args.has('--run-mutating-fixture');
const selfCheck = args.has('--self-check') || !runMutatingFixture;

const requiredFixtureEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'DEV025_QC_SOURCE_TENANT_ID',
  'DEV025_QC_TARGET_TENANT_ID',
  'DEV025_QC_DENIED_TENANT_ID',
  'DEV025_QC_PROJECT_ID',
  'DEV025_QC_EXPECTED_PROJECT_NAME',
];

const requiredActorEnv = [
  'DEV025_QC_ALLOWED_ACTOR_ACCESS_TOKEN',
  'DEV025_QC_SOURCE_MEMBER_ACCESS_TOKEN',
  'DEV025_QC_TARGET_MEMBER_ACCESS_TOKEN',
  'DEV025_QC_OUTSIDER_ACCESS_TOKEN',
];

const requiredMutationGuards = [
  ['arg:--run-mutating-fixture', () => runMutatingFixture],
  ['env:DEV025_ALLOW_MUTATING_QC=1', () => process.env.DEV025_ALLOW_MUTATING_QC === '1'],
  ['env:DEV025_QC_FIXTURE_DISPOSABLE=1', () => process.env.DEV025_QC_FIXTURE_DISPOSABLE === '1'],
];

const results = [];
let mutationAttempted = false;

const add = (name, ok, details = undefined) => results.push({ name, ok, details });

const summarize = (mode, extra = {}) => {
  const failed = results.filter(result => !result.ok);
  const payload = {
    ok: failed.length === 0,
    mode,
    mutates_database: mutationAttempted,
    mutationAttempted,
    requires_explicit_fixture_opt_in: true,
    results,
    ...extra,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (failed.length > 0) process.exit(1);
};

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

const maybeSingle = async (query, label) => {
  const { data, error } = await query.maybeSingle();
  assertNoError(label, error);
  return data ?? null;
};

const createServiceClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

const createActorClient = accessToken =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

const previewAs = async (client, sourceTenantId, projectId, targetTenantId) =>
  client.rpc('preview_project_workspace_transfer', {
    source_tenant_id: sourceTenantId,
    project_id: projectId,
    target_tenant_id: targetTenantId,
  });

const isBlockedPreview = (data, error) => Boolean(error) || data?.blocked === true;

const countProjectScope = async (client, table, tenantId, projectId) =>
  countRows(client, table, [
    ['tenant_id', tenantId],
    ['project_id', projectId],
  ]);

const getFixtureShape = async (client, sourceTenantId, targetTenantId, projectId) => {
  const [
    tasks,
    dependencies,
    documents,
    ragDocuments,
    records,
    recordTaskLinks,
    pendingInvites,
    sourceProjectMembers,
    targetTenantMembers,
    tagRows,
  ] = await Promise.all([
    countProjectScope(client, 'wbs_items', sourceTenantId, projectId),
    countProjectScope(client, 'wbs_dependencies', sourceTenantId, projectId),
    countProjectScope(client, 'documents', sourceTenantId, projectId),
    countRows(client, 'documents', [
      ['tenant_id', sourceTenantId],
      ['project_id', projectId],
      ['rag_enabled', true],
    ]),
    countProjectScope(client, 'knowledge_records', sourceTenantId, projectId),
    countProjectScope(client, 'record_task_links', sourceTenantId, projectId),
    countRows(client, 'board_invites', [
      ['tenant_id', sourceTenantId],
      ['project_id', projectId],
      ['status', 'pending'],
    ]),
    listRows(client, 'project_members', 'user_id,role', [
      ['tenant_id', sourceTenantId],
      ['project_id', projectId],
    ]),
    listRows(client, 'tenant_members', 'user_id,role,status', [
      ['tenant_id', targetTenantId],
      ['status', 'active'],
    ]),
    listRows(client, 'wbs_item_tags', 'tag_id', [
      ['tenant_id', sourceTenantId],
      ['project_id', projectId],
    ]),
  ]);

  const targetMemberIds = new Set(targetTenantMembers.map(row => row.user_id));
  const preservedMembers = sourceProjectMembers.filter(row => targetMemberIds.has(row.user_id)).length;
  const removedMembers = sourceProjectMembers.length - preservedMembers;

  return {
    tasks,
    dependencies,
    documents,
    ragDocuments,
    records,
    recordTaskLinks,
    pendingInvites,
    sourceProjectMembers: sourceProjectMembers.length,
    targetActiveMembers: targetTenantMembers.length,
    preservedMembers,
    removedMembers,
    distinctTags: new Set(tagRows.map(row => row.tag_id)).size,
  };
};

const selectProjectAs = async (accessToken, tenantId, projectId) => {
  const client = createActorClient(accessToken);
  const { data, error } = await client
    .from('projects')
    .select('id,tenant_id,name')
    .eq('tenant_id', tenantId)
    .eq('id', projectId);
  return { data: data ?? [], error };
};

if (selfCheck) {
  add('default mode is self-check and does not mutate database', true);
  add('mutating mode requires --run-mutating-fixture', true);
  add('mutating mode requires DEV025_ALLOW_MUTATING_QC=1', true);
  add('mutating mode requires DEV025_QC_FIXTURE_DISPOSABLE=1', true);
  add('fixture env contract is explicit', requiredFixtureEnv.length === 8, requiredFixtureEnv);
  add('role-token env contract is explicit', requiredActorEnv.length === 4, requiredActorEnv);
  add('script can execute preview before move RPC', true, 'preview_project_workspace_transfer');
  add('script can execute guarded move RPC only after all guards pass', true, 'move_project_to_workspace');
  summarize('self-check');
  process.exit(0);
}

try {
  for (const [name, predicate] of requiredMutationGuards) {
    add(name, Boolean(predicate()));
  }

  for (const key of requiredFixtureEnv) {
    const value = process.env[key];
    add(`env:${key}`, Boolean(value), value ? 'set' : 'missing');
  }

  for (const key of requiredActorEnv) {
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

  if (results.some(result => !result.ok)) summarize('guard-blocked');

  const sourceTenantId = process.env.DEV025_QC_SOURCE_TENANT_ID;
  const targetTenantId = process.env.DEV025_QC_TARGET_TENANT_ID;
  const deniedTenantId = process.env.DEV025_QC_DENIED_TENANT_ID;
  const projectId = process.env.DEV025_QC_PROJECT_ID;
  const expectedProjectName = process.env.DEV025_QC_EXPECTED_PROJECT_NAME;

  add(
    'fixture tenants are distinct',
    sourceTenantId !== targetTenantId &&
      sourceTenantId !== deniedTenantId &&
      targetTenantId !== deniedTenantId,
  );

  if (results.some(result => !result.ok)) summarize('guard-blocked');

  const serviceClient = createServiceClient();
  const allowedActor = createActorClient(process.env.DEV025_QC_ALLOWED_ACTOR_ACCESS_TOKEN);
  const sourceMemberActor = createActorClient(process.env.DEV025_QC_SOURCE_MEMBER_ACCESS_TOKEN);
  const targetMemberActor = createActorClient(process.env.DEV025_QC_TARGET_MEMBER_ACCESS_TOKEN);
  const outsiderActor = createActorClient(process.env.DEV025_QC_OUTSIDER_ACCESS_TOKEN);

  const [sourceTenant, targetTenant, deniedTenant, project] = await Promise.all([
    maybeSingle(
      serviceClient.from('tenants').select('id,name,metadata').eq('id', sourceTenantId),
      'source tenant',
    ),
    maybeSingle(
      serviceClient.from('tenants').select('id,name,metadata').eq('id', targetTenantId),
      'target tenant',
    ),
    maybeSingle(
      serviceClient.from('tenants').select('id,name,metadata').eq('id', deniedTenantId),
      'denied tenant',
    ),
    maybeSingle(
      serviceClient.from('projects').select('id,tenant_id,name,metadata').eq('id', projectId),
      'project',
    ),
  ]);

  add('source fixture workspace exists', Boolean(sourceTenant));
  add('target fixture workspace exists', Boolean(targetTenant));
  add('denied fixture workspace exists', Boolean(deniedTenant));
  add('fixture project exists', Boolean(project));
  add('fixture project currently belongs to source workspace', project?.tenant_id === sourceTenantId);
  add('expected project name matches fixture', project?.name === expectedProjectName);
  add('fixture project is not transfer locked', !['true', '1', 'yes'].includes(String(project?.metadata?.transferLocked ?? '').toLowerCase()));
  add('source workspace is marked for DEV-025 QC', entityHasMarker(sourceTenant));
  add('target workspace is marked for DEV-025 QC', entityHasMarker(targetTenant));
  add('denied workspace is marked for DEV-025 QC', entityHasMarker(deniedTenant));
  add('fixture project is marked for DEV-025 QC', entityHasMarker(project));

  if (results.some(result => !result.ok)) summarize('fixture-preflight');

  const before = await getFixtureShape(serviceClient, sourceTenantId, targetTenantId, projectId);

  add('fixture has tasks', before.tasks >= 5, before);
  add('fixture has dependencies', before.dependencies >= 2, before);
  add('fixture has tags', before.distinctTags >= 2, before);
  add('fixture has records', before.records >= 2, before);
  add('fixture has record task links', before.recordTaskLinks >= 1, before);
  add('fixture has documents', before.documents >= 1, before);
  add('fixture has RAG documents', before.ragDocuments >= 1, before);
  add('fixture has pending invites', before.pendingInvites >= 1, before);
  add('fixture has source board members', before.sourceProjectMembers >= 3, before);
  add('fixture has preserved and removed member shape', before.preservedMembers >= 1 && before.removedMembers >= 1, before);

  const allowedPreview = await previewAs(allowedActor, sourceTenantId, projectId, targetTenantId);
  add('allowed actor preview RPC succeeds', !allowedPreview.error, allowedPreview.error?.message);
  add('allowed actor preview is not blocked', allowedPreview.data?.blocked === false, allowedPreview.data?.reasons ?? null);
  add('allowed actor preview counts match fixture shape', allowedPreview.data?.counts?.tasks === before.tasks, allowedPreview.data?.counts ?? null);

  const sourceMemberPreview = await previewAs(sourceMemberActor, sourceTenantId, projectId, targetTenantId);
  add(
    'source member denied preview is blocked or rejected',
    isBlockedPreview(sourceMemberPreview.data, sourceMemberPreview.error),
    sourceMemberPreview.error?.message ?? sourceMemberPreview.data?.reasons,
  );

  const targetMemberPreview = await previewAs(targetMemberActor, sourceTenantId, projectId, targetTenantId);
  add(
    'target workspace member denied preview is blocked or rejected',
    isBlockedPreview(targetMemberPreview.data, targetMemberPreview.error),
    targetMemberPreview.error?.message ?? targetMemberPreview.data?.reasons,
  );

  const outsiderPreview = await previewAs(outsiderActor, sourceTenantId, projectId, targetTenantId);
  add(
    'outsider preview is blocked or rejected',
    isBlockedPreview(outsiderPreview.data, outsiderPreview.error),
    outsiderPreview.error?.message ?? outsiderPreview.data?.reasons,
  );

  const deniedWorkspacePreview = await previewAs(allowedActor, sourceTenantId, projectId, deniedTenantId);
  add(
    'allowed source actor cannot move into denied target workspace',
    isBlockedPreview(deniedWorkspacePreview.data, deniedWorkspacePreview.error),
    deniedWorkspacePreview.error?.message ?? deniedWorkspacePreview.data?.reasons,
  );

  if (results.some(result => !result.ok)) summarize('fixture-preflight');

  const moveResult = await allowedActor.rpc('move_project_to_workspace', {
    source_tenant_id: sourceTenantId,
    project_id: projectId,
    target_tenant_id: targetTenantId,
    expected_project_name: expectedProjectName,
  });
  mutationAttempted = true;

  add('move RPC succeeds on disposable fixture', !moveResult.error, moveResult.error?.message);
  if (moveResult.error) summarize('mutating-fixture-execution', { before });

  add('move result preserves project id', moveResult.data?.boardId === projectId, moveResult.data);
  add('move result reports source workspace', moveResult.data?.sourceWorkspaceId === sourceTenantId, moveResult.data);
  add('move result reports target workspace', moveResult.data?.targetWorkspaceId === targetTenantId, moveResult.data);
  add('move result task count matches preflight', moveResult.data?.counts?.tasks === before.tasks, moveResult.data?.counts);
  add('move result dependency count matches preflight', moveResult.data?.counts?.dependencies === before.dependencies, moveResult.data?.counts);
  add('move result document count matches preflight', moveResult.data?.counts?.documents === before.documents, moveResult.data?.counts);
  add('move result record count matches preflight', moveResult.data?.counts?.records === before.records, moveResult.data?.counts);
  add('move result revoked invite count matches preflight', moveResult.data?.counts?.revokedInvites === before.pendingInvites, moveResult.data?.counts);
  add('move result creates RAG jobs for RAG documents', moveResult.data?.counts?.ragJobsCreated >= before.ragDocuments, moveResult.data?.counts);

  const [sourceProjectAfter, targetProjectAfter] = await Promise.all([
    maybeSingle(
      serviceClient
        .from('projects')
        .select('id,tenant_id,name,metadata')
        .eq('tenant_id', sourceTenantId)
        .eq('id', projectId),
      'source project after move',
    ),
    maybeSingle(
      serviceClient
        .from('projects')
        .select('id,tenant_id,name,metadata')
        .eq('tenant_id', targetTenantId)
        .eq('id', projectId),
      'target project after move',
    ),
  ]);

  add('project no longer exists under source tenant', sourceProjectAfter === null);
  add('project exists under target tenant with same id', targetProjectAfter?.id === projectId);
  add('target project records movedFromTenantId metadata', targetProjectAfter?.metadata?.movedFromTenantId === sourceTenantId, targetProjectAfter?.metadata);

  const postMovePairs = [
    ['wbs_items', before.tasks],
    ['wbs_dependencies', before.dependencies],
    ['documents', before.documents],
    ['knowledge_records', before.records],
    ['record_task_links', before.recordTaskLinks],
  ];

  for (const [table, expected] of postMovePairs) {
    const [sourceCount, targetCount] = await Promise.all([
      countProjectScope(serviceClient, table, sourceTenantId, projectId),
      countProjectScope(serviceClient, table, targetTenantId, projectId),
    ]);
    add(`${table} source tenant rows are zero after move`, sourceCount === 0, { sourceCount });
    add(`${table} target tenant rows match preflight after move`, targetCount === expected, { targetCount, expected });
  }

  const [sourceTagsAfter, targetTagsAfter, sourceMembersAfter, targetMembersAfter, pendingInvitesAfter, revokedInvitesAfter] =
    await Promise.all([
      countProjectScope(serviceClient, 'wbs_item_tags', sourceTenantId, projectId),
      countProjectScope(serviceClient, 'wbs_item_tags', targetTenantId, projectId),
      countProjectScope(serviceClient, 'project_members', sourceTenantId, projectId),
      countProjectScope(serviceClient, 'project_members', targetTenantId, projectId),
      countRows(serviceClient, 'board_invites', [
        ['tenant_id', targetTenantId],
        ['project_id', projectId],
        ['status', 'pending'],
      ]),
      countRows(serviceClient, 'board_invites', [
        ['tenant_id', targetTenantId],
        ['project_id', projectId],
        ['status', 'revoked'],
      ]),
    ]);

  add('wbs_item_tags source tenant rows are zero after move', sourceTagsAfter === 0, { sourceTagsAfter });
  add('wbs_item_tags target tenant rows are retained after move', targetTagsAfter >= before.distinctTags, { targetTagsAfter, before });
  add('project_members source tenant rows are zero after move', sourceMembersAfter === 0, { sourceMembersAfter });
  add('project_members target tenant rows preserve target-active members', targetMembersAfter >= before.preservedMembers, { targetMembersAfter, before });
  add('pending invites are revoked after move', pendingInvitesAfter === 0, { pendingInvitesAfter });
  add('revoked invites exist after move', revokedInvitesAfter >= before.pendingInvites, { revokedInvitesAfter, before });

  const [sourceAudit, targetAudit, transferEvent] = await Promise.all([
    countRows(serviceClient, 'audit_logs', [
      ['tenant_id', sourceTenantId],
      ['entity_id', projectId],
      ['action', 'board_workspace_transferred'],
    ]),
    countRows(serviceClient, 'audit_logs', [
      ['tenant_id', targetTenantId],
      ['entity_id', projectId],
      ['action', 'board_workspace_transferred'],
    ]),
    countRows(serviceClient, 'activity_events', [
      ['tenant_id', targetTenantId],
      ['project_id', projectId],
      ['event_type', 'project_workspace_transferred'],
    ]),
  ]);

  add('source audit log exists after move', sourceAudit >= 1, { sourceAudit });
  add('target audit log exists after move', targetAudit >= 1, { targetAudit });
  add('target activity transfer event exists after move', transferEvent >= 1, { transferEvent });

  const [allowedTargetRead, sourceMemberTargetRead, targetMemberTargetRead, outsiderTargetRead] = await Promise.all([
    selectProjectAs(process.env.DEV025_QC_ALLOWED_ACTOR_ACCESS_TOKEN, targetTenantId, projectId),
    selectProjectAs(process.env.DEV025_QC_SOURCE_MEMBER_ACCESS_TOKEN, targetTenantId, projectId),
    selectProjectAs(process.env.DEV025_QC_TARGET_MEMBER_ACCESS_TOKEN, targetTenantId, projectId),
    selectProjectAs(process.env.DEV025_QC_OUTSIDER_ACCESS_TOKEN, targetTenantId, projectId),
  ]);

  add('allowed actor can read moved project under target tenant', !allowedTargetRead.error && allowedTargetRead.data.length === 1, allowedTargetRead.error?.message ?? allowedTargetRead.data);
  add('source-only member cannot read moved project under target tenant', Boolean(sourceMemberTargetRead.error) || sourceMemberTargetRead.data.length === 0, sourceMemberTargetRead.error?.message ?? sourceMemberTargetRead.data);
  add('target member can read moved project under target tenant', !targetMemberTargetRead.error && targetMemberTargetRead.data.length === 1, targetMemberTargetRead.error?.message ?? targetMemberTargetRead.data);
  add('outsider cannot read moved project under target tenant', Boolean(outsiderTargetRead.error) || outsiderTargetRead.data.length === 0, outsiderTargetRead.error?.message ?? outsiderTargetRead.data);

  summarize('mutating-fixture-execution', {
    fixture_disposition: 'left moved in target workspace; fixture must be disposable or cleaned by the QC owner',
    before,
    moveResult: moveResult.data,
  });
} catch (error) {
  add('unexpected execution error', false, error.stack ?? error.message);
  summarize('error');
}
