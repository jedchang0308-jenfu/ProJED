import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';

const root = process.cwd();
const output = path.join(root, 'output/qa/dev-134/quick-task-update-prompt');
const session = `dev134-quick-prompt-${randomUUID().slice(0, 8)}`;
const cli = 'C:/Users/user/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js';
const runtime = { project: root, purpose: 'Quick Task shared PWA update prompt mobile interaction verification', session, port: 0, cleanupCondition: 'finally close task-owned Playwright session and Vite server; prove port released' };
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
const vite = await createServer({ configFile: path.join(root, 'vite.config.js'), configLoader: 'native', mode: 'test', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await vite.listen();
runtime.port = vite.httpServer.address().port;
runtime.pid = process.pid;
runtime.command = 'node scripts/verify-dev-134-quick-task-update-prompt.mjs';
fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
const origin = `http://127.0.0.1:${runtime.port}`;
const run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, '-s', session, ...args], { cwd: root, windowsHide: true, env: { ...process.env, PWTEST_DAEMON_SESSION_DIR: path.join(output, 'cli-daemon') } });
  let text = ''; child.stdout.on('data', chunk => { text += chunk; }); child.stderr.on('data', chunk => { text += chunk; });
  child.on('error', reject); child.on('close', code => resolve({ code, text }));
});
let result;
try {
  const opened = await run(['open', `${origin}/scripts/fixtures/dev-134-quick-task-update-prompt.html`]);
  if (opened.code !== 0 || opened.text.includes('### Error')) throw new Error(`Playwright open failed: ${opened.text.slice(-2000)}`);
  await run(['snapshot']);
  const checks = await run(['run-code', `--filename=${path.join(root, 'scripts/verify-dev-134-quick-task-update-prompt.pw.js')}`]);
  fs.writeFileSync(path.join(output, 'browser.log'), checks.text);
  const match = checks.text.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (checks.code !== 0 || checks.text.includes('### Error') || !match) throw new Error(`Playwright verification failed: ${checks.text.slice(-3000)}`);
  result = JSON.parse(match[1]);
} finally {
  const closed = await run(['close']);
  runtime.browserClosed = closed.code === 0 && !closed.text.includes('### Error');
  await vite.close();
  try { await fetch(origin, { signal: AbortSignal.timeout(1500) }); runtime.portReleased = false; } catch { runtime.portReleased = true; }
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
}
result.runtime = runtime;
result.ok = result.ok && runtime.browserClosed && runtime.portReleased;
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ok: result.ok, checks: result.checks, runtime: { browserClosed: runtime.browserClosed, portReleased: runtime.portReleased } }, null, 2));
if (!result.ok) process.exitCode = 1;
