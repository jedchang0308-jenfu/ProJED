import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'vite';
import { verifyManifest } from './release/verify-production-artifact.mjs';

// Small, isolated production-mode adapter builds: actual service, prompt and
// generated Workbox configuration, with no backend or user browser profile.
const root = process.cwd();
const output = path.resolve(process.env.DEV134_REPORT_DIR ?? path.join(root, 'output', 'qa', 'dev-134'));
const visuals = path.resolve(process.env.DEV134_VISUALS_DIR ?? path.join(root, 'output', 'playwright', 'dev-134'));
const fixture = path.join(output, 'browser-fixture');
fs.mkdirSync(fixture, { recursive: true });
fs.mkdirSync(visuals, { recursive: true });
const envDir = path.join(fixture, 'env'); fs.mkdirSync(envDir, { recursive: true });
const sourceFiles = [
  'ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md',
  'ai-doc/qa/QA-DEV-134-pwa-recovery-local-verification.md',
  'ai-doc/dev_task.md',
  'ai-doc/documentation_map.md',
  'src/services/pwaUpdateService.ts', 'src/services/pwaUpdateTransaction.ts',
  'src/services/pwaUpdatePresentation.ts', 'src/services/pwaReloadSafety.ts',
  'src/features/quickTaskCapture/reloadSafety.ts', 'src/features/quickTaskCapture/install.ts', 'src/features/quickTaskCapture/pwaUpdatePrompt.ts',
  'src/features/quickTaskCapture/auth.ts', 'src/features/quickTaskCapture/outbox.ts', 'src/features/quickTaskCapture/sync.ts',
  'src/services/supabase/client.ts', 'src/services/supabase/quickTaskCaptureService.ts',
  'src/quickTask/main.ts', 'src/quickTask/quick-task.css', 'quick-task/index.html',
  'src/components/AuthGate.tsx', 'src/components/MainLayout.tsx', 'src/components/AppMoreMenu.tsx',
  'src/components/AppUpdatePrompt.tsx', 'src/components/PwaReloadSafetyBridge.tsx', 'src/components/HomeView.tsx', 'src/components/SettingsView.tsx',
  'src/store/useAuthStore.ts', 'src/store/useBoardStore.ts', 'src/services/authService.ts', 'src/utils/autoMigration.ts',
  'scripts/verify-dev-041-pwa-update-notification-cache-recovery.mjs', 'scripts/verify-dev-041-pwa-update-notification-cache-recovery-browser.pw.js',
  'scripts/verify-dev-096-pwa-update-transaction-convergence.ts', 'scripts/verify-dev-096-pwa-update-transaction-convergence-sw.mjs', 'scripts/verify-dev-096-pwa-update-transaction-convergence-browser.pw.js',
  'scripts/verify-dev-097-pwa-safe-reload.ts', 'scripts/verify-dev-097-pwa-safe-reload-sw.mjs', 'scripts/verify-dev-097-pwa-safe-reload-browser.pw.js',
  'scripts/verify-dev-134-pwa-recovery.mjs', 'scripts/verify-dev-134-quick-task-update-prompt.mjs',
  'scripts/verify-dev-134-quick-task-update-prompt.pw.js', 'scripts/verify-dev-134-quick-task-update-prompt-hosted.pw.js',
  'scripts/verify-dev-134-pwa-recovery-browser.mjs', 'scripts/verify-dev-134-pwa-recovery-browser.pw.js',
  'vite.config.js', 'firebase.json', 'index.html',
];
const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const source = Object.fromEntries(sourceFiles.map(file => [file, digest(file)]));
const runId = randomUUID().slice(0, 8);
const versions = { A: `dev134-${runId}-A`, B: `dev134-${runId}-B` };
// U09 uses the bytes from a sealed historical release, never a rebuild of A.
const legacyManifestPath = path.join(root, 'output/release/dev-083/20261002091531-2a1246/manifest.json');
const legacyVerification = verifyManifest(legacyManifestPath, { root });
if (!legacyVerification.ok) throw new Error('Sealed U09 release verification failed: ' + legacyVerification.errors.join('; '));
const legacyManifest = legacyVerification.manifest;
const legacyDist = fs.realpathSync(legacyManifest.artifact.distDir);
if (!legacyDist.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Sealed U09 release is outside the authorized repository.');
const deliveryRoots = { A: path.join(fixture, 'A'), B: path.join(fixture, 'B'), L: legacyDist };
const legacyVersion = `release:${legacyManifest.releaseId}`;
const legacyProvenance = {
  manifestPath: path.relative(root, legacyManifestPath).replaceAll(path.sep, '/'),
  manifestSha256: createHash('sha256').update(fs.readFileSync(legacyManifestPath)).digest('hex'),
  releaseId: legacyManifest.releaseId, source: legacyManifest.source,
  distPath: path.relative(root, legacyDist).replaceAll(path.sep, '/'),
  treeSha256: legacyManifest.artifact.treeSha256,
  verifiedFileCount: legacyManifest.artifact.entries.length,
  verified: legacyVerification.ok, errors: legacyVerification.errors,
};
const entry = path.join(fixture, 'entry.tsx');
const authStubId = '\0dev134-auth-service';
const migrationStubId = '\0dev134-auto-migration';
const authStubSource = `export const authService={handleRedirectResult:async()=>null,onAuthStateChanged:()=>()=>{},signInWithGoogle:async()=>null,signOut:async()=>{},updateDisplayName:async user=>user};export const isEmbeddedAuthBlocked=()=>false;export const isLocalTestAuth=()=>false;export const isSupabaseLocalPasswordAuth=()=>false;export const LOCAL_TEST_ACCOUNTS=[{id:'fixture',email:'fixture@invalid',password:'fixture'}];export const LOCAL_TEST_SELECTED_ACCOUNT_KEY='dev134-fixture-account';`;
const migrationStubSource = `export const runAutoMigration=async()=>{window.__DEV134_SIMULATIONS??=[];window.__DEV134_SIMULATIONS.push('migration-precondition');return 'skipped';};`;
const quickAuthSdkStubId = '\0dev134-quick-auth-sdk-precondition';
const quickAuthSdkStubSource = `
const signedIn = new URLSearchParams(location.search).get('dev134Auth') === 'signedIn';
const user = { id: 'dev134-simulated-user', email: 'dev134-fixture@invalid' };
const accessToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYxMzQtc2ltdWxhdGVkLXVzZXIiLCJzZXNzaW9uX2lkIjoiZGV2MTM0LXNpbXVsYXRlZC1zZXNzaW9uIn0.';
const session = { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const metrics = window.__DEV134_QUICK_AUTH_SIMULATION = { marker: 'SIMULATION: bounded auth SDK precondition; no network calls', mode: signedIn ? 'signedIn' : 'signedOut', endpointConfigured: false, getSessionCalls: 0, getUserCalls: 0, subscriptions: 0, unsubscriptions: 0, oauthAttempts: 0, signOutCalls: 0 };
const listeners = new Set();
export const configuredSupabaseUrl = undefined;
export const supabase = { auth: {
  async getSession() { metrics.getSessionCalls += 1; return { data: { session: signedIn ? session : null }, error: null }; },
  async getUser(token) { metrics.getUserCalls += 1; return { data: { user: signedIn && token === accessToken ? user : null }, error: null }; },
  onAuthStateChange(callback) {
    metrics.subscriptions += 1;
    let active = true;
    listeners.add(callback);
    queueMicrotask(() => { if (active) callback('INITIAL_SESSION', signedIn ? session : null); });
    return { data: { subscription: { unsubscribe() { if (!active) return; active = false; listeners.delete(callback); metrics.unsubscriptions += 1; } } } };
  },
  async signOut() { metrics.signOutCalls += 1; for (const callback of [...listeners]) callback('SIGNED_OUT', null); return { error: null }; },
  async signInWithOAuth() { metrics.oauthAttempts += 1; return { data: { provider: 'google', url: null }, error: null }; },
} };
`;
fs.writeFileSync(entry, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppUpdatePrompt } from '/src/components/AppUpdatePrompt';
import AuthGate from '/src/components/AuthGate';
import MainLayout from '/src/components/MainLayout';
import HomeView from '/src/components/HomeView';
import SettingsView from '/src/components/SettingsView';
import { PwaReloadSafetyBridge, PwaReloadSafetyOwners } from '/src/components/PwaReloadSafetyBridge';
import useAuthStore from '/src/store/useAuthStore';
import useBoardStore from '/src/store/useBoardStore';
import * as pwa from '/src/services/pwaUpdateService';
import * as safety from '/src/services/pwaReloadSafety';
import * as tx from '/src/services/pwaUpdateTransaction';
import '/src/index.css';

// SIMULATION: an inert authenticated identity and skipped legacy migration establish
// the preconditions only. MainLayout, its children, update service and rendered menu are real.
const params = new URLSearchParams(location.search);
const initialRole = params.get('role') || 'admin';
const initialUser = params.get('login') === '1' ? null : {
  uid: 'dev134-fixture-' + initialRole, email: initialRole + '@fixture.invalid',
  displayName: 'DEV-134 ' + initialRole, role: initialRole,
};
useAuthStore.setState({ user: initialUser, loading: false, error: null });
if (params.has('view')) useBoardStore.getState().setView(params.get('view'));
const adapterFixture = !params.has('normal') && !params.has('login');
let adapterDirty = false, adapterRevision = 1;
if (adapterFixture) safety.registerPwaReloadSafetyOwner({ ownerId:'record-draft',
  getSnapshot:()=>({ownerId:'record-draft',state:adapterDirty?'dirty':'safe',reasonCodes:adapterDirty?['RECORD_DRAFT_UNSAVED']:[],revision:adapterRevision}),
  prepareForReload:async()=>adapterDirty?{ok:false,code:'OWNER_ACTION_REQUIRED'}:{ok:true,revision:adapterRevision} });
const FixtureContent = () => {
  const currentView = useBoardStore(state => state.currentView);
  return currentView === 'settings' ? <SettingsView /> : <HomeView />;
};
const FixtureMain = () => {
  const user = useAuthStore(state => state.user);
  const currentView = useBoardStore(state => state.currentView);
  return <PwaReloadSafetyBridge><AuthGate><PwaReloadSafetyOwners currentView={currentView} userId={user?.uid ?? null} /><MainLayout><FixtureContent /></MainLayout></AuthGate><AppUpdatePrompt /></PwaReloadSafetyBridge>;
};
const root = createRoot(document.getElementById('root')!);
root.render(<FixtureMain />);

pwa.subscribePwaUpdateState(state=>{
  const history=JSON.parse(sessionStorage.getItem('dev134-state-history')||'[]');
  history.push({status:state.status,check:state.check,localUpdateBusy:state.localUpdateBusy,transaction:JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1')||'null')});
  sessionStorage.setItem('dev134-state-history',JSON.stringify(history.slice(-100)));
});
if (!location.search.includes('ui=1')) pwa.setupPwaLifecycle();
else safety.setPwaReloadReadiness('version-shell','fixture-ui-only',true);
window.__DEV134={
  state:pwa.getPwaUpdateState, retry:pwa.retryPwaUpdate, recover:pwa.clearPwaApplicationCacheAndReload,
  check:pwa.__dev134.check, registration:pwa.__dev134.registration,
  ready(value){safety.setPwaReloadReadiness('auth-shell','fixture',value);},
  dirty(value){ adapterDirty=value;adapterRevision++;safety.refreshPwaReloadSafety(null); },
  route(view){useBoardStore.getState().setView(view);},
  auth(role,authenticated=true){useAuthStore.setState({user:authenticated?{uid:'dev134-fixture-'+role,email:role+'@fixture.invalid',displayName:'DEV-134 '+role,role}:null,loading:false,error:null});},
  noBoard(){useBoardStore.setState({workspaces:[],activeWorkspaceId:null,activeBoardId:null});useBoardStore.getState().showHome();const state=useBoardStore.getState();return {workspaces:state.workspaces.length,activeWorkspaceId:state.activeWorkspaceId,activeBoardId:state.activeBoardId,currentView:state.currentView};},
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
        resolveId(source, importer) {
          const normalized = (importer || '').replaceAll('\\\\', '/');
          if (source === '../services/authService'
            && (normalized.endsWith('/src/components/AuthGate.tsx') || normalized.endsWith('/src/store/useAuthStore.ts'))) return authStubId;
          if (source === '../utils/autoMigration' && normalized.endsWith('/src/components/AuthGate.tsx')) return migrationStubId;
          if (source === '../../services/supabase/client' && normalized.endsWith('/src/features/quickTaskCapture/auth.ts')) return quickAuthSdkStubId;
        },
        load(id) {
          if (id === authStubId) return authStubSource;
          if (id === migrationStubId) return migrationStubSource;
          if (id === quickAuthSdkStubId) return quickAuthSdkStubSource;
        },
        transformIndexHtml: { order: 'pre', handler(html) {
          return html.replace(/<script[^>]*src="https:[\s\S]*?<\/script>/g, '')
            .replace(/<link\b[^>]*href="https:[^>]*>/g, '')
            .replace('/src/main.tsx', '/' + path.relative(root, entry).replaceAll(path.sep, '/'));
        } },
        transform(code, file) {
          if (file.replaceAll('\\', '/').endsWith('/src/services/pwaUpdateService.ts')) {
            const instrumented = code.replace('export const setupPwaLifecycle = () => {', 'export const setupPwaLifecycle = () => {\n  window.__DEV134_SETUP_CALLS = (window.__DEV134_SETUP_CALLS || 0) + 1;');
            return instrumented + '\nexport const __dev134 = { check: checkForAppShellUpdate, reconcile: reconcilePendingTransaction, set: setUpdateState, registration: () => registeredServiceWorker };\nif (typeof window !== \'undefined\') window.__DEV134_PWA = { getState: getPwaUpdateState, check: checkPwaUpdate, load: handleRecoverableAppLoadError, metrics: () => ({ listenerCount: listeners.size, setupDone, setupCalls: window.__DEV134_SETUP_CALLS || 0 }) };';
          }
        },
      }], build: { outDir: path.join(fixture, label), emptyOutDir: true, rollupOptions: { input: { main: path.join(root, 'index.html'), quickTask: path.join(root, 'quick-task/index.html') } } },
    });
  }
} finally {
  for (const key of Object.keys(process.env).filter(key => key.startsWith('VITE_') || key.startsWith('PROJED_RELEASE'))) delete process.env[key];
  Object.assign(process.env, savedEnv);
}

let active = 'A';
let metadataDelayMs = 0;
let metadataFault = false;
const requests = [];
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__dev134/switch') { const requested = url.searchParams.get('release'); active = Object.hasOwn(deliveryRoots, requested) ? requested : 'A'; res.end(active); return; }
  if (url.pathname === '/__dev134/check-delay') { metadataDelayMs = Math.max(0, Math.min(15000, Number(url.searchParams.get('ms')) || 0)); res.end(String(metadataDelayMs)); return; }
  if (url.pathname === '/__dev134/check-fault') { metadataFault = url.searchParams.get('enable') === '1'; res.end(String(metadataFault)); return; }
  if (url.pathname === '/__dev134/requests') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(requests)); return; }
  const requestRecord = { method: req.method, url: req.url, release: active, time: Date.now(), status: 200, bytes: 0, sha256: null, pending: true };
  res.once('finish', () => { requestRecord.pending = false; });
  res.once('close', () => { requestRecord.pending = false; });
  requests.push(requestRecord);
  if (metadataFault && ['/app-shell-meta.json', '/release-meta.json', '/index.html'].includes(url.pathname)) {
    requestRecord.status = 503;
    requestRecord.simulation = 'U03 bounded metadata/fallback HTTP fault; original artifacts unchanged';
    res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('DEV-134 expected metadata fault'); return;
  }
  if (url.pathname === '/__dev134/away') {
    const body = Buffer.from('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="icon" href="/icons/projed-quick-task-icon-brand-20260929-192.png"><title>DEV-134 same-origin away</title><body data-dev134-away="true"><main>同源返回測試頁</main></body></html>');
    requestRecord.bytes = body.byteLength; requestRecord.sha256 = createHash('sha256').update(body).digest('hex');
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); return;
  }
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (relative === 'quick-task' || relative.endsWith('/')) relative = `${relative.replace(/\/$/u, '')}/index.html`;
  if ((relative === 'app-shell-meta.json' || relative === 'release-meta.json') && /(?:^|;\s*)dev134_fault=http(?:;|$)/u.test(req.headers.cookie || '')) {
    const body = Buffer.from('DEV134 simulated metadata HTTP 503');
    requestRecord.status = 503; requestRecord.bytes = body.byteLength; requestRecord.sha256 = createHash('sha256').update(body).digest('hex');
    res.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' }); res.end(body); return;
  }
  let file = path.resolve(deliveryRoots[active], relative);
  if (!file.startsWith(deliveryRoots[active] + path.sep)) { res.writeHead(400); res.end(); return; }
  // The shipping retention implementation is independently hash-tested. This
  // delivery fixture makes one previous generation's immutable URLs reachable.
  if (!fs.existsSync(file) && relative.startsWith('assets/')) {
    const retained = ['A', 'L'].map(label => ({ label, file: path.resolve(deliveryRoots[label], relative) }))
      .find(candidate => candidate.file.startsWith(deliveryRoots[candidate.label] + path.sep) && fs.existsSync(candidate.file));
    if (retained) { file = retained.file; requestRecord.retainedFrom = retained.label; }
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const body = Buffer.from('missing'); requestRecord.status = 404; requestRecord.bytes = body.byteLength; requestRecord.sha256 = createHash('sha256').update(body).digest('hex');
    res.writeHead(404); res.end(body); return;
  }
  const body = fs.readFileSync(file);
  requestRecord.bytes = body.byteLength; requestRecord.sha256 = createHash('sha256').update(body).digest('hex');
  const send = () => {
    if (res.destroyed) return;
    const bfcachePrecondition = path.extname(file) === '.html' && url.searchParams.get('dev134Bfcache') === '1';
    requestRecord.cacheControl = bfcachePrecondition ? 'no-cache' : 'no-store';
    if (bfcachePrecondition) requestRecord.simulation = 'U06 document delivery cache precondition only; production Hosting headers unchanged';
    res.writeHead(200, { 'Cache-Control': requestRecord.cacheControl, 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  };
  const isMetadata = relative === 'app-shell-meta.json' || relative === 'release-meta.json';
  if (isMetadata && metadataDelayMs > 0) {
    const delayMs = metadataDelayMs;
    metadataDelayMs = 0;
    const timer = setTimeout(send, delayMs);
    res.once('close', () => clearTimeout(timer));
  } else send();
});
const runtime = { project: root, purpose: 'DEV-134 real MainLayout/Quick Task/Workbox browser validation', owningProcess: { pid: process.pid, command: 'node scripts/verify-dev-134-pwa-recovery-browser.mjs' }, port: 0, sessions: { standard: `dev134-${runId}`, u06: `dev134-u06-${runId}` }, cliInvocations:[], cleanupCondition: 'finally close both task-owned CLI sessions and HTTP server; verify port released' };
const cli = process.env.PLAYWRIGHT_CLI_PATH;
if (!cli || !fs.existsSync(cli)) throw new Error('Set PLAYWRIGHT_CLI_PATH to the installed playwright-cli.js (no dependency installation required).');
const cliCheck = args => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  return { code: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
};
const cliHelp = cliCheck(['open', '--help']);
const cliVersion = cliCheck(['--version']);
if (cliHelp.code !== 0 || !cliHelp.output.includes('--config')) throw new Error('Installed Playwright CLI help does not confirm --config support: ' + cliHelp.output.slice(-1200));
const u06ConfigPath = path.join(fixture, `u06-playwright-${runId}.json`);
const u06Config = { browser: { launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } } };
fs.writeFileSync(u06ConfigPath, JSON.stringify(u06Config, null, 2));
const u06ConfigSha256 = createHash('sha256').update(fs.readFileSync(u06ConfigPath)).digest('hex');
fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
runtime.port = server.address().port;
const origin = `http://127.0.0.1:${runtime.port}`;
const runCli = (session, args, configPath = null) => new Promise((resolve, reject) => {
  const cliArgs = ['-s', session, ...args, ...(configPath && args[0] === 'open' ? ['--config', configPath] : [])];
  const invocation = { executable: process.execPath, cli, argv: cliArgs, configPath, startedAt: new Date().toISOString() };
  runtime.cliInvocations.push(invocation);
  const child = spawn(process.execPath, [cli, ...cliArgs], { cwd: root, env: { ...process.env, PWTEST_DAEMON_SESSION_DIR: path.join(fixture, 'cli-daemon') }, shell: false, windowsHide: true });
  invocation.pid = child.pid ?? null;
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  child.on('error', error => { invocation.error = error.message; invocation.endedAt = new Date().toISOString(); reject(error); });
  child.on('close', code => { invocation.exitCode = code; invocation.endedAt = new Date().toISOString(); resolve({ code, output, pid: invocation.pid, startedAt: invocation.startedAt, endedAt: invocation.endedAt }); });
});
const readOwnedProcessTree = session => {
  const safeSession = session.replaceAll("'", "''");
  const ps = `$all=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine);$ids=@($all | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${safeSession}') } | ForEach-Object { [int]$_.ProcessId });$changed=$true;while($changed){$changed=$false;$children=@($all | Where-Object { $ids -contains [int]$_.ParentProcessId -and $ids -notcontains [int]$_.ProcessId });if($children.Count){$ids+=@($children | ForEach-Object { [int]$_.ProcessId });$changed=$true}};$rows=@($all | Where-Object { $ids -contains [int]$_.ProcessId });$rows | ConvertTo-Json -Compress -Depth 3`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',windowsHide:true,shell:false});
  let processes=[];
  try { const parsed=JSON.parse(result.stdout||'[]');processes=Array.isArray(parsed)?parsed:(parsed?[parsed]:[]); } catch { /* no process evidence is a recorded gap */ }
  const browsers=processes.filter(item=>/chrome|chromium/i.test(item.Name||''));
  return { observedAt:new Date().toISOString(),commandExitCode:result.status, commandError:result.error?.message??null, commandStdout:result.stdout?.slice(-4000)??'',commandStderr:result.stderr?.slice(-4000)??'', processes, chromium:browsers,
    actualChromiumArgvCaptured:browsers.length>0,
    disabledBackForwardCacheFlagPresent:browsers.some(item=>String(item.CommandLine||'').includes('--disable-back-forward-cache')) };
};
fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify({ ...runtime, cli: { path: cli, version: cliVersion.output.trim(), helpSupportsConfig: cliHelp.output.includes('--config') }, u06: { configPath: u06ConfigPath, configSha256: u06ConfigSha256, config: u06Config } }, null, 2));
let report = { ok: false, results: [], diagnostics: [], requests: [] };
report.legacyRelease = legacyProvenance;
report.mainPreconditions = [
  { purpose: 'SIMULATION: establish an inert logged-in role through the real AuthGate', import: '../services/authService',
    importers: ['src/components/AuthGate.tsx', 'src/store/useAuthStore.ts'], moduleId: authStubId,
    replacedSource: 'src/services/authService.ts', sourceSha256: source['src/services/authService.ts'],
    virtualModuleSha256: createHash('sha256').update(authStubSource).digest('hex') },
  { purpose: 'SIMULATION: skip legacy data migration; no backend mutation', import: '../utils/autoMigration',
    importers: ['src/components/AuthGate.tsx'], moduleId: migrationStubId,
    replacedSource: 'src/utils/autoMigration.ts', sourceSha256: source['src/utils/autoMigration.ts'],
    virtualModuleSha256: createHash('sha256').update(migrationStubSource).digest('hex') },
];
report.quickAuthSdkPrecondition = {
  marker: 'SIMULATION: auth SDK precondition only; real Quick auth.ts, main.ts, form, menu, outbox and update service remain in candidate build',
  importer: 'src/features/quickTaskCapture/auth.ts',
  replacedImport: '../../services/supabase/client',
  syntheticModuleId: quickAuthSdkStubId,
  aliasRule: { plugin: 'dev134-isolated-adapter.resolveId', exactImport: '../../services/supabase/client', importerSuffix: '/src/features/quickTaskCapture/auth.ts', replacement: quickAuthSdkStubId },
  virtualModule: { id: quickAuthSdkStubId, generatedFrom: 'quickAuthSdkStubSource in scripts/verify-dev-134-pwa-recovery-browser.mjs', bytes: Buffer.byteLength(quickAuthSdkStubSource), sha256: createHash('sha256').update(quickAuthSdkStubSource).digest('hex') },
  sourceFiles: ['src/features/quickTaskCapture/auth.ts', 'src/services/supabase/client.ts', 'src/features/quickTaskCapture/outbox.ts', 'src/features/quickTaskCapture/sync.ts', 'src/services/supabase/quickTaskCaptureService.ts'],
  sourceSha256: Object.fromEntries(['src/features/quickTaskCapture/auth.ts', 'src/services/supabase/client.ts', 'src/features/quickTaskCapture/outbox.ts', 'src/features/quickTaskCapture/sync.ts', 'src/services/supabase/quickTaskCaptureService.ts'].map(file => [file, source[file]])),
  shimSha256: createHash('sha256').update(quickAuthSdkStubSource).digest('hex'),
  env: { VITE_SUPABASE_URL: 'unset', VITE_SUPABASE_ANON_KEY: 'unset', configuredSupabaseUrl: 'undefined in bounded shim' },
  isolatedEnvDir: path.relative(root, envDir).replaceAll(path.sep, '/'),
  modeSelector: 'URL query dev134Auth=signedIn | signedOut',
  fakeIdentity: { id: 'dev134-simulated-user', email: 'dev134-fixture@invalid', sessionId: 'dev134-simulated-session' },
  sdkMethods: ['getSession', 'getUser', 'onAuthStateChange', 'subscription.unsubscribe', 'signOut', 'signInWithOAuth'],
};
try {
  const opened = await runCli(runtime.sessions.standard, ['open', origin]);
  fs.writeFileSync(path.join(output, 'browser-open.txt'), opened.output);
  if (opened.code !== 0 || opened.output.includes('### Error')) throw new Error('Playwright session open failed: ' + opened.output.slice(-1200));
  await runCli(runtime.sessions.standard, ['snapshot']);
  const boundCode = fs.readFileSync(path.join(root, 'scripts/verify-dev-134-pwa-recovery-browser.pw.js'), 'utf8')
    .replaceAll('__ORIGIN__', origin).replaceAll('__VERSION_A__', `release:${versions.A}`).replaceAll('__VERSION_B__', `release:${versions.B}`).replaceAll('__VERSION_L__', legacyVersion)
    .replaceAll('__VISUALS__', visuals.replaceAll('\\', '/'));
  const code = boundCode.replaceAll('__DEV134_MODE__', 'standard');
  const codePath = path.join(fixture, 'run.pw.js'); fs.writeFileSync(codePath, code);
  const executed = await runCli(runtime.sessions.standard, ['run-code', `--filename=${codePath}`]);
  fs.writeFileSync(path.join(output, 'browser-run.txt'), executed.output);
  const match = executed.output.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!match || executed.code !== 0 || executed.output.includes('### Error')) throw new Error('Browser verification failed: ' + executed.output.slice(-2500));
  Object.assign(report, JSON.parse(match[1]));
  const operationCodePath = path.join(fixture, 'run-operations.pw.js');
  fs.writeFileSync(operationCodePath, boundCode.replaceAll('__DEV134_MODE__', 'u-operations'));
  const operationExecuted = await runCli(runtime.sessions.standard, ['run-code', `--filename=${operationCodePath}`]);
  fs.writeFileSync(path.join(output, 'browser-operations-run.txt'), operationExecuted.output);
  const operationMatch = operationExecuted.output.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!operationMatch || operationExecuted.code !== 0 || operationExecuted.output.includes('### Error')) throw new Error('Update operations browser verification failed: ' + operationExecuted.output.slice(-2500));
  const operationReport = JSON.parse(operationMatch[1]);
  report.results.push(...operationReport.results);
  report.diagnostics.push(...(operationReport.diagnostics || []));
  const u09CodePath = path.join(fixture, 'run-u09.pw.js');
  fs.writeFileSync(u09CodePath, boundCode.replaceAll('__DEV134_MODE__', 'u09'));
  const u09Executed = await runCli(runtime.sessions.standard, ['run-code', `--filename=${u09CodePath}`]);
  fs.writeFileSync(path.join(output, 'browser-u09-run.txt'), u09Executed.output);
  const u09Match = u09Executed.output.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!u09Match || u09Executed.code !== 0 || u09Executed.output.includes('### Error')) throw new Error('U09 browser verification failed: ' + u09Executed.output.slice(-2500));
  const u09Report = JSON.parse(u09Match[1]);
  report.results.push(...u09Report.results);
  report.diagnostics.push(...(u09Report.diagnostics || []));
  report.u09 = { ...u09Report.u09, legacyProvenance };
  const standardClose = await runCli(runtime.sessions.standard, ['close']);
  runtime.standardBrowserClosed = standardClose.code === 0 && !standardClose.output.includes('### Error');

  const u06Opened = await runCli(runtime.sessions.u06, ['open', origin], u06ConfigPath);
  runtime.u06ActualArgv = [cli, '-s', runtime.sessions.u06, 'open', origin, '--config', u06ConfigPath];
  if (u06Opened.code !== 0 || u06Opened.output.includes('### Error')) throw new Error('U06 configured Playwright session open failed: ' + u06Opened.output.slice(-1200));
  runtime.u06ProcessTree = readOwnedProcessTree(runtime.sessions.u06);
  const u06Code = boundCode.replaceAll('__DEV134_MODE__', 'u06');
  const u06CodePath = path.join(fixture, 'run-u06.pw.js'); fs.writeFileSync(u06CodePath, u06Code);
  const u06Executed = await runCli(runtime.sessions.u06, ['run-code', `--filename=${u06CodePath}`], u06ConfigPath);
  fs.writeFileSync(path.join(output, 'browser-u06-run.txt'), u06Executed.output);
  const u06Match = u06Executed.output.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!u06Match || u06Executed.code !== 0 || u06Executed.output.includes('### Error')) throw new Error('U06 browser verification failed: ' + u06Executed.output.slice(-2500));
  const u06Report = JSON.parse(u06Match[1]);
  report.results.push(...u06Report.results);
  report.diagnostics.push(...(u06Report.diagnostics || []));
  report.u06 = { ...u06Report.u06, config: u06Config, configSha256: u06ConfigSha256, argv: runtime.u06ActualArgv, cliVersion: cliVersion.output.trim(), cliHelp: cliHelp.output.trim(), processTree:runtime.u06ProcessTree };
  const u06Close = await runCli(runtime.sessions.u06, ['close'], u06ConfigPath);
  runtime.u06BrowserClosed = u06Close.code === 0 && !u06Close.output.includes('### Error');
  report.fixture = { auth: 'SIMULATION inert local identity only', migration: 'SIMULATION skipped migration precondition only', mainLayout: 'REAL AuthGate/MainLayout/HomeView/SettingsView and AppMoreMenu', quickTask: 'REAL /quick-task/ entry, install menu, form, IndexedDB outbox and update service' };
  report.boundary = 'Isolated local A/B Workbox builds. Auth/login identity and migration precondition are SIMULATION; update service, prompt, MainLayout, AppMoreMenu, Quick Task form/menu and worker are real. No remote account/backend mutation.';
} catch (error) {
  report.fatalError = error.message;
  report.fatalStack = error.stack;
} finally {
  for (const session of Object.values(runtime.sessions)) {
    try {
      const closed = await runCli(session, ['close'], session === runtime.sessions.u06 ? u06ConfigPath : null);
      runtime[session === runtime.sessions.u06 ? 'u06BrowserClosed' : 'standardBrowserClosed'] ??= closed.code === 0 && !closed.output.includes('### Error');
    } catch (error) { runtime.cleanupErrors ??= []; runtime.cleanupErrors.push(`${session}: ${error.message}`); }
  }
  runtime.browserClosed = runtime.standardBrowserClosed === true && runtime.u06BrowserClosed === true;
  await new Promise(resolve => server.close(resolve));
  try { await fetch(origin, { signal: AbortSignal.timeout(2000) }); runtime.portReleased = false; }
  catch { runtime.portReleased = true; }
  report.source = source;
  report.sourceAfter = Object.fromEntries(sourceFiles.map(file => {
    try { return [file,digest(file)]; }
    catch(error) { return [file,{error:error.message}]; }
  }));
  report.sourceUnchanged = sourceFiles.every(file => report.sourceAfter[file] === source[file]);
  report.requests = requests;
  report.artifacts = Object.fromEntries(Object.entries(versions).map(([label, version]) => {
    const base = path.join(fixture, label);
    if (!fs.existsSync(base)) return [label,{version,available:false,files:[]}];
    const files = [];
    const visit = directory => { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file=path.join(directory,item.name); if(item.isDirectory()) visit(file); else { const body=fs.readFileSync(file); files.push({path:path.relative(base,file).replaceAll(path.sep,'/'),bytes:body.byteLength,sha256:createHash('sha256').update(body).digest('hex')}); } } };
    visit(base); return [label,{version,available:true,files}];
  }));
  fs.writeFileSync(path.join(output, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
}
report.cleanup = runtime;
report.ok = !report.fatalError && report.results.every(item => item.ok) && report.sourceUnchanged && runtime.browserClosed && runtime.portReleased
  && runtime.u06ProcessTree?.actualChromiumArgvCaptured===true
  && runtime.u06ProcessTree?.disabledBackForwardCacheFlagPresent===false;
fs.writeFileSync(path.join(output, 'browser-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, results: report.results, cleanup: { browserClosed: runtime.browserClosed, portReleased: runtime.portReleased } }, null, 2));
if (!report.ok) process.exitCode = 1;
