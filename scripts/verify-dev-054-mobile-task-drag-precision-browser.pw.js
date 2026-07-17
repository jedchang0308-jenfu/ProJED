/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-054-mobile-drag-${Date.now()}`;
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

  const openApp = async (viewport = { width: 390, height: 844 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=72', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    const sidebar = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    if (await sidebar.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  };

  const pointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'touch target should have a visible bounding box');
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      box,
    };
  };

  const visiblePointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    assert(Boolean(box), 'touch target should already be visible without scrolling');
    assert(viewport && box.y >= 0 && box.y + box.height <= viewport.height, 'touch target must fit the current viewport', { box, viewport });
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      box,
    };
  };

  const nativeTouch = async (locator, holdMs = 0) => {
    const point = await pointFor(locator);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
      });
      if (holdMs) await page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach().catch(() => undefined);
    }
    await page.waitForTimeout(220);
    return point;
  };

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
      origin: point,
      moveTo: async (target) => {
        const start = current;
        for (let step = 1; step <= 6; step += 1) {
          current = {
            x: Math.round(start.x + ((target.x - start.x) * step) / 6),
            y: Math.round(start.y + ((target.y - start.y) * step) / 6),
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(24);
        }
      },
      moveExact: async (target, delayMs = 24) => {
        current = { x: Math.round(target.x), y: Math.round(target.y) };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        });
        await page.waitForTimeout(delayMs);
      },
      end: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(240);
      },
    };
  };

  const startHeldTouch = async (locator, holdMs = 650) =>
    startHeldTouchAtPoint(await pointFor(locator, 0.48, 0.45), holdMs);

  const readNode = async (nodeId) => page.evaluate((id) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[id] || null;
  }, nodeId);

  const runCase = async (id, scenario, operation) => {
    try {
      const details = await operation();
      results.push({ id, scenario, result: 'PASS', details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}-FAIL.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', error: error.message, screenshotPath });
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  };

  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(20000);

  await runCase('QA-054-R01', 'normal mobile topbar buttons accept native touch clicks', async () => {
    await openApp();
    const menuButton = page.getByRole('button', { name: '展開工作區選單' }).first();
    await nativeTouch(menuButton);
    const sidebar = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    await sidebar.waitFor({ state: 'visible', timeout: 5000 });
    await page.keyboard.press('Escape');
    await sidebar.waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);

    const workbenchButton = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    await nativeTouch(workbenchButton);
    const panel = page.locator('[data-task-workbench-panel="true"]').first();
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    const screenshotPath = `${screenshotBase}-B01-native-topbar-touch.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { menuOpened: true, workbenchOpened: true, screenshotPath };
  });

  await runCase('QA-054-R02', 'long press release arms the action rail and native touch commits exactly once', async () => {
    await openApp();
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    const nodeId = await card.getAttribute('data-task-id');
    const before = await readNode(nodeId);
    const held = await startHeldTouch(card.locator('[data-mobile-task-card-primary="true"]'));
    const rail = page.locator('[data-mobile-task-action-rail="true"]').first();
    await rail.waitFor({ state: 'visible', timeout: 5000 });
    await held.end();
    await page.waitForFunction(() => document.querySelector('[data-mobile-task-action-rail="true"]')?.getAttribute('data-mobile-task-action-rail-mode') === 'armed');
    assert(await page.locator('[data-mobile-drag-preview="true"]').count() === 0, 'armed rail must not leave a finger-following preview');

    const action = page.locator('[data-mobile-task-action="toggle-complete"]').first();
    await nativeTouch(action);
    await rail.waitFor({ state: 'detached', timeout: 5000 });
    const after = await readNode(nodeId);
    const debug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
    const completions = debug.filter((entry) => entry.type === 'terminal:complete' && entry.nodeId === nodeId);
    assert(before && after && before.status !== after.status, 'native touch action must toggle task completion', { nodeId, before, after });
    assert(completions.length === 1, 'action rail click must terminate the session exactly once', { nodeId, completions });
    const screenshotPath = `${screenshotBase}-B02-armed-action-touch.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { nodeId, beforeStatus: before.status, afterStatus: after.status, completions: completions.length, screenshotPath };
  });

  await runCase('QA-054-R03', 'finger-centered point selects canonical same-parent order while preview remains finger-coupled', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id]').first();
    const target = page.locator('.kanban-task-card[data-task-id]').nth(1);
    const sourceSurface = source.locator('[data-mobile-task-card-primary="true"]');
    const targetSurface = target.locator('[data-mobile-task-card-primary="true"]');
    const sourceId = await source.getAttribute('data-task-id');
    const targetId = await target.getAttribute('data-task-id');
    const beforeSource = await readNode(sourceId);
    const beforeTarget = await readNode(targetId);
    assert(beforeSource?.parentId === beforeTarget?.parentId && beforeSource?.order < beforeTarget?.order,
      'fixture must start with source before target under the same parent', { beforeSource, beforeTarget });

    const held = await startHeldTouch(sourceSurface);
    const targetPoint = await pointFor(targetSurface, 0.5, 0.5);
    const rawPoint = { x: targetPoint.x, y: targetPoint.y };
    await held.moveTo(rawPoint);
    const indicator = page.locator('[data-mobile-drop-indicator="true"]').first();
    await indicator.waitFor({ state: 'visible', timeout: 5000 });
    const geometry = await page.evaluate(({ rawY }) => {
      const preview = document.querySelector('[data-mobile-drag-preview="true"]');
      const indicator = document.querySelector('[data-mobile-drop-indicator="true"]');
      const previewRect = preview.getBoundingClientRect();
      return {
        previewBottom: previewRect.bottom,
        fingerClearance: rawY - previewRect.bottom,
        previewAnchor: preview.getAttribute('data-mobile-preview-anchor'),
        previewZ: Number(getComputedStyle(preview).zIndex),
        indicatorZ: Number(getComputedStyle(indicator).zIndex),
        targetId: indicator.getAttribute('data-mobile-drop-target'),
        dropPosition: indicator.getAttribute('data-mobile-drop-position'),
      };
    }, { rawY: rawPoint.y });
    assert(geometry.targetId === targetId && geometry.dropPosition === 'after', 'mobile target must use canonical desktop same-parent moving-down intent', { sourceId, targetId, geometry });
    assert(geometry.previewAnchor === 'finger'
      && Math.abs(geometry.fingerClearance - 12) <= 1
      && geometry.indicatorZ > geometry.previewZ,
    'a valid target must not pull the preview away from the finger', geometry);
    await held.end();
    const afterSource = await readNode(sourceId);
    const afterTarget = await readNode(targetId);
    assert(afterSource.parentId === afterTarget.parentId && afterSource.order > afterTarget.order,
      'release commit must match the visible after indicator', { afterSource, afterTarget });
    return { sourceId, targetId, geometry, afterSourceOrder: afterSource.order, afterTargetOrder: afterTarget.order };
  });

  await runCase('QA-054-R04', 'adjacent checklist boundary jitter keeps one stable target until deliberate handover', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="qc-card-4"]');
    const firstTarget = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-1"]');
    const secondTarget = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-3"]');
    const firstId = await firstTarget.getAttribute('data-task-id');
    const secondId = await secondTarget.getAttribute('data-task-id');
    assert(firstId && secondId && firstId !== secondId, 'fixture must expose two adjacent checklist targets', { firstId, secondId });

    const sourcePoint = await visiblePointFor(source.locator('[data-mobile-task-card-primary="true"]'), 0.48, 0.45);
    const firstPoint = await visiblePointFor(firstTarget, 0.5, 0.5);
    const secondPoint = await visiblePointFor(secondTarget, 0.5, 0.5);
    const boundaryY = Math.round((firstPoint.box.y + firstPoint.box.height + secondPoint.box.y) / 2);
    const column = source.locator('xpath=ancestor::*[@data-mobile-pan-surface="kanban-column"]').first();
    const initialScrollTop = await column.evaluate((element) => element.scrollTop);
    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveTo({ x: firstPoint.x, y: firstPoint.y });

    const readIndicatorTarget = () => page.locator('[data-mobile-drop-indicator="true"]').first()
      .getAttribute('data-mobile-drop-target').catch(() => null);
    const initiallySelected = await readIndicatorTarget();
    const hitDiagnostics = await page.evaluate(({ x, y }) => ({
      hits: document.elementsFromPoint(x, y).slice(0, 10).map((element) => ({
        tag: element.tagName,
        className: element.getAttribute('class'),
        taskId: element.closest('[data-task-id]')?.getAttribute('data-task-id') || null,
        surfaceKind: element.closest('[data-task-drop-surface-kind]')?.getAttribute('data-task-drop-surface-kind') || null,
      })),
      debug: (window.__projedMobileTaskActionDebug || []).slice(-20),
      bodyDragActive: document.body.getAttribute('data-task-drag-touch-active'),
    }), { x: firstPoint.x, y: firstPoint.y });
    assert(initiallySelected === firstId, 'finger centered on the first checklist row must select that row', {
      firstId,
      selected: initiallySelected,
      firstPoint,
      hitDiagnostics,
    });
    const dragScrollTop = await column.evaluate((element) => element.scrollTop);
    assert(dragScrollTop === initialScrollTop, 'pan broker must not scroll the column after task drag owns the gesture', {
      initialScrollTop,
      dragScrollTop,
    });

    const jitterTargets = [];
    for (const deltaY of [-3, 3, -2, 2, -3, 3, -1, 1]) {
      await held.moveExact({ x: firstPoint.x, y: boundaryY + deltaY }, 18);
      jitterTargets.push(await readIndicatorTarget());
    }
    assert(jitterTargets.every((targetId) => targetId === firstId), 'sub-threshold boundary jitter must not flip the indicator', {
      firstId,
      secondId,
      boundaryY,
      jitterTargets,
    });

    await held.moveTo({ x: secondPoint.x, y: secondPoint.y });
    await page.waitForTimeout(100);
    const handedOverTarget = await readIndicatorTarget();
    assert(handedOverTarget === secondId, 'deliberate movement to the second row must hand over within 100ms', {
      firstId,
      secondId,
      handedOverTarget,
    });
    await held.end();
    return { firstId, secondId, boundaryY, initialScrollTop, dragScrollTop, jitterTargets, handedOverTarget };
  });

  await runCase('QA-054-R05', 'mobile checklist drag exposes only the live target indicator', async () => {
    await openApp({ width: 337, height: 415 });
    const source = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-3"]');
    const target = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-1"]');
    const sourceId = await source.getAttribute('data-task-id');
    const targetId = await target.getAttribute('data-task-id');
    const beforeSource = await readNode(sourceId);
    const beforeTarget = await readNode(targetId);
    assert(beforeSource?.parentId === beforeTarget?.parentId && beforeSource?.order > beforeTarget?.order,
      'fixture must start with the checklist source below the target', { beforeSource, beforeTarget });

    const sourcePoint = await visiblePointFor(source, 0.5, 0.5);
    const targetPoint = await visiblePointFor(target, 0.5, 0.5);
    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveTo({ x: targetPoint.x, y: targetPoint.y });
    const indicator = page.locator('[data-mobile-drop-indicator="true"]').first();
    await indicator.waitFor({ state: 'visible', timeout: 5000 });

    const geometry = await page.evaluate(({ sourceId, targetId, sourceCenterY, rawY }) => {
      const sourcePlaceholder = document.querySelector(`[data-kanban-drag-source-placeholder="true"][data-task-id="${sourceId}"]`);
      const indicator = document.querySelector('[data-mobile-drop-indicator="true"]');
      const target = document.querySelector(`[data-mobile-drop-target][data-task-id="${targetId}"]`);
      const preview = document.querySelector('[data-mobile-drag-preview="true"]');
      const visibleMarkers = Array.from(document.querySelectorAll('[data-kanban-insertion-marker="true"]'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        });
      const indicatorRect = indicator?.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const previewRect = preview?.getBoundingClientRect();
      return {
        sourcePlaceholderMarkers: sourcePlaceholder?.querySelectorAll('[data-kanban-insertion-marker="true"]').length ?? -1,
        visibleMarkerCount: visibleMarkers.length,
        indicatorTargetId: indicator?.getAttribute('data-mobile-drop-target') || null,
        indicatorPosition: indicator?.getAttribute('data-mobile-drop-position') || null,
        indicatorY: indicatorRect ? indicatorRect.top + indicatorRect.height / 2 : null,
        targetTop: targetRect?.top ?? null,
        previewBottom: previewRect?.bottom ?? null,
        fingerClearance: previewRect ? rawY - previewRect.bottom : null,
        sourceCenterY,
      };
    }, { sourceId, targetId, sourceCenterY: sourcePoint.y, rawY: targetPoint.y });

    assert(geometry.sourcePlaceholderMarkers === 0,
      'source placeholder must not render an insertion marker during mobile drag', geometry);
    assert(geometry.visibleMarkerCount === 1,
      'mobile drag must expose exactly one visible insertion marker', geometry);
    assert(geometry.indicatorTargetId === targetId && geometry.indicatorPosition === 'before',
      'the only visible marker must identify the current canonical target', geometry);
    assert(Math.abs(geometry.indicatorY - geometry.targetTop) <= 2,
      'the live marker must be geometrically attached to the target row', geometry);
    assert(geometry.fingerClearance !== null && Math.abs(geometry.fingerClearance - 12) <= 1,
      'the preview must remain coupled to the finger while the indicator stays on its target', geometry);
    assert(Math.abs(geometry.indicatorY - geometry.sourceCenterY) >= 12,
      'the live marker must not remain at the source row position', geometry);

    const screenshotPath = `${screenshotBase}-B05-single-live-indicator.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const afterSource = await readNode(sourceId);
    const afterTarget = await readNode(targetId);
    assert(afterSource.parentId === afterTarget.parentId && afterSource.order < afterTarget.order,
      'release commit must match the only visible before indicator', { afterSource, afterTarget });
    return { sourceId, targetId, geometry, screenshotPath };
  });

  await runCase('QA-054-R06', 'rapid multi-row movement cannot retain a stale indicator or use a tall card outer rect', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="qc-card-4"]');
    const firstTarget = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-1"]');
    const farTarget = page.locator('.kanban-task-card[data-task-id="qc-card-7"]');
    const firstTargetId = await firstTarget.getAttribute('data-task-id');
    const farTargetId = await farTarget.getAttribute('data-task-id');
    const sourceId = await source.getAttribute('data-task-id');
    const sourcePoint = await visiblePointFor(source.locator('[data-mobile-task-card-primary="true"]'), 0.48, 0.45);
    const firstPoint = await visiblePointFor(firstTarget, 0.5, 0.5);
    const farPoint = await visiblePointFor(farTarget, 0.5, 0.03);
    assert(sourceId && firstTargetId && farTargetId, 'fixture must expose source, first, and far targets', {
      sourceId,
      firstTargetId,
      farTargetId,
    });

    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveTo({ x: firstPoint.x, y: firstPoint.y });
    const indicator = page.locator('[data-mobile-drop-indicator="true"]').first();
    await indicator.waitFor({ state: 'visible', timeout: 5000 });
    assert(await indicator.getAttribute('data-mobile-drop-target') === firstTargetId,
      'fixture must first lock the upper checklist target', { firstTargetId });

    await held.moveExact({ x: farPoint.x, y: farPoint.y }, 18);
    const handover = await page.evaluate(({ x, y, firstTargetId, farTargetId }) => {
      const indicator = document.querySelector('[data-mobile-drop-indicator="true"]');
      const preview = document.querySelector('[data-mobile-drag-preview="true"]');
      const indicatorTargetId = indicator?.getAttribute('data-mobile-drop-target') || null;
      const selectedTarget = indicatorTargetId
        ? document.querySelector(`[data-mobile-drop-target][data-task-id="${indicatorTargetId}"]`)
        : null;
      const selectedRect = selectedTarget?.getBoundingClientRect();
      const selectedPrimaryRect = selectedTarget?.querySelector('[data-mobile-task-card-primary="true"]')?.getBoundingClientRect();
      const distanceToSelectedRect = selectedRect
        ? Math.hypot(
          Math.max(selectedRect.left - x, 0, x - selectedRect.right),
          Math.max(selectedRect.top - y, 0, y - selectedRect.bottom),
        )
        : null;
      const indicatorRect = indicator?.getBoundingClientRect();
      const previewRect = preview?.getBoundingClientRect();
      const indicatorY = indicatorRect ? indicatorRect.top + indicatorRect.height / 2 : null;
      return {
        firstTargetId,
        farTargetId,
        indicatorTargetId,
        distanceToSelectedRect,
        previewAnchor: preview?.getAttribute('data-mobile-preview-anchor') || null,
        fingerClearance: previewRect ? y - previewRect.bottom : null,
        indicatorY,
        selectedPrimaryBottom: selectedPrimaryRect?.bottom ?? null,
        debug: (window.__projedMobileTaskActionDebug || []).slice(-12),
      };
    }, { x: farPoint.x, y: farPoint.y, firstTargetId, farTargetId });

    assert(handover.indicatorTargetId !== firstTargetId,
      'a visible indicator must never remain on a target outside its retain region', handover);
    assert(handover.indicatorTargetId === farTargetId && handover.distanceToSelectedRect === 0,
      'a direct far target must take ownership immediately even when the pointer is near its edge', handover);
    assert(handover.previewAnchor === 'finger'
      && handover.fingerClearance !== null
      && Math.abs(handover.fingerClearance - 12) <= 1,
    'a tall target must not pull the preview away from the finger', handover);
    assert(handover.indicatorY !== null
      && handover.selectedPrimaryBottom !== null
      && Math.abs(handover.indicatorY - handover.selectedPrimaryBottom) <= 2,
    'a tall card indicator must use the bounded primary surface rather than the expanded outer card', handover);
    const screenshotPath = `${screenshotBase}-B06-no-distant-stale-indicator.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const afterSource = await readNode(sourceId);
    const afterTarget = await readNode(farTargetId);
    assert(afterSource.parentId === afterTarget.parentId && afterSource.order > afterTarget.order,
      'release must commit the far target shown by the indicator', { afterSource, afterTarget });
    return { sourceId, firstTargetId, farTargetId, handover, screenshotPath };
  });

  await runCase('QA-054-R07', 'leaving a target for an invalid control produces a zero-write release', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id]').first();
    const target = page.locator('.kanban-task-card[data-task-id]').nth(1);
    const invalid = page.locator('[data-kanban-add-task-button="true"]').first();
    const before = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const held = await startHeldTouch(source.locator('[data-mobile-task-card-primary="true"]'));
    const targetPoint = await pointFor(target.locator('[data-mobile-task-card-primary="true"]'));
    await held.moveTo({ x: targetPoint.x, y: targetPoint.y });
    await page.locator('[data-mobile-drop-indicator="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await held.moveTo(await pointFor(invalid));
    await page.waitForTimeout(160);
    await held.end();
    const after = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const transient = await page.evaluate(() => ({
      rail: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
      preview: document.querySelectorAll('[data-mobile-drag-preview="true"]').length,
      indicator: document.querySelectorAll('[data-mobile-drop-indicator="true"]').length,
    }));
    assert(before === after, 'invalid release must not commit the previous target', { beforeLength: before?.length, afterLength: after?.length });
    assert(transient.rail === 0 && transient.preview === 0 && transient.indicator === 0, 'invalid release must clean transient drag UI', transient);
    return { zeroWrite: true, transient };
  });

  await runCase('QA-054-R08', '320/390/430 action rail and preview stay inside the viewport', async () => {
    const sweeps = [];
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await openApp(viewport);
      const card = page.locator('.kanban-task-card[data-task-id]').first();
      const held = await startHeldTouch(card.locator('[data-mobile-task-card-primary="true"]'));
      const rail = page.locator('[data-mobile-task-action-rail="true"]').first();
      const preview = page.locator('[data-mobile-drag-preview="true"]').first();
      await rail.waitFor({ state: 'visible', timeout: 5000 });
      await preview.waitFor({ state: 'visible', timeout: 5000 });
      const geometry = await page.evaluate(() => {
        const rail = document.querySelector('[data-mobile-task-action-rail="true"]').getBoundingClientRect();
        const preview = document.querySelector('[data-mobile-drag-preview="true"]').getBoundingClientRect();
        return {
          rail: { left: rail.left, right: rail.right, top: rail.top, bottom: rail.bottom },
          preview: { left: preview.left, right: preview.right, top: preview.top, bottom: preview.bottom },
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      assert(geometry.rail.left >= -1 && geometry.rail.right <= viewport.width + 1, 'action rail must fit the viewport', { viewport, geometry });
      assert(geometry.preview.left >= -1 && geometry.preview.right <= viewport.width + 1, 'preview must fit the viewport', { viewport, geometry });
      assert(!geometry.overflow, 'drag UI must not create horizontal overflow', { viewport, geometry });
      const screenshotPath = `${screenshotBase}-B05-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.keyboard.press('Escape');
      await held.end();
      sweeps.push({ viewport, geometry, screenshotPath });
    }
    return { sweeps };
  });

  await runCase('QA-054-R10', 'checklist source geometry cannot fall through to its expanded parent card', async () => {
    await openApp({ width: 636, height: 764 });
    const source = page.locator('.kanban-checklist-item[data-task-id="qc-card-1-child-3"]');
    const sourceId = await source.getAttribute('data-task-id');
    const parentCard = source.locator('xpath=ancestor::*[contains(@class,"kanban-task-card")]').first();
    const parentCardId = await parentCard.getAttribute('data-task-id');
    const sourcePoint = await visiblePointFor(source, 0.5, 0.5);
    const sameRowPoint = {
      x: Math.min(Math.round(sourcePoint.box.x + sourcePoint.box.width - 12), sourcePoint.x + 32),
      y: sourcePoint.y,
    };
    const before = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    assert(sourceId && parentCardId && sourceId !== parentCardId,
      'fixture must expose a checklist source nested in an expanded card', { sourceId, parentCardId });

    const held = await startHeldTouchAtPoint(sourcePoint);
    await held.moveExact(sameRowPoint, 40);
    const geometry = await page.evaluate(({ x, y }) => {
      const indicator = document.querySelector('[data-mobile-drop-indicator="true"]');
      const preview = document.querySelector('[data-mobile-drag-preview="true"]');
      const previewRect = preview?.getBoundingClientRect();
      return {
        indicatorTargetId: indicator?.getAttribute('data-mobile-drop-target') || null,
        previewAnchor: preview?.getAttribute('data-mobile-preview-anchor') || null,
        fingerClearance: previewRect ? y - previewRect.bottom : null,
        hitTaskIds: document.elementsFromPoint(x, y).slice(0, 12)
          .map((element) => element.closest('[data-mobile-drop-target][data-task-id]')?.getAttribute('data-task-id') || null)
          .filter(Boolean),
        debug: (window.__projedMobileTaskActionDebug || []).slice(-12),
      };
    }, sameRowPoint);

    assert(geometry.indicatorTargetId !== parentCardId,
      'an invalid innermost source row must block fall-through to its ancestor card', {
        sourceId,
        parentCardId,
        sameRowPoint,
        geometry,
      });
    assert(geometry.previewAnchor === 'finger'
      && geometry.fingerClearance !== null
      && Math.abs(geometry.fingerClearance - 12) <= 1,
    'drag preview must stay coupled to the finger and never jump to a target indicator', geometry);
    const screenshotPath = `${screenshotBase}-B10-no-parent-fallthrough.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    assert(before === after, 'releasing on the source row must be a zero-write no-op', { sourceId, parentCardId });
    return { sourceId, parentCardId, geometry, screenshotPath };
  });

  const unexpectedDiagnostics = diagnostics.filter((message) => !/favicon|ResizeObserver/i.test(message));
  const unexpectedNetworkFailures = networkFailures.filter((message) => !/favicon/i.test(message));
  results.push({
    id: 'QA-054-R09',
    scenario: 'console and network error sweep',
    result: unexpectedDiagnostics.length || unexpectedNetworkFailures.length ? 'FAIL' : 'PASS',
    details: { unexpectedDiagnostics, unexpectedNetworkFailures },
  });

  const failed = results.filter((result) => result.result !== 'PASS');
  const summary = {
    ok: failed.length === 0,
    summary: { pass: results.length - failed.length, fail: failed.length },
    results,
    diagnostics: diagnostics.slice(-30),
    networkFailures: networkFailures.slice(-30),
  };
  await page.evaluate((payload) => {
    localStorage.setItem('dev054-mobile-task-drag-precision-result', JSON.stringify(payload));
  }, summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) throw new Error(`DEV-054 browser verification failed: ${JSON.stringify(failed)}`);
  return summary;
}
