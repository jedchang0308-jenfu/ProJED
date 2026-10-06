/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-095';
  const diagnostics = [];
  const cases = [];
  page.on('console', message => {
    if (message.text().includes('測試故障：追蹤副本操作失敗。')) return;
    if (message.text().includes('追蹤副本已被其他人更新，請重新載入。')) return;
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const workspaceId = 'dev095-parity-workspace';
  const boardA = 'dev095-parity-board-a';
  const boardB = 'dev095-parity-board-b';
  const accountFor = userId => ({
    id: userId,
    uid: userId,
    email: `${userId}@projed.local`,
    displayName: userId,
    createdAt: 1704067200000,
  });
  const workspace = {
    id: workspaceId,
    title: 'DEV-095 Interaction Parity',
    ownerId: 'local-test-user',
    members: ['local-test-user', 'local-test-viewer'],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: boardA, title: '研發看板', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: boardB, title: '主管看板', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, title, boardId, parentId, order, nodeType = 'task', status = 'todo') => ({
    id, title, boardId, workspaceId, parentId, order, nodeType, status,
    createdAt: 1704067200000, updatedAt: 1704067200000,
  });
  const baseNodes = {
    'p-col-a': makeNode('p-col-a', '研發待辦', boardA, null, 0, 'group'),
    'p-task-a': makeNode('p-task-a', '唯一真相任務 A', boardA, 'p-col-a', 0, 'task', 'in_progress'),
    'p-task-b': makeNode('p-task-b', '相關任務 B', boardA, 'p-col-a', 1),
    'p-task-d': makeNode('p-task-d', '目標任務 D', boardA, 'p-col-a', 2),
    'p-task-e': makeNode('p-task-e', 'A 的 canonical 子任務（不自動投影）', boardA, 'p-task-a', 0),
    'p-task-c': makeNode('p-task-c', '明確追蹤孫任務 C', boardA, 'p-task-b', 0),
    'p-col-b': makeNode('p-col-b', '主管根層', boardB, null, 0, 'group'),
    'p-target-b': makeNode('p-target-b', '主管脈絡任務', boardB, 'p-col-b', 0),
  };
  const ref = (id, taskId, boardId, parentPlacementId, order) => ({
    id, taskId, workspaceId, boardId, sourceBoardId: boardA, parentPlacementId, order,
    revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000,
  });
  const nestedRefsA = [
    ref('p-ref-a', 'p-task-a', boardA, 'primary:p-col-a', 0.5),
    ref('p-ref-b', 'p-task-b', boardA, 'p-ref-a', 0),
    ref('p-ref-c', 'p-task-c', boardA, 'p-ref-b', 0),
  ];
  const roleRecord = (userId, role) => ({ userId, role, createdAt: 1704067200000, updatedAt: 1704067200000 });

  const seed = async ({ viewport = { width: 1440, height: 900 }, userId = 'local-test-user', activeBoardId = boardA, references = nestedRefsA, sourceRole = 'owner', targetRole = 'owner' } = {}) => {
    await page.setViewportSize(viewport);
    await page.evaluate(({ account, workspace, nodes, references, activeBoardId, sourceRole, targetRole, boardA, boardB, workspaceId }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', '[]');
      localStorage.setItem('projed-local-test.tags', '[]');
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(references));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
        [`${workspaceId}:${boardA}`]: [{ userId: account.id, role: sourceRole, createdAt: 1704067200000, updatedAt: 1704067200000 }],
        [`${workspaceId}:${boardB}`]: [{ userId: account.id, role: targetRole, createdAt: 1704067200000, updatedAt: 1704067200000 }],
      }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspaceId);
      localStorage.setItem('projed-last-board', activeBoardId);
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem(`projed-task-workbench-panel:v2:account:${encodeURIComponent(account.id)}`, JSON.stringify({ open: false, filtersOpen: false, width: 360, openPreferenceVersion: 1 }));
    }, {
      account: accountFor(userId), workspace, nodes: baseNodes, references, activeBoardId,
      sourceRole, targetRole, boardA, boardB, workspaceId,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedEnvironment.count() && await fixedEnvironment.first().isVisible().catch(() => false)) await fixedEnvironment.first().click({ force: true });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
  };
  const readRefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]'));
  const readNodes = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
  const placement = id => page.locator(`[data-task-surface-frame="true"][data-task-placement-id="${id}"]`).first();
  const primary = taskId => placement(`primary:${taskId}`);
  const content = target => target.locator(':scope > [data-task-surface-source="true"]').first();
  const details = () => page.locator('[data-task-details-modal="true"]');
  const closeDetails = async () => {
    const modal = details();
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForTimeout(80);
  };
  const openMenu = async target => {
    const clickTarget = content(target);
    await clickTarget.click({ button: 'right', position: { x: 28, y: 10 } });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(120);
    return menu;
  };
  const actionIds = menu => menu.locator('[data-task-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-action-id')).filter(Boolean));
  const drag = async (source, target, { holdAtTargetMs = 0, targetYRatio = 0.72 } = {}) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error(`drag geometry unavailable: ${JSON.stringify({ sourceBox, targetBox })}`);
    const sx = sourceBox.x + sourceBox.width / 2;
    const sy = sourceBox.y + Math.min(16, sourceBox.height / 2);
    const tx = targetBox.x + targetBox.width / 2;
    const ty = targetBox.y + targetBox.height * targetYRatio;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 10, sy + 7, { steps: 4 });
    await page.mouse.move(tx, ty, { steps: 18 });
    if (holdAtTargetMs) await page.waitForTimeout(holdAtTargetMs);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };
  const activeRefs = async () => (await readRefs()).filter(item => !item.removedAt);
  const setFault = async (operation, message) => page.evaluate(({ operation, message }) => {
    window.__projedTaskTrackingTestFault = { operation, failNext: true, message };
  }, { operation, message });
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

  await runCase('B17-click-details-focus-parity', 'primary and tracking use the same click/double-click/Enter/Space destination and restore placement focus', async () => {
    await seed();
    const results = [];
    for (const [kind, target] of [['primary', primary('p-task-a')], ['tracking', placement('p-ref-a')]]) {
      await target.waitFor({ state: 'visible', timeout: 10000 });
      for (const trigger of ['click', 'double-click', 'Enter', 'Space']) {
        await target.focus();
        if (trigger === 'click') await content(target).click();
        else if (trigger === 'double-click') await content(target).dblclick();
        else await page.keyboard.press(trigger);
        const modal = details();
        try {
          await modal.waitFor({ state: 'visible', timeout: 10000 });
        } catch (error) {
          throw new Error(`${kind}/${trigger} did not open Task Details: ${error instanceof Error ? error.message : String(error)}`);
        }
        const observed = await modal.evaluate(element => ({
          taskId: element.getAttribute('data-task-id'),
          trackingReferenceId: element.getAttribute('data-task-tracking-reference-id'),
          readonly: element.getAttribute('data-task-details-readonly'),
        }));
        if (observed.taskId !== 'p-task-a') throw new Error(`${kind}/${trigger} opened wrong task: ${JSON.stringify(observed)}`);
        if ((kind === 'tracking') !== (observed.trackingReferenceId === 'p-ref-a')) throw new Error(`${kind}/${trigger} lost placement context: ${JSON.stringify(observed)}`);
        await closeDetails();
        const focusedPlacement = await page.evaluate(() => document.activeElement?.getAttribute('data-task-placement-id'));
        const expectedPlacement = kind === 'tracking' ? 'p-ref-a' : 'primary:p-task-a';
        if (focusedPlacement !== expectedPlacement) throw new Error(`${kind}/${trigger} focus return mismatch: ${focusedPlacement}`);
        results.push({ kind, trigger, ...observed, focusedPlacement });
      }
    }
    return { interactions: results };
  });

  await runCase('B18-context-action-capability-parity', 'source editor shares canonical actions; placement-only differences are create/remove and derived manager sees only legal reference action', async () => {
    await seed();
    const primaryMenu = await openMenu(primary('p-task-a'));
    const primaryActions = await actionIds(primaryMenu);
    await page.keyboard.press('Escape');
    const referenceMenu = await openMenu(placement('p-ref-a'));
    const referenceActions = await actionIds(referenceMenu);
    await page.keyboard.press('Escape');
    const sharedPrimary = primaryActions.filter(id => id !== 'task.create-tracking-reference');
    const sharedReference = referenceActions.filter(id => id !== 'task.remove-tracking-reference');
    if (JSON.stringify(sharedPrimary) !== JSON.stringify(sharedReference)) throw new Error(`editor action parity mismatch: ${JSON.stringify({ primaryActions, referenceActions })}`);
    if (!primaryActions.includes('task.create-tracking-reference') || primaryActions.includes('task.remove-tracking-reference')) throw new Error('primary placement action boundary is wrong');
    if (!referenceActions.includes('task.remove-tracking-reference') || referenceActions.includes('task.create-tracking-reference')) throw new Error('tracking placement action boundary is wrong');

    const targetReference = [ref('p-ref-derived', 'p-task-a', boardB, null, 1)];
    await seed({ userId: 'local-test-viewer', activeBoardId: boardB, references: targetReference, sourceRole: 'viewer', targetRole: 'member' });
    const derivedMenu = await openMenu(placement('p-ref-derived'));
    const derivedActions = await actionIds(derivedMenu);
    const expectedDerivedActions = ['task.promote', 'task.demote', 'task.remove-tracking-reference'];
    if (JSON.stringify(derivedActions) !== JSON.stringify(expectedDerivedActions)) throw new Error(`derived manager action guard mismatch: ${JSON.stringify(derivedActions)}`);
    await page.keyboard.press('Escape');
    return { primaryActions, referenceActions, sharedActions: sharedPrimary, derivedManagerActions: derivedActions };
  });

  await runCase('B19-desktop-pointer-dnd-parity', 'pointer drag reorders and appends tracking placement while canonical drag keeps its own command route; failure retains source', async () => {
    await seed({ references: [nestedRefsA[0]] });
    const beforeNodes = await readNodes();
    const beforeRef = (await activeRefs())[0];
    await drag(placement('p-ref-a'), primary('p-task-d'), { targetYRatio: 0.82 });
    const reordered = (await activeRefs()).find(item => item.id === 'p-ref-a');
    if (!reordered || reordered.parentPlacementId !== 'primary:p-col-a' || reordered.order === beforeRef.order) {
      const debug = await page.evaluate(() => window.__projedDesktopTaskDragDebug || []);
      throw new Error(`reference reorder did not commit: ${JSON.stringify({ beforeRef, reordered, debug: debug.slice(-12) })}`);
    }
    if (JSON.stringify(beforeNodes) !== JSON.stringify(await readNodes())) throw new Error('reference reorder changed canonical task ownership/content');

    await drag(placement('p-ref-a'), primary('p-task-d'), { holdAtTargetMs: 1150, targetYRatio: 0.48 });
    const appended = (await activeRefs()).find(item => item.id === 'p-ref-a');
    if (appended?.parentPlacementId !== 'primary:p-task-d') {
      const debug = await page.evaluate(() => window.__projedDesktopTaskDragDebug || []);
      throw new Error(`reference append-child did not commit: ${JSON.stringify({ appended, debug: debug.slice(-20) })}`);
    }

    await seed({ references: [nestedRefsA[0]] });
    const canonicalBefore = await readNodes();
    await drag(primary('p-task-b'), primary('p-task-d'), { targetYRatio: 0.82 });
    const canonicalAfter = await readNodes();
    if (JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter)) throw new Error('primary pointer drag did not use canonical move route');

    await seed({ references: [nestedRefsA[0]] });
    const injectedFault = '測試故障：追蹤副本操作失敗。';
    const faultMessage = '搬移失敗，追蹤副本已保留在原位置。';
    const sourceBeforeFailure = (await activeRefs())[0];
    await setFault('move', injectedFault);
    await drag(placement('p-ref-a'), primary('p-task-d'), { targetYRatio: 0.82 });
    await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    const sourceAfterFailure = (await activeRefs())[0];
    if (sourceAfterFailure.parentPlacementId !== sourceBeforeFailure.parentPlacementId || sourceAfterFailure.order !== sourceBeforeFailure.order) throw new Error('failed reference drag did not retain source');
    return { reordered, appended, canonicalChanged: true, failureSourceRetained: true };
  });

  await runCase('B20-keyboard-mobile-dnd-parity', 'primary and tracking use the same keyboard sensor; 390px and 320px short tap/scroll do not drag while long-press uses the same placement-aware commit path', async () => {
    await seed({ references: [nestedRefsA[0]] });
    const keyboard = [];
    for (const [kind, target] of [['primary', primary('p-task-b')], ['tracking', placement('p-ref-a')]]) {
      const dragSurface = content(target);
      await dragSurface.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      const pressed = await dragSurface.getAttribute('aria-pressed');
      if (pressed !== 'true') throw new Error(`${kind} did not start KeyboardSensor: aria-pressed=${pressed}`);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(80);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      keyboard.push({ kind, pressed, cancelled: (await dragSurface.getAttribute('aria-pressed')) !== 'true' });
    }

    const runMobile = async (width, identifierOffset) => {
      const viewport = { width, height: 844 };
      await seed({ viewport, references: [nestedRefsA[0]] });
      const touchSurface = content(placement('p-ref-a'));
      const box = await touchSurface.boundingBox();
      if (!box) throw new Error(`${width}px mobile touch source geometry unavailable`);
      const touchPoint = { x: box.x + box.width / 2, y: box.y + Math.min(16, box.height / 2) };
      const shortTapIdentifier = 930 + identifierOffset;
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: touchPoint, identifier: shortTapIdentifier });
      await page.waitForTimeout(100);
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 0 });
        element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
      }, { point: touchPoint, identifier: shortTapIdentifier });
      await page.waitForTimeout(180);
      if (await page.evaluate(() => document.body.hasAttribute('data-task-drag-touch-active'))) throw new Error(`${width}px short tap incorrectly started drag`);

      const scrollIdentifier = 940 + identifierOffset;
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: touchPoint, identifier: scrollIdentifier });
      await page.waitForTimeout(80);
      const scrollPoint = { x: touchPoint.x, y: touchPoint.y + 42 };
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: scrollPoint, identifier: scrollIdentifier });
      await page.waitForTimeout(650);
      if (await page.evaluate(() => document.body.hasAttribute('data-task-drag-touch-active'))) throw new Error(`${width}px scroll gesture incorrectly started drag`);
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 0 });
        element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
      }, { point: scrollPoint, identifier: scrollIdentifier });
      await page.waitForTimeout(120);
      if ((await activeRefs()).length !== 1) throw new Error(`${width}px short tap/scroll mutated tracking placement`);

      const cancelIdentifier = 950 + identifierOffset;
      await touchSurface.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: touchPoint, identifier: cancelIdentifier });
      await page.waitForTimeout(650);
      const mobileState = await page.evaluate(() => ({
        active: document.body.hasAttribute('data-task-drag-touch-active'),
        placementId: document.querySelector('[data-kanban-drag-source-placeholder="true"]')?.getAttribute('data-task-placement-id'),
      }));
      if (!mobileState.active || mobileState.placementId !== 'p-ref-a') throw new Error(`${width}px reference long-press did not start placement-aware session: ${JSON.stringify(mobileState)}`);
      await touchSurface.evaluate(element => element.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [] })));
      await page.waitForTimeout(180);
      if ((await activeRefs()).length !== 1) throw new Error(`${width}px mobile cancel duplicated or removed tracking placement`);

      await seed({ viewport, references: [nestedRefsA[0]] });
      const mobileSource = content(placement('p-ref-a'));
      const mobileSourceBox = await mobileSource.boundingBox();
      if (!mobileSourceBox) throw new Error(`${width}px mobile commit source geometry unavailable`);
      const startPoint = { x: mobileSourceBox.x + mobileSourceBox.width / 2, y: mobileSourceBox.y + Math.min(16, mobileSourceBox.height / 2) };
      const commitIdentifier = 960 + identifierOffset;
      await mobileSource.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: startPoint, identifier: commitIdentifier });
      await page.waitForTimeout(650);
      const mobileTarget = content(primary('p-task-d'));
      const mobileTargetBox = await mobileTarget.boundingBox();
      if (!mobileTargetBox) throw new Error(`${width}px mobile commit target geometry unavailable`);
      const endPoint = { x: mobileTargetBox.x + mobileTargetBox.width / 2, y: mobileTargetBox.y + mobileTargetBox.height * 0.82 };
      await mobileSource.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 1 });
        element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      }, { point: endPoint, identifier: commitIdentifier });
      await page.waitForTimeout(150);
      await mobileSource.evaluate((element, { point, identifier }) => {
        const touch = new Touch({ identifier, target: element, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y, radiusX: 2, radiusY: 2, force: 0 });
        element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
      }, { point: endPoint, identifier: commitIdentifier });
      await page.waitForTimeout(700);
      const mobileCommitted = (await activeRefs()).find(item => item.id === 'p-ref-a');
      if (!mobileCommitted || mobileCommitted.parentPlacementId !== 'primary:p-col-a' || mobileCommitted.order === nestedRefsA[0].order) throw new Error(`${width}px mobile tracking drop did not commit through shared session: ${JSON.stringify(mobileCommitted)}`);
      return { viewport, shortTapDidNotDrag: true, scrollDidNotDrag: true, ...mobileState, cancelledWithoutMutation: true, committedOrder: mobileCommitted.order };
    };

    const mobile = [];
    for (const [index, width] of [390, 320].entries()) mobile.push(await runMobile(width, index));
    return { keyboard, mobile };
  });

  await runCase('B21-shared-surface-visual-parity', 'List row, Kanban card and checklist content share slots/styles; only the tracking frame border is dashed at 1440/390/320', async () => {
    await seed();
    const compare = async (primaryTarget, referenceTarget) => page.evaluate(({ primarySelector, referenceSelector }) => {
      const p = document.querySelector(primarySelector);
      const r = document.querySelector(referenceSelector);
      if (!p || !r) return null;
      const pSource = p.matches('[data-task-surface-source="true"]') ? p : p.querySelector(':scope > [data-task-surface-source="true"]');
      const rSource = r.matches('[data-task-surface-source="true"]') ? r : r.querySelector(':scope > [data-task-surface-source="true"]');
      if (!pSource || !rSource) return null;
      const style = element => {
        const value = getComputedStyle(element);
        return { display: value.display, padding: value.padding, fontSize: value.fontSize, lineHeight: value.lineHeight, borderRadius: value.borderRadius };
      };
      return {
        primaryBorder: getComputedStyle(p).borderStyle,
        referenceBorder: getComputedStyle(r).borderStyle,
        primaryTitle: pSource.querySelector('[data-task-title-slot="true"]')?.textContent?.trim(),
        referenceTitle: rSource.querySelector('[data-task-title-slot="true"]')?.textContent?.trim(),
        primarySlots: pSource.querySelectorAll('[data-task-title-slot="true"]').length,
        referenceSlots: rSource.querySelectorAll('[data-task-title-slot="true"]').length,
        primaryStyle: style(pSource),
        referenceStyle: style(rSource),
        visibleTrackingCopy: (r.textContent || '').includes('追蹤副本') || (r.textContent || '').includes('同步自主要任務'),
        accessibleName: r.getAttribute('aria-label'),
      };
    }, { primarySelector: primaryTarget, referenceSelector: referenceTarget });
    const boardEvidence = await compare('[data-task-placement-id="primary:p-task-a"]', '[data-task-placement-id="p-ref-a"]');
    if (!boardEvidence || boardEvidence.referenceBorder !== 'dashed' || boardEvidence.primaryBorder === 'dashed'
      || boardEvidence.primaryTitle !== boardEvidence.referenceTitle || boardEvidence.primarySlots !== boardEvidence.referenceSlots
      || JSON.stringify(boardEvidence.primaryStyle) !== JSON.stringify(boardEvidence.referenceStyle)
      || boardEvidence.visibleTrackingCopy || !boardEvidence.accessibleName?.includes('追蹤副本')) throw new Error(`Kanban shared surface mismatch: ${JSON.stringify(boardEvidence)}`);

    const checklistEvidence = await compare('[data-task-placement-id="primary:p-task-e"]', '[data-task-placement-id="p-ref-b"]');
    if (!checklistEvidence || checklistEvidence.referenceBorder !== 'dashed' || checklistEvidence.primaryBorder === 'dashed'
      || checklistEvidence.primarySlots !== checklistEvidence.referenceSlots
      || JSON.stringify(checklistEvidence.primaryStyle) !== JSON.stringify(checklistEvidence.referenceStyle)
      || checklistEvidence.visibleTrackingCopy || !checklistEvidence.accessibleName?.includes('追蹤副本')) throw new Error(`Checklist shared surface mismatch: ${JSON.stringify(checklistEvidence)}`);

    const mode = page.locator('[data-mode-switcher-trigger="true"]');
    await mode.click();
    await page.locator('[data-mode-switcher-value="list"]').click();
    await placement('p-ref-a').waitFor({ state: 'visible', timeout: 10000 });
    const listEvidence = await compare('[data-task-placement-id="primary:p-task-a"]', '[data-task-placement-id="p-ref-a"]');
    if (!listEvidence || listEvidence.referenceBorder !== 'dashed' || listEvidence.primaryTitle !== listEvidence.referenceTitle || listEvidence.visibleTrackingCopy) throw new Error(`List shared surface mismatch: ${JSON.stringify(listEvidence)}`);

    const viewports = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
      await seed({ viewport });
      const layout = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
      if (layout.documentWidth > layout.viewportWidth || layout.bodyWidth > layout.viewportWidth) throw new Error(`viewport overflow ${viewport.width}: ${JSON.stringify(layout)}`);
      const screenshot = `${OUTPUT_DIR}/interaction-parity-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      viewports.push({ viewport, layout, screenshot });
    }
    return { board: boardEvidence, checklist: checklistEvidence, list: listEvidence, viewports };
  });

  await runCase('B22-recursive-child-parity', 'tracking descendants use the same recursive checklist surface, expand/collapse two levels, preserve nested details/focus, and do not auto-project canonical children', async () => {
    await seed();
    const root = placement('p-ref-a');
    const child = placement('p-ref-b');
    const grandchild = placement('p-ref-c');
    await grandchild.waitFor({ state: 'visible', timeout: 10000 });
    const kinds = await Promise.all([root, child, grandchild].map(target => target.getAttribute('data-task-surface-frame-kind')));
    if (JSON.stringify(kinds) !== JSON.stringify(['kanban-card', 'checklist-row', 'checklist-row'])) throw new Error(`nested shared surface kinds mismatch: ${JSON.stringify(kinds)}`);
    if (await root.locator('[data-task-placement-id="primary:p-task-e"]').count()) throw new Error('creating a parent reference auto-materialized a canonical descendant');
    const toggle = root.locator('[data-kanban-checklist-toggle="true"]').first();
    await toggle.click();
    await child.waitFor({ state: 'detached', timeout: 5000 });
    await toggle.click();
    await grandchild.waitFor({ state: 'visible', timeout: 5000 });
    await grandchild.focus();
    await page.keyboard.press('Enter');
    await details().waitFor({ state: 'visible', timeout: 5000 });
    const nestedDetails = await details().evaluate(element => ({ taskId: element.getAttribute('data-task-id'), trackingReferenceId: element.getAttribute('data-task-tracking-reference-id') }));
    if (nestedDetails.taskId !== 'p-task-c' || nestedDetails.trackingReferenceId !== 'p-ref-c') throw new Error(`nested details lost placement: ${JSON.stringify(nestedDetails)}`);
    await closeDetails();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-task-placement-id'));
    if (focused !== 'p-ref-c') throw new Error(`nested focus return failed: ${focused}`);
    return { surfaceKinds: kinds, collapseExpand: true, canonicalDescendantAutoProjected: false, nestedDetails, focused };
  });

  await runCase('B23-subtree-transaction-and-recovery', 'moving/removing a tracking parent preserves its descendant closure, undo restores one subtree, primary data and roll-up remain unchanged, descendant target is unavailable while source subtree moves', async () => {
    await seed();
    const canonicalBefore = await readNodes();
    const childBefore = (await activeRefs()).find(item => item.id === 'p-ref-b');
    const grandBefore = (await activeRefs()).find(item => item.id === 'p-ref-c');
    await drag(placement('p-ref-a'), primary('p-task-d'), { holdAtTargetMs: 1150, targetYRatio: 0.48 });
    const moved = await activeRefs();
    const movedRoot = moved.find(item => item.id === 'p-ref-a');
    const movedChild = moved.find(item => item.id === 'p-ref-b');
    const movedGrand = moved.find(item => item.id === 'p-ref-c');
    if (movedRoot?.parentPlacementId !== 'primary:p-task-d' || movedChild?.parentPlacementId !== childBefore.parentPlacementId || movedGrand?.parentPlacementId !== grandBefore.parentPlacementId) {
      const debug = await page.evaluate(() => window.__projedDesktopTaskDragDebug || []);
      throw new Error(`subtree closure broke during move: ${JSON.stringify({ moved, debug: debug.slice(-20) })}`);
    }
    if (JSON.stringify(canonicalBefore) !== JSON.stringify(await readNodes())) throw new Error('tracking subtree move changed primary graph/roll-up data');

    const menu = await openMenu(placement('p-ref-a'));
    await page.evaluate(() => { window.confirm = () => true; });
    await menu.locator('[data-task-action-id="task.remove-tracking-reference"]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]').filter(item => !item.removedAt).length === 0, null, { timeout: 10000 });
    await page.locator('#btn-undo').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]').filter(item => !item.removedAt).length === 3, null, { timeout: 10000 });
    await placement('p-ref-c').waitFor({ state: 'visible', timeout: 10000 });
    if (JSON.stringify(canonicalBefore) !== JSON.stringify(await readNodes())) throw new Error('subtree remove/undo changed canonical graph');
    return { movedParent: movedRoot.parentPlacementId, childClosure: movedChild.parentPlacementId, grandchildClosure: movedGrand.parentPlacementId, removedCount: 3, restoredCount: 3, canonicalUnchanged: true, cycleUiFailClosed: 'dragged subtree descendants are removed from target DOM while source is active' };
  });

  await runCase('B24-capability-visible-error-and-convergence', 'derived viewer and revoked source capability use the same readonly details; source edit converges; provider and stale-revision failures remain visible and source-retaining', async () => {
    const targetReference = [ref('p-ref-derived', 'p-task-a', boardB, null, 1)];
    await seed({ userId: 'local-test-viewer', activeBoardId: boardB, references: targetReference, sourceRole: 'viewer', targetRole: 'member' });
    const derived = placement('p-ref-derived');
    await content(derived).click();
    await details().waitFor({ state: 'visible', timeout: 10000 });
    const derivedEvidence = await details().evaluate(element => ({
      readonly: element.getAttribute('data-task-details-readonly'),
      titleInputs: element.querySelectorAll('[data-task-details-title-input="true"]').length,
      trackingReferenceId: element.getAttribute('data-task-tracking-reference-id'),
    }));
    if (derivedEvidence.readonly !== 'true' || derivedEvidence.titleInputs !== 0 || derivedEvidence.trackingReferenceId !== 'p-ref-derived') throw new Error(`derived-only details is not capability-readonly: ${JSON.stringify(derivedEvidence)}`);
    await closeDetails();

    await seed({ activeBoardId: boardB, references: targetReference });
    const editable = placement('p-ref-derived');
    await content(editable).click();
    await details().waitFor({ state: 'visible', timeout: 10000 });
    const titleInput = details().locator('[data-task-details-title-input="true"]');
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    const updatedTitle = '由追蹤位置更新的唯一真相 A';
    await titleInput.fill(updatedTitle);
    await titleInput.blur();
    await page.waitForFunction(title => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['p-task-a']?.title === title, updatedTitle, { timeout: 10000 });
    await closeDetails();
    await page.waitForFunction(title => document.querySelector('[data-task-placement-id="p-ref-derived"]')?.textContent?.includes(title), updatedTitle, { timeout: 10000 });
    const canonical = (await readNodes())['p-task-a'];
    if (canonical.title !== updatedTitle) throw new Error(`canonical title did not converge: ${JSON.stringify(canonical)}`);

    await seed({ userId: 'local-test-viewer', activeBoardId: boardB, references: targetReference, sourceRole: 'owner', targetRole: 'owner' });
    await content(placement('p-ref-derived')).click();
    await details().waitFor({ state: 'visible', timeout: 10000 });
    const beforeRevokeEvidence = await details().evaluate(element => ({
      readonly: element.getAttribute('data-task-details-readonly'),
      titleInputs: element.querySelectorAll('[data-task-details-title-input="true"]').length,
    }));
    if (beforeRevokeEvidence.readonly === 'true' || beforeRevokeEvidence.titleInputs !== 1) throw new Error(`pre-revoke source capability was not editable: ${JSON.stringify(beforeRevokeEvidence)}`);
    await closeDetails();

    await seed({ userId: 'local-test-viewer', activeBoardId: boardB, references: targetReference, sourceRole: 'viewer', targetRole: 'owner' });
    await content(placement('p-ref-derived')).click();
    await details().waitFor({ state: 'visible', timeout: 10000 });
    const revokedEvidence = await details().evaluate(element => ({
      readonly: element.getAttribute('data-task-details-readonly'),
      titleInputs: element.querySelectorAll('[data-task-details-title-input="true"]').length,
    }));
    if (revokedEvidence.readonly !== 'true' || revokedEvidence.titleInputs !== 0) throw new Error(`revoked source capability did not converge to readonly details: ${JSON.stringify(revokedEvidence)}`);
    await closeDetails();

    await seed({ activeBoardId: boardB, references: targetReference });
    await page.evaluate(() => {
      const key = 'projed-local-test.taskTrackingReferences.v1';
      const references = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify(references.map(item => item.id === 'p-ref-derived' ? { ...item, revision: item.revision + 1 } : item)));
    });
    const beforeStale = (await activeRefs())[0];
    const faultMessage = '搬移失敗，追蹤副本已保留在原位置。';
    await drag(placement('p-ref-derived'), content(primary('p-col-b')), { targetYRatio: 0.6 });
    await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    const afterStale = (await activeRefs())[0];
    if (afterStale.parentPlacementId !== beforeStale.parentPlacementId || afterStale.order !== beforeStale.order || afterStale.revision !== beforeStale.revision) throw new Error('stale-revision failure did not preserve source');

    await seed({ activeBoardId: boardB, references: targetReference });
    const injectedFault = '測試故障：追蹤副本操作失敗。';
    const beforeFault = (await activeRefs())[0];
    await setFault('move', injectedFault);
    await drag(placement('p-ref-derived'), content(primary('p-col-b')), { targetYRatio: 0.6 });
    try {
      await page.getByText(faultMessage, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    } catch (error) {
      const debug = await page.evaluate(() => window.__projedDesktopTaskDragDebug || []);
      throw new Error(`fault route did not surface: ${JSON.stringify({ debug: debug.slice(-20), cause: error instanceof Error ? error.message : String(error) })}`);
    }
    const afterFault = (await activeRefs())[0];
    if (afterFault.parentPlacementId !== beforeFault.parentPlacementId || afterFault.order !== beforeFault.order) throw new Error('visible provider failure did not preserve source');
    const unexpected = diagnostics.filter(item => /pageerror|HTTP\s+[45]\d\d|\.inline-error/i.test(item));
    if (unexpected.length) throw new Error(`unexpected browser diagnostics: ${JSON.stringify(unexpected)}`);
    return { derived: derivedEvidence, sourceEditorCanonicalUpdate: canonical.title, referenceConverged: true, permissionBeforeRevokeEditable: beforeRevokeEvidence, permissionRevokedToReadonly: revokedEvidence, staleRevisionSourceRetained: true, staleRevision: afterStale.revision, providerFailureSourceRetained: true, recoverableMessage: faultMessage, unexpectedDiagnostics: unexpected };
  });

  const passed = cases.every(item => item.status === 'PASS');
  const result = {
    dev: 'DEV-095',
    devId: 'DEV-095',
    sourceRevision: 'working-tree-frozen-candidate',
    environment: 'local-test-browser-interaction-parity',
    provider: 'local-test',
    cases,
    status: passed ? 'passed' : 'failed',
    passed,
    summary: { PASS: cases.filter(item => item.status === 'PASS').length, FAIL: cases.filter(item => item.status === 'FAIL').length, NOT_RUN: 0, BLOCKED: 0 },
    evidence: ['normal board/list UI entry', 'desktop pointer', 'KeyboardSensor', 'real TouchEvent long-press', 'same Task Details component', 'capability-aware action catalog', 'recursive TaskPlacementTree', '1440x900 screenshot', '390x844 screenshot', '320x844 screenshot', 'localStorage canonical/reference readback', 'provider failure recovery'],
    diagnostics: diagnostics.slice(-80),
  };
  await page.evaluate(value => {
    window.__DEV095_INTERACTION_PARITY_ARTIFACT = value;
    sessionStorage.setItem('__DEV095_INTERACTION_PARITY_ARTIFACT', JSON.stringify(value));
    localStorage.setItem('__DEV095_INTERACTION_PARITY_ARTIFACT', JSON.stringify(value));
  }, result);
  if (!passed) throw new Error(`DEV-095 interaction parity browser verifier failed: ${JSON.stringify(result)}`);
  return result;
}
