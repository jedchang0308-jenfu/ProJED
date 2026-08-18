/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const accountA = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: '本機測試擁有者',
    createdAt: 1704067200000,
  };
  const accountB = {
    id: 'local-test-admin',
    uid: 'local-test-admin',
    email: 'admin@projed.local',
    displayName: '本機測試管理員',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'account-filter-workspace',
    title: '帳號篩選隔離驗證',
    ownerId: accountA.id,
    members: [accountA.id, accountB.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'account-filter-board',
      title: '帳號篩選看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const nodes = {
    'account-filter-task-member': {
      id: 'account-filter-task-member',
      workspaceId: workspace.id,
      boardId: 'account-filter-board',
      parentId: null,
      title: '篩選隔離－成員任務',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      assigneeId: 'local-test-member',
      assigneeIds: ['local-test-member'],
      collaboratorIds: [],
      tagIds: [],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'account-filter-task-viewer': {
      id: 'account-filter-task-viewer',
      workspaceId: workspace.id,
      boardId: 'account-filter-board',
      parentId: null,
      title: '篩選隔離－協作任務',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      assigneeId: 'local-test-admin',
      assigneeIds: ['local-test-admin'],
      collaboratorIds: ['local-test-viewer'],
      tagIds: [],
      createdAt: 1704067200001,
      updatedAt: 1704067200001,
    },
    'account-filter-task-unassigned': {
      id: 'account-filter-task-unassigned',
      workspaceId: workspace.id,
      boardId: 'account-filter-board',
      parentId: null,
      title: '篩選隔離－未指派任務',
      status: 'todo',
      nodeType: 'task',
      order: 2,
      assigneeIds: [],
      collaboratorIds: [],
      tagIds: [],
      createdAt: 1704067200002,
      updatedAt: 1704067200002,
    },
  };

  const accountKey = (base, uid) => `${base}:account:${encodeURIComponent(uid)}`;
  const seedAccountA = async () => {
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      // The local test seed clamps its size to a minimum of 12; keep the seed stable so it does not replace this fixture.
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
    }, { account: accountA, workspace, nodes });
  };

  const setSession = async (account) => {
    await page.evaluate((nextAccount) => {
      localStorage.setItem('projed-local-test.selected-account', nextAccount.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(nextAccount));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openBoardFilter = async () => {
    const trigger = page.locator('[data-task-filter-control-group="true"] > button').first();
    await trigger.click();
    const panel = page.locator('[data-filter-menu-panel]');
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    return panel;
  };

  const openWorkbenchFilter = async () => {
    const workbench = page.locator('[data-task-workbench-panel="true"]');
    if (await workbench.count() === 0) {
      const entry = page.getByRole('button', { name: '開啟全域任務平台', exact: true });
      await entry.click();
    }
    await workbench.waitFor({ state: 'visible', timeout: 10000 });
    const popover = workbench.locator('[data-task-workbench-filter-popover="true"]');
    if (await popover.count() === 0) {
      const toggle = workbench.locator('[data-task-workbench-filter-toggle="true"]');
      await toggle.click();
    }
    await popover.waitFor({ state: 'visible', timeout: 5000 });
    return popover;
  };

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4000/', { waitUntil: 'domcontentloaded' });
    const fixedLogin = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedLogin.count()) {
      await fixedLogin.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    }
    await seedAccountA();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });

    const boardPanelA = await openBoardFilter();
    const memberButtonA = boardPanelA.getByRole('button', { name: '本機測試成員', exact: true });
    await memberButtonA.click();
    await page.locator('[data-task-surface-source="true"][data-task-id="account-filter-task-member"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-task-surface-source="true"][data-task-id="account-filter-task-viewer"]').count() === 0, 'Account A board filter should actually filter tasks');
    const boardPrefsA = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), accountKey('projed-task-filters:v2', accountA.uid));
    assert(boardPrefsA?.filters?.selectedAssigneeIds?.includes('local-test-member'), 'Account A board filter should be stored under Account A key', { boardPrefsA });
    await page.locator('[data-task-filter-control-group="true"] > button').first().click();

    const workbenchPopoverA = await openWorkbenchFilter();
    const viewerButtonA = workbenchPopoverA.locator('[data-task-condition-filter-controls="true"]').getByRole('button', { name: '本機測試檢視者', exact: true });
    await viewerButtonA.click();
    const workbenchPrefsA = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), accountKey('projed-task-workbench-filters:v2', accountA.uid));
    assert(
      Object.values(workbenchPrefsA?.filtersByBoardId || {}).some(filters => filters.selectedAssigneeIds?.includes('local-test-viewer')),
      'Account A workbench filter should be stored under Account A key',
      { workbenchPrefsA },
    );

    await setSession(accountB);
    const boardPanelB = await openBoardFilter();
    const memberButtonB = boardPanelB.getByRole('button', { name: '本機測試成員', exact: true });
    assert(await memberButtonB.getAttribute('aria-pressed') === 'false', 'Account B must not inherit Account A board filter');
    await page.locator('[data-task-filter-control-group="true"] > button').first().click();

    const workbenchPopoverB = await openWorkbenchFilter();
    const viewerButtonB = workbenchPopoverB.locator('[data-task-condition-filter-controls="true"]').getByRole('button', { name: '本機測試檢視者', exact: true });
    assert(await viewerButtonB.getAttribute('aria-pressed') === 'false', 'Account B must not inherit Account A workbench filter');
    const boardPrefsB = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), accountKey('projed-task-filters:v2', accountB.uid));
    const workbenchPrefsB = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), accountKey('projed-task-workbench-filters:v2', accountB.uid));
    assert(!boardPrefsB?.filters?.selectedAssigneeIds?.length, 'Account B should have independent board filter storage', { boardPrefsB });
    assert(!Object.values(workbenchPrefsB?.filtersByBoardId || {}).some(filters => filters.selectedAssigneeIds?.length), 'Account B should have independent workbench filter storage', { workbenchPrefsB });

    await setSession(accountA);
    const boardPanelAAgain = await openBoardFilter();
    assert(await boardPanelAAgain.getByRole('button', { name: '本機測試成員', exact: true }).getAttribute('aria-pressed') === 'true', 'Account A board filter should be restored only for Account A');
    await page.locator('[data-task-filter-control-group="true"] > button').first().click();
    const workbenchPopoverAAgain = await openWorkbenchFilter();
    assert(
      await workbenchPopoverAAgain.locator('[data-task-condition-filter-controls="true"]').getByRole('button', { name: '本機測試檢視者', exact: true }).getAttribute('aria-pressed') === 'true',
      'Account A workbench filter should be restored only for Account A',
    );

    console.log(JSON.stringify({ ok: true, diagnostics }, null, 2));
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/account-scoped-filter-prefs-failure.png', fullPage: true });
    console.log(JSON.stringify({ ok: false, diagnostics, error: String(error) }, null, 2));
    throw error;
  }
}
