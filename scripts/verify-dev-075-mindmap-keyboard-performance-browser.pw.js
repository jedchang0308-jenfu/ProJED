/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const phase = page.url().includes('dev075Phase=baseline') ? 'baseline' : 'after';
  const outputRoot = phase === 'baseline'
    ? 'output/playwright/dev-075-mindmap-keyboard-performance/baseline'
    : 'output/playwright/dev-075-mindmap-keyboard-performance';
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'DEV-075 本機驗證',
    createdAt: 1704067200000,
  };
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  const nodeId = index => `dev075-node-${String(index).padStart(4, '0')}`;
  const buildFixture = visibleNodeCount => {
    const workspace = {
      id: 'dev075-workspace',
      title: 'DEV-075 鍵盤效能驗證',
      ownerId: account.id,
      members: [account.id],
      order: 1,
      createdAt: 1704067200000,
      boards: [{
        id: 'dev075-board',
        title: `DEV-075 心智圖 ${visibleNodeCount}`,
        dependencies: [],
        order: 1,
        createdAt: 1704067200000,
      }],
    };
    const nodes = {};
    const rootCount = 6;
    for (let index = 0; index < visibleNodeCount; index += 1) {
      const parentIndex = index < rootCount ? null : Math.floor((index - rootCount) / 3);
      const id = nodeId(index);
      nodes[id] = {
        id,
        workspaceId: workspace.id,
        boardId: 'dev075-board',
        parentId: parentIndex === null ? null : nodeId(parentIndex),
        title: index % 17 === 0 ? `第 ${index + 1} 個超長中文任務－方向鍵效能與版面穩定性驗證` : `DEV-075 Task ${index + 1}`,
        status: 'todo',
        nodeType: 'task',
        order: index < rootCount ? index : (index - rootCount) % 3,
        createdAt: 1704067200000 + index,
        updatedAt: 1704067200000 + index,
      };
    }
    const relationships = [];
    for (let index = 0; index < Math.min(20, Math.max(0, visibleNodeCount - 1)); index += 1) {
      const fromIndex = 1 + index;
      const toIndex = Math.max(fromIndex + 1, visibleNodeCount - 1 - index);
      relationships.push({
        id: `dev075-relationship-${index}`,
        boardId: 'dev075-board',
        fromId: nodeId(fromIndex),
        toId: nodeId(Math.min(visibleNodeCount - 1, toIndex)),
        label: `DEV-075 R${index + 1}`,
        createdAt: 1704067200000 + index,
        updatedAt: 1704067200000 + index,
        style: { arrowEnd: true },
      });
    }
    return { workspace, nodes, relationships };
  };

  const writeFixture = async visibleNodeCount => {
    const fixture = buildFixture(visibleNodeCount);
    await page.evaluate(({ account, fixture, visibleNodeCount }) => {
      Object.keys(localStorage)
        .filter(key => key.startsWith('projed.mindmap.'))
        .forEach(key => localStorage.removeItem(key));
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([fixture.workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(fixture.nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', String(visibleNodeCount));
      localStorage.setItem('projed-last-ws', fixture.workspace.id);
      localStorage.setItem('projed-last-board', 'dev075-board');
      localStorage.setItem('projed-last-view', 'mindmap');
      localStorage.setItem('projed.mindmap.noteRelationships.dev075-board', JSON.stringify(fixture.relationships));
    }, { account, fixture, visibleNodeCount });
  };

  const switchToMindMap = async () => {
    if (await page.locator('[data-mindmap-view]').first().isVisible().catch(() => false)) return;
    await page.locator('[data-mode-switcher-trigger="true"]').first().click();
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
  };

  const openFixture = async (visibleNodeCount, viewport = { width: 1440, height: 900 }, routePhase = phase) => {
    await page.setViewportSize(viewport);
    const query = routePhase ? `?dev075Phase=${routePhase}` : '';
    await page.goto(`http://localhost:4000/${query}`, { waitUntil: 'domcontentloaded' });
    await writeFixture(visibleNodeCount);
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.locator('nav').count() === 0) {
      const loginButton = page.getByRole('button', { name: /使用固定測試環境/ }).first();
      await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      await loginButton.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
      await writeFixture(visibleNodeCount);
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    if (viewport.width > 640) {
      await switchToMindMap();
      await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, visibleNodeCount, { timeout: 30000 });
      await page.locator('[data-mindmap-viewport="true"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(650);
    }
  };

  const visibleErrors = async () => page.evaluate(() => {
    const isVisible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const errors = Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter(isVisible)
      .map(element => (element.textContent || '').trim())
      .filter(Boolean);
    const text = document.body.innerText;
    for (const pattern of ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'Unhandled Runtime Error', 'ReferenceError', 'TypeError']) {
      if (text.includes(pattern)) errors.push(pattern);
    }
    return [...new Set(errors)];
  });

  const readTelemetry = async () => page.evaluate(() => {
    const root = document.querySelector('[data-mindmap-view]');
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    const readNumber = (element, name) => {
      const value = element?.getAttribute(name);
      return value === null || value === undefined ? -1 : Number(value);
    };
    const nodeRenderCounts = {};
    document.querySelectorAll('[data-mindmap-node]').forEach(element => {
      const id = element.getAttribute('data-mindmap-node');
      if (id) nodeRenderCounts[id] = readNumber(element, 'data-mindmap-node-render-count');
    });
    return {
      viewRenderCount: readNumber(root, 'data-mindmap-view-render-count'),
      selectionCommitCount: readNumber(root, 'data-mindmap-selection-commit-count'),
      selectionNotificationCount: readNumber(root, 'data-mindmap-selection-notification-count'),
      navigationIndexBuildCount: readNumber(root, 'data-mindmap-navigation-index-build-count'),
      geometryRecomputeCount: readNumber(viewport, 'data-mindmap-recompute-count'),
      nodeRenderCounts,
      selectedNodeId: document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node') || '',
      activeNodeId: document.activeElement?.getAttribute('data-mindmap-node') || '',
      pathData: Array.from(document.querySelectorAll('[data-mindmap-connector-path], [data-mindmap-note-relationship-path]'))
        .map(element => element.getAttribute('d') || ''),
    };
  });

  const delta = (after, before) => before < 0 || after < 0 ? -1 : after - before;
  const changedNodeIds = (before, after) => Object.keys(after).filter(id => before[id] >= 0 && after[id] !== before[id]);
  const percentile = (values, ratio) => {
    if (!values.length) return Number.POSITIVE_INFINITY;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  };
  const median = values => {
    if (!values.length) return Number.POSITIVE_INFINITY;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };

  const installMeasurementProbe = async () => page.evaluate(() => {
    window.__DEV075_MEASURE?.disconnect?.();
    const state = { active: false, pending: [], latency: [], longTaskCount: 0 };
    const keyHandler = event => {
      if (!state.active || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      if (!(event.target instanceof Element) || !event.target.closest('[data-mindmap-view]')) return;
      state.pending.push(performance.now());
    };
    document.addEventListener('keydown', keyHandler, true);
    const mutationObserver = new MutationObserver(records => {
      for (const record of records) {
        if (!state.active || record.type !== 'attributes') continue;
        const target = record.target;
        if (!(target instanceof HTMLElement) || target.getAttribute('aria-selected') !== 'true') continue;
        const startedAt = state.pending.shift();
        if (startedAt !== undefined) state.latency.push(performance.now() - startedAt);
      }
    });
    mutationObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    let longTaskObserver = null;
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      longTaskObserver = new PerformanceObserver(list => {
        if (!state.active) return;
        state.longTaskCount += list.getEntries().filter(entry => entry.duration > 50).length;
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
    }
    window.__DEV075_MEASURE = {
      state,
      reset() {
        state.pending.length = 0;
        state.latency.length = 0;
        state.longTaskCount = 0;
        state.active = true;
      },
      finish() {
        state.active = false;
        return { latency: [...state.latency], pending: state.pending.length, longTaskCount: state.longTaskCount };
      },
      disconnect() {
        document.removeEventListener('keydown', keyHandler, true);
        mutationObserver.disconnect();
        longTaskObserver?.disconnect();
      },
    };
  });

  const focusMiddleNode = async () => {
    const ids = await page.locator('[data-mindmap-node]').evaluateAll(elements => elements.map(element => element.getAttribute('data-mindmap-node')).filter(Boolean));
    const id = ids[Math.floor(ids.length / 2)];
    await page.locator(`[data-mindmap-node="${id}"]`).focus();
    await page.waitForFunction(expected => document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node') === expected, id);
    await page.waitForTimeout(35);
    return { ids, id };
  };

  const setZoom = async target => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = Number(await page.locator('[data-mindmap-viewport="true"]').getAttribute('data-mindmap-zoom-level'));
      if (Math.abs(current - target) <= 0.001) {
        await page.waitForTimeout(100);
        return;
      }
      await page.locator(target > current ? '[data-mindmap-zoom-in]' : '[data-mindmap-zoom-out]').click();
      await page.waitForTimeout(18);
    }
    throw new Error(`Unable to set DEV-075 zoom to ${target}`);
  };

  const runRealKeyboardFlow = async () => {
    const { ids, id } = await focusMiddleNode();
    let expectedIndex = ids.indexOf(id);
    const steps = [];
    for (let index = 0; index < 20; index += 1) {
      const key = index < 10 ? 'ArrowDown' : 'ArrowUp';
      expectedIndex = key === 'ArrowDown'
        ? Math.min(ids.length - 1, expectedIndex + 1)
        : Math.max(0, expectedIndex - 1);
      await page.keyboard.press(key);
      const actual = await page.locator('[data-mindmap-node][aria-selected="true"]').getAttribute('data-mindmap-node');
      steps.push({ key, expected: ids[expectedIndex], actual });
      assert(actual === ids[expectedIndex], 'real keyboard navigation order must match rendered DOM', { step: index, key, expected: ids[expectedIndex], actual });
    }
    return steps;
  };

  const runMeasuredCase = async ({ visibleNodeCount, zoom, eventIntervalMs, run, screenshot }) => {
    await setZoom(zoom);
    const { id: expectedSelectedNodeId } = await focusMiddleNode();
    await installMeasurementProbe();
    const before = await readTelemetry();
    const rectBefore = await page.locator(`[data-mindmap-node="${expectedSelectedNodeId}"]`).boundingBox();
    const measured = await page.evaluate(async ({ eventIntervalMs, eventCount }) => {
      window.__DEV075_MEASURE.reset();
      for (let index = 0; index < eventCount; index += 1) {
        const selected = document.querySelector('[data-mindmap-node][aria-selected="true"]');
        const key = index % 2 === 0 ? 'ArrowDown' : 'ArrowUp';
        selected?.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, eventIntervalMs));
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.__DEV075_MEASURE.finish();
    }, { eventIntervalMs, eventCount: 100 });
    await page.waitForTimeout(35);
    const after = await readTelemetry();
    const rectAfter = await page.locator(`[data-mindmap-node="${expectedSelectedNodeId}"]`).boundingBox();
    const latency = measured.latency;
    const actualSelectedNodeId = after.selectedNodeId;
    const screenshotPath = screenshot || `${outputRoot}/${visibleNodeCount}-${Math.round(zoom * 100)}-overview.png`;
    if (screenshot) await page.screenshot({ path: screenshotPath });
    return {
      visibleNodeCount,
      zoom,
      eventIntervalMs,
      eventCount: 100,
      run,
      expectedSelectedNodeId,
      actualSelectedNodeId,
      missedSteps: Math.max(0, 100 - latency.length) + (actualSelectedNodeId === expectedSelectedNodeId ? 0 : 1),
      latencyMs: { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95), max: latency.length ? Math.max(...latency) : Number.POSITIVE_INFINITY },
      longTaskCount: measured.longTaskCount,
      viewRenderDelta: delta(after.viewRenderCount, before.viewRenderCount),
      changedNodeRenderIds: changedNodeIds(before.nodeRenderCounts, after.nodeRenderCounts),
      notificationDelta: delta(after.selectionNotificationCount, before.selectionNotificationCount),
      navigationIndexBuildDelta: delta(after.navigationIndexBuildCount, before.navigationIndexBuildCount),
      geometryRecomputeDelta: delta(after.geometryRecomputeCount, before.geometryRecomputeCount),
      focusMatchesSelection: after.activeNodeId === actualSelectedNodeId,
      pathDataStable: JSON.stringify(after.pathData) === JSON.stringify(before.pathData),
      selectedRectDelta: rectBefore && rectAfter ? {
        x: Math.abs(rectAfter.x - rectBefore.x),
        y: Math.abs(rectAfter.y - rectBefore.y),
        width: Math.abs(rectAfter.width - rectBefore.width),
        height: Math.abs(rectAfter.height - rectBefore.height),
      } : null,
      screenshot: screenshotPath,
    };
  };

  const cases = [];
  let realKeyboardSteps = [];
  let singleStep = null;
  let probeComparison = null;
  let interactionEvidence = null;
  for (const visibleNodeCount of [50, 200, 500]) {
    await openFixture(visibleNodeCount);
    assert(await page.locator('[data-mindmap-node]').count() === visibleNodeCount, 'fixture node count must be exact', { visibleNodeCount });
    assert(await page.locator('[data-mindmap-note-relationship-path]').count() >= Math.min(20, visibleNodeCount - 1), 'fixture relationship count must be non-zero', { visibleNodeCount });
    if (visibleNodeCount === 50) realKeyboardSteps = await runRealKeyboardFlow();
    if (phase === 'after' && visibleNodeCount === 500) {
      const { ids, id } = await focusMiddleNode();
      const before = await readTelemetry();
      const nextId = ids[Math.min(ids.length - 1, ids.indexOf(id) + 1)];
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(35);
      const after = await readTelemetry();
      singleStep = {
        expectedSelectedNodeId: nextId,
        actualSelectedNodeId: after.selectedNodeId,
        viewRenderDelta: delta(after.viewRenderCount, before.viewRenderCount),
        changedNodeRenderIds: changedNodeIds(before.nodeRenderCounts, after.nodeRenderCounts),
        notificationDelta: delta(after.selectionNotificationCount, before.selectionNotificationCount),
        navigationIndexBuildDelta: delta(after.navigationIndexBuildCount, before.navigationIndexBuildCount),
        geometryRecomputeDelta: delta(after.geometryRecomputeCount, before.geometryRecomputeCount),
        focusMatchesSelection: after.activeNodeId === after.selectedNodeId,
      };
    }
    const sharedScreenshot = `${outputRoot}/${visibleNodeCount}-100-overview.png`;
    await page.screenshot({ path: sharedScreenshot });
    for (let run = 1; run <= 3; run += 1) {
      cases.push(await runMeasuredCase({ visibleNodeCount, zoom: 1, eventIntervalMs: 33, run, screenshot: run === 1 ? sharedScreenshot : null }));
    }
    if (phase === 'after' && visibleNodeCount >= 200) {
      cases.push(await runMeasuredCase({ visibleNodeCount, zoom: 1, eventIntervalMs: 16, run: 1, screenshot: sharedScreenshot }));
    }
    if (phase === 'after' && visibleNodeCount === 200) {
      for (const zoom of [0.5, 2]) {
        const zoomScreenshot = `${outputRoot}/${visibleNodeCount}-${Math.round(zoom * 100)}-overview.png`;
        cases.push(await runMeasuredCase({ visibleNodeCount, zoom, eventIntervalMs: 33, run: 1, screenshot: zoomScreenshot }));
      }
    }
  }

  if (phase === 'after') {
    await openFixture(50);
    await page.waitForFunction(() => (
      document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node') === 'dev075-node-0000'
    ), null, { timeout: 5000 }).catch(() => {});
    const initialSelectedIds = await page.locator('[data-mindmap-node][aria-selected="true"]')
      .evaluateAll(elements => elements.map(element => element.getAttribute('data-mindmap-node')).filter(Boolean));
    const initialSelectionTelemetry = await readTelemetry();
    assert(initialSelectedIds.length === 1 && initialSelectedIds[0] === 'dev075-node-0000', 'initial selection must have one model-first root', {
      initialSelectedIds,
      initialSelectionTelemetry,
    });
    const rightRoot = page.locator('[data-mindmap-node="dev075-node-0000"]');
    const leftRoot = page.locator('[data-mindmap-node="dev075-node-0001"]');
    assert(
      await rightRoot.getAttribute('data-mindmap-node-direction') === 'right' &&
        await leftRoot.getAttribute('data-mindmap-node-direction') === 'left',
      'center bridge fixture must place its first two roots on opposite sides',
    );
    await rightRoot.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node') === 'dev075-node-0001');
    const selectedAcrossCenter = await page.locator('[data-mindmap-node][aria-selected="true"]').getAttribute('data-mindmap-node');
    const centerBridgeScreenshot = `${outputRoot}/center-bridge-left-selected.png`;
    await page.screenshot({ path: centerBridgeScreenshot });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node') === 'dev075-node-0000');
    const selectedBackAcrossCenter = await page.locator('[data-mindmap-node][aria-selected="true"]').getAttribute('data-mindmap-node');
    const centerSelected = await page.locator('[data-mindmap-center]').evaluate(element =>
      element.getAttribute('aria-selected') === 'true' || document.activeElement === element,
    );
    const centerBridgeFocusMatchesSelection = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-mindmap-node') ===
        document.querySelector('[data-mindmap-node][aria-selected="true"]')?.getAttribute('data-mindmap-node'),
    );
    const centerBridge = {
      selectedAcrossCenter,
      selectedBackAcrossCenter,
      centerSelected,
      focusMatchesSelection: centerBridgeFocusMatchesSelection,
      screenshot: centerBridgeScreenshot,
    };
    assert(
      selectedAcrossCenter === 'dev075-node-0001' &&
        selectedBackAcrossCenter === 'dev075-node-0000' &&
        centerSelected === false &&
        centerBridgeFocusMatchesSelection,
      'horizontal arrows must cross the board title in both directions without selecting the center',
      centerBridge,
    );
    const createRootButton = page.locator('[data-mindmap-create-root]');
    if (await createRootButton.count()) {
      await createRootButton.click();
    } else {
      await page.locator('[data-mindmap-view]').focus();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
    }
    const createdInteractionNode = page.locator('[data-mindmap-node][aria-selected="true"]').first();
    const interactionNodeId = await createdInteractionNode.getAttribute('data-mindmap-node');
    assert(Boolean(interactionNodeId), 'interaction fixture node must expose an ID');
    const interactionNode = page.locator(`[data-mindmap-node="${interactionNodeId}"]`);

    const quickTitleInput = page.locator('[data-mindmap-quick-title-input="true"]').first();
    await quickTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input') === 'true');
    await quickTitleInput.fill('x');
    await quickTitleInput.evaluate(input => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '心' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true, isComposing: true }));
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '心' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(50);
    const selectedAfterEditorArrows = await page.locator('[data-mindmap-node][aria-selected="true"]').getAttribute('data-mindmap-node');
    const quickTitleFocusRetained = await page.evaluate(() => document.activeElement?.getAttribute('data-mindmap-quick-title-input') === 'true');
    await quickTitleInput.press('Escape');
    await page.waitForFunction(nodeId => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, interactionNodeId);
    const focusRestoredAfterEscape = await page.evaluate(nodeId => document.activeElement?.getAttribute('data-mindmap-node') === nodeId, interactionNodeId);

    await interactionNode.dblclick({ force: true });
    const detailsModal = page.locator('[data-task-details-modal="true"]');
    const detailsTitleInput = detailsModal.locator('[data-task-details-title-input="true"]');
    await detailsModal.waitFor({ state: 'visible', timeout: 10000 });
    await detailsTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    await detailsTitleInput.press('ArrowDown');
    const selectedDuringModal = await page.locator('[data-mindmap-node][aria-selected="true"]').getAttribute('data-mindmap-node');
    const modalFocusRetained = await detailsTitleInput.evaluate(element => document.activeElement === element);
    await detailsModal.locator('button[aria-label="關閉任務詳情"]').click();
    await detailsModal.waitFor({ state: 'hidden', timeout: 10000 });

    const relationshipTarget = page.locator('[data-mindmap-note-relationship-click-target]').first();
    await relationshipTarget.click({ force: true });
    await page.locator('[data-mindmap-note-relationship][data-selected="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const selectedRelationshipId = await page.locator('[data-mindmap-note-relationship][data-selected="true"]')
      .getAttribute('data-mindmap-note-relationship');
    await relationshipTarget.evaluate(target => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(50);
    const selectedRelationshipAfterArrow = await page.locator('[data-mindmap-note-relationship][data-selected="true"]')
      .getAttribute('data-mindmap-note-relationship');
    const selectedNodeCountDuringRelationship = await page.locator('[data-mindmap-node][aria-selected="true"]').count();
    interactionEvidence = {
      initialSelectedIds,
      centerBridge,
      interactionNodeId,
      selectedAfterEditorArrows,
      quickTitleFocusRetained,
      focusRestoredAfterEscape,
      selectedDuringModal,
      modalFocusRetained,
      selectedRelationshipId,
      selectedRelationshipAfterArrow,
      selectedNodeCountDuringRelationship,
    };
    assert(
      selectedAfterEditorArrows === interactionNodeId &&
        quickTitleFocusRetained &&
        focusRestoredAfterEscape &&
        selectedDuringModal === interactionNodeId &&
        modalFocusRetained &&
        Boolean(selectedRelationshipId) &&
        selectedRelationshipAfterArrow === selectedRelationshipId &&
        selectedNodeCountDuringRelationship === 0,
      'quick-title, modal, and relationship keyboard owners must remain isolated',
      interactionEvidence,
    );

    await openFixture(200, { width: 1440, height: 900 }, null);
    const probeAttributesPresent = await page.evaluate(() => {
      const root = document.querySelector('[data-mindmap-view]');
      const node = document.querySelector('[data-mindmap-node]');
      return [
        'data-mindmap-view-render-count',
        'data-mindmap-selection-commit-count',
        'data-mindmap-selection-notification-count',
        'data-mindmap-navigation-index-build-count',
      ].some(name => root?.hasAttribute(name)) || node?.hasAttribute('data-mindmap-node-render-count') === true;
    });
    const probeOffP95Values = [];
    for (let run = 1; run <= 3; run += 1) {
      const result = await runMeasuredCase({ visibleNodeCount: 200, zoom: 1, eventIntervalMs: 33, run, screenshot: null });
      probeOffP95Values.push(result.latencyMs.p95);
    }
    const probeOnP95 = median(cases
      .filter(item => item.visibleNodeCount === 200 && item.zoom === 1 && item.eventIntervalMs === 33)
      .map(item => item.latencyMs.p95));
    const probeOffP95 = median(probeOffP95Values);
    probeComparison = {
      generalUrl: page.url(),
      probeAttributesPresent,
      probeOnP95,
      probeOffP95,
      probeOffP95Values,
      relativeRegressionRatio: (probeOffP95 - probeOnP95) / Math.max(probeOnP95, 0.1),
    };
  }

  await openFixture(50, { width: 1024, height: 768 });
  const laptopScreenshot = `${outputRoot}/laptop-1024x768.png`;
  await page.screenshot({ path: laptopScreenshot });
  const laptopVisibleErrors = await visibleErrors();
  await openFixture(50, { width: 390, height: 844 });
  const mobileScreenshot = `${outputRoot}/mobile-390x844.png`;
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  const mobileBoundary = {
    mindMapVisible: await page.locator('[data-mindmap-view]').first().isVisible().catch(() => false),
    boardVisible: await page.locator('[data-mobile-pan-surface="board"]').first().isVisible().catch(() => false),
    screenshot: mobileScreenshot,
  };
  const allVisibleErrors = [...new Set([...laptopVisibleErrors, ...(await visibleErrors())])];
  const effectiveConsoleErrors = consoleErrors.filter(message => !message.includes('Download the React DevTools'));
  const absolutePassed = cases.every(item => {
    const gate = item.visibleNodeCount === 500 ? 50 : 32;
    const telemetryPassed = phase === 'baseline' || (
      item.viewRenderDelta === 0 &&
      item.changedNodeRenderIds.length <= 2 &&
      item.notificationDelta <= item.eventCount * 2 &&
      item.navigationIndexBuildDelta === 0
    );
    return item.expectedSelectedNodeId === item.actualSelectedNodeId &&
      item.missedSteps === 0 &&
      item.latencyMs.p95 <= gate &&
      item.longTaskCount === 0 &&
      telemetryPassed &&
      item.geometryRecomputeDelta === 0 &&
      item.pathDataStable &&
      item.focusMatchesSelection &&
      (!item.selectedRectDelta || Math.max(...Object.values(item.selectedRectDelta)) <= 0.5);
  });
  const baselineCaptured = phase === 'baseline' && cases.every(item => item.missedSteps === 0 && item.pathDataStable);
  const singleStepPassed = phase === 'baseline' || (singleStep &&
    singleStep.expectedSelectedNodeId === singleStep.actualSelectedNodeId &&
    singleStep.viewRenderDelta === 0 &&
    singleStep.changedNodeRenderIds.length <= 2 &&
    singleStep.notificationDelta <= 2 &&
    singleStep.navigationIndexBuildDelta === 0 &&
    singleStep.geometryRecomputeDelta === 0 &&
    singleStep.focusMatchesSelection);
  const probeComparisonPassed = phase === 'baseline' || (probeComparison &&
    probeComparison.probeAttributesPresent === false &&
    probeComparison.relativeRegressionRatio <= 0.2);
  const interactionPassed = phase === 'baseline' || Boolean(interactionEvidence);
  const passed = (phase === 'baseline' ? baselineCaptured : absolutePassed && singleStepPassed && probeComparisonPassed && interactionPassed) &&
    effectiveConsoleErrors.length === 0 && pageErrors.length === 0 && allVisibleErrors.length === 0 &&
    mobileBoundary.mindMapVisible === false && mobileBoundary.boardVisible === true;
  const artifact = {
    verifier: 'DEV-075',
    contract: 'mindmap-keyboard-navigation-performance',
    fixtureId: 'dev-075-v1',
    phase,
    baselineRef: phase === 'baseline' ? 'baseline/git-head.txt' : 'baseline/keyboard-before.json',
    generatedAt: new Date().toISOString(),
    environment: {
      url: page.url(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize(),
      browserVersion: await page.context().browser()?.version(),
    },
    cases,
    singleStep,
    interactionEvidence,
    probeComparison,
    realKeyboardSteps,
    visualEvidence: { laptopScreenshot, mobileScreenshot },
    mobileBoundary,
    consoleErrors: effectiveConsoleErrors,
    pageErrors,
    failedRequests,
    visibleErrors: allVisibleErrors,
    regressionCommands: [],
    passed,
  };
  await page.evaluate(value => { window.__DEV075_ARTIFACT = value; }, artifact);
  return artifact;
}
