/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshots = {
    desktop: `output/playwright/dev-062-task-status-${runId}-1440.png`,
    laptop: `output/playwright/dev-062-task-status-${runId}-1024.png`,
    mobile: `output/playwright/dev-062-task-status-${runId}-390.png`,
    overdue: `output/playwright/dev-062-task-status-${runId}-overdue.png`,
    failure: `output/playwright/dev-062-task-status-${runId}-failure.png`,
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

  const setFilterPrefs = async () => page.evaluate(() => {
    const statusFilters = {
      todo: true,
      in_progress: true,
      delayed: true,
      completed: true,
      unsure: true,
      onhold: true,
    };
    localStorage.setItem('projed-task-filters:v1', JSON.stringify({
      version: 3,
      filters: {
        statusFilters,
        dueWithinDays: null,
        overdueOnly: false,
        selectedAssigneeIds: [],
        selectedTagIds: [],
        keyword: '',
      },
      displaySettings: {
        showDependencies: true,
        showStartDate: true,
        showTags: true,
        showTagNames: true,
      },
      updatedAt: Date.now(),
    }));
    localStorage.setItem('projed-filters', JSON.stringify({
      statusFilters,
      dueWithinDays: null,
      overdueOnly: false,
      selectedAssigneeIds: [],
      selectedTagIds: [],
      keyword: '',
      showDependencies: true,
      showStartDate: true,
      showTags: true,
      showTagNames: true,
    }));
    localStorage.setItem('projed-last-view', 'board');
  });

  const readStatusPanel = async () => {
    const trigger = page.locator('#filter-menu-trigger');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    const panel = page.locator('[data-filter-menu-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    const statusSection = panel.locator('p', { hasText: '任務狀態' }).locator('..');
    const buttons = statusSection.locator('button');
    const texts = await buttons.allTextContents();
    const metrics = await buttons.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim() || '',
        className: element.className,
        backgroundColor: style.backgroundColor,
        color: style.color,
        iconCount: element.querySelectorAll('svg').length,
        childSpanCount: element.querySelectorAll(':scope > span').length,
      };
    }));
    return { panel, statusSection, texts, metrics };
  };

  const assertPanelContract = async (viewportName, screenshotPath) => {
    const { panel, texts, metrics } = await readStatusPanel();
    record(`${viewportName}-statuses`, JSON.stringify(texts) === JSON.stringify(['待辦', '進行中', '暫緩', '完成']), { texts });
    record(`${viewportName}-no-status-icons`, metrics.every(item => item.iconCount === 0 && item.childSpanCount === 0), { metrics });

    const palette = Object.fromEntries(metrics.map(item => [item.text, item]));
    record(`${viewportName}-palette`,
      palette['待辦'].className.includes('bg-slate-700') &&
      palette['進行中'].className.includes('bg-blue-600') &&
      palette['暫緩'].className.includes('bg-slate-100') &&
      palette['完成'].className.includes('bg-slate-100') &&
      palette['暫緩'].backgroundColor === palette['完成'].backgroundColor,
      { palette },
    );

    const bounds = await panel.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    record(`${viewportName}-viewport-safe`,
      bounds.left >= 0 && bounds.right <= bounds.viewportWidth && bounds.top >= 0 && bounds.bottom <= bounds.viewportHeight && !bounds.pageOverflowX,
      bounds,
    );

    await page.screenshot({ path: screenshotPath, fullPage: false });
    return panel;
  };

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(account => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.__PROJED_QC__?.reset(30));
    await setFilterPrefs();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mode-switcher-trigger="true"]').waitFor({ state: 'visible', timeout: 15000 });

    let panel = await assertPanelContract('desktop', screenshots.desktop);
    await panel.getByRole('button', { name: '逾期', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const overdueEvidence = await page.evaluate(() => {
      const visibleBadges = Array.from(document.querySelectorAll('[data-task-date-badge="true"]'))
        .filter(element => element instanceof HTMLElement && element.offsetParent !== null);
      const overdueBadges = visibleBadges.filter(element => element.getAttribute('data-task-overdue') === 'true');
      return {
        visibleCount: visibleBadges.length,
        overdueCount: overdueBadges.length,
        texts: overdueBadges.map(element => element.textContent?.replace(/\s+/g, ' ').trim() || ''),
        classNames: overdueBadges.map(element => element.className),
      };
    });
    record('derived-overdue-visible',
      overdueEvidence.overdueCount > 0 &&
        overdueEvidence.texts.every(text => !text.includes('逾期')) &&
        overdueEvidence.classNames.every(className => String(className).includes('orange')),
      overdueEvidence,
    );
    await page.screenshot({ path: screenshots.overdue, fullPage: false });

    await page.locator('#filter-menu-trigger').click();
    panel = page.locator('[data-filter-menu-panel]');
    await panel.getByRole('button', { name: '逾期', exact: true }).click();
    await page.keyboard.press('Escape');

    for (const [name, width, height, screenshot] of [
      ['laptop', 1024, 768, screenshots.laptop],
      ['mobile', 390, 844, screenshots.mobile],
    ]) {
      await page.setViewportSize({ width, height });
      await page.reload({ waitUntil: 'networkidle' });
      await assertPanelContract(name, screenshot);
      await page.keyboard.press('Escape');
    }

    const visibleErrors = await page.locator('[role="alert"], .inline-error').filter({ visible: true }).allTextContents().catch(() => []);
    record('visible-error-sweep', visibleErrors.length === 0 && browserErrors.length === 0, { visibleErrors, browserErrors });

    result.ok = result.cases.every(item => item.ok);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => {});
    result.error = error instanceof Error ? error.message : String(error);
    result.browserErrors = browserErrors;
    console.log(JSON.stringify(result, null, 2));
    throw error;
  } finally {
    await page.evaluate(() => window.__PROJED_QC__?.reset(30)).catch(() => {});
  }
}
