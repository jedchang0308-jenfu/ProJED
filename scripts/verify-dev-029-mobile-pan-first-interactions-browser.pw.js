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

  const setCoarsePointer = async () => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query.includes('pointer: coarse') || query.includes('hover: none')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          };
        }
        return nativeMatchMedia(query);
      };
    });
  };

  const openApp = async () => {
    await setCoarsePointer();
    await page.setViewportSize({ width: 390, height: 844 });
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
      window.__PROJED_QC__?.reset(100);
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
    await page.locator('[data-mobile-pan-surface="board"][data-mobile-board-pan="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const closeDetails = async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const assertNoVisibleErrors = async (label) => {
    const visibleErrors = await page.locator('[role="alert"], .inline-error').evaluateAll((items) => (
      items
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const text = element.textContent || '';
          return rect.width > 0 && rect.height > 0 && /error|failed|失敗|錯誤|not found|internal server/i.test(text);
        })
        .map((element) => element.textContent || '')
    ));
    assert(visibleErrors.length === 0, `${label} should have no visible runtime errors`, { visibleErrors });
  };

  const scrollInfo = async (selector) => page.locator(selector).first().evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));

  const resetScroll = async (selector, values = {}) => {
    await page.locator(selector).first().evaluate((element, values) => {
      element.scrollLeft = values.left ?? element.scrollLeft;
      element.scrollTop = values.top ?? element.scrollTop;
    }, values);
  };

  const firstScrollableColumn = async () => {
    const index = await page.locator('[data-mobile-pan-surface="kanban-column"]').evaluateAll((columns) => (
      columns.findIndex((element) => element.scrollHeight > element.clientHeight + 40)
    ));
    assert(index >= 0, 'test fixture should expose a vertically scrollable kanban column');
    return page.locator('[data-mobile-pan-surface="kanban-column"]').nth(index);
  };

  const dispatchTouchSequence = async (locator, dx = -96, dy = 0) => {
    await locator.evaluate((element, movement) => {
      const rect = element.getBoundingClientRect();
      const start = {
        clientX: rect.left + Math.min(Math.max(24, rect.width / 2), Math.max(8, rect.width - 8)),
        clientY: rect.top + Math.min(Math.max(18, rect.height / 2), Math.max(8, rect.height - 8)),
      };
      const makeEvent = (type, point) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touches = type === 'touchend' || type === 'touchcancel' ? [] : [point];
        Object.defineProperty(event, 'touches', { value: touches });
        Object.defineProperty(event, 'targetTouches', { value: touches });
        Object.defineProperty(event, 'changedTouches', { value: [point] });
        return event;
      };
      const midpoint = {
        clientX: start.clientX + movement.dx / 2,
        clientY: start.clientY + movement.dy / 2,
      };
      const end = {
        clientX: start.clientX + movement.dx,
        clientY: start.clientY + movement.dy,
      };
      element.dispatchEvent(makeEvent('touchstart', start));
      element.dispatchEvent(makeEvent('touchmove', midpoint));
      element.dispatchEvent(makeEvent('touchmove', end));
      element.dispatchEvent(makeEvent('touchend', end));
      element.click();
    }, { dx, dy });
  };

  const clickTaskMainArea = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
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
    assert(Boolean(box), 'task should have a bounding box');
    await locator.click({
      position: {
        x: Math.min(Math.max(72, box.width * 0.42), Math.max(8, box.width - 8)),
        y: Math.min(18, Math.max(8, box.height / 2)),
      },
    });
  };

  const assertPanDidNotOpenDetails = async (label) => {
    await page.waitForTimeout(120);
    const modalAfterPan = await page.locator('[data-task-details-modal="true"]').count();
    assert(modalAfterPan === 0, `${label} pan should not open TaskDetailsModal`, { modalAfterPan });
  };

  const assertHorizontalBoardPan = async (locator, label) => {
    const beforeCapability = await scrollInfo('[data-mobile-pan-surface="board"]');
    assert(
      beforeCapability.scrollWidth > beforeCapability.clientWidth + 80,
      `${label} needs horizontal overflow`,
      beforeCapability,
    );
    await resetScroll('[data-mobile-pan-surface="board"]', { left: 0 });
    const before = await scrollInfo('[data-mobile-pan-surface="board"]');
    await dispatchTouchSequence(locator, -120, 4);
    const after = await scrollInfo('[data-mobile-pan-surface="board"]');
    assert(
      after.scrollLeft - before.scrollLeft >= 40,
      `${label} drag should horizontally scroll board`,
      { before, after },
    );
    await assertPanDidNotOpenDetails(label);
  };

  const assertVerticalColumnPan = async (locator, columnLocator, label) => {
    const beforeCapability = await columnLocator.evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    assert(
      beforeCapability.scrollHeight > beforeCapability.clientHeight + 40,
      `${label} needs vertical overflow`,
      beforeCapability,
    );
    await columnLocator.evaluate((element) => { element.scrollTop = 0; });
    const before = await columnLocator.evaluate((element) => ({ scrollTop: element.scrollTop }));
    await dispatchTouchSequence(locator, 3, -120);
    const after = await columnLocator.evaluate((element) => ({ scrollTop: element.scrollTop }));
    assert(
      after.scrollTop - before.scrollTop >= 40,
      `${label} drag should vertically scroll column`,
      { before, after },
    );
    await assertPanDidNotOpenDetails(label);
  };

  const assertVerticalColumnPanFromBottom = async (locator, columnLocator, label) => {
    const beforeCapability = await columnLocator.evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    assert(
      beforeCapability.scrollHeight > beforeCapability.clientHeight + 40,
      `${label} needs vertical overflow`,
      beforeCapability,
    );
    await columnLocator.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const before = await columnLocator.evaluate((element) => ({ scrollTop: element.scrollTop }));
    await dispatchTouchSequence(locator, 3, 120);
    const after = await columnLocator.evaluate((element) => ({ scrollTop: element.scrollTop }));
    assert(
      before.scrollTop - after.scrollTop >= 40,
      `${label} drag should vertically scroll column`,
      { before, after },
    );
    await assertPanDidNotOpenDetails(label);
  };

  const assertTapOpensTask = async (selector, label) => {
    const task = page.locator(selector).first();
    await task.waitFor({ state: 'visible', timeout: 15000 });
    const taskId = await task.getAttribute('data-task-id');
    assert(Boolean(taskId), `${label} task should expose task id`);
    await page.waitForTimeout(800);
    await clickTaskMainArea(task);
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${label} tap should open TaskDetailsModal`, { taskId, modalTaskId });
    await closeDetails();
  };

  const assertInputFocus = async () => {
    const input = page.locator('[data-mobile-pan-surface="kanban-column"] input[placeholder="輸入任務名稱"]').first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.fill('DEV034 input smoke');
    const value = await input.inputValue();
    assert(value === 'DEV034 input smoke', 'input should accept focus and text without mobile board pan interference', { value });
  };

  let step = 'open-app';
  try {
    await openApp();

    step = 'mobile should only expose board mode';
    const boardModeCount = await page.locator('[data-mode-switcher-value="board"]').count();
    const listModeCount = await page.locator('[data-mode-switcher-value="list"]').count();
    const mindMapModeCount = await page.locator('[data-mode-switcher-value="mindmap"]').count();
    const ganttModeCount = await page.locator('[data-mode-switcher-value="gantt"]').count();
    const calendarModeCount = await page.locator('[data-mode-switcher-value="calendar"]').count();
    const recordsModeCount = await page.locator('[data-mode-switcher-value="records"]').count();
    assert(boardModeCount === 1, 'mobile should expose the board mode entry', { boardModeCount });
    assert(
      listModeCount + mindMapModeCount + ganttModeCount + calendarModeCount + recordsModeCount === 0,
      'mobile should hide non-board mode entries',
      { listModeCount, mindMapModeCount, ganttModeCount, calendarModeCount, recordsModeCount },
    );

    step = 'card horizontal pan';
    const card = page.locator('.kanban-task-card[data-touch-tap-guard="true"]').first();
    await card.waitFor({ state: 'visible', timeout: 15000 });
    await assertHorizontalBoardPan(card, 'card');

    step = 'checklist horizontal pan';
    const checklist = page.locator('.kanban-checklist-item[data-touch-tap-guard="true"]').first();
    await checklist.waitFor({ state: 'visible', timeout: 15000 });
    await assertHorizontalBoardPan(checklist, 'checklist');

    step = 'checklist vertical pan';
    const scrollableColumn = await firstScrollableColumn();
    await scrollableColumn.scrollIntoViewIfNeeded();
    const checklistInScrollableColumn = scrollableColumn.locator('.kanban-checklist-item[data-touch-tap-guard="true"]').first();
    await checklistInScrollableColumn.waitFor({ state: 'visible', timeout: 15000 });
    await assertVerticalColumnPan(checklistInScrollableColumn, scrollableColumn, 'checklist');

    step = 'column blank vertical pan';
    await assertVerticalColumnPan(scrollableColumn, scrollableColumn, 'column blank');

    step = 'add task input vertical pan';
    const addTaskInput = scrollableColumn.locator('input[placeholder="輸入任務名稱"][data-mobile-board-pan-allow="true"]').first();
    await assertVerticalColumnPanFromBottom(addTaskInput, scrollableColumn, 'add task input');

    step = 'add task button vertical pan';
    const addTaskButton = scrollableColumn.locator('button[data-mobile-board-pan-allow="true"]').first();
    await assertVerticalColumnPanFromBottom(addTaskButton, scrollableColumn, 'add task button');

    step = 'board blank horizontal pan';
    await assertHorizontalBoardPan(page.locator('[data-mobile-pan-surface="board"]').first(), 'board blank');

    step = 'tap opens details';
    await resetScroll('[data-mobile-pan-surface="board"]', { left: 0 });
    await assertTapOpensTask('.kanban-task-card[data-touch-tap-guard="true"]', 'card');
    await assertTapOpensTask('.kanban-checklist-item[data-touch-tap-guard="true"]', 'checklist');

    step = 'input focus';
    await assertInputFocus();

    step = 'visible error sweep';
    await assertNoVisibleErrors(step);
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
