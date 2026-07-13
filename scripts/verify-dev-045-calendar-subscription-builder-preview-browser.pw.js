/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const account = {
    id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
    displayName: 'ProJED local QA', createdAt: 1704067200000,
  };

  const seedSession = () => page.evaluate(({ account }) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
  }, { account });

  const openPage = async (viewport, reset = false) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    if (reset) {
      await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18&qcCalendarBoards=2', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await seedSession();
    }
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'calendar_subscriptions'));
    await page.goto('http://127.0.0.1:4173/?qcCalendarBoards=2', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-calendar-subscription-local-preview="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-calendar-subscription-preview-source-state="ready"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const builder = () => page.locator('[data-calendar-subscription-builder="true"]').first();
  const panel = () => builder().locator('[data-calendar-subscription-filter-panel="true"]');
  const count = async attr => Number(await builder().getAttribute(attr));
  const waitCount = (attr, predicate) => page.waitForFunction(
    ({ attr, predicate }) => {
      const value = Number(document.querySelector('[data-calendar-subscription-builder="true"]')?.getAttribute(attr));
      return predicate === 'positive' ? value > 0 : predicate === 'zero' ? value === 0 : predicate === 'one' ? value === 1 : value === 2;
    },
    { attr, predicate },
    { timeout: 10000 },
  );
  const assertNoOverflow = async label => {
    const sizes = await page.evaluate(() => ({
      body: [document.body.scrollWidth, document.body.clientWidth],
      root: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    }));
    assert(sizes.body[0] <= sizes.body[1] + 1 && sizes.root[0] <= sizes.root[1] + 1, `${label} horizontal overflow`, sizes);
  };
  const openFilters = async () => {
    const toggle = builder().locator('[data-calendar-subscription-filter-toggle="true"]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await panel().waitFor({ state: 'visible', timeout: 5000 });
  };

  let step = 'open desktop';
  try {
    await openPage({ width: 1440, height: 900 }, true);
    assert(await builder().getAttribute('data-calendar-subscription-builder-version') === '3', 'builder should expose v3');
    assert(await count('data-calendar-subscription-builder-snapshot-board-count') === 2, 'fixture should expose two board snapshots');
    const initialPreview = await count('data-calendar-subscription-builder-preview-count');
    const initialEventCount = await count('data-calendar-subscription-builder-preview-event-count');
    const initialTaskCount = await count('data-calendar-subscription-builder-preview-task-count');
    assert(initialPreview > 0 && initialPreview === initialEventCount, 'preview should expose seeded calendar events', { initialPreview, initialEventCount });
    assert(initialTaskCount > 0 && initialTaskCount <= initialEventCount, 'event projection should expose task-to-event counts', { initialTaskCount, initialEventCount });
    const text = await builder().innerText();
    assert(!text.includes('全域條件') && !text.includes('沿用') && !text.includes('override'), 'legacy inheritance UI must be absent', { text });
    assert(text.includes('訂閱事件預覽') && text.includes('行事曆事件') && text.includes('任何持有此連結的人都能讀取'), 'event preview summary and link warning should be visible');
    const eventSummary = await builder().locator('[data-calendar-subscription-event-summary="true"]').innerText();
    assert(eventSummary.includes('張看板') && eventSummary.includes('項任務') && eventSummary.includes('開始') && eventSummary.includes('到期'), 'summary should explain scope and event projection', { eventSummary });
    const previewEvents = builder().locator('[data-calendar-subscription-preview-event="true"]');
    assert(await previewEvents.count() > 0, 'event preview should render event rows');
    const defaultEventTypes = await previewEvents.evaluateAll(events => events.map(event => event.getAttribute('data-preview-event-date-type')));
    assert(defaultEventTypes.every(type => type === 'due_date'), 'default due-only boards should render only due events', { defaultEventTypes });
    const eventProjectionComplete = await previewEvents.evaluateAll(events => events.every(event =>
      Boolean(event.getAttribute('data-preview-event-task-id')) &&
      Boolean(event.getAttribute('data-preview-event-board-id')) &&
      Boolean(event.getAttribute('data-preview-event-date')) &&
      ['start_date', 'due_date'].includes(event.getAttribute('data-preview-event-date-type'))
    ));
    assert(eventProjectionComplete, 'every preview row should identify one concrete ICS event');
    const previewListOverflow = await builder().locator('[data-calendar-subscription-preview-events="true"]').evaluate(element => getComputedStyle(element).overflowY);
    assert(!['auto', 'scroll'].includes(previewListOverflow), 'event list should not create a nested vertical scrollbar', { previewListOverflow });
    const dateGroup = builder().locator('[data-calendar-subscription-preview-group="date"]');
    const boardGroup = builder().locator('[data-calendar-subscription-preview-group="board"]');
    assert(await dateGroup.getAttribute('aria-pressed') === 'true', 'date grouping should be the default calendar mental model');
    await boardGroup.click();
    assert(await boardGroup.getAttribute('aria-pressed') === 'true', 'board grouping should be available for scope audit');
    await dateGroup.click();
    const localPreview = page.locator('[data-calendar-subscription-local-preview="true"]');
    const submitButton = localPreview.locator('[data-calendar-subscription-submit="true"]');
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    assert(await submitButton.isDisabled(), 'local preview submit CTA must be disabled');
    assert((await submitButton.innerText()).includes('建立訂閱並複製連結'), 'submit CTA should state the final action');
    const blockedReason = await localPreview.locator('[data-calendar-subscription-save-block-reason="true"]').innerText();
    assert(blockedReason.includes('已連接 Supabase 的環境'), 'disabled CTA should explain the actionable next environment', { blockedReason });
    const snapshotSummary = await localPreview.locator('[data-calendar-subscription-snapshot-summary="true"]').innerText();
    assert(snapshotSummary.includes('2 / 2 張看板'), 'subscription-level summary should stay visible before submit', { snapshotSummary });
    await assertNoOverflow('1440x900');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-desktop.png', fullPage: false });

    step = 'per-board state isolation';
    await openFilters();
    const boardSelect = panel().locator('[data-calendar-subscription-board-select="true"]');
    const boardIds = await boardSelect.locator('option').evaluateAll(options => options.map(option => option.value));
    assert(boardIds.length === 2, 'board selector should contain two boards', { boardIds });
    const startDate = panel().locator('[data-calendar-subscription-board-date-type="start_date"]');
    const dueDate = panel().locator('[data-calendar-subscription-board-date-type="due_date"]');
    assert(!await startDate.isChecked() && await dueDate.isChecked(), 'board A should default to due date');
    await startDate.check();
    await dueDate.uncheck();
    await page.waitForTimeout(150);
    await panel().getByRole('button', { name: '關閉過濾器' }).click();
    const expandPreview = builder().locator('[data-calendar-subscription-preview-expand="true"]');
    if (await expandPreview.count()) await expandPreview.click();
    const boardAEventTypes = await builder().locator(`[data-calendar-subscription-preview-event="true"][data-preview-event-board-id="${boardIds[0]}"]`).evaluateAll(events => events.map(event => event.getAttribute('data-preview-event-date-type')));
    const boardBEventTypes = await builder().locator(`[data-calendar-subscription-preview-event="true"][data-preview-event-board-id="${boardIds[1]}"]`).evaluateAll(events => events.map(event => event.getAttribute('data-preview-event-date-type')));
    assert(boardAEventTypes.length > 0 && boardAEventTypes.every(type => type === 'start_date'), 'board A should project only its selected start events', { boardAEventTypes });
    assert(boardBEventTypes.length > 0 && boardBEventTypes.every(type => type === 'due_date'), 'board B should retain its selected due events', { boardBEventTypes });
    await openFilters();
    const keyword = panel().getByPlaceholder('搜尋任務名稱');
    await keyword.fill('__dev045_board_a_only__');
    await page.waitForTimeout(150);
    const isolatedCount = await count('data-calendar-subscription-builder-preview-count');
    assert(isolatedCount > 0 && isolatedCount < initialPreview, 'editing board A should leave board B preview intact', { isolatedCount, initialPreview });
    await boardSelect.selectOption(boardIds[1]);
    assert(await keyword.inputValue() === '', 'board B should retain its independent default');
    assert(!await startDate.isChecked() && await dueDate.isChecked(), 'board B event date should remain independent');
    await boardSelect.selectOption(boardIds[0]);
    assert(await keyword.inputValue() === '__dev045_board_a_only__', 'board A draft should survive board switching');
    assert(await startDate.isChecked() && !await dueDate.isChecked(), 'board A event date should survive board switching');
    await startDate.uncheck();
    assert((await builder().innerText()).includes('尚未選擇事件日期'), 'included board without an event date should block completion');
    await panel().getByRole('button', { name: '重設' }).click();
    await page.waitForTimeout(150);
    assert(await keyword.inputValue() === '', 'reset should affect current board');
    assert(!await startDate.isChecked() && await dueDate.isChecked(), 'reset should restore current board event date');

    step = 'exclude and copy without linkage';
    await panel().locator('[data-calendar-subscription-board-included-toggle="true"]').uncheck();
    await waitCount('data-calendar-subscription-builder-board-count', 'one');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-excluded.png', fullPage: false });
    await boardSelect.selectOption(boardIds[1]);
    await panel().locator('[data-calendar-subscription-board-included-toggle="true"]').uncheck();
    await waitCount('data-calendar-subscription-builder-board-count', 'zero');
    assert((await builder().innerText()).includes('請開啟至少一張看板'), 'all-excluded state should provide a recovery action');
    await panel().locator('[data-calendar-subscription-board-included-toggle="true"]').check();
    await boardSelect.selectOption(boardIds[0]);
    await panel().locator('[data-calendar-subscription-board-included-toggle="true"]').check();
    await waitCount('data-calendar-subscription-builder-board-count', 'two');
    await keyword.fill('copy-marker');
    await startDate.check();
    await dueDate.uncheck();
    await panel().locator('[data-calendar-subscription-copy-filters-toggle="true"]').click();
    const copyPanel = panel().locator('[data-calendar-subscription-copy-panel="true"]');
    await copyPanel.locator('input[type="checkbox"]').check();
    await copyPanel.locator('[data-calendar-subscription-copy-apply="true"]').click();
    await boardSelect.selectOption(boardIds[1]);
    assert(await keyword.inputValue() === 'copy-marker', 'batch copy should overwrite target conditions');
    assert(await startDate.isChecked() && !await dueDate.isChecked(), 'batch copy should overwrite target event dates');
    await keyword.fill('board-b-independent');
    await startDate.uncheck();
    await dueDate.check();
    await boardSelect.selectOption(boardIds[0]);
    assert(await keyword.inputValue() === 'copy-marker', 'target edits after copy must not link back to source');
    assert(await startDate.isChecked() && !await dueDate.isChecked(), 'target event date edits must not link back to source');
    await panel().getByRole('button', { name: '重設' }).click();
    await boardSelect.selectOption(boardIds[1]);
    await panel().getByRole('button', { name: '重設' }).click();
    await builder().getByRole('button', { name: '關閉過濾器' }).click();

    step = 'tablet viewport';
    await openPage({ width: 1024, height: 768 });
    await assertNoOverflow('1024x768');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-tablet.png', fullPage: false });

    step = 'mobile drawer and focus restore';
    await openPage({ width: 390, height: 844 });
    await builder().locator('[data-calendar-subscription-live-preview="true"]').scrollIntoViewIfNeeded();
    await assertNoOverflow('390x844 event preview');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-mobile-events.png', fullPage: false });
    await openFilters();
    await assertNoOverflow('390x844 drawer');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-mobile.png', fullPage: false });
    await page.keyboard.press('Escape');
    await panel().waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForFunction(() => {
      const toggle = document.querySelector('[data-calendar-subscription-filter-toggle="true"]');
      return document.activeElement === toggle;
    }, undefined, { timeout: 2000 }).catch(() => undefined);
    const focusedToggle = await builder().locator('[data-calendar-subscription-filter-toggle="true"]').evaluate(element => document.activeElement === element);
    assert(focusedToggle, 'Escape should restore focus to filter toggle');

    step = 'minimum viewport';
    await openPage({ width: 320, height: 700 });
    await builder().locator('[data-calendar-subscription-live-preview="true"]').scrollIntoViewIfNeeded();
    await assertNoOverflow('320x700 event preview');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-mobile-320-events.png', fullPage: false });
    await openFilters();
    await assertNoOverflow('320x700 drawer');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-v3-mobile-320.png', fullPage: false });

    const bodyText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(bodyText), 'visible runtime error');
    const severeDiagnostics = diagnostics.filter(item => /pageerror|console:error/i.test(item));
    assert(severeDiagnostics.length === 0, 'browser diagnostics should have no errors', { severeDiagnostics });

    return {
      passed: true,
      screenshots: [
        'output/playwright/dev-045-calendar-v3-desktop.png',
        'output/playwright/dev-045-calendar-v3-excluded.png',
        'output/playwright/dev-045-calendar-v3-tablet.png',
        'output/playwright/dev-045-calendar-v3-mobile-events.png',
        'output/playwright/dev-045-calendar-v3-mobile.png',
        'output/playwright/dev-045-calendar-v3-mobile-320-events.png',
        'output/playwright/dev-045-calendar-v3-mobile-320.png',
      ],
      diagnostics: diagnostics.slice(-20),
    };
  } catch (error) {
    throw new Error(`${step}: ${error.message}; diagnostics=${JSON.stringify(diagnostics.slice(-20))}`);
  }
}
