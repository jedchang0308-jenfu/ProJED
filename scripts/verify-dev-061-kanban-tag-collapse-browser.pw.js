/* eslint-disable */
async (page) => {
  const tagName = 'DEV-061 驗證標籤';
  const screenshotBase = `output/playwright/dev-061-kanban-tag-collapse-${Date.now()}`;
  const screenshots = {
    expanded: `${screenshotBase}-expanded.png`,
    collapsed: `${screenshotBase}-collapsed.png`,
    mobile: `${screenshotBase}-mobile.png`,
    failure: `${screenshotBase}-failure.png`,
  };
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const result = {
    ok: false,
    cases: [],
    screenshots,
  };
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) throw new Error(`${id}: ${JSON.stringify(details)}`);
  };
  const setDisplayPreference = async (showTagNames) => {
    await page.evaluate((nextShowTagNames) => {
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
            showTags: true,
            showTagNames: nextShowTagNames,
          };
        } else {
          value.showTags = true;
          value.showTagNames = nextShowTagNames;
        }
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, showTagNames);
  };
  const switchToBoard = async () => {
    const trigger = page.locator('[data-mode-switcher-trigger="true"]');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    await page.locator('[data-mode-switcher-value="board"]').click();
    await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 15000 });
  };
  const openTaskDetails = async () => {
    const card = page.locator('.kanban-task-card[data-task-id]').first();
    const taskId = await card.getAttribute('data-task-id');
    await page.evaluate((id) => {
      document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: id } }));
    }, taskId);
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    return { modal, taskId };
  };
  const cleanupValidationTag = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const cleanupOpened = await openTaskDetails();
    await cleanupOpened.modal.locator('[data-tag-picker-trigger="true"]:visible').first().click();
    const cleanupPanel = cleanupOpened.modal.locator('[data-tag-picker-panel]');
    await cleanupPanel.getByPlaceholder('搜尋或建立標籤').fill(tagName);
    const removeButton = cleanupPanel.getByRole('button', { name: `移除 ${tagName}` });
    if (await removeButton.count()) await removeButton.click();
    const deleteButton = cleanupPanel.getByRole('button', { name: `刪除 ${tagName}` });
    if (await deleteButton.count()) {
      page.once('dialog', dialog => dialog.accept());
      await deleteButton.click({ force: true });
    }
    await cleanupOpened.modal.getByRole('button', { name: '關閉任務詳情' }).click();
  };

  let createdTag = false;
  let assignedInitially = false;
  let taskId = null;

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
    await setDisplayPreference(true);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await switchToBoard();

    const opened = await openTaskDetails();
    taskId = opened.taskId;
    await opened.modal.locator('[data-tag-picker-trigger="true"]:visible').first().click();
    const panel = opened.modal.locator('[data-tag-picker-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    const search = panel.getByPlaceholder('搜尋或建立標籤');
    await search.fill(tagName);
    const createButton = panel.getByRole('button', { name: `建立「${tagName}」` });
    if (await createButton.count()) {
      await panel.locator('button[title="blue"]').click();
      await createButton.click();
      createdTag = true;
    } else {
      const removeButton = panel.getByRole('button', { name: `移除 ${tagName}` });
      assignedInitially = await removeButton.count() > 0;
      if (!assignedInitially) {
        await panel.getByRole('button', { name: `套用 ${tagName}` }).click();
      }
    }
    await page.waitForTimeout(200);
    await opened.modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await opened.modal.waitFor({ state: 'hidden', timeout: 10000 });

    let chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    const expandedState = await chip.getAttribute('data-tag-chip-collapsed');
    const expandedText = (await chip.textContent())?.trim();
    record('QA-061-001', expandedState === 'false' && expandedText === tagName, { expandedState, expandedText });
    await page.screenshot({ path: screenshots.expanded, fullPage: false });

    await chip.click();
    await page.waitForTimeout(120);
    chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    const collapsedStates = await page.locator('[data-kanban-tag-chip="true"]').evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-tag-chip-collapsed'))
    ));
    const collapsedDotGeometry = await page.locator('[data-kanban-tag-dot="true"]').evaluateAll(elements => (
      elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    ));
    record(
      'QA-061-002',
      collapsedStates.length > 0 &&
        collapsedStates.every(value => value === 'true') &&
        collapsedDotGeometry.length === collapsedStates.length &&
        collapsedDotGeometry.every(({ width, height }) => width === height && width > 0 && width <= 12),
      { collapsedStates, collapsedDotGeometry },
    );
    const tooltip = await chip.getAttribute('title');
    const ariaLabel = await chip.getAttribute('aria-label');
    record('QA-061-003', tooltip === `顏色：藍色，標題：「${tagName}」` && ariaLabel?.includes('點擊展開所有標籤名稱'), { tooltip, ariaLabel });
    record('QA-061-004', await page.locator('[data-task-details-modal="true"]').count() === 0, { modalCount: await page.locator('[data-task-details-modal="true"]').count() });
    const persistedCollapsed = await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem('projed-task-filters:v1') || '{}');
      return prefs.displaySettings?.showTagNames;
    });
    record('QA-061-005', persistedCollapsed === false, { persistedCollapsed });
    await chip.hover();
    await page.screenshot({ path: screenshots.collapsed, fullPage: false });

    await chip.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    const afterEnter = await chip.getAttribute('data-tag-chip-collapsed');
    await chip.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    const afterSpace = await chip.getAttribute('data-tag-chip-collapsed');
    const keyboardModalCount = await page.locator('[data-task-details-modal="true"]').count();
    record('QA-061-006', afterEnter === 'false' && afterSpace === 'true' && keyboardModalCount === 0, {
      afterEnter,
      afterSpace,
      keyboardModalCount,
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    const afterReload = await chip.getAttribute('data-tag-chip-collapsed');
    record('QA-061-007', afterReload === 'true', { afterReload });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileSidebar = page.locator('[data-mobile-sidebar-overlay="true"]');
    if (await mobileSidebar.isVisible() && await mobileSidebar.getAttribute('data-sidebar-panel') === 'expanded') {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await mobileSidebar.waitFor({ state: 'hidden', timeout: 5000 });
    }
    await chip.scrollIntoViewIfNeeded();
    const mobileBefore = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleErrors: Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
        .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
        .map(element => element.textContent?.trim()).filter(Boolean),
    }));
    await chip.click();
    await page.waitForTimeout(100);
    chip = page.locator(`[data-kanban-tag-chip="true"][data-tag-name="${tagName}"]`).first();
    const mobileExpanded = await chip.getAttribute('data-tag-chip-collapsed');
    const mobileModalCount = await page.locator('[data-task-details-modal="true"]').count();
    record(
      'QA-061-008',
      mobileExpanded === 'false' && mobileModalCount === 0 && mobileBefore.documentWidth <= mobileBefore.viewport && mobileBefore.visibleErrors.length === 0,
      { mobileExpanded, mobileModalCount, mobileBefore },
    );
    await page.screenshot({ path: screenshots.mobile, fullPage: false });

    await cleanupValidationTag();

    await setDisplayPreference(true);
    result.ok = true;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => undefined);
    await cleanupValidationTag().catch(() => undefined);
    await setDisplayPreference(true).catch(() => undefined);
    throw new Error(JSON.stringify({
      ...result,
      error: error?.message || String(error),
      taskId,
      createdTag,
      assignedInitially,
    }, null, 2));
  }
}
