/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const artifactKey = '__DEV114_ARTIFACT';
  const outputDir = 'output/playwright/dev-114-task-description-global-surfaces';
  const result = {
    devId: 'DEV-114',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    fixture: 'dev-114-v1',
    viewport: { width: 1440, height: 900 },
    cases: [],
    screenshots: {},
    browserErrors: [],
    httpErrors: [],
  };
  const failures = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  const card = () => page.locator('[data-task-description-hover-card="true"]');
  const waitForNoCard = async (timeout = 250) => {
    await page.waitForTimeout(timeout);
    return await card().count() === 0;
  };

  page.on('console', message => {
    if (message.type() === 'error') result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) result.httpErrors.push({ status: response.status(), url: response.url() });
  });

  const account = {
    id: 'local-test-user', uid: 'local-test-user', email: 'dev114@projed.local',
    displayName: 'DEV-114 QA', createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev114-workspace', title: 'DEV-114 全域懸浮卡驗證', ownerId: account.id,
    members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [
      { id: 'dev114-board', title: 'DEV114 主看板', dependencies: [], order: 1, createdAt: 1704067200000 },
      { id: 'dev114-board-2', title: 'DEV114 第二看板', dependencies: [], order: 2, createdAt: 1704067200000 },
    ],
  };
  const baseNode = {
    workspaceId: workspace.id, boardId: 'dev114-board', status: 'todo',
    createdAt: 1704067200000, updatedAt: 1704067200000,
  };
  const nodes = {
    'dev114-l1': { ...baseNode, id: 'dev114-l1', parentId: null, title: 'DEV114 上層群組', description: 'DEV114-L1-DESC', nodeType: 'group', order: 0 },
    'dev114-task': { ...baseNode, id: 'dev114-task', parentId: 'dev114-l1', title: 'DEV114 TASK', description: 'DEV114-TASK-DESC\n第二行 <b>plain</b>', nodeType: 'task', order: 0 },
    'dev114-subtask': { ...baseNode, id: 'dev114-subtask', parentId: 'dev114-task', title: 'DEV114 SUBTASK', description: 'DEV114-SUBTASK-DESC', nodeType: 'task', order: 0 },
    'dev114-placed': { ...baseNode, id: 'dev114-placed', parentId: null, title: 'DEV114 已歸位任務', description: 'DEV114-PLACED-DESC', nodeType: 'task', order: 1 },
    'dev114-parent': { ...baseNode, id: 'dev114-parent', parentId: null, title: 'DEV114 封存父任務', description: 'DEV114-PARENT-DESC', nodeType: 'group', order: 2 },
    'dev114-archived': { ...baseNode, id: 'dev114-archived', parentId: 'dev114-parent', title: 'DEV114 封存任務', description: 'DEV114-ARCHIVED-DESC', nodeType: 'task', order: 0, isArchived: true },
    'dev114-empty': { ...baseNode, id: 'dev114-empty', parentId: null, title: 'DEV114 無說明', description: '   ', nodeType: 'task', order: 3 },
    'dev114-calendar': { ...baseNode, id: 'dev114-calendar', boardId: 'dev114-board-2', parentId: null, title: 'DEV114 跨看板日曆任務', description: 'DEV114-CALENDAR-INLINE-DESC', nodeType: 'task', order: 0, startDate: '2026-09-09', endDate: '2026-09-10' },
  };
  const unplaced = {
    id: 'dev114-unplaced', workspaceId: workspace.id, boardId: '__task_workbench_unplaced__', parentId: null,
    title: 'DEV114 未歸位任務', description: 'DEV114-UNPLACED-DESC', status: 'todo', nodeType: 'task', order: 0,
    createdAt: 1704067200000, updatedAt: 1704067200000,
  };
  const recordFixture = {
    id: 'dev114-record', workspaceId: workspace.id, boardId: 'dev114-board', type: 'work_log',
    title: 'DEV114 工作紀錄', content: '已處理 @[DEV114 TASK](task:dev114-task)。',
    status: 'draft', visibility: 'private', recordedBy: account.id,
    createdAt: 1704067200000, updatedAt: 1704067200000,
    taskLinks: [{ recordId: 'dev114-record', workspaceId: workspace.id, boardId: 'dev114-board', nodeId: 'dev114-task', role: 'main', createdAt: 1704067200000 }],
  };

  const seed = async () => {
    await page.setViewportSize(result.viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes, unplaced, recordFixture }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
        [`${workspace.id}:dev114-board`]: [{ userId: account.id, role: 'owner', createdAt: 1704067200000 }],
        [`${workspace.id}:dev114-board-2`]: [{ userId: account.id, role: 'owner', createdAt: 1704067200000 }],
      }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([recordFixture]));
      localStorage.setItem('projed-task-workbench-unplaced-tasks:v1', JSON.stringify([unplaced]));
      localStorage.setItem(`projed-task-workbench-unplaced-tasks:v1:${account.id}`, JSON.stringify([unplaced]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '22');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev114-board');
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false }));
    }, { account, workspace, nodes, unplaced, recordFixture });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-app-main="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const switchView = async (view, readySelector) => {
    await page.evaluate(nextView => localStorage.setItem('projed-last-view', nextView), view);
    await page.reload({ waitUntil: 'networkidle' });
    if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const hoverAndRead = async (id, selector, expected, options = {}) => {
    const trigger = page.locator(selector).first();
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await page.mouse.move(2, 2);
    await page.waitForTimeout(120);
    const started = Date.now();
    await trigger.hover();
    await page.waitForTimeout(760);
    const earlyCount = await card().count();
    await card().waitFor({ state: 'visible', timeout: 1600 });
    const elapsedMs = Date.now() - started;
    const evidence = await card().evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent,
        role: element.getAttribute('role'),
        taskId: element.getAttribute('data-task-id'),
        childElementCount: element.childElementCount,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    const title = options.title || '';
    const ok = earlyCount === 0 && elapsedMs >= 900 && evidence.text === expected
      && evidence.role === 'tooltip' && evidence.taskId === (options.taskId || selector.match(/data-task-id="([^"]+)/)?.[1] || '')
      && evidence.childElementCount === 0 && !evidence.text.includes(title);
    const path = `${outputDir}/${runId}-${id}.png`;
    result.screenshots[id] = path;
    await page.screenshot({ path, fullPage: false });
    record(id, ok, { earlyCount, elapsedMs, evidence, title });
    if (options.dismissEscape === false) {
      await page.mouse.move(2, 2);
      await page.waitForTimeout(180);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(140);
    }
    return evidence;
  };

  const assertNoHover = async (id, selector) => {
    const trigger = page.locator(selector).first();
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await page.mouse.move(2, 2);
    await trigger.hover();
    const none = await waitForNoCard(1180);
    record(id, none, { cardCount: await card().count() });
  };

  try {
    console.log('DEV114:seed');
    await seed();

    console.log('DEV114:B01');
    await hoverAndRead('B01-board-task', '[data-task-surface-source="true"][data-task-id="dev114-task"]', 'DEV114-TASK-DESC\n第二行 <b>plain</b>', { taskId: 'dev114-task', title: 'DEV114 TASK' });

    console.log('DEV114:B02');
    const boardTask = page.locator('[data-task-surface-source="true"][data-task-id="dev114-task"]').first();
    await boardTask.click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-task-details-subtasks="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const subtaskToggle = page.locator('[data-task-details-subtask-toggle="true"]');
    if (await subtaskToggle.getAttribute('aria-expanded') !== 'true') await subtaskToggle.click();
    await hoverAndRead('B02-details-subtask', '[data-task-details-modal="true"] [data-task-surface-source="true"][data-task-id="dev114-subtask"]', 'DEV114-SUBTASK-DESC', { taskId: 'dev114-subtask', title: 'DEV114 SUBTASK', dismissEscape: false });
    await hoverAndRead('B02a-details-breadcrumb', '[data-task-details-modal="true"] [data-task-details-parent-link="true"][data-task-details-parent-id="dev114-l1"]', 'DEV114-L1-DESC', { taskId: 'dev114-l1', title: 'DEV114 上層群組', dismissEscape: false });
    const detailsModal = page.locator('[data-task-details-modal="true"]').first();
    await detailsModal.hover();
    record('B03-details-modal-title', await waitForNoCard(1180), { cardCount: await card().count() });
    const detailsTitleEvidence = await detailsModal.evaluate(modal => {
      const input = modal.querySelector('[data-task-details-title-input="true"]');
      const readonly = modal.querySelector('p.truncate');
      const element = input || readonly;
      return { found: Boolean(element), tag: element?.tagName || null, title: element?.getAttribute('title') || null };
    });
    record('B04-details-name-native-title-removed', detailsTitleEvidence.found && detailsTitleEvidence.title === null, detailsTitleEvidence);
    const closeDetails = page.locator('[data-task-details-modal="true"] button[aria-label="關閉任務詳情"]').first();
    if (await closeDetails.count()) await closeDetails.click(); else await page.keyboard.press('Escape');
    await page.waitForTimeout(220);

    console.log('DEV114:B05');
    await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await hoverAndRead('B05-workbench-unplaced', '[data-task-workbench-unplaced-task-card="true"][data-task-id="dev114-unplaced"]', 'DEV114-UNPLACED-DESC', { taskId: 'dev114-unplaced', title: 'DEV114 未歸位任務' });
    await hoverAndRead('B06-workbench-placed', 'text=DEV114 已歸位任務', 'DEV114-PLACED-DESC', { taskId: 'dev114-placed', title: 'DEV114 已歸位任務' });
    const placedTitleText = page.locator('text=DEV114 已歸位任務').last();
    record('B07-workbench-native-location-title-removed', await placedTitleText.getAttribute('title') === null, { title: await placedTitleText.getAttribute('title') });

    console.log('DEV114:B08');
    await switchView('recycle_bin', '[data-recycle-bin-view="current-board"]');
    await hoverAndRead('B08-recycle-name', '[data-recycle-bin-view="current-board"] [data-task-description-hover-trigger="true"][data-task-id="dev114-archived"]', 'DEV114-ARCHIVED-DESC', { taskId: 'dev114-archived', title: 'DEV114 封存任務' });
    const recycleRow = page.locator('[data-recycle-bin-view="current-board"] [data-task-id="dev114-archived"]').first().locator('..');
    const restore = page.locator('[data-recycle-bin-view="current-board"] button[title="還原至原處"]').first();
    const permanent = page.locator('[data-recycle-bin-view="current-board"] button[title="永久刪除"]').first();
    record('B09-recycle-actions-outside-hover-zone', await restore.evaluate(el => !el.closest('[data-task-description-hover-trigger="true"]')) && await permanent.evaluate(el => !el.closest('[data-task-description-hover-trigger="true"]')), { restoreTitle: await restore.getAttribute('title'), permanentTitle: await permanent.getAttribute('title') });
    await assertNoHover('B10-recycle-action-no-card', '[data-recycle-bin-view="current-board"] button[title="還原至原處"]');
    const parentTrigger = page.locator('[data-recycle-bin-view="current-board"] [data-task-description-hover-trigger="true"][data-task-id="dev114-parent"]');
    if (await parentTrigger.count()) await hoverAndRead('B11-recycle-parent-location', '[data-recycle-bin-view="current-board"] [data-task-description-hover-trigger="true"][data-task-id="dev114-parent"]', 'DEV114-PARENT-DESC', { taskId: 'dev114-parent', title: 'DEV114 封存父任務' });
    else record('B11-recycle-parent-location', false, { reason: 'parent location trigger missing' });

    console.log('DEV114:B12');
    const sidebarToggle = page.locator('[data-main-sidebar-toggle="true"]').first();
    if (await sidebarToggle.count()) await sidebarToggle.click();
    await page.locator('[data-sidebar-records-button="true"]').click();
    await page.locator('[data-records-active-section]').waitFor({ state: 'visible', timeout: 15000 });
    const workLogTab = page.locator('[data-record-section-tab="work_log"]');
    if (await workLogTab.count()) await workLogTab.click();
    const recordRow = page.locator('[data-record-section="work_log"] .record-list-row').first();
    await recordRow.waitFor({ state: 'visible', timeout: 15000 });
    await recordRow.click();
    await page.locator('[data-record-sidebar="true"], [data-record-content-editor="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const linkedToggle = page.locator('[data-record-linked-tasks-toggle]').first();
    if (await linkedToggle.count() && await linkedToggle.getAttribute('aria-expanded') !== 'true') await linkedToggle.click();
    await page.locator('[data-record-linked-tasks-list]').waitFor({ state: 'visible', timeout: 15000 });
    await hoverAndRead('B12-record-linked-task', '[data-record-linked-tasks-list] [data-task-description-hover-trigger="true"][data-task-id="dev114-task"]', 'DEV114-TASK-DESC\n第二行 <b>plain</b>', { taskId: 'dev114-task', title: 'DEV114 TASK' });
    const linkedSelect = page.locator('[data-record-linked-tasks-list] select').first();
    record('B13-record-role-control-remains', await linkedSelect.count() === 1 && await linkedSelect.getAttribute('title') === null, { title: await linkedSelect.getAttribute('title') });
    await hoverAndRead('B14-record-task-mention', '[data-record-content-editor="true"] [data-record-task-mention="true"][data-node-id="dev114-task"]', 'DEV114-TASK-DESC\n第二行 <b>plain</b>', { taskId: 'dev114-task', title: 'DEV114 TASK' });
    const mention = page.locator('[data-record-content-editor="true"] [data-record-task-mention="true"][data-node-id="dev114-task"]').first();
    record('B15-record-mention-native-title-removed', await mention.getAttribute('title') === null && await mention.getAttribute('data-title') === 'DEV114 TASK', { title: await mention.getAttribute('title'), dataTitle: await mention.getAttribute('data-title') });

    console.log('DEV114:B16');
    await page.route('**/functions/v1/match_project_knowledge*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        answer: 'DEV114 引用驗證完成。',
        chunks: [
          { chunkId: 'dev114-chunk-task', documentId: 'dev114-doc-task', title: 'DEV114 TASK', content: 'task citation', similarity: 0.99, citation: { documentId: 'dev114-doc-task', chunkId: 'dev114-chunk-task', sourceTable: 'wbs_items', sourceId: 'dev114-task', sourceType: 'wbs_item', title: 'DEV114 TASK' } },
          { chunkId: 'dev114-chunk-project', documentId: 'dev114-doc-project', title: 'DEV114 專案', content: 'project citation', similarity: 0.98, citation: { documentId: 'dev114-doc-project', chunkId: 'dev114-chunk-project', sourceTable: 'projects', sourceId: 'dev114-project', sourceType: 'project', title: 'DEV114 專案' } },
          { chunkId: 'dev114-chunk-missing', documentId: 'dev114-doc-missing', title: 'DEV114 缺失任務', content: 'missing citation', similarity: 0.97, citation: { documentId: 'dev114-doc-missing', chunkId: 'dev114-chunk-missing', sourceTable: 'wbs_items', sourceId: 'dev114-missing', sourceType: 'wbs_item', title: 'DEV114 缺失任務' } },
        ],
      }) });
    });
    const recordClose = page.locator('[data-record-composer-close]').first();
    if (await recordClose.count()) await recordClose.click();
    await page.locator('[data-ai-analysis-open="true"]').click();
    const ragInput = page.locator('textarea').last();
    await ragInput.waitFor({ state: 'visible', timeout: 15000 });
    await ragInput.fill('請提供 DEV114 任務引用');
    await ragInput.press('Enter');
    await page.locator('text=DEV114 引用驗證完成。').waitFor({ state: 'visible', timeout: 15000 });
    const taskCitation = page.locator('button[data-task-description-hover-trigger="true"][data-task-id="dev114-task"]').first();
    if (await taskCitation.count()) await hoverAndRead('B16-rag-task-citation', 'button[data-task-description-hover-trigger="true"][data-task-id="dev114-task"]', 'DEV114-TASK-DESC\n第二行 <b>plain</b>', { taskId: 'dev114-task', title: 'DEV114 TASK', dismissEscape: false });
    else record('B16-rag-task-citation', false, { reason: 'task citation trigger missing' });
    const ragCardEvidence = await page.locator('button').evaluateAll(elements => elements
      .map(element => ({
        sourceTable: element.getAttribute('data-rag-source-table'),
        sourceId: element.getAttribute('data-rag-source-id'),
        text: element.textContent || '',
        hasTrigger: element.hasAttribute('data-task-description-hover-trigger'),
      }))
      .filter(item => item.text.includes('DEV114')));
    const projectCitations = ragCardEvidence.filter(item => item.text.includes('DEV114 專案'));
    const missingCitations = ragCardEvidence.filter(item => item.text.includes('DEV114 缺失任務'));
    const projectCitationCount = projectCitations.length;
    const missingCitationCount = missingCitations.length;
    const projectTriggerCount = projectCitations.reduce((count, item) => count + (item.hasTrigger ? 1 : 0), 0);
    const missingTriggerCount = missingCitations.reduce((count, item) => count + (item.hasTrigger ? 1 : 0), 0);
    record('B17-rag-non-task-and-missing-have-no-hover', projectCitationCount === 1 && missingCitationCount === 1 && projectTriggerCount === 0 && missingTriggerCount === 0, { projectCitationCount, missingCitationCount, projectTriggerCount, missingTriggerCount, ragCardEvidence });

    console.log('DEV114:B18');
    await switchView('calendar_subscriptions', '[data-calendar-subscription-local-preview="true"]');
    const cal = page.locator('[data-calendar-subscription-preview-event][data-task-id="dev114-calendar"]');
    await cal.waitFor({ state: 'visible', timeout: 15000 });
    await hoverAndRead('B18-calendar-inline-description', '[data-calendar-subscription-preview-event][data-task-id="dev114-calendar"]', 'DEV114-CALENDAR-INLINE-DESC', { taskId: 'dev114-calendar', title: 'DEV114 跨看板日曆任務' });
    record('B19-calendar-preview-identity-preserved', await cal.getAttribute('data-preview-event-task-id') === 'dev114-calendar' && await cal.getAttribute('data-preview-event-board-id') === 'dev114-board-2', { eventTaskId: await cal.getAttribute('data-preview-event-task-id'), boardId: await cal.getAttribute('data-preview-event-board-id') });

    await switchView('board', '[data-task-surface-source="true"][data-task-id="dev114-placed"]');
    await assertNoHover('B20-empty-description-suppressed', '[data-task-surface-source="true"][data-task-id="dev114-empty"]');
    const stale = page.locator('[data-task-surface-source="true"][data-task-id="dev114-placed"], [data-task-description-hover-trigger="true"][data-task-id="dev114-placed"]').first();
    await stale.hover();
    await page.waitForTimeout(450);
    await stale.evaluate(el => el.setAttribute('data-task-id', 'dev114-task'));
    record('B21-stale-trigger-identity-guard', await waitForNoCard(700), { cardCount: await card().count() });
    await page.evaluate(() => {
      const changed = document.querySelector('[data-task-surface-source="true"][data-task-id="dev114-task"], [data-task-description-hover-trigger="true"][data-task-id="dev114-task"]');
      changed?.setAttribute('data-task-id', 'dev114-placed');
    });

    console.log('DEV114:B22');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.mouse.move(2, 2);
    await switchView('board', '[data-task-surface-source="true"][data-task-id="dev114-task"]');
    const narrowDesktopEvidence = await hoverAndRead(
      'B22-narrow-desktop-description',
      '[data-task-surface-source="true"][data-task-id="dev114-task"]',
      'DEV114-TASK-DESC\n第二行 <b>plain</b>',
      { taskId: 'dev114-task', title: 'DEV114 TASK' },
    );
    record(
      'B23-1024-viewport-clamp',
      narrowDesktopEvidence.viewport.width === 1024
        && narrowDesktopEvidence.viewport.height === 768
        && narrowDesktopEvidence.rect.left >= 12
        && narrowDesktopEvidence.rect.top >= 12
        && narrowDesktopEvidence.rect.right <= narrowDesktopEvidence.viewport.width - 12
        && narrowDesktopEvidence.rect.bottom <= narrowDesktopEvidence.viewport.height - 12
        && narrowDesktopEvidence.documentWidth <= narrowDesktopEvidence.viewport.width,
      { narrowDesktopEvidence },
    );

    await page.mouse.move(2, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobileWorkbenchNav = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    if (await mobileWorkbenchNav.count()) await mobileWorkbenchNav.click({ force: true });
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const mobileSurface = page.locator('[data-task-workbench-unplaced-task-card="true"][data-task-id="dev114-unplaced"]').first();
    const touchGate = await page.evaluate(() => {
      const original = window.matchMedia;
      window.__DEV114_ORIGINAL_MATCH_MEDIA = original;
      window.matchMedia = query => query.includes('pointer: fine') ? { matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : original.call(window, query);
      return true;
    });
    await mobileSurface.hover();
    record('B24-mobile-no-horizontal-overflow', await waitForNoCard(1180) && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth), viewportWidth: await page.evaluate(() => window.innerWidth), cardCount: await card().count() });

    await mobileSurface.hover();
    const coarseNone = await waitForNoCard(1180);
    await page.evaluate(() => { if (window.__DEV114_ORIGINAL_MATCH_MEDIA) window.matchMedia = window.__DEV114_ORIGINAL_MATCH_MEDIA; });
    record('B25-coarse-pointer-gate', touchGate && coarseNone, { cardCount: await card().count() });

    await page.setViewportSize(result.viewport);
    await page.mouse.move(2, 2);
    record('B26-no-visible-browser-errors', result.browserErrors.length === 0 && result.httpErrors.filter(item => !item.url.includes('favicon')).length === 0, { browserErrors: result.browserErrors, httpErrors: result.httpErrors });
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.stack || error.message : String(error));
    record('B99-unhandled-browser-verifier-error', false, { error: String(error) });
  }

  result.status = failures.length === 0 ? 'PASS' : 'FAIL';
  result.failureCount = failures.length;
  result.failures = failures;
  result.generatedAt = new Date().toISOString();
  await page.evaluate(({ artifactKey, result }) => {
    window[artifactKey] = result;
    sessionStorage.setItem(artifactKey, JSON.stringify(result));
  }, { artifactKey, result });
  console.log(JSON.stringify(result));
  return result;
}
