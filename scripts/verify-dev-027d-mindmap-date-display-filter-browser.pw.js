/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const defaultFilters = {
    statusFilters: {
      todo: true,
      in_progress: true,
      delayed: true,
      completed: true,
      unsure: true,
      onhold: true,
    },
    showDependencies: true,
    showStartDate: true,
    showTags: true,
    dueWithinDays: null,
    selectedAssigneeIds: [],
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const enterMindMap = async () => {
    if ((await page.locator('[data-mindmap-view]').count()) === 0) {
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const setFilters = async (overrides = {}) => {
    await page.evaluate(({ defaultFilters, overrides }) => {
      const legacyFilters = {
        ...defaultFilters,
        ...overrides,
        statusFilters: {
          ...defaultFilters.statusFilters,
          ...(overrides.statusFilters || {}),
        },
      };
      localStorage.setItem('projed-filters', JSON.stringify(legacyFilters));
      localStorage.setItem('projed-task-filters:v1', JSON.stringify({
        version: 1,
        filters: {
          statusFilters: legacyFilters.statusFilters,
          dueWithinDays: legacyFilters.dueWithinDays,
          selectedAssigneeIds: legacyFilters.selectedAssigneeIds,
          selectedTagIds: [],
          keyword: '',
        },
        displaySettings: {
          showDependencies: legacyFilters.showDependencies,
          showStartDate: legacyFilters.showStartDate,
          showTags: legacyFilters.showTags,
        },
        updatedAt: Date.now(),
      }));
    }, { defaultFilters, overrides });
    await page.reload({ waitUntil: 'networkidle' });
    await enterMindMap();
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const dateBadgeByTitle = (title) => nodeByTitle(title).locator('[data-mindmap-node-dates]').first();

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ].find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show visible runtime errors`, { visibleError });
  };

  await openApp();
  await page.evaluate((defaultFilters) => {
    window.__PROJED_QC__?.reset(18);
    localStorage.setItem('projed-filters', JSON.stringify(defaultFilters));
    localStorage.setItem('projed-task-filters:v1', JSON.stringify({
      version: 1,
      filters: {
        statusFilters: defaultFilters.statusFilters,
        dueWithinDays: defaultFilters.dueWithinDays,
        selectedAssigneeIds: defaultFilters.selectedAssigneeIds,
        selectedTagIds: [],
        keyword: '',
      },
      displaySettings: {
        showDependencies: defaultFilters.showDependencies,
        showStartDate: defaultFilters.showStartDate,
        showTags: defaultFilters.showTags,
      },
      updatedAt: Date.now(),
    }));
  }, defaultFilters);

  const titles = await page.evaluate(() => {
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const roots = Object.values(nodes)
      .filter(node => node && !node.parentId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (roots.length < 3) throw new Error(`Expected at least 3 root nodes, got ${roots.length}`);
    const stamp = Date.now().toString(36);
    const nearTitle = `DEV027D near ${stamp}`;
    const futureTitle = `DEV027D future ${stamp}`;
    const completedTitle = `DEV027D completed ${stamp}`;

    Object.assign(roots[0], {
      title: nearTitle,
      status: 'todo',
      startDate: '2026-06-20',
      endDate: '2026-06-22',
      assigneeId: 'local-test-user',
      tagIds: [],
      updatedAt: Date.now(),
    });
    Object.assign(roots[1], {
      title: futureTitle,
      status: 'todo',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      assigneeId: 'local-test-user',
      tagIds: [],
      updatedAt: Date.now(),
    });
    Object.assign(roots[2], {
      title: completedTitle,
      status: 'completed',
      startDate: '2026-06-19',
      endDate: '2026-06-21',
      assigneeId: 'local-test-pm',
      tagIds: [],
      updatedAt: Date.now(),
    });
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    return { nearTitle, futureTitle, completedTitle };
  });

  await page.reload({ waitUntil: 'networkidle' });
  await enterMindMap();
  await assertNoVisibleErrors('DEV-027D initial');

  await nodeByTitle(titles.nearTitle).waitFor({ state: 'visible', timeout: 15000 });
  await dateBadgeByTitle(titles.nearTitle).waitFor({ state: 'visible', timeout: 10000 });
  const nearBadge = await dateBadgeByTitle(titles.nearTitle).evaluate(element => ({
    text: element.textContent || '',
    start: element.getAttribute('data-start-date'),
    end: element.getAttribute('data-end-date'),
  }));
  assert(nearBadge.start === '2026-06-20' && nearBadge.end === '2026-06-22', 'date badge should expose start and end date metadata', { nearBadge });
  assert(nearBadge.text.includes('06/20') && nearBadge.text.includes('06/22'), 'date badge should render compact current-year dates', { nearBadge });

  const containment = await nodeByTitle(titles.nearTitle).evaluate((node) => {
    const badge = node.querySelector('[data-mindmap-node-dates]');
    const nodeRect = node.getBoundingClientRect();
    const badgeRect = badge?.getBoundingClientRect();
    if (!badgeRect) return { ok: false, reason: 'missing badge' };
    return {
      ok: badgeRect.left >= nodeRect.left - 2 &&
        badgeRect.right <= nodeRect.right + 2 &&
        badgeRect.top >= nodeRect.top - 2 &&
        badgeRect.bottom <= nodeRect.bottom + 2,
      nodeRect: { left: nodeRect.left, right: nodeRect.right, top: nodeRect.top, bottom: nodeRect.bottom },
      badgeRect: { left: badgeRect.left, right: badgeRect.right, top: badgeRect.top, bottom: badgeRect.bottom },
    };
  });
  assert(containment.ok, 'date badge should stay inside the branch node bounds', containment);

  await setFilters({ showStartDate: false });
  await nodeByTitle(titles.nearTitle).waitFor({ state: 'visible', timeout: 15000 });
  const endOnlyBadge = await dateBadgeByTitle(titles.nearTitle).evaluate(element => ({
    text: element.textContent || '',
    start: element.getAttribute('data-start-date'),
    end: element.getAttribute('data-end-date'),
  }));
  assert(endOnlyBadge.start === '' && endOnlyBadge.end === '2026-06-22', 'showStartDate=false should hide the start date', { endOnlyBadge });
  assert(!endOnlyBadge.text.includes('06/20') && endOnlyBadge.text.includes('06/22'), 'showStartDate=false should render only end date text', { endOnlyBadge });

  await setFilters({ showStartDate: true, dueWithinDays: 7 });
  await nodeByTitle(titles.nearTitle).waitFor({ state: 'visible', timeout: 15000 });
  await nodeByTitle(titles.futureTitle).waitFor({ state: 'hidden', timeout: 10000 });
  assert(await nodeByTitle(titles.nearTitle).count() > 0, 'dueWithinDays=7 should keep near due node visible');
  assert(await nodeByTitle(titles.futureTitle).count() === 0, 'dueWithinDays=7 should hide far future node');

  await setFilters({
    dueWithinDays: null,
    statusFilters: { todo: false, completed: true, in_progress: false, delayed: false, unsure: false, onhold: false },
  });
  await nodeByTitle(titles.nearTitle).waitFor({ state: 'hidden', timeout: 10000 });
  await nodeByTitle(titles.completedTitle).waitFor({ state: 'visible', timeout: 15000 });
  assert(await nodeByTitle(titles.nearTitle).count() === 0, 'status filter should hide todo and keep completed');
  assert(await nodeByTitle(titles.completedTitle).count() > 0, 'status filter should keep completed root visible');

  await setFilters({
    dueWithinDays: null,
    statusFilters: { todo: true, completed: true, in_progress: true, delayed: true, unsure: true, onhold: true },
    selectedAssigneeIds: ['local-test-user'],
  });
  await nodeByTitle(titles.nearTitle).waitFor({ state: 'visible', timeout: 15000 });
  await nodeByTitle(titles.completedTitle).waitFor({ state: 'hidden', timeout: 10000 });
  assert(await nodeByTitle(titles.completedTitle).count() === 0, 'assignee filter should hide nodes assigned to other people');

  await page.screenshot({ path: 'output/playwright/dev-027D-mindmap-date-filter.png', fullPage: true });
  await assertNoVisibleErrors('DEV-027D final');
}
