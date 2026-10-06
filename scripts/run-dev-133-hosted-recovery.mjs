// N08: public SDK sessions exercise hosted TEST RLS and the normal main UI setup.
// Admin access only provisions a NEW disposable Auth actor; it never issues its session.
import { preview } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey, testProjectRef } from './dev133-test-actor-support.mjs';

const root = process.cwd();
const credentialRoot = path.resolve(process.env.DEV133_CREDENTIAL_ROOT || root);
const config = loadTestActorConfig(credentialRoot);
if (!isAuthorizedTestUrl(config.VITE_SUPABASE_URL) || !isPublicTestKey(config.VITE_SUPABASE_ANON_KEY || '')) throw Error('PUBLIC_TEST_CONFIG_REQUIRED');
const bundle = path.resolve(process.env.DEV133_RECOVERY_BUNDLE || '');
if (!process.env.DEV133_RECOVERY_BUNDLE) throw Error('EXPLICIT_FROZEN_TEST_BUNDLE_REQUIRED');
const source = JSON.parse(await readFile(path.join(bundle, '../candidate/source-manifest.json'), 'utf8'));
if (!process.env.DEV133_EXPECTED_SOURCE_DIGEST || source.digest !== process.env.DEV133_EXPECTED_SOURCE_DIGEST) throw Error('FROZEN_SOURCE_BINDING_REQUIRED');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(JSON.stringify(source.hashes)) !== source.digest) throw Error('SOURCE_MANIFEST_INVALID');
for (const [file, digest] of Object.entries(source.hashes)) {
  if (path.isAbsolute(file) || file.split('/').includes('..')) throw Error('INVALID_SOURCE_PATH');
  if (hash(await readFile(path.join(bundle, '../candidate', file))) !== digest || hash(await readFile(path.join(root, file))) !== digest) throw Error('CANDIDATE_SOURCE_DRIFT');
}
const clientFile = (await readdir(path.join(bundle, 'assets'))).find(file => /^client-[\w-]+\.js$/u.test(file));
if (!clientFile) throw Error('BUILT_PUBLIC_SDK_MODULE_REQUIRED');
const builtClient = await readFile(path.join(bundle, 'assets', clientFile), 'utf8');
if (!builtClient.includes(`${testProjectRef}.supabase.co`) || builtClient.includes('knodlkxqpcqyrtgwpdst')) throw Error('TEST_BUNDLE_BACKEND_MISMATCH');
const quickHtml = await readFile(path.join(bundle, 'quick-task/index.html'), 'utf8');
const quickScript = quickHtml.match(/<script\s+type="module"[^>]*\ssrc="([^"]+)"/u)?.[1];
const shellVersion = JSON.parse(await readFile(path.join(bundle, 'app-shell-meta.json'), 'utf8')).version;
if (!quickScript?.startsWith('/assets/quickTask-') || !shellVersion) throw Error('BUILT_QUICK_ENTRY_REQUIRED');
const attempt = String(Date.now());
const output = path.join(root, 'output/qa/dev-133/independent-auth/hosted-recovery', attempt);
let resumeConfig;
let resumeRuntime;
if (process.env.DEV133_RECOVERY_RESUME_DIR) {
  const resumeDirectory = path.resolve(process.env.DEV133_RECOVERY_RESUME_DIR);
  if (path.dirname(resumeDirectory) !== path.join(root, 'output/qa/dev-133/independent-auth/hosted-recovery')) throw Error('OWNED_RESUME_DIRECTORY_REQUIRED');
  resumeRuntime = JSON.parse(await readFile(path.join(resumeDirectory, 'runtime.json'), 'utf8'));
  resumeConfig = JSON.parse(await readFile(path.join(resumeDirectory, 'config.json'), 'utf8'));
  if (resumeRuntime.project !== 'ProJED' || resumeRuntime.projectRef !== testProjectRef || resumeRuntime.status !== 'stopped'
    || resumeConfig.projectRef !== testProjectRef || resumeConfig.expectedOwnerC !== resumeRuntime.newFixtureActorId
    || path.dirname(resumeRuntime.profile) !== os.tmpdir() || !path.basename(resumeRuntime.profile).startsWith('projed-dev133-recovery-')) throw Error('OWNED_STOPPED_TEST_PROFILE_REQUIRED');
}
const profile = resumeRuntime?.profile || path.join(os.tmpdir(), `projed-dev133-recovery-${attempt}`);
await mkdir(output, { recursive: true });
const driver = path.join(root, 'scripts/verify-dev-133-hosted-recovery.py');
await copyFile(driver, path.join(output, 'driver.py'));
await copyFile(import.meta.filename, path.join(output, 'runner.mjs'));
const runtime = { project: 'ProJED', projectRef: testProjectRef, purpose: 'DEV-133 N08 ordinary TEST missing dependencies / main UI setup / same-ID recovery / foreign hint RLS', port: 4196, runnerPid: process.pid, childPid: null, profile, sourceDigest: source.digest, sourceFileCount: Object.keys(source.hashes).length, driverHash: hash(await readFile(driver)), runnerHash: hash(await readFile(import.meta.filename)), status: 'preparing', cleanupCondition: 'close only owned browser and preview on completion/failure; retain actor, fixtures and all pending captures' };
const save = () => writeFile(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
await save();
let server;
let actorA;
let passed = false;
try {
  // Establish the exclusive port before provisioning any remote fixture.
  server = await preview({ configFile: false, root, build: { outDir: bundle }, preview: { host: '127.0.0.1', port: runtime.port, strictPort: true } });
  actorA = createClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const emailA = config.DEV133_TEST_ACTOR_A_EMAIL || config.VITE_SUPABASE_TEST_EMAIL;
  const login = await actorA.auth.signInWithPassword({ email: emailA, password: config.DEV133_TEST_ACTOR_A_PASSWORD || config.VITE_SUPABASE_TEST_PASSWORD });
  const ownerA = await actorA.auth.getUser();
  if (login.error || ownerA.error || ownerA.data.user?.email?.toLowerCase() !== emailA?.toLowerCase()) throw Error('ORDINARY_ACTOR_A_REQUIRED');
  const memberships = await actorA.from('tenant_members').select('tenant_id').eq('user_id', ownerA.data.user.id).eq('status', 'active');
  if (memberships.error || !memberships.data?.length) throw Error('ACTOR_A_ACTIVE_WORKSPACE_REQUIRED');
  const hintA = memberships.data[0].tenant_id;
  let fixtureConfig;
  let emailC;
  let passwordC;
  if (resumeConfig) {
    if (resumeConfig.ownerA !== ownerA.data.user.id) throw Error('RESUME_ACTOR_A_CHANGED');
    const previousA = await actorA.from('task_workbench_unplaced_items').select('id').eq('owner_id', resumeConfig.ownerA).eq('id', resumeConfig.captureA);
    if (previousA.error || previousA.data?.length !== 1) throw Error('RESUME_A_FIXTURE_MISSING');
    fixtureConfig = { ...resumeConfig, clientModule: `/assets/${clientFile}` };
    runtime.newFixtureActorId = resumeConfig.expectedOwnerC;
    runtime.resumedFrom = process.env.DEV133_RECOVERY_RESUME_DIR;
  } else {
  const captureA = `task_workbench_unplaced_${randomUUID()}`;
  const createdA = await actorA.rpc('create_quick_unplaced_task_v1', { p_capture_id: captureA, p_title: `DEV133-N08-A-${attempt}`, p_workspace_hint: hintA });
  if (createdA.error || createdA.data?.ownerId !== ownerA.data.user.id || createdA.data?.captureId !== captureA) throw Error('ORDINARY_A_FIXTURE_CREATE_FAILED');
  runtime.actorAFixture = { ownerId: ownerA.data.user.id, captureId: captureA, workspaceHint: hintA };
  await save();
  const managementText = await readFile(path.join(credentialRoot, '.env.p8.local'), 'utf8');
  const tokenMatch = managementText.match(/^(?:export\s+|\$env:)?SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/mu);
  if (!tokenMatch) throw Error('AUTHORIZED_TEST_MANAGEMENT_TOKEN_REQUIRED');
  let token = tokenMatch[1].trim();
  if (/^(['"]).*\1$/u.test(token)) token = token.slice(1, -1);
  const response = await fetch(`https://api.supabase.com/v1/projects/${testProjectRef}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('TEST_EXISTING_KEY_READ_FAILED');
  const keys = await response.json();
  const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
  const claims = serviceKey ? JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url').toString()) : null;
  if (claims?.ref !== testProjectRef || claims?.role !== 'service_role') throw Error('EXISTING_TEST_SERVICE_KEY_REQUIRED');
  const admin = createClient(config.VITE_SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  emailC = `dev133-n08-${randomUUID()}@example.com`;
  passwordC = `${randomBytes(30).toString('base64url')}aA9!`;
  const createdC = await admin.auth.admin.createUser({ email: emailC, password: passwordC, email_confirm: true, user_metadata: { name: `DEV133 N08 TEST fixture ${attempt}` } });
  if (createdC.error || !createdC.data.user?.id) throw Error('NEW_DISPOSABLE_TEST_ACTOR_PROVISION_FAILED');
  runtime.newFixtureActorId = createdC.data.user.id;
  fixtureConfig = { clientModule: `/assets/${clientFile}`, projectRef: testProjectRef, expectedOwnerC: createdC.data.user.id, ownerA: ownerA.data.user.id, captureA, hintA, attempt };
  }
  runtime.actorAFixture = { ownerId: fixtureConfig.ownerA, captureId: fixtureConfig.captureA, workspaceHint: fixtureConfig.hintA };
  runtime.fixtureDisposition = 'controlled TEST actor and records retained; existing A/B users, profile, membership and business data unchanged';
  await save();
  await writeFile(path.join(output, 'config.json'), JSON.stringify({ ...fixtureConfig, quickScript, shellVersion }, null, 2));
  // No management/admin key is passed to the browser or Python child.
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|PYTHON.*)$/iu.test(key)));
  if (!resumeConfig) {
    childEnv.DEV133_RECOVERY_ACTOR_C_EMAIL = emailC;
    childEnv.DEV133_RECOVERY_ACTOR_C_PASSWORD = passwordC;
  }
  const child = spawn('python', [path.join(output, 'driver.py'), output, profile, ...(resumeConfig ? ['--resume'] : [])], { cwd: root, env: childEnv, windowsHide: true, stdio: 'inherit' });
  runtime.childPid = child.pid;
  runtime.status = 'running';
  await save();
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  passed = process.exitCode === 0;
} catch (error) {
  process.exitCode = 1;
  await writeFile(path.join(output, 'runner-error.json'), JSON.stringify({ status: 'FAIL', reason: error instanceof Error && /^[A-Z_]+$/u.test(error.message) ? error.message : 'HOSTED_RECOVERY_RUNNER_FAILED' }));
} finally {
  if (actorA) await actorA.auth.signOut({ scope: 'local' }).catch(() => undefined);
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  runtime.status = 'stopped';
  runtime.portReleased = !await fetch('http://127.0.0.1:4196').then(() => true, () => false);
  runtime.profileDisposition = 'closed owned browser; retained profile and captures for same-task follow-up';
  await save();
  console.log(JSON.stringify({ artifact: path.relative(root, output), status: passed ? 'PASS' : 'FAIL', portReleased: runtime.portReleased }));
}
