import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { sha256 } from '../../../scripts/release/production-contract.mjs';
import { retainHttpVersionHistory } from '../../../scripts/lib/dev139-http-version-retention.mjs';
import { stagePublicPredecessor } from '../../../scripts/lib/dev139-predecessor-stage.mjs';
import { verifyHttpArtifact, verifyPublicPredecessor, writeHttpArtifactManifest } from '../../../scripts/lib/dev139-http-artifact.mjs';
import { fixtureNow, writeFixtureFile, httpEntryFixture, legacyManifestFixture, withPublicArtifactFixture } from './httpArtifactFixture.mjs';

function httpManifest(distDir, releaseId, sourceRevision, manifestPath) {
  writeFixtureFile(distDir, 'dev139-cloud-run-meta.json', JSON.stringify({ releaseId, backend: 'http', sourceRevision,
    entrySha256: sha256(readFileSync(join(distDir, 'index.html'))), quickEntrySha256: sha256(readFileSync(join(distDir, 'quick-task/index.html'))) }));
  return writeHttpArtifactManifest({ distDir, releaseId, sourceRevision, manifestPath });
}

test('Windows-path predecessor stages portably without rewriting its manifest or copying adjacent release env', () => withPublicArtifactFixture(directory => {
  const old = join(directory, 'old'), output = join(directory, 'portable');
  const manifest = legacyManifestFixture(old);
  const windowsManifest = JSON.parse(readFileSync(manifest, 'utf8'));
  windowsManifest.artifact.distDir = 'C:\\unavailable-projed-predecessor\\dist';
  writeFileSync(manifest, JSON.stringify(windowsManifest));
  const original = readFileSync(manifest);
  writeFixtureFile(directory, '.env', 'DO_NOT_COPY_RELEASE_ENV');
  stagePublicPredecessor({ manifestPath: manifest, distDir: old, output });
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), original);
  assert.deepEqual(readFileSync(manifest), original);
  assert.equal(verifyPublicPredecessor(join(output, 'manifest.json')).distDir, join(output, 'dist'));
  assert.equal(existsSync(join(output, '.env')), false); assert.equal(existsSync(join(output, 'dist/.env')), false);
  assert.throws(() => stagePublicPredecessor({ manifestPath: manifest, distDir: old, output }), /new directory/);
}));

test('legacy to HTTP A to portable HTTP B keeps all pinned versions and immutable bytes', () => withPublicArtifactFixture(directory => {
  const old = join(directory, 'old'), a = join(directory, 'http-a'), b = join(directory, 'http-b');
  const original = legacyManifestFixture(old), portableOld = join(directory, 'portable-old');
  stagePublicPredecessor({ manifestPath: original, output: portableOld });
  httpEntryFixture(a, 'http-a');
  retainHttpVersionHistory({ distDir: a, releaseId: 'http-a', previousManifestPath: join(portableOld, 'manifest.json'), requirePreviousAssets: true, now: fixtureNow });
  const manifestA = join(directory, 'http-a-manifest.json');
  httpManifest(a, 'http-a', 'a'.repeat(40), manifestA); verifyHttpArtifact(manifestA);
  const portableA = join(directory, 'portable-a');
  stagePublicPredecessor({ manifestPath: manifestA, output: portableA });
  httpEntryFixture(b, 'http-b');
  const result = retainHttpVersionHistory({ distDir: b, releaseId: 'http-b', previousManifestPath: join(portableA, 'manifest.json'), requirePreviousAssets: true, now: fixtureNow });
  const manifestB = join(directory, 'http-b-manifest.json');
  httpManifest(b, 'http-b', 'b'.repeat(40), manifestB); verifyHttpArtifact(manifestB);
  assert.deepEqual(result.catalog.releases.map(row => row.version), ['release:old-fixture', 'release:http-a', 'release:http-b']);
  assert.equal(result.catalog.retentionDays, 30);
  for (const path of ['assets/client-old-fixture.js', 'app-releases/release-old-fixture/index.html', 'app-releases/release-old-fixture/quick-task/index.html']) {
    assert.deepEqual(readFileSync(join(b, path)), readFileSync(join(old, path)));
  }
  assert.deepEqual(readFileSync(join(b, 'assets/client-http-a.js')), readFileSync(join(a, 'assets/client-http-a.js')));
  assert.deepEqual(readFileSync(join(portableA, 'manifest.json')), readFileSync(manifestA));
}));

test('portable selection tampering or changed HTTP bytes cannot become a predecessor', () => withPublicArtifactFixture(directory => {
  const old = join(directory, 'old'), output = join(directory, 'portable'), a = join(directory, 'http-a');
  const original = legacyManifestFixture(old);
  stagePublicPredecessor({ manifestPath: original, output });
  const selection = join(output, 'predecessor-selection.json');
  const value = JSON.parse(readFileSync(selection, 'utf8')); value.manifestSha256 = '0'.repeat(64);
  writeFileSync(selection, JSON.stringify(value));
  assert.throws(() => verifyPublicPredecessor(join(output, 'manifest.json')), /selection mismatch/);
  httpEntryFixture(a, 'http-a'); retainHttpVersionHistory({ distDir: a, releaseId: 'http-a', now: fixtureNow });
  const manifestA = join(directory, 'a-manifest.json'); httpManifest(a, 'http-a', 'a'.repeat(40), manifestA);
  writeFixtureFile(a, 'assets/client-http-a.js', 'changed');
  assert.throws(() => verifyHttpArtifact(manifestA), /file manifest mismatch/);
}));

test('an unbound candidate artifact cannot impersonate a source-bound HTTP predecessor', () => withPublicArtifactFixture(directory => {
  const a = join(directory, 'candidate'), manifest = join(directory, 'manifest-candidate.json');
  httpEntryFixture(a, 'candidate'); retainHttpVersionHistory({ distDir: a, releaseId: 'candidate', now: fixtureNow });
  httpManifest(a, 'candidate', null, manifest);
  assert.throws(() => verifyHttpArtifact(manifest), /candidate-only/);
}));
