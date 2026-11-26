import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { createAnalysisSourceBundle } from '../../../scripts/lib/dev139-analysis-source-bundle.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'projed-analysis-source-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'user.name', 'Fixture');
  writeFileSync(join(repo, 'Dockerfile.dev139'), 'FROM scratch\nCOPY app.txt /app.txt\n', 'utf8');
  writeFileSync(join(repo, 'app.txt'), 'committed\nline\n', 'utf8');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'fixture');
  return { repo, sourceRevision: git(repo, 'rev-parse', 'HEAD') };
}

function tarFile(tar, wanted) {
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const zero = header.indexOf(0);
    const name = header.subarray(0, zero < 0 ? 100 : zero).toString('utf8');
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    const dataStart = offset + 512;
    if (name === wanted) return tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

test('bundles exact committed blobs and ignores dirty CRLF working-tree bytes', () => {
  const { repo, sourceRevision } = fixture();
  const outputDir = join(repo, 'out');
  try {
    writeFileSync(join(repo, 'app.txt'), 'dirty\r\nworking tree\r\n', 'utf8');
    const first = createAnalysisSourceBundle({ repoRoot: repo, outputDir, releaseId: 'dev139-analysis-a1', sourceRevision });
    const second = createAnalysisSourceBundle({ repoRoot: repo, outputDir, releaseId: 'dev139-analysis-a1', sourceRevision });
    assert.equal(first.status, 'PASS');
    assert.equal(first.providerOperation, false);
    assert.equal(first.fileCount, 2);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.archiveSha256, first.archiveSha256);
    assert.equal(first.sourceObject, `dev139/dev139-analysis-a1/source-${first.archiveSha256}.tar.gz`);
    assert.deepEqual(tarFile(gunzipSync(readFileSync(first.archivePath)), 'app.txt'), Buffer.from('committed\nline\n'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('rejects malformed revisions, release IDs, and expanded caller input', () => {
  const { repo, sourceRevision } = fixture();
  try {
    const outputDir = join(repo, 'out');
    for (const input of [
      { repoRoot: repo, outputDir, releaseId: 'DEV139', sourceRevision },
      { repoRoot: repo, outputDir, releaseId: 'dev139-a1', sourceRevision: sourceRevision.slice(0, 39) },
      { repoRoot: repo, outputDir, releaseId: 'dev139-a1', sourceRevision, project: 'other' },
    ]) assert.throws(() => createAnalysisSourceBundle(input), { code: 'ANALYSIS_SOURCE_BUNDLE_INVALID' });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('rejects a tampered file at the content-addressed destination', () => {
  const { repo, sourceRevision } = fixture();
  try {
    const outputDir = join(repo, 'out');
    const first = createAnalysisSourceBundle({ repoRoot: repo, outputDir, releaseId: 'dev139-analysis-a1', sourceRevision });
    writeFileSync(first.archivePath, 'tampered', 'utf8');
    assert.throws(
      () => createAnalysisSourceBundle({ repoRoot: repo, outputDir, releaseId: 'dev139-analysis-a1', sourceRevision }),
      { code: 'ANALYSIS_SOURCE_BUNDLE_INVALID' },
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
