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

  const baseWorkspace = {
    id: 'dev036-base-workspace',
    title: 'DEV-036 基準工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev036-base-board',
      title: 'DEV-036 基準看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };

  const seed = async () => {
    await page.evaluate(({ account, baseWorkspace }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([baseWorkspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', baseWorkspace.id);
      localStorage.setItem('projed-last-board', baseWorkspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'home');
    }, { account, baseWorkspace });
  };

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      const screenshot = `output/playwright/dev-036-open-app-timeout-${Date.now()}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      throw new Error(`app nav did not become visible: ${JSON.stringify({
        url: page.url(),
        bodyText: bodyText.slice(0, 2000),
        screenshot,
        diagnostics: diagnostics.slice(-20),
      })}`);
    }
    if (await page.locator('[data-sidebar-workspace-title="true"]').count() === 0) {
      const mainSidebarToggle = page.locator('[data-main-sidebar-toggle="true"]').first();
      if (await mainSidebarToggle.count() > 0) {
        await mainSidebarToggle.click();
      } else {
        await page.getByTitle('展開工作區選單').click();
      }
    }
    await page.locator('[data-sidebar-workspace-title="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const readStorageState = async () => page.evaluate(() => ({
    workspaces: JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]'),
    activeWorkspaceId: localStorage.getItem('projed-last-ws'),
    activeBoardId: localStorage.getItem('projed-last-board'),
    activeView: localStorage.getItem('projed-last-view'),
  }));

  const openCreateWorkspaceDialogFromContextMenu = async () => {
    assert(await page.locator('[data-sidebar-create-workspace-button="true"]').count() === 0, 'persistent create workspace button should be removed');
    await page.locator('[data-sidebar-workspace-title="true"]').first().click({ button: 'right' });
    const createMenuItem = page.locator('[data-context-menu-create-workspace="true"]').first();
    await createMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await createMenuItem.click();
    const dialog = page.locator('[data-workspace-create-dialog="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    return dialog;
  };

  const createWorkspace = async (title) => {
    const dialog = await openCreateWorkspaceDialogFromContextMenu();
    await dialog.locator('input[aria-invalid]').fill(title);
    await dialog.getByText('建立', { exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('[data-sidebar-workspace-title="true"]', { hasText: title }).waitFor({ state: 'visible', timeout: 10000 });
  };

  let step = 'seed';
  try {
    await seed();
    await openApp();

    step = 'blank-name-disabled';
    let dialog = await openCreateWorkspaceDialogFromContextMenu();
    assert(await dialog.getByText('建立', { exact: true }).isDisabled(), 'create button should be disabled for blank workspace title');
    await dialog.getByLabel('取消新增工作區').click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });

    step = 'workspace-create-reload-persistence';
    await createWorkspace('研發部');
    let state = await readStorageState();
    const rdWorkspace = state.workspaces.find(workspace => workspace.title === '研發部');
    assert(rdWorkspace, 'created workspace should be persisted in local-test storage', state);
    assert(state.activeWorkspaceId === rdWorkspace.id, 'created workspace should become active after backend success', state);
    assert(state.activeBoardId === null, 'active board should be cleared after workspace create', state);
    assert(state.activeView === 'home', 'workspace create should keep user on home view', state);
    assert(await page.locator('[data-home-workspace-section="true"]', { hasText: '研發部' }).count() === 1, 'home should show created workspace section');
    assert(await page.locator('[data-empty-workspace-create-board="true"]').count() >= 1, 'empty workspace should expose create board CTA');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-sidebar-workspace-title="true"]', { hasText: '研發部' }).waitFor({ state: 'visible', timeout: 10000 });
    state = await readStorageState();
    assert(state.workspaces.some(workspace => workspace.title === '研發部'), 'created workspace should persist after reload', state);

    step = 'create-board-in-created-workspace';
    const rdSection = page.locator('[data-home-workspace-section="true"]', { hasText: '研發部' });
    await rdSection.locator('[data-empty-workspace-create-board="true"]').click();
    const prompt = page.locator('.global-dialog-content');
    await prompt.waitFor({ state: 'visible', timeout: 10000 });
    await prompt.locator('input').fill('研發看板');
    await prompt.getByText('確認', { exact: true }).click();
    await page.locator('[data-sidebar-board-title="true"]', { hasText: '研發看板' }).waitFor({ state: 'visible', timeout: 10000 });
    state = await readStorageState();
    assert(
      state.workspaces.some(workspace => workspace.title === '研發部' && workspace.boards.some(board => board.title === '研發看板')),
      'board created from empty workspace CTA should stay under that workspace',
      state,
    );

    step = 'second-workspace-create';
    await createWorkspace('生產部');
    state = await readStorageState();
    assert(
      state.workspaces.some(workspace => workspace.title === '研發部') &&
        state.workspaces.some(workspace => workspace.title === '生產部'),
      'app should support more than one user-created workspace',
      state,
    );
    assert(await page.locator('[data-sidebar-workspace-title="true"]', { hasText: '生產部' }).count() === 1, 'sidebar should show second workspace');

    step = 'board-share-and-move-wiring-smoke';
    assert(await page.getByText('DEV-036 基準看板', { exact: true }).count() >= 1, 'existing board should remain visible after workspace create flow');

    step = 'mobile-viewport-smoke';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    if (await page.locator('[data-sidebar-workspace-list="true"]').count() === 0) {
      await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    }
    await page.locator('[data-sidebar-workspace-list="true"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-sidebar-create-workspace-button="true"]').count() === 0, 'mobile sidebar should not show persistent create workspace button');
    await page.locator('[data-sidebar-workspace-title="true"]').first().click({ button: 'right' });
    await page.locator('[data-context-menu-create-workspace="true"]').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-036-workspace-governance-mobile.png', fullPage: true });
    const visibleErrorText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(visibleErrorText), 'mobile viewport should not show visible runtime errors');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
