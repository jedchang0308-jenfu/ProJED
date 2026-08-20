/* eslint-disable */
async (page) => {
  const diagnostics = [];
  const httpFailures = [];
  const appBaseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:4000';
  const screenshotBase = 'output/playwright/dev-069';
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) httpFailures.push(`${response.status()} ${response.url()}`);
  });

  const seedTestSession = async () => {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: 'local-test-user',
        email: 'test@projed.local',
        displayName: 'ProJED local QA',
        createdAt: 1704067200000,
      }));
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: '新增會議記錄' }).waitFor({ state: 'visible', timeout: 15000 });
  };

  const visibleErrorSweep = async (label) => {
    const state = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const alerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
        .filter(visible)
        .map(element => (element.textContent || '').trim())
        .filter(Boolean);
      return {
        alerts,
        bodyError: /HTTP\s+[45]\d\d|Internal Server Error|Unexpected token/i.test(document.body.innerText),
        consoleErrorCount: 0,
      };
    });
    assert(state.alerts.length === 0 && !state.bodyError, `${label} visible error sweep failed`, state);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appBaseUrl}/`, { waitUntil: 'domcontentloaded' });
  await seedTestSession();
  await page.screenshot({ path: `${screenshotBase}/browser-1440-before-reload.png`, scale: 'css' });

  await page.getByRole('button', { name: '新增會議記錄' }).click();
  const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
  await editor.fill('DEV-069 F5 後仍保留的會議速記');
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-meeting-draft-recovery-status]');
    return Boolean(status && /本機已保存|本機部分保存/.test(status.textContent || ''));
  }, null, { timeout: 5000 });
  const emergencyKeysBeforeReload = await page.evaluate(() =>
    Object.keys(sessionStorage).filter(key => key.startsWith('projed:meeting-draft-recovery:v1:')));
  assert(emergencyKeysBeforeReload.length === 1, 'sessionStorage emergency recovery snapshot was not written', { emergencyKeysBeforeReload });
  await visibleErrorSweep('desktop before reload');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('DEV-069 F5 後仍保留的會議速記').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: `${screenshotBase}/browser-1440-after-reload.png`, scale: 'css' });
  await visibleErrorSweep('desktop after reload');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  assert(await page.locator('[data-record-composer-shell]').isVisible(), 'meeting editor should remain available at 1024px');
  assert(await page.locator('[data-meeting-draft-recovery-status]').isVisible(), 'desktop recovery status should be visible at 1024px');
  await page.screenshot({ path: `${screenshotBase}/browser-1024.png`, scale: 'css' });
  await visibleErrorSweep('desktop 1024');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileState = await page.evaluate(() => ({
    meetingEntry: Array.from(document.querySelectorAll('button')).some(button => (button.textContent || '').includes('新增會議記錄')),
    meetingShell: Boolean(document.querySelector('[data-record-composer-shell]')),
    recoveryStatus: Boolean(document.querySelector('[data-meeting-draft-recovery-status]')),
    meetingWorkflow: document.body.innerText.includes('會議流程'),
  }));
  assert(!mobileState.meetingEntry && !mobileState.meetingShell && !mobileState.recoveryStatus && !mobileState.meetingWorkflow,
    'mobile must not expose meeting record UI', mobileState);
  await page.screenshot({ path: `${screenshotBase}/browser-390-negative.png`, scale: 'css' });
  await visibleErrorSweep('mobile 390');

  assert(diagnostics.length === 0, 'browser console/page errors detected', { diagnostics });
  assert(httpFailures.length === 0, 'browser HTTP failures detected', { httpFailures });
  console.log('DEV-069 browser verification passed: local recovery after reload, desktop 1440/1024 status, mobile 390 negative boundary and visible-error sweep.');
}
