/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const accounts = {
    owner: {
      id: 'local-test-user',
      uid: 'local-test-user',
      email: 'test@projed.local',
      displayName: 'ProJED 本機測試擁有者',
      createdAt: 1704067200000,
    },
    viewer: {
      id: 'local-test-viewer',
      uid: 'local-test-viewer',
      email: 'viewer@projed.local',
      displayName: '本機測試檢視者',
      createdAt: 1704067200000,
    },
  };

  const sessionKeys = {
    selected: 'projed-local-test.selected-account',
    session: 'projed-local-test.session',
  };

  const setAccount = async (account) => {
    await page.evaluate(({ account, sessionKeys }) => {
      localStorage.setItem(sessionKeys.selected, account.id);
      localStorage.setItem(sessionKeys.session, JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, { account, sessionKeys });
  };

  const openApp = async (account, viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await setAccount(account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openMindMap = async () => {
    const switcher = page.locator('nav button', { hasText: '心智圖' }).first();
    await switcher.waitFor({ state: 'visible', timeout: 15000 });
    await switcher.click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-center]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();

  const nodeCount = async () => page.locator('[data-mindmap-node]').count();

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

  const branchLevel = async (title) => {
    return page.evaluate((title) => {
      const node = Array.from(document.querySelectorAll('[data-mindmap-node-title]'))
        .find(element => element.getAttribute('data-mindmap-node-title') === title);
      return node?.closest('[data-mindmap-branch-level]')?.getAttribute('data-mindmap-branch-level') ?? null;
    }, title);
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    const input = page.locator('[data-mindmap-title-input]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(title);
    await input.press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
  };

  const createChildViaKeyboard = async (parentTitle, childTitle) => {
    await nodeByTitle(parentTitle).click();
    await page.keyboard.press('Tab');
    const input = page.locator('[data-mindmap-title-input]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(childTitle);
    await input.press('Enter');
    await nodeByTitle(childTitle).waitFor({ state: 'visible', timeout: 10000 });
  };

  const dragTo = async (source, target, yRatio = 0.5) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert(Boolean(sourceBox), 'drag source should have a bounding box');
    assert(Boolean(targetBox), 'drag target should have a bounding box');
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height * yRatio,
      { steps: 12 },
    );
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(350);
  };

  const deleteNode = async (title) => {
    if ((await nodeByTitle(title).count()) === 0) return;
    await nodeByTitle(title).click();
    await page.keyboard.press('Delete');
    if ((await page.locator('.global-dialog-content').count()) > 0) {
      const confirm = page.locator('.global-dialog-content button', { hasText: /刪除|確認|確定/ }).first();
      await confirm.click();
      await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
    }
    await nodeByTitle(title).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  };

  await openApp(accounts.owner, { width: 1440, height: 900 });
  await openMindMap();
  await assertNoVisibleErrors('DEV-027 desktop mind map');

  const initialCount = await nodeCount();
  assert(initialCount > 0, 'mind map should render existing WBS tasks', { initialCount });

  const stamp = Date.now().toString(36);
  const rootA = `DEV027 drag root A ${stamp}`;
  const rootB = `DEV027 drag root B ${stamp}`;
  const childA = `DEV027 drag child A ${stamp}`;

  await createRoot(rootA);
  await createRoot(rootB);
  await createChildViaKeyboard(rootA, childA);
  assert(await branchLevel(childA) === '2', 'Tab should create a level-2 child branch', { level: await branchLevel(childA) });

  await dragTo(nodeByTitle(rootA), nodeByTitle(rootB), 0.5);
  assert(await branchLevel(rootA) === '2', 'dragging onto another branch center should reparent as a child', {
    level: await branchLevel(rootA),
  });

  await dragTo(nodeByTitle(rootB), nodeByTitle(rootA), 0.5);
  assert(await branchLevel(rootB) === '1', 'cycle guard should reject dragging a parent under its descendant', {
    level: await branchLevel(rootB),
  });

  await dragTo(nodeByTitle(rootA), page.locator('[data-mindmap-center]').first(), 0.5);
  assert(await branchLevel(rootA) === '1', 'dropping a branch on the center topic should restore it as root', {
    level: await branchLevel(rootA),
  });

  await page.screenshot({ path: 'output/playwright/dev-027-mindmap-desktop.png', fullPage: true });

  await page.waitForTimeout(4200);
  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarBox = await page.locator('aside').first().boundingBox().catch(() => null);
  if (sidebarBox && sidebarBox.width > 120) {
    await page.locator('nav button').first().click();
    await page.waitForTimeout(250);
  }
  const mobileGeometry = await page.evaluate(() => {
    const view = document.querySelector('[data-mindmap-view]');
    const canvas = view?.querySelector('.overflow-auto');
    const firstNode = document.querySelector('[data-mindmap-node]');
    const nodeBox = firstNode?.getBoundingClientRect();
    return {
      viewVisible: Boolean(view),
      canvasScrollWidth: canvas?.scrollWidth ?? 0,
      canvasClientWidth: canvas?.clientWidth ?? 0,
      firstNodeHeight: nodeBox?.height ?? 0,
    };
  });
  assert(mobileGeometry.viewVisible, 'mobile viewport should keep mind map visible', mobileGeometry);
  assert(
    mobileGeometry.canvasScrollWidth > mobileGeometry.canvasClientWidth,
    'mobile mind map canvas should remain horizontally scrollable instead of clipped',
    mobileGeometry,
  );
  assert(mobileGeometry.canvasClientWidth >= 300, 'mobile sidebar should not cover the mind map workspace after collapse', mobileGeometry);
  assert(mobileGeometry.firstNodeHeight >= 32, 'mobile branch hit target should remain usable', mobileGeometry);
  await assertNoVisibleErrors('DEV-027 mobile mind map');
  await page.screenshot({ path: 'output/playwright/dev-027-mindmap-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await deleteNode(rootA);
  await deleteNode(rootB);
  assert((await nodeByTitle(rootA).count()) === 0, 'cleanup should remove drag root A');
  assert((await nodeByTitle(rootB).count()) === 0, 'cleanup should remove drag root B');

  await openApp(accounts.viewer, { width: 1440, height: 900 });
  await openMindMap();
  await assertNoVisibleErrors('DEV-027 viewer mind map');
  const viewerCountBefore = await nodeCount();
  const createButton = page.locator('[data-mindmap-create-root]').first();
  assert(await createButton.isDisabled(), 'viewer create-root button should be disabled');
  assert((await page.locator('[data-mindmap-view]', { hasText: '唯讀模式' }).count()) === 1, 'viewer should see read-only mode badge');

  const firstViewerNode = page.locator('[data-mindmap-node]').first();
  assert(await firstViewerNode.getAttribute('draggable') === 'false', 'viewer branches should not be draggable');
  await firstViewerNode.click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert(await nodeCount() === viewerCountBefore, 'viewer pressing Enter should not create a sibling branch', {
    before: viewerCountBefore,
    after: await nodeCount(),
  });

  return {
    passed: true,
    initialCount,
    screenshots: [
      'output/playwright/dev-027-mindmap-desktop.png',
      'output/playwright/dev-027-mindmap-mobile.png',
    ],
    viewerCountBefore,
  };
}
