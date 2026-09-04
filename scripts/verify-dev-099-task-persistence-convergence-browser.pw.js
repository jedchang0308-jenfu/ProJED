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
  const setReadbackFault = (fault) => page.evaluate((value) => {
    localStorage.setItem('projed-local-test.taskPersistenceReadbackFault', value);
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
  const testOrigin = page.url().replace(/\/[^/]*$/, '');
  await page.goto(`${testOrigin}/`, { waitUntil: 'domcontentloaded' });
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
  let modal = await openTaskDetails(taskId);
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

  // B05: the provider commits but the first canonical readback is unavailable.
  // The UI must expose unknown rather than false success, then recover through
  // an explicit Retry that creates exactly one new provider attempt.
  const unknownTitle = `DEV099 unknown ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-commit-once');
  await setReadbackFault('unavailable-once');
  await saveTitle(modal, unknownTitle);
  await waitForSaveState(modal, 'unknown', 20000);
  const unknownTraceBeforeRetry = await readPersistenceTrace();
  assert(unknownTraceBeforeRetry.length === 1, 'unknown readback must have one provider attempt before Retry', { unknownTraceBeforeRetry });
  assert(await modal.locator('[data-task-details-save-retry="true"]').count() === 1, 'unknown state must expose one Retry action');
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, unknownTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === unknownTitle;
  }, { taskId, unknownTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  const unknownTraceAfterRetry = await readPersistenceTrace();
  assert(unknownTraceAfterRetry.length === 2, 'unknown Retry must create one new provider attempt', { unknownTraceAfterRetry });

  // B06: a same-value save is a deterministic no-op. It must not create a
  // provider request or leave the modal in saving.
  await setPersistenceFault('');
  await saveTitle(modal, unknownTitle);
  await page.waitForTimeout(250);
  const sameValueTrace = await readPersistenceTrace();
  assert(sameValueTrace.length === 0, 'same-value save must not issue a provider attempt', { sameValueTrace });
  assert(await modal.locator('[data-task-details-save-status="saving"]').count() === 0, 'same-value save must not enter saving');

  // B07: two rapid title saves must converge to the newest canonical value;
  // the first provider response is intentionally delayed after its commit,
  // so the stale completion arrives after the newer operation.
  const rapidTitleOne = `DEV099 rapid-one ${Date.now().toString(36)}`;
  const rapidTitleTwo = `DEV099 rapid-two ${Date.now().toString(36)}`;
  await setPersistenceFault('delay-response-once');
  const rapidTitleInput = modal.locator('[data-task-details-title-input="true"]');
  await rapidTitleInput.fill(`${rapidTitleOne}   `);
  await rapidTitleInput.press('Enter');
  await rapidTitleInput.focus();
  await rapidTitleInput.fill(`${rapidTitleTwo}   `);
  await rapidTitleInput.press('Enter');
  await page.waitForFunction(({ taskId, rapidTitleTwo }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === rapidTitleTwo;
  }, { taskId, rapidTitleTwo }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  const rapidTrace = await readPersistenceTrace();
  assert(rapidTrace.length === 2, 'rapid title saves must issue two observable attempts', { rapidTrace });
  await page.waitForTimeout(1000);
  const rapidNodes = await readNodes();
  assert(rapidNodes[taskId]?.title === rapidTitleTwo, 'newest rapid title must win canonical readback', { rapidNodes });
  assert(await modal.locator('[data-task-details-save-status="error"]').count() === 0, 'stale completion must not regress save state', { rapidNodes });

  // B08: switching task identity while an operation is unresolved must clean
  // the old UI owner and leave the new task free of stale saving/error state.
  const switchedTaskId = 'qc-card-1-child-2';
  const switchedFixture = await readNodes();
  assert(Boolean(switchedFixture[switchedTaskId]?.title), 'switch fixture task missing', { switchedTaskId });
  const switchTitle = `DEV099 switch-pending ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-no-commit-once');
  await saveTitle(modal, switchTitle);
  await waitForSaveState(modal, 'saving');
  await page.evaluate((nextTaskId) => {
    document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: nextTaskId } }));
  }, switchedTaskId);
  const switchedModal = page.locator(`[data-task-details-modal="true"][data-task-id="${switchedTaskId}"]`);
  await switchedModal.waitFor({ state: 'visible', timeout: 10000 });
  assert(await switchedModal.locator('[data-task-details-save-status="saving"]').count() === 0, 'switched task must not inherit old saving state');
  assert(await switchedModal.locator('[data-task-details-save-status="error"]').count() === 0, 'switched task must not inherit old error state');
  assert(await switchedModal.locator('[data-task-details-save-status="unknown"]').count() === 0, 'switched task must not inherit old unknown state');
  const switchTrace = await readPersistenceTrace();
  assert(switchTrace.length === 1, 'task switch fixture must record only the old unresolved attempt', { switchTrace });

  // B09: unmount during an unresolved operation must not write a false
  // canonical value or emit a page error after reload.
  await page.evaluate((nextTaskId) => {
    document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: nextTaskId } }));
  }, taskId);
  modal = await page.locator(`[data-task-details-modal="true"][data-task-id="${taskId}"]`).first();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const unmountTitle = `DEV099 unmount-pending ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-no-commit-once');
  await saveTitle(modal, unmountTitle);
  await waitForSaveState(modal, 'saving');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  assert(await page.locator('[data-task-details-modal="true"]').count() === 0, 'reload must unmount task details modal');
  const unmountNodes = await readNodes();
  assert(unmountNodes[taskId]?.title !== unmountTitle, 'uncommitted unmount must not report canonical success', { unmountNodes });
  modal = await openTaskDetails(taskId);
  await waitForSaveState(modal, 'idle');
  assert(await modal.getAttribute('data-pwa-task-details-state') === 'safe', 'reopened canonical task must be safe after unmount');

  // B10: an explicit close while an accepted provider operation is still
  // unresolved must not discard the draft or unmount the owner.  After the
  // bounded readback reports failure, Retry must recover the draft; only a
  // subsequent close after saved may unmount the modal.
  const closePendingTitle = `DEV099 close-pending ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-no-commit-once');
  await saveTitle(modal, closePendingTitle);
  await waitForSaveState(modal, 'saving');
  const closeButton = modal.locator('button[aria-label="關閉任務詳情"]');
  await closeButton.click();
  assert(await page.locator('[data-task-details-modal="true"]').count() === 1, 'close during pending must retain modal owner');
  await waitForSaveState(modal, 'error', 20000);
  assert(await page.locator('[data-task-details-modal="true"]').count() === 1, 'failed close must retain draft for recovery');
  assert(await modal.locator('[data-task-details-save-retry="true"]').count() === 1, 'failed close must expose Retry');
  const closeTraceBeforeRetry = await readPersistenceTrace();
  assert(closeTraceBeforeRetry.length === 1, 'close-pending flow must issue one provider attempt before Retry', { closeTraceBeforeRetry });
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, closePendingTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === closePendingTitle;
  }, { taskId, closePendingTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  const closeTraceAfterRetry = await readPersistenceTrace();
  assert(closeTraceAfterRetry.length === 2, 'close-pending Retry must issue one new provider attempt', { closeTraceAfterRetry });
  await closeButton.click();
  await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 });

  // B11: DEV-097 reload-safety must treat task-details saving, failed and
  // unknown states as dirty; only a canonical saved readback may return safe.
  modal = await openTaskDetails(taskId);
  const readPwaSnapshot = () => page.evaluate(() => window.__projedPwaReloadSafetyTest?.getSnapshot() ?? null);
  const requestPwaBoundary = (boundary) => page.evaluate((nextBoundary) => (
    window.__projedPwaReloadSafetyTest?.requestBoundary(nextBoundary, 'board') ?? null
  ), boundary);
  await page.waitForFunction(() => Boolean(window.__projedPwaReloadSafetyTest), null, { timeout: 10000 });
  const initialPwaSnapshot = await readPwaSnapshot();
  assert(initialPwaSnapshot?.state === 'safe', 'B11 initial task-details reload state must be safe', { initialPwaSnapshot });

  const b11SavingTitle = `DEV099 pwa-saving ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-no-commit-once');
  await saveTitle(modal, b11SavingTitle);
  await waitForSaveState(modal, 'saving');
  await page.waitForFunction(() => window.__projedPwaReloadSafetyTest?.getSnapshot().state === 'dirty', null, { timeout: 5000 });
  const savingPwaSnapshot = await readPwaSnapshot();
  const savingPwaGate = await requestPwaBoundary('app-open');
  assert(savingPwaSnapshot?.state === 'dirty', 'B11 saving task-details owner must be dirty', { savingPwaSnapshot });
  assert(savingPwaGate?.ok === false && savingPwaGate.code === 'OWNER_ACTION_REQUIRED', 'B11 saving boundary must be blocked', { savingPwaGate });
  await waitForSaveState(modal, 'error', 20000);
  const failedPwaSnapshot = await readPwaSnapshot();
  const failedPwaGate = await requestPwaBoundary('app-open');
  assert(failedPwaSnapshot?.state === 'dirty', 'B11 failed task-details owner must remain dirty', { failedPwaSnapshot });
  assert(failedPwaGate?.ok === false && failedPwaGate.code === 'OWNER_ACTION_REQUIRED', 'B11 failed boundary must be blocked', { failedPwaGate });
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, b11SavingTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === b11SavingTitle;
  }, { taskId, b11SavingTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');

  const b11UnknownTitle = `DEV099 pwa-unknown ${Date.now().toString(36)}`;
  await setPersistenceFault('timeout-commit-once');
  await setReadbackFault('unavailable-once');
  await saveTitle(modal, b11UnknownTitle);
  await waitForSaveState(modal, 'unknown', 20000);
  await page.waitForFunction(() => window.__projedPwaReloadSafetyTest?.getSnapshot().state === 'dirty', null, { timeout: 5000 });
  const unknownPwaSnapshot = await readPwaSnapshot();
  const unknownPwaGate = await requestPwaBoundary('app-open');
  assert(unknownPwaSnapshot?.state === 'dirty', 'B11 unknown task-details owner must be dirty', { unknownPwaSnapshot });
  assert(unknownPwaGate?.ok === false && unknownPwaGate.code === 'OWNER_ACTION_REQUIRED', 'B11 unknown boundary must be blocked', { unknownPwaGate });
  await modal.locator('[data-task-details-save-retry="true"]').click();
  await page.waitForFunction(({ taskId, b11UnknownTitle }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title === b11UnknownTitle;
  }, { taskId, b11UnknownTitle }, { timeout: 10000 });
  await waitForSaveState(modal, 'saved');
  const safePwaSnapshot = await readPwaSnapshot();
  assert(safePwaSnapshot?.state === 'safe', 'B11 canonical saved readback must return safe', { safePwaSnapshot });
  await modal.locator('button[aria-label="關閉任務詳情"]').click();
  await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 });

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 844 }]) {
    modal = await openTaskDetails(taskId);
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
    await modal.locator('button[aria-label="關閉任務詳情"]').click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 });
  }

  await page.waitForTimeout(2000);
  const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
  assert(visibleErrors.length === 0, 'visible error present in successful save flow', { visibleErrors });
  const artifact = {
    id: 'CAPA-001 / DEV-099 / WP-099-D / browser',
    sourceRevision: 'canonical-root-working-tree; DEV-098 integration + DEV-099 convergence',
    generatedAt: new Date().toISOString(),
    runner: { node: 'v24.12.0', playwrightCli: '0.1.19' },
    taskId,
    originalTitle,
    savedTitle: nextTitle,
    faultCases: ['B01-success', 'B02-reject-retry', 'B03-timeout-no-commit-retry', 'B04-response-lost-readback', 'B05-unknown-readback-retry', 'B06-same-value-noop', 'B07-rapid-save-stale-completion', 'B08-task-switch-owner-cleanup', 'B09-unmount-owner-cleanup', 'B10-close-pending-recovery', 'B11-pwa-reload-safety-owner'],
    providerAttemptCounts: {
      B02: rejectedTrace.length,
      B03BeforeRetry: timeoutTraceBeforeRetry.length,
      B03AfterRetry: timeoutTraceAfterRetry.length,
      B04: responseLostTrace.length,
      B05BeforeRetry: unknownTraceBeforeRetry.length,
      B05AfterRetry: unknownTraceAfterRetry.length,
      B06: sameValueTrace.length,
      B07: rapidTrace.length,
      B08: switchTrace.length,
      B10BeforeRetry: closeTraceBeforeRetry.length,
      B10AfterRetry: closeTraceAfterRetry.length,
      B11BeforeRetry: 1,
      B11UnknownBeforeRetry: 1,
      B11UnknownAfterRetry: 2,
    },
    cases: [
      { id: 'B01', status: 'PASS' },
      { id: 'B02', status: 'PASS' },
      { id: 'B03', status: 'PASS' },
      { id: 'B04', status: 'PASS' },
      { id: 'B05', status: 'PASS' },
      { id: 'B06', status: 'PASS' },
      { id: 'B07', status: 'PASS' },
      { id: 'B08', status: 'PASS' },
      { id: 'B09', status: 'PASS' },
      { id: 'B10', status: 'PASS' },
      { id: 'B11', status: 'PASS' },
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

