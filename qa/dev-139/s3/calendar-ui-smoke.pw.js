/* eslint-disable */
async (page) => {
  const baseUrl = new URL(page.url()).origin;
  const subscriptionsPath = '/api/v1/calendar-subscriptions';
  const artifactDirectory = 'output/playwright/dev-139-calendar-ui';
  const pageErrors = [];
  const unexpectedExternalRequests = [];
  let otherContext;
  let step = 'load the isolated owner through the normal product entry';
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const publicCalendar = /^https:\/\/cdn\.jsdelivr\.net\/gh\/ruyut\/TaiwanCalendar\/data\/(\d{4})\.json$/;
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'fonts.googleapis.com' && request.method() === 'GET') {
      await route.fulfill({ contentType: 'text/css', body: '' });
    } else if (request.method() === 'GET'
      && ((url.hostname === 'accounts.google.com' && url.pathname === '/gsi/client')
        || (url.hostname === 'apis.google.com' && url.pathname === '/js/api.js'))) {
      await route.fulfill({ contentType: 'application/javascript', body: '' });
    } else if (publicCalendar.test(request.url()) && request.method() === 'GET') {
      await route.fulfill({ json: [] });
    } else if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseUrl) {
      unexpectedExternalRequests.push(url.origin);
      await route.abort();
    } else await route.fallback();
  });
  // Exercise the normal copy caller without changing the host clipboard or
  // persisting its bearer URL. Calendar HTTP responses remain unmodified.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  const openCalendar = async () => {
    const menu = page.locator('[data-app-more-menu="true"]');
    await menu.locator('summary').click();
    const settings = page.locator('[data-app-more-settings="true"]');
    if (await settings.getAttribute('aria-current') === 'page') await menu.locator('summary').click();
    else await settings.click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible' });
    await page.locator('[data-settings-section-tab="calendar"]').click();
    await page.locator('[data-calendar-subscription-view-mode="list"]').waitFor({ state: 'visible' });
  };
  const uiResponse = async (path, method, action) => {
    const [response] = await Promise.all([
      page.waitForResponse(reply => new URL(reply.url()).pathname === path && reply.request().method() === method),
      action(),
    ]);
    assert(response.ok(), `normal Calendar ${method} failed (${response.status()})`);
    return response;
  };
  const feedUrl = value => {
    const url = new URL(value, baseUrl);
    assert(url.origin === baseUrl && !url.search && !url.hash && !url.username && !url.password
      && /^\/api\/v1\/calendar-feeds\/[A-Za-z0-9_-]{43}\.ics$/.test(url.pathname), 'unexpected Calendar bearer URL shape');
    return url.href;
  };
  const readFeed = async (url, expectedStatus) => {
    // Never propagate Playwright's request error, which can contain the token.
    let response;
    try { response = await otherContext.request.get(url); }
    catch { throw new Error('Calendar anonymous feed transport failed (bearer URL omitted)'); }
    assert(response.status() === expectedStatus, `Calendar anonymous feed returned ${response.status()}, expected ${expectedStatus}`);
    assert(response.headers()['cache-control'] === 'no-store', 'Calendar feed is missing no-store');
    return expectedStatus === 200 ? response.text() : '';
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([{ name: '__session', value: 'qa-browser', url: baseUrl + '/' }]);
    await page.evaluate(() => {
      localStorage.setItem('projed-last-ws', 'ws-b');
      localStorage.setItem('projed-last-board', 'board-shared');
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-task-id="shared-parent"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const session = (await (await page.request.get(baseUrl + '/api/v1/session')).json()).data;
    const ownerHeaders = {
      'x-projed-expected-account-id': session.localUserId,
      'x-projed-expected-context-id': session.authContextId,
    };
    const references = await page.request.get(baseUrl + subscriptionsPath + '/references', { headers: ownerHeaders });
    assert(references.ok(), 'Calendar owner references were unavailable');
    const sharedBoard = (await references.json()).data.boards.find(board => board.appBoardId === 'board-shared');
    assert(sharedBoard, 'existing fixture has no Calendar shared-board reference');
    await openCalendar();
    await page.locator('[data-calendar-subscription-create-new="true"]').click();
    const builder = page.locator('[data-calendar-subscription-builder="true"]');
    await builder.locator('[data-calendar-subscription-filter-toggle="true"]').click();
    const boardSelect = builder.locator('[data-calendar-subscription-board-select="true"]');
    const boardIds = await boardSelect.locator('option').evaluateAll(options => options.map(option => option.value));
    assert(boardIds.includes('board-shared'), 'normal Calendar builder has no shared-board option');
    for (const boardId of boardIds) {
      await boardSelect.selectOption(boardId);
      await builder.locator('[data-calendar-subscription-board-included-toggle="true"]').setChecked(boardId === 'board-shared');
    }
    await boardSelect.selectOption('board-shared');
    await builder.locator('[data-calendar-subscription-board-date-type="start_date"]').check();
    await builder.locator('[data-calendar-subscription-board-date-type="due_date"]').check();
    const name = 'DEV139 normal Calendar UI ' + Date.now();
    await page.getByLabel('訂閱名稱', { exact: true }).fill(name);
    await page.locator('[data-calendar-subscription-preview-source-state="ready"]').waitFor();
    await builder.locator('[data-calendar-subscription-preview-event="true"]').filter({ hasText: 'Calendar UI shared event' }).first().waitFor();

    step = 'create the subscription through the normal submit button';
    const createdResponse = await uiResponse(subscriptionsPath, 'POST', () => page.locator('[data-calendar-subscription-submit="true"]').click());
    const created = (await createdResponse.json()).data;
    const originalFeedUrl = feedUrl(created.feedUrl);
    const subscriptionId = created.subscription.id;
    const itemPath = subscriptionsPath + '/' + encodeURIComponent(subscriptionId);
    // The v4 payload preserves excluded board snapshots too. Only the shared
    // board may be included; retaining other snapshots does not grant a feed.
    const includedBoardIds = Object.entries(created.subscription.filters.board_filters)
      .filter(([, snapshot]) => snapshot.included).map(([id]) => id);
    assert(includedBoardIds.length === 1 && includedBoardIds[0] === sharedBoard.id,
      'Calendar UI included another board scope');
    const row = () => page.locator('[data-calendar-subscription-view-mode="list"] article').filter({ hasText: name });
    await row().waitFor({ state: 'visible' });

    step = 'reload and edit the persisted subscription through normal settings';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openCalendar();
    await row().waitFor({ state: 'visible' });
    assert(!await row().getByRole('button', { name: '複製', exact: true }).count(), 'reload exposed the one-time bearer URL again');
    await row().getByRole('button', { name: '修改', exact: true }).click();
    const finalName = name + ' saved';
    await page.getByLabel('訂閱名稱', { exact: true }).fill(finalName);
    const updatedResponse = await uiResponse(itemPath, 'PATCH', () => page.locator('[data-calendar-subscription-submit="true"]').click());
    const updated = (await updatedResponse.json()).data;
    assert(updated.id === subscriptionId && updated.name === finalName
      && JSON.stringify(updated.filters) === JSON.stringify(created.subscription.filters), 'normal update changed the subscription identity or filters');

    otherContext = await page.context().browser().newContext({ serviceWorkers: 'block' });
    await otherContext.addCookies([{ name: '__session', value: 'qa-browser-collaborator', url: baseUrl + '/' }]);
    const otherSession = (await (await otherContext.request.get(baseUrl + '/api/v1/session')).json()).data;
    const otherList = await otherContext.request.get(baseUrl + subscriptionsPath, { headers: {
      'x-projed-expected-account-id': otherSession.localUserId,
      'x-projed-expected-context-id': otherSession.authContextId,
    } });
    assert(otherList.ok() && !(await otherList.json()).data.some(item => item.id === subscriptionId), 'another account received the owner subscription');
    await otherContext.clearCookies();

    step = 'read real ICS without a human Session and exclude the private board';
    const ics = await readFeed(originalFeedUrl, 200);
    assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT')
      && ics.includes('Calendar UI shared event') && !ics.includes('B secret')
      && !ics.includes('Calendar UI private event'), 'real ICS lost the shared event or disclosed the excluded private board');
    const statuses = [];
    step = 'disable and enable through the persisted subscription controls';
    await uiResponse(itemPath + '/disable', 'POST', () => row().getByRole('button', { name: '停用', exact: true }).click());
    await readFeed(originalFeedUrl, 410);
    statuses.push(410);
    await uiResponse(itemPath + '/enable', 'POST', () => row().getByRole('button', { name: '啟用', exact: true }).click());
    await readFeed(originalFeedUrl, 200);
    statuses.push(200);
    step = 'rotate through the normal button and revoke the original bearer';
    const rotatedResponse = await uiResponse(itemPath + '/rotate-token', 'POST', () => row().getByRole('button', { name: '重生連結', exact: true }).click());
    const rotatedFeedUrl = feedUrl((await rotatedResponse.json()).data);
    assert(rotatedFeedUrl !== originalFeedUrl, 'Calendar token rotation reused the original bearer');
    await readFeed(originalFeedUrl, 404);
    await readFeed(rotatedFeedUrl, 200);
    statuses.push(404, 200);
    await uiResponse(itemPath + '/disable', 'POST', () => row().getByRole('button', { name: '停用', exact: true }).click());
    await readFeed(rotatedFeedUrl, 410);
    statuses.push(410);

    step = 'reload the final disabled state and capture token-free evidence';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openCalendar();
    await row().getByRole('button', { name: '啟用', exact: true }).waitFor();
    assert(!await row().getByRole('button', { name: '複製', exact: true }).count(), 'final reload retained a one-time bearer URL');
    assert(pageErrors.length === 0 && unexpectedExternalRequests.length === 0,
      `Calendar browser emitted errors or external requests: ${JSON.stringify({ pageErrors, externalOrigins: unexpectedExternalRequests })}`);
    await page.screenshot({ path: artifactDirectory + '/disabled.png', fullPage: false });
    const artifact = {
      result: 'PASS',
      evidenceLevel: 'NORMAL_CALENDAR_UI_REAL_ISOLATED_HTTP_POSTGRES_ICS',
      identity: 'SYNTHETIC_ISOLATED_OWNER_SESSION',
      clipboard: 'MEMORY_ONLY_WRITE_PORT_NO_HOST_CLIPBOARD',
      publicHolidayCalendar: 'LOCAL_READ_ONLY_FIXTURE',
      googleSdkAssets: 'LOCAL_EMPTY_STATIC_FIXTURES',
      providerCalls: 'NOT_REQUESTED',
      subscriptionId,
      ownerUserId: session.localUserId,
      name: finalName,
      filters: updated.filters,
      isActive: false,
      normalCreateReloadAndUpdate: true,
      sharedBoardOnly: true,
      anonymousIcsContainsSharedEvent: true,
      privateBoardLeak: false,
      otherAccountSubscriptionVisible: false,
      disableEnableRotateStatuses: statuses,
      tokenOrFeedUrlPersisted: false,
      databaseReconciliation: 'PENDING_RUNNER_DIRECT_SQL_READBACK_AND_OWNED_CLEANUP',
    };
    await page.evaluate(value => { window.__DEV139_CALENDAR_UI = value; }, artifact);
    return artifact;
  } catch (error) {
    await page.screenshot({ path: artifactDirectory + '/failure.png', fullPage: false,
      mask: [page.locator('[data-calendar-subscription-view-mode="list"]')] }).catch(() => {});
    const safeMessage = String(error instanceof Error ? error.message : error)
      .replace(/\/api\/v1\/calendar-feeds\/[^\s"'<>]+/g, '/api/v1/calendar-feeds/[REDACTED]');
    throw new Error(`DEV139 Calendar UI failed at ${step}: ${safeMessage}`);
  } finally {
    await otherContext?.close();
  }
}
