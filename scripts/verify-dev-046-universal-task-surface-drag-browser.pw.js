/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const screenshotBase = `output/playwright/dev-046-universal-task-surface-drag-${Date.now()}`;

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
    id: 'dev046-workspace',
    title: 'DEV-046 Surface Drag 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev046-board', title: '全任務表面拖曳驗證', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const createNodes = () => ({
    'dev046-col-a': {
      id: 'dev046-col-a',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 A',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-b': {
      id: 'dev046-col-b',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 B',
      status: 'todo',
      nodeType: 'group',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-c': {
      id: 'dev046-col-c',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 C',
      status: 'todo',
      nodeType: 'group',
      order: 2,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-d': {
      id: 'dev046-col-d',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 D',
      status: 'todo',
      nodeType: 'group',
      order: 3,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-e': {
      id: 'dev046-col-e',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 E',
      status: 'todo',
      nodeType: 'group',
      order: 4,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-f': {
      id: 'dev046-col-f',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 F',
      status: 'todo',
      nodeType: 'group',
      order: 5,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-col-g': {
      id: 'dev046-col-g',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: null,
      title: 'DEV-046 列表 G',
      status: 'todo',
      nodeType: 'group',
      order: 6,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-card-a': {
      id: 'dev046-card-a',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-col-a',
      title: 'DEV-046 卡片 A',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-08',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-card-b': {
      id: 'dev046-card-b',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-col-a',
      title: 'DEV-046 卡片 B',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      endDate: '2099-07-09',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-card-c': {
      id: 'dev046-card-c',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-col-b',
      title: 'DEV-046 卡片 C',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-10',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-child-a': {
      id: 'dev046-child-a',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-card-a',
      title: 'DEV-046 子任務 A',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-11',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-child-b': {
      id: 'dev046-child-b',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-card-a',
      title: 'DEV-046 子任務 B',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      endDate: '2099-07-12',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-grandchild-a': {
      id: 'dev046-grandchild-a',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-child-a',
      title: 'DEV-046 孫任務 A',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-13',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev046-grandchild-b': {
      id: 'dev046-grandchild-b',
      workspaceId: workspace.id,
      boardId: 'dev046-board',
      parentId: 'dev046-grandchild-a',
      title: 'DEV-046 Level 4 任務 B',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-14',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  });

  const setCoarsePointer = async () => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
      } catch (_) {}
      if (window.__projedDev046CoarsePointerPatched) return;
      window.__projedDev046CoarsePointerPatched = true;
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
  };

  const seed = async (lastView = 'board') => {
    await page.evaluate(({ account, workspace, nodes, lastView }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev046-board');
      localStorage.setItem('projed-last-view', lastView);
    }, { account, workspace, nodes: createNodes(), lastView });
  };

  const openApp = async (viewport = { width: 1440, height: 900 }, lastView = 'board') => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seed(lastView);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const switchMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const cleanupUi = async () => {
    await page.mouse.up().catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
    const closeButton = page.locator('[data-task-details-modal="true"] button[title="關閉"]').first();
    if (await closeButton.count()) {
      await closeButton.click({ timeout: 1000 }).catch(() => undefined);
    }
    await page.waitForTimeout(120);
  };

  const centerPoint = async (locator, ratioX = 0.5, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'target should have a bounding box');
    return {
      x: Math.round(box.x + box.width * ratioX),
      y: Math.round(box.y + box.height * ratioY),
      localX: Math.max(4, Math.round(box.width * ratioX)),
      localY: Math.max(4, Math.round(box.height * ratioY)),
      box,
    };
  };

  const dragBetween = async (source, target, options = {}) => {
    const start = await centerPoint(source, options.startRatioX ?? 0.58, options.startRatioY ?? 0.45);
    const end = await centerPoint(target, options.endRatioX ?? 0.5, options.endRatioY ?? 0.2);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 3, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  };

  const orderInColumn = async (columnId) => page.evaluate((columnId) => {
    const header = document.querySelector(`[data-kanban-column-header="true"][data-task-id="${columnId}"]`);
    const column = header?.closest('[data-kanban-column="true"]');
    return Array.from(column?.querySelectorAll('.kanban-task-card[data-task-id]') || [])
      .map((item) => item.getAttribute('data-task-id'));
  }, columnId);

  const checklistOrderInCard = async (cardId) => page.evaluate((cardId) => {
    const card = document.querySelector(`.kanban-task-card[data-task-id="${cardId}"]`);
    return Array.from(card?.querySelectorAll('.kanban-checklist-item[data-task-id]') || [])
      .map((item) => item.getAttribute('data-task-id'));
  }, cardId);

  const rootListOrder = async () => page.locator('[data-task-drag-surface-kind="wbs-list-row"]').evaluateAll((items) =>
    items
      .filter((item) => {
        const title = item.textContent || '';
        return title.includes('DEV-046 列表 A') || title.includes('DEV-046 列表 B');
      })
      .map((item) => item.getAttribute('data-task-id'))
  );

  const columnOrder = async () => page.locator('[data-kanban-column-header="true"][data-task-id]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-task-id'))
  );

  const dispatchTouchGesture = async (locator, { dx = 0, dy = 0, holdMs = 0, ratioX = 0.45, ratioY = 0.35 } = {}) => {
    const point = await centerPoint(locator, ratioX, ratioY);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    if (dx || dy) {
      for (let i = 1; i <= 4; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{
            x: Math.round(point.x + (dx * i) / 4),
            y: Math.round(point.y + (dy * i) / 4),
            radiusX: 4,
            radiusY: 4,
            force: 1,
            id: 1,
          }],
        });
        await page.waitForTimeout(25);
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => undefined);
    await page.waitForTimeout(220);
  };

  const startHeldTouch = async (locator, { holdMs = 650, ratioX = 0.45, ratioY = 0.3 } = {}) => {
    const point = await centerPoint(locator, ratioX, ratioY);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);
    return {
      point,
      end: async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(220);
      },
      cancel: async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => undefined);
        await cdp.detach().catch(() => undefined);
        await page.waitForTimeout(220);
      },
    };
  };

  const assertNoHandles = async (scope, message) => {
    const handleCount = await scope.locator('[data-task-drag-handle="true"]').count();
    assert(handleCount === 0, message, { handleCount });
  };

  const assertSurfaceSamplePoints = async (locator, message) => {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    assert(await locator.getAttribute('data-task-drag-surface') === 'true', `${message} should expose data-task-drag-surface`);
    for (const ratioX of [0.25, 0.55, 0.82]) {
      const point = await centerPoint(locator, ratioX, 0.48);
      const hit = await locator.evaluate((element, point) => {
        const hitNode = document.elementFromPoint(point.x, point.y);
        return {
          inside: Boolean(hitNode && element.contains(hitNode)),
          tag: hitNode?.tagName || null,
          text: hitNode?.textContent?.trim().slice(0, 80) || '',
        };
      }, { x: point.x, y: point.y });
      assert(hit.inside, `${message} sample point should hit inside task root`, { ratioX, point, hit });
    }
  };

  const assertNoTaskAction = async (message) => {
    const state = {
      modalCount: await page.locator('[data-task-details-modal="true"]').count(),
      railCount: await page.locator('[data-mobile-task-action-rail="true"]').count(),
      menuCount: await page.getByText('更多詳情選項').count(),
      renameCount: await page.getByText('重新命名任務', { exact: true }).count(),
    };
    assert(state.modalCount === 0 && state.railCount === 0 && state.menuCount === 0 && state.renameCount === 0, message, state);
  };

  const assertCompactMobileActionRail = async (sourceLocator, message) => {
    const sourceBox = await sourceLocator.boundingBox();
    const layout = await page.evaluate(() => {
      const rail = document.querySelector('[data-mobile-task-action-rail="true"]');
      const actions = Array.from(document.querySelectorAll('[data-mobile-task-action]'));
      const railRect = rail?.getBoundingClientRect();
      const rects = actions.map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          svgCount: item.querySelectorAll('svg').length,
        };
      });
      const top = rects[0]?.top ?? 0;
      const bottom = rects[0]?.bottom ?? 0;
      const gaps = rects.slice(1).map((rect, index) => rect.left - rects[index].right);
      return {
        viewportWidth: window.innerWidth,
        rail: railRect ? {
          left: railRect.left,
          right: railRect.right,
          top: railRect.top,
          bottom: railRect.bottom,
          height: railRect.height,
        } : null,
        actionCount: actions.length,
        svgCount: actions.reduce((total, item) => total + item.querySelectorAll('svg').length, 0),
        maxTopDelta: rects.reduce((max, rect) => Math.max(max, Math.abs(rect.top - top)), 0),
        maxBottomDelta: rects.reduce((max, rect) => Math.max(max, Math.abs(rect.bottom - bottom)), 0),
        maxAdjacentGap: gaps.length ? Math.max(...gaps) : 0,
        minAdjacentGap: gaps.length ? Math.min(...gaps) : 0,
      };
    });
    assert(Boolean(layout.rail), `${message} should render compact mobile action rail`, layout);
    assert(layout.actionCount === 4, `${message} should keep four mobile actions`, layout);
    assert(layout.svgCount === 0, `${message} should not render rail icons`, layout);
    assert(layout.rail.height <= 48, `${message} rail should stay compact`, layout);
    assert(layout.maxTopDelta <= 1.5 && layout.maxBottomDelta <= 1.5, `${message} actions should stay on one row`, layout);
    assert(layout.maxAdjacentGap <= 1.5 && layout.minAdjacentGap >= -1.5, `${message} actions should have no visible gap`, layout);
    assert(layout.rail.left >= -1 && layout.rail.right <= layout.viewportWidth + 1, `${message} rail should not overflow horizontally`, layout);
    if (sourceBox) {
      const overlapPx = Math.max(0, layout.rail.bottom - sourceBox.y);
      assert(overlapPx <= 1, `${message} rail should not cover the source task`, { layout, sourceBox, overlapPx });
    }
    return layout;
  };

  const runCase = async (id, scenario, fn) => {
    const startedAt = new Date().toISOString();
    try {
      const details = await fn();
      results.push({ id, scenario, result: 'PASS', startedAt, details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', startedAt, error: error.message, screenshotPath });
    } finally {
      await cleanupUi();
    }
  };

  try {
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(20000);

    await runCase('QA-046-D01', 'desktop WBS list rows drag from the whole task surface at all hierarchy levels', async () => {
      await openApp({ width: 1440, height: 900 }, 'list');
      await switchMode('list');
      await page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-col-a"]').waitFor({ state: 'visible', timeout: 10000 });
      await assertNoHandles(page, 'WBS list should not render visible drag handles');

      await assertSurfaceSamplePoints(page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-col-a"]').first(), 'top-level WBS row');
      await assertSurfaceSamplePoints(page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-card-a"]').first(), 'child WBS row');
      await assertSurfaceSamplePoints(page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-grandchild-a"]').first(), 'grandchild WBS row');

      const before = await rootListOrder();
      await dragBetween(
        page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-col-b"]').first(),
        page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev046-col-a"]').first(),
        { startRatioX: 0.24, endRatioX: 0.24, endRatioY: 0.35 },
      );
      await page.waitForFunction(() => {
        const rows = Array.from(document.querySelectorAll('[data-task-drag-surface-kind="wbs-list-row"]'))
          .filter((item) => (item.textContent || '').includes('DEV-046 列表 A') || (item.textContent || '').includes('DEV-046 列表 B'))
          .map((item) => item.getAttribute('data-task-id'));
        return rows[0] === 'dev046-col-b';
      }, null, { timeout: 7000 });
      const after = await rootListOrder();
      return { before, after };
    });

    await runCase('QA-046-D02', 'desktop board cards, checklist rows, and list headers drag from task body surfaces', async () => {
      await openApp({ width: 1440, height: 900 }, 'board');
      await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 10000 });
      await assertNoHandles(page, 'board should not render visible drag handles');

      await assertSurfaceSamplePoints(page.locator('.kanban-task-card[data-task-id="dev046-card-a"]').first(), 'kanban card');
      await assertSurfaceSamplePoints(page.locator('.kanban-checklist-item[data-task-id="dev046-child-a"]').first(), 'checklist row');
      await assertSurfaceSamplePoints(page.locator('.kanban-checklist-item[data-task-id="dev046-grandchild-a"]').first(), 'deep checklist row');
      await assertSurfaceSamplePoints(page.locator('[data-kanban-column-header="true"][data-task-id="dev046-col-a"]').first(), 'kanban list header');

      const checklistBefore = await checklistOrderInCard('dev046-card-a');
      await dragBetween(
        page.locator('.kanban-checklist-item[data-task-id="dev046-child-b"]').first(),
        page.locator('.kanban-checklist-item[data-task-id="dev046-child-a"]').first(),
        { startRatioX: 0.7, endRatioY: 0.2 },
      );
      await page.waitForFunction(() => {
        const card = document.querySelector('.kanban-task-card[data-task-id="dev046-card-a"]');
        const ids = Array.from(card?.querySelectorAll('.kanban-checklist-item[data-task-id]') || [])
          .map((item) => item.getAttribute('data-task-id'));
        return ids.indexOf('dev046-child-b') >= 0 && ids.indexOf('dev046-child-b') < ids.indexOf('dev046-child-a');
      }, null, { timeout: 7000 });
      const checklistAfter = await checklistOrderInCard('dev046-card-a');

      const cardBefore = await orderInColumn('dev046-col-a');
      await dragBetween(
        page.locator('.kanban-task-card[data-task-id="dev046-card-b"]').first(),
        page.locator('.kanban-task-card[data-task-id="dev046-card-a"]').first(),
        { startRatioX: 0.72, endRatioY: 0.18 },
      );
      await page.waitForFunction(() => {
        const header = document.querySelector('[data-kanban-column-header="true"][data-task-id="dev046-col-a"]');
        const column = header?.closest('[data-kanban-column="true"]');
        const ids = Array.from(column?.querySelectorAll('.kanban-task-card[data-task-id]') || [])
          .map((item) => item.getAttribute('data-task-id'));
        return ids[0] === 'dev046-card-b';
      }, null, { timeout: 7000 });
      const cardAfter = await orderInColumn('dev046-col-a');

      const columnBefore = await columnOrder();
      await dragBetween(
        page.locator('[data-kanban-column-header="true"][data-task-id="dev046-col-b"]').first(),
        page.locator('[data-kanban-column-header="true"][data-task-id="dev046-col-a"]').first(),
        { startRatioX: 0.6, endRatioX: 0.2, endRatioY: 0.35 },
      );
      await page.waitForFunction(() => {
        const ids = Array.from(document.querySelectorAll('[data-kanban-column-header="true"][data-task-id]'))
          .map((item) => item.getAttribute('data-task-id'));
        return ids[0] === 'dev046-col-b';
      }, null, { timeout: 7000 });
      const columnAfter = await columnOrder();

      await page.screenshot({ path: `${screenshotBase}-desktop-board.png`, fullPage: true });
      return { checklistBefore, checklistAfter, cardBefore, cardAfter, columnBefore, columnAfter };
    });

    await runCase('QA-046-D03', 'interactive controls do not become drag handles or open details accidentally', async () => {
      await openApp({ width: 1440, height: 900 }, 'board');
      const card = page.locator('.kanban-task-card[data-task-id="dev046-card-a"]').first();
      const toggle = card.locator('.kanban-checklist-toggle').first();
      const beforeExpandedRows = await card.locator('.kanban-checklist-item[data-task-id]').count();
      await toggle.click();
      await page.waitForTimeout(200);
      const afterCollapsedRows = await card.locator('.kanban-checklist-item[data-task-id]').count();
      assert(afterCollapsedRows < beforeExpandedRows, 'checklist toggle should remain a button action, not a drag start', { beforeExpandedRows, afterCollapsedRows });
      await assertNoTaskAction('toggle click should not open details, context menu, or mobile rail');
    });

    await runCase('QA-046-D04', 'desktop board blank canvas supports mouse drag horizontal pan without stealing task drag surfaces', async () => {
      await openApp({ width: 900, height: 720 }, 'board');
      const board = page.locator('[data-kanban-mouse-pan-surface="true"]').first();
      await board.waitFor({ state: 'visible', timeout: 10000 });
      const overflow = await board.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        maxScrollLeft: element.scrollWidth - element.clientWidth,
        initialState: element.getAttribute('data-kanban-mouse-pan-state'),
      }));
      assert(overflow.maxScrollLeft > 220, 'board fixture should overflow horizontally for mouse pan', overflow);

      await board.evaluate((element) => { element.scrollLeft = 80; });
      const beforePan = await board.evaluate((element) => element.scrollLeft);
      const gapPoint = await board.evaluate((element) => {
        const surface = element;
        const surfaceRect = surface.getBoundingClientRect();
        const columns = Array.from(surface.querySelectorAll('[data-kanban-column="true"]'))
          .map((item) => item.getBoundingClientRect())
          .filter((rect) => rect.right > surfaceRect.left && rect.left < surfaceRect.right)
          .sort((left, right) => left.left - right.left);

        for (let index = 0; index < columns.length - 1; index += 1) {
          const left = columns[index];
          const right = columns[index + 1];
          if (right.left - left.right < 6) continue;
          const x = Math.round((left.right + right.left) / 2);
          const y = Math.round(Math.min(Math.max(left.top + 22, surfaceRect.top + 18), surfaceRect.bottom - 24));
          const hit = document.elementFromPoint(x, y);
          const blocked = Boolean(hit?.closest?.('[data-task-drag-surface="true"],button,a,input,textarea,select,[contenteditable="true"]'));
          if (hit && surface.contains(hit) && !blocked) {
            return { x, y, hitTag: hit.tagName, hitClassName: String(hit.className || '').slice(0, 80) };
          }
        }
        return null;
      });
      assert(Boolean(gapPoint), 'board should expose a non-task gap that can start mouse pan', { gapPoint });

      await page.mouse.move(gapPoint.x, gapPoint.y);
      await page.mouse.down();
      await page.mouse.move(gapPoint.x - 260, gapPoint.y + 2, { steps: 16 });
      await page.mouse.up();
      await page.waitForTimeout(180);
      const afterPan = await board.evaluate((element) => ({
        scrollLeft: element.scrollLeft,
        state: element.getAttribute('data-kanban-mouse-pan-state'),
      }));
      assert(afterPan.scrollLeft > beforePan + 120, 'blank board drag should pan horizontally', { beforePan, afterPan, gapPoint });
      assert(afterPan.state === 'idle', 'mouse pan state should reset after pointerup', afterPan);
      await assertNoTaskAction('blank board mouse pan should not open task UI');

      const card = page.locator('.kanban-task-card[data-task-id="dev046-card-a"]').first();
      const cardPoint = await centerPoint(card, 0.56, 0.36);
      const beforeCardDrag = await board.evaluate((element) => element.scrollLeft);
      await page.mouse.move(cardPoint.x, cardPoint.y);
      await page.mouse.down();
      await page.mouse.move(cardPoint.x - 120, cardPoint.y + 1, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(220);
      const afterCardDrag = await board.evaluate((element) => element.scrollLeft);
      const mousePanDebug = await page.evaluate(() => window.__projedKanbanMousePanDebug || []);
      assert(
        Math.abs(afterCardDrag - beforeCardDrag) <= 2,
        'dragging from a kanban card should not become board mouse pan',
        { beforeCardDrag, afterCardDrag, mousePanDebug: mousePanDebug.slice(-8) },
      );
      assert(
        mousePanDebug.some((entry) => entry.type === 'pointerdown' && entry.blocked === true),
        'kanban mouse pan should record blocked task-surface pointerdown',
        { mousePanDebug: mousePanDebug.slice(-12) },
      );
      await page.screenshot({ path: `${screenshotBase}-desktop-board-mouse-pan.png`, fullPage: true });
      return { overflow, beforePan, afterPan, beforeCardDrag, afterCardDrag, gapPoint };
    });

    await runCase('QA-046-M01', 'mobile short pan and long press use whole card/checklist/header surfaces', async () => {
      await setCoarsePointer();
      await openApp({ width: 390, height: 844 }, 'board');
      await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 10000 });
      await assertNoHandles(page, 'mobile board should not render visible drag handles');

      const card = page.locator('.kanban-task-card[data-task-id="dev046-card-a"]').first();
      const child = page.locator('.kanban-checklist-item[data-task-id="dev046-child-a"]').first();
      const header = page.locator('[data-kanban-column-header="true"][data-task-id="dev046-col-a"]').first();

      await dispatchTouchGesture(card, { dx: 64, dy: 16 });
      await assertNoTaskAction('mobile card short pan should not open details or action rail');
      await dispatchTouchGesture(child, { dx: 56, dy: 16 });
      await assertNoTaskAction('mobile checklist short pan should not open details or action rail');

      const cardHeldTouch = await startHeldTouch(card, { ratioY: 0.22 });
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const cardRailLayout = await assertCompactMobileActionRail(card, 'mobile card long press');
      await cardHeldTouch.end();

      const childHeldTouch = await startHeldTouch(child);
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const childRailLayout = await assertCompactMobileActionRail(child, 'mobile checklist long press');
      await childHeldTouch.end();

      const headerHeldTouch = await startHeldTouch(header, { ratioY: 0.45 });
      await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
      const headerRailLayout = await assertCompactMobileActionRail(header, 'mobile header long press');
      await headerHeldTouch.end();

      const railText = await page.locator('body').innerText();
      assert(!railText.includes('重新命名任務'), 'mobile long press should not open the removed desktop rename menu');
      await page.screenshot({ path: `${screenshotBase}-mobile-surfaces.png`, fullPage: true });
      return { cardRailLayout, childRailLayout, headerRailLayout };
    });

    const failCount = results.filter((result) => result.result !== 'PASS').length;
    const summary = {
      ok: failCount === 0,
      summary: {
        pass: results.length - failCount,
        fail: failCount,
      },
      results,
      diagnostics: diagnostics.slice(-30),
    };

    await page.evaluate((payload) => {
      localStorage.setItem('dev046-universal-task-surface-drag-result', JSON.stringify(payload));
    }, summary).catch(() => undefined);

    console.log(JSON.stringify(summary, null, 2));
    if (failCount > 0) {
      const failures = results
        .filter((result) => result.result !== 'PASS')
        .map((result) => ({
          id: result.id,
          scenario: result.scenario,
          error: result.error,
          screenshotPath: result.screenshotPath,
        }));
      throw new Error(`DEV-046 universal task surface drag failed: ${failCount} case(s) failed: ${JSON.stringify(failures)}`);
    }
  } catch (error) {
    if (results.length > 0) {
      const summary = {
        ok: false,
        summary: {
          pass: results.filter((result) => result.result === 'PASS').length,
          fail: results.filter((result) => result.result !== 'PASS').length,
        },
        results,
        diagnostics: diagnostics.slice(-30),
      };
      await page.evaluate((payload) => {
        localStorage.setItem('dev046-universal-task-surface-drag-result', JSON.stringify(payload));
      }, summary).catch(() => undefined);
      console.log(JSON.stringify(summary, null, 2));
    }
    throw error;
  }
}
