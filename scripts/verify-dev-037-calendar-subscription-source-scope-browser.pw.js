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

  const openApp = async (viewport = { width: 1440, height: 900 }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openCalendarSettings = async () => {
    const settingsButton = page.locator('[data-sidebar-settings-button="true"]').first();
    if (await settingsButton.count() === 0) {
      await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    }
    await page.locator('[data-sidebar-settings-button="true"]').first().click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-section-tab="calendar"]').click();
    await page.locator('[data-calendar-settings-scope="external-link"]').waitFor({ state: 'visible', timeout: 10000 });
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

  let step = 'open calendar settings desktop';
  try {
    await openApp();
    await openCalendarSettings();

    step = 'calendar settings scope wrapper';
    const wrapperText = await page.locator('[data-calendar-settings-scope="external-link"]').innerText();
    assert(wrapperText.includes('外部連結'), 'calendar settings should expose external-link scope', { wrapperText });
    assert(wrapperText.includes('來源範圍由訂閱條件決定'), 'calendar settings should explain source scope ownership', { wrapperText });

    step = 'calendar source-scope UI or explicit Supabase fallback';
    const sourceScopeForm = page.locator('[data-calendar-subscription-scope-form="true"]');
    const sourceScopeFormCount = await sourceScopeForm.count();
    let supabaseUiSkipped = false;
    if (sourceScopeFormCount > 0) {
      const formText = await sourceScopeForm.first().innerText();
      assert(formText.includes('訂閱範圍'), 'source form should name subscription scope', { formText });
      assert(formText.includes('目前看板'), 'source form should include board scope', { formText });
      assert(formText.includes('工作區全部看板'), 'source form should include workspace scope', { formText });
      assert(formText.includes('自訂範圍'), 'source form should include custom scope', { formText });
      assert(formText.includes('這個訂閱會包含'), 'source form should show live preview', { formText });
    } else {
      const bodyText = await page.locator('body').innerText();
      assert(
        bodyText.includes('自訂行事曆訂閱需要 Supabase 後端'),
        'local-test browser gate should show explicit Supabase backend fallback when source UI is unavailable',
        { bodyText },
      );
      supabaseUiSkipped = true;
    }
    await assertNoHorizontalOverflow('DEV-037 desktop calendar settings');
    await page.screenshot({ path: 'output/playwright/dev-037-calendar-source-scope-desktop.png', fullPage: false });

    step = 'mobile viewport calendar settings';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'settings'));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-section-tab="calendar"]').click();
    await page.locator('[data-calendar-settings-scope="external-link"]').waitFor({ state: 'visible', timeout: 10000 });
    await assertNoHorizontalOverflow('DEV-037 mobile calendar settings');
    await page.screenshot({ path: 'output/playwright/dev-037-calendar-source-scope-mobile.png', fullPage: false });

    const visibleText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(visibleText), 'calendar settings should not show visible runtime errors');

    return {
      passed: true,
      supabaseUiSkipped,
      screenshots: [
        'output/playwright/dev-037-calendar-source-scope-desktop.png',
        'output/playwright/dev-037-calendar-source-scope-mobile.png',
      ],
      diagnostics: diagnostics.slice(-20),
    };
  } catch (error) {
    throw new Error(`${step}: ${error.message}; diagnostics=${JSON.stringify(diagnostics.slice(-20))}`);
  }
}
