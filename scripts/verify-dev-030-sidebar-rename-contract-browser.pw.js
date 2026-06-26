/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
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

    if (await page.locator('[data-sidebar-workspace-title="true"]').count() === 0) {
      await page.getByTitle('展開工作區選單').click();
    }
    await page.locator('[data-sidebar-workspace-title="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-sidebar-board-title="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const assertNoRenameInputs = async (label) => {
    const workspaceInputs = await page.locator('input[aria-label="編輯工作區名稱"]').count();
    const boardInputs = await page.locator('input[aria-label="編輯看板名稱"]').count();
    assert(workspaceInputs === 0 && boardInputs === 0, `${label} should not leave rename inputs open`, {
      workspaceInputs,
      boardInputs,
    });
  };

  const cancelRename = async (selector) => {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 });
  };

  const commitRenameWithoutChange = async (selector) => {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 });
  };

  let step = 'open-app';
  try {
    await openApp();

    step = 'workspace-click-no-rename';
    const workspaceTitle = page.locator('[data-sidebar-workspace-title="true"]').first();
    await workspaceTitle.click();
    await page.waitForTimeout(150);
    await assertNoRenameInputs(step);

    step = 'workspace-context-menu-rename';
    await workspaceTitle.click({ button: 'right' });
    await page.getByText('重新命名工作區', { exact: true }).click();
    await cancelRename('input[aria-label="編輯工作區名稱"]');
    await assertNoRenameInputs(step);

    step = 'workspace-f2-rename';
    await workspaceTitle.focus();
    await page.keyboard.press('F2');
    await commitRenameWithoutChange('input[aria-label="編輯工作區名稱"]');
    await assertNoRenameInputs(step);

    step = 'board-click-no-rename';
    const boardTitle = page.locator('[data-sidebar-board-title="true"]').first();
    await boardTitle.click();
    await page.waitForTimeout(200);
    await assertNoRenameInputs(step);

    step = 'board-context-menu-rename';
    await boardTitle.click({ button: 'right' });
    await page.getByText('重新命名看板', { exact: true }).click();
    await cancelRename('input[aria-label="編輯看板名稱"]');
    await assertNoRenameInputs(step);

    step = 'board-f2-rename';
    const boardRow = page.locator('[data-sidebar-board-row="true"]').first();
    await boardRow.focus();
    await page.keyboard.press('F2');
    await commitRenameWithoutChange('input[aria-label="編輯看板名稱"]');
    await assertNoRenameInputs(step);
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
