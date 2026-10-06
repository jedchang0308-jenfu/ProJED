import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'vite';

const root = path.resolve(process.cwd());
const runId = randomUUID();
const output = path.resolve(
  process.env.DEV134_REPORT_DIR ??
    path.join(root, 'output', 'qa', 'dev-134', `quick-task-update-prompt-${runId}`),
);
const visuals = path.resolve(process.env.DEV134_VISUALS_DIR ?? path.join(output, 'visuals'));
const cliValue = process.env.PLAYWRIGHT_CLI_PATH;
const cliPath = cliValue ? path.resolve(cliValue) : null;
const session = `dev134-quick-task-update-prompt-${runId}`;
const sessionDir = path.join(output, 'playwright-session');
const cliInvocations = [];
const pwSourcePath = path.join(root, 'scripts', 'verify-dev-134-quick-task-update-prompt.pw.js');
const generatedPwPath = path.join(output, 'quick-task-update-prompt.run.pw.js');
const runtimePath = path.join(output, 'runtime.json');
const resultPath = path.join(output, 'result.json');
const sourcePaths = [
  'scripts/verify-dev-134-quick-task-update-prompt.mjs',
  'scripts/verify-dev-134-quick-task-update-prompt.pw.js',
  'scripts/fixtures/dev-134-quick-task-update-prompt.html',
  'src/features/quickTaskCapture/install.ts',
  'src/features/quickTaskCapture/pwaUpdatePrompt.ts',
  'src/services/pwaUpdatePresentation.ts',
  'src/services/pwaUpdateService.ts',
  'src/quickTask/quick-task.css',
];
const servedPaths = [
  '/scripts/fixtures/dev-134-quick-task-update-prompt.html',
  '/src/features/quickTaskCapture/install.ts',
  '/src/features/quickTaskCapture/pwaUpdatePrompt.ts',
  '/src/services/pwaUpdatePresentation.ts',
  '/src/services/pwaUpdateService.ts',
  '/src/quickTask/quick-task.css',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function snapshotSources() {
  return Object.fromEntries(sourcePaths.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Required frozen source is missing: ${relativePath}`);
    }
    return [relativePath, sha256(fs.readFileSync(absolutePath))];
  }));
}

function writeJson(targetPath, value) {
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, '-s', session, ...args], {
      cwd: root,
      env: {
        ...process.env,
        PWTEST_DAEMON_SESSION_DIR: sessionDir,
        DEV134_REPORT_DIR: output,
        DEV134_VISUALS_DIR: visuals,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const invocation = {
      processId: child.pid ?? null,
      args: ['-s', session, ...args],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      killRequested: false,
    };
    cliInvocations.push(invocation);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      invocation.killRequested = true;
      child.kill();
      reject(new Error(`playwright-cli timed out: ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      invocation.finishedAt = new Date().toISOString();
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      invocation.finishedAt = new Date().toISOString();
      invocation.exitCode = code;
      invocation.signal = signal;
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function hashServedBytes(origin, entries = {}) {
  // Allow cold Vite transforms to settle; this does not change the browser assertion limits.
  let currentRoute = null;
  try {
    for (const route of servedPaths) {
      currentRoute = route;
      try {
        const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(30_000) });
        const body = Buffer.from(await response.arrayBuffer());
        entries[route] = {
          status: response.status,
          contentType: response.headers.get('content-type'),
          byteLength: body.byteLength,
          sha256: sha256(body),
        };
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        entries[route] ??= {
          status: null,
          contentType: null,
          byteLength: null,
          sha256: null,
          error: error instanceof Error ? error.message : String(error),
        };
        throw error;
      }
    }
  } catch (error) {
    const causeMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Served-byte hashing failed at route ${currentRoute}; retained ${Object.keys(entries).length} route record(s): ${causeMessage}`,
      { cause: error },
    );
  }
  return entries;
}

function listenOnRandomPort(httpServer, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { httpServer.close(); } catch { /* The listener may not have opened yet. */ }
      reject(new Error(`Vite HTTP listener did not start within ${timeoutMs}ms.`));
    }, timeoutMs);
    const onError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      httpServer.removeListener('listening', onListening);
      httpServer.removeListener('error', onError);
      reject(error);
    };
    const onListening = () => {
      if (settled) {
        try { httpServer.close(); } catch { /* A timed-out late listener must not remain open. */ }
        return;
      }
      settled = true;
      clearTimeout(timer);
      httpServer.removeListener('error', onError);
      resolve();
    };
    httpServer.once('listening', onListening);
    httpServer.on('error', onError);
    try {
      httpServer.listen(0, '127.0.0.1');
    } catch (error) {
      onError(error);
    }
  });
}

if (!cliPath) {
  throw new Error(
    'PLAYWRIGHT_CLI_PATH is required. Set it to the installed playwright-cli.js; this verifier does not install dependencies.',
  );
}
if (!fs.existsSync(cliPath)) {
  throw new Error(
    `PLAYWRIGHT_CLI_PATH does not exist: ${cliPath}. Set it to the installed playwright-cli.js; this verifier does not install dependencies.`,
  );
}

fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(visuals, { recursive: true });
fs.mkdirSync(sessionDir, { recursive: true });

const cliVersionRun = spawnSync(process.execPath, [cliPath, '--version'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 10_000,
  windowsHide: true,
});
const cliVersion = `${cliVersionRun.stdout ?? ''}${cliVersionRun.stderr ?? ''}`.trim();
const frozenBefore = snapshotSources();
const pwSource = fs.readFileSync(pwSourcePath, 'utf8');
if (!pwSource.includes('__DEV134_VISUALS_DIR__')) {
  throw new Error('The Playwright fixture runner is missing its visuals directory token.');
}
const generatedPw = pwSource.replaceAll('__DEV134_VISUALS_DIR__', JSON.stringify(visuals));
fs.writeFileSync(generatedPwPath, generatedPw, 'utf8');

const runtime = {
  schemaVersion: 1,
  runId,
  project: root,
  purpose: 'DEV-134 quick task update prompt renderer fixture verification',
  scope: 'renderer fixture only; not the normal Quick Task entry point or a real U06 lifecycle proof',
  startedAt: new Date().toISOString(),
  owner: {
    processId: process.pid,
    command: process.argv.join(' '),
    playwrightCliSession: session,
    sessionDirectory: sessionDir,
    cliInvocations,
  },
  directories: { report: output, visuals },
  playwright: {
    cliPath,
    cliVersion: cliVersion || null,
    cliVersionExitCode: cliVersionRun.status,
    browserVersion: null,
    browserUserAgent: null,
  },
  frozenSources: { algorithm: 'SHA-256', before: frozenBefore, after: null, unchanged: null },
  generatedRunner: {
    path: generatedPwPath,
    sha256: sha256(Buffer.from(generatedPw, 'utf8')),
  },
  servedBytes: null,
  runtime: {
    host: '127.0.0.1',
    portRequested: 0,
    portAssignment: 'OS-assigned ephemeral port from Vite HTTP server.listen(0, 127.0.0.1)',
    port: null,
    serverStartAttempted: false,
    serverStarted: false,
    serverClosed: null,
    browserSessionOpenAttempted: false,
    browserSessionClosed: null,
    portReleased: null,
    cleanupComplete: null,
    cleanupCondition: 'close only this run’s random Playwright session and Vite server; verify the assigned port is released',
  },
};

const result = {
  ok: false,
  runId,
  fixtureOnly: true,
  simulationOnly: false,
  simulationState: null,
  normalU02InstallFlowVerified: false,
  normalQuickTaskEntryPointVerified: false,
  realU06LifecycleVerified: false,
  checks: [],
  errors: [],
  screenshot: path.join(visuals, 'dev134-quick-task-prompt-320x844.png'),
};
let viteServer = null;
let origin = null;
let sessionOpenAttempted = false;
let cliRunFailed = false;
writeJson(runtimePath, runtime);

try {
  const viteConfig = await createServer({
    configFile: path.join(root, 'vite.config.js'),
    configLoader: 'native',
    mode: 'test',
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, open: false },
  });
  viteServer = viteConfig;
  runtime.runtime.serverStartAttempted = true;
  writeJson(runtimePath, runtime);
  if (!viteServer.httpServer) throw new Error('Vite did not provide its HTTP server.');
  await listenOnRandomPort(viteServer.httpServer);
  const address = viteServer.httpServer?.address();
  if (!address || typeof address === 'string' || !Number.isInteger(address.port) || address.port < 1) {
    throw new Error('Vite did not provide a valid OS-assigned TCP port.');
  }
  origin = `http://127.0.0.1:${address.port}`;
  runtime.runtime.port = address.port;
  runtime.runtime.serverStarted = true;
  writeJson(runtimePath, runtime);

  runtime.servedBytes = {};
  await hashServedBytes(origin, runtime.servedBytes);

  sessionOpenAttempted = true;
  runtime.runtime.browserSessionOpenAttempted = true;
  writeJson(runtimePath, runtime);
  const openResult = await runCli(['open', `${origin}/scripts/fixtures/dev-134-quick-task-update-prompt.html`]);
  if (openResult.code !== 0 || `${openResult.stdout}${openResult.stderr}`.includes('### Error')) {
    cliRunFailed = true;
    throw new Error(`playwright-cli open failed (exit ${openResult.code}): ${openResult.stderr || openResult.stdout}`);
  }

  const snapshotResult = await runCli(['snapshot']);
  if (snapshotResult.code !== 0 || `${snapshotResult.stdout}${snapshotResult.stderr}`.includes('### Error')) {
    cliRunFailed = true;
    throw new Error(`playwright-cli snapshot failed (exit ${snapshotResult.code}): ${snapshotResult.stderr || snapshotResult.stdout}`);
  }

  const codeResult = await runCli(['run-code', `--filename=${generatedPwPath}`]);
  const codeOutput = `${codeResult.stdout}${codeResult.stderr}`;
  fs.writeFileSync(path.join(output, 'browser.log'), codeOutput, 'utf8');
  if (codeResult.code !== 0 || codeOutput.includes('### Error')) {
    cliRunFailed = true;
    throw new Error(`playwright-cli run-code failed (exit ${codeResult.code}): ${codeResult.stderr || codeResult.stdout}`);
  }
  const reportMatch = codeOutput.match(/### Result\s*([\s\S]*?)\s*### Ran Playwright code/);
  if (!reportMatch) throw new Error('The fixture runner did not emit its structured report.');
  const browserReport = JSON.parse(reportMatch[1]);
  result.checks = browserReport.checks ?? [];
  result.errors = browserReport.errors ?? [];
  runtime.playwright.browserVersion = browserReport.browserVersion ?? null;
  runtime.playwright.browserUserAgent = browserReport.browserUserAgent ?? null;
  result.browser = {
    version: runtime.playwright.browserVersion,
    userAgent: runtime.playwright.browserUserAgent,
  };
  result.viewport = browserReport.viewport ?? null;
  result.screenshot = browserReport.screenshot ?? result.screenshot;
  result.fixtureOnly = browserReport.fixtureOnly === true;
  result.simulationOnly = browserReport.simulationOnly === true;
  result.simulationState = browserReport.simulationState ?? null;
  result.normalU02InstallFlowVerified = browserReport.normalU02InstallFlowVerified === true;
  result.normalQuickTaskEntryPointVerified = browserReport.normalQuickTaskEntryPointVerified === true;
  result.realU06LifecycleVerified = browserReport.realU06LifecycleVerified === true;
  if (result.fixtureOnly !== true || result.simulationOnly !== true || result.simulationState?.mode !== 'SIMULATION'
    || result.normalU02InstallFlowVerified || result.normalQuickTaskEntryPointVerified || result.realU06LifecycleVerified) {
    result.errors.push('Fixture scope metadata was absent or overstated the verification scope.');
  }
  if (!runtime.playwright.browserVersion) result.errors.push('The browser did not report a version.');
  if (result.checks.length === 0) result.errors.push('The fixture runner reported no checks.');
  if (!fs.existsSync(result.screenshot)) result.errors.push('The fixture runner did not create its screenshot.');
  result.ok = result.errors.length === 0 && result.checks.every((check) => check.ok === true);
} catch (error) {
  result.errors.push(error instanceof Error ? error.message : String(error));
  cliRunFailed = true;
} finally {
  if (sessionOpenAttempted) {
    try {
      const closeResult = await runCli(['close'], { timeoutMs: 30_000 });
      const closeOutput = `${closeResult.stdout}${closeResult.stderr}`;
      runtime.runtime.browserSessionClosed = closeResult.code === 0 && !closeOutput.includes('### Error');
      if (!runtime.runtime.browserSessionClosed) {
        cliRunFailed = true;
        result.errors.push(`playwright-cli close failed (exit ${closeResult.code}): ${closeResult.stderr || closeResult.stdout}`);
      }
    } catch (error) {
      runtime.runtime.browserSessionClosed = false;
      cliRunFailed = true;
      result.errors.push(`playwright-cli close failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (viteServer) {
    try {
      await viteServer.close();
      runtime.runtime.serverClosed = true;
    } catch (error) {
      runtime.runtime.serverClosed = false;
      result.errors.push(`Vite server cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (origin && runtime.runtime.port !== null) {
    try {
      await fetch(origin, { signal: AbortSignal.timeout(1_500) });
      runtime.runtime.portReleased = false;
    } catch {
      runtime.runtime.portReleased = true;
    }
    if (!runtime.runtime.portReleased) result.errors.push(`Task-owned server port ${runtime.runtime.port} is still accepting HTTP requests.`);
  }

  try {
    const frozenAfter = snapshotSources();
    runtime.frozenSources.after = frozenAfter;
    runtime.frozenSources.unchanged = JSON.stringify(frozenBefore) === JSON.stringify(frozenAfter);
    if (!runtime.frozenSources.unchanged) result.errors.push('A frozen source file changed while the verifier was running.');
  } catch (error) {
    runtime.frozenSources.unchanged = false;
    result.errors.push(`Could not verify frozen sources after the run: ${error instanceof Error ? error.message : String(error)}`);
  }

  runtime.runtime.cleanupComplete =
    (!runtime.runtime.serverStartAttempted ||
      (runtime.runtime.serverClosed === true && (!runtime.runtime.serverStarted || runtime.runtime.portReleased === true))) &&
    (!sessionOpenAttempted || runtime.runtime.browserSessionClosed === true);
  if (!runtime.runtime.cleanupComplete) result.errors.push('One or more run-owned runtime resources were not confirmed closed.');
  if (cliRunFailed) result.ok = false;
  result.ok = result.ok && result.errors.length === 0;
  runtime.finishedAt = new Date().toISOString();
  runtime.result = { ok: result.ok, errorCount: result.errors.length, checkCount: result.checks.length };
  result.runtimeReceipt = runtimePath;
  result.frozenSources = runtime.frozenSources;
  result.servedBytes = runtime.servedBytes;
  writeJson(runtimePath, runtime);
  writeJson(resultPath, result);
}

console.log(JSON.stringify({ ...result, resultPath, runtimePath }, null, 2));
if (!result.ok) process.exitCode = 1;
