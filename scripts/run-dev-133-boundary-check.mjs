import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { freezeDev133Candidate } from './dev133-candidate-snapshot.mjs';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey } from './dev133-test-actor-support.mjs';

const root = process.cwd();
const output = path.join(root, 'output/qa/dev-133/independent-auth/boundaries', String(Date.now()));
await mkdir(output, { recursive: true });
const config = loadTestActorConfig(root);
if (!isAuthorizedTestUrl(config.VITE_SUPABASE_URL) || !isPublicTestKey(config.VITE_SUPABASE_ANON_KEY)) throw Error('TEST_PUBLIC_CONFIG_REQUIRED');
const snapshot = await freezeDev133Candidate(root, path.join(output, 'candidate'));
const cases = await readFile(path.join(root, 'scripts/dev133-boundary-cases.js'), 'utf8');
await writeFile(path.join(output, 'cases.js'), cases);
const runtime = { project: 'ProJED', purpose: 'DEV-133 synthetic boundary verification', port: 4183, runnerPid: process.pid, childPid: null, cleanupCondition: 'driver completion or failure', status: 'preparing', snapshot, testHash: createHash('sha256').update(cases).digest('hex') };
const save = () => writeFile(path.join(output, 'runtime.json'), JSON.stringify(runtime, null, 2));
await save();
let server;
let passed = false;
try {
  server = await createServer({ configFile: false, root: path.join(output, 'candidate'), envDir: path.join(output, 'no-env'), mode: 'test', server: { host: '127.0.0.1', port: runtime.port, strictPort: true }, define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(config.VITE_SUPABASE_URL), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(config.VITE_SUPABASE_ANON_KEY), 'import.meta.env.VITE_DATA_BACKEND': JSON.stringify('supabase'), 'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify(''), 'import.meta.env.VITE_ENABLE_TEST_AUTO_LOGIN': JSON.stringify('false') } });
  await server.listen();
  const child = spawn('python', [path.join(root, 'scripts/verify-dev-133-boundaries.py'), output], { cwd: root, stdio: 'inherit', windowsHide: true });
  runtime.childPid = child.pid;
  runtime.status = 'running';
  await save();
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  process.exitCode = code ?? 1;
  passed = process.exitCode === 0;
} catch (error) {
  process.exitCode = 1;
  await writeFile(path.join(output, 'runner-error.json'), JSON.stringify({ status: 'FAIL', reason: error instanceof Error ? error.message : 'RUNNER_FAILED' }));
} finally {
  if (server) await server.close();
  runtime.status = 'stopped';
  runtime.portReleased = !await fetch('http://127.0.0.1:4183').then(() => true, () => false);
  await save();
  console.log(JSON.stringify({ artifact: path.relative(root, output), status: passed ? 'PASS' : 'FAIL', portReleased: runtime.portReleased }));
}
