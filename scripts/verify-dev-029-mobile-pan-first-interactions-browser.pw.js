/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const activeHeldTouches = new Set();
  const screenshotBase = `output/playwright/dev-029-mobile-pan-operation-matrix-${Date.now()}`;

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

  const setCoarsePointer = async () => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
      } catch (_) {
        // Reused Playwright sessions may already have the property patched.
      }
      if (window.__projedDev029CoarsePointerPatched) return;
      window.__projedDev029CoarsePointerPatched = true;
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
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([
        {
          id: 'dev029-inbox',
          title: '未歸位手機驗證',
          note: '未歸位手機驗證',
          itemType: 'todo',
          captureStatus: 'untriaged',
          syncStatus: 'pending',
          createdBy: account.id,
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
          completedAt: null,
          archivedAt: null,
          suggestedDueDate: '2026-07-07',
          confirmedDueDate: null,
          promotedTaskNodeId: null,
        },
      ]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({
        open: false,
        filtersOpen: false,
        showContainersInAllTasks: false,
      }));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const openApp = async (viewport = { width: 390, height: 844 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedAuxiliaryState();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=72', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const card = () => page.locator('.kanban-task-card[data-touch-tap-guard="true"][data-task-id]').first();
  const cardTitle = () => card().locator('.task-title-text').first();
  const childRow = () => page.locator('.kanban-checklist-item[data-touch-tap-guard="true"][data-task-id]').first();
  const columnSurface = () => page.locator('[data-mobile-pan-surface="kanban-column"]').first();
  const boardSurface = () => page.locator('[data-mobile-pan-surface="board"]').first();
  const columnRail = () => page.locator('[data-mobile-pan-rail="kanban-column"]').first();
  const kanbanAddTaskButton = () => page.locator('[data-kanban-add-task-button="true"][data-mobile-pan-pass-through="true"]').first();
  const boardAddColumnButton = () => page.locator('[data-kanban-add-column-button="true"][data-mobile-pan-pass-through="true"]').first();
  const mobileActionRail = () => page.locator('[data-mobile-task-action-rail="true"]').first();
  const mobileDragPreview = () => page.locator('[data-mobile-drag-preview="true"]').first();
  const mobileAction = (action) => page.locator(`[data-mobile-task-action="${action}"]`).first();

  const assertCompactMobileActionRail = async (label, taskLocator) => {
    const taskBox = taskLocator ? await taskLocator.boundingBox() : null;
    const layout = await page.evaluate(() => {
      const rail = document.querySelector('[data-mobile-task-action-rail="true"]');
      const actions = Array.from(document.querySelectorAll('[data-mobile-task-action]'));
      const railRect = rail?.getBoundingClientRect();
      const rects = actions.map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          text: item.textContent?.trim() || '',
          svgCount: item.querySelectorAll('svg').length,
          scrollWidth: item.scrollWidth,
          clientWidth: item.clientWidth,
        };
      });
      const top = rects[0]?.top ?? 0;
      const bottom = rects[0]?.bottom ?? 0;
      const gaps = rects.slice(1).map((rect, index) => rect.left - rects[index].right);
      return {
        viewportWidth: window.innerWidth,
        rail: railRect ? {
          left: railRect.left,
          right: railRect.right,
          top: railRect.top,
          bottom: railRect.bottom,
          width: railRect.width,
          height: railRect.height,
        } : null,
        railScrollWidth: rail?.scrollWidth ?? 0,
        railClientWidth: rail?.clientWidth ?? 0,
        actionCount: actions.length,
        svgCount: actions.reduce((total, item) => total + item.querySelectorAll('svg').length, 0),
        rects,
        gaps,
        maxTopDelta: rects.reduce((max, rect) => Math.max(max, Math.abs(rect.top - top)), 0),
        maxBottomDelta: rects.reduce((max, rect) => Math.max(max, Math.abs(rect.bottom - bottom)), 0),
        maxAdjacentGap: gaps.length ? Math.max(...gaps) : 0,
        minAdjacentGap: gaps.length ? Math.min(...gaps) : 0,
      };
    });
    assert(Boolean(layout.rail), `${label} should render the mobile action rail`, layout);
    assert(layout.actionCount === 4, `${label} should render exactly four action buttons`, layout);
    assert(layout.svgCount === 0, `${label} should not render icons inside action buttons`, layout);
    assert(layout.rail.height <= 48, `${label} should keep rail height compact`, layout);
    assert(layout.maxTopDelta <= 1.5 && layout.maxBottomDelta <= 1.5, `${label} action buttons should stay on one row`, layout);
    assert(layout.maxAdjacentGap <= 1.5 && layout.minAdjacentGap >= -1.5, `${label} action buttons should be adjacent without gaps`, layout);
    assert(layout.rail.left >= -1 && layout.rail.right <= layout.viewportWidth + 1, `${label} rail should not horizontally overflow`, layout);
    assert(layout.railScrollWidth <= layout.railClientWidth + 1, `${label} rail content should not horizontally scroll`, layout);
    if (taskBox) {
      const overlapPx = Math.max(0, layout.rail.bottom - taskBox.y);
      assert(overlapPx <= 1, `${label} rail should not cover the task surface`, { layout, taskBox, overlapPx });
    }
    return layout;
  };

  const uiState = async () => {
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    return {
      modalCount: await page.locator('[data-task-details-modal="true"]').count(),
      actionRailCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
      previewCount: await page.locator('[data-mobile-drag-preview="true"]').count(),
      globalContextMenuCount: await page.locator('[data-global-context-menu="true"]').count(),
      menuRenameCount: await page.getByText('重新命名任務').count(),
      fullTaskMenuSignatureCount:
        await page.getByText('更多詳情選項').count() +
        await page.getByText('主責／協作').count() +
        await page.getByText('複製任務').count(),
      renameInputCount: await page.locator('[data-task-title-input="true"]').count(),
      visibleHttpError: /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText),
    };
  };

  const assertNoTaskAction = async (label) => {
    const state = await uiState();
    assert(
      state.modalCount === 0 &&
        state.actionRailCount === 0 &&
        state.previewCount === 0 &&
        state.globalContextMenuCount === 0 &&
        state.menuRenameCount === 0 &&
        state.fullTaskMenuSignatureCount === 0 &&
        state.renameInputCount === 0 &&
        state.visibleHttpError === false,
      `${label} should not trigger task action`,
      state,
    );
  };

  const assertMobileContextMenuSuppressed = async (label, locator, options = {}) => {
    const point = await pointFor(locator, options.ratioX ?? 0.45, options.ratioY ?? 0.5);
    await locator.evaluate((element, coords) => {
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: coords.x,
        clientY: coords.y,
        button: 2,
      });
      element.dispatchEvent(event);
    }, { x: point.x, y: point.y });
    await page.waitForTimeout(120);
    const state = await uiState();
    assert(
      state.actionRailCount === 1 &&
        state.globalContextMenuCount === 0 &&
        state.fullTaskMenuSignatureCount === 0,
      `${label} should keep only the top mobile action rail when contextmenu is synthesized`,
      state,
    );
    return state;
  };

  const cleanupUi = async () => {
    for (const heldTouch of Array.from(activeHeldTouches)) {
      await heldTouch.cancel().catch(() => undefined);
    }
    await page.mouse.move(1, 1).catch(() => undefined);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }).catch(() => undefined);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(80);
    }
    const closeButton = page.locator('[data-task-details-modal="true"] button[title="關閉"]').first();
    if (await closeButton.count()) {
      await closeButton.click({ timeout: 1000 }).catch(() => undefined);
      await page.waitForTimeout(80);
    }
  };

  const pointFor = async (locator, ratioX = 0.45, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'target should have a bounding box');
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      localX: Math.max(4, Math.round(box.width * ratioX)),
      localY: Math.max(4, Math.round(box.height * ratioY)),
      box,
    };
  };

  const dispatchDomTouch = async (locator, { dx = 0, dy = 0, holdMs = 0, compatibilityClick = false, ratioX = 0.45, ratioY = 0.5 } = {}) => {
    await locator.evaluate((element, ratios) => {
      const rect = element.getBoundingClientRect();
      const point = { clientX: rect.left + Math.max(8, rect.width * ratios.ratioX), clientY: rect.top + Math.max(8, rect.height * ratios.ratioY) };
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [point] });
      Object.defineProperty(event, 'targetTouches', { value: [point] });
      Object.defineProperty(event, 'changedTouches', { value: [point] });
      element.dispatchEvent(event);
    }, { ratioX, ratioY });

    if (dx || dy) {
      await locator.evaluate((element, movement) => {
        const rect = element.getBoundingClientRect();
        const start = { clientX: rect.left + Math.max(8, rect.width * movement.ratioX), clientY: rect.top + Math.max(8, rect.height * movement.ratioY) };
        const point = { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy };
        const event = new Event('touchmove', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: [point] });
        Object.defineProperty(event, 'targetTouches', { value: [point] });
        Object.defineProperty(event, 'changedTouches', { value: [point] });
        element.dispatchEvent(event);
      }, { dx, dy, ratioX, ratioY });
    }

    if (holdMs > 0) await page.waitForTimeout(holdMs);

    await locator.evaluate((element, movement) => {
      const rect = element.getBoundingClientRect();
      const start = { clientX: rect.left + Math.max(8, rect.width * movement.ratioX), clientY: rect.top + Math.max(8, rect.height * movement.ratioY) };
      const point = { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy };
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [] });
      Object.defineProperty(event, 'targetTouches', { value: [] });
      Object.defineProperty(event, 'changedTouches', { value: [point] });
      element.dispatchEvent(event);
    }, { dx, dy, ratioX, ratioY });

    if (compatibilityClick) {
      await locator.click({ timeout: 3000 }).catch((error) => {
        throw new Error(`compatibility click failed: ${error.message}`);
      });
    }
  };

  const dispatchTouchGesture = async (locator, { dx = 0, dy = 0, holdMs = 0, compatibilityClick = false, ratioX = 0.45, ratioY = 0.5 } = {}) => {
    const point = await pointFor(locator, ratioX, ratioY);
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
      });
      if (dx || dy) {
        const steps = 4;
        for (let i = 1; i <= steps; i += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{
              x: Math.round(point.x + (dx * i) / steps),
              y: Math.round(point.y + (dy * i) / steps),
              radiusX: 4,
              radiusY: 4,
              force: 1,
              id: 1,
            }],
          });
          await page.waitForTimeout(20);
        }
      }
      if (holdMs > 0) await page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      if (compatibilityClick) {
        await page.waitForTimeout(80);
        const nativeTouchOpenedDetails = !dx && !dy
          && await page.locator('[data-task-details-modal="true"]').count() > 0;
        if (!nativeTouchOpenedDetails) {
          await locator.click({ position: { x: point.localX, y: point.localY }, timeout: 3000 });
        }
      }
    } catch (error) {
      await dispatchDomTouch(locator, { dx, dy, holdMs, compatibilityClick, ratioX, ratioY });
    }
    await page.waitForTimeout(160);
  };

  const startHeldTouch = async (locator, { holdMs = 650, ratioX = 0.45, ratioY = 0.5 } = {}) => {
    const point = await pointFor(locator, ratioX, ratioY);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);

    let current = { x: point.x, y: point.y };
    let released = false;
    const controller = {
      point,
      moveTo: async (targetPoint) => {
        const steps = 5;
        for (let i = 1; i <= steps; i += 1) {
          const x = Math.round(current.x + ((targetPoint.x - current.x) * i) / steps);
          const y = Math.round(current.y + ((targetPoint.y - current.y) * i) / steps);
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(30);
        }
        current = { x: targetPoint.x, y: targetPoint.y };
      },
      end: async () => {
        if (released) return;
        released = true;
        activeHeldTouches.delete(controller);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(220);
      },
      cancel: async () => {
        if (released) return;
        released = true;
        activeHeldTouches.delete(controller);
        await page.keyboard.press('Escape').catch(() => undefined);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(220);
      },
    };
    activeHeldTouches.add(controller);
    return controller;
  };

  const dispatchLongPressDragToLocator = async (sourceLocator, targetLocator, options = {}) => {
    const heldTouch = await startHeldTouch(sourceLocator, options);
    await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
    const targetPoint = await pointFor(targetLocator, 0.5, 0.5);
    await heldTouch.moveTo(targetPoint);
    await heldTouch.end();
  };

  const getScrollState = async (locator) => locator.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));

  const closeMobileSidebarIfOpen = async () => {
    const sidebarOverlay = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    const sidebarBackdrop = page.locator('[data-mobile-sidebar-backdrop="true"]').first();
    if (!(await sidebarOverlay.count()) && !(await sidebarBackdrop.count())) return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await sidebarOverlay.waitFor({ state: 'detached', timeout: 1200 }).catch(async () => {
      if (await sidebarBackdrop.count()) {
        await sidebarBackdrop.click({ timeout: 1200, force: true }).catch(() => undefined);
      }
    });
    await page.waitForTimeout(80);
  };

  const ensureWorkbenchOpen = async () => {
    await closeMobileSidebarIfOpen();
    const expanded = page.locator('[data-task-workbench-panel="true"]');
    const expandedBox = await expanded.first().boundingBox().catch(() => null);
    if (expandedBox) return expanded;
    const navEntry = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    await navEntry.waitFor({ state: 'visible', timeout: 5000 });
    await navEntry.click({ timeout: 5000, force: true }).catch(() => undefined);
    await expanded.waitFor({ state: 'visible', timeout: 1200 }).catch(async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('projed:open-task-workbench-panel'));
      });
    });
    await expanded.waitFor({ state: 'visible', timeout: 5000 });
    return expanded;
  };

  const closeWorkbenchIfOpen = async () => {
    await closeMobileSidebarIfOpen();
    const expanded = page.locator('[data-task-workbench-panel="true"]');
    if (!(await expanded.count())) return;
    const box = await expanded.boundingBox().catch(() => null);
    if (!box) return;
    const collapse = expanded.locator('[data-task-workbench-collapse-toggle="true"]').first();
    if (!(await collapse.count())) return;
    await collapse.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(160);
    await closeMobileSidebarIfOpen();
  };

  const runCase = async (id, scenario, fn) => {
    const startedAt = new Date().toISOString();
    try {
      const details = await fn();
      results.push({ id, scenario, result: 'PASS', startedAt, details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({
        id,
        scenario,
        result: 'FAIL',
        startedAt,
        error: error.message,
        screenshotPath,
      });
    } finally {
      await cleanupUi();
    }
  };

  try {
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(20000);
    await setCoarsePointer();
    await openApp();

    await runCase('QA-029-A01', '390x844 mobile board loads', async () => {
      await boardSurface().waitFor({ state: 'visible', timeout: 5000 });
      const screenshotPath = `${screenshotBase}-A01-loaded.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { screenshotPath, viewport: page.viewportSize() };
    });

    await runCase('QA-029-A02', 'visible error sweep', async () => {
      const alertTexts = await page.locator('.inline-error, [role="alert"]').evaluateAll((items) =>
        items.map((item) => item.textContent?.trim()).filter(Boolean)
      );
      const state = await uiState();
      assert(alertTexts.length === 0 && !state.visibleHttpError, 'visible errors should not exist', { alertTexts, state });
      return { alertTexts, state };
    });

    await runCase('QA-029-A03', 'mobile hides mode switcher controls', async () => {
      const counts = {
        board: await page.locator('[data-mode-switcher-value="board"]').count(),
        list: await page.locator('[data-mode-switcher-value="list"]').count(),
        mindmap: await page.locator('[data-mode-switcher-value="mindmap"]').count(),
        gantt: await page.locator('[data-mode-switcher-value="gantt"]').count(),
        calendar: await page.locator('[data-mode-switcher-value="calendar"]').count(),
        records: await page.locator('[data-mode-switcher-value="records"]').count(),
      };
      assert(
        counts.board + counts.list + counts.mindmap + counts.gantt + counts.calendar + counts.records === 0,
        'mobile mode switcher entries should be hidden',
        counts,
      );
      return counts;
    });

    await runCase('QA-029-A04', 'mobile viewport has no body-level horizontal overflow', async () => {
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      assert(metrics.documentScrollWidth <= metrics.documentClientWidth + 2, 'document should not horizontally overflow', metrics);
      return metrics;
    });

    await runCase('QA-029-B01', 'card body pan suppresses task actions', async () => {
      await dispatchTouchGesture(card(), { dx: 64, dy: 18, compatibilityClick: true });
      await assertNoTaskAction('card body pan');
    });

    await runCase('QA-029-B02', 'card title pan suppresses task actions', async () => {
      await dispatchTouchGesture(cardTitle(), { dx: 56, dy: 16, compatibilityClick: true });
      await assertNoTaskAction('card title pan');
    });

    await runCase('QA-029-B03', 'checklist row pan suppresses task actions', async () => {
      await childRow().waitFor({ state: 'visible', timeout: 5000 });
      await dispatchTouchGesture(childRow(), { dx: 56, dy: 16, compatibilityClick: true });
      await assertNoTaskAction('checklist row pan');
    });

    await runCase('QA-029-B07', 'L2+ checklist row vertical pan scrolls the column', async () => {
      await childRow().waitFor({ state: 'visible', timeout: 5000 });
      await columnSurface().evaluate((element) => { element.scrollTop = 0; });
      const before = await getScrollState(columnSurface());
      assert(before.scrollHeight > before.clientHeight + 20, 'column should be vertically scrollable for this scenario', before);
      await dispatchTouchGesture(childRow(), { dx: 0, dy: -120 });
      const after = await getScrollState(columnSurface());
      assert(after.scrollTop > before.scrollTop + 4, 'checklist row vertical pan should move column scrollTop', { before, after });
      await assertNoTaskAction('checklist row vertical scroll');
      return { before, after };
    });

    await runCase('QA-029-B08', 'L2+ checklist row horizontal pan scrolls the board', async () => {
      await childRow().waitFor({ state: 'visible', timeout: 5000 });
      await boardSurface().evaluate((element) => { element.scrollLeft = 0; });
      const before = await getScrollState(boardSurface());
      assert(before.scrollWidth > before.clientWidth + 20, 'board should be horizontally scrollable for this scenario', before);
      await dispatchTouchGesture(childRow(), { dx: -120, dy: 0 });
      const after = await getScrollState(boardSurface());
      assert(after.scrollLeft > before.scrollLeft + 4, 'checklist row horizontal pan should move board scrollLeft', { before, after });
      await assertNoTaskAction('checklist row horizontal scroll');
      return { before, after };
    });

    await runCase('QA-029-B09', 'former handle zone short pan scrolls the board', async () => {
      await card().waitFor({ state: 'visible', timeout: 5000 });
      await boardSurface().evaluate((element) => { element.scrollLeft = 0; });
      const before = await getScrollState(boardSurface());
      assert(before.scrollWidth > before.clientWidth + 20, 'board should be horizontally scrollable for former-handle-zone pan scenario', before);
      await dispatchTouchGesture(card(), { dx: -120, dy: 0, ratioX: 0.12, ratioY: 0.28 });
      const after = await getScrollState(boardSurface());
      const mobilePanDebug = await page.evaluate(() => window.__projedMobilePanDebug || []);
      assert(after.scrollLeft > before.scrollLeft + 4, 'former handle zone short pan should move board scrollLeft on mobile', { before, after, mobilePanDebug });
      await assertNoTaskAction('former handle zone horizontal scroll');
      return { before, after, mobilePanDebug };
    });

    await runCase('QA-029-B04', 'column surface pan does not trigger task actions', async () => {
      await dispatchTouchGesture(columnSurface(), { dx: 0, dy: 72, compatibilityClick: true });
      await assertNoTaskAction('column surface pan');
    });

    await runCase('QA-029-B05', 'board gap or rail pan does not trigger task actions', async () => {
      await dispatchTouchGesture(columnRail(), { dx: 72, dy: 0, compatibilityClick: true });
      await assertNoTaskAction('board gap pan');
    });

    await runCase('QA-029-B10', 'kanban add-task button short-pan scrolls the board without creating a task', async () => {
      await closeWorkbenchIfOpen();
      const addButton = kanbanAddTaskButton();
      await addButton.waitFor({ state: 'visible', timeout: 5000 });
      await boardSurface().evaluate((element) => { element.scrollLeft = 0; });
      const before = await getScrollState(boardSurface());
      const beforeCount = await page.locator('.kanban-task-card[data-task-id]').count();
      assert(before.scrollWidth > before.clientWidth + 20, 'board should be horizontally scrollable from add-task button', before);
      await dispatchTouchGesture(addButton, { dx: -120, dy: 0, compatibilityClick: true, ratioX: 0.5, ratioY: 0.5 });
      const after = await getScrollState(boardSurface());
      const afterCount = await page.locator('.kanban-task-card[data-task-id]').count();
      const mobilePanDebug = await page.evaluate(() => window.__projedMobilePanDebug || []);
      assert(after.scrollLeft > before.scrollLeft + 4, 'add-task button horizontal short-pan should move board scrollLeft', { before, after, mobilePanDebug });
      assert(afterCount === beforeCount, 'add-task button short-pan must not create a task', { beforeCount, afterCount });
      await assertNoTaskAction('add-task button horizontal pan');
      return { before, after, beforeCount, afterCount, mobilePanDebug: mobilePanDebug.slice(-10) };
    });

    await runCase('QA-029-B11', 'kanban add-task button vertical short-pan scrolls the column', async () => {
      await closeWorkbenchIfOpen();
      const addButton = kanbanAddTaskButton();
      await addButton.scrollIntoViewIfNeeded();
      const before = await getScrollState(columnSurface());
      const beforeCount = await page.locator('.kanban-task-card[data-task-id]').count();
      assert(before.scrollHeight > before.clientHeight + 20, 'column should be vertically scrollable from add-task button', before);
      assert(before.scrollTop > 8, 'add-task button should be reachable near the lower column scroll range', before);
      await dispatchTouchGesture(addButton, { dx: 0, dy: 120, ratioX: 0.5, ratioY: 0.5 });
      const after = await getScrollState(columnSurface());
      const afterCount = await page.locator('.kanban-task-card[data-task-id]').count();
      const mobilePanDebug = await page.evaluate(() => window.__projedMobilePanDebug || []);
      assert(after.scrollTop < before.scrollTop - 4, 'add-task button vertical short-pan should move column scrollTop', { before, after, mobilePanDebug });
      assert(afterCount === beforeCount, 'add-task button vertical short-pan must not create a task', { beforeCount, afterCount });
      await assertNoTaskAction('add-task button vertical pan');
      return { before, after, beforeCount, afterCount, mobilePanDebug: mobilePanDebug.slice(-10) };
    });

    await runCase('QA-029-B12', 'board add-column button short-pan scrolls the board without creating a column', async () => {
      await closeWorkbenchIfOpen();
      const addColumnButton = boardAddColumnButton();
      await addColumnButton.scrollIntoViewIfNeeded();
      const before = await getScrollState(boardSurface());
      const beforeCount = await page.locator('[data-kanban-column-header="true"][data-task-id]').count();
      assert(before.scrollLeft > 20, 'board add-column button should be reachable near the right board scroll range', before);
      await dispatchTouchGesture(addColumnButton, { dx: 72, dy: 0, ratioX: 0.5, ratioY: 0.5 });
      const after = await getScrollState(boardSurface());
      const afterCount = await page.locator('[data-kanban-column-header="true"][data-task-id]').count();
      const mobilePanDebug = await page.evaluate(() => window.__projedMobilePanDebug || []);
      assert(after.scrollLeft < before.scrollLeft - 4, 'board add-column button short-pan should move board scrollLeft', { before, after, mobilePanDebug });
      assert(afterCount === beforeCount, 'board add-column button short-pan must not create a column', { beforeCount, afterCount });
      await assertNoTaskAction('board add-column button pan');
      return { before, after, beforeCount, afterCount, mobilePanDebug: mobilePanDebug.slice(-10) };
    });

    await runCase('QA-029-C01', 'card long press enters mobile drag-action mode', async () => {
      const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      const actionKeys = await page.locator('[data-mobile-task-action]').evaluateAll((items) =>
        items.map((item) => item.getAttribute('data-mobile-task-action')).filter(Boolean)
      );
      const actionLabels = await page.locator('[data-mobile-task-action-text="true"]').evaluateAll((items) =>
        items.map((item) => item.textContent?.trim()).filter(Boolean)
      );
      assert(
        JSON.stringify(actionKeys.sort()) === JSON.stringify(['add-child', 'add-sibling', 'delete', 'toggle-complete'].sort()),
        'mobile action rail should expose only compact allowed actions',
        { actionKeys, actionLabels },
      );
      ['標示完成', '新增同階任務', '新增下階任務', '刪除任務'].forEach((label) => {
        assert(actionLabels.includes(label), 'mobile action rail should expose readable text labels', { label, actionLabels });
      });
      const compactLayout = await assertCompactMobileActionRail('card long press compact rail', card());
      const contextMenuState = await assertMobileContextMenuSuppressed('card long press', card(), { ratioY: 0.12 });
      const screenshotPath = `${screenshotBase}-C01-mobile-action-rail-card.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await heldTouch.end();
      return { screenshotPath, actionKeys, compactLayout, contextMenuState };
    });

    await runCase('QA-029-C02', 'checklist row long press enters mobile drag-action mode', async () => {
      await childRow().waitFor({ state: 'visible', timeout: 5000 });
      const heldTouch = await startHeldTouch(childRow());
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      const compactLayout = await assertCompactMobileActionRail('checklist row compact rail', childRow());
      const contextMenuState = await assertMobileContextMenuSuppressed('checklist row long press', childRow());
      const screenshotPath = `${screenshotBase}-C02-mobile-action-rail-child.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await heldTouch.end();
      return { screenshotPath, compactLayout, contextMenuState };
    });

    await runCase('QA-029-C09', 'card former handle zone long press uses mobile action mode', async () => {
      await card().waitFor({ state: 'visible', timeout: 5000 });
      const heldTouch = await startHeldTouch(card(), { ratioX: 0.12, ratioY: 0.28 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      const handleCount = await page.locator('[data-task-drag-handle="true"]').count();
      assert(handleCount === 0, 'retired drag handle should not exist on mobile card surfaces', { handleCount });
      const contextMenuState = await assertMobileContextMenuSuppressed('card former handle zone long press', card(), { ratioX: 0.12, ratioY: 0.28 });
      await heldTouch.end();
      return { handleCount, contextMenuState };
    });

    await runCase('QA-029-C10', 'checklist former handle zone long press uses mobile action mode', async () => {
      await childRow().waitFor({ state: 'visible', timeout: 5000 });
      const heldTouch = await startHeldTouch(childRow(), { ratioX: 0.12, ratioY: 0.5 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      const handleCount = await page.locator('[data-task-drag-handle="true"]').count();
      assert(handleCount === 0, 'retired drag handle should not exist on checklist surfaces', { handleCount });
      const contextMenuState = await assertMobileContextMenuSuppressed('checklist former handle zone long press', childRow(), { ratioX: 0.12, ratioY: 0.5 });
      await heldTouch.end();
      return { handleCount, contextMenuState };
    });

    await runCase('QA-029-C11', 'touchcancel exits mobile drag-action mode without committing', async () => {
      const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      await heldTouch.cancel();
      await page.waitForFunction(() => !document.querySelector('[data-mobile-task-action-rail="true"]'), null, { timeout: 5000 });
      const railCount = await page.locator('[data-mobile-task-action-rail="true"]').count();
      const previewCount = await page.locator('[data-mobile-drag-preview="true"]').count();
      const mobileActionDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      assert(railCount === 0 && previewCount === 0, 'touchcancel should remove mobile action rail and drag preview', { railCount, previewCount, mobileActionDebug });
      return { railCount, previewCount, mobileActionDebug };
    });

    await runCase('QA-029-C12', 'drag-action near right viewport edge auto-scrolls board', async () => {
      await closeWorkbenchIfOpen();
      await boardSurface().evaluate((element) => { element.scrollLeft = 0; });
      const before = await getScrollState(boardSurface());
      assert(before.scrollWidth > before.clientWidth + 20, 'board should be horizontally scrollable for drag edge auto-scroll', before);
      const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      const box = await boardSurface().boundingBox();
      assert(Boolean(box), 'board should have bounding box for edge auto-scroll');
      await heldTouch.moveTo({ x: Math.round(box.x + box.width - 6), y: heldTouch.point.y });
      try {
        await page.waitForFunction(() => {
          const board = document.querySelector('[data-mobile-pan-surface="board"]');
          return Boolean(board && board.scrollLeft > 20);
        }, null, { timeout: 5000 });
      } catch (error) {
        const diagnostics = await page.evaluate(() => ({
          debug: window.__projedMobileTaskActionDebug || [],
          board: (() => {
            const element = document.querySelector('[data-mobile-pan-surface="board"]');
            const rect = element?.getBoundingClientRect();
            return element ? { scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, rect: rect ? { left: rect.left, right: rect.right, width: rect.width } : null } : null;
          })(),
        }));
        throw new Error(`board edge auto-scroll timeout: ${JSON.stringify(diagnostics)}; ${error.message}`);
      } finally {
        await heldTouch.cancel();
      }
      const after = await getScrollState(boardSurface());
      const mobileActionDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      assert(after.scrollLeft > before.scrollLeft + 20, 'drag-action right edge should auto-scroll board horizontally', { before, after, mobileActionDebug });
      return { before, after, mobileActionDebug };
    });

    await runCase('QA-029-C13', 'drag-action near bottom column edge auto-scrolls column', async () => {
      await closeWorkbenchIfOpen();
      await columnSurface().evaluate((element) => { element.scrollTop = 0; });
      const before = await getScrollState(columnSurface());
      assert(before.scrollHeight > before.clientHeight + 20, 'column should be vertically scrollable for drag edge auto-scroll', before);
      const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      const box = await columnSurface().boundingBox();
      assert(Boolean(box), 'column should have bounding box for edge auto-scroll');
      await heldTouch.moveTo({ x: Math.round(box.x + box.width * 0.5), y: Math.round(box.y + box.height - 6) });
      try {
        await page.waitForFunction(() => {
          const column = document.querySelector('[data-mobile-pan-surface="kanban-column"]');
          return Boolean(column && column.scrollTop > 20);
        }, null, { timeout: 5000 });
      } catch (error) {
        const diagnostics = await page.evaluate(() => ({
          debug: window.__projedMobileTaskActionDebug || [],
          column: (() => {
            const element = document.querySelector('[data-mobile-pan-surface="kanban-column"]');
            const rect = element?.getBoundingClientRect();
            return element ? { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, rect: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null } : null;
          })(),
        }));
        throw new Error(`column edge auto-scroll timeout: ${JSON.stringify(diagnostics)}; ${error.message}`);
      } finally {
        await heldTouch.cancel();
      }
      const after = await getScrollState(columnSurface());
      const mobileActionDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      assert(after.scrollTop > before.scrollTop + 20, 'drag-action bottom edge should auto-scroll column vertically', { before, after, mobileActionDebug });
      return { before, after, mobileActionDebug };
    });

    await runCase('QA-029-C04', 'drop on delete action opens confirmation without immediate delete', async () => {
      const taskId = await card().getAttribute('data-task-id');
      await dispatchLongPressDragToLocator(card(), mobileAction('delete'), { ratioY: 0.12 });
      const dialog = page.locator('.global-dialog-content').first();
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      const message = await dialog.innerText();
      const stillExists = await page.locator(`[data-task-id="${taskId}"]`).count();
      assert(message.includes('確定要刪除任務'), 'delete drop should open delete confirmation', { message });
      assert(stillExists > 0, 'delete drop should not archive task before confirmation', { taskId, stillExists });
      return { taskId, message };
    });

    await runCase('QA-029-C03', 'movement over tolerance cancels long press', async () => {
      await dispatchTouchGesture(card(), { dx: 32, dy: 18, holdMs: 650, compatibilityClick: true });
      await assertNoTaskAction('moved long press');
    });

    await runCase('QA-029-C06', 'long press drag to another task reorders by task position', async () => {
      await closeWorkbenchIfOpen();
      const cards = page.locator('.kanban-task-card[data-mobile-drop-target="true"], .kanban-task-card[data-mobile-drop-target][data-task-id]');
      const count = await cards.count();
      assert(count >= 4, 'scenario needs at least four cards', { count });
      // The first two seeded roots are already overdue. Use future-dated siblings so this
      // case isolates mobile drag ordering from the main baseline's smart-status behavior.
      const source = cards.nth(3);
      const target = cards.nth(2);
      const sourceId = await source.getAttribute('data-task-id');
      const targetId = await target.getAttribute('data-task-id');
      const before = await page.locator('.kanban-task-card[data-task-id]').evaluateAll((items) =>
        items.map((item) => item.getAttribute('data-task-id'))
      );
      const heldTouch = await startHeldTouch(source, { ratioY: 0.12 });
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      const targetPoint = await pointFor(target, 0.5, 0.12);
      await heldTouch.moveTo(targetPoint);
      await page.locator('[data-mobile-drop-indicator="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await heldTouch.end();
      const after = await page.locator('.kanban-task-card[data-task-id]').evaluateAll((items) =>
        items.map((item) => item.getAttribute('data-task-id'))
      );
      const mobileActionDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      assert(sourceId && targetId && after.indexOf(sourceId) < after.indexOf(targetId), 'source card should move before target card', { sourceId, targetId, before, after, mobileActionDebug });
      return { sourceId, targetId, before, after };
    });

    await runCase('QA-029-C05', 'mobile action rail stays within mobile viewport', async () => {
      const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
      const rail = mobileActionRail();
      await rail.waitFor({ state: 'visible', timeout: 5000 });
      const box = await rail.boundingBox();
      const compactLayout = await assertCompactMobileActionRail('mobile viewport compact rail', card());
      assert(Boolean(box), 'mobile action rail should have bounding box');
      const viewport = page.viewportSize();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'mobile action rail should fit viewport', { box, viewport });
      assert(box.y <= viewport.height * 0.2, 'mobile action rail should be placed at the top of the viewport', { box, viewport });
      await heldTouch.end();
      return { box, viewport, compactLayout };
    });

    await runCase('QA-029-C14', 'compact mobile action rail fits 320/390/430 without covering tasks', async () => {
      const layouts = [];
      for (const viewport of [
        { width: 320, height: 844 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
      ]) {
        await openApp(viewport);
        const heldTouch = await startHeldTouch(card(), { ratioY: 0.12 });
        try {
          await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
          await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
          const compactLayout = await assertCompactMobileActionRail(`${viewport.width}px compact rail`, card());
          layouts.push({ viewport, compactLayout });
        } finally {
          await heldTouch.end();
        }
      }
      return { layouts };
    });

    await runCase('QA-029-C07', 'drop on add-child action creates a child and opens details', async () => {
      const sourceId = await card().getAttribute('data-task-id');
      await dispatchLongPressDragToLocator(card(), mobileAction('add-child'), { ratioY: 0.12 });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      const titleValue = await page.locator('[data-task-details-title-input="true"]').inputValue().catch(() => '');
      assert(modalTaskId && modalTaskId !== sourceId, 'add-child action should open the new child task details', { sourceId, modalTaskId, titleValue });
      assert(titleValue.includes('新任務'), 'new child should use the default new-task title', { titleValue });
      return { sourceId, modalTaskId, titleValue };
    });

    await runCase('QA-029-C08', 'drop on complete action toggles task completed state', async () => {
      await closeWorkbenchIfOpen();
      const task = card();
      const taskId = await task.getAttribute('data-task-id');
      const beforeClass = await task.getAttribute('class');
      const beforeCompleted = String(beforeClass || '').includes('border-l-emerald-400');
      await dispatchLongPressDragToLocator(task, mobileAction('toggle-complete'), { ratioY: 0.12 });
      await page.waitForTimeout(300);
      const afterClass = await page.locator(`.kanban-task-card[data-task-id="${taskId}"]`).first().getAttribute('class');
      const afterCompleted = String(afterClass || '').includes('border-l-emerald-400');
      const mobileActionDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      assert(beforeCompleted !== afterCompleted, 'complete action should toggle completed border state', { taskId, beforeCompleted, afterCompleted, beforeClass, afterClass, mobileActionDebug });
      return { taskId, beforeCompleted, afterCompleted };
    });

    await runCase('QA-029-D01', 'mobile quick tap opens TaskDetailsModal when no pan movement occurs', async () => {
      const taskId = await card().getAttribute('data-task-id');
      await dispatchTouchGesture(cardTitle(), { compatibilityClick: true });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      assert(modalTaskId === taskId, 'mobile quick tap should open TaskDetailsModal for tapped card', { taskId, modalTaskId });
      return { taskId, modalTaskId };
    });

    await runCase('QA-029-E01', 'workbench top nav entry opens panel', async () => {
      const panel = await ensureWorkbenchOpen();
      const box = await panel.boundingBox();
      assert(Boolean(box), 'workbench panel should be visible after top nav entry');
      return { box };
    });

    await runCase('QA-029-E02', 'workbench filter button opens popover', async () => {
      const panel = await ensureWorkbenchOpen();
      await panel.locator('[data-task-workbench-filter-toggle="true"]').click({ timeout: 5000 });
      await panel.locator('[data-task-workbench-filter-popover="true"]').waitFor({ state: 'visible', timeout: 5000 });
    });

    await runCase('QA-029-E03', 'workbench unplaced input accepts text', async () => {
      const panel = await ensureWorkbenchOpen();
      const input = panel.locator('[data-task-workbench-unclassified-input="true"]').first();
      await input.fill('手機未歸位輸入');
      const value = await input.inputValue();
      assert(value === '手機未歸位輸入', 'workbench input should accept text', { value });
      return { value };
    });

    await runCase('QA-029-E04', 'kanban add-task button opens new task details', async () => {
      await cleanupUi();
      const addTaskInputCount = await page.getByPlaceholder('輸入任務名稱').count();
      assert(addTaskInputCount === 0, 'kanban add-task text input should be removed', { addTaskInputCount });

      const beforeCount = await page.locator('.kanban-task-card[data-task-id]').count();
      await page.locator('[data-kanban-add-task-button="true"]').first().click({ timeout: 5000 });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-task-details-title-input') === 'true', null, { timeout: 5000 });

      const afterCount = await page.locator('.kanban-task-card[data-task-id]').count();
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      const titleValue = await page.locator('[data-task-details-title-input="true"]').inputValue().catch(() => '');
      const titleFocused = await page.locator('[data-task-details-title-input="true"]').evaluate((element) => document.activeElement === element);

      assert(afterCount >= beforeCount + 1, 'kanban add-task button should create a new task card', { beforeCount, afterCount });
      assert(Boolean(modalTaskId), 'kanban add-task button should open the new task details modal', { modalTaskId });
      assert(titleValue.includes('新任務'), 'new task details title should use the default task title', { titleValue });
      assert(titleFocused, 'new task details title input should be focused for naming', { titleFocused });
      return { beforeCount, afterCount, modalTaskId, titleValue, titleFocused };
    });

    await runCase('QA-029-E05', 'removed outer rename control does not intercept mobile hit testing', async () => {
      await closeWorkbenchIfOpen();
      const taskId = await card().getAttribute('data-task-id');
      const state = {
        outerRenameControls: await card().locator('[data-task-interaction-control="true"]').count(),
        outerRenameInputs: await page.locator('[data-task-title-input="true"]').count(),
        renameMenuItems: await page.getByText('重新命名任務', { exact: true }).count(),
      };
      assert(
        state.outerRenameControls === 0 &&
          state.outerRenameInputs === 0 &&
          state.renameMenuItems === 0,
        'outer rename controls should be absent and unable to intercept mobile hit testing',
        state,
      );
      await dispatchTouchGesture(cardTitle(), { compatibilityClick: true });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      assert(modalTaskId === taskId, 'mobile card tap should still open details after outer rename removal', { taskId, modalTaskId, state });
      await cleanupUi();
      return { taskId, modalTaskId, state };
    });

    await runCase('QA-029-F01', 'card body pan does not reorder or start drag action', async () => {
      await closeWorkbenchIfOpen();
      const before = await page.locator('[data-mobile-pan-surface="kanban-column"] .kanban-task-card[data-task-id]').evaluateAll((cards) =>
        cards.map((item) => item.getAttribute('data-task-id'))
      );
      await dispatchTouchGesture(card(), { dx: 72, dy: 16, compatibilityClick: true });
      const after = await page.locator('[data-mobile-pan-surface="kanban-column"] .kanban-task-card[data-task-id]').evaluateAll((cards) =>
        cards.map((item) => item.getAttribute('data-task-id'))
      );
      await assertNoTaskAction('card body pan drag guard');
      assert(JSON.stringify(before) === JSON.stringify(after), 'card order should not change after main-surface pan', { before, after });
      return { before, after };
    });

    await runCase('QA-029-F02', 'whole task surfaces use broker-owned touch arbitration without handles', async () => {
      await closeWorkbenchIfOpen();
      const styles = await page.evaluate(() => {
        const cardElement = document.querySelector('.kanban-task-card[data-touch-tap-guard="true"][data-task-id]');
        const checklistElement = document.querySelector('.kanban-checklist-item[data-touch-tap-guard="true"][data-task-id]');
        return {
          cardTouchAction: cardElement ? getComputedStyle(cardElement).touchAction : null,
          checklistTouchAction: checklistElement ? getComputedStyle(checklistElement).touchAction : null,
          cardDragSurface: cardElement?.getAttribute('data-task-drag-surface') ?? null,
          checklistDragSurface: checklistElement?.getAttribute('data-task-drag-surface') ?? null,
          cardDropTarget: cardElement?.getAttribute('data-mobile-drop-target') ?? null,
          checklistDropTarget: checklistElement?.getAttribute('data-mobile-drop-target') ?? null,
          handleCount: document.querySelectorAll('[data-task-drag-handle="true"]').length,
        };
      });
      assert(styles.cardTouchAction === 'none', 'card task gesture should be broker-owned from touchstart', styles);
      assert(styles.checklistTouchAction === 'none', 'checklist task gesture should be broker-owned from touchstart', styles);
      assert(styles.cardDragSurface === 'true' && styles.checklistDragSurface === 'true', 'task surfaces should replace explicit drag handles', styles);
      assert(Boolean(styles.cardDropTarget) && Boolean(styles.checklistDropTarget), 'task surfaces should remain mobile drop targets', styles);
      assert(styles.handleCount === 0, 'retired drag handles should not render in mobile board task surfaces', styles);
      return styles;
    });

    await runCase('QA-029-B06', 'workbench row pan suppresses task actions', async () => {
      const panel = await ensureWorkbenchOpen();
      const row = panel.locator('[data-task-workbench-task-card="true"]').first();
      await row.waitFor({ state: 'visible', timeout: 5000 });
      await dispatchTouchGesture(row, { dx: 56, dy: 16, compatibilityClick: true });
      await assertNoTaskAction('workbench row pan');
    });

    await runCase('QA-029-E06', 'workbench row long press enters mobile drag-action mode', async () => {
      const panel = await ensureWorkbenchOpen();
      const row = panel.locator('[data-task-workbench-task-card="true"][data-mobile-drop-target]').first();
      await row.waitFor({ state: 'visible', timeout: 5000 });
      const heldTouch = await startHeldTouch(row);
      await mobileActionRail().waitFor({ state: 'visible', timeout: 5000 });
      await mobileDragPreview().waitFor({ state: 'visible', timeout: 5000 });
      assert(await page.getByText('重新命名任務').count() === 0, 'workbench mobile long press should not open full desktop menu');
      await heldTouch.end();
    });

    await runCase('QA-029-E07', 'placed workbench row is tap-only and never enters mobile drag-action mode', async () => {
      const panel = await ensureWorkbenchOpen();
      const placedRow = panel.locator('[data-task-workbench-placed-task-card="true"][data-mobile-drop-target]').first();
      await placedRow.scrollIntoViewIfNeeded();
      await placedRow.waitFor({ state: 'visible', timeout: 5000 });
      const taskId = await placedRow.getAttribute('data-task-id');
      const heldTouch = await startHeldTouch(placedRow);
      await heldTouch.end();
      const longPressState = {
        railCount: await mobileActionRail().count(),
        previewCount: await mobileDragPreview().count(),
        dragSurface: await placedRow.getAttribute('data-task-workbench-drag-surface'),
        genericDragSurface: await placedRow.getAttribute('data-task-drag-surface'),
      };
      assert(
        longPressState.railCount === 0 &&
          longPressState.previewCount === 0 &&
          longPressState.dragSurface === null &&
          longPressState.genericDragSurface === null,
        'placed workbench long press must stay read-only for placement',
        longPressState,
      );
      await dispatchTouchGesture(placedRow, { compatibilityClick: true });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      assert(modalTaskId === taskId, 'placed workbench quick tap should still open task details', { taskId, modalTaskId });
      const screenshotPath = `${screenshotBase}-E07-placed-workbench-readonly.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { taskId, modalTaskId, longPressState, screenshotPath };
    });

    await runCase('QA-029-D03', 'desktop mouse click still opens TaskDetailsModal', async () => {
      await closeWorkbenchIfOpen();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await closeMobileSidebarIfOpen();
      await card().waitFor({ state: 'visible', timeout: 10000 });
      const taskId = await card().getAttribute('data-task-id');
      await card().click({ position: { x: 84, y: 28 }, timeout: 5000 });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      assert(modalTaskId === taskId, 'desktop click should open details for clicked card', { taskId, modalTaskId });
      const screenshotPath = `${screenshotBase}-D03-desktop-details.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { screenshotPath, taskId, modalTaskId };
    });

    const failCount = results.filter((result) => result.result !== 'PASS').length;
    const summary = {
      ok: failCount === 0,
      summary: {
        pass: results.length - failCount,
        fail: failCount,
      },
      results,
      diagnostics: diagnostics.slice(-30),
    };

    await page.evaluate((payload) => {
      localStorage.setItem('dev029-mobile-pan-operation-matrix-result', JSON.stringify(payload));
    }, summary).catch(() => undefined);

    console.log(JSON.stringify(summary, null, 2));
    if (failCount > 0) {
      const failures = results
        .filter((result) => result.result !== 'PASS')
        .map((result) => ({
          id: result.id,
          scenario: result.scenario,
          error: result.error,
          screenshotPath: result.screenshotPath,
        }));
      throw new Error(`DEV-029 mobile pan operation matrix failed: ${failCount} case(s) failed: ${JSON.stringify(failures)}`);
    }
  } catch (error) {
    if (results.length > 0) {
      const summary = {
        ok: false,
        summary: {
          pass: results.filter((result) => result.result === 'PASS').length,
          fail: results.filter((result) => result.result !== 'PASS').length,
        },
        results,
        diagnostics: diagnostics.slice(-30),
      };
      await page.evaluate((payload) => {
        localStorage.setItem('dev029-mobile-pan-operation-matrix-result', JSON.stringify(payload));
      }, summary).catch(() => undefined);
      console.log(JSON.stringify(summary, null, 2));
    }
    throw error;
  }
}
