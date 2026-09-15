/* eslint-disable */
async (page) => {
  console.log('DEV119_BROWSER_START');
  const OUTPUT_DIR = 'output/playwright/dev-119-goal-cell-actions';
  const result = {
    devId: 'DEV-119', status: 'FAIL', sourceRevision: 'working-tree',
    environment: 'local-test / Chromium', route: '/',
    viewports: [{ width: 1440, height: 900 }, { width: 1298, height: 698 }],
    actors: [{ id: 'dev119-editor', role: 'owner' }, { id: 'dev119-viewer', role: 'viewer' }],
    fixtureIds: ['G119-LEGACY', 'G119-SPAN', 'G119-LONG-MEETING'],
    mutationCounts: { task: 0, record: 0, taskLink: 0 },
    cases: [], browserErrors: [], httpFailures: [], screenshots: [],
    runtime: { port: 4000, reused: true, ownerPid: null, cleaned: false, portReleased: false },
  };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, ok, details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) result.httpFailures.push({ status: response.status(), url: response.url() }); });

  const account = { id: 'dev119-editor', uid: 'dev119-editor', email: 'dev119@projed.local', displayName: 'DEV-119 Editor', createdAt: 1704067200000 };
  const workspace = { id: 'G119-workspace', title: 'DEV-119 Goal', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000, boards: [{ id: 'G119-board', title: 'DEV-119 board', dependencies: [], order: 1, createdAt: 1704067200000 }] };
  const nodes = {
    'G119-LEGACY': { id: 'G119-LEGACY', workspaceId: workspace.id, boardId: 'G119-board', parentId: null, title: 'LEGACY purpose', status: 'todo', nodeType: 'group', order: 0, description: '第一行目的\n第二行目的\n第三行目的\n第四行目的\n第五行目的', startDate: '2026-09-01', endDate: '2026-09-15' },
    'G119-SPAN': { id: 'G119-SPAN', workspaceId: workspace.id, boardId: 'G119-board', parentId: null, title: 'SPAN parent', status: 'todo', nodeType: 'group', order: 1, description: '父層跨列說明\n補充 owner span\n保留 Y 軸捲動', startDate: '2026-09-01', endDate: '2026-09-15' },
    'G119-SPAN-child': { id: 'G119-SPAN-child', workspaceId: workspace.id, boardId: 'G119-board', parentId: 'G119-SPAN', title: 'SPAN child', status: 'todo', nodeType: 'task', order: 2, description: '', startDate: '2026-09-02', endDate: '2026-09-12' },
    'G119-MEETING': { id: 'G119-MEETING', workspaceId: workspace.id, boardId: 'G119-board', parentId: null, title: 'Meeting owner', status: 'todo', nodeType: 'task', order: 3, description: '', startDate: '2026-09-02', endDate: '2026-09-12' },
  };
  const meetingRecord = {
    id: 'G119-LONG-MEETING', type: 'meeting', workspaceId: workspace.id, boardId: 'G119-board', title: 'DEV-119 meeting',
    content: '## 任務討論\n- 09:00 @[Meeting owner](task:G119-MEETING)：第一筆\n- 09:05 @[Meeting owner](task:G119-MEETING)：第二筆\n- 09:10 @[Meeting owner](task:G119-MEETING)：第三筆\n- 09:15 @[Meeting owner](task:G119-MEETING)：第四筆\n- 09:20 @[Meeting owner](task:G119-MEETING)：第五筆',
    status: 'published', visibility: 'project', occurredAt: 1704067200000, taskLinks: [{ nodeId: 'G119-MEETING', role: 'decision' }],
    metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [
      { id: 'G119-m1', taskId: 'G119-MEETING', text: '第一筆', occurredAt: 1704067200000, anchor: { lineIndex: 1, sourceToken: '09:00|G119-MEETING' } },
      { id: 'G119-m2', taskId: 'G119-MEETING', text: '第二筆', occurredAt: 1704067500000, anchor: { lineIndex: 2, sourceToken: '09:05|G119-MEETING' } },
      { id: 'G119-m3', taskId: 'G119-MEETING', text: '第三筆', occurredAt: 1704067800000, anchor: { lineIndex: 3, sourceToken: '09:10|G119-MEETING' } },
      { id: 'G119-m4', taskId: 'G119-MEETING', text: '第四筆', occurredAt: 1704068100000, anchor: { lineIndex: 4, sourceToken: '09:15|G119-MEETING' } },
      { id: 'G119-m5', taskId: 'G119-MEETING', text: '第五筆', occurredAt: 1704068400000, anchor: { lineIndex: 5, sourceToken: '09:20|G119-MEETING' } },
    ] } },
  };

  const seed = async (width = 1298) => {
    await page.setViewportSize({ width, height: 698 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes, meetingRecord }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [workspace.id + ':G119-board']: [{ userId: account.id, role: 'owner', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([meetingRecord]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'G119-board');
      localStorage.setItem('projed-last-view', 'goal');
    }, { account, workspace, nodes, meetingRecord });
    await page.reload({ waitUntil: 'networkidle' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) { await fixed.click({ force: true }); await page.waitForTimeout(300); }
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const dblclickBottom = async locator => {
    const box = await locator.boundingBox();
    if (!box) return false;
    await page.mouse.dblclick(box.x + box.width / 2, Math.max(box.y + 1, box.y + box.height - 2));
    return true;
  };

  try {
    await seed(1298);
    const goal = page.locator('[data-goal-view="true"]');
    const purpose = goal.locator('[data-goal-column="description"][data-goal-cell-kind="owner"]').first();
    const meeting = goal.locator('[data-goal-column="meeting"][data-goal-cell-kind="owner"]').first();
    const purposeContent = purpose.locator('[data-goal-content-scroll="true"]');
    const meetingContent = meeting.locator('[data-goal-content-scroll="true"]');
    const initial = await purpose.evaluate(cell => {
      const scroll = cell.querySelector('[data-goal-content-scroll="true"]');
      const style = scroll ? getComputedStyle(scroll) : null;
      const webkitScrollbarStyle = scroll ? getComputedStyle(scroll, '::-webkit-scrollbar') : null;
      return { overflowY: style?.overflowY ?? null, maxHeight: style?.maxHeight ?? null, scrollbarWidth: style?.scrollbarWidth ?? null, webkitScrollbarWidth: webkitScrollbarStyle?.width ?? null, scrollHeight: scroll?.scrollHeight ?? 0, clientHeight: scroll?.clientHeight ?? 0, cellChildren: cell.children.length, legacyWrapper: Boolean(cell.querySelector('div.min-h-0.max-w-full')) };
    });
    record('B01-collapsed-retains-one-y-scroll', initial.overflowY === 'auto' && initial.maxHeight !== 'none' && initial.scrollbarWidth === 'thin' && initial.webkitScrollbarWidth === '3px' && initial.scrollHeight > initial.clientHeight && initial.cellChildren === 1 && !initial.legacyWrapper, initial);
    await page.screenshot({ path: `${OUTPUT_DIR}/B01-goal-content-scrollbar-1298x698.png`, fullPage: false });
    result.screenshots.push(OUTPUT_DIR + '/B01-goal-content-scrollbar-1298x698.png');
    await purpose.click();
    record('B02-single-click-selects-only-cell', await purpose.getAttribute('data-goal-cell-selected') === 'true' && await goal.locator('[data-goal-cell-selected="true"]').count() === 1, {});
    record('B03-native-table-aria-boundary', await purpose.getAttribute('aria-selected') === null && await purpose.getAttribute('aria-expanded') === null && await goal.locator('[data-goal-task-table="true"]').count() === 1, {});
    await purpose.press('F2');
    await goal.locator('[data-goal-cell-editor="true"] [contenteditable="true"]').waitFor({ state: 'visible', timeout: 5000 });
    const editor = goal.locator('[data-goal-cell-editor="true"] [contenteditable="true"]');
    await page.waitForFunction(() => document.activeElement?.matches('[data-goal-cell-editor="true"] [contenteditable="true"]'), null, { timeout: 5000 });
    const editorChrome = await purpose.evaluate(cell => ({ card: Boolean(cell.querySelector('[data-task-detail-note-card]')), header: Boolean(cell.querySelector('[data-task-detail-note-header]')), toolbar: Boolean(cell.querySelector('[data-task-note-toolbar-popover]')), resize: Boolean(cell.querySelector('[data-task-note-resize-handle]')) }));
    record('B04-F2-opens-inline-cell-editor', await editor.count() === 1 && Object.values(editorChrome).every(value => !value), editorChrome);
    const editorVisual = await purpose.evaluate(cell => {
      const editorElement = cell.querySelector('[data-task-detail-note-content-input="true"]');
      const cellStyle = getComputedStyle(cell);
      const editorStyle = editorElement ? getComputedStyle(editorElement) : null;
      return {
        editing: cell.getAttribute('data-goal-cell-editing'),
        cellBackground: cellStyle.backgroundColor,
        cellShadow: cellStyle.boxShadow,
        editorBorder: editorStyle?.borderTopWidth || null,
        editorBackground: editorStyle?.backgroundColor || null,
        editorPaddingTop: editorStyle?.paddingTop || null,
        caretColor: editorStyle?.caretColor || null,
        focused: document.activeElement === editorElement,
      };
    });
    record('B04B-editing-state-is-human-visible', editorVisual.editing === 'true' && editorVisual.cellBackground !== 'rgba(0, 0, 0, 0)' && editorVisual.cellShadow !== 'none' && editorVisual.editorBorder === '0px' && editorVisual.editorBackground !== 'rgba(0, 0, 0, 0)' && editorVisual.editorPaddingTop === '2px' && editorVisual.caretColor !== 'auto' && editorVisual.focused, editorVisual);
    const editorParagraphMetrics = await editor.locator('p').first().evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { lineHeight: style.lineHeight, minHeight: style.minHeight, marginTop: style.marginTop, marginBottom: style.marginBottom, height: rect.height };
    });
    record('B04A-cell-editor-keeps-reading-line-rhythm', editorParagraphMetrics.lineHeight === '20px' && editorParagraphMetrics.minHeight === '20px' && editorParagraphMetrics.marginTop === '0px' && editorParagraphMetrics.marginBottom === '0px' && editorParagraphMetrics.height === 20, editorParagraphMetrics);
    await page.screenshot({ path: OUTPUT_DIR + '/B04B-goal-cell-editing-state-1298x698.png', fullPage: false });
    result.screenshots.push(OUTPUT_DIR + '/B04B-goal-cell-editing-state-1298x698.png');
    await page.keyboard.press('Control+Enter');
    record('B05-control-enter-keeps-editor-open', await editor.count() === 1 && await purpose.locator('[data-goal-cell-editor="true"]').count() === 1, {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    record('B06-escape-cancels-before-dispatch', await purpose.locator('[data-goal-cell-editor="true"]').count() === 0 && await purpose.getAttribute('data-goal-cell-save-error') === null, {});
    await purpose.click();
    await purpose.press('F2');
    const editorAgain = goal.locator('[data-goal-cell-editor="true"] [contenteditable="true"]');
    await editorAgain.press('End');
    await editorAgain.type('｜edited');
    await editorAgain.press('Enter');
    await page.waitForTimeout(500);
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('projed-local-test.nodes');
      const parsed = raw ? JSON.parse(raw) : {};
      return { description: parsed['G119-LEGACY']?.description || '', detailNotes: parsed['G119-LEGACY']?.detailNotes || null };
    });
    record('B07-enter-saves-canonical-purpose', saved.description.includes('｜edited') && Array.isArray(saved.detailNotes) && saved.detailNotes[0]?.content === saved.description && Boolean(saved.detailNotes[0]?.richContent), { saved });
    await purpose.waitFor({ state: 'visible' });
    const expandedBefore = await dblclickBottom(purposeContent);
    await page.waitForTimeout(100);
    const expandedProbe = await purpose.evaluate(cell => { const scroll = cell.querySelector('[data-goal-content-scroll="true"]'); return { expanded: scroll?.getAttribute('data-goal-content-expanded'), overflowY: scroll ? getComputedStyle(scroll).overflowY : null, maxHeight: scroll ? getComputedStyle(scroll).maxHeight : null, scrollHeight: scroll?.scrollHeight ?? 0, clientHeight: scroll?.clientHeight ?? 0 }; });
    record('B08-double-bottom-expands-content', expandedBefore && expandedProbe.expanded === 'true' && expandedProbe.overflowY !== 'auto' && expandedProbe.maxHeight === 'none' && expandedProbe.scrollHeight <= expandedProbe.clientHeight, expandedProbe);
    await dblclickBottom(purposeContent);
    await page.waitForTimeout(100);
    const collapsedAgain = await purpose.evaluate(cell => { const scroll = cell.querySelector('[data-goal-content-scroll="true"]'); return { expanded: scroll?.getAttribute('data-goal-content-expanded'), overflowY: scroll ? getComputedStyle(scroll).overflowY : null, maxHeight: scroll ? getComputedStyle(scroll).maxHeight : null }; });
    record('B09-repeat-bottom-restores-y-scroll', collapsedAgain.expanded === 'false' && collapsedAgain.overflowY === 'auto' && collapsedAgain.maxHeight !== 'none', collapsedAgain);
    await meeting.waitFor({ state: 'visible' });
    const meetingBefore = await meeting.evaluate(cell => ({ text: cell.textContent || '', scroll: cell.querySelector('[data-goal-content-scroll="true"]')?.getAttribute('data-goal-content-expanded') || null }));
    await dblclickBottom(meetingContent);
    await page.waitForTimeout(100);
    const meetingAfter = await meeting.evaluate(cell => { const scroll = cell.querySelector('[data-goal-content-scroll="true"]'); return { text: cell.textContent || '', expanded: scroll?.getAttribute('data-goal-content-expanded') || null, overflowY: scroll ? getComputedStyle(scroll).overflowY : null }; });
    record('B10-meeting-is-readonly-but-expandable', meetingBefore.text.includes('第一筆') && meetingAfter.text.includes('第五筆') && meetingAfter.expanded === 'true' && meetingAfter.overflowY !== 'auto', { meetingBefore, meetingAfter });
    const span = goal.locator('[data-goal-cell-key="description:G119-SPAN"]');
    const coveredCount = await goal.locator('[data-goal-column="description"][data-goal-cell-kind="covered"]').count();
    record('B11-rowspan-owner-stays-native', await span.getAttribute('rowspan') === '2' && coveredCount === 0, { spanCount: await span.count(), rowSpan: await span.getAttribute('rowspan'), coveredCount });
    const sessionMarker = page.locator('[data-goal-edit-session-marker="true"]');
    record('B12-clean-session-has-no-active-reload-marker', await sessionMarker.count() === 1 && await sessionMarker.getAttribute('data-goal-edit-session-state') === null, { markerCount: await sessionMarker.count(), markerState: await sessionMarker.getAttribute('data-goal-edit-session-state') });
    await page.screenshot({ path: OUTPUT_DIR + '/B01-goal-cell-actions-1298x698.png', fullPage: false });
    result.screenshots.push(OUTPUT_DIR + '/B01-goal-cell-actions-1298x698.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    const viewportProbe = await page.evaluate(() => ({ goalVisible: Boolean(document.querySelector('[data-goal-view="true"]')), tableOverflow: getComputedStyle(document.querySelector('[data-goal-view="true"]') || document.body).overflowY, tableWidth: document.querySelector('[data-goal-task-table="true"]')?.getBoundingClientRect().width || 0 }));
    record('V01-desktop-goal-table-remains-usable', viewportProbe.goalVisible && viewportProbe.tableWidth > 0 && viewportProbe.tableOverflow === 'auto', viewportProbe);
    const sharedScrollbarProbes = await page.locator('[data-task-workbench-unclassified-section="true"], [data-task-workbench-placed-board-lane="true"]').evaluateAll(elements => elements.map(element => ({
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      webkitScrollbarWidth: getComputedStyle(element, '::-webkit-scrollbar').width,
      overflowY: getComputedStyle(element).overflowY,
    })));
    record('S01-workbench-inherits-shared-scrollbar', sharedScrollbarProbes.length === 2 && sharedScrollbarProbes.every(probe => probe.scrollbarWidth === 'thin' && probe.webkitScrollbarWidth === '3px' && probe.overflowY === 'auto'), { sharedScrollbarProbes });
    await page.screenshot({ path: OUTPUT_DIR + '/V01-goal-cell-actions-1440x900.png', fullPage: false });
    result.screenshots.push(OUTPUT_DIR + '/V01-goal-cell-actions-1440x900.png');

    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator('[data-mode-switcher-value="gantt"]').click();
    const ganttScroll = page.locator('[data-mobile-pan-surface="gantt"]');
    await ganttScroll.waitFor({ state: 'visible', timeout: 15000 });
    const ganttScrollbarProbe = await ganttScroll.evaluate(element => ({
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      webkitScrollbarWidth: getComputedStyle(element, '::-webkit-scrollbar').width,
      overflowX: getComputedStyle(element).overflowX,
      overflowY: getComputedStyle(element).overflowY,
    }));
    record('S02-gantt-preserves-direct-drag-scrollbar-exception', ganttScrollbarProbe.scrollbarWidth === 'auto' && ganttScrollbarProbe.webkitScrollbarWidth === '12px' && ganttScrollbarProbe.overflowX === 'scroll' && ganttScrollbarProbe.overflowY === 'scroll', ganttScrollbarProbe);
    await page.screenshot({ path: OUTPUT_DIR + '/S02-gantt-scrollbar-exception-1440x900.png', fullPage: false });
    result.screenshots.push(OUTPUT_DIR + '/S02-gantt-scrollbar-exception-1440x900.png');
  } catch (error) {
    failures.push('UNCAUGHT');
    result.cases.push({ id: 'UNCAUGHT', ok: false, details: { message: error.message, stack: error.stack } });
  }

  result.status = failures.length || result.browserErrors.length || result.httpFailures.length ? 'FAIL' : 'PASS';
  result.failures = failures;
  result.finishedAt = new Date().toISOString();
  await page.evaluate(resultValue => { window.__DEV119_ARTIFACT = resultValue; }, result);
  if (failures.length) {
    const failureDetails = failures.map(id => {
      const failedCase = result.cases.find(testCase => testCase.id === id);
      return id + (failedCase ? ' ' + JSON.stringify(failedCase.details) : '');
    }).join('; ');
    throw new Error('DEV-119 browser verification failed: ' + failureDetails);
  }
} 
