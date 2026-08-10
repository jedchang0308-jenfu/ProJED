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
    'dev039-hidden-child-a': {
      id: 'dev039-hidden-child-a',
      workspaceId: workspace.id,
      boardId: 'dev039-board-a',
      parentId: 'dev039-child-a',
      title: '已完成且被篩選隱藏的下層任務',
      status: 'completed',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-08',
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
      nodeType: 'task',
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

    step = 'board-hidden-children-toggle';
    const filteredParentCard = page.locator('.kanban-task-card[data-task-id="dev039-child-a"]');
    await filteredParentCard.waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await filteredParentCard.locator('[data-kanban-checklist-toggle="true"]').count() === 0,
      'card should not show a checklist toggle when all direct children are hidden by the active filter',
    );

    step = 'status-filter-refresh';
    assert(
      await page.locator('[data-task-filter-update-button="true"]').count() === 0,
      'filter refresh action should stay hidden without pending status changes',
    );
    const filterControlGroup = page.locator('[data-task-filter-control-group="true"]');
    assert(
      await filterControlGroup.locator(':scope > button').count() === 1,
      'filter control group should contain only the filter trigger before a refresh is pending',
    );
    await filteredParentCard.click();
    const taskDetailsModal = page.locator('[data-task-details-modal="true"]');
    await taskDetailsModal.waitFor({ state: 'visible', timeout: 10000 });
    await taskDetailsModal.locator('[data-task-details-meta-field="status"] select').selectOption('onhold');
    await page.keyboard.press('Escape');
    await taskDetailsModal.waitFor({ state: 'detached', timeout: 10000 });
    assert(
      await page.locator('[data-task-filter-update-button="true"]').count() === 0,
      'changing between two statuses included by the current filter should not show refresh',
    );
    assert(
      await filteredParentCard.isVisible(),
      'a membership-neutral status change should keep the task visible without a pending refresh',
    );

    await filteredParentCard.click();
    await taskDetailsModal.waitFor({ state: 'visible', timeout: 10000 });
    await taskDetailsModal.locator('[data-task-details-meta-field="status"] select').selectOption('completed');
    await page.keyboard.press('Escape');
    await taskDetailsModal.waitFor({ state: 'detached', timeout: 10000 });

    const pendingRefreshButton = page.locator('[data-task-filter-update-button="true"]');
    await pendingRefreshButton.waitFor({ state: 'visible', timeout: 10000 });
    assert(await filteredParentCard.isVisible(), 'status-changed card should remain visible until filter results are refreshed');
    assert(
      await pendingRefreshButton.locator('[data-task-filter-update-count="true"]').innerText() === '1',
      'direct status change should count once even when an ancestor status rolls up',
    );
    assert(
      (await pendingRefreshButton.getAttribute('aria-label')) === '更新篩選結果（1）',
      'refresh action should expose the full accessible label and count',
    );
    assert(
      await filterControlGroup.locator(':scope > button').count() === 2 &&
        await pendingRefreshButton.evaluate(element => element.parentElement?.getAttribute('data-task-filter-control-group') === 'true'),
      'filter and refresh actions should share one compound control region',
    );

    await filteredParentCard.click();
    await taskDetailsModal.waitFor({ state: 'visible', timeout: 10000 });
    await taskDetailsModal.locator('[data-task-details-meta-field="status"] select').selectOption('onhold');
    await page.keyboard.press('Escape');
    await taskDetailsModal.waitFor({ state: 'detached', timeout: 10000 });
    await pendingRefreshButton.waitFor({ state: 'detached', timeout: 10000 });
    assert(
      await filteredParentCard.isVisible(),
      'returning to the existing filter membership should cancel the pending refresh without losing the card',
    );

    await filteredParentCard.click();
    await taskDetailsModal.waitFor({ state: 'visible', timeout: 10000 });
    await taskDetailsModal.locator('[data-task-details-meta-field="status"] select').selectOption('completed');
    await page.keyboard.press('Escape');
    await taskDetailsModal.waitFor({ state: 'detached', timeout: 10000 });
    await pendingRefreshButton.waitFor({ state: 'visible', timeout: 10000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    assert(
      !(await pendingRefreshButton.getByText('更新', { exact: true }).isVisible()),
      'mobile refresh action should hide the full text label',
    );
    assert(
      await pendingRefreshButton.locator('svg').isVisible(),
      'mobile refresh action should retain a compact update icon',
    );
    const mobileOverflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    assert(
      mobileOverflow.bodyScrollWidth <= mobileOverflow.viewportWidth + 1 &&
        mobileOverflow.documentScrollWidth <= mobileOverflow.viewportWidth + 1,
      'mobile refresh action should not create horizontal overflow',
      mobileOverflow,
    );
    await page.screenshot({ path: 'output/playwright/dev-039-status-filter-refresh-mobile.png', fullPage: false });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    const [groupBounds, filterBounds, refreshBounds, undoBounds] = await Promise.all([
      filterControlGroup.boundingBox(),
      page.locator('#filter-menu-trigger').boundingBox(),
      pendingRefreshButton.boundingBox(),
      page.locator('#btn-undo').boundingBox(),
    ]);
    const compoundControlStyles = await page.evaluate(() => {
      const group = document.querySelector('[data-task-filter-control-group="true"]');
      const filter = document.querySelector('#filter-menu-trigger');
      const refresh = document.querySelector('[data-task-filter-update-button="true"]');
      if (!group || !filter || !refresh) return null;
      const groupStyle = getComputedStyle(group);
      const filterStyle = getComputedStyle(filter);
      const refreshStyle = getComputedStyle(refresh);
      return {
        groupBorderTopWidth: groupStyle.borderTopWidth,
        groupBorderRadius: groupStyle.borderTopLeftRadius,
        filterBorderTopWidth: filterStyle.borderTopWidth,
        refreshBorderTopWidth: refreshStyle.borderTopWidth,
        refreshDividerWidth: refreshStyle.borderLeftWidth,
      };
    });
    assert(
      groupBounds && filterBounds && refreshBounds && undoBounds &&
        Math.abs(filterBounds.x + filterBounds.width - refreshBounds.x) <= 1 &&
        groupBounds.x <= filterBounds.x &&
        groupBounds.x + groupBounds.width >= refreshBounds.x + refreshBounds.width &&
        refreshBounds.x + refreshBounds.width <= undoBounds.x + 2,
      'desktop filter and refresh actions should be contiguous inside one group before undo controls',
      { groupBounds, filterBounds, refreshBounds, undoBounds },
    );
    assert(
      compoundControlStyles?.groupBorderTopWidth !== '0px' &&
        compoundControlStyles?.groupBorderRadius !== '0px' &&
        compoundControlStyles?.filterBorderTopWidth === '0px' &&
        compoundControlStyles?.refreshBorderTopWidth === '0px' &&
        compoundControlStyles?.refreshDividerWidth !== '0px',
      'compound control should use one outer border and one internal divider',
      { compoundControlStyles },
    );
    await page.screenshot({ path: 'output/playwright/dev-039-status-filter-refresh-desktop.png', fullPage: false });

    await pendingRefreshButton.click();
    await filteredParentCard.waitFor({ state: 'detached', timeout: 10000 });
    assert(
      await page.locator('[data-task-filter-update-button="true"]').count() === 0,
      'refresh action should hide after applying the latest task statuses',
    );

    await seed();
    await openApp();

    step = 'mindmap-filter-entry';
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 10000 });
    const filterCount = await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count');
    assert(filterCount === '1', 'mindmap filter trigger should use shared active count and default to hiding completed tasks', { filterCount });

    step = 'display-settings-not-active-filter';
    await page.locator('#filter-menu-trigger').click();
    const panel = page.locator('[data-filter-menu-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('[data-task-display-settings="true"]').getByText('標籤', { exact: true }).click();
    await page.keyboard.press('Escape');
    const countAfterDisplayToggle = await page.locator('#filter-menu-trigger').getAttribute('data-active-task-filter-count');
    assert(countAfterDisplayToggle === '1', 'display settings should not increment active task filter count beyond the default completed filter', { countAfterDisplayToggle });

    step = 'task-workbench-board-filter';
    await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
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
    await unclassifiedSection.locator('[data-task-workbench-unclassified-modal-add="true"]').click();
    const createdTaskModal = page.locator('[data-task-details-modal="true"]');
    await createdTaskModal.waitFor({ state: 'visible', timeout: 10000 });
    const createdTaskTitleInput = createdTaskModal.locator('[data-task-details-title-input="true"]');
    await createdTaskTitleInput.fill('臨時拜訪客戶');
    await createdTaskModal.locator('[data-task-details-save="true"]').click();
    await createdTaskModal.locator('button[title="關閉"]').click();
    await createdTaskModal.waitFor({ state: 'detached', timeout: 10000 });
    assert(
      await unclassifiedSection.locator('[data-task-workbench-unclassified-item="true"]').count() === 2,
      'modal-created unclassified task should append to the workbench inbox section',
    );
    assert(await unclassifiedSection.getByText('臨時拜訪客戶').count() === 1, 'modal-created unclassified task should be visible immediately');

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

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const reloadedWorkbenchPanel = page.locator('[data-task-workbench-panel="true"]');
    if (await reloadedWorkbenchPanel.locator('[data-task-workbench-filter-panel="true"]').count() === 0) {
      await reloadedWorkbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').click();
    }
    const reloadedFilterPanel = reloadedWorkbenchPanel.locator('[data-task-workbench-filter-panel="true"]');
    await reloadedFilterPanel.waitFor({ state: 'visible', timeout: 10000 });
    assert(await reloadedFilterPanel.locator('[data-task-workbench-board-select="true"]').inputValue() === 'dev039-board-b', 'workbench selected board should persist after reload');
    assert(await reloadedWorkbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 0, 'board B todo filter should persist after reload');
    assert(await reloadedWorkbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').getAttribute('data-active-task-workbench-filter-count') === '2', 'workbench active filter count should persist after reload');
    await reloadedFilterPanel.getByRole('button', { name: /重設/ }).click();
    assert(await reloadedWorkbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-root-b"]').count() === 1, 'reset should restore board B filter without save/profile controls');
    const reloadedUnclassifiedSection = page.locator('[data-task-workbench-unclassified-section="true"]');
    assert(await reloadedUnclassifiedSection.getByText('臨時拜訪客戶').count() === 1, 'new unclassified item should remain after reload');

    step = 'mobile-viewport';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="collapsed"]').waitFor({ state: 'detached', timeout: 10000 });
    const mobileBoardHasCard = await page.evaluate(() => {
      const task = document.querySelector('.kanban-task-card[data-task-id]');
      const rect = task?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(mobileBoardHasCard, 'mobile board should remain reachable while task workbench is closed');
    await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
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
