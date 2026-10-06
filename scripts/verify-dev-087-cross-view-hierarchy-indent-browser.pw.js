/* eslint-disable */
async (page) => {
  const diagnostics = [];
  const results = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev087-workspace',
    title: 'DEV-087 階層縮排驗證',
    ownerId: account.id,
    members: [account.id],
    order: 0,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev087-board', title: '跨模式共用縮排', dependencies: [], order: 0, createdAt: 1704067200000 },
    ],
  };
  const makeNode = (id, parentId, title, nodeType, order) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'dev087-board',
    parentId,
    title,
    status: 'todo',
    nodeType,
    order,
    startDate: '2026-08-25',
    endDate: '2026-08-28',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  });
  const nodes = {
    'dev087-l1': makeNode('dev087-l1', null, '產品規劃', 'group', 0),
    'dev087-l2': makeNode('dev087-l2', 'dev087-l1', '跨模式階層父任務', 'task', 0),
    'dev087-l3': makeNode('dev087-l3', 'dev087-l2', '精簡層級子任務', 'task', 0),
    'dev087-l4': makeNode('dev087-l4', 'dev087-l3', '五像素孫任務', 'task', 0),
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev087-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });

  const switchMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const selectors = {
    board: '.kanban-checklist-item[data-task-hierarchy-depth]',
    list: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="list"]',
    gantt: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="gantt"]',
    calendar: '[data-task-hierarchy-row="true"][data-task-hierarchy-surface="calendar"]',
  };

  const readHierarchy = async (mode) => page.locator(selectors[mode]).evaluateAll((rows, modeName) => {
    const titleFor = row => modeName === 'board'
      ? row.querySelector('[data-task-title-slot="true"]')
      : row.querySelector('.task-title-text span');
    const values = rows.map(row => {
      const depth = Number(row.getAttribute('data-task-hierarchy-depth'));
      const title = titleFor(row);
      return {
        id: row.getAttribute('data-task-id'),
        depth,
        paddingLeft: Number.parseFloat(getComputedStyle(row).paddingLeft || '0'),
        titleLeft: title?.getBoundingClientRect().left ?? null,
        rowHeight: row.getBoundingClientRect().height,
        token: getComputedStyle(row).getPropertyValue('--task-hierarchy-indent').trim(),
      };
    }).sort((left, right) => left.depth - right.depth);
    const [firstId, secondId] = modeName === 'board'
      ? ['dev087-l3', 'dev087-l4']
      : ['dev087-l1', 'dev087-l2'];
    const first = values.find(value => value.id === firstId);
    const second = values.find(value => value.id === secondId);
    const orderedIds = modeName === 'board'
      ? ['dev087-l3', 'dev087-l4']
      : ['dev087-l1', 'dev087-l2', 'dev087-l3', 'dev087-l4'];
    const orderedRows = orderedIds.map(id => values.find(value => value.id === id)).filter(Boolean);
    const adjacentDeltas = orderedRows.slice(1).map((row, index) => ({
      from: orderedRows[index].id,
      to: row.id,
      padding: row.paddingLeft - orderedRows[index].paddingLeft,
      title: row.titleLeft - orderedRows[index].titleLeft,
    }));
    return {
      rows: values,
      pair: first && second ? [first, second] : [],
      adjacentDeltas,
      paddingDelta: first && second ? second.paddingLeft - first.paddingLeft : null,
      titleDelta: first && second && first.titleLeft !== null && second.titleLeft !== null ? second.titleLeft - first.titleLeft : null,
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, mode);

  const verifyMode = async (mode, viewport, expectedIndent) => {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(160);
    const selector = page.locator(selectors[mode]);
    await selector.first().waitFor({ state: 'visible', timeout: 10000 });
    const geometry = await readHierarchy(mode);
    const tolerance = 0.75;
    assert(geometry.pair.length === 2 && geometry.pair[1].depth - geometry.pair[0].depth === 1, `${mode} must render the fixed adjacent parent-child pair`, geometry);
    assert(geometry.rows.every(row => row.token === `${expectedIndent}px`), `${mode} must inherit the shared ${expectedIndent}px token`, geometry);
    assert(Math.abs(geometry.paddingDelta - expectedIndent) <= tolerance, `${mode} computed padding must advance by ${expectedIndent}px`, geometry);
    assert(Math.abs(geometry.titleDelta - expectedIndent) <= tolerance, `${mode} title position must advance by ${expectedIndent}px`, geometry);
    assert(geometry.adjacentDeltas.length > 0 && geometry.adjacentDeltas.every(delta => Math.abs(delta.padding - expectedIndent) <= tolerance && Math.abs(delta.title - expectedIndent) <= tolerance), `${mode} every visible adjacent level must advance by ${expectedIndent}px`, geometry);
    assert(geometry.bodyOverflow <= 1, `${mode} must not add document-level horizontal overflow`, geometry);
    const viewportName = viewport.width <= 767 ? 'narrow' : 'desktop';
    const screenshotPath = `output/playwright/dev-087/${mode}-${viewportName}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({ mode, viewport: `${viewport.width}x${viewport.height}`, expectedIndent, geometry, screenshotPath, result: 'PASS' });
  };

  for (const mode of ['board', 'list', 'gantt', 'calendar']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await switchMode(mode);
    await verifyMode(mode, { width: 1440, height: 900 }, 6);
    await verifyMode(mode, { width: 760, height: 900 }, 5);
  }

  assert(diagnostics.length === 0, 'cross-view hierarchy verification must not raise page or console errors', { diagnostics });
  const artifact = {
    verifier: 'DEV-087 cross-view hierarchy indent browser',
    result: 'PASS',
    tokens: { desktop: 6, narrow: 5, breakpoint: 767 },
    results,
    diagnostics,
  };
  await page.evaluate(value => { window.__DEV087_ARTIFACT = value; }, artifact);
}
