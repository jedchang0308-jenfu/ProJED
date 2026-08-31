/* eslint-disable */
async (page) => {
  const diagnostics = [];
  const networkFailures = [];
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`);
  });

  const getSafety = targetPage => targetPage.evaluate(() => window.__projedPwaReloadSafetyTest.getSnapshot());
  const getOwner = (snapshot, ownerId) => snapshot.owners.find(owner => owner.ownerId === ownerId);
  const waitForOwner = async (targetPage, ownerId, state) => {
    await targetPage.waitForFunction(
      ({ ownerId, state }) => window.__projedPwaReloadSafetyTest?.getSnapshot().owners
        .some(owner => owner.ownerId === ownerId && owner.state === state),
      { ownerId, state },
      { timeout: 10000 },
    );
    const snapshot = await getSafety(targetPage);
    const owner = getOwner(snapshot, ownerId);
    assert(owner?.state === state, `${ownerId} must converge to ${state}`, { snapshot });
    return { snapshot, owner };
  };
  const requestBoundary = (targetPage, boundary) => targetPage.evaluate(
    boundary => window.__projedPwaReloadSafetyTest.requestBoundary(
      boundary,
      window.__projedPwaReloadSafetyTest.getSnapshot().currentView,
    ),
    boundary,
  );
  const assertBlockedByOwner = async (targetPage, label) => {
    const result = await requestBoundary(targetPage, 'app-open');
    assert(!result.ok && result.code === 'OWNER_ACTION_REQUIRED', `${label} must fail closed at an automatic boundary`, { result, safety: await getSafety(targetPage) });
    return result;
  };

  await page.goto('http://localhost:4000/?dev097=browser', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__projedPwaUpdateTest), null, { timeout: 15000 });
  await page.waitForFunction(() => Boolean(window.__projedPwaReloadSafetyTest), null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const initialSafety = await page.evaluate(() => window.__projedPwaReloadSafetyTest.getSnapshot());
  assert(
    initialSafety.state === 'safe'
      && initialSafety.currentView === null
      && Object.values(initialSafety.ready).every(Boolean)
      && initialSafety.owners.length === 0,
    'anonymous AuthGate shell must become a complete safe boundary without authenticated owners',
    { initialSafety },
  );

  await page.evaluate(() => window.__projedPwaUpdateTest.reset());
  await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdateAvailable());
  const prompt = page.locator('[data-pwa-update-prompt]');
  await prompt.waitFor({ state: 'visible', timeout: 10000 });
  const promptText = await prompt.innerText();
  const promptMetrics = await page.evaluate(() => {
    const root = document.documentElement;
    const prompt = document.querySelector('[data-pwa-update-prompt]');
    const action = document.querySelector('[data-pwa-update-action]');
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      buttonCount: prompt?.querySelectorAll('button').length ?? 0,
      paragraphCount: prompt?.querySelectorAll('p').length ?? 0,
      hiddenIconCount: prompt?.querySelectorAll('span[aria-hidden="true"]').length ?? 0,
      actionText: action?.textContent?.trim() ?? '',
      href: window.location.href,
    };
  });
  assert(promptText.includes('新版已就緒') && promptText.includes('重新載入') && promptText.includes('稍後'), 'test update should expose the compact reload prompt', { promptText });
  assert(promptMetrics.buttonCount === 2 && promptMetrics.paragraphCount === 0 && promptMetrics.hiddenIconCount === 0, 'normal prompt should contain only the exact action set', promptMetrics);
  assert(promptMetrics.scrollWidth <= promptMetrics.clientWidth + 1, 'compact prompt should not overflow viewport', promptMetrics);

  const screenshots = [];
  for (const viewport of [
    { width: 1440, height: 900, name: '1440x900' },
    { width: 390, height: 844, name: '390x844' },
    { width: 320, height: 844, name: '320x844' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const path = `output/playwright/dev-097/prompt-${viewport.name}.png`;
    await page.screenshot({ path });
    screenshots.push(path);
  }

  await page.locator('[data-pwa-update-later]').click();
  await prompt.waitFor({ state: 'hidden', timeout: 5000 });
  const dismissed = await page.evaluate(() => window.__projedPwaUpdateTest.getState());
  assert(dismissed.updateAvailable && dismissed.targetVersion === 'test-next', 'later should preserve the local target transaction', dismissed);

  const safeBoundary = await page.evaluate(() => window.__projedPwaReloadSafetyTest.requestBoundary('foreground', null));
  assert(safeBoundary.ok && safeBoundary.localState === 'safe', 'anonymous shell should admit a safe foreground boundary after explicit readiness', { safeBoundary });

  await page.evaluate(() => window.__projedPwaUpdateTest.reset());
  await prompt.waitFor({ state: 'hidden', timeout: 5000 });

  // From this point onward every owner is driven by the real authenticated UI.
  // The local-test login is a real AuthGate transition with a deterministic
  // backend; no owner is registered or mutated by a test double.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '使用固定測試環境' }).click();
  await page.locator('[data-app-main="true"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const safety = window.__projedPwaReloadSafetyTest?.getSnapshot();
    return safety?.state === 'safe'
      && safety.currentView === 'board'
      && Object.values(safety.ready).every(Boolean)
      && safety.owners.length === 9;
  }, null, { timeout: 15000 });

  const authenticatedBaseline = await getSafety(page);
  const expectedOwnerIds = [
    'backup-import',
    'board-member-invite',
    'calendar-subscription-form',
    'dirty-dialog',
    'inline-editor',
    'rag-query',
    'record-draft',
    'task-details',
    'task-drag',
  ];
  assert(
    JSON.stringify(authenticatedBaseline.owners.map(owner => owner.ownerId).sort()) === JSON.stringify(expectedOwnerIds),
    'authenticated shell must register the complete nine-owner matrix',
    { authenticatedBaseline },
  );
  assert(authenticatedBaseline.owners.every(owner => owner.state === 'safe'), 'authenticated baseline must converge safe without an unrelated UI event', { authenticatedBaseline });

  const documentToken = await page.evaluate(() => {
    window.__DEV097_DOCUMENT_TOKEN = `doc-${Date.now()}-${Math.random()}`;
    return window.__DEV097_DOCUMENT_TOKEN;
  });
  const ownerMatrix = {};

  // RAG query + dual-tab isolation.
  await page.locator('[data-ai-analysis-open="true"]').click();
  const ragInput = page.locator('textarea[placeholder="詢問這個專案..."]');
  await ragInput.fill('DEV-097 QA 未送出查詢');
  const ragDirty = await waitForOwner(page, 'rag-query', 'dirty');
  const ragBlocked = await assertBlockedByOwner(page, 'RAG query draft');

  const secondPage = await page.context().newPage();
  const secondDiagnostics = [];
  secondPage.on('console', message => {
    if (message.type() === 'error') secondDiagnostics.push(`console:error:${message.text()}`);
  });
  secondPage.on('pageerror', error => secondDiagnostics.push(`pageerror:${error.message}`));
  await secondPage.goto('http://localhost:4000/?dev097=owner-second-tab', { waitUntil: 'domcontentloaded' });
  await secondPage.locator('[data-app-main="true"]').waitFor({ state: 'visible', timeout: 15000 });
  await secondPage.waitForFunction(() => window.__projedPwaReloadSafetyTest?.getSnapshot().state === 'safe', null, { timeout: 15000 });
  const secondBaseline = await getSafety(secondPage);
  const secondRag = getOwner(secondBaseline, 'rag-query');
  const secondBoundary = await requestBoundary(secondPage, 'app-open');
  assert(secondRag?.state === 'safe' && secondBoundary.ok, 'a dirty RAG draft in tab A must not contaminate tab B', { secondBaseline, secondBoundary });
  assert(secondDiagnostics.length === 0, 'second tab must not emit critical diagnostics', { secondDiagnostics });
  await secondPage.close();

  await ragInput.fill('');
  const ragSafe = await waitForOwner(page, 'rag-query', 'safe');
  await page.locator('button[title="關閉"]').last().click();
  ownerMatrix['rag-query'] = { dirty: ragDirty.owner, blocked: ragBlocked, safe: ragSafe.owner };
  ownerMatrix['dual-tab'] = { tabA: ragDirty.owner, tabB: secondRag, tabBBoundary: secondBoundary };

  // Board-member invite: close is an explicit cancel and must clear readback.
  await page.locator('[data-board-share-open]').click();
  const inviteInput = page.locator('[data-board-share-invite-email="true"]');
  await inviteInput.fill('dev097-unsent@example.test');
  const inviteDirty = await waitForOwner(page, 'board-member-invite', 'dirty');
  const inviteBlocked = await assertBlockedByOwner(page, 'board member invite draft');
  await page.getByRole('button', { name: '關閉分享看板' }).click();
  const inviteSafe = await waitForOwner(page, 'board-member-invite', 'safe');
  await page.locator('[data-board-share-open]').click();
  const cancelledInviteValue = await inviteInput.inputValue();
  assert(cancelledInviteValue === '', 'closing invite dialog must cancel and clear the unsent address', { cancelledInviteValue });
  await page.getByRole('button', { name: '關閉分享看板' }).click();
  ownerMatrix['board-member-invite'] = { dirty: inviteDirty.owner, blocked: inviteBlocked, safe: inviteSafe.owner, cancelledInviteValue };

  // Inline editor: F2 opens the actual Sidebar editor; Escape must restore the source value.
  if (await page.locator('[data-sidebar-workspace-title="true"]').count() === 0) {
    await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    await page.locator('[data-sidebar-workspace-title="true"]').first().waitFor({ state: 'visible', timeout: 5000 });
  }
  const workspaceTitle = page.locator('[data-sidebar-workspace-title="true"]').first();
  const originalWorkspaceTitle = (await workspaceTitle.innerText()).trim();
  await workspaceTitle.press('F2');
  const workspaceTitleInput = page.locator('[data-workspace-title-input="true"]');
  await workspaceTitleInput.waitFor({ state: 'visible', timeout: 5000 });
  await workspaceTitleInput.fill(`${originalWorkspaceTitle} DEV097 未保存`);
  const inlineDirty = await waitForOwner(page, 'inline-editor', 'dirty');
  const inlineBlocked = await assertBlockedByOwner(page, 'inline workspace title editor');
  await workspaceTitleInput.press('Escape');
  await workspaceTitleInput.waitFor({ state: 'detached', timeout: 5000 });
  const inlineSafe = await waitForOwner(page, 'inline-editor', 'safe');
  const cancelledWorkspaceTitle = (await page.locator('[data-sidebar-workspace-title="true"]').first().innerText()).trim();
  assert(cancelledWorkspaceTitle === originalWorkspaceTitle, 'Escape must cancel inline rename without changing the workspace title', { originalWorkspaceTitle, cancelledWorkspaceTitle });
  ownerMatrix['inline-editor'] = { dirty: inlineDirty.owner, blocked: inlineBlocked, safe: inlineSafe.owner, cancelledWorkspaceTitle };

  // Task details: local title draft blocks automatic reload and Escape cancels it.
  const taskCard = page.locator('.kanban-task-card[data-task-id]').first();
  await taskCard.waitFor({ state: 'visible', timeout: 10000 });
  await taskCard.click({ position: { x: 80, y: 12 } });
  const taskModal = page.locator('[data-task-details-modal="true"]');
  await taskModal.waitFor({ state: 'visible', timeout: 10000 });
  const taskTitleInput = taskModal.locator('[data-task-details-title-input="true"]');
  const originalTaskTitle = await taskTitleInput.inputValue();
  await taskTitleInput.fill(`${originalTaskTitle} DEV097 未保存`);
  const taskDetailsDirty = await waitForOwner(page, 'task-details', 'dirty');
  const taskDetailsBlocked = await assertBlockedByOwner(page, 'task details local edit');
  await taskTitleInput.press('Escape');
  const cancelledTaskTitle = await taskTitleInput.inputValue();
  assert(cancelledTaskTitle === originalTaskTitle, 'Escape must restore the task title before autosave', { originalTaskTitle, cancelledTaskTitle });
  const taskDetailsSafe = await waitForOwner(page, 'task-details', 'safe');
  await taskModal.getByRole('button', { name: '關閉任務詳情' }).click();
  await taskModal.waitFor({ state: 'hidden', timeout: 10000 });
  ownerMatrix['task-details'] = { dirty: taskDetailsDirty.owner, blocked: taskDetailsBlocked, safe: taskDetailsSafe.owner, cancelledTaskTitle };

  // Record draft flush, failed prepare/readback, and explicit cancel.
  await page.getByText('新增會議記錄', { exact: true }).click();
  const recordComposer = page.locator('[data-record-composer-shell]');
  await recordComposer.waitFor({ state: 'visible', timeout: 10000 });
  await waitForOwner(page, 'record-draft', 'safe');
  const recordTitleInput = recordComposer.locator('[data-record-title-input]').first();
  const flushedRecordTitle = `DEV097 QA Flush ${Date.now()}`;
  await recordTitleInput.fill(flushedRecordTitle);
  const recordDirty = await waitForOwner(page, 'record-draft', 'dirty');
  const recordBlocked = await assertBlockedByOwner(page, 'record draft');
  const recordFlush = await requestBoundary(page, 'user-confirmed');
  assert(recordFlush.ok, 'user-confirmed boundary must flush a valid record draft', { recordFlush, safety: await getSafety(page) });
  const recordAfterFlush = await waitForOwner(page, 'record-draft', 'safe');
  assert(await recordTitleInput.inputValue() === flushedRecordTitle, 'record flush must read back the saved title', { flushedRecordTitle, value: await recordTitleInput.inputValue() });

  await recordTitleInput.fill('');
  await waitForOwner(page, 'record-draft', 'dirty');
  const failedPrepare = await requestBoundary(page, 'user-confirmed');
  assert(!failedPrepare.ok && failedPrepare.code === 'OWNER_PREPARE_FAILED', 'blank record title must fail prepare without navigation', { failedPrepare, safety: await getSafety(page) });
  const failedReadback = {
    title: await recordTitleInput.inputValue(),
    owner: getOwner(await getSafety(page), 'record-draft'),
    documentToken: await page.evaluate(() => window.__DEV097_DOCUMENT_TOKEN),
  };
  assert(failedReadback.title === '' && failedReadback.owner?.state === 'dirty' && failedReadback.documentToken === documentToken, 'failed flush must preserve the dirty field and current document', { failedReadback, documentToken });

  const cancelledRecordTitle = `${flushedRecordTitle} Cancelled Edit`;
  await recordTitleInput.fill(cancelledRecordTitle);
  await recordComposer.locator('[data-record-composer-close]').click();
  const globalDialog = page.locator('[data-global-dialog="true"]');
  await globalDialog.waitFor({ state: 'visible', timeout: 5000 });
  const dirtyDialog = await waitForOwner(page, 'dirty-dialog', 'dirty');
  const dialogBlocked = await assertBlockedByOwner(page, 'record exit confirmation dialog');
  await globalDialog.locator('[data-global-dialog-decision="true"]').filter({ hasText: '取消' }).click();
  await globalDialog.waitFor({ state: 'hidden', timeout: 5000 });
  const dirtyDialogSafe = await waitForOwner(page, 'dirty-dialog', 'safe');
  const cancelledRecordReadback = await recordTitleInput.inputValue();
  assert(cancelledRecordReadback === cancelledRecordTitle && getOwner(await getSafety(page), 'record-draft')?.state === 'dirty', 'cancel must keep the record draft and its owner dirty', { cancelledRecordTitle, cancelledRecordReadback, safety: await getSafety(page) });
  const recordRecoveryFlush = await requestBoundary(page, 'user-confirmed');
  assert(recordRecoveryFlush.ok, 'valid record draft must recover after a failed prepare and cancel', { recordRecoveryFlush });
  await waitForOwner(page, 'record-draft', 'safe');
  await recordComposer.locator('[data-record-composer-close]').click();
  await recordComposer.waitFor({ state: 'hidden', timeout: 10000 });
  ownerMatrix['record-draft'] = {
    dirty: recordDirty.owner,
    blocked: recordBlocked,
    flush: recordFlush,
    safe: recordAfterFlush.owner,
    failedPrepare,
    failedReadback,
    cancelledRecordReadback,
    recoveryFlush: recordRecoveryFlush,
  };
  ownerMatrix['dirty-dialog'] = { dirty: dirtyDialog.owner, blocked: dialogBlocked, safe: dirtyDialogSafe.owner };

  // Calendar builder is a real form draft; returning to the list is explicit cancel.
  await page.locator('[data-sidebar-settings-button="true"]').first().click();
  await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-settings-section-tab="calendar"]').click();
  const calendarRoot = page.locator('[data-calendar-subscription-root="true"]');
  await calendarRoot.waitFor({ state: 'visible', timeout: 10000 });
  const calendarCreate = calendarRoot.locator('[data-calendar-subscription-create-new="true"]');
  if (await calendarCreate.count()) {
    await calendarCreate.click();
    await calendarRoot.locator('[data-calendar-subscription-view-mode="builder"]').waitFor({ state: 'visible', timeout: 10000 });
  } else {
    await calendarRoot.locator('#local-calendar-subscription-name').fill('DEV097 本機預覽未保存');
  }
  const calendarDirty = await waitForOwner(page, 'calendar-subscription-form', 'dirty');
  const calendarBlocked = await assertBlockedByOwner(page, 'calendar subscription builder');
  if (await calendarRoot.locator('[data-calendar-subscription-local-cancel="true"]').count()) {
    await calendarRoot.locator('[data-calendar-subscription-local-cancel="true"]').click();
  } else {
    await calendarRoot.getByRole('button', { name: '回到我的訂閱' }).click();
  }
  await calendarRoot.locator('[data-calendar-subscription-view-mode="list"]').waitFor({ state: 'visible', timeout: 10000 });
  const calendarSafe = await waitForOwner(page, 'calendar-subscription-form', 'safe');
  ownerMatrix['calendar-subscription-form'] = { dirty: calendarDirty.owner, blocked: calendarBlocked, safe: calendarSafe.owner };

  // Backup inspection is a real file flow. Inspection must block; changing
  // settings section explicitly abandons the read-only plan without mutation.
  await page.locator('[data-settings-section-tab="backup"]').click();
  const backupSection = page.locator('[data-backup-settings-section="true"]');
  await backupSection.waitFor({ state: 'visible', timeout: 10000 });
  const downloadButton = backupSection.locator('[data-backup-download-v2="true"]');
  await downloadButton.waitFor({ state: 'visible', timeout: 15000 });
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const backupDownload = await downloadPromise;
  const backupPath = await backupDownload.path();
  assert(Boolean(backupPath), 'backup owner matrix requires a readable real export');
  await backupSection.locator('[data-backup-file-input="true"]').setInputFiles(backupPath);
  await backupSection.locator('[data-backup-inspection-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
  const backupDirty = await waitForOwner(page, 'backup-import', 'dirty');
  const backupBlocked = await assertBlockedByOwner(page, 'backup inspection');
  await page.locator('[data-settings-section-tab="profile"]').click();
  await backupSection.waitFor({ state: 'detached', timeout: 10000 });
  const backupSafe = await waitForOwner(page, 'backup-import', 'safe');
  ownerMatrix['backup-import'] = { dirty: backupDirty.owner, blocked: backupBlocked, safe: backupSafe.owner, backupFilename: backupDownload.suggestedFilename() };

  await page.locator('[data-settings-return-button="true"]').click();
  await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 10000 });

  // A live desktop drag owns the transient boundary. Escape cancels it and
  // the local node readback must remain byte-for-byte unchanged.
  const dragSource = page.locator('.kanban-task-card[data-task-id]').first();
  const dragSourceId = await dragSource.getAttribute('data-task-id');
  const dragNodeBefore = await page.evaluate(id => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')[id], dragSourceId);
  const dragBox = await dragSource.boundingBox();
  assert(Boolean(dragBox && dragSourceId), 'task drag owner requires a visible source card', { dragBox, dragSourceId });
  const dragPoint = { x: Math.round(dragBox.x + dragBox.width * 0.55), y: Math.round(dragBox.y + dragBox.height * 0.35) };
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 14, dragPoint.y + 3, { steps: 4 });
  const dragOverlay = page.locator('[data-kanban-drag-overlay="true"]').first();
  await dragOverlay.waitFor({ state: 'visible', timeout: 5000 });
  const taskDragDirty = await waitForOwner(page, 'task-drag', 'dirty');
  const taskDragBlocked = await assertBlockedByOwner(page, 'active task drag');
  await page.keyboard.press('Escape');
  await page.mouse.up().catch(() => undefined);
  await dragOverlay.waitFor({ state: 'hidden', timeout: 5000 });
  const taskDragSafe = await waitForOwner(page, 'task-drag', 'safe');
  const dragNodeAfter = await page.evaluate(id => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')[id], dragSourceId);
  assert(JSON.stringify(dragNodeAfter) === JSON.stringify(dragNodeBefore), 'Escape must cancel drag without mutating placement', { dragSourceId, dragNodeBefore, dragNodeAfter });
  ownerMatrix['task-drag'] = { dirty: taskDragDirty.owner, blocked: taskDragBlocked, safe: taskDragSafe.owner, dragSourceId };

  const finalSafety = await getSafety(page);
  assert(finalSafety.state === 'safe' && finalSafety.owners.every(owner => owner.state === 'safe'), 'all real owners must converge safe after explicit flush or cancel', { finalSafety });
  assert(await page.evaluate(() => window.__DEV097_DOCUMENT_TOKEN) === documentToken, 'owner matrix must never navigate the document', { documentToken });
  const visibleErrors = await page.locator('[role="alert"], [data-pwa-update-error="true"]').evaluateAll(elements => elements
    .filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(element => element.textContent?.trim()).filter(Boolean));
  assert(visibleErrors.length === 0, 'final authenticated UI must expose no visible error', { visibleErrors });
  assert(diagnostics.length === 0 && networkFailures.length === 0, 'owner matrix must emit no critical browser or network diagnostics', { diagnostics, networkFailures });
  const ownerMatrixScreenshot = 'output/playwright/dev-097/owner-matrix-final.png';
  await page.screenshot({ path: ownerMatrixScreenshot, fullPage: false });
  screenshots.push(ownerMatrixScreenshot);

  const artifact = {
    ok: true,
    source: 'dev-097-browser-local-safety',
    initialSafety,
    promptText,
    promptMetrics,
    screenshots,
    dismissed,
    safeBoundary,
    authenticatedBaseline,
    ownerMatrix,
    finalSafety,
    visibleErrors,
    networkFailures,
    diagnostics: diagnostics.slice(-20),
  };
  await page.evaluate(value => { window.__DEV097_ARTIFACT = value; }, artifact);
  return JSON.stringify({
    ok: true,
    verified: [
      'typed readiness and mandatory owner registry',
      'anonymous AuthGate shell readiness ownership',
      'later preserves target transaction',
      'anonymous safe foreground boundary',
      'authenticated nine-owner product matrix',
      'dual-tab dirty-state isolation',
      'record flush, cancel, failed prepare, and readback',
      'calendar, backup, invite, inline edit, task details, and task drag cancellation',
      'no critical browser diagnostics',
    ],
    diagnostics: diagnostics.slice(-20),
  }, null, 2);
}
