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
    id: 'dev048-path-workspace',
    title: 'DEV-048 任務位置工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev048-path-board', title: '父層路徑測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev048-root': {
      id: 'dev048-root',
      workspaceId: workspace.id,
      boardId: 'dev048-path-board',
      parentId: null,
      title: '產品開發',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev048-phase': {
      id: 'dev048-phase',
      workspaceId: workspace.id,
      boardId: 'dev048-path-board',
      parentId: 'dev048-root',
      title: '設計階段',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev048-package': {
      id: 'dev048-package',
      workspaceId: workspace.id,
      boardId: 'dev048-path-board',
      parentId: 'dev048-phase',
      title: 'UI 工作包',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev048-child': {
      id: 'dev048-child',
      workspaceId: workspace.id,
      boardId: 'dev048-path-board',
      parentId: 'dev048-package',
      title: '任務卡名稱位置顯示',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-16',
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
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev048-path-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev048-child' } }));
  });

  const modal = page.locator('[data-task-details-modal="true"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  await modal.locator('[data-task-details-title-input="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await modal.locator('[data-task-details-parent-path="true"]').waitFor({ state: 'visible', timeout: 10000 });

  const result = await page.evaluate(() => {
    const modal = document.querySelector('[data-task-details-modal="true"]');
    const titleInput = modal?.querySelector('[data-task-details-title-input="true"]');
    const path = modal?.querySelector('[data-task-details-parent-path="true"]');
    const names = Array.from(path?.querySelectorAll('[data-task-details-parent-name="true"]') || [])
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean);
    const titleRect = titleInput?.getBoundingClientRect();
    const pathRect = path?.getBoundingClientRect();
    const modalBox = modal?.querySelector('.shadow-2xl')?.getBoundingClientRect();
    const visibleAlerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean);

    return {
      modalTaskId: modal?.getAttribute('data-task-id') || '',
      titleValue: titleInput?.value || '',
      pathText: (path?.textContent || '').replace(/\s+/g, ' ').trim(),
      names,
      titleRect: titleRect ? { top: titleRect.top, bottom: titleRect.bottom, left: titleRect.left, right: titleRect.right } : null,
      pathRect: pathRect ? { top: pathRect.top, bottom: pathRect.bottom, left: pathRect.left, right: pathRect.right } : null,
      modalBox: modalBox ? { left: modalBox.left, right: modalBox.right, width: modalBox.width } : null,
      visibleAlerts,
    };
  });

  assert(result.modalTaskId === 'dev048-child', 'modal should open the target task', result);
  assert(result.titleValue === '任務卡名稱位置顯示', 'title input should still show the current task name', result);
  assert(
    result.names.join(' > ') === '產品開發 > 設計階段 > UI 工作包',
    'parent path should show every ancestor from root to direct parent',
    result,
  );
  assert(!result.names.includes('任務卡名稱位置顯示'), 'parent path should not duplicate the current task title', result);
  assert(result.pathText.startsWith('位置'), 'parent path should be labeled as position context', result);
  assert(result.titleRect && result.pathRect && result.pathRect.top >= result.titleRect.bottom - 1, 'parent path should render below the title field', result);
  assert(
    result.modalBox && result.pathRect && result.pathRect.right <= result.modalBox.right - 40,
    'parent path should stay inside the modal header',
    result,
  );
  assert(result.visibleAlerts.length === 0, 'task details parent path view should not show runtime alerts', result);

  await page.screenshot({ path: 'output/playwright/dev-048-task-details-parent-path.png', fullPage: true });
  console.log(JSON.stringify({ ...result, diagnostics: diagnostics.slice(-10) }, null, 2));
}
