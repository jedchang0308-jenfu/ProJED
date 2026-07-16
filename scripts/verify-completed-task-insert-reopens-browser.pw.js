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
    id: 'completed-insert-workspace',
    title: '完成任務新增驗證工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'completed-insert-board', title: '完成任務新增驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };
  const nodes = {
    'completed-insert-root': {
      id: 'completed-insert-root',
      workspaceId: workspace.id,
      boardId: 'completed-insert-board',
      parentId: null,
      title: '已完成根任務',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'completed-insert-parent': {
      id: 'completed-insert-parent',
      workspaceId: workspace.id,
      boardId: 'completed-insert-board',
      parentId: 'completed-insert-root',
      title: '已完成父任務',
      status: 'completed',
      nodeType: 'task',
      order: 0,
      endDate: '2020-01-01',
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
    const filters = {
      statusFilters: {
        todo: true,
        in_progress: true,
        delayed: true,
        completed: true,
        unsure: true,
        onhold: true,
      },
      dueWithinDays: null,
      selectedAssigneeIds: [],
      selectedTagIds: [],
      keyword: '',
    };
    const displaySettings = {
      showDependencies: true,
      showStartDate: true,
      showTags: true,
    };
    localStorage.setItem('projed-filters', JSON.stringify({ ...filters, ...displaySettings }));
    localStorage.setItem('projed-task-filters:v1', JSON.stringify({
      version: 2,
      filters,
      displaySettings,
      updatedAt: Date.now(),
    }));
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'completed-insert-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  const card = page.locator('[data-task-id="completed-insert-parent"]').first();
  await card.waitFor({ state: 'visible', timeout: 10000 });
  await card.click({ button: 'right' });
  await page.getByText('新增下層任務').click();

  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const parent = stored['completed-insert-parent'];
    const children = Object.values(stored).filter((node) => node?.parentId === 'completed-insert-parent' && !node?.isArchived);
    return parent?.status === 'in_progress' && children.length === 1;
  }, null, { timeout: 5000 });

  const result = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const parent = stored['completed-insert-parent'];
    const children = Object.values(stored).filter((node) => node?.parentId === 'completed-insert-parent' && !node?.isArchived);
    const bodyText = document.body.textContent || '';
    const visibleAlerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean);

    return {
      parentStatus: parent?.status,
      childCount: children.length,
      childTitle: children[0]?.title || null,
      hasOldBlockText: bodyText.includes('已完成的任務不能新增下層任務') || bodyText.includes('已完成任務底下不能新增下層任務'),
      hasAutoReopenNotice: bodyText.includes('已將完成任務改為進行中，並新增任務。'),
      visibleAlerts,
    };
  });

  assert(result.parentStatus === 'in_progress', 'completed parent should reopen to in_progress when adding a child', result);
  assert(result.childCount === 1, 'adding below a completed parent should create exactly one child', result);
  assert(result.childTitle === '新任務', 'new child should use the existing new-task title', result);
  assert(!result.hasOldBlockText, 'old completed-task blocking message should not appear', result);
  assert(result.hasAutoReopenNotice, 'auto reopen should be communicated with a non-blocking notice', result);
  assert(result.visibleAlerts.length === 0, 'completed-task insert flow should not show runtime alerts', result);

  await page.screenshot({ path: 'output/playwright/completed-task-insert-reopens.png', fullPage: true });
  console.log(JSON.stringify({ ...result, diagnostics: diagnostics.slice(-10) }, null, 2));
}
