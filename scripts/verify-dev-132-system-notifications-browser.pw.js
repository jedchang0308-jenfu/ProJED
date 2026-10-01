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
  if (!text.includes('手機 App 新圖示：可自行選擇更換') || !text.includes('網站圖示已更新，手機 App 可能仍顯示舊圖示')) {
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
  if (text.includes('查看更換方式')) throw new Error('System notice still has a dedicated detail button');
  await notice.click();
  const dialog = page.locator('[data-system-notice-dialog]');
  await dialog.waitFor({ state: 'visible' });
  if (await dialog.getAttribute('aria-modal') !== 'true') throw new Error('System notice detail is not modal');
  if (await page.locator('[data-settings-section-tab="notifications"]').getAttribute('aria-pressed') !== 'true') {
    throw new Error('Opening the guide left system notifications');
  }
  const guideText = await dialog.innerText();
  const readingOrder = ['兩個 App 的圖示對照', '確認內容已保存並同步', '保存要更換 App 的安裝連結', '移除並重新安裝'];
  if (readingOrder.some(phrase => !guideText.includes(phrase))
    || readingOrder.some((phrase, index) => index > 0 && guideText.indexOf(phrase) <= guideText.indexOf(readingOrder[index - 1]))) {
    throw new Error('Icon guide reading order is unclear');
  }
  const mainOldIcon = await dialog.locator('[data-icon-reinstall-app="main"] img').first().getAttribute('src');
  if (mainOldIcon !== '/icons/icon-vibrant-02-aqua-lime.png') throw new Error(`Main old icon mismatch: ${mainOldIcon}`);
  const quickOldIcon = await dialog.locator('[data-icon-reinstall-app="quick"] img').first().getAttribute('src');
  if (quickOldIcon !== '/icons/projed-quick-task-icon-legacy-red.png') throw new Error(`Quick old icon mismatch: ${quickOldIcon}`);
  await dialog.locator('[data-icon-reinstall-pending="check-in-app"]').waitFor({ state: 'visible' });
  if (!(await dialog.locator('[data-icon-reinstall-pending="check-in-app"]').innerText()).includes('此處無法查看該 App 的本機待辦')) {
    throw new Error('Independent quick app sync warning missing');
  }
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-system-notice-dialog] img'))
    .every((image) => image.complete && image.naturalWidth > 0));
  const mainLink = await dialog.locator('[data-icon-reinstall-link="main"] span.break-all').innerText();
  const quickLink = await dialog.locator('[data-icon-reinstall-link="quick"] span.break-all').innerText();
  if (mainLink !== `${origin}/` || quickLink !== `${origin}/quick-task/?install=1`) {
    throw new Error(`App install link mismatch: ${JSON.stringify({ mainLink, quickLink })}`);
  }
  const expandedWidth = await dialog.evaluate(element => ({ body: element.scrollWidth, viewport: element.clientWidth }));
  if (expandedWidth.body > expandedWidth.viewport + 1) throw new Error(`Expanded notice overflow: ${JSON.stringify(expandedWidth)}`);
  await page.screenshot({ path: 'output/playwright/dev-132/guide-mobile.png' });
  await dialog.locator('[aria-label="關閉通知明細"]').click();
  await page.locator('[data-settings-section-tab="app"]').click();
  await page.locator('[data-pwa-install-settings]').waitFor({ state: 'visible' });
  if (await page.locator('[data-icon-reinstall-details]').count()) throw new Error('Icon update details still appear in quick start');
  await page.screenshot({ path: 'output/playwright/dev-132/quick-start-mobile.png' });
  return JSON.stringify({ ok: true, persistedAfterReload: true, guideInNotifications: true, quickStartFocused: true, mobileOverflow: false });
}
