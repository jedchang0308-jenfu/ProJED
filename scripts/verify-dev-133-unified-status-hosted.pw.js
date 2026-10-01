/* eslint-disable */
// Read-only anonymous production smoke. No task writes, Auth stubs, or injected Sessions.
async (page) => {
  const expectedReleaseId = new URL(page.url()).searchParams.get('dev083ReleaseId');
  if (!expectedReleaseId) throw new Error('Expected release identity is required');
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (/projed-cc78d\.(?:web\.app|firebaseapp\.com)|knodlkxqpcqyrtgwpdst\.supabase\.co/.test(request.url())) {
      failed.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  await page.goto('https://projed-cc78d.firebaseapp.com/quick-task/?install=1', { waitUntil: 'networkidle' });
  await page.getByText('此快速 App 尚未登入', { exact: true }).waitFor();
  const checks = [];
  const check = (name, ok) => {
    checks.push({ name, ok });
    if (!ok) throw new Error('DEV-133 hosted UI smoke failed: ' + name);
  };
  const meta = await page.evaluate(async () => {
    const response = await fetch('/release-meta.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing release metadata');
    return response.json();
  });
  check('quick-origin-release-identity', meta.releaseId === expectedReleaseId);
  const ui = await page.evaluate(() => {
    const details = document.querySelector('#quick-task-recovery');
    const summary = details?.querySelector('summary');
    const auth = document.querySelector('#quick-task-auth-status');
    return {
      details: details instanceof HTMLDetailsElement,
      summary: Boolean(summary),
      statusInSummary: summary?.contains(document.querySelector('#quick-task-success')),
      list: Boolean(document.querySelector('#quick-task-recovery-list')),
      unauthenticatedState: auth?.dataset.state,
      statusColor: auth ? getComputedStyle(auth).color : null,
      localExplanation: auth?.textContent.includes('先記錄在本機'),
      recoveryHidden: details?.hidden,
      inputEnabled: !document.querySelector('#quick-task-title')?.disabled,
      createEnabled: !document.querySelector('#quick-task-submit')?.disabled,
    };
  });
  check('new-unified-panel-dom-bootstrap', ui.details && ui.summary && ui.statusInSummary && ui.list);
  check('unsigned-status-and-local-save-explanation', ui.unauthenticatedState === 'unauthenticated'
    && ui.statusColor === 'rgb(185, 28, 28)' && ui.localExplanation);
  check('empty-browser-has-no-recovery-panel', ui.recoveryHidden === true);
  check('typing-and-create-controls-ready', ui.inputEnabled && ui.createEnabled);
  for (const width of [320, 390, 726]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    check('no-horizontal-overflow-' + width, metrics.scrollWidth <= metrics.width + 1);
    await page.screenshot({ path: '.playwright-cli/dev133-unified-hosted-' + width + '.png', fullPage: true });
  }
  check('no-page-errors', errors.length === 0);
  check('no-critical-failed-requests', failed.length === 0);
  const result = { ok: true, layer: 'Live hosted anonymous UI; no task write or authenticated sync', expectedReleaseId,
    sourceCommit: meta.source.commit, checks, errors, failed, ui };
  console.log(JSON.stringify(result));
  return result;
}
