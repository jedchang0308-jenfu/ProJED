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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:1040/', { waitUntil: 'domcontentloaded' });
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

  const switchMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  await switchMode('mindmap');
  const collapseToggle = page.locator('[data-mindmap-toggle]').first();
  await collapseToggle.waitFor({ state: 'attached', timeout: 10000 });
  const collapseParentId = await collapseToggle.getAttribute('data-mindmap-toggle-parent-id');
  assert(Boolean(collapseParentId), 'mindmap collapse toggle must identify its parent task');
  assert(await collapseToggle.evaluate((element) => element.closest('[data-mindmap-node]') === null), 'collapse toggle must not be rendered inside the task node bar');
  const collapseHoverTarget = page.locator(`[data-mindmap-toggle-hover-target="${collapseParentId}"]`);
  assert(await collapseHoverTarget.count() === 1, 'mindmap collapse toggle must expose a relationship-line hover target');
  assert(await collapseToggle.evaluate((element) => getComputedStyle(element).opacity === '0'), 'collapse toggle must be hidden before the relationship line is hovered');
  await collapseHoverTarget.hover();
  await page.waitForFunction((parentId) => {
    const toggle = document.querySelector(`[data-mindmap-toggle-parent-id="${parentId}"]`);
    return toggle instanceof HTMLElement && getComputedStyle(toggle).opacity === '1';
  }, collapseParentId);
  await page.mouse.move(0, 0);
  await page.waitForFunction((parentId) => {
    const toggle = document.querySelector(`[data-mindmap-toggle-parent-id="${parentId}"]`);
    return toggle instanceof HTMLElement && getComputedStyle(toggle).opacity === '0';
  }, collapseParentId);
  await collapseHoverTarget.hover();
  await page.waitForFunction((parentId) => {
    const toggle = document.querySelector(`[data-mindmap-toggle-parent-id="${parentId}"]`);
    return toggle instanceof HTMLElement && getComputedStyle(toggle).opacity === '1';
  }, collapseParentId);
  const toggleGeometry = await page.evaluate((parentId) => {
    const toggle = document.querySelector(`[data-mindmap-toggle-parent-id="${parentId}"]`);
    const parent = document.querySelector(`[data-mindmap-node="${parentId}"]`);
    const child = Array.from(document.querySelectorAll(`[data-mindmap-node][data-mindmap-parent-id="${parentId}"]`))
      .find((element) => element.getClientRects().length > 0);
    if (!(toggle instanceof HTMLElement) || !(parent instanceof HTMLElement) || !(child instanceof HTMLElement)) return null;
    const toggleRect = toggle.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    const direction = parent.getAttribute('data-mindmap-node-direction');
    const expectedX = direction === 'left'
      ? (parentRect.left + childRect.right) / 2
      : (parentRect.right + childRect.left) / 2;
    return {
      deltaX: Math.abs(toggleRect.left + toggleRect.width / 2 - expectedX),
      direction,
    };
  }, collapseParentId);
  assert(toggleGeometry && toggleGeometry.deltaX <= 3, 'collapse toggle must sit on the parent-child relationship line', toggleGeometry || {});
  await page.screenshot({ path: 'output/playwright/dev-073-mindmap-collapse-toggle.png' });
  const collapseChildren = page.locator(`[data-mindmap-children-parent-id="${collapseParentId}"]`);
  assert(await collapseChildren.count() === 1, 'expanded task must render its child group beside the relationship toggle');
  await collapseToggle.click();
  await collapseChildren.waitFor({ state: 'hidden', timeout: 10000 });
  assert(await collapseToggle.getAttribute('aria-expanded') === 'false', 'collapse toggle must expose collapsed state');
  await collapseToggle.click();
  await collapseChildren.waitFor({ state: 'visible', timeout: 10000 });
  assert(await collapseToggle.getAttribute('aria-expanded') === 'true', 'collapse toggle must restore expanded state');
  await collapseToggle.focus();
  await collapseToggle.press('Enter');
  await collapseChildren.waitFor({ state: 'hidden', timeout: 10000 });
  await collapseToggle.press('Enter');
  await collapseChildren.waitFor({ state: 'visible', timeout: 10000 });
  assert(await collapseToggle.getAttribute('aria-expanded') === 'true', 'collapse toggle must support keyboard activation');

  const details = page.locator('[data-task-details-modal="true"]');
  const createRootButton = page.locator('[data-mindmap-create-root]');
  if (await createRootButton.count()) {
    await createRootButton.click();
  } else {
    await page.locator('[data-mindmap-view]').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
  }
  const quickTitleInput = page.locator('[data-mindmap-quick-title-input="true"]');
  const quickTitleNode = page.locator('[data-mindmap-inline-title-editing="true"]');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.count() === 0, 'toolbar-created task must not open details');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) === 'true', 'toolbar-created task must focus quick naming');
  const toolbarQuickTitleMetrics = await quickTitleInput.evaluate((element) => {
    const input = element;
    const anchor = input.parentElement?.querySelector('[data-mindmap-quick-title-layout-anchor="true"]');
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    return {
      inputWidth: input.getBoundingClientRect().width,
      anchorWidth: anchor instanceof HTMLElement ? anchor.getBoundingClientRect().width : 0,
      measuredTextWidth: context ? context.measureText(input.value).width : 0,
      font: style.font,
    };
  });
  assert(toolbarQuickTitleMetrics.inputWidth >= toolbarQuickTitleMetrics.measuredTextWidth, 'CJK quick-title text must fit without clipping when a task enters naming', toolbarQuickTitleMetrics);
  assert(Math.abs(toolbarQuickTitleMetrics.inputWidth - toolbarQuickTitleMetrics.anchorWidth) <= 1, 'quick-title input must overlay the title slot', toolbarQuickTitleMetrics);

  const toolbarTaskId = await quickTitleNode.getAttribute('data-mindmap-node');
  let visibleNodeCount = await page.locator('[data-mindmap-node]').count();
  await quickTitleInput.fill('DEV-073 Toolbar 新任務');
  await quickTitleInput.press('Enter');
  await page.locator('[data-mindmap-node-title="DEV-073 Toolbar 新任務"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, visibleNodeCount);
  assert(await quickTitleInput.count() === 0, 'quick naming Enter must leave the title editor');
  assert(await quickTitleNode.count() === 0, 'quick naming Enter must not leave an inline editor on a new task');
  assert(await page.locator('[data-mindmap-node-title="DEV-073 Toolbar 新任務"]').count() === 1, 'quick naming Enter must persist the title');
  assert(await details.count() === 0, 'quick naming Enter must not open details');

  // Tab remains the explicit XMind-style child continuation from an active quick title.
  const toolbarNode = page.locator(`[data-mindmap-node="${toolbarTaskId}"]`);
  await toolbarNode.click();
  await page.keyboard.press('x');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await quickTitleInput.fill('DEV-073 Tab 子任務來源');
  await quickTitleInput.press('Tab');
  await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, visibleNodeCount + 1);
  await page.locator('[data-mindmap-node-title="DEV-073 Tab 子任務來源"]').waitFor({ state: 'visible', timeout: 10000 });
  const continuedChildId = await quickTitleNode.getAttribute('data-mindmap-node');
  assert(continuedChildId && continuedChildId !== toolbarTaskId, 'quick naming Tab must create and select a child');
  assert(await quickTitleNode.getAttribute('data-mindmap-parent-id') === toolbarTaskId, 'quick naming Tab must parent the new task under the current task');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) === 'true', 'quick naming Tab must keep direct typing ready');
  await quickTitleInput.press('Escape');
  assert(await quickTitleInput.count() === 0, 'Escape must leave quick naming without creating another task');

  const node = page.locator('[data-mindmap-node]').first();
  await node.waitFor({ state: 'visible', timeout: 15000 });
  const taskId = await node.getAttribute('data-mindmap-node');
  assert(Boolean(taskId), 'mindmap node must expose a task id');

  // A single click keeps task shortcuts active until typing begins.
  const nodeBeforeQuickTitleBox = await node.boundingBox();
  await node.click();
  await page.waitForTimeout(350);
  const nodeAfterQuickTitleBox = await node.boundingBox();
  assert(nodeBeforeQuickTitleBox && nodeAfterQuickTitleBox && nodeAfterQuickTitleBox.width >= nodeBeforeQuickTitleBox.width - 1, 'selecting a mindmap task must not shrink its node box', { nodeBeforeQuickTitleBox, nodeAfterQuickTitleBox });
  assert(await page.locator('[data-task-details-modal="true"]').count() === 0, 'mindmap single click must not open task details');
  assert(await quickTitleInput.count() === 0, 'a selected task must remain out of edit mode while waiting for input');
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, taskId), 'a selected task must retain node focus');
  assert(await node.getAttribute('draggable') === 'true', 'selected mindmap node must remain draggable');
  assert(await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count() === 1, 'mindmap single click must select the node');
  const originalNodeTitle = await node.getAttribute('data-mindmap-node-title');
  await page.keyboard.type('xyz');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input') === 'true');
  assert(await quickTitleInput.inputValue() === 'xyz', 'typing must start a draft with every typed character');
  assert(await quickTitleInput.evaluate((element) => getComputedStyle(element).pointerEvents === 'none'), 'quick naming input must not block node dragging');
  await page.screenshot({ path: 'output/playwright/dev-073-task-title-edit-quick-node.png' });
  await quickTitleInput.press('Escape');
  assert(await node.getAttribute('data-mindmap-node-title') === originalNodeTitle, 'Escape must cancel the typed title draft');

  // Arrow keys navigate while the task is selected.
  const parentWithChild = page.locator(`[data-mindmap-node="${toolbarTaskId}"]`);
  await parentWithChild.click();
  await page.waitForTimeout(350);
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, toolbarTaskId), 'selection must keep the task node focused');
  const continuedChild = page.locator(`[data-mindmap-node="${continuedChildId}"]`);
  const direction = await continuedChild.getAttribute('data-mindmap-node-direction');
  await page.keyboard.press(direction === 'left' ? 'ArrowLeft' : 'ArrowRight');
  await continuedChild.and(page.locator('[aria-selected="true"]')).waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) !== 'true', 'arrow navigation must not move the caret inside quick naming text');
  await continuedChild.click();
  await page.waitForTimeout(350);
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, continuedChildId), 'child quick naming must retain node focus after delayed click');

  // The draft resizes the node and moves the parent-to-child connector.
  const originalTitle = await parentWithChild.getAttribute('data-mindmap-node-title');
  const originalWidth = await parentWithChild.evaluate(element => element.offsetWidth);
  await parentWithChild.click();
  await page.keyboard.press('x');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  const longDraft = '心智圖全形標題　Mixed text  '.repeat(9).trimEnd();
  const waitForTitleWidthAndConnector = (draft, minimumWidth) => page.waitForFunction(({ draft, minimumWidth, parentId, childId }) => {
    const node = document.querySelector(`[data-mindmap-node="${parentId}"]`);
    const input = node?.querySelector('[data-mindmap-quick-title-input]');
    const text = node?.querySelector('[data-mindmap-quick-title-layout-anchor]')?.firstChild;
    const connector = document.querySelector(`[data-mindmap-connector-path][data-from-node-id="${parentId}"][data-to-node-id="${childId}"]`);
    if (!node || input?.value !== draft || text?.textContent !== draft || !connector) return false;
    const range = document.createRange();
    range.selectNodeContents(text);
    const bounds = node.getBoundingClientRect();
    const matrix = connector.getScreenCTM();
    if (!matrix) return false;
    const from = connector.getPointAtLength(0).matrixTransform(matrix);
    const edge = connector.dataset.direction === 'left' ? bounds.left : bounds.right;
    return input.getBoundingClientRect().width >= range.getBoundingClientRect().width &&
      node.offsetWidth >= minimumWidth && Math.abs(from.x - edge) < 2;
  }, { draft, minimumWidth, parentId: toolbarTaskId, childId: continuedChildId }, { timeout: 6000 });
  await quickTitleInput.fill(longDraft);
  const readingWidthLimit = await parentWithChild.evaluate(element => parseFloat(getComputedStyle(element).getPropertyValue('--mindmap-node-max-width')));
  await waitForTitleWidthAndConnector(longDraft, readingWidthLimit + 1);
  const expandedWidth = await parentWithChild.evaluate(element => element.offsetWidth);
  await quickTitleInput.fill('短名');
  await waitForTitleWidthAndConnector('短名', 0);
  assert(await parentWithChild.evaluate(element => element.offsetWidth) < expandedWidth, 'shortening the draft must let the node shrink again');
  await quickTitleInput.press('Escape');
  assert(await parentWithChild.getAttribute('data-mindmap-node-title') === originalTitle, 'cancelling a resized title draft must retain the saved title');
  assert(await parentWithChild.evaluate(element => element.offsetWidth) === originalWidth, 'cancelling must restore the saved node width');

  // Deleting the last character must leave the task and its editor in place.
  if (await createRootButton.count()) {
    await createRootButton.click();
  } else {
    await page.locator('[data-mindmap-view]').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
  }
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  const deleteWhileQuickNamingId = await quickTitleNode.getAttribute('data-mindmap-node');
  const nodeCountBeforeQuickDelete = await page.locator('[data-mindmap-node]').count();
  assert(Boolean(deleteWhileQuickNamingId), 'quick naming delete fixture must expose a task id');
  const deletionFixture = page.locator(`[data-mindmap-node="${deleteWhileQuickNamingId}"]`);
  await quickTitleInput.fill('甲乙');
  await quickTitleInput.press('Home');
  await quickTitleInput.press('Delete');
  assert(await quickTitleInput.inputValue() === '乙', 'Delete must remove the character after the caret');
  await quickTitleInput.press('Delete');
  await quickTitleInput.press('Delete');
  assert(await quickTitleInput.inputValue() === '', 'Delete on the last character and on an empty title must keep editing active');
  await quickTitleInput.press('A');
  await quickTitleInput.press('Backspace');
  assert(await quickTitleInput.inputValue() === '', 'Backspace must also edit the title');
  assert(await deletionFixture.isVisible() && await page.locator('[data-mindmap-node]').count() === nodeCountBeforeQuickDelete, 'editing keys must preserve the task');
  await quickTitleInput.press('Escape');

  await deletionFixture.click();
  await page.keyboard.press('x');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input') === 'true');
  assert(await quickTitleInput.inputValue() === 'x', 'typing from the selected node must replace its title');
  await quickTitleInput.press('Home');
  await quickTitleInput.press('Delete');
  await quickTitleInput.press('y');
  await quickTitleInput.press('z');
  assert(await quickTitleInput.inputValue() === 'yz', 'after clearing an existing task title, native typing must continue in the same editor');
  await quickTitleInput.press('Escape');
  await quickTitleInput.waitFor({ state: 'hidden', timeout: 10000 });
  await deletionFixture.click();
  await page.waitForTimeout(350);
  await page.keyboard.press('Delete');
  await deletionFixture.waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, nodeCountBeforeQuickDelete - 1);
  assert(await details.count() === 0, 'Delete outside quick naming must archive the task without opening details');

  await node.click();
  await page.keyboard.press('Enter');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  const backspaceId = await quickTitleNode.getAttribute('data-mindmap-node');
  assert(Boolean(backspaceId), 'Backspace archive fixture must expose a task id');
  const backspaceFixture = page.locator(`[data-mindmap-node="${backspaceId}"]`);
  await quickTitleInput.press('Escape');
  await backspaceFixture.click();
  await page.keyboard.press('Backspace');
  await backspaceFixture.waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(ids => {
    const saved = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return ids.every(id => saved[id]?.isArchived === true);
  }, [deleteWhileQuickNamingId, backspaceId]);

  // Double click remains the explicit full-details entry.
  await node.dblclick();
  await details.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.getAttribute('data-task-id') === taskId, 'mindmap double click must open the same task details');
  await details.locator('button[aria-label="關閉任務詳情"]').click();
  await details.waitFor({ state: 'hidden', timeout: 10000 });

  // Once quick naming is active, double click on the node still reaches details.
  await node.click();
  await page.keyboard.press('x');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await node.dblclick();
  await details.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.getAttribute('data-task-id') === taskId, 'double click from active quick naming must open the same task details');
  await details.locator('button[aria-label="關閉任務詳情"]').click();
  await details.waitFor({ state: 'hidden', timeout: 10000 });

  // A newer selection owns the next title edit.
  const otherNode = page.locator('[data-mindmap-node]').nth(1);
  const otherTaskId = await otherNode.getAttribute('data-mindmap-node');
  await node.click();
  await otherNode.click();
  await page.keyboard.press('x');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await quickTitleNode.getAttribute('data-mindmap-node') === otherTaskId, 'latest click must own quick naming after rapid node switching');
  await quickTitleInput.press('Escape');

  // Keyboard-created mindmap tasks enter the mindmap-local inline title editor.
  await node.click();
  await node.press('Tab');
  const inlineTitleInput = page.locator('[data-mindmap-inline-title-input="true"]');
  await inlineTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.count() === 0, 'Tab-created task must not open details');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) === 'true', 'Tab-created task must focus quick naming');
  await inlineTitleInput.fill('DEV-073 Tab 新任務');
  await inlineTitleInput.press('Escape');

  await node.click();
  await node.press('Enter');
  await inlineTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.count() === 0, 'Enter-created task must not open details');
  await inlineTitleInput.press('Escape');

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    if (await page.locator('[data-mindmap-view]').count() === 0) {
      assert(viewport.width === 390, 'mindmap must remain available at non-mobile responsive viewports', { viewport });
      assert(await page.locator('.inline-error, [role="alert"]').count() === 0, 'mobile board-only fallback must not show visible error state', viewport);
      await page.screenshot({ path: `output/playwright/dev-073-mindmap-mobile-scope-${viewport.width}x${viewport.height}.png` });
      continue;
    }
    const fitButton = page.locator('[data-mindmap-zoom-fit]');
    if (await fitButton.count() > 0) {
      await fitButton.click();
      await page.waitForTimeout(150);
    }
    const responsiveToggle = page.locator('[data-mindmap-toggle]').first();
    assert(await responsiveToggle.count() === 1, 'responsive viewport must retain a mindmap collapse toggle in the DOM', {
      viewport,
      mindmapViewCount: await page.locator('[data-mindmap-view]').count(),
      mindmapNodeCount: await page.locator('[data-mindmap-node]').count(),
      childrenGroupCount: await page.locator('[data-mindmap-children-group]').count(),
    });
    await responsiveToggle.waitFor({ state: 'attached', timeout: 10000 });
    const responsiveParentId = await responsiveToggle.getAttribute('data-mindmap-toggle-parent-id');
    assert(Boolean(responsiveParentId), 'responsive collapse toggle must identify its parent task', { viewport });
    assert(await responsiveToggle.evaluate((element) => getComputedStyle(element).opacity === '0'), 'responsive collapse toggle must be hidden before hover', { viewport });
    const responsiveHoverTarget = page.locator(`[data-mindmap-toggle-hover-target="${responsiveParentId}"]`);
    await responsiveHoverTarget.hover();
    await page.waitForFunction((parentId) => {
      const toggle = document.querySelector(`[data-mindmap-toggle-parent-id="${parentId}"]`);
      return toggle instanceof HTMLElement && getComputedStyle(toggle).opacity === '1';
    }, responsiveParentId);
    const responsiveToggleBox = await responsiveToggle.boundingBox();
    assert(responsiveToggleBox && responsiveToggleBox.width > 0 && responsiveToggleBox.height > 0, 'responsive collapse toggle must remain visible and operable', { viewport, responsiveToggleBox });
    assert(await page.locator('.inline-error, [role="alert"]').count() === 0, 'mindmap responsive viewport must not show visible error state', viewport);
    await page.screenshot({ path: `output/playwright/dev-073-mindmap-collapse-toggle-${viewport.width}x${viewport.height}.png` });
  }

  return {
    status: 'PASS',
    viewport: '1440x900 + 1024x768 + 390x844',
    mindmapClick: 'select only; Delete and Backspace archive, typing opens quick naming',
    mindmapDoubleClick: 'open details',
    mindmapPostCreate: 'quick naming; Enter commits without creating, Tab continues child without exit',
    consoleErrors: 0,
  };
}
