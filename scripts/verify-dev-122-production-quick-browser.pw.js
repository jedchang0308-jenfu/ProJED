/* eslint-disable */
async (page) => {
  const targetUrl = page.url();
  const target = await page.evaluate(() => ({
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    origin: window.location.origin,
    expectedReleaseId: new URLSearchParams(window.location.search).get('dev122ReleaseId'),
  }));
  const allowedHosts = new Set([
    'projed-cc78d.web.app',
    'projed-cc78d--production-candidate-tsxgwy67.web.app',
  ]);
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || target.pathname !== '/quick-task/') {
    throw new Error(`DEV-122 production quick smoke target is not allowlisted: ${targetUrl}`);
  }
  const expectedReleaseId = target.expectedReleaseId;
  if (!expectedReleaseId) throw new Error('DEV-122 production quick smoke requires dev122ReleaseId query evidence.');
  const environment = target.hostname === 'projed-cc78d.web.app' ? 'production-live' : 'production-candidate';
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const businessRequests = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || null });
  });
  page.on('request', request => {
    if (/\/rest\/v1\/|\/graphql|\/api\//u.test(request.url())) {
      businessRequests.push({ method: request.method(), url: request.url() });
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#quick-task-title', { state: 'visible', timeout: 15000 });
  await page.waitForSelector('#quick-task-voice', { state: 'visible', timeout: 15000 });

  const result = await page.evaluate(async expected => {
    const title = document.querySelector('#quick-task-title');
    const voice = document.querySelector('#quick-task-voice');
    const submit = document.querySelector('#quick-task-submit');
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const manifestResponse = manifestLink ? await fetch(manifestLink.href, { cache: 'no-store' }) : null;
    const releaseResponse = await fetch(`/release-meta.json?dev083ReleaseId=${encodeURIComponent(expected)}`, { cache: 'no-store' });
    const releaseMeta = releaseResponse.ok ? await releaseResponse.json() : null;
    return {
      url: window.location.href,
      title: document.title,
      secureContext: window.isSecureContext,
      titleVisible: title instanceof HTMLInputElement && title.getBoundingClientRect().width > 0,
      titleFocused: document.activeElement === title,
      titleValue: title instanceof HTMLInputElement ? title.value : null,
      voiceVisible: voice instanceof HTMLButtonElement && voice.getBoundingClientRect().width >= 48,
      voiceHeight: voice instanceof HTMLButtonElement ? voice.getBoundingClientRect().height : 0,
      voiceLabel: voice instanceof HTMLButtonElement ? voice.getAttribute('aria-label') : null,
      submitVisible: submit instanceof HTMLButtonElement && submit.getBoundingClientRect().width > 0,
      manifestUrl: manifestLink instanceof HTMLLinkElement ? manifestLink.href : null,
      manifestStatus: manifestResponse?.status ?? null,
      releaseStatus: releaseResponse.status,
      releaseId: releaseMeta?.releaseId ?? null,
      scripts: Array.from(document.querySelectorAll('script[src]')).map(node => node.src),
      styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(node => node.href),
      rootMarkerCount: document.querySelectorAll('#root').length,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, expectedReleaseId);

  const origin = target.origin;
  const sameOriginFailures = failedRequests.filter(entry => entry.url.startsWith(origin));
  const sameOriginBadResponses = badResponses.filter(entry => entry.url.startsWith(origin));
  const criticalConsoleErrors = consoleErrors.filter(text => !/favicon/i.test(text));
  const ok =
    result.secureContext &&
    result.titleVisible &&
    result.titleFocused &&
    result.titleValue === '' &&
    result.voiceVisible &&
    result.voiceHeight >= 48 &&
    result.voiceLabel === '使用語音輸入任務名稱' &&
    result.submitVisible &&
    result.manifestStatus === 200 &&
    result.releaseStatus === 200 &&
    result.releaseId === expectedReleaseId &&
    result.scripts.some(url => /\/assets\/quickTask-[A-Za-z0-9_-]+\.js$/.test(url)) &&
    result.styles.some(url => /\/assets\/quickTask-[A-Za-z0-9_-]+\.css$/.test(url)) &&
    result.rootMarkerCount === 0 &&
    businessRequests.length === 0 &&
    criticalConsoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    sameOriginFailures.length === 0 &&
    sameOriginBadResponses.length === 0;
  const artifact = {
    devId: 'DEV-122',
    releaseId: expectedReleaseId,
    status: ok ? 'PASS' : 'FAIL',
    environment,
    caseSet: 'production-quick-entry',
    checkedAt: new Date().toISOString(),
    result,
    businessRequests,
    criticalConsoleErrors,
    pageErrors,
    sameOriginFailures,
    sameOriginBadResponses,
  };
  await page.evaluate(value => { window.__DEV122_PRODUCTION_QUICK_ARTIFACT = value; }, artifact);
  await page.screenshot({
    path: `output/playwright/dev-122-mobile-zero-data-quick-task/${environment}-quick-390x844.png`,
    fullPage: true,
  });
  if (!ok) throw new Error(JSON.stringify(artifact, null, 2));
  return JSON.stringify(artifact, null, 2);
}
