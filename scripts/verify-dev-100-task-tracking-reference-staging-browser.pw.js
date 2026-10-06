/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-100';
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev100-ui-workspace',
    title: 'DEV-100 副本暫存工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev100-ui-board-a', title: '來源看板', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev100-ui-board-b', title: '目標看板', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, title, boardId, parentId, order, nodeType = 'task') => ({
    id,
    title,
    boardId,
    workspaceId: workspace.id,
    parentId,
    order,
    nodeType,
    status: 'todo',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  });
  const nodes = {
    'dev100-ui-column-a': makeNode('dev100-ui-column-a', '來源待辦', 'dev100-ui-board-a', null, 0, 'group'),
    'dev100-ui-task-a': makeNode('dev100-ui-task-a', '跨看板追蹤任務', 'dev100-ui-board-a', 'dev100-ui-column-a', 0),
    'dev100-ui-column-b': makeNode('dev100-ui-column-b', '目標待辦', 'dev100-ui-board-b', null, 0, 'group'),
  };
  const referenceId = 'dev100-ui-reference';
  const references = [{
    id: referenceId,
    taskId: 'dev100-ui-task-a',
    workspaceId: workspace.id,
    boardId: 'dev100-ui-board-a',
    sourceBoardId: 'dev100-ui-board-a',
    parentPlacementId: 'primary:dev100-ui-column-a',
    order: 0.5,
    revision: 1,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  }];
  const diagnostics = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(({ account, workspace, nodes, references }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({}));
    localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(references));
    localStorage.setItem('projed-local-test.taskTrackingReferenceStaging.v1', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev100-ui-board-a');
    localStorage.setItem('projed-last-view', 'board');
    localStorage.setItem(`projed-task-workbench-panel:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
      open: true,
      filtersOpen: true,
      showContainersInAllTasks: true,
      width: 380,
      openPreferenceVersion: 1,
    }));
    localStorage.setItem(`projed-task-workbench-filters:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
      version: 2,
      selectedBoardId: 'dev100-ui-board-a',
      filtersByBoardId: {},
    }));
  }, { account, workspace, nodes, references });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedEnvironment.count() && await fixedEnvironment.first().isVisible().catch(() => false)) {
    await fixedEnvironment.first().click({ force: true });
  }
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator(`[data-task-placement-id="${referenceId}"]`).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-task-workbench-unplaced-lane="true"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(350);

  const read = key => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
  const readNodes = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
  const dragCenter = async (source, target) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error(`missing drag box: ${JSON.stringify({ sourceBox, targetBox })}`);
    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + Math.min(Math.max(targetBox.height / 2, 16), targetBox.height - 8);
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 10, sourceY + 7, { steps: 5 });
    await page.mouse.move(targetX, targetY, { steps: 24 });
    await page.mouse.up();
  };

  const canonicalBefore = await readNodes();
  const sourceReference = page.locator(`[data-task-placement-id="${referenceId}"]`).first();
  const unplacedLane = page.locator('[data-task-workbench-unplaced-lane="true"]');
  const stageDragEndpoints = await Promise.all([
    sourceReference.evaluate(element => ({
      placementId: element.getAttribute('data-task-placement-id'),
      taskId: element.getAttribute('data-task-id'),
      draggable: element.getAttribute('aria-roledescription'),
      surfaceKind: element.getAttribute('data-task-drag-surface-kind'),
      outerHTML: element.outerHTML.slice(0, 500),
    })),
    unplacedLane.evaluate(element => ({
      dropTarget: element.getAttribute('data-task-workbench-lane-drop-target'),
      rect: element.getBoundingClientRect().toJSON(),
    })),
  ]);
  await dragCenter(sourceReference, unplacedLane);
  try {
    await page.waitForFunction(id => {
      const staged = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferenceStaging.v1') || '[]');
      const refs = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]');
      return staged.some(item => item.referenceId === id)
        && refs.some(item => item.id === id && item.removedAt);
    }, referenceId, { timeout: 10000 });
  } catch (error) {
    throw new Error(`stage drag did not persist: ${JSON.stringify({
      endpoints: stageDragEndpoints,
      references: await read('projed-local-test.taskTrackingReferences.v1'),
      staged: await read('projed-local-test.taskTrackingReferenceStaging.v1'),
      liveText: await page.locator('[aria-live="polite"]').allInnerTexts().catch(() => []),
      diagnostics,
      cause: error instanceof Error ? error.message : String(error),
    })}`);
  }

  const stagedRow = page.locator(`[data-task-workbench-tracking-reference="true"][data-task-placement-id="${referenceId}"]`).first();
  await stagedRow.waitFor({ state: 'visible', timeout: 10000 });
  const stagedEvidence = await stagedRow.evaluate(element => ({
    placement: element.getAttribute('data-task-workbench-task-placement'),
    location: element.querySelector('[data-task-workbench-task-title]')?.getAttribute('data-task-workbench-task-location'),
    borderStyle: getComputedStyle(element).borderStyle,
    text: element.textContent || '',
  }));
  const stagedRecords = await read('projed-local-test.taskTrackingReferenceStaging.v1');
  const stagedReferences = await read('projed-local-test.taskTrackingReferences.v1');
  if (stagedRecords.length !== 1
    || stagedRecords[0].referenceId !== referenceId
    || stagedRecords[0].originalBoardId !== 'dev100-ui-board-a'
    || stagedEvidence.placement !== 'unplaced'
    || stagedEvidence.location !== '未歸位（追蹤副本）'
    || stagedEvidence.borderStyle !== 'dashed'
    || !stagedEvidence.text.includes('追蹤副本')
    || !stagedReferences.find(item => item.id === referenceId)?.removedAt
    || JSON.stringify(canonicalBefore) !== JSON.stringify(await readNodes())) {
    throw new Error(`stage evidence mismatch: ${JSON.stringify({ stagedRecords, stagedEvidence, stagedReferences })}`);
  }
  await page.screenshot({ path: `${OUTPUT_DIR}/tracking-reference-unplaced.png`, fullPage: true });

  const boardSelect = page.locator('[data-task-workbench-board-select="true"]');
  if (!(await boardSelect.isVisible().catch(() => false))) {
    await page.locator('[data-task-workbench-filter-toggle="true"]').first().click({ force: true });
  }
  await boardSelect.waitFor({ state: 'visible', timeout: 10000 });
  await boardSelect.selectOption('dev100-ui-board-b');
  const filterPopover = page.locator('[data-task-workbench-filter-popover="true"]');
  if (await filterPopover.isVisible().catch(() => false)) {
    await page.locator('[data-task-workbench-filter-toggle="true"]').first().click({ force: true });
    await filterPopover.waitFor({ state: 'hidden', timeout: 5000 });
  }
  const targetLane = page.locator('[data-task-workbench-placed-board-lane="true"][data-board-id="dev100-ui-board-b"]');
  await targetLane.waitFor({ state: 'visible', timeout: 10000 });
  const placeDragEndpoints = await Promise.all([
    stagedRow.evaluate(element => ({
      placementId: element.getAttribute('data-task-placement-id'),
      draggable: element.getAttribute('aria-roledescription'),
      surfaceKind: element.getAttribute('data-task-drag-surface-kind'),
      outerHTML: element.outerHTML.slice(0, 500),
    })),
    targetLane.evaluate(element => ({
      boardId: element.getAttribute('data-board-id'),
      dropTarget: element.getAttribute('data-task-workbench-lane-drop-target'),
      rect: element.getBoundingClientRect().toJSON(),
    })),
  ]);
  await dragCenter(stagedRow, targetLane);
  try {
    await page.waitForFunction(id => {
      const staged = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferenceStaging.v1') || '[]');
      const refs = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]');
      const reference = refs.find(item => item.id === id);
      return staged.length === 0
        && reference?.boardId === 'dev100-ui-board-b'
        && reference?.parentPlacementId === null
        && !reference?.removedAt;
    }, referenceId, { timeout: 10000 });
  } catch (error) {
    throw new Error(`placed-board drag did not persist: ${JSON.stringify({
      endpoints: placeDragEndpoints,
      references: await read('projed-local-test.taskTrackingReferences.v1'),
      staged: await read('projed-local-test.taskTrackingReferenceStaging.v1'),
      selectedBoard: await boardSelect.inputValue(),
      liveText: await page.locator('[aria-live="polite"]').allInnerTexts().catch(() => []),
      dragDebug: await page.evaluate(() => (window.__projedDesktopTaskDragDebug || []).slice(-30)),
      diagnostics,
      cause: error instanceof Error ? error.message : String(error),
    })}`);
  }

  const finalReferences = await read('projed-local-test.taskTrackingReferences.v1');
  const placed = finalReferences.find(item => item.id === referenceId);
  const canonicalAfter = await readNodes();
  if (!placed
    || placed.id !== referenceId
    || placed.boardId !== 'dev100-ui-board-b'
    || placed.parentPlacementId !== null
    || JSON.stringify(canonicalBefore) !== JSON.stringify(canonicalAfter)
    || canonicalAfter['dev100-ui-task-a']?.boardId !== 'dev100-ui-board-a') {
    throw new Error(`placement evidence mismatch: ${JSON.stringify({ placed, canonicalAfter })}`);
  }
  await page.screenshot({ path: `${OUTPUT_DIR}/tracking-reference-placed-board-b.png`, fullPage: true });

  const result = {
    dev: 'DEV-100',
    status: 'passed',
    passed: true,
    referenceId,
    staged: {
      originalBoardId: stagedRecords[0].originalBoardId,
      sameReferenceId: stagedRecords[0].referenceId === referenceId,
      presentation: stagedEvidence,
    },
    placed: {
      boardId: placed.boardId,
      parentPlacementId: placed.parentPlacementId,
      sameReferenceId: placed.id === referenceId,
    },
    canonicalUnchanged: JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter),
    diagnostics: diagnostics.slice(-20),
  };
  await page.evaluate(value => { window.__DEV100_ARTIFACT = value; }, result);
  return result;
}
