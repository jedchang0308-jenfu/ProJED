/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-109-meeting-live-task-change-capture';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) httpFailures.push(`${response.status()} ${response.url()}`);
  });
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const account = { id: 'dev109-browser-user', uid: 'dev109-browser-user', email: 'dev109-browser@projed.local', displayName: 'DEV-109 QA', createdAt: 1704067200000 };
  const workspace = {
    id: 'dev109-browser-workspace', title: 'DEV-109 即時捕捉', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev109-browser-board', title: 'DEV-109 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const node = {
    id: 'dev109-browser-task', workspaceId: workspace.id, boardId: workspace.boards[0].id, parentId: null,
    title: 'DEV-109 測試任務', status: 'todo', nodeType: 'task', order: 0, description: '',
    detailNotes: [{ id: 'note_default', title: '任務目的', content: '' }], createdAt: 1704067200000, updatedAt: 1704067200000,
  };
  const seed = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, node }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({ [node.id]: node }));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:${workspace.boards[0].id}`]: [{ userId: account.id, role: 'owner' }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, node });
    await page.reload({ waitUntil: 'networkidle' });
    const fixedTestButton = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedTestButton.count() && await fixedTestButton.isVisible().catch(() => false)) {
      await fixedTestButton.click({ force: true });
      await page.waitForTimeout(250);
    }
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const runCase = async (id, expected, flow) => {
    const started = Date.now();
    try {
      const actual = await flow();
      cases.push({ id, status: 'PASS', expected, actual, durationMs: Date.now() - started });
      return actual;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cases.push({ id, status: 'FAIL', expected, failure: message, durationMs: Date.now() - started });
      await page.screenshot({ path: `${OUTPUT_DIR}/${id}-failure.png`, fullPage: false }).catch(() => undefined);
      throw new Error(`${id}: ${message}`);
    }
  };

  await seed();
  await runCase('B01', 'meeting mode opens with a separate import action', async () => {
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.locator('[data-meeting-import-trigger]').waitFor({ state: 'visible', timeout: 10000 });
    const editor = page.locator('[data-record-content-editor]');
    assert(await editor.count() === 1, 'meeting content editor should be present');
    assert((await page.locator('[data-meeting-import-trigger]').textContent())?.trim() === '匯入專案變化', 'history import remains explicit');
    return { meeting: 1, importControl: 1 };
  });

  let modal;
  await runCase('B02', 'task mutation after save is projected into the current editor', async () => {
    await page.getByRole('button', { name: /DEV-109 測試任務/ }).click();
    modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const note = modal.locator('[data-task-detail-note-content-input]');
    await note.fill('DEV109-BROWSER-LIVE-CAPTURE');
    await note.press('Tab');
    const editor = page.locator('[data-record-content-editor]');
    await page.waitForFunction(() => document.querySelector('[data-record-content-editor]')?.textContent?.includes('DEV109-BROWSER-LIVE-CAPTURE') || false, { timeout: 10000 });
    const text = await editor.textContent();
    assert(text?.includes('會中變更'), 'editor should contain the live system line', { text });
    assert(text?.includes('DEV109-BROWSER-LIVE-CAPTURE'), 'editor should contain the changed fragment', { text });
    return { projected: true, linkedTask: (await page.locator('[data-record-composer-shell]').textContent())?.includes('已連結 1 個任務') || false };
  });

  await runCase('B03', 'net no-op removes the live projection after the task is restored', async () => {
    const note = modal.locator('[data-task-detail-note-content-input]');
    await note.click();
    await note.press('ControlOrMeta+A');
    await note.press('Backspace');
    await note.press('Tab');
    await page.waitForFunction(() => !(document.querySelector('[data-record-content-editor]')?.textContent || '').includes('DEV109-BROWSER-LIVE-CAPTURE'), { timeout: 10000 });
    const text = await page.locator('[data-record-content-editor]').textContent();
    assert(!text?.includes('會中變更'), 'net no-op should remove the system line', { text });
    return { netNoop: true };
  });

  await runCase('B04', 'browser surface stays free of runtime and network errors', async () => {
    const health = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(health.scrollWidth <= health.width + 1, 'meeting surface should not overflow', health);
    assert(diagnostics.length === 0, 'no browser runtime errors expected', { diagnostics });
    assert(httpFailures.length === 0, 'no HTTP failures expected', { httpFailures });
    return { health, diagnostics, httpFailures };
  });

  const artifact = { devId: 'DEV-109', status: 'PASS', sourceRevision: 'working-tree', environment: 'local-test-browser', cases, diagnostics, httpFailures, generatedAt: new Date().toISOString() };
  await page.evaluate(result => { window.__DEV109_ARTIFACT = result; }, artifact);
}
