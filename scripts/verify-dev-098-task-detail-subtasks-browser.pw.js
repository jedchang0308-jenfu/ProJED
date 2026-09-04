/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-098';
  const cases = [];
  const diagnostics = [];
  page.on('console', message => {
    if (message.text().includes('測試故障：任務儲存失敗') || message.text().includes('測試故障：追蹤副本操作失敗') || message.text().includes('local-test injected task persistence rejection')) return;
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push('console:' + message.type() + ':' + message.text());
  });
  page.on('pageerror', error => diagnostics.push('pageerror:' + error.message));

  const workspaceId = 'dev098-workspace';
  const boardId = 'dev098-board';
  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'dev098@projed.local', displayName: 'DEV-098 QA', createdAt: 1704067200000 };
  const accountFor = userId => ({ ...account, id: userId, uid: userId, email: `${userId}@projed.local`, displayName: userId });
  const node = (id, title, parentId, order, nodeType) => ({
    id, title, boardId, workspaceId, parentId, order, nodeType: nodeType || 'task', status: 'todo',
    createdAt: 1704067200000, updatedAt: 1704067200000, startDate: '', endDate: '',
    detailNotes: [{ id: id + '-note', title: '備註', content: '' }],
  });
  const nodes = {
    'dev098-column': node('dev098-column', 'DEV-098 看板', null, 0, 'group'),
    'dev098-parent': node('dev098-parent', '父任務 P0', 'dev098-column', 0),
    'dev098-child': node('dev098-child', '子任務 P1', 'dev098-parent', 0),
    'dev098-grandchild': node('dev098-grandchild', '孫任務 P1A', 'dev098-child', 0),
    'dev098-sibling': node('dev098-sibling', '同層任務 P2', 'dev098-parent', 1),
  };
  const trackingReference = (id, taskId, parentPlacementId, order, overrides = {}) => ({
    id, taskId, workspaceId, boardId, sourceBoardId: boardId, parentPlacementId, order,
    revision: 1, createdAt: 1704067200000, updatedAt: 1704067200000, ...overrides,
  });
  const workspace = {
    id: workspaceId, title: 'DEV-098 Workspace', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: boardId, title: 'DEV-098 Board', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const seed = async ({ viewport, userId = account.id, role = 'owner', trackingReferences = [] } = {}) => {
    await page.setViewportSize(viewport || { width: 1440, height: 900 });
    await page.evaluate(({ account, workspace, nodes, workspaceId, boardId, trackingReferences, role }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', '[]');
      localStorage.setItem('projed-local-test.tags', '[]');
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(trackingReferences));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [workspaceId + ':' + boardId]: [{ userId: account.id, role, createdAt: 1704067200000, updatedAt: 1704067200000 }] }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspaceId);
      localStorage.setItem('projed-last-board', boardId);
      localStorage.setItem('projed-last-view', 'board');
    }, { account: accountFor(userId), workspace, nodes, workspaceId, boardId, trackingReferences, role });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.first().isVisible().catch(() => false)) await fixed.first().click({ force: true });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(350);
  };
  const details = () => page.locator('[data-task-details-modal="true"]');
  const readNodes = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
  const readReferences = () => page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.taskTrackingReferences.v1') || '[]'));
  const modalPlacement = id => details().locator('[data-task-surface-frame="true"][data-task-placement-id="' + id + '"]').first();
  const sourceContent = target => target.locator(':scope > [data-task-surface-source="true"]').first();
  const drag = async (source, target, { holdAtTargetMs = 0, targetYRatio = 0.72 } = {}) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('drag geometry unavailable');
    const sx = sourceBox.x + sourceBox.width / 2;
    const sy = sourceBox.y + Math.min(16, sourceBox.height / 2);
    const tx = targetBox.x + targetBox.width / 2;
    const ty = targetBox.y + targetBox.height * targetYRatio;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 10, sy + 7, { steps: 4 });
    // Activating a row with an expanded descendant temporarily replaces that
    // subtree with a full-height source placeholder.  Re-read the destination
    // after activation so the synthetic pointer follows the displayed target
    // instead of releasing at its pre-placeholder coordinate.
    // An invalid descendant target is intentionally removed from the DOM
    // while its ancestor source is rendered as a placeholder.  Treat that as
    // a valid no-target fallback instead of waiting for a hidden locator.
    const liveTargetBox = await target.boundingBox({ timeout: 500 }).catch(() => null);
    const liveTx = liveTargetBox ? liveTargetBox.x + liveTargetBox.width / 2 : tx;
    const liveTy = liveTargetBox ? liveTargetBox.y + liveTargetBox.height * targetYRatio : ty;
    await page.mouse.move(liveTx, liveTy, { steps: 18 });
    if (holdAtTargetMs) await page.waitForTimeout(holdAtTargetMs);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };
  const placement = id => page.locator('[data-task-surface-frame="true"][data-task-placement-id="' + id + '"]').last();
  const openPlacement = async id => {
    const frame = placement(id);
    await frame.waitFor({ state: 'visible', timeout: 15000 });
    await frame.locator(':scope > [data-task-surface-source="true"]').first().click({ force: true });
    await details().waitFor({ state: 'visible', timeout: 10000 });
    return details();
  };
  const close = async () => {
    await details().getByRole('button', { name: '關閉任務詳情' }).click({ timeout: 3000 });
    await details().waitFor({ state: 'detached', timeout: 5000 });
  };
  const run = async (id, flow) => {
    const started = Date.now();
    try { cases.push({ id, status: 'PASS', actual: await flow(), durationMs: Date.now() - started }); }
    catch (error) {
      cases.push({ id, status: 'FAIL', failure: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
      try { await page.screenshot({ path: outputDir + '/' + id + '-failure.png', fullPage: true }); } catch {}
    }
  };

  await run('B01-board-details-shared-row-parity', async () => {
    await seed();
    const boardRow = placement('primary:dev098-child');
    const modal = await openPlacement('primary:dev098-parent');
    const detailsRow = modalPlacement('primary:dev098-child');
    const readRow = async row => row.evaluate(element => {
      const source = element.querySelector(':scope > [data-task-surface-source="true"]') || element;
      return {
        title: source.querySelector('[data-task-title-slot="true"]')?.textContent?.trim(),
        depth: source.getAttribute('data-task-hierarchy-depth'),
        level: source.getAttribute('data-task-hierarchy-level'),
        visual: source.getAttribute('data-kanban-checklist-row-visual'),
        sourceKind: element.getAttribute('data-task-placement-kind'),
      };
    });
    const board = await readRow(boardRow);
    const detail = await readRow(detailsRow);
    if (JSON.stringify(board) !== JSON.stringify(detail)) throw new Error('Board/Details row parity mismatch: ' + JSON.stringify({ board, detail }));
    return { board, details: detail, sharedPlacementId: 'primary:dev098-child' };
  });

  await run('B02-default-expanded-count', async () => {
    await close().catch(() => {});
    await seed();
    const modal = await openPlacement('primary:dev098-parent');
    const section = modal.locator('[data-task-details-subtasks="true"]');
    if (await section.count() !== 1) throw new Error('subtask section missing');
    const count = await section.locator('[data-task-details-subtask-count="true"]').innerText();
    if (count !== '2') throw new Error('direct child count should be 2, got ' + count);
    if (await section.locator('[data-task-details-subtask-empty="true"]').count()) throw new Error('non-empty parent rendered empty state');
    return { expanded: await section.locator('[data-task-details-subtask-toggle="true"]').getAttribute('aria-expanded'), count };
  });
  await run('B03-single-modal-push-back', async () => {
    await close().catch(() => {});
    await seed();
    const modal = await openPlacement('primary:dev098-parent');
    const child = modal.locator('[data-task-surface-frame="true"][data-task-placement-id="primary:dev098-child"] [data-task-surface-source="true"]').first();
    await child.click();
    await page.waitForTimeout(120);
    if (await details().count() !== 1) throw new Error('navigation created a second modal');
    if (await details().getAttribute('data-task-id') !== 'dev098-child') throw new Error('child navigation did not push');
    if (await details().locator('[data-task-details-title-input="true"]').count() !== 1) throw new Error('child details title editor missing');
    await details().getByRole('button', { name: '返回上一個任務詳情' }).click();
    await page.waitForTimeout(120);
    if (await details().getAttribute('data-task-id') !== 'dev098-parent') throw new Error('Back did not restore parent');
    return {
      modalCount: await details().count(),
      taskId: await details().getAttribute('data-task-id'),
      titleInputAvailable: true,
    };
  });

  await run('B04-draft-save-and-reopen', async () => {
    await close().catch(() => {});
    await seed();
    const modal = await openPlacement('primary:dev098-parent');
    const updatedTitle = '父任務 P0（已保存）';
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.fill(updatedTitle);
    await titleInput.blur();
    await page.waitForFunction(title => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev098-parent']?.title === title, updatedTitle);
    const editor = modal.locator('[data-task-detail-note-card="true"] [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill('明細草稿已保存');
    await editor.press('Tab');
    await page.waitForTimeout(1100);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev098-parent']?.description === '明細草稿已保存', null, { timeout: 10000 });
    await close();
    const reopened = await openPlacement('primary:dev098-parent');
    const persistedTitle = await reopened.locator('[data-task-details-title-input="true"]').inputValue();
    const persistedDescription = await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev098-parent']?.description);
    if (persistedTitle !== updatedTitle || persistedDescription !== '明細草稿已保存') throw new Error('draft did not survive close/reopen');
    return { persistedTitle, persistedDescription };
  });

  await run('B05-save-reject-retry-blocks-navigation', async () => {
    await close().catch(() => {});
    await seed();
    const modal = await openPlacement('primary:dev098-parent');
    await page.evaluate(() => localStorage.setItem('projed-local-test.taskNodeFault', 'update-once'));
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.fill('父任務 P0（待重試）');
    await titleInput.blur();
    await modal.locator('[data-task-details-save-status="error"]').waitFor({ state: 'visible', timeout: 10000 });
    const retry = modal.locator('[data-task-details-save-retry="true"]');
    if (await retry.count() !== 1) throw new Error('save failure did not expose retry');
    await sourceContent(modalPlacement('primary:dev098-child')).click();
    await page.waitForTimeout(160);
    if (await details().getAttribute('data-task-id') !== 'dev098-parent') throw new Error('failed draft allowed navigation');
    await retry.click();
    await modal.locator('[data-task-details-save-status="saved"]').waitFor({ state: 'visible', timeout: 10000 });
    await sourceContent(modalPlacement('primary:dev098-child')).click();
    await page.waitForFunction(() => document.querySelector('[data-task-details-modal="true"]')?.getAttribute('data-task-id') === 'dev098-child', null, { timeout: 10000 });
    return { stayedOnFailure: true, retryRecovered: true, taskId: await details().getAttribute('data-task-id') };
  });

  await run('B06-rapid-navigation-single-modal', async () => {
    await close().catch(() => {});
    await seed();
    const modal = await openPlacement('primary:dev098-parent');
    const child = modalPlacement('primary:dev098-child').locator('[data-task-surface-source="true"]').first();
    await child.click();
    await modal.locator('[data-task-details-back="true"]').click().catch(() => {});
    await page.waitForTimeout(260);
    if (await details().count() !== 1) throw new Error('rapid child/back created duplicate modal');
    return { modalCount: await details().count(), taskId: await details().getAttribute('data-task-id') };
  });

  await run('B07-context-menu-above-modal', async () => {
    await close().catch(() => {});
    await seed();
    await openPlacement('primary:dev098-parent');
    const row = details().locator('[data-task-surface-frame="true"][data-task-placement-id="primary:dev098-child"] [data-task-surface-source="true"]').first();
    await row.click({ button: 'right', position: { x: 28, y: 10 } });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    const z = await menu.evaluate(element => Number.parseInt(getComputedStyle(element).zIndex || '0', 10));
    const modalZ = await details().evaluate(element => Number.parseInt(getComputedStyle(element).zIndex || '0', 10));
    if (!(z > modalZ)) throw new Error('context menu z-index is below modal');
    const openDetailsAction = menu.locator('[data-task-action-id="task.open-details"]');
    if (await openDetailsAction.count() !== 1) throw new Error('context menu missing open-details action');
    await openDetailsAction.click();
    await page.waitForTimeout(120);
    if (await details().count() !== 1 || await details().getAttribute('data-task-id') !== 'dev098-child') throw new Error('right-click open-details did not use modal navigation');
    return { menuZ: z, modalZ };
  });

  await run('B08-escape-outside-layer-ownership', async () => {
    await close().catch(() => {});
    await seed();
    await openPlacement('primary:dev098-parent');
    const row = modalPlacement('primary:dev098-child').locator('[data-task-surface-source="true"]').first();
    await row.click({ button: 'right', position: { x: 28, y: 10 } });
    await page.locator('[data-global-context-menu="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
    if (await page.locator('[data-global-context-menu="true"]').count() !== 0 || await details().count() !== 1) throw new Error('Escape closed the wrong layer');
    await row.click({ button: 'right', position: { x: 28, y: 10 } });
    await page.waitForTimeout(820);
    await page.mouse.click(6, 6);
    await page.waitForTimeout(100);
    if (await page.locator('[data-global-context-menu="true"]').count() !== 0 || await details().count() !== 1) throw new Error('outside click did not preserve modal');
    return { escapeClosedMenuOnly: true, outsideClickPreservedModal: true };
  });

  await run('B09-details-desktop-sibling-reorder', async () => {
    await close().catch(() => {});
    await seed();
    await openPlacement('primary:dev098-parent');
    const source = sourceContent(modalPlacement('primary:dev098-child'));
    const target = sourceContent(modalPlacement('primary:dev098-sibling'));
    const before = await readNodes();
    await drag(source, target, { targetYRatio: 0.86 });
    const after = await readNodes();
    if (after['dev098-child']?.parentId !== 'dev098-parent' || after['dev098-child']?.order === before['dev098-child']?.order) {
      const debug = await page.evaluate(() => ({
        desktop: (window.__projedDesktopTaskDragDebug || []).slice(-15),
        details: (window.__projedDetailsDragDebug || []).slice(-30),
      }));
      throw new Error('details sibling reorder did not commit: ' + JSON.stringify({ before, after, debug }));
    }
    return { beforeOrder: before['dev098-child']?.order, afterOrder: after['dev098-child']?.order, parentId: after['dev098-child']?.parentId };
  });

  await run('B10-details-append-and-invalid-drop', async () => {
    await close().catch(() => {});
    await seed();
    await openPlacement('primary:dev098-parent');
    const source = sourceContent(modalPlacement('primary:dev098-sibling'));
    const target = sourceContent(modalPlacement('primary:dev098-child'));
    await drag(source, target, { holdAtTargetMs: 1150, targetYRatio: 0.52 });
    const appended = await readNodes();
    if (appended['dev098-sibling']?.parentId !== 'dev098-child') {
      const debug = await page.evaluate(() => (window.__projedDesktopTaskDragDebug || []).slice(-15));
      throw new Error('details append-child did not commit: ' + JSON.stringify({ appended, debug }));
    }
    const beforeInvalid = JSON.stringify(appended['dev098-child']);
    await drag(sourceContent(modalPlacement('primary:dev098-child')), sourceContent(modalPlacement('primary:dev098-grandchild')), { holdAtTargetMs: 1150, targetYRatio: 0.52 });
    const afterInvalid = await readNodes();
    if (JSON.stringify(afterInvalid['dev098-child']) !== beforeInvalid) throw new Error('descendant drop was not rejected');
    return { appendedParentId: appended['dev098-sibling']?.parentId, descendantDropRejected: true };
  });

  await run('B11-tracking-placement-failure-retains-source', async () => {
    await close().catch(() => {});
    const ref = trackingReference('dev098-ref-child', 'dev098-child', 'primary:dev098-parent', 2);
    await seed({ trackingReferences: [ref] });
    await openPlacement('primary:dev098-parent');
    const source = sourceContent(modalPlacement('dev098-ref-child'));
    const target = sourceContent(modalPlacement('primary:dev098-sibling'));
    const before = (await readReferences()).find(item => item.id === ref.id);
    await page.evaluate(() => { window.__projedTaskTrackingTestFault = { operation: 'move', failNext: true, message: '測試故障：追蹤副本操作失敗。' }; });
    await drag(source, target, { targetYRatio: 0.86 });
    await page.getByText(/^(搬移失敗，追蹤副本已保留在原位置。|測試故障：追蹤副本操作失敗。)$/, { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
    const after = (await readReferences()).find(item => item.id === ref.id);
    if (after?.parentPlacementId !== before?.parentPlacementId || after?.order !== before?.order) throw new Error('provider failure changed tracking source');
    return { sourceRetained: true, parentPlacementId: after?.parentPlacementId, order: after?.order };
  });

  await run('B12-details-keyboard-drag-sensor', async () => {
    await close().catch(() => {});
    await seed();
    await openPlacement('primary:dev098-parent');
    const source = sourceContent(modalPlacement('primary:dev098-child'));
    await source.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    if (await source.getAttribute('aria-pressed') !== 'true') throw new Error('KeyboardSensor did not start in details');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    return { started: true, cancelled: await source.getAttribute('aria-pressed') !== 'true' };
  });

  await run('B13-mobile-local-scroll-scope', async () => {
    await close();
    await seed({ viewport: { width: 390, height: 844 } });
    const modal = await openPlacement('primary:dev098-parent');
    if (await modal.locator('[data-task-details-scroll-surface="true"]').count() !== 1) throw new Error('details scroll surface missing');
    if (await modal.locator('[data-task-details-root-drop-zone="true"]').count() !== 1) throw new Error('local drop scope missing');
    await modal.locator('[data-task-details-subtask-toggle="true"]').click();
    if (await modal.locator('[data-task-details-subtask-panel="true"]').count() !== 0) throw new Error('collapse did not hide panel');
    await modal.locator('[data-task-details-subtask-toggle="true"]').click();
    return { viewport: [390, 844], collapsedAndExpanded: true };
  });

  await run('B14-mobile-320-short-scroll-guard', async () => {
    await close().catch(() => {});
    await seed({ viewport: { width: 320, height: 844 } });
    const modal = await openPlacement('primary:dev098-parent');
    const source = sourceContent(modalPlacement('primary:dev098-child'));
    const box = await source.boundingBox();
    if (!box) throw new Error('320px touch geometry unavailable');
    const point = { x: box.x + box.width / 2, y: box.y + Math.min(12, box.height / 2) };
    const dispatchTouch = async (type, identifier, x, y, force) => source.evaluate((element, payload) => {
      const touch = new Touch({ identifier: payload.identifier, target: element, clientX: payload.x, clientY: payload.y, pageX: payload.x, pageY: payload.y, radiusX: 2, radiusY: 2, force: payload.force });
      element.dispatchEvent(new TouchEvent(payload.type, { bubbles: true, cancelable: true, touches: payload.type === 'touchend' ? [] : [touch], targetTouches: payload.type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
    }, { type, identifier, x, y, force });
    await dispatchTouch('touchstart', 1401, point.x, point.y, 1);
    await page.waitForTimeout(80);
    await dispatchTouch('touchmove', 1401, point.x, point.y + 44, 1);
    await page.waitForTimeout(650);
    if (await page.evaluate(() => document.body.hasAttribute('data-task-drag-touch-active'))) throw new Error('320px short scroll incorrectly started drag');
    await dispatchTouch('touchend', 1401, point.x, point.y + 44, 0);
    await page.waitForTimeout(120);
    if (JSON.stringify(await readNodes()) === '{}') throw new Error('fixture disappeared during touch guard');
    return { viewport: [320, 844], shortScrollDidNotDrag: true };
  });

  await run('B15-readonly-and-tracking-capability-guard', async () => {
    await close().catch(() => {});
    await seed({ userId: 'local-test-viewer', role: 'viewer' });
    const readonly = await openPlacement('primary:dev098-parent');
    if (await readonly.getAttribute('data-task-details-readonly') !== 'true') throw new Error('viewer details not readonly');
    if (await readonly.locator('[data-task-details-title-input="true"]').count() !== 0) throw new Error('viewer title editor visible');
    if (await readonly.locator('[data-task-details-subtask-create="true"]').count() !== 0) throw new Error('viewer create CTA visible');
    await close();
    const reference = trackingReference('dev098-ref-child', 'dev098-child', 'primary:dev098-parent', 2);
    await seed({ trackingReferences: [reference], userId: 'local-test-viewer', role: 'viewer' });
    const trackingRow = await openPlacement('dev098-ref-child');
    if (await trackingRow.getAttribute('data-task-details-readonly') !== 'true') throw new Error('tracking viewer details not readonly');
    if (await trackingRow.locator('[data-task-details-subtask-create="true"]').count() !== 0) throw new Error('tracking empty/create boundary leaked CTA');
    return { primaryReadonly: true, trackingReadonly: true, mutationCtaHidden: true };
  });

  await run('B16-layout-error-sweep', async () => {
    await close().catch(() => {});
    const viewports = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 844 }];
    const layouts = [];
    for (const viewport of viewports) {
      await seed({ viewport });
      const modal = await openPlacement('primary:dev098-parent');
      const layout = await modal.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, bodyScrollWidth: document.body.scrollWidth, bodyClientWidth: document.body.clientWidth }));
      if (layout.scrollWidth > layout.clientWidth + 1 || layout.bodyScrollWidth > layout.bodyClientWidth + 1) throw new Error('horizontal overflow at ' + JSON.stringify(viewport));
      layouts.push({ viewport, layout });
      await close();
    }
    return { viewports: layouts, diagnostics: diagnostics.length };
  });
  try { await close(); } catch {}
  const pass = cases.filter(item => item.status === 'PASS').length;
  const fail = cases.length - pass;
  const artifact = { dev: 'DEV-098', revision: 'working-tree', status: fail === 0 && diagnostics.length === 0 ? 'PASS' : 'FAIL', cases, diagnostics, summary: { pass, fail, diagnostics: diagnostics.length } };
  await page.evaluate(value => { window.__DEV098_ARTIFACT = value; }, artifact);
  await page.screenshot({ path: outputDir + '/B16-layout-error-sweep.png', fullPage: false });
  if (fail > 0 || diagnostics.length > 0) throw new Error(JSON.stringify(artifact));
  return artifact;
}
