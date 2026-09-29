/* eslint-disable */
async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const openSettings = async () => {
    if (await page.locator('[data-settings-view="true"]').isVisible().catch(() => false)) return;
    const settingsButton = page.locator('[data-sidebar-settings-button="true"]').first();
    if (!(await settingsButton.isVisible().catch(() => false))) {
      await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    }
    await settingsButton.waitFor({ state: 'visible' });
    await settingsButton.click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: 'local-test-user',
      email: 'test@projed.local',
      displayName: '本機測試擁有者',
      createdAt: 1704067200000,
    }));
  });
  await page.goto(`${origin}/?qcReset=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.evaluate(() => {
    localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: 'local-test-user', email: 'test@projed.local', displayName: '本機測試擁有者', createdAt: 1704067200000,
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.locator('nav').waitFor({ state: 'visible' });
  await page.locator('[data-main-sidebar-toggle]').waitFor({ state: 'visible' });
  await openSettings();

  await page.locator('[data-settings-section-tab="notifications"]').click();
  const notice = page.locator('[data-system-notice="optional-icon-reinstall-20260929"]');
  await notice.waitFor({ state: 'visible' });
  const text = await notice.innerText();
  if (!text.includes('手機 App 圖示可自由更新') || !text.includes('舊圖示仍可繼續使用')) {
    throw new Error('Persistent icon notice missing');
  }
  const width = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: document.documentElement.clientWidth }));
  if (width.body > width.viewport + 1) throw new Error(`Mobile settings overflow: ${JSON.stringify(width)}`);
  await page.screenshot({ path: 'output/playwright/dev-132/notice-mobile.png' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.locator('[data-main-sidebar-toggle]').waitFor({ state: 'visible' });
  await openSettings();
  await page.locator('[data-settings-section-tab="notifications"]').click();
  await notice.waitFor({ state: 'visible' });
  await notice.locator('[data-system-notice-action="icon-reinstall"]').click();
  const guide = page.locator('[data-icon-reinstall-guide]');
  await guide.waitFor({ state: 'visible' });
  if (await guide.locator('button[aria-expanded]').getAttribute('aria-expanded') !== 'true') {
    throw new Error('Notice did not open the optional guide');
  }
  await page.locator('[aria-label="選擇要更新的圖示"] button').nth(1).click();
  const installLink = await guide.locator('span.break-all').innerText();
  if (installLink !== `${origin}/quick-task/?install=1`) throw new Error(`Local quick install link mismatch: ${installLink}`);
  await page.screenshot({ path: 'output/playwright/dev-132/guide-mobile.png' });
  return JSON.stringify({ ok: true, persistedAfterReload: true, guideOpen: true, mobileOverflow: false });
}
