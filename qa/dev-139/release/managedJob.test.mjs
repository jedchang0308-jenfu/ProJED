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
const MANAGED_JOB_CLI = resolve(PROJECT_ROOT, 'scripts/run-dev139-managed-job.mjs');
const INSTANCE = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg';
const IAM_LOGINS = {
  runtime: 'projed-prod-runtime@projed-cc78d.iam',
  migrator: 'projed-prod-migrator@projed-cc78d.iam',
  importer: 'projed-prod-importer@projed-cc78d.iam',
};

function makeEnvironment(overrides = {}) {
  return {
    PROJED_MIGRATOR_DATABASE_URL: 'postgresql://projed-prod-migrator%40projed-cc78d.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg',
    PROJED_MIGRATION_SOURCE_BUNDLE_FILE: '/secrets/source/bundle.json',
    PROJED_MIGRATION_TARGET_DATABASE_URL: 'postgresql://projed-prod-importer%40projed-cc78d.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg',
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
      host: 'cloud-sql-iam',
      cloudSqlInstance: INSTANCE,
      portPolicy: 'lifecycle-iam',
      iamLogins: IAM_LOGINS,
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
    'iamLogins', 'profileSha256', 'migrationSha256', 'staticFixtureSha256',
  ]);
  assert.deepEqual(binding, {
    databaseName: 'jenfu_prod',
    databasePort: 5432,
    runtimeRole: 'projed_runtime_disposable',
    connectionMode: 'cloud-sql-iam',
    cloudSqlInstance: INSTANCE,
    iamLogins: IAM_LOGINS,
    profileSha256: createHash('sha256').update(profileBytes).digest('hex'),
    migrationSha256: {
      [profile.migrations[0].path]: createHash('sha256').update(migrationBytes).digest('hex'),
    },
    staticFixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  });
  assert.equal(serializeManagedBinding(binding).endsWith('\n'), true);
});

test('managed binding builder rejects unix mode and malformed IAM login maps', () => {
  const baseProfile = makeProfile();
  const input = {
    instance: INSTANCE,
    profileBytes: Buffer.from('{"profile":"fixture"}\n'),
    migrationBytesByPath: { [baseProfile.migrations[0].path]: Buffer.from('SELECT 1;\n') },
    staticFixtureBytes: Buffer.from('{"status":"PASS"}\n'),
  };
  const invalidProfiles = [
    { ...baseProfile, database: { ...baseProfile.database, host: 'cloud-sql-unix' } },
    ...Object.keys(IAM_LOGINS).map((purpose) => ({
      ...baseProfile,
      database: { ...baseProfile.database, iamLogins: {
        ...IAM_LOGINS, [purpose]: IAM_LOGINS[purpose].replace('projed-cc78d', 'other-project'),
      } },
    })),
    { ...baseProfile, database: { ...baseProfile.database, iamLogins: {
      ...IAM_LOGINS, operator: 'projed-prod-operator@projed-cc78d.iam',
    } } },
  ];

  for (const profile of invalidProfiles) assert.throws(() => createManagedBinding({ ...input, profile }));
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
  assert.deepEqual(selectManagedJobExecution(['migrate'], {
    PROJED_MIGRATOR_DATABASE_URL: environment.PROJED_MIGRATOR_DATABASE_URL,
  }, 'node'), {
    mode: 'migrate', requiredEnvironment: ['PROJED_MIGRATOR_DATABASE_URL'],
    command: 'node', args: ['scripts/migrate-dev-139-s1.mjs', '--profile=managed'],
  });
  for (const mode of ['plan', 'apply', 'reconcile']) {
    assert.deepEqual(selectManagedJobExecution([mode], environment, 'node'), {
      mode,
      requiredEnvironment: [
        'PROJED_MIGRATION_SOURCE_BUNDLE_FILE',
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
  assert.throws(() => selectManagedJobExecution(['plan'], {}, 'node'), /PROJED_MIGRATION_SOURCE_BUNDLE_FILE/u);
  assert.throws(() => selectManagedJobExecution(['apply'], {
    PROJED_MIGRATION_SOURCE_BUNDLE_FILE: '/secrets/source/bundle.json',
  }, 'node'), /PROJED_MIGRATION_TARGET_DATABASE_URL/u);
  assert.deepEqual(selectManagedJobExecution(['binding'], {}, 'node').requiredEnvironment, []);
});

test('managed Job rejects legacy source environment mixing and withholds source credentials from binding and migrate', () => {
  for (const name of ['PROJED_MIGRATION_SOURCE_BINDING_FILE', 'PROJED_MIGRATION_SOURCE_DATABASE_URL']) {
    assert.throws(() => selectManagedJobExecution(['plan'], makeEnvironment({ [name]: 'legacy-secret' }), 'node'), /Legacy source environment is not accepted/u);
    assert.throws(() => selectManagedJobExecution(['migrate'], {
      PROJED_MIGRATOR_DATABASE_URL: 'postgresql://projed-prod-migrator%40projed-cc78d.iam@localhost/jenfu_prod',
      [name]: 'legacy-secret',
    }, 'node'), /Legacy source environment is not accepted/u);
  }

  assert.throws(() => selectManagedJobExecution(['binding'], {
    PROJED_MIGRATION_SOURCE_BUNDLE_FILE: '/secrets/source/bundle.json',
  }, 'node'), /Source bundle credentials are not accepted/u);
  assert.throws(() => selectManagedJobExecution(['migrate'], {
    PROJED_MIGRATOR_DATABASE_URL: 'postgresql://projed-prod-migrator%40projed-cc78d.iam@localhost/jenfu_prod',
    PROJED_MIGRATION_SOURCE_BUNDLE_FILE: '/secrets/source/bundle.json',
  }, 'node'), /Source bundle credentials are not accepted/u);
});

test('managed Job child environment materializes only the required source files and DSN', () => {
  const environment = makeEnvironment({
    PROJED_DATABASE_URL: 'postgresql://projed-prod-runtime%40projed-cc78d.iam@127.0.0.1:5432/jenfu_prod',
  });
  const plan = selectManagedJobExecution(['plan'], environment, 'node');
  const sourceBundle = {
    sourceBindingPath: '/tmp/job/source-binding.json',
    sourceCaPath: '/tmp/job/source-ca.pem',
    sourceDatabaseUrl: 'postgresql://reader:source-secret@db.knodlkxqpcqyrtgwpdst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fjob%2Fsource-ca.pem',
  };
  const childEnvironment = createManagedJobChildEnvironment(
    environment,
    plan,
    '/app/config/dev-139/s3-managed.profile.json',
    '/tmp/job/runtime-binding.json',
    sourceBundle,
  );

  assert.equal(childEnvironment.PROJED_DATABASE_URL, undefined);
  assert.equal(childEnvironment.PROJED_MIGRATOR_DATABASE_URL, undefined);
  assert.equal(childEnvironment.PROJED_MIGRATION_SOURCE_BUNDLE_FILE, undefined);
  assert.equal(childEnvironment.PROJED_MIGRATION_SOURCE_BINDING_FILE, sourceBundle.sourceBindingPath);
  assert.equal(childEnvironment.PROJED_MIGRATION_SOURCE_DATABASE_URL, sourceBundle.sourceDatabaseUrl);
  assert.equal(childEnvironment.PROJED_MIGRATION_TARGET_DATABASE_URL, environment.PROJED_MIGRATION_TARGET_DATABASE_URL);
  assert.equal(childEnvironment.PROJED_SOURCE_PROFILE, '/app/config/dev-139/s3-managed.profile.json');
  assert.equal(childEnvironment.PROJED_RUNTIME_BINDING_FILE, '/tmp/job/runtime-binding.json');
});

test('managed Job redaction uses materialized child DSN and bounds diagnostics', () => {
  const environment = makeEnvironment();
  const sourceDatabaseUrl = 'postgresql://reader:source-secret@db.knodlkxqpcqyrtgwpdst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsource-ca.pem';
  const childEnvironment = createManagedJobChildEnvironment(
    environment,
    selectManagedJobExecution(['plan'], environment, 'node'),
    '/app/config/dev-139/s3-managed.profile.json',
    '/tmp/job/runtime-binding.json',
    { sourceBindingPath: '/tmp/job/source-binding.json', sourceDatabaseUrl },
  );
  const output = [
    `migration failed for ${childEnvironment.PROJED_MIGRATION_SOURCE_DATABASE_URL}`,
    'credentials source-secret and reader were rejected',
  ].join('\n');
  const redacted = redactSensitiveOutput(output, childEnvironment);
  assert.doesNotMatch(redacted, /PROJED_MIGRATION_SOURCE_DATABASE_URL|source-secret|reader|knodlkxqpcqyrtgwpdst|source-ca\.pem/u);
  assert.match(redacted, /migration failed/u);
  assert.match(redacted, /were rejected/u);

  const bounded = redactSensitiveOutput(`${output}\n${'x'.repeat(1000)}`, childEnvironment, 160);
  assert.equal(bounded.length, 160);
  assert.match(bounded, /managed Job output truncated/u);
});

test('managed Job CLI rejects missing source bundle without echoing credentials', () => {
  const environment = { ...process.env };
  for (const name of [
    'PROJED_MIGRATION_SOURCE_BUNDLE_FILE',
    'PROJED_MIGRATION_SOURCE_BINDING_FILE',
    'PROJED_MIGRATION_SOURCE_DATABASE_URL',
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]) delete environment[name];
  environment.PROJED_MIGRATION_TARGET_DATABASE_URL = 'postgresql://reader:cli-secret@target.example.test/postgres';
  const result = spawnSync(process.execPath, [MANAGED_JOB_CLI, 'apply'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: environment,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROJED_MIGRATION_SOURCE_BUNDLE_FILE/u);
  assert.doesNotMatch(result.stderr, /cli-secret|target\.example\.test/u);
});
