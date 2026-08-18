/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const validationTags = [
    { name: 'QA重要', color: 'green' },
    { name: 'QA等待', color: 'sky' },
    { name: 'QA風險', color: 'purple' },
  ];
  const screenshotBase = `output/playwright/dev-061-kanban-tag-sticker-${runId}`;
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

  const setLegacyPreference = async (showTagNames) => {
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

  const openTaskDetails = async (taskId) => {
    await page.evaluate((id) => {
      document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: id } }));
    }, taskId);
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    return modal;
  };

  const assignValidationTags = async (taskId) => {
    const modal = await openTaskDetails(taskId);
    const trigger = modal.locator('[data-tag-picker-trigger="true"]:visible').first();

    for (const tag of validationTags) {
      await trigger.click();
      const panel = modal.locator('[data-tag-picker-panel]');
      await panel.waitFor({ state: 'visible', timeout: 10000 });
      const search = panel.getByPlaceholder('搜尋或建立標籤');
      await search.fill(tag.name);
      const createButton = panel.getByRole('button', { name: `建立「${tag.name}」` });
      if (await createButton.count()) {
        await panel.locator(`button[title="${tag.color}"]`).click();
        await createButton.click();
      } else {
        const applyButton = panel.getByRole('button', { name: `套用 ${tag.name}` });
        if (await applyButton.count()) await applyButton.click();
      }
      await page.waitForTimeout(120);
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden', timeout: 5000 });
    }

    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
  };

  const cleanupValidationTags = async () => {
    await page.evaluate((validationTagNames) => {
      const tagsKey = 'projed-local-test.tags';
      const nodesKey = 'projed-local-test.nodes';
      const tags = JSON.parse(localStorage.getItem(tagsKey) || '[]');
      const removedIds = new Set(tags
        .filter(tag => validationTagNames.includes(tag.name) || tag.name?.startsWith('DEV061貼紙'))
        .map(tag => tag.id));
      localStorage.setItem(tagsKey, JSON.stringify(tags.filter(tag => !removedIds.has(tag.id))));

      const nodes = JSON.parse(localStorage.getItem(nodesKey) || '{}');
      Object.keys(nodes).forEach(nodeId => {
        nodes[nodeId] = {
          ...nodes[nodeId],
          tagIds: (nodes[nodeId].tagIds || []).filter(tagId => !removedIds.has(tagId)),
        };
      });
      localStorage.setItem(nodesKey, JSON.stringify(nodes));
    }, validationTags.map(tag => tag.name));
  };

  const visibleErrorSweep = async () => page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    visibleErrors: Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
      .map(element => element.textContent?.trim()).filter(Boolean),
  }));

  let l2TaskId = null;
  let l3TaskId = null;

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((fixedAccount) => {
      localStorage.setItem('projed-local-test.selected-account', fixedAccount.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: fixedAccount.uid,
        email: fixedAccount.email,
        displayName: fixedAccount.displayName,
        createdAt: fixedAccount.createdAt,
      }));
    }, account);
    await cleanupValidationTags();
    await setLegacyPreference(false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await switchToBoard();

    const l2Card = page.locator('.kanban-task-card[data-task-id]').filter({
      has: page.locator('.kanban-checklist-item[data-task-id]'),
    }).first();
    await l2Card.waitFor({ state: 'visible', timeout: 10000 });
    l2TaskId = await l2Card.getAttribute('data-task-id');
    const l3Row = l2Card.locator('.kanban-checklist-item[data-task-id]').first();
    await l3Row.waitFor({ state: 'visible', timeout: 10000 });
    l3TaskId = await l3Row.getAttribute('data-task-id');
    if (!l2TaskId || !l3TaskId) throw new Error('找不到可驗證的 L2 / L3 任務');

    await assignValidationTags(l2TaskId);
    await assignValidationTags(l3TaskId);

    const currentL2Card = page.locator(`.kanban-task-card[data-task-id="${l2TaskId}"]`);
    const currentL3Row = page.locator(`.kanban-checklist-item[data-task-id="${l3TaskId}"]`);
    const l2Sticker = currentL2Card.locator('[data-kanban-tag-sticker="true"]').first();
    const l3Sticker = currentL3Row.locator('[data-kanban-tag-sticker="true"]').first();
    await l2Sticker.waitFor({ state: 'visible', timeout: 10000 });
    await l3Sticker.waitFor({ state: 'visible', timeout: 10000 });

    const l2Geometry = await page.evaluate((taskId) => {
      const card = document.querySelector(`.kanban-task-card[data-task-id="${taskId}"]`);
      const sticker = card?.querySelector('[data-kanban-tag-sticker="true"]');
      const titleRow = sticker?.closest('.kanban-task-title-content');
      if (!(sticker instanceof HTMLElement) || !(titleRow instanceof HTMLElement)) return null;
      const stickerRect = sticker.getBoundingClientRect();
      const rowRect = titleRow.getBoundingClientRect();
      return {
        sticker: { top: stickerRect.top, bottom: stickerRect.bottom, height: stickerRect.height },
        row: { top: rowRect.top, bottom: rowRect.bottom, height: rowRect.height },
        tagCount: sticker.dataset.tagCount,
        layers: sticker.querySelectorAll('[data-kanban-tag-layer="true"]').length,
        frontText: sticker.querySelector('[data-kanban-tag-front="true"]')?.textContent?.trim(),
        legacyChipCount: card.querySelectorAll('[data-kanban-tag-chip="true"]').length,
      };
    }, l2TaskId);
    record(
      'QA-061-001',
      Boolean(l2Geometry && l2Geometry.sticker.top >= l2Geometry.row.top - 3 && l2Geometry.sticker.bottom <= l2Geometry.row.bottom + 3 && l2Geometry.legacyChipCount === 0),
      { l2Geometry },
    );

    const l3Geometry = await page.evaluate((taskId) => {
      const row = document.querySelector(`.kanban-checklist-item[data-task-id="${taskId}"]`);
      const sticker = row?.querySelector('[data-kanban-tag-sticker="true"]');
      if (!(sticker instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
      const stickerRect = sticker.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        sticker: { top: stickerRect.top, bottom: stickerRect.bottom, height: stickerRect.height },
        row: { top: rowRect.top, bottom: rowRect.bottom, height: rowRect.height },
        tagCount: sticker.dataset.tagCount,
        layers: sticker.querySelectorAll('[data-kanban-tag-layer="true"]').length,
        legacyChipCount: row.parentElement?.querySelectorAll(':scope > [data-kanban-tag-chip="true"]').length ?? 0,
      };
    }, l3TaskId);
    record(
      'QA-061-002',
      Boolean(l3Geometry && l3Geometry.sticker.height === l2Geometry?.sticker.height && l3Geometry.sticker.top >= l3Geometry.row.top - 3 && l3Geometry.sticker.bottom <= l3Geometry.row.bottom + 3 && l3Geometry.legacyChipCount === 0),
      { l2Geometry, l3Geometry },
    );
    record(
      'QA-061-003',
      l2Geometry?.tagCount === '3' && l2Geometry?.layers === 2 && l2Geometry?.frontText?.includes('+2') === true,
      { l2Geometry },
    );

    const selectedBefore = await page.locator('[data-task-selected="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-id')));
    const title = await l2Sticker.getAttribute('title');
    await l2Sticker.click();
    const popover = page.locator('[data-kanban-tag-popover="true"]');
    await popover.waitFor({ state: 'visible', timeout: 5000 });
    const popoverNames = await popover.locator('[data-kanban-tag-popover-item="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-tag-name')));
    record(
      'QA-061-004',
      validationTags.every(tag => title?.includes(tag.name) && popoverNames.includes(tag.name)) && await popover.count() === 1,
      { title, popoverNames, popoverCount: await popover.count() },
    );

    const selectedAfter = await page.locator('[data-task-selected="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-id')));
    const interactionState = {
      modalCount: await page.locator('[data-task-details-modal="true"]').count(),
      dragPreviewCount: await page.locator('[data-kanban-drag-overlay], [data-kanban-drag-source-placeholder="true"]').count(),
      contextMenuCount: await page.locator('[data-context-menu]').count(),
      selectedBefore,
      selectedAfter,
    };
    record(
      'QA-061-005',
      interactionState.modalCount === 0 && interactionState.dragPreviewCount === 0 && JSON.stringify(selectedBefore) === JSON.stringify(selectedAfter),
      interactionState,
    );

    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('[data-mode-switcher-trigger="true"]').focus();
    await l2Sticker.focus();
    await popover.waitFor({ state: 'visible', timeout: 5000 });
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden', timeout: 5000 });
    const activeSticker = await page.evaluate(() => document.activeElement?.getAttribute('data-kanban-tag-sticker'));
    record('QA-061-006', activeSticker === 'true', { activeSticker });

    const beforeReload = { l2Height: l2Geometry?.row.height, l3Height: l3Geometry?.row.height };
    await setLegacyPreference(true);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-kanban-tag-sticker="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const afterReload = await page.evaluate(({ l2TaskId, l3TaskId }) => ({
      l2Count: document.querySelectorAll(`.kanban-task-card[data-task-id="${l2TaskId}"] .kanban-task-title-content > [data-kanban-tag-sticker="true"]`).length,
      l3Count: document.querySelectorAll(`.kanban-checklist-item[data-task-id="${l3TaskId}"] [data-kanban-tag-sticker="true"]`).length,
      l2Height: document.querySelector(`.kanban-task-card[data-task-id="${l2TaskId}"] .kanban-task-title-content`)?.getBoundingClientRect().height,
      l3Height: document.querySelector(`.kanban-checklist-item[data-task-id="${l3TaskId}"]`)?.getBoundingClientRect().height,
      legacyChipCount: document.querySelectorAll('[data-kanban-tag-chip="true"], [data-kanban-tag-dot="true"]').length,
    }), { l2TaskId, l3TaskId });
    record(
      'QA-061-007',
      afterReload.l2Count === 1 && afterReload.l3Count === 1 && afterReload.legacyChipCount === 0 && afterReload.l2Height === beforeReload.l2Height && afterReload.l3Height === beforeReload.l3Height,
      { beforeReload, afterReload },
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
      const sticker = page.locator(`.kanban-task-card[data-task-id="${l2TaskId}"] [data-kanban-tag-sticker="true"]`).first();
      await sticker.scrollIntoViewIfNeeded();
      await sticker.click();
      await popover.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      const bounds = await popover.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      const sweep = await visibleErrorSweep();
      viewportEvidence[viewport.key] = { bounds, sweep };
      await page.screenshot({ path: viewport.screenshot, fullPage: false });
      await page.keyboard.press('Escape');
    }
    record(
      'QA-061-008',
      Object.values(viewportEvidence).every(({ bounds, sweep }) => (
        bounds.left >= 0 && bounds.right <= sweep.viewport && bounds.top >= 0 &&
        sweep.documentWidth <= sweep.viewport && sweep.bodyWidth <= sweep.viewport && sweep.visibleErrors.length === 0
      )) && browserErrors.length === 0,
      { viewportEvidence, browserErrors },
    );

    await cleanupValidationTags();
    await setLegacyPreference(true);
    result.ok = true;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      phase: 'DEV-061 browser failure before cleanup',
      error: error?.message || String(error),
      cases: result.cases,
      l2TaskId,
      l3TaskId,
      browserErrors,
    }, null, 2));
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => undefined);
    await cleanupValidationTags().catch(() => undefined);
    await setLegacyPreference(true).catch(() => undefined);
    throw new Error(JSON.stringify({
      ...result,
      error: error?.message || String(error),
      l2TaskId,
      l3TaskId,
      browserErrors,
    }, null, 2));
  }
}
