import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { retainHttpVersionHistory } from './lib/dev139-http-version-retention.mjs';
import { writeHttpArtifactManifest } from './lib/dev139-http-artifact.mjs';

const root = process.cwd();
const releaseId = String(process.env.PROJED_RELEASE_ID ?? '').trim();
if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) {
  throw new Error('PROJED_RELEASE_ID is required and must be filesystem-safe');
}
const buildMode = process.env.PROJED_HTTP_BUILD_MODE ?? 'candidate';
if (!['candidate', 'legacy-entry'].includes(buildMode)) throw new Error('HTTP build mode is invalid');
const previousManifestPath = process.env.PROJED_PREVIOUS_RELEASE_MANIFEST;
const sourceRevision = process.env.PROJED_SOURCE_REVISION || process.env.GITHUB_SHA || null;
if (sourceRevision !== null && !/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('HTTP source revision is invalid');
if (buildMode === 'legacy-entry' && !previousManifestPath) {
  throw new Error('Old-origin HTTP build requires its verified predecessor manifest');
}
if (buildMode === 'legacy-entry' && sourceRevision === null) throw new Error('Old-origin HTTP build requires its source revision');

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${args[0] ?? command} failed`);
  }
};

const safeKeys = [
  'PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI', 'NO_COLOR', 'npm_config_cache',
];
const childEnv = Object.fromEntries(safeKeys
  .filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
const envDir = mkdtempSync(join(tmpdir(), 'projed-dev139-cloud-run-env-'));

try {
  Object.assign(childEnv, {
    NODE_ENV: 'production',
    PROJED_RELEASE_ID: releaseId,
    PROJED_RELEASE_ENV_DIR: envDir,
    PROJED_RELEASE_PROFILE: 'dev139-http',
    VITE_DATA_BACKEND: 'http',
    VITE_SUPABASE_AUTH_MODE: '',
    VITE_SUPABASE_AUTO_TEST_LOGIN: 'false',
    VITE_SUPABASE_TEST_EMAIL: '',
    VITE_SUPABASE_TEST_PASSWORD: '',
  });
  run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.server.build.json'], childEnv);
  run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.dev139.jobs.build.json'], childEnv);
  run(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--mode', 'production', '--outDir', 'dist', '--emptyOutDir'], childEnv);

  const index = readFileSync(resolve('dist/index.html'));
  const quick = readFileSync(resolve('dist/quick-task/index.html'));
  const serverEntry = resolve('dist-server/server/index.js');
  if (!statSync(serverEntry).isFile()) throw new Error('Compiled server entry is missing');

  const retained = retainHttpVersionHistory({ distDir: resolve('dist'), releaseId, previousManifestPath,
    requirePreviousAssets: buildMode === 'legacy-entry' });

  const sha256 = value => createHash('sha256').update(value).digest('hex');
  writeFileSync(resolve('dist/dev139-cloud-run-meta.json'), `${JSON.stringify({
    schemaVersion: 1,
    releaseId,
    backend: 'http',
    buildMode,
    previousAssets: retained.previousAssets,
    sourceRevision,
    entrySha256: sha256(index),
    quickEntrySha256: sha256(quick),
  }, null, 2)}\n`, 'utf8');
  writeHttpArtifactManifest({ distDir: resolve('dist'), releaseId, sourceRevision, manifestPath: resolve('http-artifact-manifest.json') });
  process.stdout.write(`${JSON.stringify({ status: 'PASS', releaseId, backend: 'http', buildMode,
    previousAssets: retained.previousAssets })}\n`);
} finally {
  rmSync(envDir, { recursive: true, force: true });
}
