import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ALLOW_ENV = 'DEV122_ALLOW_PRODUCTION_FIXTURE';
const RUN_FLAG = '--allow-production-fixture';
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const targetUrl = valueAfter('--target-url');
const expectedReleaseId = valueAfter('--release-id');
const artifactPath = path.resolve(valueAfter('--artifact') ?? 'output/qa/dev-122/production-same-account-result.json');

if (process.env[ALLOW_ENV] !== '1' || !args.includes(RUN_FLAG)) {
  throw new Error(`Refusing production fixture smoke. Set ${ALLOW_ENV}=1 and pass ${RUN_FLAG} explicitly.`);
}
if (!targetUrl || !expectedReleaseId) {
  throw new Error('DEV-122 production fixture smoke requires --target-url and --release-id.');
}

const target = new URL(targetUrl);
const allowedHosts = new Set([
  'projed-cc78d.web.app',
  'projed-cc78d--production-candidate-tsxgwy67.web.app',
]);
if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) {
  throw new Error(`DEV-122 production fixture target is not allowlisted: ${target.origin}`);
}
const targetOrigin = target.origin;

const parseEnvFile = file => {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/gu, '');
  }
  return env;
};

const quoteWindowsArg = value => {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/gu, '\\"')}"`;
};

const run = (command, commandArgs) => new Promise(resolve => {
  const childCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const childArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...commandArgs].map(quoteWindowsArg).join(' ')]
    : commandArgs;
  const child = spawn(childCommand, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

const extractJsonObjectAt = (source, start) => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return null;
};

const parsePlaywrightJson = stdout => {
  const starts = [];
  const marker = /\{\s*"result"\s*:/gu;
  let match = marker.exec(stdout);
  while (match) {
    starts.push(match.index);
    match = marker.exec(stdout);
  }
  let parsed = null;
  for (const start of starts.reverse()) {
    const candidate = extractJsonObjectAt(stdout, start);
    if (!candidate) continue;
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Try an older structured payload.
    }
  }
  if (!parsed) throw new Error('Playwright did not return a structured artifact.');
  parsed = parsed.result;
  for (let index = 0; index < 4 && typeof parsed === 'string'; index += 1) parsed = JSON.parse(parsed);
  return parsed;
};

const playwrightErrorSummary = (stdout, stderr) => {
  const combined = `${stdout}\n${stderr}`;
  const marker = combined.lastIndexOf('### Error');
  if (marker >= 0) {
    const lines = combined.slice(marker + '### Error'.length).split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    return (lines[0] ?? 'unknown Playwright error').slice(0, 500);
  }
  const safeError = combined.match(/[^\r\n]*(?:Timeout|timed out|strict mode violation|waiting for locator|SyntaxError|ReferenceError|TypeError|Error:)[^\r\n]*/giu)?.at(-1);
  return (safeError ?? 'no Playwright error summary').slice(0, 500);
};

const assertData = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const production = parseEnvFile('.env.production');
const privileged = parseEnvFile('.env.p8.local');
const supabaseUrl = production.VITE_SUPABASE_URL;
const supabaseAnonKey = production.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = privileged.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing production Supabase smoke credentials.');
}
if (new URL(supabaseUrl).hostname.split('.')[0] !== 'knodlkxqpcqyrtgwpdst') {
  throw new Error('DEV-122 production fixture resolved to the wrong Supabase project.');
}

const releaseResponse = await fetch(`${targetOrigin}/release-meta.json?dev083ReleaseId=${encodeURIComponent(expectedReleaseId)}`, { cache: 'no-store' });
if (!releaseResponse.ok) throw new Error(`Release metadata is unavailable at ${targetOrigin}.`);
const releaseMeta = await releaseResponse.json();
if (releaseMeta.releaseId !== expectedReleaseId) {
  throw new Error(`Release identity mismatch: expected ${expectedReleaseId}, received ${releaseMeta.releaseId ?? 'missing'}.`);
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `dev122-prod-${suffix}@example.invalid`;
const password = `Dev122-${suffix}-Aa1!`;
const title = `DEV-122 正式快速待辦 ${suffix}`;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const outputDir = path.dirname(artifactPath);
mkdirSync(outputDir, { recursive: true });
mkdirSync('tmp', { recursive: true });
const sessionName = `dev122-prod-${suffix}`;
const smokeFile = path.join('tmp', `dev122-production-same-account-${suffix}.pw.js`);
const screenshotPath = path.resolve(outputDir, `${target.hostname.includes('production-candidate') ? 'production-candidate' : 'production-live'}-same-account-390x844.png`);
let userId = null;
let tenantId = null;
let captureId = null;
let browser = null;
let readback = null;
let mainError = null;
const cleanup = {
  browserClosed: false,
  taskDeleted: false,
  tenantDeleted: false,
  profileDeleted: false,
  userDeleted: false,
  residualTaskCount: null,
  residualProfileCount: null,
  residualTenantCount: null,
};

try {
  const created = assertData('admin.createUser', await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'DEV-122 Production Same Account Smoke' },
  }));
  userId = created.user.id;
  const signIn = assertData('signInWithPassword', await userClient.auth.signInWithPassword({ email, password }));
  assertData('profile upsert', await userClient.from('profiles').upsert({
    id: userId,
    email,
    display_name: 'DEV-122 Production Same Account Smoke',
  }).select().single());
  const tenant = assertData('create_tenant_with_owner', await userClient.rpc('create_tenant_with_owner', {
    tenant_name: `DEV-122 Production Smoke ${suffix}`,
  }));
  tenantId = tenant.id;

  const payload = {
    targetOrigin,
    storageKey,
    session: signIn.session,
    expectedUserId: userId,
    title,
    screenshotPath: screenshotPath.replace(/\\/gu, '/'),
  };
  const browserCode = String.raw`
async (page) => {
  const payload = __DEV122_PAYLOAD__;
  const businessRequests = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('request', request => {
    if (/\/rest\/v1\/|\/graphql|\/api\//u.test(request.url())) {
      businessRequests.push({ method: request.method(), url: request.url() });
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || null }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(payload.targetOrigin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: payload.storageKey,
    session: payload.session,
  });
  await page.reload({ waitUntil: 'networkidle' });
  const titleInput = page.getByRole('textbox', { name: '任務名稱' });
  const voice = page.getByRole('button', { name: '使用語音輸入任務名稱' });
  await titleInput.waitFor({ state: 'visible', timeout: 15000 });
  await voice.waitFor({ state: 'visible', timeout: 15000 });
  const quickAccountId = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id || null, payload.storageKey);
  const requestsBeforeSubmit = [...businessRequests];
  await titleInput.fill(payload.title);
  await page.getByRole('button', { name: '建立' }).click();
  await page.getByText('已建立', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const localRecords = await page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('projed-quick-task-v1');
    open.onsuccess = () => {
      const request = open.result.transaction('captures').objectStore('captures').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    };
    open.onerror = () => resolve([]);
  }));
  const record = localRecords.find(item => item.title === payload.title);
  const quickRpcRequests = businessRequests.filter(item => item.url.includes('/rest/v1/rpc/create_quick_unplaced_task_v1'));
  await page.getByRole('button', { name: '前往工作台' }).click();
  await page.waitForURL(url => url.origin === payload.targetOrigin && url.pathname === '/', { timeout: 30000 });
  const panel = page.locator('[data-task-workbench-panel="true"]');
  await panel.waitFor({ state: 'visible', timeout: 30000 });
  const matchingCards = panel.locator('[data-task-workbench-unplaced-task-card="true"]', { hasText: payload.title });
  await matchingCards.first().waitFor({ state: 'visible', timeout: 30000 });
  const rootAccountId = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id || null, payload.storageKey);
  await page.screenshot({ path: payload.screenshotPath, fullPage: true });
  const result = {
    ok: requestsBeforeSubmit.length === 0
      && quickRpcRequests.length === 1
      && Boolean(record)
      && record.state === 'synced'
      && record.accountId === payload.expectedUserId
      && quickAccountId === payload.expectedUserId
      && rootAccountId === payload.expectedUserId
      && await matchingCards.count() === 1
      && pageErrors.length === 0,
    captureId: record?.captureId || null,
    localState: record?.state || null,
    requestsBeforeSubmit,
    quickRpcCount: quickRpcRequests.length,
    sameAccount: {
      expected: payload.expectedUserId,
      quick: quickAccountId,
      root: rootAccountId,
    },
    workbenchExactMatchCount: await matchingCards.count(),
    pageErrors,
    failedRequests: failedRequests.filter(item => !/fonts\.gstatic|fonts\.googleapis/u.test(item.url)),
  };
  return JSON.stringify(result, null, 2);
}`.replace('__DEV122_PAYLOAD__', JSON.stringify(payload));
  writeFileSync(smokeFile, browserCode, 'utf8');

  const open = await run('npx.cmd', ['--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${sessionName}`, 'open', `${targetOrigin}/quick-task/`]);
  if (open.code !== 0) throw new Error(`Playwright open failed with exit ${open.code}.`);
  const smoke = await run('npx.cmd', ['--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${sessionName}`, 'run-code', '--json', `--filename=${smokeFile}`]);
  if (smoke.code !== 0) {
    throw new Error(`Authenticated browser smoke failed with exit ${smoke.code}: ${playwrightErrorSummary(smoke.stdout, smoke.stderr)}`);
  }
  browser = parsePlaywrightJson(smoke.stdout);
  if (!browser.ok || !browser.captureId) throw new Error('Authenticated browser smoke did not meet the same-account oracle.');
  captureId = browser.captureId;

  const rows = assertData('same-account task readback', await userClient
    .from('task_workbench_unplaced_items')
    .select('owner_id,id,workspace_id,task,sort_order')
    .eq('owner_id', userId)
    .eq('id', captureId));
  const exact = rows.filter(row => row.task?.title === title);
  if (rows.length !== 1 || exact.length !== 1 || exact[0].owner_id !== userId) {
    throw new Error('Same-account canonical task readback was not exactly one row.');
  }
  readback = {
    rowCount: rows.length,
    exactTitleCount: exact.length,
    ownerMatches: exact[0].owner_id === userId,
    captureIdMatches: exact[0].id === captureId,
    workspaceResolved: Boolean(exact[0].workspace_id),
  };
} catch (error) {
  mainError = error instanceof Error ? error.message : String(error);
} finally {
  rmSync(smokeFile, { force: true });
  const closed = await run('npx.cmd', ['--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${sessionName}`, 'close']);
  cleanup.browserClosed = closed.code === 0;

  if (userId && captureId) {
    const deleted = await admin.from('task_workbench_unplaced_items').delete().eq('owner_id', userId).eq('id', captureId);
    cleanup.taskDeleted = !deleted.error;
  } else {
    cleanup.taskDeleted = true;
  }
  if (tenantId) {
    const deleted = await admin.from('tenants').delete().eq('id', tenantId);
    cleanup.tenantDeleted = !deleted.error;
  } else {
    cleanup.tenantDeleted = true;
  }
  if (userId) {
    const profileDelete = await admin.from('profiles').delete().eq('id', userId);
    cleanup.profileDeleted = !profileDelete.error;
    const userDelete = await admin.auth.admin.deleteUser(userId);
    cleanup.userDeleted = !userDelete.error;
    const taskResidual = await admin.from('task_workbench_unplaced_items').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
    const profileResidual = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
    cleanup.residualTaskCount = taskResidual.count;
    cleanup.residualProfileCount = profileResidual.count;
  }
  if (tenantId) {
    const tenantResidual = await admin.from('tenants').select('id', { count: 'exact', head: true }).eq('id', tenantId);
    cleanup.residualTenantCount = tenantResidual.count;
  }
}

const cleanupComplete = cleanup.browserClosed
  && cleanup.taskDeleted
  && cleanup.tenantDeleted
  && cleanup.profileDeleted
  && cleanup.userDeleted
  && cleanup.residualTaskCount === 0
  && cleanup.residualProfileCount === 0
  && cleanup.residualTenantCount === 0;
const report = {
  devId: 'DEV-122',
  status: !mainError && browser?.ok && readback && cleanupComplete ? 'PASS' : 'FAIL',
  environment: target.hostname.includes('production-candidate') ? 'production-candidate' : 'production-live',
  targetOrigin,
  releaseId: expectedReleaseId,
  checkedAt: new Date().toISOString(),
  sameAccount: browser?.sameAccount ?? null,
  quickPath: browser ? {
    captureId: browser.captureId,
    localState: browser.localState,
    requestsBeforeSubmit: browser.requestsBeforeSubmit.length,
    quickRpcCount: browser.quickRpcCount,
  } : null,
  workbench: browser ? { exactMatchCount: browser.workbenchExactMatchCount } : null,
  canonicalReadback: readback,
  cleanup: { ...cleanup, complete: cleanupComplete },
  error: mainError,
};
writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
