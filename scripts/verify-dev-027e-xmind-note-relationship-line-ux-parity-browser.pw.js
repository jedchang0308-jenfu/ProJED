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
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-note-relationship-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const titleInput = () => page.locator('[data-mindmap-title-input]').first();
  const relationshipGroupByLabel = (label) => page.locator(`[data-mindmap-note-relationship][data-label="${label}"]`).first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipHitboxByLabel = (label) => page.locator(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).first();
  const stylePanel = () => page.locator('[data-mindmap-note-relationship-style-panel]').first();

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

  const createInlineRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    const fromId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${fromId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
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

  const assertFiniteGeometry = (meta, message) => {
    const numbers = ['fromX', 'fromY', 'toX', 'toY', 'c1X', 'c1Y', 'c2X', 'c2Y', 'labelX', 'labelY'];
    const invalid = numbers.filter(key => !Number.isFinite(meta[key]));
    assert(invalid.length === 0, message, { invalid, meta });
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

  await createInlineRelationship(source, target, label);
  await relationshipHitboxByLabel(label).click({ force: true });
  await page.waitForFunction((label) => {
    return document.querySelector(`[data-mindmap-note-relationship][data-label="${label}"]`)?.getAttribute('data-selected') === 'true';
  }, label);
  assert(await relationshipGroupByLabel(label).getAttribute('data-selected') === 'true', 'clicking the line body should select the relationship');
  const relationshipId = await relationshipGroupByLabel(label).getAttribute('data-mindmap-note-relationship');
  assert(await stylePanel().isVisible(), 'relationship style panel should be visible');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-endpoint]`).count()) === 2, 'selected relationship should show two circular endpoints');
  assert((await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-control-point]`).count()) === 2, 'selected relationship should show two square control points');

  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Space');
  const labelEditor = page.locator('[data-mindmap-note-relationship-label-input]').first();
  await labelEditor.waitFor({ state: 'visible', timeout: 10000 });
  await labelEditor.evaluate(element => {
    element.focus();
    element.select();
  });
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

  await page.locator('[data-mindmap-zoom-in]').click();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(150);
  const zoomedMeta = await finitePathMeta(editedLabel);
  assertFiniteGeometry(zoomedMeta, 'relationship geometry should remain finite after zoom');

  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Control+Shift+R');
  await page.locator('[data-mindmap-note-relationship-tool][data-active="true"]').waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.locator('[data-mindmap-note-relationship-tool]').getAttribute('data-active') === 'true', 'Ctrl+Shift+R should start note relationship mode');
  await page.keyboard.press('Escape');

  await nodeByTitle(rightClickSource).click();
  const rightClickSourceId = await nodeByTitle(rightClickSource).getAttribute('data-mindmap-node');
  await nodeByTitle(rightClickSource).click({ button: 'right' });
  await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${rightClickSourceId}"]`).waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.locator('[data-mindmap-note-relationship-tool]').getAttribute('data-source-node-id') === rightClickSourceId, 'right-clicking a task should start note relationship mode from that task');

  await assertNoVisibleErrors('DEV-027E final');
}
