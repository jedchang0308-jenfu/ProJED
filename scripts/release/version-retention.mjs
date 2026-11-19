import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './production-contract.mjs';

export const DEFAULT_VERSION_RETENTION_DAYS = 14;
const catalogName = 'app-version-retention.json';
const safePath = value => typeof value === 'string' && !value.includes('..') && !value.includes('\\')
  && /^(?:assets\/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+|workbox-[A-Za-z0-9_-]+\.js|app-releases\/(?:release|build)-[A-Za-z0-9][A-Za-z0-9._-]{0,159}\/[A-Za-z0-9_./-]+)$/.test(value);

export function versionTreeEntries(distDir) {
  const entries = [];
  const visit = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error('DEV-141 version directory escapes artifact through a symbolic link.');
      if (item.isDirectory()) visit(full);
      else if (item.isFile()) {
        const name = path.relative(distDir, full).replaceAll(path.sep, '/');
        if (safePath(name)) {
          const bytes = fs.readFileSync(full);
          entries.push({ path: name, size: bytes.length, sha256: sha256(bytes) });
        }
      }
    }
  };
  visit(distDir);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function validateVersionRetention(catalog, actualEntries) {
  const errors = [];
  if (catalog?.schemaVersion !== 1 || !Number.isFinite(catalog.retentionDays) || catalog.retentionDays < 14
    || !Array.isArray(catalog.releases) || catalog.releases.length === 0) return ['version retention catalog invalid'];
  const versions = new Set();
  const actual = new Map(actualEntries.map(entry => [entry.path, entry]));
  for (const release of catalog.releases) {
    if (!/^(release|build):[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(release.version || '') || versions.has(release.version)
      || !Number.isFinite(Date.parse(release.createdAt)) || (release.supersededAt !== null && !Number.isFinite(Date.parse(release.supersededAt)))
      || (release.supersessionObservedAt != null && !Number.isFinite(Date.parse(release.supersessionObservedAt)))
      || !Array.isArray(release.entries)) { errors.push('version retention release invalid'); continue; }
    versions.add(release.version);
    const seen = new Set();
    for (const entry of release.entries) {
      if (!safePath(entry.path) || seen.has(entry.path)) errors.push('version retention path invalid');
      seen.add(entry.path);
      const found = actual.get(entry.path);
      if (!found || found.sha256 !== entry.sha256 || found.size !== entry.size) errors.push('version retention file mismatch');
    }
    if (!release.legacy) {
      const prefix = 'app-releases/' + release.version.replace(':', '-') + '/';
      if (!seen.has(prefix + 'index.html') || !seen.has(prefix + 'quick-task/index.html')) errors.push('version retention entry missing');
    }
  }
  return errors;
}

// Caller must authenticate previous production provenance before invoking this helper.
// Test fixtures use the same exact copy/retention logic without production credentials.
export function retainVersionHistory({ distDir, version, previousDistDir, previousVersion,
  retentionDays = DEFAULT_VERSION_RETENTION_DAYS, now = new Date().toISOString() }) {
  const days = Number(retentionDays);
  const time = Date.parse(now);
  if (!Number.isFinite(days) || days < 14 || days > 3650 || !Number.isFinite(time)) throw new Error('DEV-141 retention must be between 14 and 3650 days.');
  const destinationRoot = fs.realpathSync(distDir);
  const ownEntries = versionTreeEntries(destinationRoot);
  const current = { version, createdAt: now, supersededAt: null, supersessionObservedAt: null, entries: ownEntries,
    ...(!ownEntries.some(entry => entry.path.startsWith('app-releases/')) ? { legacy: true } : {}) };
  let previousReleases = [];
  const copiedEntries = [];
  if (previousDistDir) {
    if (fs.lstatSync(previousDistDir).isSymbolicLink()) throw new Error('DEV-141 invalid previous version directory.');
    const sourceRoot = fs.realpathSync(previousDistDir);
    if (sourceRoot === destinationRoot) throw new Error('DEV-141 cannot retain an artifact into itself.');
    const sourceEntries = versionTreeEntries(sourceRoot);
    const catalogPath = path.join(sourceRoot, catalogName);
    const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : null;
    if (catalog) {
      if (validateVersionRetention(catalog, sourceEntries).length) throw new Error('DEV-141 previous version catalog verification failed.');
      previousReleases = catalog.releases;
    } else {
      previousReleases = [{ version: previousVersion, createdAt: now, supersededAt: null, legacy: !sourceEntries.some(entry => entry.path.startsWith('app-releases/')), entries: sourceEntries }];
    }
    // Candidate build time is not deployment time. Only seeing an already
    // historical release in a subsequent predecessor starts its expiry clock.
    // The production caller also binds that predecessor to the live release.
    previousReleases = previousReleases.map(release => ({ ...release,
      supersededAt: release.supersededAt || now,
      supersessionObservedAt: release.supersessionObservedAt || (release.supersededAt ? now : null),
    })).filter(release => release.supersessionObservedAt === null
      || time - Date.parse(release.supersessionObservedAt) <= days * 86400000);
    if (previousReleases.some(release => release.version === version)) throw new Error('DEV-141 release identity must be unique.');
    const all = new Map(previousReleases.flatMap(release => release.entries).map(entry => [entry.path, entry]));
    // Validate every input before the first copy, including retained inherited files.
    for (const entry of all.values()) {
      if (!safePath(entry.path)) throw new Error('DEV-141 invalid retained path.');
      const source = path.join(sourceRoot, entry.path);
      const destination = path.join(destinationRoot, entry.path);
      let ancestor = path.dirname(destination);
      while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
      const resolvedAncestor = fs.realpathSync(ancestor);
      if (resolvedAncestor !== destinationRoot && !resolvedAncestor.startsWith(destinationRoot + path.sep)) throw new Error('DEV-141 retained directory escapes artifact.');
      const bytes = fs.readFileSync(source);
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('DEV-141 retained file hash mismatch.');
      if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || sha256(fs.readFileSync(destination)) !== entry.sha256)) throw new Error('DEV-141 immutable version URL collision.');
    }
    for (const entry of all.values()) {
      const destination = path.join(destinationRoot, entry.path);
      if (fs.existsSync(destination)) continue;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, entry.path), destination, fs.constants.COPYFILE_EXCL);
      copiedEntries.push(entry);
    }
  }
  const catalog = { schemaVersion: 1, retentionDays: days, releases: [...previousReleases, current] };
  const errors = validateVersionRetention(catalog, versionTreeEntries(destinationRoot));
  if (errors.length) throw new Error('DEV-141 invalid version catalog: ' + errors.join(', '));
  fs.writeFileSync(path.join(destinationRoot, catalogName), JSON.stringify(catalog, null, 2) + '\n');
  return { catalog, copiedEntries };
}
