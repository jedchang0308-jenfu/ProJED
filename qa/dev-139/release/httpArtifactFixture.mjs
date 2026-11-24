import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { retainVersionHistory } from '../../../scripts/release/version-retention.mjs';
import { PRODUCTION_CONTRACT, contractDigest, sha256 } from '../../../scripts/release/production-contract.mjs';
import { verifyManifest } from '../../../scripts/release/verify-production-artifact.mjs';

export const fixtureNow = '2026-11-23T00:00:00.000Z';
export const legacyFixtureOrigin = 'https://knodlkxqpcqyrtgwpdst.supabase.co';
export function writeFixtureFile(root, name, value) { const file = join(root, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); }
export function httpEntryFixture(root, id, javascript = `console.log('${id}')`) {
  for (const path of ['index.html', 'quick-task/index.html']) {
    writeFixtureFile(root, `app-releases/release-${id}/${path}`, `<meta name="projed-shell-version" content="release:${id}">`);
    writeFixtureFile(root, path, `<html>${id} ${path}</html>`);
  }
  writeFixtureFile(root, `assets/client-${id}.js`, javascript);
}
export function legacyManifestFixture(root) {
  const releaseId = 'old-fixture'; httpEntryFixture(root, releaseId, `console.log('${releaseId}','${legacyFixtureOrigin}')`);
  writeFixtureFile(root, 'release-meta.json', JSON.stringify({ releaseId, contractSha256: contractDigest() }));
  const { catalog } = retainVersionHistory({ distDir: root, version: `release:${releaseId}`, retentionDays: 30, now: fixtureNow });
  const files = [];
  const visit = dir => { for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name); if (file.isDirectory()) visit(path); else files.push(path);
  } };
  visit(root); files.sort((left, right) => left.localeCompare(right));
  const entries = files.map(file => { const bytes = readFileSync(file); return { path: relative(root, file).split(sep).join('/'), size: bytes.length, sha256: sha256(bytes) }; });
  const manifest = { taskId: PRODUCTION_CONTRACT.taskId, releaseId, source: { dirty: false },
    target: { projectId: PRODUCTION_CONTRACT.projectId, origin: PRODUCTION_CONTRACT.canonicalOrigin },
    environment: { supabaseProjectRef: PRODUCTION_CONTRACT.supabaseProjectRef, redirectUrl: PRODUCTION_CONTRACT.canonicalRedirectUrl },
    contractSha256: contractDigest(), artifact: { distDir: root,
      treeSha256: sha256(entries.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}`).join('\n')), entries, versionRetention: catalog } };
  const file = join(dirname(root), 'manifest.json'); writeFileSync(file, JSON.stringify(manifest));
  assert.equal(verifyManifest(file).ok, true);
  return file;
}
export function withPublicArtifactFixture(action) {
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'dev139-http-retention-'));
  try { action(directory); } finally {
    assert.equal(dirname(directory), temporaryRoot); assert.ok(basename(directory).startsWith('dev139-http-retention-'));
    rmSync(directory, { recursive: true, force: true });
  }
}
