import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(process.cwd());
const outputDirectory = resolve(root, 'output/qa/dev-110');
const expectedTestRef = 'fhisnnufoeulxqrchldf';
const productionRef = 'knodlkxqpcqyrtgwpdst';

const parseEnvFile = filePath => {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(readFileSync(filePath, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
};

const env = { ...parseEnvFile(resolve(root, '.env.local')), ...process.env };
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const email = env.VITE_SUPABASE_TEST_EMAIL;
const password = env.VITE_SUPABASE_TEST_PASSWORD;
const projectRef = (() => {
  try { return new URL(url).hostname.split('.')[0]; } catch { return null; }
})();
const sourceRevision = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
})();

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const fixtureNamespace = `DEV-110-SUPABASE-TEST-${suffix}`;
const checks = [];
const failures = [];
const fixture = { tenantId: null, projectAId: null, projectBId: null, unplacedIds: [], recordIds: [], taskIds: [] };
const requestTrace = [];

const errorText = error => error?.message || String(error || 'unknown error');
const errorSummary = error => ({
  name: error?.name || 'Error',
  code: error?.code || null,
  status: error?.status ?? null,
  message: errorText(error).slice(0, 240),
});
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const stable = value => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
});
const fingerprint = value => `sha256:${crypto.createHash('sha256').update(stable(value)).digest('hex')}`;
const check = (id, status, expected, actual) => {
  checks.push({ id, status, expected, actual });
  if (status !== 'PASS') failures.push({ id, status });
};
const assertResult = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const makeClient = fetchImpl => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
});

const traceFetch = async (input, init) => {
  const requestUrl = String(input?.url || input || '');
  const method = String(init?.method || 'GET').toUpperCase();
  requestTrace.push({ method, path: requestUrl.replace(/^https?:\/\/[^/]+/i, '') });
  return fetch(input, init);
};

const readTable = async (client, table, columns, filters = []) => {
  let query = client.from(table).select(columns);
  filters.forEach(([method, column, value]) => { query = query[method](column, value); });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

const createBoard = async (client, tenantId, name) => {
  const project = assertResult('project insert', await client.from('projects').insert({
    tenant_id: tenantId,
    legacy_board_id: `dev110-board-${suffix}-${name.toLowerCase()}`,
    name,
    sort_order: name === 'A' ? 1 : 2,
  }).select('id,name,legacy_board_id').single());
  const user = assertResult('current user', await client.auth.getUser());
  assertResult('project member insert', await client.from('project_members').upsert({
    tenant_id: tenantId,
    project_id: project.id,
    user_id: user.user.id,
    role: 'owner',
  }).select('project_id,user_id,role').single());
  return project;
};

const createUnplaced = async (client, id, title) => {
  const task = {
    id,
    workspaceId: fixture.tenantId,
    boardId: '__task_workbench_unplaced__',
    parentId: null,
    title,
    description: title,
    status: 'todo',
    nodeType: 'task',
    order: fixture.unplacedIds.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  assertResult('unplaced fixture insert', await client.from('task_workbench_unplaced_items').insert({
    owner_id: fixture.userId,
    id,
    workspace_id: fixture.tenantId,
    task,
    sort_order: task.order,
  }).select('id').single());
  fixture.unplacedIds.push(id);
  return task;
};

const createPlacementCommand = async (client, taskId) => assertResult(
  'unplaced to board placement RPC',
  await client.rpc('move_task_workbench_subtree_v2', {
    p_operation_id: `dev110-place-${suffix}`,
    p_root_task_id: taskId,
    p_expected_subtree_ids: [taskId],
    p_source_kind: 'account_unplaced',
    p_source_workspace_id: null,
    p_source_board_id: null,
    p_target_kind: 'board',
    p_target_workspace_id: fixture.tenantId,
    p_target_board_id: fixture.projectAId,
    p_target_parent_task_id: null,
    p_anchor_task_id: null,
    p_position: 'append',
    p_client_platform: 'desktop',
  }),
);

const resolveLink = async (client, projectId, nodeId) => {
  let query = client.from('wbs_items').select('id,legacy_node_id').eq('tenant_id', fixture.tenantId).eq('project_id', projectId);
  query = isUuid(nodeId) ? query.eq('id', nodeId) : query.eq('legacy_node_id', nodeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
};

const preflightLinks = async (client, projectId, links) => {
  const resolved = await Promise.all(links.map(async link => ({
    ...link,
    itemId: await resolveLink(client, projectId, link.nodeId),
  })));
  return { resolved, unresolved: Array.from(new Set(resolved.filter(link => !link.itemId).map(link => link.nodeId))) };
};

const recordInput = (id, title, content) => ({
  legacy_record_id: id,
  tenant_id: fixture.tenantId,
  project_id: fixture.projectAId,
  record_type: 'meeting',
  title,
  content,
  occurred_at: new Date().toISOString(),
  status: 'draft',
  visibility: 'private',
  rag_enabled: false,
  metadata: { fixtureNamespace, recordCase: id },
  recorded_by: fixture.userId,
  created_by: fixture.userId,
  updated_by: fixture.userId,
});

const insertRecord = async (client, id, title, content, projectId = fixture.projectAId) => {
  const input = { ...recordInput(id, title, content), project_id: projectId };
  const record = assertResult(`record ${id} insert`, await client.from('knowledge_records').insert(input).select('*').single());
  fixture.recordIds.push(record.id);
  return record;
};

const insertLinks = async (client, recordId, projectId, links) => assertResult(
  `record ${recordId} link insert`,
  await client.from('record_task_links').insert(links.map(link => ({
    tenant_id: fixture.tenantId,
    project_id: projectId,
    record_id: recordId,
    item_id: link.itemId,
    role: link.role,
    created_by: fixture.userId,
  }))).select('record_id,item_id,role').order('item_id'),
);

const recordSnapshot = async client => {
  const records = await readTable(client, 'knowledge_records', 'id,legacy_record_id,title,content,status,visibility,metadata,updated_at', [['eq', 'tenant_id', fixture.tenantId]]);
  const links = await readTable(client, 'record_task_links', 'record_id,item_id,role,project_id', [['eq', 'tenant_id', fixture.tenantId]]);
  return { records: records.sort((a, b) => a.id.localeCompare(b.id)), links: links.sort((a, b) => `${a.record_id}:${a.item_id}:${a.role}`.localeCompare(`${b.record_id}:${b.item_id}:${b.role}`)) };
};

const readSourceHistory = async (client, projectId, itemId) => {
  const rows = await readTable(client, 'record_task_links', 'record_id,item_id,role,project_id,record:knowledge_records!record_task_links_record_id_fkey(id,title,status,content)', [
    ['eq', 'tenant_id', fixture.tenantId],
    ['eq', 'project_id', projectId],
    ['eq', 'item_id', itemId],
  ]);
  return rows;
};

const cleanup = async client => {
  const cleanupErrors = [];
  for (const id of fixture.unplacedIds) {
    const { error } = await client.from('task_workbench_unplaced_items').delete().eq('owner_id', fixture.userId).eq('id', id);
    if (error) cleanupErrors.push(`unplaced:${id}:${error.message}`);
  }
  if (fixture.tenantId) {
    const { error } = await client.rpc('delete_workspace', { target_tenant_id: fixture.tenantId });
    if (error) cleanupErrors.push(`tenant:${error.message}`);
  }
  const residualUnplaced = await client.from('task_workbench_unplaced_items').select('id').eq('owner_id', fixture.userId).in('id', fixture.unplacedIds);
  if (residualUnplaced.error) cleanupErrors.push(`residual-unplaced:${residualUnplaced.error.message}`);
  if ((residualUnplaced.data ?? []).length > 0) cleanupErrors.push(`residual-unplaced-count:${residualUnplaced.data.length}`);
  const residualTenant = fixture.tenantId
    ? await client.from('tenants').select('id').eq('id', fixture.tenantId).maybeSingle()
    : { data: null, error: null };
  if (residualTenant.error) cleanupErrors.push(`residual-tenant:${residualTenant.error.message}`);
  if (residualTenant.data) cleanupErrors.push(`residual-tenant-id:${residualTenant.data.id}`);
  return { status: cleanupErrors.length ? 'FAIL' : 'PASS', errors: cleanupErrors };
};

const main = async () => {
  const base = {
    devId: 'DEV-110',
    sourceRevision,
    environment: 'supabase-test-authenticated-mutation',
    provider: 'supabase',
    projectRef,
    expectedTestRef,
    productionRef,
    fixtureNamespace,
    mutationsPerformed: false,
    startedAt: new Date().toISOString(),
  };
  let client;
  let session = null;
  let cleanupResult = { status: 'NOT_RUN', errors: ['test did not start'] };
  try {
    if (!url || !anonKey || !email || !password) {
      check('T00-test-credentials', 'BLOCKED', 'TEST URL, anon key, email and password are configured', 'missing local TEST configuration');
      return;
    }
    if (projectRef !== expectedTestRef || projectRef === productionRef) {
      check('T00-project-isolation', 'BLOCKED', `project ref is ${expectedTestRef} and not production`, projectRef);
      return;
    }
    client = makeClient(traceFetch);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session?.user) throw new Error(`TEST authentication failed: ${errorText(signIn.error)}`);
    session = signIn.data.session;
    fixture.userId = session.user.id;
    check('T00-test-auth', 'PASS', 'authenticated TEST user session', { userId: `${fixture.userId.slice(0, 8)}…` });

    const capability = assertResult('tracking capability RPC', await client.rpc('get_task_tracking_reference_capability_v1'));
    check('T00-schema-readiness', capability?.supported === true ? 'PASS' : 'FAIL', 'tracking capability supported', capability);

    const tenant = assertResult('fixture tenant', await client.rpc('create_tenant_with_owner', { tenant_name: fixtureNamespace }));
    fixture.tenantId = tenant.id;
    fixture.projectAId = (await createBoard(client, fixture.tenantId, 'A')).id;
    fixture.projectBId = (await createBoard(client, fixture.tenantId, 'B')).id;
    base.mutationsPerformed = true;

    const u1Id = `task_workbench_unplaced_dev110_u1_${suffix}`;
    const u2Id = `task_workbench_unplaced_dev110_u2_${suffix}`;
    const u1 = await createUnplaced(client, u1Id, `${fixtureNamespace} U1`);

    requestTrace.length = 0;
    const instrumentedClient = makeClient(traceFetch);
    await instrumentedClient.auth.setSession(session);
    const unplacedRead = await instrumentedClient.from('task_workbench_unplaced_items').select('id,task').eq('owner_id', fixture.userId).eq('id', u1.id).single();
    const t01ProviderPaths = requestTrace.map(item => item.path).filter(path => /knowledge_records|record_task_links|wbs_items/i.test(path));
    check('T01-unplaced-no-record-query', !unplacedRead.error && t01ProviderPaths.length === 0 ? 'PASS' : 'FAIL', 'unplaced detail boundary performs no record/task-scoped provider query', { unplacedRead: unplacedRead.error ? errorSummary(unplacedRead.error) : 'PASS', forbiddenProviderPaths: t01ProviderPaths });

    const placement = await createPlacementCommand(client, u1.id);
    const placedTask = assertResult('placed task readback', await client.from('wbs_items').select('id,legacy_node_id,project_id').eq('tenant_id', fixture.tenantId).eq('project_id', fixture.projectAId).eq('legacy_node_id', u1.id).single());
    const remainingU1 = await client.from('task_workbench_unplaced_items').select('id').eq('owner_id', fixture.userId).eq('id', u1.id).maybeSingle();
    const primary = assertResult('primary placement readback', await client.from('wbs_item_placements').select('id,task_id,project_id,placement_kind,revision').eq('tenant_id', fixture.tenantId).eq('task_id', placedTask.id).eq('placement_kind', 'primary').is('removed_at', null).single());
    fixture.taskIds.push(placedTask.id);
    check('T02-authoritative-placement', placement?.status === 'committed' && placedTask.legacy_node_id === u1.id && placedTask.project_id === fixture.projectAId && !remainingU1.data && primary.project_id === fixture.projectAId ? 'PASS' : 'FAIL', 'official placement RPC moves U1 into Board A and creates primary placement', { placementStatus: placement?.status, task: placedTask, remainingUnplaced: remainingU1.data, primaryPlacementId: primary.id });

    const referenceResult = assertResult('tracking reference create', await client.rpc('create_task_tracking_reference_v1', {
      p_operation_id: `dev110-reference-${suffix}`,
      p_source_primary_placement_id: primary.id,
      p_expected_revision: null,
      p_client_platform: 'web',
      p_tenant_id: fixture.tenantId,
    }));
    const reference = referenceResult?.reference;
    const sourceRecord = await insertRecord(client, `dev110-a1-history-${suffix}`, `${fixtureNamespace} A1 history`, 'source-board history');
    await insertLinks(client, sourceRecord.id, fixture.projectAId, [{ itemId: placedTask.id, role: 'main' }]);
    const sourceHistory = await readSourceHistory(client, fixture.projectAId, placedTask.id);
    const movedReference = assertResult('tracking reference move', await client.rpc('move_task_tracking_reference_v1', {
      p_operation_id: `dev110-reference-move-${suffix}`,
      p_reference_root_placement_id: reference.id,
      p_expected_subtree_ids: [reference.id],
      p_expected_revision: reference.revision,
      p_target_project_id: fixture.projectBId,
      p_target_parent_placement_id: null,
      p_anchor_placement_id: null,
      p_position: 'append',
      p_client_platform: 'web',
      p_tenant_id: fixture.tenantId,
    }));
    const targetHistory = await readSourceHistory(client, fixture.projectBId, placedTask.id);
    check('T03-reference-source-board-history', reference?.task_id === placedTask.id && movedReference?.reference?.project_id === fixture.projectBId && sourceHistory.length === 1 && targetHistory.length === 0 && sourceHistory[0].record?.title === sourceRecord.title ? 'PASS' : 'FAIL', 'tracking reference keeps record history scoped to canonical source Board A', { sourceHistoryCount: sourceHistory.length, targetHistoryCount: targetHistory.length, sourceRecordTitle: sourceHistory[0]?.record?.title, movedReferenceProjectId: movedReference?.reference?.project_id });

    await createUnplaced(client, u2Id, `${fixtureNamespace} U2`);
    const beforeT04 = await recordSnapshot(client);
    const t04Preflight = await preflightLinks(client, fixture.projectAId, [{ nodeId: u2Id, role: 'main' }]);
    const afterT04 = await recordSnapshot(client);
    check('T04-unresolved-new-record-zero-mutation', t04Preflight.unresolved.length === 1 && fingerprint(beforeT04) === fingerprint(afterT04) ? 'PASS' : 'FAIL', 'unplaced link is rejected before record/link mutation', { unresolved: t04Preflight.unresolved, beforeFingerprint: fingerprint(beforeT04), afterFingerprint: fingerprint(afterT04) });

    const existingRecord = await insertRecord(client, `dev110-e1-${suffix}`, `${fixtureNamespace} E1`, 'E1 immutable body');
    await insertLinks(client, existingRecord.id, fixture.projectAId, [{ itemId: placedTask.id, role: 'main' }]);
    const beforeT05 = await recordSnapshot(client);
    const t05Preflight = await preflightLinks(client, fixture.projectAId, [{ nodeId: placedTask.id, role: 'main' }, { nodeId: u2Id, role: 'related' }]);
    const afterT05 = await recordSnapshot(client);
    check('T05-existing-record-preflight-zero-mutation', t05Preflight.unresolved.length === 1 && fingerprint(beforeT05) === fingerprint(afterT05) ? 'PASS' : 'FAIL', 'mixed resolved/unresolved update is rejected before mutation and preserves E1', { unresolved: t05Preflight.unresolved, beforeFingerprint: fingerprint(beforeT05), afterFingerprint: fingerprint(afterT05) });

    const happyRecord = await insertRecord(client, `dev110-t06-happy-${suffix}`, `${fixtureNamespace} T06`, 'T06 create');
    const happyLinks = await insertLinks(client, happyRecord.id, fixture.projectAId, [{ itemId: placedTask.id, role: 'main' }]);
    const updated = assertResult('T06 update', await client.from('knowledge_records').update({ title: `${fixtureNamespace} T06 updated`, content: 'T06 update' }).eq('tenant_id', fixture.tenantId).eq('id', happyRecord.id).select('id,title,content,status').single());
    const archived = assertResult('T06 archive', await client.from('knowledge_records').update({ status: 'archived', rag_enabled: false }).eq('tenant_id', fixture.tenantId).eq('id', happyRecord.id).select('id,status').single());
    const happyReadback = await readTable(client, 'record_task_links', 'record_id,item_id,role', [['eq', 'tenant_id', fixture.tenantId], ['eq', 'record_id', happyRecord.id]]);
    check('T06-resolved-create-update-archive-exact-set', happyLinks.length === 1 && updated.title.includes('T06 updated') && archived.status === 'archived' && happyReadback.length === 1 && happyReadback[0].item_id === placedTask.id && happyReadback[0].role === 'main' ? 'PASS' : 'FAIL', 'resolved record lifecycle preserves exact task-link set and archives normally', { updated, archived, requestedLinks: [{ itemId: placedTask.id, role: 'main' }], persistedLinks: happyReadback });

    const faultRecord = await insertRecord(client, `dev110-t06-fault-${suffix}`, `${fixtureNamespace} T06 fault`, 'fault injection copy');
    const faultClient = makeClient(async (input, init) => {
      const requestUrl = String(input?.url || input || '');
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'POST' && /\/rest\/v1\/record_task_links(?:\?|$)/i.test(requestUrl)) {
        throw new Error('DEV-110 injected post-preflight record link failure');
      }
      return fetch(input, init);
    });
    await faultClient.auth.setSession(session);
    const faultPreflight = await preflightLinks(faultClient, fixture.projectAId, [{ nodeId: placedTask.id, role: 'main' }]);
    let faultError = null;
    if (faultPreflight.unresolved.length === 0) {
      try {
        const faultInsert = await faultClient.from('record_task_links').insert([{ tenant_id: fixture.tenantId, project_id: fixture.projectAId, record_id: faultRecord.id, item_id: placedTask.id, role: 'main', created_by: fixture.userId }]).select('record_id').single();
        assertResult('injected post-preflight link failure', faultInsert);
      } catch (error) {
        faultError = error;
      }
    }
    const faultReadback = await readTable(client, 'record_task_links', 'record_id,item_id,role', [['eq', 'tenant_id', fixture.tenantId], ['eq', 'record_id', faultRecord.id]]);
    check('T06-post-preflight-fault-never-success', faultPreflight.unresolved.length === 0 && Boolean(faultError) && faultReadback.length === 0 ? 'PASS' : 'FAIL', 'post-preflight link failure is not reported as success and leaves no partial link state', { faultError: faultError ? errorSummary(faultError) : null, faultReadback });
  } catch (error) {
    check('T00-test-run', 'FAIL', 'T01-T06 integration matrix completes', errorSummary(error));
  } finally {
    if (client && fixture.userId) {
      cleanupResult = await cleanup(client).catch(error => ({ status: 'FAIL', errors: [errorText(error)] }));
      check('T07-fixture-cleanup', cleanupResult.status, 'TEST fixture tenant and unplaced rows have zero residuals', cleanupResult);
      await client.auth.signOut().catch(() => undefined);
    }
  }

  const summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map(status => [status, checks.filter(item => item.status === status).length]));
  const status = summary.FAIL > 0 ? 'FAIL' : summary.BLOCKED > 0 ? 'BLOCKED' : 'PASS';
  const artifact = {
    ...base,
    status,
    passed: status === 'PASS',
    checks,
    summary,
    failedCaseIds: failures.filter(item => item.status === 'FAIL').map(item => item.id),
    fixture: {
      tenantId: fixture.tenantId,
      projectAId: fixture.projectAId,
      projectBId: fixture.projectBId,
      taskIds: fixture.taskIds,
      recordIds: fixture.recordIds,
      unplacedIds: fixture.unplacedIds,
      actor: fixture.userId ? `${fixture.userId.slice(0, 8)}…` : null,
    },
    requestTrace: requestTrace.filter(item => !/apikey|authorization/i.test(stable(item))),
    cleanup: cleanupResult,
    finishedAt: new Date().toISOString(),
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'supabase-test-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(artifact, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
};

await main();
