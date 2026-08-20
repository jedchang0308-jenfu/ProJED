/* eslint-disable */
/**
 * DEV-074 QA/QC black-box runner.
 * Product behavior is exercised through real browser events. page.evaluate is
 * restricted to fixture bootstrap and read-only measurement.
 */
async (page) => {
  const BASE_URL = 'http://localhost:4000/?dev074Phase=after';
  const OUTPUT = 'output/playwright/dev-074-ai-real-operation';
  const viewportDesktop = { width: 1440, height: 900, label: 'desktop' };
  const viewportCompact = { width: 1024, height: 768, label: 'compact' };
  const viewportMobile = { width: 390, height: 844, label: 'mobile' };
  const account = {
    id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
    displayName: 'DEV-074 AI QA', createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev074-workspace', title: 'DEV-074 AI 真實操作驗證', ownerId: account.id,
    members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev074-board', title: 'DEV-074 AI 心智圖', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const baseNode = (id, title, order, parentId = null, patch = {}) => ({
    id, workspaceId: workspace.id, boardId: 'dev074-board', parentId, title,
    status: 'todo', nodeType: 'task', order, createdAt: 1704067200000 + order,
    updatedAt: 1704067200000 + order, ...patch,
  });
  const baseNodes = () => ({
    'dev074-ai-root-a': baseNode('dev074-ai-root-a', 'AI Root A', 0),
    'dev074-ai-root-b': baseNode('dev074-ai-root-b', 'AI Root B', 1),
    'dev074-ai-child-a': baseNode('dev074-ai-child-a', 'AI Child A', 0, 'dev074-ai-root-a'),
    'dev074-ai-child-b': baseNode('dev074-ai-child-b', 'AI Child B', 0, 'dev074-ai-root-b'),
  });
  const relationship = (id = 'dev074-ai-relationship') => ({
    id, boardId: 'dev074-board', fromId: 'dev074-ai-root-a', toId: 'dev074-ai-root-b',
    label: 'AI relationship', createdAt: 1704067200000, updatedAt: 1704067200000,
    style: { arrowEnd: true, strokeDasharray: '7 6' },
  });
  const denseNodes = () => {
    const nodes = {};
    for (let rootIndex = 0; rootIndex < 8; rootIndex += 1) {
      const rootId = `dev074-ai-dense-root-${rootIndex}`;
      nodes[rootId] = baseNode(rootId, `Dense Root ${rootIndex}`, rootIndex);
      for (let childIndex = 0; childIndex < 7; childIndex += 1) {
        const id = `dev074-ai-dense-${rootIndex}-${childIndex}`;
        nodes[id] = baseNode(id, `Dense ${rootIndex}-${childIndex}`, childIndex, rootId);
      }
    }
    return nodes;
  };
  const denseRelationships = () => Array.from({ length: 16 }, (_, index) => ({
    id: `dev074-ai-dense-rel-${index}`,
    boardId: 'dev074-board',
    fromId: `dev074-ai-dense-root-${index % 8}`,
    toId: `dev074-ai-dense-${index % 8}-${Math.floor(index / 8)}`,
    label: `Dense relation ${index}`,
    createdAt: 1704067200000 + index,
    updatedAt: 1704067200000 + index,
    style: { arrowEnd: true, strokeDasharray: index % 2 ? '7 6' : '' },
  }));
  const fixtures = {
    navigation: { id: 'dev074-ai-navigation-v1', nodes: baseNodes(), relationships: [] },
    create: { id: 'dev074-ai-create-v1', nodes: baseNodes(), relationships: [] },
    relationship: { id: 'dev074-ai-relationship-v1', nodes: baseNodes(), relationships: [relationship()] },
    dense: { id: 'dev074-ai-dense-v1', nodes: denseNodes(), relationships: denseRelationships() },
  };
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  const waitForMindMap = async () => {
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-viewport="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-scene="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-node]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(180);
  };
  const waitForStable = async () => {
    await page.waitForTimeout(40);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const writeFixture = async (fixture) => page.evaluate(({ account, workspace, fixture }) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(fixture.nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    // The fixed local QA bootstrap uses this sentinel to avoid reseeding its
    // default board after reload. Fixture size is captured in the artifact,
    // not in the sentinel expected by the app's test harness.
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev074-board');
    localStorage.setItem('projed-last-view', 'mindmap');
    localStorage.setItem('projed.mindmap.noteRelationships.dev074-board', JSON.stringify(fixture.relationships));
  }, { account, workspace, fixture });
  let authenticated = false;
  const resetFixture = async (fixture, viewport = viewportDesktop) => {
    await page.setViewportSize(viewport);
    if (!authenticated) {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await writeFixture(fixture);
      await page.reload({ waitUntil: 'networkidle' });
      if (await page.locator('nav').count() === 0) {
        const login = page.getByRole('button', { name: /使用固定測試環境/ }).first();
        await login.waitFor({ state: 'visible', timeout: 10000 });
        await login.click();
        await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
        await writeFixture(fixture);
        await page.reload({ waitUntil: 'networkidle' });
      }
      authenticated = true;
    } else {
      await writeFixture(fixture);
      await page.reload({ waitUntil: 'networkidle' });
    }
    if (viewport.width <= 640) {
      await page.locator('[data-mobile-pan-surface="board"]').first().waitFor({ state: 'visible', timeout: 15000 });
      return;
    }
    const mindMap = page.locator('[data-mindmap-view]').first();
    if (!(await mindMap.isVisible().catch(() => false))) {
      await page.locator('[data-mode-switcher-trigger="true"]').click();
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await waitForMindMap();
  };
  const visibleErrors = async () => page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const patterns = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'TypeError', 'ReferenceError', 'Unhandled Runtime Error'];
    const textMatches = patterns.filter(pattern => bodyText.includes(pattern));
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .inline-error'))
      .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean);
    return { textMatches, alerts };
  });
  const readState = async () => page.evaluate(() => {
    const rect = element => { const value = element?.getBoundingClientRect?.(); return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null; };
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    const scene = document.querySelector('[data-mindmap-scene="true"]');
    const nodes = Array.from(document.querySelectorAll('[data-mindmap-node]')).map(element => ({
      id: element.getAttribute('data-mindmap-node'), title: element.getAttribute('data-mindmap-node-title'),
      parentId: element.getAttribute('data-mindmap-parent-id'), order: element.getAttribute('data-mindmap-node-order'),
      selected: element.getAttribute('aria-selected'), editing: element.getAttribute('data-mindmap-inline-title-editing'), rect: rect(element),
    }));
    const relationships = Array.from(document.querySelectorAll('[data-mindmap-note-relationship-path]')).map(element => ({
      id: element.getAttribute('data-mindmap-note-relationship-path'), d: element.getAttribute('d'),
      fromX: element.getAttribute('data-from-x'), fromY: element.getAttribute('data-from-y'), toX: element.getAttribute('data-to-x'), toY: element.getAttribute('data-to-y'),
    }));
    const handles = Array.from(document.querySelectorAll('[data-mindmap-note-relationship-endpoint], [data-mindmap-note-relationship-control-point]')).map(element => ({
      type: element.getAttribute('data-mindmap-note-relationship-endpoint') || `control-${element.getAttribute('data-mindmap-note-relationship-control-point')}`, rect: rect(element),
    }));
    return {
      viewport: rect(viewport), scene: rect(scene), sceneTransform: scene?.style.transform || '',
      zoom: Number(viewport?.getAttribute('data-mindmap-zoom-level') || 0),
      scroll: { left: viewport?.scrollLeft || 0, top: viewport?.scrollTop || 0, width: viewport?.scrollWidth || 0, height: viewport?.scrollHeight || 0, clientWidth: viewport?.clientWidth || 0, clientHeight: viewport?.clientHeight || 0 },
      scrollOwners: document.querySelectorAll('[data-mindmap-scroll-owner="true"]').length,
      nodes, nodeCount: nodes.length, connectorCount: document.querySelectorAll('[data-mindmap-connector-path]').length,
      relationships, relationshipCount: relationships.length, handles,
      overlays: document.querySelectorAll('[data-mindmap-drag-preview], [data-mindmap-drop-preview], [data-mindmap-insertion-preview], [data-mindmap-note-relationship-draft-preview]').length,
      quickTitle: document.querySelectorAll('[data-mindmap-quick-title-input="true"]').length,
      details: document.querySelectorAll('[data-task-details-modal="true"]').length,
      contextMenu: document.querySelectorAll('[data-global-context-menu="true"]').length,
      focus: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.getAttribute('data-mindmap-node') || '', quick: document.activeElement.getAttribute('data-mindmap-quick-title-input') || '' } : null,
      recomputeCount: Number(document.querySelector('[data-mindmap-recompute-count]')?.getAttribute('data-mindmap-recompute-count') || 0),
      lastGeometryReasons: document.querySelector('[data-mindmap-last-geometry-reasons]')?.getAttribute('data-mindmap-last-geometry-reasons') || '',
      bodyScroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight },
      relationshipStorage: localStorage.getItem('projed.mindmap.noteRelationships.dev074-board') || '',
      nodeStorage: localStorage.getItem('projed-local-test.nodes') || '',
    };
  });
  const screenshot = async (name) => {
    const path = `${OUTPUT}/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
  };
  const assert = (condition, message, details = {}) => { if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`); };
  const assertNoErrors = async (label, allowAlerts = []) => {
    const errors = await visibleErrors();
    const unexpectedAlerts = errors.alerts.filter(alert => !allowAlerts.some(pattern => alert.includes(pattern)));
    assert(errors.textMatches.length === 0 && unexpectedAlerts.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0, `${label} visible/runtime errors`, { errors, consoleErrors, pageErrors });
  };
  const node = id => page.locator(`[data-mindmap-node="${id}"]`).first();
  const settle = async () => { await waitForStable(); await page.waitForTimeout(120); };
  const cases = [];
  const runCase = async (id, fixture, viewport, action) => {
    consoleErrors.length = 0; pageErrors.length = 0;
    const result = { caseId: id, fixtureId: fixture.id, viewport: { width: viewport.width, height: viewport.height, label: viewport.label }, actions: [], screenshots: [], status: 'PASS' };
    try {
      await resetFixture(fixture, viewport);
      await assertNoErrors(`${id} initial`);
      result.before = await readState();
      result.screenshots.push(await screenshot(`${id}-before`));
      await action(result);
      await settle();
      await assertNoErrors(`${id} after`);
      result.after = await readState();
      result.screenshots.push(await screenshot(`${id}-after`));
    } catch (error) {
      result.status = 'FAIL';
      result.error = String(error?.message || error);
      result.consoleErrors = [...consoleErrors]; result.pageErrors = [...pageErrors];
      try { result.visibleErrors = await visibleErrors(); result.after = await readState(); result.screenshots.push(await screenshot(`${id}-failure`)); } catch (captureError) { result.captureError = String(captureError?.message || captureError); }
    }
    result.consoleErrors = result.consoleErrors || [...consoleErrors];
    result.pageErrors = result.pageErrors || [...pageErrors];
    cases.push(result);
    return result;
  };

  await runCase('AI-074-RO-01', fixtures.navigation, viewportDesktop, async result => {
    const state = result.before;
    assert(state.nodeCount === 4 && state.relationshipCount === 0, 'navigation fixture should show four nodes and no relationship', state);
    assert(state.scrollOwners === 1 && state.sceneTransform.startsWith('matrix('), 'single scene shell should be rendered', state);
    result.actions.push('hard-reload → mindmap visible → data sanity');
  });
  await runCase('AI-074-RO-02', fixtures.navigation, viewportDesktop, async result => {
    const target = node('dev074-ai-root-a'); await target.click(); await page.waitForTimeout(360);
    const input = page.locator('[data-mindmap-quick-title-input="true"]'); await input.waitFor({ state: 'visible', timeout: 10000 });
    const countBefore = await page.locator('[data-mindmap-node]').count(); await input.fill('AI Enter renamed'); await input.press('Enter'); await settle();
    assert(await page.locator('[data-mindmap-node-title="AI Enter renamed"]').count() === 1, 'Enter should commit quick title');
    assert(await page.locator('[data-mindmap-node]').count() === countBefore, 'Enter should not create a node');
    await node('dev074-ai-root-a').click(); await page.waitForTimeout(360); await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill('AI Tab parent'); await input.press('Tab'); await page.waitForTimeout(180);
    const childEditor = page.locator('[data-mindmap-inline-title-editing="true"]');
    assert(await page.locator('[data-mindmap-node]').count() === countBefore + 1, 'Tab should create one child continuation');
    assert(await childEditor.getAttribute('data-mindmap-parent-id') === 'dev074-ai-root-a', 'Tab child should keep parent');
    await page.locator('[data-mindmap-quick-title-input="true"]').press('Escape');
    result.actions.push('single click → quick-title → Enter; Tab child continuation → Escape');
  });
  await runCase('AI-074-RO-03', fixtures.navigation, viewportDesktop, async result => {
    const target = node('dev074-ai-root-a'); await target.dblclick();
    const details = page.locator('[data-task-details-modal="true"]'); await details.waitFor({ state: 'visible', timeout: 10000 });
    assert(await details.getAttribute('data-task-id') === 'dev074-ai-root-a', 'double click should open matching details');
    await details.locator('button[aria-label="關閉任務詳情"]').click(); await details.waitFor({ state: 'hidden', timeout: 10000 });
    await target.click({ button: 'right' }); const menu = page.locator('[data-global-context-menu="true"]'); await menu.waitFor({ state: 'visible', timeout: 10000 });
    assert(await menu.getAttribute('data-global-context-menu-kind') === 'task', 'right click should open task context menu'); await page.keyboard.press('Escape');
    result.actions.push('double-click details → close → right-click task menu → Escape');
  });
  await runCase('AI-074-RO-04', fixtures.navigation, viewportDesktop, async result => {
    const toggle = page.locator('[data-mindmap-toggle-parent-id="dev074-ai-root-a"]'); await toggle.click({ force: true }); await settle();
    assert(await toggle.getAttribute('aria-expanded') === 'false', 'collapse should hide child branch');
    await toggle.click({ force: true }); await settle(); assert(await toggle.getAttribute('aria-expanded') === 'true', 'expand should restore child branch');
    result.actions.push('collapse branch → expand branch');
  });
  await runCase('AI-074-RO-05', fixtures.relationship, viewportDesktop, async result => {
    const before = await readState(); const target = node('dev074-ai-root-a'); const box = await target.boundingBox(); assert(box, 'root node should have bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, -720); await page.keyboard.up('Control'); await settle();
    const zoomed = await readState(); assert(zoomed.zoom > before.zoom, 'wheel should zoom scene'); assert(zoomed.relationships[0]?.d === before.relationships[0]?.d, 'pure wheel zoom should preserve world path');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down({ button: 'middle' }); await page.mouse.move(box.x + 120, box.y + 80); await page.mouse.up({ button: 'middle' }); await settle();
    const panned = await readState(); assert(panned.scrollOwners === 1, 'pan should retain one scroll owner'); assert(panned.relationships[0]?.d === before.relationships[0]?.d, 'pan should preserve world path');
    await page.locator('[data-mindmap-zoom-reset]').click(); await settle(); result.actions.push('wheel zoom at node → middle-button pan → reset');
  });
  await runCase('AI-074-RO-06', fixtures.relationship, viewportDesktop, async result => {
    await page.locator('[data-mindmap-zoom-fit]').click(); await settle(); await page.locator('[data-mindmap-zoom-reset]').click(); await settle();
    const viewport = page.locator('[data-mindmap-viewport="true"]');
    const box = await viewport.boundingBox(); assert(box, 'viewport should have bounding box'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(2600, 2600); await settle();
    const state = await readState(); assert(state.scroll.left >= 0 && state.scroll.top >= 0, 'scroll should clamp to finite non-negative values'); assert(state.scroll.width >= state.scroll.clientWidth && state.scroll.height >= state.scroll.clientHeight, 'scene should expose reachable scroll extent');
    result.actions.push('fit → reset → real horizontal/vertical wheel to far edge');
  });
  await runCase('AI-074-RO-07', fixtures.create, viewportDesktop, async result => {
    await page.keyboard.press('Escape'); const relationshipTool = page.locator('[data-mindmap-note-relationship-tool]'); await relationshipTool.click();
    if (await relationshipTool.getAttribute('data-source-node-id')) { await page.keyboard.press('Escape'); if (await relationshipTool.getAttribute('data-active') === 'true') await relationshipTool.click(); await relationshipTool.click(); }
    if (!(await relationshipTool.getAttribute('data-source-node-id'))) await node('dev074-ai-root-a').click(); await node('dev074-ai-root-b').click();
    const input = page.locator('[data-mindmap-note-relationship-label-input]').first(); await input.waitFor({ state: 'visible', timeout: 10000 }); await input.fill('AI created relationship'); await input.press('Enter'); await settle();
    const state = await readState(); assert(state.relationshipCount === 1, 'relationship creation should add exactly one path'); assert(state.relationshipStorage.includes('AI created relationship'), 'relationship label should persist in local storage');
    result.actions.push('relationship tool → source → target → label Enter');
  });
  await runCase('AI-074-RO-08', fixtures.create, viewportDesktop, async result => {
    await page.keyboard.press('Escape'); const relationshipTool = page.locator('[data-mindmap-note-relationship-tool]'); await relationshipTool.click();
    if (await relationshipTool.getAttribute('data-source-node-id')) { await page.keyboard.press('Escape'); if (await relationshipTool.getAttribute('data-active') === 'true') await relationshipTool.click(); await relationshipTool.click(); }
    if (!(await relationshipTool.getAttribute('data-source-node-id'))) await node('dev074-ai-root-a').click(); await page.keyboard.press('Escape'); await settle();
    assert((await page.locator('[data-mindmap-note-relationship-draft-preview]').count()) === 0, 'Escape should clear relationship draft');
    await relationshipTool.click(); if (!(await relationshipTool.getAttribute('data-source-node-id'))) await node('dev074-ai-root-a').click(); await node('dev074-ai-root-a').click(); await settle();
    const state = await readState(); assert(state.relationshipCount === 0, 'self-link should not create relationship');
    result.actions.push('relationship draft Escape → self-link attempt');
  });
  await runCase('AI-074-RO-09', fixtures.relationship, viewportDesktop, async result => {
    await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true }); await page.keyboard.press('Space');
    const input = page.locator('[data-mindmap-note-relationship-label-input]').first(); await input.waitFor({ state: 'visible', timeout: 10000 }); await input.fill('AI edited label'); await input.press('Enter'); await settle();
    const drawer = page.locator('[data-mindmap-note-relationship-style-drawer="true"]'); await drawer.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-mindmap-note-relationship-style-width="3.5"]').click(); await page.locator('[data-mindmap-note-relationship-style-arrow="both"]').click(); await settle();
    const state = await readState(); assert(state.relationshipStorage.includes('AI edited label'), 'relationship label edit should persist'); result.actions.push('select relationship → Space label edit → style width/arrow');
  });
  await runCase('AI-074-RO-10', fixtures.relationship, viewportDesktop, async result => {
    await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true }); await page.locator('[data-mindmap-note-relationship-endpoint]').first().waitFor({ state: 'visible', timeout: 10000 });
    const handle = page.locator('[data-mindmap-note-relationship-control-point]').first(); await handle.waitFor({ state: 'visible', timeout: 10000 }); const box = await handle.boundingBox(); assert(box, 'control point handle should be visible');
    const before = await readState(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 70, box.y + 45, { steps: 5 }); await page.mouse.up(); await settle(); const after = await readState();
    assert(after.relationships[0]?.d !== before.relationships[0]?.d, 'control point drag should update path'); assert(after.handles.every(item => item.rect?.width >= 24 && item.rect?.height >= 24), 'relationship handles should remain at least 24px'); result.actions.push('select relationship → drag control point');
  });
  await runCase('AI-074-RO-11', fixtures.navigation, viewportDesktop, async result => {
    const source = node('dev074-ai-child-a'); const target = node('dev074-ai-root-b'); await source.dragTo(target); await settle(); const state = await readState();
    assert(state.nodes.some(item => item.id === 'dev074-ai-child-a' && item.parentId === 'dev074-ai-root-b'), 'drag/drop should update child parent'); result.actions.push('drag child A to root B');
  });
  await runCase('AI-074-RO-13', fixtures.relationship, viewportDesktop, async result => {
    await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true }); await page.keyboard.press('Space'); const input = page.locator('[data-mindmap-note-relationship-label-input]').first(); await input.waitFor({ state: 'visible', timeout: 10000 }); await input.fill('AI reload label'); await input.press('Enter'); await settle(); const before = await readState(); await page.reload({ waitUntil: 'networkidle' }); await waitForMindMap(); await settle(); const after = await readState();
    assert(after.relationshipStorage === before.relationshipStorage, 'reload should preserve relationship storage'); assert(after.relationshipCount === 1, 'reload should render one relationship'); result.actions.push('label mutation → hard reload → verify persistence');
  });
  await runCase('AI-074-RO-14', fixtures.navigation, viewportMobile, async result => {
    const state = result.before; assert(await page.locator('[data-mobile-pan-surface="board"]').first().isVisible(), 'mobile board boundary should remain usable'); assert(state.bodyScroll.width <= viewportMobile.width + 2, 'mobile surface should not horizontally overflow'); result.actions.push('390x844 hard reload → mobile boundary smoke');
  });

  await runCase('AI-074-EXT-01', fixtures.relationship, viewportDesktop, async result => {
    const target = node('dev074-ai-root-a'); const box = await target.boundingBox(); assert(box, 'zoom target should be measurable'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await readState(); await page.keyboard.down('Control'); for (let index = 0; index < 20; index += 1) await page.mouse.wheel(0, index % 2 ? 240 : -240); await page.keyboard.up('Control'); await settle(); const after = await readState();
    assert(after.zoom >= 0.25 && after.zoom <= 4 && after.relationships[0]?.d === before.relationships[0]?.d, 'rapid reverse zoom should clamp and preserve path', { before, after }); result.actions.push('20 alternating wheel events within burst');
  });
  await runCase('AI-074-EXT-02', fixtures.relationship, viewportDesktop, async result => {
    const scales = [0.25, 4, 0.25, 4, 0.25, 4]; const zoomIn = page.locator('[data-mindmap-zoom-in]'); const zoomOut = page.locator('[data-mindmap-zoom-out]');
    for (const scale of scales) { for (let i = 0; i < 20; i += 1) { const current = Number(await page.locator('[data-mindmap-viewport="true"]').getAttribute('data-mindmap-zoom-level')); await (scale > current ? zoomIn : zoomOut).click(); } await settle(); }
    const state = await readState(); assert(state.zoom >= 0.25 && state.zoom <= 4 && state.scroll.width < 100000 && state.scroll.height < 100000, 'boundary zoom hammer should remain finite and bounded', state); result.actions.push('25↔400 boundary hammer plus toolbar events');
  });
  await runCase('AI-074-EXT-03', fixtures.relationship, viewportDesktop, async result => {
    const target = node('dev074-ai-root-a'); const box = await target.boundingBox(); assert(box, 'race target should be measurable'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, -600); await page.keyboard.up('Control'); await page.mouse.down({ button: 'middle' }); await page.mouse.move(box.x + 160, box.y + 100, { steps: 3 }); await page.mouse.wheel(1800, 1800); await page.mouse.up({ button: 'middle' }); await settle(); const state = await readState(); assert(state.scrollOwners === 1 && state.overlays === 0, 'zoom/pan/scroll race should leave one owner and no overlay'); result.actions.push('wheel → middle pan → horizontal/vertical wheel race');
  });
  await runCase('AI-074-EXT-04', fixtures.relationship, viewportDesktop, async result => {
    for (const size of [viewportCompact, { width: 1280, height: 720, label: 'resize-1280' }, viewportMobile, viewportDesktop]) { await page.setViewportSize(size); await page.waitForTimeout(150); }
    const desktopMindMap = page.locator('[data-mindmap-view]').first();
    if (!(await desktopMindMap.isVisible().catch(() => false))) { await page.locator('[data-mode-switcher-trigger="true"]').click({ force: true }); await page.locator('[data-mode-switcher-value="mindmap"]').click({ force: true }); }
    await waitForMindMap(); await settle(); const state = await readState(); assert(state.sceneTransform.startsWith('matrix(') && state.scrollOwners === 1, 'resize storm should restore scene matrix and one owner'); result.actions.push('1440→1024→1280→390→1440 resize storm');
  });
  await runCase('AI-074-EXT-05', fixtures.relationship, viewportDesktop, async result => {
    const handle = page.locator('[data-mindmap-note-relationship-endpoint]').first(); await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true }); await handle.waitFor({ state: 'visible', timeout: 10000 }); const box = await handle.boundingBox(); assert(box, 'endpoint should be measurable'); const before = await readState(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(30, 30, { steps: 4 }); await page.keyboard.press('Escape'); await page.waitForTimeout(120); await page.mouse.up(); await page.locator('[data-mindmap-zoom-fit]').click(); await settle(); const after = await readState(); assert(after.overlays === 0 && after.relationshipStorage === before.relationshipStorage, 'interrupted handle drag should clear and not persist', { beforeStorage: before.relationshipStorage, afterStorage: after.relationshipStorage, beforeOverlays: before.overlays, afterOverlays: after.overlays, afterZoom: after.zoom }); result.actions.push('endpoint drag outside → Escape → fit recovery');
  });
  await runCase('AI-074-EXT-06', fixtures.dense, viewportDesktop, async result => {
    const state = result.before; const storedNodeCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')).length); assert(storedNodeCount === 64 && state.relationshipCount === 16, 'dense fixture should load 64 stored nodes and 16 relationships', { storedNodeCount, state }); const toggles = page.locator('[data-mindmap-toggle]'); const count = await toggles.count(); for (let index = 0; index < count; index += 1) { if (await toggles.nth(index).getAttribute('aria-expanded') === 'false') await toggles.nth(index).click({ force: true }); } await page.locator('[data-mindmap-zoom-in]').click(); await page.locator('[data-mindmap-zoom-out]').click(); await settle(); const after = await readState(); assert(after.nodeCount === 64 && after.relationshipCount === 16 && after.overlays === 0, 'dense topology should settle without dropping data', after); result.actions.push('64 nodes/16 relationships → expand all → zoom in/out');
  });
  await runCase('AI-074-EXT-07', fixtures.navigation, viewportDesktop, async result => {
    await node('dev074-ai-root-a').click(); await page.waitForTimeout(360); const input = page.locator('[data-mindmap-quick-title-input="true"]'); await input.waitFor({ state: 'visible', timeout: 10000 }); const longTitle = '極限操作 長文字 CJK 中文測試 '.repeat(8) + 'emoji🙂🚀 punctuation___no_spaces'.repeat(3); await input.fill(longTitle); await input.press('Enter'); await settle(); const state = await readState(); const target = state.nodes.find(item => item.id === 'dev074-ai-root-a'); assert(target?.title === longTitle && state.bodyScroll.width <= viewportDesktop.width + 2, 'long title should commit without document overflow', { target, bodyScroll: state.bodyScroll }); result.actions.push('256+ mixed CJK/emoji/no-space title through quick-title');
  });
  await runCase('AI-074-EXT-08', fixtures.navigation, viewportDesktop, async result => {
    const target = node('dev074-ai-root-a'); const before = await page.locator('[data-mindmap-node]').count(); await target.click(); await page.waitForTimeout(360); let input = page.locator('[data-mindmap-quick-title-input="true"]'); await input.waitFor({ state: 'visible', timeout: 10000 }); for (let i = 0; i < 5; i += 1) { input = page.locator('[data-mindmap-quick-title-input="true"]'); if (await input.count()) await input.first().press('Enter'); await page.waitForTimeout(40); } for (let i = 0; i < 5; i += 1) { await target.press('Tab'); await page.waitForTimeout(40); } for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape'); await settle(); const after = await page.locator('[data-mindmap-node]').count(); assert(after >= before && after <= before + 5, 'rapid keyboard burst should not duplicate unbounded nodes'); assert((await page.locator('[data-task-details-modal="true"]').count()) === 0, 'rapid keyboard burst should not open details'); result.actions.push('quick-title Enter×5 → Tab×5 → Escape×3');
  });
  await runCase('AI-074-EXT-09', fixtures.relationship, viewportDesktop, async result => {
    const viewport = page.locator('[data-mindmap-viewport="true"]'); const box = await viewport.boundingBox(); assert(box, 'viewport should be measurable'); await page.mouse.move(box.x + 4, box.y + 4); for (let i = 0; i < 8; i += 1) await page.mouse.wheel(i % 2 ? -4000 : 4000, i % 2 ? -4000 : 4000); await settle(); const state = await readState(); assert(Number.isFinite(state.scroll.left) && Number.isFinite(state.scroll.top) && state.scroll.left >= 0 && state.scroll.top >= 0, 'overscroll should clamp finite non-negative values'); result.actions.push('large positive/negative wheel deltas from scene corner');
  });
  await runCase('AI-074-EXT-10', fixtures.relationship, viewportDesktop, async result => {
    await page.locator('[data-mindmap-note-relationship-click-target]').click({ force: true }); const before = await readState(); await page.locator('[data-mindmap-zoom-in]').click(); await page.reload({ waitUntil: 'networkidle' }); await waitForMindMap(); await settle(); const after = await readState(); assert(after.overlays === 0 && after.relationshipStorage === before.relationshipStorage, 'reload during zoom/selection should clear transient state only'); result.actions.push('zoom transition → hard reload → transient cleanup');
  });
  await runCase('AI-074-EXT-11', fixtures.relationship, viewportDesktop, async result => {
    const toggle = page.locator('[data-mindmap-toggle-parent-id="dev074-ai-root-a"]'); const relationshipTarget = page.locator('[data-mindmap-note-relationship-click-target]'); for (let i = 0; i < 10; i += 1) { await toggle.click({ force: true }); await toggle.click({ force: true }); await relationshipTarget.click({ force: true }); await page.keyboard.press('Escape'); } await settle(); const state = await readState(); assert(state.nodeCount === 4 && state.relationshipCount === 1 && state.overlays === 0, 'mutation burst should settle to final tree/relationship state'); result.actions.push('expand/collapse + relationship select/cancel burst');
  });
  await runCase('AI-074-EXT-12', fixtures.relationship, viewportCompact, async result => {
    const start = Date.now(); for (let i = 0; i < 8; i += 1) { await page.locator('[data-mindmap-zoom-in]').click(); await page.locator('[data-mindmap-zoom-out]').click(); const target = node('dev074-ai-root-a'); const box = await target.boundingBox(); if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, i % 2 ? 280 : -280); await page.keyboard.up('Control'); } await page.locator('[data-mindmap-zoom-fit]').click(); await settle(); } const state = await readState(); assert(Date.now() - start < 30000 && state.nodeCount === 4 && state.relationshipCount === 1, 'mixed endurance should retain data and settle'); result.actions.push('8 compact viewport mixed zoom/pan/fit cycles');
  });

  const required = cases.filter(item => item.caseId.startsWith('AI-074-RO-') || Number(item.caseId.slice(-2)) <= 8);
  const failures = cases.filter(item => item.status !== 'PASS');
  const artifact = {
    verifier: 'DEV-074-AI-REAL-OPERATION', passed: failures.length === 0, generatedAt: new Date().toISOString(),
    contract: 'single-scene-coordinate-system', fixtureFamily: Object.values(fixtures).map(item => item.id),
    requiredCaseCount: required.length, caseCount: cases.length, requiredFailures: required.filter(item => item.status !== 'PASS').map(item => item.caseId),
    failures: failures.map(item => ({ caseId: item.caseId, status: item.status, error: item.error || '' })),
    consoleErrors: [...consoleErrors], pageErrors: [...pageErrors], cases,
  };
  await page.evaluate(value => { window.__DEV074_AI_ARTIFACT = value; }, artifact);
  if (failures.length > 0) throw new Error(`DEV-074 AI real-operation failures: ${failures.map(item => `${item.caseId}: ${item.error}`).join(' | ')}`);
  return artifact;
}
