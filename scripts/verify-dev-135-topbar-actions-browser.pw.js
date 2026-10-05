/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-135-topbar-actions';
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const account = {
    id: 'dev135-browser-user',
    uid: 'dev135-browser-user',
    email: 'dev135-browser@projed.local',
    displayName: 'DEV-135 QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev135-browser-workspace',
    title: 'DEV-135 選單驗收',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'dev135-browser-board', title: 'DEV-135 測試看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const menu = page.locator('[data-app-more-menu]');
  const panel = page.locator('[data-app-more-menu-panel]');
  const openMenu = async () => {
    if (!(await panel.isVisible().catch(() => false))) await menu.locator('summary').click();
    await panel.waitFor({ state: 'visible', timeout: 5000 });
  };

  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify({}));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
      [`${workspace.id}:${workspace.boards[0].id}`]: [
        { userId: account.id, role: 'owner' },
        { userId: 'dev135-member', role: 'member' },
      ],
    }));
    localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', workspace.boards[0].id);
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace });
  await page.reload({ waitUntil: 'networkidle' });
  const fixedTestButton = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedTestButton.count() && await fixedTestButton.isVisible().catch(() => false)) {
    await fixedTestButton.click({ force: true });
  }
  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });

  assert(await menu.count() === 1, 'one overflow menu should be present');
  const summary = menu.locator('summary');
  const updateBadge = summary.locator('[data-app-more-update-badge="true"]');
  assert(await updateBadge.count() === 0, 'update badge should be hidden when no update is available');
  const canSimulateUpdate = await page.evaluate(() => {
    if (!window.__projedPwaUpdateTest) return false;
    window.__projedPwaUpdateTest.simulateUpdateAvailable();
    return true;
  });
  assert(canSimulateUpdate, 'PWA update test controls should be available');
  await updateBadge.waitFor({ state: 'visible', timeout: 5000 });
  assert((await updateBadge.textContent())?.trim() === '1', 'one available update should display a count of one');
  assert(await summary.getAttribute('aria-label') === '更多選項，有可用更新', 'update availability should be announced');
  await page.evaluate(() => window.__projedPwaUpdateTest.simulateUpdated());
  await updateBadge.waitFor({ state: 'detached', timeout: 5000 });
  assert(await summary.getAttribute('aria-label') === '更多選項', 'completed update should clear its notification');
  assert(await page.locator('nav [data-board-share-open]').count() === 0, 'share action should leave the visible topbar');
  await openMenu();
  const share = panel.locator('[data-app-more-share="true"]');
  const meeting = panel.locator('[data-app-more-meeting-record="true"]');
  const personalRecord = panel.locator('[data-app-more-work-log="true"]');
  assert(await share.count() === 1, 'share action should appear once in the menu');
  assert(await share.getAttribute('aria-label') === '分享看板，2 位成員', 'share count should be preserved');
  assert(await meeting.count() === 1, 'meeting record action should appear in the menu');
  assert((await meeting.textContent())?.trim() === '開始會議模式', 'meeting action should use the approved label');
  assert(await personalRecord.count() === 1 && await personalRecord.isDisabled(), 'unavailable personal record should remain disabled in the menu');
  assert(await page.locator('nav [data-board-share-open]').count() === 1, 'share action should have one menu entry and no topbar duplicate');
  await page.screenshot({ path: `${OUTPUT_DIR}/menu-open.png`, fullPage: false });

  await share.click();
  await page.locator('[data-board-share-dialog]').waitFor({ state: 'visible', timeout: 10000 });
  assert(!(await panel.isVisible().catch(() => false)), 'selecting share should close the overflow menu');
  await page.getByRole('button', { name: '關閉分享看板' }).click();
  await page.locator('[data-board-share-dialog]').waitFor({ state: 'hidden', timeout: 5000 });

  await openMenu();
  await panel.locator('[data-app-more-meeting-record="true"]').click();
  await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
  await openMenu();
  assert(await panel.locator('[data-active-record-kind="meeting"]').isVisible(), 'active meeting status should be available inside the menu');
  assert(await panel.locator('[data-app-more-meeting-record="true"]').count() === 0, 'start action should switch to the active-record status');
  await page.screenshot({ path: `${OUTPUT_DIR}/meeting-active-in-menu.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden', timeout: 5000 });

  console.log(JSON.stringify({
    ok: true,
    viewport: '1280x760',
    checks: ['update badge appears and clears with update state', 'actions moved from topbar', 'share member count preserved', 'share dialog opens', 'disabled personal-record state preserved', 'meeting starts and reports active state in menu'],
  }));
};
