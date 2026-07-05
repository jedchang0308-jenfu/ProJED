/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const screenshotBase = `output/playwright/dev-042-mobile-left-sidebar-offcanvas-${Date.now()}`;

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

  const waitForBoard = async () => {
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedAuxiliaryState();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=36', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedAuxiliaryState();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await waitForBoard();
  };

  const rectOf = async (selector) => page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  const layoutMetrics = async () => page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    main: (() => {
      const element = document.querySelector('[data-app-main="true"]');
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, width: rect.width, right: rect.right } : null;
    })(),
    board: (() => {
      const element = document.querySelector('[data-mobile-pan-surface="board"]');
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, width: rect.width, right: rect.right } : null;
    })(),
    sidebarCollapsedCount: document.querySelectorAll('[data-sidebar-panel="collapsed"]').length,
    workbenchCollapsedCount: document.querySelectorAll('[data-task-workbench-panel="collapsed"]').length,
    mobileSidebarOverlayCount: document.querySelectorAll('[data-mobile-sidebar-overlay="true"]').length,
    mobileWorkbenchOverlayCount: document.querySelectorAll('[data-mobile-task-workbench-overlay="true"]').length,
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

    await openApp({ width: 390, height: 844 });

    await runCase('QA-042-B01', 'mobile closed state has zero in-flow left rails', async () => {
      const metrics = await layoutMetrics();
      assert(metrics.sidebarCollapsedCount === 0, 'mobile Sidebar collapsed rail should not be in DOM', metrics);
      assert(metrics.workbenchCollapsedCount === 0, 'mobile TaskWorkbench collapsed rail should not be in DOM', metrics);
      assert(metrics.main && metrics.main.left <= 4, 'mobile main should start at viewport left edge', metrics);
      assert(metrics.board && metrics.board.left <= 4, 'mobile board should start at viewport left edge', metrics);
      assert(metrics.documentScrollWidth <= metrics.documentClientWidth + 1, 'mobile document should not horizontally overflow', metrics);
      const screenshotPath = `${screenshotBase}-mobile-closed.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { ...metrics, screenshotPath };
    });

    await runCase('QA-042-B02', 'mobile Sidebar opens as overlay without resizing main', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const overlayBox = await page.locator('[data-mobile-sidebar-overlay="true"]').boundingBox();
      const after = await layoutMetrics();
      assert(overlayBox && overlayBox.width <= 289, 'mobile Sidebar overlay should use safe drawer width', { overlayBox });
      assert(before.main && after.main && Math.abs(before.main.width - after.main.width) <= 1, 'Sidebar overlay should not resize main width', { before, after });
      assert(after.mobileSidebarOverlayCount === 1, 'mobile Sidebar overlay should be visible exactly once', after);
      const screenshotPath = `${screenshotBase}-mobile-sidebar-overlay.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-mobile-sidebar-backdrop="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.sidebarCollapsedCount === 0 && closed.main.left <= 4, 'closing Sidebar overlay should return to zero-width state', closed);
      return { before, after, closed, overlayBox, screenshotPath };
    });

    await runCase('QA-042-B03', 'mobile TaskWorkbench opens from Sidebar as overlay without resizing main', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-sidebar-task-workbench-button="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const overlayBox = await page.locator('[data-mobile-task-workbench-overlay="true"]').boundingBox();
      const after = await layoutMetrics();
      assert(overlayBox && overlayBox.width <= 341, 'mobile TaskWorkbench overlay should use safe drawer width', { overlayBox });
      assert(before.main && after.main && Math.abs(before.main.width - after.main.width) <= 1, 'TaskWorkbench overlay should not resize main width', { before, after });
      assert(after.mobileWorkbenchOverlayCount === 1, 'mobile TaskWorkbench overlay should be visible exactly once', after);
      const screenshotPath = `${screenshotBase}-mobile-workbench-overlay.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-task-workbench-collapse-toggle="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.workbenchCollapsedCount === 0 && closed.main.left <= 4, 'closing TaskWorkbench overlay should not leave a collapsed rail', closed);
      return { before, after, closed, overlayBox, screenshotPath };
    });

    await runCase('QA-042-B04', 'mobile overlays close with Escape and leave no gutter', async () => {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });

      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-sidebar-task-workbench-button="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });

      const metrics = await layoutMetrics();
      assert(metrics.sidebarCollapsedCount === 0 && metrics.workbenchCollapsedCount === 0, 'Escape close should not restore in-flow rails', metrics);
      assert(metrics.documentScrollWidth <= metrics.documentClientWidth + 1, 'Escape close should not create overflow', metrics);
      return metrics;
    });

    await runCase('QA-042-B05', 'mobile visible error sweep', async () => {
      await assertNoVisibleErrors();
      return { diagnostics: diagnostics.slice(-10) };
    });

    await openApp({ width: 1440, height: 900 });

    await runCase('QA-042-B10', 'desktop compact rails remain bounded', async () => {
      const expandedSidebar = page.locator('[data-sidebar-panel="expanded"]');
      if (await expandedSidebar.count()) {
        await page.locator('[data-main-sidebar-toggle="true"]').click();
      }
      const collapsedSidebar = page.locator('[data-sidebar-panel="collapsed"]').first();
      await collapsedSidebar.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-sidebar-panel="collapsed"]');
        return Boolean(element && element.getBoundingClientRect().width <= 41);
      }, null, { timeout: 2000 });
      const collapsedSidebarBox = await collapsedSidebar.boundingBox();
      const collapsedWorkbench = page.locator('[data-task-workbench-panel="collapsed"]').first();
      await collapsedWorkbench.waitFor({ state: 'visible', timeout: 5000 });
      const collapsedWorkbenchBox = await collapsedWorkbench.boundingBox();
      const collapsedCountBox = await collapsedWorkbench.locator('[data-task-workbench-collapsed-count="true"]').boundingBox();

      assert(collapsedSidebarBox && collapsedSidebarBox.width <= 41, 'desktop Sidebar collapsed rail should stay within 40px rail plus subpixel border tolerance', { collapsedSidebarBox });
      assert(collapsedWorkbenchBox && collapsedWorkbenchBox.width <= 25, 'desktop TaskWorkbench collapsed rail should stay within 24px rail plus subpixel border tolerance', { collapsedWorkbenchBox });
      assert(
        !collapsedCountBox || collapsedCountBox.x + collapsedCountBox.width <= collapsedWorkbenchBox.x + collapsedWorkbenchBox.width + 1,
        'desktop TaskWorkbench count badge should not widen or overflow rail',
        { collapsedWorkbenchBox, collapsedCountBox },
      );
      const screenshotPath = `${screenshotBase}-desktop-collapsed-rails.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { collapsedSidebarBox, collapsedWorkbenchBox, collapsedCountBox, screenshotPath };
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
      throw new Error(`DEV-042 mobile left sidebar offcanvas failed: ${failCount} case(s) failed: ${JSON.stringify(failures)}`);
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
