/* eslint-disable */
async (page) => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:47983') throw new Error('ISOLATED_STORE_FIXTURE_REQUIRED');
  const checks = [];
  const record = (id, ok) => { checks.push({ id, ok }); };
  await page.route('**/api/v1/session', route => route.fulfill({ json: { data: {
    localUserId: 'A', email: null, displayName: 'A', createdAt: 1, expiresAt: Date.now() + 3600000, authContextId: 'context-A', entry: 'main',
  } } }));
  await page.goto('http://127.0.0.1:47983/qa/dev-139/s3/http-sync-store.fixture.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__DEV139_HTTP_STORE_FIXTURE));
  await page.evaluate(() => { window.__DEV139_HTTP_STORE_FIXTURE.setActor('A'); window.__DEV139_HTTP_STORE_FIXTURE.mount(); });
  await page.waitForFunction(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot().oldTasksRead);
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.publishEarlierARead());
  const earlier = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('A-task-response-parsed-before-switch', earlier.oldTasksRead && earlier.nodes[0]?.title === 'A-private-task');
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.setActor('B'));
  await page.waitForTimeout(100);
  const waiting = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('B-awaiting-index-cannot-see-A-read-cache', !JSON.stringify(waiting).includes('A-private'));
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.publishB());
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.releaseEarlierARead());
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('old-fully-parsed-tasks-cannot-overwrite-B-same-legacy-board', after.nodes.length === 1 && after.nodes[0].title === 'B-private-task');
  const previousReadCount = after.oldTaskReadCount;
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.startOldWorkspaceScope());
  await page.waitForFunction(count => window.__DEV139_HTTP_STORE_FIXTURE.snapshot().oldTaskReadCount > count, previousReadCount);
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.publishB());
  await page.waitForFunction(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot().nodes[0]?.title === 'B-private-task');
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.releaseOldWorkspaceScope());
  const scoped = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('same-account-same-board-alias-still-checks-workspace', scoped.nodes.length === 1 && scoped.nodes[0].workspaceId === 'ws-B');
  await page.evaluate(() => { void window.__DEV139_HTTP_STORE_FIXTURE.startOldTagLoad(); });
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.loadNewTags());
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.releaseOldTags());
  const tags = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('older-tag-scope-cannot-overwrite-newer-tags', tags.tags.length === 1 && tags.tags[0].name === 'B-private-tag');
  await page.evaluate(() => { window.__DEV139_HTTP_STORE_FIXTURE.setActor('B', 'context-B-new'); });
  // Only the layout boundary has run; a same-user new Session must refetch,
  // even when its revision list is unchanged.
  await page.waitForFunction(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot().indexContexts.includes('context-B-new'));
  const context = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('same-account-new-context-reloads-index', context.workspaces[0]?.id === 'ws-B');
  await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.stop());
  const stopped = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('unmounted-app-removes-published-private-cache', stopped.workspaces.length === 0 && stopped.nodes.length === 0 && stopped.tags.length === 0);
  await page.evaluate(() => {
    window.__DEV139_HTTP_STORE_FIXTURE.setActor('A');
    window.__DEV139_HTTP_STORE_FIXTURE.seedTags('A');
    void window.__DEV139_HTTP_STORE_FIXTURE.startOldMutation();
    window.__DEV139_HTTP_STORE_FIXTURE.setActor('B');
    window.__DEV139_HTTP_STORE_FIXTURE.seedTags('B');
    window.__DEV139_HTTP_STORE_FIXTURE.rejectOldMutation();
  });
  await page.waitForTimeout(50);
  const mutation = await page.evaluate(() => window.__DEV139_HTTP_STORE_FIXTURE.snapshot());
  record('old-tag-rollback-cannot-restore-A-into-B', mutation.tags[0]?.name === 'B-private-tag');
  const failures = checks.filter(check => !check.ok).map(check => check.id);
  if (failures.length) throw new Error(`STORE_OWNERSHIP_REGRESSION ${failures.join(', ')}`);
  return { status: 'PASS', evidenceLevel: 'LOCAL_SERVICE_RESPONSE_SIMULATION', checks };
}
