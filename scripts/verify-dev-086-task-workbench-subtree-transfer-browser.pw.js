/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const dragToCenter = async (source, target, options = {}) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert(sourceBox && targetBox, 'drag endpoints must be visible', { sourceBox, targetBox });
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + Math.min(18, sourceBox.height / 2) };
    const end = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + Math.min(targetBox.height - 12, Math.max(28, targetBox.height / 2)),
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y + 8, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 28 });
    if (options.beforeDrop) await options.beforeDrop({ sourceBox, targetBox, start, end });
    await page.mouse.up();
  };
  const startHeldTouchAtPoint = async (point, holdMs = 650) => {
    const cdp = await page.context().newCDPSession(page);
    let current = { x: Math.round(point.x), y: Math.round(point.y) };
    let released = false;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);
    return {
      moveTo: async (target) => {
        const start = current;
        for (let step = 1; step <= 8; step += 1) {
          current = {
            x: Math.round(start.x + ((target.x - start.x) * step) / 8),
            y: Math.round(start.y + ((target.y - start.y) * step) / 8),
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: current.x, y: current.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
          });
          await page.waitForTimeout(28);
        }
      },
      end: async () => {
        if (released) return;
        released = true;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(320);
      },
    };
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const sourceWorkspace = {
    id: 'dev086-workspace-a',
    title: 'DEV-086 來源工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev086-board-a', title: '來源看板', dependencies: [], order: 0, createdAt: 1704067200000 },
    ],
  };
  const targetWorkspace = {
    id: 'dev086-workspace-b',
    title: 'DEV-086 目的工作區',
    ownerId: account.id,
    members: [account.id],
    order: 2,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev086-board-b', title: '目的看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, workspaceId, boardId, parentId, title, nodeType, order) => ({
    id,
    workspaceId,
    boardId,
    parentId,
    title,
    status: 'todo',
    nodeType,
    order,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  });
  const nodes = {
    'dev086-column-a': makeNode('dev086-column-a', sourceWorkspace.id, 'dev086-board-a', null, '來源欄', 'group', 0),
    'dev086-branch-root': makeNode('dev086-branch-root', sourceWorkspace.id, 'dev086-board-a', 'dev086-column-a', '跨工作區搬移父任務', 'task', 0),
    'dev086-child': makeNode('dev086-child', sourceWorkspace.id, 'dev086-board-a', 'dev086-branch-root', '規格確認', 'task', 0),
    'dev086-grandchild': makeNode('dev086-grandchild', sourceWorkspace.id, 'dev086-board-a', 'dev086-child', '驗證證據', 'task', 0),
    'dev086-l1-root': makeNode('dev086-l1-root', sourceWorkspace.id, 'dev086-board-a', null, 'L1 跨工作區列表', 'group', 1),
    'dev086-l1-child': makeNode('dev086-l1-child', sourceWorkspace.id, 'dev086-board-a', 'dev086-l1-root', 'L2 列表子任務', 'task', 0),
    'dev086-column-b': makeNode('dev086-column-b', targetWorkspace.id, 'dev086-board-b', null, '目的欄', 'group', 0),
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, sourceWorkspace, targetWorkspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([sourceWorkspace, targetWorkspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', sourceWorkspace.id);
    localStorage.setItem('projed-last-board', 'dev086-board-a');
    localStorage.setItem('projed-last-view', 'board');
    localStorage.setItem('projed-task-workbench-panel:v2:account:local-test-user', JSON.stringify({
      open: true,
      filtersOpen: false,
      showContainersInAllTasks: false,
      width: 350,
      openPreferenceVersion: 1,
    }));
    localStorage.setItem('projed-task-workbench-filters:v2:account:local-test-user', JSON.stringify({
      version: 2,
      selectedBoardId: 'dev086-board-a',
      filtersByBoardId: {},
    }));
  }, { account, sourceWorkspace, targetWorkspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  const panel = page.locator('[data-task-workbench-panel="true"]');
  const unplacedLane = panel.locator('[data-task-workbench-unplaced-lane="true"]');
  const placedLane = panel.locator('[data-task-workbench-placed-board-lane="true"]');
  await panel.waitFor({ state: 'visible', timeout: 15000 });

  const boardSource = page.locator('[data-task-surface-source="true"][data-task-id="dev086-branch-root"]').first();
  await boardSource.waitFor({ state: 'visible', timeout: 10000 });
  const boardSourceMeta = await boardSource.evaluate(element => ({
    dragSurface: element.getAttribute('data-task-drag-surface'),
    dragKind: element.getAttribute('data-task-drag-surface-kind'),
    className: element.getAttribute('class'),
    rect: element.getBoundingClientRect().toJSON(),
  }));
  const unplacedList = unplacedLane.locator('[data-task-workbench-unclassified-list="true"]');
  const listMetricsBeforePreview = await unplacedList.evaluate(element => {
    const empty = element.querySelector('[data-task-workbench-unplaced-empty-state="true"]');
    const listRect = element.getBoundingClientRect();
    const emptyRect = empty?.getBoundingClientRect();
    return {
      height: listRect.height,
      emptyTop: emptyRect?.top ?? null,
    };
  });
  let insertionPreviewEvidence = null;
  await dragToCenter(boardSource, unplacedLane, {
    beforeDrop: async ({ end }) => {
      const preview = unplacedLane.locator('[data-task-workbench-unplaced-insertion-preview="true"]');
      const sharedMarker = preview.locator('[data-kanban-insertion-marker="true"]');
      await preview.waitFor({ state: 'attached', timeout: 10000 });
      await sharedMarker.waitFor({ state: 'visible', timeout: 10000 });
      insertionPreviewEvidence = await preview.evaluate(element => {
        const list = element.closest('[data-task-workbench-unclassified-list="true"]');
        const marker = element.querySelector('[data-kanban-insertion-marker="true"]');
        const dot = marker?.querySelector('[data-kanban-insertion-dot="true"]');
        const bar = marker?.querySelector('[data-kanban-insertion-bar="true"]');
        const empty = list?.querySelector('[data-task-workbench-unplaced-empty-state="true"]');
        const listRect = list?.getBoundingClientRect();
        const markerRect = marker?.getBoundingClientRect();
        const dotRect = dot?.getBoundingClientRect();
        const barRect = bar?.getBoundingClientRect();
        const emptyRect = empty?.getBoundingClientRect();
        return {
          layer: element.getAttribute('data-task-workbench-insertion-preview-layer'),
          wrapperHeight: element.getBoundingClientRect().height,
          markerCount: marker ? 1 : 0,
          axis: marker?.getAttribute('data-kanban-insertion-axis'),
          dotCount: dot ? 1 : 0,
          barCount: bar ? 1 : 0,
          dotSize: dotRect ? { width: dotRect.width, height: dotRect.height } : null,
          barHeight: barRect?.height ?? null,
          listRect: listRect?.toJSON() ?? null,
          markerRect: markerRect?.toJSON() ?? null,
          emptyTop: emptyRect?.top ?? null,
        };
      });
      assert(insertionPreviewEvidence.layer === 'overlay' && insertionPreviewEvidence.wrapperHeight === 0, 'unplaced insertion preview must not consume list layout space', { insertionPreviewEvidence });
      assert(insertionPreviewEvidence.markerCount === 1 && insertionPreviewEvidence.axis === 'horizontal', 'unplaced preview should directly reuse the horizontal Kanban insertion marker', { insertionPreviewEvidence });
      assert(insertionPreviewEvidence.dotCount === 1 && insertionPreviewEvidence.barCount === 1, 'shared marker dot and bar should both render', { insertionPreviewEvidence });
      assert(Math.abs(insertionPreviewEvidence.dotSize.width - 8) <= 1 && Math.abs(insertionPreviewEvidence.dotSize.height - 8) <= 1 && Math.abs(insertionPreviewEvidence.barHeight - 6) <= 1, 'compact shared marker geometry should match the board component', { insertionPreviewEvidence });
      assert(Math.abs(insertionPreviewEvidence.listRect.height - listMetricsBeforePreview.height) <= 1 && insertionPreviewEvidence.emptyTop === listMetricsBeforePreview.emptyTop, 'preview must not shift the unplaced list or empty-state anchor', { listMetricsBeforePreview, insertionPreviewEvidence });
      assert(insertionPreviewEvidence.markerRect.left >= insertionPreviewEvidence.listRect.left && insertionPreviewEvidence.markerRect.right <= insertionPreviewEvidence.listRect.right + 1, 'preview line should remain inside the unplaced list width', { insertionPreviewEvidence });
      await page.screenshot({ path: 'output/playwright/dev-086/unplaced-insertion-preview-desktop.png', fullPage: true });

      const boardCanvas = page.locator('[data-layout-region="board-canvas"]');
      const boardCanvasBox = await boardCanvas.boundingBox();
      assert(boardCanvasBox, 'board canvas should be visible for preview leave/re-enter coverage');
      await page.mouse.move(boardCanvasBox.x + boardCanvasBox.width / 2, boardCanvasBox.y + boardCanvasBox.height / 2, { steps: 8 });
      await preview.waitFor({ state: 'detached', timeout: 5000 });
      await page.mouse.move(end.x, end.y, { steps: 12 });
      await preview.waitFor({ state: 'attached', timeout: 5000 });
      await sharedMarker.waitFor({ state: 'visible', timeout: 5000 });
    },
  });
  assert(insertionPreviewEvidence, 'unplaced insertion preview evidence should be collected before drop');
  assert(await unplacedLane.locator('[data-task-workbench-unplaced-insertion-preview="true"]').count() === 0, 'preview should clean up immediately after drop');

  const rootRow = unplacedLane.locator('[data-task-workbench-unplaced-task-card="true"][data-task-id="dev086-branch-root"]');
  await page.waitForTimeout(500);
  if (await rootRow.count() === 0) {
    const dragDebug = await page.evaluate(() => ({
      debug: window.__projedDesktopTaskDragDebug || [],
      overlayCount: document.querySelectorAll('[data-kanban-drag-overlay="true"]').length,
      stored: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev086-branch-root'] || null,
    }));
    throw new Error(`board task did not enter unplaced lane: ${JSON.stringify({ boardSourceMeta, dragDebug, diagnostics: diagnostics.slice(-20) })}`);
  }
  await rootRow.waitFor({ state: 'visible', timeout: 10000 });
  const hierarchyRows = unplacedLane.locator('[data-task-workbench-unplaced-task-card="true"]');
  const hierarchy = await hierarchyRows.evaluateAll(rows => rows.map(row => {
    const title = row.querySelector('[data-task-workbench-task-title="true"]');
    const rowRect = row.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      id: row.getAttribute('data-task-id'),
      depth: Number(row.getAttribute('data-task-workbench-hierarchy-depth')),
      rowHeight: rowRect.height,
      titleLeft: titleRect?.left ?? null,
      indentToken: getComputedStyle(row).getPropertyValue('--task-hierarchy-indent').trim(),
    };
  }));
  const movedRows = hierarchy.filter(row => ['dev086-branch-root', 'dev086-child', 'dev086-grandchild'].includes(row.id));
  assert(movedRows.length === 3, 'whole subtree should render in unplaced lane', { hierarchy });
  assert(movedRows.map(row => row.depth).join(',') === '0,1,2', 'unplaced rows should preserve hierarchy depth', { movedRows });
  assert(movedRows.every(row => row.rowHeight <= 21), 'compact hierarchy rows should stay near 20px', { movedRows });
  const indentA = movedRows[1].titleLeft - movedRows[0].titleLeft;
  const indentB = movedRows[2].titleLeft - movedRows[1].titleLeft;
  assert(Math.abs(indentA - 6) <= 1 && Math.abs(indentB - 6) <= 1, 'desktop indentation should be 6px per level', { indentA, indentB, movedRows });

  const populatedPreviewSource = page.locator('[data-kanban-column="true"][data-task-id="dev086-l1-root"] [data-kanban-column-header="true"]');
  let populatedInsertionPreviewEvidence = null;
  await dragToCenter(populatedPreviewSource, unplacedLane, {
    beforeDrop: async () => {
      const preview = unplacedLane.locator('[data-task-workbench-unplaced-insertion-preview="true"]');
      const marker = preview.locator('[data-kanban-insertion-marker="true"]');
      await marker.waitFor({ state: 'visible', timeout: 10000 });
      const markerRect = await marker.boundingBox();
      const lastRowRect = await hierarchyRows.last().boundingBox();
      assert(markerRect && lastRowRect, 'populated append preview and last unplaced row should have visible boxes', { markerRect, lastRowRect });
      populatedInsertionPreviewEvidence = {
        markerCenterY: markerRect.y + markerRect.height / 2,
        lastRowBottom: lastRowRect.y + lastRowRect.height,
      };
      assert(Math.abs(populatedInsertionPreviewEvidence.markerCenterY - populatedInsertionPreviewEvidence.lastRowBottom) <= 1, 'populated marker should sit exactly on the append boundary after the last unplaced row', { populatedInsertionPreviewEvidence });
      await page.screenshot({ path: 'output/playwright/dev-086/unplaced-insertion-preview-populated.png', fullPage: true });
    },
  });
  assert(populatedInsertionPreviewEvidence, 'populated append preview evidence should be collected');
  const l1UnplacedRoot = unplacedLane.locator('[data-task-workbench-unplaced-task-card="true"][data-task-id="dev086-l1-root"]');
  const l1UnplacedChild = unplacedLane.locator('[data-task-workbench-unplaced-task-card="true"][data-task-id="dev086-l1-child"]');
  await l1UnplacedRoot.waitFor({ state: 'visible', timeout: 10000 });
  await l1UnplacedChild.waitFor({ state: 'visible', timeout: 10000 });
  assert(await l1UnplacedRoot.getAttribute('data-task-workbench-hierarchy-depth') === '0', 'L1 group should remain a visible unplaced root');
  assert(await l1UnplacedChild.getAttribute('data-task-workbench-hierarchy-depth') === '1', 'L2 child should move with its L1 group');

  const rootBranch = unplacedLane.locator('[data-task-hover-scope-source-id="dev086-branch-root"]');
  const rootSubtree = rootBranch.locator(':scope > [data-task-surface-subtree="true"]');
  await rootRow.hover();
  await page.waitForTimeout(100);
  const hoverVisual = await page.evaluate(() => {
    const row = document.querySelector('[data-task-workbench-unplaced-task-card="true"][data-task-id="dev086-branch-root"]');
    const subtree = document.querySelector('[data-task-hover-scope-source-id="dev086-branch-root"] > [data-task-surface-subtree="true"]');
    return {
      rowShadow: row ? getComputedStyle(row).boxShadow : null,
      subtreeShadow: subtree ? getComputedStyle(subtree).boxShadow : null,
      summaryTextCount: Array.from(document.querySelectorAll('[data-task-drag-scope-summary="true"]')).filter(element => element.textContent?.includes('子任務')).length,
    };
  });
  assert(hoverVisual.rowShadow && hoverVisual.rowShadow !== 'none', 'hover should frame the source row', { hoverVisual });
  assert(hoverVisual.subtreeShadow && hoverVisual.subtreeShadow !== 'none', 'hover should frame the complete descendant subtree', { hoverVisual });
  assert(hoverVisual.summaryTextCount === 0, 'subtree scope should not use descendant-count text', { hoverVisual });
  assert(await rootSubtree.count() === 1, 'root should own one subtree surface');
  await page.screenshot({ path: 'output/playwright/dev-086/unplaced-subtree-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(120);
  const narrowIndentToken = await rootRow.evaluate(row => getComputedStyle(row).getPropertyValue('--task-hierarchy-indent').trim());
  assert(narrowIndentToken === '5px', 'narrow viewport indentation should reduce to 5px', { narrowIndentToken });
  await page.screenshot({ path: 'output/playwright/dev-086/unplaced-subtree-narrow.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.locator('[data-task-workbench-filter-toggle="true"]').click();
  const boardSelect = panel.locator('[data-task-workbench-board-select="true"]');
  await boardSelect.waitFor({ state: 'visible', timeout: 5000 });
  await boardSelect.selectOption('dev086-board-b');
  await panel.locator('[data-task-workbench-filter-toggle="true"]').click();
  await page.waitForTimeout(80);
  assert(await placedLane.getAttribute('data-board-id') === 'dev086-board-b', 'placed lane should follow selected destination board');

  await dragToCenter(rootRow, placedLane);
  await rootRow.waitFor({ state: 'hidden', timeout: 10000 });
  const placedRoot = placedLane.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev086-branch-root"]');
  await placedRoot.waitFor({ state: 'visible', timeout: 10000 });
  assert(await placedRoot.getAttribute('data-task-workbench-readonly-task-card') === 'true', 'placed workbench row must remain read-only');
  assert(await placedRoot.getAttribute('data-task-workbench-drag-surface') === null, 'placed workbench row must not become a drag source');

  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return stored['dev086-branch-root']?.boardId === 'dev086-board-b'
      && stored['dev086-child']?.boardId === 'dev086-board-b'
      && stored['dev086-grandchild']?.boardId === 'dev086-board-b';
  }, null, { timeout: 10000 });
  const persisted = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return ['dev086-branch-root', 'dev086-child', 'dev086-grandchild'].map(id => ({
      id,
      workspaceId: stored[id]?.workspaceId,
      boardId: stored[id]?.boardId,
      parentId: stored[id]?.parentId ?? null,
    }));
  });
  assert(persisted.every(node => node.workspaceId === targetWorkspace.id), 'restored subtree should move across workspaces', { persisted });
  assert(persisted.map(node => node.parentId).join(',') === ',dev086-branch-root,dev086-child', 'restored subtree should preserve parent links', { persisted });

  await panel.locator('[data-task-workbench-filter-toggle="true"]').click();
  const showContainersToggle = panel.locator('[data-task-workbench-show-containers-toggle="true"]');
  await showContainersToggle.waitFor({ state: 'visible', timeout: 5000 });
  if (!(await showContainersToggle.isChecked())) {
    await showContainersToggle.evaluate(input => input.click());
  }
  assert(await showContainersToggle.isChecked(), 'L1 restore fixture must enable container rows');
  await panel.locator('[data-task-workbench-filter-toggle="true"]').click();

  await dragToCenter(l1UnplacedRoot, placedLane);
  await l1UnplacedRoot.waitFor({ state: 'hidden', timeout: 10000 });
  const placedL1 = placedLane.locator('[data-task-workbench-placed-task-card="true"][data-task-id="dev086-l1-root"]');
  await placedL1.waitFor({ state: 'visible', timeout: 10000 });
  assert(await placedL1.getAttribute('data-task-workbench-readonly-task-card') === 'true', 'restored L1 row must remain read-only in placed results');
  assert(await placedL1.getAttribute('data-task-workbench-drag-surface') === null, 'restored L1 row must not become a workbench drag source');
  const persistedL1 = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return ['dev086-l1-root', 'dev086-l1-child'].map(id => ({
      id,
      workspaceId: stored[id]?.workspaceId,
      boardId: stored[id]?.boardId,
      parentId: stored[id]?.parentId ?? null,
      nodeType: stored[id]?.nodeType,
    }));
  });
  assert(persistedL1.every(node => node.workspaceId === targetWorkspace.id && node.boardId === 'dev086-board-b'), 'L1 subtree should restore across workspaces', { persistedL1 });
  assert(persistedL1[0].parentId === null && persistedL1[0].nodeType === 'group', 'L1 root placement identity should be preserved', { persistedL1 });
  assert(persistedL1[1].parentId === 'dev086-l1-root', 'L2 child parent should survive L1 transfer', { persistedL1 });
  await page.screenshot({ path: 'output/playwright/dev-086/restored-subtree-board-b.png', fullPage: true });

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

  const mobileResults = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(({ account, sourceWorkspace, targetWorkspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([sourceWorkspace, targetWorkspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', sourceWorkspace.id);
      localStorage.setItem('projed-last-board', 'dev086-board-a');
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
        selectedBoardId: 'dev086-board-a',
        filtersByBoardId: {},
      }));
    }, { account, sourceWorkspace, targetWorkspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
    const emulation = await page.context().newCDPSession(page);
    await emulation.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const mobilePanel = page.locator('[data-task-workbench-panel="true"]');
    const mobileUnplacedLane = mobilePanel.locator('[data-task-workbench-unplaced-lane="true"]');
    const mobileUnplacedList = mobileUnplacedLane.locator('[data-task-workbench-unclassified-list="true"]');
    const mobileSource = page.locator('[data-task-surface-source="true"][data-task-id="dev086-branch-root"]').first();
    await mobilePanel.waitFor({ state: 'visible', timeout: 15000 });
    await mobileSource.waitFor({ state: 'visible', timeout: 10000 });

    const panelBox = await mobilePanel.boundingBox();
    const sourceBox = await mobileSource.boundingBox();
    const listBox = await mobileUnplacedList.boundingBox();
    assert(panelBox && sourceBox && listBox, 'mobile staging endpoints must have rendered boxes', {
      viewport,
      panelBox,
      sourceBox,
      listBox,
    });
    const visibleSourceLeft = Math.max(sourceBox.x, panelBox.x + panelBox.width, 0);
    const visibleSourceRight = Math.min(sourceBox.x + sourceBox.width, viewport.width);
    assert(visibleSourceRight - visibleSourceLeft >= 8, 'inline Workbench must preserve a touchable board source strip', {
      viewport,
      panelBox,
      sourceBox,
      visibleSourceLeft,
      visibleSourceRight,
    });
    const sourcePoint = {
      x: Math.round((visibleSourceLeft + visibleSourceRight) / 2),
      y: Math.round(sourceBox.y + Math.min(sourceBox.height / 2, 18)),
    };
    const targetPoint = {
      x: Math.round(listBox.x + listBox.width / 2),
      y: Math.round(listBox.y + Math.min(Math.max(28, listBox.height * 0.35), listBox.height - 12)),
    };
    const listMetricsBefore = await mobileUnplacedList.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
    }));

    const held = await startHeldTouchAtPoint(sourcePoint);
    await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await held.moveTo(targetPoint);
    const mobileIndicator = page.locator(
      '[data-mobile-drop-indicator="true"][data-mobile-drop-target-kind="workbench-unplaced-lane"]',
    );
    await mobileIndicator.waitFor({ state: 'visible', timeout: 5000 });
    const mobileMarker = mobileIndicator.locator('[data-kanban-insertion-marker="true"]');
    await mobileMarker.waitFor({ state: 'visible', timeout: 5000 });
    const previewGeometry = await mobileIndicator.evaluate((indicator) => {
      const marker = indicator.querySelector('[data-kanban-insertion-marker="true"]');
      const list = document.querySelector('[data-task-workbench-unclassified-list="true"]');
      const markerRect = marker?.getBoundingClientRect();
      const listRect = list?.getBoundingClientRect();
      return {
        targetKind: indicator.getAttribute('data-mobile-drop-target-kind'),
        surfaceKind: indicator.getAttribute('data-mobile-drop-surface-kind'),
        axis: indicator.getAttribute('data-mobile-drop-axis'),
        markerAxis: marker?.getAttribute('data-kanban-insertion-axis') || null,
        markerRect: markerRect?.toJSON() || null,
        listRect: listRect?.toJSON() || null,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert(
      previewGeometry.targetKind === 'workbench-unplaced-lane'
        && previewGeometry.surfaceKind === 'workbench-unplaced-lane'
        && previewGeometry.axis === 'horizontal'
        && previewGeometry.markerAxis === 'horizontal',
      'mobile unplaced target must render the shared horizontal insertion marker',
      { viewport, previewGeometry },
    );
    assert(
      previewGeometry.markerRect
        && previewGeometry.listRect
        && previewGeometry.markerRect.left >= previewGeometry.listRect.left - 1
        && previewGeometry.markerRect.right <= previewGeometry.listRect.right + 1
        && Math.abs(
          previewGeometry.markerRect.top + previewGeometry.markerRect.height / 2 - previewGeometry.listRect.top,
        ) <= 1,
      'empty mobile marker must align with the first unplaced append boundary without overflow',
      { viewport, previewGeometry },
    );
    assert(previewGeometry.documentOverflow <= 1, 'mobile marker must not create document-level overflow', {
      viewport,
      previewGeometry,
    });
    const previewScreenshot = `output/playwright/dev-086/unplaced-insertion-preview-mobile-${viewport.width}.png`;
    await page.screenshot({ path: previewScreenshot, fullPage: false });
    await held.end();

    const mobileRootRow = mobileUnplacedLane.locator(
      '[data-task-workbench-unplaced-task-card="true"][data-task-id="dev086-branch-root"]',
    );
    await mobileRootRow.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const stored = JSON.parse(localStorage.getItem(
        'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
      ) || '[]');
      return ['dev086-branch-root', 'dev086-child', 'dev086-grandchild']
        .every(id => stored.some(task => task.id === id && task.boardId === '__task_workbench_unplaced__'));
    }, null, { timeout: 10000 });
    const mobileHierarchy = await mobileUnplacedLane
      .locator('[data-task-workbench-unplaced-task-card="true"]')
      .evaluateAll(rows => rows
        .filter(row => ['dev086-branch-root', 'dev086-child', 'dev086-grandchild'].includes(row.getAttribute('data-task-id')))
        .map(row => ({
          id: row.getAttribute('data-task-id'),
          depth: Number(row.getAttribute('data-task-workbench-hierarchy-depth')),
          touchGesture: row.getAttribute('data-task-touch-gesture-surface'),
        })));
    const mobilePersisted = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem(
        'projed-task-workbench-unplaced-tasks:v1:account:local-test-user',
      ) || '[]');
      return ['dev086-branch-root', 'dev086-child', 'dev086-grandchild'].map(id => ({
        id,
        boardId: stored.find(task => task.id === id)?.boardId,
        parentId: stored.find(task => task.id === id)?.parentId ?? null,
      }));
    });
    const transient = await page.evaluate(() => ({
      indicator: document.querySelectorAll('[data-mobile-drop-indicator="true"]').length,
      preview: document.querySelectorAll('[data-mobile-drag-preview="true"]').length,
      actionRail: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
    }));
    const listMetricsAfter = await mobileUnplacedList.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
    }));
    assert(mobileHierarchy.length === 3 && mobileHierarchy.map(row => row.depth).join(',') === '0,1,2', 'mobile drop must render the complete subtree at depths 0/1/2', { viewport, mobileHierarchy });
    assert(mobilePersisted.map(node => node.parentId).join(',') === ',dev086-branch-root,dev086-child', 'mobile subtree staging must preserve descendant parent links', { viewport, mobilePersisted });
    assert(transient.indicator === 0 && transient.preview === 0 && transient.actionRail === 0, 'mobile drop must clean all transient drag UI', { viewport, transient });
    assert(Math.abs(listMetricsBefore.height - listMetricsAfter.height) <= 1, 'fixed mobile marker must not resize the unplaced list', { viewport, listMetricsBefore, listMetricsAfter });
    const visibleErrors = await page.evaluate(() => Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map(element => element.textContent?.trim() || 'visible error'));
    assert(visibleErrors.length === 0, 'mobile staging screen must not expose visible errors', { viewport, visibleErrors });
    const subtreeScreenshot = `output/playwright/dev-086/unplaced-subtree-mobile-${viewport.width}.png`;
    await page.screenshot({ path: subtreeScreenshot, fullPage: false });

    let mobileRestore = null;
    if (viewport.width === 390) {
      await mobilePanel.locator('[data-task-workbench-filter-toggle="true"]').click();
      const mobileBoardSelect = mobilePanel.locator('[data-task-workbench-board-select="true"]');
      await mobileBoardSelect.selectOption('dev086-board-b');
      await mobilePanel.locator('[data-task-workbench-filter-toggle="true"]').click();
      const mobilePlacedLane = mobilePanel.locator('[data-task-workbench-placed-board-lane="true"]');
      const rootBox = await mobileRootRow.boundingBox();
      const placedBox = await mobilePlacedLane.boundingBox();
      assert(rootBox && placedBox, 'mobile cross-workspace restore endpoints must be visible', { rootBox, placedBox });
      const restoreHeld = await startHeldTouchAtPoint({
        x: Math.round(rootBox.x + rootBox.width / 2),
        y: Math.round(rootBox.y + rootBox.height / 2),
      });
      await restoreHeld.moveTo({
        x: Math.round(placedBox.x + placedBox.width / 2),
        y: Math.round(placedBox.y + Math.min(Math.max(28, placedBox.height * 0.35), placedBox.height - 12)),
      });
      await restoreHeld.end();
      await mobileRootRow.waitFor({ state: 'hidden', timeout: 10000 });
      mobileRestore = await page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        return ['dev086-branch-root', 'dev086-child', 'dev086-grandchild'].map(id => ({
          id,
          workspaceId: stored[id]?.workspaceId,
          boardId: stored[id]?.boardId,
          parentId: stored[id]?.parentId ?? null,
        }));
      });
      assert(mobileRestore.every(node => node.workspaceId === 'dev086-workspace-b' && node.boardId === 'dev086-board-b'), 'mobile restore must move the complete subtree to the selected cross-workspace board', { mobileRestore });
      assert(mobileRestore.map(node => node.parentId).join(',') === ',dev086-branch-root,dev086-child', 'mobile restore must preserve descendant parent links', { mobileRestore });
      await page.screenshot({ path: 'output/playwright/dev-086/restored-subtree-mobile-390.png', fullPage: false });
    }

    mobileResults.push({
      viewport: `${viewport.width}x${viewport.height}`,
      sourcePoint,
      targetPoint,
      previewGeometry,
      mobileHierarchy,
      mobilePersisted,
      mobileRestore,
      transient,
      visibleErrors,
      previewScreenshot,
      subtreeScreenshot,
    });
    await emulation.detach().catch(() => undefined);
  }

  const runtimeErrors = diagnostics.filter(entry => entry.startsWith('pageerror:'));
  assert(runtimeErrors.length === 0, 'browser flow should not raise runtime errors', { diagnostics: diagnostics.slice(-20) });
  const artifact = {
    passed: true,
    hierarchy,
    hoverVisual,
    insertionPreviewEvidence,
    populatedInsertionPreviewEvidence,
    narrowIndentToken,
    persisted,
    persistedL1,
    mobileResults,
  };
  await page.evaluate(value => { window.__DEV086_ARTIFACT = value; }, artifact);
  console.log(JSON.stringify(artifact, null, 2));
}
