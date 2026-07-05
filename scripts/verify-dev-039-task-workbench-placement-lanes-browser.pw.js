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
    id: 'dev039-placement-workspace',
    title: 'DEV-039 Placement 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev039-placement-board-a', title: 'JED 專案', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev039-placement-board-b', title: '鉦富任務', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev039-placement-root-a': {
      id: 'dev039-placement-root-a',
      workspaceId: workspace.id,
      boardId: 'dev039-placement-board-a',
      parentId: null,
      title: 'JED 專案根任務',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      endDate: '2026-07-07',
      tagIds: ['dev039-placement-tag-focus'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-placement-card-a': {
      id: 'dev039-placement-card-a',
      workspaceId: workspace.id,
      boardId: 'dev039-placement-board-a',
      parentId: 'dev039-placement-root-a',
      title: '已歸位任務 - 國泰發現',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-08',
      assigneeId: account.id,
      tagIds: ['dev039-placement-tag-focus'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const dragToCenter = async (sourceLocator, targetLocator) => {
    const sourceBox = await sourceLocator.boundingBox();
    const targetBox = await targetLocator.boundingBox();
    assert(sourceBox && targetBox, 'drag source and target should have visible boxes', { sourceBox, targetBox });
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + Math.min(targetBox.height - 12, Math.max(28, targetBox.height / 2));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 8, startY + 8, { steps: 4 });
    await page.mouse.move(targetX, targetY, { steps: 24 });
    await page.mouse.up();
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
        { id: 'dev039-placement-tag-focus', workspaceId: workspace.id, name: '焦點', color: 'blue', order: 0 },
      ]));
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([
        {
          id: 'dev039-placement-inbox-seeded',
          title: '尚未歸位的採購提醒',
          note: '尚未歸位的採購提醒',
          itemType: 'todo',
          captureStatus: 'untriaged',
          syncStatus: 'pending',
          createdBy: account.id,
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
          completedAt: null,
          archivedAt: null,
          suggestedDueDate: '2026-07-01',
          confirmedDueDate: null,
          promotedTaskNodeId: null,
        },
      ]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: true, filtersOpen: false }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev039-placement-board-a');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes });
  };

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      await page.screenshot({ path: `output/playwright/dev-039-placement-open-timeout-${Date.now()}.png`, fullPage: true });
      throw new Error(`app did not open: ${JSON.stringify({ diagnostics: diagnostics.slice(-20) })}`);
    }
  };

  let step = 'seed';
  try {
    await seed();
    await openApp();

    step = 'lane-presence';
    const workbenchPanel = page.locator('[data-task-workbench-panel="true"]');
    const unplacedLane = workbenchPanel.locator('[data-task-workbench-unplaced-lane="true"]');
    const placedLane = workbenchPanel.locator('[data-task-workbench-placed-board-lane="true"]');
    await unplacedLane.waitFor({ state: 'visible', timeout: 10000 });
    await placedLane.waitFor({ state: 'visible', timeout: 10000 });
    const collapseToggleIconClass = await workbenchPanel
      .locator('[data-task-workbench-collapse-toggle="true"] svg')
      .first()
      .getAttribute('class');
    assert(
      collapseToggleIconClass?.includes('lucide-chevron-left') &&
        !collapseToggleIconClass.includes('lucide-panel-left-close'),
      'expanded task workbench collapse button should use compact chevron-left affordance',
      { collapseToggleIconClass },
    );
    assert(await unplacedLane.getByText('未歸位').count() >= 1, 'unplaced lane should be clearly labelled');
    assert(await placedLane.getByText('所有任務排序').count() >= 1, 'all-task sorted lane should be clearly labelled without the removed cross-board summary text');
    assert(await placedLane.getByText('全部看板').count() === 0, 'placed lane should not render the removed all-boards summary text');
    assert(await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').count() === 1, 'legacy inbox item should be migrated into one unplaced task card');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-placement-card-a"]').count() === 1, 'placed board lane should show existing board task');
    assert(
      await placedLane.locator('[data-task-workbench-all-task-card="true"][data-task-workbench-task-placement="unplaced"]').filter({ hasText: '尚未歸位的採購提醒' }).count() === 1,
      'all-task sorted lane should include unplaced tasks',
    );
    const sortedTexts = await placedLane.locator('[data-task-workbench-all-task-card="true"]').evaluateAll(cards =>
      cards.map(card => card.textContent || '')
    );
    const unplacedIndex = sortedTexts.findIndex(text => text.includes('尚未歸位的採購提醒'));
    const placedIndex = sortedTexts.findIndex(text => text.includes('已歸位任務 - 國泰發現'));
    assert(
      unplacedIndex >= 0 && placedIndex >= 0 && unplacedIndex < placedIndex,
      'all-task sorted lane should sort by due date ascending with the earlier unplaced task above later placed tasks',
      { sortedTexts, unplacedIndex, placedIndex },
    );
    const sortedUnplacedCard = placedLane
      .locator('[data-task-workbench-all-task-card="true"][data-task-workbench-task-placement="unplaced"]')
      .filter({ hasText: '尚未歸位的採購提醒' })
      .first();
    const sortedPlacedCard = placedLane
      .locator('[data-task-workbench-all-task-card="true"][data-task-workbench-task-placement="placed"]')
      .filter({ hasText: '已歸位任務 - 國泰發現' })
      .first();
    assert(
      await sortedUnplacedCard.locator('[data-task-date-surface="workbench"][data-task-due-date="2026-07-01"]').count() === 1 &&
        await sortedPlacedCard.locator('[data-task-date-surface="workbench"][data-task-due-date="2026-07-08"]').count() === 1,
      'all-task sorted lane should render due date badges from the shared task date module',
      {
        unplacedDateText: await sortedUnplacedCard.locator('[data-task-date-surface="workbench"]').textContent().catch(() => null),
        placedDateText: await sortedPlacedCard.locator('[data-task-date-surface="workbench"]').textContent().catch(() => null),
      },
    );
    const seededUnplacedCompactCard = workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').first();
    const seededUnplacedBox = await seededUnplacedCompactCard.boundingBox();
    assert(
      seededUnplacedBox && seededUnplacedBox.height <= 40,
      'unplaced tasks should use compact one-line checklist density',
      { seededUnplacedBox },
    );

    step = 'unplaced-card-opens-details';
    const seededUnplacedCard = workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '尚未歸位的採購提醒' }).first();
    await seededUnplacedCard.click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'detached', timeout: 10000 });

    step = 'add-unplaced-task';
    await unplacedLane.locator('[data-task-workbench-unclassified-input="true"]').fill('臨時拜訪客戶');
    await unplacedLane.locator('[data-task-workbench-unclassified-add="true"]').click();
    const newUnplacedCard = workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).first();
    await newUnplacedCard.waitFor({ state: 'visible', timeout: 10000 });
    assert(await newUnplacedCard.locator('[data-task-drag-handle="true"]').count() === 0, 'dense text rows should not render a separate drag handle');
    const newUnplacedBox = await newUnplacedCard.boundingBox();
    assert(
      newUnplacedBox && newUnplacedBox.height <= 40,
      'new unplaced task card should stay one-line height',
      { newUnplacedBox },
    );

    step = 'drag-unplaced-to-placed-board';
    await dragToCenter(newUnplacedCard, placedLane);
    await page.waitForFunction(() => {
      const placedCards = Array.from(document.querySelectorAll('[data-task-workbench-placed-task-card="true"]'));
      return placedCards.some(card => card.textContent?.includes('臨時拜訪客戶'));
    }, null, { timeout: 10000 });
    assert(
      await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 0,
      'dragging unplaced to placed board should remove it from the unplaced lane',
    );
    const placedMovedCard = workbenchPanel.locator('[data-task-workbench-placed-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).first();
    assert(await placedMovedCard.count() === 1, 'moved task should appear in placed lane exactly once');

    step = 'drag-placed-back-to-unplaced';
    await dragToCenter(placedMovedCard, unplacedLane);
    await page.waitForFunction(() => {
      const unplacedCards = Array.from(document.querySelectorAll('[data-task-workbench-unplaced-task-card="true"]'));
      return unplacedCards.some(card => card.textContent?.includes('臨時拜訪客戶'));
    }, null, { timeout: 10000 });
    assert(
      await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 0,
      'dragging placed task back should remove it from the placed board lane',
    );
    assert(
      await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 1,
      'dragging placed task back should show one unplaced task card',
    );
    const persistedUnplaced = await page.evaluate(() => JSON.parse(localStorage.getItem('projed-task-workbench-unplaced-tasks:v1') || '[]'));
    assert(
      persistedUnplaced.some((task) => task.title === '臨時拜訪客戶' && task.boardId === '__task_workbench_unplaced__'),
      'unplaced task should persist with the local unplaced placement id',
      { persistedUnplaced },
    );

    step = 'filter-only-affects-placed-lane';
    await workbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').click();
    const filterPanel = workbenchPanel.locator('[data-task-workbench-filter-panel="true"]');
    await filterPanel.waitFor({ state: 'visible', timeout: 10000 });
    await filterPanel.getByRole('button', { name: /進行中/ }).click();
    assert(
      await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-placement-card-a"]').count() === 0,
      'placed board lane should respond to board filters',
    );
    assert(
      await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 1,
      'unplaced lane should remain visible when placed-board filters change',
    );

    step = 'mobile-viewport';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    assert(
      await page.locator('[data-task-workbench-panel="collapsed"]').count() === 0,
      'mobile closed task workbench should not render an in-flow collapsed rail',
    );
    assert(
      await page.locator('[data-sidebar-panel="collapsed"]').count() === 0,
      'mobile closed sidebar should not render an in-flow collapsed rail',
    );
    const mobileBoardHasCard = await page.evaluate(() => {
      const task = document.querySelector('.kanban-task-card[data-task-id]');
      const rect = task?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(mobileBoardHasCard, 'mobile board should remain reachable while task workbench is closed');
    const mobileClosedOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!mobileClosedOverflow, 'mobile closed rails should not create document-level horizontal overflow');

    await page.locator('[data-main-sidebar-toggle="true"]').click();
    await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-sidebar-task-workbench-button="true"]').click();
    await page.locator('[data-mobile-sidebar-overlay="true"]').waitFor({ state: 'detached', timeout: 10000 });
    await page.locator('[data-mobile-task-workbench-overlay="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-task-workbench-unplaced-lane="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-task-workbench-placed-board-lane="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-039-task-workbench-placement-lanes-mobile.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!overflow, 'mobile placement lanes should not have document-level horizontal overflow');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
