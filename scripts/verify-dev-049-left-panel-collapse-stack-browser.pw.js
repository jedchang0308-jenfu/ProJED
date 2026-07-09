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
    id: 'dev049-left-panels-workspace',
    title: 'DEV-049 左側欄工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev049-left-panels-board', title: '左側欄測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev049-root': {
      id: 'dev049-root',
      workspaceId: workspace.id,
      boardId: 'dev049-left-panels-board',
      parentId: null,
      title: '測試欄位',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev049-task': {
      id: 'dev049-task',
      workspaceId: workspace.id,
      boardId: 'dev049-left-panels-board',
      parentId: 'dev049-root',
      title: '測試任務',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-16',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const waitForVisible = async (selector) => {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
  };
  const waitForHidden = async (selector) => {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 15000 });
  };

  const readState = async () => page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right },
        backgroundColor: style.backgroundColor,
      };
    };

    return {
      sidebar: read('[data-layout-region="workspace-sidebar"]'),
      sidebarHeader: read('[data-sidebar-control-area="true"]'),
      sidebarCollapse: read('[data-sidebar-collapse-toggle="true"]'),
      taskWorkbench: read('[data-layout-region="task-command-center"]'),
      taskWorkbenchCollapse: read('[data-task-workbench-collapse-toggle="true"]'),
      boardCanvas: read('[data-layout-region="board-canvas"]'),
      visibleAlerts: Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.textContent || '').trim())
        .filter(Boolean),
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
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
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false, showContainersInAllTasks: false }));
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev049-left-panels-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await waitForVisible('[data-layout-region="workspace-sidebar"]');
  await waitForVisible('[data-layout-region="board-canvas"]');
  await waitForVisible('[data-sidebar-collapse-toggle="true"]');
  let state = await readState();
  assert(state.sidebarHeader?.text.includes('工作區與看板'), 'workspace sidebar should show a matching header title and collapse affordance', state);
  assert(state.sidebarCollapse?.rect.width >= 28 && state.sidebarCollapse?.rect.height >= 28, 'workspace sidebar collapse button should be touchable', state);

  await page.locator('[data-sidebar-collapse-toggle="true"]').click();
  await waitForHidden('[data-layout-region="workspace-sidebar"]');
  await page.locator('[data-main-sidebar-toggle="true"]').click();
  await waitForVisible('[data-layout-region="workspace-sidebar"]');

  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await waitForVisible('[data-layout-region="task-command-center"]');
  state = await readState();
  assert(
    state.sidebar && state.taskWorkbench && state.sidebar.rect.x < state.taskWorkbench.rect.x && state.taskWorkbench.rect.x < state.boardCanvas.rect.x,
    'workspace sidebar and task workbench should be open side by side before Escape',
    state,
  );
  await page.screenshot({ path: 'output/playwright/dev-049-left-panel-collapse-stack-both-open.png', fullPage: true });

  await page.keyboard.press('Escape');
  await waitForHidden('[data-layout-region="task-command-center"]');
  await waitForVisible('[data-layout-region="workspace-sidebar"]');

  await page.keyboard.press('Escape');
  await waitForHidden('[data-layout-region="workspace-sidebar"]');

  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await waitForVisible('[data-layout-region="task-command-center"]');
  await page.locator('[data-main-sidebar-toggle="true"]').click();
  await waitForVisible('[data-layout-region="workspace-sidebar"]');

  await page.keyboard.press('Escape');
  await waitForHidden('[data-layout-region="workspace-sidebar"]');
  await waitForVisible('[data-layout-region="task-command-center"]');

  await page.keyboard.press('Escape');
  await waitForHidden('[data-layout-region="task-command-center"]');

  state = await readState();
  assert(state.visibleAlerts.length === 0, 'left panel collapse stack flow should not show runtime alerts', state);

  await page.screenshot({ path: 'output/playwright/dev-049-left-panel-collapse-stack-final.png', fullPage: true });
  console.log(JSON.stringify({ ...state, diagnostics: diagnostics.slice(-10) }, null, 2));
}
