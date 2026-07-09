/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const toLocalDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const addDays = (days) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return toLocalDateInput(date);
  };
  const formatWorkbenchDateText = (value) => {
    const [year, month, day] = value.split('-');
    return Number(year) === new Date().getFullYear() ? `${month}/${day}` : `${year.slice(-2)}/${month}/${day}`;
  };
  const unplacedDueDate = addDays(3);
  const placedStartDate = addDays(6);
  const placedDueDate = addDays(10);
  const unplacedDueLabel = formatWorkbenchDateText(unplacedDueDate);
  const placedStartLabel = formatWorkbenchDateText(placedStartDate);
  const placedDueLabel = formatWorkbenchDateText(placedDueDate);

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
      endDate: addDays(9),
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
      startDate: placedStartDate,
      endDate: placedDueDate,
      assigneeId: account.id,
      tagIds: ['dev039-placement-tag-focus'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const dragToCenter = async (sourceLocator, targetLocator, options = {}) => {
    const sourceBox = await sourceLocator.boundingBox();
    const targetBox = await targetLocator.boundingBox();
    assert(sourceBox && targetBox, 'drag source and target should have visible boxes', { sourceBox, targetBox });
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + (Number.isFinite(options.targetOffsetY)
      ? Math.min(targetBox.height - 8, Math.max(8, options.targetOffsetY))
      : Math.min(targetBox.height - 12, Math.max(28, targetBox.height / 2)));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 8, startY + 8, { steps: 4 });
    await page.mouse.move(targetX, targetY, { steps: 24 });
    await page.mouse.up();
  };

  const seed = async () => {
    await page.evaluate(({ account, workspace, nodes, unplacedDueDate }) => {
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
          suggestedDueDate: unplacedDueDate,
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
    }, { account, workspace, nodes, unplacedDueDate });
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

  const assertSharedTaskContextMenu = async (taskLocator, message) => {
    await taskLocator.click({ button: 'right', position: { x: 40, y: 10 } });
    await page.getByText('更多詳情選項').first().waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await page.getByText('重新命名任務', { exact: true }).count() === 0,
      `${message} without the removed task rename action`,
    );
    await page.keyboard.press('Escape');
    await page.getByText('更多詳情選項').first().waitFor({ state: 'hidden', timeout: 10000 });
  };

  const assertUnplacedWorkbenchRowDragSurface = async (taskLocator, message) => {
    const dragSurface = await taskLocator.getAttribute('data-task-workbench-drag-surface');
    assert(dragSurface === 'task-row-root', `${message} should expose the shared row-root drag surface`, { dragSurface });
    assert(
      await taskLocator.locator('[data-task-drag-handle="true"]').count() === 0,
      `${message} should not require a separate drag handle inside the row`,
    );
    assert(
      await taskLocator.getAttribute('data-touch-tap-guard') === 'true',
      `${message} should keep the shared touch tap guard on the row root`,
    );

    for (const ratio of [0.15, 0.5, 0.85]) {
      const sourceBox = await taskLocator.boundingBox();
      assert(sourceBox, `${message} should have a visible drag surface box`, { ratio });

      const startX = sourceBox.x + Math.min(sourceBox.width - 6, Math.max(6, sourceBox.width * ratio));
      const startY = sourceBox.y + sourceBox.height / 2;
      const hitIsInsideRow = await taskLocator.evaluate((row, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return Boolean(hit && row.contains(hit));
      }, { x: startX, y: startY });
      assert(hitIsInsideRow, `${message} sample point should hit inside the row root`, { ratio, sourceBox, startX, startY });
    }
  };

  const assertPlacedWorkbenchRowReadOnly = async (taskLocator, message) => {
    const dragSurface = await taskLocator.getAttribute('data-task-workbench-drag-surface');
    assert(dragSurface === null, `${message} should not expose a drag surface`, { dragSurface });
    assert(
      await taskLocator.getAttribute('data-task-workbench-readonly-task-card') === 'true',
      `${message} should expose the read-only workbench contract`,
    );
    assert(
      await taskLocator.locator('[data-task-drag-handle="true"]').count() === 0,
      `${message} should not render a drag handle`,
    );
    assert(
      await taskLocator.getAttribute('data-touch-tap-guard') === 'true',
      `${message} should keep click/tap protection for opening task details`,
    );
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
    assert(await unplacedLane.locator('[data-task-workbench-unclassified-input="true"]').getAttribute('placeholder') === '新增任務', 'unplaced lane add input should use the simplified new-task placeholder');
    assert(await unplacedLane.locator('[data-task-workbench-unclassified-add="true"] svg.lucide-plus').count() === 1, 'unplaced lane add action should use a compact plus icon');
    assert(await placedLane.getByText('已歸位').count() >= 1, 'placed lane should use the simplified placed-task section title');
    assert(await placedLane.getByText('所有任務排序').count() === 0, 'placed lane should not render the old all-task sorted section title');
    assert(await placedLane.getByText('全部看板').count() === 0, 'placed lane should not render the removed all-boards summary text');
    const placementTone = await page.evaluate(() => {
      const readBg = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).backgroundColor : null;
      };
      return {
        unplacedLane: readBg('[data-task-workbench-unclassified-section="true"]'),
        placedLane: readBg('[data-task-workbench-placed-board-lane="true"]'),
        unplacedHeader: readBg('[data-task-workbench-section-header="unplaced"]'),
        placedHeader: readBg('[data-task-workbench-section-header="all-tasks"]'),
        unplacedAccent: readBg('[data-task-workbench-header-accent="unplaced"]'),
        placedAccent: readBg('[data-task-workbench-header-accent="placed"]'),
      };
    });
    assert(
      placementTone.unplacedLane !== 'rgb(255, 255, 255)' &&
        placementTone.placedLane !== 'rgb(255, 255, 255)' &&
        placementTone.unplacedLane === placementTone.placedLane,
      'unplaced and placed task lanes should share one Morandi blue-gray task body tone',
      placementTone,
    );
    assert(
      placementTone.unplacedHeader === placementTone.placedHeader &&
        placementTone.unplacedHeader !== placementTone.unplacedLane &&
        placementTone.unplacedAccent === placementTone.placedAccent,
      'section headers should use one separate title tone from task bodies',
      placementTone,
    );
    assert(await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').count() === 1, 'legacy inbox item should be migrated into one unplaced task card');
    assert(await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-placement-card-a"]').count() === 1, 'placed board lane should show existing board task');
    assert(
      await placedLane.locator('[data-task-workbench-all-task-card="true"][data-task-workbench-task-placement="unplaced"]').filter({ hasText: '尚未歸位的採購提醒' }).count() === 0,
      'unplaced tasks should not be repeated in the placed lane',
    );
    const placedLaneTexts = await placedLane.locator('[data-task-workbench-all-task-card="true"]').evaluateAll(cards =>
      cards.map(card => card.textContent || '')
    );
    assert(
      placedLaneTexts.some(text => text.includes('已歸位任務 - 國泰發現')) &&
        placedLaneTexts.every(text => !text.includes('尚未歸位的採購提醒')),
      'placed lane should contain placed tasks only',
      { placedLaneTexts },
    );
    const sortedPlacedCard = placedLane
      .locator('[data-task-workbench-all-task-card="true"][data-task-workbench-task-placement="placed"]')
      .filter({ hasText: '已歸位任務 - 國泰發現' })
      .first();
    const placedDateText = await sortedPlacedCard.locator('[data-task-date-surface="workbench"]').textContent().catch(() => null);
    assert(
      await sortedPlacedCard.locator(`[data-task-date-surface="workbench"][data-task-due-date="${placedDueDate}"]`).count() === 1,
      'placed lane should render due date badges from the shared task date module',
      { placedDateText },
    );
    assert(
      placedDateText && !placedDateText.includes('→') && !placedDateText.includes(placedStartLabel) && placedDateText.includes(placedDueLabel),
      'placed lane workbench due date badge should hide start dates even when global start-date display is enabled',
      { placedDateText },
    );
    const seededUnplacedCompactCard = workbenchPanel
      .locator('[data-task-workbench-unplaced-task-card="true"]')
      .filter({ hasText: '尚未歸位的採購提醒' })
      .first();
    const unplacedLaneDateText = await seededUnplacedCompactCard.locator('[data-task-date-surface="workbench"]').textContent().catch(() => null);
    assert(
      await seededUnplacedCompactCard.locator(`[data-task-date-surface="workbench"][data-task-due-date="${unplacedDueDate}"]`).count() === 1,
      'unplaced lane should render the same workbench due date badge module',
      { unplacedLaneDateText },
    );
    assert(
      unplacedLaneDateText && !unplacedLaneDateText.includes('→') && !unplacedLaneDateText.includes('...') && unplacedLaneDateText.includes(unplacedDueLabel),
      'unplaced lane workbench due date badge should show due date only',
      { unplacedLaneDateText },
    );
    const seededUnplacedBox = await seededUnplacedCompactCard.boundingBox();
    assert(
      seededUnplacedBox && seededUnplacedBox.height <= 40,
      'unplaced tasks should use compact one-line checklist density',
      { seededUnplacedBox },
    );

    step = 'workbench-context-menu';
    const seededUnplacedCard = workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '尚未歸位的採購提醒' }).first();
    await assertSharedTaskContextMenu(
      seededUnplacedCard,
      'unplaced workbench task should open the shared task context menu',
    );
    await assertSharedTaskContextMenu(
      sortedPlacedCard,
      'placed workbench task should open the shared task context menu',
    );

    step = 'workbench-drag-contract';
    await assertUnplacedWorkbenchRowDragSurface(
      seededUnplacedCard,
      'unplaced workbench task should drag from the shared row-root surface',
    );
    await assertPlacedWorkbenchRowReadOnly(
      sortedPlacedCard,
      'placed workbench task should be a read-only workbench list entry',
    );
    const placedProbeNode = await page.evaluate(() => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes['dev039-placement-card-a'] || null;
    });
    assert(
      placedProbeNode?.parentId === 'dev039-placement-root-a',
      'read-only placed-row probes should not mutate placed task hierarchy',
      { placedProbeNode },
    );

    step = 'unplaced-card-opens-details';
    await seededUnplacedCard.click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-task-details-modal="true"] button[title="關閉"]').click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'detached', timeout: 10000 });

    step = 'add-unplaced-task';
    await unplacedLane.locator('[data-task-workbench-unclassified-input="true"]').fill('臨時拜訪客戶');
    await unplacedLane.locator('[data-task-workbench-unclassified-add="true"]').click();
    const newUnplacedCard = workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).first();
    await newUnplacedCard.waitFor({ state: 'visible', timeout: 10000 });
    assert(await newUnplacedCard.locator('[data-task-drag-handle="true"]').count() === 0, 'dense task rows should not render a separate drag handle');
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

    step = 'placed-task-drag-back-blocked';
    const placedBackSourceBox = await placedMovedCard.boundingBox();
    const unplacedBackTargetBox = await unplacedLane.boundingBox();
    await dragToCenter(placedMovedCard, unplacedLane, { targetOffsetY: 24 });
    await page.waitForTimeout(500);
    assert(
      await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 1,
      'dragging a placed task back should be blocked and keep it in the placed board lane',
      { placedBackSourceBox, unplacedBackTargetBox },
    );
    assert(
      await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '臨時拜訪客戶' }).count() === 0,
      'blocked placed-task drag should not create an unplaced duplicate',
    );
    const persistedUnplaced = await page.evaluate(() => JSON.parse(localStorage.getItem('projed-task-workbench-unplaced-tasks:v1') || '[]'));
    assert(
      persistedUnplaced.every((task) => task.title !== '臨時拜訪客戶'),
      'blocked placed-task drag should not persist the moved task as local unplaced',
      { persistedUnplaced },
    );

    step = 'filter-only-affects-placed-lane';
    const filterToggle = workbenchPanel.locator('[data-task-workbench-filter-toggle="true"]').first();
    await filterToggle.scrollIntoViewIfNeeded();
    let filterPanelOpened = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await filterToggle.getAttribute('aria-expanded')) !== 'true') {
        await filterToggle.click({ force: true });
      }
      try {
        await page.waitForFunction(() => {
          const popover = document.querySelector('[data-task-workbench-filter-popover="true"]');
          const panel = popover?.querySelector('[data-task-workbench-filter-panel="true"]');
          const rect = panel?.getBoundingClientRect();
          return Boolean(rect && rect.width > 0 && rect.height > 0);
        }, null, { timeout: 4000 });
        filterPanelOpened = true;
        break;
      } catch {
        if ((await filterToggle.getAttribute('aria-expanded')) === 'true') {
          await filterToggle.click({ force: true }).catch(() => {});
        }
      }
    }
    assert(filterPanelOpened, 'task workbench filter panel should open before applying filters', {
      ariaExpanded: await filterToggle.getAttribute('aria-expanded'),
    });
    const filterPanel = page.locator('[data-task-workbench-filter-popover="true"] [data-task-workbench-filter-panel="true"]').first();
    await filterPanel.waitFor({ state: 'visible', timeout: 10000 });
    await filterPanel.getByRole('button', { name: /進行中/ }).click({ force: true });
    await page.waitForFunction(() => (
      document.querySelectorAll('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-placement-card-a"]').length === 0
    ), null, { timeout: 10000 }).catch(async (error) => {
      const filterDiagnostics = await page.evaluate(() => {
        const panel = document.querySelector('[data-task-workbench-filter-panel="true"]');
        return {
          selectedBoardId: panel?.querySelector('select')?.value || null,
          prefs: localStorage.getItem('projed-task-workbench-filters:v1'),
          statusButtons: Array.from(panel?.querySelectorAll('button') || []).map(button => ({
            text: (button.textContent || '').trim(),
            pressed: button.getAttribute('aria-pressed'),
          })),
          storedNode: (() => {
            try {
              return JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev039-placement-card-a'] || null;
            } catch {
              return null;
            }
          })(),
          visiblePlacedCards: Array.from(document.querySelectorAll('[data-task-workbench-placed-task-card="true"]')).map(card => ({
            id: card.getAttribute('data-task-id'),
            text: (card.textContent || '').trim(),
          })),
        };
      });
      throw new Error(`placed board filter did not hide in-progress task: ${error.message}: ${JSON.stringify(filterDiagnostics)}`);
    });
    assert(
      await workbenchPanel.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev039-placement-card-a"]').count() === 0,
      'placed board lane should respond to board filters',
    );
    assert(
      await workbenchPanel.locator('[data-task-workbench-unplaced-task-card="true"]').filter({ hasText: '尚未歸位的採購提醒' }).count() === 1,
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
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-kanban-column="true"]').first().waitFor({ state: 'visible', timeout: 10000 });
    const mobileBoardMetrics = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.kanban-task-card[data-task-id]')).map(card => {
        const rect = card.getBoundingClientRect();
        return {
          id: card.getAttribute('data-task-id'),
          text: (card.textContent || '').trim(),
          rect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        };
      });
      const columns = Array.from(document.querySelectorAll('[data-kanban-column="true"]')).map(column => {
        const rect = column.getBoundingClientRect();
        return {
          text: (column.textContent || '').trim().slice(0, 120),
          rect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        };
      });
      return {
        cards,
        columns,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        boardFilterPrefs: localStorage.getItem('projed-task-filters:v1'),
        workbenchFilterPrefs: localStorage.getItem('projed-task-workbench-filters:v1'),
        bodyText: document.body.innerText.slice(0, 500),
      };
    });
    const mobileBoardHasCard = mobileBoardMetrics.cards.some(({ rect }) => (
      rect.width > 0 && rect.height > 0 && rect.left < mobileBoardMetrics.viewport.width && rect.right > 0
    ));
    assert(mobileBoardHasCard, 'mobile board should remain reachable while task workbench is closed', mobileBoardMetrics);
    const mobileClosedOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!mobileClosedOverflow, 'mobile closed rails should not create document-level horizontal overflow');

    await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
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
