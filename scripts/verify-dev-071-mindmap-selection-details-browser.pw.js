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
  const node = page.locator('[data-mindmap-node]').first();
  await node.waitFor({ state: 'visible', timeout: 15000 });
  const taskId = await node.getAttribute('data-mindmap-node');
  assert(Boolean(taskId), 'mindmap node must expose a task id');

  await node.click();
  const modal = page.locator('[data-task-details-modal="true"]');
  const quickTitleInput = page.locator('[data-mindmap-quick-title-input="true"]');
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.count() === 0, 'mindmap single click must not open details');
  assert(await node.locator('[data-mindmap-inline-title-input="true"]').count() === 1, 'DEV-073 must extend mindmap selection with quick naming');
  assert(
    await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count() === 1,
    'mindmap single click must select the node',
  );
  await quickTitleInput.press('Escape');

  await node.press('Tab');
  const inlineTitleInput = page.locator('[data-mindmap-inline-title-input="true"]');
  await inlineTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.count() === 0, 'mindmap Tab insertion must not open details');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-inline-title-input')) === 'true', 'mindmap Tab insertion must focus inline title edit');
  await inlineTitleInput.fill('DEV-071 Tab 新任務');
  await inlineTitleInput.press('Enter');
  assert(await page.locator('[data-mindmap-node-title="DEV-071 Tab 新任務"]').count() === 1, 'mindmap Tab insertion must persist inline title');
  assert(await inlineTitleInput.count() === 0, 'inline title Enter must commit and leave quick naming without creating another task');

  await node.click();
  await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  await quickTitleInput.press('Escape');
  await node.press('Enter');
  await inlineTitleInput.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.count() === 0, 'mindmap Enter insertion must not open details');
  await inlineTitleInput.press('Escape');

  await node.dblclick();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.getAttribute('data-task-id') === taskId, 'mindmap double click must open the selected task details', { taskId });
  await modal.locator('button[title="關閉"]').click();
  await modal.waitFor({ state: 'hidden', timeout: 10000 });

  await node.click({ button: 'right' });
  const menu = page.locator('[data-global-context-menu="true"]');
  await menu.waitFor({ state: 'visible', timeout: 10000 });
  const openDetailsAction = menu.locator('[data-task-action-id="task.open-details"]');
  assert(await openDetailsAction.count() === 1, 'mindmap context menu must expose 開啟明細');
  assert(await openDetailsAction.innerText() === '開啟明細', 'mindmap context menu label must be 開啟明細');
  await openDetailsAction.click();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.getAttribute('data-task-id') === taskId, 'context menu 開啟明細 must open the right task', { taskId });
  await modal.locator('button[title="關閉"]').click();
  await modal.waitFor({ state: 'hidden', timeout: 10000 });

  await switchMode('board');
  const card = page.locator('.kanban-task-card[data-task-id]').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click({ position: { x: 90, y: 18 } });
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.count() === 1, 'board single click must retain the default details behavior');

  return {
    status: 'PASS',
    mindmap: {
      taskId,
      singleClick: 'select + DEV-073 quick-title',
      doubleClick: 'open-details',
      contextMenuOpenDetails: true,
    },
    board: { singleClick: 'open-details' },
  };
}
