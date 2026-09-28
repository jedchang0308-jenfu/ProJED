/* eslint-disable */
async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const failures = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36',
    });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => query === '(display-mode: minimal-ui)'
      ? { matches: true, addEventListener() {}, removeEventListener() {} }
      : nativeMatchMedia(query);
    localStorage.setItem('projed.pwaInstall.status', JSON.stringify({ installed: true, dismissed: false }));
  });

  await page.goto(`${origin}/quick-task/`, { waitUntil: 'domcontentloaded' });
  const quickEntryLink = page.locator('[data-quick-install-link]');
  await quickEntryLink.waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('#quick-task-title').isVisible())) failures.push('quick capture form hidden by optional entry');
  await quickEntryLink.click();
  if (!page.url().includes('install=1')) failures.push('quick installed entry did not open install guide');
  const quickToggle = page.locator('[data-quick-icon-reinstall-toggle]');
  await quickToggle.waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('projed-quick-task-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('captures')) request.result.createObjectStore('captures', { keyPath: 'captureId' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('captures', 'readwrite');
      tx.objectStore('captures').put({ captureId: 'dev130-pending', state: 'pending', accountId: null });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  if (await page.locator('[data-quick-icon-reinstall]').count()) failures.push('quick guide opened without user choice');
  await quickToggle.click();
  await page.locator('[data-quick-icon-reinstall]').waitFor({ state: 'visible' });
  await page.getByText('有 1 筆快速待辦尚未同步，請先完成同步，暫勿移除。').waitFor({ state: 'visible', timeout: 15000 });
  if (await page.locator('[data-quick-icon-reinstall-link]').count() !== 1) failures.push('quick save-link action missing');
  await page.screenshot({ path: 'output/playwright/dev130-optional/quick-390x844.png' });

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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-main-sidebar-toggle]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-main-sidebar-toggle]').click();
  await page.locator('[data-sidebar-settings-button]').click();
  await page.locator('[data-settings-section-tab="app"]').click();
  const mainToggle = page.locator('[data-icon-reinstall-guide] button[aria-expanded]');
  await mainToggle.waitFor({ state: 'visible', timeout: 15000 });
  if (await page.getByText('先確認工作內容已儲存並同步。').count()) failures.push('main guide opened without user choice');
  await mainToggle.click();
  await page.locator('[data-icon-reinstall-pending="ready"]').waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('[data-icon-reinstall-pending="ready"]').innerText()).includes('1 筆快速待辦尚未同步')) failures.push('main guide missed pending quick task');
  if (await page.locator('[data-icon-reinstall-save-link]').count() !== 1) failures.push('main save-link action missing');
  if (!(await page.locator('[data-icon-reinstall-guide]').innerText()).includes('另一個入口無須移除')) failures.push('independent icon choice missing');
  await page.screenshot({ path: 'output/playwright/dev130-optional/main-settings-390x844.png' });

  if (failures.length) throw new Error(JSON.stringify(failures));
  return JSON.stringify({ ok: true, quickGuide: true, mainGuide: true, optional: true, viewport: 390 });
}
