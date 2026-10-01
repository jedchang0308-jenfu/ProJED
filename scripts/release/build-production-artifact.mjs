import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_CONTRACT,
  PUBLIC_ENV_KEYS,
  contractDigest,
  sha256,
} from './production-contract.mjs';
import {
  buildSanitizedChildEnv,
  resolveProductionPublicEnv,
} from './env-boundary.mjs';
import { verifyManifest } from './verify-production-artifact.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..', '..');
const releaseRoot = path.join(root, 'output', 'release', 'dev-083');

const nowId = () => {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

const git = async (args) => {
  const result = await run('git', args, { cwd: root, env: process.env });
  return result.code === 0 ? result.stdout.trim() : '';
};

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

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

const treeDigest = dist => {
  const entries = walkFiles(dist).map(filePath => {
    const relativePath = path.relative(dist, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath);
    return { path: relativePath, size: content.length, sha256: sha256(content) };
  });
  return { sha256: sha256(entries.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}`).join('\n')), entries };
};

const entryAssets = dist => {
  const indexPath = path.join(dist, 'index.html');
  if (!fs.existsSync(indexPath)) return [];
  const html = fs.readFileSync(indexPath, 'utf8');
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(value => value.startsWith('/'))
    .map(value => value.slice(1))
    .filter(value => fs.existsSync(path.join(dist, value)));
};

const readFirebaseConfig = () => {
  const configPath = path.join(root, 'firebase.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.hosting) throw new Error('DEV-083 P1: firebase.json has no hosting configuration.');
  return { ...config, hosting: { ...config.hosting, public: 'dist' } };
};

// Retain one previous artifact's own immutable assets. Exclude its inherited
// retention so each deployment stays bounded rather than accumulating history.
export function retainPreviousAssets({ distDir, previousManifestPath }) {
  const previous = JSON.parse(fs.readFileSync(previousManifestPath, 'utf8'));
  const previousDist = path.resolve(previous.artifact?.distDir || '');
  const destinationDist = fs.realpathSync(distDir);
  if (!previous.artifact?.distDir || fs.lstatSync(previousDist).isSymbolicLink()
    || previousDist === destinationDist) throw new Error('DEV-134 invalid previous artifact directory.');
  const previousRoot = fs.realpathSync(previousDist);
  for (const file of walkFiles(previousRoot)) {
    if (fs.lstatSync(file).isSymbolicLink() || !fs.realpathSync(file).startsWith(previousRoot + path.sep)) {
      throw new Error('DEV-134 previous artifact contains a symbolic link.');
    }
  }
  const verified = verifyManifest(previousManifestPath, { root });
  if (!verified.ok || previous.source?.dirty !== false) throw new Error('DEV-134 previous production artifact verification failed.');
  const inherited = new Set((previous.artifact.compatibility?.entries || []).map(entry => entry.path));
  const entries = previous.artifact.entries.filter(entry => !inherited.has(entry.path)
    && (/^assets\/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/.test(entry.path) || /^workbox-[A-Za-z0-9_-]+\.js$/.test(entry.path)));
  const seen = new Set();
  // Validate the whole selected set before copying anything.
  for (const entry of entries) {
    if (seen.has(entry.path) || entry.path.includes('..')) throw new Error('DEV-134 invalid retained asset path.');
    seen.add(entry.path);
    const source = path.resolve(previousRoot, entry.path);
    const destination = path.resolve(destinationDist, entry.path);
    const destinationParent = path.dirname(destination);
    if (!source.startsWith(previousRoot + path.sep) || !destination.startsWith(destinationDist + path.sep)) {
      throw new Error('DEV-134 retained asset escapes its artifact.');
    }
    if (fs.existsSync(destinationParent)
      && fs.realpathSync(destinationParent) !== destinationDist
      && !fs.realpathSync(destinationParent).startsWith(destinationDist + path.sep)) {
      throw new Error('DEV-134 retained asset directory escapes its artifact.');
    }
    const bytes = fs.readFileSync(source);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('DEV-134 retained asset hash mismatch.');
    if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink()
      || sha256(fs.readFileSync(destination)) !== entry.sha256)) throw new Error('DEV-134 immutable asset URL collision.');
  }
  const copiedEntries = [];
  for (const entry of entries) {
    const destination = path.join(destinationDist, entry.path);
    if (fs.existsSync(destination)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(previousRoot, entry.path), destination, fs.constants.COPYFILE_EXCL);
    copiedEntries.push(entry);
  }
  return { schemaVersion: 1, sourceReleaseId: previous.releaseId, sourceTreeSha256: previous.artifact.treeSha256, entries: copiedEntries };
}

export async function buildProductionArtifact({ releaseId = nowId(), parentEnv = process.env,
  previousManifestPath = parentEnv.PROJED_PREVIOUS_RELEASE_MANIFEST, requirePreviousAssets = false } = {}) {
  if (requirePreviousAssets && !previousManifestPath) throw new Error('DEV-134 release requires --previous-manifest bound to the current live artifact.');
  const publicEnv = resolveProductionPublicEnv({ root, parentEnv });
  const releaseDir = path.join(releaseRoot, releaseId);
  const distDir = path.join(releaseDir, 'dist');
  const envDir = path.join(releaseDir, 'env');
  fs.mkdirSync(envDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  const envFile = ['# Generated by DEV-083; public production values only.', ...PUBLIC_ENV_KEYS.filter(key => publicEnv[key] !== undefined).map(key => `${key}=${JSON.stringify(publicEnv[key])}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(envDir, '.env.production'), envFile, 'utf8');

  const childEnv = buildSanitizedChildEnv(parentEnv, {
    publicEnv,
    releaseEnvDir: envDir,
    releaseId,
    extra: { NODE_ENV: 'production' },
  });
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) throw new Error('DEV-083 P0: Vite executable is missing; install dependencies before sealed build.');
  const buildResult = await run(process.execPath, [viteBin, 'build', '--mode', 'production', '--outDir', distDir, '--emptyOutDir'], { cwd: root, env: childEnv });
  if (buildResult.code !== 0) throw new Error(`DEV-083 sealed build failed (exit ${buildResult.code}).`);
  const compatibility = previousManifestPath ? retainPreviousAssets({ distDir, previousManifestPath }) : undefined;

  const commit = await git(['rev-parse', 'HEAD']);
  const branch = await git(['branch', '--show-current']);
  const dirty = Boolean(await git(['status', '--porcelain']));
  const releaseMeta = {
    schemaVersion: 1,
    taskId: PRODUCTION_CONTRACT.taskId,
    releaseId,
    createdAt: new Date().toISOString(),
    source: { commit, branch, dirty },
    target: { projectId: PRODUCTION_CONTRACT.projectId, siteId: PRODUCTION_CONTRACT.siteId, origin: PRODUCTION_CONTRACT.canonicalOrigin },
    environment: { backend: PRODUCTION_CONTRACT.backend, supabaseProjectRef: PRODUCTION_CONTRACT.supabaseProjectRef, authMode: PRODUCTION_CONTRACT.authMode, redirectUrl: PRODUCTION_CONTRACT.canonicalRedirectUrl },
    contractSha256: contractDigest(),
  };
  writeJson(path.join(distDir, 'release-meta.json'), releaseMeta);
  writeJson(path.join(releaseDir, 'firebase.generated.json'), readFirebaseConfig());
  const tree = treeDigest(distDir);
  const manifest = {
    schemaVersion: 1,
    taskId: PRODUCTION_CONTRACT.taskId,
    releaseId,
    source: releaseMeta.source,
    target: releaseMeta.target,
    environment: releaseMeta.environment,
    contractSha256: releaseMeta.contractSha256,
    artifact: {
      releaseDir,
      distDir,
      firebaseConfig: path.join(releaseDir, 'firebase.generated.json'),
      treeSha256: tree.sha256,
      entries: tree.entries,
      entryHtml: 'index.html',
      entryAssets: entryAssets(distDir),
      ...(compatibility ? { compatibility } : {}),
    },
  };
  const manifestPath = path.join(releaseDir, 'manifest.json');
  writeJson(manifestPath, manifest);
  return { releaseId, releaseDir, distDir, manifestPath, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  buildProductionArtifact().then(result => {
    console.log(JSON.stringify({ ok: true, taskId: PRODUCTION_CONTRACT.taskId, releaseId: result.releaseId, manifestPath: result.manifestPath }, null, 2));
  }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
