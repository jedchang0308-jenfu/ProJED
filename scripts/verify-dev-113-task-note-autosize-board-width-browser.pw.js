/* eslint-disable */
async (page) => {
  const result = {
    devId: 'DEV-113',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    viewport: { width: 1440, height: 1000 },
    cases: [],
    screenshots: {},
    browserErrors: [],
  };
  const failures = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  page.on('console', message => {
    if (message.type() === 'error') result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev113-workspace',
    title: 'DEV-113 任務說明尺寸驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'dev113-board', title: 'DEV-113 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const nodes = {
    'dev113-root': {
      id: 'dev113-root', workspaceId: workspace.id, boardId: 'dev113-board', parentId: null,
      title: 'DEV-113 根任務', status: 'todo', nodeType: 'group', order: 0,
      createdAt: 1704067200000, updatedAt: 1704067200000,
    },
    'dev113-task': {
      id: 'dev113-task', workspaceId: workspace.id, boardId: 'dev113-board', parentId: 'dev113-root',
      title: '任務說明尺寸測試', status: 'todo', nodeType: 'task', order: 0,
      detailNotes: [{ id: 'note_default', title: '任務說明', content: '' }], description: '',
      createdAt: 1704067200000, updatedAt: 1704067200000,
    },
  };

  const geometry = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      scrollHeight: element.scrollHeight,
      styleWidth: element.style.width,
      resize: getComputedStyle(element).resize,
    };
  });
  const openModal = async () => {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev113-task' } })));
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const editor = modal.locator('[data-task-detail-note-content-input="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    return { modal, editor };
  };

  await page.setViewportSize(result.viewport);
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev113-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });

  const { modal, editor } = await openModal();
  await page.waitForTimeout(300);
  const initial = await geometry(editor);
  record('B01 compact-empty-editor', initial.height <= 40 && initial.scrollHeight === initial.height, { initial });
  record('B04 native-horizontal-resize-contract', initial.resize === 'horizontal', { initial });

  await editor.click();
  await page.keyboard.type('第一行：驗證自動增高\n第二行：保留寬度偏好\n第三行：內容完整可見');
  await page.waitForTimeout(400);
  const expanded = await geometry(editor);
  record('B02-content-auto-grows', expanded.height > initial.height && expanded.scrollHeight === expanded.height, { initial, expanded });

  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);
  const cleared = await geometry(editor);
  record('B03-clear-returns-to-one-line', cleared.height <= 40 && cleared.scrollHeight === cleared.height, { cleared });

  const beforeResize = await geometry(editor);
  const resizeStart = { x: beforeResize.x + beforeResize.width - 2, y: beforeResize.y + beforeResize.height - 2 };
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x - 160, resizeStart.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterResize = await geometry(editor);
  const storedWidth = await page.evaluate(() => {
    const map = JSON.parse(localStorage.getItem('projed.taskDetailNote.widths.v1') || '{}');
    return Number(map['dev113-board']);
  });
  record('B04-user-resize-changes-width', afterResize.width < beforeResize.width - 50, { beforeResize, afterResize });
  record('B05-width-persisted-by-board', Number.isFinite(storedWidth) && storedWidth >= 240, { storedWidth, afterResize });

  await editor.click();
  await page.keyboard.type('內容變更後仍完整顯示');
  await page.waitForTimeout(400);
  const afterContentChange = await geometry(editor);
  record('B06-content-change-preserves-user-width', Math.abs(afterContentChange.width - afterResize.width) <= 2
    && afterContentChange.height >= cleared.height, { afterResize, afterContentChange });

  await modal.locator('button[aria-label="關閉任務詳情"]').click();
  await modal.waitFor({ state: 'hidden', timeout: 10000 });
  const reopened = await openModal();
  await page.waitForTimeout(300);
  const reopenedGeometry = await geometry(reopened.editor);
  record('B05-reopen-restores-board-width', Math.abs(reopenedGeometry.width - storedWidth) <= 2, { reopenedGeometry, storedWidth });

  result.screenshots.compact = 'output/playwright/dev-113-task-note-autosize-board-width/compact.png';
  await page.screenshot({ path: result.screenshots.compact, fullPage: false });
  result.status = failures.length === 0 && result.browserErrors.length === 0 ? 'PASS' : 'FAIL';
  result.failures = failures;
  await page.evaluate(() => localStorage.removeItem('projed.taskDetailNote.widths.v1'));
  await page.evaluate(value => { window.__DEV113_ARTIFACT = value; }, result);
  if (failures.length > 0 || result.browserErrors.length > 0) {
    throw new Error(`DEV-113 browser verification failed: ${JSON.stringify({ failures, browserErrors: result.browserErrors })}`);
  }
  console.log(JSON.stringify(result, null, 2));
}
