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
    id: 'dev047-layout-workspace',
    title: 'DEV-047 視覺分層工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev047-layout-board-a', title: 'ProJED 品質驗證測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev047-layout-root-a': {
      id: 'dev047-layout-root-a',
      workspaceId: workspace.id,
      boardId: 'dev047-layout-board-a',
      parentId: null,
      title: '新任務',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev047-layout-task-a': {
      id: 'dev047-layout-task-a',
      workspaceId: workspace.id,
      boardId: 'dev047-layout-board-a',
      parentId: 'dev047-layout-root-a',
      title: '快到期任務',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-16',
      assigneeId: account.id,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([
      {
        id: 'dev047-layout-inbox-a',
        title: '未歸位提醒',
        note: '未歸位提醒',
        itemType: 'todo',
        captureStatus: 'untriaged',
        syncStatus: 'pending',
        createdBy: account.id,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
        completedAt: null,
        archivedAt: null,
        suggestedDueDate: '2026-07-14',
        confirmedDueDate: null,
        promotedTaskNodeId: null,
      },
    ]));
    localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: true, filtersOpen: false }));
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev047-layout-board-a');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('[data-layout-region="topbar"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-layout-region="workspace-sidebar"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-layout-region="task-command-center"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });

  const visual = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        backgroundColor: style.backgroundColor,
        borderRightWidth: style.borderRightWidth,
        borderRightColor: style.borderRightColor,
        borderBottomColor: style.borderBottomColor,
        boxShadow: style.boxShadow,
        rect: { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height },
      };
    };

    return {
      topbar: read('[data-layout-region="topbar"]'),
      topbarContext: read('[data-topbar-context-group="true"]'),
      topbarControls: read('[data-topbar-board-controls="true"]'),
      topbarActions: read('[data-topbar-action-group="true"]'),
      topbarFilterText: (document.querySelector('#filter-menu-trigger')?.textContent || '').trim(),
      topbarFilterIconCount: document.querySelectorAll('#filter-menu-trigger svg').length,
      workspaceSidebar: read('[data-layout-region="workspace-sidebar"]'),
      taskCommandCenter: read('[data-layout-region="task-command-center"]'),
      taskCommandCenterTitle: read('[data-task-command-center-title="true"]'),
      taskCommandCenterTitleIconCount: document.querySelectorAll('[data-task-command-center-title="true"] svg').length,
      taskCommandCenterFilterText: (document.querySelector('[data-task-workbench-filter-toggle="true"]')?.textContent || '').trim(),
      taskCommandCenterFilterIconCount: document.querySelectorAll('[data-task-workbench-filter-toggle="true"] svg').length,
      unplacedTaskBody: read('[data-task-workbench-unclassified-section="true"]'),
      placedTaskBody: read('[data-task-workbench-placed-board-lane="true"]'),
      unplacedHeader: read('[data-task-workbench-section-header="unplaced"]'),
      placedHeader: read('[data-task-workbench-section-header="all-tasks"]'),
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

  assert(visual.topbar && visual.workspaceSidebar && visual.taskCommandCenter && visual.boardCanvas, 'four layout regions should be visible', visual);
  assert(visual.topbarContext && visual.topbarControls && visual.topbarActions, 'topbar command groups should be visible on desktop', visual);
  assert(visual.taskCommandCenterTitle, 'task command center title treatment should render', visual);
  assert(visual.taskCommandCenterTitleIconCount === 0, 'task command center title should not render a filter-like icon', visual);
  assert(
    visual.topbarFilterText === '' &&
      visual.topbarFilterIconCount === 1 &&
      visual.taskCommandCenterFilterText === '' &&
      visual.taskCommandCenterFilterIconCount === 1,
    'topbar and task command center filter triggers should be icon-only without visible counts',
    visual,
  );
  assert(
    visual.unplacedTaskBody.backgroundColor === visual.placedTaskBody.backgroundColor &&
      visual.unplacedHeader.backgroundColor === visual.placedHeader.backgroundColor &&
      visual.unplacedHeader.backgroundColor !== visual.unplacedTaskBody.backgroundColor,
    'unplaced and placed task bodies should share one tone, while section headers use a separate title tone',
    {
      unplacedBody: visual.unplacedTaskBody.backgroundColor,
      placedBody: visual.placedTaskBody.backgroundColor,
      unplacedHeader: visual.unplacedHeader.backgroundColor,
      placedHeader: visual.placedHeader.backgroundColor,
    },
  );
  assert(visual.visibleAlerts.length === 0, 'layout hierarchy view should not show runtime alerts', visual.visibleAlerts);

  assert(
    visual.workspaceSidebar.rect.x < visual.taskCommandCenter.rect.x &&
      visual.taskCommandCenter.rect.x < visual.boardCanvas.rect.x,
    'workspace sidebar, task command center, and board canvas should read left to right',
    visual,
  );

  assert(
    parseFloat(visual.taskCommandCenter.borderRightWidth) >= 2 &&
      parseFloat(visual.workspaceSidebar.borderRightWidth) <= 1,
    'task command center should have stronger separation than workspace sidebar',
    {
      workspaceBorder: visual.workspaceSidebar.borderRightWidth,
      taskHubBorder: visual.taskCommandCenter.borderRightWidth,
    },
  );

  assert(
    visual.taskCommandCenter.backgroundColor !== visual.workspaceSidebar.backgroundColor &&
      visual.taskCommandCenter.backgroundColor !== visual.boardCanvas.backgroundColor,
    'task command center background should differ from navigation and board canvas',
    {
      workspace: visual.workspaceSidebar.backgroundColor,
      taskHub: visual.taskCommandCenter.backgroundColor,
      board: visual.boardCanvas.backgroundColor,
    },
  );

  assert(
    visual.taskCommandCenter.boxShadow !== 'none' &&
      visual.topbar.boxShadow !== 'none',
    'topbar and task command center should use elevation to separate layout layers',
    {
      topbarShadow: visual.topbar.boxShadow,
      taskHubShadow: visual.taskCommandCenter.boxShadow,
    },
  );

  await page.screenshot({ path: 'output/playwright/dev-047-layout-visual-hierarchy.png', fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  const compactDesktop = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        rect: { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height },
      };
    };

    return {
      topbar: read('[data-layout-region="topbar"]'),
      topbarContext: read('[data-topbar-context-group="true"]'),
      topbarActions: read('[data-topbar-action-group="true"]'),
      workspaceSidebar: read('[data-layout-region="workspace-sidebar"]'),
      taskCommandCenter: read('[data-layout-region="task-command-center"]'),
      boardCanvas: read('[data-layout-region="board-canvas"]'),
    };
  });

  assert(
    compactDesktop.topbar?.rect.height > 0 &&
      compactDesktop.workspaceSidebar?.rect.width >= 260 &&
      compactDesktop.taskCommandCenter?.rect.width >= 320 &&
      compactDesktop.boardCanvas?.rect.width >= 300,
    '1024px desktop layout should keep all four regions visible and usable',
    compactDesktop,
  );
  assert(
    compactDesktop.topbarContext.rect.right <= compactDesktop.topbarActions.rect.x ||
      compactDesktop.topbarActions.display === 'none',
    '1024px topbar groups should not overlap',
    compactDesktop,
  );

  await page.screenshot({ path: 'output/playwright/dev-047-layout-visual-hierarchy-1024.png', fullPage: true });
  console.log(JSON.stringify({ visual, diagnostics: diagnostics.slice(-10) }, null, 2));
}
