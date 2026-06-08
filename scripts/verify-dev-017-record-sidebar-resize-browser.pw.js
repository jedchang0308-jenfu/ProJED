/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const openMeetingSidebar = async () => {
    if ((await page.locator('aside', { hasText: '會議速記' }).count()) === 0) {
      await page.locator('nav button', { hasText: '會議紀錄' }).first().click();
    }
    await page.locator('aside', { hasText: '會議速記' }).last().waitFor({ state: 'visible', timeout: 10000 });
    return page.locator('aside', { hasText: '會議速記' }).last();
  };

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1365, height: 768 });

  if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
    await page.locator('button', { hasText: '使用固定測試環境' }).click();
    await page.locator('button', { hasText: '會議紀錄' }).waitFor({ state: 'visible', timeout: 10000 });
  }

  await page.evaluate(() => localStorage.removeItem('projed-record-sidebar-width'));
  await page.reload({ waitUntil: 'networkidle' });

  const panel = await openMeetingSidebar();
  const handle = panel.locator('.record-sidebar-resize-handle');
  await handle.waitFor({ state: 'visible', timeout: 10000 });

  const before = await panel.boundingBox();
  assert(Boolean(before), 'record sidebar should have initial box');

  const handleBox = await handle.boundingBox();
  assert(Boolean(handleBox), 'resize handle should have box');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 140, handleBox.y + handleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const afterDrag = await panel.boundingBox();
  assert(Boolean(afterDrag), 'record sidebar should have box after drag');
  assert(afterDrag.width > before.width + 90, 'dragging handle left should enlarge sidebar', { before, afterDrag });

  const storedWidth = await page.evaluate(() => Number(localStorage.getItem('projed-record-sidebar-width')));
  assert(Number.isFinite(storedWidth), 'sidebar width should be stored in localStorage', { storedWidth });
  assert(Math.abs(storedWidth - afterDrag.width) <= 8, 'stored width should match dragged width', { storedWidth, afterDrag });

  await page.reload({ waitUntil: 'networkidle' });
  const panelAfterReload = await openMeetingSidebar();
  const afterReload = await panelAfterReload.boundingBox();
  assert(Boolean(afterReload), 'record sidebar should have box after reload');
  assert(
    Math.abs(afterReload.width - storedWidth) <= 8,
    'sidebar should restore persisted width after reload',
    { storedWidth, afterReload },
  );

  await page.screenshot({ path: 'output/playwright/dev-017-record-sidebar-resize.png', fullPage: true });
  return {
    passed: true,
    before,
    afterDrag,
    storedWidth,
    afterReload,
    screenshot: 'output/playwright/dev-017-record-sidebar-resize.png',
  };
}
