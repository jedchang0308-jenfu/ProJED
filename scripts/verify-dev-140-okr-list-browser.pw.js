async (page) => {
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin;
  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'dev140@projed.local', displayName: 'DEV-140' };
  const boards = [
    { id: 'dev140-board', title: 'DEV-140 主看板', order: 0 },
    { id: 'dev140-empty', title: 'DEV-140 空看板', order: 1 },
    { id: 'dev140-source', title: 'DEV-140 來源看板', order: 2 },
  ].map(board => ({ ...board, dependencies: [], createdAt: 1704067200000 }));
  const workspace = { id: 'dev140-ws', title: 'DEV-140', ownerId: account.id, members: [account.id], order: 0, boards };
  const createNode = (id, title, options = {}) => ({
    id, title, workspaceId: workspace.id, boardId: boards[0].id, parentId: null,
    nodeType: 'task', status: 'todo', order: 0, ...options,
  });
  const nodes = Object.fromEntries([
    createNode('dev140-parent', 'DEV140 父任務', { nodeType: 'group', description: '父任務目的' }),
    createNode('dev140-child', 'DEV140 子任務', { parentId: 'dev140-parent', description: '子任務目的', status: 'completed', startDate: '2026-11-02', endDate: '2026-11-04' }),
    createNode('dev140-anchor', 'DEV140 排程錨點', { order: 2, startDate: '2026-11-01', endDate: '2026-11-01' }),
    createNode('dev140-linked', 'DEV140 追蹤任務', { boardId: boards[2].id, description: '追蹤來源目的' }),
  ].map(node => [node.id, node]));
  const references = [{
    id: 'dev140-reference', taskId: 'dev140-linked', workspaceId: workspace.id,
    sourceBoardId: boards[2].id, boardId: boards[0].id, parentPlacementId: 'primary:dev140-parent',
    order: 1, revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000,
  }];
  const meeting = {
    id: 'dev140-meeting', type: 'meeting', workspaceId: workspace.id, boardId: boards[0].id,
    title: 'DEV140 會議', status: 'published', visibility: 'project', occurredAt: 1704067200000,
    content: '## 任務討論\n- 09:00 @[DEV140 子任務](task:dev140-child)：本次驗收看板',
    taskLinks: [{ nodeId: 'dev140-child', role: 'decision' }],
    metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [{
      id: 'dev140-meeting-note', taskId: 'dev140-child', text: '本次驗收看板', occurredAt: 1704067200000,
      anchor: { lineIndex: 1, sourceToken: '09:00|dev140-child' },
    }] } },
  };

  const checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const table = page.locator('[data-goal-task-table="true"]');
  const row = id => table.locator(`[data-goal-task-row-id="${id}"]`);
  const closeDetails = () => page.getByRole('button', { name: '關閉任務詳情' }).click();
  const chooseDependencyAction = async label => {
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible' });
    const trigger = menu.locator('[data-task-action-id="task.dependency-start"]');
    if (await trigger.count()) {
      if ((await trigger.innerText()).trim() === '設定依賴關係') {
        await trigger.hover();
        await page.locator('[data-task-action-submenu="dependency"]')
          .getByRole('menuitem', { name: label, exact: true }).click();
      } else {
        await trigger.click();
      }
      return;
    }
    throw new Error(`依賴動作入口缺失：${await menu.innerText()}`);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(({ account, workspace, nodes, references, meeting }) => {
    localStorage.clear();
    sessionStorage.clear();
    const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('projed-local-test.selected-account', account.id);
    set('projed-local-test.session', account);
    set('projed-local-test.workspaces', [workspace]);
    set('projed-local-test.nodes', nodes);
    set('projed-local-test.dependencies', []);
    set('projed-local-test.taskTrackingReferences.v1', references);
    set('projed-local-test.knowledgeRecords', [meeting]);
    set('projed-local-test.seeded.v1', true);
    set('projed-local-test.seeded.size', 12);
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', workspace.boards[0].id);
    localStorage.setItem('projed-last-view', 'list');
  }, { account, workspace, nodes, references, meeting });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixed.isVisible()) await fixed.click();
  await table.waitFor({ timeout: 15000 });
  check(await page.evaluate(() => localStorage.getItem('projed-last-view')) === 'goal', 'A01 舊清單偏好轉成 OKR');
  await page.keyboard.press('Escape');
  await page.locator('[data-mode-switcher-label="view"]').click();
  const menu = page.getByRole('menu', { name: '切換模式' });
  check(await menu.getByRole('menuitemradio', { name: '清單模式' }).count() === 1, 'A01 視角只有一個整合後的清單模式入口');
  check(await menu.getByRole('menuitemradio', { name: /^OKR\s*模式$/ }).count() === 0, 'A01 視角沒有重複的 OKR 模式入口');
  await page.keyboard.press('Escape');

  await row('dev140-reference').waitFor();
  check(await row('dev140-reference').getAttribute('data-goal-level') === '1', 'A02 追蹤副本依放置位置呈現');
  await row('dev140-parent').getByRole('button', { name: '收合 DEV140 父任務', exact: true }).click();
  check(await row('dev140-reference').count() === 0, 'A02 父任務收合時一併收合追蹤副本');
  await row('dev140-parent').getByRole('button', { name: '展開 DEV140 父任務', exact: true }).click();
  await row('dev140-reference').getByText('DEV140 追蹤任務', { exact: true }).click();
  check(await page.getByRole('textbox', { name: '編輯任務名稱' }).inputValue() === 'DEV140 追蹤任務', 'A02 副本開啟正確任務明細');
  await closeDetails();
  const referenceHandle = row('dev140-reference').locator('[data-task-title-slot]');
  const sourceRect = await referenceHandle.boundingBox();
  const anchorRect = await row('dev140-anchor').locator('[data-task-title-slot]').boundingBox();
  const x = sourceRect.x + 24;
  await page.mouse.move(x, sourceRect.y + sourceRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, anchorRect.y + anchorRect.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]')
    .some(reference => reference.id === 'dev140-reference' && reference.parentPlacementId === null));
  check(await row('dev140-reference').getAttribute('data-goal-level') === '0', 'A02 拖曳只移動副本的位置');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes'))['dev140-linked'].boardId) === boards[2].id,
    'A02 原任務仍在來源看板');
  const rootOrder = await table.locator('[data-goal-task-row][data-goal-level="0"]').evaluateAll(rows =>
    rows.map(element => element.getAttribute('data-goal-task-row-id')));
  check(rootOrder.indexOf('dev140-reference') === rootOrder.indexOf('dev140-anchor') + 1, 'A02 副本排序落在拖放錨點後方');
  await page.locator('#filter-menu-trigger').click();
  const filterStatus = page.locator('[data-filter-menu-panel] [data-task-filter-group="status"]');
  await filterStatus.getByRole('button', { name: '待辦', exact: true }).click();
  check(await row('dev140-reference').count() === 0 && await row('dev140-child').count() === 1, 'A02 追蹤列與一般任務套用相同篩選規則');
  await filterStatus.getByRole('button', { name: '待辦', exact: true }).click();
  await page.keyboard.press('Escape');
  const progress = row('dev140-parent').locator('[data-task-progress-indicator]');
  check(/^\d+%$/.test(await progress.getAttribute('title') ?? '') && await progress.innerText() === ''
    && await progress.evaluate(element => getComputedStyle(element).backgroundImage.startsWith('conic-gradient(')), 'A03 調整為小圓餅及懸浮百分比');

  await row('dev140-child').getByText('DEV140 子任務', { exact: true }).click({ button: 'right' });
  await chooseDependencyAction('開始日');
  await page.getByRole('button', { name: '選取DEV140 排程錨點的結束日期' }).click();
  const prompt = page.locator('[data-global-dialog="true"]');
  await prompt.getByRole('textbox').fill('1');
  await prompt.getByRole('button', { name: '確認', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('projed-local-test.dependencies') || '[]')
    .some(dependency => dependency.fromId === 'dev140-anchor' && dependency.toId === 'dev140-child' && dependency.offset === 1));
  check(await row('dev140-child').locator('[data-goal-column="start-date"] input[readonly]').count() === 1, 'A03 成功建立日期依賴並鎖定從屬日期');
  await page.locator('#filter-menu-trigger').click();
  const displayDependencies = page.locator('[data-filter-menu-panel]').getByRole('button', { name: '依賴連線', exact: true });
  if (await displayDependencies.getAttribute('aria-pressed') !== 'true') await displayDependencies.click();
  await page.keyboard.press('Escape');
  const dependencyMark = row('dev140-child').locator('[data-goal-column="start-date"] [data-goal-dependency-role="passive"]');
  const driverMark = row('dev140-anchor').locator('[data-goal-column="end-date"] [data-goal-dependency-role="active"]');
  check((await dependencyMark.innerText()) === (await driverMark.innerText()), 'A03 兩個日期顯示相同依賴標記');
  await row('dev140-anchor').getByText('DEV140 排程錨點', { exact: true }).click({ button: 'right' });
  await chooseDependencyAction('結束日');
  await page.getByRole('button', { name: '選取DEV140 子任務的開始日期' }).click();
  await page.evaluate(() => {
    const originalAlert = window.alert;
    window.alert = message => {
      window.__DEV140_CYCLE_ALERT = message;
      window.alert = originalAlert;
    };
  });
  await prompt.getByRole('button', { name: '確認', exact: true }).click();
  await page.waitForFunction(() => window.__DEV140_CYCLE_ALERT?.includes('循環依賴'));
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.dependencies')).length) === 1, 'A03 拒絕循環依賴');
  await row('dev140-anchor').getByText('DEV140 排程錨點', { exact: true }).click({ button: 'right' });
  await chooseDependencyAction('開始日');
  await page.getByRole('button', { name: '選取DEV140 排程錨點的結束日期' }).click();
  await prompt.getByText('請從任務的結束日開始設定工期。').waitFor();
  await prompt.getByRole('button', { name: '確認', exact: true }).click();
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.dependencies')).length) === 1, 'A03 拒絕反向自我依賴');

  const descriptionHeader = table.locator('[data-goal-column-header="description"]');
  await descriptionHeader.getByRole('button').click();
  check(await table.getAttribute('data-goal-description-column-state') === 'collapsed', 'A04 可收合目的欄');
  await descriptionHeader.getByRole('button').click();
  const childPurpose = row('dev140-child').locator('[data-goal-description-owner="true"]');
  await childPurpose.press('F2');
  await childPurpose.locator('[contenteditable="true"]').fill('DEV140 修改後子任務目的');
  await table.locator('#goal-column-task').click();
  await childPurpose.getByText('DEV140 修改後子任務目的', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await row('dev140-child').getByText('DEV140 修改後子任務目的', { exact: true }).waitFor();
  await table.getByText('本次驗收看板', { exact: true }).waitFor();
  check(await row('dev140-parent').getByText('父任務目的', { exact: true }).count() === 1,
    'A04 重新載入讀回新目的，父任務目的與原會議紀錄維持正確');

  if (await page.locator('[data-board-switcher]').getAttribute('aria-expanded') !== 'true') {
    await page.locator('[data-board-switcher]').click();
  }
  await page.getByRole('button', { name: 'DEV-140 空看板', exact: true }).click();
  await page.getByText('目前沒有任務', { exact: true }).waitFor();
  await page.getByRole('button', { name: '新增根任務' }).click();
  const titleInput = page.getByRole('textbox', { name: '編輯任務名稱' });
  await titleInput.fill('DEV140 第一筆根任務');
  await closeDetails();
  await page.reload({ waitUntil: 'networkidle' });
  await table.getByText('DEV140 第一筆根任務', { exact: true }).waitFor();
  check(await page.evaluate(() => localStorage.getItem('projed-last-view')) === 'goal', 'A01/A03 切板與重載維持 OKR，空看板首筆任務保留');
  await page.evaluate(() => localStorage.setItem('projed-last-view', 'list'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor();
  check(await table.count() === 0 && await page.evaluate(() => localStorage.getItem('projed-last-view')) === 'board', 'A01 手機限制下開啟舊偏好回到看板');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(({ account, workspace }) => {
    const viewer = { ...account, id: 'local-test-viewer', uid: 'local-test-viewer', displayName: 'DEV140 Viewer' };
    const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('projed-local-test.selected-account', viewer.id);
    set('projed-local-test.session', viewer);
    set('projed-local-test.workspaces', [{ ...workspace, members: [...workspace.members, viewer.id] }]);
    set('projed-local-test.boardMembers', Object.fromEntries(workspace.boards.map(board => [
      `${workspace.id}:${board.id}`, [{ userId: viewer.id, role: 'viewer' }],
    ])));
    localStorage.setItem('projed-last-board', workspace.boards[0].id);
    localStorage.setItem('projed-last-view', 'goal');
  }, { account, workspace });
  await page.reload({ waitUntil: 'networkidle' });
  const viewerRow = row('dev140-child');
  await viewerRow.waitFor();
  check(await page.getByRole('button', { name: '新增根任務' }).count() === 0, 'A03 唯讀身分沒有新增入口');
  check(await viewerRow.getByRole('combobox', { name: '修改「DEV140 子任務」狀態' }).isDisabled(), 'A03 唯讀身分不能修改狀態');
  await viewerRow.getByText('DEV140 子任務', { exact: true }).click({ button: 'right' });
  await page.locator('[data-global-context-menu="true"]').waitFor();
  check(await page.locator('[data-global-context-menu="true"]')
    .getByRole('menuitem', { name: '設定依賴關係', exact: true }).count() === 0, 'A03 唯讀身分沒有設定依賴的操作');
  const result = { task: 'DEV-140', environment: 'local-test', viewport: [1440, 390], checks };
  await page.evaluate(result => {
    window.__DEV140_ARTIFACT = result;
    sessionStorage.setItem('__DEV140_ARTIFACT', JSON.stringify(result));
  }, result);
  return result;
}
