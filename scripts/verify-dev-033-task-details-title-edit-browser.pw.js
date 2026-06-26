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
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(18);
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openTaskDetails = async (taskId) => {
    const task = page.locator(`[data-task-id="${taskId}"]`).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    await task.scrollIntoViewIfNeeded();
    const title = task.locator('.task-title-text').first();
    if (await title.count()) {
      await title.click();
    } else {
      await task.click({ position: { x: 90, y: 18 } });
    }
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, 'modal should open the requested task', { taskId, modalTaskId });
    return modal;
  };

  const readStoredTitle = async (taskId) => page.evaluate((taskId) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title || '';
  }, taskId);

  let step = 'open-app';
  try {
    await openApp();
    const taskId = 'qc-card-1-child-1';
    const originalTitle = await readStoredTitle(taskId);
    assert(Boolean(originalTitle), 'test task should have an original title', { taskId, originalTitle });

    step = 'enter saves title';
    const modal = await openTaskDetails(taskId);
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    const savedTitle = `DEV033 modal rename ${Date.now().toString(36)}`;
    await titleInput.fill(`${savedTitle}   `);
    await titleInput.press('Enter');
    await page.waitForFunction(({ taskId, savedTitle }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes[taskId]?.title === savedTitle;
    }, { taskId, savedTitle }, { timeout: 10000 });
    const inputValueAfterSave = await titleInput.inputValue();
    assert(inputValueAfterSave === savedTitle, 'modal title input should show trimmed saved title', { inputValueAfterSave, savedTitle });

    step = 'escape reverts title without closing modal';
    await titleInput.fill('should not save');
    await titleInput.press('Escape');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const valueAfterEscape = await titleInput.inputValue();
    const storedTitleAfterEscape = await readStoredTitle(taskId);
    assert(valueAfterEscape === savedTitle, 'Escape in title input should revert to current task title', { valueAfterEscape, savedTitle });
    assert(storedTitleAfterEscape === savedTitle, 'Escape in title input should not persist draft title', { storedTitleAfterEscape, savedTitle });
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
