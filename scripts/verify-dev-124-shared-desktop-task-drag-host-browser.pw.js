/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-124-shared-desktop-task-drag-host';
  const result = {
    devId: 'DEV-124', status: 'FAIL', sourceRevision: 'working-tree', environment: 'local-test / Chromium', route: '/',
    viewport: { width: 1440, height: 900 }, cases: [], browserErrors: [], httpFailures: [], screenshots: [],
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false },
  };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, ok, details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) result.httpFailures.push({ status: response.status(), url: response.url() }); });

  const account = { id: 'dev124-owner', uid: 'dev124-owner', email: 'dev124@projed.local', displayName: 'DEV-124 Owner', createdAt: 1704067200000 };
  const workspace = { id: 'dev124-workspace', title: 'DEV-124 Workspace', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000, boards: [{ id: 'dev124-board', title: 'DEV-124 Board', dependencies: [], order: 1, createdAt: 1704067200000 }] };
  const nodes = {
    'dev124-root-a': { id: 'dev124-root-a', workspaceId: workspace.id, boardId: 'dev124-board', parentId: null, title: 'DEV-124 Root A', status: 'todo', nodeType: 'group', order: 0 },
    'dev124-root-b': { id: 'dev124-root-b', workspaceId: workspace.id, boardId: 'dev124-board', parentId: null, title: 'DEV-124 Root B', status: 'todo', nodeType: 'group', order: 1 },
    'dev124-child-a': { id: 'dev124-child-a', workspaceId: workspace.id, boardId: 'dev124-board', parentId: 'dev124-root-a', title: 'DEV-124 Child A', status: 'todo', nodeType: 'task', order: 0 },
    'dev124-grandchild-a': { id: 'dev124-grandchild-a', workspaceId: workspace.id, boardId: 'dev124-board', parentId: 'dev124-child-a', title: 'DEV-124 Grandchild A', status: 'todo', nodeType: 'task', order: 0 },
    'dev124-grandchild-a2': { id: 'dev124-grandchild-a2', workspaceId: workspace.id, boardId: 'dev124-board', parentId: 'dev124-child-a', title: 'DEV-124 Grandchild A2', status: 'todo', nodeType: 'task', order: 1 },
    'dev124-child-b': { id: 'dev124-child-b', workspaceId: workspace.id, boardId: 'dev124-board', parentId: 'dev124-root-b', title: 'DEV-124 Child B', status: 'todo', nodeType: 'task', order: 0 },
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:dev124-board`]: [{ userId: account.id, role: 'owner', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev124-board');
      localStorage.setItem('projed-last-view', 'goal');
    }, { account, workspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) { await fixed.click({ force: true }); await page.waitForTimeout(250); }
    const goal = page.locator('[data-goal-view="true"]');
    await goal.waitFor({ state: 'visible', timeout: 15000 });
    record('B01-goal-renders-through-shared-host', await goal.locator('[data-desktop-task-drag-layer="true"]').count() === 1 && await goal.locator('[data-goal-task-row]').count() === 6);
    const transforms = await goal.locator('[data-goal-task-row]').evaluateAll(rows => rows.map(row => getComputedStyle(row).transform));
    record('B02-goal-rows-do-not-transform-during-static-layout', transforms.every(value => value === 'none'), { transforms });
    const source = goal.locator('[data-goal-task-row-id="dev124-root-b"] [data-task-drag-surface-kind="goal-row"]');
    const target = goal.locator('[data-goal-task-row-id="dev124-root-a"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    record('B03-drag-surfaces-expose-source-and-target-geometry', Boolean(sourceBox && targetBox), { sourceBox, targetBox });
    if (sourceBox && targetBox) {
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 24, sourceBox.y + sourceBox.height / 2, { steps: 5 });
      await page.waitForTimeout(100);
      await page.mouse.move(targetBox.x + Math.min(80, targetBox.width / 2), targetBox.y + 2, { steps: 8 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem('projed-local-test.nodes');
      const parsed = raw ? JSON.parse(raw) : {};
      return { rootA: parsed['dev124-root-a'], rootB: parsed['dev124-root-b'], layerCount: document.querySelectorAll('[data-desktop-task-drag-layer="true"]').length };
    });
    record('B04-goal-root-reorder-uses-canonical-local-batch', persisted.rootB?.order === 0 && persisted.rootA?.order === 1, persisted);
    await page.screenshot({ path: `${OUTPUT_DIR}/B05-dev124-goal-drag-host.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/B05-dev124-goal-drag-host.png`);

    const resetView = async (view) => {
      await page.evaluate(({ nodes, view }) => {
        localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
        localStorage.setItem('projed-last-view', view);
      }, { nodes, view });
      await page.reload({ waitUntil: 'networkidle' });
      const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ });
      if (await fixedEnvironment.count() && await fixedEnvironment.isVisible().catch(() => false)) {
        await fixedEnvironment.click({ force: true });
        await page.waitForTimeout(250);
      }
    };
    const dragGoal = async ({ sourceId, targetId, x, y }) => {
      const sourceSurface = page.locator(`[data-goal-task-row-id="${sourceId}"] [data-task-drag-surface-kind="goal-row"]`);
      const targetRow = page.locator(`[data-goal-task-row-id="${targetId}"]`);
      const sourceRect = await sourceSurface.boundingBox();
      const targetRect = await targetRow.boundingBox();
      const laneRect = await page.locator('#goal-column-task').boundingBox();
      if (!sourceRect || !targetRect) return { sourceRect, targetRect };
      await page.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(sourceRect.x + sourceRect.width / 2 + 24, sourceRect.y + sourceRect.height / 2, { steps: 5 });
      await page.waitForTimeout(80);
      await page.mouse.move(x(targetRect, laneRect || targetRect), y(targetRect), { steps: 8 });
      await page.waitForTimeout(120);
      return { sourceRect, targetRect };
    };
    const dragBoard = async ({ sourceId, targetId }) => {
      const sourceSurface = page.locator(`[data-task-drag-surface-kind="kanban-card"][data-task-id="${sourceId}"]`);
      const targetSurface = page.locator(`[data-task-drag-surface-kind="kanban-card"][data-task-id="${targetId}"]`);
      const sourceRect = await sourceSurface.boundingBox();
      const targetRect = await targetSurface.boundingBox();
      if (!sourceRect || !targetRect) return { sourceRect, targetRect };
      await page.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(sourceRect.x + sourceRect.width / 2 + 24, sourceRect.y + sourceRect.height / 2, { steps: 5 });
      await page.waitForTimeout(80);
      await page.mouse.move(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2, { steps: 8 });
      await page.waitForTimeout(120);
      return { sourceRect, targetRect };
    };
    const readGoalTreeEvidence = async (targetId) => page.locator('[data-goal-drag-tree-preview="true"]').evaluate((preview, expectedTargetId) => {
      const stem = preview.querySelector('[data-goal-drag-tree-preview-segment="stem"]');
      const branch = preview.querySelector('[data-goal-drag-tree-preview-segment="branch"]');
      const marker = document.querySelector('[data-goal-drag-marker="true"]');
      const dot = marker?.querySelector('[data-kanban-insertion-dot="true"]');
      const targetRow = document.querySelector(`[data-goal-task-row-id="${expectedTargetId}"]`);
      const targetTitle = targetRow?.querySelector('[data-task-title-slot="true"]');
      const hierarchyRow = targetRow?.querySelector('[data-task-hierarchy-row="true"]');
      const previewAnchorId = marker?.getAttribute('data-goal-drag-preview-anchor') || null;
      const previewAnchorRow = previewAnchorId
        ? document.querySelector(`[data-goal-task-row-id="${previewAnchorId}"]`)
        : null;
      const lane = document.querySelector('#goal-column-task');
      const stemRect = stem?.getBoundingClientRect();
      const branchRect = branch?.getBoundingClientRect();
      const markerRect = marker?.getBoundingClientRect();
      const dotRect = dot?.getBoundingClientRect();
      const targetRect = targetRow?.getBoundingClientRect();
      const laneRect = lane?.getBoundingClientRect();
      const hierarchyStyle = hierarchyRow ? getComputedStyle(hierarchyRow) : null;
      const level = Number(targetRow?.getAttribute('data-goal-level') || 0);
      const indent = Number.parseFloat(hierarchyStyle?.getPropertyValue('--task-hierarchy-indent') || '10.4');
      const laneStart = Number.parseFloat(hierarchyStyle?.getPropertyValue('--goal-hierarchy-lane-start') || '20');
      return {
        target: preview.getAttribute('data-goal-drag-tree-preview-target'),
        kind: preview.getAttribute('data-goal-drag-tree-preview-kind'),
        segmentCount: preview.querySelectorAll('[data-goal-drag-tree-preview-segment]').length,
        markerFeedback: marker?.getAttribute('data-desktop-task-insertion-feedback') || null,
        markerPosition: marker?.getAttribute('data-goal-drag-position') || null,
        markerPresentation: marker?.getAttribute('data-desktop-task-insertion-presentation') || null,
        previewAnchor: previewAnchorId,
        previewAnchorCenterY: previewAnchorRow
          ? previewAnchorRow.getBoundingClientRect().top + previewAnchorRow.getBoundingClientRect().height / 2
          : null,
        markerCount: document.querySelectorAll('[data-goal-drag-marker="true"]').length,
        previewCount: document.querySelectorAll('[data-goal-drag-tree-preview="true"]').length,
        markerLeft: marker ? Number.parseFloat(marker.style.left) : null,
        markerTop: marker ? Number.parseFloat(marker.style.top) : null,
        targetTitleLeft: targetTitle?.getBoundingClientRect().left || null,
        expectedOwnRailX: laneRect ? laneRect.left + laneStart + level * indent : null,
        expectedParentRailX: laneRect ? laneRect.left + laneStart + Math.max(0, level - 1) * indent : null,
        expectedRowCenterY: targetRect ? targetRect.top + targetRect.height / 2 : null,
        stemRect: stemRect?.toJSON() || null,
        branchRect: branchRect?.toJSON() || null,
        markerRect: markerRect?.toJSON() || null,
        dotRect: dotRect?.toJSON() || null,
        pointerEvents: getComputedStyle(preview).pointerEvents,
      };
    }, targetId).catch(() => ({ target: null, kind: null, segmentCount: 0 }));

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const halfScaleRects = await dragGoal({
      sourceId: 'dev124-root-b',
      targetId: 'dev124-root-a',
      x: rect => rect.x + 80,
      y: rect => rect.y + rect.height / 2,
    });
    if (halfScaleRects.sourceRect && halfScaleRects.targetRect) {
      const overlayEvidence = await page.locator('[data-goal-drag-overlay="true"]').evaluate(overlay => {
        const rect = overlay.getBoundingClientRect();
        const style = getComputedStyle(overlay);
        return {
          count: document.querySelectorAll('[data-goal-drag-overlay="true"]').length,
          sourceId: overlay.getAttribute('data-task-drag-source-id'),
          title: overlay.textContent?.trim() || '',
          layoutWidth: overlay.offsetWidth,
          layoutHeight: overlay.offsetHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
          scaleX: overlay.offsetWidth ? rect.width / overlay.offsetWidth : null,
          scaleY: overlay.offsetHeight ? rect.height / overlay.offsetHeight : null,
          computedScale: style.scale,
          pointerEvents: style.pointerEvents,
          transform: style.transform,
        };
      }).catch(() => ({ count: 0, sourceId: null, title: '', scaleX: null, scaleY: null }));
      record('B48-goal-floating-drag-card-renders-at-half-size', overlayEvidence.count === 1
        && overlayEvidence.sourceId === 'dev124-root-b'
        && overlayEvidence.title === 'DEV-124 Root B'
        && overlayEvidence.pointerEvents === 'none'
        && overlayEvidence.computedScale === '0.5'
        && overlayEvidence.scaleX !== null
        && overlayEvidence.scaleY !== null
        && Math.abs(overlayEvidence.scaleX - 0.5) <= 0.02
        && overlayEvidence.scaleY >= 0.5
        && overlayEvidence.scaleY <= 0.54,
      { halfScaleRects, overlayEvidence });
      await page.screenshot({ path: `${OUTPUT_DIR}/B48-dev124-goal-half-size-floating-card.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B48-dev124-goal-half-size-floating-card.png`);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    } else record('B48-goal-floating-drag-card-renders-at-half-size', false, halfScaleRects);

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const afterPreviousTarget = await page.locator('[data-goal-task-row-id="dev124-grandchild-a"]').boundingBox();
    let afterPreviousEvidence = null;
    if (afterPreviousTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-grandchild-a',
        x: rect => rect.x + 100,
        y: rect => rect.y + rect.height * 0.75,
      });
      afterPreviousEvidence = await readGoalTreeEvidence('dev124-grandchild-a');
      await page.screenshot({ path: `${OUTPUT_DIR}/B49-dev124-equivalent-boundary-after-previous.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B49-dev124-equivalent-boundary-after-previous.png`);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const beforeNextTarget = await page.locator('[data-goal-task-row-id="dev124-grandchild-a2"]').boundingBox();
    if (afterPreviousEvidence && beforeNextTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-grandchild-a2',
        x: rect => rect.x + 100,
        y: rect => rect.y + rect.height * 0.25,
      });
      const beforeNextEvidence = await readGoalTreeEvidence('dev124-grandchild-a2');
      await page.screenshot({ path: `${OUTPUT_DIR}/B49-dev124-equivalent-boundary-before-next.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B49-dev124-equivalent-boundary-before-next.png`);
      await page.mouse.up();
      await page.waitForTimeout(500);
      const committedBoundary = await page.evaluate(() => {
        const parsed = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        return {
          previous: parsed['dev124-grandchild-a'],
          moved: parsed['dev124-root-b'],
          next: parsed['dev124-grandchild-a2'],
        };
      });
      const sameRect = (left, right, keys) => Boolean(left && right && keys.every(key => Math.abs(left[key] - right[key]) <= 1));
      record('B49-goal-equivalent-sibling-boundary-keeps-only-previous-after-style',
        afterPreviousEvidence.target === 'dev124-grandchild-a'
        && afterPreviousEvidence.markerPosition === 'after'
        && afterPreviousEvidence.previewAnchor === 'dev124-grandchild-a'
        && beforeNextEvidence.target === 'dev124-grandchild-a2'
        && beforeNextEvidence.markerPosition === 'before'
        && beforeNextEvidence.previewAnchor === 'dev124-grandchild-a'
        && afterPreviousEvidence.segmentCount === 2
        && beforeNextEvidence.segmentCount === 2
        && sameRect(afterPreviousEvidence.stemRect, beforeNextEvidence.stemRect, ['left', 'top', 'right', 'bottom'])
        && sameRect(afterPreviousEvidence.branchRect, beforeNextEvidence.branchRect, ['left', 'top', 'right', 'bottom'])
        && sameRect(afterPreviousEvidence.markerRect, beforeNextEvidence.markerRect, ['left', 'top', 'right', 'bottom'])
        && committedBoundary.moved?.parentId === 'dev124-child-a'
        && committedBoundary.previous?.order < committedBoundary.moved?.order
        && committedBoundary.moved?.order < committedBoundary.next?.order,
      { afterPreviousEvidence, beforeNextEvidence, committedBoundary });
    } else record('B49-goal-equivalent-sibling-boundary-keeps-only-previous-after-style', false, { afterPreviousTarget, beforeNextTarget, afterPreviousEvidence });

    await resetView('goal');
    const goalR3 = page.locator('[data-goal-view="true"]');
    await goalR3.waitFor({ state: 'visible', timeout: 15000 });
    const targetR3 = await page.locator('[data-goal-task-row-id="dev124-root-a"]').boundingBox();
    const laneR3 = await page.locator('#goal-column-task').boundingBox();
    if (targetR3 && laneR3) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: (_rect, lane) => lane.x + lane.width - 18,
        y: rect => rect.y + rect.height * 0.75,
      });
      const standardEvidence = await page.locator('[data-goal-drag-marker="true"]').evaluate(marker => {
        const dot = marker.querySelector('[data-kanban-insertion-dot="true"]');
        const bar = marker.querySelector('[data-kanban-insertion-bar="true"]');
        const title = document.querySelector('[data-goal-task-row-id="dev124-root-a"] [data-task-title-slot="true"]');
        const lane = document.querySelector('#goal-column-task');
        const visibleRows = Array.from(document.querySelectorAll('[data-goal-task-row-id]'));
        const subtreeRows = visibleRows.filter(row => ['dev124-root-a', 'dev124-child-a', 'dev124-grandchild-a', 'dev124-grandchild-a2'].includes(row.getAttribute('data-goal-task-row-id')));
        return {
          marker: true,
          axis: marker.getAttribute('data-desktop-task-insertion-axis'),
          feedback: marker.getAttribute('data-desktop-task-insertion-feedback'),
          presentation: marker.getAttribute('data-desktop-task-insertion-presentation'),
          position: marker.getAttribute('data-goal-drag-position'),
          left: Number.parseFloat(marker.style.left),
          top: Number.parseFloat(marker.style.top),
          width: Number.parseFloat(marker.style.width),
          markerRect: marker.getBoundingClientRect().toJSON(),
          dotRect: dot?.getBoundingClientRect().toJSON() || null,
          barRect: bar?.getBoundingClientRect().toJSON() || null,
          titleLeft: title?.getBoundingClientRect().left || null,
          laneRect: lane?.getBoundingClientRect().toJSON() || null,
          subtreeBottom: Math.max(...subtreeRows.map(row => row.getBoundingClientRect().bottom)),
        };
      }).catch(() => ({ marker: false }));
      record('B30-goal-renders-shared-insertion-marker-with-surface-tree-visual', standardEvidence.marker && standardEvidence.axis === 'horizontal'
        && standardEvidence.feedback === 'standard' && standardEvidence.presentation === 'kanban-marker'
        && Boolean(standardEvidence.dotRect && standardEvidence.barRect), standardEvidence);
      record('B31-goal-after-line-uses-visible-subtree-bottom', standardEvidence.marker
        && Math.abs(standardEvidence.top - standardEvidence.subtreeBottom) <= 1, standardEvidence);
      record('B32-goal-line-uses-title-anchor-and-cell-right-inset', standardEvidence.marker
        && Math.abs(standardEvidence.left - standardEvidence.titleLeft) <= 2
        && standardEvidence.width >= 24
        && standardEvidence.left + standardEvidence.width <= standardEvidence.laneRect.right - 3, standardEvidence);
      const markerRect = standardEvidence.markerRect;
      const laneRect = standardEvidence.laneRect;
      const goalRect = await goalR3.boundingBox();
      record('B35-goal-marker-full-bounds-stay-inside-clipping-intersection', standardEvidence.marker
        && markerRect && laneRect
        && markerRect.left >= laneRect.left - 1 && markerRect.right <= laneRect.right + 1
        && (!goalRect || (markerRect.top >= goalRect.y - 1 && markerRect.bottom <= goalRect.y + goalRect.height + 1)), standardEvidence);
      const rootAfterEvidence = await readGoalTreeEvidence('dev124-root-a');
      await page.mouse.move(laneR3.x + laneR3.width - 18, targetR3.y + 2, { steps: 6 });
      await page.waitForTimeout(120);
      const rootBeforeEvidence = await readGoalTreeEvidence('dev124-root-a');
      const rootAfterBranchCenterY = rootAfterEvidence.branchRect ? rootAfterEvidence.branchRect.top + rootAfterEvidence.branchRect.height / 2 : null;
      const rootAfterDotCenterX = rootAfterEvidence.dotRect ? rootAfterEvidence.dotRect.left + rootAfterEvidence.dotRect.width / 2 : null;
      const rootBeforeBranchCenterY = rootBeforeEvidence.branchRect ? rootBeforeEvidence.branchRect.top + rootBeforeEvidence.branchRect.height / 2 : null;
      const rootBeforeDotCenterX = rootBeforeEvidence.dotRect ? rootBeforeEvidence.dotRect.left + rootBeforeEvidence.dotRect.width / 2 : null;
      record('B44-goal-root-standard-before-after-preview-branch-only-tree-connector', rootAfterEvidence.target === 'dev124-root-a'
        && rootAfterEvidence.kind === 'root'
        && rootAfterEvidence.markerPosition === 'after'
        && rootAfterEvidence.segmentCount === 1
        && !rootAfterEvidence.stemRect
        && rootAfterEvidence.branchRect?.height === 2
        && Math.abs(rootAfterEvidence.branchRect.left - rootAfterEvidence.expectedOwnRailX) <= 1
        && Math.abs(rootAfterBranchCenterY - rootAfterEvidence.markerTop) <= 1
        && rootAfterEvidence.markerPresentation === 'kanban-marker'
        && rootAfterEvidence.dotRect
        && Math.abs(rootAfterEvidence.branchRect.right - rootAfterEvidence.targetTitleLeft) <= 1
        && rootBeforeEvidence.kind === 'root'
        && rootBeforeEvidence.markerPosition === 'before'
        && rootBeforeEvidence.segmentCount === 1
        && !rootBeforeEvidence.stemRect
        && rootBeforeEvidence.branchRect?.height === 2
        && Math.abs(rootBeforeEvidence.branchRect.left - rootBeforeEvidence.expectedOwnRailX) <= 1
        && Math.abs(rootBeforeBranchCenterY - rootBeforeEvidence.markerTop) <= 1
        && rootBeforeEvidence.markerPresentation === 'kanban-marker'
        && rootBeforeEvidence.dotRect
        && Math.abs(rootBeforeEvidence.branchRect.right - rootBeforeEvidence.targetTitleLeft) <= 1,
      { rootAfterEvidence, rootBeforeEvidence, rootAfterBranchCenterY, rootAfterDotCenterX, rootBeforeBranchCenterY, rootBeforeDotCenterX });
      await page.mouse.up();
    } else {
      record('B30-goal-renders-shared-insertion-marker-with-surface-tree-visual', false, { targetR3, laneR3 });
      record('B31-goal-after-line-uses-visible-subtree-bottom', false, { targetR3, laneR3 });
      record('B32-goal-line-uses-title-anchor-and-cell-right-inset', false, { targetR3, laneR3 });
      record('B35-goal-marker-full-bounds-stay-inside-clipping-intersection', false, { targetR3, laneR3 });
      record('B44-goal-root-standard-before-after-preview-branch-only-tree-connector', false, { targetR3, laneR3 });
    }

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const midpointTarget = await page.locator('[data-goal-task-row-id="dev124-root-a"]').boundingBox();
    if (midpointTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: (_rect, lane) => lane.x + lane.width - 18,
        y: rect => rect.y + rect.height / 2,
      });
      const midpointPosition = await page.locator('[data-goal-drag-marker="true"]').getAttribute('data-goal-drag-position').catch(() => null);
      record('B33-goal-exact-midpoint-resolves-after', midpointPosition === 'after', { midpointPosition });
      await page.mouse.up();
    } else record('B33-goal-exact-midpoint-resolves-after', false, { midpointTarget });

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const deepTarget = await page.locator('[data-goal-task-row-id="dev124-grandchild-a"]').boundingBox();
    const deepLane = await page.locator('#goal-column-task').boundingBox();
    if (deepTarget && deepLane) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-grandchild-a',
        x: (_rect, lane) => lane.x + lane.width - 18,
        y: rect => rect.y + 2,
      });
      const deepBeforeEvidence = await readGoalTreeEvidence('dev124-grandchild-a');
      await page.mouse.move(deepLane.x + deepLane.width - 18, deepTarget.y + deepTarget.height - 2, { steps: 6 });
      await page.waitForTimeout(120);
      const deepAfterEvidence = await readGoalTreeEvidence('dev124-grandchild-a');
      const beforeStemCenterX = deepBeforeEvidence.stemRect ? deepBeforeEvidence.stemRect.left + deepBeforeEvidence.stemRect.width / 2 : null;
      const beforeBranchCenterY = deepBeforeEvidence.branchRect ? deepBeforeEvidence.branchRect.top + deepBeforeEvidence.branchRect.height / 2 : null;
      const beforeDotCenterX = deepBeforeEvidence.dotRect ? deepBeforeEvidence.dotRect.left + deepBeforeEvidence.dotRect.width / 2 : null;
      const afterStemCenterX = deepAfterEvidence.stemRect ? deepAfterEvidence.stemRect.left + deepAfterEvidence.stemRect.width / 2 : null;
      const afterBranchCenterY = deepAfterEvidence.branchRect ? deepAfterEvidence.branchRect.top + deepAfterEvidence.branchRect.height / 2 : null;
      const afterDotCenterX = deepAfterEvidence.dotRect ? deepAfterEvidence.dotRect.left + deepAfterEvidence.dotRect.width / 2 : null;
      record('B45-goal-deep-standard-before-after-preview-parent-tree-connector', deepBeforeEvidence.kind === 'sibling'
        && deepBeforeEvidence.markerPosition === 'before'
        && deepBeforeEvidence.segmentCount === 2
        && deepBeforeEvidence.previewAnchor === 'dev124-child-a'
        && Math.abs(beforeStemCenterX - deepBeforeEvidence.expectedParentRailX) <= 1
        && Math.abs(deepBeforeEvidence.stemRect.top - deepBeforeEvidence.previewAnchorCenterY) <= 1
        && Math.abs(deepBeforeEvidence.stemRect.bottom - deepBeforeEvidence.markerTop) <= 1
        && deepBeforeEvidence.stemRect.top <= deepBeforeEvidence.stemRect.bottom
        && Math.abs(beforeBranchCenterY - deepBeforeEvidence.markerTop) <= 1
        && deepBeforeEvidence.markerPresentation === 'kanban-marker'
        && deepBeforeEvidence.dotRect
        && Math.abs(deepBeforeEvidence.branchRect.right - deepBeforeEvidence.targetTitleLeft) <= 1
        && deepAfterEvidence.kind === 'sibling'
        && deepAfterEvidence.markerPosition === 'after'
        && deepAfterEvidence.segmentCount === 2
        && Math.abs(afterStemCenterX - deepAfterEvidence.expectedParentRailX) <= 1
        && Math.abs(deepAfterEvidence.stemRect.top - deepAfterEvidence.expectedRowCenterY) <= 1
        && Math.abs(deepAfterEvidence.stemRect.bottom - deepAfterEvidence.markerTop) <= 1
        && Math.abs(afterBranchCenterY - deepAfterEvidence.markerTop) <= 1
        && deepAfterEvidence.markerPresentation === 'kanban-marker'
        && deepAfterEvidence.dotRect
        && Math.abs(deepAfterEvidence.branchRect.right - deepAfterEvidence.targetTitleLeft) <= 1,
      { deepBeforeEvidence, deepAfterEvidence, beforeStemCenterX, beforeBranchCenterY, beforeDotCenterX, afterStemCenterX, afterBranchCenterY, afterDotCenterX });
      await page.screenshot({ path: `${OUTPUT_DIR}/B45-dev124-goal-standard-tree-preview.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B45-dev124-goal-standard-tree-preview.png`);
      await page.mouse.up();
    } else record('B45-goal-deep-standard-before-after-preview-parent-tree-connector', false, { deepTarget, deepLane });

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const firstChildTarget = await page.locator('[data-goal-task-row-id="dev124-grandchild-a"]').boundingBox();
    if (firstChildTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-grandchild-a',
        x: rect => rect.x + 100,
        y: rect => rect.y + 2,
      });
      const firstChildEvidence = await readGoalTreeEvidence('dev124-grandchild-a');
      const stemCenterX = firstChildEvidence.stemRect
        ? firstChildEvidence.stemRect.left + firstChildEvidence.stemRect.width / 2
        : null;
      record('B50-goal-before-first-child-preview-stem-is-top-down-only',
        firstChildEvidence.target === 'dev124-grandchild-a'
        && firstChildEvidence.markerPosition === 'before'
        && firstChildEvidence.previewAnchor === 'dev124-child-a'
        && firstChildEvidence.markerCount === 1
        && firstChildEvidence.previewCount === 1
        && firstChildEvidence.segmentCount === 2
        && Math.abs(stemCenterX - firstChildEvidence.expectedParentRailX) <= 1
        && Math.abs(firstChildEvidence.stemRect.top - firstChildEvidence.previewAnchorCenterY) <= 1
        && Math.abs(firstChildEvidence.stemRect.bottom - firstChildEvidence.markerTop) <= 1
        && firstChildEvidence.stemRect.top <= firstChildEvidence.stemRect.bottom,
      firstChildEvidence);
      await page.screenshot({ path: `${OUTPUT_DIR}/B50-dev124-goal-before-first-child-top-down-preview.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B50-dev124-goal-before-first-child-top-down-preview.png`);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    } else record('B50-goal-before-first-child-preview-stem-is-top-down-only', false, { firstChildTarget });

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const parityTarget = await page.locator('[data-goal-task-row-id="dev124-grandchild-a"]').boundingBox();
    const parityLane = await page.locator('#goal-column-task').boundingBox();
    if (parityTarget && parityLane) {
      await dragGoal({
        sourceId: 'dev124-child-b',
        targetId: 'dev124-grandchild-a',
        x: (_rect, lane) => lane.x + lane.width - 18,
        y: rect => rect.y + 2,
      });
      const previewParity = await page.locator('[data-goal-drag-tree-preview="true"]').evaluate(preview => {
        const branch = preview.querySelector('[data-goal-drag-tree-preview-segment="branch"]');
        const marker = document.querySelector('[data-goal-drag-marker="true"]');
        const targetTitle = document.querySelector('[data-goal-task-row-id="dev124-grandchild-a"] [data-task-title-slot="true"]');
        return {
          branchRect: branch?.getBoundingClientRect().toJSON() || null,
          targetTitleLeft: targetTitle?.getBoundingClientRect().left || null,
          sharedPresenter: marker?.getAttribute('data-desktop-task-insertion-indicator') === 'true',
          presentation: marker?.getAttribute('data-desktop-task-insertion-presentation') || null,
          dotCount: marker?.querySelectorAll('[data-kanban-insertion-dot="true"]').length ?? -1,
          barCount: marker?.querySelectorAll('[data-kanban-insertion-bar="true"]').length ?? -1,
        };
      }).catch(() => ({ branchRect: null, targetTitleLeft: null, sharedPresenter: false, presentation: null, dotCount: -1, barCount: -1 }));
      await page.screenshot({ path: `${OUTPUT_DIR}/B47-dev124-goal-final-tree-parity-preview.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B47-dev124-goal-final-tree-parity-preview.png`);
      await page.mouse.up();
      await page.waitForTimeout(500);
      const committedParity = await page.locator('[data-goal-task-row-id="dev124-child-b"]').evaluate(row => {
        const branch = row.querySelector('[data-goal-hierarchy-guide-kind="incoming-branch"]');
        const title = row.querySelector('[data-task-title-slot="true"]');
        const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        return {
          level: Number(row.getAttribute('data-goal-level')),
          branchRect: branch?.getBoundingClientRect().toJSON() || null,
          titleLeft: title?.getBoundingClientRect().left || null,
          parentId: stored['dev124-child-b']?.parentId || null,
        };
      }).catch(() => ({ level: null, branchRect: null, titleLeft: null, parentId: null }));
      await page.screenshot({ path: `${OUTPUT_DIR}/B47-dev124-goal-final-tree-parity-result.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B47-dev124-goal-final-tree-parity-result.png`);
      record('B47-goal-tree-preview-matches-committed-branch-with-restored-insertion-marker', previewParity.sharedPresenter
        && previewParity.presentation === 'kanban-marker'
        && previewParity.dotCount === 1
        && previewParity.barCount === 1
        && previewParity.branchRect
        && Math.abs(previewParity.branchRect.right - previewParity.targetTitleLeft) <= 1
        && committedParity.parentId === 'dev124-child-a'
        && committedParity.level === 2
        && committedParity.branchRect
        && Math.abs(previewParity.branchRect.left - committedParity.branchRect.left) <= 1
        && Math.abs(previewParity.branchRect.right - committedParity.branchRect.right) <= 1
        && Math.abs(committedParity.branchRect.right - committedParity.titleLeft) <= 1,
      { previewParity, committedParity });
    } else record('B47-goal-tree-preview-matches-committed-branch-with-restored-insertion-marker', false, { parityTarget, parityLane });

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const exclusiveTarget = page.locator('[data-goal-task-row-id="dev124-child-a"]');
    const exclusiveTargetRect = await exclusiveTarget.boundingBox();
    const exclusiveLaneRect = await page.locator('#goal-column-task').boundingBox();
    if (exclusiveTargetRect && exclusiveLaneRect) {
      await exclusiveTarget.hover();
      await page.waitForTimeout(120);
      const rowGuideSelector = '[data-goal-hierarchy-guides="true"][data-goal-hierarchy-guide-layer="row"] [data-goal-hierarchy-guide-active="true"]';
      const activeGuidesBeforeDrag = await page.locator(rowGuideSelector).count();
      const exclusiveDragRects = await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-child-a',
        x: (_rect, lane) => lane.x + lane.width - 18,
        y: rect => rect.y + 2,
      });
      const placementPreviewDuringDrag = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      const activeGuidesDuringDrag = await page.locator(rowGuideSelector).count();
      const activeContentDuringDrag = await page.locator('[data-goal-content-scope="active"]').count();
      const neutralGuidesDuringDrag = await page.locator('[data-goal-hierarchy-guide-layer="row"] .goal-hierarchy-guide-segment').count();
      await page.screenshot({ path: `${OUTPUT_DIR}/B46-dev124-goal-exclusive-tree-preview.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B46-dev124-goal-exclusive-tree-preview.png`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const placementPreviewAfterCancel = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      await page.mouse.up();
      await page.mouse.move(1200, 100);
      await page.waitForTimeout(60);
      await exclusiveTarget.hover();
      await page.waitForTimeout(120);
      const activeGuidesAfterCancelHover = await page.locator(rowGuideSelector).count();
      record('B46-goal-drag-tree-preview-suppresses-native-active-hierarchy-guides', activeGuidesBeforeDrag > 0
        && Boolean(exclusiveDragRects.sourceRect && exclusiveDragRects.targetRect)
        && placementPreviewDuringDrag === 1
        && activeGuidesDuringDrag === 0
        && activeContentDuringDrag === 0
        && neutralGuidesDuringDrag > 0
        && placementPreviewAfterCancel === 0
        && activeGuidesAfterCancelHover > 0,
      {
        activeGuidesBeforeDrag,
        exclusiveDragRects,
        placementPreviewDuringDrag,
        activeGuidesDuringDrag,
        activeContentDuringDrag,
        neutralGuidesDuringDrag,
        placementPreviewAfterCancel,
        activeGuidesAfterCancelHover,
      });
    } else record('B46-goal-drag-tree-preview-suppresses-native-active-hierarchy-guides', false, { exclusiveTargetRect, exclusiveLaneRect });

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const candidateTarget = page.locator('[data-goal-task-row-id="dev124-root-a"]');
    const candidateTargetRect = await candidateTarget.boundingBox();
    const candidatePrimaryRect = await candidateTarget.locator('[data-task-drag-surface-kind="goal-row"]').boundingBox();
    if (candidateTargetRect && candidatePrimaryRect) {
      const candidateRects = await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: () => candidatePrimaryRect.x + 80,
        y: () => candidatePrimaryRect.y + 2,
      });
      await page.waitForTimeout(1050);
      const outerEdgeEvidence = await page.evaluate(() => ({
        candidateCount: document.querySelectorAll('[data-goal-child-drop-candidate="true"]').length,
        markerFeedback: document.querySelector('[data-goal-drag-marker="true"]')?.getAttribute('data-desktop-task-insertion-feedback') || null,
      }));
      await page.mouse.move(candidatePrimaryRect.x + 80, candidatePrimaryRect.y + candidatePrimaryRect.height / 2, { steps: 8 });
      await page.waitForTimeout(120);
      const candidateEvidence = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-goal-child-drop-candidate="true"]'));
        const target = document.querySelector('[data-goal-task-row-id="dev124-root-a"]');
        const targetCell = target?.querySelector('[data-goal-task-cell="true"]');
        const descendant = document.querySelector('[data-goal-task-row-id="dev124-child-a"]');
        const marker = document.querySelector('[data-goal-drag-marker="true"]');
        return {
          count: rows.length,
          targetId: rows[0]?.getAttribute('data-goal-task-row-id') || null,
          targetBackground: targetCell ? getComputedStyle(targetCell).backgroundColor : null,
          descendantCandidate: descendant?.getAttribute('data-goal-child-drop-candidate') || null,
          markerFeedback: marker?.getAttribute('data-desktop-task-insertion-feedback') || null,
        };
      });
      await page.screenshot({ path: `${OUTPUT_DIR}/B51-dev124-goal-child-candidate-location.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B51-dev124-goal-child-candidate-location.png`);
      await page.waitForTimeout(1050);
      const armedEvidence = await page.evaluate(() => ({
        candidateCount: document.querySelectorAll('[data-goal-child-drop-candidate="true"]').length,
        targetCount: document.querySelectorAll('[data-goal-child-drop-target="true"]').length,
        targetId: document.querySelector('[data-goal-child-drop-target="true"]')?.getAttribute('data-goal-task-row-id') || null,
        descendantTarget: document.querySelector('[data-goal-task-row-id="dev124-child-a"]')?.getAttribute('data-goal-child-drop-target') || null,
        markerFeedback: document.querySelector('[data-goal-drag-marker="true"]')?.getAttribute('data-desktop-task-insertion-feedback') || null,
      }));
      await page.screenshot({ path: `${OUTPUT_DIR}/B52-dev124-goal-armed-parent-location.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B52-dev124-goal-armed-parent-location.png`);
      record('B51-goal-child-window-is-70-percent-and-candidate-locates-only-target', Boolean(candidateRects.sourceRect && candidateRects.targetRect)
        && outerEdgeEvidence.candidateCount === 0
        && outerEdgeEvidence.markerFeedback === 'standard'
        && candidateEvidence.count === 1
        && candidateEvidence.targetId === 'dev124-root-a'
        && candidateEvidence.targetBackground !== 'rgb(255, 255, 255)'
        && candidateEvidence.descendantCandidate === null
        && candidateEvidence.markerFeedback === 'standard'
        && armedEvidence.candidateCount === 0
        && armedEvidence.markerFeedback === 'child',
      { candidatePrimaryRect, outerEdgeEvidence, candidateEvidence, armedEvidence });
      record('B52-goal-armed-child-keeps-parent-location-render', armedEvidence.targetCount === 1
        && armedEvidence.targetId === 'dev124-root-a'
        && armedEvidence.descendantTarget === null
        && armedEvidence.markerFeedback === 'child', armedEvidence);
      await page.mouse.up();
    } else {
      record('B51-goal-child-window-is-70-percent-and-candidate-locates-only-target', false, { candidateTargetRect, candidatePrimaryRect });
      record('B52-goal-armed-child-keeps-parent-location-render', false, { candidateTargetRect, candidatePrimaryRect });
    }

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const childTarget = await page.locator('[data-goal-task-row-id="dev124-root-a"]').boundingBox();
    if (childTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: rect => rect.x + 80,
        y: rect => rect.y + rect.height / 2,
      });
      const pendingChildEvidence = await page.locator('[data-goal-drag-marker="true"]').evaluate(marker => ({
        feedback: marker.getAttribute('data-desktop-task-insertion-feedback'),
        position: marker.getAttribute('data-goal-drag-position'),
      })).catch(() => ({ feedback: null, position: null }));
      const pendingTreePreviewCount = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      const pendingTreePreviewKind = await page.locator('[data-goal-drag-tree-preview="true"]').getAttribute('data-goal-drag-tree-preview-kind').catch(() => null);
      record('B37-goal-child-intent-stays-standard-before-shared-dwell', pendingChildEvidence.feedback === 'standard'
        && pendingChildEvidence.position !== 'child', pendingChildEvidence);
      await page.waitForTimeout(1050);
      const childEvidence = await page.locator('[data-goal-drag-marker="true"]').evaluate(marker => ({
        feedback: marker.getAttribute('data-desktop-task-insertion-feedback'),
        position: marker.getAttribute('data-goal-drag-position'),
        left: Number.parseFloat(marker.style.left),
        top: Number.parseFloat(marker.style.top),
        titleLeft: document.querySelector('[data-goal-task-row-id="dev124-root-a"] [data-task-title-slot="true"]')?.getBoundingClientRect().left || null,
        indent: Number.parseFloat(getComputedStyle(document.querySelector('[data-goal-task-row-id="dev124-root-a"] [data-task-hierarchy-row="true"]')).getPropertyValue('--task-hierarchy-indent')),
      })).catch(() => ({ feedback: null }));
      record('B34-goal-armed-child-line-uses-next-depth-anchor', childEvidence.feedback === 'child'
        && childEvidence.position === 'child' && childEvidence.left > childEvidence.titleLeft + 4
        && childEvidence.left - childEvidence.titleLeft <= childEvidence.indent + 3, childEvidence);
      const treeEvidence = await page.locator('[data-goal-drag-tree-preview="true"]').evaluate(preview => {
        const stem = preview.querySelector('[data-goal-drag-tree-preview-segment="stem"]');
        const branch = preview.querySelector('[data-goal-drag-tree-preview-segment="branch"]');
        const marker = document.querySelector('[data-goal-drag-marker="true"]');
        const dot = marker?.querySelector('[data-kanban-insertion-dot="true"]');
        const targetRow = document.querySelector('[data-goal-task-row-id="dev124-root-a"]');
        const hierarchyRow = targetRow?.querySelector('[data-task-hierarchy-row="true"]');
        const lane = document.querySelector('#goal-column-task');
        const stemRect = stem?.getBoundingClientRect();
        const branchRect = branch?.getBoundingClientRect();
        const dotRect = dot?.getBoundingClientRect();
        const targetRect = targetRow?.getBoundingClientRect();
        const laneRect = lane?.getBoundingClientRect();
        const hierarchyStyle = hierarchyRow ? getComputedStyle(hierarchyRow) : null;
        const level = Number(targetRow?.getAttribute('data-goal-level') || 0);
        const indent = Number.parseFloat(hierarchyStyle?.getPropertyValue('--task-hierarchy-indent') || '10.4');
        const laneStart = Number.parseFloat(hierarchyStyle?.getPropertyValue('--goal-hierarchy-lane-start') || '20');
        return {
          target: preview.getAttribute('data-goal-drag-tree-preview-target'),
          segmentCount: preview.querySelectorAll('[data-goal-drag-tree-preview-segment]').length,
          markerFeedback: marker?.getAttribute('data-desktop-task-insertion-feedback') || null,
          markerPresentation: marker?.getAttribute('data-desktop-task-insertion-presentation') || null,
          markerLeft: marker ? Number.parseFloat(marker.style.left) : null,
          markerTop: marker ? Number.parseFloat(marker.style.top) : null,
          expectedRailX: laneRect ? laneRect.left + laneStart + level * indent : null,
          expectedRowCenterY: targetRect ? targetRect.top + targetRect.height / 2 : null,
          stemRect: stemRect?.toJSON() || null,
          branchRect: branchRect?.toJSON() || null,
          dotRect: dotRect?.toJSON() || null,
          stemColor: stem ? getComputedStyle(stem).backgroundColor : null,
          pointerEvents: getComputedStyle(preview).pointerEvents,
        };
      }).catch(() => ({ target: null, segmentCount: 0 }));
      const stemCenterX = treeEvidence.stemRect ? treeEvidence.stemRect.left + treeEvidence.stemRect.width / 2 : null;
      const branchCenterY = treeEvidence.branchRect ? treeEvidence.branchRect.top + treeEvidence.branchRect.height / 2 : null;
      const dotCenterX = treeEvidence.dotRect ? treeEvidence.dotRect.left + treeEvidence.dotRect.width / 2 : null;
      record('B42-goal-armed-child-previews-direct-tree-connector', pendingTreePreviewCount === 1
        && pendingTreePreviewKind === 'root'
        && treeEvidence.target === 'dev124-root-a'
        && treeEvidence.segmentCount === 2
        && treeEvidence.markerFeedback === 'child'
        && treeEvidence.markerPresentation === 'kanban-marker'
        && treeEvidence.dotRect
        && treeEvidence.pointerEvents === 'none'
        && treeEvidence.stemRect?.width === 2
        && treeEvidence.branchRect?.height === 2
        && Math.abs(stemCenterX - treeEvidence.expectedRailX) <= 1
        && Math.abs(treeEvidence.stemRect.top - treeEvidence.expectedRowCenterY) <= 1
        && Math.abs(treeEvidence.stemRect.bottom - treeEvidence.markerTop) <= 1
        && Math.abs(treeEvidence.branchRect.left - treeEvidence.expectedRailX) <= 1
        && Math.abs(branchCenterY - treeEvidence.markerTop) <= 1
        && Math.abs(treeEvidence.branchRect.right - treeEvidence.markerLeft) <= 1,
      { pendingTreePreviewCount, pendingTreePreviewKind, treeEvidence, stemCenterX, branchCenterY, dotCenterX });
      await page.screenshot({ path: `${OUTPUT_DIR}/B42-dev124-goal-tree-preview.png`, fullPage: false });
      result.screenshots.push(`${OUTPUT_DIR}/B42-dev124-goal-tree-preview.png`);
      await page.mouse.up();
    } else {
      record('B37-goal-child-intent-stays-standard-before-shared-dwell', false, { childTarget });
      record('B34-goal-armed-child-line-uses-next-depth-anchor', false, { childTarget });
      record('B42-goal-armed-child-previews-direct-tree-connector', false, { childTarget });
    }

    await resetView('goal');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const switchRootTarget = await page.locator('[data-goal-task-row-id="dev124-root-a"]').boundingBox();
    const switchChildTarget = await page.locator('[data-goal-task-row-id="dev124-child-a"]').boundingBox();
    const switchLane = await page.locator('#goal-column-task').boundingBox();
    if (switchRootTarget && switchChildTarget && switchLane) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: rect => rect.x + 80,
        y: rect => rect.y + rect.height / 2,
      });
      await page.waitForTimeout(550);
      await page.mouse.move(switchChildTarget.x + 80, switchChildTarget.y + switchChildTarget.height / 2, { steps: 8 });
      await page.waitForTimeout(600);
      const switchedBeforeDwell = await page.locator('[data-goal-drag-marker="true"]').getAttribute('data-desktop-task-insertion-feedback').catch(() => null);
      await page.waitForTimeout(520);
      const switchedAfterDwell = await page.locator('[data-goal-drag-marker="true"]').getAttribute('data-desktop-task-insertion-feedback').catch(() => null);
      await page.mouse.move(switchLane.x + switchLane.width + 60, switchChildTarget.y + switchChildTarget.height / 2, { steps: 8 });
      await page.waitForTimeout(120);
      const markerAfterLeave = await page.locator('[data-goal-drag-marker="true"]').count();
      await page.waitForTimeout(1050);
      const markerAfterStaleDwell = await page.locator('[data-goal-drag-marker="true"]').count();
      record('B38-goal-switch-and-leave-reset-child-dwell', switchedBeforeDwell === 'standard'
        && switchedAfterDwell === 'child'
        && markerAfterLeave === 0
        && markerAfterStaleDwell === 0,
      { switchedBeforeDwell, switchedAfterDwell, markerAfterLeave, markerAfterStaleDwell });
      await page.mouse.up();
    } else record('B38-goal-switch-and-leave-reset-child-dwell', false, { switchRootTarget, switchChildTarget, switchLane });

    await resetView('goal');
    const scrollGoal = page.locator('[data-goal-view="true"]');
    await scrollGoal.waitFor({ state: 'visible', timeout: 15000 });
    const scrollTarget = await page.locator('[data-goal-task-row-id="dev124-root-a"]').boundingBox();
    if (scrollTarget) {
      await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: rect => rect.x + 80,
        y: rect => rect.y + rect.height / 2,
      });
      await page.waitForTimeout(550);
      await scrollGoal.evaluate(element => element.dispatchEvent(new Event('scroll', { bubbles: true })));
      await page.waitForTimeout(650);
      const markerAfterScrollReset = await page.locator('[data-goal-drag-marker="true"]').count();
      record('B39-goal-scroll-invalidates-pending-child-intent', markerAfterScrollReset === 0, { markerAfterScrollReset });
      await page.mouse.up();
    } else record('B39-goal-scroll-invalidates-pending-child-intent', false, { scrollTarget });

    await resetView('goal');
    const resetGoal = page.locator('[data-goal-view="true"]');
    await resetGoal.waitFor({ state: 'visible', timeout: 15000 });
    const armedScrollRects = await dragGoal({
      sourceId: 'dev124-root-b',
      targetId: 'dev124-root-a',
      x: rect => rect.x + 80,
      y: rect => rect.y + rect.height / 2,
    });
    if (armedScrollRects.sourceRect && armedScrollRects.targetRect) {
      await page.waitForTimeout(1050);
      const armedTreeBeforeScroll = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      await resetGoal.evaluate(element => element.dispatchEvent(new Event('scroll', { bubbles: true })));
      await page.waitForTimeout(150);
      const treeAfterScroll = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      const markerAfterArmedScroll = await page.locator('[data-goal-drag-marker="true"]').count();
      await page.mouse.up();

      await resetView('goal');
      await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
      const armedCancelRects = await dragGoal({
        sourceId: 'dev124-root-b',
        targetId: 'dev124-root-a',
        x: rect => rect.x + 80,
        y: rect => rect.y + rect.height / 2,
      });
      await page.waitForTimeout(1050);
      const armedTreeBeforeCancel = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const treeAfterCancel = await page.locator('[data-goal-drag-tree-preview="true"]').count();
      const markerAfterCancel = await page.locator('[data-goal-drag-marker="true"]').count();
      await page.mouse.up();
      record('B43-goal-tree-connector-clears-with-shared-reset-and-cancel', armedTreeBeforeScroll === 1
        && treeAfterScroll === 0
        && markerAfterArmedScroll === 0
        && armedCancelRects.sourceRect && armedCancelRects.targetRect
        && armedTreeBeforeCancel === 1
        && treeAfterCancel === 0
        && markerAfterCancel === 0,
      { armedTreeBeforeScroll, treeAfterScroll, markerAfterArmedScroll, armedCancelRects, armedTreeBeforeCancel, treeAfterCancel, markerAfterCancel });
    } else record('B43-goal-tree-connector-clears-with-shared-reset-and-cancel', false, armedScrollRects);

    await resetView('board');
    const boardR3 = page.locator('[data-layout-region="board-canvas"]');
    await boardR3.waitFor({ state: 'visible', timeout: 15000 });
    const boardSource = await page.locator('[data-task-drag-surface-kind="kanban-card"][data-task-id="dev124-child-b"]').boundingBox();
    const boardTarget = await page.locator('[data-task-drag-surface-kind="kanban-card"][data-task-id="dev124-child-a"]').boundingBox();
    if (boardSource && boardTarget) {
      await page.mouse.move(boardSource.x + boardSource.width / 2, boardSource.y + boardSource.height / 2);
      await page.mouse.down();
      await page.mouse.move(boardSource.x + boardSource.width / 2 + 24, boardSource.y + boardSource.height / 2, { steps: 5 });
      await page.waitForTimeout(80);
      await page.mouse.move(boardTarget.x + boardTarget.width / 2, boardTarget.y + boardTarget.height / 2, { steps: 8 });
      await page.waitForTimeout(120);
      const boardEvidence = await page.locator('[data-desktop-drop-indicator="true"]').evaluate(indicator => ({
        shared: indicator.getAttribute('data-desktop-task-insertion-indicator') === 'true',
        marker: Boolean(indicator.querySelector('[data-kanban-insertion-marker="true"]')),
        layer: indicator.getAttribute('data-desktop-drop-indicator-layer'),
      })).catch(() => ({ shared: false, marker: false, layer: null }));
      record('B36-board-reuses-shared-insertion-presenter', boardEvidence.shared && boardEvidence.marker && boardEvidence.layer === 'shared-overlay', boardEvidence);
      await page.mouse.up();
    } else record('B36-board-reuses-shared-insertion-presenter', false, { boardSource, boardTarget });

    await resetView('board');
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    const boardDwellRects = await dragBoard({ sourceId: 'dev124-child-b', targetId: 'dev124-child-a' });
    if (boardDwellRects.sourceRect && boardDwellRects.targetRect) {
      const boardPendingPhase = await page.locator('[data-task-child-drop-preview="true"]').getAttribute('data-task-child-drop-phase').catch(() => null);
      await page.waitForTimeout(1050);
      const boardArmedEvidence = await page.locator('[data-task-child-drop-preview="true"]').evaluate(preview => ({
        phase: preview.getAttribute('data-task-child-drop-phase'),
        sharedMarker: Boolean(preview.querySelector('[data-desktop-task-insertion-indicator="true"]')),
        feedback: preview.querySelector('[data-desktop-task-insertion-indicator="true"]')?.getAttribute('data-desktop-task-insertion-feedback') || null,
      })).catch(() => ({ phase: null, sharedMarker: false, feedback: null }));
      record('B40-board-child-intent-uses-shared-dwell-and-presenter', boardPendingPhase === 'candidate'
        && boardArmedEvidence.phase === 'armed'
        && boardArmedEvidence.sharedMarker
        && boardArmedEvidence.feedback === 'child',
      { boardPendingPhase, boardArmedEvidence });
      await page.mouse.up();
    } else record('B40-board-child-intent-uses-shared-dwell-and-presenter', false, boardDwellRects);

    await resetView('board');
    const scrollBoard = page.locator('[data-layout-region="board-canvas"]');
    await scrollBoard.waitFor({ state: 'visible', timeout: 15000 });
    const boardScrollRects = await dragBoard({ sourceId: 'dev124-child-b', targetId: 'dev124-child-a' });
    if (boardScrollRects.sourceRect && boardScrollRects.targetRect) {
      await page.waitForTimeout(550);
      await scrollBoard.evaluate(element => element.dispatchEvent(new Event('scroll', { bubbles: true })));
      await page.waitForTimeout(650);
      const boardPreviewAfterScrollReset = await page.locator('[data-task-child-drop-preview="true"]').count();
      const boardMarkerAfterScrollReset = await page.locator('[data-desktop-drop-indicator="true"]').count();
      record('B41-board-scroll-invalidates-pending-child-intent', boardPreviewAfterScrollReset === 0
        && boardMarkerAfterScrollReset === 0,
      { boardPreviewAfterScrollReset, boardMarkerAfterScrollReset });
      await page.mouse.up();
    } else record('B41-board-scroll-invalidates-pending-child-intent', false, boardScrollRects);
  } catch (error) {
    result.cases.push({ id: 'B99-unhandled-browser-error', ok: false, details: { message: error.message, body: await page.locator('body').innerText().catch(() => ''), url: page.url() } });
    failures.push('B99-unhandled-browser-error');
  }
  result.status = failures.length || result.browserErrors.length || result.httpFailures.length ? 'FAIL' : 'PASS';
  result.generatedAt = new Date().toISOString();
  await page.evaluate(result => {
    window.__DEV124_ARTIFACT = result;
    sessionStorage.setItem('__DEV124_ARTIFACT', JSON.stringify(result));
  }, result);
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') {
    const failedCaseDetails = result.cases.filter(testCase => !testCase.ok);
    throw new Error(`DEV-124 browser verification failed: ${failures.join(',') || 'browser-errors'} ${JSON.stringify(failedCaseDetails)}`);
  }
  return result;
}
