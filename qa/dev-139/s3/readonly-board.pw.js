/* eslint-disable */
// Actual normal App/DOM; HTTP Session and reads are synthetic loopback fixtures.
// This supplements the real HTTP/PG collaborator case in http-ui-smoke.pw.js.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(origin)) throw new Error('ISOLATED_LOOPBACK_REQUIRED');
  const writes = [];
  const unexpected = [];
  const ancestors = {};
  const checks = [];
  const tasks = [
    { id: 'readonly-parent', parentId: null, nodeType: 'group', title: 'Readonly column' },
    { id: 'readonly-child', parentId: 'readonly-parent', nodeType: 'group', title: 'Readonly card' },
    { id: 'readonly-nested', parentId: 'readonly-child', nodeType: 'task', title: 'Readonly checklist' },
  ].map((task, order) => ({ ...task, workspaceId: 'ws', boardId: 'a', status: 'todo', order,
    detailNotes: [], assigneeIds: [], collaboratorIds: [], tagIds: [], isArchived: false }));
  const capabilities = ['read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
    'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
    'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit'];
  const matrix = { owner: capabilities, admin: [], project_manager: ['read_board'], member: ['read_board'], viewer: ['read_board'] };
  let step = 'load normal readonly board';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('projed-last-ws', 'ws');
      localStorage.setItem('projed-last-board', 'a');
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.hostname === 'accounts.google.com' || url.hostname === 'apis.google.com') return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/TaiwanCalendar/')) return route.fulfill({ json: [] });
        unexpected.push(url.origin); return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') { writes.push({ method: request.method(), path: url.pathname }); return route.fulfill({ status: 403, json: { error: { code: 'ACCESS_DENIED' } } }); }
      const path = url.pathname;
      const json = data => route.fulfill({ json: { data } });
      if (path === '/api/v1/session') return json({ localUserId: 'readonly', email: 'readonly@example.invalid', displayName: 'Readonly', createdAt: 1,
        expiresAt: Date.now() + 3600000, authContextId: 'readonly-context', entry: 'main' });
      if (path === '/api/v1/workspaces') return json([{ id: 'ws', title: 'Readonly workspace', ownerId: 'owner', sessionCapabilities: ['read_workspace'],
        boards: [{ id: 'a', title: 'Readonly board', dependencies: [], sessionCapabilities: ['read_board'] }] }]);
      if (path.endsWith('/access')) return json({ workspaceId: 'ws', boardId: 'a', workspaceRole: 'viewer', boardRole: 'viewer', capabilities: ['read_board'], canConfigureRolePermissions: false, canInviteExternal: false });
      if (path.endsWith('/role-permissions')) return json(matrix);
      if (path.endsWith('/members')) return json([{ workspaceId: 'ws', boardId: 'a', userId: 'readonly', role: 'viewer' }]);
      if (path.endsWith('/tasks')) return json(tasks);
      if (path.endsWith('/backup/source')) return json({ workspaceId: 'ws', workspaceTitle: 'Readonly workspace', boardId: 'a', boardTitle: 'Readonly board', tasks, dependencies: [], tags: [] });
      if (path === '/api/v1/preferences/layout') return json({});
      if (path.includes('/preferences/task-filters/')) return json(null);
      if (path === '/api/v1/task-tracking/capability') return json({ supported: false, reason: 'schema_not_ready' });
      if (path === '/api/v1/scope-revisions' || path.endsWith('/dependencies') || path.endsWith('/records') || path.endsWith('/tags') || path === '/api/v1/task-workbench/unplaced') return json([]);
      unexpected.push(path); return route.abort();
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('nav.app-main-nav').waitFor();
    const modal = page.locator('[data-task-details-modal="true"]');
    for (const task of tasks) {
      step = `normal click ${task.id}`;
      const title = page.locator(`[data-task-title-slot="true"][data-task-id="${task.id}"]`).first();
      await title.waitFor();
      ancestors[task.id] = await title.evaluate(element => {
        const result = [];
        for (let node = element; node; node = node.parentElement) {
          result.push({ tag: node.tagName, role: node.getAttribute('role'), disabled: node.hasAttribute('disabled'),
            ariaDisabled: node.getAttribute('aria-disabled'), taskId: node.getAttribute('data-task-id'),
            columnHeader: node.getAttribute('data-kanban-column-header'), surface: node.getAttribute('data-task-surface-frame-kind') });
        }
        return result;
      });
      // Ordinary click checks the real accessibility state of every ancestor.
      await title.click({ timeout: 5000 });
      assert(!ancestors[task.id].some(node => node.disabled || node.ariaDisabled === 'true'), 'Readonly task title has a disabled ancestor');
      await modal.waitFor();
      assert(await modal.getByRole('textbox', { name: '編輯任務名稱' }).count() === 0, 'Readonly task title became editable');
      assert((await modal.innerText()).includes(task.title), 'Wrong task details opened');
      await modal.getByRole('button', { name: '關閉任務詳情' }).click();
      await modal.waitFor({ state: 'hidden' });
      checks.push(`${task.id}-normal-details-open-and-readonly`);
    }
    step = 'navigate normal settings';
    await page.locator('[data-app-more-menu] summary').click();
    await page.locator('[data-app-more-settings]').click();
    await page.locator('[data-settings-section-tab="permissions"]').click();
    const panel = page.locator('[data-board-permission-settings]');
    await panel.getByText('僅可檢視', { exact: true }).waitFor();
    assert(await panel.locator('button[aria-pressed]').count() === 0, 'Readonly role matrix became editable');
    checks.push('normal-settings-navigation-with-readonly-matrix');
    assert(writes.length === 0 && unexpected.length === 0, 'Unexpected write or network request');
    await page.screenshot({ path: 'output/playwright/dev-139-readonly-board/settings.png', fullPage: false });
    const artifact = { status: 'PASS', evidenceLevel: 'LOCAL_NORMAL_APP_SYNTHETIC_HTTP_READONLY_UI', checks, ancestors, writes, unexpected,
      provider: 'NOT_RUN', postgres: 'NOT_RUN', forcedClick: false };
    await page.evaluate(value => { window.__DEV139_READONLY_BOARD = value; }, artifact);
    return artifact;
  } catch (error) {
    const artifact = { status: 'FAIL', evidenceLevel: 'LOCAL_NORMAL_APP_SYNTHETIC_HTTP_READONLY_UI', step, checks, ancestors, writes, unexpected, error: String(error) };
    await page.evaluate(value => { window.__DEV139_READONLY_BOARD = value; }, artifact);
    await page.screenshot({ path: 'output/playwright/dev-139-readonly-board/failure.png', fullPage: false });
    throw new Error(`Readonly board failed at ${step}: ${String(error)}`);
  }
}
