/* eslint-disable */
async (page) => {
  const diagnostics = [];
  const networkFailures = [];
  const evidence = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/favicon/i.test(response.url())) {
      networkFailures.push(`${response.status()}:${response.url()}`);
    }
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const sorted = values => [...new Set(values.filter(Boolean))].sort();
  const expectIds = (actual, expected, message) => {
    assert(JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected)), message, { actual: sorted(actual), expected: sorted(expected) });
  };

  const accountA = {
    id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
    displayName: '本機測試擁有者', createdAt: 1704067200000,
  };
  const accountB = {
    id: 'local-test-admin', uid: 'local-test-admin', email: 'admin@projed.local',
    displayName: '本機測試管理員', createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev090-workspace', title: 'DEV-090 篩選驗證工作區', ownerId: accountA.id,
    members: [accountA.id, accountB.id], order: 1, createdAt: 1704067200000,
    boards: [
      { id: 'dev090-board-a', title: 'DEV-090 看板 A', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev090-board-b', title: 'DEV-090 看板 B', dependencies: [], order: 2, createdAt: 1704067200000 },
      { id: 'dev090-board-empty', title: 'DEV-090 真空看板', dependencies: [], order: 3, createdAt: 1704067200000 },
    ],
  };
  const baseNode = (id, boardId, parentId, title, status, order, extra = {}) => ({
    id, workspaceId: workspace.id, boardId, parentId, title, status,
    nodeType: parentId ? 'task' : 'group', order,
    createdAt: 1704067200000, updatedAt: 1704067200000, ...extra,
  });
  const nodes = {
    'dev090-root': baseNode('dev090-root', 'dev090-board-a', null, '研發工作', 'todo', 0),
    'dev090-parent': baseNode('dev090-parent', 'dev090-board-a', 'dev090-root', '機構設計', 'todo', 0),
    'dev090-target': baseNode('dev090-target', 'dev090-board-a', 'dev090-parent', '朱宇鴻編輯項目', 'in_progress', 0, {
      assigneeId: 'local-test-analyst', tagIds: ['dev090-tag'],
    }),
    'dev090-completed': baseNode('dev090-completed', 'dev090-board-a', 'dev090-root', '已完成任務', 'completed', 1, {
      startDate: '2026-08-20', endDate: '2026-08-28',
    }),
    'dev090-onhold': baseNode('dev090-onhold', 'dev090-board-a', 'dev090-root', '暫緩任務', 'onhold', 2),
    'dev090-delayed': baseNode('dev090-delayed', 'dev090-board-a', 'dev090-root', '延遲舊狀態任務', 'delayed', 3),
    'dev090-unsure': baseNode('dev090-unsure', 'dev090-board-a', 'dev090-root', '未確認舊狀態任務', 'unsure', 4),
    'dev090-b-root': baseNode('dev090-b-root', 'dev090-board-b', null, '第二看板列表', 'todo', 0),
    'dev090-b-task': baseNode('dev090-b-task', 'dev090-board-b', 'dev090-b-root', '第二看板完成任務', 'completed', 0),
  };

  const boardAAll = ['dev090-root', 'dev090-parent', 'dev090-target', 'dev090-completed', 'dev090-onhold', 'dev090-delayed', 'dev090-unsure'];
  const contextPath = ['dev090-root', 'dev090-parent', 'dev090-target'];

  const seed = async () => page.evaluate(({ accountA, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', accountA.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(accountA));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([
      { id: 'dev090-tag', workspaceId: workspace.id, name: '研發焦點', color: 'blue', order: 0 },
    ]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev090-board-a');
    localStorage.setItem('projed-last-view', 'board');

    localStorage.setItem('projed-task-filters:v2:account:local-test-user', JSON.stringify({
      version: 3,
      filters: {
        statusFilters: { todo: true, in_progress: true, delayed: true, completed: false, unsure: true, onhold: true },
        dueWithinDays: null, overdueOnly: false,
        selectedAssigneeIds: ['local-test-analyst'], selectedTagIds: ['dev090-tag'], keyword: 'legacy',
      },
      displaySettings: { showDependencies: false, showStartDate: true, showTags: false, showTagNames: true },
    }));
    localStorage.setItem('projed-task-workbench-filters:v2:account:local-test-user', JSON.stringify({
      selectedBoardId: 'dev090-board-b',
      filtersByBoardId: {
        'dev090-board-a': {
          statusFilters: { todo: false, in_progress: true, delayed: true, completed: false, unsure: true, onhold: true },
          dueWithinDays: 7, overdueOnly: false, selectedAssigneeIds: [], selectedTagIds: [], keyword: 'legacy',
        },
      },
    }));
  }, { accountA, workspace, nodes });

  const activeCount = () => page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count');
  const openFilter = async () => {
    const trigger = page.locator('#filter-menu-trigger');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    if (await page.locator('[data-filter-menu-panel]').count() === 0) await trigger.click();
    const panel = page.locator('[data-filter-menu-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    return panel;
  };
  const closeFilter = async () => {
    if (await page.locator('[data-filter-menu-panel]').count()) {
      await page.keyboard.press('Escape');
      await page.locator('[data-filter-menu-panel]').waitFor({ state: 'detached', timeout: 10000 });
    }
  };
  const switchMode = async mode => {
    await closeFilter();
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    const waits = {
      board: '[data-mobile-pan-surface="board"]',
      list: '[data-task-hierarchy-surface="list"]',
      mindmap: '[data-mindmap-view]',
      gantt: '[data-mobile-pan-surface="gantt"]',
      calendar: '[data-task-hierarchy-surface="calendar"]',
    };
    await page.locator(waits[mode]).first().waitFor({ state: 'visible', timeout: 15000 });
  };
  const readModeIds = async mode => {
    const selectors = {
      board: '[data-kanban-column-header="true"][data-task-id], .kanban-task-card[data-task-id], .kanban-checklist-item[data-task-id]',
      list: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="list"][data-task-id]',
      mindmap: '[data-mindmap-node]',
      gantt: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="gantt"][data-task-id]',
      calendar: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="calendar"][data-task-id]',
    };
    return sorted(await page.locator(selectors[mode]).evaluateAll((elements, modeName) => elements
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(element => modeName === 'mindmap' ? element.getAttribute('data-mindmap-node') : element.getAttribute('data-task-id')),
    mode));
  };
  const selectBoard = async title => {
    let row = page.locator('[data-sidebar-board-row="true"]').filter({ hasText: title });
    if (await row.count() === 0 || !(await row.first().isVisible())) {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      row = page.locator('[data-sidebar-board-row="true"]').filter({ hasText: title });
    }
    await row.first().waitFor({ state: 'visible', timeout: 10000 });
    await row.first().click();
    await page.waitForTimeout(120);
  };
  const setAccount = async account => {
    await page.evaluate(accountValue => {
      localStorage.setItem('projed-local-test.selected-account', accountValue.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(accountValue));
      localStorage.setItem('projed-last-board', 'dev090-board-a');
      localStorage.setItem('projed-last-view', 'board');
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 15000 });
  };

  let step = 'seed';
  try {
    await seed();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'networkidle' });
    await page.locator('[data-kanban-column-header="true"][data-task-id="dev090-root"]').waitFor({ state: 'visible', timeout: 15000 });

    step = 'B01-B06-default-and-migration';
    assert(await activeCount() === '0', 'legacy account must migrate to default-all active count 0', { count: await activeCount() });
    expectIds(await readModeIds('board'), boardAAll, 'default board must show all manual and legacy-normalized statuses');
    const defaultPanel = await openFilter();
    for (const label of ['待辦', '進行中', '暫緩', '完成']) {
      assert(await defaultPanel.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed') === 'true', `${label} must default on`);
    }
    assert(
      await defaultPanel.locator('[data-task-display-settings="true"]').getByRole('button', { name: '標籤', exact: true }).getAttribute('aria-pressed') === 'false',
      'legacy display setting must survive migration',
    );
    const migrationSnapshot = await page.evaluate(() => ({
      legacyBoard: localStorage.getItem('projed-task-filters:v2:account:local-test-user'),
      workbenchV4: JSON.parse(localStorage.getItem('projed-task-workbench-filters:v4:account:local-test-user') || 'null'),
    }));
    assert(migrationSnapshot.legacyBoard === null, 'legacy board preference must be removed after verified display migration', migrationSnapshot);
    assert(migrationSnapshot.workbenchV4?.selectedBoardId === 'dev090-board-b', 'workbench selected board must survive v4 migration', migrationSnapshot);
    assert(JSON.stringify(migrationSnapshot.workbenchV4?.filtersByBoardId) === '{}', 'workbench legacy filters must reset', migrationSnapshot);
    await closeFilter();
    await page.screenshot({ path: 'output/playwright/dev-090/default-all-desktop.png', fullPage: false });

    step = 'B02-B08-five-mode-context-parity';
    const filterPanel = await openFilter();
    const analystButton = filterPanel.getByRole('button', { name: '本機測試分析員', exact: true });
    await analystButton.waitFor({ state: 'visible', timeout: 10000 });
    await analystButton.click();
    await closeFilter();
    assert(await activeCount() === '1', 'assignee selection must increment active count once', { count: await activeCount() });

    const modeIds = {};
    for (const mode of ['board', 'list', 'mindmap', 'gantt', 'calendar']) {
      await switchMode(mode);
      modeIds[mode] = await readModeIds(mode);
      expectIds(modeIds[mode], contextPath, `${mode} must preserve the same matched descendant context path`);
      if (mode === 'gantt') {
        assert(await page.locator('[data-task-date-empty-hint="gantt"]').isVisible(), 'Gantt must distinguish matched no-date tasks from empty results');
        assert(await page.locator('[data-gantt-task-bar="true"]').count() === 0, 'Gantt no-date fixture must have no bars');
      }
      if (mode === 'calendar') {
        assert(await page.locator('[data-task-date-empty-hint="calendar"]').isVisible(), 'Calendar must distinguish matched no-date tasks from empty results');
        assert(await page.locator('[data-calendar-task-segment="true"]').count() === 0, 'Calendar no-date fixture must have no segments');
      }
      const screenshotPath = `output/playwright/dev-090/parity-${mode}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      evidence.push({ case: 'five-mode-parity', mode, ids: modeIds[mode], screenshotPath });
    }

    step = 'B04-board-isolation';
    await selectBoard('DEV-090 看板 B');
    await switchMode('board');
    assert(await activeCount() === '0', 'new board must not inherit board A filter', { count: await activeCount() });
    expectIds(await readModeIds('board'), ['dev090-b-root', 'dev090-b-task'], 'board B default must show its completed task');
    await selectBoard('DEV-090 看板 A');
    await page.locator('[data-kanban-column-header="true"][data-task-id="dev090-root"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await activeCount() === '1', 'returning to board A must restore exact board A preference', { count: await activeCount() });
    expectIds(await readModeIds('board'), contextPath, 'board A exact cache must restore context path');

    step = 'B05-account-isolation';
    await setAccount(accountB);
    assert(await activeCount() === '0', 'account B must not inherit account A preference', { count: await activeCount() });
    expectIds(await readModeIds('board'), boardAAll, 'account B default must show all board A tasks');
    const accountBPanel = await openFilter();
    await accountBPanel.getByRole('button', { name: '完成', exact: true }).click();
    await closeFilter();
    assert(await activeCount() === '1', 'account B may create an independent filter');
    await setAccount(accountA);
    assert(await activeCount() === '1', 'account A preference must survive account B changes');
    expectIds(await readModeIds('board'), contextPath, 'account A exact preference must remain isolated');

    step = 'B10-true-empty';
    await selectBoard('DEV-090 真空看板');
    const trueEmpty = page.locator('[data-task-filter-result-state="true-empty"]');
    assert(await trueEmpty.count() === 0, 'true empty should not render a redundant empty-state container');
    assert(await page.locator('[data-task-filter-result-state="filtered-zero"]').count() === 0, 'true empty must not render filtered-zero');
    assert(await page.locator('[data-kanban-add-column-button="true"]').count() === 1, 'true empty should keep the add-list entry');
    const boardCanvas = page.locator('[data-layout-region="board-canvas"]');
    const boardCanvasBox = await boardCanvas.boundingBox();
    const boardCanvasPaddingLeft = await boardCanvas.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft) || 0);
    const addListBox = await page.locator('[data-kanban-add-column-button="true"]').boundingBox();
    assert(boardCanvasBox && addListBox && addListBox.x <= boardCanvasBox.x + boardCanvasPaddingLeft + 1, 'true empty add-list entry should align to the left content edge of the board canvas', { boardCanvasBox, boardCanvasPaddingLeft, addListBox });
    await page.screenshot({ path: 'output/playwright/dev-090/true-empty.png', fullPage: false });

    step = 'B09-filtered-zero-reset';
    await selectBoard('DEV-090 看板 A');
    await page.locator('[data-kanban-column-header="true"][data-task-id="dev090-root"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await activeCount() === '1', 'board A assignee filter must restore before filtered-zero case');
    const zeroPanel = await openFilter();
    await zeroPanel.getByRole('button', { name: '到期日', exact: true }).click();
    await closeFilter();
    const filteredZero = page.locator('[data-task-filter-result-state="filtered-zero"]');
    await filteredZero.waitFor({ state: 'visible', timeout: 10000 });
    assert(await filteredZero.locator('[data-task-filter-empty-reset="true"]').count() === 1, 'filtered zero must expose one reset CTA');
    assert(await page.locator('[data-kanban-add-column-button="true"]').count() === 0, 'filtered zero must not offer a competing add-list CTA');
    await page.screenshot({ path: 'output/playwright/dev-090/filtered-zero.png', fullPage: false });
    await filteredZero.locator('[data-task-filter-empty-reset="true"]').click();
    await page.locator('[data-kanban-column-header="true"][data-task-id="dev090-root"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await activeCount() === '0', 'reset must return to default active count 0');
    expectIds(await readModeIds('board'), boardAAll, 'reset must restore all tasks');
    const resetStorage = await page.evaluate(() => localStorage.getItem('projed-task-filters:v4:account:local-test-user:board:dev090-board-a'));
    assert(resetStorage === null, 'local-only reset must delete the exact account-board cache', { resetStorage });

    step = 'S05-visible-loading-error-and-preference-warning';
    await page.evaluate(async () => {
      const module = await import('/src/store/useWbsStore.ts');
      module.useWbsStore.setState({ loading: true, error: null });
    });
    await page.locator('[data-task-filter-result-state="loading"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-kanban-column-header="true"]').count() === 0, 'loading state must not render stale result columns');
    await page.evaluate(async () => {
      const module = await import('/src/store/useWbsStore.ts');
      module.useWbsStore.setState({ loading: false, error: 'DEV-090 injected task load failure' });
    });
    await page.locator('[data-task-filter-result-state="error"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.getByText('任務載入失敗', { exact: true }).isVisible(), 'task load failure must be visible');
    await page.evaluate(async () => {
      const module = await import('/src/store/useWbsStore.ts');
      module.useWbsStore.setState({ loading: false, error: null });
      const filterModule = await import('/src/store/useTaskFilterStore.ts');
      filterModule.useTaskFilterStore.setState({ syncStatus: 'sync-error', warning: '篩選偏好未同步，已保留在此裝置' });
    });
    const syncWarning = page.locator('[data-task-filter-sync-warning="true"]');
    await syncWarning.waitFor({ state: 'visible', timeout: 10000 });
    assert((await syncWarning.getAttribute('aria-label'))?.includes('已保留在此裝置'), 'preference failure must expose a non-blocking warning');
    expectIds(await readModeIds('board'), boardAAll, 'preference warning must not blank task data');
    await syncWarning.click();
    await syncWarning.waitFor({ state: 'detached', timeout: 10000 });

    step = 'B15-mobile-board-filter';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobilePanel = await openFilter();
    await mobilePanel.getByRole('button', { name: '本機測試分析員', exact: true }).click();
    await closeFilter();
    expectIds(await readModeIds('board'), contextPath, 'mobile Board must apply the same account-board filter');
    await page.evaluate(async () => {
      const filterModule = await import('/src/store/useTaskFilterStore.ts');
      filterModule.useTaskFilterStore.setState({ syncStatus: 'sync-error', warning: '篩選偏好未同步，已保留在此裝置' });
    });
    await page.locator('[data-task-filter-sync-warning="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert(overflow.body <= overflow.viewport + 1 && overflow.document <= overflow.viewport + 1, 'mobile filter and warning must not create document overflow', overflow);
    await page.screenshot({ path: 'output/playwright/dev-090/mobile-board-filter-warning.png', fullPage: false });
    evidence.push({ case: 'mobile', viewport: '390x844', ids: await readModeIds('board'), overflow, screenshotPath: 'output/playwright/dev-090/mobile-board-filter-warning.png' });

    step = 'B16-visible-error-sweep';
    assert(diagnostics.length === 0, 'browser flow must have no console/page errors', { diagnostics });
    assert(networkFailures.length === 0, 'browser flow must have no 4xx/5xx responses', { networkFailures });

    const artifact = {
      verifier: 'DEV-090 default-all account-board cross-mode browser',
      result: 'PASS',
      source: 'local-test normal sidebar/mode/filter entry plus explicit failure-state injection',
      accountScopes: [accountA.id, accountB.id],
      boards: ['dev090-board-a', 'dev090-board-b', 'dev090-board-empty'],
      modeIds,
      evidence,
      diagnostics,
      networkFailures,
    };
    await page.evaluate(value => { window.__DEV090_ARTIFACT = value; }, artifact);
  } catch (error) {
    await page.screenshot({ path: `output/playwright/dev-090/failure-${step}.png`, fullPage: false });
    throw new Error(`${step}: ${error.message}`);
  }
}
