/* eslint-disable */
async (page) => {
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(8000);
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const pageUrl = page.url();
  const phaseMatch = /[?&]dev070Phase=([^&#]+)/.exec(pageUrl);
  const phase = phaseMatch ? decodeURIComponent(phaseMatch[1]) : 'after';
  const outputDirectory = 'output/playwright/dev-070';
  const baseUrl = pageUrl.split(/[?#]/, 1)[0];
  const screenshotDirectory = `${outputDirectory}/${phase}/screenshots`;

  const viewports = [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 1024, height: 768, name: 'laptop' },
    { width: 390, height: 844, name: 'mobile' },
  ];
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const visibleErrors = async () => page.locator('.inline-error, [role="alert"]').allTextContents();
  const surfaceSelectors = {
    list: '[data-task-drag-surface-kind="wbs-list-row"][data-task-id]',
    mindmap: '[data-mindmap-node][role="treeitem"]',
    board: '[data-task-surface-source="true"][data-task-id]',
    gantt: '[data-gantt-task-bar="true"][data-task-id]',
    calendar: '[data-calendar-task-segment="true"][data-task-id]',
    'shared-sidebar': '[data-task-drag-surface-kind="shared-sidebar-row"][data-task-id]',
  };
  const findVisibleTaskSurface = async (mode = 'board') => {
    const selector = surfaceSelectors[mode] || surfaceSelectors.board;
    const surfaces = page.locator(selector);
    const count = await surfaces.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = surfaces.nth(index);
      let box;
      try {
        box = await candidate.boundingBox();
      } catch {
        continue;
      }
      if (box && box.width > 0 && box.height > 0) return candidate;
    }
    return null;
  };
  const waitForTaskSurface = async (mode) => {
    const selector = surfaceSelectors[mode] || surfaceSelectors.board;
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 12000 });
    const surface = await findVisibleTaskSurface(mode);
    assert(Boolean(surface), `DEV-070 ${mode} task surface is not visible`, { selector });
    return surface;
  };
  const selectMode = async (mode) => {
    const triggerSelector = '[data-mode-switcher-trigger="true"]';
    const optionSelector = `[data-mode-switcher-value="${mode}"]`;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.locator(triggerSelector).click();
        const option = page.locator(optionSelector);
        await option.waitFor({ state: 'visible', timeout: 5000 });
        // The menu is React-rendered and can replace the node between
        // actionability checks. Native click plus a short settle is stable
        // across the mode surface remounts.
        await option.evaluate((element) => element.click());
        await page.waitForTimeout(150);
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(100);
      }
    }
    throw lastError;
  };
  const collectTaskMenuEvidence = async (mode, surfaceMode = mode) => {
    const taskSurface = await waitForTaskSurface(surfaceMode);
    const taskBox = await taskSurface.boundingBox();
    assert(Boolean(taskBox), `DEV-070 ${mode} task surface has no geometry`);
    const viewport = page.viewportSize();
    assert(Boolean(viewport), `DEV-070 ${mode} viewport is unavailable`);
    const clickX = Math.min(Math.max(taskBox.x + Math.min(8, taskBox.width / 2), 1), viewport.width - 1);
    const clickY = Math.min(Math.max(taskBox.y + Math.min(8, taskBox.height / 2), 1), viewport.height - 1);
    await page.mouse.click(clickX, clickY, { button: 'right' });
    const menu = page.locator('[data-global-context-menu-kind="task"]').first();
    try {
      await menu.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      const debug = await taskSurface.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + Math.min(8, rect.width / 2), rect.top + Math.min(8, rect.height / 2));
        return {
          currentView: localStorage.getItem('projed-last-view'),
          menuCount: document.querySelectorAll('[data-global-context-menu-kind="task"]').length,
          surface: element.getAttribute('data-task-id'),
          hitTag: hit?.tagName || null,
          hitTaskId: hit?.closest?.('[data-task-id]')?.getAttribute('data-task-id') || null,
          surfaceRect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      });
      throw new Error(`DEV-070 ${mode} right-click did not open task menu: ${JSON.stringify(debug)}`);
    }
    const actionIds = await menu.locator('[data-task-action-id]').evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-task-action-id')).filter(Boolean)
    ));
    const bodyText = await menu.innerText();
    assert(!/DEV-070|profile layer|source layer|raw action id/i.test(bodyText), `DEV-070 ${mode} task menu leaked interaction metadata`);
    const hasDependencyActions = actionIds.includes('task.dependency-start') && actionIds.includes('task.dependency-end');
    const dependencyExpected = mode === 'list' || mode === 'board';
    assert(hasDependencyActions === dependencyExpected, `DEV-070 ${mode} dependency menu contract failed`, {
      actionIds,
      dependencyExpected,
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-global-context-menu-kind="task"]').waitFor({ state: 'detached', timeout: 5000 });
    return { mode, surfaceMode, actionIds, dependencyExpected, menuClosed: true };
  };
  const artifacts = [];
  for (const viewport of viewports) {
    console.log(`DEV070_STEP=viewport:${viewport.name}:start`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate((session) => {
      localStorage.setItem('projed-local-test.selected-account', session.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(session));
    }, account);
    // The app keeps a development HMR/socket connection, so networkidle is
    // not a stable readiness signal for this fixture. DOM readiness plus the
    // visible navigation shell is the deterministic gate.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const appNav = page.locator('nav');
    try {
      await appNav.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      const localLogin = page.locator('button').filter({ hasText: '使用固定測試環境' }).first();
      await localLogin.waitFor({ state: 'visible', timeout: 5000 });
      await localLogin.click({ force: true });
      await page.waitForTimeout(500);
      await appNav.waitFor({ state: 'visible', timeout: 15000 });
    }
    // Reset the deterministic local QA fixture after the app installs its
    // QC API. This guarantees dated tasks exist for calendar evidence while
    // keeping the production interaction behavior untouched.
    await page.evaluate(() => window.__PROJED_QC__?.reset(12));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await appNav.waitFor({ state: 'visible', timeout: 15000 });
    const errors = await visibleErrors();
    assert(errors.length === 0, `DEV-070 ${viewport.name} visible error sweep failed`, { errors });
    const bodyText = await page.locator('body').innerText();
    assert(!/DEV-070|profile layer|source layer|raw action id/i.test(bodyText), `DEV-070 ${viewport.name} leaked internal interaction metadata`);
    await page.locator('[data-task-id]').first().waitFor({ state: 'attached', timeout: 15000 });
    const taskCount = await page.locator('[data-task-id]').count();
    const modeCount = await page.locator('[data-mode-switcher-trigger="true"]').count();
    assert(taskCount > 0, `DEV-070 ${viewport.name} data sanity failed`, { taskCount });
    const expectedModeCount = viewport.name === 'mobile' ? 0 : 1;
    assert(modeCount === expectedModeCount, `DEV-070 ${viewport.name} mode switcher contract failed`, { modeCount, expectedModeCount });

    const modeEvidence = [];
    const menuEvidence = [];
    const modeValues = viewport.name === 'mobile'
      ? ['board']
      : ['list', 'mindmap', 'board', 'gantt', 'calendar'];
    if (modeCount === 1) {
      for (const mode of modeValues) {
        console.log(`DEV070_STEP=mode:${viewport.name}/${mode}:start`);
        await selectMode(mode);
        const modeErrors = await visibleErrors();
        assert(modeErrors.length === 0, `DEV-070 ${viewport.name}/${mode} visible error sweep failed`, { modeErrors });
        await page.locator('[data-mode-switcher-trigger="true"]').waitFor({ state: 'visible', timeout: 15000 });
        const triggerLabel = await page.locator('[data-mode-switcher-trigger="true"]').getAttribute('aria-label');
        const menu = await collectTaskMenuEvidence(mode);
        const sidebarMenu = mode === 'gantt' ? await collectTaskMenuEvidence('gantt', 'shared-sidebar') : null;
        const surfaceCount = await page.locator(surfaceSelectors[mode]).count();
        modeEvidence.push({ mode, triggerLabel, surfaceCount, errors: modeErrors, menu, sidebarMenu });
      }
    } else {
      const modeErrors = await visibleErrors();
      const surfaceCount = await page.locator(surfaceSelectors.board).count();
      modeEvidence.push({ mode: 'board', triggerLabel: 'mobile-board-only', surfaceCount, errors: modeErrors });
    }

    if (modeCount === 1) await selectMode('board');
    if (viewport.name === 'mobile' && await page.locator('[data-mobile-task-workbench-overlay="true"]').count()) {
      const workbenchToggle = page.locator('[data-mobile-task-workbench-nav-entry="true"]');
      await workbenchToggle.click({ force: true });
      await page.waitForTimeout(150);
    }
    menuEvidence.push(await collectTaskMenuEvidence('board'));
    const taskSurface = await findVisibleTaskSurface('board');
    if (taskSurface) {
      await taskSurface.click({ position: { x: 8, y: 8 } });
      await page.waitForTimeout(80);
    }
    const detailsVisible = await page.locator('[data-task-details-modal="true"]').count() > 0;
    if (detailsVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
    }

    const screenshotPath = `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`;
    console.log(`DEV070_STEP=viewport:${viewport.name}:screenshot`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    artifacts.push({
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      screenshotPath,
      errors,
      taskCount,
      modeEvidence,
      menuEvidence,
      detailsVisible,
      selectionAfterClose: await page.locator('[data-task-selected="true"]').count(),
    });
  }
  const artifact = {
    schemaVersion: 2,
    fixtureId: 'dev-070-v1',
    phase,
    baseUrl,
    artifacts,
  };
  await page.evaluate(value => {
    window.__DEV070_ARTIFACT = value;
  }, artifact);
  console.log(`DEV070_ARTIFACT=${JSON.stringify(artifact)}`);
}
