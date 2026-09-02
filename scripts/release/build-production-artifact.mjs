import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_CONTRACT,
  PUBLIC_ENV_KEYS,
  canonicalJson,
  contractDigest,
  releaseTaskSlug,
  resolveReleaseTaskId,
  sha256,
} from './production-contract.mjs';
import {
  buildSanitizedChildEnv,
  resolveProductionPublicEnv,
} from './env-boundary.mjs';
import { createReleaseCapsule } from './release-capsule.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..', '..');

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

export async function buildProductionArtifact({
  releaseId = nowId(),
  parentEnv = process.env,
  taskId: requestedTaskId,
  productionEnvPath,
  requireFeatureEvidence = false,
} = {}) {
  const taskId = resolveReleaseTaskId(requestedTaskId);
  const publicEnv = resolveProductionPublicEnv({ root, parentEnv, envPath: productionEnvPath });
  const releaseRoot = path.join(root, 'output', 'release', releaseTaskSlug(taskId));
  const releaseDir = path.join(releaseRoot, releaseId);
  const distDir = path.join(releaseDir, 'dist');
  const envDir = path.join(releaseDir, 'env');
  fs.mkdirSync(envDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  const envFile = [`# Generated for ${taskId}; public production values only.`, ...PUBLIC_ENV_KEYS.filter(key => publicEnv[key] !== undefined).map(key => `${key}=${JSON.stringify(publicEnv[key])}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(envDir, '.env.production'), envFile, 'utf8');

  const childEnv = buildSanitizedChildEnv(parentEnv, {
    publicEnv,
    releaseEnvDir: envDir,
    releaseId,
    extra: { NODE_ENV: 'production' },
  });
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) throw new Error(`${taskId} P0: Vite executable is missing; install dependencies before sealed build.`);
  const buildResult = await run(process.execPath, [viteBin, 'build', '--mode', 'production', '--outDir', distDir, '--emptyOutDir'], { cwd: root, env: childEnv });
  if (buildResult.code !== 0) throw new Error(`${taskId} sealed build failed (exit ${buildResult.code}).`);

  const commit = await git(['rev-parse', 'HEAD']);
  const branch = await git(['branch', '--show-current']);
  const dirty = Boolean(await git(['status', '--porcelain']));
  const releaseMeta = {
    schemaVersion: 1,
    taskId,
    releaseId,
    createdAt: new Date().toISOString(),
    source: { commit, branch, dirty },
    target: { projectId: PRODUCTION_CONTRACT.projectId, siteId: PRODUCTION_CONTRACT.siteId, origin: PRODUCTION_CONTRACT.canonicalOrigin },
    environment: {
      backend: PRODUCTION_CONTRACT.backend,
      supabaseProjectRef: PRODUCTION_CONTRACT.supabaseProjectRef,
      authMode: PRODUCTION_CONTRACT.authMode,
      redirectUrl: PRODUCTION_CONTRACT.canonicalRedirectUrl,
      publicEnvSha256: sha256(canonicalJson(publicEnv)),
      authority: productionEnvPath ? 'external-file' : 'worktree-file',
    },
    contractSha256: contractDigest(),
  };
  writeJson(path.join(distDir, 'release-meta.json'), releaseMeta);
  writeJson(path.join(releaseDir, 'firebase.generated.json'), readFirebaseConfig());
  const tree = treeDigest(distDir);
  const manifest = {
    schemaVersion: 1,
    taskId,
    releaseId,
    source: releaseMeta.source,
    target: releaseMeta.target,
    environment: releaseMeta.environment,
    contractSha256: releaseMeta.contractSha256,
    gates: { featureAcceptanceRequired: Boolean(requireFeatureEvidence) },
    artifact: {
      releaseDir,
      distDir,
      firebaseConfig: path.join(releaseDir, 'firebase.generated.json'),
      treeSha256: tree.sha256,
      entries: tree.entries,
      entryHtml: 'index.html',
      entryAssets: entryAssets(distDir),
    },
  };
  const manifestPath = path.join(releaseDir, 'manifest.json');
  writeJson(manifestPath, manifest);
  const capsule = createReleaseCapsule(manifest);
  return { taskId, releaseId, releaseDir, distDir, manifestPath, manifest, capsule };
}

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replaceAll('-', '_');
    args[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  buildProductionArtifact({
    releaseId: typeof args.release_id === 'string' ? args.release_id : undefined,
    taskId: typeof args.task_id === 'string' ? args.task_id : undefined,
    productionEnvPath: typeof args.production_env === 'string' ? args.production_env : undefined,
    requireFeatureEvidence: Boolean(args.require_feature_evidence),
  }).then(result => {
    console.log(JSON.stringify({ ok: true, taskId: result.taskId, releaseId: result.releaseId, manifestPath: result.manifestPath, capsuleState: result.capsule.state }, null, 2));
  }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
