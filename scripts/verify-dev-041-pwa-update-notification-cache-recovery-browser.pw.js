/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__projedPwaUpdateTest), null, { timeout: 15000 });

  const runMobileMatrix = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdateAvailable());
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });

    const text = await prompt.innerText();
    assert(/有新版本可用/.test(text), 'update prompt should announce a new version', { text });
    assert(/更新/.test(text), 'update prompt should expose update action text', { text });

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
    await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'visible', timeout: 10000 });
    const appliedPromise = page.evaluate(() => new Promise((resolve) => {
      window.addEventListener('projed:pwa-update-test-applied', () => resolve(true), { once: true });
      window.setTimeout(() => resolve(false), 5000);
    }));
    await page.locator('[data-pwa-update-action]').click();
    const applied = await appliedPromise;
    assert(applied === true, 'update button should invoke queued update callback');
    const state = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
    assert(state.updateAvailable === false && state.status === 'idle', 'state should reset after successful simulated update', state);
  };

  const runRecoveryMatrix = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateRecoverableCacheError('chunk load failed for browser verifier'));
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });
    const text = await prompt.innerText();
    assert(/載入新版時發生問題/.test(text), 'recovery prompt should explain load failure', { text });
    assert(await page.locator('[data-pwa-cache-recovery]').count() === 1, 'recovery prompt should expose cache recovery action');
    assert(await page.locator('[data-pwa-update-error]').count() === 1, 'recovery prompt should show error detail');
  };

  const runUpdatedMatrix = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__projedPwaUpdateTest.reset());
    await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdated());
    const prompt = page.locator('[data-pwa-update-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });
    const text = await prompt.innerText();
    assert(/已更新到新版/.test(text), 'updated prompt should confirm the newest version is loaded', { text });
    await page.locator('[data-pwa-updated-confirm]').click();
    await prompt.waitFor({ state: 'hidden', timeout: 5000 });
    const state = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
    assert(state.status === 'updated' && state.dismissedAt, 'updated prompt should be dismissible without changing update state', state);
  };

  await runMobileMatrix();
  await runApplyMatrix();
  await runRecoveryMatrix();
  await runUpdatedMatrix();

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
      'update button invokes queued callback',
      'recovery prompt exposes cache action',
      'updated prompt confirms newest loaded version',
    ],
    diagnostics: diagnostics.slice(-20),
  }, null, 2);
}
