/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  const waitForApp = async () => {
    await page.locator('[data-layout-region="topbar"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const ensureWorkbenchOpen = async () => {
    if (await page.locator('[data-task-workbench-panel="true"]').count() === 0) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
    }
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };
  const readLaneBoxes = async () => page
    .locator('[data-task-workbench-unclassified-section="true"], [data-task-workbench-placed-board-lane="true"]')
    .evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    }));
  const dragDivider = async deltaY => {
    const divider = page.locator('[data-task-workbench-lane-resize-handle="true"]');
    const box = await divider.boundingBox();
    assert(box, 'divider should have a bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + deltaY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.getByRole('button', { name: '使用固定測試環境' }).count()) {
    await page.getByRole('button', { name: '使用固定測試環境' }).click();
  }
  await waitForApp();

  const accountId = 'local-test-user';
  const panelPreferenceKey = `projed-task-workbench-panel:v2:account:${accountId}`;
  const accountPreferenceKey = `projed-ui-preferences:v1:account:${accountId}`;
  await page.evaluate(({ panelPreferenceKey, accountPreferenceKey }) => {
    localStorage.removeItem(panelPreferenceKey);
    localStorage.removeItem(accountPreferenceKey);
  }, { panelPreferenceKey, accountPreferenceKey });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensureWorkbenchOpen();

  const panel = page.locator('[data-task-workbench-panel="true"]');
  const divider = page.locator('[data-task-workbench-lane-resize-handle="true"]');
  const dividerLine = divider.locator('[data-task-workbench-lane-divider-line="true"]');
  assert(await divider.count() === 1 && await dividerLine.count() === 1, 'one minimal divider should render between the lanes');
  assert(
    await divider.getAttribute('role') === 'separator'
      && await divider.getAttribute('aria-orientation') === 'horizontal'
      && await divider.getAttribute('aria-valuemin') === '18'
      && await divider.getAttribute('aria-valuemax') === '82'
      && await divider.getAttribute('aria-valuenow') === '50',
    'divider should expose the default and boundaries through separator semantics',
  );
  assert(await page.locator('[data-task-workbench-lane-resize-help]').count() === 0, 'normal UI should not add visible resize instructions');

  const defaultBoxes = await readLaneBoxes();
  const defaultDividerBox = await divider.boundingBox();
  assert(
    defaultBoxes.length === 2
      && defaultDividerBox
      && Math.abs(defaultBoxes[0].height - defaultBoxes[1].height) <= 4
      && Math.abs(defaultBoxes[0].bottom - defaultDividerBox.y) <= 1
      && Math.abs(defaultDividerBox.y + defaultDividerBox.height - defaultBoxes[1].top) <= 1,
    'default lanes should split evenly without overlap and keep the divider between them',
    { defaultBoxes, defaultDividerBox },
  );

  const nonPrimaryRatio = await divider.getAttribute('aria-valuenow');
  await page.mouse.move(defaultDividerBox.x + defaultDividerBox.width / 2, defaultDividerBox.y + defaultDividerBox.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(defaultDividerBox.x + defaultDividerBox.width / 2, defaultDividerBox.y + 80, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  assert(await divider.getAttribute('aria-valuenow') === nonPrimaryRatio, 'middle pointer should not resize either lane');

  await dragDivider(120);
  const pointerBoxes = await readLaneBoxes();
  const pointerRatio = Number(await divider.getAttribute('aria-valuenow')) / 100;
  assert(
    pointerBoxes[0].height > defaultBoxes[0].height + 80
      && pointerBoxes[1].height < defaultBoxes[1].height - 80
      && pointerRatio > 0.6,
    'dragging down should grow unplaced and shrink placed',
    { defaultBoxes, pointerBoxes, pointerRatio },
  );

  const pointerStorage = await page.evaluate(({ panelPreferenceKey, accountPreferenceKey }) => ({
    panel: JSON.parse(localStorage.getItem(panelPreferenceKey) || '{}').unplacedRatio,
    account: JSON.parse(localStorage.getItem(accountPreferenceKey) || '{}').layout?.taskWorkbenchUnplacedRatio,
  }), { panelPreferenceKey, accountPreferenceKey });
  assert(
    Math.abs(pointerStorage.panel - pointerRatio) <= 0.02
      && Math.abs(pointerStorage.account - pointerRatio) <= 0.02,
    'pointer resize should persist to both account-scoped cache and account UI preferences',
    { pointerStorage, pointerRatio },
  );

  await divider.focus();
  await page.keyboard.press('ArrowUp');
  const keyboardRatio = Number(await divider.getAttribute('aria-valuenow')) / 100;
  assert(keyboardRatio < pointerRatio, 'ArrowUp should reduce the unplaced share', { pointerRatio, keyboardRatio });
  await page.keyboard.press('Home');
  const minimumBoxes = await readLaneBoxes();
  assert(
    await divider.getAttribute('aria-valuenow') === '18'
      && minimumBoxes.every(box => box.height >= 80),
    'Home should clamp at 18 percent while both section headers remain usable',
    { minimumBoxes },
  );
  await page.keyboard.press('End');
  assert(await divider.getAttribute('aria-valuenow') === '82', 'End should clamp at 82 percent');
  await page.keyboard.press('ArrowUp');
  const persistedRatio = Number(await divider.getAttribute('aria-valuenow')) / 100;
  const valueText = await divider.getAttribute('aria-valuetext');
  assert(
    valueText === `未歸位 ${Math.round(persistedRatio * 100)}%，已歸位 ${100 - Math.round(persistedRatio * 100)}%`,
    'assistive value text should identify both resulting lane shares',
    { persistedRatio, valueText },
  );

  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensureWorkbenchOpen();
  const restoredDivider = page.locator('[data-task-workbench-lane-resize-handle="true"]');
  const restoredRatio = Number(await restoredDivider.getAttribute('aria-valuenow')) / 100;
  assert(Math.abs(restoredRatio - persistedRatio) <= 0.02, 'same account should restore the saved ratio after reload', { persistedRatio, restoredRatio });

  const desktopPanelBox = await panel.boundingBox();
  const desktopStackBox = await page.locator('[data-task-workbench-lane-stack="true"]').boundingBox();
  assert(desktopPanelBox && desktopStackBox && desktopStackBox.height > 500, 'desktop panel should keep a usable lane stack', { desktopPanelBox, desktopStackBox });
  await page.screenshot({ path: 'output/playwright/dev-091/task-workbench-lane-resize-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensureWorkbenchOpen();
  const narrowPanel = page.locator('[data-task-workbench-panel="true"]');
  const narrowPanelBox = await narrowPanel.boundingBox();
  const narrowDivider = page.locator('[data-task-workbench-lane-resize-handle="true"]');
  const narrowDividerBox = await narrowDivider.boundingBox();
  assert(
    narrowPanelBox
      && narrowDividerBox
      && narrowPanelBox.x >= 0
      && narrowPanelBox.x + narrowPanelBox.width <= 390
      && narrowDividerBox.x >= narrowPanelBox.x
      && narrowDividerBox.x + narrowDividerBox.width <= narrowPanelBox.x + narrowPanelBox.width,
    '390px viewport should keep the panel and divider inside the visible width',
    { narrowPanelBox, narrowDividerBox },
  );
  const narrowBefore = await readLaneBoxes();
  await dragDivider(-48);
  const narrowAfter = await readLaneBoxes();
  assert(narrowAfter[0].height < narrowBefore[0].height - 24, 'narrow viewport should retain pointer resizing', { narrowBefore, narrowAfter });
  const documentOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(documentOverflow.scrollWidth <= documentOverflow.clientWidth, 'narrow viewport should not create document-level horizontal overflow', { documentOverflow });
  await page.screenshot({ path: 'output/playwright/dev-091/task-workbench-lane-resize-390x844.png', fullPage: true });

  const visibleAlerts = await page.locator('[role="alert"]:visible').allTextContents();
  const bodyText = await page.locator('body').innerText();
  assert(visibleAlerts.length === 0, 'no visible alert errors should remain', { visibleAlerts });
  assert(!/HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText), 'no visible runtime error text should remain');
  assert(consoleErrors.length === 0 && pageErrors.length === 0, 'browser console and page error sweep should remain clean', { consoleErrors, pageErrors });

  return {
    passed: true,
    viewport: { desktop: '1440x900', narrow: '390x844' },
    ratios: { pointer: pointerRatio, keyboard: keyboardRatio, restored: restoredRatio },
    persistence: pointerStorage,
    screenshots: [
      'output/playwright/dev-091/task-workbench-lane-resize-desktop.png',
      'output/playwright/dev-091/task-workbench-lane-resize-390x844.png',
    ],
  };
}
