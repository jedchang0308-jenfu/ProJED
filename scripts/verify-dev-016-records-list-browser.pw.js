/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1365, height: 768 });

  if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
    await page.locator('button', { hasText: '使用固定測試環境' }).click();
    await page.locator('button', { hasText: '紀錄庫' }).waitFor({ state: 'visible', timeout: 10000 });
  }

  const recordsButton = page.locator('button', { hasText: '紀錄庫' }).first();
  assert((await recordsButton.count()) === 1, 'records mode button missing');
  await recordsButton.click();

  await page.locator('h1', { hasText: '紀錄庫' }).waitFor({ state: 'visible', timeout: 10000 });
  const rows = page.locator('.record-list-row');
  if ((await rows.count()) === 0) {
    await page.locator('main button', { hasText: '工作紀錄' }).first().click();
    const recordPanel = page.locator('aside', { hasText: '專案紀錄' }).last();
    await recordPanel.waitFor({ state: 'visible', timeout: 10000 });
    const editor = recordPanel.locator('div[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.click();
    await page.keyboard.type('DEV-016 條列式紀錄庫瀏覽器驗證：確認摘要會出現在清單列中。');
    await recordPanel.locator('button', { hasText: '發布' }).last().click();
    await rows.first().waitFor({ state: 'visible', timeout: 10000 });
  }

  const openRecordPanel = page.locator('aside', { hasText: '專案紀錄' }).last();
  if ((await openRecordPanel.count()) > 0) {
    const closePanelButton = openRecordPanel.locator('button[title="關閉紀錄欄"]').last();
    if ((await closePanelButton.count()) > 0) {
      await closePanelButton.click();
      await openRecordPanel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    }
  }

  const rowCount = await rows.count();
  assert(rowCount > 0, 'records list should render at least one row');

  const firstRow = rows.first();
  const firstBox = await firstRow.boundingBox();
  assert(Boolean(firstBox), 'first row should have a bounding box');
  assert(firstBox.width > 800, 'record row should use the available list width', firstBox);
  assert(firstBox.height < 96, 'record row should be compact, not card-sized', firstBox);

  const headerText = await page.locator('text=摘要').count();
  assert(headerText > 0, 'list header should include summary column');

  const multiCardGridCount = await page.locator('.lg\\:grid-cols-2.xl\\:grid-cols-3').count();
  assert(multiCardGridCount === 0, 'card grid layout should not be present');

  await page.screenshot({ path: 'output/playwright/dev-016-records-list-view.png', fullPage: true });
  return {
    passed: true,
    rowCount,
    firstRow: firstBox,
    screenshot: 'output/playwright/dev-016-records-list-view.png',
  };
}
