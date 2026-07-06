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
    sidebarOverlayCount: document.querySelectorAll('[data-sidebar-overlay="true"]').length,
    sidebarInlineCount: document.querySelectorAll('[data-sidebar-inline="true"]').length,
    sidebarBackdropCount: document.querySelectorAll('[data-sidebar-backdrop="true"]').length,
    workbenchCollapsedCount: document.querySelectorAll('[data-task-workbench-panel="collapsed"]').length,
    workbenchOverlayCount: document.querySelectorAll('[data-task-workbench-overlay="true"]').length,
    workbenchInlineCount: document.querySelectorAll('[data-task-workbench-inline="true"]').length,
    workbenchBackdropCount: document.querySelectorAll('[data-task-workbench-backdrop="true"]').length,
    mobileSidebarOverlayCount: document.querySelectorAll('[data-mobile-sidebar-overlay="true"]').length,
    mobileWorkbenchOverlayCount: document.querySelectorAll('[data-mobile-task-workbench-overlay="true"]').length,
  }));

  const desktopBoardHitTest = async () => page.evaluate(() => {
    const workbench = document.querySelector('[data-task-workbench-inline="true"]');
    const workbenchRect = workbench?.getBoundingClientRect();
    const probeX = workbenchRect ? Math.min(window.innerWidth - 12, workbenchRect.right + 24) : Math.floor(window.innerWidth * 0.55);
    const probeY = Math.min(window.innerHeight - 80, 180);
    const element = document.elementFromPoint(probeX, probeY);
    return {
      probeX,
      probeY,
      tagName: element?.tagName || null,
      className: typeof element?.className === 'string' ? element.className : '',
      isBackdrop: Boolean(element?.closest?.('[data-sidebar-backdrop="true"], [data-task-workbench-backdrop="true"]')),
      isBoardSurface: Boolean(element?.closest?.('[data-mobile-pan-surface="board"]')),
      isMainSurface: Boolean(element?.closest?.('[data-app-main="true"]')),
      text: element?.textContent?.trim().slice(0, 80) || '',
    };
  });

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
      assert(await page.locator('[data-sidebar-task-workbench-button="true"]').count() === 0, 'mobile Sidebar overlay should not render duplicate TaskWorkbench entry');
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

    await runCase('QA-042-B03', 'mobile TaskWorkbench opens from top nav as overlay without resizing main', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
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

    await runCase('QA-042-B03A', 'mobile TaskWorkbench toggles from top nav entry while Sidebar is open', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const entryBox = await page.locator('[data-mobile-task-workbench-nav-entry="true"]').boundingBox();
      assert(entryBox && entryBox.width >= 30 && entryBox.height >= 30 && entryBox.y <= 4, 'mobile top nav TaskWorkbench entry should be visible beside menu', { entryBox });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const overlayBox = await page.locator('[data-mobile-task-workbench-overlay="true"]').boundingBox();
      const after = await layoutMetrics();
      assert(overlayBox && overlayBox.width <= 341, 'mobile top nav TaskWorkbench overlay should use safe drawer width', { overlayBox });
      assert(before.main && after.main && Math.abs(before.main.width - after.main.width) <= 1, 'top nav TaskWorkbench entry should not resize main width', { before, after });
      assert(after.mobileWorkbenchOverlayCount === 1 && after.mobileSidebarOverlayCount === 0, 'top nav entry should replace Sidebar overlay with TaskWorkbench overlay', after);
      const screenshotPath = `${screenshotBase}-mobile-workbench-nav-entry.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.workbenchCollapsedCount === 0 && closed.main.left <= 4, 'closing top-nav-opened TaskWorkbench overlay should not leave a collapsed rail', closed);
      return { before, after, closed, entryBox, overlayBox, screenshotPath };
    });

    await runCase('QA-042-B04', 'mobile overlays close with Escape and leave no gutter', async () => {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 5000 });

      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
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

    await runCase('QA-042-B10', 'desktop closed panels leave zero rails and open inline without covering board', async () => {
      if (await page.locator('[data-sidebar-inline="true"]').count()) {
        await page.locator('[data-main-sidebar-toggle="true"]').click();
        await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      }
      const closed = await layoutMetrics();
      assert(closed.sidebarCollapsedCount === 0, 'desktop Sidebar closed state should not render a collapsed rail', closed);
      assert(closed.sidebarInlineCount === 0 && closed.sidebarOverlayCount === 0 && closed.sidebarBackdropCount === 0, 'desktop Sidebar should be absent when closed', closed);
      assert(closed.main && closed.main.left <= 4, 'desktop main should start at viewport left edge when Sidebar is closed', closed);
      assert(closed.board && closed.board.left <= 4, 'desktop board should start at viewport left edge when Sidebar is closed', closed);

      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const sidebarBox = await page.locator('[data-sidebar-inline="true"]').boundingBox();
      const open = await layoutMetrics();
      assert(sidebarBox && sidebarBox.x <= 1 && sidebarBox.width <= 289, 'desktop Sidebar inline panel should use the compact panel width', { sidebarBox });
      assert(open.sidebarInlineCount === 1 && open.sidebarOverlayCount === 0 && open.sidebarBackdropCount === 0, 'desktop Sidebar should open as an inline panel, not an overlay/backdrop', open);
      assert(closed.main && open.main && sidebarBox && Math.abs(open.main.left - (sidebarBox.x + sidebarBox.width)) <= 2, 'desktop Sidebar should push main surface to the right', { closed, open, sidebarBox });
      assert(closed.main && open.main && sidebarBox && Math.abs(open.main.width - (closed.main.width - sidebarBox.width)) <= 2, 'desktop Sidebar should reduce available main width instead of covering it', { closed, open, sidebarBox });
      assert(open.board && open.main && Math.abs(open.board.left - open.main.left) <= 2, 'desktop board should remain visible to the right of inline Sidebar', open);

      const screenshotPath = `${screenshotBase}-desktop-sidebar-inline.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closedAgain = await layoutMetrics();
      assert(closedAgain.sidebarCollapsedCount === 0 && closedAgain.main.left <= 4, 'desktop Sidebar close should return to zero-width state', closedAgain);

      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const workbenchBox = await page.locator('[data-task-workbench-inline="true"]').boundingBox();
      const workbenchOpen = await layoutMetrics();
      assert(workbenchBox && workbenchBox.x <= 1 && workbenchBox.width <= 341, 'desktop TaskWorkbench should open as an inline panel from top navigation', { workbenchBox });
      assert(workbenchOpen.workbenchCollapsedCount === 0, 'desktop TaskWorkbench closed/open states should not use an in-flow collapsed rail', workbenchOpen);
      assert(workbenchOpen.workbenchInlineCount === 1 && workbenchOpen.workbenchOverlayCount === 0 && workbenchOpen.workbenchBackdropCount === 0, 'desktop TaskWorkbench should be inline, not overlay/backdrop', workbenchOpen);
      assert(workbenchOpen.board && workbenchBox && Math.abs(workbenchOpen.board.left - (workbenchBox.x + workbenchBox.width)) <= 2, 'desktop board should be laid out to the right of TaskWorkbench', { workbenchOpen, workbenchBox });
      assert(closedAgain.board && workbenchOpen.board && workbenchOpen.board.width < closedAgain.board.width - 300, 'desktop TaskWorkbench should reduce board width instead of covering it', { closedAgain, workbenchOpen });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const workbenchClosed = await layoutMetrics();
      assert(workbenchClosed.workbenchCollapsedCount === 0 && workbenchClosed.main.left <= 4, 'desktop TaskWorkbench close should return to zero-width state', workbenchClosed);

      return { closed, open, closedAgain, workbenchOpen, workbenchClosed, sidebarBox, workbenchBox, screenshotPath };
    });

    await runCase('QA-042-B11', 'desktop Sidebar and TaskWorkbench stay inline side by side with board still visible', async () => {
      if (await page.locator('[data-task-workbench-inline="true"]').count()) {
        await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
        await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      }
      if (await page.locator('[data-sidebar-inline="true"]').count()) {
        await page.locator('[data-main-sidebar-toggle="true"]').click();
        await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      }

      const closed = await layoutMetrics();
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });

      const sidebarBox = await page.locator('[data-sidebar-inline="true"]').boundingBox();
      const workbenchBox = await page.locator('[data-task-workbench-inline="true"]').boundingBox();
      const boardBox = await page.locator('[data-mobile-pan-surface="board"]').boundingBox();
      const simultaneous = await layoutMetrics();
      const hitTest = await desktopBoardHitTest();
      assert(simultaneous.sidebarInlineCount === 1 && simultaneous.workbenchInlineCount === 1, 'desktop Sidebar and TaskWorkbench should both remain visible inline', simultaneous);
      assert(simultaneous.sidebarOverlayCount === 0 && simultaneous.workbenchOverlayCount === 0, 'desktop dual panels should not use overlay mode', simultaneous);
      assert(simultaneous.sidebarBackdropCount === 0 && simultaneous.workbenchBackdropCount === 0, 'desktop dual panels should not render dimming backdrops over the task screen', simultaneous);
      assert(sidebarBox && sidebarBox.x <= 1 && sidebarBox.width <= 289, 'desktop Sidebar should remain at the left edge', { sidebarBox });
      assert(workbenchBox && workbenchBox.width <= 341, 'desktop TaskWorkbench should keep the safe inline width', { workbenchBox });
      assert(
        sidebarBox && workbenchBox && Math.abs(workbenchBox.x - (sidebarBox.x + sidebarBox.width)) <= 2,
        'desktop TaskWorkbench should be positioned immediately to the right of Sidebar',
        { sidebarBox, workbenchBox },
      );
      assert(boardBox && workbenchBox && Math.abs(boardBox.x - (workbenchBox.x + workbenchBox.width)) <= 2, 'desktop board should start immediately to the right of TaskWorkbench', { boardBox, workbenchBox });
      assert(boardBox && boardBox.width >= 360, 'desktop board should keep visible task workspace after both panels open', { boardBox });
      assert(closed.main && simultaneous.main && sidebarBox && Math.abs(simultaneous.main.width - (closed.main.width - sidebarBox.width)) <= 2, 'desktop Sidebar should resize main width in inline mode', { closed, simultaneous, sidebarBox });
      assert(closed.board && simultaneous.board && simultaneous.board.width < closed.board.width - 600, 'desktop dual inline panels should reduce board width instead of covering it', { closed, simultaneous });
      assert(!hitTest.isBackdrop && hitTest.isBoardSurface, 'desktop task surface should remain visible and hit-testable, not covered by panels', hitTest);

      const screenshotPath = `${screenshotBase}-desktop-sidebar-workbench-inline-side-by-side.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });

      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const afterWorkbenchClose = await layoutMetrics();
      assert(afterWorkbenchClose.sidebarInlineCount === 1 && afterWorkbenchClose.workbenchInlineCount === 0, 'closing TaskWorkbench should keep desktop Sidebar open', afterWorkbenchClose);

      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closedAgain = await layoutMetrics();
      assert(closedAgain.sidebarInlineCount === 0 && closedAgain.workbenchInlineCount === 0, 'desktop dual inline cleanup should leave both closed', closedAgain);

      return { closed, simultaneous, afterWorkbenchClose, closedAgain, sidebarBox, workbenchBox, boardBox, screenshotPath };
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
