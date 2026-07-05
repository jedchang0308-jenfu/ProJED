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
    id: 'dev039-cross-workspace',
    title: 'DEV-039 Cross Source 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev039-cross-board-a', title: '看板 A', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev039-cross-board-b', title: '看板 B', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev039-cross-task-a': {
      id: 'dev039-cross-task-a',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: null,
      title: 'Board A cross-source task',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-08',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-task-b': {
      id: 'dev039-cross-task-b',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-b',
      parentId: null,
      title: 'Board B cross-source task',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-05',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-list-container': {
      id: 'dev039-cross-list-container',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: null,
      title: 'List container optional display',
      status: 'todo',
      nodeType: 'group',
      order: 3,
      endDate: '2026-07-01',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-list-child-task': {
      id: 'dev039-cross-list-child-task',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: 'dev039-cross-list-container',
      title: 'List child hierarchy task',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-06',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-orphan-child': {
      id: 'dev039-cross-orphan-child',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: 'dev039-cross-deleted-parent',
      title: 'Orphan child of deleted parent',
      status: 'todo',
      nodeType: 'task',
      order: 4,
      endDate: '2026-07-02',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-archived-parent': {
      id: 'dev039-cross-archived-parent',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: null,
      title: 'Archived parent should hide child',
      status: 'todo',
      nodeType: 'group',
      order: 1,
      isArchived: true,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-hidden-child': {
      id: 'dev039-cross-hidden-child',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-a',
      parentId: 'dev039-cross-archived-parent',
      title: 'Child hidden by archived parent',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-04',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev039-cross-archived-task': {
      id: 'dev039-cross-archived-task',
      workspaceId: workspace.id,
      boardId: 'dev039-cross-board-b',
      parentId: null,
      title: 'Archived direct task',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      endDate: '2026-07-03',
      isArchived: true,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  for (let index = 0; index < 24; index += 1) {
    nodes[`dev039-cross-extra-task-${index}`] = {
      id: `dev039-cross-extra-task-${index}`,
      workspaceId: workspace.id,
      boardId: index % 2 === 0 ? 'dev039-cross-board-a' : 'dev039-cross-board-b',
      parentId: null,
      title: `Scroll filler task ${index + 1}`,
      status: 'todo',
      nodeType: 'task',
      order: 20 + index,
      endDate: '2026-08-01',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    };
  }

  const unplacedTasks = Array.from({ length: 18 }, (_, index) => ({
    id: `task_workbench_unplaced_sticky_${index}`,
    workspaceId: workspace.id,
    boardId: '__task_workbench_unplaced__',
    parentId: null,
    title: `Unplaced sticky filler ${index + 1}`,
    status: 'todo',
    nodeType: 'task',
    order: index,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  }));

  const seed = async (activeBoardId) => {
    await page.evaluate(({ account, workspace, nodes, unplacedTasks, activeBoardId }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed.quickCapture.inboxItems', JSON.stringify([]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({
        open: true,
        filtersOpen: false,
        showContainersInAllTasks: false,
      }));
      localStorage.setItem('projed-task-workbench-unplaced-tasks:v1', JSON.stringify(unplacedTasks));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', activeBoardId);
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes, unplacedTasks, activeBoardId });
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-task-workbench-all-tasks-list="true"]').waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      await page.screenshot({ path: `output/playwright/dev-039-cross-source-open-timeout-${Date.now()}.png`, fullPage: true });
      throw new Error(`app did not open: ${JSON.stringify({ diagnostics: diagnostics.slice(-20) })}`);
    }
  };

  const assertCrossBoardList = async (activeBoardLabel) => {
    const allTaskCards = page.locator('[data-task-workbench-all-task-card="true"]');
    await allTaskCards.filter({ hasText: 'Board A cross-source task' }).waitFor({ state: 'visible', timeout: 10000 });
    await allTaskCards.filter({ hasText: 'Board B cross-source task' }).waitFor({ state: 'visible', timeout: 10000 });
    await allTaskCards.filter({ hasText: 'List child hierarchy task' }).waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await allTaskCards.filter({ hasText: 'Child hidden by archived parent' }).count() === 0,
      'descendant of archived parent should not remain in all-task ordering',
      { activeBoardLabel },
    );
    assert(
      await allTaskCards.filter({ hasText: 'Archived direct task' }).count() === 0,
      'archived task should not remain in all-task ordering',
      { activeBoardLabel },
    );
    assert(
      await allTaskCards.filter({ hasText: 'List container optional display' }).count() === 0,
      'group/list containers should not appear in all-task ordering by default',
      { activeBoardLabel },
    );
    assert(
      await allTaskCards.filter({ hasText: 'Orphan child of deleted parent' }).count() === 0,
      'task with missing non-root parent should not appear in all-task ordering',
      { activeBoardLabel },
    );

    const sortedIds = await allTaskCards.evaluateAll(cards =>
      cards.map(card => card.getAttribute('data-task-id') || '')
    );
    const bIndex = sortedIds.indexOf('dev039-cross-task-b');
    const childIndex = sortedIds.indexOf('dev039-cross-list-child-task');
    const aIndex = sortedIds.indexOf('dev039-cross-task-a');
    assert(
      bIndex >= 0 && childIndex >= 0 && aIndex >= 0 && bIndex < childIndex && childIndex < aIndex,
      'cross-board tasks should sort by due date rather than active board',
      { activeBoardLabel, sortedIds, bIndex, childIndex, aIndex },
    );
    const bDateBadge = allTaskCards
      .filter({ hasText: 'Board B cross-source task' })
      .first()
      .locator('[data-task-date-surface="workbench"][data-task-due-date="2026-07-05"]');
    const childDateBadge = allTaskCards
      .filter({ hasText: 'List child hierarchy task' })
      .first()
      .locator('[data-task-date-surface="workbench"][data-task-due-date="2026-07-06"]');
    const aDateBadge = allTaskCards
      .filter({ hasText: 'Board A cross-source task' })
      .first()
      .locator('[data-task-date-surface="workbench"][data-task-due-date="2026-07-08"]');
    assert(
      await bDateBadge.count() === 1 &&
        await childDateBadge.count() === 1 &&
        await aDateBadge.count() === 1,
      'cross-board all-task ordering should show due dates on each sorted task row',
      {
        activeBoardLabel,
        bDateText: await bDateBadge.textContent().catch(() => null),
        childDateText: await childDateBadge.textContent().catch(() => null),
        aDateText: await aDateBadge.textContent().catch(() => null),
      },
    );

    const rootCard = allTaskCards.filter({ hasText: 'Board B cross-source task' }).first();
    const childCard = allTaskCards.filter({ hasText: 'List child hierarchy task' }).first();
    const rootDepth = await rootCard.getAttribute('data-task-workbench-hierarchy-depth');
    const childDepth = await childCard.getAttribute('data-task-workbench-hierarchy-depth');
    const rootPadding = await rootCard.evaluate(element => parseFloat(getComputedStyle(element).paddingLeft));
    const childPadding = await childCard.evaluate(element => parseFloat(getComputedStyle(element).paddingLeft));
    assert(
      rootDepth === '0' && childDepth === '1' && childPadding > rootPadding,
      'hierarchy should be visible through dense text row indentation',
      { activeBoardLabel, rootDepth, childDepth, rootPadding, childPadding },
    );

    const stickyHeaders = await page.evaluate(() => {
      const measure = (containerSelector, headerSelector) => {
        const container = document.querySelector(containerSelector);
        const header = document.querySelector(headerSelector);
        if (!container || !header) return null;
        container.scrollTop = 160;
        const containerRect = container.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        return {
          scrollTop: container.scrollTop,
          position: getComputedStyle(header).position,
          containerTop: containerRect.top,
          headerTop: headerRect.top,
          headerBottom: headerRect.bottom,
        };
      };

      return {
        unplaced: measure(
          '[data-task-workbench-unplaced-lane="true"]',
          '[data-task-workbench-section-header="unplaced"]',
        ),
        allTasks: measure(
          '[data-task-workbench-placed-board-lane="true"]',
          '[data-task-workbench-section-header="all-tasks"]',
        ),
      };
    });
    for (const [headerName, measurement] of Object.entries(stickyHeaders)) {
      assert(
        measurement &&
          measurement.scrollTop > 0 &&
          measurement.position === 'sticky' &&
          Math.abs(measurement.headerTop - measurement.containerTop) <= 2 &&
          measurement.headerBottom > measurement.containerTop,
        'workbench section title should stay pinned while its lane scrolls',
        { activeBoardLabel, headerName, measurement },
      );
    }
  };

  let step = 'seed-board-a';
  try {
    await seed('dev039-cross-board-a');
    await openApp();

    step = 'active-board-a-cross-board-list';
    await assertCrossBoardList('A');

    step = 'container-display-toggle';
    await page.locator('[data-task-workbench-filter-toggle="true"]').click();
    const showContainersToggle = page.locator('[data-task-workbench-show-containers-toggle="true"]');
    await showContainersToggle.check();
    await page.locator('[data-task-workbench-all-task-card="true"]')
      .filter({ hasText: 'List container optional display' })
      .waitFor({ state: 'visible', timeout: 10000 });
    assert(
      await page.locator('[data-task-workbench-all-task-card="true"]').filter({ hasText: 'Orphan child of deleted parent' }).count() === 0,
      'container display toggle should not expose missing-parent orphan tasks',
    );
    await showContainersToggle.uncheck();
    await page.locator('[data-task-workbench-filter-toggle="true"]').click();
    await assertCrossBoardList('A after container toggle off');

    step = 'active-board-b-cross-board-list';
    await page.evaluate(() => {
      localStorage.setItem('projed-last-board', 'dev039-cross-board-b');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await assertCrossBoardList('B');

    step = 'deleted-task-reload-removal';
    await page.evaluate(() => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      nodes['dev039-cross-task-a'] = {
        ...nodes['dev039-cross-task-a'],
        isArchived: true,
        updatedAt: Date.now(),
      };
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    assert(
      await page.locator('[data-task-workbench-all-task-card="true"]').filter({ hasText: 'Board A cross-source task' }).count() === 0,
      'task archived on board should disappear from all-task ordering after reload',
    );
    assert(
      await page.locator('[data-task-workbench-all-task-card="true"]').filter({ hasText: 'Board B cross-source task' }).count() === 1,
      'other board task should remain after deleting board A task',
    );

    try {
      await page.screenshot({
        path: 'output/playwright/dev-039-task-workbench-cross-board-source.png',
        fullPage: false,
        timeout: 10000,
      });
    } catch (error) {
      diagnostics.push(`screenshot-warning:${error.message}`);
    }
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
