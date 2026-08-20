/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push('console:error:' + message.text());
  });
  page.on('pageerror', error => diagnostics.push('pageerror:' + error.message));
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('https://example.com/dev066');
      return;
    }
    await dialog.dismiss();
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(details));
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev066-workspace',
    title: 'DEV-066 富文字工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev066-board', title: 'DEV-066 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };
  const textNode = (text, format = 0) => ({
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  });
  const element = (type, children, extra = {}) => ({
    children,
    direction: null,
    format: '',
    indent: 0,
    type,
    version: 1,
    ...extra,
  });
  const richContent = {
    schema: 'task-note.lexical-v1',
    editorState: {
      root: element('root', [
        element('heading', [textNode('桌機建立的小標題')], { tag: 'h3' }),
        element('paragraph', [
          textNode('保留粗體', 1),
          textNode('，以及 '),
          element('link', [textNode('規格連結')], { url: 'https://example.com/spec' }),
        ]),
        element('list', [
          element('listitem', [element('paragraph', [textNode('清單第一項')])], { value: 1 }),
          element('listitem', [element('paragraph', [textNode('清單第二項')])], { value: 2 }),
        ], { listType: 'bullet', start: 1, tag: 'ul' }),
      ]),
    },
  };
  const noteAPlain = '桌機建立的小標題\n保留粗體，以及 規格連結\n清單第一項\n清單第二項';
  const nodes = {
    'dev066-root': {
      id: 'dev066-root',
      workspaceId: workspace.id,
      boardId: 'dev066-board',
      parentId: null,
      title: 'DEV-066 測試欄位',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev066-task': {
      id: 'dev066-task',
      workspaceId: workspace.id,
      boardId: 'dev066-board',
      parentId: 'dev066-root',
      title: 'DEV-066 富文字任務',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      detailNotes: [
        { id: 'dev066-note-a', title: '格式備註', content: noteAPlain, richContent },
        { id: 'dev066-note-b', title: '第二則備註', content: '第二則純文字' },
      ],
      description: noteAPlain,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const readStoredTask = () => page.evaluate(() => {
    const storedNodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return storedNodes['dev066-task'];
  });
  const openModal = async () => {
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev066-task' } }));
    });
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    return modal;
  };
  const getGeometry = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const sameGeometry = (left, right) => (
    Math.abs(left.x - right.x) <= 0.5
    && Math.abs(left.y - right.y) <= 0.5
    && Math.abs(left.width - right.width) <= 0.5
    && Math.abs(left.height - right.height) <= 0.5
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev066-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });

  const modal = await openModal();
  await modal.locator('[data-task-note-editor-loaded="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
  assert(await modal.locator('[data-task-note-editor-loaded="true"]').count() === 2, 'desktop mounts one editor per note');
  assert(await modal.locator('[data-task-note-format-toggle="true"]').count() === 2, 'desktop shows one format toggle per note');
  assert(await modal.locator('[data-task-note-toolbar-popover="true"]').count() === 0, 'toolbar is closed by default');
  assert(await modal.locator('[data-task-note-mobile-append-input="true"]').count() === 0, 'desktop does not show mobile append field');

  const firstCard = modal.locator('[data-task-detail-note-card="true"]').first();
  const firstToggle = firstCard.locator('[data-task-note-format-toggle="true"]');
  const firstEditor = firstCard.locator('[data-task-detail-note-content-input="true"]');
  const modalBefore = await getGeometry(modal);
  const cardBefore = await getGeometry(firstCard);
  await firstToggle.click();
  const firstToolbar = modal.locator('[data-task-note-toolbar-popover="true"]');
  await firstToolbar.waitFor({ state: 'visible', timeout: 5000 });
  const modalAfter = await getGeometry(modal);
  const cardAfter = await getGeometry(firstCard);
  const firstToolbarBounds = await getGeometry(firstToolbar);
  const firstToggleBounds = await getGeometry(firstToggle);
  assert(sameGeometry(modalBefore, modalAfter), 'opening toolbar must not resize or move modal', { modalBefore, modalAfter });
  assert(sameGeometry(cardBefore, cardAfter), 'opening toolbar must not resize or move note card', { cardBefore, cardAfter });
  assert(firstToolbarBounds.x + firstToolbarBounds.width <= firstToggleBounds.x + 1, 'toolbar is positioned left of its format toggle', { firstToolbarBounds, firstToggleBounds });
  assert(Math.abs((firstToolbarBounds.y + firstToolbarBounds.height / 2) - (firstToggleBounds.y + firstToggleBounds.height / 2)) <= 1, 'toolbar is vertically aligned with header actions', { firstToolbarBounds, firstToggleBounds });
  assert(await firstToolbar.getByRole('button', { name: '粗體' }).count() === 1, 'toolbar exposes semantic formatting controls');
  assert((await firstToolbar.getByRole('button', { name: '本文' }).textContent())?.trim() === '本文', 'body style uses a direct visible label');
  assert((await firstToolbar.getByRole('button', { name: '小標題' }).textContent())?.trim() === '小標題', 'heading style uses a direct visible label');
  assert(await firstToolbar.getByRole('button', { name: '粗體' }).locator('svg').count() === 1, 'bold restores its familiar icon');
  assert(await firstToolbar.getByRole('button', { name: '斜體' }).locator('svg').count() === 1, 'italic restores its familiar icon');
  assert(await firstToolbar.getByRole('button', { name: '底線' }).locator('svg').count() === 1, 'underline restores its familiar icon');
  assert(await firstToolbar.getByRole('button', { name: '刪除線' }).locator('[data-task-note-strikethrough-icon="aa-line"]').count() === 1, 'strikethrough uses the Aa line icon instead of S');

  await firstEditor.click();
  await firstEditor.press('End');
  await firstEditor.type('持續編輯');
  assert(await firstToolbar.isVisible(), 'toolbar remains open while editing note content');
  await firstCard.locator('[data-task-detail-note-title-input="true"]').click();
  assert(await firstToolbar.isVisible(), 'toolbar remains open after clicking outside the editor and toolbar');
  await page.keyboard.press('Escape');
  assert(await firstToolbar.isVisible(), 'Escape does not close a persistent toolbar');
  await firstToggle.click();
  await firstToolbar.waitFor({ state: 'hidden', timeout: 5000 });
  await modal.waitFor({ state: 'visible', timeout: 5000 });

  const secondCard = modal.locator('[data-task-detail-note-card="true"]').nth(1);
  const secondEditor = secondCard.locator('[data-task-detail-note-content-input="true"]');
  await secondEditor.click();
  await secondEditor.press('Control+a');
  await secondCard.locator('[data-task-note-format-toggle="true"]').click();
  const secondToolbar = secondCard.locator('[data-task-note-toolbar-popover="true"]');
  await secondToolbar.getByRole('button', { name: '粗體' }).click();
  await page.waitForFunction(() => {
    const task = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev066-task'];
    const root = task?.detailNotes?.[1]?.richContent?.editorState?.root;
    return root?.children?.[0]?.children?.[0]?.format === 1;
  }, null, { timeout: 10000 });
  const storedAfterDesktop = await readStoredTask();
  assert(storedAfterDesktop.detailNotes[1].content === '第二則純文字', 'format-only change keeps plain alias');
  assert(storedAfterDesktop.detailNotes[1].richContent.editorState.root.children[0].children[0].format === 1, 'format-only change persists rich state');

  await secondToolbar.getByRole('button', { name: '小標題' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-task-detail-note-card="true"]')[1]?.querySelector('h3'));
  await secondToolbar.getByRole('button', { name: '項目清單' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-task-detail-note-card="true"]')[1]?.querySelector('ul'));
  await secondToolbar.getByRole('button', { name: '項目清單' }).click();
  await page.waitForFunction(() => !document.querySelectorAll('[data-task-detail-note-card="true"]')[1]?.querySelector('ul'));
  await secondToolbar.getByRole('button', { name: '連結' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-task-detail-note-card="true"]')[1]?.querySelector('a[href="https://example.com/dev066"]'));
  await secondToolbar.getByRole('button', { name: '清除格式' }).click();
  await page.waitForFunction(() => !document.querySelectorAll('[data-task-detail-note-card="true"]')[1]?.querySelector('a'));
  await secondEditor.click();
  await secondEditor.press('Control+a');
  await secondEditor.press('Control+b');
  await page.waitForFunction(() => {
    const task = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev066-task'];
    return task?.detailNotes?.[1]?.richContent?.editorState?.root?.children?.[0]?.children?.[0]?.format === 1;
  }, null, { timeout: 10000 });
  await secondEditor.press('Control+s');
  await modal.locator('[data-task-details-save-status="saved"]', { hasText: '已儲存' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: 'output/playwright/dev-066-task-note-desktop-1440.png', fullPage: true });

  if (await secondToolbar.count()) {
    await secondCard.locator('[data-task-note-format-toggle="true"]').click();
    await secondToolbar.waitFor({ state: 'hidden', timeout: 5000 });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const laptopToggle = modal.locator('[data-task-note-format-toggle="true"]').first();
  await laptopToggle.click();
  const laptopToolbar = modal.locator('[data-task-note-toolbar-popover="true"]');
  await laptopToolbar.waitFor({ state: 'visible', timeout: 5000 });
  const laptopBounds = await getGeometry(laptopToolbar);
  const laptopToggleBounds = await getGeometry(laptopToggle);
  const laptopViewport = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(laptopBounds.x >= 0 && laptopBounds.x + laptopBounds.width <= laptopViewport.width + 1, 'laptop toolbar stays inside viewport', { laptopBounds, laptopViewport });
  assert(laptopBounds.x + laptopBounds.width <= laptopToggleBounds.x + 1, 'laptop toolbar stays left of its format toggle', { laptopBounds, laptopToggleBounds });
  assert(laptopViewport.scrollWidth <= laptopViewport.width + 1, 'laptop toolbar causes no horizontal overflow', laptopViewport);
  await page.screenshot({ path: 'output/playwright/dev-066-task-note-laptop-1024.png', fullPage: true });
  await laptopToggle.click();
  await laptopToolbar.waitFor({ state: 'hidden', timeout: 5000 });

  const richBeforeMobile = JSON.stringify((await readStoredTask()).detailNotes[0].richContent.editorState.root.children);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelectorAll('[data-task-note-mobile-readonly="true"]').length === 2, null, { timeout: 10000 });
  assert(await modal.locator('[data-task-note-format-toggle="true"]').count() === 0, 'mobile has no format toggle');
  assert(await modal.locator('[data-task-note-toolbar-popover="true"]').count() === 0, 'mobile has no toolbar');
  assert(await modal.locator('[data-task-note-editor-loaded="true"]').count() === 0, 'mobile does not mount desktop editor');
  assert(await modal.locator('[contenteditable="true"]').count() === 0, 'mobile has zero contenteditable');
  assert(await modal.locator('[data-task-note-mobile-append-input="true"]').count() === 2, 'mobile has one plain append field per note');
  assert(await modal.locator('[data-task-note-readonly-content="true"] h3').count() === 1, 'mobile renderer preserves heading');
  assert(await modal.locator('[data-task-note-readonly-content="true"] ul').count() === 1, 'mobile renderer preserves list');
  assert(await modal.locator('[data-task-note-readonly-content="true"] .font-semibold').count() >= 1, 'mobile renderer preserves bold text');

  const firstMobileCard = modal.locator('[data-task-detail-note-card="true"]').first();
  const appendText = '手機追加內容 ' + Date.now().toString(36);
  await firstMobileCard.locator('[data-task-note-mobile-append-input="true"]').fill(appendText);
  await firstMobileCard.locator('[data-task-note-mobile-append-submit="true"]').click();
  await page.waitForFunction(appendText => {
    const task = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev066-task'];
    return task?.detailNotes?.[0]?.content?.includes(appendText);
  }, appendText, { timeout: 10000 });
  const storedAfterMobile = await readStoredTask();
  const mobileChildren = storedAfterMobile.detailNotes[0].richContent.editorState.root.children;
  const oldChildren = JSON.parse(richBeforeMobile);
  assert(JSON.stringify(mobileChildren.slice(0, oldChildren.length)) === richBeforeMobile, 'mobile append preserves original rich nodes byte-for-byte');
  assert(mobileChildren.length === oldChildren.length + 1, 'mobile append adds exactly one paragraph');
  assert(mobileChildren[1].children[0].format === 1, 'mobile append preserves original bold bit');
  await firstMobileCard.getByText(appendText, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });

  const mobileHealth = await page.evaluate(() => {
    const visibleAlerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (element.textContent || '').trim();
      })
      .map(element => (element.textContent || '').trim());
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visibleAlerts,
    };
  });
  assert(mobileHealth.scrollWidth <= mobileHealth.viewportWidth + 1, 'mobile has no horizontal overflow', mobileHealth);
  assert(mobileHealth.visibleAlerts.length === 0, 'mobile shows no visible runtime errors', mobileHealth);
  assert(diagnostics.length === 0, 'browser console and page errors must stay empty', { diagnostics });
  await page.screenshot({ path: 'output/playwright/dev-066-task-note-mobile-390.png', fullPage: true });

  console.log(JSON.stringify({
    desktop: {
      editorCount: 2,
      formatToggleCount: 2,
      modalGeometryStable: true,
      cardGeometryStable: true,
      formatRoundTrip: true,
    },
    laptop: { toolbarBounds: laptopBounds, viewport: laptopViewport },
    mobile: {
      editorCount: 0,
      formatToggleCount: 0,
      appendPreservedRichState: true,
      health: mobileHealth,
    },
    diagnostics,
  }, null, 2));
}
