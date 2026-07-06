/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const seedSession = async () => {
    await page.evaluate(({ account }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, { account });
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 });
  };

  const ensureSidebarOpen = async () => {
    const settingsButton = page.locator('[data-sidebar-settings-button="true"]').first();
    if ((await settingsButton.count()) === 0 || !(await settingsButton.isVisible().catch(() => false))) {
      await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    }
    await page.locator('[data-sidebar-settings-button="true"]').first().waitFor({ state: 'visible', timeout: 10000 });
  };

  const openQuickStartSettings = async () => {
    await page.locator('[data-sidebar-settings-button="true"]').first().click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-section-tab="app"]').click();
    await page.locator('[data-pwa-install-settings]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const assertNoHorizontalOverflow = async (label) => {
    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
    }));
    assert(
      overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1 &&
        overflow.rootScrollWidth <= overflow.rootClientWidth + 1,
      `${label} should not have horizontal overflow`,
      overflow,
    );
  };

  const assertInstallPanel = async (label) => {
    const panel = page.locator('[data-pwa-install-settings]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    const text = await panel.innerText();
    assert(text.includes('App 安裝與快速開啟'), `${label} should show install settings title`, { text });
    assert(text.includes('重新顯示提示'), `${label} should expose reset action`, { text });
    assert(!/Service Worker|manifest|cache|PWA|403/i.test(text), `${label} should not expose technical terms`, { text });
    await assertNoHorizontalOverflow(label);
  };

  const assertRetiredQuickCaptureShellAbsent = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4173/?qcReset=1', { waitUntil: 'networkidle' });
    assert(await page.locator('[data-quick-capture-shell]').count() === 0, 'retired quick capture floating shell should not render before login');
    assert(await page.locator('[data-quick-capture-toggle]').count() === 0, 'retired quick capture toggle should not render before login');
    await assertNoHorizontalOverflow('mobile without retired quick capture shell');
    await page.screenshot({ path: 'output/playwright/dev-034-quick-capture-shell-removed-mobile.png', fullPage: true });
  };

  await assertRetiredQuickCaptureShellAbsent();

  await openApp({ width: 1440, height: 900 });
  await ensureSidebarOpen();
  await openQuickStartSettings();
  await assertInstallPanel('desktop quick-start install guidance');
  await page.screenshot({ path: 'output/playwright/dev-034-pwa-install-guidance-desktop.png', fullPage: true });

  await openApp({ width: 390, height: 844 });
  await ensureSidebarOpen();
  await openQuickStartSettings();
  await assertInstallPanel('mobile quick-start install guidance');
  await page.screenshot({ path: 'output/playwright/dev-034-pwa-install-guidance-mobile.png', fullPage: true });

  return {
    passed: true,
    screenshots: [
      'output/playwright/dev-034-quick-capture-shell-removed-mobile.png',
      'output/playwright/dev-034-pwa-install-guidance-desktop.png',
      'output/playwright/dev-034-pwa-install-guidance-mobile.png',
    ],
  };
}
