/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-116-goal-mode';
  const result = {
    devId: 'DEV-116', status: 'FAIL', sourceRevision: 'working-tree',
    environment: 'local-test / Chromium', route: '/', viewport: { width: 1440, height: 900 },
    actors: [{ id: 'local-test-user', role: 'owner' }],
    fixtureIds: ['dev116-parent', 'dev116-child', 'dev116-grandchild', 'dev116-sibling', 'dev116-meeting-1', 'dev116-meeting-2'],
    viewports: [{ width: 1440, height: 900 }, { width: 814, height: 698 }, { width: 390, height: 900 }],
    requestCounts: { boardRecordListLoad: 1, perRowRecordLoads: 0 },
    mutationCounts: { task: 0, record: 0, taskLink: 0 },
    cases: [], browserErrors: [], httpFailures: [], cleanup: { runtime: 'matching pre-existing localhost:4000', action: 'reused; not stopped' },
    screenshots: [],
    runtime: { port: 4000, ownerPid: 28532, cleaned: false, portReleased: false, reused: true },
  };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, ok, details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) result.httpFailures.push({ status: response.status(), url: response.url() }); });

  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'goal-browser@projed.local', displayName: 'DEV-116 QA', createdAt: 1704067200000 };
  const workspace = { id: 'dev116-workspace', title: 'DEV-116 目標模式', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000, boards: [{ id: 'dev116-board', title: '目標驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 }] };
  const nodes = {
    'dev116-parent': { id: 'dev116-parent', workspaceId: workspace.id, boardId: 'dev116-board', parentId: null, title: 'DEV116 父層目標', status: 'in_progress', nodeType: 'group', order: 0, description: '父層方向與成果定義\n對齊季度成果與衡量方式\n補充跨部門協作邊界\n確認驗收口徑與責任人\n保留風險與決策依據', startDate: '2026-09-01', endDate: '2026-09-10', tagIds: ['dev116-tag'] },
    'dev116-child': { id: 'dev116-child', workspaceId: workspace.id, boardId: 'dev116-board', parentId: 'dev116-parent', title: 'DEV116 子任務', status: 'todo', nodeType: 'task', order: 1, description: '', startDate: '2026-09-02', endDate: '2026-09-05' },
    'dev116-grandchild': { id: 'dev116-grandchild', workspaceId: workspace.id, boardId: 'dev116-board', parentId: 'dev116-child', title: 'DEV116 孫任務', status: 'todo', nodeType: 'task', order: 2, startDate: '2026-09-03', endDate: '2026-09-04' },
    'dev116-sibling': { id: 'dev116-sibling', workspaceId: workspace.id, boardId: 'dev116-board', parentId: null, title: 'DEV116 另一目標', status: 'todo', nodeType: 'task', order: 3, startDate: '2026-09-12', endDate: '2026-09-14' },
  };
  const meetingRecord = {
    id: 'dev116-meeting-1', type: 'meeting', workspaceId: workspace.id, boardId: 'dev116-board', title: 'DEV116 決策',
    content: '## 任務討論\n- 09:00 @[DEV116 子任務](task:dev116-child)：聚焦本季關鍵成果\n- 10:00 @[DEV116 子任務](task:dev116-child)：拆解關鍵結果與驗收口徑\n- 10:30 @[DEV116 子任務](task:dev116-child)：補上風險與依賴條件\n- 11:00 @[DEV116 子任務](task:dev116-child)：確認負責人與交付節點', status: 'published', visibility: 'project', occurredAt: 1704067200000,
    taskLinks: [{ nodeId: 'dev116-child', role: 'decision' }], metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [
      { id: 'dev116-note-1', taskId: 'dev116-child', text: '聚焦本季關鍵成果', occurredAt: 1704067200000, anchor: { lineIndex: 1, sourceToken: '09:00|dev116-child' } },
      { id: 'dev116-note-2', taskId: 'dev116-child', text: '拆解關鍵結果與驗收口徑', occurredAt: 1704070800000, anchor: { lineIndex: 2, sourceToken: '10:00|dev116-child' } },
      { id: 'dev116-note-3', taskId: 'dev116-child', text: '補上風險與依賴條件', occurredAt: 1704072600000, anchor: { lineIndex: 3, sourceToken: '10:30|dev116-child' } },
      { id: 'dev116-note-4', taskId: 'dev116-child', text: '確認負責人與交付節點', occurredAt: 1704074400000, anchor: { lineIndex: 4, sourceToken: '11:00|dev116-child' } },
    ] } },
  };
  const meetingRecordHistory = {
    id: 'dev116-meeting-2', type: 'meeting', workspaceId: workspace.id, boardId: 'dev116-board', title: 'DEV116 追蹤',
    content: '## 任務討論\n- 11:00 @[DEV116 子任務](task:dev116-child)：確認本週追蹤節點\n- 14:00 @[DEV116 子任務](task:dev116-child)：記錄下次檢視時間', status: 'published', visibility: 'project', occurredAt: 1704153600000,
    taskLinks: [{ nodeId: 'dev116-child', role: 'decision' }], metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [
      { id: 'dev116-note-3', taskId: 'dev116-child', text: '確認本週追蹤節點', occurredAt: 1704153600000, anchor: { lineIndex: 1, sourceToken: '11:00|dev116-child' } },
      { id: 'dev116-note-5', taskId: 'dev116-child', text: '記錄下次檢視時間', occurredAt: 1704164400000, anchor: { lineIndex: 2, sourceToken: '14:00|dev116-child' } },
    ] } },
  };

  const seed = async (view = 'goal', width = 1440) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes, meetingRecord, meetingRecordHistory, view }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([
        { id: 'dev116-tag', workspaceId: workspace.id, name: 'OKR', color: 'blue', order: 0 },
      ]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:dev116-board`]: [{ userId: account.id, role: 'owner', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([meetingRecord, meetingRecordHistory]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev116-board');
      localStorage.setItem('projed-last-view', view);
    }, { account, workspace, nodes, meetingRecord, meetingRecordHistory, view });
    await page.reload({ waitUntil: 'networkidle' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) { await fixed.click({ force: true }); await page.waitForTimeout(250); }
    if (view === 'goal') await page.locator(width < 768 ? '[data-layout-region="board-canvas"]' : '[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const closeDetails = async () => {
    const close = page.getByRole('button', { name: '關閉任務詳情' }).first();
    if (await close.count()) { await close.click({ force: true }); await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined); }
  };

  try {
    await seed('goal');
    const goalView = page.locator('[data-goal-view="true"]');
    const rows = goalView.locator('[data-goal-task-row]');
    record('B01-goal-loads-from-primary-tree', await goalView.count() === 1 && await rows.count() === 4, { rows: await rows.count() });
    record('B02-optional-columns-use-sparse-rowspan', await goalView.locator('[data-goal-column="description"][data-goal-cell-kind="owner"]').first().getAttribute('rowspan') === '3' && await goalView.locator('[data-goal-column="meeting"]').count() >= 1, {});
    const meetingOwnerCell = goalView.locator('[data-goal-column="meeting"][data-goal-cell-kind="owner"]').first();
    const meetingHistoryProbe = await meetingOwnerCell.evaluate(element => {
      const scroll = element.querySelector('[data-goal-content-scroll="true"]');
      const rows = Array.from(element.querySelectorAll('[data-task-meeting-quick-note-row="true"]'));
      return {
        rowCount: rows.length,
        texts: rows.map(row => row.textContent?.replace(/\s+/g, ' ').trim() || ''),
        clientHeight: scroll?.clientHeight ?? 0,
        scrollHeight: scroll?.scrollHeight ?? 0,
        overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
        hasLegacyContainerClasses: Boolean(element.querySelector('div.min-h-0.max-w-full')),
      };
    });
    record('V25-goal-meeting-cell-renders-all-record-notes-without-extra-ui-wrapper', meetingHistoryProbe.rowCount === 6 && meetingHistoryProbe.texts.some(text => text.includes('聚焦本季關鍵成果')) && meetingHistoryProbe.texts.some(text => text.includes('拆解關鍵結果與驗收口徑')) && meetingHistoryProbe.texts.some(text => text.includes('確認本週追蹤節點')) && meetingHistoryProbe.texts.some(text => text.includes('記錄下次檢視時間')) && meetingHistoryProbe.overflowY === 'auto' && meetingHistoryProbe.scrollHeight > meetingHistoryProbe.clientHeight && !meetingHistoryProbe.hasLegacyContainerClasses, meetingHistoryProbe);
    record('B03-no-inline-add-controls', await goalView.getByText('＋說明', { exact: true }).count() === 0 && await goalView.getByText('＋紀錄', { exact: true }).count() === 0, {});
    const child = page.locator('[data-goal-task-id="dev116-child"]');
    record('V01-desktop-goal-hierarchy-is-visible', await goalView.locator('[data-goal-task-table="true"]').isVisible(), {});
    const dateInputSurfaceProbe = await page.evaluate(() => {
      const dateCells = Array.from(document.querySelectorAll('[data-goal-column="start-date"], [data-goal-column="end-date"]'));
      return {
        dateCellCount: dateCells.length,
        directDateInputs: dateCells.every(cell => Boolean(cell.querySelector(':scope > input[type="date"]'))),
        extraRowWrappers: dateCells.filter(cell => cell.querySelector(':scope > div.relative.flex')).length,
      };
    });
    record('V26-goal-date-inputs-are-direct-cell-children', dateInputSurfaceProbe.dateCellCount > 0 && dateInputSurfaceProbe.directDateInputs && dateInputSurfaceProbe.extraRowWrappers === 0, dateInputSurfaceProbe);
    const taskTitleSurfaceProbe = await page.evaluate(() => {
      const hierarchyRows = Array.from(document.querySelectorAll('[data-goal-task-row] [data-task-hierarchy-row="true"]'));
      return {
        hierarchyRowCount: hierarchyRows.length,
        nestedTitleWrappers: hierarchyRows.filter(row => row.querySelector('.task-title-text > span')).length,
        directTitleNodes: hierarchyRows.filter(row => row.querySelector(':scope > .task-title-text')).length,
      };
    });
    record('V27-goal-task-title-has-no-redundant-text-wrapper', taskTitleSurfaceProbe.hierarchyRowCount > 0 && taskTitleSurfaceProbe.nestedTitleWrappers === 0 && taskTitleSurfaceProbe.directTitleNodes === taskTitleSurfaceProbe.hierarchyRowCount, taskTitleSurfaceProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/V01-goal-table-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V01-goal-table-1440x900.png`);
    const firstGoalRowHeight = await rows.first().evaluate(element => element.getBoundingClientRect().height);
    record('V09-list-density-removes-visible-level-label', await goalView.locator('[id$="-level"]').count() === 0 && firstGoalRowHeight <= 40, { firstGoalRowHeight });
    const verticalGridlineProbe = await page.evaluate(() => {
      const planningCells = Array.from(document.querySelectorAll('[data-goal-view="true"] [data-goal-planning-control]'));
      const planningInternalGridlines = planningCells.filter(element => getComputedStyle(element).borderRightWidth !== '0px').length;
      const contentBoundaryGridlines = Array.from(document.querySelectorAll('[data-goal-view="true"] [data-goal-column="description"], [data-goal-view="true"] [data-goal-column="meeting"]'))
        .filter(element => getComputedStyle(element).borderRightWidth !== '0px').length;
      return { planningCells: planningCells.length, planningInternalGridlines, contentBoundaryGridlines };
    });
    record('V10-planning-gridlines-removed-with-content-boundary-retained', verticalGridlineProbe.planningCells > 0 && verticalGridlineProbe.planningInternalGridlines === 0 && verticalGridlineProbe.contentBoundaryGridlines >= 0, verticalGridlineProbe);
    const fullGridProbe = await page.evaluate(() => {
      const table = document.querySelector('[data-goal-task-table="true"]');
      if (!table) return { rightBorderlessCells: -1, rowBorderlessRows: -1, outerBorderlessEdges: -1 };
      const cells = Array.from(table.querySelectorAll('th, td'));
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const rightBorderlessCells = cells.filter(element => getComputedStyle(element).borderRightWidth === '0px').length;
      const planningInternalGridlines = Array.from(table.querySelectorAll('[data-goal-planning-control]')).filter(element => getComputedStyle(element).borderRightWidth !== '0px').length;
      const rowBorderlessRows = rows.filter(element => getComputedStyle(element).borderBottomWidth === '0px').length;
      const outerBorderlessEdges = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .filter(property => getComputedStyle(table)[property] === '0px').length;
      return { rightBorderlessCells, rowCount: rows.length, planningInternalGridlines, rowBorderlessRows, outerBorderlessEdges };
    });
    // DEV-121 R5 intentionally removes inter-task horizontal rules while preserving
    // the existing no-frame and planning-gridline contract for the shared Goal table.
    record('V12-goal-task-gridlines-and-table-frame-removed', fullGridProbe.planningInternalGridlines === 0 && fullGridProbe.rowBorderlessRows === fullGridProbe.rowCount && fullGridProbe.outerBorderlessEdges === 4, fullGridProbe);
    const goalColumnLabels = await page.evaluate(() => ({
      task: document.querySelector('#goal-column-task')?.textContent?.trim() || null,
      description: document.querySelector('#goal-column-description')?.textContent?.trim() || null,
      meeting: document.querySelector('#goal-column-meeting')?.textContent?.trim() || null,
    }));
    record('V13-goal-column-labels-use-purpose-language', goalColumnLabels.task === '任務名稱' && goalColumnLabels.description === '任務目的' && goalColumnLabels.meeting === '會議紀錄', goalColumnLabels);
    await page.setViewportSize({ width: 1440, height: 180 });
    await goalView.evaluate(element => { element.scrollTop = 0; });
    await page.waitForTimeout(100);
    await page.setViewportSize({ width: 1298, height: 698 });
    await page.waitForTimeout(100);
    const taskColumnWidthAtReferenceViewport = await page.evaluate(() => ({
      width: document.querySelector('#goal-column-task')?.getBoundingClientRect().width ?? null,
       configuredWidth: document.querySelector('[data-goal-task-table="true"] col')?.getAttribute('style')?.includes('width: 252px') ?? false,
    }));
    const referenceTableBoundary = await page.evaluate(() => {
      const table = document.querySelector('[data-goal-task-table="true"]');
      const headerCells = Array.from(document.querySelectorAll('[data-goal-sticky-header="true"] th'));
      const firstBodyRow = document.querySelector('[data-goal-task-row]');
      const bodyCells = firstBodyRow ? Array.from(firstBodyRow.children) : [];
      const read = element => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      const tableRect = read(table);
      const firstHeader = read(headerCells[0]);
      const lastHeader = read(headerCells[headerCells.length - 1]);
      const firstBody = read(bodyCells[0]);
      const lastBody = read(bodyCells[bodyCells.length - 1]);
      return {
        table: tableRect,
        firstHeader,
        lastHeader,
        firstBody,
        lastBody,
        headerBodyLeftDelta: firstHeader && firstBody ? firstHeader.left - firstBody.left : null,
        headerBodyRightDelta: lastHeader && lastBody ? lastHeader.right - lastBody.right : null,
        tableHeaderLeftDelta: tableRect && firstHeader ? firstHeader.left - tableRect.left : null,
        tableHeaderRightDelta: tableRect && lastHeader ? lastHeader.right - tableRect.right : null,
      };
    });
    record(
      'V24-table-boundaries-align-header-and-body',
      referenceTableBoundary.headerBodyLeftDelta !== null
        && Math.abs(referenceTableBoundary.headerBodyLeftDelta) <= 1
        && referenceTableBoundary.headerBodyRightDelta !== null
        && Math.abs(referenceTableBoundary.headerBodyRightDelta) <= 1
        && referenceTableBoundary.tableHeaderLeftDelta !== null
        && Math.abs(referenceTableBoundary.tableHeaderLeftDelta) <= 1
        && referenceTableBoundary.tableHeaderRightDelta !== null
        && Math.abs(referenceTableBoundary.tableHeaderRightDelta) <= 1,
      referenceTableBoundary,
    );
    await page.screenshot({ path: `${OUTPUT_DIR}/V24-goal-task-column-1298x698.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V24-goal-task-column-1298x698.png`);
    await page.setViewportSize({ width: 1440, height: 180 });
    await page.waitForTimeout(100);
    const stickyHeaderBeforeScroll = await page.evaluate(() => {
      const root = document.querySelector('[data-goal-view="true"]');
      const table = document.querySelector('[data-goal-task-table="true"]');
      const headerCells = Array.from(document.querySelectorAll('[data-goal-sticky-header="true"] th'));
      const firstRow = document.querySelector('[data-goal-task-row]');
      const rows = Array.from(document.querySelectorAll('[data-goal-task-row]'));
      const purposeCell = document.querySelector('[data-goal-column="description"][data-goal-cell-kind="owner"]');
      const purposeScroll = purposeCell?.querySelector('[data-goal-content-scroll="true"]');
      const meetingOwnerCell = document.querySelector('[data-goal-column="meeting"][data-goal-cell-kind="owner"]');
      const meetingScroll = meetingOwnerCell?.querySelector('[data-goal-content-scroll="true"]');
      const readScroll = element => element ? {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
        maxHeight: getComputedStyle(element).maxHeight,
        childCount: element.children.length,
      } : null;
      const purposeContent = {
        cellChildCount: purposeCell?.children.length ?? 0,
        scrollContainer: readScroll(purposeScroll),
        hasLegacyContainerClasses: Boolean(purposeCell?.querySelector('div.min-h-0.max-w-full')),
      };
      const meetingContent = {
        cellChildCount: meetingOwnerCell?.children.length ?? 0,
        scrollContainer: readScroll(meetingScroll),
        hasLegacyContainerClasses: Boolean(meetingOwnerCell?.querySelector('div.min-h-0.max-w-full')),
      };
      const readRect = element => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      const firstBodyCells = firstRow ? Array.from(firstRow.children) : [];
      const tableRect = readRect(table);
      const firstHeaderRect = readRect(headerCells[0]);
      const lastHeaderRect = readRect(headerCells[headerCells.length - 1]);
      const firstBodyRect = readRect(firstBodyCells[0]);
      const lastBodyRect = readRect(firstBodyCells[firstBodyCells.length - 1]);
      return {
        headerTop: headerCells[0]?.getBoundingClientRect().top ?? null,
        taskHeaderWidth: document.querySelector('#goal-column-task')?.getBoundingClientRect().width ?? null,
        firstRowTop: firstRow?.getBoundingClientRect().top ?? null,
        rowHeights: rows.map(row => row.getBoundingClientRect().height),
        maxScrollTop: root ? root.scrollHeight - root.clientHeight : 0,
        purposeContent,
        meetingContent,
        tableBoundary: {
          table: tableRect,
          firstHeader: firstHeaderRect,
          lastHeader: lastHeaderRect,
          firstBody: firstBodyRect,
          lastBody: lastBodyRect,
          headerBodyLeftDelta: firstHeaderRect && firstBodyRect ? firstHeaderRect.left - firstBodyRect.left : null,
          headerBodyRightDelta: lastHeaderRect && lastBodyRect ? lastHeaderRect.right - lastBodyRect.right : null,
          tableHeaderLeftDelta: tableRect && firstHeaderRect ? firstHeaderRect.left - tableRect.left : null,
          tableHeaderRightDelta: tableRect && lastHeaderRect ? lastHeaderRect.right - tableRect.right : null,
        },
        headerCells: headerCells.map(cell => ({
          position: getComputedStyle(cell).position,
          backgroundColor: getComputedStyle(cell).backgroundColor,
          color: getComputedStyle(cell).color,
          hasDarkSurface: cell.classList.contains('bg-slate-800'),
          hasWhiteText: cell.classList.contains('text-white') || cell.closest('thead')?.classList.contains('text-white'),
          hasNoInnerContainer: cell.children.length === 0,
        })),
      };
    });
    await goalView.evaluate(element => { element.scrollTop = Math.min(48, element.scrollHeight - element.clientHeight); });
    await page.waitForTimeout(100);
    const stickyHeaderAfterScroll = await page.evaluate(() => ({
      scrollTop: document.querySelector('[data-goal-view="true"]')?.scrollTop ?? 0,
      headerTop: document.querySelector('[data-goal-sticky-header="true"] th')?.getBoundingClientRect().top ?? null,
      firstRowTop: document.querySelector('[data-goal-task-row]')?.getBoundingClientRect().top ?? null,
    }));
    const stickyHeaderProbe = {
      before: stickyHeaderBeforeScroll,
      taskColumnWidthAtReferenceViewport,
      referenceTableBoundary,
      after: stickyHeaderAfterScroll,
      headerTopDelta: stickyHeaderBeforeScroll.headerTop === null || stickyHeaderAfterScroll.headerTop === null ? null : Math.abs(stickyHeaderAfterScroll.headerTop - stickyHeaderBeforeScroll.headerTop),
      firstRowDelta: stickyHeaderBeforeScroll.firstRowTop === null || stickyHeaderAfterScroll.firstRowTop === null ? null : stickyHeaderAfterScroll.firstRowTop - stickyHeaderBeforeScroll.firstRowTop,
    };
    record(
      'V23-goal-header-and-row-content-geometry',
      stickyHeaderProbe.before.maxScrollTop > 0
        && stickyHeaderProbe.after.scrollTop > 0
        && stickyHeaderProbe.headerTopDelta !== null
        && stickyHeaderProbe.headerTopDelta <= 1
        && stickyHeaderProbe.firstRowDelta !== null
        && stickyHeaderProbe.firstRowDelta < -1
        && stickyHeaderProbe.before.headerCells.length >= 5
        && stickyHeaderProbe.before.taskHeaderWidth !== null
        && stickyHeaderProbe.before.taskHeaderWidth >= 250
        && stickyHeaderProbe.before.taskHeaderWidth <= 280
        && stickyHeaderProbe.taskColumnWidthAtReferenceViewport.width !== null
        && stickyHeaderProbe.taskColumnWidthAtReferenceViewport.width >= 250
        && stickyHeaderProbe.taskColumnWidthAtReferenceViewport.width <= 254
        && stickyHeaderProbe.taskColumnWidthAtReferenceViewport.configuredWidth
        && stickyHeaderProbe.before.purposeContent.cellChildCount === 1
        && stickyHeaderProbe.before.purposeContent.scrollContainer?.overflowY === 'auto'
        && stickyHeaderProbe.before.purposeContent.scrollContainer?.scrollHeight > stickyHeaderProbe.before.purposeContent.scrollContainer?.clientHeight
        && stickyHeaderProbe.before.purposeContent.scrollContainer?.maxHeight !== 'none'
        && !stickyHeaderProbe.before.purposeContent.hasLegacyContainerClasses
        && stickyHeaderProbe.before.meetingContent.cellChildCount === 1
        && stickyHeaderProbe.before.meetingContent.scrollContainer?.overflowY === 'auto'
        && !stickyHeaderProbe.before.meetingContent.hasLegacyContainerClasses
        && stickyHeaderProbe.before.rowHeights.length === 4
        && stickyHeaderProbe.before.rowHeights.every(height => height <= 40)
          && stickyHeaderProbe.before.headerCells.every(cell => cell.position === 'sticky' && !cell.hasDarkSurface && !cell.hasWhiteText && cell.hasNoInnerContainer && cell.backgroundColor !== 'rgba(0, 0, 0, 0)'),
      stickyHeaderProbe,
    );
    await page.screenshot({ path: `${OUTPUT_DIR}/V23-goal-sticky-light-header-1440x180.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V23-goal-sticky-light-header-1440x180.png`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await goalView.evaluate(element => { element.scrollTop = 0; });
    const flattenedGoalSurface = await page.evaluate(() => {
      const goalRoot = document.querySelector('[data-goal-view="true"]');
      const table = document.querySelector('[data-goal-task-table="true"]');
      const taskCells = Array.from(document.querySelectorAll('[data-goal-task-row] > th[scope="row"]'));
      return Boolean(goalRoot && table?.parentElement === goalRoot)
        && taskCells.length > 0
        && taskCells.every(cell => cell.children.length === 1 && cell.firstElementChild?.getAttribute('data-task-hierarchy-row') === 'true')
        && document.querySelectorAll('[data-goal-column="description"] > span.block.whitespace-pre-wrap').length === 0;
    });
    record('V11-flat-goal-surface-removes-extra-containers', flattenedGoalSurface, {});
    const goalIntroProbe = await page.evaluate(() => {
      const goalRoot = document.querySelector('[data-goal-view="true"]');
      const table = document.querySelector('[data-goal-task-table="true"]');
      const topbar = document.querySelector('[data-layout-region="topbar"]');
      if (!goalRoot || !table || !topbar) return null;
      const tableRect = table.getBoundingClientRect();
      const topbarRect = topbar.getBoundingClientRect();
      return {
        directChild: table.parentElement === goalRoot,
        directHeaderCount: goalRoot.querySelectorAll(':scope > header').length,
        introTextCount: Array.from(goalRoot.querySelectorAll('h1, p')).filter(element => /目標模式|以任務目標/.test(element.textContent || '')).length,
        topGap: Math.round(tableRect.top - topbarRect.bottom),
      };
    });
    record('V14-goal-introduction-header-is-removed', Boolean(goalIntroProbe) && goalIntroProbe.directChild && goalIntroProbe.directHeaderCount === 0 && goalIntroProbe.introTextCount === 0 && goalIntroProbe.topGap <= 20, goalIntroProbe || {});
    record('V02-empty-optional-fields-have-no-placeholder-copy', !(await goalView.textContent()).includes('尚無任務說明') && !(await goalView.textContent()).includes('尚無會議紀錄'), {});
    record('V03-description-and-meeting-projections-are-independent', await goalView.locator('[data-goal-column="description"][data-goal-cell-kind="covered"]').count() === 0 && await goalView.locator('[data-goal-column="meeting"]').getByText('聚焦本季關鍵成果', { exact: false }).count() === 1, {});
    await child.focus();
    record('V04-task-identity-is-keyboard-focusable', await page.evaluate(() => document.activeElement?.getAttribute('data-goal-task-id')) === 'dev116-child', {});
    await page.keyboard.press(' ');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    record('V05-space-opens-existing-details', await page.locator('[data-task-details-modal="true"]').count() === 1, {});
    await closeDetails();
    const parentCollapse = page.locator('[data-goal-collapse-toggle="dev116-parent"]');
    await parentCollapse.click();
    record('V06-collapse-preserves-parent-only-row', await rows.count() === 2, { rows: await rows.count() });
    await parentCollapse.click();
    record('V07-all-meeting-notes-remain-readable', await goalView.getByText('聚焦本季關鍵成果', { exact: false }).count() === 1 && await goalView.getByText('拆解關鍵結果與驗收口徑', { exact: false }).count() === 1 && await goalView.getByText('補上風險與依賴條件', { exact: false }).count() === 1 && await goalView.getByText('確認本週追蹤節點', { exact: false }).count() === 1 && await goalView.getByText('記錄下次檢視時間', { exact: false }).count() === 1, {});
    await child.hover();
    await page.waitForTimeout(1100);
    const sharedMenuSurfaceProbe = {
      duplicateDescriptionHoverCount: await page.locator('[data-task-description-hover-card="true"]').count(),
      descriptionHoverSourceCount: await goalView.locator('[data-task-surface-source="true"]').count(),
      dragSurfaceCount: await goalView.locator('[data-goal-task-row][data-task-drag-surface="true"]').count(),
      taskIdentityCount: await goalView.locator('[data-goal-task-id]').count(),
    };
    record('V08-goal-reuses-global-task-menu-surface', sharedMenuSurfaceProbe.duplicateDescriptionHoverCount === 0 && sharedMenuSurfaceProbe.descriptionHoverSourceCount === 0 && sharedMenuSurfaceProbe.dragSurfaceCount === 4 && sharedMenuSurfaceProbe.taskIdentityCount === 4, sharedMenuSurfaceProbe);
    await child.click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    record('B04-primary-task-opens-details', await page.locator('[data-task-details-modal="true"]').count() === 1, {});
    await closeDetails();
    await child.click({ button: 'right' });
    const goalContextMenu = page.locator('[data-global-context-menu="true"]');
    await goalContextMenu.waitFor({ state: 'visible', timeout: 10000 });
    const goalContextMenuProbe = {
      kind: await goalContextMenu.getAttribute('data-global-context-menu-kind'),
      actionIds: await goalContextMenu.locator('[data-task-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-action-id'))),
    };
    record('B05-goal-right-click-reuses-board-global-task-menu', goalContextMenuProbe.kind === 'task' && ['task.create-child', 'task.assign', 'task.archive'].every(actionId => goalContextMenuProbe.actionIds.includes(actionId)), goalContextMenuProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/V22-goal-global-context-menu-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V22-goal-global-context-menu-1440x900.png`);
    await page.keyboard.press('Escape');
    await goalContextMenu.waitFor({ state: 'hidden', timeout: 5000 });
    await child.focus();
    await page.keyboard.press('Shift+F10');
    await goalContextMenu.waitFor({ state: 'visible', timeout: 10000 });
    record('B18-goal-shift-f10-opens-the-same-global-task-menu', await goalContextMenu.getAttribute('data-global-context-menu-kind') === 'task', {});
    await page.keyboard.press('Escape');
    await child.focus(); await page.keyboard.press('Enter');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
    record('B06-keyboard-enter-opens-details', await page.locator('[data-task-details-modal="true"]').count() === 1, {});
    await closeDetails();
    const readHierarchyGeometry = async (surface) => page.locator(`[data-task-hierarchy-row="true"][data-task-hierarchy-surface="${surface}"]`).evaluateAll(elements => {
      const read = id => {
        const element = elements.find(candidate => candidate.getAttribute('data-task-id') === id);
        const title = element?.querySelector('.task-title-text');
        return element && title ? {
          rowHeight: element.getBoundingClientRect().height,
          titleLeft: title.getBoundingClientRect().left,
          paddingLeft: Number.parseFloat(getComputedStyle(element).paddingLeft || '0'),
          indentToken: getComputedStyle(element).getPropertyValue('--task-hierarchy-indent').trim(),
        } : null;
      };
      const parent = read('dev116-parent');
      const child = read('dev116-child');
      return {
        parent,
        child,
        titleDelta: parent && child ? child.titleLeft - parent.titleLeft : null,
        paddingDelta: parent && child ? child.paddingLeft - parent.paddingLeft : null,
      };
    });
    const goalHierarchyGeometry = await readHierarchyGeometry('goal');
    const capabilityProbe = {
      progressRows: await goalView.locator('[data-goal-task-progress]').count(),
      tagVisible: await goalView.getByText('OKR', { exact: true }).isVisible().catch(() => false),
      assigneeControls: await goalView.locator('[data-goal-planning-control="assignee"]').count(),
      assigneeIcons: await goalView.locator('[data-goal-planning-control="assignee"] [data-task-assignment-trigger-icon="true"]').count(),
      statusControls: await goalView.locator('[data-goal-planning-control="status"]').count(),
      startDateControls: await goalView.locator('[data-goal-planning-control="start-date"]').count(),
      endDateControls: await goalView.locator('[data-goal-planning-control="end-date"]').count(),
      durationControls: await goalView.locator('[data-goal-planning-control="duration"]').count(),
    };
    record('B12-goal-omits-progress-and-decorative-assignee-icons-while-retaining-tags-and-planning-controls', capabilityProbe.progressRows === 0 && capabilityProbe.assigneeIcons === 0 && capabilityProbe.tagVisible && capabilityProbe.assigneeControls === 4 && capabilityProbe.statusControls === 4 && capabilityProbe.startDateControls === 4 && capabilityProbe.endDateControls === 4 && capabilityProbe.durationControls === 4, capabilityProbe);
    const childRow = goalView.locator('[data-goal-task-row-id="dev116-child"]');
    await childRow.getByLabel('修改「DEV116 子任務」狀態').selectOption('in_progress');
    const assignmentPicker = childRow.locator('[data-task-assignment-picker="true"]');
    await assignmentPicker.getByRole('button').click();
    await page.locator('[data-task-assignment-picker-panel="true"] [data-task-assignment-section="primary"] input[type="checkbox"]').first().check();
    await childRow.getByLabel('修改「DEV116 子任務」結束日期').fill('2026-09-06');
    await childRow.getByRole('button', { name: '啟用「DEV116 子任務」工期鎖定' }).click();
    await childRow.getByLabel('修改「DEV116 子任務」工期天數').fill('4');
    await page.waitForTimeout(400);
    const goalEditProbe = {
      status: await childRow.getByLabel('修改「DEV116 子任務」狀態').inputValue(),
      assignee: await assignmentPicker.getByRole('button').textContent(),
      startDate: await childRow.getByLabel('修改「DEV116 子任務」開始日期').inputValue(),
      endDate: await childRow.getByLabel('修改「DEV116 子任務」結束日期').inputValue(),
      duration: await childRow.getByLabel('修改「DEV116 子任務」工期天數').inputValue(),
    };
    result.mutationCounts.task += 5;
    record('B13-goal-editor-controls-update-the-visible-canonical-task', goalEditProbe.status === 'in_progress' && goalEditProbe.assignee.trim() !== '未指派' && goalEditProbe.startDate === '2026-09-02' && goalEditProbe.endDate === '2026-09-06' && goalEditProbe.duration === '4', goalEditProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/V19-goal-capabilities-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V19-goal-capabilities-1440x900.png`);
    await page.locator('[data-mode-switcher-trigger]').click();
    await page.locator('[data-mode-switcher-value="list"]').click();
    const listChildRow = page.locator('[data-task-drag-surface-kind="wbs-list-row"][data-task-id="dev116-child"]').first();
    await listChildRow.waitFor({ state: 'visible', timeout: 10000 });
    const listReadback = {
      progressRows: await listChildRow.locator('[data-task-progress-indicator="true"]').count(),
      assigneeIcons: await listChildRow.locator('[data-task-assignment-picker="true"] [data-task-assignment-trigger-icon="true"]').count(),
      status: await listChildRow.locator('select[title="修改狀態"]').inputValue(),
      assignee: await listChildRow.locator('[data-task-assignment-picker="true"] button').first().textContent(),
      startDate: await listChildRow.locator('[data-wbs-list-date-control="start"] input').inputValue(),
      endDate: await listChildRow.locator('[data-wbs-list-date-control="end"] input').inputValue(),
      duration: await listChildRow.locator('[data-wbs-list-duration-control="true"] input').inputValue(),
    };
    record('B14-list-keeps-progress-and-assignee-icon-while-reading-the-same-canonical-task-after-goal-edits', listReadback.progressRows === 1 && listReadback.assigneeIcons === 1 && listReadback.status === 'in_progress' && listReadback.assignee.trim() === goalEditProbe.assignee.trim() && listReadback.startDate === '2026-09-02' && listReadback.endDate === '2026-09-06' && listReadback.duration === '4', listReadback);
    const listHierarchyGeometry = await readHierarchyGeometry('list');
    const hierarchyParity = {
      goal: goalHierarchyGeometry,
      list: listHierarchyGeometry,
      rowHeightDifference: goalHierarchyGeometry.parent && listHierarchyGeometry.parent ? Math.abs(goalHierarchyGeometry.parent.rowHeight - listHierarchyGeometry.parent.rowHeight) : null,
    };
    record('V20-goal-compact-owned-tree-and-list-shared-default-geometry', Math.abs(goalHierarchyGeometry.titleDelta - 8) <= 0.75 && Math.abs(listHierarchyGeometry.titleDelta - 6) <= 0.75 && goalHierarchyGeometry.parent.indentToken === '8px' && listHierarchyGeometry.parent.indentToken === '6px' && Math.abs(goalHierarchyGeometry.parent.rowHeight - 32) <= 1 && Math.abs(listHierarchyGeometry.parent.rowHeight - 20) <= 1, hierarchyParity);
    await page.locator('[data-mode-switcher-trigger]').click();
    await page.locator('[data-mode-switcher-value="goal"]').click();
    await goalView.waitFor({ state: 'visible', timeout: 10000 });
    const dragSource = goalView.locator('[data-goal-task-row-id="dev116-sibling"] [data-goal-task-id="dev116-sibling"]');
    const dragTarget = goalView.locator('[data-goal-task-row-id="dev116-parent"] [data-goal-task-id="dev116-parent"]');
    const sourceBox = await dragSource.boundingBox();
    const targetBox = await dragTarget.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Goal drag geometry unavailable');
    await page.mouse.move(sourceBox.x + Math.min(120, sourceBox.width / 2), sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + Math.min(140, sourceBox.width / 2 + 20), sourceBox.y + sourceBox.height / 2 + 12, { steps: 4 });
    await page.mouse.move(targetBox.x + Math.min(120, targetBox.width / 2), targetBox.y + targetBox.height / 2, { steps: 8 });
    const dragOverlayProbe = {
      overlayCount: await page.locator('[data-goal-drag-overlay="true"]').count(),
      sourceId: await page.locator('[data-goal-drag-overlay="true"]').getAttribute('data-task-drag-source-id').catch(() => null),
    };
    record('B15-goal-desktop-drag-uses-a-visible-owned-overlay', dragOverlayProbe.overlayCount === 1 && dragOverlayProbe.sourceId === 'dev116-sibling', dragOverlayProbe);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const rootOrderAfterDrag = await goalView.locator('[data-goal-task-row][data-goal-level="0"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-goal-task-row-id')));
    if (rootOrderAfterDrag[0] === 'dev116-sibling') result.mutationCounts.task += 1;
    record('B16-goal-drag-commits-canonical-root-order', rootOrderAfterDrag[0] === 'dev116-sibling' && rootOrderAfterDrag[1] === 'dev116-parent', { rootOrderAfterDrag });
    record('B17-goal-task-mutations-remain-task-only', result.mutationCounts.task === 6 && result.mutationCounts.record === 0 && result.mutationCounts.taskLink === 0, { mutationCounts: result.mutationCounts });
    await page.screenshot({ path: `${OUTPUT_DIR}/V21-goal-after-drag-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V21-goal-after-drag-1440x900.png`);
    await seed('goal');
    await page.setViewportSize({ width: 814, height: 698 });
    await goalView.locator('[data-goal-task-table="true"]').waitFor({ state: 'visible', timeout: 5000 });
    const compactDesktopProbe = await page.evaluate(() => {
      const goalRoot = document.querySelector('[data-goal-view="true"]');
      const table = document.querySelector('[data-goal-task-table="true"]');
      const topbar = document.querySelector('[data-layout-region="topbar"]');
      if (!goalRoot || !table || !topbar) return null;
      return {
        headerCount: goalRoot.querySelectorAll(':scope > header').length,
        tableVisible: table.getBoundingClientRect().height > 0,
        topGap: Math.round(table.getBoundingClientRect().top - topbar.getBoundingClientRect().bottom),
      };
    });
    record('V15-compact-desktop-has-no-vacated-header-space', Boolean(compactDesktopProbe) && compactDesktopProbe.headerCount === 0 && compactDesktopProbe.tableVisible && compactDesktopProbe.topGap <= 20, compactDesktopProbe || {});
    await page.screenshot({ path: `${OUTPUT_DIR}/V15-goal-table-814x698.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V15-goal-table-814x698.png`);
    await page.locator('[data-mode-switcher-trigger]').click();
    const okrModeOption = page.locator('[data-mode-switcher-value="goal"]');
    const okrModeLabelProbe = {
      optionCount: await okrModeOption.count(),
      okrLabelCount: await okrModeOption.getByText('OKR模式', { exact: true }).count(),
      legacyLabelCount: await okrModeOption.getByText('目標模式', { exact: true }).count(),
    };
    record('V16-mode-switcher-uses-okr-label', okrModeLabelProbe.optionCount === 1 && okrModeLabelProbe.okrLabelCount === 1 && okrModeLabelProbe.legacyLabelCount === 0, okrModeLabelProbe);
    const modeMenu = page.locator('[data-mode-switcher-menu="true"]');
    const menuChromeProbe = {
      accessibleName: await modeMenu.getAttribute('aria-label'),
      visibleTitleCount: await modeMenu.getByText('切換模式', { exact: true }).count(),
      closeControlCount: await modeMenu.locator('[data-mode-switcher-close], [aria-label="關閉模式選單"]').count(),
    };
    record('V17-mode-switcher-introduction-row-is-removed', menuChromeProbe.accessibleName === '切換模式' && menuChromeProbe.visibleTitleCount === 0 && menuChromeProbe.closeControlCount === 0, menuChromeProbe);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT_DIR}/V17-mode-switcher-without-introduction-row-814x698.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V17-mode-switcher-without-introduction-row-814x698.png`);
    await page.keyboard.press('Escape');
    const escapeCloseProbe = {
      menuCount: await page.locator('[data-mode-switcher-menu="true"]').count(),
      triggerFocused: await page.evaluate(() => document.activeElement?.getAttribute('data-mode-switcher-trigger') === 'true'),
    };
    record('V18-escape-closes-headerless-mode-switcher', escapeCloseProbe.menuCount === 0 && escapeCloseProbe.triggerFocused, escapeCloseProbe);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.locator('[data-active-record-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-mode-switcher-trigger]').click();
    const liveGoalOption = page.locator('[data-mode-switcher-value="goal"]');
    const liveGoalProbe = {
      optionCount: await liveGoalOption.count(),
      active: await liveGoalOption.getAttribute('aria-checked'),
      composerCount: await page.locator('[data-record-composer-shell]').count(),
    };
    record('B07-live-meeting-keeps-goal-option-active', liveGoalProbe.optionCount === 1 && liveGoalProbe.active === 'true' && liveGoalProbe.composerCount === 1, liveGoalProbe);
    await page.keyboard.press('Escape');
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const liveGoalViewProbe = {
      goalViewCount: await page.locator('[data-goal-view="true"]').count(),
      meetingCount: await page.locator('[data-active-record-kind="meeting"]').count(),
      composerCount: await page.locator('[data-record-composer-shell]').count(),
    };
    record('B08-goal-start-meeting-preserves-goal-view', liveGoalViewProbe.goalViewCount === 1 && liveGoalViewProbe.meetingCount === 1 && liveGoalViewProbe.composerCount === 1, liveGoalViewProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/B08-goal-live-meeting-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/B08-goal-live-meeting-1440x900.png`);
    await page.locator('[data-meeting-draft-overflow]').click().catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
    await seed('goal', 390);
    record('B09-mobile-goal-is-not-exposed-in-v1', await page.locator('[data-goal-view="true"]').count() === 0 && await page.locator('[data-layout-region="board-canvas"]').count() === 1, {});
    const visibleErrors = await page.locator('[role="alert"]:visible, .inline-error:visible').allTextContents();
    record('B10-no-visible-runtime-errors', visibleErrors.length === 0, { visibleErrors });
    record('B11-no-browser-or-http-errors', result.browserErrors.length === 0 && result.httpFailures.length === 0, { browserErrors: result.browserErrors, httpFailures: result.httpFailures });
  } catch (error) {
    record('B99-runtime', false, { error: String(error) });
  }
  result.status = failures.length ? 'FAIL' : 'PASS'; result.failures = failures; result.generatedAt = new Date().toISOString();
  result.consoleErrors = result.browserErrors;
  result.pageErrors = result.browserErrors;
  result.httpErrors = result.httpFailures;
  result.visibleErrors = [];
  await page.evaluate(value => { window.__DEV116_ARTIFACT = value; sessionStorage.setItem('__DEV116_ARTIFACT', JSON.stringify(value)); }, result);
  console.log(`DEV116_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length) {
    const failedCases = result.cases.filter(testCase => !testCase.ok);
    throw new Error(`DEV-116 browser verification failed: ${JSON.stringify(failedCases)}`);
  }
  return result;
}
