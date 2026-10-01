/* eslint-disable */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'output/playwright/dev-133-quick-task-local-browser');
const port = 4173;
const baseUrl = `http://127.0.0.1:${port}/quick-task/`;
const viteEntry = path.join(root, 'node_modules/vite/bin/vite.js');
const browserPath = process.env.DEV133_CHROME_EXECUTABLE
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const assertPortFree = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => server.close(resolve));
});

const waitForVite = async vite => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before ready (${vite.exitCode})`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is not ready yet.
    }
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

  const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = require(playwrightModule);
  const testSource = fs.readFileSync(path.join(__dirname, 'verify-dev-133-quick-task-local-browser.pw.js'), 'utf8');
  const test = eval(`(${testSource})`);
  const vite = spawn(process.execPath, [viteEntry, '--configLoader', 'runner', '--mode', 'test', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });
  let browser;
  let result;

  try {
    await waitForVite(vite);
    browser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(browserPath) ? { executablePath: browserPath } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      result = await test(page);
    } catch (error) {
      result = await page.evaluate(() => window.__DEV133_ARTIFACT).catch(() => null);
      result = result
        ? { ...result, status: 'FAIL', runnerError: error.message }
        : { devId: 'DEV-133', status: 'FAIL', runnerError: error.message };
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

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
