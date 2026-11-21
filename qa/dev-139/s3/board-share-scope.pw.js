/* eslint-disable */
// Normal App -> More -> Share Board -> Sidebar, with intercepted HTTP only.
async (page) => {
  const entry = new URL(page.url());
  if (entry.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(entry.hostname) || !entry.port) throw new Error('ISOLATED_BOARD_SHARE_ORIGIN_REQUIRED');
  const origin = entry.origin;
  const checks = [];
  const writes = [];
  const invites = { a: [], b: [] };
  let holdB = true;
  let releaseB;
  let firstWithdrawal = true;
  let failList = false;
  const blocked = [];
  const capabilities = ['read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
    'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
    'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit'];
  const permissions = { owner: capabilities, admin: capabilities, project_manager: ['read_board'], member: ['read_board'], viewer: ['read_board'] };
  let stage = 'load-normal-product';
  const record = (id, ok) => { checks.push({ id, ok }); };
  const artifact = status => ({ status, evidenceLevel: 'LOCAL_SYNTHETIC_HTTP_NORMAL_APP_UI', stage, checks,
    loopbackPort: Number(entry.port), notificationTransport: 'SIMULATED_NOT_SENT', identity: 'SYNTHETIC_HTTP_SESSION',
    tokenMaterial: 'OMITTED', unexpectedRequests: blocked.length, externalProviderCalled: false });
  try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('projed-last-ws', 'ws');
    localStorage.setItem('projed-last-board', 'a');
    localStorage.setItem('projed-last-view', 'board');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__BOARD_SHARE_COPIED = value; } } });
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (url.hostname === 'fonts.googleapis.com') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
      if (url.hostname === 'accounts.google.com' || url.hostname === 'apis.google.com') { await route.fulfill({ contentType: 'text/javascript', body: '' }); return; }
      if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/TaiwanCalendar/')) { await route.fulfill({ json: [] }); return; }
      blocked.push(url.origin); await route.abort(); return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname;
    const method = route.request().method();
    const json = data => route.fulfill({ status: 200, json: { data } });
    const boardId = /\/boards\/([^/]+)/.exec(path)?.[1];
    if (path === '/api/v1/session') { await json({ localUserId: 'owner', email: 'owner@example.invalid', displayName: 'Owner', createdAt: 1, expiresAt: Date.now() + 3600000, authContextId: 'owner-context', entry: 'main' }); return; }
    if (path === '/api/v1/workspaces') { await json([{ id: 'ws', title: 'Fixture workspace', ownerId: 'owner', sessionCapabilities: ['read_workspace'], boards: ['a', 'b'].map(id => ({ id, title: `Fixture Board ${id.toUpperCase()}`, dependencies: [], sessionCapabilities: ['read_board','manage_board_members'] })) }]); return; }
    if (path.endsWith('/access')) { await json({ workspaceId: 'ws', boardId, workspaceRole: 'owner', boardRole: 'owner', capabilities: ['read_board','manage_board_members'], canConfigureRolePermissions: true, canInviteExternal: true }); return; }
    if (path.endsWith('/role-permissions')) { await json(permissions); return; }
    if (path.endsWith('/members')) { await json([{ workspaceId: 'ws', boardId, userId: 'owner', role: 'owner', profile: { id: 'owner', email: 'owner@example.invalid', displayName: 'Owner' } }]); return; }
    if (path.endsWith('/invites') && method === 'POST') {
      const input = route.request().postDataJSON();
      writes.push({ path, input });
      const invite = { id: boardId === 'a' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
        workspaceId: 'ws', boardId, email: input.email, status: 'pending', defaultRole: input.defaultRole,
        expiresAt: input.expiresAt, createdAt: Date.now(), updatedAt: Date.now() };
      invites[boardId] = [invite];
      await route.fulfill({ status: 201, json: { data: invite, externalNotificationPending: true } }); return;
    }
    if (path.includes('/invites/') && method === 'DELETE') {
      writes.push({ path, method });
      if (firstWithdrawal) { firstWithdrawal = false; invites[boardId] = []; await route.fulfill({ json: { data: null, externalNotificationPending: true } }); return; }
      await json(null); return;
    }
    if (path.endsWith('/invites')) {
      if (boardId === 'b' && holdB) {
        holdB = false;
        const earlierRows = [...invites[boardId]];
        await new Promise(resolve => { releaseB = resolve; });
        await json(earlierRows); return;
      }
      if (failList) { await route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE' } } }); return; }
      await json(invites[boardId]); return;
    }
    if (path === '/api/v1/preferences/layout') { await json({}); return; }
    if (path.includes('/preferences/task-filters/')) { await json(null); return; }
    if (path === '/api/v1/task-tracking/capability') { await json({ supported: false, reason: 'schema_not_ready' }); return; }
    if (path === '/api/v1/scope-revisions' || path.endsWith('/tasks') || path.endsWith('/dependencies') || path.endsWith('/records') || path.endsWith('/tags') || path === '/api/v1/task-workbench/unplaced') { await json([]); return; }
    blocked.push(path); await route.abort();
  });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await page.locator('nav').waitFor();
  const openShare = async () => {
    await page.locator('[data-app-more-menu] summary').click();
    await page.locator('[data-board-share-open]').click();
    await page.locator('[data-board-share-dialog]').waitFor();
  };
  const dialog = page.locator('[data-board-share-dialog]');
  stage = 'create-external-invitation';
  await openShare();
  await dialog.getByRole('checkbox', { name: '邀請外部協作者（需 OrgMaster 核准）' }).check();
  await dialog.getByRole('textbox', { name: '電子郵件地址或名稱' }).fill('recipient-a@example.invalid');
  await dialog.getByRole('combobox', { name: '邀請角色' }).selectOption('viewer');
  await dialog.locator('[data-board-share-submit]').click();
  await dialog.getByText('recipient-a@example.invalid', { exact: true }).waitFor();
  record('normal-owner-external-create-wire', writes[0]?.path === '/api/v1/workspaces/ws/boards/a/invites'
    && writes[0]?.input.external === true && writes[0]?.input.defaultRole === 'viewer' && /^[a-f0-9]{64}$/.test(writes[0]?.input.tokenHash));
  record('durable-create-does-not-claim-notification-delivery', await page.getByText('邀請已建立。審核通知尚未送達，受邀者開啟連結時會再次送出。', { exact: true }).isVisible());
  await dialog.getByRole('button', { name: '複製連結', exact: true }).click();
  record('copied-secret-matches-submitted-hash', await page.evaluate(async hash => {
    const token = new URL(window.__BOARD_SHARE_COPIED).searchParams.get('boardInviteToken');
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, '0')).join('');
    return actual === hash;
  }, writes[0].input.tokenHash));
  await dialog.getByRole('button', { name: '關閉分享看板' }).click();
  await openShare();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-board-share-dialog] button')).some(button => button.textContent.trim() === '複製連結' && !button.disabled));
  record('same-scope-created-link-stays-usable', await dialog.getByRole('button', { name: '複製連結', exact: true }).isEnabled());
  stage = 'switch-board-with-old-invitation';
  await dialog.getByRole('button', { name: '關閉分享看板' }).click();
  await page.locator('[data-main-sidebar-toggle="true"]').click();
  await page.locator('[data-sidebar-board-row]').filter({ hasText: 'Fixture Board B' }).click();
  const closeSidebar = page.getByRole('button', { name: '關閉工作區與看板' });
  if (await closeSidebar.isVisible()) await closeSidebar.click();
  await openShare();
  await dialog.getByText('Fixture Board B', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-board-share-invite-email]')?.disabled);
  record('new-board-never-shows-old-invitation', await dialog.getByText('recipient-a@example.invalid', { exact: true }).count() === 0);
  record('new-board-cannot-copy-old-link', await dialog.getByRole('button', { name: '複製連結', exact: true }).isDisabled());
  await dialog.getByRole('checkbox', { name: '邀請外部協作者（需 OrgMaster 核准）' }).check();
  await dialog.getByRole('textbox', { name: '電子郵件地址或名稱' }).fill('recipient-b@example.invalid');
  await dialog.locator('[data-board-share-submit]').click();
  await dialog.getByText('recipient-b@example.invalid', { exact: true }).waitFor();
  const oldList = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/workspaces/ws/boards/b/invites' && response.request().method() === 'GET');
  releaseB();
  await oldList;
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  record('old-empty-list-cannot-erase-new-created-invitation', await dialog.getByText('recipient-b@example.invalid', { exact: true }).count() === 1);
  stage = 'withdraw-and-retry-original-invitation';
  await dialog.getByRole('button', { name: '撤回', exact: true }).click();
  await page.getByText('連結已失效，OrgMaster 尚未收到撤回通知。可再次按撤回重送。', { exact: true }).waitFor();
  record('withdraw-pending-removes-copyable-link', await dialog.getByRole('button', { name: '複製連結', exact: true }).isDisabled());
  await dialog.getByRole('button', { name: '撤回', exact: true }).click();
  await dialog.getByText('目前沒有待處理的加入要求。', { exact: true }).waitFor();
  record('withdraw-retry-uses-original-invitation', writes.filter(write => write.method === 'DELETE').length === 2
    && writes.filter(write => write.method === 'DELETE').every(write => write.path.endsWith('/22222222-2222-4222-8222-222222222222')));
  await dialog.getByRole('button', { name: '關閉分享看板' }).click();
  stage = 'failed-list-and-recovery';
  failList = true;
  await openShare();
  await dialog.getByText('無法讀取邀請清單，請重試。', { exact: true }).waitFor();
  record('failed-list-is-not-presented-as-no-pending-requests', await dialog.getByText('目前沒有待處理的加入要求。', { exact: true }).count() === 0);
  record('failed-list-does-not-claim-zero-count', (await dialog.getByRole('button', { name: /加入要求/ }).innerText()).includes('—'));
  await page.setViewportSize({ width: 390, height: 844 });
  record('mobile-share-stays-within-viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'output/playwright/dev-139-board-share-scope/unavailable-mobile.png', fullPage: false });
  failList = false;
  await dialog.getByRole('button', { name: '重試', exact: true }).click();
  await dialog.getByText('目前沒有待處理的加入要求。', { exact: true }).waitFor();
  record('same-scope-list-recovery', await dialog.getByText('無法讀取邀請清單，請重試。', { exact: true }).count() === 0);
  record('no-external-network-or-unhandled-api', blocked.length === 0);
  const failed = checks.filter(check => !check.ok).map(check => check.id);
  if (failed.length) throw new Error(`BOARD_SHARE_SCOPE_REGRESSION ${failed.join(', ')}`);
  stage = 'complete';
  const result = artifact('PASS');
  await page.evaluate(value => { window.__DEV139_BOARD_SHARE_SCOPE = value; }, result);
  return result;
  } catch (error) {
    await page.evaluate(value => { window.__DEV139_BOARD_SHARE_SCOPE = value; }, artifact('FAIL')).catch(() => undefined);
    const failedChecks = checks.filter(check => !check.ok).map(check => check.id);
    const destinations = [...new Set(blocked.map(value => value.startsWith('/') ? value.split('/').slice(0, 4).join('/') : new URL(value).hostname))];
    throw new Error(`BOARD_SHARE_SCOPE_UI_FAILED ${stage} ${error?.name ?? 'Error'} checks=${failedChecks} destinations=${destinations}`);
  } finally {
    await page.evaluate(() => { delete window.__BOARD_SHARE_COPIED; }).catch(() => undefined);
  }
}
