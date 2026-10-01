import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { freezeDev133Candidate } from './dev133-candidate-snapshot.mjs';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey } from './dev133-test-actor-support.mjs';

const root = process.cwd();
const config = loadTestActorConfig(root);
if (!isAuthorizedTestUrl(config.VITE_SUPABASE_URL) || !isPublicTestKey(config.VITE_SUPABASE_ANON_KEY)) throw Error('TEST_PUBLIC_CONFIG_REQUIRED');
const email = config.DEV133_TEST_ACTOR_A_EMAIL || config.VITE_SUPABASE_TEST_EMAIL;
const password = config.DEV133_TEST_ACTOR_A_PASSWORD || config.VITE_SUPABASE_TEST_PASSWORD;
if (!email || !password) throw Error('ORDINARY_TEST_ACTOR_REQUIRED');
const output = path.join(root, 'output/qa/dev-133/independent-auth/live-auth-boundaries', String(Date.now()));
await mkdir(output, { recursive: true });
const candidate = path.join(output, 'candidate');
const source = await freezeDev133Candidate(root, candidate);
const mainLogout = process.argv.includes('--main-logout');
const claimOnly = process.argv.includes('--claim-only');
if (mainLogout && claimOnly) throw Error('EXCLUSIVE_TEST_SCENARIO_REQUIRED');
const driver = path.join(root, 'scripts', mainLogout ? 'verify-dev-133-main-local-logout.py' : claimOnly ? 'verify-dev-133-live-claim.py' : 'verify-dev-133-live-auth-boundaries.py');
await copyFile(driver, path.join(output, 'driver.py'));
if (mainLogout || claimOnly) await copyFile(path.join(root, 'scripts/verify-dev-133-live-auth-boundaries.py'), path.join(output, 'helpers.py'));
const driverHash = createHash('sha256').update(await readFile(driver)).digest('hex');
const runtime = { project: 'ProJED', purpose: mainLogout ? 'DEV-133 main UI local logout isolation' : claimOnly ? 'DEV-133 current-source N06 ordinary TEST cancel and explicit claim' : 'DEV-133 live ordinary TEST actor A Auth/timeout/cleanup boundaries', port: 4185, runnerPid: process.pid, childPid: null, source, driverHash, cleanupCondition: 'driver completes or fails; preserve any unsynced captures', status: 'preparing' };
const save = () => writeFile(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
await save();
let server;
let passed = false;
try {
  server = await createServer({ configFile: false, root: candidate, envDir: path.join(output, 'no-env'), mode: 'test', server: { host: '127.0.0.1', port: runtime.port, strictPort: true }, define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(config.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(config.VITE_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_DATA_BACKEND': JSON.stringify('supabase'),
    'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN': JSON.stringify('false'),
  } });
  await server.listen();
  const child = spawn('python', [path.join(output, 'driver.py'), output], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, DEV133_TEST_ACTOR_A_EMAIL: email, DEV133_TEST_ACTOR_A_PASSWORD: password } });
  runtime.childPid = child.pid;
  runtime.status = 'running';
  await save();
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  passed = process.exitCode === 0;
} catch (error) {
  process.exitCode = 1;
  await writeFile(path.join(output, 'runner-error.json'), JSON.stringify({ status: 'FAIL', reason: error instanceof Error ? error.message : 'RUNNER_FAILED' }));
} finally {
  if (server) await server.close();
  runtime.status = 'stopped';
  runtime.portReleased = !await fetch('http://127.0.0.1:4185').then(() => true, () => false);
  await save();
  console.log(JSON.stringify({ artifact: path.relative(root, output), status: passed ? 'PASS' : 'FAIL', portReleased: runtime.portReleased }));
}
