import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { assertSourceAppWritesPaused, renderSourceAppWriteFence } from '../../../scripts/dev139-source-write-fence.ts';

// This program runs only inside the existing nonce-owned Linux OCI namespace.
// JWT identity/claim functions are fixture scaffolding, not Supabase Auth proof.
assert.equal(process.platform, 'linux');
const database = process.env.DEV139_T07_DATABASE;
assert.match(database ?? '', /^dev139_t07_[a-f0-9]{24}$/u);
const authenticator = process.env.DEV139_T07_AUTHENTICATOR;
assert.equal(authenticator, `${database}_authenticator`);
const secret = process.env.DEV139_T07_JWT_SECRET;
assert.match(secret ?? '', /^[a-f0-9]{96}$/u);
const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner = new pg.Client({ host: '127.0.0.1', database, user: 'postgres', ssl: false });
const hash = value => createHash('sha256').update(value).digest('hex');
const source = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const paths = {
  businessClient: 'src/services/supabase/taskWorkbenchUnplacedService.ts',
  quickCaller: 'qa/dev-139/t07/legacy-quick-caller.fixture.txt',
  table: 'supabase/migrations/20260810093403_task_workbench_unplaced_items.sql',
  receipts: 'supabase/migrations/20260914120000_dev_122_quick_unplaced_task_rpc.sql',
  quickRpc: 'supabase/migrations/20261001090000_dev_133_quick_rpc_security_invoker.sql',
  fence: 'scripts/dev139-source-write-fence.ts',
  sourceFixture: 'qa/dev-139/migration/source-fixture.sql',
  sourceProjection: 'scripts/dev139-source-identity-projections.apply.sql',
  baseline: 'supabase/migrations/202605140001_initial_projed_schema.sql',
};
const fingerprints = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, { path, sha256: hash(source(path)) }]));
// These preserved sources and SDK versions were compared with the actual old
// main tree once. CI needs no shallow-checkout git-show or extra installation.
const legacySourceSha = '0670a0aee5327cd30d53f21360d577b278376028';
assert.equal(fingerprints.businessClient.sha256, '0b140171f22d966984202f5bc7329e141b301d467685275ef5958d28a1af074d');
assert.equal(fingerprints.quickCaller.sha256, '4227cadefb275b10305d3dd8d16dc5ca0cc0fe9b91e4595a8fd638e2e86c17b3');
assert.equal(fingerprints.table.sha256, '0e28a298385cd8fcf089b3485ad0107e441503b9d8e05e45a2e540df0a7a7480');
assert.equal(fingerprints.quickRpc.sha256, '4a56d7c7db047f7edb20fab05e6318b247d6393a821d8e292825cea450caee65');
const lock = JSON.parse(source('package-lock.json'));
const sdkVersion = lock.packages['node_modules/@supabase/supabase-js'].version;
assert.equal(sdkVersion, '2.105.4');
assert.equal(lock.packages['node_modules/@supabase/postgrest-js'].version, '2.105.4');
assert.equal(JSON.parse(source('node_modules/@supabase/supabase-js/package.json')).version, sdkVersion);

await owner.connect();
let gateway;
try {
  const actual = (await owner.query('SELECT current_database() AS database, session_user AS login')).rows[0];
  assert.deepEqual(actual, { database, login: 'postgres' });
  if (process.argv[2] === 'prepare') {
    const fixture = source(paths.sourceFixture).replace('\\ir ../../../scripts/dev139-source-identity-projections.apply.sql',
      source(paths.sourceProjection));
    assert.ok(!fixture.includes('\\ir'));
    await owner.query(fixture);
    const baseline = source(paths.baseline);
    const touch = baseline.slice(baseline.indexOf('create or replace function public.touch_updated_at()'));
    await owner.query(`
      CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, extensions TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      DROP TABLE public.task_workbench_unplaced_items;
      DROP TABLE private.quick_task_capture_receipts;
      ${touch.slice(0, touch.indexOf('$$;') + 3)}
      ${source(paths.table)}
      ${source(paths.receipts)}
      ${source(paths.quickRpc)}
      GRANT USAGE ON SCHEMA public TO authenticated, anon;
      GRANT SELECT ON public.tenants, public.tenant_members TO authenticated;
      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      CREATE POLICY t07_own_tenant ON public.tenants FOR SELECT TO authenticated USING (owner_id=auth.uid());
      ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
      CREATE POLICY t07_own_membership ON public.tenant_members FOR SELECT TO authenticated USING (user_id=auth.uid());
      CREATE ROLE ${authenticator} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT authenticated, anon TO ${authenticator};
      REVOKE ALL ON DATABASE ${database} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${database} TO ${authenticator};
    `);
    console.log(JSON.stringify({ status: 'PREPARED', tables: 'ORIGINAL_LEGACY_MIGRATIONS', identity: 'SYNTHETIC_JWT' }));
  } else if (process.argv[2] === 'verify') {
    const checks = [];
    const trace = [];
    const lostId = `task_workbench_unplaced_${randomUUID()}`;
    let dropCommittedResponse = true;
    // Real gateway only strips Supabase's /rest/v1 prefix. Every business
    // response comes from the real PostgREST process and its real PG transaction.
    gateway = createServer((incoming, outgoing) => {
      if (!incoming.url?.startsWith('/rest/v1/')) { outgoing.writeHead(404).end(); return; }
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        const upstream = request({ hostname: '127.0.0.1', port: 3000, method: incoming.method,
          path: incoming.url.slice('/rest/v1'.length), headers: { ...incoming.headers, host: '127.0.0.1:3000' } }, response => {
          const received = [];
          response.on('data', chunk => received.push(chunk));
          response.on('end', () => {
            const bytes = Buffer.concat(received);
            let payload;
            try { payload = JSON.parse(bytes.toString()); } catch { /* response is still forwarded verbatim */ }
            const lost = dropCommittedResponse && payload?.captureId === lostId && payload?.created === true;
            trace.push({ method: incoming.method, path: incoming.url.split('?')[0], status: response.statusCode,
              ...(payload?.code ? { code: payload.code } : {}), ...(lost ? { responseDroppedAfterRealCommit: true } : {}) });
            if (lost) { dropCommittedResponse = false; outgoing.destroy(); return; }
            outgoing.writeHead(response.statusCode, response.headers); outgoing.end(bytes);
          });
        });
        upstream.on('error', () => outgoing.destroy());
        upstream.end(body);
      });
    });
    await new Promise((done, reject) => { gateway.once('error', reject); gateway.listen(3100, '127.0.0.1', done); });
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await globalThis.fetch('http://127.0.0.1:3000/', { signal: globalThis.AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* bounded startup wait */ }
      await delay(250);
    }
    assert.equal(ready, true, 'Actual PostgREST did not become ready');
    const token = user => {
      const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const payload = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ role: 'authenticated', sub: user,
        aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })}`;
      return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    };
    const sdk = user => createClient('http://127.0.0.1:3100', 'synthetic-loopback-anon-key', {
      accessToken: async () => token(user), auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const client = sdk(ownerId);
    globalThis.__DEV139_T07_SDK = client;
    const bundle = await build({ entryPoints: [paths.businessClient], bundle: true, platform: 'node', format: 'esm', write: false,
      plugins: [{ name: 'only-fixture-auth-config', setup(builder) {
        builder.onResolve({ filter: /^\.\/client$/ }, () => ({ path: 'fixture-auth-config', namespace: 't07' }));
        builder.onLoad({ filter: /.*/, namespace: 't07' }, () => ({ contents:
          'export const isSupabaseConfigured=true; export const supabase=globalThis.__DEV139_T07_SDK;' }));
      } }] });
    const { supabaseTaskWorkbenchUnplacedService: legacy } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    // Exact old-main Quick caller, including its receipt validation and error
    // parsing. Only build-time loopback URL/key and fixture JWT are supplied.
    const quickBundle = await build({ stdin: { contents: source(paths.quickCaller), loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', write: false,
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://127.0.0.1:3100', VITE_SUPABASE_ANON_KEY: 'synthetic-loopback-anon-key' }) } });
    const { createQuickUnplacedTask } = await import(`data:text/javascript;base64,${Buffer.from(quickBundle.outputFiles[0].text).toString('base64')}`);
    const legacyQuick = id => createQuickUnplacedTask({
      capture: { captureId: id, title: 'Synthetic T07 Quick', workspaceHint: workspaceId },
      auth: { accountId: ownerId, accessToken: token(ownerId), authEpoch: 1 },
      signal: new globalThis.AbortController().signal,
    });
    const task = { id: `task_workbench_unplaced_${randomUUID()}`, workspaceId, boardId: '__task_workbench_unplaced__',
      parentId: null, title: 'Synthetic T07 original legacy write', status: 'todo', order: 0 };
    await legacy.upsert(task, ownerId);
    await legacy.upsert({ ...task, title: 'Synthetic T07 committed edit' }, ownerId);
    const row = (await owner.query('SELECT task->>\'title\' AS title FROM public.task_workbench_unplaced_items WHERE owner_id=$1 AND id=$2', [ownerId, task.id])).rows;
    assert.deepEqual(row, [{ title: 'Synthetic T07 committed edit' }]);
    assert.equal((await legacy.list()).length, 1);
    checks.push('original-legacy-sdk-upsert-edit-and-pg-readback');
    const quick = id => client.rpc('create_quick_unplaced_task_v1', { p_capture_id: id, p_title: 'Synthetic T07 Quick', p_workspace_hint: workspaceId });
    await assert.rejects(legacyQuick(lostId), error => error instanceof TypeError,
      'The intentionally lost HTTP response must remain unknown to the original Quick caller');
    assert.equal(trace.filter(item => item.responseDroppedAfterRealCommit && item.status === 200).length, 1);
    const snapshot = async () => (await owner.query(`SELECT
      (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.task_workbench_unplaced_items t) AS tasks,
      (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY capture_id),'[]') FROM private.quick_task_capture_receipts t) AS receipts`)).rows[0];
    const committed = await snapshot();
    assert.equal(committed.tasks.filter(row => row.id === lostId).length, 1);
    assert.equal(committed.receipts.filter(row => row.capture_id === lostId).length, 1);
    checks.push('real-rpc-commit-with-http-response-lost-and-pg-reconciliation');
    await owner.query(renderSourceAppWriteFence('apply'));
    await assertSourceAppWritesPaused(owner);
    const blockedTask = { ...task, id: `task_workbench_unplaced_${randomUUID()}`, title: 'Synthetic blocked insert' };
    for (const [label, operation] of [
      ['update', () => legacy.upsert({ ...task, title: 'Must not persist' }, ownerId)],
      ['insert', () => legacy.upsert(blockedTask, ownerId)], ['delete', () => legacy.remove(task.id)],
    ]) {
      const before = trace.length;
      await assert.rejects(operation(), { message: 'PROJED_SOURCE_WRITE_PAUSED' });
      assert.ok(trace.slice(before).some(item => item.status === 503 && item.code === 'PT503'), label);
    }
    const blockedCapture = `task_workbench_unplaced_${randomUUID()}`;
    await assert.rejects(legacyQuick(blockedCapture), {
      code: 'PT503', status: 503, message: 'PROJED_SOURCE_WRITE_PAUSED',
    });
    const blockedRpc = await quick(blockedCapture);
    assert.equal(blockedRpc.status, 503);
    assert.equal(blockedRpc.error?.code, 'PT503');
    assert.equal(blockedRpc.error?.message, 'PROJED_SOURCE_WRITE_PAUSED');
    assert.deepEqual(await snapshot(), committed);
    checks.push('fence-real-sdk-insert-update-delete-and-rpc-http503-pt503-zero-effects');
    const recovery = await quick(lostId);
    assert.equal(recovery.error, null);
    assert.equal(recovery.data.created, false);
    assert.equal(recovery.data.captureId, lostId);
    assert.equal(recovery.data.ownerId, ownerId);
    assert.equal(recovery.data.titleHash, hash('Synthetic T07 Quick'));
    assert.equal(recovery.data.committedAt, new Date(committed.receipts[0].committed_at).getTime());
    assert.deepEqual(await legacyQuick(lostId), recovery.data);
    assert.deepEqual(await snapshot(), committed);
    checks.push('fenced-read-only-replay-recovers-real-previous-commit-with-one-receipt');
    const other = await sdk(otherId).from('task_workbench_unplaced_items').select('id');
    assert.equal(other.error, null);
    assert.deepEqual(other.data, []);
    checks.push('real-postgrest-jwt-role-and-owner-rls-isolation');
    await owner.query(renderSourceAppWriteFence('remove'));
    await assert.rejects(assertSourceAppWritesPaused(owner), { code: 'SOURCE_APP_WRITES_NOT_PAUSED' });
    const restored = await legacyQuick(blockedCapture);
    assert.equal(restored.created, true);
    const replay = await quick(blockedCapture);
    assert.equal(replay.error, null);
    assert.deepEqual(replay.data, { ...restored, created: false });
    await legacy.upsert(blockedTask, ownerId);
    await legacy.remove(task.id);
    const final = await snapshot();
    assert.equal(final.tasks.filter(row => row.id === task.id).length, 0);
    assert.equal(final.tasks.filter(row => row.id === blockedTask.id).length, 1);
    assert.equal(final.tasks.filter(row => row.id === blockedCapture).length, 1);
    assert.equal(final.receipts.filter(row => row.capture_id === blockedCapture).length, 1);
    assert.equal(final.tasks.filter(row => row.id === lostId).length, 1);
    assert.equal(final.receipts.filter(row => row.capture_id === lostId).length, 1);
    checks.push('remove-fence-restores-original-sdk-and-same-capture-with-unique-effects');
    console.log(JSON.stringify({ status: 'PASS', evidenceLevel: 'ISOLATED_REAL_LEGACY_BUSINESS_CLIENT_POSTGREST_POSTGRES',
      identity: 'SYNTHETIC_HS256_JWT_WITH_REAL_POSTGREST_VALIDATION', legacySourceSha,
      legacyQuickCallerPath: 'src/services/supabase/quickTaskCaptureService.ts', sdkVersion, fingerprints,
      checks, trace, pgReadback: { lostResponseTasks: 1, lostResponseReceipts: 1, restoredCaptureTasks: 1, restoredCaptureReceipts: 1 },
      boundaries: { supabaseHostedAuth: 'NOT_RUN', browserOldBundle: 'NOT_RUN', fullLegacySchema: 'NOT_RUN',
        legacyBusinessClient: 'ORIGINAL_SOURCE_WITH_FIXTURE_CLIENT_AUTH_CONFIGURATION', edgeFunctions: 'NOT_RUN',
        legacyQuickCaller: 'EXACT_OLD_MAIN_SOURCE_WITH_LOOPBACK_BUILD_ENV_AND_FIXTURE_TOKEN',
        realtime: 'NOT_RUN', production: 'NOT_RUN', provider: 'NOT_RUN' } }));
  } else throw new Error('Specify prepare or verify');
} finally {
  if (gateway) await new Promise(resolve => { gateway.closeAllConnections(); gateway.close(resolve); });
  await owner.end();
}
