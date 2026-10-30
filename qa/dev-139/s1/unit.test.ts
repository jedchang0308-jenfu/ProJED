import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { validateServerActor, type ServerActorV1 } from '../../../server/actorTransaction.js';
import {
  loadSourceProfile,
  sha256,
  validateRuntimeBinding,
  validateRuntimeDatabaseUrl,
  validateStaticRoot,
  type RuntimeBinding,
} from '../../../server/config.js';

const profilePath = resolve('config/dev-139/s1-disposable.profile.json');
const loaded = loadSourceProfile(profilePath);
const managed = loadSourceProfile(resolve('config/dev-139/s3-managed.profile.json'));
const databaseName = `dev139_s1_${'a'.repeat(32)}`;
const managedIamLogins = {
  runtime: 'projed-prod-runtime@projed-cc78d.iam',
  migrator: 'projed-prod-migrator@projed-cc78d.iam',
  importer: 'projed-prod-importer@projed-cc78d.iam',
};

function validBinding(): RuntimeBinding {
  return {
    databaseName,
    databasePort: 55432,
    runtimeRole: loaded.profile.roles.runtime,
    profileSha256: loaded.sha256,
    migrationSha256: Object.fromEntries(loaded.profile.migrations.map(({ path }) => [path, sha256(readFileSync(path))])),
    staticFixtureSha256: sha256(readFileSync('qa/dev-139/s1/static/index.html')),
  };
}

test('source profile and owned runtime binding are accepted', () => {
  const binding = validBinding();
  validateRuntimeBinding(binding, loaded.profile, loaded.sha256);
  const url = validateRuntimeDatabaseUrl(
    `postgresql://${binding.runtimeRole}:secret@127.0.0.1:${binding.databasePort}/${binding.databaseName}`,
    binding,
  );
  assert.equal(url.hostname, '127.0.0.1');
});

test('remote, wrong role, options and stale profile bindings are rejected', () => {
  const binding = validBinding();
  const candidates = [
    `postgresql://${binding.runtimeRole}:secret@localhost:${binding.databasePort}/${binding.databaseName}`,
    `postgresql://postgres:secret@127.0.0.1:${binding.databasePort}/${binding.databaseName}`,
    `postgresql://${binding.runtimeRole}:secret@127.0.0.1:${binding.databasePort}/${binding.databaseName}?options=-csearch_path%3Dpublic`,
  ];
  for (const value of candidates) assert.throws(() => validateRuntimeDatabaseUrl(value, binding), /outside/);
  assert.throws(() => validateRuntimeBinding({ ...binding, profileSha256: '0'.repeat(64) }, loaded.profile, loaded.sha256));
});

test('managed profile accepts only its exact Cloud SQL IAM binding and runtime login', () => {
  const binding: RuntimeBinding = {
    databaseName: 'jenfu_prod',
    databasePort: 5432,
    runtimeRole: managed.profile.roles.runtime,
    connectionMode: 'cloud-sql-iam',
    cloudSqlInstance: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    iamLogins: managedIamLogins,
    profileSha256: managed.sha256,
    migrationSha256: Object.fromEntries(managed.profile.migrations.map(({ path }) => [path, sha256(readFileSync(path))])),
    staticFixtureSha256: '0'.repeat(64),
  };
  validateRuntimeBinding(binding, managed.profile, managed.sha256);
  const runtimeDatabaseUrl = `postgresql://${encodeURIComponent(managedIamLogins.runtime)}@127.0.0.1:5432/jenfu_prod`;
  const url = validateRuntimeDatabaseUrl(
    runtimeDatabaseUrl,
    binding,
    'runtime',
  );
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5432');
  assert.equal(decodeURIComponent(url.username), managedIamLogins.runtime);
  assert.equal(url.password, '');
  for (const value of [
    `postgresql://${encodeURIComponent(managedIamLogins.runtime)}@10.0.0.2:5432/jenfu_prod`,
    `postgresql://${encodeURIComponent('projed-prod-runtime@other-project.iam')}@127.0.0.1:5432/jenfu_prod`,
    `postgresql://${encodeURIComponent(managedIamLogins.runtime)}@127.0.0.1:5432/jenfu_prod?options=-csearch_path%3Dpublic`,
    `postgresql://${encodeURIComponent(managedIamLogins.runtime)}@127.0.0.1:5432/projed`,
    `postgresql://${encodeURIComponent(managedIamLogins.runtime)}:static-password@127.0.0.1:5432/jenfu_prod`,
  ]) assert.throws(() => validateRuntimeDatabaseUrl(value, binding, 'runtime'), /outside/);
  assert.throws(() => validateRuntimeDatabaseUrl(runtimeDatabaseUrl, binding, 'migrator'), /outside/);
  assert.throws(() => validateRuntimeBinding({ ...binding, cloudSqlInstance: '../socket' }, managed.profile, managed.sha256));
  const wrongModeBinding = { ...binding, connectionMode: 'cloud-sql-unix' } as unknown as RuntimeBinding;
  assert.throws(() => validateRuntimeBinding(wrongModeBinding, managed.profile, managed.sha256));
  assert.throws(() => validateRuntimeBinding({
    ...binding,
    iamLogins: { ...managedIamLogins, runtime: 'projed-prod-runtime@other-project.iam' },
  }, managed.profile, managed.sha256));
  const extraIamLogins = { ...managedIamLogins, operator: 'projed-prod-operator@projed-cc78d.iam' } as unknown as RuntimeBinding['iamLogins'];
  assert.throws(() => validateRuntimeBinding({
    ...binding,
    iamLogins: extraIamLogins,
  }, managed.profile, managed.sha256));
  for (const cloudSqlInstance of ['jenfu-prod:asia-east1:projed', 'other-prod:asia-east1:jenfu-platform-prod-pg']) {
    assert.throws(() => validateRuntimeBinding({ ...binding, cloudSqlInstance }, managed.profile, managed.sha256));
  }
  assert.throws(() => validateRuntimeBinding({ ...binding, databaseName: 'projed' }, managed.profile, managed.sha256));
  assert.throws(() => validateRuntimeBinding({ ...binding, databaseName: 'jenfu_dev' }, managed.profile, managed.sha256));
});

test('static entry bytes are bound to runtime startup', () => {
  const binding = validBinding();
  assert.equal(validateStaticRoot(loaded.profile, binding), resolve('qa/dev-139/s1/static'));
  assert.throws(() => validateStaticRoot(loaded.profile, { ...binding, staticFixtureSha256: '0'.repeat(64) }), /Static artifact/);
});

test('managed startup binds the artifact metadata and both application shells', () => {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-managed-static-'));
  const profile = { ...managed.profile, staticFixturePath: root };
  mkdirSync(resolve(root, 'quick-task'), { recursive: true });
  writeFileSync(resolve(root, 'index.html'), 'main');
  writeFileSync(resolve(root, 'quick-task/index.html'), 'quick');
  const metadata = `${JSON.stringify({
    schemaVersion: 1,
    releaseId: 'unit',
    backend: 'http',
    entrySha256: sha256('main'),
    quickEntrySha256: sha256('quick'),
  }, null, 2)}\n`;
  writeFileSync(resolve(root, 'dev139-cloud-run-meta.json'), metadata);
  const binding: RuntimeBinding = {
    databaseName: 'jenfu_prod', databasePort: 5432, runtimeRole: profile.roles.runtime,
    connectionMode: 'cloud-sql-iam', cloudSqlInstance: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    iamLogins: managedIamLogins,
    profileSha256: managed.sha256, migrationSha256: {}, staticFixtureSha256: sha256(metadata),
  };
  try {
    assert.equal(validateStaticRoot(profile, binding), root);
    writeFileSync(resolve(root, 'quick-task/index.html'), 'drifted');
    assert.throws(() => validateStaticRoot(profile, binding), /Static artifact/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ServerActorV1 rejects untrusted shapes and expiry', () => {
  const actor: ServerActorV1 = {
    principalId: 'principal:test',
    localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entry: 'main',
    contextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expiresAtMs: Date.now() + 60_000,
    accountGuardRevision: '1',
  };
  assert.doesNotThrow(() => validateServerActor(actor));
  assert.throws(() => validateServerActor({ ...actor, principalId: '' }));
  assert.throws(() => validateServerActor({ ...actor, localUserId: 'not-a-uuid' }));
  assert.throws(() => validateServerActor({ ...actor, expiresAtMs: Date.now() - 1 }));
  assert.throws(() => validateServerActor({ ...actor, accountGuardRevision: '01' }));
});

test('profile bytes, not a mutable receipt, determine its digest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'projed-dev139-unit-'));
  try {
    const copy = join(directory, 'profile.json');
    writeFileSync(copy, readFileSync(profilePath));
    assert.equal(loadSourceProfile(copy).sha256, loaded.sha256);
    writeFileSync(copy, `${readFileSync(copy, 'utf8')}\n`);
    assert.notEqual(loadSourceProfile(copy).sha256, loaded.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
