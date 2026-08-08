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

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev048-filter-workspace',
    title: 'DEV-048 協作過濾驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      {
        id: 'dev048-filter-board',
        title: '主責協作過濾看板',
        dependencies: [],
        order: 1,
        createdAt: 1704067200000,
      },
    ],
  };
  const node = (id, title, order, assignment = {}) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'dev048-filter-board',
    parentId: null,
    title,
    status: 'todo',
    nodeType: 'task',
    order,
    assigneeId: assignment.assigneeIds?.[0],
    assigneeIds: assignment.assigneeIds || [],
    collaboratorIds: assignment.collaboratorIds || [],
    tagIds: [],
    createdAt: 1704067200000 + order,
    updatedAt: 1704067200000 + order,
  });
  const nodes = {
    'dev048-filter-primary': node('dev048-filter-primary', 'QA-F-01 主責A協作B', 0, {
      assigneeIds: ['local-test-user'],
      collaboratorIds: ['local-test-member'],
    }),
    'dev048-filter-other': node('dev048-filter-other', 'QA-F-02 主責C協作D', 1, {
      assigneeIds: ['local-test-admin'],
      collaboratorIds: ['local-test-pm'],
    }),
    'dev048-filter-collaborator-only': node('dev048-filter-collaborator-only', 'QA-F-03 僅協作E', 2, {
      collaboratorIds: ['local-test-viewer'],
    }),
    'dev048-filter-unassigned': node('dev048-filter-unassigned', 'QA-F-04 真正未指派', 3),
    'dev048-filter-unrelated': node('dev048-filter-unrelated', 'QA-F-05 無關任務', 4, {
      assigneeIds: ['local-test-analyst'],
    }),
  };

  const seed = async () => {
    await page.evaluate(({ account, workspace, nodes }) => {
      // Preserve the fixed local-test mode flag set by the real login click.
      [
        'projed-local-test.selected-account',
        'projed-local-test.session',
        'projed-local-test.workspaces',
        'projed-local-test.nodes',
        'projed-local-test.dependencies',
        'projed-local-test.tags',
        'projed-local-test.activityEvents',
        'projed-local-test.seeded.v1',
        'projed-local-test.seeded.size',
        'projed-last-ws',
        'projed-last-board',
        'projed-last-view',
        'projed-task-filters:v2:account:local-test-user',
        'projed-task-workbench-panel:v2:account:local-test-user',
        'projed-task-workbench-filters:v2:account:local-test-user',
        'projed-filters',
        'projed-task-filters:v1',
        'projed-task-workbench-panel:v1',
        'projed-task-workbench-filters:v1',
      ].forEach(key => localStorage.removeItem(key));
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev048-filter-board');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes });
  };

  const visibleIds = async (selector, ids) => page.evaluate(({ selector, ids }) => {
    const visible = new Set();
    document.querySelectorAll(selector).forEach(element => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
        const id = element.getAttribute('data-task-id');
        if (id && ids.includes(id)) visible.add(id);
      }
    });
    return [...visible].sort();
  }, { selector, ids });

  const waitForVisibleIds = async (selector, expected, label) => {
    await page.waitForFunction(({ selector, expected }) => {
      const actual = new Set();
      document.querySelectorAll(selector).forEach(element => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
          const id = element.getAttribute('data-task-id');
          if (id) actual.add(id);
        }
      });
      return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
    }, { selector, expected }, { timeout: 10000 });
    const actual = await visibleIds(selector, expected.concat([
      'dev048-filter-primary',
      'dev048-filter-other',
      'dev048-filter-collaborator-only',
      'dev048-filter-unassigned',
      'dev048-filter-unrelated',
    ]));
    assert(JSON.stringify(actual) === JSON.stringify([...expected].sort()), `${label} filtered task set mismatch`, { expected, actual });
  };

  const allTaskIds = [
    'dev048-filter-primary',
    'dev048-filter-other',
    'dev048-filter-collaborator-only',
    'dev048-filter-unassigned',
    'dev048-filter-unrelated',
  ];
  const boardSelector = '[data-task-surface-source="true"][data-task-id]';
  const workbenchSelector = '[data-task-workbench-all-task-card="true"][data-task-id]';

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /使用固定測試環境/ }).click();
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await seed();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  try {
    await page.locator(`${boardSelector}[data-task-id="dev048-filter-primary"]`).waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const authDebug = await page.evaluate(() => ({
      session: localStorage.getItem('projed-local-test.session'),
      selectedAccount: localStorage.getItem('projed-local-test.selected-account'),
      workspaceIds: Object.keys(JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '{}')),
      nodeIds: Object.keys(JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')),
      bodyText: (document.body.textContent || '').slice(0, 500),
    }));
    await page.screenshot({ path: 'output/playwright/dev-048-filter-collaborators-open-timeout.png', fullPage: true });
    console.log(JSON.stringify({ authDebug, diagnostics }, null, 2));
    throw error;
  }

  const boardTrigger = page.locator('[data-task-filter-control-group="true"] > button').first();
  await boardTrigger.click();
  const boardPanel = page.locator('[data-filter-menu-panel]');
  await boardPanel.waitFor({ state: 'visible', timeout: 5000 });
  const boardPanelText = await boardPanel.innerText();
  assert(boardPanelText.includes('負責人/協作'), 'Board filter must show the combined assignee/collaborator label', { boardPanelText });

  const memberLabels = ['本機測試成員', '本機測試專案管理者', '本機測試檢視者'];
  for (const label of memberLabels) {
    await boardPanel.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  }
  const boardOptionText = await boardPanel.locator('button').allTextContents();
  assert(memberLabels.every(label => boardOptionText.some(text => text.includes(label))), 'Board options must expose collaborators from active tasks', { boardOptionText });

  const selectedBoardLabels = [];
  const setBoardSelection = async (labels, expected, label) => {
    for (const current of selectedBoardLabels.splice(0)) {
      await boardPanel.getByRole('button', { name: current, exact: true }).click();
    }
    for (const next of labels) {
      await boardPanel.getByRole('button', { name: next, exact: true }).click();
      selectedBoardLabels.push(next);
    }
    await waitForVisibleIds(boardSelector, expected, `Board ${label}`);
  };

  await setBoardSelection(['本機測試成員'], ['dev048-filter-primary'], 'collaborator on primary task');
  await setBoardSelection(['本機測試專案管理者'], ['dev048-filter-other'], 'collaborator on another primary task');
  await setBoardSelection(['本機測試檢視者'], ['dev048-filter-collaborator-only'], 'collaborator-only task');
  await setBoardSelection(['未指派'], ['dev048-filter-collaborator-only', 'dev048-filter-unassigned'], 'unassigned plus collaborator-only task');
  await setBoardSelection(['本機測試成員', '本機測試專案管理者'], ['dev048-filter-primary', 'dev048-filter-other'], 'multi-select OR semantics');

  for (const current of selectedBoardLabels.splice(0)) {
    await boardPanel.getByRole('button', { name: current, exact: true }).click();
  }
  await waitForVisibleIds(boardSelector, allTaskIds, 'Board cleared filter');
  await boardTrigger.click();

  const workbenchEntry = page.getByRole('button', { name: '開啟全域任務平台', exact: true });
  const workbench = page.locator('[data-task-workbench-panel="true"]');
  if (await workbench.count() === 0) {
    await workbenchEntry.waitFor({ state: 'visible', timeout: 5000 });
    await workbenchEntry.click();
  }
  await workbench.waitFor({ state: 'visible', timeout: 10000 });
  const workbenchPopover = workbench.locator('[data-task-workbench-filter-popover="true"]');
  if (await workbenchPopover.count() === 0) {
    await workbench.locator('[data-task-workbench-filter-toggle="true"]').click();
  }
  await workbenchPopover.waitFor({ state: 'visible', timeout: 5000 });
  const conditionControls = workbenchPopover.locator('[data-task-condition-filter-controls="true"]');
  const workbenchText = await conditionControls.innerText();
  assert(workbenchText.includes('負責人/協作'), 'Workbench filter must show the combined assignee/collaborator label', { workbenchText });
  for (const label of memberLabels) {
    await conditionControls.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  }

  const selectedWorkbenchLabels = [];
  const setWorkbenchSelection = async (labels, expected, label) => {
    for (const current of selectedWorkbenchLabels.splice(0)) {
      await conditionControls.getByRole('button', { name: current, exact: true }).click();
    }
    for (const next of labels) {
      await conditionControls.getByRole('button', { name: next, exact: true }).click();
      selectedWorkbenchLabels.push(next);
    }
    await waitForVisibleIds(workbenchSelector, expected, `Workbench ${label}`);
  };

  await setWorkbenchSelection(['本機測試成員'], ['dev048-filter-primary'], 'collaborator on primary task');
  await setWorkbenchSelection(['本機測試專案管理者'], ['dev048-filter-other'], 'collaborator on another primary task');
  await setWorkbenchSelection(['本機測試檢視者'], ['dev048-filter-collaborator-only'], 'collaborator-only task');
  await setWorkbenchSelection(['未指派'], ['dev048-filter-collaborator-only', 'dev048-filter-unassigned'], 'unassigned plus collaborator-only task');
  await setWorkbenchSelection(['本機測試成員', '本機測試專案管理者'], ['dev048-filter-primary', 'dev048-filter-other'], 'multi-select OR semantics');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  if (await workbench.count() === 0) {
    await page.getByRole('button', { name: '開啟全域任務平台', exact: true }).click();
    await workbench.waitFor({ state: 'visible', timeout: 5000 });
  }
  const mobileFilterToggle = workbench.locator('[data-task-workbench-filter-toggle="true"]');
  if (await workbenchPopover.count() === 0) {
    await mobileFilterToggle.click();
    await workbenchPopover.waitFor({ state: 'visible', timeout: 5000 });
  }
  const mobileLayout = await page.evaluate(() => {
    const popover = document.querySelector('[data-task-workbench-filter-popover="true"]');
    const label = Array.from(document.querySelectorAll('label')).find(element => element.textContent?.includes('負責人/協作'));
    const popoverRect = popover?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      popoverRight: popoverRect?.right ?? null,
      labelVisible: Boolean(labelRect && labelRect.width > 0 && labelRect.height > 0),
    };
  });
  await page.screenshot({ path: 'output/playwright/dev-048-filter-collaborators-mobile-debug.png', fullPage: false });
  assert(mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1, 'mobile workbench filter must not create document horizontal overflow', mobileLayout);
  assert(mobileLayout.bodyScrollWidth <= mobileLayout.viewportWidth + 1, 'mobile workbench filter must not create body horizontal overflow', mobileLayout);
  assert(mobileLayout.popoverRight === null || mobileLayout.popoverRight <= mobileLayout.viewportWidth + 1, 'mobile workbench filter must stay within viewport', mobileLayout);
  assert(mobileLayout.labelVisible, 'mobile workbench filter must keep the combined label visible', mobileLayout);
  await page.screenshot({ path: 'output/playwright/dev-048-filter-collaborators-mobile.png', fullPage: false });

  const visibleErrors = await page.evaluate(() => Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
    .filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map(element => (element.textContent || '').trim())
    .filter(Boolean));
  assert(visibleErrors.length === 0, 'filter flow must not show visible runtime errors', { visibleErrors });
  assert(diagnostics.length === 0, 'filter flow must not emit console errors or page errors', { diagnostics });

  console.log(JSON.stringify({
    ok: true,
    checks: 14,
    viewport: { desktop: '1440x900', mobile: '390x844' },
    boardFilter: 'primary + collaborator + collaborator-only + unassigned + multi-select',
    workbenchFilter: 'primary + collaborator + collaborator-only + unassigned + multi-select',
    mobileLayout,
    visibleErrors,
    diagnostics,
  }, null, 2));
}
