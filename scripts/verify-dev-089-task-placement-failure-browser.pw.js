/* eslint-disable */
async (page) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('(pointer: coarse)')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        };
      }
      return nativeMatchMedia(query);
    };
  });

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev089-workspace-a',
    title: 'DEV-089 來源工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev089-board-a', title: '來源看板', dependencies: [], order: 0, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, parentId, title, nodeType, order) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'dev089-board-a',
    parentId,
    title,
    status: 'todo',
    nodeType,
    order,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  });
  const nodes = {
    'dev089-column': makeNode('dev089-column', null, 'DEV-089 欄位', 'group', 0),
    'dev089-root': makeNode('dev089-root', 'dev089-column', '回覆聖島, 發明核准', 'task', 0),
    'dev089-child': makeNode('dev089-child', 'dev089-root', '子任務', 'task', 0),
    'dev089-grandchild': makeNode('dev089-grandchild', 'dev089-child', '孫任務', 'task', 0),
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev089-board-a');
    localStorage.setItem('projed-last-view', 'board');
    localStorage.setItem('projed-task-workbench-panel:v2:account:local-test-user', JSON.stringify({
      open: true,
      filtersOpen: false,
      showContainersInAllTasks: false,
      width: 340,
      openPreferenceVersion: 1,
    }));
    localStorage.setItem('projed-task-workbench-filters:v2:account:local-test-user', JSON.stringify({
      version: 2,
      selectedBoardId: 'dev089-board-a',
      filtersByBoardId: {},
    }));
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  const emulation = await page.context().newCDPSession(page);
  await emulation.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const panel = page.locator('[data-task-workbench-panel="true"]');
  const unplacedLane = panel.locator('[data-task-workbench-unplaced-lane="true"]');
  const unplacedList = unplacedLane.locator('[data-task-workbench-unclassified-list="true"]');
  const source = page.locator('[data-task-surface-source="true"][data-task-id="dev089-root"]').first();
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  await source.waitFor({ state: 'visible', timeout: 10000 });

  const panelBox = await panel.boundingBox();
  const sourceBox = await source.boundingBox();
  const listBox = await unplacedList.boundingBox();
  assert(panelBox && sourceBox && listBox, 'fault-injection endpoints must be rendered', {
    panelBox,
    sourceBox,
    listBox,
  });
  const visibleSourceLeft = Math.max(sourceBox.x, panelBox.x + panelBox.width, 0);
  const visibleSourceRight = Math.min(sourceBox.x + sourceBox.width, 390);
  assert(visibleSourceRight - visibleSourceLeft >= 8, 'board source must retain a touchable strip', {
    panelBox,
    sourceBox,
    visibleSourceLeft,
    visibleSourceRight,
  });

  await page.evaluate(() => {
    window.__projedTaskPlacementTestFault = { delayMs: 700, failNext: true };
    window.__projedTaskDragTestApi?.resetMobileCommitSpy();
  });

  const sourcePoint = {
    x: Math.round((visibleSourceLeft + visibleSourceRight) / 2),
    y: Math.round(sourceBox.y + Math.min(sourceBox.height / 2, 18)),
  };
  const targetPoint = {
    x: Math.round(listBox.x + listBox.width / 2),
    y: Math.round(listBox.y + Math.min(Math.max(28, listBox.height * 0.35), listBox.height - 12)),
  };
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: sourcePoint.x, y: sourcePoint.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
  });
  await page.waitForTimeout(650);
  await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
  for (let step = 1; step <= 8; step += 1) {
    const x = Math.round(sourcePoint.x + ((targetPoint.x - sourcePoint.x) * step) / 8);
    const y = Math.round(sourcePoint.y + ((targetPoint.y - sourcePoint.y) * step) / 8);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(28);
  }
  await page.locator(
    '[data-mobile-drop-indicator="true"][data-mobile-drop-target-kind="workbench-unplaced-lane"]',
  ).waitFor({ state: 'visible', timeout: 5000 });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();

  const pendingSource = page.locator('[data-task-id="dev089-root"][data-task-placement-pending="true"]').first();
  await pendingSource.waitFor({ state: 'attached', timeout: 2000 });
  const pendingEvidence = await pendingSource.evaluate(element => ({
    pending: element.getAttribute('data-task-placement-pending'),
    spinner: element.querySelectorAll('[data-task-placement-pending-indicator="true"]').length,
  }));
  assert(pendingEvidence.pending === 'true' && pendingEvidence.spinner >= 1,
    'the original board subtree must remain visible with compact pending indicators', pendingEvidence);

  const failureToast = page.getByText('搬移失敗，任務已保留在原位置。', { exact: true });
  await failureToast.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-task-placement-pending="true"]').length === 0);

  const result = await page.evaluate(() => {
    const storedNodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const unplaced = JSON.parse(localStorage.getItem(
      'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
    ) || '[]');
    const ids = ['dev089-root', 'dev089-child', 'dev089-grandchild'];
    return {
      boardNodes: ids.map(id => ({
        id,
        boardId: storedNodes[id]?.boardId,
        parentId: storedNodes[id]?.parentId ?? null,
      })),
      unplacedIds: unplaced.map(task => task.id),
      runtimeNodes: ids.map(id => ({
        id,
        boardId: window.__projedTaskDragTestApi?.snapshotNodes()?.[id]?.boardId,
        parentId: window.__projedTaskDragTestApi?.snapshotNodes()?.[id]?.parentId ?? null,
      })),
      commitSpy: window.__projedTaskDragTestApi?.snapshotMobileCommitSpy(),
      transientCount: document.querySelectorAll(
        '[data-mobile-drop-indicator="true"], [data-mobile-drag-preview="true"], [data-mobile-task-action-rail="true"]',
      ).length,
      pendingCount: document.querySelectorAll('[data-task-placement-pending="true"]').length,
      unplacedRowCount: document.querySelectorAll(
        '[data-task-workbench-unplaced-task-card="true"][data-task-id="dev089-root"]',
      ).length,
    };
  });

  assert(result.boardNodes.every(node => node.boardId === 'dev089-board-a'),
    'fault injection must retain every persisted subtree node on the source board', result);
  assert(result.runtimeNodes.every(node => node.boardId === 'dev089-board-a'),
    'fault injection must retain every runtime subtree node on the source board', result);
  assert(result.boardNodes.map(node => node.parentId).join(',') === 'dev089-column,dev089-root,dev089-child',
    'failure must preserve the complete parent chain', result);
  assert(result.unplacedIds.every(id => !['dev089-root', 'dev089-child', 'dev089-grandchild'].includes(id)),
    'failure must not create a local unplaced copy', result);
  assert(result.unplacedRowCount === 0 && result.pendingCount === 0 && result.transientCount === 0,
    'failure must clear pending/drag UI without showing an unplaced duplicate', result);
  assert(result.commitSpy?.batchUpdateNodesCalls === 1 && result.commitSpy?.ancestorRecalculationCalls === 0,
    'mobile failure path must attempt one durable commit and skip success-only rollup', result);
  assert(pageErrors.length === 0, 'fault-injection flow must not raise page errors', { pageErrors });

  await page.screenshot({
    path: 'output/playwright/dev-089/mobile-placement-failure-retains-source.png',
    fullPage: false,
  });
  console.log(JSON.stringify({
    ok: true,
    viewport: { width: 390, height: 844 },
    pendingEvidence,
    result,
    pageErrors,
  }, null, 2));
}
