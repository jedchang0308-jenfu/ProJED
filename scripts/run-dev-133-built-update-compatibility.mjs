import { preview } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const base = path.join(root, 'output/qa/dev-133/independent-auth');
const oldBundle = path.join(base, 'bundle/1790825980935/dist');
const newBundle = path.join(base, 'bundle/1790827939524/dist');
const output = path.join(base, 'built-update', String(Date.now()));
await mkdir(output, { recursive: true });
const driver = path.join(root, 'scripts/verify-dev-133-built-update-compatibility.py');
await copyFile(driver, path.join(output, 'driver.py'));
const builds = {};
for (const [name, directory] of [['A', oldBundle], ['B', newBundle]]) {
  builds[name] = { directory, hashes: {} };
  for (const file of ['sw.js', 'app-shell-meta.json', 'quick-task/index.html', 'manifest.webmanifest', 'quick-task/manifest.webmanifest']) {
    builds[name].hashes[file] = createHash('sha256').update(await readFile(path.join(directory, file))).digest('hex');
  }
  builds[name].shellVersion = JSON.parse(await readFile(path.join(directory, 'app-shell-meta.json'), 'utf8')).version;
  builds[name].rootIdentity = JSON.parse(await readFile(path.join(directory, 'manifest.webmanifest'), 'utf8'));
  builds[name].quickIdentity = JSON.parse(await readFile(path.join(directory, 'quick-task/manifest.webmanifest'), 'utf8'));
}
if (builds.A.shellVersion === builds.B.shellVersion) throw Error('DISTINCT_BUILD_VERSIONS_REQUIRED');
await writeFile(path.join(output, 'builds.json'), JSON.stringify(builds, null, 2));
const lifecycle = { project: 'ProJED', purpose: 'DEV-133 real built SW update and v2-compatible fallback; synthetic IDB owners, no Auth', port: 4194, runnerPid: process.pid, childPid: null, status: 'preparing', driverHash: createHash('sha256').update(await readFile(driver)).digest('hex'), cleanupCondition: 'driver completion or failure; close owned browser/server, retain any pending fixture profile' };
const save = () => writeFile(path.join(output, 'runtime.json'), JSON.stringify(lifecycle, null, 2));
let server, watcher, switching = false, child, passed = false;
const start = directory => preview({ configFile: false, root, build: { outDir: directory }, preview: { host: '127.0.0.1', port: 4194, strictPort: true } });
const close = () => server ? new Promise(resolve => server.httpServer.close(resolve)) : Promise.resolve();
await save();
try {
  server = await start(oldBundle);
  lifecycle.status = 'serving-A';
  let target = 'B';
  watcher = setInterval(async () => {
    if (switching || !target) return;
    const request = path.join(output, target === 'B' ? 'switch-requested.json' : 'rollback-requested.json');
    if (!await access(request).then(() => true, () => false)) return;
    switching = true;
    const selected = target;
    try {
      await close();
      server = await start(selected === 'B' ? newBundle : oldBundle);
      lifecycle.status = `serving-${selected}`;
      await save();
      await writeFile(path.join(output, `${selected}-ready.json`), JSON.stringify({ status: 'PASS' }));
      target = selected === 'B' ? 'A' : null;
    } catch {
      await writeFile(path.join(output, `${selected}-ready.json`), JSON.stringify({ status: 'FAIL', reason: 'OWNED_PREVIEW_SWITCH_FAILED' }));
      target = null;
    } finally { switching = false; }
  }, 200);
  child = spawn('python', [path.join(output, 'driver.py'), output], { cwd: root, windowsHide: true, stdio: 'inherit' });
  lifecycle.childPid = child.pid;
  await save();
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  passed = process.exitCode === 0;
} catch {
  process.exitCode = 1;
  await writeFile(path.join(output, 'runner-error.json'), JSON.stringify({ status: 'FAIL', reason: 'BUILT_UPDATE_RUNNER_FAILED' }));
} finally {
  clearInterval(watcher);
  while (switching) await new Promise(resolve => setTimeout(resolve, 100));
  await close();
  lifecycle.status = 'stopped';
  lifecycle.portReleased = !await fetch('http://127.0.0.1:4194').then(() => true, () => false);
  lifecycle.retainedProfile = path.join(output, 'owned-update-profile');
  lifecycle.cleanupOwner = 'DEV-133: pending synthetic fixture preserved; no user captures removed';
  await save();
  console.log(JSON.stringify({ artifact: path.relative(root, output), status: passed ? 'PASS' : 'FAIL', portReleased: lifecycle.portReleased }));
}
