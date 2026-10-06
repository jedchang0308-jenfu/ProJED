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
  const relationshipPath = label => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipHitbox = label => page.locator(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).first();
  const redlinedSelectors = [
    '[data-mindmap-note-relationship-control-guide]',
    '[data-mindmap-note-relationship-control-arm]',
    '[data-mindmap-note-relationship-control-arm-overlay]',
    '[data-mindmap-note-relationship-svg-control-point]',
    '[data-mindmap-note-relationship-control-point]',
    '[data-mindmap-note-relationship-screen-control-point]',
    '[data-mindmap-note-relationship-screen-control-arm]',
  ];
  const readRedlineCounts = () => page.evaluate((selectors) => Object.fromEntries(
    selectors.map(selector => [selector, document.querySelectorAll(selector).length]),
  ), redlinedSelectors);
  const readDirectionControlCounts = () => page.evaluate(() => ({
    arms: document.querySelectorAll('[data-mindmap-note-relationship-direction-arm]').length,
    joysticks: document.querySelectorAll('[data-mindmap-note-relationship-direction-joystick]').length,
  }));
  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'Unhandled Runtime Error']
      .find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show a visible runtime error`, { visibleError });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    Object.keys(localStorage)
      .filter(key => key.startsWith('projed.mindmap.'))
      .forEach(key => localStorage.removeItem(key));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await selectViewMode('mindmap');
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  await createRoot(`DEV077 source ${Date.now().toString(36)}`);
  const sourceTitle = await page.locator('[data-mindmap-node-title]').first().getAttribute('data-mindmap-node-title');
  await createRoot(`DEV077 target ${Date.now().toString(36)}`);
  const allTitles = await page.locator('[data-mindmap-node-title]').evaluateAll(elements => elements.map(element => element.getAttribute('data-mindmap-node-title')));
  const targetTitle = allTitles.find(title => title && title !== sourceTitle);
  assert(sourceTitle && targetTitle, 'relationship fixture should create two task nodes', { allTitles });
  const label = `DEV077 relation ${Date.now().toString(36)}`;
  await page.evaluate(({ sourceTitle, targetTitle, label }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const source = Object.values(nodes).find(node => node?.title === sourceTitle);
    const target = Object.values(nodes).find(node => node?.title === targetTitle);
    if (!source || !target) throw new Error('relationship fixture nodes missing');
    const key = `projed.mindmap.noteRelationships.${source.boardId}`;
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...current, {
      id: `rel_dev077_${Date.now().toString(36)}`,
      boardId: source.boardId,
      fromId: source.id,
      toId: target.id,
      label,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      geometry: { controlPoints: [{ x: 340, y: 180 }, { x: 540, y: 320 }] },
    }]));
  }, { sourceTitle, targetTitle, label });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('[data-mindmap-view]').count())) await selectViewMode('mindmap');
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  await relationshipPath(label).waitFor({ state: 'attached', timeout: 15000 });
  await relationshipHitbox(label).click({ force: true });
  await page.locator(`[data-mindmap-note-relationship][data-label="${label}"][data-selected="true"]`).waitFor({ state: 'visible', timeout: 10000 });
  const countsDesktop = await readRedlineCounts();
  const directionControlsDesktop = await readDirectionControlCounts();
  assert(Object.values(countsDesktop).every(count => count === 0), 'the extra center guide and legacy duplicate controls should be absent after selection', { countsDesktop });
  assert(directionControlsDesktop.arms === 2 && directionControlsDesktop.joysticks === 2, 'the corrected relationship intent should keep two direction arms and joysticks', { directionControlsDesktop });
  assert(await page.locator('[data-mindmap-note-relationship-endpoint]').count() === 2, 'selected relationship should keep two draggable endpoints');
  assert(await relationshipPath(label).count() === 1, 'relationship path should remain rendered');
  assert(await page.locator('[data-mindmap-note-relationship-label]').count() === 1, 'relationship label should remain rendered');
  assert(await page.locator('[data-mindmap-note-relationship-style-panel]').isVisible(), 'relationship style drawer should remain available');
  await page.screenshot({ path: 'output/playwright/dev-077-mindmap-relationship-redline-cleanup/desktop-selected.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(200);
  const countsZoomed = await readRedlineCounts();
  const directionControlsZoomed = await readDirectionControlCounts();
  assert(Object.values(countsZoomed).every(count => count === 0), 'the extra center guide and legacy duplicate controls should stay absent after zoom', { countsZoomed });
  assert(directionControlsZoomed.arms === 2 && directionControlsZoomed.joysticks === 2, 'direction controls should remain after zoom', { directionControlsZoomed });
  await page.screenshot({ path: 'output/playwright/dev-077-mindmap-relationship-redline-cleanup/desktop-zoomed.png', fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  const countsLaptop = await readRedlineCounts();
  const directionControlsLaptop = await readDirectionControlCounts();
  assert(Object.values(countsLaptop).every(count => count === 0), 'the extra center guide and legacy duplicate controls should stay absent on laptop viewport', { countsLaptop });
  assert(directionControlsLaptop.arms === 2 && directionControlsLaptop.joysticks === 2, 'direction controls should remain on laptop viewport', { directionControlsLaptop });
  await assertNoVisibleErrors('DEV-077 laptop');
  await page.screenshot({ path: 'output/playwright/dev-077-mindmap-relationship-redline-cleanup/laptop-selected.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileBoundary = await page.evaluate((selectors) => ({
    width: window.innerWidth,
    mindMapVisible: Array.from(document.querySelectorAll('[data-mindmap-view]')).some(element => element instanceof HTMLElement && element.offsetParent !== null),
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    redlined: Object.fromEntries(selectors.map(selector => [selector, document.querySelectorAll(selector).length])),
  }), redlinedSelectors);
  assert(mobileBoundary.mindMapVisible === false, '390x844 should preserve the existing mobile mindmap boundary', mobileBoundary);
  assert(mobileBoundary.documentOverflow <= 2, '390x844 should not introduce document overflow', mobileBoundary);
  const countsMobile = await readRedlineCounts();
  assert(Object.values(countsMobile).every(count => count === 0), 'redlined elements should stay absent on mobile boundary', { countsMobile });
  await assertNoVisibleErrors('DEV-077 mobile');
  await page.screenshot({ path: 'output/playwright/dev-077-mindmap-relationship-redline-cleanup/mobile-selected.png', fullPage: true });
  await assertNoVisibleErrors('DEV-077 final');
  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser should have no console/page/network errors', errors);

  await page.evaluate((artifact) => {
    window.__DEV077_ARTIFACT = artifact;
  }, {
    ok: true,
    viewportEvidence: {
      desktop: { width: 1440, height: 900, redlined: countsDesktop },
      zoomed: { redlined: countsZoomed, directionControls: directionControlsZoomed },
      laptop: { width: 1024, height: 768, redlined: countsLaptop, directionControls: directionControlsLaptop },
      mobile: { width: 390, height: 844, boundary: mobileBoundary, redlined: countsMobile },
    },
    endpointCount: 2,
    directionControls: directionControlsDesktop,
    pathCount: 1,
    labelCount: 1,
    errors,
  });
}
