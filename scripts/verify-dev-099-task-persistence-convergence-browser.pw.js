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
  const setPersistenceFault = (fault) => page.evaluate((value) => {
    localStorage.setItem('projed-local-test.taskPersistenceFault', value);
    localStorage.setItem('projed-local-test.taskPersistenceTrace', '[]');
  }, fault);
  const readPersistenceTrace = () => page.evaluate(() => (
    JSON.parse(localStorage.getItem('projed-local-test.taskPersistenceTrace') || '[]')
  ));
  const saveTitle = async (modal, nextTitle) => {
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.fill(`${nextTitle}   `);
    await titleInput.press('Enter');
  };
  const waitForSaveState = async (modal, state, timeout = 10000) => {
    await modal.locator(`[data-task-details-save-status="${state}"]`).waitFor({ state: 'visible', timeout });
  };
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
  const nextTitle = `DEV099 convergence ${Date.now().toString(36)}`;
  await saveTitle(modal, nextTitle);
  await page.waitForFunction(({ taskId, nextTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === nextTitle;
  }, { taskId, nextTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  assert(await modal.locator('[data-task-details-save-status="saving"]').count() === 0, 'saving must settle after local persistence');
  assert(await modal.locator('[data-task-details-save-status="unknown"]').count() === 0, 'successful save must not show unknown');
  await page.screenshot({ path: 'output/playwright/dev-099/task-details-saved-1440x900.png', fullPage: true });

  // B02: an explicit provider rejection must settle as failed, retain the
  // draft, and recover through the same Retry action without a second UI path.
  const rejectedTitle = `DEV099 rejected ${Date.now().toString(36)}`;
  await setPersistenceFault('reject-once');
  await saveTitle(modal, rejectedTitle);
  await waitForSaveState(modal, 'error');
  const rejectedTrace = await readPersistenceTrace();
  assert(rejectedTrace.length === 1, 'Enter+blur reject must issue exactly one provider attempt', { rejectedTrace });
  assert(await modal.locator('[data-task-details-save-retry="true"]').count() === 1, 'failed save must expose one Retry action');
  const rejectedNodes = await readNodes();
  assert(rejectedNodes[taskId]?.title !== rejectedTitle, 'rejected provider must not change canonical local readback');
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, rejectedTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === rejectedTitle;
  }, { taskId, rejectedTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');

  // B04: model a committed provider response that never resolves. The
  // bounded deadline must canonical-readback the committed value and settle
  // as saved instead of leaving a spinner or sending an unbounded retry.
  const responseLostTitle = `DEV099 response-lost ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-commit-once');
  await saveTitle(modal, responseLostTitle);
  await waitForSaveState(modal, 'saved', 20000);
  const responseLostTrace = await readPersistenceTrace();
  assert(responseLostTrace.length === 1, 'response-lost readback must not retry the provider operation', { responseLostTrace });
  const responseLostNodes = await readNodes();
  assert(responseLostNodes[taskId]?.title === responseLostTitle, 'committed response-lost readback must be canonical');
  assert(await modal.locator('[data-task-details-save-status="saving"]').count() === 0, 'response-lost flow must not remain saving');

  // B03: model a provider that never commits and never resolves. After the
  // deadline/readback window the UI must be failed (canonical mismatch) with
  // a retryable draft, never a permanent saving state or false success.
  const timeoutTitle = `DEV099 timeout ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-no-commit-once');
  await saveTitle(modal, timeoutTitle);
  await waitForSaveState(modal, 'error', 20000);
  const timeoutTraceBeforeRetry = await readPersistenceTrace();
  assert(timeoutTraceBeforeRetry.length === 1, 'timeout must issue one provider attempt before Retry', { timeoutTraceBeforeRetry });
  assert(await modal.locator('[data-task-details-save-retry="true"]').count() === 1, 'timeout mismatch must expose one Retry action');
  const timeoutNodes = await readNodes();
  assert(timeoutNodes[taskId]?.title !== timeoutTitle, 'uncommitted timeout must not report canonical success');
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, timeoutTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === timeoutTitle;
  }, { taskId, timeoutTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  const timeoutTraceAfterRetry = await readPersistenceTrace();
  assert(timeoutTraceAfterRetry.length === 2, 'Retry must create one new provider attempt', { timeoutTraceAfterRetry });

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
  const artifact = {
    id: 'CAPA-001 / DEV-099 / WP-099-D / browser',
    sourceRevision: 'production-base/13888b27221b4bf9214a5f78e00651a38f32c83f; candidate=codex/capa-001-dev099',
    generatedAt: new Date().toISOString(),
    runner: { node: 'v24.12.0', playwrightCli: '0.1.19' },
    taskId,
    originalTitle,
    savedTitle: nextTitle,
    faultCases: ['B01-success', 'B02-reject-retry', 'B03-timeout-no-commit-retry', 'B04-response-lost-readback'],
    providerAttemptCounts: {
      B02: rejectedTrace.length,
      B03BeforeRetry: timeoutTraceBeforeRetry.length,
      B03AfterRetry: timeoutTraceAfterRetry.length,
      B04: responseLostTrace.length,
    },
    cases: [
      { id: 'B01', status: 'PASS' },
      { id: 'B02', status: 'PASS' },
      { id: 'B03', status: 'PASS' },
      { id: 'B04', status: 'PASS' },
      { id: 'B12-390', status: 'PASS' },
      { id: 'B12-320', status: 'PASS' },
    ],
    failedCaseIds: [],
    scope: 'local-test candidate provider fault injection; no Supabase TEST or production mutation',
    diagnostics,
    viewports: ['1440x900', '390x844', '320x844'],
  };
  await page.evaluate((value) => { window.__DEV099_ARTIFACT = value; }, artifact);
  console.log(JSON.stringify(artifact, null, 2));
}
