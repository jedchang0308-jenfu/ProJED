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
      localStorage.setItem(`projed-task-workbench-panel:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
        open: false,
        filtersOpen: false,
        showContainersInAllTasks: false,
        width: 340,
        openPreferenceVersion: 1,
      }));
      localStorage.setItem(`projed-workspace-sidebar-width:v1:account:${encodeURIComponent(account.id)}`, JSON.stringify(288));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const waitForBoard = async () => {
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await seedAuxiliaryState();
    await page.goto('http://localhost:4000/?qcReset=1&qcSize=36', { waitUntil: 'domcontentloaded' });
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

    await runCase('QA-042-B01', 'mobile Sidebar opens inline and resizes the board workspace', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const sidebarBox = await page.locator('[data-sidebar-inline="true"]').boundingBox();
      const after = await layoutMetrics();
      const expectedWidth = Math.min(340, after.innerWidth - 48);
      assert(sidebarBox && sidebarBox.x <= 1, 'mobile Sidebar should remain in normal flex flow at the left edge', { sidebarBox });
      assert(sidebarBox && Math.abs(sidebarBox.width - expectedWidth) <= 1, 'mobile Sidebar should match the shared TaskWorkbench width contract', { sidebarBox, expectedWidth });
      assert(after.sidebarInlineCount === 1 && after.sidebarOverlayCount === 0 && after.sidebarBackdropCount === 0, 'mobile Sidebar must be inline without overlay or backdrop', after);
      assert(before.main && after.main && sidebarBox && Math.abs(after.main.width - (before.main.width - sidebarBox.width)) <= 2, 'mobile Sidebar should reduce main width by its inline width', { before, after, sidebarBox });
      assert(after.main && sidebarBox && Math.abs(after.main.left - sidebarBox.width) <= 2, 'mobile main should start immediately after Sidebar', { after, sidebarBox });
      assert(after.board && after.main && Math.abs(after.board.left - after.main.left) <= 2, 'mobile board should remain arranged beside Sidebar', after);
      const screenshotPath = `${screenshotBase}-mobile-sidebar-inline.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-sidebar-collapse-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.sidebarCollapsedCount === 0 && closed.main.left <= 4, 'closing inline Sidebar should return main to the left edge', closed);
      return { before, after, closed, sidebarBox, screenshotPath };
    });

    await runCase('QA-042-B02', 'mobile TaskWorkbench opens inline beside the board', async () => {
      const before = await layoutMetrics();
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const workbenchBox = await page.locator('[data-task-workbench-inline="true"]').boundingBox();
      const after = await layoutMetrics();
      const expectedWidth = Math.min(340, after.innerWidth - 48);
      assert(workbenchBox && workbenchBox.x <= 1, 'mobile TaskWorkbench should stay at the left of BoardView flow', { workbenchBox });
      assert(workbenchBox && Math.abs(workbenchBox.width - expectedWidth) <= 1, 'mobile TaskWorkbench should use the shared inline width contract', { workbenchBox, expectedWidth });
      assert(after.workbenchInlineCount === 1 && after.workbenchOverlayCount === 0 && after.workbenchBackdropCount === 0, 'mobile TaskWorkbench must be inline without overlay or backdrop', after);
      assert(before.main && after.main && Math.abs(before.main.width - after.main.width) <= 1, 'TaskWorkbench should reuse BoardView inner flow without changing outer main width', { before, after });
      assert(before.board && after.board && workbenchBox && Math.abs(after.board.width - (before.board.width - workbenchBox.width)) <= 2, 'TaskWorkbench should reduce board width by its inline width', { before, after, workbenchBox });
      assert(after.board && workbenchBox && Math.abs(after.board.left - workbenchBox.width) <= 2, 'board should start immediately after TaskWorkbench', { after, workbenchBox });
      assert(after.board && after.board.width >= 47, 'mobile inline Workbench must preserve a visible board strip', after);
      const screenshotPath = `${screenshotBase}-mobile-workbench-inline.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-task-workbench-collapse-toggle="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.workbenchCollapsedCount === 0 && closed.board && closed.board.left <= 4, 'closing inline TaskWorkbench should restore the board width', closed);
      return { before, after, closed, workbenchBox, screenshotPath };
    });

    await runCase('QA-042-B03', 'mobile top-nav switches between the two shared inline panels', async () => {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const entryBox = await page.locator('[data-mobile-task-workbench-nav-entry="true"]').boundingBox();
      assert(entryBox && entryBox.width >= 30 && entryBox.height >= 30 && entryBox.y <= 4, 'mobile top nav TaskWorkbench entry should be visible beside menu', { entryBox });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const after = await layoutMetrics();
      assert(after.workbenchInlineCount === 1 && after.sidebarInlineCount === 0, 'top nav should replace Sidebar with the shared inline TaskWorkbench on mobile', after);
      assert(after.mobileWorkbenchOverlayCount === 0 && after.mobileSidebarOverlayCount === 0, 'panel switch must not create mobile overlays', after);
      const screenshotPath = `${screenshotBase}-mobile-inline-panel-switch.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });
      const closed = await layoutMetrics();
      assert(closed.workbenchCollapsedCount === 0 && closed.main.left <= 4, 'closing top-nav-opened TaskWorkbench should restore the board', closed);
      return { after, closed, entryBox, screenshotPath };
    });

    await runCase('QA-042-B04', 'mobile inline panels close with Escape', async () => {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });

      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });

      const metrics = await layoutMetrics();
      assert(metrics.sidebarInlineCount === 0 && metrics.workbenchInlineCount === 0, 'Escape should close both inline panels', metrics);
      assert(metrics.documentScrollWidth <= metrics.documentClientWidth + 1, 'Escape close should not create overflow', metrics);
      return metrics;
    });

    await runCase('QA-042-B05', 'mobile visible error sweep', async () => {
      await assertNoVisibleErrors();
      return { diagnostics: diagnostics.slice(-10) };
    });

    await openApp({ width: 320, height: 844 });

    await runCase('QA-042-B05A', '320px mobile uses shared inline panels and preserves board access', async () => {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const sidebarMetrics = await layoutMetrics();
      const sidebarBox = await page.locator('[data-sidebar-inline="true"]').boundingBox();
      const expectedWidth = Math.min(340, sidebarMetrics.innerWidth - 48);
      assert(sidebarBox && sidebarBox.width <= sidebarMetrics.innerWidth - 48 + 1, 'narrow mobile inline Sidebar should respect the shared viewport clamp', { sidebarBox, sidebarMetrics });
      assert(sidebarBox && Math.abs(sidebarBox.width - expectedWidth) <= 1, 'narrow mobile Sidebar should match the TaskWorkbench width contract', { sidebarBox, expectedWidth });
      assert(sidebarMetrics.board && sidebarMetrics.board.width >= 47, 'narrow mobile should keep a visible board strip beside Sidebar', sidebarMetrics);
      assert(sidebarMetrics.sidebarOverlayCount === 0 && sidebarMetrics.sidebarBackdropCount === 0, 'narrow mobile Sidebar must remain inline', sidebarMetrics);
      await page.locator('[data-sidebar-collapse-toggle="true"]').click();
      await page.locator('[data-sidebar-inline="true"]').waitFor({ state: 'detached', timeout: 5000 });

      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-inline="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const metrics = await layoutMetrics();
      const workbenchBox = await page.locator('[data-task-workbench-inline="true"]').boundingBox();
      const expectedWorkbenchWidth = Math.min(340, metrics.innerWidth - 48);
      assert(workbenchBox && workbenchBox.width <= metrics.innerWidth - 48 + 1, 'narrow mobile inline Workbench should respect the shared viewport clamp', { workbenchBox, metrics });
      assert(workbenchBox && Math.abs(workbenchBox.width - expectedWorkbenchWidth) <= 1, 'narrow mobile Workbench should use the shared width contract', { workbenchBox, expectedWorkbenchWidth });
      assert(sidebarBox && workbenchBox && Math.abs(sidebarBox.width - workbenchBox.width) <= 1, 'narrow mobile Sidebar and Workbench should have the same computed width', { sidebarBox, workbenchBox });
      assert(metrics.board && metrics.board.width >= 47, 'narrow mobile should keep a visible board strip beside Workbench', metrics);
      assert(metrics.workbenchOverlayCount === 0 && metrics.workbenchBackdropCount === 0, 'narrow mobile must not restore overlay behavior', metrics);
      assert(metrics.documentScrollWidth <= metrics.documentClientWidth + 1, 'narrow mobile document should not horizontally overflow', metrics);
      const unplacedHeaderBox = await page.locator('[data-task-workbench-section-header="unplaced"]').boundingBox();
      const createTaskButton = page.locator('[data-task-workbench-unclassified-modal-add="true"]');
      const createTaskButtonBox = await createTaskButton.boundingBox();
      assert(
        unplacedHeaderBox && createTaskButtonBox && createTaskButtonBox.width >= 76 &&
          createTaskButtonBox.x + createTaskButtonBox.width <= workbenchBox.x + workbenchBox.width + 1 &&
          createTaskButtonBox.x >= unplacedHeaderBox.x + unplacedHeaderBox.width + 4 &&
          (await createTaskButton.innerText()).trim() === '+新增任務',
        'narrow mobile section labels must yield space for the complete new-task button without clipping',
        { unplacedHeaderBox, createTaskButtonBox, workbenchBox },
      );
      const screenshotPath = `${screenshotBase}-mobile-320-inline.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { sidebarMetrics, sidebarBox, metrics, workbenchBox, screenshotPath };
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
      assert(
        closedAgain.board && workbenchOpen.board && workbenchBox &&
          Math.abs((closedAgain.board.width - workbenchOpen.board.width) - workbenchBox.width) <= 2,
        'desktop TaskWorkbench should reduce board width by its actual inline width instead of covering it',
        { closedAgain, workbenchOpen, workbenchBox },
      );
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
      assert(
        closed.board && simultaneous.board && sidebarBox && workbenchBox &&
          Math.abs((closed.board.width - simultaneous.board.width) - (sidebarBox.width + workbenchBox.width)) <= 2,
        'desktop dual inline panels should reduce board width by their actual widths instead of covering it',
        { closed, simultaneous, sidebarBox, workbenchBox },
      );
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
