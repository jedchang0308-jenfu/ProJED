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
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(4);
      Object.keys(localStorage)
        .filter(key => key.startsWith('projed.mindmap.'))
        .forEach(key => localStorage.removeItem(key));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const titleInput = () => page.locator('[data-mindmap-title-input]').first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipTargetByLabel = (label) => page.locator(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`).first();
  const relationshipCurveTargetByLabel = (label) => page.locator(`[data-mindmap-note-relationship-curve-click-target][data-label="${label}"]`).first();
  const relationshipLineTargetByLabel = (label) => page.locator(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).first();
  const selectedRelationshipByLabel = (label) => page.locator(`[data-mindmap-note-relationship][data-label="${label}"][data-selected="true"]`).first();

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ].find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show visible runtime errors`, { visibleError });
  };

  const renameSelectedByTyping = async (title) => {
    await selectedNode().focus();
    await page.keyboard.press('D');
    await titleInput().waitFor({ state: 'visible', timeout: 10000 });
    await titleInput().fill(title);
    await titleInput().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await renameSelectedByTyping(title);
  };

  const createChildFromSelected = async (title) => {
    await page.keyboard.press('Tab');
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await renameSelectedByTyping(title);
  };

  const createSiblingFromSelected = async (title) => {
    await page.keyboard.press('Enter');
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await renameSelectedByTyping(title);
  };

  const selectNode = async (title) => {
    await nodeByTitle(title).click();
    await nodeByTitle(title).focus();
  };

  const selectRelationshipForStyle = async (label) => {
    await page.locator('[data-mindmap-note-relationship-tool][data-active="false"]').waitFor({ state: 'visible', timeout: 10000 });
    const targets = [
      relationshipCurveTargetByLabel(label),
      relationshipLineTargetByLabel(label),
      relationshipTargetByLabel(label),
    ];
    for (const target of targets) {
      if (!(await target.isVisible().catch(() => false))) continue;
      await target.click({ force: true });
      if (await selectedRelationshipByLabel(label).isVisible({ timeout: 2500 }).catch(() => false)) return;
    }
    const debug = await page.evaluate((label) => ({
      relationshipCount: document.querySelectorAll(`[data-mindmap-note-relationship][data-label="${label}"]`).length,
      curveTargetCount: document.querySelectorAll(`[data-mindmap-note-relationship-curve-click-target][data-label="${label}"]`).length,
      lineTargetCount: document.querySelectorAll(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).length,
      labelTargetCount: document.querySelectorAll(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`).length,
      toolActive: document.querySelector('[data-mindmap-note-relationship-tool]')?.getAttribute('data-active'),
    }), label);
    assert(false, 'relationship should become selected before opening the style drawer', debug);
  };

  const applyDatesToNodes = async (titles) => {
    await page.evaluate((titles) => {
      const filters = {
        statusFilters: {
          todo: true,
          in_progress: true,
          delayed: true,
          completed: true,
          unsure: true,
          onhold: true,
        },
        showDependencies: true,
        showStartDate: true,
        showTags: true,
        dueWithinDays: null,
        selectedAssigneeIds: [],
      };
      const titleSet = new Set(titles);
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      Object.values(nodes).forEach((node, index) => {
        if (!node || !titleSet.has(node.title)) return;
        node.status = 'todo';
        node.startDate = `2026-05-${String(21 + (index % 5)).padStart(2, '0')}`;
        node.endDate = `2026-05-${String(24 + (index % 5)).padStart(2, '0')}`;
        node.updatedAt = Date.now();
      });
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-filters', JSON.stringify(filters));
    }, titles);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
    await nodeByTitle(titles[0]).waitFor({ state: 'visible', timeout: 15000 });
  };

  const wheelZoomAtSurface = async (deltaY) => {
    const box = await page.locator('[data-mindmap-middle-pan="true"]').first().boundingBox();
    assert(Boolean(box), 'mind map zoom surface should have a viewport box for wheel zoom');
    const point = {
      x: box.x + box.width * 0.52,
      y: box.y + box.height * 0.48,
    };
    await page.evaluate(({ deltaY, point }) => {
      const surface = document.querySelector('[data-mindmap-middle-pan="true"]');
      surface?.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY,
        clientX: point.x,
        clientY: point.y,
      }));
    }, { deltaY, point });
  };

  const createInlineRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    const fromId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${fromId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    const sourceBox = await nodeByTitle(fromTitle).boundingBox();
    assert(Boolean(sourceBox), 'relationship source should have a bounding box before draft preview');
    await page.mouse.move(sourceBox.x + sourceBox.width + 120, sourceBox.y + sourceBox.height / 2 + 16, { steps: 8 });
    await page.locator('[data-mindmap-note-relationship-draft-preview]').waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(label);
    await page.keyboard.press('Enter');
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
    await selectRelationshipForStyle(label);
    await page.locator('[data-mindmap-note-relationship-style-panel]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-mindmap-note-relationship-style-dash="7 6"]').click();
    await page.locator('[data-mindmap-note-relationship-style-arrow="both"]').click();
    await page.locator('[data-mindmap-note-relationship-style-width="2.25"]').click();
    await relationshipTargetByLabel(label).click({ force: true });
  };

  const collectStableRelationshipSnapshot = async (relationshipLabel) => page.evaluate((relationshipLabel) => {
    const relationship = document.querySelector(`[data-mindmap-note-relationship][data-label="${relationshipLabel}"]`);
    const relationshipId = relationship?.getAttribute('data-mindmap-note-relationship') || '';
    const path = document.querySelector(`[data-mindmap-note-relationship-path][data-label="${relationshipLabel}"]`);
    const readStyle = (selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({
      key: element.getAttribute('data-mindmap-note-relationship-control-point') ||
        element.getAttribute('data-mindmap-note-relationship-endpoint') ||
        element.getAttribute('data-mindmap-note-relationship-line-click-target') ||
        element.getAttribute('data-mindmap-note-relationship-click-target') ||
        '',
      coordinateSpace: element.getAttribute('data-mindmap-note-relationship-coordinate-space') || '',
      left: element.style.left || '',
      top: element.style.top || '',
      width: element.style.width || '',
      transform: element.style.transform || '',
    }));
    return {
      zoom: document.querySelector('[data-mindmap-view] [data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '',
      recomputeCount: document.querySelector('[data-mindmap-recompute-count]')?.getAttribute('data-mindmap-recompute-count') || '',
      relationshipId,
      visibleDateBadges: Array.from(document.querySelectorAll('[data-mindmap-node-dates]'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
        }).length,
      connectorPathCount: document.querySelectorAll('[data-mindmap-connector-path]').length,
      path: path ? {
        d: path.getAttribute('d') || '',
        fromX: path.getAttribute('data-from-x') || '',
        fromY: path.getAttribute('data-from-y') || '',
        toX: path.getAttribute('data-to-x') || '',
        toY: path.getAttribute('data-to-y') || '',
        c1X: path.getAttribute('data-control-1-x') || '',
        c1Y: path.getAttribute('data-control-1-y') || '',
        c2X: path.getAttribute('data-control-2-x') || '',
        c2Y: path.getAttribute('data-control-2-y') || '',
        labelX: path.getAttribute('data-label-x') || '',
        labelY: path.getAttribute('data-label-y') || '',
        strokeWidth: path.getAttribute('data-stroke-width') || '',
        strokeDasharray: path.getAttribute('data-stroke-dasharray') || '',
      } : null,
      curveHitboxes: readStyle(`[data-mindmap-note-relationship-curve-click-target][data-label="${relationshipLabel}"]`),
      lineHitboxes: readStyle(`[data-mindmap-note-relationship-line-click-target][data-label="${relationshipLabel}"]`),
      labelHitboxes: readStyle(`[data-mindmap-note-relationship-click-target][data-label="${relationshipLabel}"]`),
      endpoints: relationshipId ? readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-endpoint]`) : [],
      controlPoints: relationshipId ? readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-control-point]`) : [],
      screenControlPoints: relationshipId ? readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-point]`) : [],
      controlArms: relationshipId ? readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-arm]`) : [],
    };
  }, relationshipLabel);

  const stablePart = (snapshot) => ({
    path: snapshot.path,
    curveHitboxes: snapshot.curveHitboxes,
    lineHitboxes: snapshot.lineHitboxes,
    labelHitboxes: snapshot.labelHitboxes,
    endpoints: snapshot.endpoints,
    controlPoints: snapshot.controlPoints,
    screenControlPoints: snapshot.screenControlPoints,
    controlArms: snapshot.controlArms,
  });

  const assertCompositeScene = (snapshot, label) => {
    const coordinateSpaces = [
      ...snapshot.curveHitboxes,
      ...snapshot.lineHitboxes,
      ...snapshot.labelHitboxes,
      ...snapshot.endpoints,
      ...snapshot.controlPoints,
      ...snapshot.screenControlPoints,
      ...snapshot.controlArms,
    ].map(item => item.coordinateSpace).filter(Boolean);
    assert(
      snapshot.path?.d?.startsWith('M ') &&
        snapshot.visibleDateBadges >= 2 &&
        snapshot.connectorPathCount >= 2 &&
        snapshot.endpoints.length >= 2 &&
        snapshot.screenControlPoints.length >= 2 &&
        snapshot.controlArms.length >= 2 &&
        coordinateSpaces.length >= 8 &&
        coordinateSpaces.every(space => space === 'map-local'),
      label,
      { snapshot, coordinateSpaces },
    );
  };

  const assertStableAfterInteraction = (before, after, message) => {
    assert(
      JSON.stringify(stablePart(after)) === JSON.stringify(stablePart(before)) &&
        after.recomputeCount === before.recomputeCount,
      message,
      { before, after },
    );
  };

  await openApp();
  await assertNoVisibleErrors('DEV-027G initial');

  const stamp = Date.now().toString(36);
  const root = `DEV027G root ${stamp}`;
  const children = [1, 2, 3, 4].map(index => `DEV027G child ${index} ${stamp}`);
  const targetRoot = `DEV027G target ${stamp}`;
  const relationshipLabel = `DEV027G relation ${stamp}`;

  await createRoot(root);
  await selectNode(root);
  await createChildFromSelected(children[0]);
  for (let index = 1; index < children.length; index += 1) {
    await createSiblingFromSelected(children[index]);
  }
  await createRoot(targetRoot);
  await applyDatesToNodes([root, ...children, targetRoot]);
  await createInlineRelationship(children[0], children[3], relationshipLabel);
  await page.locator('[data-mindmap-zoom-fit]').click();
  await page.waitForTimeout(650);
  await relationshipTargetByLabel(relationshipLabel).click({ force: true });

  const baseline = await collectStableRelationshipSnapshot(relationshipLabel);
  assertCompositeScene(baseline, 'system-health fixture should include date badges, connectors, relationship label hitbox, endpoints, control points, and arms before zoom');
  await page.screenshot({ path: 'output/playwright/dev-027G-system-health-baseline.png', fullPage: true });

  await wheelZoomAtSurface(-180);
  await wheelZoomAtSurface(-180);
  await page.waitForTimeout(70);
  const wheelPreview = await collectStableRelationshipSnapshot(relationshipLabel);
  assertStableAfterInteraction(
    baseline,
    wheelPreview,
    'wheel zoom preview should not recompute or rewrite relationship path geometry or local interaction coordinates',
  );
  await page.waitForFunction(() => !document.querySelector('[data-mindmap-middle-pan="true"]')?.hasAttribute('data-mindmap-zoom-preview-active'), null, { timeout: 5000 });
  await page.waitForTimeout(160);
  const wheelCommitted = await collectStableRelationshipSnapshot(relationshipLabel);
  assert(
    Number(wheelCommitted.zoom) > Number(baseline.zoom),
    'wheel zoom should commit to a different zoom level for the invariant check',
    { baseline, wheelCommitted },
  );
  assertStableAfterInteraction(
    baseline,
    wheelCommitted,
    'zooming should not recompute or rewrite relationship path geometry or local interaction coordinates',
  );
  await page.screenshot({ path: 'output/playwright/dev-027G-system-health-wheel-zoom.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-in]').click();
  await page.locator('[data-mindmap-zoom-out]').click();
  await page.waitForTimeout(180);
  const buttonZoom = await collectStableRelationshipSnapshot(relationshipLabel);
  assertStableAfterInteraction(
    baseline,
    buttonZoom,
    'button zoom should not recompute or rewrite relationship path geometry or local interaction coordinates',
  );

  const panSurface = page.locator('[data-mindmap-middle-pan="true"]').first();
  const panSurfaceBox = await panSurface.boundingBox();
  assert(Boolean(panSurfaceBox), 'mind map pan surface should have a viewport box');
  const panStart = {
    x: panSurfaceBox.x + panSurfaceBox.width * 0.48,
    y: panSurfaceBox.y + panSurfaceBox.height * 0.52,
  };
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down({ button: 'middle' });
  await page.waitForFunction(() => document.querySelector('[data-mindmap-middle-pan-active="true"]'), null, { timeout: 5000 });
  await page.mouse.move(panStart.x + 260, panStart.y + 150, { steps: 8 });
  await page.waitForTimeout(450);
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(180);
  await relationshipTargetByLabel(relationshipLabel).click({ force: true });
  const panned = await collectStableRelationshipSnapshot(relationshipLabel);
  assertStableAfterInteraction(
    baseline,
    panned,
    'middle-mouse pan should only scroll the viewport and must not rewrite or recompute relationship geometry',
  );
  await page.screenshot({ path: 'output/playwright/dev-027G-system-health-middle-pan.png', fullPage: true });

  await assertNoVisibleErrors('DEV-027G final');
}
