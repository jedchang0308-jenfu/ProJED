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
  const waitForProduct = async () => {
    await page.locator('nav').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-task-id="shared-parent"]').first().waitFor({ state: 'visible', timeout: 20000 });
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
    assert(!bodyText.includes('B secret'), 'inactive private-board task leaked into the selected board');
    await page.locator('[data-main-sidebar-toggle="true"]').click();
    const workspaceSidebar = page.locator('[data-sidebar-panel="expanded"]');
    await workspaceSidebar.waitFor({ state: 'visible', timeout: 10000 });
    const sidebarText = await workspaceSidebar.innerText();
    assert(sidebarText.includes('B workspace'), 'workspace title is missing from the workspace selector', { sidebarText });
    assert(sidebarText.includes('Shared board') && sidebarText.includes('Private board'),
      'authorized boards are missing from the workspace selector', { sidebarText });
    await page.getByRole('button', { name: '關閉工作區與看板' }).click();
    await page.screenshot({ path: 'output/playwright/dev-139-http-ui/main.png', fullPage: false });

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
    await editTitle(editedTitle);
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
    assert(!bodyText.includes('B secret'), 'private-board task leaked after reload');
    step = 'restore the shared fixture through the same dialog';
    await editTitle('Shared parent');

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
      personalWorkspaceBoardTaskPersistedAfterReload: true,
      collaboratorPrivateTaskStatus: denied.status(),
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
    throw new Error(`DEV-139 HTTP UI smoke failed at ${step}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await collaboratorContext?.close();
  }
}
