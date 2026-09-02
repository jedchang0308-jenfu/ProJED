/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const diagnostics = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`${message.type()}:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const readNodes = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
  const openTaskDetails = async (taskId) => {
    const task = page.locator(`[data-task-id="${taskId}"]`).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    await task.locator('.task-title-text').first().click().catch(() => task.click({ position: { x: 90, y: 18 } }));
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    assert(await modal.getAttribute('data-task-id') === taskId, 'wrong task details identity');
    return modal;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4010/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((currentAccount) => {
    localStorage.setItem('projed-local-test.selected-account', currentAccount.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(currentAccount));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    window.__PROJED_QC__?.reset(18);
    localStorage.setItem('projed-last-view', 'board');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });

  const taskId = 'qc-card-1-child-1';
  const before = await readNodes();
  const originalTitle = before[taskId]?.title;
  assert(Boolean(originalTitle), 'fixture task missing', { taskId });
  const modal = await openTaskDetails(taskId);
  const title = modal.locator('[data-task-details-title-input="true"]');
  const nextTitle = `DEV099 convergence ${Date.now().toString(36)}`;
  await title.fill(`${nextTitle}   `);
  await title.press('Enter');
  await page.waitForFunction(({ taskId, nextTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === nextTitle;
  }, { taskId, nextTitle }, { timeout: 10000 });
  await modal.locator('[data-task-details-save-status="saved"]', { hasText: '已儲存' }).waitFor({ state: 'visible', timeout: 10000 });
  assert(await modal.locator('[data-task-details-save-status="saving"]').count() === 0, 'saving must settle after local persistence');
  assert(await modal.locator('[data-task-details-save-status="unknown"]').count() === 0, 'successful save must not show unknown');
  await page.screenshot({ path: 'output/playwright/dev-099/task-details-saved-1440x900.png', fullPage: true });

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const geometry = await modal.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert(geometry.left >= 0 && geometry.right <= geometry.viewportWidth, 'modal overflows viewport', { viewport, geometry });
    assert(geometry.documentWidth <= geometry.viewportWidth, 'modal introduces horizontal overflow', { viewport, geometry });
    await page.screenshot({ path: `output/playwright/dev-099/task-details-saved-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }

  const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
  assert(visibleErrors.length === 0, 'visible error present in successful save flow', { visibleErrors });
  console.log(JSON.stringify({
    id: 'CAPA-001 / DEV-099 / WP-099-D / browser',
    taskId,
    originalTitle,
    savedTitle: nextTitle,
    diagnostics,
    viewports: ['1440x900', '390x844', '320x844'],
  }, null, 2));
}
