import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const cliPlaywright = (process.env.PATH || '').split(path.delimiter)
  .filter(dir => path.basename(dir) === '.bin')
  .map(dir => path.resolve(dir, '..', 'playwright'))
  .find(dir => fs.existsSync(path.join(dir, 'package.json')));
const { chromium } = require(process.env.PROJED_PLAYWRIGHT_MODULE || cliPlaywright || 'playwright');
const output = path.resolve('output/playwright/login-pending');
fs.mkdirSync(path.join(output, 'env'), { recursive: true });
process.env.VITE_DATA_BACKEND = 'http';
process.env.PROJED_RELEASE_ENV_DIR = path.join(output, 'env');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false }, plugins: [{
  name: 'isolated-login-navigation-observer', enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/services/authService.ts')) return;
    // Observe assign without replacing the document so its waiting UI can be
    // tested. A final case enables real navigation to a synthetic SSO page.
    assert(code.includes('window.location.assign(authorizationUrl);'));
    return code.replace('window.location.assign(authorizationUrl);',
      'if (window.__LOGIN_TEST_NAVIGATE__) { window.location.assign(authorizationUrl); } else { window.__LOGIN_DESTINATION__ = authorizationUrl; }');
  },
}] });
let browser;
const checks = [];
const check = (name, condition) => { assert(condition, name); checks.push(name); console.log('PASS ' + name); };
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  let logins = 0;
  let authorizes = 0;
  let mode = 'redirect';
  let releaseSlow;
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/session/login') {
      ++logins;
      if (mode === 'failure') return json(503, { error: { code: 'DEPENDENCY_UNAVAILABLE', retryable: false } });
      if (mode === 'busy') return json(409, { error: { code: 'DB_BUSY', retryable: false } });
      if (mode === 'slow') await new Promise(resolve => { releaseSlow = resolve; });
      const query = new URLSearchParams({ client_id: 'projed', response_type: 'code',
        redirect_uri: origin + '/api/auth/jenfu-sso/callback', code_challenge: 'C'.repeat(43),
        code_challenge_method: 'S256', state: 'S'.repeat(43) });
      return json(200, { data: { authorizationUrl: origin + '/api/sso/authorize?' + query } });
    }
    if (url.pathname === '/api/sso/authorize') {
      ++authorizes;
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Synthetic SSO</title>' });
    }
    return json(401, { error: { code: 'IDENTITY_INVALID', retryable: false } });
  });
  await page.goto(origin);
  const login = page.getByRole('button', { name: '檢查 Jenfu-Platform 登入' });
  await login.waitFor();
  await page.screenshot({ path: path.join(output, 'idle.png') });
  await page.clock.install();
  await login.focus();
  await page.keyboard.press('Enter');
  const pending = page.getByRole('button', { name: '正在登入…' });
  await pending.waitFor();
  check('login action immediately disables its button', await pending.isDisabled());
  await page.waitForTimeout(500);
  check('redirect response keeps the original login shell and disabled button visible', await pending.isDisabled());
  check('pending label has no repeated-click instruction', !(await page.locator('body').innerText()).includes('請勿重複點擊'));
  for (let i = 0; i < 5; ++i) await page.keyboard.press('Enter');
  await pending.evaluate(button => { for (let i = 0; i < 5; ++i) button.click(); });
  check('keyboard and repeated clicks send only one login request', logins === 1);
  check('login reaches the validated redirect boundary', (await page.evaluate(() => window.__LOGIN_DESTINATION__)).startsWith(origin + '/api/sso/authorize?'));
  await page.screenshot({ path: path.join(output, 'pending.png') });
  await page.clock.fastForward(60_001);
  await login.waitFor();
  check('navigation timeout restores the button with a recoverable error', await login.isEnabled()
    && (await page.locator('body').innerText()).includes('登入未完成，請重試。'));
  mode = 'failure';
  await login.click();
  await page.getByText('DEPENDENCY_UNAVAILABLE', { exact: true }).waitFor();
  check('API failure restores the same login button', await login.isEnabled());
  mode = 'busy';
  await login.click();
  await page.getByText('登入已在進行中，請稍候。', { exact: true }).waitFor();
  check('competing-window response remains locked without an automatic retry', await pending.isDisabled() && logins === 3);
  await page.clock.fastForward(60_001);
  await login.waitFor();
  check('competing-window wait is bounded and does not resend automatically', await login.isEnabled() && logins === 3);
  mode = 'slow';
  await page.evaluate(() => { delete window.__LOGIN_DESTINATION__; });
  await login.click();
  await pending.waitFor();
  // Wait for the synthetic request to be held before advancing the clock.
  while (!releaseSlow) await new Promise(resolve => setTimeout(resolve, 10));
  await page.clock.fastForward(60_001);
  await login.waitFor();
  releaseSlow();
  await page.waitForTimeout(200);
  check('a late login response after timeout cannot navigate or adopt an identity', !(await page.evaluate(() => window.__LOGIN_DESTINATION__)) && await login.isEnabled());
  mode = 'redirect';
  await login.click();
  await pending.waitFor();
  await page.evaluate(() => window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true })));
  await login.waitFor();
  check('returning through browser back restores an actionable login button', await login.isEnabled());
  await page.screenshot({ path: path.join(output, 'recovery.png') });
  mode = 'redirect';
  await page.evaluate(() => { window.__LOGIN_TEST_NAVIGATE__ = true; });
  await login.click();
  await page.waitForURL('**/api/sso/authorize?**');
  check('explicit retry navigates to the synthetic SSO entry', authorizes === 1 && await page.title() === 'Synthetic SSO');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', scope: 'isolated browser with synthetic HTTP responses; no production identity or data', checks }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
/* global window */
