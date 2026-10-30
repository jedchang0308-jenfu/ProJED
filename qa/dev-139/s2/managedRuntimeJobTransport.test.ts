import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';

import { loadRuntimeConfig, sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';

function managedJobUrl(): string {
  const url = new URL(`postgresql://${encodeURIComponent(MANAGED_DATABASE.iamLogins.runtime)}@localhost:5432/${MANAGED_DATABASE.databaseName}`);
  url.searchParams.set('host', `/cloudsql/${MANAGED_DATABASE.cloudSqlInstance}`);
  return url.toString();
}

function managedWebUrl(): string {
  return `postgresql://${encodeURIComponent(MANAGED_DATABASE.iamLogins.runtime)}@127.0.0.1:5432/${MANAGED_DATABASE.databaseName}`;
}

function managedConfigFixture() {
  const root = mkdtempSync(join(tmpdir(), 'projed-managed-job-runtime-'));
  const staticRoot = join(root, 'static');
  mkdirSync(join(staticRoot, 'quick-task'), { recursive: true });
  const indexBytes = Buffer.from('<!doctype html><title>managed job fixture</title>');
  const quickBytes = Buffer.from('<!doctype html><title>managed quick fixture</title>');
  writeFileSync(join(staticRoot, 'index.html'), indexBytes);
  writeFileSync(join(staticRoot, 'quick-task', 'index.html'), quickBytes);
  const metadataBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    backend: 'http',
    releaseId: 'managed-job-source-test',
    entrySha256: sha256(indexBytes),
    quickEntrySha256: sha256(quickBytes),
  }));
  writeFileSync(join(staticRoot, 'dev139-cloud-run-meta.json'), metadataBytes);

  const sourceProfilePath = resolve('config/dev-139/s3-managed.profile.json');
  const profile = JSON.parse(readFileSync(sourceProfilePath, 'utf8')) as {
    staticFixturePath: string;
    migrations: { path: string }[];
  };
  profile.staticFixturePath = staticRoot;
  const profileBytes = Buffer.from(`${JSON.stringify(profile)}\n`);
  const profilePath = join(root, 'profile.json');
  writeFileSync(profilePath, profileBytes);

  const binding = {
    databaseName: MANAGED_DATABASE.databaseName,
    databasePort: MANAGED_DATABASE.databasePort,
    runtimeRole: MANAGED_DATABASE.roles.runtime,
    connectionMode: MANAGED_DATABASE.host,
    cloudSqlInstance: MANAGED_DATABASE.cloudSqlInstance,
    iamLogins: { ...MANAGED_DATABASE.iamLogins },
    profileSha256: sha256(profileBytes),
    migrationSha256: Object.fromEntries(profile.migrations.map(({ path }) => [path, sha256(readFileSync(resolve(path)))])),
    staticFixtureSha256: sha256(metadataBytes),
  };

  const env = (databaseUrl: string, entry = 'main'): NodeJS.ProcessEnv => ({
    PROJED_ENV: 'managed',
    PROJED_APP_ENTRY: entry,
    PROJED_SOURCE_PROFILE: profilePath,
    PROJED_RUNTIME_BINDING_JSON: JSON.stringify(binding),
    PROJED_DATABASE_URL: databaseUrl,
  });
  return { root, env };
}

test('managed Job socket transport is a program-only managed-main opt-in', () => {
  const fixture = managedConfigFixture();
  try {
    const jobEnv = { ...fixture.env(managedJobUrl()), PROJED_MANAGED_JOB: 'true' };
    assert.throws(() => loadRuntimeConfig(jobEnv), { code: 'CONFIG_INVALID' },
      'a web environment variable cannot enable the Job-only socket transport');

    const webConfig = loadRuntimeConfig({ ...jobEnv, PROJED_DATABASE_URL: managedWebUrl() });
    assert.equal(webConfig.managedJobTransport, undefined);
    assert.equal(webConfig.databaseUrl, managedWebUrl());

    const jobConfig = loadRuntimeConfig(fixture.env(managedJobUrl()), { managedJob: true });
    assert.equal(jobConfig.managedJobTransport, true);
    assert.equal(jobConfig.entry, 'main');
    assert.equal(jobConfig.env, 'managed');
    assert.equal(jobConfig.databaseUrl, managedJobUrl());

    assert.throws(() => loadRuntimeConfig(fixture.env(managedJobUrl(), 'quick'), { managedJob: true }),
      { code: 'CONFIG_INVALID' });
    assert.throws(() => loadRuntimeConfig({ ...fixture.env(managedJobUrl()), PROJED_ENV: 'disposable' },
      { managedJob: true }), { code: 'CONFIG_INVALID' });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('RuntimeDatabase uses fresh password callbacks on the Job socket and retains runtime session checks', async () => {
  const fixture = managedConfigFixture();
  const tokens = ['managed-job-token-one-0123456789', 'managed-job-token-two-0123456789'];
  let tokenIndex = 0;
  const observedConnections: Array<Record<string, unknown>> = [];
  const sessionQueries: string[] = [];
  const releases: boolean[] = [];
  const fakeClient = {
    async query(sql: string) {
      sessionQueries.push(sql.trim());
      if (sql.includes('FROM pg_catalog.pg_roles AS login')) {
        return { rows: [{
          database_name: MANAGED_DATABASE.databaseName,
          login_name: MANAGED_DATABASE.iamLogins.runtime,
          role_name: MANAGED_DATABASE.iamLogins.runtime,
          login_safe: true,
          app_role_safe: true,
          roles_isolated: true,
          not_database_owner: true,
          no_sibling_core: true,
        }] };
      }
      if (sql.trim() === 'SELECT session_user::text AS login_name, current_user::text AS role_name') {
        return { rows: [{
          login_name: MANAGED_DATABASE.iamLogins.runtime,
          role_name: MANAGED_DATABASE.roles.runtime,
        }] };
      }
      return { rows: [] };
    },
    release(destroy = false) { releases.push(destroy); },
  } as unknown as PoolClient;

  const originalConnect = Object.getOwnPropertyDescriptor(Pool.prototype, 'connect');
  Object.defineProperty(Pool.prototype, 'connect', {
    configurable: true,
    writable: true,
    value: async function(this: unknown) {
      const options = (this as { options: Record<string, unknown> }).options;
      const password = options.password;
      assert.equal(typeof password, 'function');
      const token = await (password as () => Promise<string>)();
      observedConnections.push({ ...options, token });
      return fakeClient;
    },
  });

  let database: RuntimeDatabase | undefined;
  try {
    const loaded = loadRuntimeConfig(fixture.env(managedJobUrl()), { managedJob: true });
    const config: RuntimeConfig = loaded;
    database = new RuntimeDatabase(config, {
      managedJobTokenProvider: async () => tokens[tokenIndex++]!,
    });
    assert.equal(tokenIndex, 0, 'constructing the pool does not prefetch or retain a token');
    const first = await database.checkout();
    first.release();
    const second = await database.checkout();
    second.release();

    assert.equal(tokenIndex, 2);
    assert.deepEqual(observedConnections.map(connection => connection.token), tokens);
    for (const connection of observedConnections) {
      assert.equal(connection.host, `/cloudsql/${MANAGED_DATABASE.cloudSqlInstance}`);
      assert.equal(connection.port, MANAGED_DATABASE.databasePort);
      assert.equal(connection.database, MANAGED_DATABASE.databaseName);
      assert.equal(connection.user, MANAGED_DATABASE.iamLogins.runtime);
      assert.equal(connection.ssl, false);
      assert.equal('connectionString' in connection, false);
    }
    assert.equal(sessionQueries.filter(sql => sql.includes('FROM pg_catalog.pg_roles AS login')).length, 2);
    assert.equal(sessionQueries.filter(sql => sql === 'SET ROLE projed_runtime_disposable').length, 2);
    assert.equal(sessionQueries.filter(sql => sql === 'SELECT session_user::text AS login_name, current_user::text AS role_name').length, 2);
    assert.deepEqual(releases, [false, false]);
  } finally {
    try { await database?.end(); }
    finally {
      if (originalConnect) Object.defineProperty(Pool.prototype, 'connect', originalConnect);
      else Reflect.deleteProperty(Pool.prototype, 'connect');
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('managed Job auth failures retain the helper error code without exposing token-provider text', async () => {
  const fixture = managedConfigFixture();
  const originalConnect = Object.getOwnPropertyDescriptor(Pool.prototype, 'connect');
  Object.defineProperty(Pool.prototype, 'connect', {
    configurable: true,
    writable: true,
    value: async function(this: unknown) {
      const password = (this as { options: Record<string, unknown> }).options.password;
      assert.equal(typeof password, 'function');
      await (password as () => Promise<string>)();
      throw new Error('password callback unexpectedly returned');
    },
  });
  let database: RuntimeDatabase | undefined;
  try {
    const config = loadRuntimeConfig(fixture.env(managedJobUrl()), { managedJob: true });
    database = new RuntimeDatabase(config, {
      managedJobTokenProvider: async () => { throw new Error('private-token-provider-marker'); },
    });
    await assert.rejects(database.checkout(), error => {
      assert.equal((error as { code?: unknown }).code, 'DB_AUTH_UNAVAILABLE');
      assert.equal((error as Error).message, 'Managed database authentication is unavailable');
      assert.doesNotMatch((error as Error).message, /private-token-provider-marker/u);
      return true;
    });
  } finally {
    try { await database?.end(); }
    finally {
      if (originalConnect) Object.defineProperty(Pool.prototype, 'connect', originalConnect);
      else Reflect.deleteProperty(Pool.prototype, 'connect');
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('managed Job token injection cannot affect ordinary web RuntimeDatabase', () => {
  const fixture = managedConfigFixture();
  try {
    const webConfig = loadRuntimeConfig(fixture.env(managedWebUrl()));
    assert.throws(() => new RuntimeDatabase(webConfig, { managedJobTokenProvider: async () => 'unused-token' }), {
      code: 'CONFIG_INVALID',
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
