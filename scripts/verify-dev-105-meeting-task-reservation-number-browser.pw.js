/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-105';
  const BASE_URL = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:4000';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  const screenshots = {
    desktop: `${OUTPUT_DIR}/desktop-board-hierarchy.png`,
    tablet: `${OUTPUT_DIR}/tablet-long-title.png`,
    mobile: `${OUTPUT_DIR}/mobile-meeting-negative.png`,
  };

  page.on('console', message => {
    // Chromium emits this known accessibility warning for the existing rich
    // text editor when focus moves outside it; it is unrelated to DEV-105.
    if (message.type() === 'warning' && message.text().includes('When using "display: flex" or "display: inline-flex" on an element containing content editable')) return;
    if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) httpFailures.push(`${response.status()} ${response.url()}`);
  });

  const account = (id, displayName = id) => ({
    id,
    uid: id,
    email: `${id}@projed.local`,
    displayName,
    createdAt: 1704067200000,
  });
  const workspaceId = 'dev105-workspace';
  const boardId = 'dev105-board';
  const makeNode = (id, title, parentId, order, nodeType = 'task', status = 'todo', endDate = null) => ({
    id,
    workspaceId,
    boardId,
    parentId,
    order,
    nodeType,
    status,
    title,
    endDate,
    startDate: null,
    isDurationLocked: false,
    kanbanStageId: nodeType === 'group' ? undefined : 'task-l1',
    assigneeIds: [],
    collaboratorIds: [],
    tagIds: [],
    createdAt: 1704067200000 + order,
    updatedAt: 1704067200000 + order,
  });
  const workspace = {
    id: workspaceId,
    title: 'DEV-105 會議預約數字',
    ownerId: 'local-test-user',
    members: ['local-test-user', 'local-test-member'],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: boardId, title: '會議看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const nodes = {
    'task-l1': makeNode('task-l1', '產品交付與治理', null, 0, 'group', 'todo', '2026-09-10'),
    'task-l2': makeNode('task-l2', 'API 權限整理', 'task-l1', 0, 'task', 'in_progress', '2026-09-12'),
    'task-l3': makeNode('task-l3', 'L3 權限矩陣與長標題驗證項目', 'task-l2', 0, 'task', 'todo', '2026-09-13'),
    'task-l4': makeNode('task-l4', 'L4 無預約值的回歸項目', 'task-l3', 0, 'task', 'todo', null),
  };
  const trackingReferences = [{
    id: 'ref-l2',
    taskId: 'task-l2',
    workspaceId,
    boardId,
    sourceBoardId: boardId,
    parentPlacementId: 'primary:task-l1',
    order: 0.5,
    revision: 1,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  }];
  const boardMembers = {
    [`${workspaceId}:${boardId}`]: [
      { userId: 'local-test-user', role: 'owner', createdAt: 1704067200000, updatedAt: 1704067200000 },
      { userId: 'local-test-member', role: 'member', createdAt: 1704067200000, updatedAt: 1704067200000 },
    ],
  };

  const writeFixture = async ({ userId = 'local-test-user', viewport = { width: 1440, height: 900 }, records = [], recovery = null } = {}) => {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ user, workspace, nodes, trackingReferences, boardMembers, records, recovery }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', user.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(user));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify(boardMembers));
      localStorage.setItem('projed-local-test.taskTrackingReferences.v1', JSON.stringify(trackingReferences));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(records));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      // The fixed local-test bootstrap clamps this marker to a minimum of 12;
      // keeping it at 12 prevents the bootstrap from replacing this fixture.
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
      if (recovery) sessionStorage.setItem(`projed:meeting-draft-recovery:v1:${recovery.scopeKey}`, JSON.stringify(recovery));
    }, {
      user: account(userId, userId === 'local-test-user' ? 'DEV-105 主持人' : 'DEV-105 參與者'),
      workspace,
      nodes,
      trackingReferences,
      boardMembers,
      records,
      recovery,
    });
    await page.reload({ waitUntil: 'networkidle' });
    const fixedEnvironment = page.getByRole('button', { name: /使用固定測試環境/ }).first();
    if (await fixedEnvironment.count() && await fixedEnvironment.isVisible().catch(() => false)) {
      await fixedEnvironment.click({ force: true });
      await page.waitForTimeout(250);
    }
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator(`[data-task-surface-frame-kind="kanban-column"][data-task-id="task-l1"]`).waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300);
  };

  const startMeeting = async () => {
    const start = page.getByRole('button', { name: '新增會議記錄' });
    await start.waitFor({ state: 'visible', timeout: 10000 });
    await start.click();
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(180);
  };

  const frame = placementId => page.locator(`[data-task-surface-frame="true"][data-task-placement-id="${placementId}"]`).first();
  const source = async (placementId, kind = 'source') => {
    const target = frame(placementId);
    await target.scrollIntoViewIfNeeded();
    if (kind === 'column') return target.locator('[data-kanban-column-header="true"]').first();
    return target.locator('[data-task-surface-source="true"]').first();
  };
  const openMenu = async (placementId, kind) => {
    const target = await source(placementId, kind);
    await target.click({ button: 'right', position: { x: 24, y: 10 } });
    const menu = page.locator('[data-global-context-menu="true"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(100);
    return menu;
  };
  const closeMenu = async () => {
    await page.keyboard.press('Escape');
    const menu = page.locator('[data-global-context-menu="true"]');
    await page.waitForTimeout(180);
    if (await menu.isVisible().catch(() => false)) throw new Error(`Escape did not close menu: ${await menu.innerText()}`);
  };
  const markValues = async placementId => frame(placementId).locator('[data-meeting-task-reservation-mark="true"]').evaluateAll(elements => elements.map(element => ({ value: element.getAttribute('data-meeting-task-reservation-value'), text: element.textContent?.trim(), hasIcon: Boolean(element.querySelector('[data-meeting-task-reservation-icon="true"]')), isIntegratedToken: element.getAttribute('data-meeting-task-reservation-token') === 'true' })));
  const directMarkValues = async placementId => frame(placementId).evaluate(element => {
    const sourceRoot = element.querySelector('[data-task-surface-source="true"]') || element.querySelector('[data-kanban-column-header="true"]');
    const mark = sourceRoot?.querySelector('[data-meeting-task-reservation-mark="true"]');
    return mark ? [{ value: mark.getAttribute('data-meeting-task-reservation-value'), text: mark.textContent?.trim(), hasIcon: Boolean(mark.querySelector('[data-meeting-task-reservation-icon="true"]')), isIntegratedToken: mark.getAttribute('data-meeting-task-reservation-token') === 'true' }] : [];
  });
  const setReservation = async (placementId, value, kind) => {
    const menu = await openMenu(placementId, kind);
    const action = menu.locator('[data-task-action-id="task.edit-meeting-reservation"]');
    await action.waitFor({ state: 'visible', timeout: 5000 });
    await action.click();
    const input = page.locator('[data-meeting-reservation-input="true"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    const focused = await input.evaluate(element => document.activeElement === element);
    if (!focused) throw new Error(`reservation input did not autofocus for ${placementId}`);
    const inputBackground = await input.evaluate(element => getComputedStyle(element).backgroundColor);
    if (inputBackground !== 'rgb(255, 255, 255)') throw new Error(`reservation input should use white background: ${inputBackground}`);
    await input.fill(String(value));
    await input.press('Enter');
    await page.waitForTimeout(240);
    const menuAfterCommit = page.locator('[data-global-context-menu="true"]');
    if (await menuAfterCommit.isVisible().catch(() => false)) {
      throw new Error(`reservation commit did not close menu for ${placementId}: ${await menuAfterCommit.innerText()}`);
    }
    await page.waitForTimeout(120);
    return { focused, inputBackground, marks: await directMarkValues(placementId) };
  };
  const visibleErrors = async () => page.locator('.inline-error,[role="alert"]').evaluateAll(elements => elements
    .filter(element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; })
    .map(element => element.textContent?.trim()).filter(Boolean));
  const runCase = async (id, expected, flow) => {
    const started = Date.now();
    try {
      const actual = await flow();
      cases.push({ id, status: 'PASS', expected, actual, durationMs: Date.now() - started });
      return actual;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cases.push({ id, status: 'FAIL', expected, actual: null, failure: message, durationMs: Date.now() - started });
      await page.screenshot({ path: `${OUTPUT_DIR}/${id}-failure.png`, fullPage: false }).catch(() => undefined);
      throw error;
    }
  };

  await runCase('ROT-105-01', 'Host can use one real right-click flow and all Board hierarchy levels render the canonical mark.', async () => {
    await writeFixture();
    await startMeeting();
    const l1 = await setReservation('primary:task-l1', 5, 'column');
    const l2 = await setReservation('primary:task-l2', 15);
    const l3 = await setReservation('primary:task-l3', 999);
    const trackingMarks = await markValues('ref-l2');
    const emptyMarks = await directMarkValues('primary:task-l4');
    if (JSON.stringify(l2.marks) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`L2 mark mismatch: ${JSON.stringify(l2.marks)}`);
    if (JSON.stringify(trackingMarks) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`tracking canonical mark mismatch: ${JSON.stringify(trackingMarks)}`);
    if (JSON.stringify(l1.marks) !== JSON.stringify([{ value: '5', text: '5', hasIcon: false, isIntegratedToken: true }])) throw new Error(`L1 mark mismatch: ${JSON.stringify(l1.marks)}`);
    if (JSON.stringify(l3.marks) !== JSON.stringify([{ value: '999', text: '999', hasIcon: false, isIntegratedToken: true }])) throw new Error(`L3 mark mismatch: ${JSON.stringify(l3.marks)}`);
    if (emptyMarks.length !== 0) throw new Error(`empty task unexpectedly rendered mark: ${JSON.stringify(emptyMarks)}`);
    const menu = await openMenu('primary:task-l2');
    const taskTitleCount = await menu.locator('[data-context-menu-current-task-title="true"]').count();
    await closeMenu();
    if (taskTitleCount !== 0) throw new Error(`Task right-click menu still renders task title: ${taskTitleCount}`);
    await page.screenshot({ path: screenshots.desktop, fullPage: false });
    const temporary = await setReservation('primary:task-l4', 7);
    const cleared = await setReservation('primary:task-l4', '');
    const clearedMarks = await directMarkValues('primary:task-l4');
    if (JSON.stringify(temporary.marks) !== JSON.stringify([{ value: '7', text: '7', hasIcon: false, isIntegratedToken: true }])) throw new Error(`temporary mark mismatch: ${JSON.stringify(temporary.marks)}`);
    if (clearedMarks.length !== 0) throw new Error(`clear did not remove reservation mark: ${JSON.stringify(clearedMarks)}`);
    return { l1: l1.marks, l2: l2.marks, l3: l3.marks, tracking: trackingMarks, empty: emptyMarks, taskTitleCount, temporary: temporary.marks, cleared: clearedMarks };
  });

  await runCase('ROT-105-02', 'At 1024px title/date/mark/toggle remain in one row across L1/L2/L3+ without overflow.', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(220);
    const geometry = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const title = element.querySelector('[data-task-title-slot="true"]');
        const date = element.querySelector('[data-task-date-badge="true"]');
        const mark = element.querySelector('[data-meeting-task-reservation-mark="true"]');
        const toggle = element.querySelector('[data-kanban-checklist-toggle="true"]');
        const titleRect = title?.getBoundingClientRect();
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          title: titleRect ? { height: titleRect.height, scrollWidth: title.scrollWidth, clientWidth: title.clientWidth } : null,
          dateX: date?.getBoundingClientRect().x ?? null,
          markX: mark?.getBoundingClientRect().x ?? null,
          markText: mark?.textContent?.trim() ?? null,
          markHasIcon: Boolean(mark?.querySelector('[data-meeting-task-reservation-icon="true"]')),
          markIsIntegratedToken: mark?.getAttribute('data-meeting-task-reservation-token') === 'true',
          markStyle: mark ? (() => { const style = getComputedStyle(mark); return { backgroundColor: style.backgroundColor, color: style.color, borderWidth: style.borderWidth }; })() : null,
          toggleX: toggle?.getBoundingClientRect().x ?? null,
          overflow: element.scrollWidth > element.clientWidth,
        };
      };
      return {
        l1: read('[data-task-surface-frame-kind="kanban-column"][data-task-id="task-l1"]'),
        l2: read('[data-task-surface-frame-kind="kanban-card"][data-task-id="task-l2"]'),
        l3: read('[data-task-surface-frame-kind="checklist-row"][data-task-id="task-l3"]'),
      };
    });
    for (const [level, item] of Object.entries(geometry)) {
      if (!item || item.overflow) throw new Error(`${level} overflow or missing geometry: ${JSON.stringify(item)}`);
      if (item.markText !== `${level === 'l1' ? '5' : level === 'l2' ? '15' : '999'}`) throw new Error(`${level} mark text mismatch: ${JSON.stringify(item)}`);
      if (item.markHasIcon) throw new Error(`${level} reservation icon should be absent: ${JSON.stringify(item)}`);
      if (!item.markIsIntegratedToken) throw new Error(`${level} reservation value token contract missing: ${JSON.stringify(item)}`);
      if (!item.markStyle || item.markStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || item.markStyle.color !== 'rgb(0, 0, 0)' || item.markStyle.borderWidth !== '0px') throw new Error(`${level} reservation token style mismatch: ${JSON.stringify(item)}`);
      if (item.dateX !== null && item.markX !== null && item.markX < item.dateX) throw new Error(`${level} mark precedes date: ${JSON.stringify(item)}`);
      if (item.title && item.title.height > 26) throw new Error(`${level} title wrapped: ${JSON.stringify(item.title)}`);
    }
    await page.screenshot({ path: screenshots.tablet, fullPage: false });
    return geometry;
  });

  await runCase('ROT-105-04', 'Invalid value stays in the same menu; Escape, outside click and scroll cancel without mutation.', async () => {
    const menu = await openMenu('primary:task-l2');
    await menu.locator('[data-task-action-id="task.edit-meeting-reservation"]').click();
    const input = page.locator('[data-meeting-reservation-input="true"]');
    await input.fill('0');
    await input.press('Enter');
    await page.locator('[data-meeting-reservation-editor="true"] [role="alert"]').waitFor({ state: 'visible', timeout: 3000 });
    const invalid = { error: (await visibleErrors()).join(' | '), focused: await input.evaluate(element => document.activeElement === element), menuOpen: await page.locator('[data-global-context-menu="true"]').isVisible(), marks: await directMarkValues('primary:task-l2') };
    if (invalid.error !== '請輸入 1–999 的整數' || !invalid.focused || !invalid.menuOpen || JSON.stringify(invalid.marks) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`invalid contract mismatch: ${JSON.stringify(invalid)}`);
    await input.press('Escape');
    await page.waitForTimeout(180);
    if (await page.locator('[data-global-context-menu="true"]').isVisible().catch(() => false)) throw new Error('Escape did not close reservation editor menu');
    const outsideMenu = await openMenu('primary:task-l2');
    await outsideMenu.locator('[data-task-action-id="task.edit-meeting-reservation"]').click();
    await page.locator('[data-meeting-reservation-input="true"]').fill('21');
    await page.waitForTimeout(800);
    await page.mouse.click(8, 8);
    await page.waitForTimeout(180);
    if (await page.locator('[data-global-context-menu="true"]').isVisible().catch(() => false)) throw new Error('outside click did not close reservation menu');
    const afterOutside = await directMarkValues('primary:task-l2');
    if (JSON.stringify(afterOutside) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`outside click mutated reservation: ${JSON.stringify(afterOutside)}`);
    const scrollMenu = await openMenu('primary:task-l2');
    await scrollMenu.locator('[data-task-action-id="task.edit-meeting-reservation"]').click();
    await page.locator('[data-meeting-reservation-input="true"]').fill('22');
    await page.evaluate(() => {
      window.scrollTo(0, 1);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(180);
    if (await page.locator('[data-global-context-menu="true"]').isVisible().catch(() => false)) throw new Error('scroll did not close reservation menu');
    const afterScroll = await directMarkValues('primary:task-l2');
    if (JSON.stringify(afterScroll) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`scroll mutated reservation: ${JSON.stringify(afterScroll)}`);
    return { invalid, afterOutside, afterScroll };
  });

  await runCase('ROT-105-03', 'Recovered meeting draft is readable by member but no reservation action is exposed.', async () => {
    const now = Date.now();
    const scopeKey = `${encodeURIComponent('local-test-member')}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(boardId)}:`;
    const recovery = {
      schemaVersion: 1,
      scopeKey,
      ownerUserId: 'local-test-member',
      workspaceId,
      boardId,
      draftId: 'meeting-105-recovered',
      draft: {
        id: 'meeting-105-recovered',
        type: 'meeting',
        title: 'DEV-105 主持人草稿',
        content: '已配置預約數字',
        status: 'draft',
        visibility: 'tenant',
        participantsText: '',
        occurredAt: now,
        startedAt: null,
        endedAt: null,
        recordedBy: 'local-test-user',
        metadata: { meetingTaskReservations: { schemaVersion: 1, values: { 'task-l1': 5, 'task-l2': 15, 'task-l3': 999 } } },
        taskLinks: [],
      },
      baselineSignature: null,
      localSignature: 'dev105-recovery-signature',
      remoteSignature: null,
      savedAt: now,
      contentCursorOffset: 0,
      meetingActivities: [],
      appendedMeetingActivityIds: [],
    };
    await writeFixture({ userId: 'local-test-member', recovery });
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await frame('primary:task-l2').scrollIntoViewIfNeeded();
    const l2Marks = await directMarkValues('primary:task-l2');
    const menu = await openMenu('primary:task-l2');
    const actionCount = await menu.locator('[data-task-action-id="task.edit-meeting-reservation"]').count();
    await closeMenu();
    if (actionCount !== 0) throw new Error(`member unexpectedly received reservation action: ${actionCount}`);
    if (JSON.stringify(l2Marks) !== JSON.stringify([{ value: '15', text: '15', hasIcon: false, isIntegratedToken: true }])) throw new Error(`member lost readable mark: ${JSON.stringify(l2Marks)}`);
    return { actionCount, l2Marks, owner: 'local-test-user', viewer: 'local-test-member' };
  });

  await runCase('ROT-105-05', '390px normal entry has no meeting mode, action, editor or reservation mark.', async () => {
    await writeFixture({ viewport: { width: 390, height: 844 } });
    const state = await page.evaluate(() => ({
      meetingEntry: Array.from(document.querySelectorAll('button')).some(button => (button.textContent || '').includes('新增會議記錄')),
      meetingWorkflow: Boolean(document.querySelector('[data-record-workflow-kind="meeting"]')),
      editor: Boolean(document.querySelector('[data-meeting-reservation-input="true"]')),
      marks: document.querySelectorAll('[data-meeting-task-reservation-mark="true"]').length,
    }));
    if (state.meetingEntry || state.meetingWorkflow || state.editor || state.marks !== 0) throw new Error(`mobile negative boundary failed: ${JSON.stringify(state)}`);
    await page.screenshot({ path: screenshots.mobile, fullPage: false });
    return state;
  });

  const passed = cases.every(item => item.status === 'PASS') && diagnostics.length === 0 && httpFailures.length === 0;
  const result = {
    dev: 'DEV-105',
    devId: 'DEV-105',
    sourceRevision: 'working-tree',
    environment: 'local-test-browser',
    provider: 'local-test',
    command: 'npm run verify:dev-105-meeting-task-reservation-number-browser',
    exitCode: passed ? 0 : 1,
    assertionCount: cases.length,
    caseIds: cases.map(item => item.id),
    viewports: [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }],
    cases,
    status: passed ? 'passed' : 'failed',
    passed,
    qaStatus: passed ? 'PASS' : 'FAIL',
    releaseStatus: 'NOT READY',
    summary: {
      PASS: cases.filter(item => item.status === 'PASS').length,
      FAIL: cases.filter(item => item.status === 'FAIL').length,
      NOT_RUN: 0,
      BLOCKED: 0,
    },
    diagnostics,
    httpFailures,
    artifactPaths: Object.values(screenshots),
    generatedAt: new Date().toISOString(),
  };
  await page.evaluate(value => {
    sessionStorage.setItem('__DEV105_ARTIFACT', JSON.stringify(value));
    localStorage.setItem('__DEV105_ARTIFACT', JSON.stringify(value));
    window.__DEV105_ARTIFACT = value;
  }, result);
  if (!passed) throw new Error(`DEV-105 browser verification failed: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
