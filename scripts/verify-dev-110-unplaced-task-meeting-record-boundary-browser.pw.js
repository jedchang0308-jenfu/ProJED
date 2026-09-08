/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-110-unplaced-task-meeting-record-boundary';
  const diagnostics = [];
  const httpFailures = [];
  const providerRequests = [];
  const cases = [];
  const screenshots = [];
  const taskTitle = 'DEV-110 未歸位任務';
  const account = {
    id: 'dev110-user', uid: 'dev110-user', email: 'dev110@projed.local', displayName: 'DEV-110 QA', createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev110-workspace', title: 'DEV-110 未歸位邊界', ownerId: account.id, members: [account.id], order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'dev110-board', title: 'DEV-110 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const unplacedTask = {
    id: 'task_workbench_unplaced_dev110', workspaceId: workspace.id, boardId: '__task_workbench_unplaced__', parentId: null,
    title: taskTitle, description: taskTitle, status: 'todo', nodeType: 'task', order: 0,
    createdAt: 1704067200000, updatedAt: 1704067200000,
  };

  page.on('console', message => { if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) httpFailures.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', request => {
    if (/(supabase\.co|\/rest\/v1\/(?:knowledge_records|record_task_links|wbs_items)|\/graphql|\/rpc\/)/i.test(request.url())) providerRequests.push(`${request.method()} ${request.url()}`);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
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
      throw new Error(`${id}: ${message}`);
    }
  };
  const seed = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    const fixedTestEnvironment = page.getByRole('button', { name: 'T 使用固定測試環境' });
    if (await fixedTestEnvironment.count() > 0) {
      await fixedTestEnvironment.click();
      await page.getByRole('heading', { name: 'ProJED 品質驗證測試看板' }).waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);
    }
    await page.evaluate(({ account, workspace, unplacedTask }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:${workspace.boards[0].id}`]: [{ userId: account.id, role: 'owner' }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-task-workbench-unplaced-tasks:v1', JSON.stringify([unplacedTask]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, unplacedTask });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: taskTitle, exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  };
  const openTask = async () => {
    await page.getByRole('button', { name: taskTitle, exact: true }).click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    return modal;
  };
  const closeTask = async (modal) => {
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await modal.waitFor({ state: 'hidden', timeout: 10000 });
  };

  await seed({ width: 1440, height: 900 });
  let modal;
  await runCase('B01', 'non-meeting unplaced task has no meeting section or provider request', async () => {
    const before = providerRequests.length;
    modal = await openTask();
    await page.waitForTimeout(250);
    const actual = {
      section: await modal.locator('[data-task-meeting-quick-notes]').count(),
      providerRequests: providerRequests.slice(before),
    };
    assert(actual.section === 0, 'non-meeting unplaced task should not render a meeting section', actual);
    assert(actual.providerRequests.length === 0, 'non-meeting unplaced task should not call record/WBS provider', actual);
    await closeTask(modal);
    return actual;
  });

  await runCase('B02', 'meeting unplaced task shows one placement message without composer or retry', async () => {
    const before = providerRequests.length;
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.getByText('紀錄中', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    modal = await openTask();
    await modal.locator('[data-task-meeting-quick-notes]').waitFor({ state: 'visible', timeout: 10000 });
    const actual = {
      message: await modal.locator('[data-task-meeting-quick-notes-availability]').textContent(),
      section: await modal.locator('[data-task-meeting-quick-notes]').count(),
      composer: await modal.locator('[data-task-meeting-quick-notes-composer]').count(),
      retry: await modal.getByRole('button', { name: '重試' }).count(),
      providerRequests: providerRequests.slice(before),
    };
    assert(actual.section === 1, 'meeting unplaced task should render one meeting section', actual);
    assert(actual.message?.trim() === '請先將任務放入目前會議的看板，再新增會議紀錄。', 'placement message should be exact and actionable', actual);
    assert(actual.composer === 0 && actual.retry === 0, 'unsupported capability should have no composer/retry', actual);
    assert(actual.providerRequests.length === 0, 'meeting unplaced task should not call record/WBS provider', actual);
    assert((await page.getByText('Supabase WBS item not found for legacy node id', { exact: false }).count()) === 0, 'raw Supabase error must stay hidden');
    await page.screenshot({ path: `${OUTPUT_DIR}/B02-unplaced-meeting-1440x900.png`, fullPage: true });
    screenshots.push(`${OUTPUT_DIR}/B02-unplaced-meeting-1440x900.png`);
    await closeTask(modal);
    return actual;
  });

  await runCase('B03', 'mobile meeting-record availability boundary remains compact without raw error', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    modal = await openTask();
    await page.waitForTimeout(200);
    const actual = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      section: Boolean(document.querySelector('[data-task-meeting-quick-notes]')),
      composer: Boolean(document.querySelector('[data-task-meeting-quick-notes-composer]')),
    }));
    assert(!actual.section && !actual.composer && actual.scrollWidth <= actual.width + 1, 'mobile meeting-record surface should stay unavailable without overflow', actual);
    await page.screenshot({ path: `${OUTPUT_DIR}/B03-unplaced-meeting-390x844.png`, fullPage: true });
    screenshots.push(`${OUTPUT_DIR}/B03-unplaced-meeting-390x844.png`);
    await closeTask(modal);
    return actual;
  });

  await runCase('B04', 'browser surface has no runtime or HTTP failure', async () => {
    assert(diagnostics.length === 0, 'browser runtime errors should be empty', { diagnostics });
    assert(httpFailures.length === 0, 'browser HTTP failures should be empty', { httpFailures });
    return { diagnostics, httpFailures, providerRequests };
  });

  const artifact = {
    devId: 'DEV-110', status: 'PASS', sourceRevision: 'working-tree', environment: 'local-test-browser', cases,
    screenshots, diagnostics, httpFailures, providerRequests, generatedAt: new Date().toISOString(),
  };
  await page.evaluate(result => { window.__DEV110_ARTIFACT = result; }, artifact);
}
