/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => {
    diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    diagnostics.push(`pageerror:${error.message}`);
  });

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

  const openApp = async (viewport = { width: 1440, height: 900 }, reset = true) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    const url = reset
      ? 'http://127.0.0.1:4173/?qcReset=1&qcSize=18'
      : 'http://127.0.0.1:4173/';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openSettings = async () => {
    const settingsButton = page.locator('[data-sidebar-settings-button="true"]').first();
    if (await settingsButton.count() === 0) {
      await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    }
    await page.locator('[data-sidebar-settings-button="true"]').first().click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const clickSettingsTab = async (tab) => {
    await page.locator(`[data-settings-section-tab="${tab}"]`).click();
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

  const getCurrentTarget = async () => page.evaluate(() => {
    const workspaces = JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]');
    const workspaceId = localStorage.getItem('projed-last-ws');
    const boardId = localStorage.getItem('projed-last-board');
    const workspace = workspaces.find(item => item.id === workspaceId);
    const board = workspace?.boards?.find(item => item.id === boardId);
    return {
      workspaceId,
      boardId,
      workspaceTitle: workspace?.title || '',
      boardTitle: board?.title || '',
      targetLabel: workspace && board ? `${workspace.title} / ${board.title}` : '',
    };
  });

  let step = 'open desktop app';
  try {
    await openApp();
    await openSettings();

    step = 'settings neutral header';
    const headerText = await page.locator('[data-settings-view="true"] header').innerText();
    assert(headerText.includes('設定中心'), 'settings header should show settings center title', { headerText });
    assert(!headerText.includes('系統設定與管理'), 'settings header should not use old global-system wording', { headerText });
    assert(!headerText.includes('目前看板：'), 'settings header should not frame all settings as current board', { headerText });

    step = 'board-scoped round-trip backup';
    const target = await getCurrentTarget();
    const backupText = await page.locator('[data-backup-settings-section="true"]').innerText();
    assert(backupText.includes('建立看板備份'), 'backup page should expose board package export', { backupText });
    assert(backupText.includes('匯入或還原'), 'backup page should expose the matching import task', { backupText });
    assert(backupText.includes('每份檔案只對應一張看板'), 'backup page should communicate single-board scope', { backupText });
    assert(!backupText.includes('匯出全域快照'), 'backup page should not claim a global snapshot', { backupText });
    await page.locator('[data-backup-export-counts="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const sourceOption = await page.locator('[data-backup-source-board-select="true"] option:checked').innerText();
    assert(sourceOption === target.targetLabel, 'backup selector should show the active board path', { sourceOption, target });

    step = 'inspect-first import without mutation';
    const nodesBefore = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-backup-download-v2="true"]').click();
    const backupDownload = await downloadPromise;
    const backupPath = await backupDownload.path();
    assert(backupPath, 'board package should download to a readable file');
    await page.locator('[data-backup-file-input="true"]').setInputFiles(backupPath);
    await page.locator('[data-backup-inspection-ready="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const inspectionText = await page.locator('[data-backup-inspection-ready="true"]').innerText();
    assert(inspectionText.includes('檔案已通過完整性檢查'), 'selected backup should be inspected before any action', { inspectionText });
    assert(inspectionText.includes('V2') && inspectionText.includes('SHA-256'), 'inspection should expose version and checksum', { inspectionText });
    assert(await page.locator('[data-backup-mode-copy="true"]').getAttribute('aria-checked') === 'true', 'copy should remain the safe default');
    assert(await page.evaluate(() => localStorage.getItem('projed-local-test.nodes')) === nodesBefore, 'inspection must not mutate board data');

    step = 'board permissions scope';
    await clickSettingsTab('permissions');
    await page.locator('[data-board-permission-settings]').waitFor({ state: 'visible', timeout: 10000 });
    const permissionsText = await page.locator('[data-board-permission-settings]').innerText();
    assert(permissionsText.includes('看板權限'), 'permissions tab should use board-permissions wording', { permissionsText });
    assert(permissionsText.includes('設定範圍：目前看板'), 'permissions panel should show current-board scope', { permissionsText });
    assert(permissionsText.includes(target.targetLabel), 'permissions panel should show active board target', { permissionsText, target });

    step = 'calendar external-link scope';
    await clickSettingsTab('calendar');
    await page.locator('[data-calendar-settings-scope="external-link"]').waitFor({ state: 'visible', timeout: 10000 });
    const calendarScopeText = await page.locator('[data-calendar-settings-scope="external-link"]').innerText();
    assert(calendarScopeText.includes('外部連結'), 'calendar settings should show external-link scope', { calendarScopeText });

    step = 'quick-open device/account scope';
    await clickSettingsTab('app');
    await page.locator('[data-pwa-install-settings]').waitFor({ state: 'visible', timeout: 10000 });
    const appText = await page.locator('[data-pwa-install-settings]').innerText();
    assert(appText.includes('設定範圍：此裝置 / 目前帳號'), 'quick-open settings should show device/account scope', { appText });
    assert(!appText.includes('目標：'), 'quick-open settings should not show board target wording', { appText });

    step = 'current-board trash page';
    await clickSettingsTab('backup');
    await page.locator('[data-settings-open-current-board-trash="true"]').click();
    await page.locator('[data-recycle-bin-view="current-board"]').waitFor({ state: 'visible', timeout: 10000 });
    const trashText = await page.locator('[data-recycle-bin-view="current-board"]').innerText();
    assert(trashText.includes('目前看板回收桶'), 'trash page should use current-board title', { trashText });
    assert(trashText.includes(target.targetLabel), 'trash page should show active board target', { trashText, target });
    assert(trashText.includes('目前看板沒有已刪除任務。'), 'empty trash should name current board scope', { trashText });

    step = 'empty trash confirm wording';
    await page.evaluate(({ target }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      nodes['dev038-archived-task'] = {
        id: 'dev038-archived-task',
        workspaceId: target.workspaceId,
        boardId: target.boardId,
        parentId: null,
        title: 'DEV-038 已刪除任務',
        status: 'todo',
        nodeType: 'task',
        order: 999,
        isArchived: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-last-view', 'recycle_bin');
    }, { target });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-recycle-bin-view="current-board"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('清空回收桶', { exact: true }).click();
    await page.locator('.global-dialog-content').waitFor({ state: 'visible', timeout: 10000 });
    const clearDialogText = await page.locator('.global-dialog-content').innerText();
    assert(clearDialogText.includes(target.boardTitle), 'empty-trash confirm should include board title', { clearDialogText, target });
    assert(clearDialogText.includes('1 筆已刪除任務'), 'empty-trash confirm should include archived item count', { clearDialogText });
    await page.locator('.global-dialog-content').getByText('取消', { exact: true }).click();
    await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-038-settings-scope-desktop.png', fullPage: false });
    await assertNoHorizontalOverflow('DEV-038 desktop settings/trash');

    step = 'mobile viewport settings scope';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'settings'));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await assertNoHorizontalOverflow('DEV-038 mobile backup');
    for (const tab of ['permissions', 'calendar', 'app']) {
      await clickSettingsTab(tab);
      await assertNoHorizontalOverflow(`DEV-038 mobile ${tab}`);
    }
    await page.screenshot({ path: 'output/playwright/dev-038-settings-scope-mobile.png', fullPage: false });

    const visibleText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(visibleText), 'settings scope pages should not show visible runtime errors');

    return {
      passed: true,
      screenshots: [
        'output/playwright/dev-038-settings-scope-desktop.png',
        'output/playwright/dev-038-settings-scope-mobile.png',
      ],
      diagnostics: diagnostics.slice(-20),
    };
  } catch (error) {
    throw new Error(`${step}: ${error.message}; diagnostics=${JSON.stringify(diagnostics.slice(-20))}`);
  }
}
