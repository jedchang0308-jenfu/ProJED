/* eslint-disable */
async (page) => {
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'empty-board-add-list-workspace',
    title: '空看板版面驗證工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'empty-board-add-list-board',
      title: '空白看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  await page.setViewportSize({ width: 620, height: 698 });
  await page.evaluate(({ account, workspace }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({}));
    localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify([]));
    localStorage.setItem('projed-local-test.taskTrackingReferenceStaging.v1', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', workspace.boards[0].id);
    localStorage.setItem('projed-last-view', 'board');
    localStorage.setItem(`projed-task-workbench-panel:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
      open: false,
      filtersOpen: false,
      showContainersInAllTasks: true,
      width: 360,
      openPreferenceVersion: 1,
    }));
  }, { account, workspace });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedEnvironment.count() && await fixedEnvironment.first().isVisible().catch(() => false)) {
    await fixedEnvironment.first().click({ force: true });
  }
  const boardCanvas = page.locator('[data-layout-region="board-canvas"]');
  const addList = page.locator('[data-kanban-add-column-button="true"]');
  await boardCanvas.waitFor({ state: 'visible', timeout: 15000 });
  await addList.waitFor({ state: 'visible', timeout: 15000 });
  const evidence = await page.evaluate(() => {
    const canvas = document.querySelector('[data-layout-region="board-canvas"]');
    const button = document.querySelector('[data-kanban-add-column-button="true"]');
    if (!canvas || !button) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    return {
      canvas: { left: canvasRect.left, width: canvasRect.width },
      button: { left: buttonRect.left, width: buttonRect.width, text: button.textContent?.trim() || '' },
      canvasPaddingLeft: Number.parseFloat(style.paddingLeft) || 0,
      emptyStateCount: document.querySelectorAll('[data-task-filter-result-state="true-empty"]').length,
      emptyBoardMessageCount: Array.from(document.querySelectorAll('body *')).filter(element => element.textContent?.trim() === '此看板尚無任務').length,
    };
  });
  if (!evidence
    || evidence.button.text !== '新增列表'
    || evidence.emptyStateCount !== 0
    || evidence.emptyBoardMessageCount !== 0
    || evidence.button.left > evidence.canvas.left + evidence.canvasPaddingLeft + 1) {
    throw new Error(`empty-board add-list alignment mismatch: ${JSON.stringify(evidence)}`);
  }
  await page.screenshot({ path: 'output/playwright/empty-board-add-list.png', fullPage: false });
  const result = { verifier: 'empty-board-add-list', status: 'passed', passed: true, evidence };
  await page.evaluate(value => { window.__EMPTY_BOARD_ADD_LIST_ARTIFACT = value; }, result);
  return result;
}
