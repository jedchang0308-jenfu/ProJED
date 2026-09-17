/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-122-mobile-zero-data-quick-task';
  const result = {
    devId: 'DEV-122', status: 'FAIL', sourceRevision: 'working-tree', buildId: 'unknown', actorAlias: 'DEV122-ROOT-A', fixtureVersion: 'DEV122-ROOT-R12-V1', platform: 'Chromium', route: '/', viewport: { width: 390, height: 844 },
    cases: [], browserErrors: [], httpFailures: [], screenshots: [],
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false },
  };
  const failures = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, sourceRevision: result.sourceRevision, buildId: result.buildId, actorAlias: result.actorAlias, fixtureVersion: result.fixtureVersion, route: result.route, viewport: result.viewport, platform: result.platform, expected: true, actual: ok, status: ok ? 'PASS' : 'FAIL', details }); if (!ok) failures.push(id); };
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() < 400 || response.url().includes('favicon')) return;
    if (response.url().startsWith('http://localhost:4000/')) result.httpFailures.push({ status: response.status(), url: response.url() });
  });
  let collectQuickRequests = false;
  const quickRequests = [];
  page.on('request', request => {
    if (collectQuickRequests) quickRequests.push(request.url());
  });

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

    const rootManifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      return { status: response.status, value: await response.json() };
    });
    const rootManifestLinks = await page.locator('link[rel="manifest"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    const shortcut = rootManifest.value.shortcuts?.[0];
    record('B22', rootManifest.status === 200
      && rootManifest.value.id === '/'
      && rootManifest.value.start_url === '/'
      && rootManifest.value.scope === '/'
      && shortcut?.name === '快速建待辦'
      && shortcut?.short_name === '建待辦'
      && shortcut?.description === '直接輸入一筆待辦'
      && shortcut?.url === '/quick-task/'
      && shortcut?.icons?.[0]?.sizes === '1024x1024'
      && rootManifestLinks.length === 1
      && rootManifestLinks[0] === '/manifest.webmanifest'
      && page.url().replace('http://localhost:4000', '').split(/[?#]/u)[0] === '/', { rootManifest, rootManifestLinks, url: page.url() });

    collectQuickRequests = true;
    await page.goto('http://localhost:4000/quick-task/', { waitUntil: 'domcontentloaded' });
    await page.locator('#quick-task-title').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    collectQuickRequests = false;
    const quickSurface = await page.evaluate(() => ({
      pathname: window.location.pathname,
      rootMarkerCount: document.querySelectorAll('#root').length,
      manifestLinks: Array.from(document.querySelectorAll('link[rel="manifest"]')).map(link => link.getAttribute('href')),
      titleFocused: document.activeElement?.id === 'quick-task-title',
    }));
    const businessRequests = quickRequests.filter(url => /\/rest\/v1\/(?:workspaces|boards|tasks|profiles|tenant_members|task_workbench_unplaced_items)|\/api\/(?:workspaces|boards|tasks|members|tags|records|calendar)/u.test(url));
    record('B23', quickSurface.pathname === '/quick-task/'
      && quickSurface.rootMarkerCount === 0
      && quickSurface.manifestLinks.length === 1
      && quickSurface.manifestLinks[0] === '/quick-task/manifest.webmanifest'
      && quickSurface.titleFocused
      && businessRequests.length === 0, { quickSurface, businessRequests, requestCount: quickRequests.length });
    await page.screenshot({ path: `${outputDir}/root-shortcut-target-390x844.png`, fullPage: true });
    result.screenshots.push(`${outputDir}/root-shortcut-target-390x844.png`);

    const settingsEvidence = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:4000/?qcReset=1', { waitUntil: 'domcontentloaded' });
      await page.evaluate(({ account, workspace }) => {
        localStorage.setItem('projed-local-test.selected-account', account.id);
        localStorage.setItem('projed-local-test.session', JSON.stringify(account));
        localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
        localStorage.setItem('projed-local-test.seeded.v1', 'true');
        localStorage.setItem('projed-local-test.seeded.size', '1');
      }, { account, workspace });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const useFixed = page.getByRole('button', { name: /使用固定測試環境/ });
      if (await useFixed.count() && await useFixed.isVisible().catch(() => false)) await useFixed.click({ force: true });
      await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 });
      const settingsButton = page.locator('[data-sidebar-settings-button="true"]').first();
      if (!(await settingsButton.isVisible().catch(() => false))) await page.locator('[data-main-sidebar-toggle="true"]').first().click();
      await settingsButton.waitFor({ state: 'visible', timeout: 10000 });
      await settingsButton.click();
      await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('[data-settings-section-tab="app"]').click();
      const quickEntry = page.locator('[data-quick-task-install-cta="true"]');
      await quickEntry.waitFor({ state: 'visible', timeout: 10000 });
      const entryText = await quickEntry.innerText();
      const hrefs = await quickEntry.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      const metrics = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientWidth: document.documentElement.clientWidth,
        visibleAlerts: Array.from(document.querySelectorAll('[role="alert"], .inline-error')).filter(element => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }).map(element => element.textContent?.trim()),
      }));
      const evidence = {
        viewport,
        entryCount: await quickEntry.count(),
        entryText,
        hrefs,
        metrics,
      };
      settingsEvidence.push(evidence);
      const screenshot = `${outputDir}/root-quick-entry-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      result.screenshots.push(screenshot);
    }
    record('B24', settingsEvidence.every(evidence => evidence.entryCount === 1
      && evidence.entryText.includes('快速建待辦')
      && evidence.entryText.includes('安裝 ProJED 後，支援的平台可從 ProJED 圖示選「快速建待辦」；需要桌面單鍵入口，也可安裝獨立圖示。')
      && evidence.entryText.includes('開啟快速建待辦')
      && evidence.hrefs.length === 1
      && evidence.hrefs[0] === '/quick-task/?install=1'
      && !/自動.{0,8}兩.{0,8}圖示|立即.{0,8}捷徑|iOS.{0,8}長按/u.test(evidence.entryText)
      && evidence.metrics.bodyScrollWidth <= evidence.metrics.bodyClientWidth + 1
      && evidence.metrics.rootScrollWidth <= evidence.metrics.rootClientWidth + 1
      && evidence.metrics.visibleAlerts.length === 0)
      && result.browserErrors.length === 0
      && result.httpFailures.length === 0, { settingsEvidence, browserErrors: result.browserErrors, httpFailures: result.httpFailures });
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
  }
  result.failures = failures;
  await page.evaluate(({ result, outputDir }) => { window.__DEV122ROOT_ARTIFACT = result; window.__DEV122ROOT_ARTIFACT_PATH = outputDir; }, { result, outputDir });
  if (failures.length) throw new Error(`DEV-122 root browser verification failed: ${failures.join(', ')} | ${JSON.stringify(result.cases)}${result.browserErrors.length ? ` | ${result.browserErrors.join(' | ')}` : ''}`);
}
