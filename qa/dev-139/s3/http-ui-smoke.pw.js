/* eslint-disable */
async (page) => {
  const baseUrl = page.url().split('/').slice(0, 3).join('/');
  const consoleErrors = [];
  const pageErrors = [];
  const responseErrors = [];
  const sameOriginResponses = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = response.url();
    if (!url.startsWith(baseUrl)) return;
    sameOriginResponses.push({ status: response.status(), url });
    if (response.status() >= 400) responseErrors.push(`${response.status()} ${url}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const verifyPrivateManualMeetingDraft = async (target, other, scope) => {
    const origin = new URL(target.url()).origin;
    const recordsPath = `/api/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/boards/${encodeURIComponent(scope.boardId)}/records`;
    const title = `DEV139 private manual meeting draft ${Date.now()}`;
    const content = 'DEV139 手動會議正文：確認人工決議與後續追蹤，不使用語音或模型。';
    const blockedRequests = [];
    const microphoneKey = 'dev139-manual-meeting-microphone-attempts';
    const check = (condition, message) => { if (!condition) throw new Error(`A08 manual meeting: ${message}`); };
    const protectMicrophone = key => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, '0');
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
        sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || '0') + 1));
        throw new Error('DEV139_MANUAL_MEETING_MICROPHONE_FORBIDDEN');
      };
    };
    await target.evaluate(key => sessionStorage.setItem(key, '0'), microphoneKey);
    await target.addInitScript(protectMicrophone, microphoneKey);
    await target.evaluate(protectMicrophone, microphoneKey);
    const guardProvider = async route => {
      const request = route.request();
      const url = new URL(request.url());
      const audioOrModel = url.origin === origin
        && (/^\/api\/v1\/(?:meeting-control|meeting-audio)(?:\/|$)/u.test(url.pathname)
          || /\/meeting:synthesize$/u.test(url.pathname));
      const provider = /(?:speech|aiplatform|generativelanguage)\.googleapis\.com$|(?:^|\.)openai\.com$|(?:^|\.)anthropic\.com$/u.test(url.hostname)
        || /\/functions\/v1\//u.test(url.pathname);
      if (audioOrModel || provider) {
        blockedRequests.push({ method: request.method(), path: url.pathname });
        await route.abort();
      } else await route.fallback();
    };
    await target.route('**/*', guardProvider);
    const openRecords = async current => {
      const menu = current.locator('[data-app-more-menu="true"]');
      await menu.locator('summary').click();
      const action = current.locator('[data-app-more-records="true"]');
      if (await action.getAttribute('aria-current') === 'page') await menu.locator('summary').click();
      else await action.click();
      await current.locator('[data-record-section-controls="true"]').waitFor({ state: 'visible' });
    };
    try {
      await target.locator('[data-app-more-menu="true"] summary').click();
      await target.locator('[data-app-more-meeting-record="true"]').click();
      const composer = target.locator('[data-record-composer-shell]');
      await composer.waitFor({ state: 'visible' });
      await composer.locator('[data-record-title-input]').fill(title);
      await composer.locator('[data-record-content-editor="true"]').fill(content);
      await composer.locator('[data-meeting-draft-overflow]').click();
      const [savedResponse] = await Promise.all([
        target.waitForResponse(response => new URL(response.url()).pathname.startsWith(recordsPath + '/')
          && response.request().method() === 'PUT' && response.request().postDataJSON()?.title === title),
        composer.locator('[data-meeting-draft-save-and-exit]').click(),
      ]);
      check(savedResponse.ok(), `save failed (${savedResponse.status()})`);
      const saved = (await savedResponse.json()).data;
      const savedRequest = savedResponse.request();
      check(savedRequest.postDataJSON().id === saved?.id
        && new URL(savedRequest.url()).pathname === recordsPath + '/' + encodeURIComponent(saved.id), 'first PUT did not preserve the client draft identity');
      check(saved?.id && saved.type === 'meeting' && saved.status === 'draft' && saved.title === title
        && saved.content.includes(content), 'normal save did not return the typed manual draft');
      await composer.waitFor({ state: 'hidden' });
      const [reloadRead] = await Promise.all([
        target.waitForResponse(response => new URL(response.url()).pathname === recordsPath && response.request().method() === 'GET'),
        target.reload({ waitUntil: 'domcontentloaded' }),
      ]);
      check(reloadRead.ok(), `reload record read failed (${reloadRead.status()})`);
      const reloadedRecords = (await reloadRead.json()).data;
      await target.locator('nav.app-main-nav').waitFor({ state: 'visible' });
      await openRecords(target);
      const recordRow = target.locator('[data-record-list="true"] .record-list-row').filter({ hasText: title });
      await recordRow.waitFor({ state: 'visible' });
      await recordRow.click();
      await composer.waitFor({ state: 'visible' });
      check(await composer.locator('[data-record-title-input]').inputValue() === title, 'reloaded title changed');
      check((await composer.locator('[data-record-content-editor="true"]').innerText()).includes(content), 'reloaded body changed');
      const matches = reloadedRecords.filter(record => record.title === title);
      check(matches.length === 1 && matches[0].id === saved.id && matches[0].status === 'draft'
        && matches[0].content.includes(content), 'reload created another record or changed the stored draft');
      await composer.locator('[data-record-composer-close]').click();
      await composer.waitFor({ state: 'hidden' });
      await other.reload({ waitUntil: 'domcontentloaded' });
      await other.locator('nav.app-main-nav').waitFor({ state: 'visible' });
      await openRecords(other);
      const otherBody = await other.locator('body').innerText();
      check(!otherBody.includes(title) && !otherBody.includes(content), 'manual draft appeared in another account UI');
      const denied = await other.request.get(origin + recordsPath, { headers: scope.otherHeaders });
      const deniedBody = await denied.text();
      check(denied.status() === 404 && !deniedBody.includes(title) && !deniedBody.includes(content), 'private record API disclosed content to another account');
      const microphoneAttempts = await target.evaluate(key => Number(sessionStorage.getItem(key) || '0'), microphoneKey);
      check(microphoneAttempts === 0 && blockedRequests.length === 0, 'manual flow attempted microphone, speech, or model requests');
      return { normalMeetingEntry: true, saveAndExit: true, reloadSameRecord: true, recordStatus: 'draft',
        otherAccountUiVisible: false, otherAccountApiStatus: denied.status(), microphoneAttempts,
        speechOrModelRequests: blockedRequests.length, firstSaveMethod: savedRequest.method(), firstSavePreservedDraftId: true,
        identity: 'ISOLATED_BROWSER_SESSION', providerCalls: 'NOT_REQUESTED' };
    } finally { await target.unroute('**/*', guardProvider); }
  };
  const waitForProduct = async () => {
    await page.locator('nav.app-main-nav').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-task-id="shared-parent"]').first().waitFor({ state: 'visible', timeout: 20000 });
  };
  const verifyOwnerBoardScope = async () => {
    const canvas = page.locator('[data-kanban-mouse-pan-surface="true"]');
    assert((await canvas.innerText()).includes('Shared parent'), 'selected board canvas has no shared parent');
    // This owner also has a private board. Their personal "all tasks" panel
    // can legitimately finish loading before the shared board assertion.
    const onlyInPersonalWorkbench = await page.getByText('B secret').evaluateAll(matches =>
      matches.every(element => element.closest('[data-task-workbench-panel="true"]') !== null));
    assert(onlyInPersonalWorkbench && !(await canvas.innerText()).includes('B secret'),
      'owner-only task appeared outside the personal workbench');
  };
  const openPermissions = async target => {
    // SettingsView is lazy: after reload its root can still be absent even
    // though the persisted view already makes this menu action "return to board".
    const menu = target.locator('[data-app-more-menu="true"]');
    await menu.waitFor({ state: 'visible' });
    await menu.locator('summary').click();
    const settingsAction = target.locator('[data-app-more-settings="true"]');
    await settingsAction.waitFor({ state: 'visible' });
    if (await settingsAction.getAttribute('aria-current') === 'page') {
      await menu.locator('summary').click();
    } else {
      await settingsAction.click();
    }
    await target.locator('[data-settings-view="true"]').waitFor({ state: 'visible' });
    await target.locator('[data-settings-section-tab="permissions"]').click();
    await target.locator('[data-board-permission-settings]').waitFor({ state: 'visible' });
  };

  let step = 'bind isolated actor';
  let collaboratorContext;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([{ name: '__session', value: 'qa-browser', url: `${baseUrl}/` }]);
    await page.evaluate(() => {
      localStorage.setItem('projed-last-ws', 'ws-b');
      localStorage.setItem('projed-last-board', 'board-shared');
      localStorage.setItem('projed-last-view', 'board');
    });
    consoleErrors.length = 0;
    pageErrors.length = 0;
    responseErrors.length = 0;
    sameOriginResponses.length = 0;

    step = 'load normal product entry';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForProduct();
    let bodyText = await page.locator('body').innerText();
    assert(bodyText.includes('Shared board'), 'board title is missing from the normal UI', { bodyText: bodyText.slice(0, 1200) });
    assert(bodyText.includes('Shared parent'), 'task title is missing from the normal UI', { bodyText: bodyText.slice(0, 1200) });
    assert(!bodyText.includes('檢查 Jenfu-Platform 登入'), 'authenticated actor was returned to the login shell');
    await verifyOwnerBoardScope();

    step = 'keep the board readable and distinguish throttled unplaced reads from empty results';
    const pressureContext = await page.context().browser().newContext({ serviceWorkers: 'block' });
    try {
      await pressureContext.addCookies([{ name: '__session', value: 'qa-browser', url: `${baseUrl}/` }]);
      await pressureContext.addInitScript(() => {
        localStorage.setItem('projed-last-ws', 'ws-b');
        localStorage.setItem('projed-last-board', 'board-shared');
        localStorage.setItem('projed-last-view', 'board');
      });
      const pressurePage = await pressureContext.newPage();
      const unplaced = '**/api/v1/task-workbench/unplaced';
      const throttle = route => route.fulfill({ status: 429, contentType: 'text/html', body: 'Busy' });
      await pressurePage.route(unplaced, throttle);
      await pressurePage.route('**/api/v1/preferences/task-filters/board-shared', throttle);
      await pressurePage.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
      const retryUnplaced = pressurePage.getByRole('button', { name: '重新載入未歸位', exact: true });
      await retryUnplaced.waitFor({ state: 'visible', timeout: 20000 });
      assert(await pressurePage.locator('[data-task-workbench-unplaced-empty-state]').count() === 0,
        'unavailable unplaced task list was reported as empty');
      await pressurePage.locator('[data-kanban-mouse-pan-surface="true"] [data-task-id="shared-parent"]').first()
        .waitFor({ state: 'visible', timeout: 20000 });
      await pressurePage.unroute(unplaced, throttle);
      const [retried] = await Promise.all([
        pressurePage.waitForResponse(reply => new URL(reply.url()).pathname === '/api/v1/task-workbench/unplaced' && reply.ok()),
        retryUnplaced.click(),
      ]);
      await retryUnplaced.waitFor({ state: 'hidden' });
      const unplacedTasks = (await retried.json()).data.filter(task => !task.isArchived);
      if (unplacedTasks.length === 0) {
        await pressurePage.locator('[data-task-workbench-unplaced-empty-state]').waitFor({ state: 'visible' });
      }
    } finally {
      await pressureContext.close();
    }

    await page.locator('[data-main-sidebar-toggle="true"]').click();
    const workspaceSidebar = page.locator('[data-sidebar-panel="expanded"]');
    await workspaceSidebar.waitFor({ state: 'visible', timeout: 10000 });
    const sidebarText = await workspaceSidebar.innerText();
    assert(sidebarText.includes('B workspace'), 'workspace title is missing from the workspace selector', { sidebarText });
    assert(sidebarText.includes('Shared board') && sidebarText.includes('Private board'),
      'authorized boards are missing from the workspace selector', { sidebarText });
    await page.getByRole('button', { name: '關閉工作區與看板' }).click();
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/main.png', fullPage: false });

    step = 'save non-default and explicitly empty permissions through normal settings';
    const permissionsPath = '/api/v1/workspaces/ws-b/boards/board-shared/role-permissions';
    const ownerSessionResponse = await page.request.get(baseUrl + '/api/v1/session');
    assert(ownerSessionResponse.ok(), 'owner session was unavailable');
    const ownerSession = (await ownerSessionResponse.json()).data;
    const ownerHeaders = {
      'x-projed-expected-account-id': ownerSession.localUserId,
      'x-projed-expected-context-id': ownerSession.authContextId,
    };
    const readAsOwner = async path => {
      const response = await page.request.get(baseUrl + path, { headers: ownerHeaders });
      assert(response.ok(), 'owner readback failed', { path, status: response.status() });
      return (await response.json()).data;
    };
    const initialPermissionsResponse = await page.request.get(baseUrl + permissionsPath, { headers: ownerHeaders });
    assert(initialPermissionsResponse.ok(), 'initial role matrix was unavailable');
    const initialPermissions = (await initialPermissionsResponse.json()).data;
    assert(initialPermissions.admin.length === 0, 'expected an explicitly empty admin role in the isolated fixture');
    await openPermissions(page);
    const permissionsPanel = page.locator('[data-board-permission-settings]');
    const adminReference = () => permissionsPanel.getByRole('button', { name: '系統管理員 管理任務參照', exact: true });
    const waitForAdminReference = async pressed => {
      await page.waitForFunction(expected => {
        const button = document.querySelector('[data-board-permission-settings] button[aria-label="系統管理員 管理任務參照"]');
        return button && !button.disabled && button.getAttribute('aria-pressed') === String(expected);
      }, pressed);
    };
    const saveAdminReference = async pressed => {
      const [saved] = await Promise.all([
        page.waitForResponse(reply => new URL(reply.url()).pathname === permissionsPath && reply.request().method() === 'PUT'),
        adminReference().click(),
      ]);
      assert(saved.ok(), 'normal role matrix save failed', { status: saved.status() });
      const sent = saved.request().postDataJSON().permissions;
      const matrix = (await saved.json()).data;
      const expected = pressed ? ['manage_task_reference'] : [];
      assert(JSON.stringify(sent.admin) === JSON.stringify(expected) && JSON.stringify(matrix.admin) === JSON.stringify(expected),
        'explicit admin permissions changed between the normal UI, HTTP command and saved matrix', { expected, sent: sent.admin, saved: matrix.admin });
      for (const role of ['owner', 'project_manager', 'member', 'viewer']) {
        assert(JSON.stringify([...matrix[role]].sort()) === JSON.stringify([...initialPermissions[role]].sort()),
          'saving admin permissions changed another role', { role });
      }
      await waitForAdminReference(pressed);
    };
    await waitForAdminReference(false);
    assert(await permissionsPanel.locator('button[aria-pressed]').count() === initialPermissions.owner.length * 4,
      'normal settings do not expose every existing capability for each editable role');
    await saveAdminReference(true);
    step = 'reload the persisted non-default permissions through normal settings';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openPermissions(page);
    await waitForAdminReference(true);
    const persistedNonDefault = await readAsOwner(permissionsPath);
    assert(JSON.stringify(persistedNonDefault.admin) === '["manage_task_reference"]', 'non-default matrix did not survive reload');
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/permissions-non-default.png', fullPage: false });
    await saveAdminReference(false);
    step = 'reload the persisted explicitly empty permissions through normal settings';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openPermissions(page);
    await waitForAdminReference(false);
    const persistedEmpty = await readAsOwner(permissionsPath);
    assert(persistedEmpty.admin.length === 0, 'explicitly empty permissions became defaults after reload');
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/permissions-empty.png', fullPage: false });
    await page.locator('[data-settings-return-button="true"]').click();
    await waitForProduct();

    step = 'edit a task through its details dialog';
    const taskPath = '/api/v1/workspaces/ws-b/boards/board-shared/tasks';
    const taskTitle = page.locator('[data-task-title-slot="true"][data-task-id="shared-parent"]').first();
    const modal = page.locator('[data-task-details-modal="true"]');
    const editTitle = async title => {
      await taskTitle.click();
      await modal.getByRole('textbox', { name: '編輯任務名稱' }).fill(title);
      const [saved] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === taskPath + '/shared-parent'
          && response.request().method() === 'PATCH'),
        modal.getByRole('button', { name: '關閉任務詳情' }).click(),
      ]);
      assert(saved.ok(), 'task save failed', { status: saved.status() });
      await modal.waitFor({ state: 'hidden' });
    };
    const editTitleDuringBoardRefresh = async title => {
      const canvas = page.locator('[data-kanban-mouse-pan-surface="true"]');
      const card = canvas.locator('[data-task-title-slot="true"][data-task-id="shared-parent"]').first();
      const beforeRefresh = await card.elementHandle();
      let releaseRead;
      const holdRead = new Promise(resolve => { releaseRead = resolve; });
      let signalRead;
      const readStarted = new Promise(resolve => { signalRead = resolve; });
      let delayed = false;
      const delayUpdatedSnapshot = async route => {
        const response = await route.fetch();
        if (!delayed && response.ok() && (await response.json()).data.some(task => task.id === 'shared-parent' && task.title === title)) {
          delayed = true;
          signalRead();
          await holdRead;
        }
        await route.fulfill({ response });
      };
      await page.route(baseUrl + taskPath, delayUpdatedSnapshot);
      let refreshTimeout;
      try {
        await editTitle(title);
        await Promise.race([readStarted, new Promise((_, reject) => {
          refreshTimeout = setTimeout(() => reject(new Error('Saved task was not refreshed')), 15000);
        })]);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert(await card.isVisible() && await canvas.locator('[data-task-filter-result-state="loading"]').count() === 0,
          'the loaded board was hidden during a background refresh');
        assert(await beforeRefresh.evaluate(element => element.isConnected), 'the task was remounted during a background refresh');
      } finally {
        clearTimeout(refreshTimeout);
        releaseRead();
        await page.unrouteAll({ behavior: 'wait' });
        await beforeRefresh.dispose();
      }
    };
    const editedTitle = 'Shared parent edited in browser';
    step = 'open the shared board as its collaborator';
    collaboratorContext = await page.context().browser().newContext({ serviceWorkers: 'block' });
    await collaboratorContext.addCookies([{ name: '__session', value: 'qa-browser-collaborator', url: baseUrl + '/' }]);
    await collaboratorContext.addInitScript(() => {
      localStorage.setItem('projed-last-ws', 'ws-b');
      localStorage.setItem('projed-last-board', 'board-shared');
      localStorage.setItem('projed-last-view', 'board');
    });
    const collaborator = await collaboratorContext.newPage();
    let interrupted = false;
    let privateBoardRequest = false;
    collaborator.on('request', request => {
      if (new URL(request.url()).pathname.includes('/boards/board-private/')) privateBoardRequest = true;
    });
    await collaborator.route(baseUrl + taskPath, async route => {
      const response = await route.fetch();
      if (!interrupted && response.ok() && (await response.json()).data.some(task => task.id === 'shared-parent' && task.title === editedTitle)) {
        interrupted = true;
        await route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE' } } });
      } else {
        await route.fulfill({ response });
      }
    });
    await collaborator.goto(baseUrl);
    await collaborator.locator('[data-main-sidebar-toggle="true"]').click();
    const otherSidebar = collaborator.locator('[data-sidebar-panel="expanded"]');
    await otherSidebar.getByText('Shared board', { exact: true }).click();
    const otherTitle = collaborator.locator('[data-task-title-slot="true"][data-task-id="shared-parent"]').first();
    await otherTitle.filter({ hasText: 'Shared parent' }).waitFor();
    step = 'save as owner and observe recovery on the second client';
    await editTitleDuringBoardRefresh('Shared parent saved twice');
    await editTitleDuringBoardRefresh(editedTitle);
    await otherTitle.filter({ hasText: editedTitle }).waitFor({ timeout: 30000 });
    assert(interrupted, 'collaborator did not encounter the simulated transient read failure');
    assert(!privateBoardRequest && !(await collaborator.locator('body').innerText()).includes('B secret'),
      'collaborator loaded the owner-only private board');
    step = 'verify the saved task after reload';
    const [loaded] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === taskPath
        && response.request().method() === 'GET'),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    const tasks = (await loaded.json()).data;
    assert(loaded.ok() && tasks.some(task => task.id === 'shared-parent' && task.title === editedTitle),
      'saved title is missing from the reloaded task list');
    await waitForProduct();
    assert((await taskTitle.innerText()).includes(editedTitle), 'saved title is missing from the board');
    bodyText = await page.locator('body').innerText();
    assert(bodyText.includes('Shared board') && bodyText.includes('Shared parent'),
      'board or task did not survive reload', { bodyText: bodyText.slice(0, 1200) });
    await verifyOwnerBoardScope();
    step = 'restore the shared fixture through the same dialog';
    await editTitle('Shared parent');

    step = 'verify collaborator read-only controls and reject forged permission/task writes';
    const otherModal = collaborator.locator('[data-task-details-modal="true"]');
    const collaboratorDisabledTitleAncestors = {};
    for (const taskId of ['shared-parent', 'shared-child']) {
      const title = collaborator.locator(`[data-task-title-slot="true"][data-task-id="${taskId}"]`).first();
      await title.waitFor({ state: 'visible' });
      collaboratorDisabledTitleAncestors[taskId] = await title.evaluate(element => {
        const disabled = [];
        for (let node = element; node; node = node.parentElement) {
          if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') {
            disabled.push({ tag: node.tagName, role: node.getAttribute('role'), taskId: node.getAttribute('data-task-id'),
              columnHeader: node.getAttribute('data-kanban-column-header') });
          }
        }
        return disabled;
      });
      assert(collaboratorDisabledTitleAncestors[taskId].length === 0,
        'a disabled drag ancestor prevents normal read-only task access', { taskId, ancestors: collaboratorDisabledTitleAncestors[taskId] });
      await title.click();
      await otherModal.waitFor({ state: 'visible' });
      assert(await otherModal.getByRole('textbox', { name: '編輯任務名稱' }).count() === 0,
        'read-only collaborator received an editable task title', { taskId });
      await otherModal.getByRole('button', { name: '關閉任務詳情' }).click();
      await otherModal.waitFor({ state: 'hidden' });
    }
    await openPermissions(collaborator);
    const otherPermissions = collaborator.locator('[data-board-permission-settings]');
    await otherPermissions.getByText('僅可檢視', { exact: true }).waitFor();
    assert(await otherPermissions.locator('button[aria-pressed]').count() === 0,
      'collaborator received editable role permission controls');
    const collaboratorSessionResponse = await collaborator.request.get(baseUrl + '/api/v1/session');
    assert(collaboratorSessionResponse.ok(), 'collaborator session became invalid after unrelated admin changes');
    const collaboratorSession = (await collaboratorSessionResponse.json()).data;
    const expectedActorHeaders = {
      origin: baseUrl,
      'x-projed-expected-account-id': collaboratorSession.localUserId,
      'x-projed-expected-context-id': collaboratorSession.authContextId,
    };
    const deniedMatrix = await collaborator.request.put(baseUrl + permissionsPath, {
      headers: expectedActorHeaders, data: { permissions: initialPermissions },
    });
    const deniedTask = await collaborator.request.patch(baseUrl + taskPath + '/shared-parent', {
      headers: expectedActorHeaders, data: { title: 'Unauthorized title must not persist' },
    });
    for (const [operation, response] of [['role-permissions', deniedMatrix], ['task-edit', deniedTask]]) {
      assert(response.status() === 403 && (await response.json()).error.code === 'ACCESS_DENIED',
        'forged write was not denied by the actual permission check', { operation, status: response.status() });
    }
    const afterDenial = await readAsOwner(taskPath);
    assert(afterDenial.find(task => task.id === 'shared-parent')?.title === 'Shared parent', 'denied task edit persisted');
    const matrixAfterDenial = await readAsOwner(permissionsPath);
    for (const role of ['owner', 'admin', 'project_manager', 'member', 'viewer']) {
      assert(JSON.stringify([...matrixAfterDenial[role]].sort()) === JSON.stringify([...persistedEmpty[role]].sort()),
        'denied matrix write persisted', { role });
    }

    step = 'create a disposable shared task and observe it in another normal view';
    await collaborator.locator('[data-settings-return-button="true"]').click();
    await collaborator.locator('[data-mode-switcher-trigger="true"]').click();
    await collaborator.locator('[data-mode-switcher-value="goal"]').click();
    const [createdSharedResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === taskPath + ':commit-order'
        && response.request().method() === 'POST'),
      page.getByTitle('新增列表', { exact: true }).click(),
    ]);
    assert(createdSharedResponse.ok(), 'normal shared task creation failed', { status: createdSharedResponse.status() });
    const createdShared = (await createdSharedResponse.json()).data;
    // commit-order can return existing siblings too; the opened details dialog
    // identifies the task created by the normal button without seeding a row.
    await modal.waitFor({ state: 'visible' });
    const disposableTitle = 'DEV139 shared task deleted while collaborator offline';
    await modal.getByRole('textbox', { name: '編輯任務名稱' }).fill(disposableTitle);
    const [namedSharedResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.startsWith(taskPath + '/')
        && response.request().method() === 'PATCH' && response.request().postDataJSON()?.title === disposableTitle),
      modal.getByRole('button', { name: '關閉任務詳情' }).click(),
    ]);
    assert(namedSharedResponse.ok(), 'normal shared task naming failed', { status: namedSharedResponse.status() });
    const disposableTask = (await namedSharedResponse.json()).data;
    assert(createdShared.nodes.some(task => task.id === disposableTask.id), 'created task identity changed before naming');
    await modal.waitFor({ state: 'hidden' });
    const otherDisposableRow = collaborator.locator(`[data-goal-task-row="true"][data-task-id="${disposableTask.id}"]`);
    await otherDisposableRow.filter({ hasText: disposableTitle }).waitFor({ state: 'visible', timeout: 10000 });
    assert((await otherDisposableRow.innerText()).includes(disposableTitle), 'list view did not receive the canonical task title');

    step = 'disconnect the collaborator and archive the disposable task through its normal menu';
    const offlineRead = collaborator.waitForEvent('requestfailed', {
      predicate: request => new URL(request.url()).pathname === '/api/v1/scope-revisions',
      timeout: 12000,
    });
    await collaboratorContext.setOffline(true);
    await offlineRead;
    assert(await collaborator.evaluate(() => navigator.onLine === false), 'collaborator browser did not enter offline mode');
    const disposableHeader = page.locator(`[data-kanban-column-header="true"][data-task-id="${disposableTask.id}"]`);
    await disposableHeader.click({ button: 'right' });
    const taskMenu = page.locator('[data-global-context-menu="true"]');
    const [archivedResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === taskPath + '/' + encodeURIComponent(disposableTask.id)
        && response.request().method() === 'PATCH' && response.request().postDataJSON()?.isArchived === true),
      taskMenu.locator('[data-task-action-id="task.archive"]').click(),
    ]);
    assert(archivedResponse.ok() && (await archivedResponse.json()).data.isArchived === true,
      'normal archive was not committed by the real HTTP service', { status: archivedResponse.status() });
    await disposableHeader.waitFor({ state: 'hidden' });

    step = 'permanently delete only the disposable task through the current-board recycle bin';
    await openPermissions(page);
    await page.locator('[data-settings-section-tab="backup"]').click();
    await page.getByRole('button', { name: '目前看板回收桶', exact: true }).click();
    await page.locator('[data-recycle-bin-view="current-board"]').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '永久刪除任務 ' + disposableTitle, exact: true }).click();
    const [deletedResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === taskPath + '/' + encodeURIComponent(disposableTask.id)
        && response.request().method() === 'DELETE'),
      page.locator('[data-global-dialog-decision-index="1"]').click(),
    ]);
    assert(deletedResponse.ok(), 'normal permanent delete failed', { status: deletedResponse.status() });
    const canonicalAfterDelete = await readAsOwner(taskPath);
    assert(!canonicalAfterDelete.some(task => task.id === disposableTask.id), 'deleted task remained in the real HTTP/PG readback');
    const offlineTaskVisibleBeforeReconnect = await otherDisposableRow.isVisible();
    assert(!privateBoardRequest && !(await collaborator.locator('body').innerText()).includes('B secret'),
      'offline list view received owner-only private content');

    step = 'reconnect the collaborator and reconcile the deleted task without reloading';
    const reconnectedRead = collaborator.waitForResponse(response => new URL(response.url()).pathname === taskPath
      && response.request().method() === 'GET' && response.ok(), { timeout: 10000 });
    const reconnectStartedAt = Date.now();
    await collaboratorContext.setOffline(false);
    const reconnectedTasks = (await (await reconnectedRead).json()).data;
    assert(!reconnectedTasks.some(task => task.id === disposableTask.id), 'reconnected canonical read returned the deleted task');
    await otherDisposableRow.waitFor({ state: 'hidden', timeout: 10000 });
    const reconnectConvergenceMs = Date.now() - reconnectStartedAt;
    assert(reconnectConvergenceMs <= 10000, 'reconnected list view exceeded the existing 10-second convergence contract', { reconnectConvergenceMs });
    assert(reconnectedTasks.some(task => task.id === 'shared-parent')
      && !privateBoardRequest && !(await collaborator.locator('body').innerText()).includes('B secret'),
      'reconnect lost the authorized task or disclosed private content');
    await collaborator.locator('[data-mode-switcher-trigger="true"]').click();
    await collaborator.locator('[data-mode-switcher-value="board"]').click();
    await collaborator.locator('[data-task-title-slot="true"][data-task-id="shared-parent"]').first().waitFor({ state: 'visible' });
    assert(await collaborator.locator(`[data-task-id="${disposableTask.id}"]`).count() === 0,
      'returning to board view resurrected the deleted task');
    await openPermissions(page);
    await page.locator('[data-settings-return-button="true"]').click();
    await waitForProduct();
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/collaboration-reconnect.png', fullPage: false });

    step = 'create a private workspace from the personal owner sidebar';
    const workspaceTitle = 'Personal workspace from sidebar';
    const boardTitle = 'Personal board from home';
    const privateTitle = 'Private task created in browser';
    const saveThroughUi = async (path, method, action) => {
      const [response] = await Promise.all([
        page.waitForResponse(reply => new URL(reply.url()).pathname === path && reply.request().method() === method),
        action(),
      ]);
      assert(response.ok(), 'normal HTTP operation failed', { path, method, status: response.status() });
      return (await response.json()).data;
    };
    await page.locator('[data-main-sidebar-toggle="true"]').click();
    await workspaceSidebar.locator('[data-sidebar-workspace-title="true"]').first().click({ button: 'right' });
    await page.locator('[data-context-menu-create-workspace="true"]').click();
    const createWorkspace = page.locator('[data-workspace-create-dialog="true"]');
    await createWorkspace.getByRole('textbox').fill(workspaceTitle);
    const workspace = await saveThroughUi('/api/v1/workspaces', 'POST', () => createWorkspace.getByRole('button', { name: '建立', exact: true }).click());
    await createWorkspace.waitFor({ state: 'hidden' });
    if (await workspaceSidebar.isVisible()) await page.getByRole('button', { name: '關閉工作區與看板' }).click();
    step = 'create a private board and task through their normal controls';
    const section = page.locator('[data-home-workspace-section="true"]').filter({ hasText: workspaceTitle });
    await section.locator('[data-empty-workspace-create-board="true"]').click();
    await page.getByPlaceholder('請輸入文字...').fill(boardTitle);
    const boardsPath = `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/boards`;
    const board = await saveThroughUi(boardsPath, 'POST', () => page.locator('[data-global-dialog-decision-index="1"]').click());
    const privatePath = `${boardsPath}/${encodeURIComponent(board.id)}/tasks`;
    const creation = await saveThroughUi(privatePath + ':commit-order', 'POST', () => page.getByTitle('新增列表', { exact: true }).click());
    assert(creation.nodes.length === 1, 'expected one new task in the empty personal board');
    const taskId = creation.nodes[0].id;
    await modal.getByRole('textbox', { name: '編輯任務名稱' }).fill(privateTitle);
    await saveThroughUi(`${privatePath}/${encodeURIComponent(taskId)}`, 'PATCH', () => modal.getByRole('button', { name: '關閉任務詳情' }).click());
    // The HTTP response can arrive before the editor has settled and removed
    // its beforeunload guard. Wait for the normal UI acknowledgement.
    await modal.waitFor({ state: 'hidden' });
    await page.locator('[data-task-title-slot="true"]').filter({ hasText: privateTitle }).first().waitFor();
    step = 'reload the private task and verify isolation for the shared board collaborator';
    const privateTasks = await saveThroughUi(privatePath, 'GET', () => page.reload({ waitUntil: 'domcontentloaded' }));
    assert(privateTasks.some(task => task.id === taskId && task.title === privateTitle), 'private task did not survive reload');
    await page.locator('[data-task-title-slot="true"]').filter({ hasText: privateTitle }).first().waitFor();
    const otherSession = (await (await collaborator.request.get(baseUrl + '/api/v1/session')).json()).data;
    const denied = await collaborator.request.get(baseUrl + privatePath, { headers: {
      'x-projed-expected-account-id': otherSession.localUserId,
      'x-projed-expected-context-id': otherSession.authContextId,
    } });
    assert(denied.status() === 404 && !(await denied.text()).includes(privateTitle), 'private task disclosed to another authenticated actor', { status: denied.status() });

    step = 'save and reload a manual meeting draft through the private board UI';
    const manualMeetingDraft = await verifyPrivateManualMeetingDraft(page, collaborator, {
      workspaceId: workspace.id, boardId: board.id,
      otherHeaders: { 'x-projed-expected-account-id': otherSession.localUserId,
        'x-projed-expected-context-id': otherSession.authContextId },
    });

    step = 'move the owned board through the normal sidebar without replacing its Session';
    await page.locator('[data-main-sidebar-toggle="true"]').click();
    await workspaceSidebar.locator('[data-sidebar-board-title="true"]').filter({ hasText: boardTitle }).click({ button: 'right' });
    await page.getByRole('button', { name: '移動到工作區', exact: true }).click();
    const transferDialog = page.locator('[data-board-transfer-dialog="true"]');
    await transferDialog.locator('select').selectOption('ws-b');
    await transferDialog.getByPlaceholder(boardTitle, { exact: true }).fill(boardTitle);
    await saveThroughUi(`${boardsPath}/${encodeURIComponent(board.id)}/transfer`, 'POST',
      () => transferDialog.getByRole('button', { name: '移動到 B workspace', exact: true }).click());
    await transferDialog.waitFor({ state: 'hidden' });
    if (await workspaceSidebar.isVisible()) await page.getByRole('button', { name: '關閉工作區與看板' }).click();
    const movedTasksPath = `/api/v1/workspaces/ws-b/boards/${encodeURIComponent(board.id)}/tasks`;
    const movedTasks = await saveThroughUi(movedTasksPath, 'GET', () => page.reload({ waitUntil: 'domcontentloaded' }));
    assert(movedTasks.some(task => task.id === taskId && task.title === privateTitle), 'normal board transfer lost its task after reload');
    await page.locator('[data-task-title-slot="true"]').filter({ hasText: privateTitle }).first().waitFor();
    const continuedSession = (await (await page.request.get(baseUrl + '/api/v1/session')).json()).data;
    assert(continuedSession.localUserId === ownerSession.localUserId && continuedSession.authContextId === ownerSession.authContextId,
      'normal board transfer replaced the original owner Session');
    const movedRecords = await readAsOwner(`/api/v1/workspaces/ws-b/boards/${encodeURIComponent(board.id)}/records`);
    assert(movedRecords.length === 1 && movedRecords[0].status === 'draft' && movedRecords[0].type === 'meeting',
      'normal board transfer lost the private manual meeting draft');
    const deniedMoved = await collaborator.request.get(baseUrl + movedTasksPath, { headers: {
      'x-projed-expected-account-id': otherSession.localUserId,
      'x-projed-expected-context-id': otherSession.authContextId,
    } });
    assert(deniedMoved.status() === 404 && !(await deniedMoved.text()).includes(privateTitle),
      'moving the private board exposed its task to the collaborator');

    const apiPaths = [...new Set(sameOriginResponses
      .map(item => new URL(item.url).pathname)
      .filter(path => path.startsWith('/api/')))];
    assert(apiPaths.includes('/api/v1/session'), 'normal UI did not resolve the HTTP session', { apiPaths });
    assert(apiPaths.includes('/api/v1/workspaces'), 'normal UI did not load HTTP workspaces', { apiPaths });
    assert(apiPaths.some(path => path.endsWith('/tasks')), 'normal UI did not load HTTP tasks', { apiPaths });
    assert(apiPaths.some(path => path.endsWith('/access')), 'normal UI did not load the Session permission projection', { apiPaths });
    assert(consoleErrors.length === 0 && pageErrors.length === 0 && responseErrors.length === 0,
      'browser diagnostics were not clean', { consoleErrors, pageErrors, responseErrors });

    const artifact = {
      result: 'PASS',
      evidenceLevel: 'DEV139_LOCAL_HTTP_PRODUCT_UI_SMOKE',
      viewport: '1440x900',
      actor: 'qa-b',
      workspace: 'ws-b',
      board: 'board-shared',
      task: 'shared-parent',
      reload: true,
      titleEditPersistedAfterReload: true,
      collaboratorRecoveredAfterTransientReadFailure: true,
      throttledFiltersDoNotBlankBoard: true,
      unplacedReadFailureIsRetryableAndNotEmpty: true,
      collaborationDeleteReconnect: {
        scope: 'normal board/list UI and real isolated HTTP/PG; synthetic login; browser network outage injected with setOffline',
        normalCreateArchiveAndPermanentDelete: true,
        canonicalTaskId: disposableTask.id,
        ownerView: 'board',
        collaboratorView: 'goal',
        offlineRevisionRequestFailed: true,
        offlineTaskVisibleBeforeReconnect,
        databaseReadbackDeleted: true,
        reconnectWithoutReload: true,
        reconnectConvergenceMs,
        switchingBackDidNotResurrectTask: true,
        privateBoardLeak: false,
      },
      boardPermissions: {
        scope: 'isolated production HTTP/PG with synthetic identity proofs; no mocked permission responses',
        normalSettingsEntry: true,
        everyExistingCapabilityReachable: true,
        nonDefaultPersistedAfterReload: true,
        explicitEmptyPersistedAfterReload: true,
        ownerAndOtherRolesPreserved: true,
        ownerTaskEditStillAllowed: true,
        collaboratorReadOnlyControls: true,
        collaboratorDisabledTitleAncestors,
        collaboratorMatrixWriteStatus: deniedMatrix.status(),
        collaboratorTaskWriteStatus: deniedTask.status(),
        deniedWritesLeftStateUnchanged: true,
      },
      personalWorkspaceBoardTaskPersistedAfterReload: true,
      collaboratorPrivateTaskStatus: denied.status(),
      normalBoardTransfer: { sidebarEntry: true, sameSession: true, taskReloaded: true,
        privateMeetingDraftPreserved: true, collaboratorStatus: deniedMoved.status() },
      manualMeetingDraft,
      privateBoardLeak: false,
      apiPaths,
      screenshot: 'output/playwright/dev-139-http-ui/main.png',
      consoleErrors,
      pageErrors,
      responseErrors,
    };
    await page.evaluate(value => { window.__DEV139_HTTP_UI_ARTIFACT = value; }, artifact);
    return artifact;
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/failure.png', fullPage: false }).catch(() => {});
    throw new Error(`DEV-139 HTTP UI smoke failed at ${step}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await collaboratorContext?.close();
  }
}
