/* eslint-disable */
async page => {
  const origin = '__ORIGIN__', a = '__VERSION_A__', b = '__VERSION_B__';
  const results = [], diagnostics = [];
  const context = page.context();
  const assert = (condition, message, details) => { if (!condition) throw new Error(message + ': ' + JSON.stringify(details)); };
  const check = async (name, work) => { try { const details = await work(); results.push({ name, ok: true, details }); } catch (error) { results.push({ name, ok: false, error: error.message, stack:error.stack }); } };
  const attach = tab => { tab.on('pageerror', error => diagnostics.push(error.message)); };
  const ready = async tab => {
    await tab.waitForFunction(() => window.__DEV134?.registration(), null, { timeout: 20000 });
    await tab.evaluate(() => navigator.serviceWorker.ready);
  };
  await context.addInitScript(() => {
    const original = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function(message, ...args) {
      if (message?.type === 'SKIP_WAITING') localStorage.setItem('dev134-activations', String(Number(localStorage.getItem('dev134-activations') || 0) + 1));
      return original.call(this, message, ...args);
    };
  });
  attach(page);
  await page.reload(); await ready(page);
  await page.reload(); await ready(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(async () => {
    localStorage.setItem('auth-sentinel', 'preserve'); localStorage.setItem('draft-sentinel', 'preserve'); document.cookie = 'auth_fixture=preserve; path=/';
    const cache = await caches.open('dev134-business-sentinel'); await cache.put('/sentinel', new Response('preserve'));
    await new Promise((resolve, reject) => { const request = indexedDB.open('dev134-business',1); request.onupgradeneeded = () => request.result.createObjectStore('drafts'); request.onsuccess = () => { const db=request.result, tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put('preserve','draft');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject; }; request.onerror=reject; });
  });
  const oldCaches = await page.evaluate(() => caches.keys());
  const other = await context.newPage(); attach(other); await other.goto(origin); await ready(other);
  await page.evaluate(() => window.__DEV134.ready(false));
  await other.evaluate(() => window.__DEV134.ready(false));
  await page.request.get(origin + '/__dev134/switch?release=B');
  await page.evaluate(target => window.__DEV134.fail(target), b);
  await check('R01-real-worker-failed-record-replay-preserves-reason', async () => {
    for (let i=0;i<3;i++) await page.evaluate(() => window.__DEV134.check());
    await page.reload(); await ready(page);
    await page.evaluate(() => window.__DEV134.ready(false));
    await page.evaluate(() => window.__DEV134.check());
    const state = await page.evaluate(() => window.__DEV134.state());
    assert(state.status === 'failed' && state.errorMessage === '先前啟用未完成。' && state.errorCode === 'APPLY_FAILED', 'original failure was lost', state);
    assert(state.currentVersion === a, 'background replay navigated', state);
    return state;
  });
  await check('R05-booting-dirty-and-unknown-recovery-do-not-reload-or-delete', async () => {
    const before = await page.evaluate(() => ({ transaction: localStorage.getItem('projed.pwa-update.transaction.v1'), cookies: document.cookie }));
    assert(await page.evaluate(() => window.__DEV134.retry()) === false, 'unknown readiness retry must be blocked');
    assert(await page.evaluate(() => window.__DEV134.recover()) === false, 'unknown readiness cleanup must be blocked');
    await page.evaluate(() => { window.__DEV134.ready(true); window.__DEV134.dirty(true); });
    assert(await page.evaluate(() => window.__DEV134.retry()) === false, 'dirty retry must be blocked');
    assert(await page.evaluate(() => window.__DEV134.recover()) === false, 'dirty cleanup must be blocked');
    const after = await page.evaluate(() => ({ state: window.__DEV134.state(), transaction: localStorage.getItem('projed.pwa-update.transaction.v1'), cookies: document.cookie }));
    assert(after.state.currentVersion === a && before.transaction === after.transaction && before.cookies === after.cookies, 'blocked recovery altered identity/storage', after);
    assert((await page.evaluate(() => caches.keys())).includes('dev134-business-sentinel'), 'cache deleted before safety gate');
    await page.evaluate(() => window.__DEV134.dirty(false));
    return after.state;
  });
  await check('R02-explicit-UI-retry-new-fence-real-worker-dual-tab-single-activation', async () => {
    await page.locator('[data-pwa-update-action]').click();
    await page.waitForFunction(expected => window.__DEV134?.state().currentVersion === expected, b, { timeout: 30000 });
    await ready(page);
    const history = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dev134-state-history') || '[]'));
    assert(history.some(item => item.transaction?.transactionId.startsWith('tx-retry-') && item.transaction.phase === 'applying' && item.transaction.errorCode == null), 'retry did not get a new fenced transaction', history);
    const blockedOther = await other.evaluate(() => window.__DEV134.state());
    assert(blockedOther.currentVersion === a, 'other unsafe tab was forcibly reloaded', blockedOther);
    // The real app-open readiness boundary can immediately replace this old
    // document. A navigation interruption is acceptable only with target readback.
    await other.evaluate(() => window.__DEV134.ready(true)).catch(error => {
      if (!error.message.includes('Execution context was destroyed')) throw error;
    });
    await other.waitForFunction(expected => window.__DEV134?.state().currentVersion === expected, b, { timeout: 20000 });
    const activations = await page.evaluate(() => Number(localStorage.getItem('dev134-activations')));
    assert(activations === 1, 'multiple activation messages', activations);
    assert(!(await page.locator('[data-pwa-update-prompt]').count()), 'successful retry left a banner');
    const requests = await (await page.request.get(origin + '/__dev134/requests')).json();
    assert(requests.filter(item => item.url.includes('projed_update_latest=') && item.release === 'B').length >= 2, 'own-boundary reload did not fetch network HTML', requests);
    return { current: b, otherCurrent: b, activations, newTransaction: history.filter(item => item.transaction?.transactionId.startsWith('tx-retry-')).map(item=>item.transaction.phase) };
  });
  await check('R10-auth-draft-IDB-and-old-worker-cache-survive-retry', async () => {
    const sentinels = await page.evaluate(async () => ({ auth: localStorage.getItem('auth-sentinel'), draft: localStorage.getItem('draft-sentinel'), cookie: document.cookie, cache: await (await (await caches.open('dev134-business-sentinel')).match('/sentinel')).text(), idb: await new Promise(resolve => { const req=indexedDB.open('dev134-business');req.onsuccess=()=>{const db=req.result,get=db.transaction('drafts').objectStore('drafts').get('draft');get.onsuccess=()=>{resolve(get.result);db.close();};}; }), caches: await caches.keys() }));
    assert(sentinels.auth === 'preserve' && sentinels.draft === 'preserve' && sentinels.cookie.includes('auth_fixture=preserve') && sentinels.idb === 'preserve' && sentinels.cache === 'preserve', 'business storage damaged', sentinels);
    assert(oldCaches.every(name => sentinels.caches.includes(name)), 'old worker cache reclaimed during activation', sentinels);
    return sentinels;
  });
  await other.close();

  await check('R03-current-version-stale-failure-retired-without-reload', async () => {
    const before = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate(target => window.__DEV134.fail(target), a);
    await page.evaluate(() => window.__DEV134.check());
    const state = await page.evaluate(() => window.__DEV134.state());
    assert(state.status === 'idle' && state.failureKind === null && !state.transactionId, 'resolved failure remained visible',state);
    assert(await page.evaluate(() => performance.timeOrigin) === before, 'same-version cleanup navigated');
    assert(await page.evaluate(() => localStorage.getItem('draft-sentinel')) === 'preserve', 'stale failure cleanup changed draft');
    return {current:state.currentVersion, failureCleared:true, navigated:false};
  });

  await check('R06-old-controller-nonce-navigation-fetches-network-target', async () => {
    await page.request.get(origin + '/__dev134/switch?release=A');
    const isolated = await context.browser().newContext();
    const tab = await isolated.newPage(); attach(tab);
    try {
      await tab.goto(origin); await ready(tab); await tab.reload(); await ready(tab);
      assert(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'old worker not controlling fixture');
      await tab.evaluate(() => window.__DEV134.ready(false));
      await tab.request.get(origin + '/__dev134/switch?release=B');
      await tab.goto(origin + '/?projed_update_latest=dev134-network-proof'); await ready(tab);
      const state = await tab.evaluate(() => window.__DEV134.state());
      assert(state.currentVersion === b, 'old navigation fallback intercepted nonce', state);
      const requests = await (await tab.request.get(origin + '/__dev134/requests')).json();
      assert(requests.some(item => item.url === '/?projed_update_latest=dev134-network-proof' && item.release === 'B'), 'nonce absent from network trace');
      return { current: state.currentVersion, controlled: await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), networkNavigation: true };
    } finally { await isolated.close(); }
  });
  await check('R05-real-load-error-survives-cross-tab-transaction-and-background-check', async () => {
    const isolated = await context.browser().newContext();
    const receiver = await isolated.newPage(), sender = await isolated.newPage(); attach(receiver); attach(sender);
    try {
      await receiver.goto(origin); await ready(receiver);
      await sender.goto(origin); await ready(sender);
      await receiver.evaluate(() => window.__DEV134.ready(false));
      const before = await receiver.evaluate(() => performance.timeOrigin);
      await receiver.evaluate(() => window.__DEV134.load());
      await sender.evaluate(target => window.__DEV134.fail(target), a);
      await receiver.evaluate(() => window.__DEV134.check());
      await receiver.waitForFunction(() => window.__DEV134.state().failureKind === 'load');
      const state = await receiver.evaluate(() => window.__DEV134.state());
      assert(state.failureKind === 'load' && state.errorCode === 'CHUNK_LOAD_FAILED', 'other tab hid load failure',state);
      assert(await receiver.evaluate(() => performance.timeOrigin) === before, 'unsafe load recovery navigated');
      assert(await receiver.locator('[data-pwa-update-prompt]').count() === 1, 'real load failure prompt hidden');
      return { failureKind:state.failureKind, errorCode:state.errorCode, navigated:false };
    } finally { await isolated.close(); }
  });
  await check('R04-real-background-worker-check-network-failure-remains-quiet', async () => {
    const isolated = await context.browser().newContext(); const tab=await isolated.newPage(); attach(tab);
    try {
      await tab.goto(origin); await ready(tab);
      await isolated.setOffline(true);
      await tab.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await tab.evaluate(() => window.__DEV134.check());
      const state=await tab.evaluate(() => window.__DEV134.state());
      assert(state.failureKind === null && state.status !== 'failed', 'offline background check was reported as load failure', state);
      assert(!(await tab.locator('[data-pwa-update-prompt]').count()), 'offline background failure displayed a banner');
      await isolated.setOffline(false);
      return state;
    } finally { await isolated.close(); }
  });
  await check('R09-failure-types-mobile-desktop-viewport-and-keyboard', async () => {
    // Visual states have a dedicated context without background lifecycle
    // producers. Those producers are tested against actual workers above.
    const uiContext = await context.browser().newContext();
    const page = await uiContext.newPage(); attach(page);
    try {
    await page.goto(origin + '/?ui=1');
    await page.waitForFunction(() => Boolean(window.__DEV134));
    const screenshots = [];
    const titles = { update:'重新載入未完成', load:'畫面載入失敗', 'cache-recovery':'快取恢復未完成' };
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:width===1440?900:844});
      for (const [kind,title] of Object.entries(titles)) {
        await page.evaluate(kind => window.__DEV134.show(kind),kind);
        const prompt=page.locator('[data-pwa-update-prompt]'); await prompt.waitFor();
        assert((await prompt.innerText()).includes(title), 'wrong failure title',kind);
        const rect=await prompt.boundingBox(), buttons=await page.locator('[data-pwa-update-prompt] button').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().toJSON()));
        assert(rect.y>=0 && rect.y+rect.height<=900 && buttons.every(r=>r.x>=0 && r.x+r.width<=width), 'prompt/actions overflow', {width,rect,buttons});
        assert(await page.evaluate(() => document.documentElement.scrollWidth<=document.documentElement.clientWidth+1), 'horizontal document overflow',width);
        const file='__VISUALS__/'+width+'-'+kind+'.png'; await page.screenshot({path:file}); screenshots.push(file);
      }
      for (const blocked of [false,true]) {
        await page.evaluate(value=>window.__DEV134.normal(value),blocked);
        const prompt=page.locator('[data-pwa-update-prompt]'); await prompt.waitFor();
        assert((await prompt.innerText()).includes('新版已就緒'), 'normal update lost compact title');
        const file='__VISUALS__/'+width+'-'+(blocked?'blocked':'normal')+'.png';await page.screenshot({path:file});screenshots.push(file);
      }
    }
    await page.evaluate(() => window.__DEV134.show('update'));
    await page.locator('[data-pwa-update-action]').focus();
    assert(await page.locator('[data-pwa-update-action]').evaluate(e=>e===document.activeElement), 'primary action cannot receive keyboard focus');
    await page.keyboard.press('Tab');
    assert(await page.locator('[data-pwa-cache-recovery]').evaluate(e=>e===document.activeElement), 'keyboard order does not reach cache recovery');
    assert(await page.locator('[data-pwa-cache-recovery]').evaluate(e=>getComputedStyle(e).boxShadow!=='none'), 'keyboard focus indicator missing');
    return {screenshots, widths:[320,390,1440], keyboard:true};
    } finally { await uiContext.close(); }
  });
  return {ok:results.every(item=>item.ok),results,diagnostics};
}
