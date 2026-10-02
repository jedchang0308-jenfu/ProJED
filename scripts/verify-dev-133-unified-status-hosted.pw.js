/* eslint-disable */
// Anonymous UI checks; installed mode is simulated. Disposable contexts have no account session.
async (page) => {
  const entryUrl = new URL(page.url());
  const expectedReleaseId = entryUrl.searchParams.get('dev083ReleaseId');
  const production = /projed-cc78d\.(web\.app|firebaseapp\.com)$/.test(entryUrl.hostname);
  const origins = production
    ? ['https://projed-cc78d.web.app', 'https://projed-cc78d.firebaseapp.com']
    : [entryUrl.origin];
  const checks = [];
  const errors = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  const browser = page.context().browser();
  const android = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36';
  const modes = [
    { name: 'browser', viewport: { width: 411, height: 844 } },
    { name: 'android-browser', viewport: { width: 360, height: 800 }, userAgent: android },
    { name: 'android-installed', viewport: { width: 360, height: 800 }, userAgent: android, displayMode: 'minimal-ui' },
    { name: 'iphone-installed', viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', displayMode: 'standalone' },
  ];
  for (const origin of origins) {
    for (const mode of modes) {
      for (const query of ['', '?install=1']) {
        const context = await browser.newContext({ viewport: mode.viewport, userAgent: mode.userAgent });
        try {
          if (mode.displayMode) await context.addInitScript(displayMode => {
            const original = window.matchMedia.bind(window);
            window.matchMedia = query => query === '(display-mode: ' + displayMode + ')'
              ? { matches: true, addEventListener() {}, removeEventListener() {} }
              : original(query);
          }, mode.displayMode);
          const tab = await context.newPage();
          tab.on('pageerror', error => errors.push(error.message));
          const rpcWrites = [];
          tab.on('request', request => {
            if (/\/rest\/v1\/rpc\//.test(request.url()) && request.method() === 'POST') rpcWrites.push(request.url());
          });
          await tab.goto(origin + '/quick-task/' + query, { waitUntil: 'domcontentloaded' });
          await tab.waitForFunction(() => document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入'), null, { timeout: 15000 });
          const name = new URL(origin).hostname + '/' + mode.name + '/' + (query || 'default');
          const ui = await tab.evaluate(() => ({
            menu: Boolean(document.querySelector('.quick-task-header-actions [data-quick-install-menu]')),
            authVisible: document.querySelector('#quick-task-auth-status')?.checkVisibility(),
            loginVisible: document.querySelector('#quick-task-auth-status button')?.checkVisibility(),
            detailsHidden: document.querySelector('#quick-task-recovery-details')?.hidden,
            footerLink: Boolean(document.querySelector('[data-quick-install-link]')),
            autoDialog: Boolean(document.querySelector('dialog[open]')),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          }));
          check(name + '/empty-ui', ui.menu && ui.authVisible && ui.loginVisible && ui.detailsHidden
            && !ui.footerLink && !ui.autoDialog && !ui.overflow, ui);
          if (expectedReleaseId) {
            const meta = await tab.evaluate(async () => (await fetch('/release-meta.json', { cache: 'no-store' })).json());
            check(name + '/release', meta.releaseId === expectedReleaseId, meta.releaseId);
          }
          if (ui.menu) {
            const menu = tab.locator('[data-quick-install-menu]');
            await menu.locator('summary').click();
            await tab.locator('[data-quick-install-action]').click();
            const dialog = tab.locator('.quick-task-install-dialog');
            await dialog.waitFor({ state: 'visible' });
            check(name + '/explicit-guide', await dialog.isVisible(), {});
            if (mode.name === 'android-installed' && !origin.endsWith('.web.app')) {
              const toggle = dialog.locator('[data-quick-icon-reinstall-toggle]');
              check(name + '/reinstall-initially-collapsed', await toggle.getAttribute('aria-expanded') === 'false', {});
              await toggle.click();
              await tab.waitForFunction(() => document.querySelector('[data-quick-icon-reinstall]')?.textContent.includes('未發現未同步'));
              const guide = await dialog.locator('[data-quick-icon-reinstall]').innerText();
              check(name + '/reinstall-safety', guide.includes('可保留舊圖示繼續使用') && guide.includes('用原帳號登入')
                && guide.includes('未發現未同步') && await dialog.locator('[data-quick-icon-reinstall-link]').count() === 1, {});
            }
            await dialog.getByRole('button', { name: '關閉', exact: true }).click();
            await menu.locator('summary').click();
            await tab.keyboard.press('Escape');
            check(name + '/escape-closes-menu', !await menu.evaluate(node => node.open), {});
          }
          if (mode.name === 'android-installed' && !query) {
            await tab.locator('#quick-task-title').evaluate(input => input.blur());
            await tab.screenshot({ path: 'output/playwright/dev133-platform-' + new URL(origin).hostname + '.png', fullPage: true });
            // Only this disposable browser's local outbox changes; no authenticated remote write.
            await tab.getByRole('textbox', { name: '任務名稱' }).fill('DEV-133 平台 UI 本機 fixture');
            await tab.getByRole('button', { name: '建立', exact: true }).click();
            await tab.waitForFunction(() => document.querySelector('#quick-task-success')?.textContent.includes('已記下'));
            await tab.reload({ waitUntil: 'domcontentloaded' });
            await tab.waitForFunction(() => document.querySelector('#quick-task-recovery-list')?.textContent.includes('DEV-133 平台 UI 本機 fixture'));
            check(name + '/pending-list-default-open', await tab.locator('#quick-task-recovery-details').evaluate(node => !node.hidden && node.open)
              && await tab.locator('#quick-task-auth-status').isVisible() && rpcWrites.length === 0, { remoteRpcWrites: rpcWrites.length });
          }
        } catch (error) {
          checks.push({ name: origin + '/' + mode.name + query, ok: false, error: error.message });
        } finally {
          await context.close();
        }
      }
    }
  }
  check('no-page-errors', errors.length === 0, errors);
  const result = { ok: checks.every(item => item.ok), scope: 'anonymous fresh-browser UI; Android/iPhone UA and display-mode simulation; disposable local outbox fixture only', expectedReleaseId, checks, errors, contextsClosed: true };
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error('DEV-133 platform UI failed: ' + checks.filter(item => !item.ok).map(item => item.name).join(', '));
  return result;
}
