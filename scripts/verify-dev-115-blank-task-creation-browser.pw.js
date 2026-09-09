/* eslint-disable */
async (page) => {
  const result = {
    devId: 'DEV-115',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    route: '/',
    viewport: { width: 1440, height: 900 },
    actor: { id: 'local-test-user', role: 'owner' },
    fixture: { workspaceId: 'dev115-workspace', boardId: 'dev115-board', prefix: 'dev115-' },
    cases: [],
    browserErrors: [],
    httpFailures: [],
    cleanup: { runtime: 'matching pre-existing localhost:4000', action: 'reused; not stopped' },
  };
  const failures = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  page.on('console', message => {
    if (message.type() === 'error') result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) {
      result.httpFailures.push({ status: response.status(), url: response.url() });
    }
  });

  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local', displayName: '本機測試擁有者', createdAt: 1704067200000 };
  const workspace = {
    id: 'dev115-workspace', title: 'DEV-115 空白任務建立驗證', ownerId: account.id, members: [account.id], order: 1,
    createdAt: 1704067200000, boards: [{ id: 'dev115-board', title: '驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const nodes = {
    'dev115-root': { id: 'dev115-root', workspaceId: workspace.id, boardId: 'dev115-board', parentId: null, title: '既有根任務', status: 'todo', nodeType: 'group', order: 0, createdAt: 1704067200000, updatedAt: 1704067200000 },
  };

  const readNodes = async () => page.evaluate(() => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const unplacedKeys = [
      'projed-task-workbench-unplaced-tasks:v1',
      'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
    ];
    unplacedKeys.forEach(key => {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(stored)) return;
      stored.forEach(node => {
        if (node && node.id) nodes[node.id] = node;
      });
    });
    return nodes;
  });
  const closeDetailsIfOpen = async () => {
    const close = page.getByRole('button', { name: '關閉任務詳情' }).first();
    if (await close.count()) {
      await close.click({ force: true });
      await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 });
    }
  };
  const switchView = async (view, readySelector) => {
    await page.evaluate(nextView => localStorage.setItem('projed-last-view', nextView), view);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
  };
  const seed = async () => {
    await page.setViewportSize(result.viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
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
      localStorage.setItem('projed-last-board', 'dev115-board');
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false }));
    }, { account, workspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.getByRole('button', { name: /使用固定測試環境/ }).count()) {
      await page.getByRole('button', { name: /使用固定測試環境/ }).click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    }
  };

  try {
    await seed();
    const workbenchNav = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    await workbenchNav.waitFor({ state: 'visible', timeout: 15000 });
    await workbenchNav.click({ force: true });
    await page.waitForTimeout(600);
    const workbenchPanel = page.locator('[data-task-workbench-panel="true"]');
    await workbenchPanel.waitFor({ state: 'visible', timeout: 15000 });
    const unplacedLane = workbenchPanel.locator('[data-task-workbench-unplaced-lane="true"]');
    const workbenchAdd = unplacedLane.locator('[data-task-workbench-unclassified-modal-add="true"]');
    await workbenchAdd.waitFor({ state: 'visible', timeout: 15000 });
    const beforeWorkbench = await readNodes();
    await workbenchAdd.click();
    const workbenchDetails = page.locator('[data-task-details-modal="true"]');
    await workbenchDetails.waitFor({ state: 'visible', timeout: 15000 });
    const workbenchNote = workbenchDetails.locator('[data-task-detail-note-content-input="true"]').first();
    await workbenchNote.waitFor({ state: 'visible', timeout: 15000 });
    const workbenchNoteText = await workbenchNote.textContent();
    const afterWorkbench = await readNodes();
    const workbenchCreated = Object.values(afterWorkbench).find(node => !beforeWorkbench[node.id]
      && node.boardId === '__task_workbench_unplaced__' && node.title === '新任務');
    record('B01-workbench-blank-description', Boolean(workbenchCreated)
      && !Object.prototype.hasOwnProperty.call(workbenchCreated, 'description')
      && (workbenchNoteText || '') === '', { workbenchCreated, noteValue: workbenchNoteText });
    const workbenchTitleInput = workbenchDetails.locator('[data-task-details-title-input="true"]');
    await workbenchTitleInput.fill('DEV115 已重新命名');
    await workbenchDetails.getByRole('button', { name: '關閉任務詳情' }).click({ force: true });
    await workbenchDetails.waitFor({ state: 'hidden', timeout: 5000 });
    const reopenedWorkbenchCard = workbenchCreated
      ? workbenchPanel.locator(`[data-task-workbench-task-card="true"][data-task-id="${workbenchCreated.id}"]`).first()
      : null;
    let reopenedWorkbenchNoteText = null;
    if (reopenedWorkbenchCard) {
      await reopenedWorkbenchCard.waitFor({ state: 'visible', timeout: 15000 });
      await reopenedWorkbenchCard.click();
      const reopenedWorkbenchDetails = page.locator('[data-task-details-modal="true"]');
      await reopenedWorkbenchDetails.waitFor({ state: 'visible', timeout: 15000 });
      const reopenedWorkbenchNote = reopenedWorkbenchDetails.locator('[data-task-detail-note-content-input="true"]').first();
      await reopenedWorkbenchNote.waitFor({ state: 'visible', timeout: 15000 });
      reopenedWorkbenchNoteText = await reopenedWorkbenchNote.textContent();
      record('B01-workbench-close-reopen-blank-description', (reopenedWorkbenchNoteText || '') === '', {
        noteValue: reopenedWorkbenchNoteText,
      });
      await reopenedWorkbenchDetails.getByRole('button', { name: '關閉任務詳情' }).click({ force: true });
      await reopenedWorkbenchDetails.waitFor({ state: 'hidden', timeout: 5000 });
    } else {
      record('B01-workbench-close-reopen-blank-description', false, { noteValue: null });
    }
    await page.reload({ waitUntil: 'networkidle' });
    const afterWorkbenchReload = await readNodes();
    const reloadedWorkbench = workbenchCreated ? afterWorkbenchReload[workbenchCreated.id] : null;
    record('B01-workbench-reload-rename-preserves-blank-description', Boolean(reloadedWorkbench)
      && reloadedWorkbench.title === 'DEV115 已重新命名'
      && !Object.prototype.hasOwnProperty.call(reloadedWorkbench, 'description'), { reloadedWorkbench });
    const workbenchCard = workbenchPanel.locator(`[data-task-workbench-task-card="true"][data-task-id="${workbenchCreated?.id || ''}"]`).first();
    await workbenchCard.waitFor({ state: 'visible', timeout: 15000 });
    await workbenchCard.hover();
    await page.waitForTimeout(1100);
    const workbenchIndicatorCount = await workbenchCard.locator('[data-task-description-indicator="true"]').count();
    const workbenchHoverCardCount = await page.locator('[data-task-description-hover-card="true"]:visible').count();
    record('B01-workbench-blank-description-hover-negative', workbenchIndicatorCount === 0 && workbenchHoverCardCount === 0, {
      workbenchIndicatorCount,
      workbenchHoverCardCount,
    });

    await switchView('board', '[data-layout-region="board-canvas"]');
    const boardReady = page.locator('[data-layout-region="board-canvas"]');
    await boardReady.waitFor({ state: 'visible', timeout: 15000 });
    const addButton = page.getByRole('button', { name: '新增列表' }).first();
    await addButton.waitFor({ state: 'visible', timeout: 15000 });
    const beforeBoard = await readNodes();
    await addButton.click();
    await page.waitForTimeout(250);
    const afterBoard = await readNodes();
    const boardCreated = Object.values(afterBoard).find(node => !beforeBoard[node.id] && node.title === '新任務');
    record('B02-board-blank-description', Boolean(boardCreated) && !Object.prototype.hasOwnProperty.call(boardCreated, 'description'), { boardCreated });
    await closeDetailsIfOpen();

    const taskSurface = page.locator('[data-task-surface-source="true"][data-task-id="dev115-root"]').first();
    await taskSurface.waitFor({ state: 'visible', timeout: 15000 });
    await taskSurface.click({ button: 'right' });
    const childMenu = page.getByText('新增子任務', { exact: true }).last();
    await childMenu.waitFor({ state: 'visible', timeout: 5000 });
    const beforeContext = await readNodes();
    await childMenu.click();
    await page.waitForTimeout(250);
    const afterContext = await readNodes();
    const contextCreated = Object.values(afterContext).find(node => !beforeContext[node.id] && node.parentId === 'dev115-root' && node.title === '新任務');
    record('B03-context-child-blank-description', Boolean(contextCreated) && !Object.prototype.hasOwnProperty.call(contextCreated, 'description'), { contextCreated });

    await closeDetailsIfOpen();
    await switchView('gantt', '[data-task-hierarchy-surface="gantt"]');
    const ganttAdd = page.getByRole('button', { name: '新增頂層任務' }).first();
    await ganttAdd.waitFor({ state: 'visible', timeout: 15000 });
    const beforeGantt = await readNodes();
    await ganttAdd.click();
    await page.waitForTimeout(250);
    const afterGantt = await readNodes();
    const ganttCreated = Object.values(afterGantt).find(node => !beforeGantt[node.id] && node.parentId === null && node.title === '新任務');
    record('B04-gantt-sidebar-blank-description', Boolean(ganttCreated) && !Object.prototype.hasOwnProperty.call(ganttCreated, 'description'), { ganttCreated });
    await closeDetailsIfOpen();

    await switchView('calendar', '[data-task-hierarchy-surface="calendar"]');
    const calendarAdd = page.getByRole('button', { name: '新增頂層任務' }).first();
    await calendarAdd.waitFor({ state: 'visible', timeout: 15000 });
    const beforeCalendar = await readNodes();
    await calendarAdd.click();
    await page.waitForTimeout(250);
    const afterCalendar = await readNodes();
    const calendarCreated = Object.values(afterCalendar).find(node => !beforeCalendar[node.id] && node.parentId === null && node.title === '新任務');
    record('B05-calendar-sidebar-blank-description', Boolean(calendarCreated) && !Object.prototype.hasOwnProperty.call(calendarCreated, 'description'), { calendarCreated });
    await closeDetailsIfOpen();

    await switchView('mindmap', '[data-mindmap-node="dev115-root"]');
    const mindMapRoot = page.locator('[data-mindmap-node="dev115-root"]').first();
    await mindMapRoot.waitFor({ state: 'visible', timeout: 15000 });
    const beforeMindMap = await readNodes();
    await mindMapRoot.click();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const afterMindMap = await readNodes();
    const mindMapCreated = Object.values(afterMindMap).find(node => !beforeMindMap[node.id] && node.title === '新任務');
    record('B06-mindmap-blank-description', Boolean(mindMapCreated) && !Object.prototype.hasOwnProperty.call(mindMapCreated, 'description'), { mindMapCreated });
    await closeDetailsIfOpen();

    const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
    record('B07-no-visible-errors', visibleErrors.length === 0, { visibleErrors });
    record('B08-no-browser-errors', result.browserErrors.length === 0, { browserErrors: result.browserErrors });
    record('B09-no-unexpected-http-failures', result.httpFailures.length === 0, { httpFailures: result.httpFailures });
  } catch (error) {
    record('B99-runtime', false, { error: String(error) });
  }

  result.status = failures.length === 0 ? 'PASS' : 'FAIL';
  result.failures = failures;
  result.generatedAt = new Date().toISOString();
  await page.evaluate(resultValue => {
    window.__DEV115_ARTIFACT = resultValue;
    sessionStorage.setItem('__DEV115_ARTIFACT', JSON.stringify(resultValue));
  }, result);
  console.log(`DEV115_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length > 0) throw new Error(`DEV-115 browser verification failed: ${failures.join(', ')}`);
  return result;
}
