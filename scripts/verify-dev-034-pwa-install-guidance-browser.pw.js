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
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://localhost:4000/?qcReset=1', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 });
  };

  const assertNoAutomaticInstallPrompt = async (label) => {
    const promptCount = await page.locator('[data-pwa-install-assistant]').count();
    assert(promptCount === 0, `${label} should not show an automatic install prompt`, { promptCount });
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
    assert(text.includes('ProJED 主程式') && text.includes('ProJED-快速建任務'), `${label} should show both App choices`, { text });
    assert(!text.includes('提示狀態') && !text.includes('重新顯示提示'), `${label} should keep the choice screen concise`, { text });
    assert(!/Service Worker|manifest|cache|PWA|403/i.test(text), `${label} should not expose technical terms`, { text });
    const quickEntry = panel.locator('[data-quick-task-install-cta="true"]');
    assert(await quickEntry.count() === 1, `${label} should expose one quick-task choice`);
    assert(await panel.locator('[data-app-install-detail]').count() === 0, `${label} should wait for a choice before showing instructions`);
    await panel.locator('[data-app-install-choice="main"]').click();
    assert(await panel.locator('[data-app-install-detail="main"]').isVisible(), `${label} should show main App installation guidance`);
    if (label.startsWith('desktop')) {
      const installAction = panel.locator('[data-main-install-action="true"]');
      assert(await installAction.isVisible(), `${label} should always show the main App installation action`);
      await installAction.click();
      assert((await panel.locator('[data-app-install-detail="main"]').innerText()).includes('目前瀏覽器無法直接開啟安裝視窗'), `${label} should explain an unavailable browser prompt`);
      await page.evaluate(() => {
        let prompted = false;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.defineProperties(event, {
          prompt: { value: async () => { prompted = true; } },
          userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
        });
        Object.defineProperty(window, '__DEV034_PROMPTED', { configurable: true, get: () => prompted });
        window.dispatchEvent(event);
      });
      await installAction.click();
      assert(await page.evaluate(() => Boolean(window.__DEV034_PROMPTED)), `${label} should call native browser installation prompt`);
    } else {
      assert((await panel.locator('[data-app-install-detail="main"]').innerText()).includes('選「安裝應用程式」'), `${label} should teach Chrome installation`);
    }
    await quickEntry.click();
    const quickDetail = panel.locator('[data-app-install-detail="quick"]');
    assert(await quickDetail.isVisible(), `${label} should show quick App installation guidance`);
    const quickText = await quickDetail.innerText();
    assert(quickText.includes('與主程式相同的 Google 帳號登入'), `${label} should explain the separate login`, { quickText });
    if (label.startsWith('mobile')) assert(quickText.includes('用手機 Chrome 開啟 ProJED-快速建任務安裝頁'), `${label} should teach Chrome installation for the quick App`, { quickText });
    assert(!/自動.{0,8}兩.{0,8}圖示|立即.{0,8}捷徑|iOS.{0,8}長按/u.test(quickText), `${label} should avoid unsupported shortcut promises`, { quickText });
    const quickLinks = await quickDetail.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert(quickLinks.length === 1 && quickLinks[0] === '/quick-task/?install=1', `${label} should preserve the independent install link`, { quickLinks });
    await assertNoHorizontalOverflow(label);
  };

  const assertRetiredQuickCaptureShellAbsent = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:4000/?qcReset=1', { waitUntil: 'networkidle' });
    assert(await page.locator('[data-quick-capture-shell]').count() === 0, 'retired quick capture floating shell should not render before login');
    assert(await page.locator('[data-quick-capture-toggle]').count() === 0, 'retired quick capture toggle should not render before login');
    await assertNoHorizontalOverflow('mobile without retired quick capture shell');
    await page.screenshot({ path: 'output/playwright/dev-034-quick-capture-shell-removed-mobile.png', fullPage: true });
  };

  await assertRetiredQuickCaptureShellAbsent();

  await openApp({ width: 1440, height: 900 });
  await assertNoAutomaticInstallPrompt('desktop after login');
  await ensureSidebarOpen();
  await openQuickStartSettings();
  await assertInstallPanel('desktop quick-start install guidance');
  await page.screenshot({ path: 'output/playwright/dev-034-pwa-install-guidance-desktop.png', fullPage: true });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  });
  await openApp({ width: 390, height: 844 });
  await assertNoAutomaticInstallPrompt('mobile after login');
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
