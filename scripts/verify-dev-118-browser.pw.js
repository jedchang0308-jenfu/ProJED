/* eslint-disable */
async (page) => {
  const sourceBinding = await page.evaluate(() => window.__DEV118_SOURCE_BINDING ?? null);
  const diagnostics = [];
  const completedCases = [];
  const screenshots = [];
  const observations = {};
  let step = 'initialize';
  page.on('console', message => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const pass = name => completedCases.push(name);
  const artifactBinding = sourceBinding ?? {
    status: 'unavailable',
    reason: 'window.__DEV118_SOURCE_BINDING was missing before first navigation',
  };
  const publishArtifact = async artifact => {
    await page.evaluate(value => { window.__DEV118_V6_ARTIFACT = value; }, artifact).catch(() => undefined);
  };
  const shot = async name => {
    const path = `output/playwright/dev-118/v6/${name}.png`;
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    screenshots.push(path);
  };
  const assertNoOverflow = async label => {
    const sizes = await page.evaluate(() => ({
      body: [document.body.scrollWidth, document.body.clientWidth],
      root: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    }));
    assert(sizes.body[0] <= sizes.body[1] + 1 && sizes.root[0] <= sizes.root[1] + 1, `${label} has horizontal overflow`, sizes);
  };

  const account = {
    id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
    displayName: 'ProJED 測試使用者', createdAt: 1704067200000,
  };
  const boardA = 'dev118-v6-board-a';
  const boardB = 'dev118-v6-board-b';
  const workspace = {
    id: 'dev118-v6-workspace', title: 'DEV-118 V6 QA 工作區', ownerId: account.id,
    members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [
      { id: boardA, title: 'DEV-118 看板 A', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: boardB, title: 'DEV-118 看板 B', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };
  const baseNode = (id, boardId, parentId, title, status, order, extras = {}) => ({
    id, workspaceId: workspace.id, boardId, parentId, title, status,
    nodeType: parentId ? 'task' : 'group', order,
    createdAt: 1704067200000, updatedAt: 1704067200000, ...extras,
  });
  const nodes = {
    'dev118-root': baseNode('dev118-root', boardA, null, '階層根節點', 'todo', 0),
    'dev118-context': baseNode('dev118-context', boardA, 'dev118-root', '階層脈絡卡片', 'todo', 0),
    'dev118-match': baseNode('dev118-match', boardA, 'dev118-context', '精準命中 任務', 'in_progress', 0, {
      assigneeId: account.id, assigneeIds: [account.id], collaboratorIds: [],
      tagIds: ['dev118-tag-a'], endDate: '2026-10-19',
    }),
    'dev118-sibling': baseNode('dev118-sibling', boardA, 'dev118-root', '不符合 sibling', 'todo', 1, {
      tagIds: [], endDate: null,
    }),
    'dev118-plus8': baseNode('dev118-plus8', boardA, 'dev118-root', 'N8 邊界任務', 'todo', 2, {
      tagIds: [], endDate: '2026-10-27',
    }),
    'dev118-plus9': baseNode('dev118-plus9', boardA, 'dev118-root', 'N9 邊界任務', 'todo', 3, {
      tagIds: [], endDate: '2026-10-28',
    }),
    'dev118-board-b-task': baseNode('dev118-board-b-task', boardB, null, '看板 B 任務', 'completed', 0, {
      nodeType: 'task', assigneeId: 'local-test-member', assigneeIds: ['local-test-member'], collaboratorIds: [], tagIds: [], endDate: '2027-10-20',
    }),
  };
  const boardCacheKey = boardId => `projed-task-filters:v6:account:${encodeURIComponent(account.id)}:board:${encodeURIComponent(boardId)}`;
  const boardV5Key = boardId => `projed-task-filters:v5:account:${encodeURIComponent(account.id)}:board:${encodeURIComponent(boardId)}`;

  const seedBase = async () => {
    await page.evaluate(({ account, workspace, nodes, boardA, boardB }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
        [`${workspace.id}:${boardA}`]: [
          { userId: account.id, role: 'owner', createdAt: 1704067200000, updatedAt: 1704067200000 },
        ],
        [`${workspace.id}:${boardB}`]: [
          { userId: 'local-test-member', role: 'member', createdAt: 1704067200000, updatedAt: 1704067200000 },
        ],
      }));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([
        { id: 'dev118-tag-a', workspaceId: workspace.id, name: 'QA標籤', color: 'blue', order: 0 },
      ]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: true, filtersOpen: false }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', boardA);
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes, boardA, boardB });
  };
  const openBoard = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 15000 });
  };
  const boardPanel = () => page.locator('[data-filter-menu-panel]');
  const openBoardFilters = async () => {
    const trigger = page.locator('#filter-menu-trigger');
    if (await boardPanel().count() === 0) await trigger.click();
    await boardPanel().waitFor({ state: 'visible', timeout: 5000 });
    return boardPanel();
  };
  const group = (panel, name) => panel.locator(`[data-task-filter-group="${name}"]`);
  const allBox = (panel, name) => group(panel, name).locator('[data-task-filter-all="true"]');
  const clearBoardFilters = async panel => {
    const reset = panel.locator('[data-task-filter-reset="true"]');
    if (await reset.count()) await reset.click();
  };
  const switchBoard = async title => {
    await page.locator('[data-main-sidebar-toggle="true"]').click();
    const row = page.locator('[data-sidebar-board-row="true"]', { hasText: title });
    await row.waitFor({ state: 'visible', timeout: 5000 });
    await row.click();
    await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 10000 });
  };
  const selectMode = async (value, label) => {
    const trigger = page.locator('[data-mode-switcher-trigger="true"]');
    await trigger.click();
    await page.locator(`[data-mode-switcher-value="${value}"]`).click();
    await page.waitForFunction(expected => document.querySelector('[data-mode-switcher-trigger="true"]')?.getAttribute('aria-label') === expected, label);
  };

  try {
    step = 'seed and normal board entry';
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await seedBase();
    await openBoard();
    let panel = await openBoardFilters();
    assert(await panel.locator('[data-task-filter-variant="matrix-v6"]').count() === 1, 'Board must use matrix-v6 controls');
    for (const name of ['status', 'due', 'people', 'tags']) {
      assert(await allBox(panel, name).getAttribute('aria-pressed') === 'true', `${name} must default to dynamic all`);
    }
    assert(await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count') === '0', 'default must have zero active groups');
    observations.defaultModes = { status: 'all', due: 'all', people: 'all', tags: 'all', withinDays: 8, activeCount: 0 };
    pass('U01 normal Board entry and explicit dynamic-all defaults');

    step = 'keyboard all-state stability and focus recovery';
    const statusAll = allBox(panel, 'status');
    const todoStatus = group(panel, 'status').getByRole('button', { name: '待辦', exact: true });
    await statusAll.focus();
    await page.keyboard.press('Tab');
    assert(await todoStatus.evaluate(element => document.activeElement === element), 'Tab must move from status All to the first status');
    await page.keyboard.press('Shift+Tab');
    assert(await statusAll.evaluate(element => document.activeElement === element), 'Shift+Tab must return focus to status All');
    await page.keyboard.press('Enter');
    assert(await statusAll.getAttribute('aria-pressed') === 'true', 'Enter on status All must keep unrestricted all');
    await page.keyboard.press('Space');
    assert(await statusAll.getAttribute('aria-pressed') === 'true', 'Space on status All must keep unrestricted all');
    await todoStatus.click();
    assert(await statusAll.getAttribute('aria-pressed') === 'false', 'turning off one option must leave All off');
    await shot('board-partial-panel');
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 3000 });
    assert(await page.locator('#filter-menu-trigger').evaluate(element => document.activeElement === element), 'Escape must restore filter trigger focus');
    panel = await openBoardFilters();
    await allBox(panel, 'status').click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'true', 'All action must restore unrestricted status');
    await shot('board-recovered');
    pass('U02 Tab/ShiftTab/Enter/Space, Escape focus return and All recovery');

    step = 'tri-state transitions, display preservation and UI date boundaries';
    const displayStart = panel.getByRole('button', { name: '開始日期' });
    await displayStart.click();
    const displayAfterToggle = await displayStart.getAttribute('aria-pressed');
    await todoStatus.click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'false', 'turning off one status must leave a selected subset');
    for (const label of ['進行中', '暫緩']) {
      await group(panel, 'status').getByRole('button', { name: label, exact: true }).click();
    }
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'false', 'partial status selection must keep All off');
    await group(panel, 'status').getByRole('button', { name: '完成', exact: true }).click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'true', 'selecting the final missing status must restore dynamic all');
    await todoStatus.click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'false', 'turning off one option from All must create a subset');
    await shot('board-mixed');
    await allBox(panel, 'status').click();
    await group(panel, 'due').locator('[data-task-filter-date-bucket="unset"]').click();
    await group(panel, 'due').locator('[data-task-filter-date-bucket="before_today"]').click();
    assert(await allBox(panel, 'due').getAttribute('aria-pressed') === 'true', 'cancelling the last visible date bucket must restore unrestricted all');
    const days = panel.getByRole('spinbutton', { name: '日期分類天數 N' });
    await days.fill('0');
    assert(await days.getAttribute('aria-invalid') === 'false', 'N=0 must be accepted');
    await days.fill('8');
    observations.dateUiBoundaries = { visibleBuckets: ['unset', 'before_today'], hiddenBuckets: ['within_days', 'after_days'], N0: 0, N8: 8 };
    for (const invalid of ['', '-1', '1.5', '366']) {
      await days.fill(invalid);
      assert(await days.getAttribute('aria-invalid') === 'true', `N=${invalid || 'blank'} must be rejected`);
      assert(await panel.getByRole('alert').getByText('請輸入 0～365 的整數').count() === 1, `N=${invalid || 'blank'} must explain range`);
      await days.blur();
      assert(await days.inputValue() === '8', `N=${invalid || 'blank'} blur must restore last valid N=8`);
      assert(await page.locator('.kanban-task-card[data-task-id="dev118-plus8"]:visible').count() === 1, 'invalid N must preserve the last valid N=8 result');
    }
    await clearBoardFilters(panel);
    panel = await openBoardFilters();
    assert(await displayStart.getAttribute('aria-pressed') === displayAfterToggle, 'clear filters must not change display settings');
    pass('U03 All/individual transitions, compact date controls and clear/display separation');

    step = 'saved selected-full remains a snapshot when a new tag arrives';
    await page.evaluate(({ key, accountId }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 6,
        filters: {
          version: 6,
          statuses: { mode: 'all', values: [] },
          due: { mode: 'all', buckets: [], withinDays: 8 },
          people: { mode: 'selected', ids: [accountId], includeUnassigned: true },
          tags: { mode: 'selected', ids: ['dev118-tag-a'], includeUntagged: true },
          keyword: '',
        },
        updatedAt: 1704067200000,
      }));
    }, { key: boardCacheKey(boardA), accountId: account.id });
    await page.reload({ waitUntil: 'networkidle' });
    panel = await openBoardFilters();
    assert(await allBox(panel, 'people').getAttribute('aria-pressed') === 'false', 'restored full people snapshot must stay selected');
    assert(await allBox(panel, 'tags').getAttribute('aria-pressed') === 'false', 'restored full tag snapshot must stay selected');
    assert(await panel.getByText('指定選項；新增項目不自動加入', { exact: true }).count() === 2, 'people and tags selected-full must explain snapshot semantics');
    page.once('dialog', dialog => dialog.accept('新增QA標籤'));
    await group(panel, 'tags').getByRole('button', { name: '新增標籤', exact: true }).click();
    const newTag = group(panel, 'tags').getByRole('button', { name: '新增QA標籤', exact: true });
    await newTag.waitFor({ state: 'visible', timeout: 5000 });
    assert(await newTag.getAttribute('aria-pressed') === 'false', 'new tag must not join a restored selected snapshot');
    assert(await allBox(panel, 'tags').getAttribute('aria-pressed') === 'false', 'new tag arrival must not promote selected snapshot to all');
    await allBox(panel, 'tags').click();
    assert(await allBox(panel, 'tags').getAttribute('aria-pressed') === 'true', 'explicit All must promote the tag group to dynamic all');
    assert(await newTag.getAttribute('aria-pressed') === 'true', 'dynamic All must include the new tag');
    await page.keyboard.press('Escape');
    const liveWorkbench = page.locator('[data-task-workbench-panel="true"]');
    if (!(await liveWorkbench.isVisible().catch(() => false))) await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
    await liveWorkbench.locator('[data-task-workbench-filter-toggle="true"]').click();
    const liveWorkbenchFilters = liveWorkbench.locator('[data-task-workbench-filter-panel="true"]');
    const freshWorkbenchTag = group(liveWorkbenchFilters, 'tags').getByRole('button', { name: '新增QA標籤', exact: true });
    await freshWorkbenchTag.waitFor({ state: 'visible', timeout: 5000 });
    assert(await freshWorkbenchTag.isEnabled(), 'Workbench must refresh same-scope tag choices without a reload');
    assert(await freshWorkbenchTag.getAttribute('aria-pressed') === 'true', 'Workbench dynamic All must include the new same-scope tag');
    await liveWorkbench.locator('[data-task-workbench-filter-toggle="true"]').click();
    panel = await openBoardFilters();
    await clearBoardFilters(panel);
    panel = await openBoardFilters();
    pass('U03b saved selected-full stays selected and new options require explicit All');

    step = 'five-group UI query and hierarchy context';
    for (const label of ['待辦', '暫緩', '完成']) await group(panel, 'status').getByRole('button', { name: label, exact: true }).click();
    await group(panel, 'people').getByRole('button', { name: '無負責人／協作者', exact: true }).click();
    await group(panel, 'tags').getByRole('button', { name: '無標籤', exact: true }).click();
    await group(panel, 'due').locator('[data-task-filter-date-bucket="unset"]').click();
    await group(panel, 'due').locator('[data-task-filter-date-bucket="before_today"]').click();
    const boardKeyword = panel.getByPlaceholder('搜尋任務名稱');
    await boardKeyword.click();
    await boardKeyword.pressSequentially('精準命中 任務');
    assert(await boardKeyword.inputValue() === '精準命中 任務', 'sequential typing must preserve the keyword space');
    assert(await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count') === '5', 'status/due/people/tags/keyword must count as five active groups');
    await page.keyboard.press('Escape');
    await page.locator('.kanban-checklist-item[data-task-id="dev118-match"]').waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.locator('[data-kanban-column-header="true"][data-task-id="dev118-root"]').count() === 1, 'matching descendant must retain root context');
    assert(await page.locator('.kanban-task-card[data-task-id="dev118-context"]').count() === 1, 'matching descendant must retain parent context');
    assert(await page.locator('.kanban-task-card[data-task-id="dev118-sibling"]').count() === 0, 'nonmatching sibling must remain hidden');
    observations.hierarchy = {
      matched: ['dev118-match'],
      visibleContext: ['dev118-root', 'dev118-context'],
      hiddenNonmatch: ['dev118-sibling'],
    };
    pass('U04 normal UI query actions use AND across groups and retain hierarchy context');

    step = 'five board modes preserve one query and matched result';
    const workbenchBeforeModes = page.locator('[data-task-workbench-panel="true"]');
    const workbenchToggleBeforeModes = page.locator('[data-mobile-task-workbench-nav-entry="true"]');
    if (await workbenchBeforeModes.isVisible().catch(() => false)) await workbenchToggleBeforeModes.click();
    const modeEvidence = [];
    for (const mode of [
      ['board', '看板模式'],
      ['list', '清單模式'],
      ['mindmap', '心智圖模式'],
      ['gantt', '甘特圖模式'],
      ['calendar', '日曆模式'],
    ]) {
      await selectMode(mode[0], mode[1]);
      await page.locator(`[data-task-id="dev118-match"]:visible`).first().waitFor({ state: 'visible', timeout: 10000 });
      assert(await page.locator(`[data-task-id="dev118-sibling"]:visible`).count() === 0, `${mode[0]} must hide the nonmatching sibling`);
      assert(await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count') === '5', `${mode[0]} must retain the same five-group query`);
      modeEvidence.push({ mode: mode[0], matchedId: 'dev118-match', activeCount: 5 });
    }
    observations.boardModeParity = modeEvidence;
    await selectMode('board', '看板模式');
    pass('U04b Board/List/MindMap/Gantt/Calendar keep one V6 matched result');

    step = 'reload and Board Workbench state isolation';
    await page.reload({ waitUntil: 'networkidle' });
    panel = await openBoardFilters();
    assert(await panel.getByPlaceholder('搜尋任務名稱').inputValue() === '精準命中 任務', 'Board query must survive reload');
    observations.boardSelectedCache = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), boardCacheKey(boardA));
    await page.keyboard.press('Escape');
    const workbench = page.locator('[data-task-workbench-panel="true"]');
    if (!(await workbench.isVisible().catch(() => false))) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
    }
    await workbench.waitFor({ state: 'visible', timeout: 10000 });
    await workbench.locator('[data-task-workbench-filter-toggle="true"]').click();
    const workbenchPanel = workbench.locator('[data-task-workbench-filter-panel="true"]');
    await workbenchPanel.waitFor({ state: 'visible', timeout: 5000 });
    assert(await workbenchPanel.locator('[data-task-filter-variant="matrix-v6"]').count() === 1, 'Workbench must use matrix-v6 controls');
    const workbenchBoardSelect = workbenchPanel.locator('[data-task-workbench-board-select="true"]');
    await workbenchBoardSelect.selectOption(boardB);
    const boardBMember = group(workbenchPanel, 'people').getByRole('button', { name: '本機測試成員', exact: true });
    await boardBMember.waitFor({ state: 'visible', timeout: 5000 });
    assert(await boardBMember.isEnabled(), 'non-active Board B member option must become enabled only after selected-scope sources are ready');
    assert(await group(workbenchPanel, 'people').getByRole('button', { name: 'ProJED 測試使用者', exact: true }).count() === 0, 'Board B options must not reuse active Board A members');
    assert(await page.evaluate(() => localStorage.getItem('projed-last-board')) === boardA, 'selecting Workbench Board B must not change active Board A');
    await workbenchBoardSelect.selectOption(boardA);
    const boardAOwner = group(workbenchPanel, 'people').getByRole('button', { name: 'ProJED 測試使用者', exact: true });
    await boardAOwner.waitFor({ state: 'visible', timeout: 5000 });
    assert(await boardAOwner.isEnabled(), 'Workbench Board A options must reload from Board A scope');
    assert(await group(workbenchPanel, 'people').getByRole('button', { name: '本機測試成員', exact: true }).count() === 0, 'Board A options must not retain Board B members');
    observations.workbenchSelectedScope = { activeBoardId: boardA, selectedBoardIds: [boardB, boardA], boardBMember: 'local-test-member', boardAOwner: account.id };
    assert(await workbenchPanel.getByPlaceholder('搜尋任務名稱').inputValue() === '', 'Workbench query must be independent from Board query');
    for (const label of ['待辦', '暫緩', '完成']) await group(workbenchPanel, 'status').getByRole('button', { name: label, exact: true }).click();
    await group(workbenchPanel, 'due').locator('[data-task-filter-date-bucket="unset"]').click();
    await group(workbenchPanel, 'due').locator('[data-task-filter-date-bucket="before_today"]').click();
    await group(workbenchPanel, 'people').getByRole('button', { name: '無負責人／協作者', exact: true }).click();
    await group(workbenchPanel, 'tags').getByRole('button', { name: '無標籤', exact: true }).click();
    await workbenchPanel.getByPlaceholder('搜尋任務名稱').pressSequentially('精準命中 任務');
    const workbenchVisibleIds = await workbench.locator('[data-task-workbench-placed-task-card="true"]')
      .evaluateAll(cards => cards.map(card => card.getAttribute('data-task-id')).filter(Boolean));
    const workbenchMatchedIds = workbenchVisibleIds.filter(id => nodes[id]?.boardId === boardA);
    assert(JSON.stringify(workbenchMatchedIds) === JSON.stringify(['dev118-match']), 'Workbench must match the same V6 identity without context-only parents', { workbenchMatchedIds });
    assert(workbenchVisibleIds.includes('dev118-board-b-task'), 'Board A filter edits must preserve Board B independent results');
    observations.workbenchSelectedPrefs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), `projed-task-workbench-filters:v6:account:${encodeURIComponent(account.id)}`);
    observations.workbenchMatchedIds = workbenchMatchedIds;
    await workbench.locator('[data-task-workbench-filter-toggle="true"]').click();
    panel = await openBoardFilters();
    assert(await panel.getByPlaceholder('搜尋任務名稱').inputValue() === '精準命中 任務', 'Workbench edits must not mutate Board query');
    await page.keyboard.press('Escape');
    pass('U05 reload persistence and Board versus Workbench state separation');

    step = 'board scope isolation';
    await switchBoard('DEV-118 看板 B');
    panel = await openBoardFilters();
    assert(await panel.getByPlaceholder('搜尋任務名稱').inputValue() === '', 'Board B must not inherit Board A query');
    assert(await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count') === '0', 'Board B must start at default');
    await page.keyboard.press('Escape');
    await switchBoard('DEV-118 看板 A');
    panel = await openBoardFilters();
    assert(await panel.getByPlaceholder('搜尋任務名稱').inputValue() === '精準命中 任務', 'Board A query must restore after normal board switch');
    await clearBoardFilters(panel);
    pass('U06 board scope isolation through normal board switching');
    observations.scopeKeys = {
      accountId: account.id,
      boardA,
      boardB,
      boardCacheA: boardCacheKey(boardA),
      boardCacheB: boardCacheKey(boardB),
      workbench: `projed-task-workbench-filters:v6:account:${encodeURIComponent(account.id)}`,
    };

    step = 'same-route desktop and mobile default and recovered screenshots';
    await shot('board-desktop-default');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    panel = await openBoardFilters();
    await assertNoOverflow('Board 390x844');
    await shot('board-mobile-default');
    const mobileStatus = group(panel, 'status');
    await mobileStatus.getByRole('button', { name: '待辦', exact: true }).click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'false', 'mobile individual exclusion must turn All off');
    await shot('board-mobile-mixed');
    await allBox(panel, 'status').click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'true', 'mobile All action must recover to all');
    await allBox(panel, 'status').click();
    assert(await allBox(panel, 'status').getAttribute('aria-pressed') === 'true', 'clicking All while already unrestricted must keep all');
    await shot('board-mobile-recovered');
    await page.keyboard.press('Escape');
    pass('U07 same-route mobile default/partial/recovered screenshots and overflow');

    step = 'V5 legacy date summary and explicit conversion';
    await page.evaluate(({ boardCacheKey, boardV5Key }) => {
      localStorage.removeItem(boardCacheKey);
      localStorage.setItem(boardV5Key, JSON.stringify({
        version: 5,
        filters: {
          statuses: [],
          due: { includeOverdue: true, upcomingWithinDays: 8 },
          people: { ids: [], includeUnassigned: false },
          tagIds: [],
          keyword: '',
        },
        updatedAt: 1,
      }));
    }, { boardCacheKey: boardCacheKey(boardA), boardV5Key: boardV5Key(boardA) });
    await page.reload({ waitUntil: 'networkidle' });
    panel = await openBoardFilters();
    const legacyDate = panel.locator('[data-task-filter-legacy-date="true"]');
    await legacyDate.waitFor({ state: 'visible', timeout: 5000 });
    assert((await legacyDate.innerText()).includes('沿用舊日期條件'), 'V5 active date must remain visibly legacy');
    assert(await panel.locator('[data-task-filter-date-bucket]').count() === 0, 'legacy date must not silently show new buckets');
    await legacyDate.locator('[data-task-filter-convert-legacy-date="true"]').click();
    assert(await legacyDate.count() === 0, 'explicit conversion must leave legacy mode');
    assert(await panel.locator('[data-task-filter-date-bucket]').count() === 4, 'conversion must expose four V6 buckets');
    pass('U08 old V5 date identity and explicit UI conversion');

    step = 'unknown and invalid current cache lock';
    for (const corruption of [
      { name: 'future-v7', envelope: { version: 7, filters: { future: true }, updatedAt: 9 } },
      { name: 'invalid-v6', envelope: { version: 6, filters: { version: 6, malformed: true }, updatedAt: 10 } },
    ]) {
      const before = await page.evaluate(({ currentKey, legacyKey, envelope }) => {
        const currentRaw = JSON.stringify(envelope);
        const legacyRaw = JSON.stringify({
          version: 5,
          filters: { statuses: [], due: { includeOverdue: false, upcomingWithinDays: null }, people: { ids: [], includeUnassigned: false }, tagIds: [], keyword: 'must-not-restore' },
          updatedAt: 1,
        });
        localStorage.setItem(currentKey, currentRaw);
        localStorage.setItem(legacyKey, legacyRaw);
        return { currentRaw, legacyRaw };
      }, { currentKey: boardCacheKey(boardA), legacyKey: boardV5Key(boardA), envelope: corruption.envelope });
      await page.reload({ waitUntil: 'networkidle' });
      panel = await openBoardFilters();
      assert(await panel.locator('button:disabled, input:disabled').count() > 0, `${corruption.name} must disable scoped controls`);
      assert(await allBox(panel, 'status').isDisabled(), `${corruption.name} All must be disabled`);
      const syncError = page.locator('[data-task-filter-sync-error="true"]');
      assert(await syncError.count() === 1, `${corruption.name} must expose preference error`);
      assert(await page.locator('[data-task-filter-empty-reset="true"]').count() === 0, `${corruption.name} must not masquerade as filtered-zero`);
      const after = await page.evaluate(({ currentKey, legacyKey }) => ({
        currentRaw: localStorage.getItem(currentKey), legacyRaw: localStorage.getItem(legacyKey),
      }), { currentKey: boardCacheKey(boardA), legacyKey: boardV5Key(boardA) });
      assert(JSON.stringify(after) === JSON.stringify(before), `${corruption.name} must preserve current and old raw bytes`, { before, after });
      await page.keyboard.press('Escape');
    }
    pass('U09 unknown/invalid current cache locks scope and never restores old cache');

    step = 'Calendar normal entry and V5 semantics';
    await page.evaluate(({ currentKey, legacyKey }) => {
      localStorage.removeItem(currentKey);
      localStorage.removeItem(legacyKey);
    }, { currentKey: boardCacheKey(boardA), legacyKey: boardV5Key(boardA) });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-app-more-menu="true"] summary').click();
    await page.locator('[data-app-more-settings="true"]').click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-section-tab="calendar"]').click();
    const builder = page.locator('[data-calendar-subscription-builder="true"]').first();
    await builder.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-calendar-subscription-builder="true"][data-calendar-subscription-preview-source-state="ready"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const initialPreview = Number(await builder.getAttribute('data-calendar-subscription-builder-preview-count'));
    assert(initialPreview > 0, 'Calendar fixture must expose preview results');
    await builder.locator('[data-calendar-subscription-filter-toggle="true"]').click();
    const calendarPanel = builder.locator('[data-calendar-subscription-filter-panel="true"]');
    await calendarPanel.waitFor({ state: 'visible', timeout: 5000 });
    const calendarControls = calendarPanel.locator('[data-task-filter-variant="calendar-v5"]');
    assert(await calendarControls.count() === 1, 'Calendar must keep calendar-v5 controls');
    assert(await calendarControls.locator('[data-task-filter-all]').count() === 0, 'Calendar must not expose V6 All tri-state');
    assert(await calendarControls.locator('[data-task-filter-date-bucket]').count() === 0, 'Calendar must not expose V6 date buckets');
    assert(await calendarControls.locator('[data-overdue-filter="true"]').count() === 1, 'Calendar must keep legacy overdue control');
    const todo = calendarControls.getByRole('button', { name: '待辦', exact: true });
    await todo.click();
    await todo.click();
    await page.waitForTimeout(150);
    const restoredPreview = Number(await builder.getAttribute('data-calendar-subscription-builder-preview-count'));
    assert(restoredPreview === initialPreview, 'Calendar V5 empty status must retain legacy All semantics', { initialPreview, restoredPreview });
    observations.calendar = { variant: 'calendar-v5', initialPreview, restoredPreview };
    await shot('calendar-v5-normal-entry');
    pass('C01 Calendar normal app-shell entry, V5 controls and empty-means-All semantics');

    const severeDiagnostics = diagnostics.filter(item => /pageerror|console:error/i.test(item));
    assert(severeDiagnostics.length === 0, 'browser diagnostics must have no errors', { severeDiagnostics });
    const pageState = await page.evaluate(() => ({
      route: location.href,
      viewport: { width: innerWidth, height: innerHeight },
    }));
    const artifact = {
      passed: true,
      sourceBinding: artifactBinding,
      sourceBindingAvailable: Boolean(sourceBinding),
      fixture: { schemaVersion: 6, taskCount: Object.keys(nodes).length, today: '2026-10-19', timezone: 'Asia/Taipei' },
      pageState,
      observations,
      completedCases,
      screenshots,
      diagnostics: diagnostics.slice(-30),
    };
    await publishArtifact(artifact);
    return artifact;
  } catch (error) {
    const artifact = {
      passed: false,
      step,
      error: error instanceof Error ? error.message : String(error),
      sourceBinding: artifactBinding,
      sourceBindingAvailable: Boolean(sourceBinding),
      completedCases,
      screenshots,
      diagnostics: diagnostics.slice(-30),
    };
    await publishArtifact(artifact);
    throw new Error(`${step}: ${artifact.error}; artifact=${JSON.stringify(artifact)}`);
  }
}
