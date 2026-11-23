/* global indexedDB, window, document */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_QUICK_SOURCE_REVISION = '1437a25c74e10daf8530c3b099742297712175ce';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

export function verifyQuickUpgradeSources(legacyRoot, candidateRoot) {
  assert.equal(git(legacyRoot, 'rev-parse', 'HEAD'), LEGACY_QUICK_SOURCE_REVISION, 'A must use the fixed old main source');
  // Only the scripts imported by Vite are frontend build inputs. The QA runner
  // itself can be under review without misrepresenting a changed product build.
  const roots = ['src', 'public', 'quick-task', 'scripts/pwa-version-entry.mjs',
    'scripts/pwa-worker-version-source.mjs', 'scripts/pwa-manifest-cache-source.mjs',
    'index.html', 'vite.config.js', 'tsconfig.json', 'package.json', 'package-lock.json'];
  const source = (root, backend) => {
    assert.equal(git(root, 'diff', '--name-only', 'HEAD', '--', ...roots), '', 'Build inputs must be committed');
    return { revision: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'), backend,
      lockfileSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
      viteConfigSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'vite.config.js'))).digest('hex'),
      dependencies: 'OWN_LOCKFILE_INSTALL' };
  };
  return { legacy: source(legacyRoot, 'supabase'), candidate: source(candidateRoot, 'http') };
}

export async function runQuickBackendUpgrade({ context, origin, output, publish, loaded, workerVersion, refreshCheck, record, liveBackend = null,
  sourceCommitted = false }) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const sourceOrigin = 'http://127.0.0.1:47971';
  const owner = liveBackend?.owner ?? '11111111-1111-4111-8111-111111111111';
  const other = liveBackend?.other ?? '22222222-2222-4222-8222-222222222222';
  if (liveBackend) {
    for (const id of [owner, other, liveBackend.ownerContext]) assert.match(id, /^[a-f0-9-]{36}$/u);
    assert.ok(liveBackend.proofPath, 'A06 native reconciliation output is required');
  }
  if (sourceCommitted) assert.ok(liveBackend?.sourceFixture, 'Committed source recovery requires the real nonce PostgreSQL fixture');
  const scenario = sourceCommitted ? 'source-committed-response-lost' : 'offline-uncommitted';
  const title = sourceCommitted ? 'A06 舊端已提交但回覆遺失 🧭' : 'A06 已保存未同步的原任務 🧭';
  const image = name => path.join(output, `A06-${sourceCommitted ? 'source-committed-' : ''}${name}.png`);
  const proofPath = sourceCommitted ? liveBackend?.proofPath + '.source-committed.json' : liveBackend?.proofPath;
  let committedSourceReceipt = null, migrationProof = null;
  const sourceFixture = async (operation, body) => {
    const endpoint = new URL(liveBackend.sourceFixture);
    assert.equal(endpoint.protocol, 'http:'); assert.equal(endpoint.hostname, '127.0.0.1');
    assert.ok(endpoint.port && /^\/[a-f0-9-]{36}$/.test(endpoint.pathname) && !endpoint.search && !endpoint.hash
      && !endpoint.username && !endpoint.password, 'Source fixture must be the existing bounded loopback endpoint');
    const response = await fetch(endpoint.href + '/' + operation, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), redirect: 'error' });
    assert.equal(response.status, 200, `Nonce source fixture ${operation} failed`);
    return response.json();
  };
  let httpAccount = other;
  let sourceUnavailable = false;
  const sourceCalls = [], targetCalls = [], unexpected = [], pageErrors = [];
  const receipts = new Map();
  let targetEffects = 0;
  const page = context.pages()[0];
  const selectTargetAccount = async isOwner => {
    httpAccount = isOwner ? owner : other;
    if (liveBackend) await context.addCookies([{ name: '__session',
      value: isOwner ? 'qa-upgrade-owner' : 'qa-upgrade-other', url: origin + '/' }]);
  };
  await selectTargetAccount(false);
  page.on('pageerror', error => pageErrors.push(error.message));
  const user = id => ({ id, aud: 'authenticated', role: 'authenticated', email: 'a06@fixture.invalid',
    app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner,
    aud: 'authenticated', exp: expiresAt, session_id: owner })}.local-simulation`,
  refresh_token: 'local-simulation-only', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: user(owner) };
  await context.addInitScript(session => {
    if (!localStorage.getItem('sb-127-auth-token')) localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  }, session);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (url.origin === sourceOrigin) {
      if (sourceUnavailable) return route.abort('internetdisconnected');
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers, json: user(owner) });
      if (url.pathname === '/rest/v1/rpc/create_quick_unplaced_task_v1') {
        const body = request.postDataJSON(); sourceCalls.push(body);
        if (sourceCommitted) {
          committedSourceReceipt = await sourceFixture('commit', body);
          sourceUnavailable = true;
          // The actual old UI submitted this RPC and PG committed first. Drop
          // only its browser response; never manufacture a capture in IDB.
          return route.abort('connectionreset');
        }
        // This ordinary unavailable response never commits anything. The
        // explicit source-write pause/fence is verified separately.
        return route.fulfill({ status: 503, headers, json: { message: 'ISOLATED_SOURCE_UNAVAILABLE' } });
      }
    } else if (url.origin === origin) {
      if (url.pathname === '/api/v1/session' && liveBackend) return route.continue();
      if (url.pathname === '/api/v1/session') return route.fulfill({ json: { data: { localUserId: httpAccount,
        authContextId: httpAccount, entry: 'main', createdAt: 1704067200000, expiresAt: Date.now() + 600000,
        email: 'a06@fixture.invalid', displayName: 'A06 synthetic Session' } } });
      if (url.pathname === '/api/v1/quick-tasks') {
        const body = request.postDataJSON();
        targetCalls.push({ ...body, account: httpAccount });
        assert.equal(httpAccount, owner, 'Another account dispatched the original owner draft');
        const headers = await request.allHeaders();
        assert.equal(headers['x-projed-expected-account-id'], owner);
        assert.equal(headers['x-projed-expected-context-id'], liveBackend?.ownerContext ?? owner);
        if (liveBackend) return route.continue();
        const hash = createHash('sha256').update(body.title).digest('hex');
        const existing = receipts.get(body.captureId);
        if (!existing) {
          targetEffects++;
          receipts.set(body.captureId, { status: 'committed', captureId: body.captureId, ownerId: owner,
            titleHash: hash, created: true, committedAt: Date.now() });
        } else assert.equal(existing.titleHash, hash);
        return route.fulfill({ json: { data: { ...receipts.get(body.captureId), created: !existing } } });
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
    }
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  const readLocal = () => page.evaluate(async () => {
    const request = indexedDB.open('projed-quick-task-v1');
    const db = await new Promise((yes, no) => { request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error); });
    try {
      const tx = db.transaction(['captures', 'auth_context']);
      const captures = tx.objectStore('captures').getAll(), binding = tx.objectStore('auth_context').get('current');
      await new Promise((yes, no) => { tx.oncomplete = yes; tx.onabort = () => no(tx.error); });
      return { captures: captures.result, binding: binding.result, version: db.version };
    } finally { db.close(); }
  });
  const waitLocal = async predicate => {
    for (let attempt = 0; attempt < 120; attempt++) {
      const snapshot = await readLocal();
      if (predicate(snapshot)) return snapshot;
      await page.waitForTimeout(100);
    }
    throw new Error('Expected durable Quick state was not reached');
  };
  publish('A');
  await page.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(page, 'A');
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  await waitLocal(value => value.binding?.bindingAllowed && value.binding.accountId === owner);
  await workerVersion(page, 'A');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loaded(page, 'A');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  await page.waitForLoadState('networkidle');
  if (!sourceCommitted) {
    sourceUnavailable = true;
    await context.setOffline(true);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
  }
  await page.getByRole('textbox', { name: '任務名稱' }).fill(title);
  await page.getByRole('button', { name: '建立', exact: true }).click();
  const old = await waitLocal(value => value.captures.length === 1 && value.captures[0].accountId === owner);
  const original = old.captures[0];
  assert.equal(original.title, title);
  assert.notEqual(original.state, 'synced');
  assert.equal(targetCalls.length, 0);
  if (sourceCommitted) {
    await waitLocal(value => committedSourceReceipt && value.captures[0].leaseId === null);
    assert.equal(committedSourceReceipt.captureId, original.captureId);
    assert.equal(committedSourceReceipt.ownerId, owner);
    assert.equal(committedSourceReceipt.titleHash, createHash('sha256').update(title).digest('hex'));
    migrationProof = await sourceFixture('snapshot-import', {});
    assert.equal(migrationProof.sourceCommits, 1);
    assert.equal(migrationProof.migration.matches, true);
    assert.equal(migrationProof.migration.sourceDigest, migrationProof.migration.targetDigest);
    assert.deepEqual(migrationProof.sourceReceipt, committedSourceReceipt);
  }
  await page.screenshot({ path: image('old-offline-saved') });
  record(sourceCommitted ? 'A06-source-committed-capture' : 'A06-old-offline-capture', { scenario, backend: 'supabase', workerControlled: true, databaseVersion: old.version,
    captureId: original.captureId, accountId: original.accountId,
    titleHash: createHash('sha256').update(title).digest('hex'), state: original.state });
  await context.setOffline(false);
  // The app origin can fetch its new worker/assets while the retired source
  // remains unreachable. Do not manufacture a 503 retry/backoff on the old
  // record just to stage the update; source-fence behavior is tested separately.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitLocal(value => value.captures[0].leaseId === null);
  publish('B');
  await refreshCheck(page);
  await workerVersion(page, 'B', 'waiting');
  await page.locator('[data-quick-install-menu] summary').click();
  await page.locator('[data-quick-update-reload]').waitFor({ state: 'visible' });
  await page.locator('[data-quick-update-reload]').click();
  await loaded(page, 'B');
  await workerVersion(page, 'B');
  await workerVersion(page, 'B', 'controller');
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  const wrongAccount = await waitLocal(value => value.binding?.accountId === other);
  const sameOriginal = capture => capture.captureId === original.captureId && capture.accountId === owner
    && capture.title === original.title && capture.clientCreatedAt === original.clientCreatedAt;
  assert.ok(sameOriginal(wrongAccount.captures[0]));
  assert.equal(targetCalls.length, 0);
  assert.ok(!(await page.locator('body').innerText()).includes(title), 'Wrong account saw the private saved title');
  record('A06-wrong-account-isolated', { scenario, originalPreserved: true, targetRequests: 0, privateTitleVisible: false });
  await selectTargetAccount(true);
  let acknowledgedReceipt;
  if (liveBackend) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/quick-tasks'
        && response.request().method() === 'POST'),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    assert.equal(response.status(), sourceCommitted ? 200 : 201);
    acknowledgedReceipt = (await response.json()).data;
    if (sourceCommitted) assert.deepEqual(acknowledgedReceipt, { ...committedSourceReceipt, created: false });
  } else await page.reload({ waitUntil: 'domcontentloaded' });
  await loaded(page, 'B');
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  const restored = await waitLocal(value => value.captures[0].state === 'synced' && value.captures[0].receipt);
  assert.ok(sameOriginal(restored.captures[0]));
  assert.equal(restored.captures.length, 1);
  if (!liveBackend) assert.equal(targetEffects, 1);
  assert.ok(targetCalls.length >= 1 && targetCalls.every(call => call.captureId === original.captureId && call.title === title));
  assert.ok(sourceCalls.every(call => call.p_capture_id === original.captureId && call.p_title === title));
  if (liveBackend) {
    assert.equal(targetCalls.length, 1, 'The normal Quick submission was duplicated');
    assert.deepEqual(restored.captures[0].receipt, acknowledgedReceipt);
    const requestBody = { captureId: targetCalls[0].captureId, title: targetCalls[0].title,
      workspaceHint: targetCalls[0].workspaceHint };
    const replay = await page.evaluate(async ({ body, accountId, contextId }) => {
      const response = await fetch('/api/v1/quick-tasks', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-projed-expected-account-id': accountId,
          'x-projed-expected-context-id': contextId }, body: JSON.stringify(body) });
      return { status: response.status, data: (await response.json()).data };
    }, { body: requestBody, accountId: owner, contextId: liveBackend.ownerContext });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, { ...acknowledgedReceipt, created: false });
    assert.equal(targetCalls.length, 2);
    fs.writeFileSync(proofPath, JSON.stringify({
      scope: 'REAL_BROWSER_HTTP_ACK_PENDING_NATIVE_PG_READBACK_SYNTHETIC_IDENTITY',
      scenario,
      captureId: original.captureId, ownerId: owner, clientCreatedAt: original.clientCreatedAt,
      titleHash: createHash('sha256').update(original.title).digest('hex'),
      requestBodyHash: createHash('sha256').update(JSON.stringify(requestBody)).digest('hex'),
      productSubmissions: 1, explicitQaReplays: 1, firstStatus: sourceCommitted ? 200 : 201, replayStatus: replay.status,
      firstReceipt: acknowledgedReceipt, replayReceipt: replay.data,
      ...(sourceCommitted ? { sourceReceipt: committedSourceReceipt, migration: migrationProof } : {}),
    }, null, 2) + '\n', { flag: 'wx' });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loaded(page, 'B');
  const reloaded = await readLocal();
  assert.ok(sameOriginal(reloaded.captures[0]) && reloaded.captures[0].receipt?.status === 'committed');
  if (!liveBackend) assert.equal(targetEffects, 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: image('http-recovered') });
  record('A06-backend-upgrade-recovered', { scenario, sourceBackend: 'supabase', targetBackend: 'http',
    originalIdAccountContentAndTimePreserved: true, receiptPersistedAfterReload: true,
    sourceRpcRequests: sourceCalls.length, sourceCommitted, responseDropped: sourceCommitted,
    sourceUnavailableDuringUpdate: true,
    ...(liveBackend ? { realHttpRequests: targetCalls.length, productSubmissions: 1, explicitQaReplays: 1 }
      : { syntheticTargetRequests: targetCalls.length, syntheticTargetEffects: targetEffects }),
    sameOrigin: origin, sameBrowserProfile: true, actualServiceWorker: true, viewport: '390x844',
    apiEvidence: liveBackend ? 'REAL_KERNEL_HTTP_ACK_PENDING_NATIVE_PG_RECONCILIATION_SYNTHETIC_IDENTITY'
      : 'SYNTHETIC_SESSION_AND_COMMITTED_RECEIPT_NO_DATABASE_OR_PROVIDER', externalRequests: unexpected.length });
}
