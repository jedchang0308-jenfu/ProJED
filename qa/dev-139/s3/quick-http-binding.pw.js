/* eslint-disable */
async (entryPage) => {
  const origin = new URL(entryPage.url()).origin;
  if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Isolated Quick HTTP origin required');
  const run = async page => {
    const account = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let session = '11111111-1111-4111-8111-111111111111';
    let status = 200;
    const checks = [];
    const check = (name, ok) => {
      if (!ok) throw new Error(name);
      checks.push(name);
    };
    await page.route(origin + '/api/v1/session', route => route.fulfill({
      status,
      json: status === 200 ? { data: { localUserId: account, authContextId: session, entry: 'main',
        createdAt: Date.now(), expiresAt: Date.now() + 600000, email: null, displayName: null } }
        : { error: { code: status === 401 ? 'ACTOR_INVALID' : 'DEPENDENCY_UNAVAILABLE' } },
    }));
    let submissions = 0;
    await page.route(origin + '/api/v1/quick-tasks', route => {
      submissions++;
      return route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE' } } });
    });
    const idb = () => page.evaluate(async () => {
      const request = indexedDB.open('projed-quick-task-v1');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(['auth_context', 'captures']);
        const binding = tx.objectStore('auth_context').get('current');
        const captures = tx.objectStore('captures').getAll();
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
        return { binding: binding.result, captures: captures.result };
      } finally { db.close(); }
    });
    const authStatus = async text => {
      const label = page.locator('#quick-task-auth-status');
      try {
        await label.filter({ hasText: text }).waitFor({ state: 'attached', timeout: 12000 });
      } catch {
        throw new Error('Expected Quick status ' + text + ', received ' + (await label.textContent()));
      }
    };
    const capture = async title => {
      await page.getByRole('textbox', { name: '任務名稱' }).fill(title);
      await page.getByRole('button', { name: '建立', exact: true }).click();
      for (let i = 0; i < 50; i++) {
        const record = (await idb()).captures.find(record => record.title === title);
        if (record) return record;
        await page.waitForTimeout(100);
      }
      throw new Error('Quick did not persist the draft');
    };
    await page.goto(origin + '/quick-task/');
    await authStatus('此快速 App 已登入');
    const privateTitle = 'Existing owner private local draft';
    status = 503;
    const old = await capture(privateTitle);
    check('outage-keeps-verified-owner', old.accountId === account);
    await authStatus('登入狀態待確認');

    // The page is already signed in, so a visibility refresh exercises verification.
    status = 401;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await authStatus('此快速 App 尚未登入');
    check('verification-denial-revokes-stored-binding', (await idb()).binding.bindingAllowed === false);
    check('old-private-content-hidden', !(await page.locator('body').innerText()).includes(privateTitle));
    status = 503;
    await page.reload();
    await authStatus('登入狀態待確認');
    const unbound = await capture('New offline draft after denial');
    check('later-offline-reload-cannot-bind-to-old-account', unbound.accountId === null && unbound.state === 'awaiting_auth');
    check('original-draft-retains-owner', (await idb()).captures.some(record =>
      record.captureId === old.captureId && record.accountId === account && record.title === privateTitle));
    check('no-submit-while-unverified', submissions === 0);

    // A fresh login can use the same account. Reject the next startup session read
    // and ensure another offline startup cannot recover that session's binding.
    status = 200;
    session = '22222222-2222-4222-8222-222222222222';
    await page.reload();
    await authStatus('此快速 App 已登入');
    check('new-session-can-rebind', (await idb()).binding.sessionId === 'http:' + session);
    status = 401;
    await page.reload();
    await authStatus('此快速 App 尚未登入');
    check('startup-denial-revokes-new-binding', (await idb()).binding.bindingAllowed === false);
    status = 503;
    await page.reload();
    await authStatus('登入狀態待確認');
    check('startup-denial-survives-reload', (await idb()).binding.bindingAllowed === false);
    const result = { status: 'PASS', evidenceLevel: 'ISOLATED_QUICK_UI_SYNTHETIC_HTTP_SESSION', checks };
    return result;
  };
  const context = await entryPage.context().browser().newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const result = await run(await context.newPage());
    await entryPage.evaluate(value => { window.__DEV139_QUICK_HTTP_BINDING = value; }, result);
    return result;
  } finally { await context.close(); }
}
