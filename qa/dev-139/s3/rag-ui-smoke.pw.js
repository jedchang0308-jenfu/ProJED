/* eslint-disable */
async (page) => {
  const baseUrl = new URL(page.url()).origin;
  const ragPath = '/api/v1/workspaces/ws-b/rag:query';
  const calls = [];
  const external = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === ragPath) calls.push(request);
    if (url.origin !== baseUrl && ['fetch', 'xhr'].includes(request.resourceType())) external.push(url.origin);
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
    assert(calls.length === 1 && external.length === 0 && pageErrors.length === 0, 'unexpected query, external fetch or page error');
    await page.screenshot({ path: 'output/playwright/dev-139-rag-ui/unavailable-mobile.png', fullPage: false });
    const artifact = { result: 'PASS', evidenceLevel: 'DEV139_REAL_HTTP_PRODUCT_RAG_UNQUALIFIED_UI',
      provider: 'NOT_CALLED_UNQUALIFIED', identity: 'ISOLATED_SESSION', queryCount: calls.length,
      status: 503, code: 'RAG_PROVIDER_UNAVAILABLE', questionRetained: true, actorHeadersBound: true,
      viewports: ['1440x900', '390x844'], externalRequests: external.length, pageErrors,
      screenshot: 'output/playwright/dev-139-rag-ui/unavailable-mobile.png' };
    await page.evaluate(value => { window.__DEV139_RAG_UI_ARTIFACT = value; }, artifact);
    return artifact;
  } catch (error) {
    throw new Error(`RAG UI smoke failed at ${step}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
