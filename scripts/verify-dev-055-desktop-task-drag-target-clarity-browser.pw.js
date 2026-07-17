/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-055-desktop-drag-${Date.now()}`;
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
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([{
        id: 'dev055-inbox',
        title: 'DEV-055 未歸位驗證',
        note: 'DEV-055 未歸位驗證',
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

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.mouse.up().catch(() => undefined);
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=72', { waitUntil: 'domcontentloaded' });
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

  const pointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'desktop drag target should have a visible bounding box');
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      localX: Math.max(4, Math.round(box.width * ratioX)),
      localY: Math.max(4, Math.round(box.height * ratioY)),
      box,
    };
  };

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
      const bodyText = document.body.innerText;
      return {
        route: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        alerts,
        visibleHttpError: /HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    assert(state.alerts.length === 0, `${label} should not expose visible alerts`, state);
    assert(!state.visibleHttpError, `${label} should not expose HTTP/API errors`, state);
    assert(!state.horizontalOverflow, `${label} should not overflow horizontally`, state);
    return state;
  };

  const readIndicator = async () => {
    const indicators = page.locator('[data-desktop-drop-indicator="true"]');
    const count = await indicators.count();
    const debugTrace = count === 1 ? [] : await page.evaluate(() =>
      (window.__projedDesktopTaskDragDebug || []).slice(-20));
    assert(count === 1, 'desktop drag must expose exactly one live target indicator', { count, debugTrace });
    const indicator = indicators.first();
    const state = await indicator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        targetNodeId: element.getAttribute('data-desktop-drop-target'),
        position: element.getAttribute('data-desktop-drop-position'),
        surfaceKind: element.getAttribute('data-desktop-drop-surface-kind'),
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    assert(state.targetNodeId && state.position && state.surfaceKind, 'indicator must expose a complete canonical descriptor', state);
    assert(state.rect.left >= -1 && state.rect.right <= state.viewport.width + 1 && state.rect.width >= 24,
      'indicator must stay inside the desktop viewport with a stable width', state);
    const sourceMarkerCount = await page.locator(
      '[data-kanban-drag-source-placeholder="true"] [data-kanban-insertion-marker="true"]',
    ).count();
    assert(sourceMarkerCount === 0, 'source placeholder must not look like a live target', { sourceMarkerCount });
    const markerState = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return Array.from(document.querySelectorAll('[data-kanban-insertion-marker="true"]'))
        .filter(visible)
        .map((element) => ({
          insideDesktopIndicator: Boolean(element.closest('[data-desktop-drop-indicator="true"]')),
          insideSourcePlaceholder: Boolean(element.closest('[data-kanban-drag-source-placeholder="true"]')),
          rect: (() => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })(),
        }));
    });
    assert(markerState.length === 1 && markerState[0].insideDesktopIndicator && !markerState[0].insideSourcePlaceholder,
      'desktop drag must render exactly one visible insertion marker and it must be the fixed overlay', { markerState });
    return state;
  };

  const beginMouseDrag = async (source, sourceRatio = { x: 0.55, y: 0.35 }) => {
    const sourceId = await source.getAttribute('data-task-id');
    const point = await pointFor(source, sourceRatio.x, sourceRatio.y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 14, point.y + 3, { steps: 4 });
    await page.locator('[data-kanban-drag-overlay="true"]').first().waitFor({ state: 'visible', timeout: 5000 });
    return { sourceId, point };
  };

  const moveDragTo = async (target, ratio = { x: 0.55, y: 0.5 }) => {
    const targetPoint = await pointFor(target, ratio.x, ratio.y);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
    await page.waitForTimeout(140);
    return { targetPoint, indicator: await readIndicator() };
  };

  const expectedParentForIndicator = (indicator, targetNode) => {
    if (indicator.surfaceKind === 'kanban-card' || indicator.surfaceKind === 'checklist-row') {
      return targetNode.parentId || null;
    }
    return targetNode.id;
  };

  const assertCommittedAsDisplayed = ({ sourceId, beforeNodes, afterNodes, indicator }) => {
    const sourceAfter = afterNodes[sourceId];
    const targetBefore = beforeNodes[indicator.targetNodeId];
    const targetAfter = afterNodes[indicator.targetNodeId];
    assert(sourceAfter && targetBefore && targetAfter, 'source and target nodes must exist after the drop', {
      sourceId,
      targetNodeId: indicator.targetNodeId,
    });
    const expectedParentId = expectedParentForIndicator(indicator, targetBefore);
    assert((sourceAfter.parentId || null) === expectedParentId, 'committed parent must equal the displayed target', {
      indicator,
      expectedParentId,
      sourceAfter,
    });
    if (indicator.position === 'before') {
      assert(sourceAfter.order < targetAfter.order, 'before indicator must commit before the target', { indicator, sourceAfter, targetAfter });
    } else if (indicator.position === 'after') {
      assert(sourceAfter.order > targetAfter.order, 'after indicator must commit after the target', { indicator, sourceAfter, targetAfter });
    } else {
      const siblingOrders = Object.values(afterNodes)
        .filter((node) => node && !node.isArchived && (node.parentId || null) === expectedParentId)
        .map((node) => node.order);
      assert(sourceAfter.order === Math.max(...siblingOrders), 'append indicator must commit at the end of the target parent', {
        indicator,
        sourceAfter,
        siblingOrders,
      });
    }
  };

  const dragAndCommit = async ({ source, target, targetRatio, screenshotSuffix }) => {
    const beforeNodes = await readNodes();
    const { sourceId } = await beginMouseDrag(source);
    const { indicator } = await moveDragTo(target, targetRatio);
    const screenshotPath = screenshotSuffix ? `${screenshotBase}-${screenshotSuffix}.png` : null;
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(260);
    const afterNodes = await readNodes();
    assertCommittedAsDisplayed({ sourceId, beforeNodes, afterNodes, indicator });
    assert(await page.locator('[data-desktop-drop-indicator="true"]').count() === 0, 'indicator must clear after commit');
    return { sourceId, indicator, screenshotPath, beforeNodes, afterNodes };
  };

  const columns = () => page.locator('[data-kanban-column="true"]');
  const cardsInColumn = (index) => columns().nth(index).locator('.kanban-task-card[data-task-id]');
  const cardsWithChildren = () => page.locator('.kanban-task-card[data-task-id]:has(.kanban-checklist-item[data-task-id])');
  const taskById = (id) => page.locator(`[data-task-id="${id}"]`).first();
  const readChecklistRowLayout = async (card) => card.locator('.kanban-checklist-item[data-task-id]').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const parentStyle = element.parentElement ? getComputedStyle(element.parentElement) : null;
      return {
        id: element.getAttribute('data-task-id'),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        parentTransform: parentStyle?.transform || 'none',
      };
    }));

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
      await page.mouse.up().catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  };

  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(20000);

  await runCase('QA-055-B01', 'same-column card before and after indicators equal final order', async () => {
    await openApp();
    const first = cardsInColumn(0).nth(0);
    const second = cardsInColumn(0).nth(1);
    const moveAfter = await dragAndCommit({
      source: first,
      target: second.locator('[data-task-card-primary="true"]'),
      screenshotSuffix: 'B01-card-after',
    });
    const moveBefore = await dragAndCommit({
      source: taskById(moveAfter.sourceId),
      target: page.locator(`.kanban-task-card[data-task-id="${moveAfter.indicator.targetNodeId}"] [data-task-card-primary="true"]`).first(),
      screenshotSuffix: 'B01-card-before',
    });
    assert(moveAfter.indicator.position === 'after' && moveBefore.indicator.position === 'before',
      'same-column round trip must exercise after and before', { moveAfter: moveAfter.indicator, moveBefore: moveBefore.indicator });
    return { indicators: [moveAfter.indicator, moveBefore.indicator], screenshots: [moveAfter.screenshotPath, moveBefore.screenshotPath] };
  });

  await runCase('QA-055-B02', 'card cross-column move commits to the displayed column and order', async () => {
    await openApp();
    const result = await dragAndCommit({
      source: cardsInColumn(0).nth(0),
      target: cardsInColumn(1).nth(0).locator('[data-task-card-primary="true"]'),
      screenshotSuffix: 'B02-card-cross-column',
    });
    return { indicator: result.indicator, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B03', 'column drop append indicator equals the committed column parent', async () => {
    await openApp();
    const targetColumn = columns().nth(1);
    const result = await dragAndCommit({
      source: cardsInColumn(0).nth(0),
      target: targetColumn.locator('[data-kanban-add-task-button="true"]'),
      screenshotSuffix: 'B03-column-append',
    });
    assert(result.indicator.surfaceKind === 'column-drop' && result.indicator.position === 'append',
      'column body must own an append target', result.indicator);
    return { indicator: result.indicator, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B04', 'checklist rows reorder within one parent with one live indicator', async () => {
    await openApp();
    const card = cardsWithChildren().first();
    const rows = card.locator('.kanban-checklist-item[data-task-id]');
    assert(await rows.count() >= 2, 'fixture must expose two checklist rows in one card');
    const result = await dragAndCommit({ source: rows.nth(0), target: rows.nth(1), screenshotSuffix: 'B04-checklist-same-parent' });
    assert(result.indicator.surfaceKind === 'checklist-row', 'checklist row must own checklist reorder', result.indicator);
    return { indicator: result.indicator, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B05', 'checklist cross-parent move is owned by the target card', async () => {
    await openApp();
    const sourceCard = cardsWithChildren().nth(0);
    const targetCard = cardsWithChildren().nth(1);
    const result = await dragAndCommit({
      source: sourceCard.locator('.kanban-checklist-item[data-task-id]').first(),
      target: targetCard.locator('[data-task-card-primary="true"]'),
      screenshotSuffix: 'B05-checklist-cross-parent',
    });
    assert(result.indicator.surfaceKind === 'checklist-drop' && result.indicator.position === 'append',
      'checklist over a card primary must append to that card', result.indicator);
    return { indicator: result.indicator, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B06', 'card append into an expanded checklist uses the explicit child lane', async () => {
    await openApp();
    const targetCard = cardsWithChildren().nth(1);
    const result = await dragAndCommit({
      source: cardsInColumn(0).nth(0),
      target: targetCard.locator('.kanban-checklist-toggle'),
      targetRatio: { x: 0.85, y: 0.5 },
      screenshotSuffix: 'B06-card-checklist-append',
    });
    assert(result.indicator.surfaceKind === 'checklist-drop' && result.indicator.position === 'append',
      'explicit checklist lane must expose append intent', result.indicator);
    return { indicator: result.indicator, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B07', 'expanded card child row owns the pointer and invalid source blocks ancestor fallback', async () => {
    await openApp();
    const sourceCard = cardsWithChildren().nth(0);
    const targetCard = cardsWithChildren().nth(1);
    const source = sourceCard.locator('.kanban-checklist-item[data-task-id]').first();
    const targetRow = targetCard.locator('.kanban-checklist-item[data-task-id]').first();
    const beforeNodes = await readNodes();
    const { sourceId, point: sourcePoint } = await beginMouseDrag(source);
    const parentState = await moveDragTo(targetCard.locator('[data-task-card-primary="true"]'));
    const childState = await moveDragTo(targetRow);
    assert(parentState.indicator.targetNodeId !== childState.indicator.targetNodeId
      && childState.indicator.surfaceKind === 'checklist-row',
    'child row must replace parent ownership when the pointer enters it', { parentState, childState });
    const screenshotPath = `${screenshotBase}-B07-expanded-child-ownership.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.move(sourcePoint.x, sourcePoint.y, { steps: 10 });
    await page.waitForTimeout(140);
    const invalidIndicatorCount = await page.locator('[data-desktop-drop-indicator="true"]').count();
    assert(invalidIndicatorCount === 0, 'invalid source row must clear the indicator instead of falling through to its card', { invalidIndicatorCount });
    await page.mouse.up();
    await page.waitForTimeout(220);
    const afterInvalidNodes = await readNodes();
    assert(JSON.stringify(beforeNodes) === JSON.stringify(afterInvalidNodes), 'invalid source-row release must be a zero-write no-op', { sourceId });
    return {
      parentIndicator: parentState.indicator,
      childIndicator: childState.indicator,
      invalidIndicatorCount,
      screenshotPath,
    };
  });

  await runCase('QA-055-B08', '1024x768 same-column and cross-column drags stay unclipped', async () => {
    await openApp({ width: 1024, height: 768 });
    const same = await dragAndCommit({
      source: cardsInColumn(0).nth(0),
      target: cardsInColumn(0).nth(1).locator('[data-task-card-primary="true"]'),
      screenshotSuffix: 'B08-1024-same-column',
    });
    const cross = await dragAndCommit({
      source: taskById(same.sourceId),
      target: cardsInColumn(1).nth(0).locator('[data-task-card-primary="true"]'),
      screenshotSuffix: 'B08-1024-cross-column',
    });
    const sweep = await visibleErrorSweep('1024x768 desktop drag');
    return { indicators: [same.indicator, cross.indicator], screenshots: [same.screenshotPath, cross.screenshotPath], sweep };
  });

  await runCase('QA-055-B09', 'movement below the 8px threshold remains a click and causes no move', async () => {
    await openApp();
    const card = cardsInColumn(0).first();
    const beforeNodes = await readNodes();
    const point = await pointFor(card, 0.55, 0.35);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 4, point.y + 1, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const afterNodes = await readNodes();
    assert(JSON.stringify(beforeNodes) === JSON.stringify(afterNodes), 'sub-threshold mouse movement must not write nodes');
    assert(await page.locator('[data-kanban-drag-overlay="true"],[data-desktop-drop-indicator="true"]').count() === 0,
      'sub-threshold movement must not start desktop drag UI');
    const modal = page.locator('[data-task-details-modal="true"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    return { modalTaskId: await modal.getAttribute('data-task-id') };
  });

  await runCase('QA-055-B10', 'right-click task surfaces open context menu without drag UI', async () => {
    await openApp();
    const targets = [
      cardsInColumn(0).first(),
      cardsWithChildren().first().locator('.kanban-checklist-item[data-task-id]').first(),
      columns().first().locator('[data-kanban-column-header="true"]'),
    ];
    const taskIds = [];
    for (const target of targets) {
      const point = await pointFor(target, 0.55, 0.35);
      taskIds.push(await target.getAttribute('data-task-id'));
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByText('更多詳情選項', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
      assert(await page.locator('[data-kanban-drag-overlay="true"],[data-desktop-drop-indicator="true"]').count() === 0,
        'right-click must not start drag UI');
      await page.keyboard.press('Escape');
    }
    const screenshotPath = `${screenshotBase}-B10-context-menu.png`;
    const point = await pointFor(targets[0]);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { taskIds, screenshotPath };
  });

  await runCase('QA-055-B11', 'blank canvas mouse pan does not create a task indicator', async () => {
    await openApp();
    const workbenchEntry = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    await workbenchEntry.click();
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 5000 });
    const canvas = page.locator('[data-kanban-mouse-pan-surface="true"]');
    const beforeNodes = await readNodes();
    await canvas.evaluate((element) => { element.scrollLeft = Math.min(180, element.scrollWidth - element.clientWidth); });
    const beforeScrollLeft = await canvas.evaluate((element) => element.scrollLeft);
    const box = await canvas.boundingBox();
    assert(Boolean(box), 'board canvas must have a bounding box');
    const start = { x: Math.round(box.x + box.width - 24), y: Math.round(box.y + box.height - 48) };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y, { steps: 10 });
    const activePanState = await canvas.getAttribute('data-kanban-mouse-pan-state');
    await page.mouse.up();
    const afterScrollLeft = await canvas.evaluate((element) => element.scrollLeft);
    const afterNodes = await readNodes();
    assert(activePanState === 'active' && afterScrollLeft < beforeScrollLeft,
      'blank canvas drag must pan horizontally', { activePanState, beforeScrollLeft, afterScrollLeft });
    assert(JSON.stringify(beforeNodes) === JSON.stringify(afterNodes), 'canvas pan must not write task nodes');
    assert(await page.locator('[data-desktop-drop-indicator="true"]').count() === 0, 'canvas pan must not show task indicator');
    return { activePanState, beforeScrollLeft, afterScrollLeft };
  });

  await runCase('QA-055-B12', 'workbench unplaced row can place once and placed row remains non-draggable', async () => {
    await openApp();
    const panel = page.locator('[data-task-workbench-panel="true"]').first();
    if (!await panel.isVisible().catch(() => false)) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').first().click();
      await panel.waitFor({ state: 'visible', timeout: 5000 });
    }
    const unplaced = panel.locator('[data-task-workbench-unplaced-task-card="true"][data-task-workbench-drag-surface]').first();
    await unplaced.waitFor({ state: 'visible', timeout: 5000 });
    const placed = await dragAndCommit({
      source: unplaced,
      target: columns().first().locator('[data-kanban-add-task-button="true"]'),
      screenshotSuffix: 'B12-workbench-placement',
    });
    const placedRow = panel.locator(`[data-task-workbench-placed-task-card="true"][data-task-id="${placed.sourceId}"]`).first();
    await placedRow.waitFor({ state: 'visible', timeout: 5000 });
    assert(await placedRow.getAttribute('data-task-workbench-drag-surface') === null,
      'placed workbench row must not expose a drag source');
    const beforeNodes = await readNodes();
    const point = await pointFor(placedRow);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 30, point.y + 6, { steps: 6 });
    await page.mouse.up();
    assert(await page.locator('[data-kanban-drag-overlay="true"],[data-desktop-drop-indicator="true"]').count() === 0,
      'placed workbench row must not start a desktop drag session');
    assert(JSON.stringify(beforeNodes) === JSON.stringify(await readNodes()), 'placed workbench row drag attempt must be a no-op');
    return { sourceId: placed.sourceId, indicator: placed.indicator, screenshotPath: placed.screenshotPath };
  });

  await runCase('QA-055-B13', 'one undo restores one cross-hierarchy move', async () => {
    await openApp();
    const source = cardsWithChildren().nth(0).locator('.kanban-checklist-item[data-task-id]').first();
    const target = cardsWithChildren().nth(1).locator('[data-task-card-primary="true"]');
    const beforeNodes = await readNodes();
    const result = await dragAndCommit({ source, target, screenshotSuffix: 'B13-before-undo' });
    await page.waitForFunction(() => !document.querySelector('#btn-undo')?.hasAttribute('disabled'), null, { timeout: 5000 });
    const undoTitle = await page.locator('#btn-undo').getAttribute('title');
    await page.locator('#btn-undo').click();
    await page.waitForTimeout(220);
    const afterUndoNodes = await readNodes();
    const beforeSource = beforeNodes[result.sourceId];
    const restored = afterUndoNodes[result.sourceId];
    assert(restored.parentId === beforeSource.parentId && restored.order === beforeSource.order,
      'one undo must restore the moved task parent and order', { beforeSource, restored, undoTitle });
    return { sourceId: result.sourceId, undoTitle, beforeSource, restored, screenshotPath: result.screenshotPath };
  });

  await runCase('QA-055-B14', 'ten mixed card and checklist mouse drags produce zero wrong commits', async () => {
    await openApp();
    const traces = [];
    const firstCardId = await cardsInColumn(0).nth(0).getAttribute('data-task-id');
    const leftTargetId = await cardsInColumn(0).nth(1).getAttribute('data-task-id');
    const rightTargetId = await cardsInColumn(1).nth(0).getAttribute('data-task-id');
    for (let index = 0; index < 5; index += 1) {
      const targetId = index % 2 === 0 ? rightTargetId : leftTargetId;
      const targetCard = page.locator(`.kanban-task-card[data-task-id="${targetId}"]`).first();
      const trace = await dragAndCommit({
        source: taskById(firstCardId),
        target: targetCard.locator('[data-task-card-primary="true"]'),
      });
      traces.push({ index, kind: 'card', indicator: trace.indicator });
    }
    const sourceChecklistId = await cardsWithChildren().nth(0).locator('.kanban-checklist-item[data-task-id]').first().getAttribute('data-task-id');
    const targetCardIds = [
      await cardsWithChildren().nth(1).getAttribute('data-task-id'),
      await cardsWithChildren().nth(2).getAttribute('data-task-id'),
    ];
    for (let index = 0; index < 5; index += 1) {
      const targetId = targetCardIds[index % 2];
      const targetCard = page.locator(`.kanban-task-card[data-task-id="${targetId}"]`).first();
      const trace = await dragAndCommit({ source: taskById(sourceChecklistId), target: targetCard.locator('[data-task-card-primary="true"]') });
      traces.push({ index: index + 5, kind: 'checklist', indicator: trace.indicator });
    }
    const screenshotPath = `${screenshotBase}-B14-ten-mixed-drags.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    assert(traces.length === 10, 'aggregated trace must contain ten committed drags', { traces });
    return { wrongCommit: 0, traces, screenshotPath, sweep: await visibleErrorSweep('ten mixed desktop drags') };
  });

  await runCase('QA-055-B15', 'L3+ checklist target indicator is stable and does not push sibling rows', async () => {
    await openApp();
    const sourceCard = cardsWithChildren().nth(0);
    const targetCard = cardsWithChildren().nth(1);
    const source = sourceCard.locator('.kanban-checklist-item[data-task-id]').first();
    const targetRows = targetCard.locator('.kanban-checklist-item[data-task-id]');
    assert(await targetRows.count() >= 2, 'fixture must expose at least two L3+ rows in the target card');
    await targetCard.scrollIntoViewIfNeeded();
    const beforeLayout = await readChecklistRowLayout(targetCard);
    const { sourceId } = await beginMouseDrag(source);
    const targetPoint = await pointFor(targetRows.first(), 0.55, 0.35);
    const indicatorStates = [];
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
    await page.waitForTimeout(140);
    indicatorStates.push(await readIndicator());
    await page.mouse.move(targetPoint.x + 2, targetPoint.y + 1, { steps: 2 });
    await page.waitForTimeout(80);
    indicatorStates.push(await readIndicator());
    await page.mouse.move(targetPoint.x - 2, targetPoint.y + 1, { steps: 2 });
    await page.waitForTimeout(80);
    indicatorStates.push(await readIndicator());
    const afterLayout = await readChecklistRowLayout(targetCard);
    const afterById = Object.fromEntries(afterLayout.map((row) => [row.id, row]));
    const rowDeltas = beforeLayout
      .filter((row) => afterById[row.id])
      .map((row) => ({
        id: row.id,
        topDelta: Math.abs(afterById[row.id].top - row.top),
        bottomDelta: Math.abs(afterById[row.id].bottom - row.bottom),
        parentTransform: afterById[row.id].parentTransform,
      }));
    const topValues = indicatorStates.map((state) => state.rect.top);
    const leftValues = indicatorStates.map((state) => state.rect.left);
    const widthValues = indicatorStates.map((state) => state.rect.width);
    const stableDescriptor = indicatorStates.every((state) =>
      state.targetNodeId === indicatorStates[0].targetNodeId
      && state.position === indicatorStates[0].position
      && state.surfaceKind === indicatorStates[0].surfaceKind);
    const maxIndicatorTopDelta = Math.max(...topValues) - Math.min(...topValues);
    const maxIndicatorLeftDelta = Math.max(...leftValues) - Math.min(...leftValues);
    const maxIndicatorWidthDelta = Math.max(...widthValues) - Math.min(...widthValues);
    const shiftedRows = rowDeltas.filter((row) => row.topDelta > 1.25 || row.bottomDelta > 1.25);
    const transformedRows = rowDeltas.filter((row) => row.parentTransform && row.parentTransform !== 'none');
    const screenshotPath = `${screenshotBase}-B15-l3-stable-overlay.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(220);
    assert(stableDescriptor, 'same L3+ target must keep the same canonical indicator descriptor', { indicatorStates });
    assert(maxIndicatorTopDelta <= 1 && maxIndicatorLeftDelta <= 1 && maxIndicatorWidthDelta <= 1,
      'same L3+ target indicator must not drift while the pointer stays in the same cell', {
        indicatorStates,
        maxIndicatorTopDelta,
        maxIndicatorLeftDelta,
        maxIndicatorWidthDelta,
      });
    assert(shiftedRows.length === 0, 'L3+ sibling rows must not be pushed by the desktop drop indicator', { sourceId, rowDeltas });
    assert(transformedRows.length === 0, 'L3+ sibling rows must not receive sortable displacement transforms during desktop task drag', {
      transformedRows,
      rowDeltas,
    });
    return {
      sourceId,
      indicatorStates,
      rowDeltas,
      screenshotPath,
    };
  });

  const unexpectedDiagnostics = diagnostics.filter((message) => !/favicon|ResizeObserver/i.test(message));
  const unexpectedNetworkFailures = networkFailures.filter((message) => !/favicon/i.test(message));
  results.push({
    id: 'QA-055-B16',
    scenario: 'visible, console, and network error sweep',
    result: unexpectedDiagnostics.length || unexpectedNetworkFailures.length ? 'FAIL' : 'PASS',
    startedAt: new Date().toISOString(),
    details: { unexpectedDiagnostics, unexpectedNetworkFailures },
  });

  const failCount = results.filter((result) => result.result !== 'PASS').length;
  const summary = {
    ok: failCount === 0,
    summary: { pass: results.length - failCount, fail: failCount },
    route: 'http://127.0.0.1:4173/?qcReset=1&qcSize=72',
    viewports: ['1440x900', '1024x768'],
    results,
    diagnostics: diagnostics.slice(-30),
    networkFailures: networkFailures.slice(-30),
  };
  await page.evaluate((payload) => {
    localStorage.setItem('dev055-desktop-task-drag-target-clarity-result', JSON.stringify(payload));
  }, summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));
  if (failCount) {
    throw new Error(`DEV-055 browser verification failed: ${JSON.stringify(results.filter((result) => result.result !== 'PASS'))}`);
  }
  return summary;
}
