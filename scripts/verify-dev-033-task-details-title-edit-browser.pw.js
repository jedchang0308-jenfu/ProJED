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
    await page.goto('http://localhost:1040/', { waitUntil: 'domcontentloaded' });
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

  const readTask = taskId => page.evaluate(taskId => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')[taskId], taskId);
  const readTrace = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.taskPersistenceTrace') || '[]'));
  const assertNoWrites = async (baseline, label) => {
    await page.waitForTimeout(1250);
    assert(JSON.stringify(await readTask(baseline.id)) === baseline.task, label + ' must not change provider task');
    assert(JSON.stringify(await readTrace()) === baseline.trace, label + ' must not issue provider writes');
  };
  const snapshot = async id => ({ id, task: JSON.stringify(await readTask(id)), trace: JSON.stringify(await readTrace()) });
  const modal = page.locator('[data-task-details-modal="true"]');
  const title = () => modal.locator('[data-task-details-title-input="true"]');
  const note = () => modal.locator('[data-task-detail-note-content-input="true"]').first();
  const status = () => modal.locator('[data-task-details-meta-field="status"] select');
  const close = async () => {
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
  };
  const navigate = taskId => page.evaluate(taskId => document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId } })), taskId);
  const imeEvents = [];
  const cdp = await page.context().newCDPSession(page);
  const compose = async (input, text, isTitle) => {
    await input.focus();
    if (isTitle) await input.selectText();
    else await input.press('Control+a');
    await cdp.send('Input.imeSetComposition', { text: '中文候選', selectionStart: 4, selectionEnd: 4 });
    // Exercise Chromium's native composition lifecycle, including Enter while
    // composing, rather than a synthetic CompositionEvent on an unchanged DOM.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    assert(await modal.isVisible(), 'IME Enter must not dismiss task details');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send('Input.insertText', { text });
    await page.waitForFunction(({ text, isTitle }) => {
      const target = document.querySelector(isTitle ? '[data-task-details-title-input="true"]' : '[data-task-detail-note-content-input="true"]');
      return isTitle ? target?.value === text : target?.textContent === text;
    }, { text, isTitle });
  };

  let step = 'open-app';
  try {
    await openApp();
    const taskId = 'qc-card-1-child-1';
    const targetTaskId = 'qc-card-1-child-2';
    const original = await readTask(taskId);
    assert(original?.title && await readTask(targetTaskId), 'seed must contain both task fixtures');
    await openTaskDetails(taskId);
    await note().waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      window.__DEV033_IME_EVENTS = [];
      for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'input']) {
        document.addEventListener(type, event => {
          const target = event.target;
          if (target instanceof Element && target.closest('[data-task-details-modal="true"]')) {
            window.__DEV033_IME_EVENTS.push({ type: event.type, data: event.data, trusted: event.isTrusted, composing: event.isComposing, title: target.matches('[data-task-details-title-input="true"]') });
          }
        }, true);
      }
    });
    const baseline = await snapshot(taskId);
    await assertNoWrites(baseline, 'opening details');
    assert(await modal.locator('[data-task-details-save="true"]').count() === 0, 'details must not add a redundant save button');

    step = 'native title and rich note composition remain drafts through wait and blur';
    const savedTitle = `中文標題 ${Date.now().toString(36)}`;
    const savedNote = `中文備註 ${Date.now().toString(36)}`;
    await compose(title(), savedTitle, true);
    await title().press('Enter');
    await note().click();
    await assertNoWrites(baseline, 'title composition, Enter and blur');
    await compose(note(), savedNote, false);
    await note().press('Control+a');
    await note().press('Control+b');
    await page.waitForFunction(() => Boolean(document.querySelector('[data-task-detail-note-content-input="true"] .font-semibold')));
    const nextStatus = original.status === 'in_progress' ? 'todo' : 'in_progress';
    await status().selectOption(nextStatus);
    await title().focus();
    await assertNoWrites(baseline, 'rich note composition, formatting, metadata and blur');
    assert(await title().inputValue() === savedTitle && (await note().innerText()).trim() === savedNote, 'draft DOM must retain committed Chinese text', { expectedTitle: savedTitle, actualTitle: await title().inputValue(), expectedNote: savedNote, actualNote: await note().innerText() });
    assert(await status().inputValue() === nextStatus, 'metadata must show the local draft');
    const events = await page.evaluate(() => window.__DEV033_IME_EVENTS);
    for (const isTitle of [true, false]) {
      for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
        assert(events.some(event => event.title === isTitle && event.type === type && (type === 'compositionend' || event.trusted)), 'CDP composition lifecycle must be observed', { isTitle, type, events });
      }
    }
    imeEvents.push(...events);
    step = 'unsaved task draft blocks automatic PWA reload and beforeunload';
    await page.waitForFunction(() => window.__projedPwaReloadSafetyTest?.getSnapshot().owners.some(owner => owner.ownerId === 'task-details' && owner.state === 'dirty'));
    const reloadBoundary = await page.evaluate(() => window.__projedPwaReloadSafetyTest.requestBoundary('app-open', window.__projedPwaReloadSafetyTest.getSnapshot().currentView));
    assert(!reloadBoundary.ok && reloadBoundary.code === 'OWNER_ACTION_REQUIRED', 'PWA automatic boundary must retain the unsaved draft', { reloadBoundary });
    const dirtyUnload = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(dirtyUnload, 'dirty task must register beforeunload cancellation');
    await assertNoWrites(baseline, 'PWA boundary and beforeunload probe');

    step = 'close persists the entire draft and reopening retains rich text';
    const richDraftDom = await note().innerHTML();
    const richDraftState = await note().evaluate(element => element.__lexicalEditor?.getEditorState().toJSON());
    await close();
    await page.waitForFunction(() => window.__projedPwaReloadSafetyTest?.getSnapshot().owners.some(owner => owner.ownerId === 'task-details' && owner.state === 'safe'));
    const cleanUnload = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(!cleanUnload, 'successfully closed task must remove beforeunload cancellation');
    const stored = await readTask(taskId);
    assert(stored.title === savedTitle && stored.status === nextStatus && stored.detailNotes[0].content === savedNote, 'close must persist title, note and metadata', { stored });
    assert(JSON.stringify(stored.detailNotes[0].richContent).includes('"format":1'), 'close must persist bold rich content', { richContent: stored.detailNotes[0].richContent, richDraftDom, richDraftState });
    await openTaskDetails(taskId);
    await note().waitFor({ state: 'visible', timeout: 10000 });
    assert(await title().inputValue() === savedTitle && (await note().innerText()).trim() === savedNote, 'reopen must restore persisted text');
    assert(await note().locator('.font-semibold').count() > 0, 'reopen must restore rich formatting');
    await assertNoWrites(await snapshot(taskId), 'reopening unchanged details');

    step = 'failed close retains the full draft until explicit retry';
    const rejectedTitle = savedTitle + ' 失敗重試';
    const rejectedNote = savedNote + ' 保留草稿';
    const previousStatus = stored.status;
    await title().fill(rejectedTitle);
    await note().fill(rejectedNote);
    await status().selectOption(previousStatus === 'todo' ? 'in_progress' : 'todo');
    const beforeFailure = await snapshot(taskId);
    await page.evaluate(() => localStorage.setItem('projed-local-test.taskPersistenceFault', 'reject-once'));
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.locator('[data-task-details-save-status="error"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await title().inputValue() === rejectedTitle && (await note().innerText()).trim() === rejectedNote, 'failed close must retain both text drafts');
    const failedStored = await readTask(taskId);
    const beforeFailedTask = JSON.parse(beforeFailure.task);
    assert(failedStored.title === beforeFailedTask.title && failedStored.status === beforeFailedTask.status, 'rejected metadata write must leave provider metadata unchanged', { beforeFailedTask, failedStored });
    const traceAfterFailure = JSON.stringify(await readTrace());
    await page.waitForTimeout(1400);
    assert(JSON.stringify(await readTrace()) === traceAfterFailure, 'failed save must not retry on a timer');
    await modal.locator('[data-task-details-save-retry="true"]').click();
    await modal.locator('[data-task-details-save-status="saved"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await modal.isVisible(), 'explicit retry keeps the current task available');
    assert((await readTask(taskId)).title === rejectedTitle && (await readTask(taskId)).detailNotes[0].content === rejectedNote, 'explicit retry must persist the latest full draft');
    await close();

    step = 'task navigation flushes a draft and failed navigation stays on the source task';
    await openTaskDetails(taskId);
    const navigationTitle = rejectedTitle + ' 導覽';
    await title().fill(navigationTitle);
    await page.evaluate(() => localStorage.setItem('projed-local-test.taskPersistenceFault', 'reject-once'));
    await navigate(targetTaskId);
    await modal.locator('[data-task-details-save-status="error"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await modal.getAttribute('data-task-id') === taskId && await title().inputValue() === navigationTitle, 'failed navigation must retain source task and draft');
    const failedNavigationTrace = JSON.stringify(await readTrace());
    await navigate(targetTaskId);
    await page.waitForTimeout(150);
    assert(await modal.getAttribute('data-task-id') === taskId && JSON.stringify(await readTrace()) === failedNavigationTrace, 'navigation while failed must require explicit retry');
    await modal.locator('[data-task-details-save-retry="true"]').click();
    await modal.locator('[data-task-details-save-status="saved"]').waitFor({ state: 'visible', timeout: 10000 });
    await navigate(targetTaskId);
    await page.waitForFunction(taskId => document.querySelector('[data-task-details-modal="true"]')?.getAttribute('data-task-id') === taskId, targetTaskId);
    assert((await readTask(taskId)).title === navigationTitle, 'navigation must persist source draft');
    const targetNote = '切換前的最後備註';
    await note().fill(targetNote);
    await navigate(taskId);
    await page.waitForFunction(taskId => document.querySelector('[data-task-details-modal="true"]')?.getAttribute('data-task-id') === taskId, taskId);
    assert((await readTask(targetTaskId)).detailNotes[0].content === targetNote, 'successful task switch must flush pending note');
    step = 'navigation during active IME waits for committed Chinese text';
    const beforeImeNavigation = await snapshot(taskId);
    const imeNavigationTitle = '組字完成後再切換任務';
    await title().focus();
    await title().selectText();
    await cdp.send('Input.imeSetComposition', { text: '尚未選字', selectionStart: 4, selectionEnd: 4 });
    await navigate(targetTaskId);
    await assertNoWrites(beforeImeNavigation, 'navigation while native composition is active');
    assert(await modal.getAttribute('data-task-id') === taskId, 'active IME must defer task navigation');
    await cdp.send('Input.insertText', { text: imeNavigationTitle });
    await page.waitForFunction(taskId => document.querySelector('[data-task-details-modal="true"]')?.getAttribute('data-task-id') === taskId, targetTaskId);
    assert((await readTask(taskId)).title === imeNavigationTitle, 'deferred navigation must save the committed Chinese candidate');
    await close();
    const artifact = { status: 'PASS', nativeImeEvents: imeEvents.length, imeMethod: 'CDP imeSetComposition/insertText; trusted start/update/input; Chromium reports untrusted end', checks: ['no writes on wait/blur/Enter', 'title + rich note + status', 'close/reopen', 'failed close retention + retry', 'failed navigation retention + retry', 'task switch flush', 'PWA dirty owner + beforeunload handler', 'navigation deferred during native IME'] };
    await page.evaluate(artifact => { window.__DEV033_ARTIFACT = artifact; }, artifact);
    return artifact;
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  } finally {
    await cdp.detach();
  }
}
