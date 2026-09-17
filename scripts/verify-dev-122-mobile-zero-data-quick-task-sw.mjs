import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const html = readFileSync(resolve('dist/quick-task/index.html'), 'utf8');
const rootHtml = readFileSync(resolve('dist/index.html'), 'utf8');
const sw = readFileSync(resolve('dist/sw.js'), 'utf8');
const meta = JSON.parse(readFileSync(resolve('dist/app-shell-meta.json'), 'utf8'));
const sourceRootManifestText = readFileSync(resolve('public/manifest.webmanifest'), 'utf8');
const distRootManifestText = readFileSync(resolve('dist/manifest.webmanifest'), 'utf8');
const distQuickManifest = JSON.parse(readFileSync(resolve('dist/quick-task/manifest.webmanifest'), 'utf8'));
const sourceRootManifest = JSON.parse(sourceRootManifestText);
const distRootManifest = JSON.parse(distRootManifestText);
const manifestHistory = execFileSync('git', ['log', '--format=%H', '--', 'public/manifest.webmanifest'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/u)
  .filter(Boolean);
const baselineEntry = manifestHistory
  .map(ref => {
    const text = execFileSync('git', ['show', `${ref}:public/manifest.webmanifest`], { encoding: 'utf8' });
    return { ref, text, manifest: JSON.parse(text) };
  })
  .find(entry => !entry.manifest.shortcuts?.length);
if (!baselineEntry) throw new Error('DEV-122 W07 baseline manifest without shortcuts was not found in Git history.');
const baselineGitRef = baselineEntry.ref;
const baselineRootManifestText = baselineEntry.text;
const baselineRootManifest = JSON.parse(baselineRootManifestText);
const md5 = value => createHash('md5').update(value).digest('hex');
const sourceRevision = md5(sourceRootManifestText);
const baselineRevision = md5(baselineRootManifestText);
const shortcut = distRootManifest.shortcuts?.[0];
const checks = [
  ['quick-only-manifest', html.includes('/quick-task/manifest.webmanifest') && !html.includes('href="/manifest.webmanifest"')],
  ['quick-precache', sw.includes('quick-task/index.html') && sw.includes('quick-task/manifest.webmanifest')],
  ['root-single-manifest-link', (rootHtml.match(/rel=["']manifest["']/gu) ?? []).length === 1 && rootHtml.includes('href="/manifest.webmanifest"')],
  ['root-manifest-source-dist-parity', JSON.stringify(sourceRootManifest) === JSON.stringify(distRootManifest)],
  ['root-manifest-precache', sw.includes('manifest.webmanifest') && sw.includes(sourceRevision) && !sw.includes(baselineRevision)],
  ['W07-build-a-to-b-identity', baselineRootManifest.id === '/'
    && baselineRootManifest.start_url === '/'
    && baselineRootManifest.scope === '/'
    && !baselineRootManifest.shortcuts
    && distRootManifest.id === baselineRootManifest.id
    && distRootManifest.start_url === baselineRootManifest.start_url
    && distRootManifest.scope === baselineRootManifest.scope],
  ['W07-build-b-shortcut', shortcut?.name === '快速建待辦'
    && shortcut.short_name === '建待辦'
    && shortcut.description === '直接輸入一筆待辦'
    && shortcut.url === '/quick-task/'
    && shortcut.icons?.[0]?.sizes === '1024x1024'],
  ['quick-manifest-icon-metadata', distQuickManifest.id === '/quick-task/'
    && distQuickManifest.icons?.every(icon => icon.src === '/icons/icon-vibrant-03-mango-berry.png' && icon.sizes === '1024x1024' && icon.type === 'image/png')],
  ['common-shell-meta-precache', sw.includes('app-shell-meta.json')],
  ['quick-denylist', sw.includes('quick-task(?:\\/|$)')],
  ['callback-query-normalization', sw.includes('capture') && sw.includes('claim') && sw.includes('install')],
  ['single-worker', !sw.includes('quick-sw.js')],
];
const artifact = {
  devId: 'DEV-122',
  sourceRevision: 'working-tree',
  buildId: meta.version ?? 'unknown',
  actorAlias: 'DEV122-SW',
  fixtureVersion: 'DEV122-SW-R12-V3',
  platform: 'Node',
  route: 'service-worker',
  status: checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL',
  manifestUpdate: {
    baselineRevision,
    candidateRevision: sourceRevision,
    baselineGitRef,
    identityStable: baselineRootManifest.id === distRootManifest.id,
    baselineHadShortcut: Boolean(baselineRootManifest.shortcuts),
    candidateShortcutUrl: shortcut?.url ?? null,
  },
  checks: checks.map(([id, ok]) => ({ id, expected: true, actual: ok, status: ok ? 'PASS' : 'FAIL' })),
  generatedAt: new Date().toISOString(),
};
const dir = resolve('output/playwright/dev-122-mobile-zero-data-quick-task');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'sw-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
if (artifact.status !== 'PASS') { console.error(artifact); process.exit(1); }
console.log('DEV-122 service-worker verification passed.');
