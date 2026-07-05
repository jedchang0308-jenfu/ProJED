/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
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
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=36', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const card = () => page.locator('.kanban-task-card[data-touch-tap-guard="true"][data-task-id]').first();
  const cardTitle = () => card().locator('.task-title-text').first();
  const childRow = () => page.locator('.kanban-checklist-item[data-touch-tap-guard="true"][data-task-id]').first();
  const columnSurface = () => page.locator('[data-mobile-pan-surface="kanban-column"]').first();
  const boardSurface = () => page.locator('[data-mobile-pan-surface="board"]').first();
  const columnRail = () => page.locator('[data-mobile-pan-rail="kanban-column"]').first();

  const uiState = async () => {
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    return {
      modalCount: await page.locator('[data-task-details-modal="true"]').count(),
      menuRenameCount: await page.getByText('重新命名任務').count(),
      renameInputCount: await page.locator('[data-task-title-input="true"]').count(),
      visibleHttpError: /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText),
    };
  };

  const assertNoTaskAction = async (label) => {
    const state = await uiState();
    assert(
      state.modalCount === 0 &&
        state.menuRenameCount === 0 &&
        state.renameInputCount === 0 &&
        state.visibleHttpError === false,
      `${label} should not trigger task action`,
      state,
    );
  };

  const cleanupUi = async () => {
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

  const dispatchDomTouch = async (locator, { dx = 0, dy = 0, holdMs = 0, compatibilityClick = false } = {}) => {
    await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const point = { clientX: rect.left + Math.max(8, rect.width * 0.45), clientY: rect.top + Math.max(8, rect.height * 0.5) };
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [point] });
      Object.defineProperty(event, 'targetTouches', { value: [point] });
      Object.defineProperty(event, 'changedTouches', { value: [point] });
      element.dispatchEvent(event);
    });

    if (dx || dy) {
      await locator.evaluate((element, movement) => {
        const rect = element.getBoundingClientRect();
        const start = { clientX: rect.left + Math.max(8, rect.width * 0.45), clientY: rect.top + Math.max(8, rect.height * 0.5) };
        const point = { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy };
        const event = new Event('touchmove', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: [point] });
        Object.defineProperty(event, 'targetTouches', { value: [point] });
        Object.defineProperty(event, 'changedTouches', { value: [point] });
        element.dispatchEvent(event);
      }, { dx, dy });
    }

    if (holdMs > 0) await page.waitForTimeout(holdMs);

    await locator.evaluate((element, movement) => {
      const rect = element.getBoundingClientRect();
      const start = { clientX: rect.left + Math.max(8, rect.width * 0.45), clientY: rect.top + Math.max(8, rect.height * 0.5) };
      const point = { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy };
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [] });
      Object.defineProperty(event, 'targetTouches', { value: [] });
      Object.defineProperty(event, 'changedTouches', { value: [point] });
      element.dispatchEvent(event);
    }, { dx, dy });

    if (compatibilityClick) {
      await locator.click({ timeout: 3000 }).catch((error) => {
        throw new Error(`compatibility click failed: ${error.message}`);
      });
    }
  };

  const dispatchTouchGesture = async (locator, { dx = 0, dy = 0, holdMs = 0, compatibilityClick = false } = {}) => {
    const point = await pointFor(locator);
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
        await locator.click({ position: { x: point.localX, y: point.localY }, timeout: 3000 });
      }
    } catch (error) {
      await dispatchDomTouch(locator, { dx, dy, holdMs, compatibilityClick });
    }
    await page.waitForTimeout(160);
  };

  const getScrollState = async (locator) => locator.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));

  const ensureWorkbenchOpen = async () => {
    const expanded = page.locator('[data-task-workbench-panel="true"]');
    if (await expanded.count()) return expanded;
    const toggle = page.locator('[data-task-workbench-collapsed-toggle="true"]').first();
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
    await toggle.click({ timeout: 5000 });
    await expanded.waitFor({ state: 'visible', timeout: 5000 });
    return expanded;
  };

  const closeWorkbenchIfOpen = async () => {
    const expanded = page.locator('[data-task-workbench-panel="true"]');
    if (!(await expanded.count())) return;
    const box = await expanded.boundingBox().catch(() => null);
    if (!box) return;
    const collapse = expanded.locator('[data-task-workbench-collapse-toggle="true"]').first();
    if (!(await collapse.count())) return;
    await collapse.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(160);
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

    await runCase('QA-029-A03', 'mobile exposes only board mode', async () => {
      const counts = {
        board: await page.locator('[data-mode-switcher-value="board"]').count(),
        list: await page.locator('[data-mode-switcher-value="list"]').count(),
        mindmap: await page.locator('[data-mode-switcher-value="mindmap"]').count(),
        gantt: await page.locator('[data-mode-switcher-value="gantt"]').count(),
        calendar: await page.locator('[data-mode-switcher-value="calendar"]').count(),
        records: await page.locator('[data-mode-switcher-value="records"]').count(),
      };
      assert(counts.board === 1, 'board mode should be visible', counts);
      assert(counts.list + counts.mindmap + counts.gantt + counts.calendar + counts.records === 0, 'non-board mobile modes should be hidden', counts);
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

    await runCase('QA-029-B04', 'column surface pan does not trigger task actions', async () => {
      await dispatchTouchGesture(columnSurface(), { dx: 0, dy: 72, compatibilityClick: true });
      await assertNoTaskAction('column surface pan');
    });

    await runCase('QA-029-B05', 'board gap or rail pan does not trigger task actions', async () => {
      await dispatchTouchGesture(columnRail(), { dx: 72, dy: 0, compatibilityClick: true });
      await assertNoTaskAction('board gap pan');
    });

    await runCase('QA-029-C01', 'card long press opens task menu', async () => {
      await dispatchTouchGesture(card(), { holdMs: 650 });
      await page.getByText('重新命名任務').waitFor({ state: 'visible', timeout: 5000 });
      const screenshotPath = `${screenshotBase}-C01-long-press-card.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { screenshotPath };
    });

    await runCase('QA-029-C02', 'checklist row long press opens task menu', async () => {
      await dispatchTouchGesture(childRow(), { holdMs: 650 });
      await page.getByText('重新命名任務').waitFor({ state: 'visible', timeout: 5000 });
      const screenshotPath = `${screenshotBase}-C02-long-press-child.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { screenshotPath };
    });

    await runCase('QA-029-C03', 'movement over tolerance cancels long press', async () => {
      await dispatchTouchGesture(card(), { dx: 32, dy: 18, holdMs: 650, compatibilityClick: true });
      await assertNoTaskAction('moved long press');
    });

    await runCase('QA-029-C05', 'context menu stays within mobile viewport', async () => {
      await dispatchTouchGesture(card(), { holdMs: 650 });
      const menu = page.getByText('重新命名任務').first();
      await menu.waitFor({ state: 'visible', timeout: 5000 });
      const box = await menu.boundingBox();
      assert(Boolean(box), 'menu item should have bounding box');
      const viewport = page.viewportSize();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'menu item should fit viewport', { box, viewport });
      return { box, viewport };
    });

    await runCase('QA-029-D01', 'mobile quick tap opens TaskDetailsModal when no pan movement occurs', async () => {
      const taskId = await card().getAttribute('data-task-id');
      await dispatchTouchGesture(cardTitle());
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const modalTaskId = await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id');
      assert(modalTaskId === taskId, 'mobile quick tap should open TaskDetailsModal for tapped card', { taskId, modalTaskId });
      return { taskId, modalTaskId };
    });

    await runCase('QA-029-E01', 'workbench collapsed toggle opens panel', async () => {
      const panel = await ensureWorkbenchOpen();
      const box = await panel.boundingBox();
      assert(Boolean(box), 'workbench panel should be visible after collapsed toggle');
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

    await runCase('QA-029-E04', 'kanban add-task input accepts text', async () => {
      await cleanupUi();
      const input = page.getByPlaceholder('輸入任務名稱').first();
      await input.fill('手機新增任務輸入');
      const value = await input.inputValue();
      assert(value === '手機新增任務輸入', 'kanban add-task input should accept text', { value });
      return { value };
    });

    await runCase('QA-029-E05', 'hidden rename pencil does not intercept mobile hit testing', async () => {
      await closeWorkbenchIfOpen();
      const state = await card().locator('[data-task-interaction-control="true"]').first().evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          hitTag: hit?.tagName ?? null,
          hitIsControl: hit === element,
        };
      });
      assert(state.opacity === '0' && state.pointerEvents === 'none' && state.hitIsControl === false, 'hidden rename control should not intercept mobile hit testing', state);
      return state;
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

    await runCase('QA-029-F02', 'drag handle remains explicit and main card surface allows pan', async () => {
      await closeWorkbenchIfOpen();
      const handle = card().locator('[data-task-drag-handle="true"]').first();
      await handle.waitFor({ state: 'visible', timeout: 5000 });
      const styles = await page.evaluate(() => {
        const cardElement = document.querySelector('.kanban-task-card[data-touch-tap-guard="true"][data-task-id]');
        const handleElement = document.querySelector('.kanban-task-card[data-touch-tap-guard="true"][data-task-id] [data-task-drag-handle="true"]');
        return {
          cardTouchAction: cardElement ? getComputedStyle(cardElement).touchAction : null,
          handleTouchAction: handleElement ? getComputedStyle(handleElement).touchAction : null,
        };
      });
      assert(styles.cardTouchAction?.includes('pan'), 'card main surface should allow pan touch-action', styles);
      assert(styles.handleTouchAction === 'none', 'explicit drag handle should retain touch-action none', styles);
      return styles;
    });

    await runCase('QA-029-B06', 'workbench row pan suppresses task actions', async () => {
      const panel = await ensureWorkbenchOpen();
      const row = panel.locator('[data-task-workbench-task-card="true"]').first();
      await row.waitFor({ state: 'visible', timeout: 5000 });
      await dispatchTouchGesture(row, { dx: 56, dy: 16, compatibilityClick: true });
      await assertNoTaskAction('workbench row pan');
    });

    await runCase('QA-029-D03', 'desktop mouse click still opens TaskDetailsModal', async () => {
      await closeWorkbenchIfOpen();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
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
