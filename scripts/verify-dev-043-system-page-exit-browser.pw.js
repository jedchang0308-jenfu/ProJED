async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const screenshotBase = `output/playwright/dev-043-system-page-exit-${Date.now()}`;

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const seedAuxiliaryState = async () => {
    await page.evaluate(({ account }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({
        open: false,
        filtersOpen: false,
        showContainersInAllTasks: false,
      }));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedAuxiliaryState();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=24', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedAuxiliaryState();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await waitForBoard();
  };

  const waitForBoard = async () => {
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-system-page-return-button="true"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  };

  const ensureSidebarOpen = async () => {
    if (await page.locator('[data-sidebar-inline="true"]').count()) return;
    await page.locator('[data-main-sidebar-toggle="true"]').click();
    await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
  };

  const openSettings = async () => {
    await ensureSidebarOpen();
    await page.locator('[data-sidebar-settings-button="true"]').click();
    await page.locator('[data-settings-return-button="true"]').waitFor({ state: 'visible', timeout: 5000 });
  };

  const openRecords = async () => {
    await ensureSidebarOpen();
    await page.locator('[data-sidebar-records-button="true"]').click();
    await page.locator('[data-records-return-button="true"]').waitFor({ state: 'visible', timeout: 5000 });
  };

  const layoutMetrics = async () => page.evaluate(() => ({
    boardVisible: Boolean(document.querySelector('[data-mobile-pan-surface="board"]')),
    settingsReturnCount: document.querySelectorAll('[data-settings-return-button="true"]').length,
    recordsReturnCount: document.querySelectorAll('[data-records-return-button="true"]').length,
    systemReturnCount: document.querySelectorAll('[data-system-page-return-button="true"]').length,
    oldTopExitCount: Array.from(document.querySelectorAll('button')).filter(button => /離開設定/.test(button.textContent || '')).length,
    settingsActiveTitle: document.querySelector('[data-sidebar-settings-button="true"]')?.getAttribute('title') || '',
    recordsActiveTitle: document.querySelector('[data-sidebar-records-button="true"]')?.getAttribute('title') || '',
    disabledBoardRows: document.querySelectorAll('[data-sidebar-board-row="true"][aria-disabled="true"]').length,
    settingsBadgeText: Array.from(document.querySelectorAll('[data-sidebar-board-row="true"]')).map(row => row.textContent || '').filter(text => text.includes('設定中')).length,
  }));

  const assertNoVisibleErrors = async () => {
    const alertTexts = await page.locator('.inline-error, [role="alert"]').evaluateAll((items) =>
      items
        .map((item) => item.textContent?.trim())
        .filter(Boolean)
        .filter((text) => !/請輸入/.test(text))
    );
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const visibleHttpError = /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText);
    assert(alertTexts.length === 0 && !visibleHttpError, 'visible errors should not exist', { alertTexts, visibleHttpError });
  };

  const runCase = async (id, scenario, fn) => {
    const startedAt = new Date().toISOString();
    try {
      const details = await fn();
      results.push({ id, scenario, result: 'PASS', startedAt, details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', startedAt, error: error.message, screenshotPath });
    }
  };

  try {
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(20000);

    await openApp();

    await runCase('QA-043-B01', 'Settings page exposes content return button and no old top exit', async () => {
      await openSettings();
      const metrics = await layoutMetrics();
      assert(metrics.settingsReturnCount === 1 && metrics.systemReturnCount === 1, 'Settings should expose one content-level return button', metrics);
      assert(metrics.oldTopExitCount === 0, 'old top-nav Settings exit button should not remain', metrics);
      assert(metrics.disabledBoardRows === 0 && metrics.settingsBadgeText === 0, 'Settings should not lock or badge board rows', metrics);
      const screenshotPath = `${screenshotBase}-settings-return.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { ...metrics, screenshotPath };
    });

    await runCase('QA-043-B02', 'Settings return button, active entry and board row all return to board', async () => {
      await page.locator('[data-settings-return-button="true"]').click();
      await waitForBoard();

      await openSettings();
      let metrics = await layoutMetrics();
      assert(metrics.settingsActiveTitle === '回到看板', 'active Settings sidebar entry should advertise return behavior', metrics);
      await page.locator('[data-sidebar-settings-button="true"]').click();
      await waitForBoard();

      await openSettings();
      await page.locator('[data-sidebar-board-row="true"]').first().click();
      await waitForBoard();
      metrics = await layoutMetrics();
      assert(metrics.boardVisible && metrics.systemReturnCount === 0, 'board row click in Settings should return to board', metrics);
      return metrics;
    });

    await runCase('QA-043-B03', 'Records page exposes matching return paths', async () => {
      await openRecords();
      let metrics = await layoutMetrics();
      assert(metrics.recordsReturnCount === 1 && metrics.systemReturnCount === 1, 'Records should expose one content-level return button', metrics);
      assert(metrics.recordsActiveTitle === '回到看板', 'active Records sidebar entry should advertise return behavior', metrics);
      await page.locator('[data-records-return-button="true"]').click();
      await waitForBoard();

      await openRecords();
      await page.locator('[data-sidebar-records-button="true"]').click();
      await waitForBoard();

      await openRecords();
      await page.keyboard.press('Escape');
      await waitForBoard();
      metrics = await layoutMetrics();
      assert(metrics.boardVisible && metrics.systemReturnCount === 0, 'Records Escape should return to board', metrics);
      return metrics;
    });

    await runCase('QA-043-B04', 'Settings Escape returns to board and visible error sweep passes', async () => {
      await openSettings();
      await page.keyboard.press('Escape');
      await waitForBoard();
      const metrics = await layoutMetrics();
      assert(metrics.boardVisible && metrics.systemReturnCount === 0, 'Settings Escape should return to board', metrics);
      await assertNoVisibleErrors();
      return { ...metrics, diagnostics: diagnostics.slice(-10) };
    });

    const failCount = results.filter(result => result.result !== 'PASS').length;
    const summary = {
      ok: failCount === 0,
      summary: {
        pass: results.length - failCount,
        fail: failCount,
      },
      results,
      diagnostics: diagnostics.slice(-30),
    };

    console.log(JSON.stringify(summary, null, 2));
    if (failCount > 0) {
      const failures = results
        .filter(result => result.result !== 'PASS')
        .map(result => ({
          id: result.id,
          scenario: result.scenario,
          error: result.error,
          screenshotPath: result.screenshotPath,
        }));
      throw new Error(`DEV-043 system page exit failed: ${failCount} case(s) failed: ${JSON.stringify(failures)}`);
    }
  } catch (error) {
    if (results.length > 0) {
      console.log(JSON.stringify({
        ok: false,
        summary: {
          pass: results.filter(result => result.result === 'PASS').length,
          fail: results.filter(result => result.result !== 'PASS').length,
        },
        results,
        diagnostics: diagnostics.slice(-30),
      }, null, 2));
    }
    throw error;
  }
}
