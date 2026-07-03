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
    id: 'dev039-workspace',
    title: 'DEV-039 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev039-board-a', title: 'JED 專案', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev039-board-b', title: '鉦富任務', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev039-root-a': {
      id: 'dev039-root-a',
      workspaceId: workspace.id,
      boardId: 'dev039-board-a',
      parentId: null,
      title: 'JED 專案根任務',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      endDate: '2026-07-07',
      tagIds: ['dev039-tag-focus'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-child-a': {
      id: 'dev039-child-a',
      workspaceId: workspace.id,
      boardId: 'dev039-board-a',
      parentId: 'dev039-root-a',
      title: '國泰發現 - 外勞帳戶',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-08',
      assigneeId: account.id,
      tagIds: ['dev039-tag-focus'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-root-b': {
      id: 'dev039-root-b',
      workspaceId: workspace.id,
      boardId: 'dev039-board-b',
      parentId: null,
      title: '鉦富跨板任務',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      endDate: '2026-07-20',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const seed = async () => {
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([
        { id: 'dev039-tag-focus', workspaceId: workspace.id, name: '焦點', color: 'blue', order: 0 },
      ]));
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([
        {
          id: 'dev039-inbox-seeded',
          title: '尚未歸類的採購提醒',
          note: '尚未歸類的採購提醒',
          itemType: 'todo',
          captureStatus: 'untriaged',
          syncStatus: 'pending',
          createdBy: account.id,
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
          completedAt: null,
          archivedAt: null,
          suggestedDueDate: null,
          confirmedDueDate: null,
          promotedTaskNodeId: null,
        },
      ]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev039-board-a');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes });
  };

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      await page.screenshot({ path: `output/playwright/dev-039-open-timeout-${Date.now()}.png`, fullPage: true });
      throw new Error(`app did not open: ${JSON.stringify({ diagnostics: diagnostics.slice(-20) })}`);
    }
  };

  let step = 'seed';
  try {
    await seed();
    await openApp();

    step = 'mindmap-filter-entry';
    await page.getByText('心智圖', { exact: true }).click();
    await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 10000 });
    const filterCount = await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count');
    assert(filterCount === '0', 'mindmap filter trigger should use shared active count and start at zero', { filterCount });

    step = 'display-settings-not-active-filter';
    await page.locator('#filter-menu-trigger').click();
    const panel = page.locator('[data-filter-menu-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('[data-task-display-settings="true"]').getByText('標籤', { exact: true }).click();
    await page.keyboard.press('Escape');
    const countAfterDisplayToggle = await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count');
    assert(countAfterDisplayToggle === '0', 'display settings should not increment active task filter count', { countAfterDisplayToggle });

    step = 'task-workbench-board-filter';
    await page.locator('[data-sidebar-task-workbench-button="true"]').first().click();
    const workbenchPanel = page.locator('[data-task-workbench-panel="true"]');
    await workbenchPanel.waitFor({ state: 'visible', timeout: 10000 });
    assert(await workbenchPanel.locator('[data-task-workbench-source-summary="true"]').count() === 0, 'workbench should not render the removed source summary');
    assert(await workbenchPanel.locator('[data-task-workbench-selected-board="true"]').count() === 0, 'workbench should not render the removed selected-board path summary');
    assert(await workbenchPanel.locator('[data-task-workbench-filter-summary="true"]').count() === 0, 'workbench should not render the removed inline filter summary');
    assert(await workbenchPanel.locator('[data-task-workbench-unplaced-lane="true"]').count() === 1, 'workbench should expose unplaced placement lane');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-board-lane="true"]').count() === 1, 'workbench should expose placed board placement lane');
    assert(await workbenchPanel.locator('[data-task-workbench-filter-panel="true"]').count() === 0, 'placement lanes should not be rendered inside the filter panel before opening filters');
    assert(await workbenchPanel.locator('[data-task-workbench-board-select="true"]').count() === 0, 'board selector should live inside the filter overlay, not the main workbench surface');
    const workbenchText = await workbenchPanel.innerText();
    const profileCheckText = workbenchText.replace(/全域任務平台/g, '');
    assert(!/設定檔|複製到|儲存|另存|看板專屬|全域/.test(profileCheckText), 'workbench should not expose profile management copy/save controls', { workbenchText });
    assert(
      !/資料來源：目前已載入任務集合|清單跨看板顯示|設定：|同任務功能|拖到所選看板|全部看板|Phase 1|真正全部可見任務/.test(workbenchText),
      'workbench should not show crossed-out explanatory information',
      { workbenchText },
    );
    assert(await workbenchPanel.locator('[data-task-workbench-profile-select]').count() === 0, 'workbench should not render legacy profile select');

    const unclassifiedSection = workbenchPanel.locator('[data-task-workbench-unclassified-section="true"]');
    await unclassifiedSection.waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await unclassifiedSection.locator('[data-task-workbench-unclassified-item="true"]').count() === 1,
      'workbench should show seeded unclassified inbox item outside board filters',
    );
    assert(await unclassifiedSection.getByText('尚未歸類的採購提醒').count() === 1, 'seeded unclassified item should be visible');
    await unclassifiedSection.locator('[data-task-workbench-unclassified-input="true"]').fill('臨時拜訪客戶');
    await unclassifiedSection.locator('[data-task-workbench-unclassified-add="true"]').click();
    assert(
      await unclassifiedSection.locator('[data-task-workbench-unclassified-item="true"]').count() === 2,
      'adding unclassified item should append to the workbench inbox section',
    );
    assert(await unclassifiedSection.getByText('臨時拜訪客戶').count() === 1, 'new unclassified item should be visible immediately');

    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-child-a"]').count() === 1, 'cross-board task list should show board A task');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 1, 'cross-board task list should also show board B task');

    await workbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').click();
    const workbenchFilterPopover = workbenchPanel.locator('[data-task-workbench-filter-popover="true"]');
    await workbenchFilterPopover.waitFor({ state: 'visible', timeout: 10000 });
    const workbenchFilterPanel = workbenchPanel.locator('[data-task-workbench-filter-panel="true"]');
    await workbenchFilterPanel.waitFor({ state: 'visible', timeout: 10000 });
    assert(await workbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').getAttribute('aria-expanded') === 'true', 'workbench filter should open as one overlay button');
    const boardSelect = workbenchFilterPanel.locator('[data-task-workbench-board-select="true"]');
    await boardSelect.waitFor({ state: 'visible', timeout: 10000 });
    assert(await boardSelect.inputValue() === 'dev039-board-a', 'workbench should default to active board when opened');

    await boardSelect.selectOption('dev039-board-b');
    await page.waitForFunction(() => document.querySelector('[data-task-workbench-board-select="true"]')?.value === 'dev039-board-b');
    assert(await boardSelect.inputValue() === 'dev039-board-b', 'board select should switch the filter-editing context without showing an extra path summary');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 1, 'board B task should remain visible in the cross-board list');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-child-a"]').count() === 1, 'board A task should remain visible after selecting board B filter settings');

    await workbenchFilterPanel.getByRole('button', { name: /待辦/ }).click();
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 0, 'board B filter should hide board B todo task when todo is disabled');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-child-a"]').count() === 1, 'board B filter changes should not hide board A task from the cross-board list');
    assert(
      await unclassifiedSection.locator('[data-task-workbench-unclassified-item="true"]').count() === 2,
      'unclassified inbox section should not be affected by board task filters',
    );
    await workbenchFilterPanel.getByRole('button', { name: /重設/ }).click();
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 1, 'reset should restore board B filter without save/profile controls');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const reloadedUnclassifiedSection = page.locator('[data-task-workbench-unclassified-section="true"]');
    assert(await reloadedUnclassifiedSection.getByText('臨時拜訪客戶').count() === 1, 'new unclassified item should remain after reload');

    step = 'mobile-viewport';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="collapsed"]').waitFor({ state: 'visible', timeout: 10000 });
    const mobileBoardHasCard = await page.evaluate(() => {
      const task = document.querySelector('.kanban-task-card[data-task-id]');
      const rect = task?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(mobileBoardHasCard, 'mobile board should remain reachable while task workbench is collapsed');
    await page.locator('[data-task-workbench-panel="collapsed"] button[title="開啟全域任務平台"]').click();
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-039-task-workbench-mobile.png', fullPage: true });
    const bodyText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(bodyText), 'mobile viewport should not show visible runtime errors');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!overflow, 'mobile workbench should not have document-level horizontal overflow');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
