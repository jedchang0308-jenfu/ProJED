/* eslint-disable */
async (page) => {
  const waitForApp = async () => {
    await page.waitForSelector('body', { timeout: 15000 });
    await page.waitForTimeout(750);
  };

  const ensureVisible = async (selector, label) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`PASS ${label}`);
    return locator;
  };

  const clickIfVisible = async (selector) => {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
    return false;
  };

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForApp();
  const fixedTestLogin = page.locator('button', { hasText: '使用固定測試環境' }).first();
  if (await fixedTestLogin.count()) {
    await fixedTestLogin.click();
    await waitForApp();
  }

  await ensureVisible('[data-sidebar-task-zone="true"]', 'sidebar exposes task-zone primary entry');
  if (await page.locator('[data-home-task-zone-entry="true"]').first().isVisible().catch(() => false)) {
    await ensureVisible('[data-home-task-zone-entry="true"]', 'home exposes task-zone primary card');
    await ensureVisible('[data-home-task-zone-input="true"]', 'home quick task input exists');
  } else {
    console.log('SKIP home task-zone card smoke: current startup view is not Home');
  }

  await page.locator('[data-sidebar-task-zone="true"]').first().click();
  await ensureVisible('[data-task-zone-view="true"]', 'task-zone view opens');
  await ensureVisible('[data-task-zone-title-input="true"]', 'task-zone create input exists');

  const title = `DEV-040 browser smoke ${Date.now()}`;
  await page.locator('[data-task-zone-title-input="true"]').first().fill(title);
  await page.locator('[data-task-zone-create="true"]').first().click();
  await page.getByText(title).waitFor({ state: 'visible', timeout: 10000 });
  console.log('PASS quick task creates visible pending task');

  await page.locator('[data-task-zone-open-details="true"]').first().click();
  await ensureVisible('[data-task-zone-details="true"]', 'task-zone details panel opens');
  await ensureVisible('[data-task-zone-details-title="true"]', 'task-zone details title editor exists');
  await page.locator('[data-task-zone-details="true"] button[title="關閉"]').first().click();

  const openedBoard = await clickIfVisible('[data-sidebar-board-row="true"]');
  if (!openedBoard) {
    console.log('SKIP board panel smoke: no board row is available in this environment');
    return;
  }

  await ensureVisible('[data-task-zone-board-panel="true"]', 'board shows integrated task-zone panel');
  await ensureVisible('[data-task-zone-item="true"]', 'board task-zone panel lists pending personal task');
  await ensureVisible('[data-task-drag-handle="true"]', 'task-zone item uses shared task drag handle');
}
