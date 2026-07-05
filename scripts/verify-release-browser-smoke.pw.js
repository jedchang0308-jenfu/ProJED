/* eslint-disable */
async (page) => {
  const messages = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (message) => messages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push({ url: request.url(), failure: failure ? failure.errorText : null });
  });

  const targetUrl = page.url() && page.url() !== 'about:blank' ? page.url() : 'http://127.0.0.1:4174/';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root', { timeout: 15000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async () => {
    const root = document.querySelector('#root');
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((script) => script.getAttribute('src'));
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href'));
    const bodyText = document.body.innerText.slice(0, 1200);
    const serviceWorker = {
      supported: 'serviceWorker' in navigator,
      ready: false,
      controller: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
      scriptURL: null,
      error: null,
    };

    if ('serviceWorker' in navigator) {
      try {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('service worker ready timeout')), 10000);
          }),
        ]);
        serviceWorker.ready = true;
        serviceWorker.controller = Boolean(navigator.serviceWorker.controller);
        serviceWorker.scriptURL =
          (registration.active && registration.active.scriptURL) ||
          (registration.waiting && registration.waiting.scriptURL) ||
          (registration.installing && registration.installing.scriptURL) ||
          null;
      } catch (error) {
        serviceWorker.error = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      url: window.location.href,
      title: document.title,
      rootNonEmpty: Boolean(root && root.innerHTML.trim().length > 0),
      bodyText,
      scripts,
      styles,
      serviceWorker,
    };
  });

  const criticalMessages = messages.filter((message) => (
    message.type === 'error' &&
    !/favicon|ResizeObserver|google|gsi|apis\.google/i.test(message.text)
  ));
  const criticalFailed = failedRequests.filter((request) => (
    !/fonts\.gstatic|fonts\.googleapis|accounts\.google|apis\.google|favicon/i.test(request.url)
  ));
  const hasMainBundle = result.scripts.some((src) => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(src || ''));
  const hasMainStyle = result.styles.some((href) => /\/assets\/index-[A-Za-z0-9_-]+\.css/.test(href || ''));
  const ok =
    result.rootNonEmpty &&
    hasMainBundle &&
    hasMainStyle &&
    criticalMessages.length === 0 &&
    pageErrors.length === 0 &&
    criticalFailed.length === 0;

  if (!ok) {
    throw new Error(JSON.stringify({ result, criticalMessages, pageErrors, criticalFailed }, null, 2));
  }

  return JSON.stringify({
    ok,
    result,
    criticalMessages,
    pageErrors,
    criticalFailed,
    diagnostics: messages.slice(-20),
  }, null, 2);
}
