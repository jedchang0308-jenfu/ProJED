/* eslint-disable */
async (page) => {
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((session) => {
    localStorage.setItem('projed-local-test.selected-account', session.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      createdAt: session.createdAt,
    }));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });

  const workspaceTitle = page.locator('[data-sidebar-workspace-title]').first();
  if (await workspaceTitle.count() === 0) {
    await page.locator('[data-main-sidebar-toggle="true"]').click();
  }
  await workspaceTitle.waitFor({ state: 'visible', timeout: 15000 });
  const openWorkspaceDeleteDialog = async () => {
    await workspaceTitle.click({ button: 'right' });
    const contextMenu = page.locator('[data-global-context-menu="true"]');
    await contextMenu.waitFor({ state: 'visible', timeout: 10000 });
    await contextMenu.getByText('刪除工作區', { exact: true }).click();
  };
  await openWorkspaceDeleteDialog();

  const dialog = page.locator('[data-global-dialog="true"]');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(100);
  const decisions = dialog.locator('[data-global-dialog-decision="true"]');
  assert(await decisions.count() === 2, 'confirm dialog must expose Cancel and Confirm decision buttons');
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute('data-global-dialog-decision-index')) === '1',
    'confirm dialog must focus Confirm by default',
  );

  await page.keyboard.press('ArrowLeft');
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute('data-global-dialog-decision-index')) === '0',
    'ArrowLeft must select Cancel from the default Confirm button',
  );
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });

  // Reopen the same shared dialog and verify circular navigation in the opposite direction.
  await openWorkspaceDeleteDialog();
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute('data-global-dialog-decision-index')) === '1',
    'ArrowRight must wrap back to Confirm after Cancel',
  );
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });

  return {
    status: 'PASS',
    viewport: '1440x900',
    dialog: 'shared GlobalDialog confirm',
    defaultFocus: '確認',
    leftEnter: '取消 / dialog closed without deleting',
    circularNavigation: 'ArrowLeft then ArrowRight restored 確認',
  };
}
