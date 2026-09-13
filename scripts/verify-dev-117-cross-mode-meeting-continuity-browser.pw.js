/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-117-meeting-continuity';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  page.on('dialog', async dialog => { await dialog.dismiss(); });
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) httpFailures.push(`${response.status()} ${response.url()}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const account = { id: 'dev117-browser-user', uid: 'dev117-browser-user', email: 'dev117-browser@projed.local', displayName: 'DEV-117 QA', createdAt: 1704067200000 };
  const workspace = {
    id: 'dev117-browser-workspace', title: 'DEV-117 跨模式會議', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev117-browser-board', title: 'DEV-117 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const node = {
    id: 'dev117-browser-task', workspaceId: workspace.id, boardId: workspace.boards[0].id, parentId: null,
    title: 'DEV-117 測試任務', status: 'todo', nodeType: 'task', order: 0, description: '',
    detailNotes: [{ id: 'note_default', title: '任務目的', content: '' }], createdAt: 1704067200000, updatedAt: 1704067200000,
  };
  const VIEW_READY = {
    board: '[data-layout-region="board-canvas"]',
    list: '[data-task-hierarchy-surface="list"]',
    mindmap: '[data-mindmap-view]',
    gantt: '[data-mobile-pan-surface="gantt"]',
    calendar: '[data-task-date-empty-hint="calendar"], [data-calendar-task-segment="true"], button[title="上個月"]',
    goal: '[data-goal-view="true"]',
  };
  const VIEWS = ['board', 'list', 'mindmap', 'gantt', 'calendar', 'goal'];

  const seed = async (view = 'board', width = 1440) => {
    const activeMeeting = page.locator('[data-active-record-kind="meeting"]');
    if (await activeMeeting.count() && await activeMeeting.isVisible().catch(() => false)) {
      const overflow = page.locator('[data-meeting-draft-overflow]');
      if (await overflow.count() && await overflow.isVisible().catch(() => false)) {
        await overflow.click();
        const saveAndExit = page.locator('[data-meeting-draft-save-and-exit]');
        if (await saveAndExit.count() && !(await saveAndExit.isDisabled())) {
          await saveAndExit.click();
          await activeMeeting.waitFor({ state: 'hidden', timeout: 15000 });
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, node, view }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({ [node.id]: node }));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:${workspace.boards[0].id}`]: [{ userId: account.id, role: 'owner' }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', view);
    }, { account, workspace, node, view });
    await page.reload({ waitUntil: 'networkidle' });
    const fixedTestButton = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedTestButton.count() && await fixedTestButton.isVisible().catch(() => false)) {
      await fixedTestButton.click({ force: true });
      await page.waitForTimeout(250);
    }
    await page.locator(VIEW_READY[view]).first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const switchView = async (view) => {
    const trigger = page.locator('[data-mode-switcher-trigger]');
    assert(await trigger.count() === 1, 'mode switcher should be mounted');
    assert(!(await trigger.isDisabled()), 'mode switcher should be enabled during meeting');
    await trigger.click();
    const item = page.locator(`[data-mode-switcher-value="${view}"]`);
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click();
    await page.locator(VIEW_READY[view]).first().waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-active-record-kind="meeting"]').waitFor({ state: 'visible', timeout: 5000 });
  };

  const startMeeting = async () => {
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.locator('[data-active-record-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
  };
  const meetingProbe = async () => page.evaluate(() => ({
    view: localStorage.getItem('projed-last-view'),
    draftId: document.querySelector('[data-record-title-input]')?.value || null,
    isMeetingMode: Boolean(document.querySelector('[data-active-record-kind="meeting"]')),
    isPanelOpen: Boolean(document.querySelector('[data-record-composer-shell]')),
    isPanelCollapsed: Boolean(document.querySelector('[data-record-sidebar-expand-toggle]')),
    workflowMarker: document.querySelector('[data-meeting-workflow-card]')?.getAttribute('data-meeting-workflow-card') || null,
  }));

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
      throw new Error(`${id}: ${message}`);
    }
  };

  await runCase('B01', 'each task projection view starts a meeting without changing the current view', async () => {
    const results = {};
    for (const view of VIEWS) {
      await seed(view);
      await startMeeting();
      const probe = await meetingProbe();
      assert(probe.view === view && probe.isMeetingMode && probe.draftId && probe.workflowMarker, 'meeting start probe should preserve view and establish one session', { view, probe });
      const trigger = page.locator('[data-mode-switcher-trigger]');
      assert(!(await trigger.isDisabled()), 'meeting mode must not disable mode switcher', { view });
      await trigger.click();
      const activeItem = page.locator(`[data-mode-switcher-value="${view}"]`);
      assert(await activeItem.getAttribute('aria-checked') === 'true', 'meeting start must preserve view', { view });
      await page.keyboard.press('Escape');
      assert(await page.locator('[data-record-composer-shell]').count() === 1, 'one meeting sidebar must remain mounted', { view });
      await page.screenshot({ path: `${OUTPUT_DIR}/V01-${view}.png`, fullPage: false });
      results[view] = { preserved: true, modeSwitcherEnabled: true, probe };
    }
    return results;
  });

  await runCase('B02', 'live meeting can switch across all six task projections and back without restart', async () => {
    await seed('board');
    await startMeeting();
    const title = page.locator('[data-record-title-input]');
    await title.fill('DEV117-CONTINUITY-TITLE');
    const initialProbe = await meetingProbe();
    const sequence = ['list', 'mindmap', 'gantt', 'calendar', 'goal', 'board'];
    const observed = [];
    for (const view of sequence) {
      await switchView(view);
      const probe = await meetingProbe();
      assert(await page.locator('[data-record-composer-shell]').count() === 1, 'view switch must not duplicate composer', { view });
      assert(await page.locator('[data-record-title-input]').inputValue() === 'DEV117-CONTINUITY-TITLE', 'meeting draft must remain same instance', { view });
      assert(probe.view === view && probe.isMeetingMode && probe.draftId === initialProbe.draftId && probe.workflowMarker === initialProbe.workflowMarker, 'view switch must preserve meeting session identity', { view, initialProbe, probe });
      observed.push(view);
    }
    return { sequence: observed, meetingRestarted: false, composerCount: await page.locator('[data-record-composer-shell]').count(), initialProbe, finalProbe: await meetingProbe() };
  });

  await runCase('B03', 'meeting draft and collapsed/expanded panel state survive mode switches', async () => {
    const collapse = page.locator('[data-record-sidebar-collapse-toggle]');
    await collapse.click();
    const collapsedProbe = await meetingProbe();
    await page.locator('[data-record-sidebar-expand-toggle]').waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.locator('[data-record-composer-shell]').count() === 0, 'collapsed panel should hide composer shell');
    await switchView('list');
    await page.locator('[data-record-sidebar-expand-toggle]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.locator('[data-record-title-input]').inputValue() === 'DEV117-CONTINUITY-TITLE', 'draft title must survive panel and view changes');
    const expandedProbe = await meetingProbe();
    assert(expandedProbe.draftId === 'DEV117-CONTINUITY-TITLE' && expandedProbe.workflowMarker === 'compact' && collapsedProbe.isMeetingMode && expandedProbe.isMeetingMode, 'panel state change must not rebuild meeting session', { collapsedProbe, expandedProbe });
    return { collapsedThenExpanded: true, draftPreserved: true, collapsedProbe, expandedProbe };
  });

  await runCase('B04', 'rapid repeated switching does not close, save, restart, or duplicate the meeting', async () => {
    const sequence = ['board', 'list', 'goal', 'board', 'list', 'mindmap', 'mindmap', 'gantt', 'calendar', 'goal', 'board'];
    const beforeProbe = await meetingProbe();
    for (const view of sequence) await switchView(view);
    const afterProbe = await meetingProbe();
    assert(await page.locator('[data-active-record-kind="meeting"]').count() === 1, 'meeting status should remain singular');
    assert(await page.locator('[data-record-composer-shell]').count() === 1, 'composer shell should remain singular');
    assert(await page.locator('[data-meeting-workflow-card]').count() === 1, 'meeting workflow card should remain singular');
    assert(beforeProbe.draftId === afterProbe.draftId && beforeProbe.workflowMarker === afterProbe.workflowMarker, 'rapid switching must preserve draft and workflow identity', { beforeProbe, afterProbe });
    return { switchCount: sequence.length, meetingStatusCount: 1, composerCount: 1, workflowCount: 1, beforeProbe, afterProbe };
  });

  await runCase('B05', 'manual task quick notes remain available from Task Details in every task projection view', async () => {
    const results = {};
    for (const view of VIEWS) {
      try {
        await seed(view);
        await startMeeting();
        if (view === 'mindmap') {
          const task = page.locator(`[data-mindmap-node="${node.id}"]`);
          await task.waitFor({ state: 'visible', timeout: 10000 });
          await task.dblclick();
        } else {
          const task = page.getByText(node.title, { exact: true }).last();
          await task.waitFor({ state: 'visible', timeout: 10000 });
          await task.click();
        }
        const modal = page.locator('[data-task-details-modal="true"]');
        await modal.waitFor({ state: 'visible', timeout: 10000 });
        const section = modal.locator('[data-task-meeting-quick-notes="true"]');
        await section.waitFor({ state: 'visible', timeout: 10000 });
        const input = section.locator('textarea').first();
        await input.fill(`DEV117-${view}-QUICK-NOTE`);
        await section.getByRole('button', { name: '加入' }).click();
        await section.getByText(`DEV117-${view}-QUICK-NOTE`).waitFor({ state: 'visible', timeout: 10000 });
        const noteInDraft = await page.locator('[data-record-content-editor]').textContent();
        assert(noteInDraft?.includes(`DEV117-${view}-QUICK-NOTE`), 'quick note should enter the active meeting draft exactly once', { view, noteInDraft });
        await modal.getByRole('button', { name: '關閉任務詳情' }).click();
        await modal.waitFor({ state: 'hidden', timeout: 5000 });
        await switchView(view === 'board' ? 'list' : 'board');
        const noteAfterSwitch = await page.locator('[data-record-content-editor]').textContent();
        assert(noteAfterSwitch?.includes(`DEV117-${view}-QUICK-NOTE`), 'quick note should remain visible after switching projection', { view, noteAfterSwitch });
        results[view] = { quickNote: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${view}: ${message}`);
      }
    }
    return results;
  });

  await runCase('V02-V03', '1024px open/collapsed and 200% zoom keep the meeting controls usable', async () => {
    await seed('board', 1024);
    await startMeeting();
    await page.screenshot({ path: `${OUTPUT_DIR}/V02-1024-open.png`, fullPage: false });
    await page.locator('[data-record-sidebar-collapse-toggle]').click();
    await page.locator('[data-record-sidebar-expand-toggle]').waitFor({ state: 'visible', timeout: 5000 });
    await page.screenshot({ path: `${OUTPUT_DIR}/V02-1024-collapsed.png`, fullPage: false });
    await page.locator('[data-record-sidebar-expand-toggle]').click();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    assert(await page.locator('[data-mode-switcher-trigger]').isVisible(), 'ModeSwitcher should remain reachable at 200% zoom');
    assert(await page.locator('[data-record-composer-shell]').isVisible(), 'RecordSidebar should remain reachable at 200% zoom');
    await page.screenshot({ path: `${OUTPUT_DIR}/V03-200-percent.png`, fullPage: false });
    return { open1024: true, collapsed1024: true, zoom200: true };
  });

  await runCase('B06', 'coarse pointer mobile mode keeps meeting unavailable and does not expose cross-mode switching', async () => {
    await seed('board', 390);
    assert(await page.locator('[data-mode-switcher-trigger]').count() === 0, 'mobile board-only mode should hide mode switcher');
    assert(await page.getByRole('button', { name: '新增會議記錄' }).count() === 0, 'mobile board-only mode should not expose meeting entry');
    return { modeSwitcher: 0, meetingEntry: 0 };
  });

  await runCase('B07', 'browser surface remains free of runtime and network errors', async () => {
    const health = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(health.scrollWidth <= health.width + 1, 'mobile surface should not overflow', health);
    assert(diagnostics.length === 0, 'no browser runtime errors expected', { diagnostics });
    assert(httpFailures.length === 0, 'no HTTP failures expected', { httpFailures });
    return { health, diagnostics, httpFailures };
  });

  const artifact = { devId: 'DEV-117', status: 'PASS', sourceRevision: 'working-tree', environment: 'local-test-browser', cases, diagnostics, httpFailures, generatedAt: new Date().toISOString() };
  await page.evaluate(result => { window.__DEV117_ARTIFACT = result; }, artifact);
}
