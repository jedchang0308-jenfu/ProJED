/* eslint-disable */
async (page) => {
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
    localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-user', email: 'test@projed.local', displayName: '本機測試擁有者', createdAt: 1704067200000 }));
    localStorage.setItem('projed-last-view', 'board');
  });
  await page.goto('http://localhost:4000/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  const card = page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first();
  await card.click();
  const trigger = page.locator('[data-task-details-overflow-trigger="true"]');
  await trigger.waitFor({ state: 'visible', timeout: 10000 });
  const before = await page.locator('[data-task-collection-open="true"]').count();
  await trigger.click();
  const item = page.locator('[data-task-details-overflow-menu="true"] [data-task-collection-open="true"]');
  await item.waitFor({ state: 'visible', timeout: 10000 });
  const menu = await page.locator('[data-task-details-overflow-menu="true"]').innerText();
  await item.click();
  await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
  const result = { before, menu, dialog: await page.locator('[data-task-collection-dialog="true"]').getAttribute('data-task-collection-dialog-state') };
  await page.locator('[data-task-collection-dialog="true"] button').filter({ hasText: '取消' }).click();
  return result;
}
