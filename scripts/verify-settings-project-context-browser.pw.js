/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
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
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 10000 });
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

  await openApp({ width: 1440, height: 900 });

  await page.locator('[data-sidebar-settings-button="true"]').click();
  await page.locator('[data-settings-return-button="true"]').waitFor({ state: 'visible', timeout: 10000 });

  const settingsContext = await page.evaluate(() => ({
    currentSettingsProjectCount: document.querySelectorAll('[data-sidebar-current-settings-project="true"]').length,
    lockedProjectRows: document.querySelectorAll('[data-sidebar-board-row="true"][aria-disabled="true"]').length,
    lockTitleCount: Array.from(document.querySelectorAll('[data-sidebar-board-row="true"]'))
      .filter(row => /請先離開設定/.test(row.getAttribute('title') || '')).length,
    settingBadgeCount: Array.from(document.querySelectorAll('[data-sidebar-board-row="true"]'))
      .filter(row => /設定中/.test(row.textContent || '')).length,
    settingsButtonTitle: document.querySelector('[data-sidebar-settings-button="true"]')?.getAttribute('title') || '',
  }));

  assert(settingsContext.currentSettingsProjectCount === 1, 'settings should still mark the current project context', settingsContext);
  assert(settingsContext.lockedProjectRows === 0, 'settings should not disable board rows', settingsContext);
  assert(settingsContext.lockTitleCount === 0, 'settings should not show old locked-switch hint', settingsContext);
  assert(settingsContext.settingBadgeCount === 0, 'settings should not show the old board-level settings badge', settingsContext);
  assert(settingsContext.settingsButtonTitle === '回到看板', 'active Settings entry should return to board', settingsContext);
  await assertNoHorizontalOverflow('settings project context desktop');
  await page.screenshot({ path: 'output/playwright/settings-project-context-desktop.png', fullPage: false });

  await page.locator('[data-sidebar-board-row="true"]').first().click();
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 10000 });
  const viewAfterBoardClick = await page.evaluate(() => localStorage.getItem('projed-last-view'));
  assert(viewAfterBoardClick === 'board', 'clicking board row while in settings should return to board view', { viewAfterBoardClick });

  await page.locator('[data-sidebar-settings-button="true"]').click();
  await page.locator('[data-settings-return-button="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-settings-return-button="true"]').click();
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 10000 });
  const viewAfterReturnButton = await page.evaluate(() => localStorage.getItem('projed-last-view'));
  assert(viewAfterReturnButton === 'board', 'Settings content return button should return to board view', { viewAfterReturnButton });

  return {
    passed: true,
    screenshot: 'output/playwright/settings-project-context-desktop.png',
  };
}
