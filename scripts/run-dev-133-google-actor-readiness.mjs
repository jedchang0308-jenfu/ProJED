import { createServer } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { distinctReadyActors, testProjectRef } from './dev133-test-actor-support.mjs';

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const callback = `${origin}/quick-task/`;

async function managementToken(root) {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  // Exact management credential source explicitly authorized by the user.
  // It is used only for TEST callback configuration, never as an actor session.
  const text = await readFile(path.join(root, '.env.p8.local'), 'utf8');
  const match = text.match(/^(?:export\s+|\$env:)?SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/mu);
  if (!match) throw new Error('TEST_MANAGEMENT_TOKEN_UNAVAILABLE');
  const value = match[1].trim();
  return /^(['"]).*\1$/u.test(value) ? value.slice(1, -1) : value;
}

export async function runGoogleActorReadiness({ supabaseUrl, anonKey, expectedEmail, actorA, output }) {
  const root = process.cwd();
  const artifactDir = path.join(root, 'output/qa/dev-133/independent-auth/google-actor-readiness');
  await mkdir(artifactDir, { recursive: true });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'projed-dev133-google-'));
  const profile = path.join(tempRoot, 'chrome-profile');
  const emptyEnv = path.join(tempRoot, 'env');
  await mkdir(emptyEnv);
  const reportKey = randomUUID();
  const lifecycle = { project: 'ProJED', purpose: 'DEV-133 ordinary Google actor B readiness', port, runnerPid: process.pid, browserPid: null, cleanupCondition: 'result, browser close, SIGINT, SIGTERM or 15-minute timeout', status: 'preparing' };
  const writeLifecycle = () => writeFile(path.join(artifactDir, 'runtime.json'), `${JSON.stringify(lifecycle, null, 2)}\n`);
  await writeLifecycle();
  let vite;
  let browser;
  let timeout;
  let resolveDone;
  let token;
  let callbackAdded = false;
  let baselineAllowlist;
  let patchedAllowlist;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const requestConfig = async body => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${testProjectRef}/config/auth`, {
      method: body ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('TEST_CALLBACK_CONFIG_REQUEST_FAILED');
    return response.json();
  };
  const stop = () => resolveDone('cancelled');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const plugin = {
      name: 'dev133-google-readiness-only',
      transformIndexHtml(html, context) {
        if (!context.filename.replaceAll('\\', '/').endsWith('/quick-task/index.html')) return html;
        return html.replace('</body>', '<script type="module" src="/__dev133_actor_probe.js"></script></body>');
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/__dev133_actor_probe.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(`
              import { supabase } from '/src/services/supabase/client.ts';
              import { inspectTestActor } from '/scripts/dev133-actor-probe.mjs';
              const banner = document.createElement('p');
              banner.textContent = 'DEV-133 TEST：請按下方「登入」，選擇指定的 Google 帳號。此頁只驗證登入及既有工作台，不建立任務。';
              banner.style.cssText = 'background:#fff3cd;color:#664d03;padding:12px;border-radius:12px;margin:0 0 16px';
              document.querySelector('main').prepend(banner);
              let busy = false, reported = false;
              async function probe() {
                if (busy || reported) return;
                busy = true;
                try {
                  const { data } = await supabase.auth.getSession();
                  if (!data.session) return;
                  const result = await inspectTestActor(supabase, 'B', ${JSON.stringify(expectedEmail)}, data.session.access_token);
                  if (!result.actor.ready) {
                    banner.textContent = result.actor.reason === 'unexpected-test-account'
                      ? 'DEV-133 TEST：目前登入帳號不是指定的測試帳號，請登出此 App 後重新選擇。'
                      : 'DEV-133 TEST：登入後的資料檢查未通過，請保留視窗供查證。';
                    return;
                  }
                  const response = await fetch('/__dev133_actor_result', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DEV133-Report': ${JSON.stringify(reportKey)} }, body: JSON.stringify(result) });
                  reported = response.ok;
                  if (reported) banner.textContent = 'DEV-133 TEST：第二個帳號核身及工作台檢查通過。';
                } finally { busy = false; }
              }
              supabase.auth.onAuthStateChange(() => setTimeout(probe, 0));
              setInterval(probe, 3000);
              probe();
            `);
          }
          if (req.url !== '/__dev133_actor_result') return next();
          if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-dev133-report'] !== reportKey) {
            res.statusCode = 403;
            return res.end();
          }
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 2048) { res.statusCode = 413; return res.end(); }
          }
          try {
            const received = JSON.parse(body);
            const candidate = received.actor;
            const actor = { alias: 'B', authenticated: candidate.authenticated === true, profile: candidate.profile === true,
              activeMembershipCount: Number(candidate.activeMembershipCount), workbenchRowCount: Number(candidate.workbenchRowCount), ready: false };
            actor.ready = actor.authenticated && actor.profile && Number.isInteger(actor.activeMembershipCount)
              && actor.activeMembershipCount > 0 && actor.workbenchRowCount === 1;
            const accountId = typeof received.accountId === 'string' && /^[0-9a-f-]{36}$/u.test(received.accountId) ? received.accountId : null;
            const passed = distinctReadyActors([actorA, { actor, accountId }]);
            output.actors = [actorA.actor, actor];
            output.status = passed ? 'PASS' : 'BLOCKED';
            output.checks.push({ name: 'distinct-ordinary-session-readiness', status: output.status, evidence: 'A password Auth and B normal quick UI Google callback, getUser, profile, membership and nonempty workbench' });
            res.statusCode = passed ? 200 : 409;
            res.end();
            resolveDone('result');
          } catch { res.statusCode = 400; res.end(); }
        });
      },
    };
    vite = await createServer({
      configFile: path.join(root, 'vite.config.js'), configLoader: 'runner', mode: 'test',
      envDir: emptyEnv, envPrefix: 'DEV133_BROWSER_PUBLIC_',
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
        'import.meta.env.VITE_SUPABASE_AUTH_MODE': JSON.stringify('oauth-google'),
        'import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN': JSON.stringify('false'),
        'import.meta.env.VITE_SUPABASE_TEST_EMAIL': JSON.stringify(''),
        'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify(''),
      },
      server: { host: '127.0.0.1', port, strictPort: true, open: false },
      plugins: [plugin], logLevel: 'silent',
    });
    await vite.listen();
    token = await managementToken(root);
    const config = await requestConfig();
    if (!config.external_google_enabled) throw new Error('TEST_GOOGLE_PROVIDER_UNAVAILABLE');
    baselineAllowlist = config.uri_allow_list || '';
    if (!baselineAllowlist.split(',').map(value => value.trim()).includes(callback)) {
      patchedAllowlist = [baselineAllowlist, callback].filter(Boolean).join(',');
      callbackAdded = true;
      await requestConfig({ uri_allow_list: patchedAllowlist });
      const readback = await requestConfig();
      if (!readback.uri_allow_list.split(',').map(value => value.trim()).includes(callback)) throw new Error('TEST_CALLBACK_READBACK_FAILED');
    }
    browser = spawn(process.env.DEV133_CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--new-window', callback],
      { stdio: 'ignore', windowsHide: false });
    browser.once('error', () => resolveDone('browser-launch-failed'));
    browser.once('exit', () => resolveDone('browser-closed'));
    lifecycle.browserPid = browser.pid ?? null;
    lifecycle.status = 'awaiting-user-google-login';
    await writeLifecycle();
    console.log(JSON.stringify({ status: 'AWAITING_GOOGLE_LOGIN', actor: 'B', projectRef: testProjectRef, route: callback, browserPid: lifecycle.browserPid }));
    timeout = setTimeout(() => resolveDone('login-timeout'), 15 * 60 * 1000);
    const endReason = await done;
    if (endReason !== 'result') output.checks.push({ name: 'google-login', status: 'BLOCKED', reason: endReason });
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (browser?.pid && browser.exitCode === null) {
      const escapedProfile = profile.replaceAll("'", "''");
      const command = `$taskBrowser = Get-CimInstance Win32_Process -Filter 'ProcessId=${browser.pid}'; if ($taskBrowser -and $taskBrowser.Name -eq 'chrome.exe' -and $taskBrowser.CommandLine.Contains('${escapedProfile}')) { & taskkill.exe /PID ${browser.pid} /T /F | Out-Null }`;
      const stopped = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'ignore', windowsHide: true });
      lifecycle.browserCleanup = stopped.status === 0 ? 'task-owned-tree-stopped-or-already-exited' : 'unconfirmed';
    }
    if (vite) await vite.close();
    if (callbackAdded) {
      try {
        const current = await requestConfig();
        const desired = current.uri_allow_list === patchedAllowlist ? baselineAllowlist
          : current.uri_allow_list.split(',').filter(value => value.trim() !== callback).join(',');
        await requestConfig({ uri_allow_list: desired });
        const readback = await requestConfig();
        lifecycle.callbackCleanup = readback.uri_allow_list === desired ? 'restored-and-read-back' : 'unconfirmed';
      } catch { lifecycle.callbackCleanup = 'unconfirmed'; }
    } else lifecycle.callbackCleanup = 'no-config-change';
    // The fresh profile contains a test Session; remove only our generated root.
    if (path.dirname(tempRoot) === path.resolve(os.tmpdir()) && path.basename(tempRoot).startsWith('projed-dev133-google-')) {
      await rm(tempRoot, { recursive: true, force: true })
        .then(() => { lifecycle.profileCleanup = 'removed'; })
        .catch(() => { lifecycle.profileCleanup = 'unconfirmed'; });
    }
    lifecycle.status = 'stopped';
    await writeLifecycle();
    if (lifecycle.callbackCleanup === 'unconfirmed' || lifecycle.profileCleanup === 'unconfirmed' || lifecycle.browserCleanup === 'unconfirmed') {
      output.status = 'BLOCKED';
      output.checks.push({ name: 'runtime-cleanup', status: 'BLOCKED', reason: 'cleanup-requires-readback' });
    }
    await writeFile(path.join(artifactDir, 'result.json'), `${JSON.stringify(output, null, 2)}\n`);
  }
}
