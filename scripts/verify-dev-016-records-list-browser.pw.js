/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const testAccount = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: '本機測試擁有者',
    createdAt: 1704067200000,
  };

  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
  }, testAccount);
  await page.reload({ waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1365, height: 768 });

  if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
    await page.locator('button', { hasText: '使用固定測試環境' }).click();
    await page.waitForTimeout(700);
  }

  const sidebarExpandButton = page.locator('button[aria-label="展開工作區選單"]');
  if (await sidebarExpandButton.count()) {
    await sidebarExpandButton.click();
  }
  const recordsButton = page.locator('button', { hasText: '紀錄庫' }).first();
  await recordsButton.waitFor({ state: 'visible', timeout: 10000 });
  assert((await recordsButton.count()) === 1, 'records mode button missing');
  await recordsButton.click();

  const meetingSectionTab = page.locator('[data-record-section-tab="meeting"]');
  if (await meetingSectionTab.count()) {
    await meetingSectionTab.click();
  } else {
    await page.locator('[data-record-section-tab="work_log"]').click();
  }
  await page.locator('h1.sr-only', { hasText: '紀錄庫' }).waitFor({ state: 'attached', timeout: 10000 });
  const libraryHeading = page.locator('h1', { hasText: '紀錄庫' }).first();
  assert(await libraryHeading.count() === 1, 'records view should keep a semantic library heading');
  assert((await libraryHeading.getAttribute('class'))?.split(/\s+/).includes('sr-only') === true, 'library heading should be screen-reader-only');
  assert(await page.getByRole('button', { name: '補一筆會後紀錄', exact: true }).count() === 0, 'redundant library add-record action should be removed');
  const rows = page.locator('.record-list-row');
  if ((await rows.count()) === 0) {
    await page.locator('button', { hasText: '新增會議記錄' }).first().click();
    const recordPanel = page.locator('[data-record-composer-shell="true"]').last();
    await recordPanel.waitFor({ state: 'visible', timeout: 10000 });
    const titleInput = recordPanel.locator('[data-record-title-input]').first();
    await titleInput.fill('DEV-016 條列式紀錄庫瀏覽器驗證');
    const editor = recordPanel.locator('div[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.click();
    await page.keyboard.type('DEV-016 條列式紀錄庫瀏覽器驗證：確認摘要會出現在清單列中。');
    const publishStep = recordPanel.locator('button[data-meeting-workflow-step="published"]');
    await publishStep.waitFor({ state: 'visible', timeout: 10000 });
    await publishStep.click();
    await page.waitForTimeout(500);
    await recordsButton.click();
    await page.locator('[data-record-section-tab="meeting"]').click();
    await rows.first().waitFor({ state: 'visible', timeout: 10000 });
  }

  await page.locator('[data-record-list="true"]').waitFor({ state: 'visible', timeout: 10000 });

  const openRecordPanel = page.locator('[data-record-composer-shell="true"]').last();
  if ((await openRecordPanel.count()) > 0) {
    const closePanelButton = openRecordPanel.locator('button[aria-label="離開紀錄"], button[title="關閉紀錄欄"]').last();
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
  const listHeader = page.locator('[data-record-list="true"] > div').first();
  assert(await listHeader.getByText('任務', { exact: true }).count() === 0, 'task count column should be removed');
  assert(await firstRow.locator(':scope > span').count() === 3, 'record row should contain only record, summary, and status cells');
  assert(await firstRow.locator(':scope > span').nth(2).getByText('會議紀錄', { exact: true }).count() === 0, 'record type label should be removed from status cell');

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
