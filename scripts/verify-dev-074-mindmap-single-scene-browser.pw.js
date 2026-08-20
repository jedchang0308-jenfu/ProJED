/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'DEV-074 本機驗證',
    createdAt: 1704067200000,
  };
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  const workspace = {
    id: 'dev074-workspace',
    title: 'DEV-074 單一 Scene 座標驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev074-board',
      title: 'DEV-074 心智圖',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const baseNode = (id, title, order, parentId = null) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'dev074-board',
    parentId,
    title,
    status: 'todo',
    nodeType: 'task',
    order,
    createdAt: 1704067200000 + order,
    updatedAt: 1704067200000 + order,
  });
  const nodes = {
    'dev074-root-a': baseNode('dev074-root-a', 'DEV-074 Root A', 0),
    'dev074-root-b': baseNode('dev074-root-b', 'DEV-074 Root B', 1),
    'dev074-child-a': baseNode('dev074-child-a', 'DEV-074 Child A', 0, 'dev074-root-a'),
    'dev074-child-b': baseNode('dev074-child-b', 'DEV-074 Child B', 0, 'dev074-root-b'),
  };
  const relationship = {
    id: 'dev074-relationship',
    boardId: 'dev074-board',
    fromId: 'dev074-root-a',
    toId: 'dev074-root-b',
    label: 'DEV-074 relationship',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    style: { arrowEnd: true, strokeDasharray: '7 6' },
  };

  const waitForMindMap = async () => {
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-viewport="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-scene="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-node]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(250);
  };

  let fixtureLoaded = false;
  const selectMindMapIfNeeded = async () => {
    if (await page.locator('[data-mindmap-view]').first().isVisible().catch(() => false)) return;
    const trigger = page.locator('[data-mode-switcher-trigger="true"]').first();
    await trigger.waitFor({ state: 'visible', timeout: 10000 });
    await trigger.click();
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await waitForMindMap();
  };

  const writeFixture = async () => {
    await page.evaluate(({ account, workspace, nodes, relationship }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev074-board');
      localStorage.setItem('projed-last-view', 'mindmap');
      localStorage.setItem('projed.mindmap.noteRelationships.dev074-board', JSON.stringify([relationship]));
    }, { account, workspace, nodes, relationship });
  };

  const openFixture = async (viewport) => {
    await page.setViewportSize(viewport);
    if (fixtureLoaded) {
      if (viewport.width <= 640) {
        await page.waitForTimeout(350);
        return;
      }
      await waitForMindMap();
      return;
    }
    await page.goto('http://localhost:4000/?dev074Phase=after', { waitUntil: 'domcontentloaded' });
    await writeFixture();
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.locator('nav').count() === 0) {
      const loginButton = page.getByRole('button', { name: /使用固定測試環境/ }).first();
      await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      await loginButton.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
      await writeFixture();
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    try {
      await selectMindMapIfNeeded();
      fixtureLoaded = true;
    } catch (error) {
      const debug = await page.evaluate(() => ({
        session: localStorage.getItem('projed-local-test.session'),
        selectedAccount: localStorage.getItem('projed-local-test.selected-account'),
        lastView: localStorage.getItem('projed-last-view'),
        lastBoard: localStorage.getItem('projed-last-board'),
        body: document.body.innerText.slice(0, 500),
      }));
      throw new Error(`${error.message}; DEV-074 auth/debug=${JSON.stringify(debug)}`);
    }
  };

  const getVisibleErrors = async () => {
    const bodyText = await page.locator('body').innerText();
    return [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ].filter(pattern => bodyText.includes(pattern));
  };

  const assertNoVisibleErrors = async (label) => {
    const visibleErrors = await getVisibleErrors();
    assert(visibleErrors.length === 0, `${label} should not show visible runtime errors`, { visibleErrors });
  };

  const finite = (value) => Number.isFinite(value);

  const readGeometry = async () => page.evaluate(() => {
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    const stage = document.querySelector('[data-mindmap-stage-sizer="true"]');
    const scene = document.querySelector('[data-mindmap-scene="true"]');
    const nodeElements = Array.from(document.querySelectorAll('[data-mindmap-node]'));
    const nodeRect = (id) => {
      const element = id === 'center'
        ? document.querySelector('[data-mindmap-center]')
        : document.querySelector(`[data-mindmap-node="${id}"]`);
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const screenPoint = (element, x, y) => {
      const ctm = element?.getScreenCTM?.();
      if (!ctm) return null;
      const point = new DOMPoint(x, y).matrixTransform(ctm);
      return { x: point.x, y: point.y };
    };
    const nearestEdgeDistance = (point, rect) => {
      if (!point || !rect) return Infinity;
      const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
      const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
      if (dx === 0 && dy === 0) {
        return Math.min(point.x - rect.left, rect.right - point.x, point.y - rect.top, rect.bottom - point.y);
      }
      return Math.hypot(dx, dy);
    };
    const connectors = Array.from(document.querySelectorAll('[data-mindmap-connector-path]'));
    const connector = connectors[0];
    const relationshipPath = document.querySelector('[data-mindmap-note-relationship-path]');
    const connectorSvg = connector?.ownerSVGElement;
    const relationshipSvg = relationshipPath?.ownerSVGElement;
    const parse = (element, key) => Number(element?.getAttribute(key));
    const connectorFrom = screenPoint(connectorSvg, parse(connector, 'data-from-x'), parse(connector, 'data-from-y'));
    const connectorTo = screenPoint(connectorSvg, parse(connector, 'data-to-x'), parse(connector, 'data-to-y'));
    const relationshipFrom = screenPoint(relationshipSvg, parse(relationshipPath, 'data-from-x'), parse(relationshipPath, 'data-from-y'));
    const relationshipTo = screenPoint(relationshipSvg, parse(relationshipPath, 'data-to-x'), parse(relationshipPath, 'data-to-y'));
    const rect = element => {
      const value = element?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
    };
    return {
      viewport: rect(viewport),
      stage: rect(stage),
      scene: rect(scene),
      sceneTransform: scene?.style.transform || '',
      scroll: { left: viewport?.scrollLeft || 0, top: viewport?.scrollTop || 0, width: viewport?.scrollWidth || 0, height: viewport?.scrollHeight || 0 },
      scrollOwners: document.querySelectorAll('[data-mindmap-scroll-owner="true"]').length,
      nodeCount: nodeElements.length,
      connectorCount: document.querySelectorAll('[data-mindmap-connector-path]').length,
      relationshipCount: document.querySelectorAll('[data-mindmap-note-relationship-path]').length,
      connectorEndpointError: connectors.reduce((maxError, element) => {
        const svg = element.ownerSVGElement;
        const from = screenPoint(svg, parse(element, 'data-from-x'), parse(element, 'data-from-y'));
        const to = screenPoint(svg, parse(element, 'data-to-x'), parse(element, 'data-to-y'));
        return Math.max(
          maxError,
          nearestEdgeDistance(from, nodeRect(element.getAttribute('data-from-node-id'))),
          nearestEdgeDistance(to, nodeRect(element.getAttribute('data-to-node-id'))),
        );
      }, 0),
      relationshipEndpointError: Math.max(
        nearestEdgeDistance(relationshipFrom, nodeRect('dev074-root-a')),
        nearestEdgeDistance(relationshipTo, nodeRect('dev074-root-b')),
      ),
      connectorD: connector?.getAttribute('d') || '',
      relationshipD: relationshipPath?.getAttribute('d') || '',
      recomputeCount: Number(document.querySelector('[data-mindmap-recompute-count]')?.getAttribute('data-mindmap-recompute-count') || 0),
      lastGeometryReasons: document.querySelector('[data-mindmap-last-geometry-reasons]')?.getAttribute('data-mindmap-last-geometry-reasons') || '',
      zoom: Number(document.querySelector('[data-mindmap-viewport="true"]')?.getAttribute('data-mindmap-zoom-level') || 0),
      hitbox: (() => {
        const element = document.querySelector('[data-mindmap-note-relationship-click-target]');
        const value = element?.getBoundingClientRect();
        return value ? { width: value.width, height: value.height } : null;
      })(),
    };
  });

  const setZoomTarget = async (target) => {
    const zoomIn = page.locator('[data-mindmap-zoom-in]').first();
    const zoomOut = page.locator('[data-mindmap-zoom-out]').first();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = Number(await page.locator('[data-mindmap-viewport="true"]').getAttribute('data-mindmap-zoom-level'));
      if (Math.abs(current - target) <= 0.001) {
        await page.waitForTimeout(90);
        return current;
      }
      await (target > current ? zoomIn : zoomOut).click();
      await page.waitForTimeout(22);
    }
    const actual = Number(await page.locator('[data-mindmap-viewport="true"]').getAttribute('data-mindmap-zoom-level'));
    assert(Math.abs(actual - target) <= 0.001, 'toolbar zoom should reach every DEV-074 matrix scale', { target, actual });
    return actual;
  };

  const readScrollReachability = async () => page.evaluate(() => {
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    if (!viewport) return { reachable: false, width: 0, height: 0, maxLeft: 0, maxTop: 0 };
    const width = viewport.scrollWidth;
    const height = viewport.scrollHeight;
    const maxLeft = Math.max(0, width - viewport.clientWidth);
    const maxTop = Math.max(0, height - viewport.clientHeight);
    viewport.scrollLeft = maxLeft;
    viewport.scrollTop = maxTop;
    const reached = Math.abs(viewport.scrollLeft - maxLeft) <= 1 && Math.abs(viewport.scrollTop - maxTop) <= 1;
    viewport.scrollLeft = Math.round(maxLeft / 2);
    viewport.scrollTop = Math.round(maxTop / 2);
    return { reachable: reached, width, height, maxLeft, maxTop };
  });

  const readHitTargetMinimums = async () => page.evaluate(() => {
    const rects = selector => Array.from(document.querySelectorAll(selector)).map(element => element.getBoundingClientRect());
    const curves = rects('[data-mindmap-note-relationship-curve-click-target]');
    const handles = rects('[data-mindmap-note-relationship-endpoint], [data-mindmap-note-relationship-control-point]');
    return {
      minCurveHitThicknessPx: curves.length ? Math.min(...curves.map(rect => rect.height)) : null,
      minHandleWidthPx: handles.length ? Math.min(...handles.map(rect => rect.width)) : null,
      minHandleHeightPx: handles.length ? Math.min(...handles.map(rect => rect.height)) : null,
    };
  });

  const results = [];
  for (const viewport of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 1024, height: 768, label: 'compact-desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await openFixture(viewport);
    await assertNoVisibleErrors(`DEV-074 ${viewport.label} initial`);
    if (viewport.width <= 640) {
      const boardSurface = page.locator('[data-mobile-pan-surface="board"]').first();
      await boardSurface.waitFor({ state: 'visible', timeout: 10000 });
      const screenshot = `output/playwright/dev-074-single-scene/${viewport.label}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({
        viewport,
        mobileBoundary: {
          mindMapVisible: await page.locator('[data-mindmap-view]').first().isVisible().catch(() => false),
          boardVisible: await boardSurface.isVisible(),
        },
        zoomCases: [],
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        visibleErrors: await getVisibleErrors(),
        screenshot,
      });
      continue;
    }
    await page.locator('[data-mindmap-zoom-reset]').click();
    await page.waitForTimeout(180);
    const before = await readGeometry();
    assert(before.nodeCount === 4, 'fixture should render all mind map nodes', { viewport, before });
    assert(before.connectorCount >= 1, 'connector overlay should render in the single scene', { viewport, before });
    assert(before.relationshipCount === 1, 'relationship overlay should render in the single scene', { viewport, before });
    assert(before.scrollOwners === 1, 'mind map should have one scroll owner', { viewport, before });
    assert(before.sceneTransform.startsWith('matrix('), 'scene should use one matrix transform', { viewport, before });
    assert(before.connectorEndpointError < 14, 'connector endpoints should stay attached to node edges', { viewport, before });
    assert(before.relationshipEndpointError < 14, 'relationship endpoints should stay attached to node edges', { viewport, before });

    const zoomIn = page.locator('[data-mindmap-zoom-in]').first();
    await zoomIn.click();
    await page.waitForTimeout(300);
    const after = await readGeometry();
    assert(after.zoom > before.zoom, 'zoom control should change scene scale', { viewport, before, after });
    assert(after.connectorD === before.connectorD, 'pure zoom must not recompute connector world paths', { viewport, before, after });
    assert(after.relationshipD === before.relationshipD, 'pure zoom must not recompute relationship world paths', { viewport, before, after });
    assert(after.recomputeCount === before.recomputeCount, 'pure zoom must not increment geometry recompute count', { viewport, before, after });
    assert(after.connectorEndpointError < 18, 'connector endpoints should remain attached after zoom', { viewport, before, after });
    assert(after.relationshipEndpointError < 18, 'relationship endpoints should remain attached after zoom', { viewport, before, after });
    assert(after.hitbox && after.hitbox.width > 50 && after.hitbox.height > 20, 'relationship interaction target should remain usable after inverse scaling', { viewport, after });

    const screenshot = `output/playwright/dev-074-single-scene/${viewport.label}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true });
    const persistedBefore = await page.evaluate(() => localStorage.getItem('projed.mindmap.noteRelationships.dev074-board') || '');
    await page.locator('[data-mindmap-zoom-reset]').click();
    await page.waitForTimeout(180);
    const matrixBaseline = await readGeometry();
    const zoomCases = [];
    for (const scale of [1, 0.25, 0.5, 0.75, 1, 2, 4, 1]) {
      await setZoomTarget(scale);
      const geometry = await readGeometry();
      const scrollReachability = await readScrollReachability();
      const hitTargets = await readHitTargetMinimums();
      const token = String(Math.round(scale * 100)).padStart(3, '0');
      const scaleScreenshot = `output/playwright/dev-074-single-scene/${viewport.label}-${token}.png`;
      await page.screenshot({ path: scaleScreenshot, fullPage: true });
      assert(geometry.connectorD === matrixBaseline.connectorD, 'scale matrix must preserve hierarchy world paths', { viewport, scale, matrixBaseline, geometry });
      assert(geometry.relationshipD === matrixBaseline.relationshipD, 'scale matrix must preserve relationship world paths', { viewport, scale, matrixBaseline, geometry });
      assert(geometry.recomputeCount === matrixBaseline.recomputeCount, 'scale matrix must not recompute geometry', { viewport, scale, matrixBaseline, geometry });
      assert(geometry.connectorEndpointError < 3 && geometry.relationshipEndpointError < 3, 'scale matrix endpoint drift must stay within 3px', { viewport, scale, geometry });
      assert(scrollReachability.reachable, 'scale matrix scroll extent must reach the far edge', { viewport, scale, scrollReachability });
      zoomCases.push({
        scale,
        maxHierarchyEndpointDriftPx: geometry.connectorEndpointError,
        maxRelationshipEndpointDriftPx: geometry.relationshipEndpointError,
        anchorDriftPx: null,
        recomputeDelta: geometry.recomputeCount - matrixBaseline.recomputeCount,
        scrollReachable: scrollReachability.reachable,
        minCurveHitThicknessPx: hitTargets.minCurveHitThicknessPx,
        minHandleWidthPx: hitTargets.minHandleWidthPx,
        minHandleHeightPx: hitTargets.minHandleHeightPx,
        screenshot: scaleScreenshot,
      });
    }
    const persistedAfter = await page.evaluate(() => localStorage.getItem('projed.mindmap.noteRelationships.dev074-board') || '');
    assert(persistedBefore === persistedAfter, 'pure zoom must not rewrite persisted relationship geometry', { viewport });
    results.push({
      viewport,
      before,
      after,
      zoomCases,
      persistedGeometryEqual: persistedBefore === persistedAfter,
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      visibleErrors: await getVisibleErrors(),
      screenshot,
    });
  }

  const artifact = {
    verifier: 'DEV-074',
    passed: true,
    generatedAt: new Date().toISOString(),
    fixtureId: 'dev-074-v1',
    baselineRef: 'baseline/git-head.txt',
    phase: 'after',
    contract: 'single-scene-coordinate-system',
    viewportResults: results,
    viewports: results.map(result => ({
      name: result.viewport.label === 'compact-desktop' ? 'laptop' : result.viewport.label,
      width: result.viewport.width,
      height: result.viewport.height,
      zoomCases: result.zoomCases || [],
      consoleErrors: result.consoleErrors || [],
      pageErrors: result.pageErrors || [],
      visibleErrors: result.visibleErrors || [],
    })),
    persistedGeometryEqual: results.every(result => result.persistedGeometryEqual !== false),
    regressionCommands: [],
    assertions: [
      'one-scroll-owner',
      'stage-sizer-and-scene-matrix',
      'world-paths-stable-through-pure-zoom',
      'connector-and-relationship-endpoints-attached',
      'inverse-scaled-html-interaction-targets',
    ],
  };
  await page.evaluate(value => {
    window.__DEV074_ARTIFACT = value;
  }, artifact);
  return artifact;
}
