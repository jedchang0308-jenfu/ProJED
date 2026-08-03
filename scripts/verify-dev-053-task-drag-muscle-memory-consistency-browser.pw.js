/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-053-task-drag-${Date.now()}`;

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    } catch (_) {
      // A reused verification session may already have this property patched.
    }
    if (window.__projedDev053CoarsePointerPatched) return;
    window.__projedDev053CoarsePointerPatched = true;
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('pointer: coarse') || query.includes('hover: none')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        };
      }
      return nativeMatchMedia(query);
    };
  });

  const seedSession = async () => {
    await page.evaluate(({ account }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([{
        id: 'dev053-inbox',
        title: 'DEV-053 未歸位驗證',
        note: 'DEV-053 未歸位驗證',
        itemType: 'todo',
        captureStatus: 'untriaged',
        syncStatus: 'pending',
        createdBy: account.id,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
        completedAt: null,
        archivedAt: null,
        suggestedDueDate: '2026-07-17',
        confirmedDueDate: null,
        promotedTaskNodeId: null,
      }]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({
        open: false,
        filtersOpen: false,
        showContainersInAllTasks: false,
      }));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const closeSidebarIfOpen = async () => {
    const sidebar = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    if (!await sidebar.isVisible().catch(() => false)) return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await sidebar.waitFor({ state: 'detached', timeout: 1200 }).catch(async () => {
      const backdrop = page.locator('[data-mobile-sidebar-backdrop="true"]').first();
      if (await backdrop.count()) await backdrop.click({ force: true, timeout: 1200 }).catch(() => undefined);
    });
    await page.waitForTimeout(100);
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=72', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await closeSidebarIfOpen();
  };

  const closeTaskUi = async () => {
    await page.mouse.up().catch(() => undefined);
    for (let index = 0; index < 2; index += 1) {
      await page.keyboard.press('Escape').catch(() => undefined);
      const close = page.locator('[data-task-details-modal="true"] button[aria-label="關閉任務詳情"], [data-task-details-modal="true"] button[title="關閉"]').first();
      if (await close.count()) await close.click({ force: true, timeout: 1200 }).catch(() => undefined);
      await page.waitForTimeout(80);
    }
  };

  const pointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'operation target should have a visible bounding box');
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      localX: Math.max(6, Math.round(box.width * ratioX)),
      localY: Math.max(6, Math.round(box.height * ratioY)),
      box,
    };
  };

  const visibleErrorSweep = async (label) => {
    const state = await page.evaluate(() => {
      const isVisible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const alerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
        .filter(isVisible)
        .map((element) => (element.textContent || '').trim())
        .filter(Boolean);
      const bodyText = document.body.innerText;
      return {
        route: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        alerts,
        visibleHttpError: /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    assert(state.alerts.length === 0, `${label} should not expose inline or alert errors`, state);
    assert(!state.visibleHttpError, `${label} should not expose HTTP/API errors`, state);
    assert(!state.horizontalOverflow, `${label} should not overflow the viewport horizontally`, state);
    return state;
  };

  const openAndVerifyDetails = async (locator, label) => {
    const taskId = await locator.getAttribute('data-task-id');
    const point = await pointFor(locator, 0.52, 0.38);
    await locator.click({ position: { x: point.localX, y: point.localY } });
    const modal = page.locator('[data-task-details-modal="true"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${label} should open matching task details`, { taskId, modalTaskId });
    await closeTaskUi();
    return { taskId, modalTaskId };
  };

  const openAndVerifyContextMenu = async (locator, label) => {
    const taskId = await locator.getAttribute('data-task-id');
    const point = await pointFor(locator, 0.58, 0.42);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.getByText('更多詳情選項', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.locator('[data-task-details-modal="true"]').count() === 0, `${label} right click should not open details`, { taskId });
    await page.keyboard.press('Escape');
    return { taskId };
  };

  const dispatchTouch = async (locator, { holdMs = 0, compatibilityClick = false, dx = 0, dy = 0 } = {}) => {
    const point = await pointFor(locator, 0.48, 0.45);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
      });
      if (dx || dy) {
        for (let step = 1; step <= 5; step += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{
              x: Math.round(point.x + (dx * step) / 5),
              y: Math.round(point.y + (dy * step) / 5),
              radiusX: 4,
              radiusY: 4,
              force: 1,
              id: 1,
            }],
          });
          await page.waitForTimeout(25);
        }
      }
      if (holdMs) await page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach().catch(() => undefined);
    }
    if (compatibilityClick) {
      await page.waitForTimeout(80);
      const nativeTouchOpenedDetails = !dx && !dy
        && await page.locator('[data-task-details-modal="true"]').count() > 0;
      if (!nativeTouchOpenedDetails) {
        await locator.click({ position: { x: point.localX, y: point.localY } });
      }
    }
    await page.waitForTimeout(180);
  };

  const startHeldTouch = async (locator, holdMs = 650) => {
    const point = await pointFor(locator, 0.48, 0.45);
    const cdp = await page.context().newCDPSession(page);
    let released = false;
    let current = { x: point.x, y: point.y };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);
    return {
      point,
      moveTo: async (target) => {
        for (let step = 1; step <= 5; step += 1) {
          const x = Math.round(current.x + ((target.x - current.x) * step) / 5);
          const y = Math.round(current.y + ((target.y - current.y) * step) / 5);
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(30);
        }
        current = { x: target.x, y: target.y };
      },
      end: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(180);
      },
      cancel: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(180);
      },
    };
  };

  const ensureMobileWorkbench = async () => {
    const panel = page.locator('[data-task-workbench-panel="true"]').first();
    if (!await panel.isVisible().catch(() => false)) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').first().click();
      await panel.waitFor({ state: 'visible', timeout: 5000 });
    }
    return panel;
  };

  const runCase = async (id, scenario, operation) => {
    const startedAt = new Date().toISOString();
    try {
      const details = await operation();
      results.push({ id, scenario, result: 'PASS', startedAt, details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}-FAIL.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', startedAt, error: error.message, screenshotPath });
    } finally {
      await closeTaskUi();
    }
  };

  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(20000);

  await runCase('QA-053-B01', 'DEV-053 desktop approved drag overlay remains unchanged', async () => {
    await openApp({ width: 1440, height: 900 });
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    const point = await pointFor(card, 0.62, 0.34);
    const before = await card.evaluate((element) => ({
      taskId: element.getAttribute('data-task-id'),
      parentColumnId: element.closest('[data-kanban-column="true"]')?.querySelector('[data-kanban-column-header="true"]')?.getAttribute('data-task-id'),
    }));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 18, point.y + 5, { steps: 5 });
    const overlay = page.locator('[data-kanban-drag-overlay="true"]').first();
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    const overlayState = await overlay.evaluate((element) => ({
      className: element.className,
      text: (element.textContent || '').trim(),
      rect: (() => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
    }));
    assert(overlayState.className.includes('translate-x-4') && overlayState.className.includes('translate-y-4'), 'desktop overlay offset should match approved baseline', overlayState);
    assert(overlayState.className.includes('rounded-lg') && overlayState.className.includes('shadow-lg'), 'desktop overlay visual treatment should match approved baseline', overlayState);
    assert(overlayState.rect.width >= 230 && overlayState.rect.width <= 250, 'desktop card overlay width should stay at the approved 240px baseline', overlayState);
    const screenshotPath = `${screenshotBase}-B01-desktop-approved-overlay.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(180);
    assert(await page.locator('[data-kanban-drag-overlay="true"]').count() === 0, 'desktop overlay should clear after cancel');
    return { route: page.url(), viewport: { width: 1440, height: 900 }, before, overlayState, screenshotPath };
  });

  await runCase('QA-053-B02', 'desktop card, checklist, and column header clicks open the matching details', async () => {
    await openApp({ width: 1440, height: 900 });
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    const checklist = page.locator('.kanban-checklist-item[data-task-id]').first();
    const header = page.locator('[data-kanban-column-header="true"][data-task-id]').first();
    const details = [];
    details.push(await openAndVerifyDetails(card, 'card'));
    details.push(await openAndVerifyDetails(checklist, 'checklist'));
    details.push(await openAndVerifyDetails(header, 'column header'));
    const screenshotPath = `${screenshotBase}-B02-desktop-click-details.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { route: page.url(), viewport: { width: 1440, height: 900 }, details, screenshotPath };
  });

  await runCase('QA-053-B03', 'desktop card, checklist, and column header right click opens the task context menu', async () => {
    await openApp({ width: 1440, height: 900 });
    const targets = [
      ['card', page.locator('.kanban-task-card[data-task-id]').first()],
      ['checklist', page.locator('.kanban-checklist-item[data-task-id]').first()],
      ['column header', page.locator('[data-kanban-column-header="true"][data-task-id]').first()],
    ];
    const contextMenus = [];
    for (const [label, locator] of targets) {
      contextMenus.push(await openAndVerifyContextMenu(locator, label));
    }
    const screenshotPath = `${screenshotBase}-B03-desktop-context-menu.png`;
    await openAndVerifyContextMenu(targets[0][1], targets[0][0]);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { route: page.url(), viewport: { width: 1440, height: 900 }, contextMenus, screenshotPath };
  });

  await runCase('QA-053-B05', 'mobile card, checklist, and column header quick taps open the matching details', async () => {
    await openApp({ width: 390, height: 844 });
    const targets = [
      ['card', page.locator('.kanban-task-card[data-task-id]').first()],
      ['checklist', page.locator('.kanban-checklist-item[data-task-id]').first()],
      ['column header', page.locator('[data-kanban-column-header="true"][data-task-id]').first()],
    ];
    const details = [];
    for (const [label, locator] of targets) {
      const taskId = await locator.getAttribute('data-task-id');
      await dispatchTouch(locator, { compatibilityClick: true });
      const modal = page.locator('[data-task-details-modal="true"]').first();
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await modal.getAttribute('data-task-id');
      const transientState = {
        actionRailCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
        previewCount: await page.locator('[data-mobile-drag-preview="true"]').count(),
      };
      assert(modalTaskId === taskId, `${label} mobile quick tap should open matching details`, { taskId, modalTaskId });
      assert(transientState.actionRailCount === 0 && transientState.previewCount === 0, `${label} mobile quick tap should not start drag action mode`, transientState);
      details.push({ label, taskId, modalTaskId, transientState });
      await closeTaskUi();
    }
    const screenshotPath = `${screenshotBase}-B05-mobile-quick-taps.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { route: page.url(), viewport: { width: 390, height: 844 }, details, screenshotPath };
  });

  await runCase('QA-053-B06', 'mobile short pan scrolls without task writes or click-through', async () => {
    await openApp({ width: 390, height: 844 });
    const board = page.locator('[data-mobile-pan-surface="board"]').first();
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    await board.evaluate((element) => { element.scrollLeft = 0; });
    const before = {
      nodes: await page.evaluate(() => localStorage.getItem('projed-local-test.nodes')),
      scrollLeft: await board.evaluate((element) => element.scrollLeft),
    };
    await dispatchTouch(card, { dx: -120, dy: 12, compatibilityClick: true });
    const afterNodes = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const after = {
      scrollLeft: await board.evaluate((element) => element.scrollLeft),
      modalCount: await page.locator('[data-task-details-modal="true"]').count(),
      actionRailCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
      previewCount: await page.locator('[data-mobile-drag-preview="true"]').count(),
    };
    assert(after.scrollLeft > before.scrollLeft + 4, 'mobile short pan should move the board scroll position', { beforeScrollLeft: before.scrollLeft, afterScrollLeft: after.scrollLeft });
    assert(before.nodes === afterNodes, 'mobile short pan must not write task nodes', { beforeNodesLength: before.nodes?.length, afterNodesLength: afterNodes?.length });
    assert(after.modalCount === 0 && after.actionRailCount === 0 && after.previewCount === 0, 'mobile short pan must not click through or enter action mode', after);
    const screenshotPath = `${screenshotBase}-B06-mobile-short-pan.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return {
      route: page.url(),
      viewport: { width: 390, height: 844 },
      before: { scrollLeft: before.scrollLeft, nodesLength: before.nodes?.length || 0 },
      after: { ...after, nodesLength: afterNodes?.length || 0 },
      screenshotPath,
    };
  });

  await runCase('QA-053-B07', 'mobile invalid drop is a zero-write no-op and the next session starts immediately', async () => {
    await openApp({ width: 390, height: 844 });
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    const invalidTarget = page.locator('[data-kanban-add-task-button="true"]').first();
    const beforeNodes = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const firstSession = await startHeldTouch(card);
    await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await firstSession.moveTo(await pointFor(invalidTarget, 0.5, 0.5));
    await firstSession.end();
    const afterNodes = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const afterInvalid = {
      actionRailCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
      previewCount: await page.locator('[data-mobile-drag-preview="true"]').count(),
      indicatorCount: await page.locator('[data-mobile-drop-indicator="true"]').count(),
    };
    assert(beforeNodes === afterNodes, 'invalid drop must not write task nodes', { beforeNodesLength: beforeNodes?.length, afterNodesLength: afterNodes?.length });
    assert(afterInvalid.actionRailCount === 0 && afterInvalid.previewCount === 0 && afterInvalid.indicatorCount === 0, 'invalid drop should fully clear transient UI', afterInvalid);

    const retry = await startHeldTouch(card);
    await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
    const screenshotPath = `${screenshotBase}-B07-mobile-invalid-retry.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await retry.end();
    return {
      route: page.url(),
      viewport: { width: 390, height: 844 },
      beforeNodesLength: beforeNodes?.length || 0,
      afterNodesLength: afterNodes?.length || 0,
      afterInvalid,
      retry: 'PASS',
      screenshotPath,
    };
  });

  await runCase('QA-053-B10', 'active mobile session cleans up on touchcancel, pointercancel, Escape, blur, and visibility hidden', async () => {
    const cancellations = [];
    for (const reason of ['touchcancel', 'pointercancel', 'escape', 'blur', 'visibilitychange']) {
      await openApp({ width: 390, height: 844 });
      const card = page.locator('.kanban-task-card[data-task-id]').first();
      const beforeNodes = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
      const heldTouch = await startHeldTouch(card);
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });

      if (reason === 'touchcancel') {
        await heldTouch.cancel();
      } else {
        if (reason === 'pointercancel') {
          await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', bubbles: true })));
        } else if (reason === 'escape') {
          await page.keyboard.press('Escape');
        } else if (reason === 'blur') {
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        } else {
          await page.evaluate(() => {
            const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
            else delete document.visibilityState;
          });
        }
        await page.waitForTimeout(120);
        await heldTouch.end();
      }

      const afterNodes = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
      const cleanupState = await page.evaluate(() => ({
        actionRailCount: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
        previewCount: document.querySelectorAll('[data-mobile-drag-preview="true"]').length,
        indicatorCount: document.querySelectorAll('[data-mobile-drop-indicator="true"]').length,
        detailsModalCount: document.querySelectorAll('[data-task-details-modal="true"]').length,
        bodyActive: document.body.hasAttribute('data-task-drag-touch-active'),
      }));
      assert(beforeNodes === afterNodes, `${reason} must not write task nodes`, { reason, beforeNodesLength: beforeNodes?.length, afterNodesLength: afterNodes?.length });
      assert(
        cleanupState.actionRailCount === 0
          && cleanupState.previewCount === 0
          && cleanupState.indicatorCount === 0
          && cleanupState.detailsModalCount === 0
          && !cleanupState.bodyActive,
        `${reason} must fully clean the active session`,
        cleanupState,
      );

      const retry = await startHeldTouch(card);
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await retry.end();
      cancellations.push({ reason, cleanupState, beforeNodesLength: beforeNodes?.length || 0, afterNodesLength: afterNodes?.length || 0, retry: 'PASS' });
    }
    const screenshotPath = `${screenshotBase}-B10-mobile-cancel-cleanup.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { route: page.url(), viewport: { width: 390, height: 844 }, cancellations, screenshotPath };
  });

  await runCase('QA-053-B13', 'mobile placed workbench row is long-press read-only and quick-tap opens details', async () => {
    await openApp({ width: 390, height: 844 });
    const panel = await ensureMobileWorkbench();
    const placedRow = panel.locator('[data-task-workbench-placed-task-card="true"][data-mobile-drop-target]').first();
    await placedRow.waitFor({ state: 'visible', timeout: 5000 });
    const taskId = await placedRow.getAttribute('data-task-id');
    const beforeStorage = await page.evaluate(() => localStorage.getItem('projed-task-workbench-unplaced:v1'));
    await dispatchTouch(placedRow, { holdMs: 650 });
    const longPressState = {
      actionRailCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
      previewCount: await page.locator('[data-mobile-drag-preview="true"]').count(),
      dragSurface: await placedRow.getAttribute('data-task-workbench-drag-surface'),
      genericDragSurface: await placedRow.getAttribute('data-task-drag-surface'),
      afterStorage: await page.evaluate(() => localStorage.getItem('projed-task-workbench-unplaced:v1')),
    };
    assert(longPressState.actionRailCount === 0 && longPressState.previewCount === 0, 'placed row long press must not enter mobile drag mode', longPressState);
    assert(longPressState.dragSurface === null && longPressState.genericDragSurface === null, 'placed row must not expose draggable attributes', longPressState);
    assert(longPressState.afterStorage === beforeStorage, 'placed row long press must not write unplaced persistence', { beforeStorage, longPressState });
    await dispatchTouch(placedRow, { compatibilityClick: true });
    const modal = page.locator('[data-task-details-modal="true"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, 'placed row quick tap should still open matching details', { taskId, modalTaskId });
    const screenshotPath = `${screenshotBase}-B13-mobile-placed-readonly.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { route: page.url(), viewport: { width: 390, height: 844 }, taskId, modalTaskId, beforeStorage, longPressState, screenshotPath };
  });

  await runCase('QA-053-B14', '320/390/430 viewport and visible-error sweep', async () => {
    await openApp({ width: 1024, height: 768 });
    const desktopScreenshotPath = `${screenshotBase}-B14-1024x768.png`;
    await page.screenshot({ path: desktopScreenshotPath, fullPage: false });
    const desktopSweep = { ...(await visibleErrorSweep('1024x768 desktop viewport')), screenshotPath: desktopScreenshotPath };

    const sweeps = [];
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await openApp(viewport);
      const card = page.locator('.kanban-task-card[data-task-id]').first();
      const target = page.locator('.kanban-task-card[data-task-id]').nth(1);
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const heldTouch = await startHeldTouch(card);
      const rail = page.locator('[data-mobile-task-action-rail="true"]').first();
      const preview = page.locator('[data-mobile-drag-preview="true"]').first();
      await rail.waitFor({ state: 'visible', timeout: 5000 });
      await preview.waitFor({ state: 'visible', timeout: 5000 });
      await heldTouch.moveTo(await pointFor(target, 0.5, 0.4));
      const indicator = page.locator('[data-mobile-drop-indicator="true"]').first();
      await indicator.waitFor({ state: 'visible', timeout: 5000 });
      const railRect = await rail.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const previewRect = await preview.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const indicatorRect = await indicator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      assert(railRect.left >= -1 && railRect.right <= viewport.width + 1 && railRect.height <= 48, 'mobile action rail should fit viewport without clipping', { viewport, railRect });
      assert(previewRect.left >= -1 && previewRect.right <= viewport.width + 1, 'mobile drag preview should fit viewport without clipping', { viewport, previewRect });
      assert(indicatorRect.left >= -1 && indicatorRect.right <= viewport.width + 1, 'mobile drop indicator should fit viewport without clipping', { viewport, indicatorRect });
      const screenshotPath = `${screenshotBase}-B14-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.keyboard.press('Escape');
      await heldTouch.end();
      sweeps.push({ ...(await visibleErrorSweep(`${viewport.width}px viewport`)), railRect, previewRect, indicatorRect, screenshotPath });
    }
    return { route: page.url(), desktopSweep, sweeps };
  });

  const failCount = results.filter((result) => result.result !== 'PASS').length;
  const unexpectedDiagnostics = diagnostics.filter((message) => !/favicon|ResizeObserver/i.test(message));
  const unexpectedNetworkFailures = networkFailures.filter((message) => !/favicon/i.test(message));
  if (unexpectedDiagnostics.length || unexpectedNetworkFailures.length) {
    results.push({
      id: 'QA-053-B15',
      scenario: 'console and network error sweep',
      result: 'FAIL',
      startedAt: new Date().toISOString(),
      details: { unexpectedDiagnostics, unexpectedNetworkFailures },
    });
  } else {
    results.push({
      id: 'QA-053-B15',
      scenario: 'console and network error sweep',
      result: 'PASS',
      startedAt: new Date().toISOString(),
      details: { unexpectedDiagnostics, unexpectedNetworkFailures },
    });
  }

  const finalFailCount = results.filter((result) => result.result !== 'PASS').length;
  const summary = {
    ok: finalFailCount === 0,
    summary: { pass: results.length - finalFailCount, fail: finalFailCount },
    route: 'http://127.0.0.1:4173/?qcReset=1&qcSize=72',
    results,
    diagnostics: diagnostics.slice(-30),
    networkFailures: networkFailures.slice(-30),
  };
  await page.evaluate((payload) => {
    localStorage.setItem('dev053-task-drag-muscle-memory-consistency-result', JSON.stringify(payload));
  }, summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));

  if (finalFailCount > 0) {
    throw new Error(`DEV-053 browser verification failed: ${JSON.stringify(results.filter((result) => result.result !== 'PASS'))}`);
  }
  return summary;
}
