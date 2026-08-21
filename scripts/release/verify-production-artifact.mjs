import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_CONTRACT,
  contractDigest,
  isLoopbackUrl,
  sha256,
} from './production-contract.mjs';
import { collectTestPublicForbiddenValues } from './env-boundary.mjs';

const walkFiles = dir => {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(full);
    }
  };
  visit(dir);
  return files.sort((a, b) => a.localeCompare(b));
};

const digestTree = dist => {
  const entries = walkFiles(dist).map(filePath => {
    const relativePath = path.relative(dist, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath);
    return { path: relativePath, size: content.length, sha256: sha256(content) };
  });
  return { sha256: sha256(entries.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}`).join('\n')), entries };
};

const isVendor = relativePath => /(?:vendor|node_modules|react|supabase|firebase)/i.test(relativePath);
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]+/i,
  /\bsbp_[A-Za-z0-9_-]+/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /SUPABASE_DB_PASSWORD/i,
  /SUPABASE_ACCESS_TOKEN/i,
  /GEMINI_API_KEY/i,
  /"role"\s*:\s*"service_role"/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
];

export function scanArtifact({ distDir, root = process.cwd() } = {}) {
  if (!distDir || !fs.existsSync(distDir)) throw new Error('DEV-083 P0: artifact dist directory is missing.');
  const errors = [];
  const testValues = collectTestPublicForbiddenValues({ root });
  const supabaseRefPattern = /https:\/\/([a-z0-9]+)\.supabase\.co/gi;
  for (const filePath of walkFiles(distDir)) {
    const relativePath = path.relative(distDir, filePath).replaceAll(path.sep, '/');
    const bytes = fs.readFileSync(filePath);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(supabaseRefPattern)) {
      if (match[1] !== PRODUCTION_CONTRACT.supabaseProjectRef) errors.push(`${relativePath}: non-production Supabase ref`);
    }
    if (!isVendor(relativePath)) {
      const urls = text.match(/https?:\/\/[^\s"'`<>]+/gi) ?? [];
      for (const url of urls) if (isLoopbackUrl(url)) errors.push(`${relativePath}: app-owned loopback URL`);
    }
    for (const value of testValues) if (value && text.includes(value)) errors.push(`${relativePath}: test-only public value detected`);
    for (const pattern of secretPatterns) if (pattern.test(text)) errors.push(`${relativePath}: server secret pattern detected`);
  }
  return { ok: errors.length === 0, errors };
}

export function verifyManifest(manifestPath, { root = process.cwd() } = {}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error('DEV-083 P1: manifest path is missing.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];
  if (manifest.taskId !== PRODUCTION_CONTRACT.taskId) errors.push('manifest task id mismatch');
  if (manifest.target?.projectId !== PRODUCTION_CONTRACT.projectId) errors.push('Firebase project mismatch');
  if (manifest.target?.origin !== PRODUCTION_CONTRACT.canonicalOrigin) errors.push('canonical origin mismatch');
  if (manifest.environment?.supabaseProjectRef !== PRODUCTION_CONTRACT.supabaseProjectRef) errors.push('Supabase project mismatch');
  if (manifest.environment?.redirectUrl !== PRODUCTION_CONTRACT.canonicalRedirectUrl) errors.push('redirect URL mismatch');
  if (manifest.contractSha256 !== contractDigest()) errors.push('production contract digest mismatch');
  const distDir = manifest.artifact?.distDir;
  const tree = distDir && fs.existsSync(distDir) ? digestTree(distDir) : null;
  if (!tree) errors.push('artifact dist directory missing');
  else if (tree.sha256 !== manifest.artifact.treeSha256) errors.push('artifact tree digest mismatch');
  const metaPath = distDir ? path.join(distDir, 'release-meta.json') : '';
  if (!metaPath || !fs.existsSync(metaPath)) errors.push('release-meta.json missing');
  else {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.releaseId !== manifest.releaseId) errors.push('release metadata id mismatch');
    if (meta.contractSha256 !== manifest.contractSha256) errors.push('release metadata contract mismatch');
  }
  if (distDir) {
    const scan = scanArtifact({ distDir, root });
    errors.push(...scan.errors);
  }
  return { ok: errors.length === 0, errors, manifest };
}

const latestManifest = () => {
  const root = path.resolve(process.cwd(), 'output', 'release', 'dev-083');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
  return dirs.map(dir => path.join(root, dir, 'manifest.json')).find(fs.existsSync) ?? null;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const index = process.argv.indexOf('--manifest');
  const manifestPath = index >= 0 ? process.argv[index + 1] : latestManifest();
  try {
    const result = verifyManifest(manifestPath);
    console.log(JSON.stringify({ ok: result.ok, manifestPath, releaseId: result.manifest?.releaseId, errors: result.errors }, null, 2));
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
