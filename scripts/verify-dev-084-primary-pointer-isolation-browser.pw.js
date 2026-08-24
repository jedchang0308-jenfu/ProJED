/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const errors = { console: [], page: [], requests: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(String(error)));
  page.on('requestfailed', request => errors.requests.push(`${request.method()} ${request.url()}`));

  const cases = [];
  const runCase = async (id, callback) => {
    const startedAt = Date.now();
    const result = await callback();
    cases.push({ id, status: 'PASS', durationMs: Date.now() - startedAt, result });
    return result;
  };

  const waitForApp = async () => {
    await page.locator('[data-layout-region="topbar"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mode-switcher-trigger="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const selectViewMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(300);
  };

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = [
      'Internal Server Error',
      'Unhandled Runtime Error',
      'ChunkLoadError',
      'HTTP 4',
      'HTTP 5',
    ].find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show a visible runtime error`, { visibleError });
  };

  const boxCenter = async locator => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(Boolean(box), 'target should have a bounding box');
    return { x: box.x + box.width / 2, y: box.y + Math.min(box.height - 8, Math.max(8, box.height / 2)), box };
  };

  const mouseDrag = async (locator, button, deltaX = 28, deltaY = 10) => {
    const point = await boxCenter(locator);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button });
    await page.mouse.move(point.x + deltaX, point.y + deltaY, { steps: 8 });
    await page.waitForTimeout(100);
    await page.mouse.up({ button });
    await page.waitForTimeout(180);
    return point;
  };

  const surfaceSnapshot = async (selector = '[data-task-drag-surface="true"]') => page.locator(selector).evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-task-id'),
    kind: element.getAttribute('data-task-drag-surface-kind'),
    text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  })));

  const closeTransient = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  };

  const ensurePanelsOpen = async () => {
    if (!(await page.locator('[data-layout-region="workspace-sidebar"]').count())) {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await page.locator('[data-layout-region="workspace-sidebar"]').waitFor({ state: 'visible', timeout: 10000 });
    }
    if (!(await page.locator('[data-task-workbench-panel="true"]').count())) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
      await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
    }
    const recordHandle = page.locator('[data-record-sidebar-resize-handle="true"]').first();
    if (!(await recordHandle.count())) {
      const collapsedRecordToggle = page.getByTitle('展開紀錄欄').first();
      if (await collapsedRecordToggle.count()) {
        await collapsedRecordToggle.click();
        await page.locator('[data-record-sidebar-resize-handle="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
      }
    }
    await page.waitForTimeout(300);
  };

  const readVisibleAttribute = async (selector, attribute) => {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 3000 });
      return await locator.getAttribute(attribute, { timeout: 3000 });
    } catch {
      return null;
    }
  };

  const testNonPrimarySurface = async (id, selector) => runCase(id, async () => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 10000 });
    const before = await surfaceSnapshot();
    for (const button of ['middle', 'right']) {
      await mouseDrag(target, button);
      assert(await page.locator('[data-kanban-drag-overlay="true"], [data-task-drag-overlay="true"]').count() === 0, `${id} ${button} must not show a drag overlay`);
      assert(await page.locator('[data-kanban-insertion-marker="true"], [data-kanban-insertion-bar="true"]').count() === 0, `${id} ${button} must not show an insertion marker`);
      await closeTransient();
      const after = await surfaceSnapshot();
      assert(JSON.stringify(after) === JSON.stringify(before), `${id} ${button} must not change task surface order`, { before, after });
    }
    return { selector, beforeCount: before.length };
  });

  const ensureRelationshipFixture = async () => {
    await selectViewMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    const existingPath = page.locator('[data-mindmap-note-relationship-path]').first();
    if (await existingPath.count()) return existingPath;

    const stamp = Date.now().toString(36);
    const sourceTitle = `DEV084 source ${stamp}`;
    const targetTitle = `DEV084 target ${stamp}`;
    const createRoot = async title => {
      const createRootButton = page.locator('[data-mindmap-create-root]');
      if (await createRootButton.count()) await createRootButton.click();
      else {
        await page.locator('[data-mindmap-view]').focus();
        await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
      }
      const input = page.locator('[data-mindmap-quick-title-input="true"]');
      await input.waitFor({ state: 'visible', timeout: 10000 });
      await input.fill(title);
      await input.press('Enter');
      await page.locator(`[data-mindmap-node-title="${title}"]`).waitFor({ state: 'visible', timeout: 10000 });
    };
    await createRoot(sourceTitle);
    await createRoot(targetTitle);
    const source = page.locator(`[data-mindmap-node-title="${sourceTitle}"]`).first();
    const target = page.locator(`[data-mindmap-node-title="${targetTitle}"]`).first();
    const sourceId = await source.getAttribute('data-mindmap-node');
    const targetId = await target.getAttribute('data-mindmap-node');
    assert(sourceId && targetId, 'relationship fixture nodes must expose ids', { sourceId, targetId });
    await source.click({ button: 'right' });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    await menu.locator('[data-task-action-id="task.create-relationship"]').click();
    await target.click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(`DEV084 relation ${stamp}`);
    await page.keyboard.press('Enter');
    const path = page.locator(`[data-mindmap-note-relationship-path][data-from-node-id="${sourceId}"][data-to-node-id="${targetId}"]`).first();
    await path.waitFor({ state: 'attached', timeout: 10000 });
    return path;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  const fixedEnvironmentButton = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedEnvironmentButton.count()) await fixedEnvironmentButton.click();
  await waitForApp();
  await page.evaluate(() => window.__PROJED_QC__?.reset(12));
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();

  await selectViewMode('board');
  await page.locator('[data-kanban-mouse-pan-surface="true"]').waitFor({ state: 'visible', timeout: 15000 });
  await testNonPrimarySurface('QA-084-B01 kanban card', '[data-task-drag-surface-kind="kanban-card"]');
  await testNonPrimarySurface('QA-084-B01 checklist row', '[data-task-drag-surface-kind="checklist-row"]');
  await testNonPrimarySurface('QA-084-B01 column header', '[data-task-drag-surface-kind="kanban-column-header"]');

  await selectViewMode('list');
  await page.locator('[data-task-drag-surface-kind="wbs-list-row"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await testNonPrimarySurface('QA-084-B02 list row', '[data-task-drag-surface-kind="wbs-list-row"]');

  await selectViewMode('gantt');
  await page.locator('[data-gantt-task-bar="true"]:has([data-gantt-task-resize-handle])').first().waitFor({ state: 'visible', timeout: 15000 });
  await runCase('QA-084-B03 shared sidebar row', async () => {
    const sidebarRow = page.locator('[data-task-drag-surface-kind="shared-sidebar-row"]').first();
    await sidebarRow.waitFor({ state: 'visible', timeout: 10000 });
    const before = await surfaceSnapshot('[data-task-drag-surface-kind="shared-sidebar-row"]');
    for (const button of ['middle', 'right']) {
      await mouseDrag(sidebarRow, button);
      await closeTransient();
      assert(JSON.stringify(await surfaceSnapshot('[data-task-drag-surface-kind="shared-sidebar-row"]')) === JSON.stringify(before), `shared sidebar ${button} must remain unchanged`);
    }
    return { count: before.length };
  });
  await runCase('QA-084-B06 Gantt resize handles', async () => {
    const bar = page.locator('[data-gantt-task-bar="true"]:has([data-gantt-task-resize-handle])').first();
    const before = await bar.evaluate(element => ({ style: element.getAttribute('style'), text: (element.textContent || '').replace(/\s+/g, ' ').trim() }));
    for (const handleName of ['start', 'end']) {
      const handle = bar.locator(`[data-gantt-task-resize-handle="${handleName}"]`);
      await handle.waitFor({ state: 'visible', timeout: 10000 });
      for (const button of ['middle', 'right']) {
        await mouseDrag(handle, button, 32, 0);
        await closeTransient();
        const after = await bar.evaluate(element => ({ style: element.getAttribute('style'), text: (element.textContent || '').replace(/\s+/g, ' ').trim() }));
        assert(JSON.stringify(after) === JSON.stringify(before), `Gantt ${handleName} ${button} must not change bar state`, { before, after });
      }
    }
    return before;
  });

  await ensurePanelsOpen();
  await runCase('QA-084-B07 panel resizers', async () => {
    const selectors = [
      '[data-sidebar-resize-handle="true"]',
      '[data-task-workbench-resize-handle="true"]',
      '[data-record-sidebar-resize-handle="true"]',
    ];
    const results = [];
    for (const selector of selectors) {
      const before = await readVisibleAttribute(selector, 'aria-valuenow');
      if (before === null) continue;
      for (const button of ['middle', 'right']) {
        const handle = page.locator(selector).first();
        await handle.waitFor({ state: 'visible', timeout: 3000 });
        await mouseDrag(handle, button, 32, 0);
        const after = await readVisibleAttribute(selector, 'aria-valuenow');
        assert(after === before, `${selector} ${button} must not change aria width`, { before, after });
      }
      results.push({ selector, before });
    }
    assert(results.length >= 2, 'at least workspace and workbench resizers must be rendered', { results });
    return results;
  });
  await runCase('QA-084-B08 keyboard resizer control', async () => {
    const handle = page.locator('[data-task-workbench-resize-handle="true"]').first();
    await handle.focus();
    const before = Number(await handle.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    const changed = Number(await handle.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowLeft');
    const restored = Number(await handle.getAttribute('aria-valuenow'));
    assert(changed !== before && restored === before, 'keyboard resizer control must remain functional and restorable', { before, changed, restored });
    return { before, changed, restored };
  });

  const relationshipPath = await ensureRelationshipFixture();
  await runCase('QA-084-B09 relationship middle-pan arbitration', async () => {
    const hitbox = page.locator('[data-mindmap-note-relationship-line-click-target]').first();
    await hitbox.waitFor({ state: 'visible', timeout: 10000 });
    const surface = page.locator('[data-mindmap-middle-pan="true"]').first();
    const selectedBefore = await page.locator('[data-mindmap-note-relationship][data-selected="true"]').count();
    const point = await boxCenter(hitbox);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(point.x + 80, point.y + 25, { steps: 8 });
    await page.waitForTimeout(100);
    assert(await surface.getAttribute('data-mindmap-middle-pan-active') === 'true', 'middle on relationship hitbox must reach canvas middle-pan owner');
    assert(await page.locator('[data-mindmap-note-relationship][data-selected="true"]').count() === selectedBefore, 'middle relationship gesture must not select relationship');
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(180);
    assert(await page.locator('[data-mindmap-note-relationship-path]').count() >= 1, 'relationship path must remain rendered after middle-pan');
    return { pathCount: await page.locator('[data-mindmap-note-relationship-path]').count(), selectedBefore };
  });
  await runCase('QA-084-B10 relationship endpoint non-primary guard', async () => {
    const relationshipTarget = page.locator('[data-mindmap-note-relationship-click-target]').first();
    await relationshipTarget.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-mindmap-note-relationship][data-selected="true"]').first().waitFor({ state: 'attached', timeout: 10000 });
    const endpoint = page.locator('[data-mindmap-note-relationship-endpoint="from"]').first();
    await endpoint.waitFor({ state: 'visible', timeout: 10000 });
    const endpointBox = await endpoint.boundingBox();
    assert(Boolean(endpointBox), 'selected relationship endpoint must have a rendered hit area', {
      selectedCount: await page.locator('[data-mindmap-note-relationship][data-selected="true"]').count(),
      endpointCount: await page.locator('[data-mindmap-note-relationship-endpoint="from"]').count(),
    });
    const before = await relationshipPath.getAttribute('d');
    const point = { x: endpointBox.x + endpointBox.width / 2, y: endpointBox.y + endpointBox.height / 2 };
    for (const button of ['middle', 'right']) {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down({ button });
      await page.mouse.move(point.x + 35, point.y + 12, { steps: 8 });
      await page.mouse.up({ button });
      await page.waitForTimeout(180);
      await closeTransient();
      assert(await relationshipPath.getAttribute('d') === before, `relationship endpoint ${button} must not change path`, { before, after: await relationshipPath.getAttribute('d') });
    }
    return { beforePath: before };
  });
  await page.screenshot({ path: 'output/playwright/dev-084-primary-pointer-isolation/mindmap-middle-pan.png', fullPage: true });

  await selectViewMode('board');
  await page.locator('[data-kanban-mouse-pan-surface="true"]').waitFor({ state: 'visible', timeout: 15000 });
  await runCase('QA-084-B12 task details backdrop', async () => {
    const card = page.locator('[data-task-drag-surface-kind="kanban-card"]').first();
    await card.click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const point = await boxCenter(modal);
    const backdropPoint = { x: point.box.x + 8, y: point.box.y + 8 };
    for (const button of ['middle', 'right']) {
      await page.mouse.move(backdropPoint.x, backdropPoint.y);
      await page.mouse.down({ button });
      await page.mouse.up({ button });
      await page.waitForTimeout(150);
      assert(await modal.count() === 1, `task details ${button} backdrop must remain open`);
    }
    await modal.locator('button[aria-label="關閉任務詳情"]').click();
    await modal.waitFor({ state: 'detached', timeout: 10000 });
    return { modalPreserved: true };
  });
  await runCase('QA-084-B13 board share backdrop', async () => {
    await page.getByRole('button', { name: /分享/ }).first().click();
    const dialog = page.locator('[data-board-share-dialog]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const backdrop = page.locator('[data-board-share-backdrop="true"]');
    const point = await boxCenter(backdrop);
    const outside = { x: point.box.x + 8, y: point.box.y + 8 };
    for (const button of ['middle', 'right']) {
      await page.mouse.move(outside.x, outside.y);
      await page.mouse.down({ button });
      await page.mouse.up({ button });
      await page.waitForTimeout(150);
      assert(await dialog.count() === 1, `board share ${button} backdrop must remain open`);
    }
    await dialog.locator('button[aria-label="關閉分享看板"]').click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    return { dialogPreserved: true };
  });

  await runCase('QA-084-B12 calendar subscription backdrop', async () => {
    await page.goto('http://localhost:4000/?qcCalendarSubscription=1', { waitUntil: 'networkidle' });
    await waitForApp();
    const workspaceSidebar = page.locator('[data-layout-region="workspace-sidebar"]');
    if (!(await workspaceSidebar.isVisible().catch(() => false))) {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
      await workspaceSidebar.waitFor({ state: 'visible', timeout: 10000 });
    }
    await page.locator('[data-sidebar-settings-button="true"]').click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-section-tab="calendar"]').click();
    const fixture = page.locator('[data-calendar-subscription-local-fixture="true"]');
    await fixture.waitFor({ state: 'visible', timeout: 10000 });
    await fixture.locator('[data-calendar-subscription-delete-trigger="true"]').click();
    const dialog = page.locator('[data-calendar-subscription-delete-dialog="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const backdrop = page.locator('[data-calendar-subscription-delete-backdrop="true"]');
    const backdropBox = await backdrop.boundingBox();
    assert(Boolean(backdropBox), 'calendar delete backdrop should have a rendered box');
    const outside = { x: backdropBox.x + 8, y: backdropBox.y + 8 };
    for (const button of ['middle', 'right']) {
      await page.mouse.move(outside.x, outside.y);
      await page.mouse.down({ button });
      await page.mouse.up({ button });
      await page.waitForTimeout(150);
      assert(await dialog.count() === 1, `calendar subscription ${button} backdrop must remain open`);
    }
    await page.mouse.click(outside.x, outside.y, { button: 'left' });
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    await fixture.locator('[data-calendar-subscription-delete-trigger="true"]').click();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.locator('button[aria-label="取消刪除"]').first().click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    return { dialogPreserved: true, primaryBackdropClose: true, fixture: 'qcCalendarSubscription=1' };
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  await assertNoVisibleErrors('DEV-084 laptop');
  const laptop = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert(laptop.overflow <= 2, '1024x768 should not introduce document overflow', laptop);
  await page.screenshot({ path: 'output/playwright/dev-084-primary-pointer-isolation/laptop-final.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    visibleErrors: Array.from(document.querySelectorAll('body *')).filter(element => /Unhandled Runtime Error|Internal Server Error/.test(element.textContent || '')).length,
  }));
  assert(mobile.overflow <= 2 && mobile.visibleErrors === 0, '390x844 mobile boundary must stay clean', mobile);
  await assertNoVisibleErrors('DEV-084 mobile');
  await page.screenshot({ path: 'output/playwright/dev-084-primary-pointer-isolation/mobile-boundary.png', fullPage: true });

  await assertNoVisibleErrors('DEV-084 final');
  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser should have no console/page/network errors', errors);

  await page.evaluate(artifact => { window.__DEV084_ARTIFACT = artifact; }, {
    ok: true,
    cases,
    viewports: { desktop: { width: 1440, height: 900 }, laptop, mobile },
    errors,
    selectors: {
      ganttResize: 2,
      panelResizers: ['workspace', 'workbench', 'record-if-visible'],
      backdrops: ['task-details', 'board-share', 'calendar-subscription'],
    },
    cleanup: { fixtureResetBeforeRun: true, browserSessionClosedByRunner: true },
  });
}
