import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'vite';

// Small, isolated production-mode adapter builds: actual service, prompt and
// generated Workbox configuration, with no backend or user browser profile.
const root = process.cwd();
const output = path.join(root, 'output', 'qa', 'dev-134');
const visuals = path.join(root, 'output', 'playwright', 'dev-134');
const fixture = path.join(output, 'browser-fixture');
fs.mkdirSync(fixture, { recursive: true });
fs.mkdirSync(visuals, { recursive: true });
const envDir = path.join(fixture, 'env'); fs.mkdirSync(envDir, { recursive: true });
const sourceFiles = ['src/services/pwaUpdateService.ts', 'src/services/pwaUpdateTransaction.ts', 'src/components/AppUpdatePrompt.tsx', 'vite.config.js', 'firebase.json'];
const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const source = Object.fromEntries(sourceFiles.map(file => [file, digest(file)]));
const runId = randomUUID().slice(0, 8);
const versions = { A: `dev134-${runId}-A`, B: `dev134-${runId}-B` };
const entry = path.join(fixture, 'entry.tsx');
fs.writeFileSync(entry, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppUpdatePrompt } from '/src/components/AppUpdatePrompt';
import * as pwa from '/src/services/pwaUpdateService';
import * as safety from '/src/services/pwaReloadSafety';
import * as tx from '/src/services/pwaUpdateTransaction';
import '/src/index.css';
createRoot(document.getElementById('root')!).render(<><main style={{padding:24}}><h1>ProJED PWA recovery fixture</h1><p data-fixture-version>${'${document.querySelector(\'meta[name="projed-shell-version"]\')?.getAttribute(\'content\')}'}</p></main><AppUpdatePrompt /></>);
let dirty = false, revision = 1;
safety.registerPwaReloadSafetyOwner({ ownerId:'record-draft', getSnapshot:()=>({ownerId:'record-draft',state:dirty?'dirty':'safe',reasonCodes:dirty?['RECORD_DRAFT_UNSAVED']:[],revision}), prepareForReload:async()=>dirty?{ok:false,code:'OWNER_ACTION_REQUIRED'}:{ok:true,revision} });
pwa.subscribePwaUpdateState(state=>{
  const history=JSON.parse(sessionStorage.getItem('dev134-state-history')||'[]');
  history.push({status:state.status,transaction:JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1')||'null')});
  sessionStorage.setItem('dev134-state-history',JSON.stringify(history.slice(-100)));
});
if (!window.location.search.includes('ui=1')) pwa.setupPwaLifecycle();
else safety.setPwaReloadReadiness('version-shell','fixture',true);
safety.setPwaReloadReadiness('auth-shell','fixture',true);
safety.setPwaReloadReadiness('active-view','fixture',true);
window.__DEV134={
  state:pwa.getPwaUpdateState, retry:pwa.retryPwaUpdate, recover:pwa.clearPwaApplicationCacheAndReload,
  check:pwa.__dev134.check, registration:pwa.__dev134.registration,
  ready(value){safety.setPwaReloadReadiness('auth-shell','fixture',value);},
  dirty(value){dirty=value;revision++;safety.refreshPwaReloadSafety(null);},
  fail(target){const now=Date.now()-600000;const transaction={...tx.claimPwaUpdateTransaction(tx.createPwaUpdateTransaction({transactionId:'historical-failed',sourceVersion:pwa.getPwaUpdateState().currentVersion,targetVersion:target,now}),'historical-tab',3,now+1),phase:'failed',errorCode:'APPLY_FAILED',errorMessage:'先前啟用未完成。'};localStorage.setItem('projed.pwa-update.transaction.v1',JSON.stringify(transaction));pwa.__dev134.reconcile();},
  show(kind){pwa.__dev134.set({status:'failed',updateAvailable:false,failureKind:kind,errorCode:'FIXTURE',errorMessage:kind==='load'?'應用程式檔案暫時無法載入，請重試。':'先前重新載入未完成，請重試。'});},
  normal(blocked=false){pwa.__dev134.set({status:'update-available',updateAvailable:true,dismissedAt:null,failureKind:null,errorCode:null,errorMessage:blocked?'目前無法確認內容是否已保存。':null,reloadSafetyState:blocked?'blocked':'dirty'});},
  load(){pwa.handleRecoverableAppLoadError(new Error('Failed to fetch dynamically imported module: fixture'));}
};
`);
const savedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_') || key.startsWith('PROJED_RELEASE')));
try {
  for (const key of Object.keys(savedEnv)) delete process.env[key];
  process.env.PROJED_RELEASE_ENV_DIR = envDir;
  for (const [label, id] of Object.entries(versions)) {
    process.env.PROJED_RELEASE_ID = id;
    await build({ configFile: path.join(root, 'vite.config.js'), configLoader: 'native', mode: 'qa', logLevel: 'warn',
      plugins: [{ name: 'dev134-isolated-adapter', enforce: 'pre',
        transformIndexHtml: { order: 'pre', handler(html) {
          return html.replace(/<script[^>]*src="https:[\s\S]*?<\/script>/g, '')
            .replace(/<link\b[^>]*href="https:[^>]*>/g, '')
            .replace('/src/main.tsx', '/' + path.relative(root, entry).replaceAll(path.sep, '/'));
        } },
        transform(code, file) {
          if (file.replaceAll('\\', '/').endsWith('/src/services/pwaUpdateService.ts')) {
            return code + '\nexport const __dev134 = { check: checkForAppShellUpdate, reconcile: reconcilePendingTransaction, set: setUpdateState, registration: () => registeredServiceWorker };';
          }
        },
      }], build: { outDir: path.join(fixture, label), emptyOutDir: true, rollupOptions: { input: { main: path.join(root, 'index.html') } } },
    });
  }
} finally {
  for (const key of Object.keys(process.env).filter(key => key.startsWith('VITE_') || key.startsWith('PROJED_RELEASE'))) delete process.env[key];
  Object.assign(process.env, savedEnv);
}

let active = 'A';
const requests = [];
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__dev134/switch') { active = url.searchParams.get('release') === 'B' ? 'B' : 'A'; res.end(active); return; }
  if (url.pathname === '/__dev134/requests') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(requests)); return; }
  requests.push({ url: req.url, release: active, time: Date.now() });
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  let file = path.resolve(fixture, active, relative);
  if (!file.startsWith(path.join(fixture, active) + path.sep)) { res.writeHead(400); res.end(); return; }
  // The shipping retention implementation is independently hash-tested. This
  // delivery fixture makes one previous generation's immutable URLs reachable.
  if (!fs.existsSync(file) && relative.startsWith('assets/')) file = path.join(fixture, 'A', relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('missing'); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const runtime = { project: root, purpose: 'DEV-134 real generated Workbox and prompt validation', owningProcess: { pid: process.pid, command: 'node scripts/verify-dev-134-pwa-recovery-browser.mjs' }, port: 0, session: `dev134-${runId}`, cleanupCondition: 'finally close this CLI session and HTTP server; verify port released' };
const cli = process.env.PLAYWRIGHT_CLI_PATH;
if (!cli || !fs.existsSync(cli)) throw new Error('Set PLAYWRIGHT_CLI_PATH to the installed playwright-cli.js (no dependency installation required).');
fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
runtime.port = server.address().port;
const origin = `http://127.0.0.1:${runtime.port}`;
const runCli = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, '-s', runtime.session, ...args], { cwd: root, env: { ...process.env, PWTEST_DAEMON_SESSION_DIR: path.join(fixture, 'cli-daemon') }, shell: false, windowsHide: true });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  child.on('error', reject); child.on('close', code => resolve({ code, output }));
});
fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
let report;
try {
  const opened = await runCli(['open', origin]);
  fs.writeFileSync(path.join(output, 'browser-open.txt'), opened.output);
  if (opened.code !== 0 || opened.output.includes('### Error')) throw new Error('Playwright session open failed: ' + opened.output.slice(-1200));
  await runCli(['snapshot']);
  const code = fs.readFileSync(path.join(root, 'scripts/verify-dev-134-pwa-recovery-browser.pw.js'), 'utf8')
    .replaceAll('__ORIGIN__', origin).replaceAll('__VERSION_A__', `release:${versions.A}`).replaceAll('__VERSION_B__', `release:${versions.B}`)
    .replaceAll('__VISUALS__', visuals.replaceAll('\\', '/'));
  const codePath = path.join(fixture, 'run.pw.js'); fs.writeFileSync(codePath, code);
  const executed = await runCli(['run-code', `--filename=${codePath}`]);
  fs.writeFileSync(path.join(output, 'browser-run.txt'), executed.output);
  const match = executed.output.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!match || executed.code !== 0 || executed.output.includes('### Error')) throw new Error('Browser verification failed: ' + executed.output.slice(-2500));
  report = JSON.parse(match[1]);
  report.source = source;
  report.sourceUnchanged = sourceFiles.every(file => digest(file) === source[file]);
  report.boundary = 'Local adapter builds using actual production service, UI and generated worker; no authenticated production profile or remote mutation.';
  report.requests = requests;
} finally {
  try {
    const closed = await runCli(['close']);
    runtime.browserClosed = closed.code === 0 && !closed.output.includes('### Error');
  } catch (error) { runtime.browserClosed = false; runtime.cleanupError = error.message; }
  await new Promise(resolve => server.close(resolve));
  try { await fetch(origin, { signal: AbortSignal.timeout(2000) }); runtime.portReleased = false; }
  catch { runtime.portReleased = true; }
  fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
}
report.cleanup = runtime;
report.ok = report.ok && report.sourceUnchanged && runtime.browserClosed && runtime.portReleased;
fs.writeFileSync(path.join(output, 'browser-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, results: report.results, cleanup: { browserClosed: runtime.browserClosed, portReleased: runtime.portReleased } }, null, 2));
if (!report.ok) process.exitCode = 1;
