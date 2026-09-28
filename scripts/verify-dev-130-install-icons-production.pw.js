/* eslint-disable */
async (page) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const names = [
    ['/manifest.webmanifest', 'projed-main-icon-brand-20260929', '/'],
    ['/quick-task/manifest.webmanifest', 'projed-quick-task-icon-brand-20260929', '/quick-task/'],
  ];
  const checked = [];
  for (const [manifestPath, prefix, route] of names) {
    const response = await page.request.get(`${origin}${manifestPath}`);
    if (!response.ok()) throw new Error(`${manifestPath}: HTTP ${response.status()}`);
    const manifest = await response.json();
    if (manifest.id !== route || manifest.start_url !== route || manifest.scope !== route) throw new Error(`${manifestPath}: identity changed`);
    for (const size of [192, 512]) {
      const src = `/icons/${prefix}-${size}.png`;
      const entry = manifest.icons.find(icon => icon.src === src && icon.sizes === `${size}x${size}` && icon.purpose === 'any');
      if (!entry) throw new Error(`${manifestPath}: ${size}px icon entry missing`);
      const iconResponse = await page.request.get(`${origin}${src}`);
      if (!iconResponse.ok()) throw new Error(`${src}: HTTP ${iconResponse.status()}`);
      const bytes = await iconResponse.body();
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error(`${src}: invalid PNG dimensions`);
      checked.push({ src, size, bytes: bytes.length });
    }
    await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    if (!favicon?.includes(`/icons/${prefix}-512.png`)) throw new Error(`${route}: favicon mismatch`);
  }
  return JSON.stringify({ ok: true, origin, checked, limitation: 'Android native WebAPK installation requires physical retest' });
}
