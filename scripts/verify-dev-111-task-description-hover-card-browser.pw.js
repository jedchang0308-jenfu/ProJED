/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const artifactKey = '__DEV111_ARTIFACT';
  const description = '讓所有人先理解任務目的，再一起朝同一方向前進。\n成功狀態：討論與執行都能回扣這個方向。\n<b>這段必須當成純文字顯示</b>';
  const result = {
    devId: 'DEV-111',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    fixture: 'dev-111-v3',
    viewport: { width: 1440, height: 900 },
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
    id: 'dev111-workspace',
    title: 'DEV-111 任務說明懸浮驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev111-board',
      title: '任務方向閱讀模式',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const baseNode = {
    workspaceId: workspace.id,
    boardId: 'dev111-board',
    status: 'todo',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  };
  const nodes = {
    'dev111-group': {
      ...baseNode,
      id: 'dev111-group',
      parentId: null,
      title: '共同方向',
      description: '這一列也使用既有任務說明。',
      nodeType: 'group',
      order: 0,
      startDate: '2026-09-07',
      endDate: '2026-09-11',
    },
    'dev111-task-a': {
      ...baseNode,
      id: 'dev111-task-a',
      parentId: 'dev111-group',
      title: '推廣 OKR 文化',
      description,
      nodeType: 'task',
      order: 0,
      startDate: '2026-09-08',
      endDate: '2026-09-10',
    },
    'dev111-task-empty': {
      ...baseNode,
      id: 'dev111-task-empty',
      parentId: 'dev111-group',
      title: '沒有任務說明',
      description: '   ',
      nodeType: 'task',
      order: 1,
      startDate: '2026-09-09',
      endDate: '2026-09-09',
    },
    'dev111-subtask': {
      ...baseNode,
      id: 'dev111-subtask',
      parentId: 'dev111-task-a',
      title: '同步任務目的',
      description: '下層任務也直接沿用藍框範圍。',
      nodeType: 'task',
      order: 0,
      startDate: '2026-09-08',
      endDate: '2026-09-09',
    },
  };

  const seed = async () => {
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
      localStorage.setItem('projed-last-board', 'dev111-board');
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false }));
    }, { account, workspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
  };

  const switchMode = async (mode, readySelector) => {
    await page.evaluate(nextMode => localStorage.setItem('projed-last-view', nextMode), mode);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const verifyMode = async ({ mode, selector, readySelector = selector }) => {
    await switchMode(mode, readySelector);
    const trigger = page.locator(selector).first();
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    const indicator = trigger.locator('[data-task-description-indicator="true"]').first();
    await indicator.waitFor({ state: 'visible', timeout: 15000 });
    const indicatorEvidence = await indicator.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const glyph = element.querySelector('svg');
      const glyphRect = glyph?.getBoundingClientRect();
      return {
        slot: { width: rect.width, height: rect.height },
        glyph: glyphRect ? { width: glyphRect.width, height: glyphRect.height } : null,
        pointerEvents: style.pointerEvents,
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        ariaHidden: element.getAttribute('aria-hidden'),
        title: element.getAttribute('title'),
        role: element.getAttribute('role'),
        tabIndex: element.tabIndex,
      };
    });
    record(`B-${mode}-description-indicator`,
      await trigger.locator('[data-task-description-indicator="true"]').count() === 1
      && indicatorEvidence.slot.width === 11
      && indicatorEvidence.slot.height === 11
      && indicatorEvidence.glyph?.width === 9
      && indicatorEvidence.glyph?.height === 9
      && indicatorEvidence.pointerEvents === 'none'
      && indicatorEvidence.backgroundColor === 'rgba(0, 0, 0, 0)'
      && indicatorEvidence.borderWidth === '0px'
      && indicatorEvidence.ariaHidden === 'true'
      && indicatorEvidence.title === null
      && indicatorEvidence.role === null
      && indicatorEvidence.tabIndex === -1,
    indicatorEvidence);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(180);
    const startedAt = Date.now();
    await trigger.hover();
    await page.waitForTimeout(760);
    const earlyCount = await page.locator('[data-task-description-hover-card="true"]').count();
    await page.locator('[data-task-description-hover-card="true"]').waitFor({ state: 'visible', timeout: 1000 });
    const elapsedMs = Date.now() - startedAt;
    const card = page.locator('[data-task-description-hover-card="true"]');
    const evidence = await card.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: element.textContent,
        role: element.getAttribute('role'),
        taskId: element.getAttribute('data-task-id'),
        childElementCount: element.childElementCount,
        whiteSpace: style.whiteSpace,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    const describedBy = await trigger.getAttribute('aria-describedby');
    const screenshot = `output/playwright/dev-111-task-description-hover-card/${runId}-${mode}.png`;
    result.screenshots[mode] = screenshot;
    await page.screenshot({ path: screenshot, fullPage: false });

    const insideViewport = evidence.rect.left >= 0
      && evidence.rect.top >= 0
      && evidence.rect.right <= evidence.viewport.width
      && evidence.rect.bottom <= evidence.viewport.height;
    record(`B-${mode}-hover`, earlyCount === 0
      && elapsedMs >= 900
      && evidence.text === description
      && evidence.role === 'tooltip'
      && evidence.taskId === 'dev111-task-a'
      && evidence.childElementCount === 0
      && evidence.whiteSpace === 'pre-wrap'
      && insideViewport
      && evidence.documentWidth <= evidence.viewport.width
      && (describedBy || '').split(/\s+/).includes('task-description-hover-card'), {
        earlyCount,
        elapsedMs,
        evidence,
        describedBy,
      });

    const cardBox = await card.boundingBox();
    if (cardBox) await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + Math.min(cardBox.height / 2, 30));
    await page.waitForTimeout(180);
    record(`B-${mode}-hoverable`, await card.isVisible(), { cardBox });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
    record(`B-${mode}-escape`, await card.count() === 0, {
      describedByAfter: await trigger.getAttribute('aria-describedby'),
    });
    const indicatorScreenshot = `output/playwright/dev-111-task-description-hover-card/${runId}-${mode}-indicator.png`;
    result.screenshots[`${mode}-indicator`] = indicatorScreenshot;
    await trigger.screenshot({ path: indicatorScreenshot });
  };

  const verifySelectedPreviewSurfaceRange = async ({ id, surfaceSelector, titleSelector, expectedDescription }) => {
    const surface = page.locator(surfaceSelector).first();
    const title = surface.locator(titleSelector).first();
    await surface.waitFor({ state: 'visible', timeout: 15000 });
    await title.waitFor({ state: 'visible', timeout: 15000 });
    const surfaceBox = await surface.boundingBox();
    const titleBox = await title.boundingBox();
    if (!surfaceBox || !titleBox) {
      record(id, false, { surfaceBox, titleBox });
      return;
    }

    const candidates = [
      { x: surfaceBox.x + surfaceBox.width - 4, y: surfaceBox.y + surfaceBox.height / 2 },
      { x: surfaceBox.x + 4, y: surfaceBox.y + surfaceBox.height - 4 },
      { x: surfaceBox.x + surfaceBox.width - 4, y: surfaceBox.y + surfaceBox.height - 4 },
    ];
    const point = candidates.find(candidate => !(
      candidate.x >= titleBox.x
      && candidate.x <= titleBox.x + titleBox.width
      && candidate.y >= titleBox.y
      && candidate.y <= titleBox.y + titleBox.height
    ));
    if (!point) {
      record(id, false, { surfaceBox, titleBox, reason: 'no point outside title inside selected-preview surface' });
      return;
    }

    await page.mouse.move(2, 2);
    await page.waitForTimeout(160);
    await page.mouse.move(point.x, point.y);
    const card = page.locator('[data-task-description-hover-card="true"]');
    await card.waitFor({ state: 'visible', timeout: 1600 });
    record(id, await card.textContent() === expectedDescription, {
      surfaceBox,
      titleBox,
      point,
      triggerIsSelectedPreviewSurface: await surface.getAttribute('data-task-surface-source') === 'true',
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  };

  try {
    await seed();
    const modes = [
      { mode: 'board', selector: '[data-task-surface-source="true"][data-task-id="dev111-task-a"]' },
      { mode: 'list', selector: '[data-task-drag-surface-kind="wbs-list-row"][data-task-surface-source="true"][data-task-id="dev111-task-a"]' },
      { mode: 'mindmap', selector: '[data-mindmap-node="dev111-task-a"][data-task-description-hover-trigger="true"]' },
      { mode: 'gantt', selector: '[data-gantt-task-bar="true"][data-task-id="dev111-task-a"][data-task-description-hover-trigger="true"]' },
      { mode: 'calendar', selector: '[data-calendar-task-segment="true"][data-task-id="dev111-task-a"][data-task-description-hover-trigger="true"]' },
    ];
    for (const mode of modes) await verifyMode(mode);

    await switchMode('board', '[data-layout-region="board-canvas"]');
    await verifySelectedPreviewSurfaceRange({
      id: 'B-board-L1-selected-preview-surface-range',
      surfaceSelector: '[data-task-surface-source="true"][data-task-id="dev111-group"]',
      titleSelector: '[data-task-title-slot="true"]',
      expectedDescription: '這一列也使用既有任務說明。',
    });
    await verifySelectedPreviewSurfaceRange({
      id: 'B-board-L2-selected-preview-surface-range',
      surfaceSelector: '[data-task-surface-source="true"][data-task-id="dev111-task-a"]',
      titleSelector: '[data-task-title-slot="true"]',
      expectedDescription: description,
    });
    await verifySelectedPreviewSurfaceRange({
      id: 'B-board-L3-selected-preview-surface-range',
      surfaceSelector: '[data-task-surface-source="true"][data-task-id="dev111-subtask"]',
      titleSelector: '[data-task-title-slot="true"]',
      expectedDescription: '下層任務也直接沿用藍框範圍。',
    });

    await switchMode('list', '[data-task-hierarchy-surface="list"]');
    await verifySelectedPreviewSurfaceRange({
      id: 'B-list-selected-preview-surface-range',
      surfaceSelector: '[data-task-drag-surface-kind="wbs-list-row"][data-task-surface-source="true"][data-task-id="dev111-task-a"]',
      titleSelector: '.task-title-text',
      expectedDescription: description,
    });

    await switchMode('board', '[data-layout-region="board-canvas"]');
    const boardTrigger = page.locator('[data-task-surface-source="true"][data-task-id="dev111-task-a"]').first();
    const hoverCard = page.locator('[data-task-description-hover-card="true"]');
    await boardTrigger.hover();
    await page.waitForTimeout(480);
    await page.mouse.move(1000, 700);
    await page.waitForTimeout(720);
    record('B-dwell-cancelled-on-leave', await hoverCard.count() === 0);

    await boardTrigger.hover();
    await hoverCard.waitFor({ state: 'visible', timeout: 1500 });
    await page.evaluate(() => {
      document.querySelector('[data-layout-region="board-canvas"]')
        ?.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    record('B-scroll-dismisses', await hoverCard.count() === 0);

    await page.mouse.move(1000, 700);
    await boardTrigger.hover();
    await hoverCard.waitFor({ state: 'visible', timeout: 1500 });
    await boardTrigger.dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 });
    await page.waitForTimeout(80);
    record('B-pointerdown-dismisses', await hoverCard.count() === 0);
    await boardTrigger.dispatchEvent('pointerup', { pointerType: 'mouse', button: 0 });

    await page.mouse.move(1000, 700);
    await boardTrigger.hover();
    await hoverCard.waitFor({ state: 'visible', timeout: 1500 });
    await boardTrigger.dispatchEvent('dragstart');
    await page.waitForTimeout(80);
    record('B-dragstart-dismisses', await hoverCard.count() === 0);
    await boardTrigger.dispatchEvent('dragend');

    const emptyDescriptionSurface = page.locator('[data-task-surface-source="true"][data-task-id="dev111-task-empty"]').first();
    await page.mouse.move(1000, 700);
    await emptyDescriptionSurface.hover();
    await page.waitForTimeout(1150);
    record('B-empty-description', await hoverCard.count() === 0
      && await emptyDescriptionSurface.locator('[data-task-description-indicator="true"]').count() === 0, {
      selectedPreviewSurfaceCount: await emptyDescriptionSurface.count(),
      cardCount: await hoverCard.count(),
      indicatorCount: await emptyDescriptionSurface.locator('[data-task-description-indicator="true"]').count(),
    });
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'calendar'));
    await page.reload({ waitUntil: 'networkidle' });
    const calendarSegment = page.locator('[data-calendar-task-segment="true"][data-task-id="dev111-task-a"]').first();
    await calendarSegment.waitFor({ state: 'visible', timeout: 15000 });
    record('B-calendar-native-title', await calendarSegment.getAttribute('title') === null);

    const sharedSidebarRow = page.locator('[data-task-hierarchy-surface="calendar"][data-task-id="dev111-task-a"]').first();
    await sharedSidebarRow.waitFor({ state: 'visible', timeout: 15000 });
    const sharedSidebarIndicator = sharedSidebarRow.locator('[data-task-description-indicator="true"]');
    record('B-shared-sidebar-description-indicator', await sharedSidebarIndicator.count() === 1, {
      indicatorCount: await sharedSidebarIndicator.count(),
      pointerEvents: await sharedSidebarIndicator.first().evaluate(element => getComputedStyle(element).pointerEvents),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('projed-last-view', 'board'));
    await page.reload({ waitUntil: 'networkidle' });
    const mobileBoardSurface = page.locator('[data-task-surface-source="true"][data-task-id="dev111-task-a"]').first();
    await mobileBoardSurface.waitFor({ state: 'visible', timeout: 15000 });
    const mobileIndicator = mobileBoardSurface.locator('[data-task-description-indicator="true"]').first();
    await mobileIndicator.waitFor({ state: 'visible', timeout: 15000 });
    const mobileLayout = await page.evaluate(() => {
      const surface = document.querySelector('[data-task-surface-source="true"][data-task-id="dev111-task-a"]');
      const indicator = surface?.querySelector('[data-task-description-indicator="true"]');
      const title = surface?.querySelector('[data-task-title-slot="true"] > :first-child');
      const surfaceRect = surface?.getBoundingClientRect();
      const indicatorRect = indicator?.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        surfaceRect: surfaceRect ? { left: surfaceRect.left, right: surfaceRect.right } : null,
        indicatorRect: indicatorRect ? { left: indicatorRect.left, right: indicatorRect.right, width: indicatorRect.width } : null,
        titleRect: titleRect ? { left: titleRect.left, right: titleRect.right } : null,
      };
    });
    record('B-mobile-board-indicator-layout', Boolean(
      mobileLayout.documentWidth <= mobileLayout.viewportWidth
      && mobileLayout.surfaceRect
      && mobileLayout.indicatorRect
      && mobileLayout.titleRect
      && mobileLayout.indicatorRect.width === 11
      && mobileLayout.indicatorRect.left >= mobileLayout.titleRect.right
      && mobileLayout.indicatorRect.right <= mobileLayout.surfaceRect.right
    ), mobileLayout);
    const mobileScreenshot = `output/playwright/dev-111-task-description-hover-card/${runId}-mobile-board-indicator.png`;
    result.screenshots['mobile-board-indicator'] = mobileScreenshot;
    await page.screenshot({ path: mobileScreenshot, fullPage: false });

    const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
    const bodyText = await page.locator('body').innerText();
    const visibleErrorText = bodyText.match(/HTTP\s+[45]\d\d|Internal Server Error|Not Found|\/api\/[^\s]*\s+(?:error|failed)/gi) || [];
    record('B-visible-errors', visibleErrors.length === 0 && visibleErrorText.length === 0, {
      visibleErrors,
      visibleErrorText,
    });

    record('B-console-errors', result.browserErrors.length === 0, { browserErrors: result.browserErrors });
  } catch (error) {
    failures.push('B-runtime');
    result.cases.push({ id: 'B-runtime', ok: false, details: { message: String(error) } });
  }

  result.status = failures.length === 0 ? 'PASS' : 'FAIL';
  result.failures = failures;
  result.generatedAt = new Date().toISOString();
  await page.evaluate(({ artifactKey, result }) => {
    window[artifactKey] = result;
    sessionStorage.setItem(artifactKey, JSON.stringify(result));
  }, { artifactKey, result });

  console.log(`DEV111_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length > 0) {
    const failedCases = result.cases.filter(testCase => !testCase.ok);
    throw new Error(`DEV-111 browser verification failed: ${failures.join(', ')} ${JSON.stringify(failedCases)}`);
  }
}
