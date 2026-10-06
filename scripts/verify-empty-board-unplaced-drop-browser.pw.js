/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

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
    id: 'empty-drop-workspace',
    title: '空看板歸位驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'empty-drop-board',
      title: '空白看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const makeTask = (id, parentId, title, order) => ({
    id,
    workspaceId: workspace.id,
    boardId: '__task_workbench_unplaced__',
    parentId,
    title,
    status: 'todo',
    nodeType: 'task',
    order,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  });
  const unplacedTasks = [
    makeTask('empty-drop-root', null, '待歸位父任務', 0),
    makeTask('empty-drop-child', 'empty-drop-root', '待歸位子任務', 0),
  ];

  const seed = async ({ mobile }) => {
    await page.evaluate(({ account, workspace, unplacedTasks, mobile }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({}));
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify([]));
      localStorage.setItem('projed-local-test.taskTrackingReferenceStaging.v1', JSON.stringify([]));
      localStorage.setItem(
        'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
        JSON.stringify(unplacedTasks),
      );
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v2:account:local-test-user', JSON.stringify({
        open: true,
        filtersOpen: false,
        showContainersInAllTasks: true,
        width: mobile ? 340 : 360,
        openPreferenceVersion: 1,
      }));
      localStorage.setItem('projed-task-workbench-filters:v2:account:local-test-user', JSON.stringify({
        version: 2,
        selectedBoardId: workspace.boards[0].id,
        filtersByBoardId: {},
      }));
    }, { account, workspace, unplacedTasks, mobile });
    await page.reload({ waitUntil: 'networkidle' });
  };

  const visibleErrorSweep = async (label) => {
    const visibleErrors = await page.evaluate(() => Array.from(
      document.querySelectorAll('.inline-error, [role="alert"]'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).map(element => element.textContent?.trim() || 'visible error'));
    assert(visibleErrors.length === 0, `${label} must not expose visible errors`, { visibleErrors });
    return visibleErrors;
  };

  const readPlacement = async () => page.evaluate(() => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const unplaced = JSON.parse(localStorage.getItem(
      'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
    ) || '[]');
    return {
      root: nodes['empty-drop-root'] || null,
      child: nodes['empty-drop-child'] || null,
      unplacedIds: unplaced.map(task => task.id),
      transientCount: document.querySelectorAll(
        '[data-desktop-drop-indicator="true"], [data-mobile-drop-indicator="true"], [data-mobile-drag-preview="true"], [data-mobile-task-action-rail="true"], [data-empty-board-drop-feedback="true"]',
      ).length,
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await seed({ mobile: false });

  const desktopSource = page.locator(
    '[data-task-workbench-unplaced-task-card="true"][data-task-id="empty-drop-root"]',
  ).first();
  const desktopDrop = page.locator('[data-kanban-empty-board-drop="true"]');
  await desktopSource.waitFor({ state: 'visible', timeout: 15000 });
  await desktopDrop.waitFor({ state: 'visible', timeout: 15000 });
  const desktopCanvas = page.locator('[data-layout-region="board-canvas"]');
  const desktopGeometry = await page.evaluate(() => {
    const canvas = document.querySelector('[data-layout-region="board-canvas"]');
    const drop = document.querySelector('[data-kanban-empty-board-drop="true"]');
    const button = document.querySelector('[data-kanban-add-column-button="true"]');
    if (!canvas || !drop || !button) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const dropRect = drop.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      canvas: canvasRect.toJSON(),
      drop: dropRect.toJSON(),
      button: buttonRect.toJSON(),
    };
  });
  assert(desktopGeometry
    && desktopGeometry.drop.width >= desktopGeometry.canvas.width - 32
    && desktopGeometry.drop.height >= desktopGeometry.canvas.height - 32
    && desktopGeometry.drop.left - desktopGeometry.canvas.left <= 16
    && desktopGeometry.canvas.right - desktopGeometry.drop.right <= 16
    && desktopGeometry.button.width <= 271,
  'empty board drop target should fill the padded canvas without turning the add button into a full-canvas CTA',
  { desktopGeometry });

  const sourceBox = await desktopSource.boundingBox();
  const dropBox = await desktopDrop.boundingBox();
  assert(sourceBox && dropBox, 'desktop drag endpoints must be visible', { sourceBox, dropBox });
  const desktopStart = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + Math.min(16, sourceBox.height / 2),
  };
  const desktopEnd = {
    x: dropBox.x + Math.min(dropBox.width - 24, Math.max(80, dropBox.width * 0.45)),
    y: dropBox.y + Math.min(dropBox.height - 24, Math.max(100, dropBox.height * 0.45)),
  };
  await page.mouse.move(desktopStart.x, desktopStart.y);
  await page.mouse.down();
  await page.mouse.move(desktopStart.x + 12, desktopStart.y + 8, { steps: 4 });
  await page.mouse.move(desktopEnd.x, desktopEnd.y, { steps: 28 });
  const desktopIndicator = page.locator(
    '[data-desktop-drop-indicator="true"][data-desktop-drop-surface-kind="root-drop"][data-desktop-drop-axis="vertical"]',
  );
  await desktopIndicator.waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-empty-board-drop-active="true"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByText('放開以歸位', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  const desktopPreviewGeometry = await desktopIndicator.evaluate((indicator) => ({
    rect: indicator.getBoundingClientRect().toJSON(),
    markerAxis: indicator.querySelector('[data-kanban-insertion-marker="true"]')
      ?.getAttribute('data-kanban-insertion-axis') || null,
  }));
  assert(desktopPreviewGeometry.markerAxis === 'vertical' && desktopPreviewGeometry.rect.height > 100,
    'desktop empty board preview must use the existing vertical insertion marker',
    { desktopPreviewGeometry });
  await page.screenshot({ path: 'output/playwright/empty-board-drop-desktop-preview.png', fullPage: false });
  await page.mouse.up();

  await page.locator('[data-kanban-column="true"][data-task-id="empty-drop-root"]')
    .waitFor({ state: 'visible', timeout: 10000 });
  const desktopPlacement = await readPlacement();
  assert(desktopPlacement.root?.workspaceId === workspace.id
    && desktopPlacement.root?.boardId === workspace.boards[0].id
    && desktopPlacement.root?.parentId === null,
  'desktop drop must place the unplaced root on the empty board', { desktopPlacement });
  assert(desktopPlacement.child?.boardId === workspace.boards[0].id
    && desktopPlacement.child?.parentId === 'empty-drop-root',
  'desktop drop must preserve the complete subtree', { desktopPlacement });
  assert(desktopPlacement.unplacedIds.length === 0 && desktopPlacement.transientCount === 0,
    'desktop drop must clear the unplaced source and transient feedback', { desktopPlacement });
  await visibleErrorSweep('desktop empty-board drop');
  await page.screenshot({ path: 'output/playwright/empty-board-drop-desktop-result.png', fullPage: false });

  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    } catch (_) {}
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('pointer: coarse') || query.includes('hover: none')) {
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
  await page.setViewportSize({ width: 390, height: 844 });
  await seed({ mobile: true });
  const touchEmulation = await page.context().newCDPSession(page);
  await touchEmulation.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const mobileSource = page.locator(
    '[data-task-workbench-unplaced-task-card="true"][data-task-id="empty-drop-root"]',
  ).first();
  const mobileDrop = page.locator('[data-kanban-empty-board-drop="true"]');
  await mobileSource.waitFor({ state: 'visible', timeout: 15000 });
  await mobileDrop.waitFor({ state: 'visible', timeout: 15000 });
  const mobileSourceBox = await mobileSource.boundingBox();
  const mobileDropBox = await mobileDrop.boundingBox();
  assert(mobileSourceBox && mobileDropBox, 'mobile drag endpoints must be rendered', {
    mobileSourceBox,
    mobileDropBox,
  });
  const mobileStart = {
    x: Math.round(mobileSourceBox.x + mobileSourceBox.width / 2),
    y: Math.round(mobileSourceBox.y + mobileSourceBox.height / 2),
  };
  const mobileEnd = {
    x: Math.round(Math.min(378, mobileDropBox.x + 24)),
    y: Math.round(mobileDropBox.y + Math.min(180, mobileDropBox.height / 2)),
  };
  await touchEmulation.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: mobileStart.x, y: mobileStart.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
  });
  await page.waitForTimeout(650);
  await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
  for (let step = 1; step <= 10; step += 1) {
    const x = Math.round(mobileStart.x + ((mobileEnd.x - mobileStart.x) * step) / 10);
    const y = Math.round(mobileStart.y + ((mobileEnd.y - mobileStart.y) * step) / 10);
    await touchEmulation.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(30);
  }
  const mobileIndicator = page.locator(
    '[data-mobile-drop-indicator="true"][data-mobile-drop-target-kind="board-root"]',
  );
  await mobileIndicator.waitFor({ state: 'visible', timeout: 5000 });
  const mobilePreviewGeometry = await mobileIndicator.evaluate((indicator) => ({
    rect: indicator.getBoundingClientRect().toJSON(),
    axis: indicator.getAttribute('data-mobile-drop-axis'),
    surface: indicator.getAttribute('data-mobile-drop-surface-kind'),
    markerAxis: indicator.querySelector('[data-kanban-insertion-marker="true"]')
      ?.getAttribute('data-kanban-insertion-axis') || null,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert(mobilePreviewGeometry.axis === 'vertical'
    && mobilePreviewGeometry.surface === 'root-drop'
    && mobilePreviewGeometry.markerAxis === 'vertical'
    && mobilePreviewGeometry.documentOverflow <= 1,
  'mobile empty board target must use the shared vertical marker without overflow',
  { mobilePreviewGeometry });
  await page.screenshot({ path: 'output/playwright/empty-board-drop-mobile-preview.png', fullPage: false });
  await touchEmulation.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  await touchEmulation.detach().catch(() => undefined);

  await page.waitForFunction(() => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes['empty-drop-root']?.boardId === 'empty-drop-board'
      && nodes['empty-drop-child']?.boardId === 'empty-drop-board';
  }, null, { timeout: 10000 });
  const mobilePlacement = await readPlacement();
  assert(mobilePlacement.root?.parentId === null
    && mobilePlacement.child?.parentId === 'empty-drop-root'
    && mobilePlacement.unplacedIds.length === 0
    && mobilePlacement.transientCount === 0,
  'mobile drop must place the complete subtree and clear transient UI', { mobilePlacement });
  const mobileVisibleErrors = await visibleErrorSweep('mobile empty-board drop');
  await page.screenshot({ path: 'output/playwright/empty-board-drop-mobile-result.png', fullPage: false });

  const pageErrors = diagnostics.filter(entry => entry.startsWith('pageerror:'));
  assert(pageErrors.length === 0, 'empty-board drop flow must not raise page errors', { diagnostics });
  const result = {
    verifier: 'empty-board-unplaced-drop',
    status: 'passed',
    desktopGeometry,
    desktopPreviewGeometry,
    desktopPlacement,
    mobilePreviewGeometry,
    mobilePlacement,
    mobileVisibleErrors,
    diagnostics: diagnostics.slice(-20),
  };
  await page.evaluate(value => { window.__EMPTY_BOARD_DROP_ARTIFACT = value; }, result);
  return result;
}
