/* eslint-disable */
async (page) => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:47978') throw new Error('ISOLATED_FILTER_FIXTURE_REQUIRED');
  const checks = [];
  const forbidden = [];
  const unexpected = [];
  let late = false;
  let releaseLate = null;
  let lateSeen = false;
  let sessionActor = 'guest';
  let failTags = false;
  const setActor = async actor => { sessionActor = actor; await page.evaluate(actor => window.__DEV139_FILTER_FIXTURE.setActor(actor), actor); };
  const check = (id, ok) => { checks.push({ id, ok }); if (!ok) throw new Error(id); };
  const ref = id => ({ id: `stored-${id}`, appBoardId: id, name: id, workspaceId: id === 'c' ? 'stored-other-ws' : 'stored-ws', appWorkspaceId: id === 'c' ? 'other-ws' : 'ws', workspaceName: 'Visible workspace', path: `Visible / ${id}` });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:47978') { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const actor = route.request().headers()['x-projed-expected-account-id'] ?? 'initial';
    const json = data => route.fulfill({ status: 200, json: { data } });
    if (url.pathname === '/api/v1/session') { await json({ localUserId: sessionActor, email: null, displayName: sessionActor, createdAt: 1, expiresAt: Date.now() + 3600000, authContextId: `context-${sessionActor}`, entry: 'main' }); return; }
    if (/\/workspaces\/[^/]+\/members$/.test(url.pathname)) { forbidden.push(url.pathname); await route.fulfill({ status: 403, json: { error: { code: 'ACCESS_DENIED' } } }); return; }
    if (/\/boards\/[^/]+\/members$/.test(url.pathname)) {
      if (late && actor === 'late' && !releaseLate) { lateSeen = true; await new Promise(resolve => { releaseLate = resolve; }); }
      const boardId = url.pathname.split('/').at(-2);
      const workspaceId = boardId === 'c' ? 'other-ws' : 'ws';
      await json([{ workspaceId, boardId, userId: `${actor}-${boardId}`, role: 'member', profile: { id: `${actor}-${boardId}`, displayName: `${actor}-person-${boardId}`, email: null } }]); return;
    }
    if (url.pathname.endsWith('/tags')) {
      if (failTags) { await route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE' } } }); return; }
      const ws = url.pathname.split('/').at(-2); await json([{ id: `tag-${ws}`, workspaceId: ws, name: `${actor}-tag-${ws}`, color: 'blue', order: 0 }]); return;
    }
    if (url.pathname.endsWith('/references')) { await json({ workspaces: [{ id: 'stored-ws', appWorkspaceId: 'ws', name: 'Visible workspace' }, { id: 'stored-other-ws', appWorkspaceId: 'other-ws', name: 'Other workspace' }], boards: ['a', 'b', 'c'].map(ref) }); return; }
    if (url.pathname === '/api/v1/calendar-subscriptions' || url.pathname.endsWith('/tasks') || url.pathname.endsWith('/dependencies') || url.pathname === '/api/v1/quick-tasks' || url.pathname === '/api/v1/task-workbench/unplaced') { await json([]); return; }
    if (url.pathname === '/api/v1/preferences/layout') { await json({}); return; }
    if (url.pathname.includes('/preferences/task-filters/')) { await json(null); return; }
    if (url.pathname.endsWith('/access')) { await json({ workspaceId: 'ws', boardId: 'a', capabilities: ['read_board'], canConfigureRolePermissions: false, canInviteExternal: false }); return; }
    unexpected.push(url.pathname); await route.abort();
  });
  await page.goto('http://127.0.0.1:47978/qa/dev-139/s3/filter-options.fixture.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__DEV139_FILTER_FIXTURE));
  await setActor('guest');
  await page.evaluate(() => window.__DEV139_FILTER_FIXTURE.mount('workbench'));
  await page.locator('[data-task-workbench-filter-toggle]').click();
  const workbench = page.locator('[data-task-workbench-filter-panel]');
  await workbench.getByText('guest-person-a', { exact: true }).waitFor();
  check('guest-workbench-members-and-tags', await workbench.getByText('guest-tag-ws', { exact: true }).isVisible());
  check('selected-board-only-members', await workbench.getByText('guest-person-b', { exact: true }).count() === 0);
  late = true;
  await setActor('late');
  for (let count = 0; count < 30 && !lateSeen; count += 1) await page.waitForTimeout(50);
  check('old-actor-response-held', lateSeen);
  await setActor('member');
  if (await page.locator('[data-task-workbench-filter-toggle]').getAttribute('aria-expanded') !== 'true') await page.locator('[data-task-workbench-filter-toggle]').click();
  await workbench.getByText('member-person-a', { exact: true }).waitFor();
  releaseLate();
  await page.waitForTimeout(150);
  check('old-actor-response-discarded', await workbench.getByText('late-person-a', { exact: true }).count() === 0 && await workbench.getByText('member-tag-ws', { exact: true }).isVisible());
  await page.evaluate(() => window.__DEV139_FILTER_FIXTURE.mount('calendar'));
  await page.locator('[data-calendar-subscription-create-new]').click();
  await page.locator('[data-calendar-subscription-filter-toggle]').click();
  const calendar = page.locator('[data-calendar-subscription-filter-panel]');
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('a');
  await calendar.getByText('member-person-a', { exact: true }).waitFor();
  check('calendar-board-directory-and-tags', await calendar.getByText('member-tag-ws', { exact: true }).isVisible());
  check('calendar-sibling-board-isolation', await calendar.getByText('member-person-b', { exact: true }).count() === 0);
  check('non-admin-does-not-gain-others-subscription', await calendar.getByRole('button', { name: 'member-person-a', exact: true }).isDisabled());
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('c');
  await calendar.getByText('member-tag-other-ws', { exact: true }).waitFor();
  check('calendar-selected-workspace-tags', await calendar.getByText('member-tag-ws', { exact: true }).count() === 0 && await calendar.getByText('UNRELATED_GLOBAL_TAG', { exact: true }).count() === 0);
  check('calendar-other-workspace-directory', await calendar.getByText('member-person-c', { exact: true }).isVisible() && await calendar.getByText('member-person-a', { exact: true }).count() === 0);
  await page.evaluate(() => window.__DEV139_FILTER_FIXTURE.grantBoardManagement());
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('a');
  check('specific-board-manager-can-select-others', await calendar.getByRole('button', { name: 'member-person-a', exact: true }).isEnabled());
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('b');
  check('board-management-does-not-expand-to-sibling', await calendar.getByRole('button', { name: 'member-person-b', exact: true }).isDisabled());
  await setActor('fresh');
  await page.locator('[data-calendar-subscription-create-new]').click();
  await page.locator('[data-calendar-subscription-filter-toggle]').click();
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('a');
  await calendar.getByText('fresh-person-a', { exact: true }).waitFor();
  check('calendar-account-change-clears-old-directory', await calendar.getByText('member-person-a', { exact: true }).count() === 0);
  failTags = true;
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('c');
  await calendar.getByText('標籤選項載入失敗；已保留目前選擇。', { exact: true }).waitFor();
  check('failed-tags-are-not-an-empty-directory', await calendar.getByText('尚無標籤', { exact: true }).count() === 0);
  failTags = false;
  await calendar.locator('[data-calendar-subscription-board-select]').selectOption('a');
  await calendar.getByText('fresh-tag-ws', { exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/dev-139-filter-options/calendar.png', fullPage: true });
  check('no-workspace-management-request', forbidden.length === 0);
  check('no-unexpected-network', unexpected.length === 0);
  return { status: 'PASS', evidenceLevel: 'LOCAL_SYNTHETIC_HTTP_BROWSER', checks };
}
