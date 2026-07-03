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
    id: 'dev039-filter-parity-workspace',
    title: 'DEV-039 Filter Parity 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev039-filter-parity-board', title: '結果一致看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev039-filter-parity-root': {
      id: 'dev039-filter-parity-root',
      workspaceId: workspace.id,
      boardId: 'dev039-filter-parity-board',
      parentId: null,
      title: '父層 Context 欄位',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-filter-parity-card': {
      id: 'dev039-filter-parity-card',
      workspaceId: workspace.id,
      boardId: 'dev039-filter-parity-board',
      parentId: 'dev039-filter-parity-root',
      title: '父層 Context 卡片',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-filter-parity-leaf': {
      id: 'dev039-filter-parity-leaf',
      workspaceId: workspace.id,
      boardId: 'dev039-filter-parity-board',
      parentId: 'dev039-filter-parity-card',
      title: '符合條件子任務',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      assigneeId: 'member-in-task-only',
      tagIds: ['dev039-filter-parity-tag'],
      endDate: '2026-07-08',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-filter-parity-sibling': {
      id: 'dev039-filter-parity-sibling',
      workspaceId: workspace.id,
      boardId: 'dev039-filter-parity-board',
      parentId: 'dev039-filter-parity-root',
      title: '不符合 sibling',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const seed = async () => {
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([
        { id: 'dev039-filter-parity-tag', workspaceId: workspace.id, name: '結果一致', color: 'blue', order: 0 },
      ]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: true, filtersOpen: false }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev039-filter-parity-board');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes });
  };

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('[data-kanban-column-header="true"][data-task-id="dev039-filter-parity-root"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      await page.screenshot({ path: `output/playwright/dev-039-filter-parity-open-timeout-${Date.now()}.png`, fullPage: true });
      throw new Error(`app did not open: ${JSON.stringify({ diagnostics: diagnostics.slice(-20) })}`);
    }
  };

  let step = 'seed';
  try {
    await seed();
    await openApp();

    step = 'board-filter-context-path';
    await page.locator('#filter-menu-trigger').click();
    const boardFilterPanel = page.locator('[data-filter-menu-panel]');
    await boardFilterPanel.waitFor({ state: 'visible', timeout: 10000 });
    await boardFilterPanel.getByRole('button', { name: /待辦/ }).click();

    const assigneeLabel = '成員 member-i';
    assert(
      await boardFilterPanel.getByRole('button', { name: new RegExp(assigneeLabel) }).count() === 1,
      'board filter should include task assignee from selected board even when not present as a board member',
    );
    await page.keyboard.press('Escape');

    await page.locator('[data-kanban-column-header="true"][data-task-id="dev039-filter-parity-root"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.kanban-task-card[data-task-id="dev039-filter-parity-card"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.kanban-checklist-item[data-task-id="dev039-filter-parity-leaf"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await page.locator('.kanban-task-card[data-task-id="dev039-filter-parity-sibling"]').count() === 0,
      'non-matching sibling should be hidden when it has no matching descendant',
    );

    step = 'workbench-matched-ids-only';
    const workbenchPanel = page.locator('[data-task-workbench-panel="true"]');
    await workbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').click();
    const workbenchFilterPanel = workbenchPanel.locator('[data-task-workbench-filter-panel="true"]');
    await workbenchFilterPanel.waitFor({ state: 'visible', timeout: 10000 });
    await workbenchFilterPanel.getByRole('button', { name: /待辦/ }).click();
    assert(
      await workbenchFilterPanel.getByRole('button', { name: new RegExp(assigneeLabel) }).count() === 1,
      'workbench filter should use the same selected-board assignee option source as board filter',
    );

    const workbenchTaskIds = await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"]').evaluateAll(cards =>
      cards.map(card => card.getAttribute('data-task-id')).filter(Boolean),
    );
    assert(
      workbenchTaskIds.length === 1 && workbenchTaskIds[0] === 'dev039-filter-parity-leaf',
      'workbench should list only canonical matched task ids, not context-only ancestor containers',
      { workbenchTaskIds },
    );
    assert(
      await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-filter-parity-root"]').count() === 0 &&
        await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-filter-parity-card"]').count() === 0,
      'context-only ancestor should not be listed as a workbench filter result',
    );

    step = 'mobile-viewport';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="collapsed"]').waitFor({ state: 'visible', timeout: 10000 });
    const mobileBoardHasContextPath = await page.evaluate(() => {
      const root = document.querySelector('[data-kanban-column-header="true"][data-task-id="dev039-filter-parity-root"]');
      const rect = root?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(mobileBoardHasContextPath, 'mobile board should remain reachable while filter parity context path exists');
    await page.locator('[data-task-workbench-panel="collapsed"] button[title="開啟全域任務平台"]').click();
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-039-filter-result-parity-mobile.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!overflow, 'mobile filter parity flow should not have document-level horizontal overflow');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
