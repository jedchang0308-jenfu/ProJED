/* eslint-disable */
async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const failures = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?projed_app_identity_update=brand-20260921-bridge-20260922`, { waitUntil: 'domcontentloaded' });
  await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(800);

  const rootView = await page.evaluate(() => ({
    text: document.body.innerText,
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    identityGuidance: document.querySelectorAll('[data-pwa-identity-update-guidance]').length,
  }));
  if (/更新桌面圖示|檢閱應用程式更新|重新安裝/.test(rootView.text)) failures.push('obsolete icon update instruction is visible');
  if (rootView.identityGuidance !== 0) failures.push('obsolete identity reminder is mounted');
  if (rootView.width > rootView.viewport + 1) failures.push('mobile root has horizontal overflow');
  if (!rootView.favicon?.includes('/icons/projed-main-icon-brand-20260921.png')) failures.push('root favicon is not the brand asset');
  await page.screenshot({ path: 'output/playwright/dev083-direct-feature/dev130-root-390x844.png' });

  const paths = [
    ['/manifest.webmanifest', '/icons/projed-main-icon-brand-20260921.png', '/'],
    ['/quick-task/manifest.webmanifest', '/icons/projed-quick-task-icon-brand-20260921.png', '/quick-task/'],
  ];
  for (const [manifestPath, iconPath, id] of paths) {
    const manifestResponse = await page.request.get(`${origin}${manifestPath}`);
    if (!manifestResponse.ok()) { failures.push(`${manifestPath} HTTP ${manifestResponse.status()}`); continue; }
    const manifest = await manifestResponse.json();
    if (manifest.id !== id || manifest.start_url !== id || manifest.scope !== id) failures.push(`${manifestPath} identity changed`);
    if (manifest.icons?.length !== 2 || manifest.icons.some(icon => icon.src !== iconPath)) failures.push(`${manifestPath} icon mismatch`);
    const iconResponse = await page.request.get(`${origin}${iconPath}`);
    if (!iconResponse.ok()) failures.push(`${iconPath} HTTP ${iconResponse.status()}`);
    else {
      const png = await iconResponse.body();
      if (png[1] !== 80 || png[2] !== 78 || png[3] !== 71) failures.push(`${iconPath} is not PNG`);
    }
  }

  await page.goto(`${origin}/quick-task/`, { waitUntil: 'domcontentloaded' });
  const quickView = await page.evaluate(() => ({
    favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    titleInput: Boolean(document.querySelector('#quick-task-title')),
  }));
  if (!quickView.favicon?.includes('/icons/projed-quick-task-icon-brand-20260921.png')) failures.push('quick favicon is not the brand asset');
  if (!quickView.titleInput) failures.push('quick task entry is missing');
  if (quickView.width > quickView.viewport + 1) failures.push('mobile quick task has horizontal overflow');
  await page.screenshot({ path: 'output/playwright/dev083-direct-feature/dev130-quick-390x844.png' });

  if (origin === 'https://projed-cc78d.web.app') {
    await page.goto(`${origin}/pwa-update-bridge.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => url.pathname === '/', { timeout: 10000 });
    if (page.url().includes('projed_app_identity_update')) failures.push('legacy bridge reintroduced the obsolete guidance query');
  }
  if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);
  if (failures.length) throw new Error(JSON.stringify({ failures, rootView, quickView, pageErrors }, null, 2));

  return JSON.stringify({ ok: true, origin, rootView: { favicon: rootView.favicon, width: rootView.width }, quickView, pageErrors }, null, 2);
}
