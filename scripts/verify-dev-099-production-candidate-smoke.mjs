import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { readEnvFile } from './release/env-boundary.mjs';
import { assertCandidateEvidence } from './release/production-release.mjs';
import { verifyManifest } from './release/verify-production-artifact.mjs';

const TASK_ID = 'DEV-099';
const ALLOW_ENV = 'DEV099_ALLOW_PRODUCTION_FIXTURE';
const RUN_FLAG = '--run-production-fixture';
const root = process.cwd();

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replaceAll('-', '_');
    args[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
};

const run = (command, args, { timeoutMs = 240000 } = {}) => new Promise((resolve) => {
  const child = spawn(command, args, { cwd: root, env: process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = value => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  };
  const timer = setTimeout(() => {
    if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    finish({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs} ms.` });
  }, timeoutMs);
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => finish({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
  child.on('close', code => finish({ code: code ?? 1, stdout, stderr }));
});

const assertOk = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const countRows = async (client, table, column, value) => {
  const result = await client.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (result.error) throw new Error(`${table} residual count failed: ${result.error.message}`);
  return result.count ?? 0;
};

const selfCheck = () => {
  console.log(JSON.stringify({
    ok: true,
    taskId: TASK_ID,
    mode: 'self-check',
    mutatesProduction: false,
    safeguards: [
      `${ALLOW_ENV}=1`,
      RUN_FLAG,
      'exact DEV-099 manifest and candidate evidence',
      'production-candidate URL only',
      'isolated temporary auth user and tenant',
      'tenant/user deletion plus zero residual rows',
    ],
  }, null, 2));
};

const args = parseArgs(process.argv.slice(2));
if (!args.run_production_fixture || args.self_check) {
  selfCheck();
  process.exit(0);
}
if (process.env[ALLOW_ENV] !== '1') throw new Error(`Refusing production fixture smoke. Set ${ALLOW_ENV}=1 and pass ${RUN_FLAG}.`);
if (!args.manifest) throw new Error('DEV-099 production candidate smoke requires --manifest.');

const manifestPath = path.resolve(root, args.manifest);
const verified = verifyManifest(manifestPath, {
  root,
  expectedTaskId: TASK_ID,
  productionEnvPath: args.production_env,
});
if (!verified.ok) throw new Error(`DEV-099 candidate manifest failed verification: ${verified.errors.join('; ')}`);
const manifest = verified.manifest;
if (!manifest.gates?.featureAcceptanceRequired) throw new Error('DEV-099 manifest must require feature acceptance.');
const candidateEvidencePath = path.join(manifest.artifact.releaseDir, 'candidate-evidence.json');
const candidateEvidence = assertCandidateEvidence(manifest, candidateEvidencePath);
const baseUrl = candidateEvidence.previewUrl;
if (!/^https:\/\/projed-cc78d--production-candidate-[a-z0-9-]+\.web\.app$/i.test(baseUrl)) {
  throw new Error('DEV-099 feature smoke is restricted to the production-candidate preview URL.');
}

const productionEnv = readEnvFile(path.resolve(root, args.production_env ?? '.env.production'));
const serverEnv = readEnvFile(path.resolve(root, args.server_env ?? '.env.p8.local'));
const supabaseUrl = productionEnv.VITE_SUPABASE_URL;
const anonKey = productionEnv.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('DEV-099 production candidate fixture authority is incomplete.');
if (new URL(supabaseUrl).hostname.split('.')[0] !== 'knodlkxqpcqyrtgwpdst') throw new Error('DEV-099 fixture refused a non-production Supabase target.');

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const namespace = `CAPA-001-DEV-099-PROD-CANDIDATE-${manifest.releaseId}-${suffix}`;
const email = `dev099-prod-candidate-${suffix}@example.invalid`;
const password = `Dev099-${suffix}-Aa1!`;
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const browserArtifactPath = path.join(manifest.artifact.releaseDir, 'feature-browser-evidence.json');
const featureEvidencePath = path.join(manifest.artifact.releaseDir, 'feature-evidence.json');
const tempScriptPath = path.join(root, 'tmp', `dev099-production-candidate-${suffix}.pw.js`);
let userId = null;
let tenantId = null;
let browser = null;
let canonicalReadback = null;
let primaryError = null;
let cleanup = { status: 'FAIL', residualRows: null, tenantDeleted: false, userDeleted: false };

try {
  const created = assertOk('temporary auth user', await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'CAPA-001 DEV-099 Production Candidate' },
  }));
  userId = created.user.id;
  const signedIn = assertOk('temporary user sign-in', await userClient.auth.signInWithPassword({ email, password }));
  assertOk('temporary profile', await userClient.from('profiles').upsert({ id: userId, email, display_name: 'CAPA-001 DEV-099 Production Candidate' }).select('id').single());
  const tenant = assertOk('isolated tenant', await userClient.rpc('create_tenant_with_owner', { tenant_name: namespace }));
  tenantId = tenant.id;
  const project = assertOk('isolated project', await userClient.from('projects').insert({
    tenant_id: tenantId,
    legacy_board_id: `dev099-prod-candidate-board-${suffix}`,
    name: namespace,
    sort_order: 1,
  }).select('id,name,legacy_board_id').single());
  const task = assertOk('isolated task', await userClient.from('wbs_items').insert({
    tenant_id: tenantId,
    project_id: project.id,
    legacy_node_id: `dev099-prod-candidate-task-${suffix}`,
    title: `${namespace} initial`,
    status: 'todo',
    item_type: 'task',
    sort_order: 1,
  }).select('id,title,legacy_node_id').single());
  const savedTitle = `${namespace} saved`;
  const payload = {
    baseUrl,
    storageKey,
    session: signedIn.session,
    workspaceId: tenantId,
    boardId: project.legacy_board_id || project.id,
    boardName: project.name,
    taskUiId: task.legacy_node_id || task.id,
    initialTitle: task.title,
    savedTitle,
  };
  const browserSource = `async (page) => {
    const payload = ${JSON.stringify(payload)};
    const messages = [];
    const pageErrors = [];
    page.on('console', message => messages.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(payload.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ storageKey, session, workspaceId, boardId }) => {
      localStorage.setItem(storageKey, JSON.stringify(session));
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-last-ws', workspaceId);
      localStorage.setItem('projed-last-board', boardId);
    }, payload);
    await page.reload({ waitUntil: 'networkidle' });
    const boardButton = page.getByRole('button', { name: new RegExp(payload.boardName) }).first();
    await boardButton.waitFor({ state: 'visible', timeout: 20000 });
    await boardButton.click();
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 20000 });
    const closeVisibleTaskModals = async () => {
      const visibleModals = page.locator('[data-task-details-modal="true"]:visible');
      while (await visibleModals.count()) {
        const currentModal = visibleModals.first();
        await currentModal.locator('button[aria-label="關閉任務詳情"]').click();
        await currentModal.waitFor({ state: 'hidden', timeout: 10000 });
      }
    };
    const openTask = async () => {
      await closeVisibleTaskModals();
      await page.locator('[data-task-workbench-task-card="true"][data-task-id="' + payload.taskUiId + '"]').first().click();
      const modal = page.locator('[data-task-details-modal="true"][data-task-id="' + payload.taskUiId + '"]').first();
      await modal.waitFor({ state: 'visible', timeout: 15000 });
      return modal;
    };
    let modal = await openTask();
    const titleInput = modal.locator('[data-task-details-title-input="true"]');
    await titleInput.fill(payload.savedTitle + '   ');
    await titleInput.press('Enter');
    await modal.locator('[data-task-details-save-status="saved"]').waitFor({ state: 'visible', timeout: 30000 });
    const savedValue = await titleInput.inputValue();
    await modal.locator('button[aria-label="關閉任務詳情"]').click();
    await modal.waitFor({ state: 'hidden', timeout: 5000 });
    modal = await openTask();
    const reopenedValue = await modal.locator('[data-task-details-title-input="true"]').inputValue();
    await modal.locator('button[aria-label="關閉任務詳情"]').click();
    await modal.waitFor({ state: 'hidden', timeout: 5000 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(payload.boardName) }).first().click();
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 20000 });
    modal = await openTask();
    const reloadedValue = await modal.locator('[data-task-details-title-input="true"]').inputValue();
    const result = {
      status: savedValue === payload.savedTitle && reopenedValue === payload.savedTitle && reloadedValue === payload.savedTitle ? 'PASS' : 'FAIL',
      savedValue,
      reopenedValue,
      reloadedValue,
      saveTerminal: await modal.locator('[data-task-details-save-status="saving"]').count() === 0,
      pageErrors,
      criticalMessages: messages.filter(message => message.type === 'error' && !/favicon|google|gsi|Failed to load resource/i.test(message.text)),
    };
    await page.evaluate(result => { window.__DEV099_PRODUCTION_CANDIDATE_ARTIFACT = result; }, result);
    console.log(JSON.stringify(result, null, 2));
  }`;
  fs.mkdirSync(path.dirname(tempScriptPath), { recursive: true });
  fs.writeFileSync(tempScriptPath, browserSource, 'utf8');
  const browserRun = await run('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'run-playwright-code.ps1'),
    '-SessionPrefix', 'dev099-production-candidate',
    '-Filename', tempScriptPath,
    '-OutputDirectory', path.join(root, 'output', 'playwright', 'dev-099-production-candidate'),
    '-BaseUrl', baseUrl,
    '-ArtifactWindowKey', '__DEV099_PRODUCTION_CANDIDATE_ARTIFACT',
    '-ArtifactPath', browserArtifactPath,
  ]);
  if (browserRun.code !== 0) throw new Error(`candidate browser smoke failed: ${(browserRun.stderr || browserRun.stdout).trim().slice(-1600)}`);
  browser = JSON.parse(fs.readFileSync(browserArtifactPath, 'utf8').replace(/^\uFEFF/, ''));
  if (browser.status !== 'PASS' || browser.saveTerminal !== true || browser.pageErrors.length > 0 || browser.criticalMessages.length > 0) {
    throw new Error('candidate browser evidence did not reach a clean terminal PASS.');
  }
  canonicalReadback = assertOk('canonical readback', await userClient.from('wbs_items').select('id,title').eq('tenant_id', tenantId).eq('id', task.id).single());
  if (canonicalReadback.title !== savedTitle) throw new Error('candidate canonical readback does not match the saved title.');
} catch (error) {
  primaryError = error;
} finally {
  if (tempScriptPath && fs.existsSync(tempScriptPath)) fs.rmSync(tempScriptPath, { force: true });
  const cleanupErrors = [];
  if (tenantId) {
    const deleted = await admin.from('tenants').delete().eq('id', tenantId);
    if (deleted.error) cleanupErrors.push(`tenant delete: ${deleted.error.message}`);
  }
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) cleanupErrors.push(`user delete: ${deleted.error.message}`);
  }
  let residualRows = 0;
  if (tenantId) {
    try {
      residualRows += await countRows(admin, 'tenants', 'id', tenantId);
      residualRows += await countRows(admin, 'projects', 'tenant_id', tenantId);
      residualRows += await countRows(admin, 'wbs_items', 'tenant_id', tenantId);
      if (userId) residualRows += await countRows(admin, 'profiles', 'id', userId);
    } catch (error) {
      cleanupErrors.push(error.message);
      residualRows = -1;
    }
  }
  cleanup = {
    status: cleanupErrors.length === 0 && residualRows === 0 ? 'PASS' : 'FAIL',
    residualRows,
    tenantDeleted: Boolean(tenantId) && residualRows === 0,
    userDeleted: Boolean(userId) && !cleanupErrors.some(message => message.startsWith('user delete:')),
    errors: cleanupErrors,
  };
}

const scenarioStatus = primaryError ? 'FAIL' : 'PASS';
const evidence = {
  schemaVersion: 1,
  taskId: TASK_ID,
  releaseId: manifest.releaseId,
  artifactTreeSha256: manifest.artifact.treeSha256,
  environment: 'production-bound-candidate',
  baseUrl,
  status: scenarioStatus === 'PASS' && cleanup.status === 'PASS' ? 'PASS' : 'FAIL',
  fixture: { isolated: true, namespace },
  cleanup,
  scenarios: [
    { id: 'save-terminal-convergence', status: browser?.status === 'PASS' && browser?.saveTerminal ? 'PASS' : 'FAIL' },
    { id: 'canonical-readback', status: canonicalReadback ? 'PASS' : 'FAIL' },
    { id: 'close-reopen-navigation', status: browser?.reopenedValue === browser?.savedValue ? 'PASS' : 'FAIL' },
    { id: 'reload-persistence', status: browser?.reloadedValue === browser?.savedValue ? 'PASS' : 'FAIL' },
  ],
  diagnostics: primaryError ? { message: primaryError.message.slice(0, 500) } : null,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(featureEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: evidence.status === 'PASS', featureEvidencePath, status: evidence.status, cleanup }, null, 2));
if (evidence.status !== 'PASS') process.exit(1);
