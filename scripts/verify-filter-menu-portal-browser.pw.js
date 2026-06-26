/* eslint-disable */
async (page) => {
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

  const defaultFilters = {
    statusFilters: {
      todo: true,
      in_progress: true,
      delayed: true,
      completed: true,
      unsure: true,
      onhold: true,
    },
    showDependencies: true,
    showStartDate: true,
    showTags: true,
    dueWithinDays: null,
    selectedAssigneeIds: [],
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });

  await page.evaluate((defaultFilters) => {
    window.__PROJED_QC__?.reset(18);
    localStorage.setItem('projed-filters', JSON.stringify(defaultFilters));
    localStorage.setItem('projed-last-view', 'board');
  }, defaultFilters);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-mode-switcher-value="board"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#filter-menu-trigger').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#filter-menu-trigger').click();
  const panel = page.locator('[data-filter-menu-panel]');
  await panel.waitFor({ state: 'visible', timeout: 10000 });

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const trigger = document.querySelector('#filter-menu-trigger');
    const panel = document.querySelector('[data-filter-menu-panel]');
    if (!nav || !trigger || !panel) return { ok: false, reason: 'missing element' };

    const navRect = nav.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const topElement = document.elementFromPoint(panelRect.left + 16, panelRect.top + 16);

    return {
      ok: true,
      parentIsBody: panel.parentElement === document.body,
      panelPosition: getComputedStyle(panel).position,
      topHitInsidePanel: Boolean(topElement && panel.contains(topElement)),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      navRect: {
        top: navRect.top,
        bottom: navRect.bottom,
        height: navRect.height,
      },
      triggerRect: {
        left: triggerRect.left,
        right: triggerRect.right,
        top: triggerRect.top,
        bottom: triggerRect.bottom,
      },
      panelRect: {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
        width: panelRect.width,
        height: panelRect.height,
      },
      text: panel.textContent || '',
    };
  });

  assert(metrics.ok, 'filter panel metrics should be available', metrics);
  assert(metrics.parentIsBody, 'filter panel should be portaled to document.body', metrics);
  assert(metrics.panelPosition === 'fixed', 'filter panel should use fixed viewport positioning', metrics);
  assert(metrics.panelRect.top >= metrics.navRect.bottom, 'filter panel should open below the top navigation', metrics);
  assert(metrics.panelRect.bottom > metrics.navRect.bottom + 180, 'filter panel should not be clipped to the top navigation height', metrics);
  assert(metrics.panelRect.left >= 0 && metrics.panelRect.right <= metrics.viewport.width, 'filter panel should stay inside viewport horizontally', metrics);
  assert(metrics.panelRect.bottom <= metrics.viewport.height, 'filter panel should stay inside viewport vertically', metrics);
  assert(metrics.topHitInsidePanel, 'filter panel should be the topmost element at its visible content point', metrics);
  assert(metrics.text.includes('任務狀態') && metrics.text.includes('負責人'), 'filter panel should expose full filter content', metrics);

  await panel.getByRole('button', { name: '延遲' }).click();
  await panel.waitFor({ state: 'visible', timeout: 3000 });

  await page.screenshot({ path: 'output/playwright/filter-menu-portal.png', fullPage: false });
  console.log(JSON.stringify({
    ok: true,
    panelRect: metrics.panelRect,
    navRect: metrics.navRect,
    screenshot: 'output/playwright/filter-menu-portal.png',
  }, null, 2));
}
