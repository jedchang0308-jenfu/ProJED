import { build, preview } from 'vite';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { freezeDev133Candidate } from './dev133-candidate-snapshot.mjs';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey } from './dev133-test-actor-support.mjs';
const root = process.cwd();
const output = path.join(root, 'output/qa/dev-133/independent-auth/bundle', String(Date.now()));
const config = loadTestActorConfig(root);
if (!isAuthorizedTestUrl(config.VITE_SUPABASE_URL) || !isPublicTestKey(config.VITE_SUPABASE_ANON_KEY)) throw Error('TEST_PUBLIC_CONFIG_REQUIRED');
await mkdir(output, { recursive: true });
const candidate = path.join(output, 'candidate');
const source = await freezeDev133Candidate(root, candidate);
const driver = path.join(root, 'scripts/verify-dev-133-bundle-offline.py');
await copyFile(driver, path.join(output, 'driver.py'));
const lifecycle = { project: 'ProJED', purpose: 'DEV-133 frozen TEST bundle/offline upgrade compatibility', port: 4193, runnerPid: process.pid, childPid: null, cleanupCondition: 'browser verification completes or fails', source, status: 'building' };
lifecycle.driverHash = createHash('sha256').update(await readFile(driver)).digest('hex');
const save = () => writeFile(path.join(output, 'runtime.json'), JSON.stringify(lifecycle, null, 2));
await save();
const options = { configFile: path.join(candidate, 'vite.config.js'), configLoader: 'runner', root: candidate, mode: 'test', envDir: path.join(output, 'no-env'), envPrefix: 'DEV133_BROWSER_PUBLIC_', cacheDir: path.join(output, 'vite-cache'), define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(config.VITE_SUPABASE_URL), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(config.VITE_SUPABASE_ANON_KEY), 'import.meta.env.VITE_DATA_BACKEND': JSON.stringify('supabase'), 'import.meta.env.VITE_SUPABASE_AUTH_MODE': JSON.stringify('oauth-google'), 'import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN': JSON.stringify('false'), 'import.meta.env.VITE_SUPABASE_TEST_EMAIL': JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify('') }, build: { outDir: path.join(output, 'dist'), emptyOutDir: true } };
options.build.rollupOptions = { input: { main: path.join(candidate, 'index.html'), quickTask: path.join(candidate, 'quick-task/index.html') } };
let server;
let passed = false;
try {
  await build(options);
  const quickHtml = await readFile(path.join(output, 'dist/quick-task/index.html'), 'utf8');
  if (!quickHtml.includes('ProJED-快速建任務') || quickHtml.includes('maxlength="500"')) throw Error('QUICK_BUNDLE_CONTRACT_FAILED');
  server = await preview({ ...options, preview: { host: '127.0.0.1', port: 4193, strictPort: true } });
  lifecycle.status = 'running';
  const child = spawn('python', [path.join(output, 'driver.py'), output], { cwd: root, stdio: 'inherit', windowsHide: true });
  lifecycle.childPid = child.pid;
  await save();
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  passed = process.exitCode === 0;
} catch (error) {
  process.exitCode = 1;
  await writeFile(path.join(output, 'result.json'), JSON.stringify({devId:'DEV-133',status:'FAIL',layer:'TEST bundle build',reason:error instanceof Error ? error.message : 'BUILD_FAILED'},null,2));
  throw error;
} finally {
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  lifecycle.status = 'stopped';
  lifecycle.portReleased = !await fetch('http://127.0.0.1:4193').then(() => true, () => false);
  await save();
  console.log(JSON.stringify({ artifact: path.relative(root, output), status: passed ? 'PASS' : 'FAIL', portReleased: lifecycle.portReleased }));
}
