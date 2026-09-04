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
  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'TypeError', 'ReferenceError', 'Unhandled Runtime Error']
      .find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show a visible runtime error`, { visibleError });
  };
  const nodeByTitle = title => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const createRoot = async (title) => {
    const createRootButton = page.locator('[data-mindmap-create-root]');
    if (await createRootButton.count()) {
      await createRootButton.click();
    } else {
      await page.locator('[data-mindmap-view]').focus();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
    }
    const quickTitle = page.locator('[data-mindmap-quick-title-input="true"]');
    await quickTitle.waitFor({ state: 'visible', timeout: 10000 });
    await quickTitle.fill(title);
    await quickTitle.press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
  };
  const openRelationshipAction = async (node) => {
    await node.click({ button: 'right' });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    const action = menu.locator('[data-task-action-id="task.create-relationship"]');
    await action.waitFor({ state: 'visible', timeout: 10000 });
    return { menu, action };
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((session) => {
    localStorage.setItem('projed-local-test.selected-account', session.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      createdAt: session.createdAt,
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

  const stamp = Date.now().toString(36);
  const sourceTitle = `DEV079 source ${stamp}`;
  const targetTitle = `DEV079 target ${stamp}`;
  const relationshipLabel = `DEV079 relation ${stamp}`;
  await createRoot(sourceTitle);
  await createRoot(targetTitle);
  const source = nodeByTitle(sourceTitle);
  const target = nodeByTitle(targetTitle);
  const sourceId = await source.getAttribute('data-mindmap-node');
  const targetId = await target.getAttribute('data-mindmap-node');
  assert(Boolean(sourceId) && Boolean(targetId), 'source and target nodes must expose ids', { sourceId, targetId });

  const { menu, action } = await openRelationshipAction(source);
  assert(await action.innerText() === '建立關聯線', 'mindmap right-click menu must label the new action 建立關聯線');
  assert(await action.isDisabled() === false, 'editable local QA account should enable 建立關聯線');
  await action.click();
  await menu.waitFor({ state: 'hidden', timeout: 10000 });

  const tool = page.locator('[data-mindmap-note-relationship-tool]');
  await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${sourceId}"]`).waitFor({ state: 'visible', timeout: 10000 });
  assert(await tool.getAttribute('data-source-node-id') === sourceId, 'context action should use the right-clicked node as relationship source', { sourceId });
  assert(await page.locator(`[data-mindmap-node="${sourceId}"][aria-selected="true"]`).count() === 1, 'context action should preserve source node selection');

  await target.click();
  const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
  await editor.waitFor({ state: 'visible', timeout: 10000 });
  assert(await editor.getAttribute('data-from-node-id') === sourceId, 'relationship editor should retain source endpoint', { sourceId });
  assert(await editor.getAttribute('data-to-node-id') === targetId, 'relationship editor should use the clicked target endpoint', { targetId });
  await editor.fill(relationshipLabel);
  await page.keyboard.press('Enter');
  const relationshipPath = page.locator(`[data-mindmap-note-relationship-path][data-label="${relationshipLabel}"]`).first();
  await relationshipPath.waitFor({ state: 'attached', timeout: 10000 });
  assert(await relationshipPath.count() === 1, 'created relationship path should be mounted in the mindmap overlay');
  assert(await relationshipPath.getAttribute('data-from-node-id') === sourceId, 'created relationship should persist source endpoint');
  assert(await relationshipPath.getAttribute('data-to-node-id') === targetId, 'created relationship should persist target endpoint');
  assert(await tool.getAttribute('data-active') === 'false', 'relationship tool should finish after selecting the target');

  // Re-enter from the menu and prove Escape cancels the transient selection mode.
  await page.keyboard.press('Escape');
  await page.locator('[data-mindmap-note-relationship-style-drawer="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  const secondAction = await openRelationshipAction(target);
  await secondAction.action.click();
  await secondAction.menu.waitFor({ state: 'hidden', timeout: 10000 });
  await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${targetId}"]`).waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert(await tool.getAttribute('data-active') === 'false', 'Escape should cancel relationship mode started from the context menu');
  assert(await page.locator('[data-mindmap-note-relationship-draft-preview]').count() === 0, 'Escape should clear relationship draft preview');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  const laptopAction = await openRelationshipAction(source);
  assert(await laptopAction.action.innerText() === '建立關聯線', '1024px mindmap context menu should keep 建立關聯線');
  await page.keyboard.press('Escape');
  await assertNoVisibleErrors('DEV-079 laptop');

  // The action is mindmap-only; board task menus keep their existing action set.
  await selectViewMode('board');
  const card = page.locator('.kanban-task-card[data-task-id]').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click({ button: 'right' });
  const boardMenu = page.locator('[data-global-context-menu="true"]');
  await boardMenu.waitFor({ state: 'visible', timeout: 10000 });
  assert(await boardMenu.locator('[data-task-action-id="task.create-relationship"]').count() === 0, 'board task menu must not expose mindmap 建立關聯線');
  await page.keyboard.press('Escape');

  await assertNoVisibleErrors('DEV-079 desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => ({
    width: window.innerWidth,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    visibleErrors: Array.from(document.querySelectorAll('body *')).filter(element => element.textContent?.includes('Unhandled Runtime Error')).length,
  }));
  assert(mobile.overflow <= 2, 'context-menu feature should not introduce mobile document overflow', mobile);
  assert(mobile.visibleErrors === 0, 'mobile boundary should not show runtime errors', mobile);
  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser should have no console/page/network errors', errors);

  await page.evaluate((artifact) => { window.__DEV079_ARTIFACT = artifact; }, {
    ok: true,
    sourceId,
    targetId,
    relationshipLabel,
    mindmapContextAction: '建立關聯線',
    laptopContextAction: '建立關聯線',
    boardContextActionCount: 0,
    escapeCancellation: true,
    mobile,
    errors,
  });
}
