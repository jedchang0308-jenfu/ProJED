/* eslint-disable */
async (page) => {
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const expectVisible = async (selector, label) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 8000 });
    console.log(`PASS ${label}`);
    return locator;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
    localStorage.setItem('projed-task-zone-source-panel', JSON.stringify({
      open: true,
      pinned: true,
      tab: 'my_tasks',
      scope: 'all',
      placementFilter: 'all',
      scopeCollapsed: false,
      customWorkspaceIds: [],
      customBoardIds: [],
      selectedAssigneeIds: [],
    }));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });

  const taskZoneEntry = page.locator('[data-sidebar-task-zone="true"]').first();
  if (await taskZoneEntry.isVisible().catch(() => false)) {
    await taskZoneEntry.click();
    await expectVisible('[data-task-zone-view="true"]', 'task workbench page opens');
    await expectVisible('text=任務工作台', 'task workbench user-facing name is visible');
    await expectVisible('text=在看板查看任務排序', 'full-page task sorting CTA copy is visible');
  } else {
    console.log('SKIP full-page workbench smoke: sidebar task-zone entry is not visible.');
  }

  const boardRow = page.locator('[data-sidebar-board-row="true"]').first();
  if (await boardRow.isVisible().catch(() => false)) {
    await boardRow.click();
  } else {
    const boardMode = page.locator('[data-mode-switcher-value="board"]').first();
    if (await boardMode.isVisible().catch(() => false)) {
      await boardMode.click();
    }
  }

  await expectVisible('[data-task-zone-source-panel="true"]', 'board-integrated task workbench panel is visible');
  await expectVisible('[data-task-zone-source-tab="my_tasks"][data-task-zone-source-tab-active="true"]', 'task sorting tab opens');
  await expectVisible('text=任務排序', 'task sorting tab label is visible');
  await expectVisible('text=開發中', 'task workbench development badge is visible');
  await expectVisible('[data-task-zone-scope-panel="summary"]', 'workbench filter summary is visible');
  const filterButton = await expectVisible('[data-task-zone-filter-dialog-open="true"]', 'workbench filter dialog button is visible');
  await filterButton.click();
  await expectVisible('[data-task-zone-filter-dialog="true"]', 'workbench filter dialog opens');
  await expectVisible('[data-task-zone-placement-filter="all"]', 'all placement filter exists');
  await expectVisible('[data-task-zone-placement-filter="unplaced"]', 'unplaced placement filter exists');
  await expectVisible('[data-task-zone-placement-filter="placed"]', 'placed placement filter exists');
  await expectVisible(`[data-task-zone-assignee-filter="__unassigned__"]`, 'unassigned assignee filter exists');

  await page.locator('[data-task-zone-placement-filter="unplaced"]').first().click();
  await expectVisible('[data-task-zone-placement-filter="unplaced"][data-task-zone-placement-filter-active="true"]', 'unplaced placement filter activates');

  await page.locator('[data-task-zone-placement-filter="placed"]').first().click();
  await expectVisible('[data-task-zone-placement-filter="placed"][data-task-zone-placement-filter-active="true"]', 'placed placement filter activates');

  await page.locator('button:has-text("套用並關閉")').first().click();

  const anySortedItem = await page.locator('[data-task-zone-sort-item="unplaced"], [data-task-zone-sort-item="placed"]').first().isVisible().catch(() => false);
  if (anySortedItem) {
    console.log('PASS task sorting shows at least one placement-labelled item');
  } else {
    await expectVisible('text=目前篩選範圍內沒有待處理任務', 'task sorting empty state is visible');
  }

  console.log('PASS DEV-042 browser smoke completed without placed-to-unplaced operation');
}
