/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => {
    diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    diagnostics.push(`pageerror:${error.message}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const persistentWorkspace = {
    id: 'dev035-keep-workspace',
    title: 'DEV-035 保留工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev035-keep-board',
      title: 'DEV-035 保留看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };

  const deletedWorkspace = {
    id: 'dev035-delete-workspace',
    title: 'DEV-035 刪除工作區',
    ownerId: account.id,
    members: [account.id],
    order: 2,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev035-delete-board',
      title: 'DEV-035 刪除看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };

  const activeWorkspace = {
    id: 'dev035-active-delete-workspace',
    title: 'DEV-035 Active 刪除工作區',
    ownerId: account.id,
    members: [account.id],
    order: 3,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev035-active-delete-board',
      title: 'DEV-035 Active 刪除看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };

  const seed = async ({ activeWorkspaceId = persistentWorkspace.id, activeBoardId = persistentWorkspace.boards[0].id } = {}) => {
    await page.evaluate(({ account, workspaces, activeWorkspaceId, activeBoardId }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify(workspaces));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', activeWorkspaceId);
      localStorage.setItem('projed-last-board', activeBoardId);
      localStorage.setItem('projed-last-view', 'board');
    }, {
      account,
      workspaces: [persistentWorkspace, deletedWorkspace, activeWorkspace],
      activeWorkspaceId,
      activeBoardId,
    });
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      const screenshot = `output/playwright/dev-035-open-app-timeout-${Date.now()}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      const rootHtml = await page.locator('#root').evaluate((node) => node.innerHTML.slice(0, 2000)).catch(() => '');
      throw new Error(`app nav did not become visible: ${JSON.stringify({
        url: page.url(),
        title: await page.title().catch(() => ''),
        bodyText: bodyText.slice(0, 2000),
        rootHtml,
        screenshot,
        diagnostics: diagnostics.slice(-20),
      })}`);
    }
    if (await page.locator('[data-sidebar-workspace-title="true"]').count() === 0) {
      await page.getByTitle('展開工作區選單').click();
    }
    await page.locator('[data-sidebar-workspace-title="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const readStorageState = async () => page.evaluate(() => ({
    workspaces: JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]'),
    activeWorkspaceId: localStorage.getItem('projed-last-ws'),
    activeBoardId: localStorage.getItem('projed-last-board'),
    activeView: localStorage.getItem('projed-last-view'),
    modal: localStorage.getItem('projed-last-modal'),
  }));

  const deleteWorkspaceByTitle = async (title) => {
    const workspaceTitle = page.locator('[data-sidebar-workspace-title="true"]', { hasText: title }).first();
    await workspaceTitle.waitFor({ state: 'visible', timeout: 15000 });
    await workspaceTitle.click({ button: 'right' });
    await page.getByText('刪除工作區', { exact: true }).click();
    await page.getByText('確認', { exact: true }).click();
  };

  const cancelWorkspaceDeleteByTitle = async (title, workspaceId) => {
    const workspaceTitle = page.locator('[data-sidebar-workspace-title="true"]', { hasText: title }).first();
    await workspaceTitle.waitFor({ state: 'visible', timeout: 15000 });
    await workspaceTitle.click({ button: 'right' });
    await page.getByText('刪除工作區', { exact: true }).click();
    await page.getByText('取消', { exact: true }).click();
    await workspaceTitle.waitFor({ state: 'visible', timeout: 15000 });
    const state = await readStorageState();
    assert(state.workspaces.some(workspace => workspace.id === workspaceId), 'cancelled workspace delete should keep local-test persistence', state);
  };

  let step = 'seed';
  try {
    await seed();
    await openApp();

    step = 'workspace-delete-cancel-keeps-persistence';
    await cancelWorkspaceDeleteByTitle(deletedWorkspace.title, deletedWorkspace.id);

    step = 'workspace-delete-reload-persistence';
    await deleteWorkspaceByTitle(deletedWorkspace.title);
    await page.locator('[data-sidebar-workspace-title="true"]', { hasText: deletedWorkspace.title }).waitFor({ state: 'hidden', timeout: 15000 });
    let state = await readStorageState();
    assert(!state.workspaces.some(workspace => workspace.id === deletedWorkspace.id), 'deleted workspace should be removed from local-test persistence before reload', state);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300);
    assert(await page.locator('[data-sidebar-workspace-title="true"]', { hasText: deletedWorkspace.title }).count() === 0, 'deleted workspace should not reappear after reload');
    state = await readStorageState();
    assert(!state.workspaces.some(workspace => workspace.id === deletedWorkspace.id), 'deleted workspace should stay absent from storage after reload', state);

    step = 'active-workspace-delete-cleanup';
    await seed({
      activeWorkspaceId: activeWorkspace.id,
      activeBoardId: activeWorkspace.boards[0].id,
    });
    await openApp();
    await deleteWorkspaceByTitle(activeWorkspace.title);
    await page.locator('[data-sidebar-workspace-title="true"]', { hasText: activeWorkspace.title }).waitFor({ state: 'hidden', timeout: 15000 });
    state = await readStorageState();
    assert(!state.workspaces.some(workspace => workspace.id === activeWorkspace.id), 'active deleted workspace should be removed from storage', state);
    assert(state.activeWorkspaceId !== activeWorkspace.id, 'active workspace id must not point to deleted workspace', state);
    assert(state.activeBoardId !== activeWorkspace.boards[0].id, 'active board id must not point to deleted workspace board', state);
    assert(
      state.activeWorkspaceId === null || state.workspaces.some(workspace => workspace.id === state.activeWorkspaceId),
      'active workspace id should be empty or point to an existing workspace',
      state,
    );
    assert(
      state.activeBoardId === null || state.workspaces.some(workspace => workspace.boards.some(board => board.id === state.activeBoardId)),
      'active board id should be empty or point to an existing board',
      state,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: 'output/playwright/dev-035-mobile-after-active-delete.png', fullPage: true });
    assert(await page.locator('.global-dialog-content').count() === 0, 'mobile reload should not leave a stale confirm dialog open');
    state = await readStorageState();
    assert(!state.workspaces.some(workspace => workspace.id === activeWorkspace.id), 'active deleted workspace should not reappear on mobile reload', state);
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
