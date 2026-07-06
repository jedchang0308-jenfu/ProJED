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
    await selectViewMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-note-relationship-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const selectViewMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const detailTitleInput = () => page.locator('[data-task-details-title-input="true"]').first();
  const relationshipGroupByLabel = (label) => page.locator(`[data-mindmap-note-relationship][data-label="${label}"]`).first();
  const selectedRelationshipGroupByLabel = (label) => page.locator(`[data-mindmap-note-relationship][data-label="${label}"][data-selected="true"]`).first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipCurveHitboxByLabel = (label) => page.locator(`[data-mindmap-note-relationship-curve-click-target][data-label="${label}"]`).first();
  const relationshipHitboxByLabel = (label) => page.locator(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).first();
  const stylePanel = () => page.locator('[data-mindmap-note-relationship-style-panel]').first();
  const closeTaskDetailsIfOpen = async () => {
    const modal = page.locator('[data-task-details-modal="true"]');
    if ((await modal.count()) === 0) return;
    await modal.locator('button[title="關閉"]').click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
  };

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
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await detailTitleInput().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.activeElement?.matches('[data-task-details-title-input="true"]'), null, { timeout: 3000 });
    const focused = await detailTitleInput().evaluate(element => document.activeElement === element);
    assert(focused, 'new mind map task should focus the task details title input', { title });
    assert(
      await page.locator('[data-mindmap-title-input]').count() === 0,
      'new mind map task should not open an outer title input',
    );
    await detailTitleInput().fill(title);
    await detailTitleInput().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
    await closeTaskDetailsIfOpen();
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await renameSelectedByTyping(title);
  };

  const injectStaleControlPointRelationship = async (fromTitle, toTitle, label) => {
    await page.evaluate(({ fromTitle, toTitle, label }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      const fromNode = Object.values(nodes).find(node => node && node.title === fromTitle);
      const toNode = Object.values(nodes).find(node => node && node.title === toTitle);
      if (!fromNode || !toNode) throw new Error(`Missing stale relationship nodes: ${fromTitle} -> ${toTitle}`);
      const relationship = {
        id: `rel_stale_${Date.now().toString(36)}`,
        boardId: fromNode.boardId,
        fromId: fromNode.id,
        toId: toNode.id,
        label,
        style: { strokeDasharray: '7 6', arrowEnd: true },
        geometry: {
          controlPoints: [
            { x: 99999, y: -99999 },
            { x: 99999, y: 99999 },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const key = `projed.mindmap.noteRelationships.${fromNode.boardId}`;
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([...current, relationship]));
    }, { fromTitle, toTitle, label });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await selectViewMode('mindmap');
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
  };

  const removeRelationshipByLabel = async (label) => {
    await page.evaluate((label) => {
      Object.keys(localStorage)
        .filter(key => key.startsWith('projed.mindmap.noteRelationships.'))
        .forEach((key) => {
          const current = JSON.parse(localStorage.getItem(key) || '[]');
          localStorage.setItem(key, JSON.stringify(current.filter(relationship => relationship?.label !== label)));
        });
    }, label);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await selectViewMode('mindmap');
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    assert(
      await relationshipGroupByLabel(label).count() === 0,
      'stale geometry fixture should be removed before continuing the interactive relationship tests',
      { label },
    );
  };

  const createInlineRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    await closeTaskDetailsIfOpen();
    const fromId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${fromId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    const sourceBox = await nodeByTitle(fromTitle).boundingBox();
    assert(Boolean(sourceBox), 'source node should have a bounding box before relationship preview');
    const viewport = page.viewportSize() || { width: 1440, height: 900 };
    const previewPoint = {
      x: Math.max(24, Math.min(sourceBox.x + sourceBox.width + 96, viewport.width - 24)),
      y: Math.max(24, Math.min(sourceBox.y + sourceBox.height / 2 + 24, viewport.height - 24)),
    };
    await page.mouse.move(previewPoint.x, previewPoint.y, { steps: 8 });
    await page.locator('[data-mindmap-note-relationship-draft-preview]').waitFor({ state: 'visible', timeout: 10000 });
    const previewMeta = await page.locator('[data-mindmap-note-relationship-draft-preview]').first().evaluate((element, previewPoint) => {
      const surface = document.querySelector('[data-mindmap-surface]');
      const surfaceRect = surface?.getBoundingClientRect();
      const zoom = Number(document.querySelector('[data-mindmap-view] [data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '1');
      const expectedLocal = surfaceRect
        ? {
            x: (previewPoint.x - surfaceRect.left) / Math.max(zoom, 0.01),
            y: (previewPoint.y - surfaceRect.top) / Math.max(zoom, 0.01),
          }
        : { x: Number.NaN, y: Number.NaN };
      return {
        sourceNodeId: element.getAttribute('data-source-node-id'),
        coordinateSpace: element.getAttribute('data-mindmap-note-relationship-draft-coordinate-space'),
        pathCoordinateSpace: element.querySelector('[data-mindmap-note-relationship-draft-preview-path]')?.getAttribute('data-mindmap-note-relationship-draft-coordinate-space') || '',
        toX: Number(element.getAttribute('data-draft-to-x')),
        toY: Number(element.getAttribute('data-draft-to-y')),
        expectedLocal,
        hasPath: Boolean(element.querySelector('[data-mindmap-note-relationship-draft-preview-path]')),
      };
    }, previewPoint);
    assert(
      previewMeta.sourceNodeId === fromId &&
        previewMeta.coordinateSpace === 'map-local' &&
        previewMeta.pathCoordinateSpace === 'map-local' &&
        previewMeta.hasPath &&
        Math.abs(previewMeta.toX - previewMeta.expectedLocal.x) <= 3 &&
        Math.abs(previewMeta.toY - previewMeta.expectedLocal.y) <= 3,
      'draft relationship preview should follow the cursor in the map-local zoom layer before selecting endpoint',
      { previewMeta, previewPoint, fromId },
    );
    await page.screenshot({ path: 'output/playwright/dev-027E-relationship-draft-preview.png', fullPage: true });
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await page.waitForTimeout(600);
    if ((await editor.count()) === 0 || !(await editor.isVisible().catch(() => false))) {
      await page.screenshot({ path: 'output/playwright/dev-027E-relationship-create-missing-editor.png', fullPage: true });
      const debug = await page.evaluate(() => ({
        toolActive: document.querySelector('[data-mindmap-note-relationship-tool]')?.getAttribute('data-active'),
        sourceNodeId: document.querySelector('[data-mindmap-note-relationship-tool]')?.getAttribute('data-source-node-id'),
        draftPreviewCount: document.querySelectorAll('[data-mindmap-note-relationship-draft-preview]').length,
        relationshipCount: document.querySelectorAll('[data-mindmap-note-relationship]').length,
        relationshipPathCount: document.querySelectorAll('[data-mindmap-note-relationship-path]').length,
        labelInputCount: document.querySelectorAll('[data-mindmap-note-relationship-label-input]').length,
        labelInputRect: (() => {
          const input = document.querySelector('[data-mindmap-note-relationship-label-input]');
          const rect = input?.getBoundingClientRect();
          return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
        })(),
        selectedNodeTitle: document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node-title'),
      }));
      assert(false, 'relationship label editor should appear after selecting endpoint', debug);
    }
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    const promptCount = await page.locator('.global-dialog-content input').count();
    assert(promptCount === 0, 'inline relationship editor should open without a prompt', { promptCount });
    await editor.evaluate(element => {
      element.focus();
      element.select();
    });
    await editor.fill(label);
    await page.keyboard.press('Enter');
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
  };

  const finitePathMeta = async (label) => relationshipPathByLabel(label).evaluate((path) => ({
    d: path.getAttribute('d'),
    fromNodeId: path.getAttribute('data-from-node-id'),
    toNodeId: path.getAttribute('data-to-node-id'),
    fromX: Number(path.getAttribute('data-from-x')),
    fromY: Number(path.getAttribute('data-from-y')),
    toX: Number(path.getAttribute('data-to-x')),
    toY: Number(path.getAttribute('data-to-y')),
    c1X: Number(path.getAttribute('data-control-1-x')),
    c1Y: Number(path.getAttribute('data-control-1-y')),
    c2X: Number(path.getAttribute('data-control-2-x')),
    c2Y: Number(path.getAttribute('data-control-2-y')),
    labelX: Number(path.getAttribute('data-label-x')),
    labelY: Number(path.getAttribute('data-label-y')),
    strokeColor: path.getAttribute('data-stroke-color'),
    strokeWidth: Number(path.getAttribute('data-stroke-width')),
    strokeDasharray: path.getAttribute('data-stroke-dasharray'),
  }));

  const relationshipZoomInvariantMeta = async (relationshipId, label) => page.evaluate(({ relationshipId, label }) => {
    const path = document.querySelector(`[data-mindmap-note-relationship-path][data-label="${label}"]`);
    const readStyle = (selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({
      relationshipId: element.getAttribute('data-relationship-id') || element.getAttribute('data-mindmap-note-relationship-click-target') || '',
      coordinateSpace: element.getAttribute('data-mindmap-note-relationship-coordinate-space') || '',
      left: element.style.left || '',
      top: element.style.top || '',
      width: element.style.width || '',
      transform: element.style.transform || '',
    }));
    return {
      zoom: document.querySelector('[data-mindmap-view] [data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '',
      recomputeCount: document.querySelector('[data-mindmap-recompute-count]')?.getAttribute('data-mindmap-recompute-count') || '',
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
      } : null,
      curveHitboxStyles: readStyle(`[data-mindmap-note-relationship-curve-click-target][data-label="${label}"]`),
      lineHitboxStyles: readStyle(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`),
      labelHitboxStyles: readStyle(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`),
      endpointStyles: readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-endpoint]`),
      controlPointStyles: readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-control-point]`),
      controlArmStyles: readStyle(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-arm]`),
    };
  }, { relationshipId, label });

  const assertFiniteGeometry = (meta, message) => {
    const numbers = ['fromX', 'fromY', 'toX', 'toY', 'c1X', 'c1Y', 'c2X', 'c2Y', 'labelX', 'labelY'];
    const invalid = numbers.filter(key => !Number.isFinite(meta[key]));
    assert(invalid.length === 0, message, { invalid, meta });
  };

  const assertRelationshipNotExploded = async (label, message) => {
    const meta = await finitePathMeta(label);
    assertFiniteGeometry(meta, message);
    const sourceArm = Math.hypot(meta.c1X - meta.fromX, meta.c1Y - meta.fromY);
    const targetArm = Math.hypot(meta.c2X - meta.toX, meta.c2Y - meta.toY);
    const endpointSpan = Math.hypot(meta.toX - meta.fromX, meta.toY - meta.fromY);
    const maxArm = Math.max(220, Math.min(560, endpointSpan * 1.4 + 120));
    assert(
      sourceArm <= maxArm &&
        targetArm <= maxArm &&
        Math.abs(meta.c1X) < 20000 &&
        Math.abs(meta.c2X) < 20000 &&
        Math.abs(meta.c1Y) < 20000 &&
        Math.abs(meta.c2Y) < 20000,
      message,
      { meta, sourceArm, targetArm, endpointSpan, maxArm },
    );
    return meta;
  };

  await openApp();
  await assertNoVisibleErrors('DEV-027E initial');

  const stamp = Date.now().toString(36);
  const source = `DEV027E source ${stamp}`;
  const target = `DEV027E target ${stamp}`;
  const reconnectTarget = `DEV027E reconnect ${stamp}`;
  const shortcutSource = `DEV027E shortcut ${stamp}`;
  const rightClickSource = `DEV027E right click ${stamp}`;
  const label = `DEV027E relation ${stamp}`;
  const editedLabel = `DEV027E edited ${stamp}`;

  await createRoot(source);
  await createRoot(target);
  await createRoot(reconnectTarget);
  await createRoot(shortcutSource);
  await createRoot(rightClickSource);
  const staleLabel = `DEV027E stale geometry ${stamp}`;
  await injectStaleControlPointRelationship(source, target, staleLabel);
  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${staleLabel}"]`).click({ force: true });
  await assertRelationshipNotExploded(staleLabel, 'legacy screen-space relationship control points should be ignored instead of exploding the line');
  for (let index = 0; index < 12; index += 1) {
    await page.locator('[data-mindmap-zoom-out]').click();
  }
  await page.waitForTimeout(500);
  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${staleLabel}"]`).click({ force: true });
  const staleZoomMeta = await assertRelationshipNotExploded(staleLabel, 'legacy screen-space relationship control points should stay stable near 43% zoom');
  const staleZoomLevel = Number(await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level'));
  assert(staleZoomLevel <= 0.45, 'stale control point regression should run near the user-reported 43% zoom level', { staleZoomLevel, staleZoomMeta });
  await page.screenshot({ path: 'output/playwright/dev-027E-stale-relationship-controlpoints-43zoom.png', fullPage: true });
  await page.locator('[data-mindmap-zoom-reset]').click();
  await page.waitForTimeout(250);
  await removeRelationshipByLabel(staleLabel);

  await createInlineRelationship(source, target, label);
  await relationshipCurveHitboxByLabel(label).hover({ force: true });
  await page.waitForFunction((label) => {
    return document.querySelector(`[data-mindmap-note-relationship][data-label="${label}"]`)?.getAttribute('data-hovered') === 'true';
  }, label);
  assert(await relationshipGroupByLabel(label).getAttribute('data-hovered') === 'true', 'hovering the line body should highlight the relationship');
  await page.screenshot({ path: 'output/playwright/dev-027E-relationship-hover-highlight.png', fullPage: true });
  await relationshipCurveHitboxByLabel(label).click({ force: true });
  await selectedRelationshipGroupByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
  assert(await selectedRelationshipGroupByLabel(label).count() > 0, 'clicking the line body should select the relationship');
  const relationshipId = await selectedRelationshipGroupByLabel(label).getAttribute('data-mindmap-note-relationship');
  assert(await stylePanel().isVisible(), 'relationship style panel should be visible');
  assert(await stylePanel().getAttribute('data-mindmap-note-relationship-style-drawer') === 'true', 'relationship style controls should render as a right drawer instead of a floating popover');
  const drawerBox = await stylePanel().boundingBox();
  const drawerViewport = page.viewportSize();
  assert(Boolean(drawerBox) && drawerViewport && drawerBox.x + drawerBox.width >= drawerViewport.width - 2 && drawerBox.width >= 300, 'relationship style drawer should be fixed to the right side like Xmind', { drawerBox, drawerViewport });
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-endpoint]`).count()) >= 2, 'selected relationship should show two circular endpoints');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-control-arm]`).count()) === 2, 'selected relationship should show two Xmind-like endpoint control arms');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-arm]`).count()) === 2, 'selected relationship should show two visible endpoint control arms in the map-local zoom layer');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-point]`).count()) === 2, 'selected relationship should show two visible circular adjustment points in the map-local zoom layer');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-coordinate-space="map-local"]`).count()) >= 6, 'selected relationship handles should render in the same map-local layer as the SVG path');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-control-point]`).count()) >= 2, 'selected relationship should show two visible circular control points');
  const selectedControlMeta = await finitePathMeta(label);
  const controlArmLengths = [
    Math.hypot(selectedControlMeta.c1X - selectedControlMeta.fromX, selectedControlMeta.c1Y - selectedControlMeta.fromY),
    Math.hypot(selectedControlMeta.c2X - selectedControlMeta.toX, selectedControlMeta.c2Y - selectedControlMeta.toY),
  ];
  assert(controlArmLengths.every(length => length >= 32 && length <= 120), 'Xmind-like control arms should stay close to each endpoint', { controlArmLengths, selectedControlMeta });
  const getBoxes = async (selector) => page.locator(selector).evaluateAll(elements => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }));
  const selectedHandleBoxes = await getBoxes(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-screen-control-point]`);
  assert(
    selectedHandleBoxes.length === 2 && selectedHandleBoxes.every(box => box.width >= 18 && box.height >= 18),
    'selected relationship adjustment control points should be visibly sized on screen',
    { selectedHandleBoxes },
  );
  await page.screenshot({ path: 'output/playwright/dev-027E-relationship-selected-handles.png', fullPage: true });
  const handleClip = selectedHandleBoxes.reduce((clip, box) => ({
    left: Math.min(clip.left, box.left),
    top: Math.min(clip.top, box.top),
    right: Math.max(clip.right, box.right),
    bottom: Math.max(clip.bottom, box.bottom),
  }), { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: 0, bottom: 0 });
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  await page.screenshot({
    path: 'output/playwright/dev-027E-relationship-selected-handles-detail.png',
    clip: {
      x: Math.max(0, handleClip.left - 72),
      y: Math.max(0, handleClip.top - 56),
      width: Math.min(viewport.width, handleClip.right - handleClip.left + 144),
      height: Math.min(viewport.height, handleClip.bottom - handleClip.top + 112),
    },
  });

  await relationshipCurveHitboxByLabel(label).dblclick({ force: true });
  const labelEditor = page.locator(`[data-mindmap-note-relationship-label-input="${relationshipId}"]`);
  await labelEditor.waitFor({ state: 'visible', timeout: 10000 });
  await labelEditor.fill(editedLabel);
  await page.keyboard.press('Enter');
  await relationshipPathByLabel(editedLabel).waitFor({ state: 'visible', timeout: 10000 });

  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${editedLabel}"]`).click({ force: true });
  await stylePanel().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-mindmap-note-relationship-style-color="#dc2626"]').click();
  await page.locator('[data-mindmap-note-relationship-style-width="3.5"]').click();
  await page.locator('[data-mindmap-note-relationship-style-dash="solid"]').click();
  await page.locator('[data-mindmap-note-relationship-style-arrow="both"]').click();
  await page.locator('[data-mindmap-note-relationship-style-label-size="14"]').click();
  const styledMeta = await finitePathMeta(editedLabel);
  assert(styledMeta.strokeColor === '#dc2626', 'style panel should update relationship stroke color', { styledMeta });
  assert(styledMeta.strokeWidth === 3.5, 'style panel should update relationship stroke width', { styledMeta });
  assert(styledMeta.strokeDasharray === '', 'style panel should update relationship dash style', { styledMeta });

  const beforeDrag = await finitePathMeta(editedLabel);
  const editedRelationshipId = await relationshipGroupByLabel(editedLabel).getAttribute('data-mindmap-note-relationship');
  const control = page.locator(`[data-relationship-id="${editedRelationshipId}"][data-mindmap-note-relationship-control-point="1"]`).first();
  const controlBox = await control.boundingBox();
  assert(Boolean(controlBox), 'control point should have a draggable bounding box');
  await page.mouse.move(controlBox.x + controlBox.width / 2, controlBox.y + controlBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(controlBox.x + controlBox.width / 2 + 80, controlBox.y + controlBox.height / 2 - 55, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await finitePathMeta(editedLabel);
  assert(Math.abs(afterDrag.c1X - beforeDrag.c1X) > 10 || Math.abs(afterDrag.c1Y - beforeDrag.c1Y) > 10, 'dragging a control point should update Bezier geometry', { beforeDrag, afterDrag });

  const reconnectNodeId = await nodeByTitle(reconnectTarget).getAttribute('data-mindmap-node');
  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${editedLabel}"]`).click({ force: true });
  await page.locator('[data-mindmap-note-relationship-endpoint="to"]').first().waitFor({ state: 'visible', timeout: 10000 });
  const endpoint = page.locator('[data-mindmap-note-relationship-endpoint="to"]').first();
  const endpointBox = await endpoint.boundingBox();
  const targetBox = await nodeByTitle(reconnectTarget).boundingBox();
  assert(Boolean(endpointBox) && Boolean(targetBox), 'endpoint and reconnect target should be draggable');
  await page.mouse.move(endpointBox.x + endpointBox.width / 2, endpointBox.y + endpointBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(({ label, reconnectNodeId }) => {
    return document.querySelector(`[data-mindmap-note-relationship-path][data-label="${label}"]`)?.getAttribute('data-to-node-id') === reconnectNodeId;
  }, { label: editedLabel, reconnectNodeId });
  const reconnectedMeta = await finitePathMeta(editedLabel);
  assert(reconnectedMeta.toNodeId === reconnectNodeId, 'dragging endpoint to another task should reconnect the note relationship', { reconnectedMeta, reconnectNodeId });

  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${editedLabel}"]`).click({ force: true });
  const zoomInvariantBefore = await relationshipZoomInvariantMeta(editedRelationshipId, editedLabel);
  assert(
    zoomInvariantBefore.path &&
      zoomInvariantBefore.curveHitboxStyles.every(item => item.coordinateSpace === 'map-local') &&
      zoomInvariantBefore.lineHitboxStyles.every(item => item.coordinateSpace === 'map-local') &&
      zoomInvariantBefore.labelHitboxStyles.every(item => item.coordinateSpace === 'map-local') &&
      zoomInvariantBefore.endpointStyles.every(item => item.coordinateSpace === 'map-local') &&
      zoomInvariantBefore.controlPointStyles.every(item => item.coordinateSpace === 'map-local') &&
      zoomInvariantBefore.controlArmStyles.every(item => item.coordinateSpace === 'map-local'),
    'relationship body hitboxes, label hitbox, endpoints, and control points should all share the map-local zoom layer before zoom',
    { zoomInvariantBefore },
  );
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(150);
  const zoomedMeta = await finitePathMeta(editedLabel);
  assertFiniteGeometry(zoomedMeta, 'relationship geometry should remain finite after zoom');
  const zoomInvariantAfter = await relationshipZoomInvariantMeta(editedRelationshipId, editedLabel);
  assert(
    JSON.stringify(zoomInvariantAfter.path) === JSON.stringify(zoomInvariantBefore.path) &&
      JSON.stringify(zoomInvariantAfter.curveHitboxStyles) === JSON.stringify(zoomInvariantBefore.curveHitboxStyles) &&
      JSON.stringify(zoomInvariantAfter.lineHitboxStyles) === JSON.stringify(zoomInvariantBefore.lineHitboxStyles) &&
      JSON.stringify(zoomInvariantAfter.labelHitboxStyles) === JSON.stringify(zoomInvariantBefore.labelHitboxStyles) &&
      JSON.stringify(zoomInvariantAfter.endpointStyles) === JSON.stringify(zoomInvariantBefore.endpointStyles) &&
      JSON.stringify(zoomInvariantAfter.controlPointStyles) === JSON.stringify(zoomInvariantBefore.controlPointStyles) &&
      JSON.stringify(zoomInvariantAfter.controlArmStyles) === JSON.stringify(zoomInvariantBefore.controlArmStyles),
    'zooming should not recompute or rewrite relationship path geometry or local interaction coordinates',
    { zoomInvariantBefore, zoomInvariantAfter },
  );

  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Control+Shift+R');
  await page.locator('[data-mindmap-note-relationship-tool][data-active="true"]').waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.locator('[data-mindmap-note-relationship-tool]').getAttribute('data-active') === 'true', 'Ctrl+Shift+R should start note relationship mode');
  await page.keyboard.press('Escape');

  await nodeByTitle(rightClickSource).click();
  await closeTaskDetailsIfOpen();
  await nodeByTitle(rightClickSource).click({ button: 'right' });
  await page.getByText('更多詳情選項', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  assert(
    await page.getByText('重新命名任務', { exact: true }).count() === 0,
    'right-clicking a task should not expose an outer rename menu item',
  );
  assert(
    await page.locator('[data-mindmap-note-relationship-tool]').getAttribute('data-active') === 'false',
    'right-clicking a task should open the task menu and should not start note relationship mode',
  );
  await page.keyboard.press('Escape');

  await assertNoVisibleErrors('DEV-027E final');
}
