/* eslint-disable */
async (page) => {
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
  const errors = { console: [], page: [], requests: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(String(error)));
  page.on('requestfailed', request => errors.requests.push(`${request.method()} ${request.url()}`));

  const selectViewMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };
  const nodeByTitle = title => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const quickTitleInput = () => page.locator('[data-mindmap-quick-title-input="true"]').first();
  const relationshipPath = label => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipGroup = label => page.locator(`[data-mindmap-note-relationship][data-label="${label}"]`).first();
  const relationshipCurveTargets = label => page.locator(`[data-mindmap-note-relationship-curve-click-target][data-label="${label}"]`);
  const joystick = side => page.locator(`[data-mindmap-note-relationship-direction-joystick="${side}"]`).first();

  const closeTaskDetailsIfOpen = async () => {
    const modal = page.locator('[data-task-details-modal="true"]');
    if (await modal.count()) {
      await modal.locator('button[aria-label="關閉任務詳情"]').click();
      await modal.waitFor({ state: 'hidden', timeout: 10000 });
    }
  };
  const createRoot = async (title) => {
    const createRootButton = page.locator('[data-mindmap-create-root]');
    if (await createRootButton.count()) {
      await createRootButton.click();
    } else {
      await page.locator('[data-mindmap-view]').focus();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
    }
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await quickTitleInput().waitFor({ state: 'visible', timeout: 10000 });
    await quickTitleInput().fill(title);
    await quickTitleInput().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
    await closeTaskDetailsIfOpen();
  };
  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'Unhandled Runtime Error']
      .find(pattern => bodyText.includes(pattern));
    const visibleAlerts = await page.locator('.inline-error:visible, [role="alert"]:visible').evaluateAll(elements =>
      elements.map(element => element.textContent?.trim()).filter(Boolean),
    );
    assert(!visibleError && visibleAlerts.length === 0, `${label} should not show visible errors`, { visibleError, visibleAlerts });
  };
  const readPathMeta = async () => relationshipPath(label).evaluate(path => ({
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
    d: path.getAttribute('d'),
  }));
  const readEndpointOuterEdgeAlignment = async () => relationshipPath(label).evaluate((path) => {
    if (!(path instanceof SVGPathElement)) throw new Error('DEV-085 relationship path missing for endpoint alignment');
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('DEV-085 relationship path screen transform missing');
    const readEndpoint = (role) => {
      const nodeId = path.getAttribute(`data-${role}-node-id`);
      const node = nodeId ? document.querySelector(`[data-mindmap-node="${CSS.escape(nodeId)}"]`) : null;
      if (!(node instanceof HTMLElement)) throw new Error(`DEV-085 ${role} node missing for endpoint alignment`);
      const direction = node.getAttribute('data-mindmap-node-direction');
      if (direction !== 'left' && direction !== 'right') throw new Error(`DEV-085 ${role} node direction missing`);
      const nodeRect = node.getBoundingClientRect();
      const localPoint = new DOMPoint(
        Number(path.getAttribute(`data-${role}-x`)),
        Number(path.getAttribute(`data-${role}-y`)),
      );
      const screenPoint = localPoint.matrixTransform(matrix);
      const expectedX = direction === 'right' ? nodeRect.right : nodeRect.left;
      return {
        nodeId,
        direction,
        expectedX,
        actualX: screenPoint.x,
        edgeDistance: Math.abs(screenPoint.x - expectedX),
        screenY: screenPoint.y,
        nodeTop: nodeRect.top,
        nodeBottom: nodeRect.bottom,
      };
    };
    return { from: readEndpoint('from'), to: readEndpoint('to') };
  });
  const readStoredRelationship = async () => page.evaluate((relationshipLabel) => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('projed.mindmap.noteRelationships.')) continue;
      const relationship = JSON.parse(localStorage.getItem(key) || '[]')
        .find(item => item?.label === relationshipLabel);
      if (relationship) return relationship;
    }
    return null;
  }, label);
  const finitePoint = point => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const waitForRelationshipSelection = async (expected, stage, details = {}) => {
    try {
      await page.waitForFunction(({ relationshipLabel, expectedState }) =>
        document.querySelector(`[data-mindmap-note-relationship][data-label="${relationshipLabel}"]`)?.getAttribute('data-selected') === expectedState,
      { relationshipLabel: label, expectedState: expected ? 'true' : 'false' }, { timeout: 5000 });
    } catch (error) {
      const selectionState = await relationshipGroup(label).getAttribute('data-selected');
      throw new Error(`${stage} selection state timed out: ${JSON.stringify({ expected, selectionState, ...details, cause: String(error) })}`);
    }
  };
  const selectRelationship = async (stage) => {
    await relationshipCurveTargets(label).nth(2).click();
    await relationshipGroup(label).waitFor({ state: 'visible', timeout: 10000 });
    await waitForRelationshipSelection(true, stage);
  };
  const readCurveHitWindowAlignment = async (segmentIndex = 1) => relationshipCurveTargets(label).nth(segmentIndex).evaluate((element, relationshipLabel) => {
    const path = document.querySelector(`[data-mindmap-note-relationship-path][data-label="${relationshipLabel}"]`);
    if (!(path instanceof SVGPathElement)) throw new Error('DEV-085 relationship path missing for hit-window alignment');
    const pathMatrix = path.getScreenCTM();
    if (!pathMatrix) throw new Error('DEV-085 relationship path screen transform missing');
    const rect = element.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const pathLength = path.getTotalLength();
    let centerlineDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= 240; index += 1) {
      const point = path.getPointAtLength((pathLength * index) / 240);
      const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(pathMatrix);
      centerlineDistance = Math.min(centerlineDistance, Math.hypot(screenPoint.x - center.x, screenPoint.y - center.y));
    }
    return {
      centerX: center.x,
      centerY: center.y,
      centerlineDistance,
      alignment: element.getAttribute('data-mindmap-note-relationship-hit-window-alignment'),
      declaredScreenPixels: Number(element.getAttribute('data-mindmap-note-relationship-hit-window-screen-px')),
    };
  }, label);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((accountValue) => {
    localStorage.setItem('projed-local-test.selected-account', accountValue.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(accountValue));
    Object.keys(localStorage)
      .filter(key => key.startsWith('projed.mindmap.'))
      .forEach(key => localStorage.removeItem(key));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await selectViewMode('mindmap');
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  await assertNoVisibleErrors('DEV-085 initial');

  const stamp = Date.now().toString(36);
  const sourceTitle = `DEV085 source ${stamp}`;
  const targetTitle = `DEV085 target ${stamp}`;
  const label = `DEV085 relation ${stamp}`;
  await createRoot(sourceTitle);
  await createRoot(targetTitle);
  await page.evaluate(({ sourceTitleValue, targetTitleValue, relationshipLabel }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const source = Object.values(nodes).find(node => node?.title === sourceTitleValue);
    const target = Object.values(nodes).find(node => node?.title === targetTitleValue);
    if (!source || !target) throw new Error('DEV-085 relationship fixture nodes missing');
    const key = `projed.mindmap.noteRelationships.${source.boardId}`;
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...current, {
      id: `rel_dev085_${Date.now().toString(36)}`,
      boardId: source.boardId,
      fromId: source.id,
      toId: target.id,
      label: relationshipLabel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      geometry: {
        fromAnchor: { xRatio: 0, yRatio: 0.25 },
        toAnchor: { xRatio: 1, yRatio: 0.75 },
      },
    }]));
  }, { sourceTitleValue: sourceTitle, targetTitleValue: targetTitle, relationshipLabel: label });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('[data-mindmap-view]').count())) await selectViewMode('mindmap');
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  await relationshipPath(label).waitFor({ state: 'attached', timeout: 15000 });
  const endpointOuterEdges = await readEndpointOuterEdgeAlignment();
  assert(endpointOuterEdges.from.direction === 'right' && endpointOuterEdges.to.direction === 'left', 'fixture should reproduce a cross-canvas right-to-left relationship', { endpointOuterEdges });
  assert(endpointOuterEdges.from.edgeDistance <= 2 && endpointOuterEdges.to.edgeDistance <= 2, 'both relationship endpoints should align to each node branch outer edge', { endpointOuterEdges });
  assert(endpointOuterEdges.from.screenY >= endpointOuterEdges.from.nodeTop && endpointOuterEdges.from.screenY <= endpointOuterEdges.from.nodeBottom, 'from endpoint should remain on the node vertical boundary span', { endpointOuterEdges });
  assert(endpointOuterEdges.to.screenY >= endpointOuterEdges.to.nodeTop && endpointOuterEdges.to.screenY <= endpointOuterEdges.to.nodeBottom, 'to endpoint should remain on the node vertical boundary span', { endpointOuterEdges });
  assert(await page.locator('[data-mindmap-note-relationship-direction-joystick]').count() === 0, 'unselected relationship should hide direction joysticks');
  const curveTarget = relationshipCurveTargets(label).nth(1);
  await curveTarget.waitFor({ state: 'visible', timeout: 10000 });
  await curveTarget.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const lineHitWindow = await curveTarget.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hitElement = document.elementFromPoint(centerX, centerY);
    return {
      centerX,
      centerY,
      angle: Math.atan2(matrix.b, matrix.a),
      alignment: element.getAttribute('data-mindmap-note-relationship-hit-window-alignment'),
      declaredScreenPixels: Number(element.getAttribute('data-mindmap-note-relationship-hit-window-screen-px')),
      centerHit: {
        tagName: hitElement?.tagName || null,
        curveTarget: hitElement?.getAttribute('data-mindmap-note-relationship-curve-click-target') || null,
        lineTarget: hitElement?.getAttribute('data-mindmap-note-relationship-line-click-target') || null,
        label: hitElement?.getAttribute('data-label') || null,
      },
    };
  });
  assert(lineHitWindow.alignment === 'centerline', 'relationship hit window should declare that its centerline is aligned with the visible line', { lineHitWindow });
  assert(lineHitWindow.declaredScreenPixels === 44, 'relationship curve should declare a 44px hit window', { lineHitWindow });
  assert(lineHitWindow.centerHit.label === label, 'relationship window center should be the topmost hit target for the same line', { lineHitWindow, label });
  await page.mouse.click(lineHitWindow.centerX, lineHitWindow.centerY);
  await waitForRelationshipSelection(true, 'centerline click', { lineHitWindow });
  await page.keyboard.press('Escape');
  await waitForRelationshipSelection(false, 'Escape after centerline click');
  const edgeToleranceOffset = 18;
  await page.mouse.click(
    lineHitWindow.centerX - Math.sin(lineHitWindow.angle) * edgeToleranceOffset,
    lineHitWindow.centerY + Math.cos(lineHitWindow.angle) * edgeToleranceOffset,
  );
  await waitForRelationshipSelection(true, '18px edge-tolerance click');

  const selectedCounts = await page.evaluate(() => ({
    endpoints: document.querySelectorAll('[data-mindmap-note-relationship-endpoint]').length,
    joysticks: document.querySelectorAll('[data-mindmap-note-relationship-direction-joystick]').length,
    arms: document.querySelectorAll('[data-mindmap-note-relationship-direction-arm]').length,
    centerGuides: document.querySelectorAll('[data-mindmap-note-relationship-control-guide]').length,
    legacyControlPoints: document.querySelectorAll('[data-mindmap-note-relationship-control-point], [data-mindmap-note-relationship-svg-control-point]').length,
  }));
  assert(selectedCounts.endpoints === 2 && selectedCounts.joysticks === 2 && selectedCounts.arms === 2, 'selected relationship should expose two endpoints and two direction joysticks', selectedCounts);
  assert(selectedCounts.centerGuides === 0 && selectedCounts.legacyControlPoints === 0, 'direction joysticks should not restore the old center guide or duplicate controls', selectedCounts);
  const ariaLabels = await page.locator('[data-mindmap-note-relationship-direction-joystick]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  assert(ariaLabels.includes('調整關聯線起點方向') && ariaLabels.includes('調整關聯線終點方向'), 'direction joysticks should expose accessible names', { ariaLabels });
  await page.screenshot({ path: 'output/playwright/dev-085-mindmap-relationship-direction-joysticks/desktop-selected.png', fullPage: true });

  const before = await readPathMeta();
  const identityBefore = { fromNodeId: before.fromNodeId, toNodeId: before.toNodeId };
  const fromBox = await joystick('from').boundingBox();
  assert(Boolean(fromBox), 'from direction joystick should be measurable');
  assert(fromBox.width >= 26 && fromBox.width <= 30 && fromBox.height >= 26 && fromBox.height <= 30, 'direction joystick hit target should be approximately 28 CSS px', { fromBox });

  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(fromBox.x + fromBox.width / 2 + 12, fromBox.y + fromBox.height / 2 + 72, { steps: 8 });
  const during = await readPathMeta();
  assert(Math.hypot(during.c1X - before.c1X, during.c1Y - before.c1Y) > 40, 'dragging the from joystick should update c1 before pointerup', { before, during });
  assert(Math.hypot(during.c2X - before.c2X, during.c2Y - before.c2Y) < 1, 'first c1 drag should preserve the computed c2 fallback instead of collapsing the curve', { before, during });
  await page.screenshot({ path: 'output/playwright/dev-085-mindmap-relationship-direction-joysticks/desktop-drag-preview.png', fullPage: true });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const curvedHitWindowAlignment = await readCurveHitWindowAlignment();
  assert(curvedHitWindowAlignment.alignment === 'centerline', 'curved relationship hit window should stay centered on the visible path', { curvedHitWindowAlignment });
  assert(curvedHitWindowAlignment.declaredScreenPixels === 44, 'curved relationship should preserve the 44px hit window', { curvedHitWindowAlignment });
  assert(curvedHitWindowAlignment.centerlineDistance <= 4, 'curved hit-window centerline should remain within 4px of the visible path', { curvedHitWindowAlignment });

  const after = await readPathMeta();
  const storedAfter = await readStoredRelationship();
  const storedControls = storedAfter?.geometry?.controlPoints || [];
  assert(storedControls.length === 2 && storedControls.every(finitePoint), 'pointerup should persist two finite control points', { storedAfter });
  assert(after.fromNodeId === identityBefore.fromNodeId && after.toNodeId === identityBefore.toNodeId, 'control drag should not retarget relationship endpoints', { identityBefore, after });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('[data-mindmap-view]').count())) await selectViewMode('mindmap');
  await relationshipPath(label).waitFor({ state: 'attached', timeout: 15000 });
  const reloaded = await readPathMeta();
  assert(pointDistance({ x: reloaded.c1X, y: reloaded.c1Y }, { x: after.c1X, y: after.c1Y }) < 1, 'reload should preserve c1', { after, reloaded });
  assert(pointDistance({ x: reloaded.c2X, y: reloaded.c2Y }, { x: after.c2X, y: after.c2Y }) < 1, 'reload should preserve c2', { after, reloaded });
  await selectRelationship('reload selection');

  const storedBeforeNonPrimary = await readStoredRelationship();
  const negativeBox = await joystick('from').boundingBox();
  await page.mouse.move(negativeBox.x + negativeBox.width / 2, negativeBox.y + negativeBox.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(negativeBox.x + 50, negativeBox.y + 50, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(negativeBox.x + negativeBox.width / 2, negativeBox.y + negativeBox.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(negativeBox.x + 40, negativeBox.y + 40, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('Escape');
  const storedAfterNonPrimary = await readStoredRelationship();
  assert(JSON.stringify(storedAfterNonPrimary?.geometry) === JSON.stringify(storedBeforeNonPrimary?.geometry), 'middle and right pointer starts should not write joystick geometry', { storedBeforeNonPrimary, storedAfterNonPrimary });

  await selectRelationship('post-non-primary selection');
  const zoomHandleBefore = await joystick('to').evaluate(element => ({ left: element.style.left, top: element.style.top }));
  const zoomBoxBefore = await joystick('to').boundingBox();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(250);
  const zoomHandleAfter = await joystick('to').evaluate(element => ({ left: element.style.left, top: element.style.top }));
  const zoomBoxAfter = await joystick('to').boundingBox();
  assert(JSON.stringify(zoomHandleAfter) === JSON.stringify(zoomHandleBefore), 'zoom should not rewrite map-local joystick coordinates', { zoomHandleBefore, zoomHandleAfter });
  assert(zoomBoxAfter.width >= 26 && zoomBoxAfter.width <= 30 && zoomBoxAfter.height >= 26 && zoomBoxAfter.height <= 30, 'zoomed joystick hit target should stay approximately 28 CSS px', { zoomBoxBefore, zoomBoxAfter });

  const beforeCancel = await readStoredRelationship();
  const toBox = await joystick('to').boundingBox();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x - 20, toBox.y - 65, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterCancel = await readStoredRelationship();
  assert(JSON.stringify(afterCancel?.geometry) === JSON.stringify(beforeCancel?.geometry), 'Escape during joystick drag should restore the relationship snapshot', { beforeCancel, afterCancel });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  await assertNoVisibleErrors('DEV-085 laptop');
  const laptopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(laptopOverflow <= 2, '1024 viewport should not introduce document overflow', { laptopOverflow });
  await page.screenshot({ path: 'output/playwright/dev-085-mindmap-relationship-direction-joysticks/laptop-selected.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileBoundary = await page.evaluate(() => ({
    width: window.innerWidth,
    mindMapVisible: Array.from(document.querySelectorAll('[data-mindmap-view]')).some(element => element instanceof HTMLElement && element.offsetParent !== null),
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    joystickCount: document.querySelectorAll('[data-mindmap-note-relationship-direction-joystick]').length,
  }));
  assert(mobileBoundary.mindMapVisible === false, '390x844 should preserve the existing mobile mindmap boundary', mobileBoundary);
  assert(mobileBoundary.documentOverflow <= 2, '390x844 should not introduce document overflow', mobileBoundary);
  await assertNoVisibleErrors('DEV-085 mobile');
  await page.screenshot({ path: 'output/playwright/dev-085-mindmap-relationship-direction-joysticks/mobile-boundary.png', fullPage: true });

  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser should have no console, page or request errors', errors);
  await page.evaluate((artifact) => {
    window.__DEV085_ARTIFACT = artifact;
  }, {
    ok: true,
    selectedCounts,
    ariaLabels,
    geometry: { before, during, after, reloaded, storedControls },
    endpointOuterEdges,
    hitTargets: { fromBox, zoomBoxBefore, zoomBoxAfter },
    lineHitWindow: {
      ...lineHitWindow,
      selectedFromCenterlineClick: true,
      edgeToleranceOffset,
      selectedFromEdgeToleranceClick: true,
      curvedAlignment: curvedHitWindowAlignment,
    },
    viewportEvidence: {
      desktop: { width: 1440, height: 900 },
      laptop: { width: 1024, height: 768, documentOverflow: laptopOverflow },
      mobile: { width: 390, height: 844, ...mobileBoundary },
    },
    nonPrimaryGeometryUnchanged: true,
    cancelRestored: true,
    errors,
  });
}
