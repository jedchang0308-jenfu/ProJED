import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { sha256 } from '../release/production-contract.mjs';
import { scanArtifact, verifyManifest } from '../release/verify-production-artifact.mjs';
import { validateVersionRetention, versionTreeEntries } from '../release/version-retention.mjs';

export function httpArtifactTree(distDir) {
  if (lstatSync(distDir).isSymbolicLink()) throw new Error('Public artifact cannot be a symbolic link');
  const root = realpathSync(distDir), entries = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Public artifact cannot contain symbolic links');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        const bytes = readFileSync(file);
        entries.push({ path: relative(root, file).split(sep).join('/'), size: bytes.length, sha256: sha256(bytes) });
      }
    }
  };
  visit(root);
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { entries, treeSha256: sha256(entries.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}`).join('\n')) };
}

export function writeHttpArtifactManifest({ distDir, releaseId, sourceRevision, manifestPath }) {
  const output = resolve(manifestPath), root = realpathSync(distDir);
  if (output === root || output.startsWith(root + sep)) throw new Error('HTTP manifest must be outside its public tree');
  if (sourceRevision !== null && !/^[a-f0-9]{40}$/.test(sourceRevision ?? '')) throw new Error('HTTP source revision is invalid');
  const tree = httpArtifactTree(root);
  const catalog = JSON.parse(readFileSync(join(root, 'app-version-retention.json'), 'utf8'));
  const manifest = { schemaVersion: 1, kind: 'projed.http-artifact.v1', taskId: 'DEV-139', backend: 'http',
    releaseId, sourceRevision, artifact: { distDir: root, ...tree, versionRetention: catalog } };
  writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function verifyHttpArtifact(manifestPath, { distDir, root = process.cwd() } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const directory = distDir ?? manifest.artifact?.distDir;
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'projed.http-artifact.v1'
      || manifest.taskId !== 'DEV-139' || manifest.backend !== 'http'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(manifest.releaseId ?? '')
      || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision ?? '') || !directory) {
    throw new Error('HTTP predecessor manifest is incomplete or candidate-only');
  }
  const tree = httpArtifactTree(directory);
  if (tree.treeSha256 !== manifest.artifact.treeSha256 || JSON.stringify(tree.entries) !== JSON.stringify(manifest.artifact.entries)) {
    throw new Error('HTTP predecessor file manifest mismatch');
  }
  const catalog = JSON.parse(readFileSync(join(directory, 'app-version-retention.json'), 'utf8'));
  const version = `release:${manifest.releaseId}`;
  const current = catalog.releases?.filter(release => release.supersededAt === null) ?? [];
  if (JSON.stringify(catalog) !== JSON.stringify(manifest.artifact.versionRetention)
      || validateVersionRetention(catalog, tree.entries).length || current.length !== 1
      || current[0].version !== version || current[0].legacy) throw new Error('HTTP predecessor retention is invalid');
  for (const entry of ['index.html', 'quick-task/index.html']) {
    const html = readFileSync(join(directory, 'app-releases', version.replace(':', '-'), entry), 'utf8');
    if (!html.includes(`name="projed-shell-version" content="${version}"`)) throw new Error('HTTP predecessor HTML identity mismatch');
  }
  const meta = JSON.parse(readFileSync(join(directory, 'dev139-cloud-run-meta.json'), 'utf8'));
  if (meta.backend !== 'http' || meta.releaseId !== manifest.releaseId || meta.sourceRevision !== manifest.sourceRevision
      || sha256(readFileSync(join(directory, 'index.html'))) !== meta.entrySha256
      || sha256(readFileSync(join(directory, 'quick-task/index.html'))) !== meta.quickEntrySha256
      || !scanArtifact({ distDir: directory, root }).ok) throw new Error('HTTP predecessor metadata or public content is invalid');
  return { manifest, distDir: realpathSync(directory), tree };
}

/** Authenticate files locally; caller still binds the selected predecessor to
 * actual live release/image provenance before a real old-origin publication. */
export function verifyPublicPredecessor(manifestPath, { distDir, root = process.cwd() } = {}) {
  const bytes = readFileSync(manifestPath), manifest = JSON.parse(bytes.toString('utf8'));
  const selection = join(dirname(resolve(manifestPath)), 'predecessor-selection.json');
  if (!distDir && existsSync(selection)) {
    const staged = JSON.parse(readFileSync(selection, 'utf8'));
    if (staged.kind !== 'projed.predecessor-stage.v1' || staged.distDir !== 'dist'
        || staged.manifestSha256 !== sha256(bytes) || staged.treeSha256 !== manifest.artifact?.treeSha256) {
      throw new Error('Portable predecessor selection mismatch');
    }
    distDir = join(dirname(resolve(manifestPath)), 'dist');
  }
  if (manifest.kind === 'projed.http-artifact.v1') return { ...verifyHttpArtifact(manifestPath, { distDir, root }), manifestSha256: sha256(bytes) };
  const directory = distDir ?? manifest.artifact?.distDir;
  if (!directory) throw new Error('Previous production artifact directory is missing');
  versionTreeEntries(directory); // Preserve the existing no-symlink policy.
  const verified = verifyManifest(manifestPath, { root, distDir: directory });
  if (!verified.ok || manifest.source?.dirty !== false) throw new Error('Previous production artifact verification failed');
  return { manifest, manifestSha256: sha256(bytes), distDir: realpathSync(directory),
    tree: { entries: manifest.artifact.entries, treeSha256: manifest.artifact.treeSha256 } };
}
