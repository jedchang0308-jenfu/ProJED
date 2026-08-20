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
  const workspace = {
    id: 'task-workbench-hover-workspace',
    title: '工作臺 hover 測試工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'task-workbench-hover-board', title: '待辦清單', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const nodes = {
    'task-workbench-hover-parent': {
      id: 'task-workbench-hover-parent',
      workspaceId: workspace.id,
      boardId: 'task-workbench-hover-board',
      parentId: null,
      title: '工作臺預選群組',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'task-workbench-hover-task': {
      id: 'task-workbench-hover-task',
      workspaceId: workspace.id,
      boardId: 'task-workbench-hover-board',
      parentId: 'task-workbench-hover-parent',
      title: '工作臺預選測試任務',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
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
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'task-workbench-hover-board');
    localStorage.setItem('projed-last-view', 'board');
    localStorage.setItem('projed-task-workbench-panel:v2:account:local-test-user', JSON.stringify({
      open: true,
      filtersOpen: false,
      showContainersInAllTasks: false,
      width: 360,
      openPreferenceVersion: 1,
    }));
    localStorage.setItem('projed-task-workbench-filters:v2:account:local-test-user', JSON.stringify({
      selectedBoardId: 'task-workbench-hover-board',
      filtersByBoardId: {},
    }));
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  const panel = page.locator('[data-task-workbench-panel="true"]');
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  const task = panel.locator('[data-task-workbench-task-card="true"][data-task-id="task-workbench-hover-task"]');
  const rootTask = panel.locator('[data-task-workbench-task-card="true"][data-task-id="task-workbench-hover-parent"]');
  await task.waitFor({ state: 'visible', timeout: 10000 });
  await rootTask.waitFor({ state: 'visible', timeout: 10000 });

  const before = await task.evaluate((element) => ({
    marker: element.getAttribute('data-desktop-task-hover-preview'),
    className: element.getAttribute('class') || '',
    taskTitle: element.querySelector('[data-task-workbench-task-title="true"]')?.getAttribute('title') || '',
    taskLocation: element.querySelector('[data-task-workbench-task-title="true"]')?.getAttribute('data-task-workbench-task-location') || '',
  }));
  const rootTaskLocation = await rootTask.locator('[data-task-workbench-task-title="true"]').getAttribute('data-task-workbench-task-location');
  await task.hover();
  await page.waitForTimeout(80);
  const after = await task.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      marker: element.getAttribute('data-desktop-task-hover-preview'),
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      className: element.getAttribute('class') || '',
    };
  });

  assert(before.marker === 'true', 'workbench task rows should opt into the shared hover preview marker', { before, after });
  assert(before.taskTitle === '工作臺預選群組' && before.taskLocation === '工作臺預選群組', 'workbench task hover tooltip should show the real parent task location', { before, after });
  assert(rootTaskLocation === '工作臺預選群組', 'root task hover tooltip should show the task name as its location', { rootTaskLocation, before, after });
  assert(after.boxShadow.includes('99, 102, 241'), 'workbench task hover should use the shared brand-blue inset frame', { before, after });
  assert(
    after.backgroundColor !== 'rgba(0, 0, 0, 0)'
      && after.backgroundColor !== 'rgb(255, 255, 255)'
      && /rgba?\(|oklab\(|color\(/.test(after.backgroundColor),
    'workbench task hover should use the shared light brand-blue background',
    { before, after },
  );
  assert(after.className.includes('hover:bg-white') && !after.className.includes('rounded-md'), 'workbench task rows should match the flat checklist hover fallback', { before, after });

  const visibleAlerts = await page.locator('[role="alert"]:visible').allTextContents();
  assert(visibleAlerts.length === 0, 'workbench hover preview should not show runtime alerts', { visibleAlerts });

  await page.screenshot({ path: 'output/playwright/task-workbench-hover-preview.png', fullPage: true });
  console.log(JSON.stringify({ passed: true, before, rootTaskLocation, after }, null, 2));
}
