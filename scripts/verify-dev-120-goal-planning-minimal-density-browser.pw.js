/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-120-goal-planning-minimal-density';
  const result = {
    devId: 'DEV-120',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    route: '/',
    actors: [{ id: 'local-test-user', role: 'owner' }, { id: 'local-test-viewer', role: 'viewer' }],
    fixtureIds: [],
    viewports: [{ width: 1440, height: 900 }, { width: 1298, height: 698 }, { width: 814, height: 698 }],
    cases: [],
    screenshots: [],
    browserErrors: [],
    httpFailures: [],
    cleanup: { runtime: 'matching pre-existing localhost:4000', action: 'reused; not stopped' },
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false },
  };
  const failures = [];
  const dialogs = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) result.httpFailures.push({ status: response.status(), url: response.url() });
  });

  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'dev120@projed.local', displayName: 'DEV-120 QA' };
  const workspace = {
    id: 'dev120-workspace', title: 'DEV-120 OKR', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev120-board', title: '極簡高密度驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const task = (id, title, order, parentId = null, extra = {}) => ({
    id, workspaceId: workspace.id, boardId: 'dev120-board', parentId, title, status: 'todo', nodeType: 'task', order,
    description: `${title} 的任務目的與可驗收結果`, startDate: '2026-09-02', endDate: '2026-09-04',
    assigneeId: account.id, assigneeIds: [account.id], collaboratorIds: [], isArchived: false, ...extra,
  });
  const nodes = {
    'dev120-parent': task('dev120-parent', 'DEV-120 父層目標：擴大可見工作空間', 0, null, { nodeType: 'group', status: 'in_progress', startDate: '2026-09-01', endDate: '2026-09-14' }),
    'dev120-child': task('dev120-child', '長任務名稱驗證：規劃欄壓縮後仍可追蹤', 1, 'dev120-parent', { status: 'in_progress', collaboratorIds: [account.id] }),
    'dev120-empty': task('dev120-empty', '空日期與空工期的安靜呈現', 2, 'dev120-parent', { startDate: '', endDate: '', assigneeId: null, assigneeIds: [], collaboratorIds: [] }),
    'dev120-locked': task('dev120-locked', '工期鎖定訊號保留', 3, 'dev120-parent', { isDurationLocked: true, endDate: '2026-09-08' }),
    'dev120-due': task('dev120-due', '截止日訊號不使用整格色塊', 4, 'dev120-parent', { endDate: '2026-09-14', status: 'todo' }),
    'dev120-complete': task('dev120-complete', '完成狀態仍保持低干擾', 5, 'dev120-parent', { status: 'completed' }),
    'dev120-sibling': task('dev120-sibling', '同表格右側欄位水平移動', 6, null, { status: 'onhold' }),
    'dev120-cross': task('dev120-cross', '跨年資料仍保留原生日期語意', 7, null, { startDate: '2026-12-31', endDate: '2027-01-03' }),
  };
  result.fixtureIds = Object.keys(nodes);
  const meetingRecord = {
    id: 'dev120-meeting', type: 'meeting', workspaceId: workspace.id, boardId: 'dev120-board', title: 'DEV-120 驗證會議',
    content: '## 任務討論\n- 09:00 @[長任務名稱驗證：規劃欄壓縮後仍可追蹤](task:dev120-child)：確認密度與捲動',
    status: 'published', visibility: 'project', occurredAt: 1704067200000, taskLinks: [{ nodeId: 'dev120-child', role: 'decision' }],
    metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [{ id: 'dev120-note', taskId: 'dev120-child', text: '確認密度與捲動', occurredAt: 1704067200000, anchor: { lineIndex: 1, sourceToken: '09:00|dev120-child' } }] } },
  };

  const seed = async (width = 1440, height = 900) => {
    await page.setViewportSize({ width, height });
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
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:dev120-board`]: [{ userId: account.id, role: 'owner', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([meetingRecord]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev120-board');
      localStorage.setItem('projed-last-view', 'goal');
    }, { account, workspace, nodes, meetingRecord });
    await page.reload({ waitUntil: 'networkidle' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) { await fixed.click({ force: true }); await page.waitForTimeout(250); }
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-goal-task-table="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  try {
    await seed(1440, 900);
    const goal = page.locator('[data-goal-view="true"]');
    const table = page.locator('[data-goal-task-table="true"]');
    const rowCount = await goal.locator('[data-goal-task-row]').count();
    record('B01-normal-entry-has-fixture', await goal.count() === 1 && rowCount === result.fixtureIds.length, { rowCount });
    await page.screenshot({ path: `${OUTPUT_DIR}/V01-goal-okr-1440x900.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/V01-goal-okr-1440x900.png`);
    const skeleton = await table.evaluate(element => {
      const cols = Array.from(element.querySelectorAll('col')).map(col => Math.round(col.getBoundingClientRect().width));
      const header = element.querySelector('thead');
      const taskHeader = element.querySelector('#goal-column-task');
      const ownerHeader = element.querySelector('#goal-column-owner');
      return {
        cols,
        tableBorder: getComputedStyle(element).borderTopWidth,
        headerBackground: header ? getComputedStyle(header).backgroundColor : '',
        taskHeaderLeft: taskHeader?.getBoundingClientRect().left ?? null,
        ownerHeaderLeft: ownerHeader?.getBoundingClientRect().left ?? null,
        tableWidth: element.getBoundingClientRect().width,
      };
    });
    record('V01-fixed-planning-tracks', skeleton.cols.slice(-5).join('/') === '112/64/96/96/60', skeleton);
    record('V02-flat-header-and-no-table-frame', skeleton.tableBorder === '0px' && !/rgb\(30, 41, 59\)|rgb\(15, 23, 42\)/.test(skeleton.headerBackground), skeleton);
    const quietProbe = await goal.evaluate(root => {
      const picker = root.querySelector('[data-task-assignment-trigger-variant="quiet"] button');
      const status = root.querySelector('[data-goal-planning-control="status"] select');
      const dates = Array.from(root.querySelectorAll('[data-goal-planning-control="start-date"] input, [data-goal-planning-control="end-date"] input'));
      const duration = root.querySelector('[data-goal-planning-control="duration"]');
      return {
        pickerCount: root.querySelectorAll('[data-task-assignment-trigger-variant="quiet"]').length,
        pickerBorder: picker ? getComputedStyle(picker).borderTopColor : null,
        statusBorder: status ? getComputedStyle(status).borderTopColor : null,
        statusBorderWidth: status ? getComputedStyle(status).borderTopWidth : null,
        dateCount: dates.length,
        dateBorder: dates[0] ? getComputedStyle(dates[0]).borderTopColor : null,
        emptyDashCount: root.querySelectorAll('[data-goal-planning-control] span').length,
        durationFrame: duration ? getComputedStyle(duration.firstElementChild).borderTopWidth : null,
      };
    });
    record('V03-quiet-planning-chrome', quietProbe.pickerCount === result.fixtureIds.length && quietProbe.pickerBorder === 'rgba(0, 0, 0, 0)' && quietProbe.statusBorderWidth === '0px' && quietProbe.dateBorder === 'rgba(0, 0, 0, 0)' && quietProbe.durationFrame === '0px', quietProbe);
    const emptyStart = goal.locator('[data-goal-task-row-id="dev120-empty"] [data-goal-planning-control="start-date"] input');
    const emptyOverlay = goal.locator('[data-goal-task-row-id="dev120-empty"] [data-goal-planning-control="start-date"] span');
    const emptyInputLabel = await emptyStart.getAttribute('aria-label');
    record('B02-empty-date-has-native-input', Boolean(emptyInputLabel) && await emptyStart.getAttribute('type') === 'date', { emptyInput: emptyInputLabel });

    const status = goal.locator('[data-goal-planning-control="status"] select').first();
    await status.selectOption('completed');
    await page.waitForTimeout(150);
    record('B03-status-native-change', await status.inputValue() === 'completed', { value: await status.inputValue() });
    const parentEnd = goal.locator('[data-goal-task-row-id="dev120-parent"] [data-goal-planning-control="end-date"] input');
    const validParentEnd = await parentEnd.inputValue();
    const dialogStart = dialogs.length;
    await page.evaluate(() => {
      window.__DEV120_ALERTS = [];
      window.alert = message => window.__DEV120_ALERTS.push(String(message));
    });
    await parentEnd.fill('2026-09-03');
    const validationMessages = await page.evaluate(() => window.__DEV120_ALERTS || []);
    validationMessages.forEach(message => dialogs.push({ type: 'alert', message }));
    await page.waitForTimeout(120);
    const storedAfterInvalid = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      return stored['dev120-parent']?.endDate || null;
    });
    record('B04-validation-keeps-last-valid-value', dialogs.slice(dialogStart).some(dialog => /結束日期不得早於開始日期|上層任務/.test(dialog.message)) && await parentEnd.inputValue() === validParentEnd && storedAfterInvalid === validParentEnd, {
      dialogs: dialogs.slice(dialogStart),
      inputValue: await parentEnd.inputValue(),
      storedAfterInvalid,
      validParentEnd,
    });
    const pickerTrigger = goal.locator('[data-task-assignment-trigger-variant="quiet"] button').first();
    await pickerTrigger.click();
    const pickerPanel = page.locator('[data-task-assignment-picker-panel="true"]');
    record('B04-owner-picker-opens-portal', await pickerPanel.count() === 1 && await pickerPanel.isVisible(), { panelCount: await pickerPanel.count() });
    record('B05-planning-control-does-not-open-details', await page.locator('[data-task-details-modal="true"]').count() === 0, {});
    await page.keyboard.press('Escape');
    await emptyStart.focus();
    record('A01-native-date-remains-keyboard-focusable', await emptyStart.evaluate(input => document.activeElement === input), {});
    record('B08-empty-date-overlay-yields-to-focus', !(await emptyOverlay.isVisible().catch(() => false)) && await emptyStart.inputValue() === '', {
      overlayVisible: await emptyOverlay.isVisible().catch(() => false),
      inputValue: await emptyStart.inputValue(),
    });
    const lockedRow = goal.locator('[data-goal-task-row-id="dev120-locked"]');
    const lockedEnd = lockedRow.locator('[data-goal-planning-control="end-date"] input');
    const lockedDurationButton = lockedRow.locator('[data-goal-planning-control="duration"] button');
    const dueRow = goal.locator('[data-goal-task-row-id="dev120-due"]');
    const dueEndCell = dueRow.locator('[data-goal-planning-control="end-date"]');
    const dueEnd = dueEndCell.locator('input');
    const dueProbe = await dueEndCell.evaluate(cell => ({
      background: getComputedStyle(cell).backgroundColor,
      inputColor: getComputedStyle(cell.querySelector('input')).color,
      inputWeight: getComputedStyle(cell.querySelector('input')).fontWeight,
    }));
    record('A02-lock-and-due-signals-remain-readable', await lockedEnd.isEditable().catch(() => false) === false && (await lockedDurationButton.getAttribute('aria-label') || '').includes('解除') && dueProbe.background !== 'rgb(255, 237, 213)' && dueProbe.inputColor !== 'rgb(255, 255, 255)', {
      lockedEndReadOnly: !(await lockedEnd.isEditable().catch(() => false)),
      lockLabel: await lockedDurationButton.getAttribute('aria-label'),
      dueProbe,
    });

    await seed(814, 698);
    const compactRoot = page.locator('[data-goal-view="true"]');
    const compactScroll = await compactRoot.evaluate(root => {
      const tableElement = root.querySelector('[data-goal-task-table="true"]');
      const taskHeader = root.querySelector('#goal-column-task');
      const ownerHeader = root.querySelector('#goal-column-owner');
      const taskCell = root.querySelector('[data-goal-task-row] th[scope="row"]');
      if (!tableElement || !taskHeader || !ownerHeader || !taskCell) return null;
      const before = { taskHeaderLeft: taskHeader.getBoundingClientRect().left, taskCellLeft: taskCell.getBoundingClientRect().left, ownerHeaderLeft: ownerHeader.getBoundingClientRect().left, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
      root.scrollLeft = Math.min(160, Math.max(0, root.scrollWidth - root.clientWidth));
      const after = { taskHeaderLeft: taskHeader.getBoundingClientRect().left, taskCellLeft: taskCell.getBoundingClientRect().left, ownerHeaderLeft: ownerHeader.getBoundingClientRect().left, scrollLeft: root.scrollLeft };
      return { before, after, taskHeaderDelta: after.taskHeaderLeft - before.taskHeaderLeft, taskCellDelta: after.taskCellLeft - before.taskCellLeft, ownerDelta: after.ownerHeaderLeft - before.ownerHeaderLeft };
    });
    const scrollDelta = compactScroll?.after.scrollLeft ?? 0;
    record('V04-single-x-scroll-freezes-task-name', Boolean(compactScroll) && compactScroll.before.scrollWidth > compactScroll.before.clientWidth && Math.abs(compactScroll.taskHeaderDelta) <= 1 && Math.abs(compactScroll.taskCellDelta) <= 1 && Math.abs(compactScroll.ownerDelta + scrollDelta) <= 1, compactScroll || {});
    const compactRows = await compactRoot.locator('[data-goal-task-row]').count();
    const compactRowHeight = await compactRoot.locator('[data-goal-task-row]').first().evaluate(row => Math.round(row.getBoundingClientRect().height));
    record('V05-compact-row-density', compactRows === result.fixtureIds.length && compactRowHeight >= 28 && compactRowHeight <= 36, { compactRows, compactRowHeight });
    await compactRoot.evaluate(root => { root.scrollLeft = root.scrollWidth - root.clientWidth; });
    const edgePickerTrigger = compactRoot.locator('[data-task-assignment-trigger-variant="quiet"] button').last();
    await edgePickerTrigger.click();
    const edgePickerPanel = page.locator('[data-task-assignment-picker-panel="true"]');
    await edgePickerPanel.waitFor({ state: 'visible', timeout: 5000 });
    const edgePickerBox = await edgePickerPanel.boundingBox();
    record('V06-picker-portal-stays-within-viewport', Boolean(edgePickerBox) && edgePickerBox.x >= 0 && edgePickerBox.y >= 0 && edgePickerBox.x + edgePickerBox.width <= 814 && edgePickerBox.y + edgePickerBox.height <= 698, { edgePickerBox });
    await page.keyboard.press('Escape');
    await compactRoot.screenshot({ path: `${OUTPUT_DIR}/V05-goal-okr-frozen-task-column-814x698.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V05-goal-okr-frozen-task-column-814x698.png`);

    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.waitForTimeout(200);
    const zoomProbe = await compactRoot.evaluate(root => {
      const tableElement = root.querySelector('[data-goal-task-table="true"]');
      const taskCell = root.querySelector('[data-goal-task-row] th[scope="row"]');
      const stickyHeader = root.querySelector('#goal-column-task');
      const controls = Array.from(root.querySelectorAll('[data-goal-planning-control] input, [data-goal-planning-control] select, [data-task-assignment-trigger-variant="quiet"] button'));
      return {
        tableCount: root.querySelectorAll('table').length,
        tableOverflowX: tableElement ? getComputedStyle(root).overflowX : null,
        taskCellVisible: Boolean(taskCell && taskCell.getBoundingClientRect().width > 0 && taskCell.getBoundingClientRect().height > 0),
        stickyHeaderVisible: Boolean(stickyHeader && stickyHeader.getBoundingClientRect().width > 0 && stickyHeader.getBoundingClientRect().height > 0),
        controlsWithBox: controls.filter(control => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length,
      };
    });
    record('V06-200-percent-keeps-controls-reachable', zoomProbe.tableCount === 1 && zoomProbe.tableOverflowX === 'auto' && zoomProbe.taskCellVisible && zoomProbe.stickyHeaderVisible && zoomProbe.controlsWithBox > 0, zoomProbe);
    await compactRoot.screenshot({ path: `${OUTPUT_DIR}/V06-goal-okr-200-percent-814x698.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V06-goal-okr-200-percent-814x698.png`);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });

    const readOnlyAccount = { id: 'local-test-viewer', uid: 'local-test-viewer', email: 'viewer@projed.local', displayName: 'DEV-120 Viewer' };
    const readOnlyWorkspace = { id: 'dev120-readonly-workspace', title: 'DEV-120 read-only', ownerId: 'local-test-admin', members: [readOnlyAccount.id], order: 1, createdAt: 1704067200000, boards: [{ id: 'dev120-readonly-board', title: 'DEV-120 read-only board', dependencies: [], order: 1, createdAt: 1704067200000 }] };
    const readOnlyNodes = {
      'dev120-readonly-task': { ...nodes['dev120-parent'], id: 'dev120-readonly-task', workspaceId: readOnlyWorkspace.id, boardId: 'dev120-readonly-board', parentId: null, title: '唯讀角色仍可閱讀規劃值', assigneeId: readOnlyAccount.id, assigneeIds: [readOnlyAccount.id], collaboratorIds: [] },
    };
    await page.evaluate(({ account, workspace, readOnlyNodes }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(readOnlyNodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:dev120-readonly-board`]: [{ userId: account.id, role: 'viewer', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev120-readonly-board');
      localStorage.setItem('projed-last-view', 'goal');
    }, { account: readOnlyAccount, workspace: readOnlyWorkspace, readOnlyNodes });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const readOnlyGoal = page.locator('[data-goal-view="true"]');
    const readOnlyProbe = await readOnlyGoal.evaluate(root => {
      const picker = root.querySelector('[data-task-assignment-trigger-variant="quiet"] button');
      const status = root.querySelector('[data-goal-planning-control="status"] select');
      const dates = Array.from(root.querySelectorAll('[data-goal-planning-control="start-date"] input, [data-goal-planning-control="end-date"] input'));
      const duration = root.querySelector('[data-goal-planning-control="duration"] input');
      return {
        pickerDisabled: picker?.hasAttribute('disabled') ?? false,
        statusDisabled: status?.hasAttribute('disabled') ?? false,
        dateReadOnly: dates.length > 0 && dates.every(input => input.hasAttribute('readonly')),
        durationDisabled: duration?.hasAttribute('disabled') ?? false,
        visibleValue: root.querySelector('[data-goal-task-row]')?.textContent?.trim() || '',
      };
    });
    record('A02-read-only-actor-keeps-values-but-disables-mutations', readOnlyProbe.pickerDisabled && readOnlyProbe.statusDisabled && readOnlyProbe.dateReadOnly && readOnlyProbe.durationDisabled && readOnlyProbe.visibleValue.includes('唯讀角色仍可閱讀規劃值'), readOnlyProbe);

    const visibleErrors = await page.locator('[role="alert"]:visible, .inline-error:visible').allTextContents();
    record('G01-no-unexpected-visible-errors', visibleErrors.length === 0, { visibleErrors });
    record('G02-no-browser-or-http-errors', result.browserErrors.length === 0 && result.httpFailures.length === 0, { browserErrors: result.browserErrors, httpFailures: result.httpFailures });
    await page.screenshot({ path: `${OUTPUT_DIR}/A02-goal-okr-read-only-814x698.png`, fullPage: false });
    result.screenshots.push(`${OUTPUT_DIR}/A02-goal-okr-read-only-814x698.png`);
  } catch (error) {
    record('B99-runtime', false, { error: String(error) });
  }
  result.status = failures.length ? 'FAIL' : 'PASS';
  result.failures = failures;
  result.consoleErrors = result.browserErrors;
  result.pageErrors = result.browserErrors;
  result.visibleErrors = [];
  result.generatedAt = new Date().toISOString();
  await page.evaluate(value => { window.__DEV120_ARTIFACT = value; sessionStorage.setItem('__DEV120_ARTIFACT', JSON.stringify(value)); }, result);
  console.log(`DEV120_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length) throw new Error(`DEV-120 browser verification failed: ${JSON.stringify(result.cases.filter(testCase => !testCase.ok))}`);
  return result;
}
