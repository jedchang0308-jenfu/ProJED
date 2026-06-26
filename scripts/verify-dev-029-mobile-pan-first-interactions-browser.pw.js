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
  };

  const switchMode = async (mode) => {
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(300);
  };

  const closeDetails = async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const firstVisibleTask = async (selector) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    return locator;
  };

  const dispatchTouchSequence = async (locator, dx = 56, dy = 22) => {
    await locator.evaluate((element, movement) => {
      const rect = element.getBoundingClientRect();
      const start = { clientX: rect.left + Math.min(40, Math.max(8, rect.width / 3)), clientY: rect.top + Math.min(18, Math.max(8, rect.height / 2)) };
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

  const clickTaskMainArea = async (locator) => {
    const box = await locator.boundingBox();
    assert(Boolean(box), 'task should have a bounding box');
    await locator.click({
      position: {
        x: Math.min(Math.max(72, box.width * 0.42), Math.max(8, box.width - 8)),
        y: Math.min(18, Math.max(8, box.height / 2)),
      },
    });
  };

  const assertMobilePanContract = async ({ mode, selector, surfaceSelector, switchBefore = true }) => {
    if (switchBefore) await switchMode(mode);
    await page.locator(surfaceSelector).first().waitFor({ state: 'visible', timeout: 15000 });
    const task = await firstVisibleTask(selector);
    const taskId = await task.getAttribute(mode === 'mindmap' ? 'data-mindmap-node' : 'data-task-id');
    assert(Boolean(taskId), `${mode} task should expose task id`);

    await dispatchTouchSequence(task);
    await page.waitForTimeout(100);
    const modalAfterPan = await page.locator('[data-task-details-modal="true"]').count();
    assert(modalAfterPan === 0, `${mode} pan should not open TaskDetailsModal`, { taskId, modalAfterPan });

    await page.waitForTimeout(800);
    if (mode === 'mindmap') {
      await task.click();
    } else {
      await clickTaskMainArea(task);
    }
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${mode} tap should open TaskDetailsModal`, { taskId, modalTaskId });
    await closeDetails();
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

    step = 'board-mobile-pan';
    await assertMobilePanContract({
      mode: 'board',
      selector: '.kanban-task-card[data-touch-tap-guard="true"]',
      surfaceSelector: '[data-mobile-pan-surface="board"]',
      switchBefore: false,
    });
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
