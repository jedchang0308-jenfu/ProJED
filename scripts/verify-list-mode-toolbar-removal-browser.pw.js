/* eslint-disable */
async (page) => {
  const result = {
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    route: '/',
    viewport: { width: 1440, height: 900 },
    fixture: { workspaceId: 'list-toolbar-workspace', boardId: 'list-toolbar-board' },
    cases: [],
    browserErrors: [],
    httpFailures: [],
    cleanup: { runtime: 'matching pre-existing localhost:4000', action: 'reused; not stopped' },
  };
  const failures = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };

  page.on('console', message => {
    if (message.type() === 'error') result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) result.httpFailures.push({ status: response.status(), url: response.url() });
  });

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'list-toolbar-workspace',
    title: '清單工具列移除驗證',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'list-toolbar-board',
      title: '清單模式驗證看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const nodes = {
    'list-toolbar-root': {
      id: 'list-toolbar-root',
      workspaceId: workspace.id,
      boardId: workspace.boards[0].id,
      parentId: null,
      title: '保留清單內容',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'list-toolbar-child': {
      id: 'list-toolbar-child',
      workspaceId: workspace.id,
      boardId: workspace.boards[0].id,
      parentId: 'list-toolbar-root',
      title: '子任務仍可閱讀',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  try {
    await page.setViewportSize(result.viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', workspace.boards[0].id);
      localStorage.setItem('projed-last-view', 'list');
    }, { account, workspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
    const fixedEnvironmentButton = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixedEnvironmentButton.count()) {
      await fixedEnvironmentButton.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    }

    const listSurface = page.locator('[data-task-hierarchy-surface="list"]').first();
    await listSurface.waitFor({ state: 'visible', timeout: 15000 });
    const toolbar = page.locator('.app-compact-toolbar');
    const addRootButton = page.getByRole('button', { name: '新增頂層任務', exact: true });
    const rootTask = page.getByText('保留清單內容', { exact: true });
    await rootTask.waitFor({ state: 'visible', timeout: 15000 });

    record('L01-list-content-remains', await rootTask.count() === 1, {
      rootTaskCount: await rootTask.count(),
    });
    record('L02-add-root-button-removed', await addRootButton.count() === 0, {
      addRootButtonCount: await addRootButton.count(),
    });
    record('L03-empty-compact-toolbar-removed', await toolbar.count() === 0, {
      toolbarCount: await toolbar.count(),
    });

    const geometry = await page.evaluate(() => {
      const surface = document.querySelector('[data-task-hierarchy-surface="list"]');
      const topbar = document.querySelector('[data-layout-region="topbar"]');
      if (!surface || !topbar) return null;
      const surfaceRect = surface.getBoundingClientRect();
      const topbarRect = topbar.getBoundingClientRect();
      return {
        surfaceTop: Math.round(surfaceRect.top),
        topbarBottom: Math.round(topbarRect.bottom),
        gap: Math.round(surfaceRect.top - topbarRect.bottom),
      };
    });
    record('L04-no-toolbar-gap', Boolean(geometry) && geometry.gap < 48, { geometry });
    await page.screenshot({ path: 'output/playwright/list-mode-toolbar-removal/list-mode-1440x900.png', fullPage: false });

    await page.setViewportSize({ width: 814, height: 698 });
    await page.waitForTimeout(100);
    record('L05-narrow-toolbar-and-content', await listSurface.isVisible()
      && await toolbar.count() === 0
      && await addRootButton.count() === 0, {
      listVisible: await listSurface.isVisible(),
      toolbarCount: await toolbar.count(),
      addRootButtonCount: await addRootButton.count(),
    });
    await page.screenshot({ path: 'output/playwright/list-mode-toolbar-removal/list-mode-814x698.png', fullPage: false });

    const visibleErrors = await page.locator('.inline-error:visible, [role="alert"]:visible').allTextContents();
    record('L06-no-visible-errors', visibleErrors.length === 0, { visibleErrors });
    record('L07-no-browser-errors', result.browserErrors.length === 0, { browserErrors: result.browserErrors });
    record('L08-no-unexpected-http-failures', result.httpFailures.length === 0, { httpFailures: result.httpFailures });
  } catch (error) {
    record('L99-runtime', false, { error: String(error) });
  }

  result.status = failures.length === 0 ? 'PASS' : 'FAIL';
  result.failures = failures;
  result.generatedAt = new Date().toISOString();
  await page.evaluate(resultValue => {
    window.__LIST_MODE_TOOLBAR_REMOVAL_ARTIFACT = resultValue;
    sessionStorage.setItem('__LIST_MODE_TOOLBAR_REMOVAL_ARTIFACT', JSON.stringify(resultValue));
  }, result);
  console.log(`LIST_MODE_TOOLBAR_REMOVAL_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length > 0) throw new Error(`List mode toolbar verification failed: ${failures.join(', ')}`);
  return result;
}
