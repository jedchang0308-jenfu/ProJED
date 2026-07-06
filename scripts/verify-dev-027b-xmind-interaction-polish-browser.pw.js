/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await selectViewMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const selectViewMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const input = () => page.locator('[data-mindmap-title-input]').first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipTargetByLabel = (label) => page.locator(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`).first();

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const errorPatterns = [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ];
    const visibleError = errorPatterns.find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show visible runtime errors`, { visibleError });
  };

  const assertNoRenameInput = async (label) => {
    await page.waitForTimeout(120);
    const count = await page.locator('[data-mindmap-title-input]').count();
    assert(count === 0, label, { inputCount: count });
  };

  const closeTaskDetailsIfOpen = async () => {
    const modal = page.locator('[data-task-details-modal="true"]');
    if ((await modal.count()) === 0) return;
    await modal.locator('button[title="關閉"]').click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
  };

  const getSelectedTitle = async () => selectedNode().getAttribute('data-mindmap-node-title');

  const expectSelected = async (title, label) => {
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(title).focus();
    const selectedTitle = await getSelectedTitle();
    assert(selectedTitle === title, label, { selectedTitle, expected: title });
  };

  const selectNode = async (title) => {
    await nodeByTitle(title).click();
    await closeTaskDetailsIfOpen();
    await expectSelected(title, `node should be selected: ${title}`);
  };

  const renameSelectedByTyping = async (title) => {
    await selectedNode().focus();
    await page.keyboard.press('D');
    await input().waitFor({ state: 'visible', timeout: 10000 });
    await input().fill(title);
    await input().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
    await assertNoRenameInput('typing on selected branch should commit rename mode after Enter');
    await expectSelected(title, 'typing on selected branch should rename the selected task');
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await assertNoRenameInput('newly created branch should be selected without opening rename input');
    await renameSelectedByTyping(title);
  };

  const createChildFromSelected = async (title) => {
    await page.keyboard.press('Tab');
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await assertNoRenameInput('Tab-created child should be selected without opening rename input');
    await renameSelectedByTyping(title);
  };

  const createSiblingFromSelected = async (title) => {
    await page.keyboard.press('Enter');
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await assertNoRenameInput('Enter-created sibling should be selected without opening rename input');
    await renameSelectedByTyping(title);
  };

  const deleteNode = async (title) => {
    if ((await nodeByTitle(title).count()) === 0) return;
    await nodeByTitle(title).click();
    await closeTaskDetailsIfOpen();
    await page.keyboard.press('Delete');
    if ((await page.locator('.global-dialog-content').count()) > 0) {
      await page.locator('.global-dialog-content button').last().click();
      await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
    }
    await nodeByTitle(title).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  };

  const collectNodeMeta = async (titles) => page.evaluate((titles) => titles.map((title) => {
    const element = Array.from(document.querySelectorAll('[data-mindmap-node-title]'))
      .find(node => node.getAttribute('data-mindmap-node-title') === title);
    const rect = element?.getBoundingClientRect();
    return {
      title,
      id: element?.getAttribute('data-mindmap-node') || '',
      parentId: element?.getAttribute('data-mindmap-parent-id') || '',
      level: Number(element?.getAttribute('data-mindmap-node-level') || '0'),
      direction: element?.getAttribute('data-mindmap-node-direction') || '',
      order: Number(element?.getAttribute('data-mindmap-node-order') || '0'),
      top: rect?.top || 0,
      bottom: rect?.bottom || 0,
    };
  }), titles);

  const collectEndpointDistances = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-surface]');
    const surfaceRect = surface?.getBoundingClientRect();
    const rectToJson = (rect) => rect ? {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    } : null;
    const nodes = Array.from(document.querySelectorAll('[data-mindmap-node]')).map((element) => ({
      id: element.getAttribute('data-mindmap-node'),
      rect: rectToJson(element.getBoundingClientRect()),
    }));
    const nodeById = Object.fromEntries(nodes.map(node => [node.id, node]));
    const zoom = Number(document.querySelector('[data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '1');
    return Array.from(document.querySelectorAll('[data-mindmap-connector-path]')).map((path) => {
      const toNodeId = path.getAttribute('data-to-node-id');
      const toNode = nodeById[toNodeId];
      if (!surfaceRect || !toNode?.rect) return { id: path.getAttribute('data-mindmap-connector-path'), distance: 999 };
      const direction = path.getAttribute('data-direction');
      const toX = surfaceRect.left + Number(path.getAttribute('data-to-x') || '0') * zoom;
      const toY = surfaceRect.top + Number(path.getAttribute('data-to-y') || '0') * zoom;
      const expectedX = direction === 'right' ? toNode.rect.left : toNode.rect.right;
      const clampedY = Math.min(Math.max(toY, toNode.rect.top), toNode.rect.bottom);
      return {
        id: path.getAttribute('data-mindmap-connector-path'),
        distance: Math.hypot(toX - expectedX, toY - clampedY),
      };
    });
  });

  const collectZoomRenderer = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-surface]');
    const style = surface ? getComputedStyle(surface) : null;
    const firstNode = document.querySelector('[data-mindmap-node]');
    const nodeStyle = firstNode ? getComputedStyle(firstNode) : null;
    return {
      renderer: surface?.getAttribute('data-mindmap-zoom-renderer') || '',
      quality: surface?.getAttribute('data-mindmap-zoom-quality') || '',
      cssZoom: style?.zoom || '',
      vectorZoom: style?.getPropertyValue('--mindmap-zoom').trim() || '',
      transform: style?.transform || '',
      nodeFontSize: nodeStyle?.fontSize || '',
    };
  });

  const collectZoomPreviewState = async () => page.evaluate(() => {
    const scrollSurface = document.querySelector('[data-mindmap-middle-pan="true"]');
    const content = document.querySelector('[data-mindmap-surface]');
    const contentStyle = content ? getComputedStyle(content) : null;
    return {
      interaction: scrollSurface?.getAttribute('data-mindmap-zoom-interaction') || '',
      active: scrollSurface?.getAttribute('data-mindmap-zoom-preview-active') || '',
      committedLevel: Number(scrollSurface?.getAttribute('data-mindmap-zoom-level') || '0'),
      committedDataLevel: Number(scrollSurface?.getAttribute('data-mindmap-zoom-committed-level') || '0'),
      previewLevel: Number(scrollSurface?.getAttribute('data-mindmap-zoom-preview-level') || '0'),
      previewScale: Number(scrollSurface?.getAttribute('data-mindmap-zoom-preview-scale') || '0'),
      contentPreviewTransform: content?.getAttribute('data-mindmap-zoom-preview-transform') || '',
      transform: contentStyle?.transform || '',
      label: document.querySelector('[data-mindmap-zoom-label]')?.textContent?.trim() || '',
    };
  });

  const collectZoomPathSnapshot = async () => page.evaluate(() => {
    const scrollSurface = document.querySelector('[data-mindmap-middle-pan="true"]');
    return {
      recomputeCount: Number(scrollSurface?.getAttribute('data-mindmap-recompute-count') || '0'),
      connectorPaths: Array.from(document.querySelectorAll('[data-mindmap-connector-path]')).map(path => ({
        id: path.getAttribute('data-mindmap-connector-path'),
        d: path.getAttribute('d'),
        strokeWidth: path.getAttribute('stroke-width'),
      })),
      relationshipPaths: Array.from(document.querySelectorAll('[data-mindmap-note-relationship-path]')).map(path => ({
        id: path.getAttribute('data-mindmap-note-relationship-path'),
        d: path.getAttribute('d'),
        strokeWidth: path.getAttribute('stroke-width'),
      })),
    };
  });

  const collectMindMapVisibility = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-middle-pan="true"]');
    const center = document.querySelector('[data-mindmap-center]');
    const centerRect = center?.getBoundingClientRect();
    const viewportLeft = 255;
    const viewportTop = 88;
    const isVisible = (rect) => rect && rect.right > viewportLeft && rect.left < window.innerWidth && rect.bottom > viewportTop && rect.top < window.innerHeight;
    const visibleNodes = Array.from(document.querySelectorAll('[data-mindmap-node]'))
      .filter(node => isVisible(node.getBoundingClientRect()))
      .map(node => node.getAttribute('data-mindmap-node-title') || '');
    return {
      zoom: surface?.getAttribute('data-mindmap-zoom-level') || '',
      centered: surface?.getAttribute('data-mindmap-content-centered') || '',
      scrollLeft: Math.round(surface?.scrollLeft || 0),
      scrollTop: Math.round(surface?.scrollTop || 0),
      nodeCount: document.querySelectorAll('[data-mindmap-node]').length,
      visibleCount: visibleNodes.length,
      visibleNodes: visibleNodes.slice(0, 12),
      centerVisible: Boolean(isVisible(centerRect)),
      center: centerRect ? {
        left: Math.round(centerRect.left),
        top: Math.round(centerRect.top),
        right: Math.round(centerRect.right),
        bottom: Math.round(centerRect.bottom),
      } : null,
    };
  });

  const wheelZoomAtSurface = async (deltaY) => {
    const box = await page.locator('[data-mindmap-middle-pan="true"]').first().boundingBox();
    assert(Boolean(box), 'mind map zoom surface should have a viewport box for wheel zoom');
    const point = {
      x: box.x + box.width * 0.52,
      y: box.y + box.height * 0.48,
    };
    await page.evaluate(({ deltaY, point }) => {
      const surface = document.querySelector('[data-mindmap-middle-pan="true"]');
      surface?.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY,
        clientX: point.x,
        clientY: point.y,
      }));
    }, { deltaY, point });
  };

  const applyDatesToNodes = async (titles) => {
    await page.evaluate((titles) => {
      const filters = {
        statusFilters: {
          todo: true,
          in_progress: true,
          delayed: true,
          completed: true,
          unsure: true,
          onhold: true,
        },
        showDependencies: true,
        showStartDate: true,
        showTags: true,
        dueWithinDays: null,
        selectedAssigneeIds: [],
      };
      const titleSet = new Set(titles);
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      Object.values(nodes).forEach((node, index) => {
        if (!node || !titleSet.has(node.title)) return;
        node.status = 'todo';
        node.startDate = `2026-05-${String(21 + (index % 5)).padStart(2, '0')}`;
        node.endDate = `2026-05-${String(24 + (index % 5)).padStart(2, '0')}`;
        node.updatedAt = Date.now();
      });
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-filters', JSON.stringify(filters));
    }, titles);
    await page.reload({ waitUntil: 'networkidle' });
    await selectViewMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
    await nodeByTitle(titles[0]).waitFor({ state: 'visible', timeout: 15000 });
  };

  const createInlineRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    await closeTaskDetailsIfOpen();
    const fromId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${fromId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    const sourceBox = await nodeByTitle(fromTitle).boundingBox();
    assert(Boolean(sourceBox), 'relationship source should have a bounding box before draft preview');
    await page.mouse.move(sourceBox.x + sourceBox.width + 120, sourceBox.y + sourceBox.height / 2 + 16, { steps: 8 });
    await page.locator('[data-mindmap-note-relationship-draft-preview]').waitFor({ state: 'visible', timeout: 10000 });
    const draftMeta = await page.locator('[data-mindmap-note-relationship-draft-preview]').first().evaluate(element => ({
      coordinateSpace: element.getAttribute('data-mindmap-note-relationship-draft-coordinate-space'),
      pathCoordinateSpace: element.querySelector('[data-mindmap-note-relationship-draft-preview-path]')?.getAttribute('data-mindmap-note-relationship-draft-coordinate-space') || '',
      hasPath: Boolean(element.querySelector('[data-mindmap-note-relationship-draft-preview-path]')),
    }));
    assert(
      draftMeta.coordinateSpace === 'map-local' &&
        draftMeta.pathCoordinateSpace === 'map-local' &&
        draftMeta.hasPath,
      'relationship draft preview should be present in the same map-local layer before zoom/pan validation',
      { draftMeta },
    );
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(label);
    await editor.press('Enter');
    await editor.waitFor({ state: 'hidden', timeout: 10000 });
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
    await closeTaskDetailsIfOpen();
    await page.locator(`[data-mindmap-note-relationship-line-click-target][data-label="${label}"]`).first().click({ force: true });
    await page.locator('[data-mindmap-note-relationship-style-panel]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-mindmap-note-relationship-style-dash="7 6"]').click();
    await page.locator('[data-mindmap-note-relationship-style-arrow="both"]').click();
    await page.locator('[data-mindmap-note-relationship-style-width="2.25"]').click();
  };

  const collectCompositeSceneMeta = async (relationshipLabel) => page.evaluate((relationshipLabel) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    };
    const relationship = document.querySelector(`[data-mindmap-note-relationship][data-label="${relationshipLabel}"]`);
    const selectedRelationshipId = relationship?.getAttribute('data-mindmap-note-relationship') || '';
    return {
      visibleNodes: Array.from(document.querySelectorAll('[data-mindmap-node]')).filter(visible).length,
      visibleDateBadges: Array.from(document.querySelectorAll('[data-mindmap-node-dates]')).filter(visible).length,
      connectorPaths: document.querySelectorAll('[data-mindmap-connector-path]').length,
      relationshipPaths: document.querySelectorAll(`[data-mindmap-note-relationship-path][data-label="${relationshipLabel}"]`).length,
      relationshipSelected: relationship?.getAttribute('data-selected') === 'true',
      relationshipLabelTargets: document.querySelectorAll(`[data-mindmap-note-relationship-click-target][data-label="${relationshipLabel}"]`).length,
      relationshipEndpoints: selectedRelationshipId
        ? document.querySelectorAll(`[data-relationship-id="${selectedRelationshipId}"][data-mindmap-note-relationship-endpoint]`).length
        : 0,
      relationshipControlPoints: selectedRelationshipId
        ? document.querySelectorAll(`[data-relationship-id="${selectedRelationshipId}"][data-mindmap-note-relationship-screen-control-point]`).length
        : 0,
      relationshipCoordinateSpaces: selectedRelationshipId
        ? Array.from(document.querySelectorAll(`[data-relationship-id="${selectedRelationshipId}"][data-mindmap-note-relationship-coordinate-space]`))
          .map(element => element.getAttribute('data-mindmap-note-relationship-coordinate-space') || '')
        : [],
      relationshipPathD: document.querySelector(`[data-mindmap-note-relationship-path][data-label="${relationshipLabel}"]`)?.getAttribute('d') || '',
      recomputeCount: document.querySelector('[data-mindmap-recompute-count]')?.getAttribute('data-mindmap-recompute-count') || '',
      zoom: document.querySelector('[data-mindmap-view] [data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '',
      scrollLeft: Math.round(document.querySelector('[data-mindmap-middle-pan="true"]')?.scrollLeft || 0),
      scrollTop: Math.round(document.querySelector('[data-mindmap-middle-pan="true"]')?.scrollTop || 0),
    };
  }, relationshipLabel);

  const assertCompositeScene = async (relationshipLabel, label) => {
    const meta = await collectCompositeSceneMeta(relationshipLabel);
    assert(
      meta.visibleNodes >= 3 &&
        meta.visibleDateBadges >= 2 &&
        meta.connectorPaths >= 2 &&
        meta.relationshipPaths === 1 &&
        meta.relationshipSelected &&
        meta.relationshipLabelTargets >= 1 &&
        meta.relationshipEndpoints >= 2 &&
        meta.relationshipControlPoints >= 2 &&
        meta.relationshipCoordinateSpaces.every(space => space === 'map-local') &&
        meta.relationshipPathD.startsWith('M '),
      label,
      { meta },
    );
    return meta;
  };

  const collectTidyTrunks = async (parentId, childIds) => page.evaluate(({ parentId, childIds }) => childIds.map((childId) => {
    const path = document.querySelector(`[data-from-node-id="${parentId}"][data-to-node-id="${childId}"]`);
    const d = path?.getAttribute('d') || '';
    const match = d.match(/ H ([\d.-]+) V /);
    return {
      childId,
      d,
      trunkX: match ? Number(match[1]) : null,
      hasBracketShape: d.includes(' H ') && d.includes(' V '),
    };
  }), { parentId, childIds });

  await openApp();
  await assertNoVisibleErrors('DEV-027B initial');
  await page.waitForTimeout(650);
  const initialVisibility = await collectMindMapVisibility();
  assert(
    initialVisibility.centerVisible && initialVisibility.visibleCount >= 3 && initialVisibility.centered === 'initial',
    'mind map should be visible and centered immediately after entering the mode',
    { initialVisibility },
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-initial-visible-centered.png', fullPage: true });

  const stamp = Date.now().toString(36);
  const parent = `DEV027B selected parent 1 ${stamp}`;
  const targetRoot = `DEV027B target root 2 ${stamp}`;
  const tabParent = `DEV027B tab parent ${stamp}`;
  const tabChild = `DEV027B tab child ${stamp}`;
  const tabGrandchild = `DEV027B tab grandchild ${stamp}`;
  const deleteParent = `DEV027B delete parent ${stamp}`;
  const deleteChildren = [1, 2, 3].map(index => `DEV027B delete child ${index} ${stamp}`);
  const children = [1, 2, 3, 4, 5].map(index => `DEV027B child ${index} ${stamp}`);
  const zoomPanRelationship = `DEV027B zoom-pan relation ${stamp}`;

  await createRoot(parent);
  await createRoot(targetRoot);
  await selectNode(parent);
  await createChildFromSelected(children[0]);
  for (let index = 1; index < children.length; index += 1) {
    await createSiblingFromSelected(children[index]);
  }

  await selectNode(children[2]);
  await page.keyboard.press('ArrowUp');
  await expectSelected(children[1], 'ArrowUp should move selection to the previous visible sibling');
  await page.keyboard.press('ArrowDown');
  await expectSelected(children[2], 'ArrowDown should move selection to the next visible sibling');
  await page.keyboard.press('ArrowLeft');
  await expectSelected(parent, 'ArrowLeft should move selection to the parent branch');
  await page.keyboard.press('ArrowRight');
  await expectSelected(children[0], 'ArrowRight should move selection to the first child branch');

  await createRoot(tabParent);
  await selectNode(tabParent);
  await createChildFromSelected(tabChild);
  await createChildFromSelected(tabGrandchild);
  const tabMeta = await collectNodeMeta([tabChild, tabGrandchild]);
  assert(tabMeta[0].level === 2 && tabMeta[1].level === 3 && tabMeta[1].parentId === tabMeta[0].id, 'Tab should repeatedly create a selected nested child branch', { tabMeta });

  const childMeta = await collectNodeMeta(children);
  const parentId = childMeta[0].parentId;
  assert(childMeta.every(meta => meta.parentId === parentId), 'Enter should insert a sibling directly below the selected node with the same parent', { childMeta });
  assert(childMeta.every(meta => meta.level === 2), 'Enter siblings should keep the same level', { childMeta });
  assert(childMeta.every(meta => meta.direction === childMeta[0].direction), 'Enter siblings should keep the same side', { childMeta });
  assert(childMeta.every((meta, index) => index === 0 || meta.top > childMeta[index - 1].top), 'Enter siblings should render below the previously selected sibling', { childMeta });
  await page.screenshot({ path: 'output/playwright/dev-027B-enter-sibling-order.png', fullPage: true });

  await applyDatesToNodes([parent, ...children, targetRoot]);
  await createInlineRelationship(children[0], children[3], zoomPanRelationship);
  await assertCompositeScene(
    zoomPanRelationship,
    'zoom/pan validation fixture should include tasks, date badges, tree connectors, selected relationship line, relationship label, endpoints, and control points',
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-zoom-pan-composite-fixture.png', fullPage: true });

  const zoomBeforeButton = Number(await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level'));
  const zoomBeforeButtonRaw = await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level');
  const zoomPathBeforeButton = await collectZoomPathSnapshot();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(350);
  const zoomPathAfterButton = await collectZoomPathSnapshot();
  assert(
    JSON.stringify(zoomPathAfterButton.connectorPaths) === JSON.stringify(zoomPathBeforeButton.connectorPaths) &&
      JSON.stringify(zoomPathAfterButton.relationshipPaths) === JSON.stringify(zoomPathBeforeButton.relationshipPaths) &&
      zoomPathAfterButton.recomputeCount === zoomPathBeforeButton.recomputeCount,
    'zoom button should only scale the viewport and must not recompute connector or relationship paths',
    { zoomPathBeforeButton, zoomPathAfterButton },
  );
  const zoomAfterSingleButtonRaw = await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level');
  const zoomAfterSingleButton = Number(zoomAfterSingleButtonRaw);
  assert(
    Math.abs((zoomAfterSingleButton - zoomBeforeButton) - 0.05) < 0.005 &&
      /^\d+\.\d{3}$/.test(zoomBeforeButtonRaw || '') &&
      /^\d+\.\d{3}$/.test(zoomAfterSingleButtonRaw || ''),
    'zoom button should use fine 5% increments and expose three-decimal zoom state',
    { zoomBeforeButtonRaw, zoomAfterSingleButtonRaw, zoomBeforeButton, zoomAfterSingleButton },
  );
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(350);
  const zoomAfterIn = await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level');
  assert(Number(zoomAfterIn) > 1, 'zoom level should change after zoom-in', { zoomAfterIn });
  const zoomRenderer = await collectZoomRenderer();
  assert(
    zoomRenderer.renderer === 'css-zoom-layer' &&
      zoomRenderer.quality === 'zoom-only-no-path-recompute' &&
      Number(zoomRenderer.vectorZoom) > 1 &&
      Number(zoomRenderer.cssZoom) > 1 &&
      parseFloat(zoomRenderer.nodeFontSize) <= 14.5 &&
      (zoomRenderer.transform === 'none' || zoomRenderer.transform === ''),
    'zoom-in should use one CSS zoom layer instead of recomputing mind map layout or paths',
    { zoomRenderer },
  );
  const zoomDistances = await collectEndpointDistances();
  assert(zoomDistances.every(item => item.distance <= 10), 'zoomed connector endpoints should remain aligned with node edges', { zoomDistances: zoomDistances.filter(item => item.distance > 10) });
  const zoomButtonVisibility = await collectMindMapVisibility();
  assert(
    zoomButtonVisibility.centerVisible && zoomButtonVisibility.visibleCount >= 3,
    'zoom button changes should keep the mind map visible instead of jumping to blank space',
    { zoomButtonVisibility },
  );
  await relationshipTargetByLabel(zoomPanRelationship).click({ force: true });
  await assertCompositeScene(
    zoomPanRelationship,
    'button zoom evidence should still include date badges plus selected relationship label, endpoints, and control points',
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-zoom-fine-step.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-reset]').click();
  await page.waitForTimeout(250);
  assert(Number(await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level')) === 1, 'zoom reset should restore 100%');
  const resetVisibility = await collectMindMapVisibility();
  assert(resetVisibility.centerVisible && resetVisibility.visibleCount >= 3, 'zoom reset should keep the mind map visible', { resetVisibility });
  await page.screenshot({ path: 'output/playwright/dev-027B-zoom-100.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-fit]').click();
  await page.waitForTimeout(650);
  const fitVisibility = await collectMindMapVisibility();
  assert(
    fitVisibility.centerVisible && fitVisibility.visibleCount >= Math.min(10, fitVisibility.nodeCount) && fitVisibility.centered === 'fit',
    'fit-to-content should zoom and scroll to visible mind map content, not a blank padded canvas',
    { fitVisibility },
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-fit-visible-content.png', fullPage: true });

  const wheelZoomBefore = await collectZoomPreviewState();
  await wheelZoomAtSurface(-180);
  await wheelZoomAtSurface(-180);
  await wheelZoomAtSurface(-180);
  await page.waitForTimeout(60);
  const wheelZoomPreview = await collectZoomPreviewState();
  assert(
    wheelZoomPreview.interaction === 'preview-then-vector-commit' &&
      wheelZoomPreview.active === 'true' &&
      wheelZoomPreview.previewLevel > wheelZoomBefore.committedLevel &&
      wheelZoomPreview.previewScale > 1 &&
      wheelZoomPreview.contentPreviewTransform === 'scale' &&
      wheelZoomPreview.transform !== 'none' &&
      wheelZoomPreview.label !== '100%',
    'wheel zoom should use transient preview transform during continuous zoom',
    { wheelZoomBefore, wheelZoomPreview },
  );
  await page.waitForFunction(() => !document.querySelector('[data-mindmap-middle-pan="true"]')?.hasAttribute('data-mindmap-zoom-preview-active'), null, { timeout: 5000 });
  await page.waitForTimeout(120);
  const wheelZoomCommitted = await collectZoomPreviewState();
  assert(
    wheelZoomCommitted.committedLevel > wheelZoomBefore.committedLevel &&
      wheelZoomCommitted.committedDataLevel === wheelZoomCommitted.committedLevel &&
      wheelZoomCommitted.active === '' &&
      wheelZoomCommitted.contentPreviewTransform === '' &&
      (wheelZoomCommitted.transform === 'none' || wheelZoomCommitted.transform === ''),
    'wheel zoom should commit back to zoom layer after idle',
    { wheelZoomBefore, wheelZoomPreview, wheelZoomCommitted },
  );
  const wheelZoomRenderer = await collectZoomRenderer();
  assert(
    wheelZoomRenderer.renderer === 'css-zoom-layer' &&
      wheelZoomRenderer.quality === 'zoom-only-no-path-recompute' &&
      Number(wheelZoomRenderer.vectorZoom) === wheelZoomCommitted.committedLevel &&
      Number(wheelZoomRenderer.cssZoom) === wheelZoomCommitted.committedLevel &&
      parseFloat(wheelZoomRenderer.nodeFontSize) <= 14.5,
    'wheel zoom committed state should remain one zoom layer without path recompute',
    { wheelZoomRenderer, wheelZoomCommitted },
  );
  await relationshipTargetByLabel(zoomPanRelationship).click({ force: true });
  await assertCompositeScene(
    zoomPanRelationship,
    'wheel zoom evidence should still include date badges plus selected relationship label, endpoints, and control points',
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-wheel-zoom-smooth-commit.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-reset]').click();
  await page.waitForTimeout(250);
  await relationshipTargetByLabel(zoomPanRelationship).click({ force: true });
  const panCompositeBefore = await assertCompositeScene(
    zoomPanRelationship,
    'middle-mouse pan fixture should start with date badges plus selected relationship label, endpoints, and control points',
  );

  const panSurface = page.locator('[data-mindmap-middle-pan="true"]').first();
  const panSurfaceBox = await panSurface.boundingBox();
  assert(Boolean(panSurfaceBox), 'mind map pan surface should have a viewport box');
  const panBefore = await panSurface.evaluate(element => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  assert(
    panBefore.scrollWidth >= panBefore.clientWidth * 2 && panBefore.scrollHeight >= panBefore.clientHeight * 1.8,
    'mind map canvas should include Xmind-like edge padding for panning to far sides',
    { panBefore },
  );
  const panStart = {
    x: panSurfaceBox.x + panSurfaceBox.width * 0.5,
    y: panSurfaceBox.y + panSurfaceBox.height * 0.55,
  };
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down({ button: 'middle' });
  await page.waitForFunction(() => document.querySelector('[data-mindmap-middle-pan-active="true"]'), null, { timeout: 5000 });
  assert(await panSurface.getAttribute('data-mindmap-middle-pan-mode') === 'velocity', 'middle mouse panning should use Xmind-like velocity mode');
  await page.mouse.move(panStart.x + 90, panStart.y + 50, { steps: 6 });
  await page.waitForTimeout(350);
  const panSmall = await panSurface.evaluate(element => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    speedX: Math.abs(Number(element.getAttribute('data-mindmap-middle-pan-speed-x') || '0')),
    speedY: Math.abs(Number(element.getAttribute('data-mindmap-middle-pan-speed-y') || '0')),
  }));
  await page.mouse.move(panStart.x + 320, panStart.y + 180, { steps: 8 });
  await page.waitForTimeout(500);
  const panLarge = await panSurface.evaluate(element => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    speedX: Math.abs(Number(element.getAttribute('data-mindmap-middle-pan-speed-x') || '0')),
    speedY: Math.abs(Number(element.getAttribute('data-mindmap-middle-pan-speed-y') || '0')),
  }));
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(200);
  const panAfter = await panSurface.evaluate(element => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    active: element.getAttribute('data-mindmap-middle-pan-active') || '',
    mode: element.getAttribute('data-mindmap-middle-pan-mode') || '',
  }));
  assert(
    panSmall.scrollLeft > panBefore.scrollLeft &&
      panSmall.scrollTop > panBefore.scrollTop &&
      panLarge.scrollLeft > panSmall.scrollLeft + 80 &&
      panLarge.scrollTop > panSmall.scrollTop + 35 &&
      panLarge.speedX > panSmall.speedX &&
      panLarge.speedY > panSmall.speedY &&
      panAfter.active === '' &&
      panAfter.mode === '',
    'middle mouse offset should continuously pan faster as the cursor moves farther from the press point',
    { panBefore, panSmall, panLarge, panAfter },
  );
  await relationshipTargetByLabel(zoomPanRelationship).click({ force: true });
  const panCompositeAfter = await assertCompositeScene(
    zoomPanRelationship,
    'middle-mouse pan evidence should still include date badges plus selected relationship label, endpoints, and control points',
  );
  assert(
    panCompositeAfter.relationshipPathD === panCompositeBefore.relationshipPathD &&
      panCompositeAfter.recomputeCount === panCompositeBefore.recomputeCount,
    'middle-mouse pan should only scroll the viewport and must not rewrite or recompute the selected relationship path',
    { panCompositeBefore, panCompositeAfter },
  );
  await page.screenshot({ path: 'output/playwright/dev-027B-middle-mouse-pan.png', fullPage: true });

  const updatedChildMeta = await collectNodeMeta(children);
  const tidyTrunks = await collectTidyTrunks(parentId, updatedChildMeta.map(meta => meta.id));
  assert(tidyTrunks.every(item => item.hasBracketShape), 'child connector paths should use bracket-shaped H/V topology', { tidyTrunks });
  const trunkValues = tidyTrunks.map(item => item.trunkX).filter(value => typeof value === 'number');
  const trunkSpread = Math.max(...trunkValues) - Math.min(...trunkValues);
  assert(trunkSpread <= 1.5, 'child connector paths should share a tidy trunk', { trunkValues, trunkSpread });
  await page.screenshot({ path: 'output/playwright/dev-027B-tidy-bracket-parent-five-children.png', fullPage: true });

  const dragTarget = children[2];
  await nodeByTitle(children[4]).scrollIntoViewIfNeeded();
  await nodeByTitle(dragTarget).scrollIntoViewIfNeeded();
  const sourceBox = await nodeByTitle(children[4]).boundingBox();
  const targetBox = await nodeByTitle(dragTarget).boundingBox();
  assert(Boolean(sourceBox) && Boolean(targetBox), 'drag source and target should have bounding boxes');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 28, sourceBox.y + sourceBox.height / 2 + 12, { steps: 5 });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-mindmap-drag-preview]')), null, { timeout: 5000 });
  await page.mouse.move(targetBox.x + targetBox.width * 0.35, targetBox.y + targetBox.height * 0.35, { steps: 8 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.waitForFunction(() => {
    const preview = document.querySelector('[data-mindmap-insertion-preview]');
    return Boolean(preview?.getAttribute('data-drop-position'));
  }, null, { timeout: 7000 });
  const previewMeta = await page.locator('[data-mindmap-insertion-preview]').first().evaluate(element => ({
    targetNodeId: element.getAttribute('data-target-node-id'),
    targetParentId: element.getAttribute('data-target-parent-id'),
    siblingBeforeId: element.getAttribute('data-sibling-before-id'),
    siblingAfterId: element.getAttribute('data-sibling-after-id'),
    dropPosition: element.getAttribute('data-drop-position'),
    direction: element.getAttribute('data-direction'),
    coordinateSpace: element.getAttribute('data-mindmap-insertion-preview-coordinate-space'),
  }));
  const targetMeta = (await collectNodeMeta([dragTarget]))[0];
  const hasSiblingPlacement = (previewMeta.dropPosition === 'before' && previewMeta.siblingAfterId === targetMeta.id)
    || (previewMeta.dropPosition === 'after' && previewMeta.siblingBeforeId === targetMeta.id);
  const hasChildPlacement = previewMeta.dropPosition === 'child' && previewMeta.targetParentId === targetMeta.id;
  assert(hasSiblingPlacement || hasChildPlacement, 'drag insertion preview should expose sibling metadata or target parent metadata', {
    previewMeta,
    targetMeta,
  });
  const dropPreviewMeta = await page.locator('[data-mindmap-drop-preview]').first().evaluate(element => ({
    coordinateSpace: element.getAttribute('data-mindmap-drop-preview-coordinate-space'),
    d: element.getAttribute('d') || '',
  }));
  assert(previewMeta.coordinateSpace === 'map-local', 'drag insertion placeholder should render in the map-local zoom layer', { previewMeta });
  assert(dropPreviewMeta.coordinateSpace === 'map-local' && dropPreviewMeta.d.startsWith('M '), 'drag insertion preview should include a map-local intended connector', { dropPreviewMeta });
  assert((await page.locator('[data-mindmap-drag-preview]').count()) > 0, 'drag insertion preview should include a ghost node');
  await page.screenshot({ path: 'output/playwright/dev-027B-drag-insertion-preview-hover.png', fullPage: true });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const postDrop = (await collectNodeMeta([children[4], dragTarget]));
  assert(postDrop[0].direction === postDrop[1].direction, 'preview metadata should match post-drop state by preserving target side', { previewMeta, postDrop });
  if (previewMeta.dropPosition === 'child') {
    assert(postDrop[0].parentId === postDrop[1].id && postDrop[0].level === postDrop[1].level + 1, 'preview metadata should match post-drop state by moving the node under the target parent', { previewMeta, postDrop });
  } else if (previewMeta.dropPosition === 'before') {
    assert(postDrop[0].level === postDrop[1].level && postDrop[0].parentId === postDrop[1].parentId && postDrop[0].order < postDrop[1].order, 'preview metadata should match post-drop state by placing the node before the target sibling', { previewMeta, postDrop });
  } else {
    assert(postDrop[0].level === postDrop[1].level && postDrop[0].parentId === postDrop[1].parentId && postDrop[0].order > postDrop[1].order, 'preview metadata should match post-drop state by placing the node after the target sibling', { previewMeta, postDrop });
  }
  await page.screenshot({ path: 'output/playwright/dev-027B-drag-insertion-preview-post-drop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarBox = await page.locator('aside').first().boundingBox().catch(() => null);
  if (sidebarBox && sidebarBox.width > 120) {
    await page.locator('nav button').first().click();
    await page.waitForTimeout(250);
  }
  await page.locator('[data-mindmap-zoom-out]').click();
  await page.waitForTimeout(250);
  await assertNoVisibleErrors('DEV-027B mobile zoom');
  await page.screenshot({ path: 'output/playwright/dev-027B-mobile-zoom.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await createRoot(deleteParent);
  await createChildFromSelected(deleteChildren[0]);
  await createSiblingFromSelected(deleteChildren[1]);
  await createSiblingFromSelected(deleteChildren[2]);
  await selectNode(deleteChildren[1]);
  await page.keyboard.press('Delete');
  await nodeByTitle(deleteChildren[1]).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  await expectSelected(deleteChildren[0], 'Delete should select the previous same-level task after removing a branch');
  await page.keyboard.press('Delete');
  await nodeByTitle(deleteChildren[0]).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  await expectSelected(deleteParent, 'Delete should select the parent task when no previous same-level task exists');
  await page.screenshot({ path: 'output/playwright/dev-027B-delete-focus-nearest-task.png', fullPage: true });

  await deleteNode(children[4]);
  await deleteNode(parent);
  await deleteNode(targetRoot);
  await deleteNode(tabParent);
  await deleteNode(deleteParent);
  await assertNoVisibleErrors('DEV-027B cleanup');

  return {
    passed: true,
    childMeta,
    tabMeta,
    tidyTrunks,
    previewMeta,
    postDrop,
    screenshots: [
      'output/playwright/dev-027B-initial-visible-centered.png',
      'output/playwright/dev-027B-enter-sibling-order.png',
      'output/playwright/dev-027B-zoom-pan-composite-fixture.png',
      'output/playwright/dev-027B-zoom-fine-step.png',
      'output/playwright/dev-027B-zoom-100.png',
      'output/playwright/dev-027B-fit-visible-content.png',
      'output/playwright/dev-027B-wheel-zoom-smooth-commit.png',
      'output/playwright/dev-027B-middle-mouse-pan.png',
      'output/playwright/dev-027B-tidy-bracket-parent-five-children.png',
      'output/playwright/dev-027B-drag-insertion-preview-hover.png',
      'output/playwright/dev-027B-drag-insertion-preview-post-drop.png',
      'output/playwright/dev-027B-mobile-zoom.png',
    ],
  };
}
