/* eslint-disable */
async (page) => {
  const result = {
    devId: 'DEV-113',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    viewport: { width: 1440, height: 1000 },
    comparisonViewport: { width: 808, height: 698 },
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
      detailNotes: [
        { id: 'note_default', title: '任務目的', content: '' },
        { id: 'note_secondary', title: '備註', content: '' },
      ], description: '',
      createdAt: 1704067200000, updatedAt: 1704067200000,
    },
    'dev113-task-other': {
      id: 'dev113-task-other', workspaceId: workspace.id, boardId: 'dev113-board', parentId: 'dev113-root',
      title: '另一個任務', status: 'todo', nodeType: 'task', order: 1,
      detailNotes: [{ id: 'note_default', title: '任務目的', content: '' }], description: '',
      createdAt: 1704067200000, updatedAt: 1704067200000,
    },
  };

  const geometry = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      styleWidth: element.style.width,
      resize: getComputedStyle(element).resize,
      overflowY: getComputedStyle(element).overflowY,
    };
  });
  const openModal = async (taskId = 'dev113-task') => {
    await page.evaluate(id => document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: id } })), taskId);
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const editor = modal.locator('[data-task-detail-note-content-input="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    const resizeHandle = modal.locator('[data-task-note-resize-handle="bottom-edge"]').first();
    await resizeHandle.waitFor({ state: 'visible', timeout: 10000 });
    return { modal, editor, resizeHandle };
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

  const { modal, editor, resizeHandle } = await openModal();
  await page.waitForTimeout(300);
  const initial = await geometry(editor);
  record('B01 compact-empty-editor', initial.height <= 40 && initial.scrollHeight === initial.height, { initial });
  record('B04 native-horizontal-resize-removed', initial.resize === 'none' && initial.styleWidth === '', { initial });
  const initialHandle = await resizeHandle.boundingBox();
  record('B04 full-bottom-edge-handle', Boolean(initialHandle)
    && initialHandle.width >= initial.width - 2
    && Math.abs(initialHandle.y + initialHandle.height / 2 - (initial.y + initial.height)) <= 6,
  { initial, initialHandle });

  await editor.click();
  await page.keyboard.type('第一行：驗證自動增高\n第二行：保留高度偏好\n第三行：內容完整可見');
  await page.waitForTimeout(400);
  const expanded = await geometry(editor);
  record('B02-content-auto-grows', expanded.height > initial.height && expanded.scrollHeight === expanded.height, { initial, expanded });

  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);
  const cleared = await geometry(editor);
  record('B03-clear-returns-to-one-line', cleared.height <= 40 && cleared.scrollHeight === cleared.height, { cleared });

  await editor.click();
  await page.keyboard.type('第一行：保留內容\n第二行：建立捲動範圍\n第三行：仍可閱讀\n第四行：手動高度優先\n第五行：驗證捲軸\n第六行：完整內容');
  await page.waitForTimeout(400);
  const beforeCompact = await geometry(editor);
  let handleBox = await resizeHandle.boundingBox();
  const compactStart = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(compactStart.x, compactStart.y);
  await page.mouse.down();
  await page.mouse.move(compactStart.x, compactStart.y - 96, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const compacted = await geometry(editor);
  record('B04-manual-height-can-be-smaller-than-content', compacted.height < beforeCompact.height - 60
    && compacted.scrollHeight > compacted.clientHeight
    && compacted.overflowY === 'auto'
    && Math.abs(compacted.width - beforeCompact.width) <= 2, { beforeCompact, compacted });
  result.screenshots.compactedScroll = 'output/playwright/dev-113-task-note-autosize-board-width/compacted-scroll.png';
  await editor.hover();
  await page.screenshot({ path: result.screenshots.compactedScroll, fullPage: false });

  const beforeResize = await geometry(editor);
  handleBox = await resizeHandle.boundingBox();
  const resizeStart = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x, resizeStart.y + 84, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterResize = await geometry(editor);
  record('B04-user-resize-changes-height-only', afterResize.height > beforeResize.height + 60
    && Math.abs(afterResize.width - beforeResize.width) <= 2, { beforeResize, afterResize });

  handleBox = await resizeHandle.boundingBox();
  const leftEdgeStart = { x: handleBox.x + 8, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(leftEdgeStart.x, leftEdgeStart.y);
  await page.mouse.down();
  await page.mouse.move(leftEdgeStart.x, leftEdgeStart.y + 24, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const afterLeftEdgeResize = await geometry(editor);

  handleBox = await resizeHandle.boundingBox();
  const rightEdgeStart = { x: handleBox.x + handleBox.width - 8, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(rightEdgeStart.x, rightEdgeStart.y);
  await page.mouse.down();
  await page.mouse.move(rightEdgeStart.x, rightEdgeStart.y + 24, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const afterRightEdgeResize = await geometry(editor);
  record('B04-entire-bottom-edge-is-draggable', afterLeftEdgeResize.height > afterResize.height + 12
    && afterRightEdgeResize.height > afterLeftEdgeResize.height + 12, {
    afterResize, afterLeftEdgeResize, afterRightEdgeResize,
  });

  await resizeHandle.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const afterKeyboardResize = await geometry(editor);
  record('B04-keyboard-resize', afterKeyboardResize.height >= afterRightEdgeResize.height + 10, {
    afterRightEdgeResize, afterKeyboardResize,
  });

  const storedPreference = await page.evaluate(() => {
    const map = JSON.parse(localStorage.getItem('projed.taskDetailNote.heights.v2') || '{}');
    const scopeKey = ['local-test-user', 'dev113-task', 'note_default'].map(encodeURIComponent).join(':');
    return { storedHeight: Number(map[scopeKey]), scopeKey, storedKeys: Object.keys(map) };
  });
  const { storedHeight } = storedPreference;
  record('B05-height-persisted-by-account-task-note', Number.isFinite(storedHeight)
    && Math.abs(storedHeight - afterKeyboardResize.height) <= 2
    && storedPreference.storedKeys.length === 1
    && storedPreference.storedKeys[0] === storedPreference.scopeKey,
  { storedPreference, afterKeyboardResize });

  const secondaryEditor = modal.locator('[data-task-detail-note-content-input="true"]').nth(1);
  const secondaryGeometry = await geometry(secondaryEditor);
  record('B05-other-note-keeps-independent-height', secondaryGeometry.height <= 40
    && Math.abs(secondaryGeometry.height - storedHeight) > 2,
  { secondaryGeometry, storedHeight });

  await editor.click();
  await page.keyboard.type('內容變更後仍完整顯示');
  await page.waitForTimeout(400);
  const afterContentChange = await geometry(editor);
  record('B06-content-change-preserves-user-height', Math.abs(afterContentChange.height - storedHeight) <= 2
    && Math.abs(afterContentChange.width - afterResize.width) <= 2, { storedHeight, afterResize, afterContentChange });

  await modal.locator('button[aria-label="關閉任務詳情"]').click();
  await modal.waitFor({ state: 'hidden', timeout: 10000 });
  const reopened = await openModal();
  await page.waitForTimeout(300);
  const reopenedGeometry = await geometry(reopened.editor);
  record('B05-reopen-restores-task-note-height', Math.abs(reopenedGeometry.height - storedHeight) <= 2, { reopenedGeometry, storedHeight });

  result.screenshots.compact = 'output/playwright/dev-113-task-note-autosize-board-width/compact.png';
  await page.screenshot({ path: result.screenshots.compact, fullPage: false });
  await page.setViewportSize(result.comparisonViewport);
  await page.waitForTimeout(250);
  await reopened.resizeHandle.hover();
  const comparisonGeometry = await geometry(reopened.editor);
  const comparisonHandle = await reopened.resizeHandle.boundingBox();
  const comparisonDocumentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  record('B07-comment-viewport-bottom-edge', comparisonDocumentWidth === result.comparisonViewport.width
    && Boolean(comparisonHandle)
    && comparisonHandle.width >= comparisonGeometry.width - 2,
  { comparisonGeometry, comparisonHandle, comparisonDocumentWidth });
  result.screenshots.bottomEdge = 'output/playwright/dev-113-task-note-autosize-board-width/bottom-edge-hover-808x698.png';
  await page.screenshot({ path: result.screenshots.bottomEdge, fullPage: false });
  await reopened.modal.locator('button[aria-label="關閉任務詳情"]').click();
  await reopened.modal.waitFor({ state: 'hidden', timeout: 10000 });
  const otherTask = await openModal('dev113-task-other');
  await page.waitForTimeout(300);
  const otherTaskGeometry = await geometry(otherTask.editor);
  record('B05-other-task-keeps-independent-height', otherTaskGeometry.height <= 40
    && Math.abs(otherTaskGeometry.height - storedHeight) > 2,
  { otherTaskGeometry, storedHeight });
  result.status = failures.length === 0 && result.browserErrors.length === 0 ? 'PASS' : 'FAIL';
  result.failures = failures;
  await page.evaluate(() => {
    localStorage.removeItem('projed.taskDetailNote.heights.v1');
    localStorage.removeItem('projed.taskDetailNote.heights.v2');
  });
  await page.evaluate(value => { window.__DEV113_ARTIFACT = value; }, result);
  if (failures.length > 0 || result.browserErrors.length > 0) {
    throw new Error(`DEV-113 browser verification failed: ${JSON.stringify({ failures, browserErrors: result.browserErrors })}`);
  }
  console.log(JSON.stringify(result, null, 2));
}
