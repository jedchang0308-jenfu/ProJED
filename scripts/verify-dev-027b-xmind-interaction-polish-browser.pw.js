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
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const input = () => page.locator('[data-mindmap-title-input]').first();

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

  const getSelectedTitle = async () => selectedNode().getAttribute('data-mindmap-node-title');

  const expectSelected = async (title, label) => {
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(title).focus();
    const selectedTitle = await getSelectedTitle();
    assert(selectedTitle === title, label, { selectedTitle, expected: title });
  };

  const selectNode = async (title) => {
    await nodeByTitle(title).click();
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
    const zoom = Number(document.querySelector('[data-mindmap-zoom-level]')?.getAttribute('data-mindmap-zoom-level') || '1');
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

  const stamp = Date.now().toString(36);
  const parent = `DEV027B selected parent 1 ${stamp}`;
  const targetRoot = `DEV027B target root 2 ${stamp}`;
  const tabParent = `DEV027B tab parent ${stamp}`;
  const tabChild = `DEV027B tab child ${stamp}`;
  const tabGrandchild = `DEV027B tab grandchild ${stamp}`;
  const deleteParent = `DEV027B delete parent ${stamp}`;
  const deleteChildren = [1, 2, 3].map(index => `DEV027B delete child ${index} ${stamp}`);
  const children = [1, 2, 3, 4, 5].map(index => `DEV027B child ${index} ${stamp}`);

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

  await page.locator('[data-mindmap-zoom-in]').click();
  await page.locator('[data-mindmap-zoom-in]').click();
  await page.waitForTimeout(350);
  const zoomAfterIn = await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level');
  assert(Number(zoomAfterIn) > 1, 'zoom level should change after zoom-in', { zoomAfterIn });
  const zoomDistances = await collectEndpointDistances();
  assert(zoomDistances.every(item => item.distance <= 10), 'zoomed connector endpoints should remain aligned with node edges', { zoomDistances: zoomDistances.filter(item => item.distance > 10) });
  await selectNode(children[2]);
  await page.screenshot({ path: 'output/playwright/dev-027B-zoom-150.png', fullPage: true });

  await page.locator('[data-mindmap-zoom-reset]').click();
  await page.waitForTimeout(250);
  assert(Number(await page.locator('[data-mindmap-view] [data-mindmap-zoom-level]').first().getAttribute('data-mindmap-zoom-level')) === 1, 'zoom reset should restore 100%');
  await page.screenshot({ path: 'output/playwright/dev-027B-zoom-100.png', fullPage: true });

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
  }));
  const targetMeta = (await collectNodeMeta([dragTarget]))[0];
  const hasSiblingPlacement = (previewMeta.dropPosition === 'before' && previewMeta.siblingAfterId === targetMeta.id)
    || (previewMeta.dropPosition === 'after' && previewMeta.siblingBeforeId === targetMeta.id);
  const hasChildPlacement = previewMeta.dropPosition === 'child' && previewMeta.targetParentId === targetMeta.id;
  assert(hasSiblingPlacement || hasChildPlacement, 'drag insertion preview should expose sibling metadata or target parent metadata', {
    previewMeta,
    targetMeta,
  });
  assert((await page.locator('[data-mindmap-drop-preview]').count()) > 0, 'drag insertion preview should include an intended connector');
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
      'output/playwright/dev-027B-enter-sibling-order.png',
      'output/playwright/dev-027B-zoom-150.png',
      'output/playwright/dev-027B-zoom-100.png',
      'output/playwright/dev-027B-tidy-bracket-parent-five-children.png',
      'output/playwright/dev-027B-drag-insertion-preview-hover.png',
      'output/playwright/dev-027B-drag-insertion-preview-post-drop.png',
      'output/playwright/dev-027B-mobile-zoom.png',
    ],
  };
}
