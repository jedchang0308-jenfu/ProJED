/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const outputRoot = 'output/playwright/dev-102-mindmap-marquee-multiselect-clipboard';
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'DEV-102 本機驗證',
    createdAt: 1704067200000,
  };
  const errors = { console: [], page: [], requests: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(String(error?.message || error)));
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText || '';
    if (!failure.includes('ERR_ABORTED')) errors.requests.push(`${request.method()} ${request.url()} ${failure}`);
  });

  const nodeId = index => `dev102-node-${String(index).padStart(4, '0')}`;
  const buildFixture = visibleNodeCount => {
    const workspace = {
      id: 'dev102-workspace',
      title: 'DEV-102 心智圖多選驗證',
      ownerId: account.id,
      members: [account.id],
      order: 1,
      createdAt: 1704067200000,
      boards: [{
        id: 'dev102-board',
        title: `DEV-102 心智圖 ${visibleNodeCount}`,
        dependencies: [],
        order: 1,
        createdAt: 1704067200000,
      }],
    };
    const nodes = {};
    const rootCount = Math.min(8, visibleNodeCount);
    for (let index = 0; index < visibleNodeCount; index += 1) {
      const parentIndex = index < rootCount ? null : Math.floor((index - rootCount) / 3) % Math.max(rootCount, index);
      const id = nodeId(index);
      nodes[id] = {
        id,
        workspaceId: workspace.id,
        boardId: 'dev102-board',
        parentId: parentIndex === null ? null : nodeId(parentIndex),
        title: `DEV-102 Task ${index + 1}`,
        status: 'todo',
        nodeType: 'task',
        assigneeIds: [],
        collaboratorIds: [],
        order: index < rootCount ? index : (index - rootCount) % 3,
        createdAt: 1704067200000 + index,
        updatedAt: 1704067200000 + index,
      };
    }
    const dependencies = visibleNodeCount > rootCount + 1 ? [{
      id: 'dev102-dependency-1',
      fromId: nodeId(rootCount),
      fromSide: 'end',
      toId: nodeId(rootCount + 1),
      toSide: 'start',
    }] : [];
    return { workspace, nodes, dependencies };
  };

  const writeFixture = async visibleNodeCount => {
    const fixture = buildFixture(visibleNodeCount);
    await page.evaluate(({ account, fixture, visibleNodeCount }) => {
      Object.keys(localStorage).filter(key => key.startsWith('projed.mindmap.')).forEach(key => localStorage.removeItem(key));
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([fixture.workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(fixture.nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify(fixture.dependencies));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', String(visibleNodeCount));
      localStorage.setItem('projed-last-ws', fixture.workspace.id);
      localStorage.setItem('projed-last-board', 'dev102-board');
      localStorage.setItem('projed-last-view', 'mindmap');
    }, { account, fixture, visibleNodeCount });
  };

  const switchToMindMap = async () => {
    if (await page.locator('[data-mindmap-view]').isVisible().catch(() => false)) return;
    await page.locator('[data-mode-switcher-trigger="true"]').first().click();
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
  };

  const openFixture = async (visibleNodeCount, viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await writeFixture(visibleNodeCount);
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.locator('nav').count() === 0) {
      const loginButton = page.getByRole('button', { name: /使用固定測試環境/ }).first();
      await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      await loginButton.click();
      await writeFixture(visibleNodeCount);
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    if (viewport.width > 640) {
      await switchToMindMap();
      await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(expected => document.querySelectorAll('[data-mindmap-node]').length === expected, visibleNodeCount, { timeout: 30000 });
      await page.waitForTimeout(500);
    }
  };

  const selectedIds = () => page.locator('[data-mindmap-node][aria-selected="true"]').evaluateAll(elements => (
    elements.map(element => element.getAttribute('data-mindmap-node')).filter(Boolean)
  ));

  const findTrustedMarqueePair = async () => page.evaluate(() => {
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    if (!viewport) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const nodes = Array.from(document.querySelectorAll('[data-mindmap-node]')).map(element => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-mindmap-node'),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }).filter(item => item.x > viewportRect.left + 25 && item.x < viewportRect.right - 25 && item.y > viewportRect.top + 45 && item.y < viewportRect.bottom - 25);
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const pad = 10;
        const bounds = {
          x1: Math.min(nodes[left].x, nodes[right].x) - pad,
          y1: Math.min(nodes[left].y, nodes[right].y) - pad,
          x2: Math.max(nodes[left].x, nodes[right].x) + pad,
          y2: Math.max(nodes[left].y, nodes[right].y) + pad,
        };
        const hits = nodes.filter(item => item.x >= bounds.x1 && item.x <= bounds.x2 && item.y >= bounds.y1 && item.y <= bounds.y2);
        const start = document.elementFromPoint(bounds.x1, bounds.y1);
        const end = document.elementFromPoint(bounds.x2, bounds.y2);
        if (
          hits.length === 2
          && start?.closest('[data-mindmap-surface]')
          && end?.closest('[data-mindmap-surface]')
          && !start.closest('[data-mindmap-node], [data-mindmap-center]')
          && !end.closest('[data-mindmap-node], [data-mindmap-center]')
        ) {
          return {
            ...bounds,
            ids: hits.map(item => item.id),
            startTarget: `${start.tagName.toLowerCase()}${start.getAttribute('data-mindmap-scene') ? '[scene]' : ''}`,
            endTarget: `${end.tagName.toLowerCase()}${end.getAttribute('data-mindmap-scene') ? '[scene]' : ''}`,
          };
        }
      }
    }
    return null;
  });

  const trustedMarquee = async ({ screenshot } = {}) => {
    const pair = await findTrustedMarqueePair();
    assert(pair, 'a visible blank-corner marquee pair must exist');
    await page.mouse.move(pair.x1, pair.y1);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(pair.x2, pair.y2, { steps: 8 });
    await page.waitForTimeout(80);
    const overlayState = await page.locator('[data-mindmap-marquee-overlay="true"]').evaluate(element => ({
      display: getComputedStyle(element).display,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    assert(overlayState.display !== 'none', 'marquee overlay must be visible while the trusted primary pointer remains down', { pair, overlayState });
    if (screenshot) await page.screenshot({ path: screenshot });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(80);
    const actual = await selectedIds();
    assert(actual.length === 2, 'trusted marquee must select exactly two visual placements', { expected: pair.ids, actual });
    return actual;
  };

  const setZoom = async target => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = Number(await page.locator('[data-mindmap-viewport="true"]').getAttribute('data-mindmap-zoom-level'));
      if (Math.abs(current - target) < 0.001) return;
      await page.locator(target > current ? '[data-mindmap-zoom-in]' : '[data-mindmap-zoom-out]').click();
      await page.waitForTimeout(20);
    }
    throw new Error(`unable to set zoom ${target}`);
  };

  const syntheticMarqueePerformance = async iterations => page.evaluate(async iterations => {
    const surface = document.querySelector('[data-mindmap-surface]');
    const viewport = document.querySelector('[data-mindmap-viewport="true"]');
    if (!surface || !viewport) throw new Error('mind-map surface missing');
    const rect = viewport.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const directions = [
      { id: 'north-west-to-center', start: { x: rect.left + 30, y: rect.top + 55 }, end: center },
      { id: 'south-east-to-center', start: { x: rect.right - 30, y: rect.bottom - 30 }, end: center },
      { id: 'north-east-to-center', start: { x: rect.right - 30, y: rect.top + 55 }, end: center },
      { id: 'south-west-to-center', start: { x: rect.left + 30, y: rect.bottom - 30 }, end: center },
    ];
    const warmupIterations = 5;
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
    };
    const median = values => percentile(values, 0.5);
    const readNodeRects = () => Object.fromEntries(Array.from(document.querySelectorAll('[data-mindmap-node]')).map(element => {
      const box = element.getBoundingClientRect();
      return [element.getAttribute('data-mindmap-node'), { x: box.x, y: box.y, width: box.width, height: box.height }];
    }));
    const readPaths = () => Array.from(document.querySelectorAll('[data-mindmap-connector-path], [data-mindmap-note-relationship-path]'))
      .map(element => element.getAttribute('d') || '');
    const beforeRects = readNodeRects();
    const beforePaths = readPaths();
    let longTaskCount = 0;
    let longTaskObserver = null;
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      longTaskObserver = new PerformanceObserver(list => {
        longTaskCount += list.getEntries().filter(entry => entry.duration > 50).length;
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
    }
    const directionResults = [];
    let pointerSequence = 1000;
    for (const direction of directions) {
      const previewLatencies = [];
      const commitLatencies = [];
      for (let index = 0; index < iterations + warmupIterations; index += 1) {
        pointerSequence += 1;
        const pointerId = pointerSequence;
        surface.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true, button: 0,
          clientX: direction.start.x, clientY: direction.start.y,
        }));
        const previewStartedAt = performance.now();
        surface.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true, button: 0,
          clientX: direction.end.x, clientY: direction.end.y,
        }));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const previewLatency = performance.now() - previewStartedAt;
        const commitStartedAt = performance.now();
        surface.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true, button: 0,
          clientX: direction.end.x, clientY: direction.end.y,
        }));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const commitLatency = performance.now() - commitStartedAt;
        if (index >= warmupIterations) {
          previewLatencies.push(previewLatency);
          commitLatencies.push(commitLatency);
        }
      }
      directionResults.push({
        id: direction.id,
        samples: previewLatencies.length,
        warmupSamples: warmupIterations,
        previewMedian: median(previewLatencies),
        previewP95: percentile(previewLatencies, 0.95),
        commitMedian: median(commitLatencies),
        commitP95: percentile(commitLatencies, 0.95),
      });
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (longTaskObserver) {
      longTaskCount += longTaskObserver.takeRecords().filter(entry => entry.duration > 50).length;
      longTaskObserver.disconnect();
    }
    const afterRects = readNodeRects();
    const afterPaths = readPaths();
    const rectDrifts = Object.entries(beforeRects).flatMap(([id, before]) => {
      const after = afterRects[id];
      return after ? [Math.max(
        Math.abs(after.x - before.x),
        Math.abs(after.y - before.y),
        Math.abs(after.width - before.width),
        Math.abs(after.height - before.height),
      )] : [];
    });
    const previewLatencies = directionResults.flatMap(item => [item.previewP95]);
    const commitLatencies = directionResults.flatMap(item => [item.commitP95]);
    return {
      samples: iterations * directions.length,
      warmupSamples: warmupIterations * directions.length,
      directions: directionResults,
      median: median(directionResults.map(item => item.previewMedian)),
      p95: Math.max(...previewLatencies),
      commitMedian: median(directionResults.map(item => item.commitMedian)),
      commitP95: Math.max(...commitLatencies),
      longTaskCount,
      maxNodeRectDrift: rectDrifts.length ? Math.max(...rectDrifts) : 0,
      pathDataStable: JSON.stringify(beforePaths) === JSON.stringify(afterPaths),
      selectedCount: document.querySelectorAll('[data-mindmap-node][aria-selected="true"]').length,
    };
  }, iterations);

  const openMenuOnSelected = async ids => {
    await page.locator(`[data-mindmap-node="${ids[0]}"]`).click({ button: 'right' });
    const menu = page.locator('[data-mindmap-context-menu="true"]');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
    return menu;
  };

  await openFixture(18, { width: 1440, height: 900 });
  const initialCount = await page.locator('[data-mindmap-node]').count();
  const marqueeIds = await trustedMarquee({ screenshot: `${outputRoot}/01-marquee-active-1440.png` });
  let menu = await openMenuOnSelected(marqueeIds);
  await menu.getByText('已選取 2 個任務', { exact: true }).waitFor({ state: 'visible' });
  const lockedOpen = menu.locator('[data-task-action-id="task.open-details"]');
  const hiddenUnsupportedActionCount = await lockedOpen.count();
  assert(hiddenUnsupportedActionCount === 0, 'multi unsupported action must be hidden');
  const visibleDisabledActionCount = await menu.locator('button[aria-disabled="true"]').count();
  assert(visibleDisabledActionCount === 0, 'mindmap menu must not render disabled action rows');
  const compactMenu = await menu.getAttribute('data-mindmap-context-menu-density');
  assert(compactMenu === 'compact', 'mindmap menu must use compact density');
  const visibleActionCount = await menu.locator('[data-task-action-id]').count();
  assert(visibleActionCount > 0, 'mindmap menu must retain at least one executable action');
  const menuMetrics = await menu.evaluate(element => {
    const firstAction = element.querySelector('[data-task-action-id]');
    const menuStyle = getComputedStyle(element);
    const actionStyle = firstAction ? getComputedStyle(firstAction) : null;
    const actionRect = firstAction?.getBoundingClientRect();
    const textColor = actionStyle?.color || '';
    const oklchLightness = textColor.match(/oklch\(\s*([\d.]+)%?/i)?.[1];
    const rgbChannels = textColor.match(/rgba?\(([^)]+)\)/i)?.[1]
      ?.split(/[ ,/]+/)
      .slice(0, 3)
      .map(Number)
      .filter(Number.isFinite) || [];
    const contrastPass = oklchLightness !== undefined
      ? Number(oklchLightness) <= 65
      : rgbChannels.length === 3 && rgbChannels.every(channel => channel <= 180);
    return {
      width: element.getBoundingClientRect().width,
      fontSize: Number.parseFloat(actionStyle?.fontSize || '0'),
      rowHeight: actionRect?.height || 0,
      opacity: Number.parseFloat(actionStyle?.opacity || '1'),
      textColor,
      contrastPass,
      backgroundColor: menuStyle.backgroundColor,
    };
  });
  assert(menuMetrics.width <= 260, 'mindmap menu must stay compact in width', menuMetrics);
  assert(menuMetrics.fontSize <= 13.5, 'mindmap menu action text must use compact type', menuMetrics);
  assert(menuMetrics.rowHeight <= 34, 'mindmap menu action rows must stay compact', menuMetrics);
  assert(menuMetrics.opacity >= 0.99, 'visible mindmap actions must not be faded', menuMetrics);
  assert(menuMetrics.contrastPass, 'mindmap menu text must keep strong contrast', menuMetrics);
  await page.screenshot({ path: `${outputRoot}/02-multi-locked-menu.png` });
  await menu.locator('[data-task-action-id="task.copy"]').click();
  await menu.waitFor({ state: 'hidden' });

  const anchor = page.locator('[data-mindmap-node]').filter({ hasNot: page.locator('[aria-selected="true"]') }).last();
  await anchor.click({ button: 'right' });
  menu = page.locator('[data-mindmap-context-menu="true"]');
  await menu.waitFor({ state: 'visible' });
  await menu.locator('[data-task-action-id="task.paste-after"]').click();
  await page.waitForFunction(before => document.querySelectorAll('[data-mindmap-node]').length > before, initialCount, { timeout: 15000 });
  const afterCopyCount = await page.locator('[data-mindmap-node]').count();
  const copiedRootTitles = await page.locator('[data-mindmap-node-title$="（副本）"]').count();
  assert(copiedRootTitles >= 1, 'copy paste must suffix cloned forest roots');
  const integerOrdersAfterCopy = await page.locator('[data-mindmap-node]').evaluateAll(elements => elements.every(element => Number.isSafeInteger(Number(element.getAttribute('data-mindmap-node-order')))));
  assert(integerOrdersAfterCopy, 'copy paste must leave integer node orders');
  await page.screenshot({ path: `${outputRoot}/03-copy-paste-result.png` });

  const cutSelection = await trustedMarquee();
  menu = await openMenuOnSelected(cutSelection);
  await menu.locator('[data-task-action-id="task.cut"]').click();
  await menu.waitFor({ state: 'hidden' });
  const cutVisualCount = await page.locator('[data-mindmap-cut-pending="true"]').count();
  assert(cutVisualCount >= 2, 'cut must mark every task in the live source forest');
  const cutAnchor = page.locator('[data-mindmap-node][data-mindmap-cut-pending="false"]').last();
  await cutAnchor.click({ button: 'right' });
  menu = page.locator('[data-mindmap-context-menu="true"]');
  await menu.waitFor({ state: 'visible' });
  await menu.locator('[data-task-action-id="task.paste-after"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-mindmap-cut-pending="true"]').length === 0, null, { timeout: 15000 });
  assert(await page.locator('[data-mindmap-node]').count() === afterCopyCount, 'cut paste must move without changing task count');
  await page.screenshot({ path: `${outputRoot}/04-cut-paste-result.png` });

  const assignmentSelection = await trustedMarquee();
  menu = await openMenuOnSelected(assignmentSelection);
  await menu.locator('[data-task-action-id="task.assign"]').click();
  const batchPicker = menu.locator('[data-mindmap-batch-assignment-picker="true"]');
  await batchPicker.waitFor({ state: 'visible' });
  const firstPrimary = batchPicker.locator('[data-mindmap-batch-assignment-role="primary"] button').first();
  assert(await firstPrimary.count() === 1, 'batch assignment fixture must expose a primary member option');
  await firstPrimary.click();
  await menu.waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForFunction(({ ids, memberId }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return ids.every(id => nodes[id]?.assigneeIds?.includes(memberId));
  }, { ids: assignmentSelection, memberId: account.id }, { timeout: 15000 });
  const assignmentAppliedCount = assignmentSelection.length;

  const archiveSelection = await trustedMarquee();
  menu = await openMenuOnSelected(archiveSelection);
  await menu.locator('[data-task-action-id="task.archive"]').click();
  const confirmDialog = page.locator('[data-global-dialog="true"]');
  await confirmDialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  if (await confirmDialog.isVisible().catch(() => false)) {
    await confirmDialog.locator('[data-global-dialog-decision-index="1"]').click();
  }
  await page.waitForFunction(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return ids.every(id => nodes[id]?.isArchived === true);
  }, archiveSelection, { timeout: 15000 });
  const archiveAppliedCount = archiveSelection.length;

  const zoomMatrix = [];
  for (const zoom of [0.5, 1, 2]) {
    await setZoom(zoom);
    const selected = await trustedMarquee();
    zoomMatrix.push({ zoom, selectedCount: selected.length });
    await page.locator('[data-mindmap-view]').focus();
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await setZoom(1);
  const laptopSelection = await trustedMarquee({ screenshot: `${outputRoot}/05-laptop-marquee.png` });

  const performance = [];
  for (const count of [200, 500]) {
    await openFixture(count, { width: 1440, height: 900 });
    const measurement = await syntheticMarqueePerformance(20);
    const gate = count === 500 ? 50 : 32;
    assert(measurement.p95 <= gate, `marquee p95 must stay within ${gate}ms`, { count, measurement });
    assert(measurement.directions.every(item => item.samples === 20 && item.previewP95 <= gate), 'every marquee direction must satisfy the preview gate', { count, measurement });
    assert(measurement.commitP95 <= 100, 'pointerup selection commit p95 must stay within 100ms', { count, measurement });
    assert(measurement.longTaskCount === 0, 'marquee measurement window must not emit a long task over 50ms', { count, measurement });
    assert(measurement.maxNodeRectDrift <= 0.5, 'marquee selection must not move or resize nodes', { count, measurement });
    assert(measurement.pathDataStable, 'marquee selection must not recompute connector or relationship paths', { count, measurement });
    performance.push({ visibleNodeCount: count, ...measurement, previewGate: gate, commitGate: 100 });
  }

  await openFixture(18, { width: 1440, height: 900 });
  const recoveryKey = 'projed.mindmap.batch-recovery.v1.dev102-board';
  const nodeFaultKey = 'projed-local-test.taskNodeFault';
  const nodeFaultProgressKey = 'projed-local-test.taskNodeFaultProgress';
  const persistenceFaultKey = 'projed-local-test.taskPersistenceFault';

  const failureCopySelection = await trustedMarquee();
  menu = await openMenuOnSelected(failureCopySelection);
  await menu.locator('[data-task-action-id="task.copy"]').click();
  await menu.waitFor({ state: 'hidden' });
  const forestCountBefore = await page.locator('[data-mindmap-node]').count();
  const failureAnchor = page.locator('[data-mindmap-node]').filter({ hasNot: page.locator('[aria-selected="true"]') }).last();
  await failureAnchor.click({ button: 'right' });
  menu = page.locator('[data-mindmap-context-menu="true"]');
  await menu.waitFor({ state: 'visible' });
  await page.evaluate(({ nodeFaultKey, nodeFaultProgressKey }) => {
    localStorage.removeItem(nodeFaultProgressKey);
    localStorage.setItem(nodeFaultKey, 'create-second-once');
  }, { nodeFaultKey, nodeFaultProgressKey });
  await menu.locator('[data-task-action-id="task.paste-after"]').click();
  await page.getByText('local-test injected second task create rejection', { exact: true }).last().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(({ expectedCount, nodeFaultKey, recoveryKey }) => (
    document.querySelectorAll('[data-mindmap-node]').length === expectedCount
      && localStorage.getItem(nodeFaultKey) === null
      && sessionStorage.getItem(recoveryKey) === null
  ), { expectedCount: forestCountBefore, nodeFaultKey, recoveryKey }, { timeout: 10000 });
  const forestCompensated = await page.locator('[data-mindmap-node]').count() === forestCountBefore;

  const partialSelection = await trustedMarquee();
  const partialBefore = await page.evaluate(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return Object.fromEntries(ids.map(id => [id, { assigneeIds: nodes[id]?.assigneeIds || [], collaboratorIds: nodes[id]?.collaboratorIds || [] }]));
  }, partialSelection);
  menu = await openMenuOnSelected(partialSelection);
  await menu.locator('[data-task-action-id="task.assign"]').click();
  const partialPicker = menu.locator('[data-mindmap-batch-assignment-picker="true"]');
  await partialPicker.waitFor({ state: 'visible' });
  await page.evaluate(nodeFaultKey => localStorage.setItem(nodeFaultKey, 'batch-partial-once'), nodeFaultKey);
  await partialPicker.locator('[data-mindmap-batch-assignment-role="primary"] button').first().click();
  await page.getByText('local-test injected partial task batch rejection', { exact: true }).last().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(({ nodeFaultKey, recoveryKey }) => (
    localStorage.getItem(nodeFaultKey) === null && sessionStorage.getItem(recoveryKey) === null
  ), { nodeFaultKey, recoveryKey }, { timeout: 10000 });
  const partialAfter = await page.evaluate(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return Object.fromEntries(ids.map(id => [id, { assigneeIds: nodes[id]?.assigneeIds || [], collaboratorIds: nodes[id]?.collaboratorIds || [] }]));
  }, partialSelection);
  const partialBatchRestored = JSON.stringify(partialAfter) === JSON.stringify(partialBefore);
  assert(partialBatchRestored, 'partial batch failure must compensate every selected assignment', { partialBefore, partialAfter });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden', timeout: 5000 });

  const timeoutSelection = await trustedMarquee();
  const timeoutBefore = await page.evaluate(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return Object.fromEntries(ids.map(id => [id, nodes[id]?.assigneeIds || []]));
  }, timeoutSelection);
  menu = await openMenuOnSelected(timeoutSelection);
  await menu.locator('[data-task-action-id="task.assign"]').click();
  const timeoutPicker = menu.locator('[data-mindmap-batch-assignment-picker="true"]');
  await timeoutPicker.waitFor({ state: 'visible' });
  await page.evaluate(persistenceFaultKey => localStorage.setItem(persistenceFaultKey, 'timeout-no-commit-once'), persistenceFaultKey);
  await timeoutPicker.locator('[data-mindmap-batch-assignment-role="primary"] button').first().click();
  const timeoutRecoveryAlert = page.locator('[data-mindmap-batch-recovery-alert="true"]');
  await timeoutRecoveryAlert.waitFor({ state: 'visible', timeout: 12000 });
  const descriptorPresentBeforeRecovery = await page.evaluate(recoveryKey => sessionStorage.getItem(recoveryKey) !== null, recoveryKey);
  const timeoutAfter = await page.evaluate(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return Object.fromEntries(ids.map(id => [id, nodes[id]?.assigneeIds || []]));
  }, timeoutSelection);
  assert(JSON.stringify(timeoutAfter) === JSON.stringify(timeoutBefore), 'timeout without provider commit must keep the before-state locally', { timeoutBefore, timeoutAfter });
  assert(descriptorPresentBeforeRecovery, 'timeout must preserve a reload-safe recovery descriptor');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await switchToMindMap();
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(recoveryKey => sessionStorage.getItem(recoveryKey) === null, recoveryKey, { timeout: 15000 });
  const descriptorClearedAfterRecovery = true;
  const recoveredAssignments = await page.evaluate(ids => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return Object.fromEntries(ids.map(id => [id, nodes[id]?.assigneeIds || []]));
  }, timeoutSelection);
  assert(JSON.stringify(recoveredAssignments) === JSON.stringify(timeoutBefore), 'reload readback recovery must converge to the provider before-state', { timeoutBefore, recoveredAssignments });
  const transactionRecovery = {
    forestCreateStatus: 'compensated',
    forestCompensated,
    partialBatchStatus: 'compensated',
    partialBatchRestored,
    timeoutStatus: 'indeterminate',
    descriptorPresentBeforeRecovery,
    recoveryStatus: 'rejected-before-state',
    descriptorClearedAfterRecovery,
  };
  assert(forestCompensated, 'partial forest creation must remove every partially-created task', transactionRecovery);

  await page.evaluate(() => {
    sessionStorage.setItem('projed.mindmap.batch-recovery.v1.dev102-board', '{corrupt');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await switchToMindMap();
  const recoveryAlert = page.locator('[data-mindmap-batch-recovery-alert="true"]');
  await recoveryAlert.waitFor({ state: 'visible', timeout: 15000 });
  const recoveryText = (await recoveryAlert.textContent())?.trim() || '';
  assert(recoveryText.includes('損壞') || recoveryText.includes('暫停'), 'hard reload must retain a visible recovery lock', { recoveryText });
  await page.screenshot({ path: `${outputRoot}/06-hard-reload-recovery-lock.png` });
  await page.evaluate(() => sessionStorage.removeItem('projed.mindmap.batch-recovery.v1.dev102-board'));

  const mobileBoundaries = [];
  for (const viewport of [{ width: 390, height: 844, screenshot: '07-mobile-boundary-390.png' }, { width: 320, height: 568, screenshot: '08-mobile-boundary-320.png' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    const boundary = {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mindMapVisible: await page.locator('[data-mindmap-view]').isVisible().catch(() => false),
      marqueeVisible: await page.locator('[data-mindmap-marquee-overlay="true"]').isVisible().catch(() => false),
      width: await page.evaluate(() => document.documentElement.scrollWidth),
    };
    assert(!boundary.mindMapVisible, 'mobile boundary must retain the existing board fallback', boundary);
    assert(!boundary.marqueeVisible, 'mobile boundary must not expose active desktop marquee', boundary);
    assert(boundary.width <= viewport.width, 'mobile boundary must not introduce horizontal page overflow', boundary);
    await page.screenshot({ path: `${outputRoot}/${viewport.screenshot}` });
    mobileBoundaries.push(boundary);
  }
  const mobileBoundary = mobileBoundaries[0];

  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser must not emit console, page, or request errors', errors);

  const artifact = {
    verifier: 'DEV-102',
    contract: 'mindmap-marquee-multiselect-clipboard',
    fixtureId: 'dev-102-v1',
    passed: true,
    selection: { initialMarqueeIds: marqueeIds, laptopSelection },
    menu: { multiSummary: 2, hiddenUnsupportedActionCount, visibleDisabledActionCount, visibleActionCount, compactMenu, menuMetrics },
    clipboard: { initialCount, afterCopyCount, copiedRootTitles, cutVisualCount },
    batchActions: { assignmentAppliedCount, archiveAppliedCount },
    zoomMatrix,
    performance,
    transactionRecovery,
    recovery: { visible: true, text: recoveryText },
    mobileBoundary,
    mobileBoundaries,
    consoleErrors: errors.console,
    pageErrors: errors.page,
    failedRequests: errors.requests,
    screenshots: [
      '01-marquee-active-1440.png',
      '02-multi-locked-menu.png',
      '03-copy-paste-result.png',
      '04-cut-paste-result.png',
      '05-laptop-marquee.png',
      '06-hard-reload-recovery-lock.png',
      '07-mobile-boundary-390.png',
      '08-mobile-boundary-320.png',
    ],
  };
  await page.evaluate(result => {
    window.__DEV102_ARTIFACT = result;
    sessionStorage.setItem('__DEV102_ARTIFACT', JSON.stringify(result));
  }, artifact);
  return artifact;
}
