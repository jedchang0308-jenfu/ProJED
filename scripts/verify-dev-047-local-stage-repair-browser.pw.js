/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const seedSession = () => page.evaluate(() => {
    const account = {
      id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
      displayName: 'ProJED local QA', createdAt: 1704067200000,
    };
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
  });

  const openSettings = async () => {
    const settings = page.locator('[data-sidebar-settings-button="true"]').first();
    if (await settings.count() === 0) await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    await page.locator('[data-sidebar-settings-button="true"]').first().click();
    await page.locator('[data-backup-settings-section="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await seedSession();
  await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=12', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined);
  await seedSession();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });

  const fixture = await page.evaluate(() => {
    const workspaces = JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]');
    const workspaceId = localStorage.getItem('projed-last-ws');
    const boardId = localStorage.getItem('projed-last-board');
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const rootId = 'list_legacy-stage';
    const legacyStageTaskId = 'task_legacy-stage';
    const missingStageTaskId = 'task_missing-stage';
    const archivedOrphanTaskId = 'task_archived-orphan';
    const now = Date.now();
    nodes[rootId] = {
      id: rootId, workspaceId, boardId, parentId: null, title: 'Legacy stage',
      status: 'todo', nodeType: 'group', order: 999, createdAt: now, updatedAt: now,
    };
    nodes[legacyStageTaskId] = {
      id: legacyStageTaskId, workspaceId, boardId, parentId: rootId, title: 'Legacy stage task',
      status: 'todo', nodeType: 'task', kanbanStageId: 'legacy-stage', order: 999,
      createdAt: now, updatedAt: now,
    };
    nodes[missingStageTaskId] = {
      id: missingStageTaskId, workspaceId, boardId, parentId: rootId, title: 'Recoverable stage task',
      status: 'todo', nodeType: 'task', kanbanStageId: 'missing-stage', order: 1000,
      createdAt: now, updatedAt: now,
    };
    nodes[archivedOrphanTaskId] = {
      id: archivedOrphanTaskId, workspaceId, boardId, parentId: 'deleted-parent', title: 'Archived orphan task',
      status: 'todo', nodeType: 'task', isArchived: false, order: 1001,
      createdAt: now, updatedAt: now,
    };
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    return { workspaceId, boardId, rootId, legacyStageTaskId, missingStageTaskId, archivedOrphanTaskId };
  });

  await page.evaluate(() => window.history.replaceState(null, '', '/?qcSize=12'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await openSettings();
  await page.locator('[data-backup-export-counts="true"]').waitFor({ state: 'visible', timeout: 15000 });

  const panelText = await page.locator('[data-backup-export-panel="true"]').innerText();
  const persisted = await page.evaluate(({ rootId, legacyStageTaskId, missingStageTaskId, archivedOrphanTaskId }) => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return {
      legacyStage: nodes[legacyStageTaskId]?.kanbanStageId,
      missingStage: nodes[missingStageTaskId]?.kanbanStageId,
      orphanParent: nodes[archivedOrphanTaskId]?.parentId,
      orphanArchived: nodes[archivedOrphanTaskId]?.isArchived,
      rootId,
    };
  }, fixture);
  assert(!panelText.includes('失敗'), 'local all-board export should not report a stage failure', { panelText });
  assert(persisted.legacyStage === fixture.rootId, 'raw legacy stage ID should be normalized', persisted);
  assert(persisted.missingStage === fixture.rootId, 'recoverable missing stage should use the root group', persisted);
  assert(persisted.orphanArchived === true, 'missing-parent local node should be marked archived', persisted);
  console.log('DEV-047 local stage repair browser: PASS', { fixture, persisted });
}
