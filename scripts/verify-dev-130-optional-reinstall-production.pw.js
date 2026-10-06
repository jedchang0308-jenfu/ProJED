/* eslint-disable */
async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36',
    });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => query === '(display-mode: minimal-ui)'
      ? { matches: true, addEventListener() {}, removeEventListener() {} }
      : nativeMatchMedia(query);
  });

  await page.goto(`${origin}/quick-task/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('⋮', { exact: true }).click();
  const entry = page.getByRole('button', { name: '安裝與圖示', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('#quick-task-title').isVisible())) throw new Error('quick capture field was obscured');
  await entry.click();
  await page.locator('.quick-task-install-dialog').waitFor({ state: 'visible' });

  const toggle = page.locator('[data-quick-icon-reinstall-toggle]');
  await toggle.waitFor({ state: 'visible', timeout: 15000 });
  if (await toggle.getAttribute('aria-expanded') !== 'false') throw new Error('reinstall guide opened without user choice');
  await toggle.click();
  await page.locator('[data-quick-icon-reinstall]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const content = document.querySelector('[data-quick-icon-reinstall]')?.textContent || '';
    return content.includes('未同步') || content.includes('暫勿移除');
  }, undefined, { timeout: 15000 });
  const guide = await page.locator('[data-quick-icon-reinstall]').innerText();
  if (!guide.includes('可保留舊圖示繼續使用') || !(guide.includes('未同步') || guide.includes('暫勿移除')) || !guide.includes('用原帳號登入')) {
    throw new Error('voluntary guide or local-data safeguard missing');
  }
  if (await page.locator('[data-quick-icon-reinstall-link]').count() !== 1) throw new Error('save-link action missing');
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (size.scrollWidth > size.width + 1) throw new Error(`horizontal overflow: ${JSON.stringify(size)}`);
  if (errors.length) throw new Error(`page errors: ${JSON.stringify(errors)}`);
  await page.screenshot({ path: 'output/playwright/dev130-optional/production-quick-390x844.png' });
  return JSON.stringify({ ok: true, origin, viewport: 390, optionalGuide: true, criticalPageErrors: 0 });
}
