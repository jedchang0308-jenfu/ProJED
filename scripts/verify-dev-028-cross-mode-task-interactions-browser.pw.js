/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
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
  };

  const switchMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const closeDetails = async () => {
    await page.locator('[data-task-details-modal="true"] button[title="關閉"]').click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const closeDetailsWithEsc = async () => {
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const firstVisibleTask = async (selector) => {
    const locator = page.locator(selector).filter({ hasNot: page.locator('[data-task-title-input="true"]') }).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    return locator;
  };

  const clickTaskMainSurface = async (locator, position = { x: 80, y: 12 }) => {
    await locator.click({ position });
  };

  const assertClickOpensDetails = async ({ mode, selector, titleInputSelector, clickPosition }) => {
    await switchMode(mode);
    const task = await firstVisibleTask(selector);
    const taskId = await task.getAttribute('data-task-id');
    assert(Boolean(taskId), `${mode} task should expose data-task-id`);

    const clickDebug = await task.evaluate((element, position) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + position.x;
      const y = rect.top + position.y;
      const hit = document.elementFromPoint(x, y);
      return {
        taskId: element.getAttribute('data-task-id'),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        },
        click: { x: Math.round(x), y: Math.round(y) },
        hitTag: hit?.tagName || null,
        hitText: hit?.textContent?.trim().slice(0, 80) || '',
        hitTaskId: hit?.closest?.('[data-task-id]')?.getAttribute('data-task-id') || null,
        hitControl: Boolean(hit?.closest?.('[data-task-interaction-control="true"],[data-task-drag-handle="true"]')),
        workbenchPanel: document.querySelector('[data-task-workbench-panel]')?.getAttribute('data-task-workbench-panel') || null,
        recordSelectingBanner: document.body.textContent?.includes('選擇任務加入紀錄') || false,
      };
    }, clickPosition);

    await clickTaskMainSurface(task, clickPosition);
    const modal = page.locator('[data-task-details-modal="true"]');
    try {
      await modal.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      throw new Error(`${mode} click did not open TaskDetailsModal: ${JSON.stringify(clickDebug)}`);
    }
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${mode} single click should open TaskDetailsModal`, { taskId, modalTaskId });
    const detailTitleInput = modal.locator('[data-task-details-title-input="true"]');
    await detailTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await detailTitleInput.count() === 1, `${mode} details title input should be the editable title locus`);
    await closeDetails();

    const selectedCount = await page.locator(`[data-task-id="${taskId}"][data-task-selected="true"]`).count();
    assert(selectedCount > 0, `${mode} should retain selected task after closing details`, { taskId, selectedCount });

    await page.keyboard.press('F2');
    await page.waitForTimeout(80);
    await page.keyboard.press('t');
    await page.waitForTimeout(80);
    const shortcutRenameInputs = await page.locator(`${titleInputSelector}, [data-mindmap-title-input]`).count();
    const shortcutModalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(shortcutRenameInputs === 0 && shortcutModalCount === 0, `${mode} F2/t should not start outer title rename`, {
      shortcutRenameInputs,
      shortcutModalCount,
    });

    const escapedTaskIdForMenu = taskId.replace(/"/g, '\\"');
    const menuTask = page.locator(`${selector}[data-task-id="${escapedTaskIdForMenu}"]`).first();
    await menuTask.click({ button: 'right', position: clickPosition });
    await page.getByText('更多詳情選項').waitFor({ state: 'visible', timeout: 10000 });
    const renameMenuCount = await page.getByText('重新命名任務', { exact: true }).count();
    assert(renameMenuCount === 0, `${mode} context menu should not expose task rename`, { renameMenuCount });
    await page.keyboard.press('Escape');

    const escapedTaskId = taskId.replace(/"/g, '\\"');
    await clickTaskMainSurface(page.locator(`${selector}[data-task-id="${escapedTaskId}"]`).first(), clickPosition);
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await closeDetails();
    const renameInputs = await page.locator(titleInputSelector).count();
    assert(renameInputs === 0, `${mode} title click should not enter rename input`, { renameInputs });
  };

  const assertMindMapClickOpensDetails = async () => {
    await switchMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    const node = page.locator('[data-mindmap-node]').first();
    await node.waitFor({ state: 'visible', timeout: 15000 });
    const taskId = await node.getAttribute('data-mindmap-node');
    await node.click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, 'mindmap single click should open TaskDetailsModal', { taskId, modalTaskId });
    const detailTitleInput = modal.locator('[data-task-details-title-input="true"]');
    await detailTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await detailTitleInput.count() === 1, 'mindmap details title input should be the editable title locus');
    await closeDetails();

    const selected = await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count();
    assert(selected === 1, 'mindmap should retain selected node after closing details', { taskId, selected });
    await page.keyboard.press('F2');
    await page.waitForTimeout(80);
    await page.keyboard.press('t');
    await page.waitForTimeout(80);
    const renameInputs = await page.locator('[data-mindmap-title-input]').count();
    const shortcutModalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(renameInputs === 0 && shortcutModalCount === 0, 'mindmap F2/t should not enter node rename input', { renameInputs, shortcutModalCount });

    await node.click({ button: 'right' });
    await page.getByText('更多詳情選項').waitFor({ state: 'visible', timeout: 10000 });
    const renameMenuCount = await page.getByText('重新命名任務', { exact: true }).count();
    assert(renameMenuCount === 0, 'mindmap context menu should not expose task rename', { renameMenuCount });
    await page.keyboard.press('Escape');
  };

  let step = 'open-app';
  try {
    await openApp();

    step = 'list-click-details';
    await assertClickOpensDetails({
      mode: 'list',
      selector: '[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 90, y: 12 },
    });

    step = 'mindmap-click-details';
    await assertMindMapClickOpensDetails();

    step = 'board-click-details';
    await assertClickOpensDetails({
      mode: 'board',
      selector: '.kanban-task-card[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 90, y: 18 },
    });

    step = 'gantt-click-details';
    await assertClickOpensDetails({
      mode: 'gantt',
      selector: '[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 120, y: 12 },
    });

    step = 'mobile-board-visibility';
    await switchMode('board');
    await page.setViewportSize({ width: 390, height: 844 });
    await firstVisibleTask('.kanban-task-card[data-task-id]');
    const hasVisibleCard = await page.evaluate(() => {
      const task = document.querySelector('.kanban-task-card[data-task-id]');
      const rect = task?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(hasVisibleCard, 'mobile board task card should remain reachable in the viewport');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
