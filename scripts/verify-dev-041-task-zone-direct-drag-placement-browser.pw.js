/* eslint-disable */
async (page) => {
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
    }
  };

  const waitForVisible = async (selector, label, timeout = 15000) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout });
    console.log(`PASS ${label}`);
    return locator;
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
      localStorage.setItem('projed-task-zone-source-panel', JSON.stringify({
        open: true,
        pinned: false,
        tab: 'unplaced',
        scope: 'all',
        customWorkspaceIds: [],
        customBoardIds: [],
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForVisible('nav', 'app navigation is visible');
  };

  const openBoard = async () => {
    const boardRow = page.locator('[data-sidebar-board-row="true"]').first();
    if (await boardRow.isVisible().catch(() => false)) {
      await boardRow.click();
      return;
    }

    const boardMode = page.locator('[data-mode-switcher-value="board"]').first();
    if (await boardMode.isVisible().catch(() => false)) {
      await boardMode.click();
      return;
    }

    throw new Error('No board entry or board mode switcher is available for DEV-041 browser smoke.');
  };

  await openApp();

  const taskZoneEntry = page.locator('[data-sidebar-task-zone="true"]').first();
  if (await taskZoneEntry.isVisible().catch(() => false)) {
    await taskZoneEntry.click();
    await waitForVisible('[data-task-zone-view="true"]', 'full-page task-zone opens');
    const placementCta = await waitForVisible('[data-task-zone-placement-cta="true"]', 'full-page task-zone exposes placement CTA');
    await waitForVisible('[data-task-zone-my-tasks-cta="true"]', 'full-page task-zone exposes my-tasks board-panel CTA');

    const placementCtaLabel = (await placementCta.textContent())?.trim() || '';
    await placementCta.click();
    if (/選擇看板/.test(placementCtaLabel)) {
      await openBoard();
    }
    await waitForVisible('[data-task-zone-source-panel="true"]', 'placement CTA reaches board left source panel');
    await waitForVisible('[data-task-zone-board-panel="true"]', 'placement CTA opens integrated board panel');
    await waitForVisible('[data-task-zone-source-tab="unplaced"][data-task-zone-source-tab-active="true"]', 'placement CTA opens unplaced source tab');
    await waitForVisible('[data-task-zone-title-input="true"]', 'placement CTA opens unplaced composer path');

    await taskZoneEntry.click();
    await waitForVisible('[data-task-zone-view="true"]', 'full-page task-zone reopens for my-tasks CTA');
    const myTasksCta = await waitForVisible('[data-task-zone-my-tasks-cta="true"]', 'full-page task-zone exposes my-tasks CTA after placement path');
    const myTasksCtaLabel = (await myTasksCta.textContent())?.trim() || '';
    await myTasksCta.click();
    if (/先選看板/.test(myTasksCtaLabel)) {
      await openBoard();
    }
    await waitForVisible('[data-task-zone-source-panel="true"]', 'my-tasks CTA reaches board left source panel');
    await waitForVisible('[data-task-zone-board-panel="true"]', 'my-tasks CTA opens integrated board panel');
    await waitForVisible('[data-task-zone-source-tab="my_tasks"][data-task-zone-source-tab-active="true"]', 'my-tasks CTA opens source-panel my-tasks tab');
  } else {
    console.log('SKIP full-page task-zone CTA smoke: sidebar task-zone entry is not visible.');
  }

  await openBoard();

  await waitForVisible('[data-task-zone-source-panel="true"]', 'board shows task-zone source panel');
  await waitForVisible('[data-task-zone-board-panel="true"]', 'task-zone source panel is integrated into board');

  const unplacedTab = page.getByRole('button', { name: /待歸位/ }).first();
  await unplacedTab.waitFor({ state: 'visible', timeout: 10000 });
  await unplacedTab.click();
  await waitForVisible('[data-task-zone-title-input="true"]', 'unplaced composer is visible in source panel');

  const smokeTitle = `DEV-041 drag smoke ${Date.now()}`;
  let unplacedTaskItem = page.locator('[data-task-zone-item="true"]').first();
  const hasExistingUnplacedItem = await unplacedTaskItem.isVisible().catch(() => false);
  const createdFallbackUnplacedItem = !hasExistingUnplacedItem;
  let fallbackUnplacedTaskId = null;
  if (!hasExistingUnplacedItem) {
    await page.locator('[data-task-zone-title-input="true"]').first().fill(smokeTitle);
    await page.locator('[data-task-zone-create="true"]').first().click();
    await page.getByText(smokeTitle).waitFor({ state: 'visible', timeout: 10000 });
    unplacedTaskItem = page.locator('[data-task-zone-item="true"]').first();
    fallbackUnplacedTaskId = await unplacedTaskItem.getAttribute('data-task-id');
    assert(fallbackUnplacedTaskId, 'fallback unplaced smoke item should expose a stable data-task-id');
    unplacedTaskItem = page.locator(`[data-task-zone-item="true"][data-task-id="${fallbackUnplacedTaskId}"]`).first();
    console.log('PASS created fallback unplaced smoke item because no reusable source item existed');
  } else {
    console.log('PASS reused existing unplaced task-zone item for positioning smoke');
  }
  await unplacedTaskItem.waitFor({ state: 'visible', timeout: 10000 });

  const unplacedDragHandle = unplacedTaskItem.locator('[data-task-drag-handle="true"]').first();
  await unplacedDragHandle.waitFor({ state: 'visible', timeout: 10000 });
  console.log('PASS unplaced task uses shared drag handle');
  const boardDropSurface = page.locator('[data-kanban-drop-indicator="column"]').first();
  const sourceBox = await unplacedDragHandle.boundingBox();
  const taskCardDropSurface = page.locator('[data-kanban-card-drop-indicator="card"]').first();
  const taskCardBox = await taskCardDropSurface.boundingBox().catch(() => null);
  const columnBox = await boardDropSurface.boundingBox();
  const targetBox = taskCardBox || columnBox;
  assert(sourceBox && targetBox, 'unplaced item and board drop surface should expose drag coordinates', {
    hasSourceBox: Boolean(sourceBox),
    hasTargetBox: Boolean(targetBox),
    targetType: taskCardBox ? 'card' : 'column',
  });
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  const targetPoint = taskCardBox
    ? { x: targetBox.x + Math.min(targetBox.width / 2, 32), y: targetBox.y + 16 }
    : { x: targetBox.x + targetBox.width / 2, y: targetBox.y + Math.min(targetBox.height / 2, 80) };
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  if (taskCardBox) {
    await waitForVisible('[data-kanban-card-drop-indicator-active="true"]', 'unplaced task drag shows normal task-card positioning frame');
  } else {
    await waitForVisible('[data-kanban-drop-indicator-active="true"]', 'unplaced task drag shows normal board positioning frame');
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await unplacedTaskItem.waitFor({ state: 'visible', timeout: 5000 });
  console.log('PASS unplaced task-zone item remains after cancelled positioning smoke');
  if (createdFallbackUnplacedItem) {
    assert(fallbackUnplacedTaskId, 'fallback cleanup should target the created item by data-task-id');
    await unplacedTaskItem.locator('[data-task-zone-remove="true"]').first().click();
    await unplacedTaskItem.waitFor({ state: 'hidden', timeout: 5000 });
    console.log(`PASS cleaned up fallback unplaced smoke item ${fallbackUnplacedTaskId}`);
  }

  const myTasksTab = page.getByRole('button', { name: /我的任務/ }).first();
  await myTasksTab.waitFor({ state: 'visible', timeout: 10000 });
  await myTasksTab.click();
  console.log('PASS my-tasks tab is reachable');

  const hasMyTaskCard = await page.locator('[data-task-zone-my-task-card="true"]').first().isVisible().catch(() => false);
  if (hasMyTaskCard) {
    const myTaskCard = await waitForVisible('[data-task-zone-my-task-card="true"]', 'assigned my-task card is visible');
    await waitForVisible('[data-task-zone-my-task-card="true"] [data-task-drag-handle="true"]', 'assigned my-task card uses shared drag handle');
    const assignedTaskId = await myTaskCard.getAttribute('data-task-zone-my-task-id');
    const myTaskHandle = myTaskCard.locator('[data-task-drag-handle="true"]').first();
    const myTaskSourceBox = await myTaskHandle.boundingBox();
    const myTaskTargetCard = page.locator(`[data-kanban-card-drop-indicator="card"]:not([data-task-id="${assignedTaskId || ''}"])`).first();
    const myTaskTargetCardBox = await myTaskTargetCard.boundingBox().catch(() => null);
    const myTaskColumnBox = await page.locator('[data-kanban-drop-indicator="column"]').first().boundingBox();
    const myTaskTargetBox = myTaskTargetCardBox || myTaskColumnBox;
    assert(myTaskSourceBox && myTaskTargetBox, 'assigned my-task and board target should expose drag coordinates', {
      hasSourceBox: Boolean(myTaskSourceBox),
      hasTargetBox: Boolean(myTaskTargetBox),
      targetType: myTaskTargetCardBox ? 'card' : 'column',
    });
    await page.mouse.move(myTaskSourceBox.x + myTaskSourceBox.width / 2, myTaskSourceBox.y + myTaskSourceBox.height / 2);
    await page.mouse.down();
    const myTaskTargetPoint = myTaskTargetCardBox
      ? { x: myTaskTargetBox.x + Math.min(myTaskTargetBox.width / 2, 32), y: myTaskTargetBox.y + 16 }
      : { x: myTaskTargetBox.x + myTaskTargetBox.width / 2, y: myTaskTargetBox.y + Math.min(myTaskTargetBox.height / 2, 80) };
    await page.mouse.move(myTaskTargetPoint.x, myTaskTargetPoint.y, { steps: 12 });
    if (myTaskTargetCardBox) {
      await waitForVisible('[data-kanban-card-drop-indicator-active="true"]', 'assigned my-task drag shows normal task-card positioning frame');
    } else {
      await waitForVisible('[data-kanban-drop-indicator-active="true"]', 'assigned my-task drag shows normal board positioning frame');
    }
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await myTaskCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS assigned my-task card remains after cancelled positioning smoke');
  } else {
    console.log('SKIP assigned my-task card smoke: local test data has no visible assigned task.');
  }

  const visibleBoardSurface = await page.evaluate(() => {
    const sourcePanel = document.querySelector('[data-task-zone-source-panel="true"]')?.getBoundingClientRect();
    const boardCard = document.querySelector('.kanban-task-card[data-task-id]')?.getBoundingClientRect();
    if (!sourcePanel) return false;
    if (!boardCard) return true;
    return boardCard.left > sourcePanel.right && boardCard.width > 0 && boardCard.height > 0;
  });
  assert(visibleBoardSurface, 'board structure should remain to the right of the task-zone source panel');
  console.log('PASS source panel preserves left-to-right source/board visual flow');
}
