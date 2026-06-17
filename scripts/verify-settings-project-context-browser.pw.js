/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/?qcReset=1', { waitUntil: 'networkidle' });
    const fixedTestLogin = page.locator('button', { hasText: '使用固定測試環境' }).first();
    if (await fixedTestLogin.count()) {
      await fixedTestLogin.click();
    }
    await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 });
  };

  const ensureSidebarOpen = async () => {
    const expand = page.locator('button[title="展開工作區選單"]').first();
    if (await expand.count()) {
      await expand.click();
    }
    await page.locator('button', { hasText: '設定' }).first().waitFor({ state: 'visible', timeout: 10000 });
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

  const addSecondProjectIfNeeded = async () => {
    const boardRows = page.locator('aside [role="button"]');
    if ((await boardRows.count()) >= 2) return;

    await page.locator('button[title="新增看板"]').first().click({ force: true });
    await page.locator('.global-dialog-content input').fill('Context Switch Test');
    await page.keyboard.press('Enter');
    await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('aside [role="button"]', { hasText: 'Context Switch Test' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
  };

  const openSettings = async () => {
    await page.locator('button', { hasText: '設定' }).last().click();
    await page.locator('[data-sidebar-current-settings-project="true"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
  };

  await openApp({ width: 390, height: 844 });
  await ensureSidebarOpen();
  await addSecondProjectIfNeeded();
  await openSettings();

  const currentSettingsProject = page.locator('[data-sidebar-current-settings-project="true"]');
  assert((await currentSettingsProject.count()) === 1, 'settings should mark exactly one current project');
  assert(
    await currentSettingsProject.locator('text=目前設定').isVisible(),
    'current settings project should show the current-settings label',
  );

  const activeBoardBefore = await page.evaluate(() => localStorage.getItem('projed-last-board'));
  const inactiveProject = page.locator('aside [role="button"]:not([data-sidebar-current-settings-project])').first();
  assert((await inactiveProject.count()) === 1, 'test should have an inactive project row to click');
  assert(
    (await inactiveProject.getAttribute('title')) === '請先離開設定，再切換專案',
    'inactive project should explain why switching is locked',
  );
  await inactiveProject.click();

  const activeBoardAfterLockedClick = await page.evaluate(() => localStorage.getItem('projed-last-board'));
  const viewAfterLockedClick = await page.evaluate(() => localStorage.getItem('projed-last-view'));
  assert(activeBoardAfterLockedClick === activeBoardBefore, 'clicking another project in settings should not switch active project');
  assert(viewAfterLockedClick === 'settings', 'clicking another project in settings should stay in settings');
  assert((await currentSettingsProject.count()) === 1, 'current settings marker should remain after locked click');
  await assertNoHorizontalOverflow('settings project context mobile sidebar');
  await page.screenshot({ path: 'output/playwright/settings-project-context-mobile.png', fullPage: true });

  await page.locator('button[title="回到首頁"]').first().click();
  await inactiveProject.click();
  const activeBoardAfterLeavingSettings = await page.evaluate(() => localStorage.getItem('projed-last-board'));
  const viewAfterLeavingSettings = await page.evaluate(() => localStorage.getItem('projed-last-view'));
  assert(
    activeBoardAfterLeavingSettings !== activeBoardBefore,
    'clicking another project after leaving settings should switch active project',
  );
  assert(viewAfterLeavingSettings === 'board', 'switching project after leaving settings should return to board view');

  return {
    passed: true,
    screenshot: 'output/playwright/settings-project-context-mobile.png',
  };
}
