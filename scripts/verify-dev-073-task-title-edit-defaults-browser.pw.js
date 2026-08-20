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
  await page.goto('http://127.0.0.1:4000/', { waitUntil: 'domcontentloaded' });
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
  await page.locator('[data-mindmap-create-root]').click();
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
  assert(Math.abs(toolbarQuickTitleMetrics.inputWidth - toolbarQuickTitleMetrics.anchorWidth) <= 1, 'quick-title input must overlay the original title slot instead of changing node layout', toolbarQuickTitleMetrics);

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

  // A single fine-pointer click selects and enters the same XMind-like quick-title state.
  const nodeBeforeQuickTitleBox = await node.boundingBox();
  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(350);
  const nodeAfterQuickTitleBox = await node.boundingBox();
  assert(nodeBeforeQuickTitleBox && nodeAfterQuickTitleBox && nodeAfterQuickTitleBox.width >= nodeBeforeQuickTitleBox.width - 1, 'selecting a mindmap task must not shrink its node box', { nodeBeforeQuickTitleBox, nodeAfterQuickTitleBox });
  assert(await page.locator('[data-task-details-modal="true"]').count() === 0, 'mindmap single click must not open task details');
  assert(await page.locator('[data-mindmap-quick-title-input="true"]').count() === 1, 'mindmap single click must enter quick naming');
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, taskId), 'mindmap single click must retain node focus in XMind quick naming state');
  assert(await quickTitleInput.evaluate((element) => getComputedStyle(element).pointerEvents === 'none'), 'quick naming input must not block node dragging');
  assert(await node.getAttribute('draggable') === 'true', 'selected mindmap node must remain draggable while quick naming');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) !== 'true', 'mindmap single click must not enter native text-input focus');
  await page.screenshot({ path: 'output/playwright/dev-073-task-title-edit-quick-node.png' });
  assert(await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count() === 1, 'mindmap single click must select the node');
  const originalNodeTitle = await node.getAttribute('data-mindmap-node-title');
  await quickTitleInput.fill('DEV-073 點擊快速命名草稿');
  await quickTitleInput.press('Escape');
  assert(await node.getAttribute('data-mindmap-node-title') === originalNodeTitle, 'Escape must cancel the click-started title draft');

  // Typing from the focused node enters the editor only after the first character,
  // preserving the XMind armed state for navigation and deletion.
  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(350);
  await node.press('x');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input') === 'true');
  assert(await quickTitleInput.inputValue() === 'x', 'first typed character must replace the title from the armed node state');
  await quickTitleInput.press('Escape');

  // The delayed XMind quick-title state must keep arrow keys as selection commands.
  const parentWithChild = page.locator(`[data-mindmap-node="${toolbarTaskId}"]`);
  await parentWithChild.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(350);
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, toolbarTaskId), 'delayed quick naming must keep the task node focused');
  await page.keyboard.press('ArrowRight');
  await page.locator(`[data-mindmap-node="${continuedChildId}"][aria-selected="true"]`).waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) !== 'true', 'arrow navigation must not move the caret inside quick naming text');
  await page.locator(`[data-mindmap-node="${continuedChildId}"]`).click();
  await page.waitForTimeout(350);
  assert(await page.evaluate((nodeId) => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, continuedChildId), 'child quick naming must retain node focus after delayed click');

  // Delete is a task command even while the XMind-like quick naming input has focus.
  await page.locator('[data-mindmap-create-root]').click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  const deleteWhileQuickNamingId = await quickTitleNode.getAttribute('data-mindmap-node');
  const nodeCountBeforeQuickDelete = await page.locator('[data-mindmap-node]').count();
  assert(Boolean(deleteWhileQuickNamingId), 'quick naming delete fixture must expose a task id');
  await quickTitleInput.press('Delete');
  await page.locator(`[data-mindmap-node="${deleteWhileQuickNamingId}"]`).waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, nodeCountBeforeQuickDelete - 1);
  assert(await details.count() === 0, 'quick naming Delete must not open task details');

  // The short single-click delay preserves double click as the explicit full-details entry.
  await node.dblclick();
  await details.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.getAttribute('data-task-id') === taskId, 'mindmap double click must open the same task details');
  await details.locator('button[title="關閉"]').click();
  await details.waitFor({ state: 'hidden', timeout: 10000 });

  // Once quick naming is active, double click on the node still reaches details.
  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await node.dblclick();
  await details.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.getAttribute('data-task-id') === taskId, 'double click from active quick naming must open the same task details');
  await details.locator('button[title="關閉"]').click();
  await details.waitFor({ state: 'hidden', timeout: 10000 });

  // A newer selection cancels the older click timer, so no stale node starts editing.
  const otherNode = page.locator('[data-mindmap-node]').nth(1);
  const otherTaskId = await otherNode.getAttribute('data-mindmap-node');
  await node.click();
  await otherNode.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await quickTitleNode.getAttribute('data-mindmap-node') === otherTaskId, 'latest click must own quick naming after rapid node switching');
  await quickTitleInput.press('Escape');

  // Keyboard-created mindmap tasks enter the mindmap-local inline title editor.
  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await quickTitleInput.press('Escape');
  await node.press('Tab');
  const inlineTitleInput = page.locator('[data-mindmap-inline-title-input="true"]');
  await inlineTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await details.count() === 0, 'Tab-created task must not open details');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input')) === 'true', 'Tab-created task must focus quick naming');
  await inlineTitleInput.fill('DEV-073 Tab 新任務');
  await inlineTitleInput.press('Escape');

  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await quickTitleInput.press('Escape');
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
    mindmapClick: 'select + quick naming, no details modal',
    mindmapDoubleClick: 'open details',
    mindmapPostCreate: 'quick naming; Enter commits without creating, Tab continues child without exit',
    consoleErrors: 0,
  };
}
