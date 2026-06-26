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

  const openMindMap = async (width, height) => {
    await page.setViewportSize({ width, height });
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
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-note-relationship-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const resetFixture = async () => {
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(4);
      Object.keys(localStorage)
        .filter(key => key.startsWith('projed.mindmap.'))
        .forEach(key => localStorage.removeItem(key));
    });
    await page.reload({ waitUntil: 'networkidle' });
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-note-relationship-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const titleInput = () => page.locator('[data-mindmap-title-input]').first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();

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
      '/api/',
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

  const createRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    const sourceId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${sourceId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.evaluate(element => {
      element.focus();
      element.select();
    });
    await editor.fill(label);
    await page.keyboard.press('Enter');
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
  };

  const getBox = async (locator, name) => {
    const box = await locator.boundingBox();
    assert(Boolean(box), `${name} should have a measurable box`);
    return box;
  };

  const assertNoHardOverlap = async () => {
    const nodes = await page.locator('[data-mindmap-node]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-mindmap-node'),
        title: element.getAttribute('data-mindmap-node-title'),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }));
    const overlaps = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (x > 8 && y > 8) overlaps.push({ a: a.title, b: b.title, x, y });
      }
    }
    assert(overlaps.length === 0, 'mind map nodes should not visually overlap', { overlaps });
  };

  const assertSelectedRelationshipUi = async () => {
    const panel = page.locator('[data-mindmap-note-relationship-style-panel]').first();
    const labelTarget = page.locator('[data-mindmap-note-relationship-click-target]').first();
    const lineTarget = page.locator('[data-mindmap-note-relationship-line-click-target]').first();
    const panelBox = await getBox(panel, 'relationship style panel');
    const labelBox = await getBox(labelTarget, 'relationship label hit target');
    const lineBox = await getBox(lineTarget, 'relationship line hit target');
    const viewport = page.viewportSize();

    assert(panelBox.x >= 0 && panelBox.x + panelBox.width <= viewport.width, 'relationship style panel should stay inside viewport horizontally', { panelBox, viewport });
    assert(panelBox.y >= 0 && panelBox.y + panelBox.height <= viewport.height, 'relationship style panel should stay inside viewport vertically', { panelBox, viewport });
    assert(await panel.getAttribute('data-mindmap-note-relationship-style-drawer') === 'true', 'relationship style controls should use the right drawer layout');
    assert(panelBox.x + panelBox.width >= viewport.width - 2, 'relationship style drawer should be attached to the right viewport edge', { panelBox, viewport });
    assert(panelBox.width >= 300, 'relationship style drawer should be wide enough for Xmind-like setting groups', { panelBox });
    assert(panelBox.height >= viewport.height - 120, 'relationship style drawer should occupy the work area height', { panelBox, viewport });
    assert(labelBox.width >= 88 && labelBox.height >= 28, 'relationship label hit target should remain finger-clickable', { labelBox });
    assert(lineBox.width >= 72 && lineBox.height >= 18, 'relationship line hit target should remain clickable', { lineBox });

    const handleBoxes = await page.locator('[data-mindmap-note-relationship-screen-control-point]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    assert(handleBoxes.length === 2, 'selected relationship should expose two visible Bezier adjustment control points', { handleBoxes });
    const tiny = handleBoxes.filter(box => box.width < 18 || box.height < 18);
    assert(tiny.length === 0, 'relationship adjustment control points should be large enough to drag reliably', { tiny, handleBoxes });
  };

  const scrollRelationshipIntoView = async (label) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const moved = await page.evaluate((label) => {
        const scroller = document.querySelector('[data-mindmap-zoom-level]');
        const target = document.querySelector(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`);
        if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) return false;
        const rect = target.getBoundingClientRect();
        const deltaX = rect.left + rect.width / 2 - window.innerWidth / 2;
        const deltaY = rect.top + rect.height / 2 - window.innerHeight / 2;
        scroller.scrollLeft += deltaX;
        scroller.scrollTop += deltaY;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        return Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12;
      }, label);
      await page.waitForTimeout(150);
      if (!moved) break;
    }
  };

  await openMindMap(1440, 900);
  await resetFixture();
  await assertNoVisibleErrors('DEV-027F desktop initial');
  const stamp = Date.now().toString(36);
  const source = `DEV027F source ${stamp}`;
  const target = `DEV027F target ${stamp}`;
  const third = `DEV027F third ${stamp}`;
  const label = `note ${stamp}`;

  await createRoot(source);
  await createRoot(target);
  await createRoot(third);
  await createRelationship(source, target, label);
  await scrollRelationshipIntoView(label);
  await page.locator(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`).click({ force: true });
  await page.locator('[data-mindmap-note-relationship-style-panel]').waitFor({ state: 'visible', timeout: 10000 });
  await assertSelectedRelationshipUi();
  await assertNoHardOverlap();
  await page.screenshot({ path: 'output/playwright/dev-027F-mindmap-ui-desktop.png', fullPage: true });

  await openMindMap(390, 844);
  await page.locator('[data-mindmap-zoom-fit]').click();
  await page.waitForTimeout(200);
  await page.locator(`[data-mindmap-node-title="${source}"]`).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator(`[data-mindmap-node-title="${source}"]`).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await assertNoVisibleErrors('DEV-027F mobile final');
  await assertNoHardOverlap();
  await page.screenshot({ path: 'output/playwright/dev-027F-mindmap-ui-mobile.png', fullPage: true });
}
