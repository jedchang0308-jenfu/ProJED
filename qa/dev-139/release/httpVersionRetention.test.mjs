import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { retainHttpVersionHistory } from '../../../scripts/lib/dev139-http-version-retention.mjs';
import { validateVersionRetention, versionTreeEntries } from '../../../scripts/release/version-retention.mjs';
import { fixtureNow as now, legacyFixtureOrigin as legacyOrigin, writeFixtureFile as write,
  httpEntryFixture as entry, legacyManifestFixture as predecessor, withPublicArtifactFixture as fixture } from './httpArtifactFixture.mjs';

test('first old-origin HTTP build refuses a missing predecessor instead of silently dropping old PWA assets', () => fixture(directory => {
  const dist = join(directory, 'new'); entry(dist, 'current');
  assert.throws(() => retainHttpVersionHistory({ distDir: dist, releaseId: 'current', requirePreviousAssets: true, now }), /verified predecessor/);
  const result = retainHttpVersionHistory({ distDir: dist, releaseId: 'current', now });
  assert.equal(result.previousAssets, 'NOT_SUPPLIED_CANDIDATE_ONLY');
  assert.equal(validateVersionRetention(result.catalog, versionTreeEntries(dist)).length, 0);
}));

test('verified legacy HTML/assets survive byte-for-byte without replacing the current HTTP entries', () => fixture(directory => {
  const old = join(directory, 'old'), dist = join(directory, 'new');
  const manifest = predecessor(old); entry(dist, 'current'); write(dist, 'index.html', 'new HTTP root');
  const original = readFileSync(join(old, 'assets/client-old-fixture.js'));
  const result = retainHttpVersionHistory({ distDir: dist, releaseId: 'current', previousManifestPath: manifest, requirePreviousAssets: true, now });
  assert.equal(result.previousAssets, 'VERIFIED_AND_RETAINED');
  assert.deepEqual(readFileSync(join(dist, 'assets/client-old-fixture.js')), original);
  assert.equal(readFileSync(join(dist, 'index.html'), 'utf8'), 'new HTTP root');
  assert.equal(result.catalog.releases.length, 2);
  assert.equal(result.catalog.retentionDays, 30);
  assert.equal(validateVersionRetention(result.catalog, versionTreeEntries(dist)).length, 0);
  assert.ok(readFileSync(join(dist, 'app-releases/release-old-fixture/quick-task/index.html'), 'utf8').includes('release:old-fixture'));
}));

test('legacy origins in newly built current files stay forbidden even when their filenames look historical', () => fixture(directory => {
  const old = join(directory, 'old'), dist = join(directory, 'new');
  const manifest = predecessor(old); entry(dist, 'current');
  write(dist, 'app-releases/release-fake/assets/client.js', legacyOrigin);
  assert.throws(() => retainHttpVersionHistory({ distDir: dist, releaseId: 'current', previousManifestPath: manifest, now }), /Current HTTP bundle/);
}));

test('a modified or unverified predecessor cannot supply preserved bytes', () => fixture(directory => {
  const old = join(directory, 'old'), dist = join(directory, 'new');
  const manifest = predecessor(old); entry(dist, 'current');
  write(old, 'assets/client-old-fixture.js', 'mutated-after-manifest');
  assert.throws(() => retainHttpVersionHistory({ distDir: dist, releaseId: 'current', previousManifestPath: manifest, now }), /verification failed/);
  assert.equal(versionTreeEntries(dist).some(entry => entry.path.includes('old-fixture')), false);
}));
