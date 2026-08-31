/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__projedPwaUpdateTest), null, { timeout: 15000 });

  const runMobileMatrix = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdateAvailable());
    await page.waitForFunction(() => {
      const state = window.__projedPwaUpdateTest.getState();
      return state.status === 'update-available' && state.updateAvailable && !state.dismissedAt;
    }, null, { timeout: 10000 });
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });

    const text = await prompt.innerText();
    assert(/新版已就緒/.test(text), 'update prompt should announce a ready version', { text });
    assert(/重新載入/.test(text) && !/一鍵更新到最新版/.test(text), 'update prompt should expose the compact reload action text', { text });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      promptRect: document.querySelector('[data-pwa-update-prompt]')?.getBoundingClientRect().toJSON(),
      actionRect: document.querySelector('[data-pwa-update-action]')?.getBoundingClientRect().toJSON(),
    }));
    assert(overflow.scrollWidth <= overflow.clientWidth + 1, 'mobile prompt should not cause horizontal overflow', overflow);
    assert(Boolean(overflow.promptRect) && overflow.promptRect.bottom <= 844 && overflow.promptRect.top >= 0, 'mobile prompt should stay inside viewport', overflow);
    assert(Boolean(overflow.actionRect) && overflow.actionRect.width >= 44 && overflow.actionRect.height >= 32, 'update action should be tappable', overflow);

    await page.locator('[data-pwa-update-later]').click();
    await prompt.waitFor({ state: 'hidden', timeout: 5000 });
    const dismissedState = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
    assert(dismissedState.updateAvailable === true && dismissedState.dismissedAt, 'dismiss should hide prompt without losing queued update state', dismissedState);
  };

  const runApplyMatrix = async () => {
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdateAvailable());
    await page.waitForFunction(() => {
      const state = window.__projedPwaUpdateTest.getState();
      return state.status === 'update-available' && state.updateAvailable && !state.dismissedAt;
    }, null, { timeout: 10000 });
    await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'visible', timeout: 10000 });
    const appliedPromise = page.evaluate(() => new Promise((resolve) => {
      const result = { queuedCallbackApplied: false, transactionComplete: false };
      window.addEventListener('projed:pwa-update-test-applied', () => {
        result.queuedCallbackApplied = true;
      }, { once: true });
      window.addEventListener('projed:pwa-update-test-transaction-complete', () => {
        result.transactionComplete = true;
        resolve(result);
      }, { once: true });
      window.setTimeout(() => resolve(result), 5000);
    }));
    await page.locator('[data-pwa-update-action]').click();
    const applied = await appliedPromise;
    assert(applied.transactionComplete === true, 'update button should complete the one-click update transaction', applied);
    assert(applied.queuedCallbackApplied === false, 'update button should not invoke a stale queued update callback', applied);
    const state = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
    assert(state.updateAvailable === false && state.status === 'idle', 'state should reset after successful simulated update', state);
  };

  const runRecoveryMatrix = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateRecoverableCacheError('chunk load failed for browser verifier'));
    await page.waitForFunction(() => window.__projedPwaUpdateTest.getState().status === 'recoverable-cache-error', null, { timeout: 10000 });
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });
    const text = await prompt.innerText();
    assert(/載入新版時發生問題/.test(text), 'recovery prompt should explain load failure', { text });
    assert(await page.locator('[data-pwa-cache-recovery]').count() === 1, 'recovery prompt should expose cache recovery action');
    assert(await page.locator('[data-pwa-update-error]').count() === 1, 'recovery prompt should show error detail');
  };

  const runCurrentVersionMatrix = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdated());
    await page.waitForFunction(() => window.__projedPwaUpdateTest.getState().status === 'updated', null, { timeout: 10000 });
    const state = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
    assert(await page.locator('[data-pwa-update-prompt]').count() === 0, 'same-version state should not show a stale update prompt', state);
    assert(state.status === 'updated' && state.updateAvailable === false && state.currentVersion === state.latestVersion, 'same-version state should reconcile without an update prompt', state);
  };

  await runMobileMatrix();
  await runApplyMatrix();
  await runRecoveryMatrix();
  await runCurrentVersionMatrix();

  const criticalDiagnostics = diagnostics.filter(line => (
    /pageerror|console:error/i.test(line) &&
    !/favicon|ResizeObserver/i.test(line)
  ));
  assert(criticalDiagnostics.length === 0, 'browser verifier should not emit critical runtime errors', { criticalDiagnostics });

  return JSON.stringify({
    ok: true,
    verified: [
      'mobile update prompt visible and tappable',
      'dismiss keeps queued update state',
      'update button completes one-click update transaction',
      'recovery prompt exposes cache action',
      'same-version state suppresses stale update prompt',
    ],
    diagnostics: diagnostics.slice(-20),
  }, null, 2);
}
