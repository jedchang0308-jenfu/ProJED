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

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
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
    await ensureMindMap();
  };

  const ensureMindMap = async () => {
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const input = () => page.locator('[data-mindmap-title-input]').first();

  const renameSelectedByTyping = async (title) => {
    await selectedNode().focus();
    await page.keyboard.press('D');
    await input().waitFor({ state: 'visible', timeout: 10000 });
    await input().fill(title);
    await input().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    assert((await page.locator('[data-mindmap-title-input]').count()) === 0, 'new root should be selected without opening rename input');
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

  const dragNodeToSide = async (title, direction, prefix) => {
    const source = nodeByTitle(title);
    const target = page.locator(`[data-mindmap-side-drop-zone="${direction}"]`).first();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert(Boolean(sourceBox), 'drag source should have a bounding box', { title });
    assert(Boolean(targetBox), 'side drop zone should have a bounding box', { direction });

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.screenshot({ path: `output/playwright/dev-027A-drag-preview-sequence/${prefix}-start.png`, fullPage: true });

    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 28, sourceBox.y + sourceBox.height / 2 + 12, { steps: 5 });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-mindmap-drag-preview]')), null, { timeout: 5000 });
    await page.mouse.move(targetBox.x + Math.max(24, targetBox.width * 0.35), targetBox.y + Math.max(24, targetBox.height * 0.25), { steps: 8 });
    await page.waitForTimeout(150);
    const firstPreview = await page.locator('[data-mindmap-drag-preview]').first().boundingBox();
    const firstMetadata = await page.locator('[data-mindmap-drag-preview]').first().evaluate(element => ({
      nodeId: element.getAttribute('data-node-id'),
      dropPosition: element.getAttribute('data-drop-position'),
      direction: element.getAttribute('data-direction'),
      targetParentId: element.getAttribute('data-target-parent-id'),
    }));
    assert(Boolean(firstPreview), 'drag preview should be visible during hover', { title, direction });
    assert(firstMetadata.dropPosition === 'root', 'side drag preview should expose root drop position', firstMetadata);
    assert(firstMetadata.direction === 'left' || firstMetadata.direction === 'right', 'side drag preview should expose a concrete side direction', firstMetadata);
    assert((await page.locator('[data-mindmap-drop-preview]').count()) > 0, 'connector drop preview should be visible during drag');
    await page.screenshot({ path: `output/playwright/dev-027A-drag-preview-sequence/${prefix}-hover.png`, fullPage: true });

    await page.mouse.move(targetBox.x + Math.max(44, targetBox.width * 0.72), targetBox.y + Math.max(44, targetBox.height * 0.65), { steps: 10 });
    await page.waitForTimeout(150);
    const secondPreview = await page.locator('[data-mindmap-drag-preview]').first().boundingBox();
    assert(Boolean(secondPreview), 'drag preview should remain visible before drop', { title, direction });
    const movedDistance = Math.hypot(secondPreview.x - firstPreview.x, secondPreview.y - firstPreview.y);
    assert(movedDistance > 8, 'drag preview bounding box should move as pointer moves', { movedDistance, firstPreview, secondPreview });
    await page.screenshot({ path: `output/playwright/dev-027A-drag-preview-sequence/${prefix}-pre-drop.png`, fullPage: true });

    await page.mouse.up();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `output/playwright/dev-027A-drag-preview-sequence/${prefix}-post-drop.png`, fullPage: true });
    return firstMetadata.direction;
  };

  const getDirection = async (title) => page.evaluate((title) => {
    const element = Array.from(document.querySelectorAll('[data-mindmap-node-title]'))
      .find(node => node.getAttribute('data-mindmap-node-title') === title);
    return element?.getAttribute('data-mindmap-node-direction') ?? null;
  }, title);

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

  await openApp();
  await assertNoVisibleErrors('DEV-027A drag verifier initial');

  const stamp = Date.now().toString(36);
  const rootA = `DEV027A same side A ${stamp}`;
  const rootB = `DEV027A same side B ${stamp}`;
  await createRoot(rootA);
  await createRoot(rootB);

  const firstActualDirection = await dragNodeToSide(rootA, 'left', 'root-a-left');
  await dragNodeToSide(rootB, firstActualDirection, `root-b-${firstActualDirection}`);

  const directionA = await getDirection(rootA);
  const directionB = await getDirection(rootB);
  const sideStorageAfterDrop = await page.evaluate(() => {
    const entries = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('projed.mindmap.rootSides.')) entries[key] = localStorage.getItem(key);
    }
    return entries;
  });
  assert(directionA === directionB, 'two root branches should remain on the same side after drop', {
    directionA,
    directionB,
    sideStorageAfterDrop,
  });

  await page.locator('[data-mode-switcher-value="list"]').click();
  await page.waitForTimeout(250);
  await ensureMindMap();
  const directionAfterModeSwitchA = await getDirection(rootA);
  const directionAfterModeSwitchB = await getDirection(rootB);
  const sideStorageAfterModeSwitch = await page.evaluate(() => {
    const entries = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('projed.mindmap.rootSides.')) entries[key] = localStorage.getItem(key);
    }
    return entries;
  });
  assert(directionAfterModeSwitchA === directionA && directionAfterModeSwitchB === directionB, 'same-side layout should persist after mode switch', {
    directionAfterModeSwitchA,
    directionAfterModeSwitchB,
    directionA,
    directionB,
    sideStorageAfterDrop,
    sideStorageAfterModeSwitch,
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await ensureMindMap();
  const directionAfterReloadA = await getDirection(rootA);
  const directionAfterReloadB = await getDirection(rootB);
  assert(directionAfterReloadA === directionA && directionAfterReloadB === directionB, 'same-side layout should persist after hard reload', {
    directionAfterReloadA,
    directionAfterReloadB,
  });

  const sideProof = await page.evaluate((titles) => titles.map(title => {
    const element = Array.from(document.querySelectorAll('[data-mindmap-node-title]'))
      .find(node => node.getAttribute('data-mindmap-node-title') === title);
    return {
      title,
      id: element?.getAttribute('data-mindmap-node'),
      direction: element?.getAttribute('data-mindmap-node-direction'),
      level: element?.getAttribute('data-mindmap-node-level'),
    };
  }), [rootA, rootB]);
  await deleteNode(rootA);
  await deleteNode(rootB);
  await assertNoVisibleErrors('DEV-027A drag verifier cleanup');

  return {
    passed: true,
    sideProof,
    evidence: [
      'output/playwright/dev-027A-drag-preview-sequence/root-a-left-start.png',
      'output/playwright/dev-027A-drag-preview-sequence/root-a-left-hover.png',
      'output/playwright/dev-027A-drag-preview-sequence/root-a-left-pre-drop.png',
      'output/playwright/dev-027A-drag-preview-sequence/root-a-left-post-drop.png',
      `output/playwright/dev-027A-drag-preview-sequence/root-b-${firstActualDirection}-start.png`,
      `output/playwright/dev-027A-drag-preview-sequence/root-b-${firstActualDirection}-hover.png`,
      `output/playwright/dev-027A-drag-preview-sequence/root-b-${firstActualDirection}-pre-drop.png`,
      `output/playwright/dev-027A-drag-preview-sequence/root-b-${firstActualDirection}-post-drop.png`,
    ],
  };
}
