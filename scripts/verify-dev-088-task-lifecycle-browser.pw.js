/* eslint-disable */
async (page) => {
const baseUrl = page.url().split('/').slice(0, 3).join('/');
  const consoleErrors = [];
  const pageErrors = [];
  const responseErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const seedSession = async () => page.evaluate(({ account }) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
  }, { account });
  const waitForApp = async () => {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };
  const reloadInto = async (view) => {
    await page.evaluate(viewName => localStorage.setItem('projed-last-view', viewName), view);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();
  };
  const targetCard = () => page.locator('.kanban-task-card[data-task-id="dev088-parent"]').first();
  const archiveFromContextMenu = async () => {
    await page.waitForTimeout(500);
    const diagnostics = await page.evaluate(() => ({
      view: localStorage.getItem('projed-last-view'),
      storedNode: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev088-parent'] || null,
      renderedIds: Array.from(document.querySelectorAll('.kanban-task-card[data-task-id]')).map(item => item.getAttribute('data-task-id')),
      bodyText: document.body.innerText.slice(0, 500),
    }));
    assert(diagnostics.storedNode, 'archive fixture must remain in local storage after reload', diagnostics);
    assert(diagnostics.renderedIds.includes('dev088-parent'), 'archive fixture must render as a kanban card', diagnostics);
    await targetCard().scrollIntoViewIfNeeded();
    await targetCard().waitFor({ state: 'visible', timeout: 10000 });
    await targetCard().click({ button: 'right' });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    const menuText = await menu.innerText();
    assert(menuText.includes('封存任務'), 'active task menu must expose archive', { menuText });
    assert(!menuText.includes('刪除任務') && !menuText.includes('永久刪除'), 'active task menu must not expose delete', { menuText });
    await menu.locator('[data-task-action-id="task.archive"]').click();
    await targetCard().waitFor({ state: 'hidden', timeout: 10000 });
  };
  const storageSnapshot = async () => page.evaluate(() => ({
    nodes: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'),
    dependencies: JSON.parse(localStorage.getItem('projed-local-test.dependencies') || '[]'),
  }));
  const assertNoHorizontalOverflow = async label => {
    const result = await page.evaluate(() => ({
      body: [document.body.scrollWidth, document.body.clientWidth],
      root: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    }));
    assert(result.body[0] <= result.body[1] + 1 && result.root[0] <= result.root[1] + 1, `${label} horizontal overflow`, result);
  };

  let step = 'reset local app';
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto(`${baseUrl}/?qcReset=1&qcSize=18`, { waitUntil: 'domcontentloaded' });
    await waitForApp();
    await seedSession();
    await page.evaluate(() => window.history.replaceState(null, '', '/'));
    const target = await page.evaluate(() => {
      const workspaces = JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]');
      const workspaceId = localStorage.getItem('projed-last-ws');
      const boardId = localStorage.getItem('projed-last-board');
      const workspace = workspaces.find(item => item.id === workspaceId);
      const board = workspace?.boards?.find(item => item.id === boardId);
      return { workspaceId, boardId, boardTitle: board?.title || '' };
    });
    assert(target.workspaceId && target.boardId, 'local target must exist', target);

    step = 'seed lifecycle subtree and dependency';
    await page.evaluate(({ target }) => {
      const now = Date.now();
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      const existingGroup = Object.values(nodes)
        .filter(node => node && node.boardId === target.boardId && node.parentId == null && !node.isArchived)
        .sort((left, right) => (left.order || 0) - (right.order || 0))[0];
      const group = existingGroup || {
        id: 'dev088-group', workspaceId: target.workspaceId, boardId: target.boardId,
        parentId: null, title: 'DEV-088 lifecycle', status: 'todo', nodeType: 'group', order: 0,
        createdAt: now, updatedAt: now,
      };
      nodes[group.id] = group;
      nodes['dev088-parent'] = {
        ...group, id: 'dev088-parent', parentId: group.id, title: 'DEV-088 parent', nodeType: 'task', order: 0,
      };
      nodes['dev088-child'] = {
        ...group, id: 'dev088-child', parentId: 'dev088-parent', title: 'DEV-088 child', nodeType: 'task', order: 0,
      };
      nodes['dev088-external'] = {
        ...group, id: 'dev088-external', parentId: group.id, title: 'DEV-088 external', nodeType: 'task', order: 1,
      };
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      const dependencies = JSON.parse(localStorage.getItem('projed-local-test.dependencies') || '[]')
        .filter(item => item.id !== 'dev088-dependency');
      dependencies.push({
        id: 'dev088-dependency', fromId: 'dev088-parent', fromSide: 'end',
        toId: 'dev088-external', toSide: 'start', offset: 0,
      });
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify(dependencies));
      localStorage.setItem('projed-last-view', 'board');
    }, { target });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();

    step = 'complete and cancel completion';
    await targetCard().click();
    const taskDetails = page.locator('[data-task-details-modal="true"]');
    await taskDetails.waitFor({ state: 'visible', timeout: 10000 });
    const statusSelect = taskDetails.locator('[data-task-details-meta-field="status"] select');
    await statusSelect.selectOption('completed');
    await page.waitForFunction(() => {
      const node = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev088-parent'];
      return node?.status === 'completed' && !node?.isArchived;
    }, { timeout: 10000 });
    await statusSelect.selectOption('todo');
    await page.waitForFunction(() => {
      const node = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev088-parent'];
      return node?.status === 'todo' && !node?.isArchived;
    }, { timeout: 10000 });
    await taskDetails.locator('button[aria-label="關閉任務詳情"]').click();
    await taskDetails.waitFor({ state: 'detached', timeout: 10000 });

    step = 'archive from active task menu';
    await archiveFromContextMenu();
    let snapshot = await storageSnapshot();
    assert(snapshot.nodes['dev088-parent']?.isArchived === true, 'archive must persist isArchived', snapshot.nodes['dev088-parent']);
    assert(snapshot.dependencies.some(item => item.id === 'dev088-dependency'), 'archive must preserve dependency', snapshot.dependencies);

    step = 'restore from recycle bin';
    await reloadInto('recycle_bin');
    const bin = page.locator('[data-recycle-bin-view="current-board"]');
    await bin.waitFor({ state: 'visible', timeout: 10000 });
    assert((await bin.innerText()).includes('封存任務'), 'recycle bin must use archive terminology');
    const restoreButton = page.getByRole('button', { name: '還原任務 DEV-088 parent' });
    const permanentButton = page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' });
    assert(await restoreButton.count() === 1 && await permanentButton.count() === 1, 'recycle actions need accessible names');
    await page.screenshot({ path: 'output/playwright/dev-088-task-lifecycle/desktop-recycle-bin.png', fullPage: false });
    await restoreButton.click();
    await restoreButton.waitFor({ state: 'hidden', timeout: 10000 });
    snapshot = await storageSnapshot();
    assert(snapshot.nodes['dev088-parent']?.isArchived === false, 'restore must clear isArchived', snapshot.nodes['dev088-parent']);
    assert(snapshot.dependencies.some(item => item.id === 'dev088-dependency'), 'restore must keep original dependency', snapshot.dependencies);

    step = 'archive again and verify mobile recycle bin';
    await reloadInto('board');
    await archiveFromContextMenu();
    await reloadInto('recycle_bin');
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow('mobile recycle bin');
    assert(await page.getByRole('button', { name: '還原任務 DEV-088 parent' }).count() === 1, 'mobile restore control must remain accessible');
    assert(await page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' }).count() === 1, 'mobile permanent delete control must remain accessible');
    await page.screenshot({ path: 'output/playwright/dev-088-task-lifecycle/mobile-recycle-bin.png', fullPage: false });

    step = 'cancel permanent delete';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' }).click();
    const dialog = page.locator('.global-dialog-content');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const dialogText = await dialog.innerText();
    assert(dialogText.includes('DEV-088 parent') && dialogText.includes('1 個子任務') && dialogText.includes('無法復原'), 'permanent delete confirm must name scope and risk', { dialogText });
    await dialog.getByText('取消', { exact: true }).click();
    snapshot = await storageSnapshot();
    assert(snapshot.nodes['dev088-parent'] && snapshot.nodes['dev088-child'], 'cancel must keep complete subtree');

    step = 'persistence failure keeps archived item';
    await page.evaluate(async () => {
      const { dependencyService } = await import('/src/services/dataBackend.ts');
      const originalDelete = dependencyService.delete;
      window.__DEV088_RESTORE_DEPENDENCY_DELETE = () => {
        dependencyService.delete = originalDelete;
        delete window.__DEV088_RESTORE_DEPENDENCY_DELETE;
      };
      dependencyService.delete = async () => {
        throw new Error('DEV-088 injected persistence failure');
      };
    });
    try {
      await page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' }).click();
      await dialog.waitFor({ state: 'visible', timeout: 10000 });
      await dialog.getByText('確認', { exact: true }).click();
      await page.getByText('DEV-088 injected persistence failure', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
      snapshot = await storageSnapshot();
      assert(snapshot.nodes['dev088-parent'] && snapshot.nodes['dev088-child'], 'persistence failure must keep archived subtree');
      assert(snapshot.dependencies.some(item => item.id === 'dev088-dependency'), 'persistence failure must keep dependency');
      assert(await page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' }).count() === 1, 'persistence failure must keep recycle-bin item visible');
    } finally {
      await page.evaluate(() => window.__DEV088_RESTORE_DEPENDENCY_DELETE?.());
    }

    step = 'confirm permanent delete and reload';
    await page.getByRole('button', { name: '永久刪除任務 DEV-088 parent' }).click();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.getByText('確認', { exact: true }).click();
    await page.waitForFunction(() => {
      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      const dependencies = JSON.parse(localStorage.getItem('projed-local-test.dependencies') || '[]');
      return !nodes['dev088-parent'] && !nodes['dev088-child'] && !dependencies.some(item => item.id === 'dev088-dependency');
    }, { timeout: 10000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();
    snapshot = await storageSnapshot();
    assert(!snapshot.nodes['dev088-parent'] && !snapshot.nodes['dev088-child'], 'permanent delete must survive reload', snapshot.nodes);
    assert(!snapshot.dependencies.some(item => item.id === 'dev088-dependency'), 'permanent delete must remove dependency', snapshot.dependencies);

    step = 'visible error sweep';
    await page.waitForTimeout(1200);
    const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allInnerTexts();
    assert(visibleErrors.length === 0, 'unexpected visible errors', { visibleErrors });
    assert(consoleErrors.length === 0 && pageErrors.length === 0 && responseErrors.length === 0, 'browser diagnostics must be clean', {
      consoleErrors, pageErrors, responseErrors,
    });

    const artifact = {
      result: 'PASS', viewport: ['1440x900', '390x844'], target,
      completionRoundTrip: true, archiveDependencyPreserved: true,
      failureKeepsArchivedItem: true, permanentDeleteCount: 2,
      screenshots: [
        'output/playwright/dev-088-task-lifecycle/desktop-recycle-bin.png',
        'output/playwright/dev-088-task-lifecycle/mobile-recycle-bin.png',
      ],
      consoleErrors, pageErrors, responseErrors,
    };
    await page.evaluate(value => { window.__DEV088_ARTIFACT = value; }, artifact);
    return artifact;
  } catch (error) {
    throw new Error(`DEV-088 browser failed at ${step}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
