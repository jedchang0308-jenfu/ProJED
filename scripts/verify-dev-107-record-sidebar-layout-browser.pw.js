/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-107-record-sidebar-layout';
  const BASE_URL = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:4000';
  const TARGET_TITLE = 'DEV-107 既有會議草稿排版驗證';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  const screenshots = [];

  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) {
      httpFailures.push(`${response.status()} ${response.url()}`);
    }
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'DEV-107 QA 擁有者',
    createdAt: 1704067200000,
  };
  const workspaceId = 'dev107-workspace';
  const boardId = 'dev107-board';
  const workspace = {
    id: workspaceId,
    title: 'DEV-107 會議草稿排版',
    ownerId: account.uid,
    members: [account.uid],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: boardId, title: '會議紀錄驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const boardMembers = {
    [`${workspaceId}:${boardId}`]: [{
      userId: account.uid,
      role: 'owner',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    }],
  };
  const now = 1799000000000;
  const makeRecord = (id, type, title, status, updatedAt, content) => ({
    id,
    workspaceId,
    boardId,
    type,
    title,
    content,
    status,
    visibility: 'private',
    participantsText: type === 'meeting' ? 'PM、RD、QA' : undefined,
    occurredAt: type === 'meeting' ? now - 3600000 : undefined,
    startedAt: type === 'work_log' ? now - 7200000 : undefined,
    endedAt: type === 'work_log' ? now - 3600000 : undefined,
    recordedBy: account.uid,
    createdBy: account.uid,
    updatedBy: account.uid,
    createdAt: updatedAt - 1000,
    updatedAt,
    ragEnabled: false,
    taskLinks: [],
  });
  const longContent = Array.from({ length: 18 }, (_, index) => `第 ${index + 1} 行：會議討論、決議、進度、風險與待追蹤事項保留在同一份草稿中。`).join('\n');
  const fixtureRecords = [
    makeRecord('dev107-meeting-draft', 'meeting', TARGET_TITLE, 'draft', now + 3000, longContent),
    makeRecord('dev107-meeting-published', 'meeting', 'DEV-107 已發布會議紀錄', 'published', now + 2000, '已發布的歷史內容。'),
    makeRecord('dev107-work-log', 'work_log', 'DEV-107 個人工作紀錄', 'draft', now + 1000, '工作紀錄內容。'),
    makeRecord('dev107-meeting-old', 'meeting', 'DEV-107 另一筆會議紀錄', 'draft', now, '另一筆草稿。'),
  ];

  const writeFixture = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, boardMembers, records }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify(boardMembers));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(records));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'records');
    }, { account, workspace, boardMembers, records: fixtureRecords });
    await page.reload({ waitUntil: 'networkidle' });
    const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ }).first();
    if (await fixedEnvironment.count() && await fixedEnvironment.isVisible().catch(() => false)) {
      await fixedEnvironment.click({ force: true });
      await page.waitForTimeout(250);
    }
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openExistingDraft = async (viewport) => {
    await writeFixture(viewport);
    const sidebarExpandButton = page.locator('button[aria-label="展開工作區選單"]');
    if (await sidebarExpandButton.count() && await sidebarExpandButton.isVisible().catch(() => false)) await sidebarExpandButton.click();
    const recordsButton = page.locator('[data-sidebar-records-button]').first();
    await recordsButton.waitFor({ state: 'visible', timeout: 10000 });
    await recordsButton.click();
    await page.locator('[data-record-section-controls]').waitFor({ state: 'visible', timeout: 10000 });
    const meetingTab = page.locator('[data-record-section-tab="meeting"]');
    await meetingTab.waitFor({ state: 'visible', timeout: 10000 });
    await meetingTab.click();
    const row = page.locator('.record-list-row').filter({ hasText: TARGET_TITLE }).first();
    await row.waitFor({ state: 'visible', timeout: 10000 });
    await row.click();
    await page.locator('[data-record-composer-variant="meeting-record"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const visibleErrors = async () => page.locator('.inline-error,[role="alert"]').evaluateAll(elements => elements
    .filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })
    .map(element => element.textContent?.trim()).filter(Boolean));

  const inspectMeetingRecord = async (viewport) => {
    const shell = page.locator('[data-record-composer-shell]');
    const variant = page.locator('[data-record-composer-variant="meeting-record"]');
    assert(await shell.count() === 1, 'existing meeting draft should use one composer shell');
    assert(await variant.count() === 1, 'existing meeting draft should expose meeting-record variant');
    assert(await page.locator('[data-record-workflow-kind="meeting"]').count() === 0, 'existing meeting draft must not render live meeting workflow');
    assert(await page.locator('[data-record-workflow-kind="work-log"]').count() === 0, 'existing meeting draft must not render work-log workflow');
    assert(await page.locator('[data-record-recent-records]').count() === 0, 'recent records must be hidden while a draft is open');
    assert(await page.getByText('個人流程', { exact: true }).count() === 0, 'existing meeting draft must not show personal workflow label');
    assert(await page.locator('[data-record-title-input]').inputValue() === TARGET_TITLE, 'existing meeting title must be preserved');

    const metrics = await page.evaluate(() => {
      const shellNode = document.querySelector('[data-record-composer-shell]');
      const scrollOwner = document.querySelector('[data-record-composer-scroll-owner]');
      const editor = document.querySelector('[data-record-content-editor]');
      const editorLabel = editor?.closest('label');
      const controls = document.querySelector('[data-record-compact-controls]');
      const meta = document.querySelector('[data-record-meeting-meta-grid]');
      const metaFields = meta ? Array.from(meta.children).map(node => node.getBoundingClientRect()) : [];
      if (!shellNode || !scrollOwner || !editor || !editorLabel || !controls) return null;
      const editorRect = editor.getBoundingClientRect();
      const shellRect = shellNode.getBoundingClientRect();
      const scrollRect = scrollOwner.getBoundingClientRect();
      const editorStyle = getComputedStyle(editor);
      return {
        shell: { top: shellRect.top, bottom: shellRect.bottom, left: shellRect.left, right: shellRect.right },
        scrollOwner: { overflowY: getComputedStyle(scrollOwner).overflowY, scrollHeight: scrollOwner.scrollHeight, clientHeight: scrollOwner.clientHeight, top: scrollRect.top, bottom: scrollRect.bottom },
        editor: { top: editorRect.top, bottom: editorRect.bottom, height: editorRect.height, minHeight: parseFloat(editorStyle.minHeight) || 0, resize: editorStyle.resize, overflowY: editorStyle.overflowY },
        editorLabel: { top: editorLabel.getBoundingClientRect().top, bottom: editorLabel.getBoundingClientRect().bottom },
        controls: { top: controls.getBoundingClientRect().top, bottom: controls.getBoundingClientRect().bottom },
        metaFields: metaFields.map(rect => ({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })),
      };
    });
    assert(Boolean(metrics), 'existing meeting draft should expose measurable layout geometry');
    assert(metrics.editor.minHeight >= 220, 'meeting editor must keep 220px minimum height', metrics);
    assert(metrics.editor.resize === 'none', 'meeting editor must not expose native resize handle', metrics);
    assert(metrics.editor.overflowY === 'visible', 'meeting editor content should flow to drawer scroll owner', metrics);
    assert(metrics.scrollOwner.overflowY === 'auto' || metrics.scrollOwner.overflowY === 'scroll', 'drawer must own vertical scrolling', metrics);
    assert(metrics.editor.bottom <= metrics.controls.top + 1, 'editor must end before compact controls', metrics);
    assert(metrics.metaFields.length === 2 && Math.abs(metrics.metaFields[0].top - metrics.metaFields[1].top) <= 1 && metrics.metaFields[0].right <= metrics.metaFields[1].left + 1, 'meeting title and time must share one row', metrics);
    const errors = await visibleErrors();
    assert(errors.length === 0, 'existing meeting draft must have no visible error', { errors });
    assert(diagnostics.length === 0, 'existing meeting draft must have no browser runtime errors', { diagnostics });
    const screenshot = `${OUTPUT_DIR}/meeting-record-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);
    return metrics;
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
      throw error;
    }
  };

  await runCase('TC-107-001-1902', 'existing meeting draft renders meeting-record variant without overlap', async () => {
    await openExistingDraft({ width: 1902, height: 960 });
    return inspectMeetingRecord({ width: 1902, height: 960 });
  });
  await runCase('TC-107-001-1440', 'existing meeting draft renders meeting-record variant without overlap', async () => {
    await openExistingDraft({ width: 1440, height: 900 });
    return inspectMeetingRecord({ width: 1440, height: 900 });
  });
  await runCase('TC-107-001-1024', 'existing meeting draft renders meeting-record variant without overlap', async () => {
    await openExistingDraft({ width: 1024, height: 768 });
    return inspectMeetingRecord({ width: 1024, height: 768 });
  });

  await runCase('ROT-107-001-live', 'new live meeting keeps live workflow and meeting-only controls', async () => {
    await writeFixture({ width: 1024, height: 768 });
    const start = page.getByRole('button', { name: '新增會議記錄' }).first();
    await start.waitFor({ state: 'visible', timeout: 10000 });
    await start.click();
    await page.locator('[data-record-composer-variant="live-meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-record-workflow-kind="meeting"]').count() === 1, 'live meeting should keep meeting workflow');
    assert(await page.locator('[data-meeting-draft-overflow]').count() === 1, 'live meeting should keep meeting overflow actions');
    assert(await page.locator('[data-record-recent-records]').count() === 0, 'live meeting should hide recent records');
    return { variant: 'live-meeting', workflowCount: await page.locator('[data-record-workflow-kind="meeting"]').count() };
  });

  await runCase('TC-107-009-mobile-negative', '390px keeps meeting UI unavailable', async () => {
    await writeFixture({ width: 390, height: 844 });
    assert(await page.locator('[data-record-section-tab="meeting"]').count() === 0, 'mobile records library must hide meeting section');
    assert(await page.getByRole('button', { name: '新增會議記錄' }).count() === 0, 'mobile must not expose meeting entry');
    assert(await page.locator('[data-record-workflow-kind="meeting"]').count() === 0, 'mobile must not expose live meeting workflow');
    const errors = await visibleErrors();
    assert(errors.length === 0, 'mobile-negative surface must have no visible error', { errors });
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-negative-390x844.png`, fullPage: true });
    screenshots.push(`${OUTPUT_DIR}/mobile-negative-390x844.png`);
    return { meetingTab: 0, meetingEntry: 0, meetingWorkflow: 0 };
  });

  const finalOverflow = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
  }));
  assert(finalOverflow.bodyScrollWidth <= finalOverflow.bodyClientWidth + 1 && finalOverflow.rootScrollWidth <= finalOverflow.rootClientWidth + 1, 'final mobile surface must not have horizontal overflow', finalOverflow);
  assert(httpFailures.length === 0, 'browser run must not produce HTTP 4xx/5xx responses', { httpFailures });

  const artifact = {
    devId: 'DEV-107',
    status: 'PASS',
    sourceRevision: 'working-tree',
    environment: 'local-test-browser',
    baseUrl: BASE_URL,
    role: account.uid,
    fixture: { workspaceId, boardId, recordCount: fixtureRecords.length, targetTitle: TARGET_TITLE },
    cases,
    screenshots,
    diagnostics,
    httpFailures,
    finalOverflow,
    generatedAt: new Date().toISOString(),
  };
  await page.evaluate(result => {
    window.__DEV107_ARTIFACT = result;
  }, artifact);
  return artifact;
}
