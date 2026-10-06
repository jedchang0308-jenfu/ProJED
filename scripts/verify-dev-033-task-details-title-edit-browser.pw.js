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

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
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
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(18);
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openTaskDetails = async (taskId) => {
    const task = page.locator(`[data-task-id="${taskId}"]`).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    await task.scrollIntoViewIfNeeded();
    const title = task.locator('.task-title-text').first();
    if (await title.count()) {
      await title.click();
    } else {
      await task.click({ position: { x: 90, y: 18 } });
    }
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, 'modal should open the requested task', { taskId, modalTaskId });
    return modal;
  };

  const readStoredTitle = async (taskId) => page.evaluate((taskId) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return nodes[taskId]?.title || '';
  }, taskId);

  let step = 'open-app';
  try {
    await openApp();
    const taskId = 'qc-card-1-child-1';
    const originalTitle = await readStoredTitle(taskId);
    assert(Boolean(originalTitle), 'test task should have an original title', { taskId, originalTitle });

    step = 'enter saves title';
    const modal = await openTaskDetails(taskId);
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await modal.getByText('已儲存', { exact: true }).count() === 0, 'saved status should be hidden before any edit');
    await page.waitForTimeout(1200);
    assert(await modal.getByText('已儲存', { exact: true }).count() === 0, 'opening task details should not autosave initial notes');
    assert(await modal.getByText('更多詳情選項', { exact: true }).count() === 0, 'removed task details subtitle should not be visible');
    assert(await modal.getByText('時間設定', { exact: true }).count() === 0, 'removed schedule section heading should not be visible');
    assert(await modal.getByText('備註欄', { exact: true }).count() === 0, 'removed notes section heading should not be visible');
    assert(await modal.getByText(/\d+\s*紀錄\s*\/\s*\d+\s*片段/).count() === 0, 'removed task knowledge count badge should not be visible');
    assert(await modal.locator('.lucide-pencil').count() === 0, 'removed title pencil affordance should not be visible');
    const savedTitle = `DEV033 modal rename ${Date.now().toString(36)}`;
    await titleInput.fill(`${savedTitle}   `);
    await titleInput.press('Enter');
    await page.waitForFunction(({ taskId, savedTitle }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes[taskId]?.title === savedTitle;
    }, { taskId, savedTitle }, { timeout: 10000 });
    const inputValueAfterSave = await titleInput.inputValue();
    assert(inputValueAfterSave === savedTitle, 'modal title input should show trimmed saved title', { inputValueAfterSave, savedTitle });

    step = 'title autosaves after the debounce interval';
    const autoSavedTitle = `DEV033 title autosave ${Date.now().toString(36)}`;
    await titleInput.fill(autoSavedTitle);
    await page.waitForFunction(({ taskId, autoSavedTitle }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes[taskId]?.title === autoSavedTitle;
    }, { taskId, autoSavedTitle }, { timeout: 10000 });
    await modal.locator('[data-task-details-save-status="saved"]', { hasText: '已儲存' }).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(2000);
    assert(await modal.locator('[data-task-details-save-status="saved"]', { hasText: '已儲存' }).isVisible(), 'saved status should remain visible after autosave completes');

    step = 'escape reverts title without closing modal';
    await titleInput.fill('should not save');
    await titleInput.press('Escape');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const valueAfterEscape = await titleInput.inputValue();
    const storedTitleAfterEscape = await readStoredTitle(taskId);
    assert(valueAfterEscape === autoSavedTitle, 'Escape in title input should revert to current task title', { valueAfterEscape, autoSavedTitle });
    assert(storedTitleAfterEscape === autoSavedTitle, 'Escape in title input should not persist draft title', { storedTitleAfterEscape, autoSavedTitle });

    step = 'autosave status replaces the redundant save button';
    const closeButton = modal.locator('button[aria-label="關閉任務詳情"]');
    assert(await modal.locator('[data-task-details-save="true"]').count() === 0, 'redundant save button should be removed');
    const closeTooltip = modal.locator('[data-task-details-close-tooltip="true"]');
    assert((await closeTooltip.textContent())?.includes('自動儲存'), 'close tooltip should explain automatic saving');
    await closeButton.hover();
    await closeTooltip.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'output/playwright/dev-033-task-details-autosave-tooltip-1440x900.png', fullPage: true });
    const firstNote = modal.locator('[data-task-detail-note-card="true"]').first().locator('[data-task-detail-note-content-input="true"]');
    const autoSavedNote = `DEV033 autosave ${Date.now().toString(36)}`;
    await firstNote.fill(autoSavedNote);
    await modal.locator('[data-task-details-save-status="saved"]', { hasText: '已儲存' }).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(({ taskId, autoSavedNote }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes[taskId]?.detailNotes?.[0]?.content === autoSavedNote;
    }, { taskId, autoSavedNote }, { timeout: 10000 });
    await page.screenshot({ path: 'output/playwright/dev-033-task-details-autosave-saved-1440x900.png', fullPage: true });

    step = 'close flushes pending note immediately';
    const closeSavedNote = `DEV033 close save ${Date.now().toString(36)}`;
    await firstNote.fill(closeSavedNote);
    await closeButton.click();
    await modal.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForFunction(({ taskId, closeSavedNote }) => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return nodes[taskId]?.detailNotes?.[0]?.content === closeSavedNote;
    }, { taskId, closeSavedNote }, { timeout: 10000 });

    const reopenedModal = await openTaskDetails(taskId);
    assert(await reopenedModal.getByText('已儲存', { exact: true }).count() === 0, 'saved status should reset when task details reopen');
    await page.waitForTimeout(1200);
    assert(await reopenedModal.getByText('已儲存', { exact: true }).count() === 0, 'reopening task details should not autosave initial notes');
    const reopenedNoteValue = await reopenedModal.locator('[data-task-detail-note-card="true"]').first().locator('[data-task-detail-note-content-input="true"]').textContent();
    assert(reopenedNoteValue === closeSavedNote, 'close button should preserve the latest pending note', { reopenedNoteValue, closeSavedNote });

    const verifyResponsiveTooltip = async (viewport, artifactName) => {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);
      const responsiveClose = reopenedModal.locator('button[aria-label="關閉任務詳情"]');
      const responsiveTooltip = reopenedModal.locator('[data-task-details-close-tooltip="true"]');
      await responsiveClose.focus();
      await responsiveTooltip.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(200);
      const geometry = await responsiveTooltip.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      assert(geometry.left >= 0 && geometry.right <= geometry.viewportWidth, 'close tooltip should stay inside the viewport', geometry);
      assert(geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight, 'close tooltip should stay vertically visible', geometry);
      assert(geometry.documentWidth <= geometry.viewportWidth, 'task details should not introduce horizontal page overflow', geometry);
      await page.screenshot({ path: `output/playwright/${artifactName}.png`, fullPage: true });
    };

    step = 'responsive tooltip and visible error sweep';
    await verifyResponsiveTooltip({ width: 1024, height: 768 }, 'dev-033-task-details-autosave-tooltip-1024x768');
    await verifyResponsiveTooltip({ width: 390, height: 844 }, 'dev-033-task-details-autosave-tooltip-390x844');
    const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
    assert(visibleErrors.length === 0, 'task details should not show visible errors in the successful autosave flow', { visibleErrors });
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
