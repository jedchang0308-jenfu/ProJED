/* eslint-disable */
async (page) => {
  const baseUrl = new URL(page.url()).origin;
  const ragPath = '/api/v1/workspaces/ws-b/rag:query';
  const calls = [];
  const external = [];
  const pageErrors = [];
  const authResponses = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    const category = /^\/api\/v1\/(session|scope-revisions|workspaces)(?:\/|$)/.exec(path)?.[1];
    if (category && response.request().method() === 'GET') {
      authResponses.push(category + '=' + response.status());
      if (authResponses.length > 12) authResponses.shift();
    }
  });
  // The board loads a public holiday calendar independently of the assistant.
  // Serve only that fixed, read-only URL locally and still catch every other fetch.
  const publicCalendar = /^https:\/\/cdn\.jsdelivr\.net\/gh\/ruyut\/TaiwanCalendar\/data\/(\d{4})\.json$/;
  await page.route(publicCalendar, async route => {
    const request = route.request();
    if (request.method() !== 'GET' || request.postData()) throw new Error('Unexpected public calendar request');
    const year = new URL(request.url()).pathname.slice(-9, -5);
    await route.fulfill({ json: [{ date: year + '0101', isHoliday: true }] });
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === ragPath) calls.push(request);
    if (['https:', 'http:'].includes(url.protocol) && url.origin !== baseUrl
      && !publicCalendar.test(request.url()) && ['fetch', 'xhr'].includes(request.resourceType())) external.push(url.origin);
  });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  let step = 'load real product with isolated Session';
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([{ name: '__session', value: 'qa-browser', url: `${baseUrl}/` }]);
    await page.evaluate(() => {
      localStorage.setItem('projed-last-ws', 'ws-b');
      localStorage.setItem('projed-last-board', 'board-shared');
      localStorage.setItem('projed-last-view', 'board');
    });
    const [sessionResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/session'),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    const session = (await sessionResponse.json()).data;
    await page.locator('[data-task-id="shared-parent"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const startupSessionReads = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname === '/api/v1/session').length);
    assert(startupSessionReads === 1, 'main startup looked up the same Session ' + startupSessionReads + ' times');
    step = 'open the normal AI button';
    const ai = page.getByRole('button', { name: 'AI', exact: true });
    assert(await ai.isEnabled(), 'HTTP backend still disables the normal AI button');
    await ai.click();
    await page.getByRole('heading', { name: '專案智慧助理' }).waitFor({ state: 'visible' });
    assert(calls.length === 0, 'opening the panel dispatched a query');
    const question = 'Synthetic QA: what is the current project status?';
    const input = page.getByPlaceholder('詢問這個專案...');
    await input.fill(question);
    step = 'submit once through real HTTP and receive unqualified provider rejection';
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === ragPath),
      page.getByRole('button', { name: '送出', exact: true }).click(),
    ]);
    assert(response.status() === 503, 'unqualified RAG unexpectedly returned a different status');
    assert((await response.json()).error?.code === 'RAG_PROVIDER_UNAVAILABLE', 'RAG did not fail closed at its provider gate');
    await page.getByRole('alert').filter({ hasText: '智慧助理目前尚未開放查詢，問題已保留。' }).waitFor({ state: 'visible' });
    assert(await input.inputValue() === question, 'failed query was lost from the input');
    assert(calls.length === 1, 'manual query was automatically retried');
    const headers = await calls[0].allHeaders();
    assert(headers['x-projed-expected-account-id'] === session.localUserId, 'query lost its authenticated account binding');
    assert(headers['x-projed-expected-context-id'] === session.authContextId, 'query lost its Session binding');
    assert(calls[0].postDataJSON().projectId === 'board-shared', 'query lost its board scope');
    step = 'preserve the controlled state on narrow screen and reopen';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '關閉', exact: true }).click();
    await ai.click();
    assert(await input.inputValue() === question, 'closing the panel discarded the retained question');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'RAG overflows the mobile viewport');
    assert(calls.length === 1, 'unexpected RAG query count ' + calls.length);
    assert(external.length === 0, 'unexpected HTTP destinations ' + JSON.stringify(external));
    assert(pageErrors.length === 0, 'unexpected browser errors ' + JSON.stringify(pageErrors));
    await page.screenshot({ path: 'output/playwright/dev-139-rag-ui/unavailable-mobile.png', fullPage: false });
    const login = page.getByRole('button', { name: /檢查 Jenfu-Platform 登入/ });
    const waitForRejectedRead = (status, code) => page.waitForResponse(async reply => {
      const path = new URL(reply.url()).pathname;
      if (!(path === '/api/v1/scope-revisions' || path === '/api/v1/workspaces' || path.startsWith('/api/v1/workspaces/'))
        || reply.request().method() !== 'GET' || reply.status() !== status) return false;
      return (await reply.json()).error?.code === code;
    });
    step = 'switch the cookie while the original private panel remains open';
    const switched = waitForRejectedRead(409, 'ACTOR_CHANGED');
    await page.context().addCookies([{ name: '__session', value: 'qa-browser-collaborator', url: `${baseUrl}/` }]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await switched;
    await login.waitFor();
    assert(!await input.isVisible(), 'old private question still visible after the server rejected the previous actor');
    step = 'use the normal login check for the new actor';
    const [rebound] = await Promise.all([
      page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/v1/session'),
      login.click(),
    ]);
    const newSession = await rebound.json();
    assert(rebound.ok(), 'new Session read returned HTTP ' + rebound.status() + ' ' + (newSession.error?.code ?? ''));
    assert(newSession.data?.localUserId && newSession.data.localUserId !== session.localUserId, 'login did not resolve the other actor');
    await page.locator('nav').waitFor();
    step = 'lose the new Session cookie and wait for the first rejected canonical read';
    const expired = waitForRejectedRead(401, 'ACTOR_INVALID');
    await page.context().clearCookies({ name: '__session' });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expired;
    await login.waitFor();
    assert(!await page.locator('nav').isVisible() && !await input.isVisible(), 'private application stayed visible after Session loss');
    const artifact = { result: 'PASS', evidenceLevel: 'DEV139_REAL_HTTP_PRODUCT_RAG_UNQUALIFIED_UI',
      provider: 'NOT_CALLED_UNQUALIFIED', identity: 'ISOLATED_SESSION', queryCount: calls.length,
      status: 503, code: 'RAG_PROVIDER_UNAVAILABLE', questionRetained: true, actorHeadersBound: true, startupSessionReads,
      switchedActorRejected: 409, newActorRebound: true, missingSessionRejected: 401, privateUiClosed: true,
      viewports: ['1440x900', '390x844'], externalRequests: external.length, pageErrors,
      screenshot: 'output/playwright/dev-139-rag-ui/unavailable-mobile.png' };
    await page.evaluate(value => { window.__DEV139_RAG_UI_ARTIFACT = value; }, artifact);
    return artifact;
  } catch (error) {
    throw new Error(`RAG UI smoke failed at ${step}: ${error instanceof Error ? error.message : String(error)}; recent reads: ${authResponses.join(', ')}`);
  }
}
