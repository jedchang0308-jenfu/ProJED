import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const identities = [
  { name: 'main', manifest: 'public/manifest.webmanifest', distManifest: 'dist/manifest.webmanifest', prefix: 'projed-main-icon-brand-20260929', html: 'index.html' },
  { name: 'quick-task', manifest: 'public/quick-task/manifest.webmanifest', distManifest: 'dist/quick-task/manifest.webmanifest', prefix: 'projed-quick-task-icon-brand-20260929', html: 'quick-task/index.html' },
];
const read = path => readFileSync(resolve(path));
const json = path => JSON.parse(read(path).toString('utf8'));
const checkPng = (file, dimension) => {
  const bytes = read(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: PNG signature`);
  assert.equal(bytes.readUInt32BE(16), dimension, `${file}: width`);
  assert.equal(bytes.readUInt32BE(20), dimension, `${file}: height`);
  assert.ok(statSync(resolve(file)).size < 512 * 1024, `${file}: under 512 KiB`);
};

for (const identity of identities) {
  const manifest = json(identity.manifest);
  assert.deepEqual(json(identity.distManifest), manifest, `${identity.name}: source/dist manifest`);
  assert.equal(manifest.icons.filter(icon => icon.purpose === 'any').length, 2);
  for (const size of [192, 512]) {
    const src = `/icons/${identity.prefix}-${size}.png`;
    assert.ok(manifest.icons.some(icon => icon.src === src && icon.sizes === `${size}x${size}` && icon.type === 'image/png' && icon.purpose === 'any'), `${identity.name}: ${size}px manifest entry`);
    checkPng(`public${src}`, size);
    checkPng(`dist${src}`, size);
  }
  const html = read(identity.html).toString('utf8');
  assert.ok(html.includes(`/icons/${identity.prefix}-512.png`), `${identity.name}: HTML icon`);
  assert.ok(read(identity.distManifest.replace('manifest.webmanifest', 'index.html')).toString('utf8').includes(`/icons/${identity.prefix}-512.png`), `${identity.name}: built HTML icon`);
}

const shortcut = json('public/manifest.webmanifest').shortcuts.find(item => item.url === '/quick-task/');
for (const size of [192, 512]) {
  assert.ok(shortcut?.icons.some(icon => icon.src === `/icons/projed-quick-task-icon-brand-20260929-${size}.png` && icon.sizes === `${size}x${size}`), `shortcut: ${size}px icon`);
}
const runtime = read('src/services/appIconService.ts').toString('utf8');
assert.ok(runtime.includes('/icons/projed-main-icon-brand-20260929-512.png'));
assert.ok(runtime.includes('/icons/projed-quick-task-icon-brand-20260929-512.png'));
console.log('DEV-130 install icon source/build verification passed (main and quick-task, 192/512).');
