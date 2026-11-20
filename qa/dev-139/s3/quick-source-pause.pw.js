/* eslint-disable */
// Run against an isolated Vite origin configured with VITE_DATA_BACKEND=supabase,
// VITE_SUPABASE_URL=http://127.0.0.1:47971 and a synthetic anon key. No provider
// request may leave this browser's intercepted fixture boundary.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:47972') throw new Error('ISOLATED_SOURCE_PAUSE_ORIGIN_REQUIRED');
  const isolated = await page.evaluate(async () => (await import('/src/services/backendMode.ts')).isSupabaseBackend
    && (await import('/src/services/supabase/client.ts')).configuredSupabaseUrl === 'http://127.0.0.1:47971');
  if (!isolated) throw new Error('SYNTHETIC_SUPABASE_CONFIG_REQUIRED');
  await page.setViewportSize({ width: 390, height: 844 });
  const sourceOrigin = 'http://127.0.0.1:47971';
  const accountA = '11111111-1111-4111-8111-111111111111';
  const accountB = '22222222-2222-4222-8222-222222222222';
  const checks = [];
  const requests = [];
  const unexpectedRequests = [];
  const check = (id, ok) => { checks.push({ id, ok }); if (!ok) throw new Error(id); };
  let actor = accountA;
  let paused = true;
  const setAccount = async accountId => {
    actor = accountId;
    await page.evaluate(accountId => {
      const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: accountId, aud: 'authenticated', exp: expiresAt, session_id: accountId })}.local-simulation`;
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: token, refresh_token: 'local-simulation-only', token_type: 'bearer', expires_in: 3600,
        expires_at: expiresAt, user: { id: accountId, aud: 'authenticated', role: 'authenticated',
          email: 'fixture@example.invalid', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, accountId);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  };
  const readDrafts = () => page.evaluate(async accountId => (await import('/src/features/quickTaskCapture/outbox.ts')).listQuickCaptures(accountId), accountA);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) { await route.continue(); return; }
    if (url.origin !== sourceOrigin) {
      unexpectedRequests.push(`${url.origin}${url.pathname}`);
      await route.abort(); return;
    }
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, headers, json: { id: actor, aud: 'authenticated', role: 'authenticated',
        email: 'fixture@example.invalid', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }); return;
    }
    if (url.pathname === '/rest/v1/rpc/create_quick_unplaced_task_v1') {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (paused) {
        await route.fulfill({ status: 503, headers, json: { code: 'PT503', message: 'PROJED_SOURCE_WRITE_PAUSED' } }); return;
      }
      const hash = await page.evaluate(async title => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(title))), byte => byte.toString(16).padStart(2, '0')).join(''), body.p_title);
      // Existing RPC may return created:false when the same key already has a
      // receipt. Recovery must accept the receipt rather than create a new key.
      await route.fulfill({ status: 200, headers, json: { status: 'committed', captureId: body.p_capture_id,
        ownerId: actor, titleHash: hash, created: false, committedAt: Date.now() } }); return;
    }
    unexpectedRequests.push(url.pathname); await route.abort();
  });
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    await new Promise(resolve => { const request = indexedDB.deleteDatabase('projed-quick-task-v1'); request.onsuccess = request.onerror = request.onblocked = resolve; });
  });
  await setAccount(accountA);
  check('legacy-supabase-backend', await page.evaluate(async () => (await import('/src/services/backendMode.ts')).isSupabaseBackend));
  await page.getByRole('textbox', { name: '任務名稱' }).fill('停寫期間保留的原任務');
  await page.getByRole('button', { name: '建立', exact: true }).click();
  await page.getByText('寫入暫停，已保留', { exact: true }).waitFor();
  const [original] = await readDrafts();
  check('precise-pause-durable', original?.state === 'failed_permanent' && original.lastErrorCode === 'PROJED_SOURCE_WRITE_PAUSED'
    && original.attemptCount === 1 && original.nextAttemptAt === null && original.accountId === accountA && original.title === '停寫期間保留的原任務');
  check('one-rejected-write', requests.length === 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  check('reload-online-no-automatic-resend', requests.length === 1);
  await page.locator('#quick-task-recovery-details').evaluate(element => { element.open = false; });
  await page.locator('[data-recover]').click();
  await page.getByRole('button', { name: '恢復後重試', exact: true }).waitFor();
  check('visible-pause-recovery', await page.getByText('來源服務已暫停寫入；待辦仍保留在本機。服務恢復後，請以原帳號重試。', { exact: true }).isVisible());
  await page.screenshot({ path: 'output/playwright/dev-139-source-pause/paused.png' });
  check('wrong-account-cannot-retry', await page.evaluate(async ({ captureId, accountB }) =>
    (await import('/src/features/quickTaskCapture/outbox.ts')).retryQuickCapture(captureId, accountB), { captureId: original.captureId, accountB }) === null);
  await setAccount(accountB);
  check('account-switch-keeps-owner', (await readDrafts())[0]?.accountId === accountA && requests.length === 1);
  await setAccount(accountA);
  await page.locator('#quick-task-recovery-details').evaluate(element => { element.open = false; });
  await page.locator('[data-recover]').click();
  await page.getByRole('button', { name: '恢復後重試', exact: true }).waitFor();
  paused = false;
  await page.getByRole('button', { name: '恢復後重試', exact: true }).click();
  let restored = [];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    restored = await readDrafts();
    if (restored[0]?.state === 'synced' && restored[0]?.receipt) break;
    await page.waitForTimeout(100);
  }
  const sameDraft = restored.length === 1 && restored[0].captureId === original.captureId
    && restored[0].accountId === original.accountId && restored[0].title === original.title
    && restored[0].clientCreatedAt === original.clientCreatedAt && restored[0].receipt?.created === false;
  if (!sameDraft) throw new Error(`manual recovery mismatch ${JSON.stringify({ count: restored.length,
    key: restored[0]?.captureId === original.captureId, owner: restored[0]?.accountId === original.accountId,
    title: restored[0]?.title === original.title, createdAt: restored[0]?.clientCreatedAt === original.clientCreatedAt,
    receipt: restored[0]?.receipt?.created })}`);
  check('manual-recovery-preserves-key-and-content', sameDraft);
  check('same-original-rpc-key', requests.length === 2 && requests.every(request => request.p_capture_id === original.captureId && request.p_title === original.title));
  await page.screenshot({ path: 'output/playwright/dev-139-source-pause/recovered.png' });
  check('no-provider-network', unexpectedRequests.length === 0);
  const result = { status: 'PASS', evidenceLevel: 'LOCAL_SYNTHETIC_SUPABASE_BROWSER', checks,
    requests: requests.length, sourceWriteFenceExecuted: false, productionAccessed: false };
  await page.evaluate(result => { window.__DEV139_SOURCE_PAUSE = result; }, result);
  return result;
}
