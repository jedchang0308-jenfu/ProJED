import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const SOURCE_REVISION = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const INPUT_KEYS = ['outputDir', 'releaseId', 'repoRoot', 'sourceRevision'];
const MAX_GIT_OUTPUT = 256 * 1024 * 1024;

function invalid(message = 'Analysis source bundle input is outside the ProJED contract') {
  throw Object.assign(new Error(message), { code: 'ANALYSIS_SOURCE_BUNDLE_INVALID' });
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
}

function runGit(repoRoot, args, input) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: null,
    input,
    maxBuffer: MAX_GIT_OUTPUT,
    windowsHide: true,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) invalid('Git source read failed; no bundle was published');
  return result.stdout;
}

function gitText(repoRoot, args) {
  return runGit(repoRoot, args).toString('utf8').trim();
}

function parseGitTree(buffer) {
  const files = new Map();
  const gitlinks = [];
  for (const raw of buffer.toString('utf8').split('\0')) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    if (tab < 0) invalid('Git tree output is malformed');
    const [mode, type, oid] = raw.slice(0, tab).split(' ');
    const path = raw.slice(tab + 1);
    if (type === 'blob' && (mode === '100644' || mode === '100755')) files.set(path, { mode, oid });
    else if (type === 'commit' && mode === '160000') gitlinks.push({ path, oid });
    else invalid('Git tree contains an unsupported tracked entry');
  }
  return { files, gitlinks };
}

function headerText(header, start, length) {
  const end = header.indexOf(0, start);
  return header.subarray(start, end < 0 || end > start + length ? start + length : end).toString('utf8');
}

function headerOctal(header, start, length) {
  const value = headerText(header, start, length).trim();
  if (!/^[0-7]+$/.test(value)) invalid('Git archive contains an invalid tar header');
  return Number.parseInt(value, 8);
}

function gitBlobOid(bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function readGitBlobs(repoRoot, files) {
  const expected = [...files.values()];
  const output = runGit(repoRoot, ['cat-file', '--batch'], Buffer.from(`${expected.map(file => file.oid).join('\n')}\n`));
  const blobs = [];
  let offset = 0;
  for (const file of expected) {
    const newline = output.indexOf(10, offset);
    if (newline < 0) invalid('Git blob batch output is truncated');
    const header = output.subarray(offset, newline).toString('ascii').split(' ');
    if (header.length !== 3 || header[0] !== file.oid || header[1] !== 'blob' || !/^[0-9]+$/.test(header[2])) {
      invalid('Git blob batch output does not match the committed tree');
    }
    const size = Number.parseInt(header[2], 10);
    const dataStart = newline + 1;
    const dataEnd = dataStart + size;
    if (dataEnd >= output.length || output[dataEnd] !== 10) invalid('Git blob batch payload is truncated');
    blobs.push(output.subarray(dataStart, dataEnd));
    offset = dataEnd + 1;
  }
  if (offset !== output.length) invalid('Git blob batch output contains unexpected bytes');
  return blobs;
}

function writeText(header, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) invalid('Tracked path cannot be represented by a portable tar header');
  bytes.copy(header, offset);
}

function writeOctal(header, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length !== length - 1) invalid('Tracked file metadata exceeds the tar header limit');
  header.write(text, offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  for (let index = path.lastIndexOf('/'); index > 0; index = path.lastIndexOf('/', index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  invalid('Tracked path cannot be represented by a portable tar header');
}

function canonicalTar(files, blobs, objectFormat) {
  const chunks = [];
  let index = 0;
  for (const [path, expected] of files) {
    const bytes = blobs[index++];
    if (gitBlobOid(bytes, objectFormat) !== expected.oid) invalid('Git blob bytes differ from the committed tree');
    const header = Buffer.alloc(512);
    const { name, prefix } = splitTarPath(path);
    writeText(header, 0, 100, name);
    writeOctal(header, 100, 8, expected.mode === '100755' ? 0o755 : 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, bytes.length);
    writeOctal(header, 136, 12, 0);
    header.fill(32, 148, 156);
    header[156] = 48;
    writeText(header, 257, 6, 'ustar');
    writeText(header, 263, 2, '00');
    writeText(header, 345, 155, prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
    header.write(checksum, 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 32;
    chunks.push(header, bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function verifyTarAgainstGit(tar, expectedFiles, objectFormat) {
  const seen = new Set();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = headerText(header, 0, 100);
    const prefix = headerText(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = headerOctal(header, 124, 12);
    const mode = headerOctal(header, 100, 8);
    const type = header[156];
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) invalid('Git archive is truncated');
    if (type === 0 || type === 48) {
      const expected = expectedFiles.get(path);
      if (!expected || seen.has(path)) invalid('Git archive contains an unexpected or duplicate file');
      const bytes = tar.subarray(dataStart, dataEnd);
      if (gitBlobOid(bytes, objectFormat) !== expected.oid) invalid('Git archive bytes differ from the committed blob');
      const executable = (mode & 0o111) !== 0;
      if (executable !== (expected.mode === '100755')) invalid('Git archive executable mode differs from the committed tree');
      seen.add(path);
    } else if (type !== 53 && type !== 103 && type !== 120) {
      invalid('Git archive contains an unsupported tar entry');
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (seen.size !== expectedFiles.size) invalid('Git archive is missing committed files');
  return seen.size;
}

/** Create one deterministic local archive from committed Git blobs only.
 * This writes no provider state and intentionally ignores the working tree. */
export function createAnalysisSourceBundle(input) {
  exactKeys(input, INPUT_KEYS);
  const { outputDir, releaseId, repoRoot, sourceRevision } = input;
  if (typeof repoRoot !== 'string' || !repoRoot || typeof outputDir !== 'string' || !outputDir
      || !SOURCE_REVISION.test(sourceRevision ?? '') || !RELEASE_ID.test(releaseId ?? '')) invalid();
  const root = resolve(repoRoot);
  const outputRoot = resolve(outputDir);
  const commit = gitText(root, ['rev-parse', '--verify', `${sourceRevision}^{commit}`]);
  if (commit !== sourceRevision) invalid('Source revision does not resolve to the exact commit');
  const tree = gitText(root, ['rev-parse', `${sourceRevision}^{tree}`]);
  const objectFormat = gitText(root, ['rev-parse', '--show-object-format']);
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') invalid('Git object format is unsupported');
  const tracked = parseGitTree(runGit(root, ['ls-tree', '-rz', sourceRevision]));
  const blobs = readGitBlobs(root, tracked.files);
  const tar = canonicalTar(tracked.files, blobs, objectFormat);
  const fileCount = verifyTarAgainstGit(tar, tracked.files, objectFormat);
  const archive = gzipSync(tar, { level: 9, mtime: 0 });
  const archiveSha256 = createHash('sha256').update(archive).digest('hex');
  const filename = `source-${archiveSha256}.tar.gz`;
  mkdirSync(outputRoot, { recursive: true });
  const archivePath = resolve(outputRoot, filename);
  if (!archivePath.startsWith(`${outputRoot}${sep}`)) invalid('Bundle output escaped its target directory');
  let reused = false;
  if (existsSync(archivePath)) {
    const existing = readFileSync(archivePath);
    if (!existing.equals(archive)) invalid('Existing bundle does not match its content-addressed name');
    reused = true;
  } else {
    const pending = `${archivePath}.pending-${process.pid}`;
    try {
      writeFileSync(pending, archive, { flag: 'wx', mode: 0o600 });
      renameSync(pending, archivePath);
    } finally {
      rmSync(pending, { force: true });
    }
  }
  return {
    status: 'PASS',
    providerOperation: false,
    sourceRevision,
    sourceTree: tree,
    releaseId,
    archivePath,
    archiveSha256,
    archiveBytes: archive.length,
    tarBytes: tar.length,
    fileCount,
    excludedGitlinks: tracked.gitlinks,
    sourceObject: `dev139/${releaseId}/${filename}`,
    reused,
  };
}
