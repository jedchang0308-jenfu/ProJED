import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('dist/quick-task/index.html'), 'utf8');
const sw = readFileSync(resolve('dist/sw.js'), 'utf8');
const meta = JSON.parse(readFileSync(resolve('dist/app-shell-meta.json'), 'utf8'));
const checks = [
  ['quick-only-manifest', html.includes('/quick-task/manifest.webmanifest') && !html.includes('href="/manifest.webmanifest"')],
  ['quick-precache', sw.includes('quick-task/index.html') && sw.includes('quick-task/manifest.webmanifest')],
  ['common-shell-meta-precache', sw.includes('app-shell-meta.json')],
  ['quick-denylist', sw.includes('quick-task(?:\\/|$)')],
  ['callback-query-normalization', sw.includes('capture') && sw.includes('claim') && sw.includes('install')],
  ['single-worker', !sw.includes('quick-sw.js')],
];
const artifact = { devId: 'DEV-122', sourceRevision: 'working-tree', buildId: meta.version ?? 'unknown', actorAlias: 'DEV122-SW', fixtureVersion: 'DEV122-SW-V1', platform: 'Node', route: 'service-worker', status: checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL', checks: checks.map(([id, ok]) => ({ id, expected: true, actual: ok, status: ok ? 'PASS' : 'FAIL' })), generatedAt: new Date().toISOString() };
const dir = resolve('output/playwright/dev-122-mobile-zero-data-quick-task');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'sw-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
if (artifact.status !== 'PASS') { console.error(artifact); process.exit(1); }
console.log('DEV-122 service-worker verification passed.');
