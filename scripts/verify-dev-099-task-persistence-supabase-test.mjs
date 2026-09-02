import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(process.cwd());
const outputDirectory = resolve(root, 'output/qa/dev-099');

const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(readFileSync(filePath, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
};

const env = { ...parseEnvFile(resolve(root, '.env.local')), ...process.env };
const verificationEnv = { ...parseEnvFile(resolve(root, '.env.p8.local')), ...process.env };
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const email = env.VITE_SUPABASE_TEST_EMAIL;
const password = env.VITE_SUPABASE_TEST_PASSWORD;
const expectedTestRef = 'fhisnnufoeulxqrchldf';
const productionRef = 'knodlkxqpcqyrtgwpdst';
const projectRef = (() => {
  try { return new URL(url).hostname.split('.')[0]; } catch { return null; }
})();
const generatedAt = new Date().toISOString();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fixtureTitle = `CAPA-001-TEST-${suffix}`;
const checks = [];
const failures = [];
const add = (id, status, expected, actual) => {
  checks.push({ id, status, expected, actual });
  if (status !== 'PASS') failures.push({ id, status });
};
const errorText = error => error?.message || String(error || 'unknown error');
const resultOrThrow = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const summarizeError = error => ({
  name: error?.name || 'Error',
  code: error?.code || null,
  status: error?.status ?? null,
  message: errorText(error).slice(0, 240),
});

const makeClient = (globalFetch) => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  ...(globalFetch ? { global: { fetch: globalFetch } } : {}),
});

const fetchTestServiceRoleKey = async () => {
  const accessToken = verificationEnv.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) return null;
  const response = await fetch(`https://api.supabase.com/v1/projects/${expectedTestRef}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const entries = Array.isArray(payload) ? payload : payload?.api_keys || [];
  const service = entries.find(entry => entry.name === 'service_role' || entry.type === 'service_role');
  return service?.api_key || service?.key || null;
};

const updateTitle = async (client, tenantId, projectId, taskId, title, select = true) => {
  let query = client.from('wbs_items')
    .update({ title })
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('id', taskId);
  if (select) query = query.select('id,title,sort_order,updated_at').single();
  return query;
};

const readTask = async (client, tenantId, projectId, taskId) => resultOrThrow(
  'canonical task readback',
  await client.from('wbs_items')
    .select('id,title,sort_order,updated_at')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('id', taskId)
    .single(),
);

const main = async () => {
  if (process.argv.includes('--cleanup-residuals')) {
    const serviceRoleKey = await fetchTestServiceRoleKey();
    if (!serviceRoleKey) throw new Error('TEST service-role key could not be resolved for residual cleanup.');
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const listed = await admin.from('tenants').select('id').ilike('name', 'CAPA-001-TEST-%');
    if (listed.error) throw new Error(`residual fixture list failed: ${listed.error.message}`);
    const ids = listed.data?.map(row => row.id).filter(Boolean) || [];
    for (const id of ids) {
      const deleted = await admin.from('tenants').delete().eq('id', id);
      if (deleted.error) throw new Error(`residual fixture delete failed: ${deleted.error.message}`);
    }
    const remaining = await admin.from('tenants').select('id').ilike('name', 'CAPA-001-TEST-%');
    const result = { environment: 'supabase-test', projectRef, removedCount: ids.length, residualCount: remaining.data?.length || 0, status: remaining.data?.length ? 'FAIL' : 'PASS', generatedAt: new Date().toISOString() };
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, 'supabase-test-residual-cleanup.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--prepare-ui-fixture')) {
    const client = makeClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session?.user) throw new Error(`TEST authentication failed: ${errorText(signIn.error)}`);
    const tenant = resultOrThrow('UI fixture tenant', await client.rpc('create_tenant_with_owner', { tenant_name: fixtureTitle }));
    const project = resultOrThrow('UI fixture project', await client.from('projects').insert({ tenant_id: tenant.id, legacy_board_id: `capa001-ui-board-${suffix}`, name: `${fixtureTitle} Board`, sort_order: 1 }).select('id,name,legacy_board_id').single());
    resultOrThrow('UI fixture project member', await client.from('project_members').upsert({ tenant_id: tenant.id, project_id: project.id, user_id: signIn.data.session.user.id, role: 'owner' }).select('project_id,user_id,role').single());
    const task = resultOrThrow('UI fixture task', await client.from('wbs_items').insert({ tenant_id: tenant.id, project_id: project.id, legacy_node_id: `capa001-ui-task-${suffix}`, title: `${fixtureTitle} initial`, status: 'todo', item_type: 'task', sort_order: 1 }).select('id,title').single());
    const peer = resultOrThrow('UI fixture peer task', await client.from('wbs_items').insert({ tenant_id: tenant.id, project_id: project.id, parent_id: task.id, legacy_node_id: `capa001-ui-peer-${suffix}`, title: `${fixtureTitle} peer`, status: 'todo', item_type: 'task', sort_order: 1 }).select('id,title').single());
    const fixture = { environment: 'supabase-test', projectRef, fixtureNamespace: fixtureTitle, tenantId: tenant.id, projectId: project.id, projectName: project.name, taskId: task.id, taskUiId: `capa001-ui-task-${suffix}`, taskTitle: task.title, peerTaskId: peer.id, peerUiId: `capa001-ui-peer-${suffix}`, peerTaskTitle: peer.title, createdAt: new Date().toISOString(), cleanup: 'node scripts/verify-dev-099-task-persistence-supabase-test.mjs --cleanup-ui-fixture' };
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, 'supabase-ui-fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(JSON.stringify({ ...fixture, userId: `${signIn.data.session.user.id.slice(0, 8)}…` }, null, 2));
    await client.auth.signOut().catch(() => undefined);
    return;
  }
  if (process.argv.includes('--cleanup-ui-fixture')) {
    const fixturePath = resolve(outputDirectory, 'supabase-ui-fixture.json');
    if (!existsSync(fixturePath)) throw new Error('UI fixture evidence file is missing.');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const serviceRoleKey = await fetchTestServiceRoleKey();
    if (!serviceRoleKey) throw new Error('TEST service-role key could not be resolved for UI fixture cleanup.');
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const deleted = await admin.from('tenants').delete().eq('id', fixture.tenantId);
    const residual = await admin.from('tenants').select('id').eq('id', fixture.tenantId).maybeSingle();
    const result = { ...fixture, cleanedAt: new Date().toISOString(), status: deleted.error || residual.data ? 'FAIL' : 'PASS', deleteError: deleted.error ? summarizeError(deleted.error) : null, residual: residual.data ? { id: residual.data.id } : null };
    writeFileSync(fixturePath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ environment: result.environment, projectRef: result.projectRef, status: result.status, residual: result.residual }, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
    return;
  }
  const base = {
    devId: 'DEV-099',
    capaId: 'CAPA-001',
    sourceRevision: 'candidate=codex/capa-001-dev099@e00d9ac45ca2096da4f73dbf6c45ef15a7f69211',
    environment: 'supabase-test-authenticated-mutation',
    provider: 'supabase',
    projectRef,
    expectedTestRef,
    productionRef,
    mutationsPerformed: false,
    fixtureNamespace: fixtureTitle,
    generatedAt,
    checks,
  };

  if (!url || !anonKey || !email || !password) {
    add('T00-test-credentials', 'BLOCKED', 'TEST URL, anon key, email and password are configured', 'missing local TEST configuration');
    base.summary = { PASS: 0, FAIL: 0, BLOCKED: 1, NOT_RUN: 8 };
    base.status = 'BLOCKED';
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, 'supabase-test-result.json'), `${JSON.stringify(base, null, 2)}\n`);
    console.log(JSON.stringify(base, null, 2));
    process.exitCode = 1;
    return;
  }
  if (projectRef !== expectedTestRef || projectRef === productionRef) {
    add('T00-project-isolation', 'BLOCKED', `project ref is ${expectedTestRef} and not production`, projectRef);
    base.summary = { PASS: 0, FAIL: 0, BLOCKED: 1, NOT_RUN: 8 };
    base.status = 'BLOCKED';
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, 'supabase-test-result.json'), `${JSON.stringify(base, null, 2)}\n`);
    console.log(JSON.stringify(base, null, 2));
    process.exitCode = 1;
    return;
  }

  const client = makeClient();
  let session;
  let tenantId;
  let projectId;
  let taskId;
  let initialTask;
  base.mutationsPerformed = true;
  try {
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session?.user) {
      add('T00-test-auth', 'BLOCKED', 'authenticated TEST user session', summarizeError(signIn.error));
      throw new Error('TEST authentication failed');
    }
    session = signIn.data.session;
    add('T00-test-auth', 'PASS', 'authenticated TEST user session', { userId: `${session.user.id.slice(0, 8)}…` });

    const tenant = resultOrThrow('create_tenant_with_owner', await client.rpc('create_tenant_with_owner', {
      tenant_name: fixtureTitle,
    }));
    tenantId = tenant.id;
    const project = resultOrThrow('fixture project insert', await client.from('projects').insert({
      tenant_id: tenantId,
      legacy_board_id: `capa001-board-${suffix}`,
      name: `${fixtureTitle} Board`,
      sort_order: 1,
    }).select('id,name,legacy_board_id').single());
    projectId = project.id;
    resultOrThrow('fixture project member insert', await client.from('project_members').upsert({
      tenant_id: tenantId,
      project_id: projectId,
      user_id: session.user.id,
      role: 'owner',
    }).select('project_id,user_id,role').single());
    initialTask = resultOrThrow('fixture task insert', await client.from('wbs_items').insert({
      tenant_id: tenantId,
      project_id: projectId,
      legacy_node_id: `capa001-task-${suffix}`,
      title: `${fixtureTitle} initial`,
      status: 'todo',
      item_type: 'task',
      sort_order: 1,
    }).select('id,title,sort_order,updated_at').single());
    taskId = initialTask.id;

    const successTitle = `${fixtureTitle} success`;
    const success = await updateTitle(client, tenantId, projectId, taskId, successTitle, false);
    const successReadback = await readTask(client, tenantId, projectId, taskId);
    add('T01-patch-204-success', success.error || successReadback.title !== successTitle ? 'FAIL' : 'PASS', 'PATCH succeeds and canonical readback returns the new value', success.error ? summarizeError(success.error) : { title: successReadback.title, taskId });

    const beforeInvalid = await readTask(client, tenantId, projectId, taskId);
    const invalid = await client.from('wbs_items').update({ sort_order: 8.5 }).eq('tenant_id', tenantId).eq('project_id', projectId).eq('id', taskId).select('id').single();
    const afterInvalid = await readTask(client, tenantId, projectId, taskId);
    add('T02-validation-reject', invalid.error && afterInvalid.sort_order === beforeInvalid.sort_order ? 'PASS' : 'FAIL', 'invalid bigint payload rejected without mutation', { error: invalid.error ? summarizeError(invalid.error) : null, beforeOrder: beforeInvalid.sort_order, afterOrder: afterInvalid.sort_order });

    const anonymous = makeClient();
    const unauthorised = await anonymous.from('wbs_items').update({ title: `${fixtureTitle} unauthorised` }).eq('id', taskId).select('id,title').maybeSingle();
    const afterUnauthorised = await readTask(client, tenantId, projectId, taskId);
    const denied = Boolean(unauthorised.error) || !unauthorised.data;
    add('T03-unauthorised-reject', denied && afterUnauthorised.title === successTitle ? 'PASS' : 'FAIL', 'anonymous update rejected or returns no row and does not mutate', { response: unauthorised.error ? summarizeError(unauthorised.error) : { data: unauthorised.data }, titleAfter: afterUnauthorised.title });

    const staleExpected = await readTask(client, tenantId, projectId, taskId);
    const currentTitle = `${fixtureTitle} current`;
    const staleTitle = `${fixtureTitle} stale`;
    const currentUpdate = await updateTitle(client, tenantId, projectId, taskId, currentTitle, false);
    const staleGuard = await client.from('wbs_items').update({ title: staleTitle }).eq('tenant_id', tenantId).eq('project_id', projectId).eq('id', taskId).eq('updated_at', staleExpected.updated_at);
    const afterStale = await readTask(client, tenantId, projectId, taskId);
    add('T04-stale-readback', currentUpdate.error || afterStale.title !== currentTitle || (staleGuard.data && staleGuard.data.title === staleTitle) ? 'FAIL' : 'PASS', 'newer canonical value is not replaced by stale conditional write', { currentUpdate: currentUpdate.error ? summarizeError(currentUpdate.error) : 'PASS', staleGuard: staleGuard.error ? summarizeError(staleGuard.error) : { data: staleGuard.data }, finalTitle: afterStale.title });

    const abortFetch = async (input, init) => {
      const requestUrl = String(input?.url || input || '');
      if (requestUrl.includes('/rest/v1/wbs_items') && String(init?.method || '').toUpperCase() === 'PATCH') {
        throw new DOMException('simulated network abort before commit', 'AbortError');
      }
      return fetch(input, init);
    };
    const abortClient = makeClient(abortFetch);
    await abortClient.auth.setSession(session);
    const abortAttempt = await updateTitle(abortClient, tenantId, projectId, taskId, `${fixtureTitle} aborted`, false);
    const afterAbort = await readTask(client, tenantId, projectId, taskId);
    add('T05-network-abort', abortAttempt.error && afterAbort.title === currentTitle ? 'PASS' : 'FAIL', 'pre-commit network abort yields failure and preserves canonical value', { error: abortAttempt.error ? summarizeError(abortAttempt.error) : null, titleAfter: afterAbort.title });

    let lostOnce = true;
    const responseLostFetch = async (input, init) => {
      const requestUrl = String(input?.url || input || '');
      const isPatch = requestUrl.includes('/rest/v1/wbs_items') && String(init?.method || '').toUpperCase() === 'PATCH';
      const response = await fetch(input, init);
      if (isPatch && lostOnce) {
        lostOnce = false;
        throw new Error('simulated response lost after server commit');
      }
      return response;
    };
    const lostClient = makeClient(responseLostFetch);
    await lostClient.auth.setSession(session);
    const lostTitle = `${fixtureTitle} response-lost committed`;
    const lostAttempt = await updateTitle(lostClient, tenantId, projectId, taskId, lostTitle, false);
    const afterLost = await readTask(client, tenantId, projectId, taskId);
    add('T06-commit-response-lost', lostAttempt.error && afterLost.title === lostTitle ? 'PASS' : 'FAIL', 'server commit survives lost response and canonical readback finds it', { clientError: lostAttempt.error ? summarizeError(lostAttempt.error) : null, readbackTitle: afterLost.title });

    const parallelA = `${fixtureTitle} parallel-A`;
    const parallelB = `${fixtureTitle} parallel-B`;
    const parallel = await Promise.all([
      updateTitle(client, tenantId, projectId, taskId, parallelA, false),
      updateTitle(client, tenantId, projectId, taskId, parallelB, false),
    ]);
    const afterParallel = await readTask(client, tenantId, projectId, taskId);
    add('T07-readback-current-wins', parallel.every(result => !result.error) && [parallelA, parallelB].includes(afterParallel.title) ? 'PASS' : 'FAIL', 'concurrent writes settle and canonical readback is one of the submitted current values', { requests: parallel.map(result => result.error ? summarizeError(result.error) : 'PASS'), finalTitle: afterParallel.title });

    await client.auth.signOut();
    const reloadClient = makeClient();
    const relogin = await reloadClient.auth.signInWithPassword({ email, password });
    const reloaded = relogin.error ? null : await readTask(reloadClient, tenantId, projectId, taskId);
    add('T08-authenticated-reload', Boolean(reloaded) && reloaded.id === taskId && reloaded.title === afterParallel.title ? 'PASS' : 'FAIL', 'authenticated reload returns same task and canonical title', reloaded ? { taskId: reloaded.id, title: reloaded.title } : summarizeError(relogin.error));
    await reloadClient.auth.signOut().catch(() => undefined);
  } catch (error) {
    const existing = checks.find(check => check.id === 'T00-test-auth');
    if (!existing) add('T00-test-run', 'FAIL', 'TEST fixture matrix completes', summarizeError(error));
    else add('T00-test-run', 'FAIL', 'TEST fixture matrix completes', summarizeError(error));
  } finally {
    if (tenantId) {
      const cleanupClient = makeClient();
      if (session) await cleanupClient.auth.setSession(session).catch(() => undefined);
      let cleanup = await cleanupClient.rpc('delete_workspace', { target_tenant_id: tenantId });
      let adminCleanup = null;
      let residual = await cleanupClient.from('tenants').select('id').eq('id', tenantId).maybeSingle();
      if (cleanup.error || residual.data) {
        const serviceRoleKey = await fetchTestServiceRoleKey();
        if (serviceRoleKey) {
          const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
          adminCleanup = await admin.from('tenants').delete().eq('id', tenantId);
          residual = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
        }
      }
      add('T09-fixture-cleanup', !residual.data && (!cleanup.error || !adminCleanup?.error) ? 'PASS' : 'FAIL', 'fixture tenant is deleted and no residual tenant remains', { rpc: cleanup.error ? summarizeError(cleanup.error) : 'PASS', adminFallback: adminCleanup ? (adminCleanup.error ? summarizeError(adminCleanup.error) : 'PASS') : null, residual: residual.data ? { id: residual.data.id } : null });
      await cleanupClient.auth.signOut().catch(() => undefined);
    }
  }

  const summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map(status => [status, checks.filter(check => check.status === status).length]));
  const status = summary.FAIL ? 'FAIL' : summary.BLOCKED ? 'BLOCKED' : 'PASS';
  const artifact = { ...base, status, passed: status === 'PASS', checks, summary, failedCaseIds: failures.filter(item => item.status === 'FAIL').map(item => item.id), mutationsPerformed: Boolean(tenantId || checks.some(check => check.id.startsWith('T0') && check.status === 'PASS')) };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'supabase-test-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(artifact, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
};

await main();
