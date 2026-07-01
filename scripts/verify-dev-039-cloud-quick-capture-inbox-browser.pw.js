/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4173/?qcReset=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body', { timeout: 15000 });
  const fixedTestLogin = page.locator('button', { hasText: '使用固定測試環境' }).first();
  if (await fixedTestLogin.count()) {
    await fixedTestLogin.click();
    await page.waitForTimeout(750);
  }

  const taskZoneEntry = page.locator('[data-sidebar-task-zone="true"]').first();
  await taskZoneEntry.waitFor({ state: 'visible', timeout: 10000 });

  const bodyText = await page.locator('body').innerText();
  assert(bodyText.includes('任務專區'), 'DEV-039 superseded workflow should expose 任務專區 primary entry', { bodyText });
  assert(!bodyText.includes('收件匣') && !bodyText.includes('Inbox'), 'Superseded quick memo workflow should not expose inbox naming', { bodyText });

  const legacyShellCount = await page.locator('[data-quick-capture-shell]').count();
  assert(legacyShellCount === 0, 'QuickCaptureShell should not be mounted as the primary App flow after DEV-040', { legacyShellCount });

  await taskZoneEntry.click();
  await page.locator('[data-task-zone-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-task-zone-title-input="true"]').waitFor({ state: 'visible', timeout: 10000 });

  console.log('DEV-039 browser smoke passed as DEV-040 superseded workflow.');
}
