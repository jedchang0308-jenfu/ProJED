/* global window */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PROJED_PLAYWRIGHT_MODULE || 'playwright');
const dist = path.resolve(process.argv[2] || 'dist');
const output = path.resolve(process.argv[3] || 'output/auth-startup-recovery');
fs.mkdirSync(output, { recursive: true });
const fixtureUser = { id: '00000000-0000-4000-8000-000000000141', aud: 'authenticated', role: 'authenticated', email: 'auth-startup@fixture.invalid', user_metadata: { name: 'Synthetic fixture' }, app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' };
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(dist, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const scenario of ['anonymous', 'profile-pending', 'refresh-pending']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      // All auth/profile/data traffic is synthetic and intercepted, including writes.
      await context.route('https://*.supabase.co/**', async route => {
        const url = new URL(route.request().url());
        if ((scenario === 'profile-pending' && url.pathname.startsWith('/rest/v1/profiles')) || (scenario === 'refresh-pending' && url.pathname.startsWith('/auth/'))) return;
        if (url.pathname.startsWith('/rest/v1/profiles')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      if (scenario !== 'anonymous') await context.addInitScript(({ user, expired }) => {
        const part = v => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const exp = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
        localStorage.setItem('sb-knodlkxqpcqyrtgwpdst-auth-token', JSON.stringify({ access_token: part({ alg: 'HS256', typ: 'JWT' }) + '.' + part({ sub: user.id, exp, role: 'authenticated' }) + '.synthetic', refresh_token: 'fixture-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }));
      }, { user: fixtureUser, expired: scenario === 'refresh-pending' });
      const page = await context.newPage();
      let navigations = 0;
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        if (scenario === 'anonymous') await page.getByRole('button', { name: '使用 Google 帳號登入' }).waitFor();
        if (scenario === 'profile-pending') {
          await page.getByRole('button', { name: '更多選項', exact: true }).or(page.locator('[data-app-more-menu] > summary')).first().waitFor({ timeout: 14500 });
          assert.equal(await page.getByText('載入中...', { exact: true }).count(), 0);
        }
        if (scenario === 'refresh-pending') {
          await page.getByRole('alert').filter({ hasText: '登入狀態讀取逾時' }).waitFor({ timeout: 18000 });
          const sessionRetained = await page.evaluate(() => Boolean(localStorage.getItem('sb-knodlkxqpcqyrtgwpdst-auth-token')));
          assert.equal(sessionRetained, true);
          const other = await context.newPage();
          await other.goto(origin);
          await other.evaluate(() => { window.fixtureDraft = 'keep'; });
          let otherNavs = 0;
          other.on('framenavigated', frame => { if (frame === other.mainFrame()) otherNavs++; });
          const before = navigations;
          await page.getByRole('button', { name: '重試', exact: true }).click();
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(500);
          assert.equal(navigations, before + 1);
          assert.equal(otherNavs, 0);
          assert.equal(await other.evaluate(() => window.fixtureDraft), 'keep');
        }
        results.push({ scenario, passed: true, navigations });
      } finally { await context.close(); }
    }
  } finally {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ scope: 'Synthetic intercepted backend in isolated headless Edge; not physical-phone acceptance', results }, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
