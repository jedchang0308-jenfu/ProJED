/* eslint-disable */
// Real production Quick Task delivery and Main updater; anonymous, disposable profile, no business writes.
async page => {
  const origin = new URL(page.url()).origin;
  if (!['https://projed-cc78d.web.app', 'https://projed-cc78d.firebaseapp.com'].includes(origin)) {
    throw new Error('DEV-134 hosted menu smoke requires a canonical production origin.');
  }
  const releaseId = new URL(page.url()).searchParams.get('dev083ReleaseId');
  if (!releaseId) throw new Error('DEV-134 hosted menu smoke requires a release binding.');
  const diagnostics = { pageErrors: [], failedRequests: [], consoleErrors: [], remoteWrites: [] };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    if (/\.supabase\.co\/(?:rest|storage|functions)\/v1\//.test(request.url())
      && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) diagnostics.remoteWrites.push(request.url());
  });
  const target = new URL('/quick-task/?install=1', origin);
  target.searchParams.set('dev083ReleaseId', releaseId);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('#quick-task-title').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'attached', timeout: 15000 });
  await page.evaluate(async () => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (registration?.active && !registration.installing && !registration.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Production service worker did not reach a stable active state.');
  });
  const menu = page.locator('[data-quick-install-menu]');
  const trigger = menu.locator('summary');
  const check = menu.locator('[data-quick-update-check]');
  const status = menu.locator('[data-quick-update-status]');
  const failures = [];
  const cases = [];
  const checkLatest = async name => {
    if (!await menu.evaluate(element => element.open)) await trigger.click();
    await check.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-quick-update-check]');
      const status = document.querySelector('[data-quick-update-status]');
      return button && !button.disabled && status && !status.hidden && status.textContent !== '檢查中';
    }, null, { timeout: 15000 });
    const message = await status.textContent();
    cases.push({ name, message });
    if (message !== '已是最新版') failures.push(name + ': unexpected check result ' + message);
  };
  await checkLatest('current production version');
  const layouts = [];
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (!await menu.evaluate(element => element.open)) await trigger.click();
    layouts.push(await page.evaluate(() => {
      const trigger = document.querySelector('[data-quick-install-menu] > summary').getBoundingClientRect();
      const panel = document.querySelector('.quick-task-install-menu-panel').getBoundingClientRect();
      return {
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        trigger: { width: trigger.width, height: trigger.height },
        panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
        installVisible: document.querySelector('[data-quick-install-action]')?.checkVisibility(),
      };
    }));
  }
  for (const layout of layouts) {
    if (layout.scrollWidth > layout.width + 1 || layout.panel.left < 0 || layout.panel.right > layout.width + 1
      || layout.panel.top < 0 || layout.panel.bottom > 845 || layout.trigger.width < 44 || layout.trigger.height < 44
      || !layout.installVisible) failures.push('layout/installation regression at ' + layout.width);
  }
  await page.context().setOffline(true);
  try {
    await check.click();
    await status.filter({ hasText: '無法連線' }).waitFor({ state: 'visible', timeout: 15000 });
    cases.push({ name: 'offline', message: await status.textContent() });
    if (!await check.isEnabled()) failures.push('offline check leaves retry disabled');
  } finally {
    await page.context().setOffline(false);
  }
  await checkLatest('online retry');
  await page.keyboard.press('Escape');
  if (await menu.evaluate(element => element.open)) failures.push('Escape failed to close menu');
  if (!await trigger.evaluate(element => element === document.activeElement)) failures.push('Escape did not restore trigger focus');
  const binding = await page.evaluate(async expectedReleaseId => {
    const meta = await (await fetch('/release-meta.json', { cache: 'no-store' })).json();
    const prompt = document.querySelector('[data-pwa-update-prompt]');
    return { expectedReleaseId, servedReleaseId: meta.releaseId, sourceCommit: meta.source.commit,
      releaseMatches: meta.releaseId === expectedReleaseId, promptMounted: Boolean(prompt), promptHidden: prompt?.hidden === true };
  }, releaseId);
  if (!binding.releaseMatches || !binding.promptMounted || !binding.promptHidden) failures.push('release/prompt binding mismatch');
  // Resolve the updater from the served Main entry, never from retained asset order.
  await page.goto(origin + '/?dev083ReleaseId=' + encodeURIComponent(releaseId), { waitUntil: 'domcontentloaded' });
  const html = await (await page.request.get(origin + '/?dev083ReleaseId=' + encodeURIComponent(releaseId))).text();
  const mainAsset = html.match(/src="(\/assets\/main-[^"]+\.js)"/)?.[1];
  if (!mainAsset) throw new Error('Cannot resolve served Main entry.');
  const mainSource = await (await page.request.get(origin + mainAsset)).text();
  const updaterAsset = mainSource.match(/\.\/(pwaUpdateService-[A-Za-z0-9_-]+\.js)/)?.[1];
  if (!updaterAsset) throw new Error('Cannot resolve actual Main updater.');
  const mainCheck = async () => page.evaluate(async asset => {
    const api = await import('/assets/' + asset);
    return { check: await api.checkPwaUpdate(), shell: document.querySelector('meta[name="projed-shell-version"]')?.content };
  }, updaterAsset);
  const mainCurrent = await mainCheck();
  if (mainCurrent.check.phase !== 'up-to-date' || mainCurrent.check.errorCode !== null
    || mainCurrent.check.currentVersion !== 'release:' + releaseId || mainCurrent.check.latestVersion !== 'release:' + releaseId
    || mainCurrent.shell !== 'release:' + releaseId) failures.push('Main current-version check failed');
  let mainOffline;
  await page.context().setOffline(true);
  try {
    mainOffline = await mainCheck();
    if (mainOffline.check.phase !== 'error' || mainOffline.check.errorCode !== 'CHECK_OFFLINE') failures.push('Main offline check failed');
  } finally { await page.context().setOffline(false); }
  const mainRetry = await mainCheck();
  if (mainRetry.check.phase !== 'up-to-date' || mainRetry.check.errorCode !== null) failures.push('Main online retry failed');
  const criticalFailedRequests = diagnostics.failedRequests.filter(item => !/favicon|fonts\.googleapis|fonts\.gstatic/i.test(item.url));
  const criticalConsoleErrors = diagnostics.consoleErrors.filter(text => !/favicon|ResizeObserver/i.test(text));
  if (diagnostics.pageErrors.length || criticalFailedRequests.length || criticalConsoleErrors.length || diagnostics.remoteWrites.length) {
    failures.push('critical runtime failure or unexpected remote write');
  }
  const result = { ok: failures.length === 0, origin, failures, binding, cases, layouts,
    main: { entry: mainAsset, updater: updaterAsset, current: mainCurrent, offline: mainOffline, retry: mainRetry },
    diagnostics: { ...diagnostics, criticalFailedRequests, criticalConsoleErrors },
    scope: 'Anonymous Quick Task menu and actual Main updater production delivery; authenticated Main menu and physical installed-phone confirmation remain separate.' };
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error('DEV-134 production update menu failed: ' + JSON.stringify(result));
  return result;
}
