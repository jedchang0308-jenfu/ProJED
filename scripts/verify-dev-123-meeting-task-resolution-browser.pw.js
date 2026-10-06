/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-123-meeting-task-resolution';
  const result = { devId: 'DEV-123', status: 'FAIL', cases: [], screenshots: [], browserErrors: [], httpFailures: [], runtime: { port: 4000, reused: true, cleaned: false, portReleased: false } };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, ok, details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 500 && !response.url().includes('favicon')) result.httpFailures.push({ status: response.status(), url: response.url() }); });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    // New Playwright sessions do not inherit the desktop smoke-test session.
    // Use the app's fixed local test environment so this verifier remains
    // black-box and does not write auth fixtures through page.evaluate.
    const loginButton = page.getByRole('button', { name: /使用固定測試環境/ }).first();
    if (await loginButton.count() && await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    }
    const openMeeting = page.getByRole('button', { name: '新增會議記錄', exact: true });
    await openMeeting.waitFor({ state: 'visible' });
    await openMeeting.click();
    const controls = page.locator('[data-meeting-recording-controls="true"]');
    await controls.waitFor({ state: 'visible' });
    const startButton = page.getByRole('button', { name: '開始收音', exact: true });
    record('B01', await controls.isVisible() && await startButton.isVisible() && await startButton.isEnabled(), { controlVisible: await controls.isVisible(), startVisible: await startButton.isVisible(), startEnabled: await startButton.isEnabled() });
    record('B02', await controls.getAttribute('data-meeting-recording-state') === 'safe', { state: await controls.getAttribute('data-meeting-recording-state') });
    record('B03', await page.getByText('鼠標停留只作輔助證據', { exact: false }).isVisible(), { pointerHintVisible: await page.getByText('鼠標停留只作輔助證據', { exact: false }).isVisible() });
    await page.screenshot({ path: `${outputDir}/meeting-recording-control.png`, fullPage: false });
    result.screenshots.push(`${outputDir}/meeting-recording-control.png`);
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
  }
  result.failures = failures;
  await page.evaluate(({ result, outputDir }) => { window.__DEV123_ARTIFACT = result; window.__DEV123_ARTIFACT_PATH = outputDir; }, { result, outputDir });
  if (failures.length) throw new Error(`DEV-123 browser verification failed: ${failures.join(', ')} | ${JSON.stringify(result.cases)}${result.browserErrors.length ? ` | ${result.browserErrors.join(' | ')}` : ''}`);
}
