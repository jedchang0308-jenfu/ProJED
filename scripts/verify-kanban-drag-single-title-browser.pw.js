/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshotPath = `output/playwright/kanban-drag-single-title-${runId}.png`;
  const mobileScreenshotPath = `output/playwright/kanban-drag-single-title-mobile-${runId}.png`;

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
    id: 'drag-single-title-workspace',
    title: '拖曳單一名稱驗證工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'drag-single-title-board', title: '拖曳單一名稱驗證', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'ux-col-a': {
      id: 'ux-col-a',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: null,
      title: '驗證列表 A',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'ux-col-b': {
      id: 'ux-col-b',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: null,
      title: '驗證列表 B',
      status: 'todo',
      nodeType: 'group',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'ux-card-a': {
      id: 'ux-card-a',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: 'ux-col-a',
      title: 'DEV-UX 任務卡 A',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-10',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'ux-card-b': {
      id: 'ux-card-b',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: 'ux-col-a',
      title: 'DEV-UX 任務卡 B',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      endDate: '2099-07-11',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'ux-child-a': {
      id: 'ux-child-a',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: 'ux-card-a',
      title: 'DEV-UX 子任務 A',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2099-07-12',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'ux-child-b': {
      id: 'ux-child-b',
      workspaceId: workspace.id,
      boardId: 'drag-single-title-board',
      parentId: 'ux-card-a',
      title: 'DEV-UX 子任務 B',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      endDate: '2099-07-13',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
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
    localStorage.setItem('projed-last-board', 'drag-single-title-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });

  const source = page.locator('.kanban-checklist-item[data-task-id="ux-child-b"]').first();
  const target = page.locator('.kanban-checklist-item[data-task-id="ux-child-a"]').first();
  await source.waitFor({ state: 'visible', timeout: 10000 });
  await target.waitFor({ state: 'visible', timeout: 10000 });

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  assert(Boolean(sourceBox && targetBox), 'source and target should have layout boxes', { sourceBox, targetBox });

  const start = {
    x: Math.round(sourceBox.x + sourceBox.width * 0.62),
    y: Math.round(sourceBox.y + sourceBox.height * 0.5),
  };
  const end = {
    x: Math.round(targetBox.x + targetBox.width * 0.62),
    y: Math.round(targetBox.y + targetBox.height * 0.22),
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 18, start.y + 4, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 24 });
  await page.locator('[data-kanban-drag-overlay="true"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(250);

  const draggedTitle = 'DEV-UX 子任務 B';
  const state = await page.evaluate((draggedTitle) => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };

    const placeholder = document.querySelector('.kanban-checklist-item[data-task-id="ux-child-b"]');
    const sourceTitle = placeholder?.querySelector('.task-title-text');
    const marker = placeholder?.querySelector('[data-kanban-insertion-marker="true"]');
    const markerDot = marker?.querySelector('[data-kanban-insertion-dot="true"]');
    const markerRect = marker?.getBoundingClientRect();
    const markerDotRect = markerDot?.getBoundingClientRect();
    const sourceTitleRect = sourceTitle?.getBoundingClientRect();
    const overlay = document.querySelector('[data-kanban-drag-overlay="true"]');
    const visibleTitleMatches = Array.from(document.querySelectorAll('.task-title-text'))
      .filter((element) => (element.textContent || '').trim().includes(draggedTitle) && isVisible(element))
      .map((element) => ({
        text: (element.textContent || '').trim(),
        isOverlay: Boolean(element.closest('[data-kanban-drag-overlay="true"]')),
        isPlaceholder: Boolean(element.closest('[data-kanban-drag-source-placeholder="true"]')),
        visibility: window.getComputedStyle(element).visibility,
      }));

    return {
      overlayText: (overlay?.textContent || '').trim(),
      placeholderFlag: placeholder?.getAttribute('data-kanban-drag-source-placeholder') || null,
      markerCount: placeholder?.querySelectorAll('[data-kanban-insertion-marker="true"]').length || 0,
      markerChildCount: marker?.children.length || 0,
      markerRect: markerRect ? { width: markerRect.width, height: markerRect.height } : null,
      markerDotRect: markerDotRect ? { left: markerDotRect.left, width: markerDotRect.width, height: markerDotRect.height } : null,
      sourceTitleRect: sourceTitleRect ? { left: sourceTitleRect.left, width: sourceTitleRect.width, height: sourceTitleRect.height } : null,
      sourceTitleVisibility: sourceTitle ? window.getComputedStyle(sourceTitle).visibility : null,
      visibleTitleMatches,
    };
  }, draggedTitle);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.mouse.up().catch(() => undefined);

  assert(state.overlayText.includes(draggedTitle), 'drag overlay should keep the dragged task title', state);
  assert(state.placeholderFlag === 'true', 'drag source should become a placeholder', state);
  assert(state.markerCount >= 1 && state.markerChildCount === 2 && state.markerRect?.width > 20 && state.markerRect?.height > 0, 'placeholder should render solid dot-bar insertion marker', state);
  assert(
    Math.abs((state.markerDotRect?.left || 0) - (state.sourceTitleRect?.left || 0)) <= 2,
    'insertion dot should start at the same x-position as the source task title for that hierarchy',
    state,
  );
  assert(state.sourceTitleVisibility === 'hidden', 'source placeholder should hide its original task title', state);
  assert(
    state.visibleTitleMatches.length === 1 && state.visibleTitleMatches[0].isOverlay && !state.visibleTitleMatches[0].isPlaceholder,
    'dragged task title should be visible only on the cursor overlay',
    state,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    } catch (_) {}
    if (!window.__projedKanbanSingleTitleMobilePointerPatched) {
      window.__projedKanbanSingleTitleMobilePointerPatched = true;
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
    }
  });
  await page.evaluate(({ nodes }) => {
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
  }, { nodes });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });

  const mobileSource = page.locator('.kanban-checklist-item[data-task-id="ux-child-b"]').first();
  const mobileTarget = page.locator('.kanban-checklist-item[data-task-id="ux-child-a"]').first();
  await mobileSource.waitFor({ state: 'visible', timeout: 10000 });
  await mobileTarget.waitFor({ state: 'visible', timeout: 10000 });
  const mobileSourceBox = await mobileSource.boundingBox();
  const mobileTargetBox = await mobileTarget.boundingBox();
  assert(Boolean(mobileSourceBox && mobileTargetBox), 'mobile source and target should have layout boxes', { mobileSourceBox, mobileTargetBox });

  const mobileStart = {
    x: Math.round(mobileSourceBox.x + mobileSourceBox.width * 0.62),
    y: Math.round(mobileSourceBox.y + mobileSourceBox.height * 0.5),
  };
  let mobileEnd = {
    x: Math.round(mobileTargetBox.x + mobileTargetBox.width * 0.62),
    y: Math.round(mobileTargetBox.y + mobileTargetBox.height * 0.22),
  };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: mobileStart.x, y: mobileStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }],
  });
  await page.waitForTimeout(650);
  await page.locator('[data-mobile-drag-preview="true"]').waitFor({ state: 'visible', timeout: 5000 });
  const liveMobileTargetBox = await mobileTarget.boundingBox();
  assert(Boolean(liveMobileTargetBox), 'mobile target should keep a layout box after source placeholder renders', { liveMobileTargetBox });
  mobileEnd = {
    x: Math.round(liveMobileTargetBox.x + liveMobileTargetBox.width * 0.62),
    y: Math.round(liveMobileTargetBox.y + liveMobileTargetBox.height * 0.28),
  };
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(mobileStart.x + ((mobileEnd.x - mobileStart.x) * step) / 8),
        y: Math.round(mobileStart.y + ((mobileEnd.y - mobileStart.y) * step) / 8),
        radiusX: 5,
        radiusY: 5,
        force: 1,
        id: 1,
      }],
    });
    await page.waitForTimeout(25);
  }
  await page.locator('[data-mobile-drop-indicator="true"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(200);

  const mobileState = await page.evaluate((draggedTitle) => {
    const source = document.querySelector('.kanban-checklist-item[data-task-id="ux-child-b"]');
    const sourceTitle = source?.querySelector('.task-title-text');
    const sourceMarker = source?.querySelector('[data-kanban-insertion-marker="true"]');
    const sourceDot = sourceMarker?.querySelector('[data-kanban-insertion-dot="true"]');
    const target = document.querySelector('.kanban-checklist-item[data-task-id="ux-child-a"]');
    const targetTitle = target?.querySelector('.task-title-text');
    const indicator = document.querySelector('[data-mobile-drop-indicator="true"]');
    const indicatorDot = indicator?.querySelector('[data-kanban-insertion-dot="true"]');
    const indicatorBar = indicator?.querySelector('[data-kanban-insertion-bar="true"]');
    const preview = document.querySelector('[data-mobile-drag-preview="true"]');
    const rectOf = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, width: rect.width, height: rect.height } : null;
    };
    return {
      previewText: (preview?.textContent || '').trim(),
      sourcePlaceholderFlag: source?.getAttribute('data-kanban-drag-source-placeholder') || null,
      sourceTitleVisibility: sourceTitle ? window.getComputedStyle(sourceTitle).visibility : null,
      sourceMarkerChildCount: sourceMarker?.children.length || 0,
      sourceDotRect: rectOf(sourceDot),
      sourceTitleRect: rectOf(sourceTitle),
      indicatorTarget: indicator?.getAttribute('data-mobile-drop-target') || null,
      indicatorPosition: indicator?.getAttribute('data-mobile-drop-position') || null,
      indicatorDotRect: rectOf(indicatorDot),
      indicatorBarRect: rectOf(indicatorBar),
      targetTitleRect: rectOf(targetTitle),
      draggedTitle,
    };
  }, draggedTitle);

  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
  await cdp.detach().catch(() => undefined);

  assert(mobileState.previewText.includes(draggedTitle), 'mobile drag preview should keep the dragged task title', mobileState);
  assert(mobileState.sourcePlaceholderFlag === 'true', 'mobile source should become a placeholder', mobileState);
  assert(mobileState.sourceTitleVisibility === 'hidden', 'mobile source placeholder should hide its original task title', mobileState);
  assert(mobileState.sourceMarkerChildCount === 2, 'mobile source placeholder should render dot-bar marker', mobileState);
  assert(
    Math.abs((mobileState.sourceDotRect?.left || 0) - (mobileState.sourceTitleRect?.left || 0)) <= 2,
    'mobile source dot should align with the source hierarchy title x-position',
    mobileState,
  );
  assert(mobileState.indicatorTarget === 'ux-child-a', 'mobile drop indicator should target the hovered hierarchy row', mobileState);
  assert(mobileState.indicatorDotRect?.width > 0 && mobileState.indicatorBarRect?.width > 20, 'mobile drop indicator should render dot-bar marker', mobileState);
  assert(
    Math.abs((mobileState.indicatorDotRect?.left || 0) - (mobileState.targetTitleRect?.left || 0)) <= 2,
    'mobile drop indicator dot should align with the target hierarchy title x-position',
    mobileState,
  );

  console.log(JSON.stringify({ ok: true, screenshotPath, mobileScreenshotPath, state, mobileState }, null, 2));
}
