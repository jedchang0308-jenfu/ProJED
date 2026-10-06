/* eslint-disable */
// Read-only canonical production check for the Quick Task's shared update prompt mount.
async page => {
  const diagnostics = { pageErrors: [], failedRequests: [], consoleErrors: [] };
  const rpcWrites = [];
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => { if (/\/rest\/v1\/rpc\//.test(request.url()) && request.method() === 'POST') rpcWrites.push(request.url()); });

  const releaseId = new URL(page.url()).searchParams.get('dev083ReleaseId');
  if (!releaseId) throw new Error('DEV-134 hosted smoke requires the release id injected by the direct release runner.');
  const target = new URL('/quick-task/?install=1', page.url());
  target.searchParams.set('dev083ReleaseId', releaseId);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('#quick-task-title').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-pwa-update-prompt]').waitFor({ state: 'attached', timeout: 15000 });

  const result = await page.evaluate(async expectedReleaseId => {
    const metaResponse = await fetch('/release-meta.json', { cache: 'no-store' });
    const meta = metaResponse.ok ? await metaResponse.json() : null;
    const prompt = document.querySelector('[data-pwa-update-prompt]');
    const bounds = prompt?.getBoundingClientRect();
    return {
      route: location.pathname,
      expectedReleaseId,
      servedReleaseId: meta?.releaseId ?? null,
      releaseMatches: meta?.releaseId === expectedReleaseId,
      quickTaskReady: Boolean(document.querySelector('#quick-task-title')?.checkVisibility()),
      promptMounted: Boolean(prompt),
      safeStatePromptHidden: prompt?.hidden === true,
      promptText: prompt?.innerText ?? '',
      viewport: { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight },
      promptBounds: bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null,
    };
  }, releaseId);
  result.remoteRpcWrites = rpcWrites.length;

  const failures = [];
  if (result.route !== '/quick-task/') failures.push('quick-task route mismatch');
  if (!result.releaseMatches) failures.push('served release metadata does not match expected release');
  if (!result.quickTaskReady) failures.push('Quick Task input did not become visible');
  if (!result.promptMounted) failures.push('shared Quick Task update prompt did not mount');
  if (!result.safeStatePromptHidden) failures.push('safe state unexpectedly shows a reload prompt');
  if (result.viewport.scrollWidth > result.viewport.width + 1) failures.push('horizontal overflow at 320px');
  if (result.promptBounds && (result.promptBounds.left < 0 || result.promptBounds.right > result.viewport.width + 1 || result.promptBounds.bottom > result.viewport.height + 1)) failures.push('prompt bounds exceed viewport');
  if (rpcWrites.length) failures.push('anonymous read-only smoke attempted remote RPC writes');
  const criticalConsoleErrors = diagnostics.consoleErrors.filter(text => !/favicon|ResizeObserver/i.test(text));
  const criticalFailedRequests = diagnostics.failedRequests.filter(item => !/favicon|fonts\.googleapis|fonts\.gstatic/i.test(item.url));
  if (diagnostics.pageErrors.length || criticalConsoleErrors.length || criticalFailedRequests.length) failures.push('browser emitted a critical runtime error or failed request');

  const summary = { ok: failures.length === 0, failures, result, diagnostics: { ...diagnostics, criticalConsoleErrors, criticalFailedRequests } };
  console.log(JSON.stringify(summary));
  if (failures.length) throw new Error('DEV-134 hosted Quick Task prompt smoke failed: ' + JSON.stringify(summary));
  return summary;
}
