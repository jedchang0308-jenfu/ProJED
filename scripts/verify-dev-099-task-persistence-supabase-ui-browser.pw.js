/* eslint-disable */
async (page) => {
  const fixture = {
    projectName: null,
    taskId: null,
    taskTitle: null,
  };
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [], patchResponses: [] };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message.slice(0, 300)));
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url().slice(0, 180), failure: request.failure()?.errorText || null }));
  page.on('response', response => {
    const request = response.request();
    if (request.method() === 'PATCH' && response.url().includes('/rest/v1/wbs_items')) diagnostics.patchResponses.push({ status: response.status(), ok: response.ok() });
  });
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const initialUrl = page.url();
  const baseUrl = initialUrl.startsWith('http://127.0.0.1:4014/')
    ? 'http://127.0.0.1:4014/'
    : initialUrl.startsWith('http://127.0.0.1:4013/')
      ? 'http://127.0.0.1:4013/'
      : 'http://127.0.0.1:4012/';
  const boardUrl = `${baseUrl}${initialUrl.split('?')[1] ? `?${initialUrl.split('?')[1]}` : ''}`;
  const fixtureQuery = new Map((boardUrl.split('?')[1] || '').split('&').filter(Boolean).map(pair => {
    const [key, value = ''] = pair.split('=');
    return [decodeURIComponent(key), decodeURIComponent(value)];
  }));
  const fixtureToken = fixtureQuery.get('dev099Fixture') || '';
  const [configuredProjectName, configuredTaskId] = fixtureToken.split('|').map(value => value || null);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(boardUrl, { waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 20000 });
  const currentBoardHeading = configuredProjectName
    ? page.getByRole('heading', { level: 1, name: configuredProjectName }).first()
    : page.getByRole('heading', { level: 1 }).filter({ hasText: /^CAPA-001-TEST-.* Board/ }).first();
  const overviewBoardHeading = configuredProjectName
    ? page.getByRole('heading', { level: 4, name: configuredProjectName }).first()
    : page.getByRole('heading', { level: 4 }).filter({ hasText: /^CAPA-001-TEST-.* Board/ }).first();
  if (!(await currentBoardHeading.count()) && !(await overviewBoardHeading.count())) {
    const expandWorkspace = page.getByRole('button', { name: '展開工作區選單' });
    if (await expandWorkspace.count()) await expandWorkspace.click();
  }
  const boardButton = configuredProjectName
    ? page.locator('button').filter({ hasText: configuredProjectName }).first()
    : page.locator('button').filter({ hasText: /^CAPA-001-TEST-.* Board/ }).first();
  if (await currentBoardHeading.count()) {
    fixture.projectName = (await currentBoardHeading.innerText()).trim();
  } else if (await overviewBoardHeading.count()) {
    fixture.projectName = (await overviewBoardHeading.innerText()).trim();
    await overviewBoardHeading.locator('xpath=ancestor::button[1]').click();
  } else {
    await boardButton.waitFor({ state: 'visible', timeout: 20000 });
    fixture.projectName = (await boardButton.innerText()).split(/\r?\n/)[0].trim();
    await boardButton.click();
  }
  const taskCard = configuredTaskId
    ? page.locator(`[data-task-workbench-placed-task-card="true"][data-task-id="${configuredTaskId}"]`).first()
    : page.locator('[data-task-workbench-placed-task-card="true"][data-task-id^="capa001-ui-task-"]').first();
  await taskCard.waitFor({ state: 'visible', timeout: 20000 });
  fixture.taskId = await taskCard.getAttribute('data-task-id');
  fixture.taskTitle = (await taskCard.innerText()).trim();
  assert(fixture.projectName && fixture.taskId && fixture.taskTitle, 'fresh TEST fixture must be discoverable', { fixture });
  const taskPlacement = taskCard;
  await taskPlacement.click({ position: { x: 100, y: 18 } });
  let modal = page.locator(`[data-task-details-modal="true"][data-task-id="${fixture.taskId}"]`);
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const titleInput = modal.locator('[data-task-details-title-input="true"]');
  await titleInput.waitFor({ state: 'visible' });
  const savedTitle = `CAPA-001 UI provider ${Date.now().toString(36)}`;
  await titleInput.fill(savedTitle);
  await titleInput.press('Enter');
  await modal.locator('[data-task-details-save-status="saved"]').waitFor({ state: 'visible', timeout: 15000 });
  assert(await modal.locator('[data-task-details-save-status="saving"]').count() === 0, 'real provider save must leave saving');
  assert(diagnostics.patchResponses.some(item => item.ok), 'real Supabase PATCH response missing', { patchResponses: diagnostics.patchResponses });
  assert(await titleInput.inputValue() === savedTitle, 'saved UI value did not converge after real provider response', { savedTitle, actual: await titleInput.inputValue() });

  await modal.locator('button[aria-label="關閉任務詳情"]').click();
  await modal.waitFor({ state: 'hidden', timeout: 5000 });
  await page.reload({ waitUntil: 'networkidle' });
  const boardAfterReload = page.locator('button').filter({ hasText: fixture.projectName }).first();
  if (await boardAfterReload.count()) await boardAfterReload.first().click();
  await page.locator(`[data-task-workbench-placed-task-card="true"][data-task-id="${fixture.taskId}"]`).first().waitFor({ state: 'visible', timeout: 20000 });
  assert(await page.getByText(savedTitle, { exact: true }).count() > 0, 'reload must render canonical saved title');

  // Modal-stack Back is exercised through the same public navigation event
  // used by task detail child/parent navigation; it must not create a second
  // overlay or lose the saved owner state.
  await page.locator(`[data-task-workbench-placed-task-card="true"][data-task-id="${fixture.taskId}"]`).first().click({ position: { x: 100, y: 18 } });
  modal = page.locator(`[data-task-details-modal="true"][data-task-id="${fixture.taskId}"]`);
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const peerTitle = /CAPA-001-TEST-.* peer$/;
  const peerTitleSlot = modal.locator('[data-task-title-slot="true"]').filter({ hasText: peerTitle }).first();
  let backCase;
  let otherTaskId = null;
  if (await peerTitleSlot.count()) {
    await peerTitleSlot.waitFor({ state: 'visible', timeout: 10000 });
    otherTaskId = await peerTitleSlot.getAttribute('data-task-id');
    assert(otherTaskId, 'a second readable child task is required for Back navigation');
    await peerTitleSlot.click();
    const otherModal = page.locator(`[data-task-details-modal="true"][data-task-id="${otherTaskId}"]`);
    await otherModal.waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-task-details-modal="true"]').count() === 1, 'navigation must keep one modal instance');
    const back = otherModal.locator('[data-task-details-back="true"]');
    await back.click();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-task-details-modal="true"]').count() === 1, 'Back must keep one modal instance');
    assert(await page.locator('[data-task-details-modal="true"]').getAttribute('data-task-id') === fixture.taskId, 'Back must return to original task');
    assert(await page.locator('[data-task-details-modal="true"] [data-task-details-save-status="saving"]').count() === 0, 'Back must not inherit saving state');
    backCase = { id: 'U04-modal-back-navigation', status: 'PASS', taskId: fixture.taskId, returnedFrom: otherTaskId };
  } else {
    backCase = {
      id: 'U04-modal-back-navigation',
      status: 'NOT_RUN',
      reason: 'DEV-099 isolated candidate does not include DEV-098 modal navigation surface (data-task-title-slot/data-task-details-back).',
    };
  }
  await page.locator('[data-task-details-modal="true"] button[aria-label="關閉任務詳情"]').click();
  await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 });
  assert(diagnostics.pageErrors.length === 0, 'real provider/back flow emitted a pageerror', { diagnostics });
  const artifact = {
    id: 'CAPA-001 / DEV-099 / Supabase TEST UI provider/back',
    sourceRevision: 'production-base/13888b2 + codex/capa-001-dev099-integrated@6ddf9e0; DEV-098 + DEV-099 isolated hotfix-boundary smoke',
    generatedAt: new Date().toISOString(),
    environment: 'supabase-test-local-ui',
    origin: boardUrl,
    fixtureNamespace: fixture.projectName.replace(/ Board$/, ''),
    cases: [
      { id: 'U01-authenticated-edit-terminal', status: 'PASS', patchResponses: diagnostics.patchResponses },
      { id: 'U02-canonical-readback', status: 'PASS', title: savedTitle, evidence: 'same authenticated app state plus post-reload render; direct REST canonical readback is in supabase-test-result.json' },
      { id: 'U03-reload-persistence', status: 'PASS' },
      backCase,
    ],
    failedCaseIds: backCase.status === 'PASS' ? [] : ['U04-modal-back-navigation'],
    diagnostics,
    mutationsPerformed: true,
    cleanup: 'fixture cleanup is executed separately with TEST admin fallback',
  };
  await page.evaluate(value => { window.__CAPA001_SUPABASE_UI_ARTIFACT = value; }, artifact);
  console.log(JSON.stringify(artifact, null, 2));
}
