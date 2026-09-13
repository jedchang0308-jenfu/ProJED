/* eslint-disable */
async (page) => {
  const modes = [
    { value: 'list', label: '清單模式' },
    { value: 'mindmap', label: '心智圖模式' },
    { value: 'board', label: '看板模式' },
    { value: 'goal', label: 'OKR模式' },
    { value: 'gantt', label: '甘特圖模式' },
    { value: 'calendar', label: '日曆模式' },
  ];
  const evidence = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });

  const fixedTestButton = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedTestButton.count() && await fixedTestButton.isVisible().catch(() => false)) {
    await fixedTestButton.click({ force: true });
  }

  const modeTrigger = page.locator('[data-mode-switcher-trigger="true"]');
  const workbenchToggle = page.locator('[data-mobile-task-workbench-nav-entry="true"]');
  const workbenchPanel = page.locator('[data-task-workbench-panel="true"]');
  await modeTrigger.waitFor({ state: 'visible', timeout: 15000 });
  await workbenchToggle.waitFor({ state: 'visible', timeout: 15000 });

  const selectMode = async ({ value, label }) => {
    await modeTrigger.click();
    const option = page.locator(`[data-mode-switcher-value="${value}"]`);
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await page.waitForFunction(
      expected => document.querySelector('[data-mode-switcher-trigger="true"]')?.getAttribute('aria-label') === expected,
      label,
    );
  };

  for (const mode of modes) {
    await selectMode(mode);
    await page.waitForTimeout(350);

    if (await workbenchPanel.isVisible().catch(() => false)) {
      await workbenchToggle.click();
      await workbenchPanel.waitFor({ state: 'detached', timeout: 5000 });
    }

    const beforeOpenMode = await modeTrigger.getAttribute('aria-label');
    await workbenchToggle.click();
    await page.waitForTimeout(500);
    if (!(await workbenchPanel.isVisible().catch(() => false))) {
      const debug = await page.evaluate(() => ({
        mode: document.querySelector('[data-mode-switcher-trigger="true"]')?.getAttribute('aria-label'),
        panelCount: document.querySelectorAll('[data-task-workbench-panel="true"]').length,
        workbenchPrefs: Object.fromEntries(
          Object.keys(localStorage)
            .filter(key => key.includes('task-workbench-panel'))
            .map(key => [key, localStorage.getItem(key)]),
        ),
      }));
      throw new Error(`${mode.value}: Task Workbench did not open ${JSON.stringify(debug)}`);
    }
    const afterOpenMode = await modeTrigger.getAttribute('aria-label');

    if (beforeOpenMode !== mode.label || afterOpenMode !== mode.label) {
      throw new Error(`${mode.value}: opening Task Workbench changed the active mode (${beforeOpenMode} -> ${afterOpenMode})`);
    }

    const taskCount = await workbenchPanel.locator('[data-task-workbench-task-card="true"]').count();
    if (taskCount === 0) throw new Error(`${mode.value}: Task Workbench did not expose any task rows`);

    const visibleErrors = [
      ...await page.locator('[role="alert"]:visible, .inline-error:visible').allTextContents(),
    ];
    const bodyText = await page.locator('body').innerText();
    if (/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found/i.test(bodyText)) {
      visibleErrors.push('visible HTTP/runtime error text');
    }
    if (visibleErrors.length > 0) throw new Error(`${mode.value}: visible errors ${JSON.stringify(visibleErrors)}`);

    const documentOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    ));
    if (documentOverflow) throw new Error(`${mode.value}: document-level horizontal overflow`);

    const screenshotPath = `output/playwright/dev-039-workbench-cross-mode/${mode.value}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    evidence.push({ mode: mode.value, taskCount, screenshotPath, visibleErrors });
  }

  const firstTask = workbenchPanel.locator('[data-task-workbench-task-card="true"]').first();
  await firstTask.click();
  const taskDetails = page.locator('[data-task-details-modal="true"]');
  await taskDetails.waitFor({ state: 'visible', timeout: 10000 });
  await taskDetails.locator('button[aria-label="關閉任務詳情"]').click();
  await taskDetails.waitFor({ state: 'detached', timeout: 10000 });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(200);
  if (!(await workbenchPanel.isVisible())) throw new Error('tablet: Task Workbench should remain visible');
  const tabletOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  ));
  if (tabletOverflow) throw new Error('tablet: document-level horizontal overflow');
  const tabletScreenshotPath = 'output/playwright/dev-039-workbench-cross-mode/tablet-calendar.png';
  await page.screenshot({ path: tabletScreenshotPath, fullPage: false });
  evidence.push({ mode: 'calendar-tablet', taskCount: await workbenchPanel.locator('[data-task-workbench-task-card="true"]').count(), screenshotPath: tabletScreenshotPath, visibleErrors: [] });

  if (pageErrors.length > 0) throw new Error(`page errors: ${JSON.stringify(pageErrors)}`);
  console.log(JSON.stringify({ ok: true, evidence }));
}
