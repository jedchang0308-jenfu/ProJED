/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const screenshotBase = `output/playwright/dev-051-kanban-parent-lock-${Date.now()}`;
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
    id: 'dev051-workspace',
    title: 'DEV-051 父層鎖定工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'dev051-board', title: 'DEV-051 看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const task = (id, parentId, order, title, extra = {}) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'dev051-board',
    parentId,
    title,
    status: 'todo',
    nodeType: parentId ? 'task' : 'group',
    order,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    ...extra,
  });
  const createNodes = () => ({
    colA: task('colA', null, 0, '產品規劃'),
    colB: task('colB', null, 1, '工程執行'),
    A1: task('A1', 'colA', 0, '需求訪談'),
    A2: task('A2', 'colA', 1, '市場分析'),
    A1C: task('A1C', 'A1', 0, '整理訪談逐字稿'),
    B1: task('B1', 'colB', 0, '前端開發'),
    B1C: task('B1C', 'B1', 0, '元件拆分'),
    emptyB: task('emptyB', 'colB', 1, '空白父任務'),
  });

  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 }); } catch (_) {}
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('pointer: coarse') || query.includes('hover: none')) {
        return {
          matches: window.innerWidth <= 768,
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

  const seed = async () => page.evaluate(({ account, workspace, nodes }) => {
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
    localStorage.setItem('projed-last-board', 'dev051-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes: createNodes() });

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seed();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const center = async (locator, ratioY = 0.5) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'locator must have bounding box');
    return { x: Math.round(box.x + box.width * 0.55), y: Math.round(box.y + box.height * ratioY), box };
  };
  const beginMouseDrag = async (source) => {
    const point = await center(source, 0.4);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 14, point.y + 3, { steps: 4 });
    return point;
  };
  const moveMouseTo = async (target, ratioY = 0.25) => {
    const point = await center(target, ratioY);
    await page.mouse.move(point.x, point.y, { steps: 22 });
    return point;
  };
  const columnTaskIds = async (columnId) => page.evaluate((columnId) => {
    const header = document.querySelector(`[data-kanban-column-header][data-task-id="${columnId}"]`);
    const column = header?.closest('[data-kanban-column="true"]');
    return Array.from(column?.querySelectorAll(':scope .kanban-task-card[data-task-id]') || [])
      .filter((item) => item.closest('[data-kanban-column="true"]') === column)
      .map((item) => item.getAttribute('data-task-id'));
  }, columnId);
  const assertVisibleSurface = async (label) => {
    const visibleErrors = await page.locator('.inline-error, [role="alert"]').evaluateAll((items) => items
      .filter((item) => {
        const style = window.getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((item) => item.textContent?.trim()).filter(Boolean));
    const bodyText = await page.locator('body').innerText();
    const fatalText = ['Not Found', 'Internal Server Error', '/api/'].filter((text) => bodyText.includes(text));
    const metrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    assert(visibleErrors.length === 0 && fatalText.length === 0, `${label} visible error sweep`, { visibleErrors, fatalText });
    assert(metrics.bodyScrollWidth <= metrics.width + 1 && metrics.documentScrollWidth <= metrics.width + 1, `${label} viewport has no body overflow`, metrics);
    return metrics;
  };
  const assertPlacementPreviewAligned = async (indicatorSelector) => {
    await page.locator('[data-kanban-placement-preview="true"]').waitFor({ state: 'visible', timeout: 1500 });
    const metrics = await page.evaluate((selector) => {
      const line = document.querySelector(selector);
      const preview = document.querySelector('[data-kanban-placement-preview="true"]');
      const pointerPreview = document.querySelector('[data-kanban-pointer-drag-preview="true"]');
      const rectOf = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        line: rectOf(line),
        preview: rectOf(preview),
        pointerPreviewCount: pointerPreview ? 1 : 0,
      };
    }, indicatorSelector);
    assert(Boolean(metrics.line && metrics.preview), 'placement preview and insertion line must both be measurable', metrics);
    assert(
      Math.abs(metrics.preview.left - metrics.line.left) <= 2 &&
        Math.abs(metrics.preview.width - metrics.line.width) <= 2 &&
        metrics.preview.top >= metrics.line.bottom + 2 &&
        metrics.preview.top <= metrics.line.bottom + 10,
      'placement preview must align with the insertion line',
      metrics,
    );
    assert(metrics.pointerPreviewCount === 0, 'pointer drag preview must be hidden while placement preview is aligned', metrics);
    return metrics;
  };
  const assertDesktopPointerPreviewFollows = async (point) => {
    await page.locator('[data-kanban-pointer-drag-preview="true"]').waitFor({ state: 'visible', timeout: 1500 });
    await page.waitForFunction(({ x, y }) => {
      const preview = document.querySelector('[data-kanban-pointer-drag-preview="true"]');
      if (!preview) return false;
      const rect = preview.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.abs(centerX - x) <= 2 && Math.abs(centerY - y) <= 2;
    }, point, { timeout: 1500 });
    const metrics = await page.evaluate(({ x, y }) => {
      const preview = document.querySelector('[data-kanban-pointer-drag-preview="true"]');
      const placementPreview = document.querySelector('[data-kanban-placement-preview="true"]');
      const rect = preview?.getBoundingClientRect();
      return {
        requested: { x, y },
        center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
        dataPointer: {
          x: Number(preview?.getAttribute('data-kanban-pointer-x')),
          y: Number(preview?.getAttribute('data-kanban-pointer-y')),
        },
        mode: preview?.getAttribute('data-kanban-pointer-preview-mode') || null,
        placementPreviewCount: placementPreview ? 1 : 0,
      };
    }, point);
    assert(metrics.placementPreviewCount === 0, 'cursor preview must only show when no insertion placement preview is active', metrics);
    assert(metrics.mode === 'cursor', 'desktop pointer preview must be in cursor-follow mode', metrics);
    assert(
      metrics.center &&
        Math.abs(metrics.center.x - point.x) <= 2 &&
        Math.abs(metrics.center.y - point.y) <= 2 &&
        Math.abs(metrics.dataPointer.x - point.x) <= 2 &&
        Math.abs(metrics.dataPointer.y - point.y) <= 2,
      'desktop pointer preview must follow the cursor exactly',
      metrics,
    );
    return metrics;
  };
  const assertMobilePointerPreviewFollows = async (point) => {
    await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 1500 });
    const metrics = await page.evaluate(({ x, y }) => {
      const preview = document.querySelector('[data-mobile-drag-preview="true"]');
      const rect = preview?.getBoundingClientRect();
      return {
        requested: { x, y },
        center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
        dataPointer: {
          x: Number(preview?.getAttribute('data-mobile-pointer-x')),
          y: Number(preview?.getAttribute('data-mobile-pointer-y')),
        },
        mode: preview?.getAttribute('data-mobile-pointer-preview-mode') || null,
      };
    }, point);
    assert(metrics.mode === 'finger', 'mobile pointer preview must be in finger-follow mode', metrics);
    assert(
      metrics.center &&
        Math.abs(metrics.center.x - point.x) <= 2 &&
        Math.abs(metrics.center.y - point.y) <= 2 &&
        Math.abs(metrics.dataPointer.x - point.x) <= 2 &&
        Math.abs(metrics.dataPointer.y - point.y) <= 2,
      'mobile pointer preview must follow the finger exactly',
      metrics,
    );
    return metrics;
  };
  const assertDraggingSourceRemoved = async (selector, taskId) => {
    const evidence = await page.evaluate(({ selector, taskId }) => {
      const nodes = Array.from(document.querySelectorAll(`${selector}[data-task-id="${taskId}"]`));
      const snapshots = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const hiddenContainer = node.closest('[data-kanban-drag-source-hidden="true"]');
        const hiddenContainerStyle = hiddenContainer ? window.getComputedStyle(hiddenContainer) : null;
        return {
          className: node.getAttribute('class') || '',
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
          hiddenContainerTag: hiddenContainer?.tagName || null,
          hiddenContainerDisplay: hiddenContainerStyle?.display || null,
        };
      });
      const visibleCount = snapshots.filter((snapshot) => (
        snapshot.display !== 'none' &&
        snapshot.visibility !== 'hidden' &&
        snapshot.width > 0 &&
        snapshot.height > 0
      )).length;
      return {
        selector,
        taskId,
        snapshots,
        visibleCount,
        hiddenSourceMarkerCount: document.querySelectorAll('[data-kanban-drag-source-hidden="true"]').length,
      };
    }, { selector, taskId });
    assert(evidence.snapshots.length > 0, 'dragging source must remain traceable in DOM for QA', evidence);
    assert(
      evidence.visibleCount === 0 && evidence.hiddenSourceMarkerCount >= 1,
      'original source must be removed while dragging',
      evidence,
    );
    return evidence;
  };
  const cleanup = async () => {
    await page.mouse.up().catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.evaluate(() => {
      window.__dev051EarlyReleaseObserver?.disconnect?.();
      delete window.__dev051EarlyReleaseObserver;
      delete window.__dev051EarlyReleaseEvidence;
    }).catch(() => undefined);
    await page.waitForTimeout(120);
  };
  const runCase = async (id, scenario, fn) => {
    try {
      const details = await fn();
      results.push({ id, scenario, result: 'PASS', details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      const debug = await page.evaluate(() => ({
        kanban: (window.__projedKanbanDropDebug || []).slice(-20),
        mobile: (window.__projedMobileTaskActionDebug || []).slice(-20),
      })).catch(() => null);
      results.push({ id, scenario, result: 'FAIL', error: error.message, screenshotPath, debug });
    } finally {
      await cleanup();
    }
  };

  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(20000);

  await runCase('QA-051-D00', 'desktop pointer preview follows cursor when no insertion target is active', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="A2"]').first();
    await beginMouseDrag(source);
    const point = { x: 136, y: 548 };
    await page.mouse.move(point.x, point.y, { steps: 14 });
    const pointerPreview = await assertDesktopPointerPreviewFollows(point);
    return { pointerPreview };
  });

  await runCase('QA-051-D01', 'same-parent reorder is immediate without arming', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="B1"]').first();
    const target = page.locator('.kanban-task-card[data-task-id="emptyB"]').first();
    const before = await columnTaskIds('colB');
    await beginMouseDrag(source);
    const targetPoint = await center(target, 0.85);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 22 });
    await page.locator('[data-kanban-drop-indicator="true"][data-kanban-drop-position="after"]').waitFor({ state: 'visible' });
    const removedSource = await assertDraggingSourceRemoved('.kanban-task-card', 'B1');
    assert(await page.locator('[data-kanban-parent-lock-state="arming"]').count() === 0, 'same-parent move must not arm');
    await page.mouse.up();
    await page.waitForFunction(() => {
      const header = document.querySelector('[data-kanban-column-header][data-task-id="colB"]');
      const column = header?.closest('[data-kanban-column="true"]');
      return Array.from(column?.querySelectorAll(':scope .kanban-task-card[data-task-id]') || [])[0]?.getAttribute('data-task-id') === 'emptyB';
    });
    const after = await columnTaskIds('colB');
    return { before, after, removedSource, metrics: await assertVisibleSurface('desktop same-parent') };
  });

  await runCase('QA-051-D02', 'cross-parent release before lock is a no-op', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="A1"]').first();
    const target = page.locator('.kanban-task-card[data-task-id="B1"]').first();
    await beginMouseDrag(source);
    await page.evaluate(() => {
      const evidence = { armingObserved: false, lockedObserved: false, progress: null };
      const inspect = () => {
        const element = document.querySelector('[data-kanban-parent-lock-state][data-kanban-drop-parent-id="colB"]');
        const phase = element?.getAttribute('data-kanban-parent-lock-state');
        if (phase === 'arming') {
          evidence.armingObserved = true;
          const progress = Number(element?.getAttribute('data-kanban-parent-lock-progress'));
          if (Number.isFinite(progress)) evidence.progress = progress;
        }
        if (phase === 'locked') evidence.lockedObserved = true;
      };
      const observer = new MutationObserver(inspect);
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['data-kanban-parent-lock-state', 'data-kanban-parent-lock-progress', 'data-kanban-drop-parent-id'],
      });
      window.__dev051EarlyReleaseEvidence = evidence;
      window.__dev051EarlyReleaseObserver = observer;
      inspect();
    });
    const targetPoint = await center(target, 0.2);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 2 });
    await page.waitForTimeout(20);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const earlyRelease = await page.evaluate(() => {
      window.__dev051EarlyReleaseObserver?.disconnect?.();
      return window.__dev051EarlyReleaseEvidence;
    });
    assert(
      earlyRelease?.armingObserved && !earlyRelease.lockedObserved && Number(earlyRelease.progress) < 1,
      'release before lock must observe arming without reaching locked',
      { earlyRelease },
    );
    const colA = await columnTaskIds('colA');
    const colB = await columnTaskIds('colB');
    assert(colA.includes('A1') && !colB.includes('A1'), 'release before lock must preserve parent/order', { colA, colB });
    assert(await page.locator('[data-kanban-parent-lock-state]').count() === 0, 'transient lock UI must clear after release');
    return { earlyRelease, colA, colB };
  });

  await runCase('QA-051-D03', '750ms dwell locks parent group and commits exact anchor position', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="A1"]').first();
    const target = page.locator('.kanban-task-card[data-task-id="B1"]').first();
    await beginMouseDrag(source);
    await moveMouseTo(target, 0.15);
    const locked = page.locator('[data-kanban-parent-lock-state="locked"][data-kanban-drop-parent-id="colB"]').first();
    await locked.waitFor({ state: 'visible', timeout: 1600 });
    const lockedClass = await locked.getAttribute('class');
    assert(lockedClass?.includes('ring-2') && lockedClass.includes('ring-primary'), 'locked parent must retain the group frame', { lockedClass });
    const retiredTextCount = await page.getByText(/已鎖定|停留以切換|放入「/).count();
    assert(retiredTextCount === 0, 'visible lock text prompts must stay retired', { retiredTextCount });
    assert(await page.locator('[data-kanban-floating-lock-status]').count() === 0, 'floating lock status must stay retired');
    await page.locator('[data-kanban-drop-indicator="true"][data-kanban-drop-position="before"][data-kanban-drop-parent-id="colB"]').waitFor({ state: 'visible' });
    const placementPreview = await assertPlacementPreviewAligned('[data-kanban-drop-indicator="true"][data-kanban-drop-position="before"][data-kanban-drop-parent-id="colB"]');
    const removedSource = await assertDraggingSourceRemoved('.kanban-task-card', 'A1');
    await page.screenshot({ path: `${screenshotBase}-desktop-locked.png`, fullPage: true });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const header = document.querySelector('[data-kanban-column-header][data-task-id="colB"]');
      const column = header?.closest('[data-kanban-column="true"]');
      return Array.from(column?.querySelectorAll(':scope .kanban-task-card[data-task-id]') || [])
        .filter((item) => item.closest('[data-kanban-column="true"]') === column)[0]?.getAttribute('data-task-id') === 'A1';
    });
    return { lockedClass, retiredTextCount, placementPreview, removedSource, colB: await columnTaskIds('colB'), metrics: await assertVisibleSurface('desktop locked') };
  });

  await runCase('QA-051-D07', 'explicit child empty lane locks and appends as direct child', async () => {
    await openApp();
    const source = page.locator('.kanban-task-card[data-task-id="A1"]').first();
    const readEmptyParentLayout = async () => page.evaluate(() => {
      const card = document.querySelector('.kanban-task-card[data-task-id="emptyB"]');
      const lane = card?.querySelector('[data-kanban-child-empty-lane="true"]') || null;
      const cardRect = card?.getBoundingClientRect();
      const laneRect = lane?.getBoundingClientRect();
      return {
        cardHeight: cardRect?.height || 0,
        cardBottom: cardRect?.bottom || 0,
        laneCount: lane ? 1 : 0,
        laneHeight: laneRect?.height || 0,
        lanePosition: lane ? window.getComputedStyle(lane).position : '',
      };
    });
    const layoutBeforeDrag = await readEmptyParentLayout();
    await beginMouseDrag(source);
    const lane = page.locator('[data-kanban-child-empty-lane="true"][data-kanban-target-parent-id="emptyB"]').first();
    await lane.waitFor({ state: 'visible' });
    const layoutBeforeHover = await readEmptyParentLayout();
    assert(
      Math.abs(layoutBeforeHover.cardHeight - layoutBeforeDrag.cardHeight) <= 1 &&
        layoutBeforeHover.laneCount === 1 &&
        layoutBeforeHover.lanePosition === 'absolute',
      'non-target empty lanes must not reserve task spacing',
      { layoutBeforeDrag, layoutBeforeHover },
    );
    const laneText = await lane.innerText();
    assert(laneText.trim() === '', 'empty lane must remain text-free', { laneText });
    const visibleEmptyLaneLinesBeforeHover = await page.locator('[data-kanban-empty-lane-line="true"]:visible').count();
    assert(visibleEmptyLaneLinesBeforeHover === 0, 'non-target empty lanes must not show insertion lines', { visibleEmptyLaneLinesBeforeHover });
    await moveMouseTo(lane, 0.5);
    await lane.locator('[data-kanban-empty-lane-line="true"]').waitFor({ state: 'visible' });
    const placementPreview = await assertPlacementPreviewAligned('[data-kanban-child-empty-lane="true"][data-kanban-target-parent-id="emptyB"] [data-kanban-empty-lane-line="true"]');
    const removedSource = await assertDraggingSourceRemoved('.kanban-task-card', 'A1');
    const visibleEmptyLaneLinesAfterHover = await page.locator('[data-kanban-empty-lane-line="true"]:visible').count();
    const laneLineClass = await lane.locator('[data-kanban-empty-lane-line="true"]').first().getAttribute('class');
    assert(visibleEmptyLaneLinesAfterHover === 1, 'only the resolved empty-lane drop position should show a line', { visibleEmptyLaneLinesAfterHover });
    assert(
      laneLineClass?.includes('bg-primary') && !laneLineClass.includes('bg-slate') && !laneLineClass.includes('bg-amber'),
      'empty-lane insertion line must use the locked-frame primary color',
      { laneLineClass }
    );
    const layoutAfterHover = await readEmptyParentLayout();
    assert(
      Math.abs(layoutAfterHover.cardHeight - layoutBeforeDrag.cardHeight) <= 1,
      'target empty-lane indicator must overlay without changing task spacing',
      { layoutBeforeDrag, layoutAfterHover },
    );
    await lane.locator('[data-kanban-parent-lock-state="locked"], [data-kanban-drop-indicator="true"]').first().waitFor({ state: 'visible', timeout: 1600 }).catch(() => undefined);
    await page.locator('[data-kanban-child-empty-lane="true"][data-kanban-target-parent-id="emptyB"][data-kanban-parent-lock-state="locked"]').waitFor({ state: 'visible', timeout: 1600 });
    await page.screenshot({ path: `${screenshotBase}-desktop-empty-lane.png`, fullPage: true });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const card = document.querySelector('.kanban-task-card[data-task-id="emptyB"]');
      return Boolean(card?.querySelector('.kanban-checklist-item[data-task-id="A1"]'));
    });
    return { laneText, placementPreview, removedSource, childVisible: true };
  });

  const startHeldTouch = async (locator, holdMs = 620) => {
    const point = await center(locator, 0.45);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
    });
    await page.waitForTimeout(holdMs);
    return { cdp, point };
  };
  const moveHeldTouch = async (held, target) => {
    const point = await center(target, 0.18);
    for (let index = 1; index <= 6; index += 1) {
      await held.cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(held.point.x + ((point.x - held.point.x) * index) / 6),
          y: Math.round(held.point.y + ((point.y - held.point.y) * index) / 6),
          radiusX: 4,
          radiusY: 4,
          force: 1,
          id: 1,
        }],
      });
      await page.waitForTimeout(30);
    }
    return point;
  };
  const endHeldTouch = async (held) => {
    await held.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await held.cdp.detach().catch(() => undefined);
    await page.waitForTimeout(300);
  };

  await runCase('QA-051-M05', 'mobile long-press starts cross-parent lock only after hover', async () => {
    await openApp({ width: 390, height: 844 });
    const source = page.locator('.kanban-checklist-item[data-task-id="A1C"]').first();
    const target = page.locator('.kanban-task-card[data-task-id="A2"]').first();
    const held = await startHeldTouch(source);
    await page.locator('[data-mobile-task-action-rail="true"]').waitFor({ state: 'visible' });
    const initialPointerPreview = await assertMobilePointerPreviewFollows(held.point);
    assert(await page.locator('[data-kanban-parent-lock-state="arming"]').count() === 0, 'long-press entry alone must not start parent lock');
    await moveHeldTouch(held, target);
    await page.locator('[data-kanban-parent-lock-state="locked"][data-kanban-drop-parent-id="colA"]').first().waitFor({ state: 'visible', timeout: 1800 });
    assert(await page.locator('[data-mobile-drag-preview="true"]').count() === 0, 'mobile finger preview must hide when insertion indicator is active');
    await page.screenshot({ path: `${screenshotBase}-mobile-locked.png`, fullPage: true });
    await endHeldTouch(held);
    await page.waitForFunction(() => Boolean(document.querySelector('.kanban-task-card[data-task-id="A1C"]')), null, { timeout: 2500 }).catch(() => undefined);
    const commitEvidence = await page.evaluate(() => ({
      node: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}').A1C || null,
      debug: (window.__projedMobileTaskActionDebug || []).slice(-20),
      cardVisible: Boolean(document.querySelector('.kanban-task-card[data-task-id="A1C"]')),
    }));
    assert(
      commitEvidence.node?.parentId === 'colA' && commitEvidence.cardVisible,
      'locked mobile release must commit the task at card level',
      commitEvidence,
    );
    return { movedToCardLevel: true, initialPointerPreview, commitEvidence, metrics: await assertVisibleSurface('mobile locked') };
  });

  await runCase('QA-051-M09', 'mobile action rail wins and does not double-submit a task move', async () => {
    await openApp({ width: 390, height: 844 });
    const source = page.locator('.kanban-task-card[data-task-id="A2"]').first();
    const held = await startHeldTouch(source);
    const action = page.locator('[data-mobile-task-action="toggle-complete"]').first();
    await action.waitFor({ state: 'visible' });
    await moveHeldTouch(held, action);
    await endHeldTouch(held);
    const debug = await page.evaluate(() => window.__projedMobileTaskActionDebug || []);
    const recent = debug.slice(-15);
    assert(recent.some((entry) => entry.type === 'end:action' && entry.nodeId === 'A2'), 'action rail should receive release', { recent });
    assert(!recent.some((entry) => entry.type === 'drop:complete' && entry.draggedNodeId === 'A2'), 'action rail release must not also move task', { recent });
    return { recent };
  });

  const failures = results.filter((result) => result.result !== 'PASS');
  const summary = {
    ok: failures.length === 0,
    summary: { pass: results.length - failures.length, fail: failures.length },
    results,
    diagnostics: diagnostics.slice(-30),
  };
  await page.evaluate((payload) => localStorage.setItem('dev051-kanban-parent-lock-result', JSON.stringify(payload)), summary).catch(() => undefined);
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) throw new Error(`DEV-051 browser verification failed: ${JSON.stringify(failures)}`);
}
