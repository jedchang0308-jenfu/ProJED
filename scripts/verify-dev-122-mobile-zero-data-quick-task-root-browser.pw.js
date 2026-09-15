/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-122-mobile-zero-data-quick-task';
  const result = {
    devId: 'DEV-122', status: 'FAIL', sourceRevision: 'working-tree', buildId: 'unknown', actorAlias: 'DEV122-ROOT-A', fixtureVersion: 'DEV122-ROOT-V1', platform: 'Chromium', route: '/', viewport: { width: 390, height: 844 },
    cases: [], browserErrors: [], httpFailures: [], screenshots: [],
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false },
  };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, sourceRevision: result.sourceRevision, buildId: result.buildId, actorAlias: result.actorAlias, fixtureVersion: result.fixtureVersion, route: result.route, viewport: result.viewport, platform: result.platform, expected: true, actual: ok, status: ok ? 'PASS' : 'FAIL', details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('favicon')) result.httpFailures.push({ status: response.status(), url: response.url() }); });

  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local', displayName: 'DEV-122 QA', createdAt: 1704067200000 };
  const workspace = { id: 'dev122-workspace', title: 'DEV-122 快速入口', ownerId: account.id, members: [account.id], order: 1, createdAt: 1704067200000, boards: [{ id: 'dev122-board', title: '快速待辦看板', dependencies: [], order: 1, createdAt: 1704067200000 }] };
  const unplacedTask = { id: 'task_workbench_unplaced_dev122-root', workspaceId: workspace.id, boardId: '__task_workbench_unplaced__', parentId: null, title: 'DEV122 root intent task', status: 'todo', nodeType: 'task', order: 0, description: '', createdAt: 1704067200000, updatedAt: 1704067200000 };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, unplacedTask }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${workspace.id}:dev122-board`]: [{ userId: account.id, role: 'owner', profile: account }] }));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '1');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev122-board');
      localStorage.setItem('projed-last-view', 'settings');
      localStorage.setItem('projed-task-workbench-unplaced-tasks:v1:account:local-test-user', JSON.stringify([unplacedTask]));
      sessionStorage.setItem('projed:quick-workbench-intent:v1', JSON.stringify({ expiresAt: Date.now() + 900000 }));
    }, { account, workspace, unplacedTask });
    await page.reload({ waitUntil: 'networkidle' });
    result.buildId = await page.locator('meta[name="projed-shell-version"]').getAttribute('content').catch(() => 'local-test');
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) await fixed.click({ force: true });
    const panel = page.locator('[data-task-workbench-panel="true"]');
    await panel.waitFor({ state: 'visible', timeout: 15000 });
    record('R01', await panel.isVisible(), { panelCount: await panel.count(), url: await page.url() });
    record('R02', !(await page.url()).includes('quick_workbench'), { url: await page.url() });
    record('R03', await panel.getByText('DEV122 root intent task').isVisible().catch(() => false), {});
    await page.screenshot({ path: `${outputDir}/root-quick-workbench-390x844.png`, fullPage: true });
    result.screenshots.push(`${outputDir}/root-quick-workbench-390x844.png`);
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
  }
  result.failures = failures;
  await page.evaluate(({ result, outputDir }) => { window.__DEV122ROOT_ARTIFACT = result; window.__DEV122ROOT_ARTIFACT_PATH = outputDir; }, { result, outputDir });
  if (failures.length) throw new Error(`DEV-122 root browser verification failed: ${failures.join(', ')} | ${JSON.stringify(result.cases)}${result.browserErrors.length ? ` | ${result.browserErrors.join(' | ')}` : ''}`);
}
