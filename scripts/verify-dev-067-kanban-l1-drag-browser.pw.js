/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-067-kanban-l1-drag-${Date.now()}`;
  const currentPageOrigin = page.url().match(/^https?:\/\/[^/]+/)?.[0];
  const appBaseUrl = currentPageOrigin || 'http://localhost:4000';
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`);
  });

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
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({
        open: false,
        filtersOpen: false,
        showContainersInAllTasks: false,
      }));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const openApp = async (viewport) => {
    await page.mouse.up().catch(() => undefined);
    await page.setViewportSize(viewport);
    await page.goto(`${appBaseUrl}/`, { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto(`${appBaseUrl}/?qcReset=1&qcSize=72`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    const sidebar = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    if (await sidebar.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  };

  const readNodes = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));

  const visibleErrorSweep = async (label) => {
    const state = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const alerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
        .filter(visible)
        .map((element) => (element.textContent || '').trim())
        .filter(Boolean);
      return {
        route: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        alerts,
        visibleHttpError: /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(document.body.innerText),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    assert(state.alerts.length === 0 && !state.visibleHttpError && !state.horizontalOverflow,
      `${label} visible error/overflow sweep must pass`, state);
    return state;
  };

  const pointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'target must expose a visible bounding box');
    return { x: Math.round(box.x + box.width * ratioX), y: Math.round(box.y + box.height * ratioY), box };
  };

  const visiblePointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    assert(Boolean(box) && Boolean(viewport), 'mobile target must expose geometry');
    const left = Math.max(8, box.x + 8);
    const right = Math.min(viewport.width - 8, box.x + box.width - 8);
    const top = Math.max(48, box.y + 4);
    const bottom = Math.min(viewport.height - 8, box.y + box.height - 4);
    assert(right > left && bottom > top, 'mobile target must have a visible hit region', { box, viewport });
    return {
      x: Math.round(left + (right - left) * ratioX),
      y: Math.round(top + (bottom - top) * ratioY),
      box,
    };
  };

  const beginMouseDrag = async (source) => {
    const sourceId = await source.getAttribute('data-task-id');
    const point = await pointFor(source, 0.55, 0.4);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 15, point.y + 3, { steps: 5 });
    await page.locator('[data-kanban-drag-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
    return { sourceId, point };
  };

  const readDesktopIndicator = async () => {
    const indicators = page.locator('[data-desktop-drop-indicator="true"]');
    assert(await indicators.count() === 1, 'desktop must show exactly one indicator');
    return indicators.first().evaluate((element) => ({
      target: element.getAttribute('data-desktop-drop-target'),
      position: element.getAttribute('data-desktop-drop-position'),
      surfaceKind: element.getAttribute('data-desktop-drop-surface-kind'),
      axis: element.getAttribute('data-desktop-drop-axis'),
      markerCount: element.querySelectorAll('[data-kanban-insertion-marker="true"]').length,
      dotCount: element.querySelectorAll('[data-kanban-insertion-dot="true"]').length,
      barCount: element.querySelectorAll('[data-kanban-insertion-bar="true"]').length,
      rect: (() => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })(),
    }));
  };

  const desktopDrag = async ({
    source,
    target,
    targetRatio = { x: 0.5, y: 0.5 },
    targetSteps = 14,
    settleMs = 160,
    screenshot,
  }) => {
    const before = await readNodes();
    const { sourceId } = await beginMouseDrag(source);
    const targetPoint = await pointFor(target, targetRatio.x, targetRatio.y);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: targetSteps });
    await page.waitForTimeout(settleMs);
    const indicator = await readDesktopIndicator();
    const screenshotPath = `${screenshotBase}-${screenshot}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(280);
    const after = await readNodes();
    assert(await page.locator('[data-desktop-drop-indicator="true"]').count() === 0,
      'desktop indicator must clear after release');
    return { sourceId, before, after, indicator, screenshotPath };
  };

  const columns = () => page.locator('[data-kanban-column="true"]');
  const cardsInColumn = (index) => columns().nth(index).locator('.kanban-task-card[data-task-id]');
  const columnHeader = (index) => columns().nth(index).locator('[data-kanban-column-header="true"]');
  const columnTitleSlot = (index) => columnHeader(index).locator('[data-task-title-slot="true"]');
  const rootDrop = () => page.locator('[data-kanban-root-drop-zone="true"]').first();

  const readColumnGeometry = async () => ({
    scrollWidth: await page.locator('[data-layout-region="board-canvas"]').evaluate((element) => element.scrollWidth),
    columns: await columns().evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        id: item.getAttribute('data-task-id'),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    })),
  });

  const readColumnTitleTailGeometry = async (index, visibleOnly = false) => {
    const slot = columnTitleSlot(index);
    const title = slot.locator(':scope > span').first();
    const slotPoint = visibleOnly
      ? await visiblePointFor(slot, 0.85, 0.5)
      : await pointFor(slot, 0.85, 0.5);
    const titleRect = await title.boundingBox();
    assert(Boolean(titleRect) && slotPoint.x > titleRect.x + titleRect.width + 8,
      'L1 promotion probe must be visibly after the rendered title text', { slotPoint, titleRect });
    return { slotPoint, titleRect };
  };

  const runCase = async (id, scenario, operation) => {
    try {
      const details = await operation();
      results.push({ id, scenario, result: 'PASS', details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}-FAIL.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', error: error.message, screenshotPath });
      await page.mouse.up().catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  };

  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(20000);

  await runCase('QA-067-003', 'desktop L2 card promotes to L1 from the title-tail area before child dwell arms', async () => {
    await openApp({ width: 1440, height: 900 });
    const tailGeometry = await readColumnTitleTailGeometry(1);
    const result = await desktopDrag({
      source: cardsInColumn(0).first().locator(':scope > [data-task-surface-source="true"]'),
      target: columnTitleSlot(1),
      targetRatio: { x: 0.85, y: 0.5 },
      targetSteps: 1,
      settleMs: 80,
      screenshot: 'desktop-card-to-l1-header',
    });
    const sourceAfter = result.after[result.sourceId];
    const targetAfter = result.after[result.indicator.target];
    assert(result.indicator.surfaceKind === 'column-header'
      && result.indicator.position === 'after'
      && result.indicator.axis === 'vertical'
      && result.indicator.markerCount === 1,
    'column header pre-dwell release must use one vertical L1 insertion rail', result.indicator);
    const promotionCommitted = sourceAfter.parentId === null
      && sourceAfter.nodeType === 'group'
      && sourceAfter.order > targetAfter.order;
    const dragDiagnostics = promotionCommitted ? null : await page.evaluate(() => ({
      debug: window.__projedDesktopTaskDragDebug || [],
      commitSpy: window.__projedTaskDragTestApi?.snapshotDesktopCommitSpy?.() || null,
    }));
    assert(promotionCommitted,
      'desktop header right-half release must promote source to L1 after target', {
        sourceAfter,
        targetAfter,
        indicator: result.indicator,
        dragDiagnostics,
      });
    return { ...result, tailGeometry };
  });

  await runCase('QA-067-002', 'desktop L3 task promotes to L1 before child dwell without rewriting descendants', async () => {
    await openApp({ width: 1440, height: 900 });
    const source = page.locator('.kanban-checklist-item[data-task-id]').first();
    const sourceId = await source.getAttribute('data-task-id');
    const before = await readNodes();
    const descendantParents = Object.values(before)
      .filter((node) => node.parentId === sourceId)
      .map((node) => ({ id: node.id, parentId: node.parentId }));
    const tailGeometry = await readColumnTitleTailGeometry(1);
    const result = await desktopDrag({
      source,
      target: columnTitleSlot(1),
      targetRatio: { x: 0.85, y: 0.5 },
      targetSteps: 1,
      settleMs: 80,
      screenshot: 'desktop-l3-to-l1-header',
    });
    assert(result.after[result.sourceId].parentId === null && result.after[result.sourceId].nodeType === 'group',
      'L3 source must become an L1 group before child dwell arms', result.after[result.sourceId]);
    assert(result.indicator.axis === 'vertical' && result.indicator.rect.height > result.indicator.rect.width * 10,
      'L3 promotion to L1 must use the vertical root-level rail', result.indicator);
    assert(descendantParents.every(({ id, parentId }) => result.after[id]?.parentId === parentId),
      'promotion must preserve descendant ownership', { descendantParents });
    return { ...result, descendantParents, tailGeometry };
  });

  await runCase('QA-067-004', 'desktop board-end root drop appends the promoted L1', async () => {
    await openApp({ width: 1440, height: 900 });
    const result = await desktopDrag({
      source: cardsInColumn(0).first().locator(':scope > [data-task-surface-source="true"]'),
      target: rootDrop(),
      screenshot: 'desktop-root-append',
    });
    const sourceAfter = result.after[result.sourceId];
    const boardId = sourceAfter.boardId;
    const roots = Object.values(result.after).filter((node) => !node.isArchived && node.boardId === boardId && node.parentId === null);
    assert(result.indicator.surfaceKind === 'root-drop' && result.indicator.position === 'append'
      && result.indicator.axis === 'vertical'
      && result.indicator.markerCount === 1,
    'board-end drop must expose one root append marker', result.indicator);
    assert(sourceAfter.nodeType === 'group' && sourceAfter.order === Math.max(...roots.map((node) => node.order)),
      'board-end drop must append source as the final L1 group', { sourceAfter, roots });
    assert(Object.keys(result.before).length === Object.keys(result.after).length,
      'dropping on the add-list surface must not create an extra list');
    return result;
  });

  await runCase('QA-067-005', 'desktop column body remains an L2 append target before child dwell at 1024x768', async () => {
    await openApp({ width: 1024, height: 768 });
    const targetColumnId = await columns().nth(1).getAttribute('data-task-hover-scope-source-id');
    const result = await desktopDrag({
      source: cardsInColumn(0).first().locator(':scope > [data-task-surface-source="true"]'),
      target: columns().nth(1).locator('[data-task-drop-surface-kind="column-drop"]'),
      targetRatio: { x: 0.5, y: 0.98 },
      screenshot: 'desktop-column-body-l2-regression',
    });
    assert(result.indicator.surfaceKind === 'column-drop' && result.indicator.position === 'append',
      'column body must retain column-drop append semantics before child dwell', result.indicator);
    assert(result.indicator.axis === 'horizontal' && result.indicator.rect.width > result.indicator.rect.height * 10,
      'L2 column body append must retain the horizontal insertion line', result.indicator);
    assert(result.after[result.sourceId].parentId === targetColumnId && result.after[result.sourceId].nodeType === 'task',
      'column body release must keep the task at L2', result.after[result.sourceId]);
    const sweep = await visibleErrorSweep('1024 desktop L1/L2 drag');
    return { ...result, sweep };
  });

  await runCase('QA-067-010', 'desktop L1 reorder uses one stable vertical rail controlled only by pointer X', async () => {
    await openApp({ width: 1440, height: 900 });
    assert(await columns().count() >= 2, 'L1 axis verification requires at least two columns');
    const beforeGeometry = await readColumnGeometry();
    const beforeNodes = await readNodes();
    const source = columnHeader(0);
    const sourceId = await source.getAttribute('data-task-id');
    const target = columnHeader(1);
    const targetId = await target.getAttribute('data-task-id');
    const targetPoint = await pointFor(target, 0.82, 0.5);
    const targetColumnBox = await columns().nth(1).boundingBox();
    const adjacentBox = await columns().count() > 2
      ? await columns().nth(2).boundingBox()
      : await rootDrop().boundingBox();
    assert(Boolean(targetColumnBox) && Boolean(adjacentBox), 'L1 boundary neighbors must expose geometry');
    const expectedBoundaryCenter = (targetColumnBox.x + targetColumnBox.width + adjacentBox.x) / 2;

    await beginMouseDrag(source);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
    await page.waitForTimeout(100);
    const firstIndicator = await readDesktopIndicator();
    assert(firstIndicator.surfaceKind === 'column-header'
      && firstIndicator.position === 'after'
      && firstIndicator.axis === 'vertical'
      && firstIndicator.markerCount === 1
      && firstIndicator.dotCount === 0
      && firstIndicator.barCount === 1,
    'L1 reorder must expose one quiet vertical rail without a second dot signal', firstIndicator);
    assert(Math.abs((firstIndicator.rect.left + firstIndicator.rect.width / 2) - expectedBoundaryCenter) <= 1,
      'vertical rail must be centered in the canonical inter-column boundary', {
        firstIndicator,
        expectedBoundaryCenter,
      });
    assert(firstIndicator.rect.width === 6 && firstIndicator.rect.height > 100,
      'vertical rail must use the 6px axis-aware geometry', firstIndicator);

    const boardBox = await page.locator('[data-layout-region="board-canvas"]').boundingBox();
    assert(Boolean(boardBox), 'board canvas must expose geometry during L1 drag');
    await page.mouse.move(targetPoint.x, Math.round(boardBox.y + boardBox.height - 24), { steps: 8 });
    await page.waitForTimeout(100);
    const lowerIndicator = await readDesktopIndicator();
    assert(lowerIndicator.target === firstIndicator.target
      && lowerIndicator.position === firstIndicator.position
      && Math.abs(lowerIndicator.rect.left - firstIndicator.rect.left) <= 1
      && Math.abs(lowerIndicator.rect.top - firstIndicator.rect.top) <= 1
      && Math.abs(lowerIndicator.rect.height - firstIndicator.rect.height) <= 1,
    'moving only on Y must not change the L1 target or rail geometry', { firstIndicator, lowerIndicator });

    const duringGeometry = await readColumnGeometry();
    assert(duringGeometry.scrollWidth === beforeGeometry.scrollWidth,
      'fixed L1 rail must not change board scroll width', { beforeGeometry, duringGeometry });
    assert(duringGeometry.columns.every((column, index) => {
      const before = beforeGeometry.columns[index];
      return before
        && Math.abs(column.left - before.left) <= 1
        && Math.abs(column.top - before.top) <= 1
        && Math.abs(column.width - before.width) <= 1
        && Math.abs(column.height - before.height) <= 1;
    }), 'fixed L1 rail must not shift sibling column geometry', { beforeGeometry, duringGeometry });

    const screenshotPath = `${screenshotBase}-desktop-l1-vertical-axis.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(280);
    const afterNodes = await readNodes();
    const roots = Object.values(afterNodes)
      .filter((node) => !node.isArchived && node.parentId === null && node.boardId === afterNodes[sourceId].boardId)
      .sort((left, right) => left.order - right.order);
    assert(roots.findIndex((node) => node.id === sourceId) > roots.findIndex((node) => node.id === targetId),
      'release order must match the vertical rail shown after the target column', {
        sourceId,
        targetId,
        beforeSource: beforeNodes[sourceId],
        roots,
      });
    return {
      sourceId,
      targetId,
      firstIndicator,
      lowerIndicator,
      beforeGeometry,
      duringGeometry,
      screenshotPath,
    };
  });

  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    } catch (_) {}
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

  const startHeldTouchAtPoint = async (point, holdMs = 650) => {
    const cdp = await page.context().newCDPSession(page);
    let current = { x: point.x, y: point.y };
    let released = false;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);
    return {
      moveTo: async (target) => {
        const start = current;
        for (let step = 1; step <= 8; step += 1) {
          current = {
            x: Math.round(start.x + ((target.x - start.x) * step) / 8),
            y: Math.round(start.y + ((target.y - start.y) * step) / 8),
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(28);
        }
      },
      end: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(300);
      },
    };
  };

  const readMobileIndicator = async () => {
    const indicators = page.locator('[data-mobile-drop-indicator="true"]');
    const indicatorCount = await indicators.count();
    const diagnostics = indicatorCount === 1 ? null : await page.evaluate(() => ({
      actionRailCount: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
      originCount: document.querySelectorAll('[data-mobile-drop-origin="true"]').length,
      activePlaceholders: Array.from(document.querySelectorAll('[data-kanban-drag-source-placeholder="true"]'))
        .map((element) => element.getAttribute('data-task-id')),
      mobileIndicators: Array.from(document.querySelectorAll('[data-mobile-drop-indicator="true"]'))
        .map((element) => ({
          target: element.getAttribute('data-mobile-drop-target'),
          surfaceKind: element.getAttribute('data-mobile-drop-surface-kind'),
        })),
    }));
    assert(indicatorCount === 1, 'mobile must show exactly one live indicator', diagnostics || {});
    return indicators.first().evaluate((element) => ({
      target: element.getAttribute('data-mobile-drop-target'),
      position: element.getAttribute('data-mobile-drop-position'),
      surfaceKind: element.getAttribute('data-mobile-drop-surface-kind'),
      axis: element.getAttribute('data-mobile-drop-axis'),
      markerCount: element.querySelectorAll('[data-kanban-insertion-marker="true"]').length,
      dotCount: element.querySelectorAll('[data-kanban-insertion-dot="true"]').length,
      barCount: element.querySelectorAll('[data-kanban-insertion-bar="true"]').length,
      rect: (() => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })(),
    }));
  };

  await runCase('QA-067-006', 'mobile long-press card promotes to L1 from the title-tail area before child dwell', async () => {
    await openApp({ width: 390, height: 844 });
    const source = cardsInColumn(0).first().locator(':scope > [data-task-surface-source="true"]');
    const sourceId = await source.locator('..').getAttribute('data-task-id');
    const sourcePoint = await visiblePointFor(source);
    const tailGeometry = await readColumnTitleTailGeometry(0, true);
    const targetPoint = tailGeometry.slotPoint;
    const before = await readNodes();
    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveTo(targetPoint);
    await page.waitForTimeout(140);
    const indicator = await readMobileIndicator();
    const screenshotPath = `${screenshotBase}-mobile-card-to-l1-header.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await readNodes();
    const roots = Object.values(after)
      .filter((node) => !node.isArchived && node.parentId === null && node.boardId === after[sourceId].boardId)
      .sort((left, right) => left.order - right.order);
    const sourceIndex = roots.findIndex((node) => node.id === sourceId);
    const targetIndex = roots.findIndex((node) => node.id === indicator.target);
    assert(indicator.surfaceKind === 'column-header'
      && ['before', 'after'].includes(indicator.position)
      && indicator.axis === 'vertical'
      && indicator.markerCount === 1
      && indicator.dotCount === 0
      && indicator.barCount === 1
      && indicator.rect.width === 6
      && indicator.rect.height > 100,
    'mobile column header must show one quiet vertical L1 rail before child dwell', indicator);
    assert(after[sourceId].parentId === null && after[sourceId].nodeType === 'group',
      'mobile header release before child dwell must promote the card to L1', { before: before[sourceId], after: after[sourceId] });
    assert(indicator.position === 'before' ? sourceIndex < targetIndex : sourceIndex > targetIndex,
      'mobile release order must match the exact before/after descriptor shown by the rail', {
        sourceId,
        roots,
        indicator,
      });
    const sweep = await visibleErrorSweep('390 mobile L1 header drag');
    return { sourceId, indicator, screenshotPath, sweep, tailGeometry };
  });

  await runCase('QA-067-007', 'mobile board-end surface appends a task as the final L1', async () => {
    await openApp({ width: 390, height: 844 });
    const board = page.locator('[data-layout-region="board-canvas"]');
    await board.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await page.waitForTimeout(120);
    const lastColumn = columns().last();
    const source = lastColumn.locator('.kanban-task-card[data-task-id]').first();
    const sourceId = await source.getAttribute('data-task-id');
    const sourcePoint = await visiblePointFor(
      source.locator(':scope > [data-task-surface-source="true"]'),
      0.15,
      0.5,
    );
    const targetPoint = await visiblePointFor(rootDrop());
    const before = await readNodes();
    const held = await startHeldTouchAtPoint(sourcePoint);
    const heldState = await page.evaluate(({ sourcePoint, targetPoint }) => ({
      sourcePoint,
      targetPoint,
      sourceAtPoint: document.elementFromPoint(sourcePoint.x, sourcePoint.y)?.closest('[data-task-id]')?.getAttribute('data-task-id'),
      actionRailCount: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
      placeholderCount: document.querySelectorAll('[data-kanban-drag-source-placeholder="true"]').length,
    }), { sourcePoint, targetPoint });
    assert(heldState.actionRailCount === 1, 'mobile root-append source must arm before moving', heldState);
    await held.moveTo(targetPoint);
    await page.waitForTimeout(140);
    const indicator = await readMobileIndicator();
    const screenshotPath = `${screenshotBase}-mobile-root-append.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await readNodes();
    const sourceAfter = after[sourceId];
    const roots = Object.values(after).filter((node) => !node.isArchived && node.boardId === sourceAfter.boardId && node.parentId === null);
    assert(indicator.surfaceKind === 'root-drop'
      && indicator.position === 'after'
      && indicator.axis === 'vertical'
      && indicator.markerCount === 1
      && indicator.dotCount === 0
      && indicator.barCount === 1
      && indicator.rect.width === 6
      && indicator.rect.height > 100,
    'mobile board-end surface must expose one vertical root-drop rail', indicator);
    assert(sourceAfter.nodeType === 'group' && sourceAfter.order === Math.max(...roots.map((node) => node.order)),
      'mobile root-drop release must append the source as the final L1', { sourceAfter, roots });
    assert(Object.keys(before).length === Object.keys(after).length,
      'mobile root-drop release must not trigger the add-list button');
    const sweep = await visibleErrorSweep('390 mobile root append drag');
    return { sourceId, indicator, screenshotPath, sweep };
  });

  await runCase('QA-067-008', 'touch L1 reorder keeps one X-axis target while the finger moves vertically', async () => {
    await openApp({ width: 1024, height: 768 });
    assert(await columns().count() >= 2, 'touch L1 axis verification requires at least two columns');
    const before = await readNodes();
    const sourceId = await columnHeader(0).getAttribute('data-task-id');
    const targetId = await columnHeader(1).getAttribute('data-task-id');
    const sourcePoint = await visiblePointFor(columnHeader(0), 0.2, 0.5);
    const targetPoint = await visiblePointFor(columnHeader(1), 0.82, 0.5);
    const targetColumnBox = await columns().nth(1).boundingBox();
    assert(sourceId && targetId && targetColumnBox, 'touch L1 sample must expose source/target geometry');

    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveTo(targetPoint);
    await page.waitForTimeout(100);
    const firstIndicator = await readMobileIndicator();
    const lowerPoint = {
      x: targetPoint.x,
      y: Math.round(Math.min(740, targetColumnBox.y + targetColumnBox.height - 24)),
    };
    await held.moveTo(lowerPoint);
    await page.waitForTimeout(100);
    const lowerIndicator = await readMobileIndicator();
    assert(firstIndicator.axis === 'vertical'
      && firstIndicator.surfaceKind === 'column-header'
      && firstIndicator.target === targetId
      && firstIndicator.position === 'after'
      && firstIndicator.dotCount === 0
      && firstIndicator.barCount === 1,
    'touch L1 reorder must resolve by horizontal column midpoint and use a vertical rail', firstIndicator);
    assert(lowerIndicator.target === firstIndicator.target
      && lowerIndicator.position === firstIndicator.position
      && lowerIndicator.axis === firstIndicator.axis
      && Math.abs(lowerIndicator.rect.left - firstIndicator.rect.left) <= 1
      && Math.abs(lowerIndicator.rect.top - firstIndicator.rect.top) <= 1
      && Math.abs(lowerIndicator.rect.height - firstIndicator.rect.height) <= 1,
    'moving only on Y must not change the touch L1 boundary or rail geometry', {
      firstIndicator,
      lowerIndicator,
      targetPoint,
      lowerPoint,
    });
    const screenshotPath = `${screenshotBase}-mobile-l1-x-axis-vertical-rail.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await readNodes();
    const roots = Object.values(after)
      .filter((node) => !node.isArchived && node.parentId === null && node.boardId === after[sourceId].boardId)
      .sort((left, right) => left.order - right.order);
    assert(roots.findIndex((node) => node.id === sourceId) > roots.findIndex((node) => node.id === targetId),
      'touch L1 release must commit the same after-target descriptor shown by the rail', {
        beforeSource: before[sourceId],
        roots,
      });
    return { sourceId, targetId, firstIndicator, lowerIndicator, screenshotPath };
  });

  await runCase('QA-067-009', '1440/1024/390 rendered surfaces remain stable and error-free', async () => {
    const evidence = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await openApp(viewport);
      const rootZone = rootDrop();
      assert(await rootZone.count() === 1, 'board must expose one root append zone', viewport);
      const screenshotPath = `${screenshotBase}-viewport-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      evidence.push({ viewport, screenshotPath, sweep: await visibleErrorSweep(`${viewport.width}x${viewport.height}`) });
    }
    return evidence;
  });

  const unexpectedDiagnostics = diagnostics.filter((message) => !/favicon|ResizeObserver/i.test(message));
  const unexpectedNetworkFailures = networkFailures.filter((message) => !/favicon/i.test(message));
  results.push({
    id: 'QA-067-011',
    scenario: 'console and network error sweep',
    result: unexpectedDiagnostics.length || unexpectedNetworkFailures.length ? 'FAIL' : 'PASS',
    details: { unexpectedDiagnostics, unexpectedNetworkFailures },
  });

  const failed = results.filter((result) => result.result !== 'PASS');
  const summary = {
    ok: failed.length === 0,
    summary: { pass: results.length - failed.length, fail: failed.length },
    route: `${appBaseUrl}/?qcReset=1&qcSize=72`,
    viewports: ['1440x900', '1024x768', '390x844'],
    results,
    diagnostics: diagnostics.slice(-30),
    networkFailures: networkFailures.slice(-30),
  };
  await page.evaluate((payload) => {
    localStorage.setItem('dev067-kanban-l1-drag-result', JSON.stringify(payload));
  }, summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) throw new Error(`DEV-067 browser verification failed: ${JSON.stringify(failed)}`);
  return summary;
}
