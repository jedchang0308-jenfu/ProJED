/* eslint-disable */
async (page) => {
  const BASE_URL = 'http://localhost:4000/';
  const OUTPUT_DIR = 'output/playwright/dev-095';
  const diagnostics = [];
  const cases = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev095-ui-workspace',
    title: 'DEV-095 任務追蹤工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev095-ui-board-a', title: '研發看板', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev095-ui-board-b', title: '主管看板', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, title, boardId, parentId, order, nodeType = 'task', status = 'todo') => ({
    id, title, boardId, workspaceId: workspace.id, parentId, order, nodeType, status,
    createdAt: 1704067200000, updatedAt: 1704067200000,
  });
  const nodes = {
    'dev095-ui-column-a': makeNode('dev095-ui-column-a', '研發待辦', 'dev095-ui-board-a', null, 0, 'group'),
    'dev095-ui-task-a': makeNode('dev095-ui-task-a', '唯一真相任務 A', 'dev095-ui-board-a', 'dev095-ui-column-a', 0, 'task', 'in_progress'),
    'dev095-ui-task-b': makeNode('dev095-ui-task-b', '研發旁邊任務 B', 'dev095-ui-board-a', 'dev095-ui-column-a', 1),
    'dev095-ui-column-b': makeNode('dev095-ui-column-b', '主管追蹤根層', 'dev095-ui-board-b', null, 0, 'group'),
    'dev095-ui-target-b': makeNode('dev095-ui-target-b', '主管脈絡任務', 'dev095-ui-board-b', 'dev095-ui-column-b', 0),
  };
  const seed = async (viewport, withReference = false) => {
    await page.setViewportSize(viewport);
    await page.evaluate(({ account, workspace, nodes, withReference }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({}));
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(withReference ? [{
        id: 'dev095-ui-seeded-reference', taskId: 'dev095-ui-task-a', workspaceId: workspace.id,
        boardId: 'dev095-ui-board-a', sourceBoardId: 'dev095-ui-board-a', parentPlacementId: 'primary:dev095-ui-column-a',
        order: 0.5, revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000,
      }] : []));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev095-ui-board-a');
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem(`projed-task-workbench-panel:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
        open: true, filtersOpen: true, showContainersInAllTasks: true, width: 360, openPreferenceVersion: 1,
      }));
      localStorage.setItem(`projed-task-workbench-filters:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({
        version: 2, selectedBoardId: 'dev095-ui-board-a', filtersByBoardId: {},
      }));
    }, { account, workspace, nodes, withReference });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedEnvironment.count() && await fixedEnvironment.first().isVisible().catch(() => false)) {
      await fixedEnvironment.first().click({ force: true });
    }
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-task-id="dev095-ui-task-a"][data-task-card-primary="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(350);
  };
  const readRefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]'));
  const readNodes = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
  const waitForActiveRefs = async (count) => page.waitForFunction(expected => {
    const refs = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]');
    return refs.filter(reference => !reference.removedAt).length === expected;
  }, count, { timeout: 10000 });
  const primary = taskId => page.locator(`[data-task-id="${taskId}"][data-task-card-primary="true"]`).first();
  const reference = referenceId => page.locator(`[data-task-placement-id="${referenceId}"]`).first();
  const openTaskMenu = async (taskId) => {
    const card = primary(taskId);
    await card.click({ button: 'right', position: { x: 36, y: 10 } });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    return menu;
  };
  const createReference = async () => {
    const menu = await openTaskMenu('dev095-ui-task-a');
    const action = menu.locator('[data-task-action-id="task.create-tracking-reference"]');
    await action.waitFor({ state: 'visible', timeout: 10000 });
    await action.click();
    await waitForActiveRefs(1);
    const refs = await readRefs();
    const created = refs.find(item => !item.removedAt);
    if (!created) throw new Error('created tracking reference missing from local persistence');
    await reference(created.id).waitFor({ state: 'visible', timeout: 10000 });
    return created;
  };
  const setTrackingFault = async (operation, message = '測試故障：追蹤副本操作失敗，原位置已保留。') => {
    await page.evaluate(({ operation, message }) => {
      window.__projedTaskTrackingTestFault = { operation, failNext: true, message };
    }, { operation, message });
  };
  const dragCenter = async (source, target, holdMs = 0) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error(`drag boxes missing source=${JSON.stringify(sourceBox)} target=${JSON.stringify(targetBox)}`);
    const sx = sourceBox.x + sourceBox.width / 2;
    const sy = sourceBox.y + sourceBox.height / 2;
    const tx = targetBox.x + targetBox.width / 2;
    const ty = targetBox.y + Math.max(8, Math.min(targetBox.height - 8, targetBox.height / 2));
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    if (holdMs) await page.waitForTimeout(holdMs);
    await page.mouse.move(sx + 8, sy + 6, { steps: 4 });
    await page.mouse.move(tx, ty, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const runCase = async (id, expected, flow) => {
    const started = Date.now();
    let actual = {};
    let failure = null;
    try { actual = await flow(); } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      diagnostics.push(`${id}:${failure}`);
      try { await page.screenshot({ path: `${OUTPUT_DIR}/${id}-failure.png`, fullPage: true }); } catch { /* best effort */ }
    }
    const result = { id, status: failure ? 'FAIL' : 'PASS', expected, actual, failure, durationMs: Date.now() - started };
    cases.push(result);
    return result;
  };

  await runCase('B01-create-and-dashed-projection', 'action menu creates exactly one adjacent dashed reference without changing canonical task', async () => {
    await seed({ width: 1440, height: 900 });
    const beforeNodes = await readNodes();
    const created = await createReference();
    const ref = reference(created.id);
    const presentation = await ref.evaluate(element => {
      const style = getComputedStyle(element);
      return { borderStyle: style.borderStyle, text: element.textContent || '', taskId: element.getAttribute('data-task-id'), placementId: element.getAttribute('data-task-placement-id') };
    });
    const afterNodes = await readNodes();
    if (presentation.borderStyle !== 'dashed') throw new Error(`reference border should be dashed: ${JSON.stringify(presentation)}`);
    if (!presentation.text.includes('追蹤副本')) throw new Error(`reference accessible text missing: ${JSON.stringify(presentation)}`);
    if (presentation.taskId !== 'dev095-ui-task-a' || presentation.placementId !== created.id) throw new Error(`reference identity mismatch: ${JSON.stringify(presentation)}`);
    if (JSON.stringify(beforeNodes) !== JSON.stringify(afterNodes)) throw new Error('canonical nodes changed while creating projection');
    if (created.parentPlacementId !== 'primary:dev095-ui-column-a' || created.order <= 0) throw new Error(`reference was not adjacent to primary parent: ${JSON.stringify(created)}`);
    await page.screenshot({ path: `${OUTPUT_DIR}/desktop-create-dashed.png`, fullPage: true });
    return { referenceId: created.id, placement: { boardId: created.boardId, parentPlacementId: created.parentPlacementId, order: created.order }, presentation };
  });

  await runCase('B02-remove-reference', 'remove action soft-removes only the reference and keeps canonical task', async () => {
    const refs = await readRefs();
    const active = refs.find(item => !item.removedAt);
    if (!active) throw new Error('B02 requires active reference from B01');
    const beforeNodes = await readNodes();
    const ref = reference(active.id);
    await ref.getByRole('button', { name: '移除此處追蹤' }).click();
    await waitForActiveRefs(0);
    const persisted = await readRefs();
    const removed = persisted.find(item => item.id === active.id);
    const afterNodes = await readNodes();
    if (!removed?.removedAt) throw new Error(`removed reference tombstone missing: ${JSON.stringify(removed)}`);
    if (await reference(active.id).count() !== 0) throw new Error('removed reference remains visible');
    if (JSON.stringify(beforeNodes) !== JSON.stringify(afterNodes)) throw new Error('canonical nodes changed while removing projection');
    return { referenceId: active.id, removedAt: removed.removedAt, canonicalUnchanged: true };
  });

  let sameBoardReference;
  await runCase('B03-same-board-drag', 'reference can move to another task in the same board without changing task ownership', async () => {
    sameBoardReference = await createReference();
    const source = reference(sameBoardReference.id);
    await dragCenter(source, primary('dev095-ui-task-b'));
    const moved = (await readRefs()).find(item => item.id === sameBoardReference.id);
    if (!moved || moved.boardId !== 'dev095-ui-board-a' || moved.parentPlacementId !== 'primary:dev095-ui-column-a') throw new Error(`same-board placement mismatch: ${JSON.stringify(moved)}`);
    const node = (await readNodes())['dev095-ui-task-a'];
    if (node.boardId !== 'dev095-ui-board-a' || node.parentId !== 'dev095-ui-column-a') throw new Error(`canonical ownership changed: ${JSON.stringify(node)}`);
    return { referenceId: moved.id, boardId: moved.boardId, parentPlacementId: moved.parentPlacementId, canonical: { boardId: node.boardId, parentId: node.parentId } };
  });

  await runCase('B04-cross-board-workbench-root-drop', 'reference can be dropped to the selected workbench board root and keeps source canonical ownership', async () => {
    const active = (await readRefs()).find(item => !item.removedAt);
    if (!active) throw new Error('B04 requires active reference from B03');
    const boardSelect = page.locator('[data-task-workbench-board-select="true"]');
    if (!(await boardSelect.isVisible().catch(() => false))) {
      const toggle = page.locator('[data-task-workbench-filter-toggle="true"]').first();
      if (await toggle.count()) await toggle.click({ force: true });
    }
    await boardSelect.waitFor({ state: 'visible', timeout: 10000 });
    await boardSelect.selectOption('dev095-ui-board-b');
    const targetLane = page.locator('[data-task-workbench-placed-board-lane="true"][data-board-id="dev095-ui-board-b"]');
    await targetLane.waitFor({ state: 'visible', timeout: 10000 });
    await dragCenter(reference(active.id), targetLane);
    const moved = (await readRefs()).find(item => item.id === active.id);
    if (!moved || moved.boardId !== 'dev095-ui-board-b' || moved.parentPlacementId !== null) throw new Error(`cross-board placement mismatch: ${JSON.stringify(moved)}`);
    const node = (await readNodes())['dev095-ui-task-a'];
    if (node.boardId !== 'dev095-ui-board-a') throw new Error(`cross-board drag changed canonical board: ${JSON.stringify(node)}`);
    return { referenceId: moved.id, targetBoardId: moved.boardId, targetParentPlacementId: moved.parentPlacementId, canonicalBoardId: node.boardId };
  });

  await runCase('B05-reload-and-target-board-visible', 'reference survives reload and is visible when the target board is opened', async () => {
    const active = (await readRefs()).find(item => !item.removedAt);
    if (!active) throw new Error('B05 requires active cross-board reference');
    const boardRow = page.locator('[data-sidebar-board-row="true"]').filter({ hasText: '主管看板' }).first();
    if (!(await boardRow.isVisible().catch(() => false))) await page.getByRole('button', { name: '展開工作區選單' }).click({ force: true });
    await boardRow.waitFor({ state: 'visible', timeout: 10000 });
    await boardRow.click();
    await page.waitForTimeout(500);
    await reference(active.id).waitFor({ state: 'visible', timeout: 10000 });
    const readback = (await readRefs()).find(item => item.id === active.id);
    return { referenceId: active.id, boardId: readback?.boardId, visibleCount: await reference(active.id).count() };
  });

  await runCase('B06-keyboard-and-accessible-remove', 'reference distinction and remove action remain keyboard reachable with an accessible name', async () => {
    const active = (await readRefs()).find(item => !item.removedAt);
    if (!active) throw new Error('B06 requires active reference');
    const ref = reference(active.id);
    const label = await ref.getByRole('button', { name: '移除此處追蹤' }).getAttribute('aria-label');
    const text = await ref.innerText();
    if (label !== '移除此處追蹤' || !text.includes('追蹤副本')) throw new Error(`accessible contract mismatch: ${JSON.stringify({ label, text })}`);
    const before = await readRefs();
    await ref.getByRole('button', { name: '移除此處追蹤' }).focus();
    await page.keyboard.press('Space');
    await waitForActiveRefs(0);
    const after = await readRefs();
    if (!(after.find(item => item.id === active.id)?.removedAt)) throw new Error('keyboard remove did not persist tombstone');
    return { referenceId: active.id, accessibleLabel: label, activeBefore: before.filter(item => !item.removedAt).length, activeAfter: after.filter(item => !item.removedAt).length };
  });

  await runCase('B07-remove-undo-redo', 'reference removal is one ordinary undo item and redo removes only the projection', async () => {
    await seed({ width: 1440, height: 900 });
    const beforeNodes = await readNodes();
    const created = await createReference();
    await reference(created.id).getByRole('button', { name: '移除此處追蹤' }).click();
    await waitForActiveRefs(0);
    const undo = page.locator('#btn-undo');
    await undo.waitFor({ state: 'visible', timeout: 10000 });
    await undo.click();
    await waitForActiveRefs(1);
    await reference(created.id).waitFor({ state: 'visible', timeout: 10000 });
    const restored = (await readRefs()).find(item => item.id === created.id);
    if (!restored || restored.removedAt) throw new Error(`undo did not restore reference: ${JSON.stringify(restored)}`);
    const activeAfterUndo = (await readRefs()).filter(item => !item.removedAt).length;
    const redo = page.locator('#btn-redo');
    await redo.waitFor({ state: 'visible', timeout: 10000 });
    await redo.click();
    await waitForActiveRefs(0);
    if (JSON.stringify(beforeNodes) !== JSON.stringify(await readNodes())) throw new Error('remove undo/redo changed canonical nodes');
    return { referenceId: created.id, activeAfterUndo, activeAfterRedo: 0, canonicalUnchanged: true };
  });

  await runCase('B08-provider-failure-keeps-source', 'provider failure leaves create without ghost, move at source, remove visible, and exposes a recoverable message', async () => {
    await seed({ width: 1440, height: 900 });
    const beforeNodes = await readNodes();
    const faultMessage = '測試故障：追蹤副本操作失敗，原位置已保留。';
    await setTrackingFault('create', faultMessage);
    const menu = await openTaskMenu('dev095-ui-task-a');
    await menu.locator('[data-task-action-id="task.create-tracking-reference"]').click();
    await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    if ((await readRefs()).some(item => !item.removedAt)) throw new Error('failed create left a tracking-reference ghost');
    if (JSON.stringify(beforeNodes) !== JSON.stringify(await readNodes())) throw new Error('failed create changed canonical task');

    const created = await createReference();
    const original = (await readRefs()).find(item => item.id === created.id);
    await setTrackingFault('move', faultMessage);
    await dragCenter(reference(created.id), primary('dev095-ui-task-b'));
    await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    const afterMoveFailure = (await readRefs()).find(item => item.id === created.id);
    if (!original || !afterMoveFailure || afterMoveFailure.boardId !== original.boardId || afterMoveFailure.parentPlacementId !== original.parentPlacementId) {
      throw new Error(`failed move did not retain source placement: ${JSON.stringify({ original, afterMoveFailure })}`);
    }

    await setTrackingFault('remove', faultMessage);
    await reference(created.id).getByRole('button', { name: '移除此處追蹤' }).click();
    await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    const afterRemoveFailure = (await readRefs()).find(item => item.id === created.id);
    if (!afterRemoveFailure || afterRemoveFailure.removedAt) throw new Error('failed remove hid or removed the reference');
    return { referenceId: created.id, createGhost: false, moveSourceRetained: true, removeStillVisible: true, recoverableMessage: faultMessage };
  });

  await runCase('B09-mobile-long-press-reference', 'mobile reference is dashed, identifiable, and long-press drag does not create duplicate canonical tasks', async () => {
    await seed({ width: 390, height: 844 }, true);
    const seeded = (await readRefs()).find(item => !item.removedAt);
    if (!seeded) throw new Error('mobile fixture reference missing');
    const ref = reference(seeded.id);
    await ref.waitFor({ state: 'visible', timeout: 10000 });
    const style = await ref.evaluate(element => ({ borderStyle: getComputedStyle(element).borderStyle, text: element.textContent || '' }));
    if (style.borderStyle !== 'dashed' || !style.text.includes('追蹤副本')) throw new Error(`mobile projection style mismatch: ${JSON.stringify(style)}`);
    const beforeNodes = await readNodes();
    await dragCenter(ref, primary('dev095-ui-task-b'), 650);
    const afterRefs = await readRefs();
    const afterNodes = await readNodes();
    if (afterRefs.filter(item => !item.removedAt).length !== 1) throw new Error(`mobile drag changed reference count: ${JSON.stringify(afterRefs)}`);
    if (JSON.stringify(beforeNodes) !== JSON.stringify(afterNodes)) throw new Error('mobile reference drag changed canonical nodes');
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-390-reference.png`, fullPage: true });
    return { referenceId: seeded.id, viewport: { width: 390, height: 844 }, style, activeReferenceCount: afterRefs.filter(item => !item.removedAt).length, canonicalUnchanged: true };
  });

  await runCase('B10-cross-mode-projection-marker', 'placement surfaces show both tracking placements while timeline surfaces collapse to one canonical task object, all with dashed semantics', async () => {
    await seed({ width: 1440, height: 900 }, true);
    const seeded = (await readRefs()).find(item => !item.removedAt);
    if (!seeded) throw new Error('cross-mode fixture reference missing');
    const targetBoardId = 'dev095-ui-board-b';
    await page.evaluate(({ targetBoardId }) => {
      const refs = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]');
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      nodes['dev095-ui-task-a'] = {
        ...nodes['dev095-ui-task-a'],
        startDate: '2026-08-28',
        endDate: '2026-09-02',
      };
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify([
        ...refs.map(reference => ({ ...reference, boardId: targetBoardId, parentPlacementId: null })),
        {
          id: 'dev095-ui-seeded-reference-2', taskId: 'dev095-ui-task-a', workspaceId: 'dev095-ui-workspace',
          boardId: targetBoardId, sourceBoardId: 'dev095-ui-board-a', parentPlacementId: 'primary:dev095-ui-target-b',
          order: 1, revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000,
        },
      ]));
      localStorage.setItem('projed-last-board', targetBoardId);
      localStorage.setItem('projed-last-view', 'board');
    }, { targetBoardId });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-task-placement-id="dev095-ui-seeded-reference"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const markers = {};
    const selectMode = async (value, selector, expectedPlacementCount) => {
      const trigger = page.locator('[data-mode-switcher-trigger="true"]');
      await trigger.click();
      await page.locator(`[data-mode-switcher-value="${value}"]`).click();
      const marker = page.locator(selector).first();
      await marker.waitFor({ state: 'visible', timeout: 15000 });
      const placementCount = await page.locator(selector).count();
      markers[value] = await marker.evaluate(element => ({
        placementKind: element.getAttribute('data-gantt-placement-kind') || element.getAttribute('data-calendar-placement-kind') || element.getAttribute('data-mindmap-placement-kind') || element.getAttribute('data-task-placement-kind') || element.getAttribute('data-task-placement-id'),
        taskIds: Array.from(element.parentElement?.querySelectorAll('[data-task-id]') || []).map(item => item.getAttribute('data-task-id')).filter(Boolean),
        text: element.getAttribute('aria-label') || element.textContent || '',
        dashed: getComputedStyle(element).borderStyle === 'dashed' || element.className.includes('border-dashed'),
      }));
      markers[value].placementCount = placementCount;
      if (expectedPlacementCount !== undefined && placementCount !== expectedPlacementCount) {
        throw new Error(`${value} placement count mismatch: expected ${expectedPlacementCount}, got ${placementCount}`);
      }
    };
    await selectMode('list', '[data-task-placement-id="dev095-ui-seeded-reference"], [data-task-placement-id="dev095-ui-seeded-reference-2"]', 2);
    await selectMode('mindmap', '[data-mindmap-placement-kind="tracking-reference"]', 2);
    await selectMode('gantt', '[data-gantt-placement-kind="tracking-reference"]', 1);
    await selectMode('calendar', '[data-calendar-placement-kind="tracking-reference"]');
    if (Object.values(markers).some(marker => !marker.dashed || !marker.text.includes('追蹤副本'))) throw new Error(`cross-mode marker mismatch: ${JSON.stringify(markers)}`);
    return { referenceId: seeded.id, targetBoardId, modes: markers };
  });

  await runCase('B11-mobile-320-reference-layout', '320px mobile reference remains dashed, removable and free of horizontal overflow', async () => {
    await seed({ width: 320, height: 844 }, true);
    const seeded = (await readRefs()).find(item => !item.removedAt);
    if (!seeded) throw new Error('320px fixture reference missing');
    const ref = reference(seeded.id);
    await ref.waitFor({ state: 'visible', timeout: 10000 });
    const layout = await page.evaluate(() => ({ viewportWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
    const label = await ref.getByRole('button', { name: '移除此處追蹤' }).getAttribute('aria-label');
    const style = await ref.evaluate(element => ({ borderStyle: getComputedStyle(element).borderStyle, text: element.textContent || '' }));
    if (layout.scrollWidth > layout.viewportWidth || layout.bodyScrollWidth > layout.viewportWidth) throw new Error(`320px horizontal overflow: ${JSON.stringify(layout)}`);
    if (style.borderStyle !== 'dashed' || label !== '移除此處追蹤') throw new Error(`320px reference accessibility/style mismatch: ${JSON.stringify({ style, label })}`);
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-320-reference.png`, fullPage: true });
    return { referenceId: seeded.id, viewport: { width: 320, height: 844 }, layout, style, accessibleLabel: label };
  });

  await runCase('B12-keyboard-reference-dnd', 'keyboard can focus a reference, start with Space, move target with an arrow, commit with Space, and cancel with Escape', async () => {
    await seed({ width: 1440, height: 900 });
    const created = await createReference();
    const ref = reference(created.id);
    await ref.focus();
    const focusedBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-task-placement-id'));
    if (focusedBefore !== created.id) throw new Error(`reference did not receive keyboard focus: ${focusedBefore}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    const activeKeyboard = await page.evaluate(() => ({
      placementId: document.activeElement?.getAttribute('data-task-placement-id'),
      ariaPressed: document.activeElement?.getAttribute('aria-pressed'),
    }));
    if (activeKeyboard.placementId !== created.id || activeKeyboard.ariaPressed !== 'true') throw new Error(`Space did not start keyboard drag: ${JSON.stringify(activeKeyboard)}`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    const committedRefs = await readRefs();
    const committed = committedRefs.find(item => item.id === created.id);
    if (!committed || committedRefs.filter(item => !item.removedAt).length !== 1) throw new Error(`keyboard commit lost or duplicated reference: ${JSON.stringify(committedRefs)}`);
    const beforeCancel = JSON.stringify(committed);
    const committedRef = reference(created.id);
    await committedRef.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const afterCancel = (await readRefs()).find(item => item.id === created.id);
    if (JSON.stringify(afterCancel) !== beforeCancel) throw new Error('Escape changed the reference after keyboard drag cancel');
    return { referenceId: created.id, focusedBefore, activeKeyboard, committedPlacement: { boardId: committed.boardId, parentPlacementId: committed.parentPlacementId }, cancelUnchanged: true };
  });

  await runCase('B13-primary-reference-visual-parity', 'reference reuses the primary task content structure and visible text, with the outer dashed border as the visual distinction', async () => {
    await seed({ width: 1440, height: 900 }, true);
    const seeded = (await readRefs()).find(item => !item.removedAt);
    if (!seeded) throw new Error('B13 fixture reference missing');
    const ref = reference(seeded.id);
    const primaryCard = primary('dev095-ui-task-a');
    const evidence = await page.evaluate(({ refId }) => {
      const referenceElement = document.querySelector(`[data-task-placement-id="${refId}"]`);
      const primaryElement = document.querySelector('[data-task-id="dev095-ui-task-a"][data-task-card-primary="true"]');
      if (!referenceElement || !primaryElement) return null;
      return {
        referenceBorder: getComputedStyle(referenceElement).borderStyle,
        primaryBorder: getComputedStyle(primaryElement).borderStyle,
        referenceText: referenceElement.textContent || '',
        primaryText: primaryElement.textContent || '',
        referenceInnerText: referenceElement.innerText || '',
        primaryInnerText: primaryElement.innerText || '',
        referenceContent: Boolean(referenceElement.querySelector('[data-task-card-primary-content="true"]')),
        primaryContent: primaryElement.matches('[data-task-card-primary-content="true"]') || Boolean(primaryElement.querySelector('[data-task-card-primary-content="true"]')),
        referenceTitle: referenceElement.querySelector('[data-task-title-slot="true"]')?.textContent?.trim() || '',
        primaryTitle: primaryElement.querySelector('[data-task-title-slot="true"]')?.textContent?.trim() || '',
        visibleReferenceBadge: Boolean(referenceElement.querySelector('.border-violet-300.bg-white')),
        referenceRole: referenceElement.getAttribute('role'),
        referenceTabIndex: referenceElement.getAttribute('tabindex'),
      };
    }, { refId: seeded.id });
    if (!evidence || evidence.referenceBorder !== 'dashed' || evidence.primaryBorder === 'dashed'
      || !evidence.referenceText.includes('追蹤副本') || evidence.primaryText.includes('追蹤副本')
      || !evidence.referenceContent || !evidence.primaryContent
      || evidence.referenceTitle !== evidence.primaryTitle
      || evidence.visibleReferenceBadge
      || evidence.referenceRole !== 'button' || evidence.referenceTabIndex === null) {
      throw new Error(`primary/reference accessibility distinction mismatch: ${JSON.stringify(evidence)}`);
    }
    return evidence;
  });

  await runCase('B14-live-message-and-focus-visible', 'pending/success/failure feedback uses one polite live region and reference actions retain visible keyboard focus', async () => {
    await seed({ width: 1440, height: 900 });
    const created = await createReference();
    const remove = reference(created.id).getByRole('button', { name: '移除此處追蹤' });
    // :focus-visible is a modality contract; programmatic focus alone is not
    // sufficient in Chromium.  Move focus with the keyboard until the
    // reference action receives the browser's keyboard modality state.
    await page.locator('body').click({ position: { x: 8, y: 8 } });
    let focusedRemove = false;
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press('Tab');
      focusedRemove = await remove.evaluate(element => document.activeElement === element);
      if (focusedRemove) break;
    }
    if (!focusedRemove) throw new Error('keyboard could not focus the reference remove action');
    const focusVisible = await remove.evaluate(element => element.matches(':focus-visible'));
    const liveRegions = await page.locator('[data-toast-container="true"][aria-live="polite"][aria-atomic="true"]').count();
    const successCount = await page.getByText('已建立追蹤副本；請拖曳虛線副本到要追蹤的位置。', { exact: true }).count();
    if (!focusVisible || liveRegions > 1 || successCount > 1) throw new Error(`live/focus contract mismatch: ${JSON.stringify({ focusVisible, liveRegions, successCount })}`);
    return { referenceId: created.id, focusVisible, liveRegions, successCount };
  });

  await runCase('B15-nested-reference-subtree', 'nested tracking references render by placement parent and remove/undo as one subtree without changing canonical tasks', async () => {
    await seed({ width: 1440, height: 900 }, true);
    const root = (await readRefs()).find(item => !item.removedAt);
    if (!root) throw new Error('nested reference root fixture missing');
    const beforeNodes = await readNodes();
    await page.evaluate(({ rootId, workspaceId }) => {
      const refs = JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]');
      refs.push({
        id: 'dev095-ui-seeded-child', taskId: 'dev095-ui-task-b', workspaceId,
        boardId: 'dev095-ui-board-a', sourceBoardId: 'dev095-ui-board-a', parentPlacementId: rootId,
        order: 1, revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000,
      });
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(refs));
    }, { rootId: root.id, workspaceId: workspace.id });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-task-placement-id="dev095-ui-seeded-child"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const child = page.locator('[data-task-placement-id="dev095-ui-seeded-child"]').first();
    const style = await child.evaluate(element => ({ borderStyle: getComputedStyle(element).borderStyle, parent: element.closest('[data-task-tracking-subtree]')?.getAttribute('data-task-tracking-subtree') }));
    if (style.borderStyle !== 'dashed' || style.parent !== root.id) throw new Error(`nested reference renderer mismatch: ${JSON.stringify(style)}`);
    await page.locator(`[data-task-placement-id="${root.id}"]`).first().getByRole('button', { name: '移除此處追蹤' }).click();
    await waitForActiveRefs(0);
    if (await child.count() !== 0) throw new Error('removing reference root left a nested projection visible');
    await page.locator('#btn-undo').click();
    await waitForActiveRefs(2);
    await page.locator('[data-task-placement-id="dev095-ui-seeded-child"]').first().waitFor({ state: 'visible', timeout: 10000 });
    if (JSON.stringify(beforeNodes) !== JSON.stringify(await readNodes())) throw new Error('nested reference remove/undo changed canonical nodes');
    return { rootReferenceId: root.id, childReferenceId: 'dev095-ui-seeded-child', activeReferenceCount: 2, style, canonicalUnchanged: true };
  });

  await runCase('B16-readonly-reference-context-and-details', 'tracking reference context menu exposes only open-details and its canonical details view is read-only', async () => {
    await seed({ width: 1440, height: 900 }, true);
    const seeded = (await readRefs()).find(item => !item.removedAt);
    if (!seeded) throw new Error('readonly reference fixture missing');

    const modeTrigger = page.locator('[data-mode-switcher-trigger="true"]');
    await modeTrigger.click();
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    const mindMapReference = page.locator('[data-mindmap-placement-kind="tracking-reference"]').first();
    await mindMapReference.waitFor({ state: 'visible', timeout: 15000 });
    await mindMapReference.click({ button: 'right', position: { x: 36, y: 10 } });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    const actionIds = await menu.locator('[data-task-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-action-id')).filter(Boolean));
    if (JSON.stringify(actionIds) !== JSON.stringify(['task.open-details'])) {
      throw new Error(`tracking reference context menu is not read-only: ${JSON.stringify(actionIds)}`);
    }
    await page.keyboard.press('Escape');

    await modeTrigger.click();
    await page.locator('[data-mode-switcher-value="list"]').click();
    const listReference = reference(seeded.id);
    await listReference.waitFor({ state: 'visible', timeout: 15000 });
    await listReference.dblclick();
    const details = page.locator('[data-task-details-modal="true"]');
    await details.waitFor({ state: 'visible', timeout: 10000 });
    const detailsEvidence = await details.evaluate(element => ({
      readonly: element.getAttribute('data-task-details-readonly'),
      titleInputs: element.querySelectorAll('[data-task-details-title-input="true"]').length,
      overflowTriggers: element.querySelectorAll('[data-task-details-overflow-trigger="true"]').length,
      taskId: element.getAttribute('data-task-id'),
    }));
    if (detailsEvidence.readonly !== 'true' || detailsEvidence.titleInputs !== 0 || detailsEvidence.overflowTriggers !== 0 || detailsEvidence.taskId !== seeded.taskId) {
      throw new Error(`tracking reference details is not read-only: ${JSON.stringify(detailsEvidence)}`);
    }
    await details.getByRole('button', { name: '關閉任務詳情' }).click();
    return { referenceId: seeded.id, actionIds, details: detailsEvidence };
  });

  const result = {
    dev: 'DEV-095', devId: 'DEV-095', sourceRevision: 'working-tree', environment: 'local-test-browser', provider: 'local-test',
    cases, status: cases.every(item => item.status === 'PASS') ? 'passed' : 'failed', passed: cases.every(item => item.status === 'PASS'),
    summary: { PASS: cases.filter(item => item.status === 'PASS').length, FAIL: cases.filter(item => item.status === 'FAIL').length, NOT_RUN: 0, BLOCKED: 0 },
    evidence: ['local-test task action menu', 'localStorage canonical/reference readback', 'desktop 1440x900', 'mobile 390x844', 'mobile 320x844', 'List/Mind Map/Gantt/Calendar cross-mode projection', 'provider failure recovery', 'keyboard DnD and focus-visible', 'nested reference subtree render/remove/undo', 'tracking reference readonly context menu/details'],
    diagnostics: diagnostics.slice(-40),
  };
  await page.evaluate(value => { window.__DEV095_ARTIFACT = value; }, result);
  if (!result.passed) throw new Error(`DEV-095 browser verifier failed: ${JSON.stringify(result)}`);
  return result;
}
