/* eslint-disable */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'output/playwright/dev-133-quick-task-oauth-mock');
const port = 4174;
const baseUrl = `http://127.0.0.1:${port}/quick-task/`;
const viteEntry = path.join(root, 'node_modules/vite/bin/vite.js');
const browserPath = process.env.DEV133_CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const assertPortFree = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => server.close(resolve));
});

const waitForVite = async vite => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before ready (${vite.exitCode})`);
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch { /* Wait for the isolated verification runtime to start. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Vite did not become ready at ${baseUrl}`);
};

const stopVite = async vite => {
  if (vite.exitCode !== null) return;
  const exited = new Promise(resolve => vite.once('exit', resolve));
  vite.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
  if (vite.exitCode === null) {
    const killed = new Promise(resolve => vite.once('exit', resolve));
    vite.kill('SIGKILL');
    await Promise.race([killed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
};

const main = async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  await assertPortFree();
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const test = eval(`(${fs.readFileSync(path.join(__dirname, 'verify-dev-133-oauth-client-browser.pw.js'), 'utf8')})`);
  const vite = spawn(process.execPath, [viteEntry, '--configLoader', 'runner', '--mode', 'test', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env,
      VITE_SUPABASE_URL: 'https://dev133-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'dev133-local-anon-key',
      VITE_QUICK_TASK_OAUTH_CLIENT_ID: 'dev133-oauth-public-client',
      VITE_QUICK_TASK_OAUTH_REDIRECT_URI: baseUrl,
    },
  });
  let browser;
  let result;
  try {
    await waitForVite(vite);
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(browserPath) ? { executablePath: browserPath } : {}) });
    const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const page = await context.newPage();
    try {
      result = await test(page);
    } catch (error) {
      result = { devId: 'DEV-133', slice: 'B0-oauth-mocked', status: 'FAIL', runnerError: error.name || 'Error' };
      await page.screenshot({ path: path.join(outputDirectory, 'oauth-mock-failure.png'), fullPage: true }).catch(() => undefined);
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await stopVite(vite);
    if (result) fs.writeFileSync(path.join(outputDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result));
  if (!result || result.status !== 'PASS') process.exitCode = 1;
};

main().catch(error => { console.error(error.name || 'Error'); process.exitCode = 1; });
