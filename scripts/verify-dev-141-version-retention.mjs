import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { retainVersionHistory, validateVersionRetention, versionTreeEntries } from './release/version-retention.mjs';

const output = path.resolve('output');
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(output, 'dev141-retention-'));
assert.ok(root.startsWith(output + path.sep), 'Fixture cleanup stays inside output');
const create = id => {
  const dist = path.join(root, id);
  const files = {
    'index.html': 'stable entry ' + id,
    'sw.js': 'root worker ' + id,
    ['assets/main-' + id + '.js']: 'main ' + id,
    ['assets/lazy-' + id + '.js']: 'lazy ' + id,
    ['app-releases/release-' + id + '/index.html']: 'main HTML ' + id,
    ['app-releases/release-' + id + '/quick-task/index.html']: 'Quick HTML ' + id,
    ['app-releases/release-' + id + '/assets/lazy-' + id + '.js']: 'lazy ' + id,
    ['app-releases/release-' + id + '/icons/icon.png']: 'icon ' + id,
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dist, name)), { recursive: true });
    fs.writeFileSync(path.join(dist, name), content);
  }
  return dist;
};
const date = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const adopt = (id, previous, day) => {
  const dist = create(id);
  const result = retainVersionHistory({ distDir: dist, version: 'release:' + id, previousDistDir: previous, now: date(day) });
  assert.deepEqual(validateVersionRetention(result.catalog, versionTreeEntries(dist)), []);
  return { dist, ...result };
};
try {
  const a = adopt('A', undefined, 1);
  const b = adopt('B', a.dist, 2);
  const c = adopt('C', b.dist, 3);
  assert.deepEqual(c.catalog.releases.map(item => item.version), ['release:A', 'release:B', 'release:C']);
  assert.equal(c.catalog.releases[0].supersededAt, date(2));
  assert.equal(c.catalog.releases[0].supersessionObservedAt, date(3));
  for (const name of ['assets/lazy-A.js', 'app-releases/release-A/index.html', 'app-releases/release-A/quick-task/index.html', 'app-releases/release-A/icons/icon.png']) assert.ok(fs.existsSync(path.join(c.dist, name)), name);
  assert.equal(fs.readFileSync(path.join(c.dist, 'index.html'), 'utf8'), 'stable entry C');
  assert.equal(fs.readFileSync(path.join(c.dist, 'sw.js'), 'utf8'), 'root worker C');
  const d = adopt('D', c.dist, 17);
  assert.ok(fs.existsSync(path.join(d.dist, 'app-releases/release-A/index.html')), 'A survives exact 14-day boundary');
  const e = adopt('E', d.dist, 18);
  assert.ok(!fs.existsSync(path.join(e.dist, 'app-releases/release-A/index.html')), 'A expires only after its own supersession window');
  assert.ok(fs.existsSync(path.join(e.dist, 'app-releases/release-B/quick-task/index.html')), 'B survives its distinct boundary');
  const longer = create('longer');
  retainVersionHistory({ distDir: longer, version: 'release:longer', previousDistDir: c.dist, retentionDays: 30, now: date(30) });
  assert.ok(fs.existsSync(path.join(longer, 'app-releases/release-A/index.html')));
  assert.throws(() => retainVersionHistory({ distDir: create('short'), version: 'release:short', retentionDays: 13 }), /14/);
  const collision = create('collision');
  fs.writeFileSync(path.join(collision, 'assets/main-A.js'), 'changed bytes');
  assert.throws(() => retainVersionHistory({ distDir: collision, version: 'release:collision', previousDistDir: c.dist, now: date(4) }), /collision/);
  assert.ok(!fs.existsSync(path.join(collision, 'app-releases/release-A/index.html')), 'no partial copy before collision validation');
  fs.writeFileSync(path.join(c.dist, 'app-releases/release-A/icons/icon.png'), 'tampered');
  assert.throws(() => retainVersionHistory({ distDir: create('tamper'), version: 'release:tamper', previousDistDir: c.dist, now: date(4) }), /verification/);
  console.log('PASS DEV-141 version retention: A/B/C entries + lazy assets, supersession clock, expiry, configurable extension, tamper/collision fail closed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
