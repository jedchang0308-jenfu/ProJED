/* eslint-disable */
async (page) => {
  const diagnostics = [];
  const viewports = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__projedPwaUpdateTest), null, { timeout: 15000 });

  const inspectPrompt = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdateAvailable());
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });
    const text = await prompt.innerText();
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const prompt = document.querySelector('[data-pwa-update-prompt]');
      const action = document.querySelector('[data-pwa-update-action]');
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        promptRect: prompt?.getBoundingClientRect().toJSON(),
        actionRect: action?.getBoundingClientRect().toJSON(),
        normalIconCount: prompt?.querySelectorAll('span[aria-hidden="true"]').length ?? 0,
        paragraphCount: prompt?.querySelectorAll('p').length ?? 0,
        actionText: action?.textContent?.trim() ?? '',
        buttonCount: prompt?.querySelectorAll('button').length ?? 0,
      };
    });
    assert(/有新版本可用/.test(text), 'normal prompt should announce a new version', { text });
    assert(/一鍵更新/.test(text) && !/一鍵更新到最新版/.test(text), 'normal prompt should use compact CTA', { text });
    assert(metrics.normalIconCount === 0 && metrics.paragraphCount === 0, 'normal prompt should remove non-core icon and description', metrics);
    assert(metrics.buttonCount === 3, 'normal prompt should have update, later and close controls', metrics);
    assert(metrics.scrollWidth <= metrics.clientWidth + 1, 'prompt should not cause horizontal overflow', metrics);
    assert(metrics.promptRect && metrics.promptRect.top >= 0 && metrics.promptRect.bottom <= height, 'prompt should stay within viewport', metrics);
    assert(metrics.actionRect && metrics.actionRect.width >= 44 && metrics.actionRect.height >= 32, 'update action should be tappable', metrics);
    viewports.push({ width, height, text, metrics });
    await page.screenshot({ path: `output/playwright/dev-096/pwa-update-prompt-${width}.png` });
  };

  await inspectPrompt(390, 844);
  await page.locator('[data-pwa-update-later]').click();
  await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'hidden', timeout: 5000 });
  const dismissedState = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
  assert(dismissedState.updateAvailable === true && dismissedState.dismissedAt, 'later should hide prompt without losing target transaction', dismissedState);

  await inspectPrompt(320, 844);
  await page.evaluate(() => {
    window.__DEV096_EVENTS = { staleCallback: 0, transactionComplete: 0 };
    window.addEventListener('projed:pwa-update-test-applied', () => { window.__DEV096_EVENTS.staleCallback += 1; });
    window.addEventListener('projed:pwa-update-test-transaction-complete', () => { window.__DEV096_EVENTS.transactionComplete += 1; });
  });
  await page.locator('[data-pwa-update-action]').click();
  await page.waitForFunction(() => window.__projedPwaUpdateTest.getState().status === 'idle', null, { timeout: 10000 });
  const applied = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
  assert(applied.updateAvailable === false && applied.currentVersion === 'test-next', 'one-click transaction should converge to test target', applied);
  const eventCounts = await page.evaluate(() => window.__DEV096_EVENTS);
  assert(eventCounts.staleCallback === 0 && eventCounts.transactionComplete === 1, 'test transaction should complete once without stale callback', eventCounts);
  await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'hidden', timeout: 5000 });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__projedPwaUpdateTest.reset());
  await page.evaluate(() => window.__projedPwaUpdateTest.simulateRecoverableCacheError('chunk load failed for browser verifier'));
  const recoveryPrompt = page.locator('[data-pwa-update-prompt]');
  await recoveryPrompt.waitFor({ state: 'visible', timeout: 10000 });
  const recoveryText = await recoveryPrompt.innerText();
  assert(/載入新版時發生問題/.test(recoveryText), 'recovery prompt should explain load failure', { recoveryText });
  assert(await page.locator('[data-pwa-cache-recovery]').count() === 1, 'recovery prompt should expose manual cache recovery');
  assert(await page.locator('[data-pwa-update-error]').count() === 1, 'recovery prompt should show minimal error detail');
  await page.screenshot({ path: 'output/playwright/dev-096/pwa-update-recovery.png' });

  const criticalDiagnostics = diagnostics.filter((line) => /pageerror|console:error/i.test(line) && !/favicon|ResizeObserver/i.test(line));
  assert(criticalDiagnostics.length === 0, 'browser verifier should not emit critical runtime errors', { criticalDiagnostics });
  await page.evaluate((artifact) => { window.__DEV096_ARTIFACT = artifact; }, {
    ok: true,
    source: 'dev-096-browser-test-mode',
    viewports,
    recoveryText,
    diagnostics: diagnostics.slice(-20),
  });

  return JSON.stringify({
    ok: true,
    verified: [
      'compact normal prompt at 390x844 and 320x844',
      'later preserves target transaction',
      'one-click test transaction completes without stale callback',
      'recovery prompt keeps minimal error and manual cache action',
      'no critical browser diagnostics',
    ],
    diagnostics: diagnostics.slice(-20),
  }, null, 2);
}
