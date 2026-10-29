import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createManagedBinding,
  parseManagedBindingOptions,
  serializeManagedBinding,
} from '../../../scripts/lib/dev139-managed-binding.mjs';
import {
  createManagedJobChildEnvironment,
  redactSensitiveOutput,
  selectManagedJobExecution,
} from '../../../scripts/run-dev139-managed-job.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BINDING_CLI = resolve(PROJECT_ROOT, 'scripts/create-dev139-managed-binding.mjs');
const INSTANCE = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg';

function makeEnvironment(overrides = {}) {
  return {
    PROJED_MIGRATOR_DATABASE_URL: 'postgresql://migrator:secret-migrator@localhost/jenfu_prod?host=%2Fcloudsql%2Finstance',
    PROJED_MIGRATION_SOURCE_BINDING_FILE: '/secrets/source-binding.json',
    PROJED_MIGRATION_SOURCE_DATABASE_URL: 'postgresql://reader:secret-source@db.example.test/postgres?sslmode=verify-full',
    PROJED_MIGRATION_TARGET_DATABASE_URL: 'postgresql://importer:secret-target@localhost/jenfu_prod?host=%2Fcloudsql%2Finstance',
    ...overrides,
  };
}

function makeProfile() {
  return {
    profileVersion: 1,
    appKey: 'projed',
    environment: 'managed',
    database: {
      namePattern: '^jenfu_prod$',
      host: 'cloud-sql-unix',
      cloudSqlInstance: INSTANCE,
    },
    roles: { runtime: 'projed_runtime_disposable' },
    migrations: [{ path: 'db/migrations/0001_runtime_boundary_v1.sql' }],
    staticFixturePath: 'dist',
  };
}

function createCliFixture() {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-managed-cli-'));
  const profile = makeProfile();
  const profileBytes = Buffer.from(`${JSON.stringify(profile, null, 2)}\n`);
  const migrationBytes = Buffer.from('SELECT 1;\n');
  const fixtureBytes = Buffer.from('{"status":"PASS"}\n');
  mkdirSync(join(root, 'config/dev-139'), { recursive: true });
  mkdirSync(join(root, 'db/migrations'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'config/dev-139/s3-managed.profile.json'), profileBytes);
  writeFileSync(join(root, profile.migrations[0].path), migrationBytes);
  writeFileSync(join(root, 'dist/dev139-cloud-run-meta.json'), fixtureBytes);
  return { root, profile, profileBytes, migrationBytes, fixtureBytes };
}

test('managed binding builder keeps the CLI binding fields and hashes its supplied source bytes', () => {
  const profile = makeProfile();
  const profileBytes = Buffer.from('{"profile":"fixture"}\n');
  const migrationBytes = Buffer.from('SELECT 1;\n');
  const fixtureBytes = Buffer.from('{"status":"PASS"}\n');
  const binding = createManagedBinding({
    instance: INSTANCE,
    profileBytes,
    profile,
    migrationBytesByPath: { [profile.migrations[0].path]: migrationBytes },
    staticFixtureBytes: fixtureBytes,
  });

  assert.deepEqual(Object.keys(binding), [
    'databaseName', 'databasePort', 'runtimeRole', 'connectionMode', 'cloudSqlInstance',
    'profileSha256', 'migrationSha256', 'staticFixtureSha256',
  ]);
  assert.deepEqual(binding, {
    databaseName: 'jenfu_prod',
    databasePort: 5432,
    runtimeRole: 'projed_runtime_disposable',
    connectionMode: 'cloud-sql-unix',
    cloudSqlInstance: INSTANCE,
    profileSha256: createHash('sha256').update(profileBytes).digest('hex'),
    migrationSha256: {
      [profile.migrations[0].path]: createHash('sha256').update(migrationBytes).digest('hex'),
    },
    staticFixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  });
  assert.equal(serializeManagedBinding(binding).endsWith('\n'), true);
});

test('managed binding CLI preserves legal stdout and output-file behavior, and rejects unknown keys', () => {
  const fixture = createCliFixture();
  try {
    const expected = serializeManagedBinding(createManagedBinding({
      instance: INSTANCE,
      profileBytes: fixture.profileBytes,
      profile: fixture.profile,
      migrationBytesByPath: { [fixture.profile.migrations[0].path]: fixture.migrationBytes },
      staticFixtureBytes: fixture.fixtureBytes,
    }));
    const stdoutRun = spawnSync(process.execPath, [BINDING_CLI, `--instance=${INSTANCE}`], {
      cwd: fixture.root,
      encoding: 'utf8',
    });
    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    assert.equal(stdoutRun.stdout, expected);

    const outputPath = join(fixture.root, 'binding.json');
    const fileRun = spawnSync(process.execPath, [BINDING_CLI, `--instance=${INSTANCE}`, `--output=${outputPath}`], {
      cwd: fixture.root,
      encoding: 'utf8',
    });
    assert.equal(fileRun.status, 0, fileRun.stderr);
    assert.equal(fileRun.stdout, '');
    assert.equal(readFileSync(outputPath, 'utf8'), expected);

    const unknownRun = spawnSync(process.execPath, [BINDING_CLI, `--instance=${INSTANCE}`, '--unexpected=value'], {
      cwd: fixture.root,
      encoding: 'utf8',
    });
    assert.notEqual(unknownRun.status, 0);
    assert.match(unknownRun.stderr, /Unsupported --unexpected option/u);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('managed binding option parser rejects unknown, malformed, and duplicate arguments', () => {
  assert.deepEqual(parseManagedBindingOptions([`--instance=${INSTANCE}`, '--database=jenfu_prod']), {
    instance: INSTANCE,
    database: 'jenfu_prod',
  });
  assert.throws(() => parseManagedBindingOptions(['--unknown=value']), /Unsupported --unknown option/u);
  assert.throws(() => parseManagedBindingOptions(['unexpected']), /Arguments must use --name=value/u);
  assert.throws(() => parseManagedBindingOptions([`--instance=${INSTANCE}`, `--instance=${INSTANCE}`]), /Duplicate --instance option/u);
});

test('managed Job mode selection maps only the five supported modes to the existing commands', () => {
  const environment = makeEnvironment();
  assert.deepEqual(selectManagedJobExecution(['binding'], {}, 'node'), {
    mode: 'binding', requiredEnvironment: [], command: null, args: [],
  });
  assert.deepEqual(selectManagedJobExecution(['migrate'], environment, 'node'), {
    mode: 'migrate', requiredEnvironment: ['PROJED_MIGRATOR_DATABASE_URL'],
    command: 'node', args: ['scripts/migrate-dev-139-s1.mjs', '--profile=managed'],
  });
  for (const mode of ['plan', 'apply', 'reconcile']) {
    assert.deepEqual(selectManagedJobExecution([mode], environment, 'node'), {
      mode,
      requiredEnvironment: [
        'PROJED_MIGRATION_SOURCE_BINDING_FILE',
        'PROJED_MIGRATION_SOURCE_DATABASE_URL',
        'PROJED_MIGRATION_TARGET_DATABASE_URL',
      ],
      command: 'node', args: ['dist-jobs/scripts/dev139-data-migration.js', mode, '--target=managed'],
    });
  }
  assert.throws(() => selectManagedJobExecution([], environment), /Exactly one managed Job mode/u);
  assert.throws(() => selectManagedJobExecution(['apply', 'extra'], environment), /Exactly one managed Job mode/u);
  assert.throws(() => selectManagedJobExecution(['unknown'], environment), /mode must be binding/u);
  assert.throws(() => selectManagedJobExecution(['--mode=apply'], environment), /mode must be binding/u);
});

test('managed Job rejects mode-specific missing credentials before child selection', () => {
  assert.throws(() => selectManagedJobExecution(['migrate'], {}, 'node'), /PROJED_MIGRATOR_DATABASE_URL/u);
  assert.throws(() => selectManagedJobExecution(['plan'], {}, 'node'), /PROJED_MIGRATION_SOURCE_BINDING_FILE/u);
  assert.throws(() => selectManagedJobExecution(['apply'], {
    PROJED_MIGRATION_SOURCE_BINDING_FILE: '/source-binding.json',
    PROJED_MIGRATION_SOURCE_DATABASE_URL: 'postgresql://reader:secret@source/postgres',
  }, 'node'), /PROJED_MIGRATION_TARGET_DATABASE_URL/u);
  assert.deepEqual(selectManagedJobExecution(['binding'], {}, 'node').requiredEnvironment, []);
});

test('managed Job child environment keeps only mode-required DSNs and overrides profile and binding', () => {
  const environment = makeEnvironment({ PROJED_DATABASE_URL: 'postgresql://runtime:secret@runtime/db' });
  const plan = selectManagedJobExecution(['plan'], environment, 'node');
  const childEnvironment = createManagedJobChildEnvironment(
    environment,
    plan,
    '/app/config/dev-139/s3-managed.profile.json',
    '/tmp/job/runtime-binding.json',
  );

  assert.equal(childEnvironment.PROJED_DATABASE_URL, undefined);
  assert.equal(childEnvironment.PROJED_MIGRATOR_DATABASE_URL, undefined);
  assert.equal(childEnvironment.PROJED_MIGRATION_SOURCE_BINDING_FILE, '/secrets/source-binding.json');
  assert.equal(childEnvironment.PROJED_MIGRATION_SOURCE_DATABASE_URL, environment.PROJED_MIGRATION_SOURCE_DATABASE_URL);
  assert.equal(childEnvironment.PROJED_MIGRATION_TARGET_DATABASE_URL, environment.PROJED_MIGRATION_TARGET_DATABASE_URL);
  assert.equal(childEnvironment.PROJED_SOURCE_PROFILE, '/app/config/dev-139/s3-managed.profile.json');
  assert.equal(childEnvironment.PROJED_RUNTIME_BINDING_FILE, '/tmp/job/runtime-binding.json');
});

test('managed Job redaction removes exact DSNs and URL credentials and bounds diagnostics', () => {
  const environment = makeEnvironment();
  const output = [
    `migration failed for ${environment.PROJED_MIGRATION_SOURCE_DATABASE_URL}`,
    'credentials secret-source and reader were rejected',
  ].join('\n');
  const redacted = redactSensitiveOutput(output, environment);
  assert.doesNotMatch(redacted, /PROJED_MIGRATION_SOURCE_DATABASE_URL|secret-source|reader|db\.example\.test/u);
  assert.match(redacted, /migration failed/u);
  assert.match(redacted, /were rejected/u);

  const bounded = redactSensitiveOutput(`${output}\n${'x'.repeat(1000)}`, environment, 160);
  assert.equal(bounded.length, 160);
  assert.match(bounded, /managed Job output truncated/u);
});
