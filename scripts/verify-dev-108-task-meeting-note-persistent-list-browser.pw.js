/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-108-task-meeting-note';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  const screenshots = [];
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) httpFailures.push(`${response.status()} ${response.url()}`);
  });
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const account = { id: 'dev108-user', uid: 'dev108-user', email: 'dev108@projed.local', displayName: 'DEV-108 QA', createdAt: 1704067200000 };
  const workspace = {
    id: 'dev108-workspace', title: 'DEV-108 任務會議補記', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev108-board', title: 'DEV-108 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const node = {
    id: 'dev108-task', workspaceId: workspace.id, boardId: 'dev108-board', parentId: null, title: 'DEV-108 任務',
    status: 'todo', nodeType: 'task', order: 0, detailNotes: [{ id: 'note_default', title: '任務說明', content: '' }], description: '',
    createdAt: 1704067200000, updatedAt: 1704067200000,
  };
  const makeRecord = (id, status, lines, baseTime) => {
    const content = `## 任務討論\n${lines.map(item => `- ${item.time} @[DEV-108 任務](task:dev108-task)：${item.text}`).join('\n')}`;
    return {
      id, workspaceId: workspace.id, boardId: workspace.boards[0].id, type: 'meeting', title: id,
      content, status, visibility: 'private', occurredAt: baseTime, recordedBy: account.id, updatedAt: baseTime,
      createdAt: baseTime - 1000, taskLinks: [{ recordId: id, workspaceId: workspace.id, boardId: workspace.boards[0].id, nodeId: node.id, role: 'related', createdAt: baseTime }],
      metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: lines.map((item, index) => ({ id: `${id}-entry-${index}`, taskId: node.id, text: item.text, occurredAt: baseTime + index * 60000, anchor: { lineIndex: index + 1, sourceToken: `${item.time}|${node.id}` } })) } },
    };
  };
  const fixtureNow = Date.now();
  const records = [
    makeRecord('dev108-active', 'published', [
      { time: '09:00', text: '確認 API 邊界' }, { time: '09:10', text: '補上驗證案例' }, { time: '09:20', text: '排入回歸測試' },
    ], fixtureNow - 7200000),
    makeRecord('dev108-archived', 'archived', [{ time: '08:30', text: '歷史補記保留' }], fixtureNow - 10800000),
  ];
  const seed = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, node, records }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({ [node.id]: node }));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:${workspace.boards[0].id}`]: [{ userId: account.id, role: 'owner' }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(records));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, node, records });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const openTask = async () => {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev108-task' } })));
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('[data-task-detail-notes-section]').waitFor({ state: 'visible', timeout: 10000 });
    return modal;
  };
  const runCase = async (id, expected, flow) => {
    const started = Date.now();
    try { const actual = await flow(); cases.push({ id, status: 'PASS', expected, actual, durationMs: Date.now() - started }); return actual; }
    catch (error) { const message = error instanceof Error ? error.message : String(error); cases.push({ id, status: 'FAIL', expected, failure: message, durationMs: Date.now() - started }); await page.screenshot({ path: `${OUTPUT_DIR}/${id}-failure.png`, fullPage: false }).catch(() => undefined); throw new Error(`${id}: ${message}`); }
  };

  await seed({ width: 1440, height: 900 });
  let modal;
  await runCase('B01', 'task detail opens without runtime error', async () => {
    modal = await openTask();
    assert(await modal.locator('[data-task-meeting-quick-notes]').count() === 1, 'quick-note section should mount');
    return { section: 1 };
  });
  await runCase('B02', 'active and archived records are projected', async () => {
    await modal.locator('[data-task-meeting-quick-note-row]').first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await modal.locator('[data-task-meeting-quick-note-row]').count();
    assert(count === 3, 'latest three entries should be visible by default', { count });
    const dayLabels = await modal.locator('[data-task-meeting-quick-note-row] time').allTextContents();
    assert(dayLabels.every(label => /^\d{2}\/\d{2}$/.test(label.trim())), 'quick-note rows should show day labels only', { dayLabels });
    assert((await modal.locator('[data-task-meeting-quick-notes-toggle]').textContent())?.includes('其餘 1 筆'), 'older entry toggle should be visible');
    await page.screenshot({ path: `${OUTPUT_DIR}/desktop-immediate-1440x900.png`, fullPage: true });
    screenshots.push(`${OUTPUT_DIR}/desktop-immediate-1440x900.png`);
    return { visibleRows: count };
  });
  await runCase('B03', 'expand reveals all entries inline and source removal removes the archived projection', async () => {
    await modal.locator('[data-task-meeting-quick-notes-toggle]').click();
    const count = await modal.locator('[data-task-meeting-quick-note-row]').count();
    assert(count === 4, 'expanded list should reveal archived entry', { count });
    await page.screenshot({ path: `${OUTPUT_DIR}/desktop-expanded-1440x900.png`, fullPage: true });
    screenshots.push(`${OUTPUT_DIR}/desktop-expanded-1440x900.png`);
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
    await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(records.filter(record => record.id !== 'dev108-archived')));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    modal = await openTask();
    await modal.locator('[data-task-meeting-quick-note-row]').first().waitFor({ state: 'visible', timeout: 10000 });
    const afterRemoval = await modal.locator('[data-task-meeting-quick-note-row]').count();
    assert(afterRemoval === 3, 'source removal should remove the archived projection after reload', { afterRemoval });
    assert(await modal.getByText('歷史補記保留', { exact: true }).count() === 0, 'source removal must not leave stale text');
    return { expandedRows: count, afterRemoval };
  });
  await runCase('B04', 'legacy blue composer is absent', async () => {
    assert(await modal.getByText('本次會議', { exact: true }).count() === 0, 'old meeting section title should be absent');
    assert(await modal.locator('[data-task-meeting-quick-notes-composer]').count() === 0, 'composer is only available in meeting mode');
    return { oldComposer: 0 };
  });
  await runCase('B04a', 'retired inline history controls and panel are absent', async () => {
    const retiredSelectors = await modal.locator('[data-task-knowledge-trigger], [data-task-knowledge-toggle], [data-task-knowledge-panel]').count();
    const retiredText = await modal.getByText(/^(查看歷史資訊|收合歷史資訊|歷史資訊)$/).count();
    assert(retiredSelectors === 0 && retiredText === 0, 'task detail should not retain the retired inline history surface', { retiredSelectors, retiredText });
    return { retiredSelectors, retiredText };
  });
  await modal.getByRole('button', { name: '關閉任務詳情' }).click();
  await modal.waitFor({ state: 'hidden', timeout: 10000 });

  await runCase('B05', 'meeting mode composer is shown in the same section', async () => {
    const meetingButton = page.getByRole('button', { name: '新增會議記錄' }).first();
    if (await meetingButton.count() === 0) {
      await page.getByRole('button', { name: /紀錄/ }).first().click().catch(() => undefined);
    }
    await meetingButton.waitFor({ state: 'visible', timeout: 10000 });
    await meetingButton.click();
    modal = await openTask();
    await modal.locator('[data-task-meeting-quick-notes-composer]').waitFor({ state: 'visible', timeout: 10000 });
    return { composer: 1 };
  });
  await runCase('B06', 'append keeps input and list in one first-layer section', async () => {
    const composer = modal.locator('[data-task-meeting-quick-notes-composer]');
    const input = composer.locator('textarea');
    await input.fill('會議中新增補記');
    await composer.getByRole('button', { name: '加入', exact: true }).click();
    await page.waitForTimeout(500);
    const afterAppend = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-task-meeting-quick-note-row]').length,
      draftText: document.body.textContent?.includes('會議中新增補記') || false,
      inputValue: document.querySelector('[data-task-meeting-quick-notes-composer] textarea')?.value || '',
      stored: localStorage.getItem('projed-local-test.knowledgeRecords') || '',
    }));
    assert(afterAppend.rows === 3, 'in-memory append keeps the compact latest-three projection', afterAppend);
    assert(await modal.getByText('會議中新增補記', { exact: true }).count() >= 1, 'new quick note should remain visible');
    assert(afterAppend.inputValue === '', 'input clears only after in-memory append succeeds', afterAppend);
    return { rows: afterAppend.rows };
  });
  await runCase('B07', 'compact section has no horizontal overflow', async () => {
    const health = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(health.scrollWidth <= health.width + 1, 'desktop task detail has no horizontal overflow', health);
    return health;
  });
  await runCase('B08', 'mobile list remains compact and readable', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const health = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, section: Boolean(document.querySelector('[data-task-meeting-quick-notes]')), composer: Boolean(document.querySelector('[data-task-meeting-quick-notes-composer]')) }));
    assert(health.section && !health.composer && health.scrollWidth <= health.width + 1, 'mobile quick-note section should remain visible without overflow and keep meeting composer unavailable', health);
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-390x844.png`, fullPage: true }); screenshots.push(`${OUTPUT_DIR}/mobile-390x844.png`);
    return health;
  });
  await runCase('B09', 'browser surface has no visible errors', async () => {
    const visibleAlerts = await page.locator('[role="alert"]').evaluateAll(elements => elements.filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).map(element => element.textContent?.trim()).filter(Boolean));
    assert(visibleAlerts.length === 0, 'no visible quick-note errors expected', { visibleAlerts });
    assert(diagnostics.length === 0, 'no browser runtime errors expected', { diagnostics });
    assert(httpFailures.length === 0, 'no HTTP failures expected', { httpFailures });
    return { visibleAlerts, diagnostics, httpFailures };
  });
  const artifact = { devId: 'DEV-108', status: 'PASS', sourceRevision: 'working-tree', environment: 'local-test-browser', cases, screenshots, diagnostics, httpFailures, generatedAt: new Date().toISOString() };
  await page.evaluate(result => { window.__DEV108_ARTIFACT = result; }, artifact);
}
