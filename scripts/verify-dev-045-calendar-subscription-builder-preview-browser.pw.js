/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => {
    diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    diagnostics.push(`pageerror:${error.message}`);
  });

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

  const seedSession = async () => {
    await page.evaluate(({ account }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, { account });
  };

  const openCalendarSubscriptionPage = async (viewport = { width: 1440, height: 900 }, reset = true) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    if (reset) {
      await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await seedSession();
    }
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'calendar_subscriptions'));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-calendar-settings-scope="external-link"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-calendar-subscription-local-preview="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-calendar-subscription-builder="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const builder = () => page.locator('[data-calendar-subscription-builder="true"]').first();

  const getBuilderCount = async (attr) => {
    const value = await builder().getAttribute(attr);
    const count = Number(value);
    assert(Number.isFinite(count), `builder ${attr} should be numeric`, { value });
    return count;
  };

  const waitForBuilderCount = async (attr, mode, target, label) => {
    await page.waitForFunction(
      ({ attr, mode, target, label }) => {
        const element = document.querySelector('[data-calendar-subscription-builder="true"]');
        const count = Number(element?.getAttribute(attr));
        window.__dev045LastBuilderCount = { attr, label, count };
        if (!Number.isFinite(count)) return false;
        if (mode === 'eq') return count === target;
        if (mode === 'gt') return count > target;
        if (mode === 'lt') return count < target;
        return false;
      },
      { attr, mode, target, label },
      { timeout: 10000 },
    );
  };

  const assertNoHorizontalOverflow = async (label) => {
    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
    }));
    assert(
      overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1 &&
        overflow.rootScrollWidth <= overflow.rootClientWidth + 1,
      `${label} should not have horizontal overflow`,
      overflow,
    );
  };

  let step = 'open desktop calendar subscription builder';
  try {
    await openCalendarSubscriptionPage();

    step = 'desktop builder default preview';
    const desktopText = await builder().innerText();
    assert(desktopText.includes('建立行事曆訂閱'), 'builder should show subscription builder title', { desktopText });
    assert(desktopText.includes('全域條件'), 'builder should expose global filter conditions', { desktopText });
    assert(desktopText.includes('看板條件'), 'builder should expose per-board conditions', { desktopText });
    assert(desktopText.includes('即時預覽'), 'builder should expose live preview', { desktopText });
    assert(desktopText.includes('任何持有此連結的人都能讀取'), 'builder should show external-link risk warning', { desktopText });
    const initialBoardCount = await getBuilderCount('data-calendar-subscription-builder-board-count');
    const initialPreviewCount = await getBuilderCount('data-calendar-subscription-builder-preview-count');
    assert(initialBoardCount >= 1, 'builder should include at least one accessible board', { initialBoardCount });
    assert(initialPreviewCount > 0, 'local-test builder should preview seeded calendar tasks', { initialPreviewCount });
    await assertNoHorizontalOverflow('DEV-045 desktop default builder');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-builder-desktop.png', fullPage: false });

    step = 'desktop builder empty preview via keyword';
    await builder().getByPlaceholder('任務名稱').fill('__dev045_no_match__');
    await waitForBuilderCount(
      'data-calendar-subscription-builder-preview-count',
      'eq',
      0,
      'empty keyword preview',
    );
    const emptyText = await builder().innerText();
    assert(emptyText.includes('目前沒有符合條件且具備所選日期的任務'), 'builder should show empty preview state', { emptyText });
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-builder-empty.png', fullPage: false });
    await builder().getByRole('button', { name: /重設/ }).click();
    await waitForBuilderCount(
      'data-calendar-subscription-builder-preview-count',
      'gt',
      0,
      'reset preview',
    );

    step = 'desktop builder board exclude and custom override';
    await builder().getByRole('button', { name: /排除/ }).click();
    await waitForBuilderCount(
      'data-calendar-subscription-builder-board-count',
      'lt',
      initialBoardCount,
      'exclude board count',
    );
    const excludedBoardCount = await getBuilderCount('data-calendar-subscription-builder-board-count');
    const excludedText = await builder().innerText();
    assert(
      excludedText.includes('這張看板不會出現在預覽摘要或輸出的訂閱範圍'),
      'exclude mode should explain output scope removal',
      { excludedBoardCount, excludedText },
    );
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-builder-exclude.png', fullPage: false });

    await builder().getByRole('button', { name: /自訂/ }).click();
    await builder().locator('[data-calendar-subscription-board-override="true"] [data-calendar-subscription-condition-controls="true"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
    const customText = await builder().locator('[data-calendar-subscription-board-override="true"]').innerText();
    assert(customText.includes('此看板自訂條件'), 'custom override should expose board-specific filter controls', { customText });
    await builder().getByRole('button', { name: /重設/ }).click();
    await waitForBuilderCount(
      'data-calendar-subscription-builder-board-count',
      'eq',
      initialBoardCount,
      'reset board count',
    );

    step = 'mobile builder layout';
    await openCalendarSubscriptionPage({ width: 390, height: 844 }, false);
    const mobileText = await builder().innerText();
    assert(mobileText.includes('建立行事曆訂閱'), 'mobile should show builder title', { mobileText });
    await assertNoHorizontalOverflow('DEV-045 mobile builder');
    await page.screenshot({ path: 'output/playwright/dev-045-calendar-builder-mobile.png', fullPage: false });

    const visibleText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(visibleText), 'calendar builder should not show visible runtime errors');

    return {
      passed: true,
      screenshots: [
        'output/playwright/dev-045-calendar-builder-desktop.png',
        'output/playwright/dev-045-calendar-builder-empty.png',
        'output/playwright/dev-045-calendar-builder-exclude.png',
        'output/playwright/dev-045-calendar-builder-mobile.png',
      ],
      diagnostics: diagnostics.slice(-20),
    };
  } catch (error) {
    throw new Error(`${step}: ${error.message}; diagnostics=${JSON.stringify(diagnostics.slice(-20))}`);
  }
}
