/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshots = {
    board: `output/playwright/dev-064-brand-blue-${runId}-board-1440.png`,
    details: `output/playwright/dev-064-brand-blue-${runId}-details-1440.png`,
    mindmap: `output/playwright/dev-064-brand-blue-${runId}-mindmap-1440.png`,
    mobile: `output/playwright/dev-064-brand-blue-${runId}-board-390.png`,
    failure: `output/playwright/dev-064-brand-blue-${runId}-failure.png`,
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

  const visibleErrorsAndBounds = async () => page.evaluate(() => {
    const visible = element => element instanceof HTMLElement && element.offsetParent !== null;
    return {
      errors: Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
        .filter(visible)
        .map(element => element.textContent?.trim())
        .filter(Boolean),
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  const switchMode = async mode => {
    const trigger = page.locator('[data-mode-switcher-trigger="true"]');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
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
    await page.evaluate(() => {
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: true, filtersOpen: false }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mode-switcher-trigger="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const tokenEvidence = await page.evaluate(() => {
      const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
      const families = ['primary', 'blue', 'sky', 'indigo', 'cyan'];
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '-9999px';
      document.body.appendChild(probe);
      const resolved = {};
      for (const family of families) {
        resolved[family] = {};
        for (const shade of shades) {
          probe.style.backgroundColor = `var(--color-${family}-${shade})`;
          resolved[family][shade] = getComputedStyle(probe).backgroundColor;
        }
      }
      probe.remove();
      return resolved;
    });
    record('QA-064-001', ['blue', 'sky', 'indigo', 'cyan'].every(family =>
      Object.keys(tokenEvidence.primary).every(shade => tokenEvidence[family][shade] === tokenEvidence.primary[shade])
    ), { tokenEvidence });
    record('QA-064-002', tokenEvidence.primary['500'] === 'rgb(99, 102, 241)' && tokenEvidence.primary['600'] === 'rgb(79, 70, 229)', { tokenEvidence });

    const filterTrigger = page.locator('#filter-menu-trigger');
    await filterTrigger.click();
    const filterPanel = page.locator('[data-filter-menu-panel]');
    await filterPanel.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    const progressButton = filterPanel.getByRole('button', { name: '進行中', exact: true });
    const statusBackground = await progressButton.evaluate(element => getComputedStyle(element).backgroundColor);
    const workbenchEvidence = await page.evaluate(() => {
      const readBackground = selector => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).backgroundColor : null;
      };
      return {
        unplacedLane: readBackground('[data-task-workbench-unclassified-section="true"]'),
        placedLane: readBackground('[data-task-workbench-placed-board-lane="true"]'),
      };
    });
    record('QA-064-003', statusBackground === tokenEvidence.primary['600'] &&
      workbenchEvidence.unplacedLane === workbenchEvidence.placedLane,
    { statusBackground, workbenchEvidence });
    await page.screenshot({ path: screenshots.board, fullPage: false });
    await page.keyboard.press('Escape');

    await page.locator('.kanban-task-card[data-task-id]').first().click();
    const details = page.locator('[data-task-details-modal="true"]');
    await details.waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: screenshots.details, fullPage: false });
    await details.locator('button[title="關閉"]').click();
    await details.waitFor({ state: 'detached', timeout: 10000 });

    await switchMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    const relationshipTool = page.locator('[data-mindmap-note-relationship-tool]');
    if (await relationshipTool.count()) await relationshipTool.click();
    const mindMapEvidence = await page.evaluate(() => {
      const center = document.querySelector('[data-mindmap-center]');
      const tool = document.querySelector('[data-mindmap-note-relationship-tool]');
      return {
        centerBackground: center ? getComputedStyle(center).backgroundColor : null,
        toolColor: tool ? getComputedStyle(tool).color : null,
        toolBackground: tool ? getComputedStyle(tool).backgroundColor : null,
        toolClassName: tool instanceof HTMLElement ? tool.className : null,
      };
    });
    record('QA-064-004', mindMapEvidence.centerBackground === tokenEvidence.primary['50'] &&
      (!mindMapEvidence.toolClassName || (
        mindMapEvidence.toolClassName.includes('border-sky-300') &&
        mindMapEvidence.toolClassName.includes('bg-sky-50') &&
        mindMapEvidence.toolClassName.includes('text-sky-700')
      )),
    { mindMapEvidence });
    await page.screenshot({ path: screenshots.mindmap, fullPage: false });

    await switchMode('board');
    await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.setViewportSize({ width: 390, height: 844 });
    const workbenchCollapse = page.locator('[data-task-workbench-collapse-toggle="true"]');
    if (await workbenchCollapse.isVisible()) await workbenchCollapse.click();
    const mobileSidebar = page.locator('[data-mobile-sidebar-overlay="true"]');
    if (await mobileSidebar.isVisible() && await mobileSidebar.getAttribute('data-sidebar-panel') === 'expanded') {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await mobileSidebar.waitFor({ state: 'hidden', timeout: 5000 });
    }
    await page.locator('#filter-menu-trigger').click();
    await page.locator('[data-filter-menu-panel]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: screenshots.mobile, fullPage: false });

    const bounds = await visibleErrorsAndBounds();
    record('QA-064-005', bounds.errors.length === 0 && bounds.documentWidth <= bounds.viewport && bounds.bodyWidth <= bounds.viewport, bounds);
    record('QA-064-006', browserErrors.length === 0, { browserErrors });

    result.ok = result.cases.every(item => item.ok);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => undefined);
    throw new Error(JSON.stringify({
      ...result,
      error: error?.message || String(error),
      browserErrors,
    }, null, 2));
  } finally {
    await page.evaluate(() => window.__PROJED_QC__?.reset(30)).catch(() => undefined);
  }
}
