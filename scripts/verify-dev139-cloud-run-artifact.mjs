import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const releaseId = 'dev139-cloud-run-verify';
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

run(['scripts/build-dev139-cloud-run.mjs'], { ...process.env, PROJED_RELEASE_ID: releaseId });

const dockerfile = readFileSync('Dockerfile.dev139', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');
assert.match(dockerfile, /node:24\.12\.0-bookworm-slim/);
assert.match(dockerfile, /npm run build:dev-139:cloud-run/);
assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
assert.match(dockerfile, /USER node/);
assert.match(dockerfile, /CMD \["node", "dist-server\/index\.js"\]/);
assert.doesNotMatch(dockerfile, /PROJED_DATABASE_URL|PROJED_RUNTIME_BINDING_JSON|password|secret/i);
for (const entry of ['.git', 'node_modules', 'dist', 'output', '.env.*']) assert.match(dockerignore, new RegExp(`^${entry.replace('.', '\\.')}\r?$`, 'm'));

for (const path of ['dist/index.html', 'dist/quick-task/index.html', 'dist/dev139-cloud-run-meta.json', 'dist-server/index.js']) {
  assert.equal(statSync(resolve(path)).isFile(), true, `missing ${path}`);
}
const meta = JSON.parse(readFileSync('dist/dev139-cloud-run-meta.json', 'utf8'));
assert.deepEqual({ releaseId: meta.releaseId, backend: meta.backend }, { releaseId, backend: 'http' });
assert.equal(meta.entrySha256, createHash('sha256').update(readFileSync('dist/index.html')).digest('hex'));
assert.equal(meta.quickEntrySha256, createHash('sha256').update(readFileSync('dist/quick-task/index.html')).digest('hex'));

const binding = JSON.parse(run([
  'scripts/create-dev139-managed-binding.mjs',
  '--instance=jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
]));
const managedProfile = JSON.parse(readFileSync('config/dev-139/s3-managed.profile.json', 'utf8'));
assert.deepEqual(binding.migrationSha256, Object.fromEntries(managedProfile.migrations.map(({ path }) => [
  path, createHash('sha256').update(readFileSync(path)).digest('hex'),
])));
assert.equal(binding.databaseName, 'jenfu_prod');
assert.equal(binding.cloudSqlInstance, 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg');
assert.equal(Object.keys(binding).some(key => /password|secret|credential/i.test(key)), false);
assert.equal(binding.staticFixtureSha256, createHash('sha256').update(readFileSync('dist/dev139-cloud-run-meta.json')).digest('hex'));

const { loadRuntimeConfig } = await import(`../dist-server/config.js?verify=${Date.now()}`);
const config = loadRuntimeConfig({
  PROJED_ENV: 'managed',
  PROJED_APP_ENTRY: 'main',
  PROJED_RUNTIME_BINDING_JSON: JSON.stringify(binding),
  PROJED_DATABASE_URL: `postgresql://${binding.runtimeRole}:not-a-secret@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg`,
  PROJED_PUBLIC_APP_URL: 'https://projed.example.com',
  PORT: '8080',
});
assert.equal(config.host, '0.0.0.0');
assert.equal(config.port, 8080);
assert.equal(config.env, 'managed');
assert.equal(config.entry, 'main');
assert.equal(config.staticRoot, resolve('dist'));

console.log(JSON.stringify({
  status: 'PASS',
  releaseId,
  backend: meta.backend,
  migrationCount: Object.keys(binding.migrationSha256).length,
  dockerExecution: 'NOT_RUN',
}));
