/* eslint-disable */
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const taskId = 'note-deletion-task';
  const accountId = 'local-test-user';
  const initialText = '保留文字ABC';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The release runner supplies an isolated URL; keep the regression portable
  // across that dynamic port and the fixed local test server.
  const runnerUrl = new URL(page.url());
  runnerUrl.pathname = '/';
  runnerUrl.search = '';
  runnerUrl.hash = '';
  await page.goto(runnerUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ taskId, accountId, initialText }) => {
    localStorage.clear();
    const timestamp = 1704067200000;
    localStorage.setItem('projed-local-test.selected-account', accountId);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: accountId, email: 'test@projed.local', displayName: 'Local test', createdAt: timestamp,
    }));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([{
      id: 'deletion-ws', title: 'Deletion test', ownerId: accountId, members: [accountId],
      order: 1, createdAt: timestamp,
      boards: [{ id: 'deletion-board', title: 'Test', dependencies: [], order: 1, createdAt: timestamp }],
    }]));
    const common = { workspaceId: 'deletion-ws', boardId: 'deletion-board', status: 'todo', order: 0, createdAt: timestamp, updatedAt: timestamp };
    localStorage.setItem('projed-local-test.nodes', JSON.stringify({
      'deletion-root': { ...common, id: 'deletion-root', parentId: null, title: 'Test group', nodeType: 'group' },
      [taskId]: {
        ...common, id: taskId, parentId: 'deletion-root', title: 'Deletion test task', nodeType: 'task',
        description: initialText,
        detailNotes: [
          { id: 'note_default', title: '任務目的', content: initialText },
          { id: 'extra-note', title: '備註', content: initialText },
        ],
      },
    }));
    for (const key of ['dependencies', 'tags']) localStorage.setItem('projed-local-test.' + key, '[]');
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', 'deletion-ws');
    localStorage.setItem('projed-last-board', 'deletion-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { taskId, accountId, initialText });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible' });
  const modal = page.locator('[data-task-details-modal="true"]');
  const editors = modal.locator('[data-task-detail-note-content-input="true"]');
  const open = async () => {
    await page.evaluate(taskId => document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId } })), taskId);
    await editors.nth(1).waitFor({ state: 'visible' });
  };
  const close = async () => {
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'hidden' });
  };
  const readTask = () => page.evaluate(taskId => JSON.parse(localStorage.getItem('projed-local-test.nodes'))[taskId], taskId);
  await open();
  assert(await modal.getAttribute('data-pwa-task-details-state') === 'safe', 'Opening a legacy note must not mark it dirty');
  await editors.first().press('End');
  await editors.first().press('ArrowLeft');
  assert(await modal.getAttribute('data-pwa-task-details-state') === 'safe', 'Selection changes must not mark the task dirty');
  await editors.first().press('End');
  await editors.first().press('Backspace');
  await close();
  assert((await readTask()).description === '保留文字AB', 'Backspace deletion must persist on close');
  await open();
  assert(await editors.first().innerText() === '保留文字AB', 'Backspace deletion must survive reopening');
  await editors.first().press('Home');
  await editors.first().press('Delete');
  await close();
  assert((await readTask()).description === '留文字AB', 'Forward Delete must persist on close');
  await open();
  for (let index = 0; index < 2; index++) {
    await editors.nth(index).press('Control+a');
    await editors.nth(index).press('Backspace');
  }
  await close();
  const cleared = await readTask();
  assert(cleared.description === '', 'Clearing the purpose must persist an empty description');
  assert(cleared.detailNotes.every(note => note.content === ''), 'Clearing both notes must persist empty content');
  await page.reload({ waitUntil: 'networkidle' });
  await open();
  assert((await editors.first().innerText()).trim() === '', 'Empty purpose must survive page reload');
  assert((await editors.nth(1).innerText()).trim() === '', 'Empty extra note must survive page reload');
  await editors.first().pressSequentially('重新新增');
  await close();
  assert((await readTask()).description === '重新新增', 'Adding text after clearing must still persist');
  assert(errors.length === 0, 'Browser runtime errors: ' + errors.join('; '));
  await page.evaluate(() => {
    window.__DEV098_ARTIFACT = {
      dev: 'DEV-098',
      revision: 'working-tree',
      status: 'PASS',
      cases: [{ name: 'keyboard-deletion-persistence', status: 'PASS' }],
      diagnostics: 0,
      summary: { pass: 1, fail: 0, diagnostics: 0 },
    };
  });
  console.log('PASS: Backspace, Delete, clear both notes, reload, insertion, and no-op initialization/selection');
}
