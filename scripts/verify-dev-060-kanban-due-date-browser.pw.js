/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshotBase = `output/playwright/dev-060-kanban-due-date-only-${runId}`;
  const screenshots = {
    desktop: `${screenshotBase}-1440.png`,
    laptop: `${screenshotBase}-1024.png`,
    mobile: `${screenshotBase}-390.png`,
    failure: `${screenshotBase}-failure.png`,
  };
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const result = { ok: false, cases: [], screenshots };
  const browserErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) throw new Error(`${id}: ${JSON.stringify(details)}`);
  };

  const setStartDatePreference = async (showStartDate) => {
    await page.evaluate((nextShowStartDate) => {
      for (const key of ['projed-task-filters:v1', 'projed-filters']) {
        let value = {};
        try {
          value = JSON.parse(localStorage.getItem(key) || '{}');
        } catch {
          value = {};
        }
        if (key === 'projed-task-filters:v1') {
          value.displaySettings = {
            ...(value.displaySettings || {}),
            showStartDate: nextShowStartDate,
          };
        } else {
          value.showStartDate = nextShowStartDate;
        }
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, showStartDate);
  };

  const readStartDatePreference = async () => page.evaluate(() => {
    try {
      const current = JSON.parse(localStorage.getItem('projed-task-filters:v1') || '{}');
      if (typeof current.displaySettings?.showStartDate === 'boolean') {
        return current.displaySettings.showStartDate;
      }
      const legacy = JSON.parse(localStorage.getItem('projed-filters') || '{}');
      if (typeof legacy.showStartDate === 'boolean') return legacy.showStartDate;
    } catch {
      return true;
    }
    return true;
  });

  const switchToBoard = async () => {
    const trigger = page.locator('[data-mode-switcher-trigger="true"]');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    await page.locator('[data-mode-switcher-value="board"]').click();
    await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const collectDateEvidence = async () => page.evaluate(() => {
    const formatDueDate = (raw) => {
      const date = new Date(raw);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return year === new Date().getFullYear()
        ? `${month}/${day}`
        : `${String(year).slice(-2)}/${month}/${day}`;
    };

    const badges = Array.from(document.querySelectorAll('[data-task-date-badge="true"]'))
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
      .map(element => {
        const dueDate = element.getAttribute('data-task-due-date') || '';
        const isOverdue = element.getAttribute('data-task-overdue') === 'true';
        const text = element.textContent?.replace(/\s+/g, '').trim() || '';
        const hierarchy = element.closest('.kanban-checklist-item[data-task-id]')
          ? 'L3+'
          : element.closest('.kanban-task-card[data-task-id]')
            ? 'L2'
            : element.closest('[data-kanban-column-header="true"]')
              ? 'L1'
              : 'other';
        const taskSurface = hierarchy === 'L3+'
          ? element.closest('.kanban-checklist-item[data-task-id]')
          : hierarchy === 'L2'
            ? element.closest('.kanban-task-card[data-task-id]')
            : hierarchy === 'L1'
              ? element.closest('[data-kanban-column-header="true"]')
              : null;
        const title = taskSurface?.querySelector('.task-title-text');
        const badgeRect = element.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const alignmentOffsetPx = titleRect
          ? Math.abs((badgeRect.top + badgeRect.height / 2) - (titleRect.top + titleRect.height / 2))
          : null;
        return {
          hierarchy,
          dueDate,
          isOverdue,
          text,
          expectedText: dueDate ? formatDueDate(dueDate) : '',
          hasArrow: text.includes('→'),
          visual: element.getAttribute('data-task-date-visual'),
          alignmentOffsetPx,
        };
      });

    return {
      badges,
      l2Count: badges.filter(badge => badge.hierarchy === 'L2').length,
      l3Count: badges.filter(badge => badge.hierarchy === 'L3+').length,
    };
  });

  const visibleErrorSweep = async () => page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    visibleErrors: Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
      .map(element => element.textContent?.trim()).filter(Boolean),
  }));

  let originalShowStartDate = true;

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((fixedAccount) => {
      localStorage.setItem('projed-local-test.selected-account', fixedAccount.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: fixedAccount.uid,
        email: fixedAccount.email,
        displayName: fixedAccount.displayName,
        createdAt: fixedAccount.createdAt,
      }));
    }, account);

    originalShowStartDate = await readStartDatePreference();
    await setStartDatePreference(true);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await switchToBoard();

    const preferenceOn = await collectDateEvidence();
    record(
      'QA-060-001',
      preferenceOn.badges.length > 0 && preferenceOn.l2Count > 0 && preferenceOn.l3Count > 0 &&
        preferenceOn.badges.every(badge => badge.dueDate && badge.text === badge.expectedText && !badge.hasArrow),
      { preferenceOn },
    );

    await setStartDatePreference(false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-task-date-badge="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const preferenceOff = await collectDateEvidence();
    record(
      'QA-060-002',
      JSON.stringify(preferenceOff.badges) === JSON.stringify(preferenceOn.badges),
      { preferenceOn, preferenceOff },
    );

    const viewportEvidence = {};
    for (const viewport of [
      { key: 'desktop', width: 1440, height: 900, screenshot: screenshots.desktop },
      { key: 'laptop', width: 1024, height: 768, screenshot: screenshots.laptop },
      { key: 'mobile', width: 390, height: 844, screenshot: screenshots.mobile },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const mobileSidebar = page.locator('[data-mobile-sidebar-overlay="true"]');
      if (viewport.width === 390 && await mobileSidebar.isVisible() && await mobileSidebar.getAttribute('data-sidebar-panel') === 'expanded') {
        await page.locator('[data-main-sidebar-toggle="true"]').click();
        await mobileSidebar.waitFor({ state: 'hidden', timeout: 5000 });
      }
      await page.locator('[data-task-date-badge="true"]').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const evidence = await collectDateEvidence();
      const sweep = await visibleErrorSweep();
      viewportEvidence[viewport.key] = { evidence, sweep };
      await page.screenshot({ path: viewport.screenshot, fullPage: false });
    }

    record(
      'QA-060-003',
      Object.values(viewportEvidence).every(({ evidence, sweep }) => (
        evidence.badges.length > 0 &&
        evidence.badges.every(badge => badge.dueDate && badge.text === badge.expectedText && !badge.hasArrow) &&
        sweep.documentWidth <= sweep.viewport && sweep.bodyWidth <= sweep.viewport && sweep.visibleErrors.length === 0
      )) && browserErrors.length === 0,
      { viewportEvidence, browserErrors },
    );

    record(
      'QA-060-004',
      Object.values(viewportEvidence).every(({ evidence }) => (
        evidence.badges.every(badge => (
          badge.alignmentOffsetPx !== null && badge.alignmentOffsetPx <= 1.5
        ))
      )),
      { alignmentByViewport: Object.fromEntries(
        Object.entries(viewportEvidence).map(([key, { evidence }]) => [
          key,
          evidence.badges.map(({ hierarchy, dueDate, alignmentOffsetPx }) => ({
            hierarchy,
            dueDate,
            alignmentOffsetPx,
          })),
        ]),
      ) },
    );

    await setStartDatePreference(originalShowStartDate);
    result.ok = true;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => undefined);
    await setStartDatePreference(originalShowStartDate).catch(() => undefined);
    throw new Error(JSON.stringify({
      ...result,
      error: error?.message || String(error),
      browserErrors,
    }, null, 2));
  }
}
