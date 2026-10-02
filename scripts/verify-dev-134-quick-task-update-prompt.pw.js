/* eslint-disable */
async page => {
  const checks = [];
  const errors = [];
  const assert = (ok, name, detail = {}) => { checks.push({ name, ok, detail }); if (!ok) errors.push(name); };
  const prompt = page.locator('[data-pwa-update-prompt]');
  const state = value => page.evaluate(value => window.__DEV134_QUICK_UPDATE_FIXTURE.set(value), value);
  await page.waitForFunction(() => Boolean(window.__DEV134_QUICK_UPDATE_FIXTURE));
  await page.setViewportSize({ width: 320, height: 844 });

  await state({ status: 'idle', updateAvailable: true, reloadSafetyState: 'safe' });
  assert(await prompt.isHidden(), 'safe update uses shared silent apply policy');

  await state({ status: 'update-available', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'dirty' });
  await prompt.waitFor({ state: 'visible' });
  assert((await prompt.innerText()).includes('新版已就緒'), 'dirty page announces available update');
  assert(await prompt.getByRole('button', { name: '重新載入' }).isVisible() && await prompt.getByRole('button', { name: '稍後' }).isVisible(), 'normal prompt matches main app actions');
  const layout = await page.evaluate(() => {
    const card = document.querySelector('[data-pwa-update-prompt]');
    const button = card.querySelector('[data-pwa-update-action]');
    const box = card.getBoundingClientRect(); const action = button.getBoundingClientRect();
    return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, left: box.left, right: box.right, bottom: box.bottom, viewport: innerHeight, buttonBottom: action.bottom };
  });
  assert(layout.scrollWidth <= layout.width && layout.left >= 0 && layout.right <= layout.width && layout.bottom <= layout.viewport + 1 && layout.buttonBottom <= layout.viewport, '320px mobile prompt fits viewport', layout);
  await page.screenshot({ path: 'output/playwright/dev134-quick-task-prompt-320x844.png' });

  await prompt.getByRole('button', { name: '稍後' }).click();
  const actions = await page.evaluate(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions);
  assert(actions.dismiss === 1, 'later calls shared dismiss action');
  await state({ dismissedAt: null });
  await prompt.getByRole('button', { name: '重新載入' }).click();
  await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.apply === 1);
  assert(true, 'reload calls shared safety-gated apply action');

  await state({ status: 'recoverable-cache-error', updateAvailable: false, failureKind: 'load', errorMessage: '畫面暫時無法載入。', reloadSafetyState: 'dirty' });
  assert((await prompt.innerText()).includes('畫面載入失敗') && await prompt.getByRole('button', { name: '重試' }).isVisible() && await prompt.getByRole('button', { name: '清除快取後重整' }).isVisible(), 'load recovery preserves main app actions');
  await prompt.getByRole('button', { name: '重試' }).click();
  await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.retry === 1);
  await prompt.getByRole('button', { name: '清除快取後重整' }).click();
  await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.recover === 1);
  assert(true, 'recovery actions call shared retry and cache recovery');

  const diagnostics = await page.evaluate(() => ({ horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, promptVisible: !document.querySelector('[data-pwa-update-prompt]').hidden }));
  assert(!diagnostics.horizontalOverflow && diagnostics.promptVisible, 'prompt remains usable after state changes', diagnostics);
  return { ok: errors.length === 0, checks, errors, viewport: '320x844', fixtureOnly: true };
}
