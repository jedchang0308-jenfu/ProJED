/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-068-title-child-drop-${Date.now()}`;
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

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.mouse.up().catch(() => undefined);
    await page.setViewportSize(viewport);
    await page.goto(`${appBaseUrl}/`, { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto(`${appBaseUrl}/?qcReset=1&qcSize=72`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__projedTaskDragTestApi), null, { timeout: 5000 });
    const sidebar = page.locator('[data-mobile-sidebar-overlay="true"]').first();
    if (await sidebar.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  };

  const readNodes = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));

  const readNode = async (nodeId) => page.evaluate((id) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[id] || null;
  }, nodeId);

  const readRuntimeNodes = async () => page.evaluate(() =>
    window.__projedTaskDragTestApi.snapshotNodes());

  const patchRuntimeNode = async (nodeId, patch) => page.evaluate(({ id, changes }) =>
    window.__projedTaskDragTestApi.patchNode(id, changes), { id: nodeId, changes: patch });

  const removeRuntimeNode = async (nodeId) => page.evaluate((id) =>
    window.__projedTaskDragTestApi.removeNodeFromRuntime(id), nodeId);

  const setMovePermission = async (allowed) => page.evaluate((next) =>
    window.__projedTaskDragTestApi.setMovePermission(next), allowed);

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

  const targetScopeFor = (nodeId) => page.locator(`[data-task-child-drop-target="true"][data-task-id="${nodeId}"]`).first();
  const titleSlotFor = (nodeId) => page.locator(`[data-task-title-slot="true"][data-task-id="${nodeId}"]`).first();
  const surfaceFor = (nodeId) => page.locator(`[data-task-surface-source="true"][data-task-id="${nodeId}"]`).first();
  const readSourceOriginPlaceholder = async (nodeId) => page.evaluate((id) => {
    const matches = Array.from(document.querySelectorAll(
      `[data-kanban-drag-source-placeholder="true"][data-task-id="${id}"]`,
    )).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const element = matches[0];
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    return {
      count: matches.length,
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      outlineStyle: style?.outlineStyle || null,
      outlineWidth: style?.outlineWidth || null,
      outlineColor: style?.outlineColor || null,
      outlineOffset: style?.outlineOffset || null,
      backgroundColor: style?.backgroundColor || null,
    };
  }, nodeId);

  const pointFor = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'target must expose a visible bounding box');
    return { x: Math.round(box.x + box.width * ratioX), y: Math.round(box.y + box.height * ratioY), box };
  };

  const fixtureIds = async () => page.evaluate(() => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const unique = (selector) => Array.from(new Set(Array.from(document.querySelectorAll(selector))
      .map((element) => element.getAttribute('data-task-id'))
      .filter(Boolean)));
    const l1 = unique('[data-kanban-column-header="true"][data-task-id]');
    const l2 = unique('.kanban-task-card[data-task-id]');
    const l3 = unique('.kanban-checklist-item[data-task-id]');
    const isDescendant = (nodeId, ancestorId) => {
      const visited = new Set();
      let current = nodes[nodeId]?.parentId;
      while (current && !visited.has(current)) {
        if (current === ancestorId) return true;
        visited.add(current);
        current = nodes[current]?.parentId;
      }
      return false;
    };
    const pair = (ids) => {
      for (const sourceId of ids) {
        for (const targetId of ids) {
          if (sourceId !== targetId && !isDescendant(targetId, sourceId) && !isDescendant(sourceId, targetId)) {
            return [sourceId, targetId];
          }
        }
      }
      return [];
    };
    const visibleIds = Array.from(new Set([...l1, ...l2, ...l3]));
    const originPair = visibleIds.map((sourceId) => {
      const parentId = nodes[sourceId]?.parentId;
      if (!parentId || !visibleIds.includes(parentId)) return null;
      const siblings = Object.values(nodes)
        .filter((node) => node && !node.isArchived && node.parentId === parentId)
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
      return siblings.at(-1)?.id === sourceId ? [sourceId, parentId] : null;
    }).find(Boolean) || [];
    return { l1, l2, l3, l2Pair: pair(l2), l3Pair: pair(l3), originPair };
  });

  const descendantIds = (nodes, rootId) => {
    const descendants = [];
    const queue = [rootId];
    const visited = new Set();
    while (queue.length) {
      const parentId = queue.shift();
      if (!parentId || visited.has(parentId)) continue;
      visited.add(parentId);
      Object.values(nodes).forEach((node) => {
        if (!node || node.isArchived || node.parentId !== parentId) return;
        descendants.push(node.id);
        queue.push(node.id);
      });
    }
    return descendants;
  };

  const readTransientState = async () => page.evaluate(() => ({
    childPreview: document.querySelectorAll('[data-task-child-drop-preview="true"]').length,
    desktopOverlay: document.querySelectorAll('[data-kanban-drag-overlay="true"]').length,
    desktopIndicator: document.querySelectorAll('[data-desktop-drop-indicator="true"]').length,
    mobileRail: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
    mobilePreview: document.querySelectorAll('[data-mobile-drag-preview="true"]').length,
    mobileIndicator: document.querySelectorAll('[data-mobile-drop-indicator="true"]').length,
    bodyActive: document.body.hasAttribute('data-task-drag-touch-active'),
  }));

  const beginMouseDrag = async (sourceId) => {
    const source = surfaceFor(sourceId);
    const point = await pointFor(source, 0.55, 0.45);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 14, point.y + 3, { steps: 4 });
    await page.locator('[data-kanban-drag-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
    return point;
  };

  const moveMouseToTargetPrimary = async (targetId) => {
    const point = await pointFor(surfaceFor(targetId), 0.5, 0.5);
    await page.mouse.move(point.x, point.y, { steps: 6 });
    return point;
  };

  const findPointOutsideTaskScopes = async () => page.evaluate(() => {
    for (let y = Math.max(56, innerHeight - 80); y >= 56; y -= 24) {
      for (let x = 8; x < innerWidth - 8; x += 24) {
        const element = document.elementFromPoint(x, y);
        if (!element?.closest('[data-task-child-drop-target="true"],[data-mobile-task-action-rail="true"]')) {
          return { x, y };
        }
      }
    }
    return { x: 4, y: Math.max(56, innerHeight - 8) };
  });

  const readChildPreview = async () => page.evaluate(() => {
    const preview = document.querySelector('[data-task-child-drop-preview="true"]');
    const hitScope = document.querySelector('[data-task-child-drop-hit-scope="true"]');
    const parent = document.querySelector('[data-task-child-drop-parent-frame="true"]');
    const sourceFrame = document.querySelector('[data-task-child-drop-source-frame="true"]');
    const subtreeFrame = document.querySelector('[data-task-child-drop-subtree-frame="true"]');
    const scopeFrame = document.querySelector('[data-task-child-drop-scope-frame="true"]');
    const childInsertion = document.querySelector('[data-task-child-drop-insertion-preview="true"]');
    const childOriginField = document.querySelector('[data-task-child-drop-origin-field="true"]');
    const hitScopeRect = hitScope?.getBoundingClientRect();
    const parentRect = parent?.getBoundingClientRect();
    const subtreeRect = subtreeFrame?.getBoundingClientRect();
    const childInsertionRect = childInsertion?.getBoundingClientRect();
    const sourceStyle = sourceFrame ? getComputedStyle(sourceFrame) : null;
    const subtreeStyle = subtreeFrame ? getComputedStyle(subtreeFrame) : null;
    const childOriginStyle = childOriginField ? getComputedStyle(childOriginField) : null;
    return {
      count: document.querySelectorAll('[data-task-child-drop-preview="true"]').length,
      phase: preview?.getAttribute('data-task-child-drop-phase') || null,
      target: preview?.getAttribute('data-task-child-drop-target') || null,
      input: preview?.getAttribute('data-task-child-drop-input') || null,
      safeWidth: Number(hitScope?.getAttribute('data-task-child-drop-safe-width') || 0),
      safeHeight: Number(hitScope?.getAttribute('data-task-child-drop-safe-height') || 0),
      sourceFrameCount: document.querySelectorAll('[data-task-child-drop-source-frame="true"]').length,
      subtreeFrameCount: document.querySelectorAll('[data-task-child-drop-subtree-frame="true"]').length,
      scopeFrameCount: document.querySelectorAll('[data-task-child-drop-scope-frame="true"]').length,
      childInsertionCount: document.querySelectorAll('[data-task-child-drop-insertion-preview="true"]').length,
      childGenericMarkerCount: childInsertion?.querySelectorAll('[data-kanban-insertion-marker="true"]').length || 0,
      childOriginFieldCount: document.querySelectorAll('[data-task-child-drop-origin-field="true"]').length,
      childOriginTitle: childOriginField?.textContent?.trim() || null,
      childOriginNoop: childInsertion?.getAttribute('data-task-child-drop-noop') || null,
      standardInsertionIndicatorCount: document.querySelectorAll('[data-desktop-drop-indicator="true"],[data-mobile-drop-indicator="true"]').length,
      hitScopeRect: hitScopeRect ? { left: hitScopeRect.left, top: hitScopeRect.top, right: hitScopeRect.right, bottom: hitScopeRect.bottom } : null,
      parentRect: parentRect ? { left: parentRect.left, top: parentRect.top, right: parentRect.right, bottom: parentRect.bottom } : null,
      subtreeRect: subtreeRect ? { left: subtreeRect.left, top: subtreeRect.top, right: subtreeRect.right, bottom: subtreeRect.bottom } : null,
      childInsertionRect: childInsertionRect ? { left: childInsertionRect.left, top: childInsertionRect.top, right: childInsertionRect.right, bottom: childInsertionRect.bottom, width: childInsertionRect.width, height: childInsertionRect.height } : null,
      sourceFrameStyle: sourceStyle ? { boxShadow: sourceStyle.boxShadow, backgroundColor: sourceStyle.backgroundColor } : null,
      subtreeFrameStyle: subtreeStyle ? { boxShadow: subtreeStyle.boxShadow } : null,
      childOriginStyle: childOriginStyle ? {
        backgroundColor: childOriginStyle.backgroundColor,
        color: childOriginStyle.color,
      } : null,
      viewport: { width: innerWidth, height: innerHeight },
      childInsertionLeft: Number(childInsertion?.getAttribute('data-task-child-drop-insertion-left') || 0),
    };
  });

  const readSourceOverlayGeometry = async (pointer) => page.evaluate(({ pointer }) => {
    const desktop = document.querySelector('[data-kanban-drag-overlay="true"]');
    const mobile = document.querySelector('[data-mobile-drag-preview="true"]');
    const source = desktop || mobile;
    const parent = document.querySelector('[data-task-child-drop-parent-frame="true"]');
    const childInsertion = document.querySelector('[data-task-child-drop-insertion-preview="true"]');
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const overlaps = (first, second) => Boolean(first && second
      && first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top);
    const sourceRect = toRect(source);
    const parentRect = toRect(parent);
    const childInsertionRect = toRect(childInsertion);
    return {
      kind: desktop ? 'desktop' : mobile ? 'mobile' : null,
      anchor: source?.getAttribute('data-task-drag-overlay-anchor')
        || source?.getAttribute('data-mobile-preview-anchor')
        || null,
      placement: source?.getAttribute('data-task-drag-overlay-anchor')
        || source?.getAttribute('data-mobile-preview-placement')
        || null,
      edgePlacement: source?.getAttribute('data-mobile-preview-edge-placement') || null,
      pointerGap: Number(source?.getAttribute('data-task-drag-overlay-pointer-gap')
        || source?.getAttribute('data-mobile-preview-pointer-gap')
        || 0),
      gap: Number(source?.getAttribute('data-task-drag-overlay-pointer-gap')
        || source?.getAttribute('data-mobile-preview-finger-clearance')
        || 0),
      pointer,
      sourceRect,
      parentRect,
      childInsertionRect,
      overlapsParent: overlaps(sourceRect, parentRect),
      overlapsChildInsertion: overlaps(sourceRect, childInsertionRect),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, { pointer });

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
        for (let step = 1; step <= 5; step += 1) {
          current = {
            x: Math.round(start.x + ((target.x - start.x) * step) / 5),
            y: Math.round(start.y + ((target.y - start.y) * step) / 5),
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(20);
        }
      },
      moveExact: async (target) => {
        current = { x: Math.round(target.x), y: Math.round(target.y) };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        });
        await page.waitForTimeout(40);
      },
      end: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(260);
      },
      cancel: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(220);
      },
    };
  };

  const startHeldTouch = async (sourceId) => {
    const point = await pointFor(surfaceFor(sourceId), 0.48, 0.45);
    const held = await startHeldTouchAtPoint(point);
    await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
    return held;
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

  await runCase('DEV068-SOURCE-ORIGIN-PLACEHOLDER', 'desktop L1/L2/L3+ and mobile keep a dashed frame at the source position while dragging', async () => {
    const evidence = [];
    for (const sample of [
      { level: 'L1', viewport: { width: 1440, height: 900 }, fixtureKey: 'l1' },
      { level: 'L2', viewport: { width: 1440, height: 900 }, fixtureKey: 'l2' },
      { level: 'L3+', viewport: { width: 1024, height: 768 }, fixtureKey: 'l3' },
    ]) {
      await openApp(sample.viewport);
      const fixture = await fixtureIds();
      const sourceId = fixture[sample.fixtureKey][0];
      assert(sourceId, `${sample.level} fixture must expose a draggable task`, fixture);
      const beforeRect = await (sample.level === 'L2' ? targetScopeFor(sourceId) : surfaceFor(sourceId)).boundingBox();
      await beginMouseDrag(sourceId);
      await page.waitForTimeout(180);
      const placeholder = await readSourceOriginPlaceholder(sourceId);
      assert(placeholder.count === 1
        && placeholder.outlineStyle === 'dashed'
        && placeholder.outlineWidth === '2px'
        && placeholder.outlineColor === 'rgb(129, 140, 248)'
        && placeholder.rect && beforeRect
        && Math.abs(placeholder.rect.left - beforeRect.x) <= 1
        && Math.abs(placeholder.rect.top - beforeRect.y) <= 1
        && Math.abs(placeholder.rect.width - beforeRect.width) <= 1
        && Math.abs(placeholder.rect.height - beforeRect.height) <= 1,
      `${sample.level} must show one geometry-stable dashed frame at the original task position`, { beforeRect, placeholder });
      if (sample.level === 'L2') {
        const screenshotPath = `${screenshotBase}-desktop-source-origin-placeholder.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });
        placeholder.screenshotPath = screenshotPath;
      }
      evidence.push({ level: sample.level, sourceId, beforeRect, placeholder });
      await page.keyboard.press('Escape');
      await page.mouse.up().catch(() => undefined);
    }

    for (const sample of [
      { level: 'mobile-L1', fixtureKey: 'l1' },
      { level: 'mobile-L2', fixtureKey: 'l2' },
      { level: 'mobile-L3+', fixtureKey: 'l3' },
    ]) {
      await openApp({ width: 390, height: 844 });
      const fixture = await fixtureIds();
      const sourceId = fixture[sample.fixtureKey][0];
      assert(sourceId, `${sample.level} fixture must expose a draggable task`, fixture);
      const beforeRect = await (sample.level === 'mobile-L2' ? targetScopeFor(sourceId) : surfaceFor(sourceId)).boundingBox();
      const held = await startHeldTouch(sourceId);
      await page.waitForTimeout(180);
      const placeholder = await readSourceOriginPlaceholder(sourceId);
      assert(placeholder.count === 1
        && placeholder.outlineStyle === 'dashed'
        && placeholder.outlineWidth === '2px'
        && placeholder.outlineColor === 'rgb(129, 140, 248)'
        && placeholder.rect && beforeRect
        && Math.abs(placeholder.rect.left - beforeRect.x) <= 1
        && Math.abs(placeholder.rect.top - beforeRect.y) <= 1
        && Math.abs(placeholder.rect.width - beforeRect.width) <= 1
        && Math.abs(placeholder.rect.height - beforeRect.height) <= 1,
      `${sample.level} long-press drag must show one geometry-stable dashed frame at the original task position`, { beforeRect, placeholder });
      let screenshotPath = null;
      if (sample.level === 'mobile-L2') {
        screenshotPath = `${screenshotBase}-mobile-source-origin-placeholder.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
      await held.cancel();
      evidence.push({ level: sample.level, sourceId, beforeRect, placeholder: { ...placeholder, screenshotPath } });
    }
    return { evidence };
  });

  await runCase('DEV068-DESK-900', 'desktop task hover scope preserves the standard drop before one second', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    assert(fixture.l2Pair.length === 2, 'fixture must expose two independent L2 tasks', fixture);
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    const targetBefore = await readNode(targetId);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(420);
    const candidate = await readChildPreview();
    assert(candidate.phase === 'candidate' && candidate.target === targetId && candidate.childInsertionCount === 0
      && candidate.sourceFrameCount === 0 && candidate.subtreeFrameCount === 0 && candidate.scopeFrameCount === 0
      && candidate.parentRect === null && candidate.subtreeRect === null
      && candidate.standardInsertionIndicatorCount === 1,
      'sub-threshold desktop hold must keep only the standard insertion intent visible without child frames', candidate);
    await page.mouse.up();
    await page.waitForTimeout(260);
    const after = await readNode(sourceId);
    assert(after.parentId === targetBefore.parentId && after.parentId !== targetId && after.nodeType === before.nodeType,
      'desktop release before dwell may use the standard target but must not commit child placement', { before, targetBefore, after });
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'candidate preview must clear after release');
    return { sourceId, targetId, candidate, before, targetBefore, after };
  });

  await runCase('DEV068-DESK-ARMED', 'desktop armed preview shows only the child insertion marker and commits once', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const sourceBefore = await readNode(sourceId);
    const targetBefore = await readNode(targetId);
    const targetSurfaceBefore = await surfaceFor(targetId).boundingBox();
    await beginMouseDrag(sourceId);
    const targetPoint = await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const armed = await readChildPreview();
    const sourceOverlay = await readSourceOverlayGeometry(targetPoint);
    const targetSurfaceArmed = await surfaceFor(targetId).boundingBox();
    assert(armed.count === 1 && armed.childInsertionCount === 1 && armed.target === targetId
      && armed.sourceFrameCount === 0 && armed.subtreeFrameCount === 0 && armed.scopeFrameCount === 0
      && armed.standardInsertionIndicatorCount === 0
      && armed.childInsertionRect && armed.parentRect === null && armed.subtreeRect === null
      && armed.childInsertionRect.width >= 48,
    'armed desktop preview must render only one child-level insertion marker and no blue target frames', armed);
    assert(sourceOverlay.kind === 'desktop'
      && sourceOverlay.anchor === 'pointer-upper-right'
      && sourceOverlay.gap === 16
      && sourceOverlay.sourceRect.left >= targetPoint.x + sourceOverlay.gap - 1
      && sourceOverlay.sourceRect.bottom <= targetPoint.y - sourceOverlay.gap + 1
      && !sourceOverlay.overlapsChildInsertion,
    'desktop source overlay must stay at pointer upper-right without covering the child insertion marker', sourceOverlay);
    assert(targetSurfaceBefore && targetSurfaceArmed
      && Math.abs(targetSurfaceBefore.x - targetSurfaceArmed.x) <= 1
      && Math.abs(targetSurfaceBefore.y - targetSurfaceArmed.y) <= 1
      && Math.abs(targetSurfaceBefore.width - targetSurfaceArmed.width) <= 1
      && Math.abs(targetSurfaceBefore.height - targetSurfaceArmed.height) <= 1,
    'fixed preview must not change target layout geometry', { targetSurfaceBefore, targetSurfaceArmed });
    const screenshotPath = `${screenshotBase}-desktop-armed.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(320);
    const sourceAfter = await readNode(sourceId);
    assert(sourceAfter.parentId === targetId && sourceAfter.nodeType === 'task',
      'desktop armed release must make source the exact target child', { sourceBefore, sourceAfter, targetId });
    const announcement = await page.locator('[data-task-child-drop-announcement="true"]').textContent();
    assert((announcement || '').includes(targetBefore.title), 'successful child move must announce target parent', { announcement });
    return { sourceId, targetId, armed, sourceOverlay, sourceBefore, sourceAfter, screenshotPath, announcement };
  });

  await runCase('DEV068-DESK-ORIGIN-CHILD', 'desktop child append at the original position shows the source title and is zero-write', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.originPair;
    assert(sourceId && targetId, 'fixture must expose a visible last child and its current parent', fixture);
    const before = await readNode(sourceId);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const armed = await readChildPreview();
    assert(armed.childInsertionCount === 1
      && armed.childOriginFieldCount === 1
      && armed.childGenericMarkerCount === 0
      && armed.childOriginTitle === before.title
      && armed.childOriginNoop === 'true'
      && armed.childOriginStyle?.backgroundColor === 'rgb(99, 102, 241)'
      && armed.childOriginStyle?.color === 'rgb(255, 255, 255)',
    'desktop origin child preview must reuse the blue source-title field instead of a generic insertion line', { before, armed });
    const screenshotPath = `${screenshotBase}-desktop-origin-child.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(320);
    const after = await readNode(sourceId);
    const announcement = await page.locator('[data-task-child-drop-announcement="true"]').textContent();
    assert(JSON.stringify(after) === JSON.stringify(before),
      'desktop origin child release must preserve the complete source node snapshot', { before, after });
    assert(!(announcement || '').trim(), 'desktop origin child release must not announce a successful move', { announcement });
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'desktop origin child preview must clear after release');
    return { sourceId, targetId, before, armed, after, screenshotPath, announcement };
  });

  await runCase('DEV068-DESK-L1', 'desktop L2 to L1 hover scope becomes direct L2 child', async () => {
    await openApp({ width: 1024, height: 768 });
    const fixture = await fixtureIds();
    const sourceId = fixture.l2[0];
    const sourceBefore = await readNode(sourceId);
    const targetId = fixture.l1.find((id) => id !== sourceBefore.parentId);
    assert(sourceId && targetId, 'fixture must expose L2 source and other L1 target', fixture);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const preview = await readChildPreview();
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await readNode(sourceId);
    assert(after.parentId === targetId && after.nodeType === 'task',
      'L1 hover scope must accept the source as direct L2 task', { sourceBefore, after, targetId });
    return { sourceId, targetId, preview, sourceBefore, after };
  });

  await runCase('DEV068-DESK-DEEP', 'desktop L3+ hover scope accepts an exact next-level child', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    assert(fixture.l3Pair.length === 2, 'fixture must expose independent L3+ tasks', fixture);
    const [sourceId, targetId] = fixture.l3Pair;
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const screenshotPath = `${screenshotBase}-desktop-deep-armed.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await readNode(sourceId);
    assert(after.parentId === targetId, 'L3+ armed release must use exact deep target as parent', { sourceId, targetId, after });
    return { sourceId, targetId, after, screenshotPath };
  });

  await runCase('DEV068-DESK-DEPTH-LINE', 'child insertion marker start position communicates L2, L3 and L4+ depth', async () => {
    const sampleDepth = async (level) => {
      await openApp({ width: 1440, height: 900 });
      const fixture = await fixtureIds();
      let sourceId;
      let targetId;
      if (level === 'L2') {
        sourceId = fixture.l2[0];
        const source = await readNode(sourceId);
        targetId = fixture.l1.find((id) => id !== source.parentId);
      } else if (level === 'L3') {
        [sourceId, targetId] = fixture.l2Pair;
      } else {
        [sourceId, targetId] = fixture.l3Pair;
      }
      assert(sourceId && targetId, `${level} depth sample needs independent source and target`, fixture);
      await beginMouseDrag(sourceId);
      const targetPoint = await moveMouseToTargetPrimary(targetId);
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      const preview = await readChildPreview();
      const targetGeometry = await page.evaluate((id) => {
        const target = document.querySelector(`[data-task-child-drop-target="true"][data-task-id="${id}"]`);
        const column = target?.closest('[data-kanban-column="true"]');
        const columnRect = column?.getBoundingClientRect();
        return {
          targetLevel: target?.getAttribute('data-task-child-drop-level') || null,
          columnLeft: columnRect?.left ?? null,
        };
      }, targetId);
      assert(preview.childInsertionRect && targetGeometry.columnLeft !== null,
        `${level} depth sample must expose one insertion marker and its column`, { preview, targetGeometry });
      const result = {
        level,
        sourceId,
        targetId,
        markerLeft: preview.childInsertionRect.left,
        offsetFromColumn: preview.childInsertionRect.left - targetGeometry.columnLeft,
        targetPoint,
        targetGeometry,
      };
      if (level === 'L4+') {
        result.screenshotPath = `${screenshotBase}-desktop-depth-insertion.png`;
        await page.screenshot({ path: result.screenshotPath, fullPage: false });
      }
      await page.keyboard.press('Escape');
      return result;
    };

    const l2 = await sampleDepth('L2');
    const l3 = await sampleDepth('L3');
    const l4 = await sampleDepth('L4+');
    assert(l2.offsetFromColumn + 6 <= l3.offsetFromColumn
      && l3.offsetFromColumn + 8 <= l4.offsetFromColumn,
    'each deeper child insertion marker must visibly start farther right', { l2, l3, l4 });
    return { l2, l3, l4 };
  });

  await runCase('DEV068-DESK-SWITCH', 'desktop rapid target switching resets dwell and blocks stale commit', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    assert(fixture.l2.length >= 3, 'fixture must expose three L2 tasks', fixture);
    const [sourceId, targetA, targetB] = fixture.l2;
    const before = await readNode(sourceId);
    const targetBBefore = await readNode(targetB);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetA);
    await page.waitForTimeout(620);
    await moveMouseToTargetPrimary(targetB);
    await page.waitForTimeout(620);
    const candidate = await readChildPreview();
    assert(candidate.phase === 'candidate' && candidate.target === targetB && candidate.childInsertionCount === 0
      && candidate.standardInsertionIndicatorCount === 1,
      'new target must restart dwell and never inherit old armed state', candidate);
    await page.mouse.up();
    await page.waitForTimeout(260);
    const after = await readNode(sourceId);
    assert(after.parentId === targetBBefore.parentId && after.parentId !== targetA && after.parentId !== targetB,
      'rapid target switch release may use the current standard target but must not commit a stale child parent', { before, targetBBefore, after });
    return { sourceId, targetA, targetB, candidate, before, targetBBefore, after };
  });

  await runCase('DEV068-DESK-SCOPE-BLANK', 'blank space inside the task primary surface belongs to the complete hover scope', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const target = surfaceFor(targetId);
    await beginMouseDrag(sourceId);
    const bottom = await pointFor(target, 0.5, 0.94);
    await page.mouse.move(bottom.x, bottom.y, { steps: 6 });
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const preview = await readChildPreview();
    assert(preview.target === targetId && preview.childInsertionCount === 1,
      'blank space inside the primary surface must arm the exact task hover scope', { bottom, preview });
    await page.mouse.up();
    await page.waitForTimeout(280);
    const after = await readNode(sourceId);
    assert(after.parentId === targetId, 'release on blank space inside the hover scope must commit the exact child', { sourceId, targetId, after });
    return { sourceId, targetId, bottom, preview, after };
  });

  await runCase('DEV068-DESK-LIFECYCLE-A11Y', 'desktop candidate, armed hold, leave, stale timer and live status are coherent', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
    const candidateStatus = await page.locator('[data-task-child-drop-live-status="true"]').textContent();
    assert((candidateStatus || '').includes('候選區') && (candidateStatus || '').includes('一秒'),
      'candidate must expose an assistive child-intent instruction', { candidateStatus });
    const candidateScreenshot = `${screenshotBase}-desktop-candidate.png`;
    await page.screenshot({ path: candidateScreenshot, fullPage: false });
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const beforeExtendedHold = await readNode(sourceId);
    await page.waitForTimeout(2100);
    const armed = await readChildPreview();
    const armedStatus = await page.locator('[data-task-child-drop-live-status="true"]').textContent();
    const duringExtendedHold = await readNode(sourceId);
    assert(armed.phase === 'armed' && armed.count === 1 && armed.childInsertionCount === 1,
      'extended hold must remain one armed preview', armed);
    assert(JSON.stringify(beforeExtendedHold) === JSON.stringify(duringExtendedHold),
      'armed hold must never write before release', { beforeExtendedHold, duringExtendedHold });
    assert((armedStatus || '').includes('已鎖定') && (armedStatus || '').includes('放開後'),
      'armed state must expose release semantics to assistive technology', { armedStatus });
    const outsidePoint = await findPointOutsideTaskScopes();
    await page.mouse.move(outsidePoint.x, outsidePoint.y, { steps: 5 });
    await page.waitForTimeout(120);
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'leaving all task hover scopes must clear child preview immediately');
    await page.waitForTimeout(1150);
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'a cleared target timer must not arm later');
    await page.mouse.up();
    await page.waitForTimeout(240);
    const after = await readNode(sourceId);
    const announcement = await page.locator('[data-task-child-drop-announcement="true"]').textContent();
    assert(after.parentId !== targetId,
      'leave and release may follow the current standard drag target but must not commit the stale child parent', { before, after, targetId });
    assert(!(announcement || '').includes('已移入'), 'no-op release must not announce success', { announcement });
    return { sourceId, targetId, candidateStatus, armedStatus, armed, candidateScreenshot, before, after };
  });

  await runCase('DEV068-DESK-ARMED-LEAVE', 'desktop armed child intent clears after leaving every task hover scope', async () => {
    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const generalPoint = await findPointOutsideTaskScopes();
    await page.mouse.move(generalPoint.x, generalPoint.y, { steps: 6 });
    await page.mouse.move(generalPoint.x + 1, generalPoint.y + 1, { steps: 2 });
    await page.waitForTimeout(140);
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'leaving every task hover scope must clear the armed child preview');
    await page.mouse.up();
    await page.waitForTimeout(280);
    const after = await readNode(sourceId);
    assert(after.parentId !== targetId,
      'release outside every task hover scope may use standard drag intent but must not retain the stale child parent', { before, after, targetId });
    return { sourceId, targetId, before, after, generalPoint };
  });

  await runCase('DEV068-DESK-SUBTREE-UNDO', 'desktop child move preserves a source subtree, expands target, highlights result and supports one undo/redo', async () => {
    await openApp({ width: 1440, height: 900 });
    const sourceId = 'qc-card-1';
    const targetId = 'qc-card-4';
    const beforeNodes = await readNodes();
    const sourceBefore = beforeNodes[sourceId];
    const descendants = descendantIds(beforeNodes, sourceId);
    assert(descendants.length >= 3, 'fixture source must expose a multi-level subtree', { descendants });
    const relationBefore = Object.fromEntries(descendants.map((id) => [id, beforeNodes[id]?.parentId]));
    const targetChildrenBefore = Object.values(beforeNodes)
      .filter((node) => node && !node.isArchived && node.parentId === targetId && node.id !== sourceId);
    const expectedOrder = targetChildrenBefore.reduce((max, node) => Math.max(max, node.order), -1) + 1;
    const toggle = surfaceFor(targetId).locator('[data-kanban-checklist-toggle="true"]').first();
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    assert(await toggle.getAttribute('aria-expanded') === 'false', 'target must start collapsed');
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    await page.mouse.up();
    await page.waitForTimeout(360);
    const movedNodes = await readNodes();
    const movedSource = movedNodes[sourceId];
    const relationAfter = Object.fromEntries(descendants.map((id) => [id, movedNodes[id]?.parentId]));
    assert(movedSource.parentId === targetId && movedSource.order === expectedOrder,
      'source tree root must append to exact target', { sourceBefore, movedSource, expectedOrder });
    assert(JSON.stringify(relationBefore) === JSON.stringify(relationAfter),
      'all descendant parent relations must remain unchanged', { relationBefore, relationAfter });
    await page.locator(`[data-task-id="${sourceId}"][data-task-child-drop-committed="true"]`).waitFor({ state: 'visible', timeout: 3000 });
    assert(await toggle.getAttribute('aria-expanded') === 'true', 'successful child move must expand a collapsed target');
    const screenshotPath = `${screenshotBase}-desktop-subtree-committed.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const undo = page.locator('#btn-undo');
    await page.waitForFunction(() => !document.querySelector('#btn-undo')?.hasAttribute('disabled'));
    await undo.click();
    await page.waitForTimeout(280);
    const undone = await readNode(sourceId);
    assert(undone.parentId === sourceBefore.parentId && undone.order === sourceBefore.order && undone.nodeType === sourceBefore.nodeType,
      'one undo must restore parent, order and node type', { sourceBefore, undone });
    const redo = page.locator('#btn-redo');
    await page.waitForFunction(() => !document.querySelector('#btn-redo')?.hasAttribute('disabled'));
    await redo.click();
    await page.waitForTimeout(280);
    const redone = await readNode(sourceId);
    assert(redone.parentId === movedSource.parentId && redone.order === movedSource.order && redone.nodeType === movedSource.nodeType,
      'one redo must reproduce the same child placement', { movedSource, redone });
    return { sourceId, targetId, descendants, expectedOrder, sourceBefore, movedSource, undone, redone, screenshotPath };
  });

  await runCase('DEV068-DESK-L1-SOURCE', 'desktop L1 source normalizes to task while preserving its complete subtree', async () => {
    await openApp({ width: 1440, height: 900 });
    const sourceId = 'local-col-todo';
    const targetId = 'qc-card-2';
    const beforeNodes = await readNodes();
    const sourceBefore = beforeNodes[sourceId];
    const descendants = descendantIds(beforeNodes, sourceId);
    const relationBefore = Object.fromEntries(descendants.map((id) => [id, beforeNodes[id]?.parentId]));
    assert(descendants.length > 5 && beforeNodes[targetId]?.parentId !== sourceId,
      'fixture must expose a large independent L1 subtree', { descendants: descendants.length, targetId });
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.waitForTimeout(180);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    await page.mouse.up();
    await page.waitForTimeout(380);
    const movedNodes = await readNodes();
    const movedSource = movedNodes[sourceId];
    const relationAfter = Object.fromEntries(descendants.map((id) => [id, movedNodes[id]?.parentId]));
    assert(movedSource.parentId === targetId && movedSource.nodeType === 'task',
      'L1 source must become an exact child task', { sourceBefore, movedSource });
    assert(JSON.stringify(relationBefore) === JSON.stringify(relationAfter),
      'L1 source descendants must keep their topology', { relationBefore, relationAfter });
    await page.locator('#btn-undo').click();
    await page.waitForTimeout(300);
    const restored = await readNode(sourceId);
    assert(restored.parentId === null && restored.nodeType === sourceBefore.nodeType,
      'undo must restore the source as L1 group', { sourceBefore, restored });
    return { sourceId, targetId, descendantCount: descendants.length, sourceBefore, movedSource, restored };
  });

  await runCase('DEV068-DESK-INVALIDS', 'self, descendant and duplicate title targets cannot create a cycle or ambiguous parent', async () => {
    const attempts = [];
    for (const targetKind of ['self', 'descendant']) {
      await openApp({ width: 1440, height: 900 });
      const sourceId = 'qc-card-1';
      const targetId = targetKind === 'self' ? sourceId : 'qc-card-1-child-1';
      const before = await readNode(sourceId);
      const targetPoint = await pointFor(surfaceFor(targetId));
      await beginMouseDrag(sourceId);
      await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 6 });
      await page.waitForTimeout(1150);
      assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
        `${targetKind} target must never candidate or arm`);
      await page.mouse.up();
      await page.waitForTimeout(260);
      const after = await readNode(sourceId);
      assert(after.parentId === before.parentId && after.order === before.order && after.nodeType === before.nodeType,
        `${targetKind} release must be zero-write`, { before, after });
      attempts.push({ targetKind, targetId, before, after });
    }

    await openApp({ width: 1440, height: 900 });
    const [sourceId, targetId] = (await fixtureIds()).l2Pair;
    await page.evaluate((id) => {
      const scope = document.querySelector(`[data-task-child-drop-target="true"][data-task-id="${id}"]`);
      if (!scope) return;
      const clone = scope.cloneNode(false);
      clone.setAttribute('data-dev068-duplicate-scope', 'true');
      clone.setAttribute('hidden', '');
      scope.appendChild(clone);
    }, targetId);
    await beginMouseDrag(sourceId);
    await moveMouseToTargetPrimary(targetId);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const duplicatePreview = await readChildPreview();
    assert(duplicatePreview.count === 1 && duplicatePreview.target === targetId,
      'duplicate DOM title metadata must still resolve one exact parent', duplicatePreview);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    return { attempts, duplicatePreview };
  });

  await runCase('DEV068-DESK-CANCEL-MATRIX', 'desktop pointer, lifecycle and viewport changes are terminal zero-write cancellations', async () => {
    const cancellations = [];
    for (const reason of ['escape', 'pointercancel', 'blur', 'pagehide', 'visibilitychange', 'orientationchange', 'resize']) {
      await openApp({ width: 1440, height: 900 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const before = await readNode(sourceId);
      await beginMouseDrag(sourceId);
      await moveMouseToTargetPrimary(targetId);
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      if (reason === 'escape') await page.keyboard.press('Escape');
      else if (reason === 'pointercancel') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
      else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else if (reason === 'pagehide') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      else if (reason === 'visibilitychange') {
        await page.evaluate(() => {
          const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
          else delete document.visibilityState;
        });
      } else if (reason === 'orientationchange') await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
      else await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(120);
      await page.mouse.up().catch(() => undefined);
      await page.waitForTimeout(220);
      const after = await readNode(sourceId);
      const transient = await readTransientState();
      assert(after.parentId === before.parentId && after.order === before.order && after.nodeType === before.nodeType,
        `${reason} must be zero-write`, { before, after });
      assert(transient.childPreview === 0 && transient.desktopOverlay === 0 && transient.desktopIndicator === 0,
        `${reason} must clear all desktop drag feedback`, transient);
      await beginMouseDrag(sourceId);
      await moveMouseToTargetPrimary(targetId);
      await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
      await page.mouse.up();
      cancellations.push({ reason, transient, retry: 'PASS' });
    }
    return { cancellations };
  });

  await runCase('DEV068-DESK-STALE-REVALIDATION', 'viewer, revoked permission, filtered, archived and removed targets are zero-write in rendered release flow', async () => {
    const evidence = [];

    await openApp({ width: 1440, height: 900 });
    const fixture = await fixtureIds();
    const [viewerSourceId] = fixture.l2Pair;
    await setMovePermission(false);
    await page.waitForTimeout(120);
    const viewerPoint = await pointFor(surfaceFor(viewerSourceId));
    await page.mouse.move(viewerPoint.x, viewerPoint.y);
    await page.mouse.down();
    await page.mouse.move(viewerPoint.x + 18, viewerPoint.y + 3, { steps: 4 });
    await page.waitForTimeout(180);
    const viewerOverlay = await page.locator('[data-kanban-drag-overlay="true"]').count();
    await page.mouse.up();
    assert(viewerOverlay === 0, 'move-denied viewer must not start a desktop drag', { viewerOverlay });
    evidence.push({ scenario: 'viewer', overlay: viewerOverlay });

    for (const scenario of ['permission-revoked', 'target-filtered', 'target-archived', 'target-removed']) {
      await openApp({ width: 1440, height: 900 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const beforeNodes = await readRuntimeNodes();
      const sourceBefore = beforeNodes[sourceId];
      await beginMouseDrag(sourceId);
      await moveMouseToTargetPrimary(targetId);
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      if (scenario === 'permission-revoked') await setMovePermission(false);
      else if (scenario === 'target-filtered') {
        await targetScopeFor(targetId).evaluate((scope) => {
          if (!(scope instanceof HTMLElement)) throw new Error('target scope not found');
          scope.dataset.qcFilteredOut = 'true';
          scope.style.display = 'none';
        });
      }
      else if (scenario === 'target-archived') await patchRuntimeNode(targetId, { isArchived: true });
      else await removeRuntimeNode(targetId);
      await page.waitForTimeout(160);
      await page.mouse.up().catch(() => undefined);
      await page.waitForTimeout(280);
      const afterNodes = await readRuntimeNodes();
      const sourceAfter = afterNodes[sourceId];
      const transient = await readTransientState();
      assert(sourceAfter.parentId === sourceBefore.parentId && sourceAfter.order === sourceBefore.order && sourceAfter.nodeType === sourceBefore.nodeType,
        `${scenario} release must not mutate source`, { sourceBefore, sourceAfter });
      assert(transient.childPreview === 0 && transient.desktopOverlay === 0,
        `${scenario} must clean child and desktop overlays`, transient);
      evidence.push({ scenario, sourceBefore, sourceAfter, transient });
    }
    return { evidence };
  });

  await runCase('DEV068-DESK-SCOPE-CONTROLS', 'the complete DEV-065 hover scope owns child intent while interactive controls stay excluded', async () => {
    const samples = [];
    const titleSamples = [
      '這是一個非常長而且需要被截斷但仍然要能精準命中的中文任務標題'.repeat(2),
      'LONG_UNBROKEN_ENGLISH_TASK_TITLE_'.repeat(8),
      '',
    ];
    for (const title of titleSamples) {
      await openApp({ width: 1024, height: 768 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      await patchRuntimeNode(targetId, { title });
      await page.waitForTimeout(100);
      const titleSlot = titleSlotFor(targetId);
      const geometry = await page.evaluate(({ targetId }) => {
        const target = document.querySelector(`[data-task-child-drop-target="true"][data-task-id="${targetId}"]`);
        const primary = target?.querySelector(':scope > [data-task-surface-source="true"]');
        const subtree = target?.querySelector(':scope > [data-task-surface-subtree="true"]');
        const slot = document.querySelector(`[data-task-title-slot="true"][data-task-id="${targetId}"]`);
        const titleText = slot?.querySelector(':scope > span');
        const targetRect = target?.getBoundingClientRect();
        const primaryRect = primary?.getBoundingClientRect();
        const subtreeRect = subtree?.getBoundingClientRect();
        const slotRect = slot?.getBoundingClientRect();
        const titleTextRect = titleText?.getBoundingClientRect();
        return {
          targetTag: target?.tagName || null,
          isDesktopHoverScope: target?.getAttribute('data-desktop-task-hover-scope') === 'true',
          primaryIsDirectChild: primary?.parentElement === target,
          targetRect: targetRect ? { left: targetRect.left, top: targetRect.top, right: targetRect.right, bottom: targetRect.bottom, width: targetRect.width, height: targetRect.height } : null,
          primaryRect: primaryRect ? { left: primaryRect.left, top: primaryRect.top, right: primaryRect.right, bottom: primaryRect.bottom, width: primaryRect.width, height: primaryRect.height } : null,
          subtreeRect: subtreeRect ? { left: subtreeRect.left, top: subtreeRect.top, right: subtreeRect.right, bottom: subtreeRect.bottom, width: subtreeRect.width, height: subtreeRect.height } : null,
          slotRect: slotRect ? { left: slotRect.left, right: slotRect.right, width: slotRect.width } : null,
          titleTextRect: titleTextRect ? { left: titleTextRect.left, right: titleTextRect.right, width: titleTextRect.width } : null,
          tailGap: titleTextRect && slotRect ? slotRect.right - titleTextRect.right : null,
        };
      }, { targetId });
      assert(geometry.targetTag === 'DIV' && geometry.isDesktopHoverScope && geometry.primaryIsDirectChild
        && geometry.targetRect && geometry.primaryRect && geometry.slotRect && geometry.titleTextRect,
      'child target must be the same complete task scope used by DEV-065 hover preselection', { title, geometry });
      assert(geometry.targetRect.left <= geometry.primaryRect.left + 1
        && geometry.targetRect.top <= geometry.primaryRect.top + 1
        && geometry.targetRect.right >= geometry.primaryRect.right - 1
        && geometry.targetRect.bottom >= geometry.primaryRect.bottom - 1
        && (!geometry.subtreeRect || (
          geometry.targetRect.left <= geometry.subtreeRect.left + 1
          && geometry.targetRect.top <= geometry.subtreeRect.top + 1
          && geometry.targetRect.right >= geometry.subtreeRect.right - 1
          && geometry.targetRect.bottom >= geometry.subtreeRect.bottom - 1
        )),
      'the target scope must contain both its primary task and visible descendant frame', { title, geometry });

      let probeKind = 'primary-blank';
      let probePoint;
      if (geometry.tailGap !== null && geometry.tailGap >= 16) {
        probeKind = 'title-tail';
        probePoint = await pointFor(titleSlot, 0.96, 0.5);
        assert(probePoint.x > geometry.titleTextRect.right + 4,
          'tail probe must be visibly after the rendered title text', { title, geometry, probePoint });
      } else probePoint = await pointFor(surfaceFor(targetId), 0.5, 0.94);

      await beginMouseDrag(sourceId);
      await page.mouse.move(probePoint.x, probePoint.y, { steps: 6 });
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      const preview = await readChildPreview();
      const liveStatus = await page.locator('[data-task-child-drop-live-status="true"]').textContent();
      assert(preview.target === targetId && preview.childInsertionCount === 1
        && preview.hitScopeRect
        && Math.abs((preview.hitScopeRect.right - preview.hitScopeRect.left) - geometry.targetRect.width) <= 2
        && Math.abs((preview.hitScopeRect.bottom - preview.hitScopeRect.top) - geometry.targetRect.height) <= 2,
      'every title variant and blank primary area must arm the exact complete hover scope', { title, probeKind, probePoint, preview, geometry });
      assert((liveStatus || '').includes(title || '未命名任務'),
        'assistive text must use the exact title or fallback', { title, liveStatus });
      if (samples.length === 0) await page.screenshot({ path: `${screenshotBase}-desktop-long-title.png`, fullPage: false });
      await page.keyboard.press('Escape');
      await page.mouse.up().catch(() => undefined);
      samples.push({ titleLength: title.length, targetId, probeKind, probePoint, geometry, preview, liveStatus });
    }

    await openApp({ width: 1440, height: 900 });
    const [sourceId, targetId] = (await fixtureIds()).l2Pair;
    assert(sourceId && targetId, 'control exclusion fixture must expose independent source and target tasks');
    await beginMouseDrag(sourceId);
    const toggle = surfaceFor(targetId).locator('[data-kanban-checklist-toggle="true"]').first();
    const controlPoint = await pointFor(toggle);
    await page.mouse.move(controlPoint.x, controlPoint.y, { steps: 6 });
    await page.waitForTimeout(1150);
    const controlPreviewCount = await page.locator('[data-task-child-drop-preview="true"]').count();
    await page.mouse.up();
    assert(controlPreviewCount === 0, 'interactive expand control must never become a child target', { controlPoint });
    return { samples, controlPoint, controlPreviewCount };
  });

  await runCase('DEV068-MOB-900', 'mobile complete hover-scope hold below one second preserves the standard drop', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    const targetBefore = await readNode(targetId);
    const targetPoint = await pointFor(surfaceFor(targetId));
    const targetScopeBefore = await targetScopeFor(targetId).boundingBox();
    const held = await startHeldTouch(sourceId);
    await held.moveTo(targetPoint);
    await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(720);
    const candidate = await readChildPreview();
    assert(candidate.input === 'touch' && candidate.childInsertionCount === 0
      && candidate.sourceFrameCount === 0 && candidate.subtreeFrameCount === 0 && candidate.scopeFrameCount === 0
      && candidate.parentRect === null && candidate.subtreeRect === null
      && candidate.standardInsertionIndicatorCount === 1
      && candidate.hitScopeRect && targetScopeBefore
      && Math.abs(candidate.safeWidth - targetScopeBefore.width) <= 2
      && Math.abs(candidate.safeHeight - targetScopeBefore.height) <= 2,
      'mobile candidate must keep the complete hit scope without rendering child frames before arming', { candidate, targetScopeBefore });
    await held.end();
    const after = await readNode(sourceId);
    assert(after.parentId === targetBefore.parentId && after.parentId !== targetId,
      'mobile sub-threshold release may use the standard target but must not commit child placement', { before, targetBefore, after });
    return { sourceId, targetId, candidate, before, targetBefore, after };
  });

  await runCase('DEV068-MOB-ARMED', 'mobile armed hover-scope preview commits exact child once', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const targetBefore = await readNode(targetId);
    const targetPoint = await pointFor(surfaceFor(targetId));
    const held = await startHeldTouch(sourceId);
    await held.moveTo(targetPoint);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const armed = await readChildPreview();
    const sourceOverlay = await readSourceOverlayGeometry(targetPoint);
    assert(armed.count === 1 && armed.childInsertionCount === 1
      && armed.sourceFrameCount === 0 && armed.subtreeFrameCount === 0 && armed.scopeFrameCount === 0
      && armed.parentRect === null && armed.subtreeRect === null
      && armed.standardInsertionIndicatorCount === 0
      && armed.childInsertionRect.left >= 0 && armed.childInsertionRect.right <= armed.viewport.width
      && armed.childInsertionRect.top >= 48 && armed.childInsertionRect.bottom <= armed.viewport.height,
    'mobile armed preview must render only one child insertion marker and stay inside the viewport/action-rail safe area', armed);
    assert(sourceOverlay.kind === 'mobile'
      && sourceOverlay.anchor === 'finger'
      && sourceOverlay.placement === 'upper-right'
      && ['upper-right', 'upper-left'].includes(sourceOverlay.edgePlacement)
      && sourceOverlay.pointerGap === 16
      && sourceOverlay.sourceRect.left >= 8 - 1
      && sourceOverlay.sourceRect.right <= sourceOverlay.viewport.width - 8 + 1
      && sourceOverlay.sourceRect.bottom <= targetPoint.y - sourceOverlay.gap + 1
      && !sourceOverlay.overlapsChildInsertion,
    'mobile source preview must prefer upper-right, clamp safely at narrow edges, and stay above the finger without covering child feedback', sourceOverlay);
    const screenshotPath = `${screenshotBase}-mobile-armed.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await readNode(sourceId);
    assert(after.parentId === targetId && after.nodeType === 'task',
      'mobile armed release must commit exact parent', { sourceId, targetId, after });
    const debug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
    const completions = debug.filter((entry) => entry.type === 'terminal:complete' && entry.nodeId === sourceId);
    assert(completions.length === 1, 'mobile child drop must terminate exactly once', { completions });
    return { sourceId, targetId, targetTitle: targetBefore.title, armed, sourceOverlay, after, completions: completions.length, screenshotPath };
  });

  await runCase('DEV068-MOB-ORIGIN-CHILD', 'mobile child append at the original position shows the source title and is zero-write', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.originPair;
    assert(sourceId && targetId, 'fixture must expose a visible mobile last child and its current parent', fixture);
    const before = await readNode(sourceId);
    const held = await startHeldTouch(sourceId);
    await held.moveTo(await pointFor(surfaceFor(targetId)));
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const armed = await readChildPreview();
    assert(armed.childInsertionCount === 1
      && armed.childOriginFieldCount === 1
      && armed.childGenericMarkerCount === 0
      && armed.childOriginTitle === before.title
      && armed.childOriginNoop === 'true'
      && armed.childOriginStyle?.backgroundColor === 'rgb(99, 102, 241)'
      && armed.childOriginStyle?.color === 'rgb(255, 255, 255)',
    'mobile origin child preview must reuse the blue source-title field instead of a generic insertion line', { before, armed });
    const screenshotPath = `${screenshotBase}-mobile-origin-child.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await held.end();
    const after = await readNode(sourceId);
    const transient = await readTransientState();
    assert(JSON.stringify(after) === JSON.stringify(before),
      'mobile origin child release must preserve the complete source node snapshot', { before, after });
    assert(Object.values(transient).every((value) => value === 0 || value === false),
      'mobile origin child release must clear every transient surface', transient);
    return { sourceId, targetId, before, armed, after, transient, screenshotPath };
  });

  await runCase('DEV068-MOB-L1-SCOPE', 'mobile L2 source becomes a direct L2 child when the L1 hover scope visibly arms', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const sourceId = fixture.l2[0];
    const sourceBefore = await readNode(sourceId);
    const targetId = fixture.l1.find((id) => id !== sourceBefore.parentId);
    assert(sourceId && targetId, 'fixture must expose an L2 source and independent L1 target', fixture);
    const held = await startHeldTouch(sourceId);
    await held.moveTo(await pointFor(surfaceFor(targetId)));
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    const preview = await readChildPreview();
    assert(preview.target === targetId && preview.input === 'touch' && preview.childInsertionCount === 1,
      'mobile L1 center must visibly arm the exact L1 parent', { preview, targetId });
    await held.end();
    const after = await readNode(sourceId);
    assert(after.parentId === targetId && after.nodeType === 'task',
      'mobile L1 center release must keep the source as a direct L2 task', { sourceBefore, after, targetId });
    return { sourceId, targetId, sourceBefore, preview, after };
  });

  await runCase('DEV068-MOB-ACTION', 'mobile action rail cancels child dwell and owns release', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    const held = await startHeldTouch(sourceId);
    await held.moveTo(await pointFor(surfaceFor(targetId)));
    await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
    const actionPoint = await pointFor(page.locator('[data-mobile-task-action="toggle-complete"]').first());
    await held.moveTo(actionPoint);
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => ({
      childPreviewCount: document.querySelectorAll('[data-task-child-drop-preview="true"]').length,
      activeActionClass: document.querySelector('[data-mobile-task-action="toggle-complete"]')?.getAttribute('class') || '',
    }));
    assert(state.childPreviewCount === 0 && state.activeActionClass.includes('bg-emerald-500'),
      'action rail must clear child candidate and become the only active target', state);
    await held.end();
    const after = await readNode(sourceId);
    assert(after.parentId === before.parentId && after.status !== before.status,
      'action release may toggle status but must never move parent', { before, after });
    return { sourceId, targetId, state, before, after };
  });

  await runCase('DEV068-MOB-CANCEL', 'mobile touchcancel clears armed preview and preserves data', async () => {
    await openApp({ width: 390, height: 844 });
    const fixture = await fixtureIds();
    const [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    const held = await startHeldTouch(sourceId);
    await held.moveTo(await pointFor(surfaceFor(targetId)));
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    await held.cancel();
    const after = await readNode(sourceId);
    const transient = await page.evaluate(() => ({
      child: document.querySelectorAll('[data-task-child-drop-preview="true"]').length,
      rail: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
      preview: document.querySelectorAll('[data-mobile-drag-preview="true"]').length,
    }));
    assert(before.parentId === after.parentId && before.order === after.order && Object.values(transient).every((count) => count === 0),
      'touchcancel must clear session and produce zero write', { before, after, transient });
    return { sourceId, targetId, before, after, transient };
  });

  await runCase('DEV068-MOB-CANCEL-MATRIX', 'mobile pointer, lifecycle and viewport changes clear an armed child session without writes', async () => {
    const cancellations = [];
    for (const reason of ['pointercancel', 'escape', 'blur', 'pagehide', 'visibilitychange', 'orientationchange', 'resize']) {
      await openApp({ width: 390, height: 844 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const before = await readNode(sourceId);
      const held = await startHeldTouch(sourceId);
      await held.moveTo(await pointFor(surfaceFor(targetId)));
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });

      let contextMenuSuppressed = null;
      if (reason === 'orientationchange') {
        contextMenuSuppressed = await page.evaluate(() => {
          const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.dispatchEvent(event);
          return event.defaultPrevented && !document.querySelector('[data-global-context-menu="true"]');
        });
        assert(contextMenuSuppressed, 'synthetic mobile contextmenu must be suppressed during an active session');
      }

      if (reason === 'pointercancel') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', bubbles: true })));
      else if (reason === 'escape') await page.keyboard.press('Escape');
      else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else if (reason === 'pagehide') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      else if (reason === 'visibilitychange') {
        await page.evaluate(() => {
          const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
          else delete document.visibilityState;
        });
      } else if (reason === 'orientationchange') await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
      else await page.evaluate(() => window.dispatchEvent(new Event('resize')));

      await page.waitForTimeout(140);
      await held.end();
      const after = await readNode(sourceId);
      const transient = await readTransientState();
      assert(after.parentId === before.parentId && after.order === before.order && after.nodeType === before.nodeType,
        `${reason} must be a zero-write cancellation`, { before, after });
      assert(Object.values(transient).every((value) => value === 0 || value === false),
        `${reason} must clear every transient drag surface`, transient);

      const retry = await startHeldTouch(sourceId);
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 3000 });
      await retry.end();
      cancellations.push({ reason, contextMenuSuppressed, transient, retry: 'PASS' });
    }
    return { cancellations };
  });

  await runCase('DEV068-MOB-DEEP', 'mobile L3+ hover scope accepts an exact next-level child', async () => {
    await openApp({ width: 430, height: 932 });
    const fixture = await fixtureIds();
    assert(fixture.l3Pair.length === 2, 'fixture must expose independent mobile L3+ tasks', fixture);
    const [sourceId, targetId] = fixture.l3Pair;
    const targetPoint = await pointFor(surfaceFor(targetId));
    const held = await startHeldTouch(sourceId);
    await held.moveTo(targetPoint);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    await held.end();
    const after = await readNode(sourceId);
    assert(after.parentId === targetId, 'mobile deep child drop must use exact target id', { sourceId, targetId, after });
    return { sourceId, targetId, after };
  });

  await runCase('DEV068-MOB-MOTION-SCROLL', 'mobile complete-scope motion resets dwell and edge scroll cannot retain a stale child target', async () => {
    await openApp({ width: 430, height: 932 });
    let fixture = await fixtureIds();
    let [sourceId, targetId] = fixture.l2Pair;
    const before = await readNode(sourceId);
    const targetPoint = await pointFor(surfaceFor(targetId));
    let held = await startHeldTouch(sourceId);
    await held.moveTo(targetPoint);
    await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
    await held.moveExact({ x: targetPoint.x + 2, y: targetPoint.y + 1 });
    await page.waitForTimeout(120);
    const stable = await readChildPreview();
    assert(stable.phase === 'armed' && stable.target === targetId,
      'micro movement inside the task hover scope must preserve the exact armed target', stable);
    const outsidePoint = await findPointOutsideTaskScopes();
    await held.moveExact(outsidePoint);
    await page.waitForTimeout(120);
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'leaving every task hover scope must clear child preview immediately');
    await page.waitForTimeout(1150);
    assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
      'outside point must never be magnetized back into an old child target');
    await held.moveExact({ x: targetPoint.x, y: targetPoint.y });
    await page.waitForTimeout(430);
    const restarted = await readChildPreview();
    assert(restarted.phase === 'candidate' && restarted.target === targetId && restarted.childInsertionCount === 0,
      're-entering the task hover scope must restart a fresh dwell', restarted);
    await held.cancel();
    const afterMotionCancel = await readNode(sourceId);
    assert(afterMotionCancel.parentId === before.parentId && afterMotionCancel.order === before.order,
      'motion and cancel must remain zero-write', { before, afterMotionCancel });

    await openApp({ width: 390, height: 844 });
    fixture = await fixtureIds();
    [sourceId, targetId] = fixture.l2Pair;
    const beforeScrollRelease = await readNode(sourceId);
    const board = page.locator('[data-layout-region="board-canvas"]');
    await board.evaluate((element) => { element.scrollLeft = 0; });
    const scrollTargetPoint = await pointFor(surfaceFor(targetId));
    held = await startHeldTouch(sourceId);
    await held.moveTo(scrollTargetPoint);
    await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(560);
    await held.moveExact({ x: 388, y: Math.max(120, Math.min(760, scrollTargetPoint.y)) });
    await page.waitForTimeout(850);
    const scrollLeft = await board.evaluate((element) => element.scrollLeft);
    const postScrollPreview = await readChildPreview();
    assert(scrollLeft > 0 && postScrollPreview.target !== targetId,
      'edge auto-scroll must discard the pre-scroll child target; a newly rendered target under the finger may replace it',
      { scrollLeft, targetId, postScrollPreview });
    const wasVisiblyArmed = postScrollPreview.phase === 'armed';
    await held.end();
    const afterScrollRelease = await readNode(sourceId);
    const scrollDebug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
    const endDrop = [...scrollDebug].reverse().find((entry) => entry.type === 'end:drop' && entry.nodeId === sourceId) || null;
    if (endDrop?.targetSurfaceKind === 'task-title-child') {
      assert(wasVisiblyArmed && afterScrollRelease.parentId === postScrollPreview.target,
        'edge release may commit only the fresh target that was visibly armed after scrolling',
        { postScrollPreview, beforeScrollRelease, afterScrollRelease, endDrop });
    } else {
      assert(afterScrollRelease.parentId !== targetId,
        'edge release must never commit the pre-scroll child target',
        { targetId, postScrollPreview, beforeScrollRelease, afterScrollRelease, endDrop });
    }
    assert(postScrollPreview.phase !== 'candidate' || endDrop?.targetSurfaceKind !== 'task-title-child',
      'a candidate-only post-scroll preview must not become a child placement on release', { postScrollPreview, endDrop });
    return { stable, restarted, scrollLeft, postScrollPreview, beforeScrollRelease, afterScrollRelease, endDrop };
  });

  await runCase('DEV068-MOB-ACTION-MATRIX', 'all mobile action-rail targets own release and never also perform a child move', async () => {
    const actionEvidence = [];
    for (const action of ['toggle-complete', 'add-sibling', 'add-child', 'delete']) {
      await openApp({ width: 390, height: 844 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const beforeNodes = await readNodes();
      const sourceBefore = beforeNodes[sourceId];
      const held = await startHeldTouch(sourceId);
      await held.moveTo(await pointFor(surfaceFor(targetId)));
      await page.locator('[data-task-child-drop-phase="candidate"]').waitFor({ state: 'visible' });
      const actionPoint = await pointFor(page.locator(`[data-mobile-task-action="${action}"]`).first());
      await held.moveTo(actionPoint);
      await page.waitForTimeout(100);
      assert(await page.locator('[data-task-child-drop-preview="true"]').count() === 0,
        `${action} must clear child candidate before release`);
      await held.end();

      if (action === 'delete') {
        const confirm = page.getByRole('button', { name: '確認' }).last();
        await confirm.waitFor({ state: 'visible', timeout: 5000 });
        await confirm.click();
        await page.waitForTimeout(260);
      } else if (action === 'add-sibling' || action === 'add-child') {
        const modal = page.locator('[data-task-details-modal="true"]').first();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await page.locator('[data-task-details-modal="true"] [aria-label="關閉任務詳情"]').click();
        await modal.waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
      }

      const afterNodes = await readNodes();
      const sourceAfter = afterNodes[sourceId];
      const newIds = Object.keys(afterNodes).filter((id) => !beforeNodes[id]);
      if (action === 'toggle-complete') {
        assert(sourceAfter.parentId === sourceBefore.parentId && sourceAfter.status !== sourceBefore.status && newIds.length === 0,
          'toggle action must only change source status', { sourceBefore, sourceAfter, newIds });
      } else if (action === 'add-sibling') {
        assert(newIds.length === 1 && afterNodes[newIds[0]].parentId === sourceBefore.parentId,
          'add-sibling must create exactly one sibling', { newIds, sourceBefore, created: afterNodes[newIds[0]] });
      } else if (action === 'add-child') {
        assert(newIds.length === 1 && afterNodes[newIds[0]].parentId === sourceId,
          'add-child must create exactly one direct child', { newIds, created: afterNodes[newIds[0]] });
      } else {
        assert(sourceAfter?.isArchived === true, 'delete must archive only the source after confirmation', { sourceAfter });
      }
      assert(sourceAfter?.parentId === sourceBefore.parentId && sourceAfter?.parentId !== targetId,
        `${action} must not also move source under the child target`, { sourceBefore, sourceAfter, targetId });
      const debug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      const terminals = debug.filter((entry) => entry.type === 'terminal:complete' && entry.nodeId === sourceId);
      assert(terminals.length === 1, `${action} must complete exactly one terminal`, { terminals });
      actionEvidence.push({ action, sourceId, targetId, newIds, terminalCount: terminals.length, sourceBefore, sourceAfter });
    }
    return { actionEvidence };
  });

  await runCase('DEV068-MOB-TRIALS', 'ten mobile child commits and ten armed cancels have zero wrong parent, double commit or stuck session', async () => {
    const commits = [];
    const cancels = [];
    for (let index = 0; index < 10; index += 1) {
      await openApp({ width: index % 2 === 0 ? 390 : 430, height: index % 2 === 0 ? 844 : 932 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const held = await startHeldTouch(sourceId);
      await held.moveTo(await pointFor(surfaceFor(targetId)));
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      await held.end();
      const after = await readNode(sourceId);
      const debug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
      const completions = debug.filter((entry) => entry.type === 'terminal:complete' && entry.nodeId === sourceId);
      assert(after.parentId === targetId && completions.length === 1,
        'mobile commit trial must use exact parent and one terminal', { index, sourceId, targetId, after, completions });
      commits.push({ index, sourceId, targetId, parentId: after.parentId, terminalCount: completions.length });
    }
    for (let index = 0; index < 10; index += 1) {
      await openApp({ width: index % 2 === 0 ? 390 : 430, height: index % 2 === 0 ? 844 : 932 });
      const [sourceId, targetId] = (await fixtureIds()).l2Pair;
      const before = await readNode(sourceId);
      const held = await startHeldTouch(sourceId);
      await held.moveTo(await pointFor(surfaceFor(targetId)));
      await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      await held.cancel();
      const after = await readNode(sourceId);
      const transient = await readTransientState();
      assert(after.parentId === before.parentId && after.order === before.order
        && Object.values(transient).every((value) => value === 0 || value === false),
      'armed cancel trial must be zero-write and fully clean', { index, before, after, transient });
      const retry = await startHeldTouch(sourceId);
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 3000 });
      await retry.end();
      cancels.push({ index, sourceId, targetId, transient, retry: 'PASS' });
    }
    return { commits, cancels, wrongParent: 0, doubleCommit: 0, stuckSession: 0 };
  });

  await runCase('DEV068-VIEWPORTS', 'candidate and armed preview remain usable across five required viewports', async () => {
    const viewports = [
      { width: 1440, height: 900, input: 'mouse' },
      { width: 1024, height: 768, input: 'mouse' },
      { width: 390, height: 844, input: 'touch' },
      { width: 430, height: 932, input: 'touch' },
      { width: 320, height: 844, input: 'touch' },
    ];
    const evidence = [];
    for (const viewport of viewports) {
      await openApp({ width: viewport.width, height: viewport.height });
      const fixture = await fixtureIds();
      const [sourceId, targetId] = fixture.l2Pair;
      if (viewport.input === 'mouse') {
        await beginMouseDrag(sourceId);
        await moveMouseToTargetPrimary(targetId);
        await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
      } else {
        const targetPoint = await pointFor(surfaceFor(targetId));
        const held = await startHeldTouch(sourceId);
        await held.moveTo(targetPoint);
        await page.locator('[data-task-child-drop-phase="armed"]').waitFor({ state: 'visible', timeout: 1800 });
        viewport.held = held;
      }
      const preview = await readChildPreview();
      assert(preview.childInsertionRect
        && preview.childInsertionRect.left >= 0
        && preview.childInsertionRect.right <= viewport.width
        && preview.childInsertionRect.top >= (viewport.input === 'touch' ? 48 : 0)
        && preview.childInsertionRect.bottom <= viewport.height,
      'armed child insertion marker must fit viewport', { viewport, preview });
      const screenshotPath = `${screenshotBase}-viewport-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      evidence.push({ viewport: { width: viewport.width, height: viewport.height, input: viewport.input }, preview, screenshotPath, sweep: await visibleErrorSweep(`viewport-${viewport.width}`) });
      if (viewport.input === 'mouse') await page.keyboard.press('Escape');
      else await viewport.held.cancel();
    }
    return { evidence };
  });

  const unexpectedDiagnostics = diagnostics.filter((message) => !/favicon|ResizeObserver/i.test(message));
  const unexpectedNetworkFailures = networkFailures.filter((message) => !/favicon/i.test(message));
  results.push({
    id: 'DEV068-ERROR-SWEEP',
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
    localStorage.setItem('dev068-task-title-center-child-drop-result', JSON.stringify(payload));
  }, summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) throw new Error(`DEV-068 browser verification failed: ${JSON.stringify(failed)}`);
  return summary;
}
