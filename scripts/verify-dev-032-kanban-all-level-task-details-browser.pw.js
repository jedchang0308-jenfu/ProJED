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
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(18);
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-filters', JSON.stringify({
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
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const closeDetails = async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const clickMainArea = async (locator) => {
    const title = locator.locator('.task-title-text').first();
    if (await title.count()) {
      const titleBox = await title.boundingBox();
      if (titleBox) {
        await title.click({
          position: {
            x: Math.min(8, Math.max(2, titleBox.width / 2)),
            y: Math.min(8, Math.max(2, titleBox.height / 2)),
          },
        });
        return;
      }
    }

    const box = await locator.boundingBox();
    assert(Boolean(box), 'task should have a visible bounding box');
    await locator.click({
      position: {
        x: Math.min(Math.max(72, box.width * 0.42), Math.max(8, box.width - 8)),
        y: Math.min(14, Math.max(7, box.height / 2)),
      },
    });
  };

  const assertOpensTask = async (selector, taskId, label) => {
    const task = page.locator(selector).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    await task.scrollIntoViewIfNeeded();
    await clickMainArea(task);
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${label} should open its own TaskDetailsModal`, { taskId, modalTaskId });
    await closeDetails();
  };

  const assertControlDoesNotOpenDetails = async (selector, label) => {
    const control = page.locator(selector).first();
    await control.waitFor({ state: 'visible', timeout: 15000 });
    await control.click({ force: true });
    await page.waitForTimeout(150);
    const modalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(modalCount === 0, `${label} should not open TaskDetailsModal`, { modalCount });
    const titleInput = page.locator('[data-task-title-input="true"]').first();
    if (await titleInput.count()) {
      await titleInput.press('Escape');
      await titleInput.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    } else {
      await page.keyboard.press('Escape');
    }
  };

  const dispatchTouchSequence = async (locator, dx = 52, dy = 24) => {
    await locator.evaluate((element, movement) => {
      const rect = element.getBoundingClientRect();
      const start = {
        clientX: rect.left + Math.min(38, Math.max(8, rect.width / 3)),
        clientY: rect.top + Math.min(14, Math.max(7, rect.height / 2)),
      };
      const makeEvent = (type, point) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touches = type === 'touchend' || type === 'touchcancel' ? [] : [point];
        Object.defineProperty(event, 'touches', { value: touches });
        Object.defineProperty(event, 'targetTouches', { value: touches });
        Object.defineProperty(event, 'changedTouches', { value: [point] });
        return event;
      };
      element.dispatchEvent(makeEvent('touchstart', start));
      element.dispatchEvent(makeEvent('touchmove', { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy }));
      element.dispatchEvent(makeEvent('touchend', { clientX: start.clientX + movement.dx, clientY: start.clientY + movement.dy }));
      element.click();
    }, { dx, dy });
  };

  const assertPanDoesNotOpenDetails = async (selector, label) => {
    const task = page.locator(selector).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    await task.scrollIntoViewIfNeeded();
    await dispatchTouchSequence(task);
    await page.waitForTimeout(150);
    const modalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(modalCount === 0, `${label} pan should not open TaskDetailsModal`, { modalCount });
    await page.waitForTimeout(800);
  };

  let step = 'open-app';
  try {
    await openApp();

    const level2Id = 'qc-card-1';
    const level3Id = 'qc-card-1-child-1';
    const level4Id = 'qc-card-1-child-1-deep-1';

    step = 'desktop level task details';
    await assertOpensTask(`.kanban-task-card[data-task-id="${level2Id}"]`, level2Id, 'L2 card');
    await assertOpensTask(`.kanban-checklist-item[data-task-id="${level3Id}"]`, level3Id, 'L3 checklist task');
    await assertOpensTask(`.kanban-checklist-item[data-task-id="${level4Id}"]`, level4Id, 'L4 checklist task');

    step = 'interactive controls';
    await assertControlDoesNotOpenDetails(`.kanban-checklist-item[data-task-id="${level3Id}"] [data-task-interaction-control="true"]`, 'L3 rename control');
    await assertControlDoesNotOpenDetails(`.kanban-checklist-item[data-task-id="${level4Id}"] [data-task-drag-handle="true"]`, 'L4 drag handle');

    step = 'mobile pan guard';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await assertPanDoesNotOpenDetails(`.kanban-checklist-item[data-task-id="${level3Id}"][data-touch-tap-guard="true"]`, 'L3 checklist task');
    await assertPanDoesNotOpenDetails(`.kanban-checklist-item[data-task-id="${level4Id}"][data-touch-tap-guard="true"]`, 'L4 checklist task');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await assertOpensTask(`.kanban-checklist-item[data-task-id="${level3Id}"]`, level3Id, 'mobile L3 tap');
    await assertOpensTask(`.kanban-checklist-item[data-task-id="${level4Id}"]`, level4Id, 'mobile L4 tap');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
