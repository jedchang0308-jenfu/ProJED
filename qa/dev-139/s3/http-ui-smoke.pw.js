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
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([{ name: '__session', value: 'qa-b', url: `${baseUrl}/` }]);
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

    step = 'reload same HTTP-backed scope';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForProduct();
    bodyText = await page.locator('body').innerText();
    assert(bodyText.includes('Shared board') && bodyText.includes('Shared parent'),
      'board or task did not survive reload', { bodyText: bodyText.slice(0, 1200) });
    assert(!bodyText.includes('B secret'), 'private-board task leaked after reload');

    const apiPaths = [...new Set(sameOriginResponses
      .map(item => new URL(item.url).pathname)
      .filter(path => path.startsWith('/api/')))];
    assert(apiPaths.includes('/api/v1/session'), 'normal UI did not resolve the HTTP session', { apiPaths });
    assert(apiPaths.includes('/api/v1/workspaces'), 'normal UI did not load HTTP workspaces', { apiPaths });
    assert(apiPaths.some(path => path.endsWith('/tasks')), 'normal UI did not load HTTP tasks', { apiPaths });
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
  }
}
