/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

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
  const workspace = {
    id: 'dev048-clear-workspace',
    title: 'DEV-048 清除主責工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev048-clear-board', title: '清除主責測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };
  const nodes = {
    'dev048-clear-active': {
      id: 'dev048-clear-active',
      workspaceId: workspace.id,
      boardId: 'dev048-clear-board',
      parentId: null,
      title: '進行中可清除主責',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      assigneeId: 'local-test-user',
      assigneeIds: ['local-test-user'],
      collaboratorIds: [],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev048-clear-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev048-clear-active' } }));
  });

  const modal = page.locator('[data-task-details-modal="true"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const assignmentRow = modal.locator('[data-task-details-assignment-row="true"]');
  await assignmentRow.waitFor({ state: 'visible', timeout: 10000 });

  await assignmentRow.locator('[data-task-assignment-picker="true"] button').first().click();
  const panel = page.locator('[data-task-assignment-picker-panel="true"]');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  await panel.getByRole('button', { name: '清除主責' }).click();

  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const node = stored['dev048-clear-active'];
    return node && !node.assigneeId && (!Array.isArray(node.assigneeIds) || node.assigneeIds.length === 0);
  }, null, { timeout: 5000 });

  await page.waitForFunction(() => {
    const assignmentText = document.querySelector('[data-task-details-assignment-row="true"]')?.textContent || '';
    return assignmentText.includes('未指派');
  }, null, { timeout: 5000 });
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const node = stored['dev048-clear-active'];
    const bodyText = document.body.textContent || '';
    const visibleAlerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean);

    return {
      assigneeId: node?.assigneeId ?? null,
      assigneeIds: Array.isArray(node?.assigneeIds) ? node.assigneeIds : [],
      assignmentText: document.querySelector('[data-task-details-assignment-row="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasOldPrimaryToast: bodyText.includes('執行中的任務至少要設定一位主責成員') || bodyText.includes('執行中的任務至少要保留一位主責成員'),
      visibleAlerts,
    };
  });

  assert(result.assigneeId === null, 'clearing the final primary should clear legacy assigneeId', result);
  assert(result.assigneeIds.length === 0, 'clearing the final primary should clear canonical assigneeIds', result);
  assert(result.assignmentText.includes('未指派'), 'assignment summary should show unassigned after clearing', result);
  assert(!result.hasOldPrimaryToast, 'clearing an active task primary should not show the old blocking toast', result);
  assert(result.visibleAlerts.length === 0, 'clear-primary flow should not show runtime alerts', result);

  await page.screenshot({ path: 'output/playwright/dev-048-clear-primary-active-task.png', fullPage: true });
  console.log(JSON.stringify({ ...result, diagnostics: diagnostics.slice(-10) }, null, 2));
}
