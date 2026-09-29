/* eslint-disable */
async (page) => {
  const main = 'https://projed-cc78d.web.app';
  const quick = 'https://projed-cc78d.firebaseapp.com';
  const opened = new URL(page.url());
  if (opened.origin !== main) throw new Error('DEV-131 smoke must start at canonical production');
  const releaseId = opened.searchParams.get('dev083ReleaseId');
  if (!releaseId) throw new Error('Missing expected release identity');

  for (const origin of [main, quick]) {
    const response = await page.request.get(`${origin}/release-meta.json`);
    if (!response.ok()) throw new Error(`${origin} release metadata: ${response.status()}`);
    const metadata = await response.json();
    if (metadata.releaseId !== releaseId) throw new Error(`${origin} serves a different release`);
    const manifestResponse = await page.request.get(`${origin}/quick-task/manifest.webmanifest`);
    if (!manifestResponse.ok()) throw new Error(`${origin} quick manifest: ${manifestResponse.status()}`);
    const manifest = await manifestResponse.json();
    if (manifest.id !== '/quick-task/' || manifest.start_url !== '/quick-task/' || manifest.scope !== '/quick-task/') {
      throw new Error(`${origin} quick install identity changed`);
    }
  }

  await page.goto(`${main}/quick-task/?install=1`, { waitUntil: 'domcontentloaded' });
  const legacyLink = page.locator('.quick-task-install-destination');
  await legacyLink.waitFor({ state: 'visible' });
  if (await legacyLink.getAttribute('href') !== `${quick}/quick-task/?install=1`) throw new Error('Legacy install page did not route to independent origin');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${quick}/quick-task/?install=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#quick-task-title').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'quick-task-title');
  await page.locator('#quick-task-install').waitFor({ state: 'visible' });
  const state = await page.evaluate(() => ({
    origin: location.origin,
    manifestOrigin: new URL(document.querySelector('link[rel="manifest"]').href).origin,
    titleFocused: document.activeElement?.id === 'quick-task-title',
    voiceVisible: document.querySelector('#quick-task-voice')?.getBoundingClientRect().width >= 48,
    rootMarkerCount: document.querySelectorAll('#root').length,
    guideText: document.querySelector('#quick-task-install')?.textContent ?? '',
  }));
  if (state.origin !== quick || state.manifestOrigin !== quick || !state.titleFocused || !state.voiceVisible || state.rootMarkerCount !== 0 || !state.guideText.includes('安裝')) {
    throw new Error(`Independent quick page failed: ${JSON.stringify(state)}`);
  }
  return JSON.stringify({ ok: true, releaseId, main, quick, state, limitation: 'Android WebAPK installation and Google account selection require device verification' });
}
