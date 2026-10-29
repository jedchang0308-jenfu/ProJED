import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Actual OCI qualification runs on the disposable Linux CI host. Never start
// Docker or consume the developer's constrained Windows disk through this path.
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('DEV-139 OCI verification requires the disposable Linux GitHub Actions runner');
}

const nonce = randomBytes(12).toString('hex');
const label = 'projed.dev139.oci-attempt';
const prefix = `dev139-oci-${nonce}`;
const toolsImage = `${prefix}:build`;
const runtimeImage = `${prefix}:runtime`;
const jobsImage = `${prefix}:jobs`;
const mediaImage = `${prefix}:media`;
const asrImage = `${prefix}:asr-job`;
const postgresImage = 'postgres:17.11-bookworm';
const instance = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg';
const socketPath = `/cloudsql/${instance}`;
const socketVolume = `${prefix}-socket`;
const pgName = `${prefix}-pg`;
const networkName = `${prefix}-network`;
const metadataName = `${prefix}-metadata-fixture`;
const appName = `${prefix}-app`;
const temp = mkdtempSync(join(tmpdir(), `${prefix}-`));
const containers = new Set();
const volumes = new Set();
const images = new Set();
const checks = [];
const secrets = Array.from({ length: 4 }, () => randomBytes(24).toString('hex'));
const [adminPassword, migratorPassword, importerPassword, runtimePassword] = secrets;
let binding;
let imageId;
let jobsImageId;
let mediaImageId;
let asrImageId;
let mediaProof;
let postgresVersion;
let appliedMigrationCount = 0;
let firstFailure;
const cleanupFailures = [];
const diagnostics = [];

function sanitize(value) {
  return secrets.reduce((text, secret) => text.replaceAll(secret, '[disposable-password]'), String(value));
}

function docker(args, { input, env = {}, timeout = 90_000, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    input, env: { ...process.env, ...env }, encoding: 'utf8', timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    // Arguments can contain throwaway credentials; only expose sanitized output.
    throw new Error(sanitize(`Docker ${args[0]} failed (${result.status ?? result.error?.code}):\n${result.stdout?.slice(-4000) ?? ''}\n${result.stderr?.slice(-8000) ?? ''}`));
  }
  return result;
}

function passed(name) {
  checks.push(name);
  console.log(JSON.stringify({ check: name, status: 'PASS' }));
}

function createContainer(name, args, network = 'none') {
  // Cleanup still inspects the random label before removing a created resource.
  containers.add(name);
  docker(['create', '--name', name, '--label', `${label}=${nonce}`, '--network', network, ...args]);
  docker(['start', name]);
}

function runOwnedContainer(suffix, args, options) {
  const name = `${prefix}-${suffix}`;
  containers.add(name);
  const { network = 'none', ...runOptions } = options ?? {};
  return docker(['run', '--rm', '--name', name, '--label', `${label}=${nonce}`, '--network', network, ...args], runOptions);
}

function inspect(name) {
  return JSON.parse(docker(['inspect', name]).stdout)[0];
}

function inspectResource(kind, name) {
  const result = docker([kind, 'inspect', name], { allowFailure: true });
  if (!result.error && result.status === 0) return JSON.parse(result.stdout)[0];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const notFound = new RegExp(`^(?:Error(?: response from daemon)?: )?No such (?:object|${kind}): ${escaped}$`, 'i');
  const missingVolume = new RegExp(`^Error response from daemon: get ${escaped}: no such volume$`, 'i');
  if (!result.error && result.status === 1 && ['', '[]'].includes(result.stdout.trim())
      && (notFound.test(result.stderr.trim()) || (kind === 'volume' && missingVolume.test(result.stderr.trim())))) {
    return undefined;
  }
  throw new Error(sanitize(`Cannot verify ${kind} ${name}: ${result.error?.code ?? result.status} ${result.stderr}`));
}

async function waitFor(label, probe, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (probe()) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function pgSql(sql) {
  return docker(['exec', '-i', pgName, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-h', socketPath, '-U', 'postgres', '-d', 'jenfu_prod'], { input: sql }).stdout.trim();
}

function appProbe(code) {
  return docker(['exec', appName, 'node', '--input-type=module', '-e', code]);
}

function bindingMount(path = join(temp, 'binding.json')) {
  return ['--mount', `type=bind,src=${path},dst=/verification/binding.json,readonly`];
}

const socketMount = ['--mount', `type=volume,src=${socketVolume},dst=${socketPath},readonly`];

try {
  // No registry push, cloud credentials, provider calls or deployed resources.
  docker(['build', '--platform', 'linux/amd64', '--target', 'build', '--label', `${label}=${nonce}`,
    '--build-arg', `PROJED_RELEASE_ID=${prefix}`, '-f', 'Dockerfile.dev139', '-t', toolsImage, '.'], { timeout: 600_000 });
  images.add(toolsImage);
  docker(['build', '--platform', 'linux/amd64', '--label', `${label}=${nonce}`,
    '--build-arg', `PROJED_RELEASE_ID=${prefix}`, '-f', 'Dockerfile.dev139', '-t', runtimeImage, '.'], { timeout: 600_000 });
  images.add(runtimeImage);
  const image = JSON.parse(docker(['image', 'inspect', runtimeImage]).stdout)[0];
  imageId = image.Id;
  assert.equal(image.Os, 'linux');
  assert.equal(image.Architecture, 'amd64');
  assert.equal(image.Config.User, 'node');
  assert.deepEqual(image.Config.Cmd, ['node', 'dist-server/server/index.js']);
  passed('actual-linux-amd64-nonroot-runtime-image');

  docker(['build', '--platform', 'linux/amd64', '--target', 'managed-jobs', '--label', `${label}=${nonce}`,
    '--build-arg', `PROJED_RELEASE_ID=${prefix}`, '-f', 'Dockerfile.dev139', '-t', jobsImage, '.'], { timeout: 600_000 });
  images.add(jobsImage);
  const jobImage = JSON.parse(docker(['image', 'inspect', jobsImage]).stdout)[0];
  jobsImageId = jobImage.Id;
  assert.equal(jobImage.Os, 'linux');
  assert.equal(jobImage.Architecture, 'amd64');
  assert.equal(jobImage.Config.User, 'node');
  assert.deepEqual(jobImage.Config.Cmd, ['node', 'scripts/run-dev139-managed-job.mjs']);
  passed('actual-nonroot-managed-jobs-image');

  docker(['build', '--platform', 'linux/amd64', '--target', 'asr-job', '--label', `${label}=${nonce}`,
    '--build-arg', `PROJED_RELEASE_ID=${prefix}`, '-f', 'Dockerfile.dev139', '-t', asrImage, '.'], { timeout: 600_000 });
  images.add(asrImage);
  const asrJobImage = JSON.parse(docker(['image', 'inspect', asrImage]).stdout)[0];
  asrImageId = asrJobImage.Id;
  assert.equal(asrJobImage.Os, 'linux');
  assert.equal(asrJobImage.Architecture, 'amd64');
  assert.equal(asrJobImage.Config.User, 'node');
  assert.deepEqual(asrJobImage.Config.Cmd, ['node', 'dist-server/server/meetingAsrJob.js']);
  const asrRuntimeProbe = runOwnedContainer('asr-job-runtime-probe', ['--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', asrImage, 'node', '--input-type=module', '-e', String.raw`
      import assert from 'node:assert/strict';
      import {existsSync} from 'node:fs';
      import {spawnSync} from 'node:child_process';
      assert.notEqual(process.getuid(),0);
      assert.equal(existsSync('dist-server/server/meetingAsrJob.js'),true);
      const ffmpeg=spawnSync('/usr/bin/ffmpeg',['-version'],{encoding:'utf8',timeout:30000,
        env:{PATH:'/usr/bin:/bin',LANG:'C'}});
      assert.equal(ffmpeg.status,0);
      console.log(JSON.stringify({module:'present',ffmpeg:ffmpeg.stdout.split('\n')[0],user:process.getuid()}));
    `]);
  assert.equal(JSON.parse(asrRuntimeProbe.stdout.trim()).module, 'present');

  const asrEgressGuard = join(temp, 'asr-check-only-egress-guard.mjs');
  writeFileSync(asrEgressGuard, `
    import net from 'node:net';
    const blocked = kind => {
      process.stderr.write('DEV139_ASR_CHECK_EGRESS_ATTEMPT:' + kind + '\\n');
      throw new Error('DEV139_ASR_CHECK_EGRESS_BLOCKED');
    };
    globalThis.fetch = async () => blocked('fetch');
    net.Socket.prototype.connect = function () { return blocked('socket'); };
  `, { mode: 0o444 });
  // Docker run arguments replace CMD, so invoke the inspected entry explicitly.
  const asrCheckOnly = runOwnedContainer('asr-job-check-only', ['--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--mount',
    `type=bind,src=${asrEgressGuard},dst=/verification/asr-check-only-egress-guard.mjs,readonly`,
    '--env', 'NODE_OPTIONS=--import=/verification/asr-check-only-egress-guard.mjs',
    '--env', 'PROJED_ENV=managed', '--env', 'PROJED_APP_ENTRY=main',
    '--env', 'PROJED_DATABASE_URL=not-a-postgresql-url',
    '--env', 'PROJED_RUNTIME_BINDING_FILE=/verification/missing-runtime-binding.json',
    '--env', 'PROJED_MEETING_AUDIO_BUCKET=unqualified-fixture-bucket',
    '--env', 'GOOGLE_APPLICATION_CREDENTIALS=/verification/missing-provider-credentials.json',
    '--env', 'GOOGLE_CLOUD_PROJECT=fixture-unqualified-project',
    asrImage, 'node', 'dist-server/server/meetingAsrJob.js', '--check-only'], { network: 'none', allowFailure: true });
  assert.equal(asrCheckOnly.status, 0, asrCheckOnly.stderr);
  const asrCheckLines = asrCheckOnly.stdout.trim().split(/\r?\n/u);
  assert.equal(asrCheckLines.length, 1);
  assert.deepEqual(JSON.parse(asrCheckLines[0]), {
    event: 'projed_meeting_asr_job_check', status: 'CHECK_ONLY', providerDispatch: 'DISABLED',
    sessionContract: 'UNPUBLISHED', runtime: 'NOT_CONNECTED', provider: 'NOT_RUN',
  });
  assert.doesNotMatch(`${asrCheckOnly.stdout}${asrCheckOnly.stderr}`, /DEV139_ASR_CHECK_EGRESS_ATTEMPT/u,
    'check-only never opens metadata/provider fetches or database sockets');
  passed('actual-nonroot-asr-job-image-cmd-module-ffmpeg-and-offline-check-only');

  const originalBinding = JSON.parse(runOwnedContainer('binding-cli', [toolsImage,
    'node', 'scripts/create-dev139-managed-binding.mjs', `--instance=${instance}`]).stdout);
  binding = JSON.parse(runOwnedContainer('binding-job', ['--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    jobsImage, 'node', 'scripts/run-dev139-managed-job.mjs', 'binding']).stdout);
  assert.deepEqual(binding, originalBinding);
  passed('job-and-runtime-build-artifact-binding-match');
  writeFileSync(join(temp, 'binding.json'), JSON.stringify(binding), { mode: 0o444 });
  const runtimeEnv = [
    'PROJED_RUNTIME_BINDING_FILE=/verification/binding.json',
    `PROJED_DATABASE_URL=postgresql://${encodeURIComponent(binding.iamLogins.runtime)}@127.0.0.1:5432/jenfu_prod`,
    'PROJED_PUBLIC_APP_URL=https://projed.example.invalid', 'PORT=8080',
  ].join('\n');
  writeFileSync(join(temp, 'runtime.env'), `${runtimeEnv}\n`, { mode: 0o600 });
  writeFileSync(join(temp, 'migrator.env'), [
    `PROJED_MIGRATOR_DATABASE_URL=postgresql://${encodeURIComponent(binding.iamLogins.migrator)}@localhost/jenfu_prod?host=${encodeURIComponent(socketPath)}`, '',
  ].join('\n'), { mode: 0o600 });

  docker(['volume', 'create', '--label', `${label}=${nonce}`, socketVolume]);
  volumes.add(socketVolume);
  // PostgreSQL writes the socket as its own OS user; runtime only connects to it.
  runOwnedContainer('prepare', ['--mount', `type=volume,src=${socketVolume},dst=/sockets`,
    '--entrypoint', 'sh', postgresImage, '-c', 'chown postgres:postgres /sockets && chmod 0755 /sockets']);
  // Keep this owned network namespace alive during PostgreSQL stop/restart.
  // It has only loopback, no published ports and no route to Google metadata.
  createContainer(networkName, ['--read-only', '--cap-drop', 'ALL',
    '--add-host', 'metadata.google.internal:127.0.0.1', runtimeImage,
    'node', '-e', 'setInterval(()=>{},3600000)']);
  const fixtureNetwork = `container:${networkName}`;
  createContainer(metadataName, ['--read-only', '--user', '0', '--cap-drop', 'ALL',
    '--cap-add', 'NET_BIND_SERVICE', '--env', `FIXTURE_TOKEN=${migratorPassword}`, jobsImage,
    'node', '--input-type=module', '-e', `
      import {createServer} from 'node:http';
      createServer((q,s)=>{
        const ok=q.url==='/computeMetadata/v1/instance/service-accounts/default/token'&&q.headers['metadata-flavor']==='Google';
        s.writeHead(ok?200:404,{'content-type':'application/json'});
        s.end(JSON.stringify(ok?{access_token:process.env.FIXTURE_TOKEN,token_type:'Bearer',expires_in:3600}:{error:'fixture-only'}));
      }).listen(80,'0.0.0.0');
    `], fixtureNetwork);
  await waitFor('fixture-only metadata response', () => docker(['exec', metadataName, 'node', '-e',
    "fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], { allowFailure: true }).status === 0);
  createContainer(pgName, ['--env', `POSTGRES_PASSWORD=${adminPassword}`,
    // Trust is confined to this nonce-owned, loopback-only fixture. This is not
    // a Google IAM authenticator or a real Cloud SQL Auth Proxy qualification.
    '--env', 'POSTGRES_INITDB_ARGS=--auth-host=trust',
    '--mount', `type=volume,src=${socketVolume},dst=${socketPath}`, postgresImage,
    // The official entrypoint initializes through /var/run/postgresql. Keep that
    // private in-container socket as well as the explicitly shared test socket.
    'postgres', '-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=/var/run/postgresql,${socketPath}`], fixtureNetwork);
  await waitFor('isolated PostgreSQL final server', () => {
    const logs = docker(['logs', pgName]);
    return `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.')
      && docker(['exec', pgName, 'pg_isready', '-h', socketPath, '-U', 'postgres'], { allowFailure: true }).status === 0;
  });
  const bootstrap = readFileSync('qa/dev-139/s1/bootstrap.sql', 'utf8')
    .replaceAll('__MIGRATOR_PASSWORD__', migratorPassword)
    .replaceAll('__IMPORTER_PASSWORD__', importerPassword)
    .replaceAll('__RUNTIME_PASSWORD__', runtimePassword);
  docker(['exec', '-i', pgName, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socketPath,
    '-U', 'postgres', '-d', 'postgres'], { input: `${bootstrap}\nCREATE DATABASE jenfu_prod;\n` });
  pgSql(`REVOKE ALL ON DATABASE jenfu_prod FROM PUBLIC;
    GRANT CREATE ON DATABASE jenfu_prod TO projed_owner_disposable;
    ALTER ROLE projed_migrator_disposable NOLOGIN;
    ALTER ROLE projed_importer_disposable NOLOGIN;
    ALTER ROLE projed_runtime_disposable NOLOGIN;
    ${Object.entries(binding.iamLogins).map(([purpose, login]) => `
      CREATE ROLE "${login}" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT projed_${purpose}_disposable TO "${login}";
      GRANT CONNECT ON DATABASE jenfu_prod TO "${login}";
    `).join('\n')}`);
  postgresVersion = pgSql('SHOW server_version;');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = runOwnedContainer(`migration-${attempt}`, ['--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
      ...socketMount, '--env-file', join(temp, 'migrator.env'), jobsImage,
      'node', 'scripts/run-dev139-managed-job.mjs', 'migrate'], { network: fixtureNetwork }).stdout.trim().split(/\r?\n/);
    const result = JSON.parse(output.at(-1));
    assert.equal(result.status, 'PASS');
    assert.equal(result.migrations.length, Object.keys(binding.migrationSha256).length);
  }
  appliedMigrationCount = Number(pgSql(`SELECT count(*) FROM projed_core.schema_migrations;`));
  assert.equal(appliedMigrationCount, Object.keys(binding.migrationSha256).length);
  assert.equal(pgSql(`SELECT rolname || ':' || rolsuper || ':' || rolbypassrls FROM pg_roles WHERE rolname='projed_runtime_disposable';`), 'projed_runtime_disposable:false:false');
  passed('isolated-unix-socket-full-migration-and-idempotent-replay');

  runOwnedContainer('iam-role-pairs', ['--read-only', ...socketMount, ...bindingMount(), jobsImage,
    'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; import pg from 'pg';
      import {prepareManagedDatabaseSession,MANAGED_DATABASE} from './shared/dev139ManagedDatabase.mjs';
      const b=JSON.parse(readFileSync('/verification/binding.json'));
      for(const purpose of ['runtime','migrator','importer']) {
        const c=new pg.Client({host:${JSON.stringify(socketPath)},database:'jenfu_prod',user:b.iamLogins[purpose],ssl:false});
        await c.connect(); try {
          await prepareManagedDatabaseSession(c,b,purpose);
          const r=(await c.query('SELECT session_user::text AS login, current_user::text AS role')).rows[0];
          assert.equal(r.login,b.iamLogins[purpose]); assert.equal(r.role,MANAGED_DATABASE.roles[purpose]);
        } finally {await c.end();}
      }
      const wrong=new pg.Client({host:${JSON.stringify(socketPath)},database:'jenfu_prod',user:b.iamLogins.importer,ssl:false});
      await wrong.connect(); try {
        await assert.rejects(prepareManagedDatabaseSession(wrong,b,'runtime'),e=>e.code==='DB_BOUNDARY_INVALID');
        assert.equal((await wrong.query('SELECT current_user::text AS role')).rows[0].role,b.iamLogins.importer);
      } finally {await wrong.end();}
    `], { network: fixtureNetwork });
  passed('iam-shaped-session-user-and-exact-app-role-pairs');

  // Load the emitted importer in the actual production-dependency image. Missing
  // source inputs must stop before attempting a source or target connection.
  runOwnedContainer('compiled-importer', ['--read-only', jobsImage, 'node', '--input-type=module', '-e',
    "const m=await import('./dist-jobs/scripts/dev139-data-migration.js');if(typeof m.findUnclassifiedSourceRelations!=='function')process.exit(1);"]);
  for (const mode of ['migrate', 'plan', 'apply', 'reconcile']) {
    const result = runOwnedContainer(`missing-env-${mode}`, ['--read-only', jobsImage,
      'node', 'scripts/run-dev139-managed-job.mjs', mode], { allowFailure: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Required managed Job environment is missing/);
  }
  const invalidMode = runOwnedContainer('invalid-mode', ['--read-only', jobsImage,
    'node', 'scripts/run-dev139-managed-job.mjs', 'apply', 'extra'], { allowFailure: true });
  assert.equal(invalidMode.status, 1);
  assert.match(invalidMode.stderr, /Exactly one managed Job mode is required/);
  passed('compiled-importer-loads-and-job-rejects-incomplete-or-extra-inputs');

  // Exercise the mounted Secret format with synthetic credentials and CA only.
  // A deliberately invalid target must stop the compiled child before either
  // source or target connects. The isolated namespace has no external route.
  const sourceCa = '-----BEGIN CERTIFICATE-----\nfixture-only-root\n-----END CERTIFICATE-----\n';
  const sourcePassword = randomBytes(24).toString('hex');
  secrets.push(sourcePassword, sourceCa, 'fixture-only-root');
  const sourceBundle = {
    bundleVersion: 1,
    sourceBinding: { bindingVersion: 1, provider: 'supabase-postgres', projectRef: 'knodlkxqpcqyrtgwpdst',
      connectionMode: 'direct', hostname: 'db.knodlkxqpcqyrtgwpdst.supabase.co', port: 5432,
      databaseName: 'postgres', readerRole: 'fixture_reader', sslMode: 'verify-full',
      sslRootCertSha256: createHash('sha256').update(sourceCa).digest('hex') },
    databaseUrl: `postgresql://fixture_reader:${sourcePassword}@db.knodlkxqpcqyrtgwpdst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=%2Fcaller%2Fca.pem`,
    sslRootCertPem: sourceCa,
  };
  const sourceBundlePath = join(temp, 'source-bundle.json');
  writeFileSync(sourceBundlePath, JSON.stringify(sourceBundle), { mode: 0o444 });
  const sourceResult = runOwnedContainer('source-bundle-child', ['--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--mount', `type=bind,src=${sourceBundlePath},dst=/verification/source-bundle.json,readonly`,
    '--env', 'PROJED_MIGRATION_SOURCE_BUNDLE_FILE=/verification/source-bundle.json',
    '--env', 'PROJED_MIGRATION_TARGET_DATABASE_URL=postgresql://wrong-lifecycle@localhost/jenfu_prod',
    jobsImage, 'node', 'scripts/run-dev139-managed-job.mjs', 'plan'],
  { network: fixtureNetwork, allowFailure: true });
  assert.equal(sourceResult.status, 1);
  assert.match(sourceResult.stderr, /CONFIG_INVALID/);
  assert.ok(!`${sourceResult.stdout}${sourceResult.stderr}`.includes(sourcePassword));
  assert.ok(!`${sourceResult.stdout}${sourceResult.stderr}`.includes(sourceBundle.databaseUrl));
  assert.ok(!`${sourceResult.stdout}${sourceResult.stderr}`.includes('fixture-only-root'));
  passed('mounted-source-bundle-materializes-and-rejects-invalid-target-without-leaking');

  const runtimeArgs = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    ...socketMount, ...bindingMount(), '--env-file', join(temp, 'runtime.env'), runtimeImage];
  createContainer(appName, runtimeArgs, fixtureNetwork);
  await waitFor('compiled HTTP entry', () => docker(['exec', appName, 'node', '--input-type=module', '-e',
    "const r=await fetch('http://127.0.0.1:8080/health/ready',{signal:AbortSignal.timeout(4000)});process.exit(r.status===200?0:1)"], { allowFailure: true }).status === 0);
  appProbe(String.raw`
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    const sha = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.notEqual(process.getuid(), 0);
    const binding = JSON.parse(readFileSync('/verification/binding.json'));
    const metaBytes = readFileSync('dist/dev139-cloud-run-meta.json');
    assert.equal(sha(metaBytes), binding.staticFixtureSha256);
    const meta = JSON.parse(metaBytes);
    assert.equal(meta.releaseId, ${JSON.stringify(prefix)});
    for (const [path, expected] of [['/', meta.entrySha256], ['/quick-task/', meta.quickEntrySha256]]) {
      const response = await fetch('http://127.0.0.1:8080'+path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(sha(bytes), expected);
      const assets = [...bytes.toString().matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(m=>m[1]);
      assert.ok(assets.some(asset=>asset.endsWith('.js')));
      for (const asset of assets) {
        const r = await fetch('http://127.0.0.1:8080'+asset);
        assert.equal(r.status, 200);
        assert.equal(sha(Buffer.from(await r.arrayBuffer())), sha(readFileSync('dist'+asset)));
      }
    }
    for (const path of ['/health/live','/health/ready']) {
      const response = await fetch('http://127.0.0.1:8080'+path);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {status:'ok'});
    }
    for (const path of ['/api/v1/session','/api/v1/workspaces','/api/auth/jenfu-sso/login','/api/not-a-route']) {
      const response = await fetch('http://127.0.0.1:8080'+path);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).error.code, 'ENDPOINT_UNAVAILABLE');
      assert.equal(response.headers.get('set-cookie'), null);
    }
  `);
  passed('compiled-entry-real-main-quick-and-asset-hashes');
  passed('unpublished-session-and-private-api-fail-closed');

  pgSql(`GRANT projed_owner_disposable TO "${binding.iamLogins.runtime}";`);
  appProbe("import assert from 'node:assert/strict';assert.equal((await fetch('http://127.0.0.1:8080/health/ready')).status,503);");
  pgSql(`REVOKE projed_owner_disposable FROM "${binding.iamLogins.runtime}";
    CREATE SCHEMA fixture_sibling_core;
    GRANT CREATE ON SCHEMA fixture_sibling_core TO "${binding.iamLogins.runtime}";`);
  appProbe("import assert from 'node:assert/strict';assert.equal((await fetch('http://127.0.0.1:8080/health/ready')).status,503);");
  pgSql(`REVOKE CREATE ON SCHEMA fixture_sibling_core FROM "${binding.iamLogins.runtime}"; DROP SCHEMA fixture_sibling_core;`);
  appProbe("import assert from 'node:assert/strict';assert.equal((await fetch('http://127.0.0.1:8080/health/ready')).status,200);");
  passed('iam-session-rejects-owner-and-sibling-create-grants');

  // A malformed binding must fail before the server advertises readiness.
  const invalidBinding = { ...binding, staticFixtureSha256: '0'.repeat(64) };
  writeFileSync(join(temp, 'invalid-binding.json'), JSON.stringify(invalidBinding), { mode: 0o444 });
  const invalidName = `${prefix}-invalid`;
  createContainer(invalidName, ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    ...socketMount, ...bindingMount(join(temp, 'invalid-binding.json')),
    '--env-file', join(temp, 'runtime.env'), runtimeImage]);
  assert.equal(docker(['wait', invalidName], { timeout: 20_000 }).stdout.trim(), '1');
  const invalidLogs = docker(['logs', invalidName]);
  assert.match(`${invalidLogs.stdout}${invalidLogs.stderr}`, /"event":"projed_kernel_start_failed","code":"CONFIG_INVALID"/);
  assert.doesNotMatch(`${invalidLogs.stdout}${invalidLogs.stderr}`, /projed_kernel_ready/);
  passed('wrong-artifact-binding-refuses-startup');

  const version = Object.keys(binding.migrationSha256).at(-1).split('/').at(-1).replace(/\.sql$/, '');
  pgSql(`UPDATE projed_core.schema_migrations SET checksum=repeat('0',64) WHERE version='${version}';`);
  appProbe(`import assert from 'node:assert/strict'; const r=await fetch('http://127.0.0.1:8080/health/ready'); assert.equal(r.status,503); assert.equal((await r.json()).status,'unavailable');`);
  pgSql(`UPDATE projed_core.schema_migrations SET checksum='${binding.migrationSha256[`db/migrations/${version}.sql`]}' WHERE version='${version}';`);
  appProbe(`import assert from 'node:assert/strict'; assert.equal((await fetch('http://127.0.0.1:8080/health/ready')).status,200);`);
  passed('readiness-rejects-ledger-drift-and-recovers');

  docker(['stop', '--time', '15', pgName]);
  assert.equal(inspect(pgName).State.Running, false);
  appProbe(`
    import assert from 'node:assert/strict';
    for(let i=0;i<2;i++) {
      const r=await fetch('http://127.0.0.1:8080/health/ready',{signal:AbortSignal.timeout(6000)});
      assert.equal(r.status,503); assert.equal((await r.json()).status,'unavailable');
    }
    assert.equal((await fetch('http://127.0.0.1:8080/health/live')).status,200);
  `);
  assert.equal(inspect(appName).State.Running, true);
  docker(['start', pgName]);
  await waitFor('readiness after database recovery', () => docker(['exec', appName, 'node', '--input-type=module', '-e',
    "const r=await fetch('http://127.0.0.1:8080/health/ready',{signal:AbortSignal.timeout(6000)});process.exit(r.status===200?0:1)"], { allowFailure: true }).status === 0);
  passed('database-outage-returns-503-without-process-crash-and-recovers');

  docker(['kill', '--signal', 'SIGTERM', appName]);
  assert.equal(docker(['wait', appName], { timeout: 15_000 }).stdout.trim(), '0');
  const events = docker(['logs', appName]);
  const eventLines = `${events.stdout}${events.stderr}`.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.ok(eventLines.some(value => value.event === 'projed_kernel_ready' && value.host === '0.0.0.0' && value.port === 8080));
  assert.ok(eventLines.some(value => value.event === 'projed_kernel_stopped' && value.signal === 'SIGTERM'));
  assert.ok(!eventLines.some(value => /start_failed|shutdown_failed/.test(value.event)));
  assert.equal(inspect(appName).State.Running, false);
  passed('cloud-run-port-and-graceful-sigterm');

  // Codec qualification is independent of the database checks above. Use only
  // generated tone audio, a read-only owned container, and no network/credentials.
  docker(['build', '--platform', 'linux/amd64', '--target', 'media-runtime', '--label', `${label}=${nonce}`,
    '--build-arg', `PROJED_RELEASE_ID=${prefix}`, '-f', 'Dockerfile.dev139', '-t', mediaImage, '.'], { timeout: 600_000 });
  images.add(mediaImage);
  mediaImageId = inspect(mediaImage).Id;
  const codecResult = runOwnedContainer('media-codecs', ['--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', mediaImage, 'node', '--input-type=module', '-e', String.raw`
    import assert from 'node:assert/strict';
    import {spawnSync} from 'node:child_process';
    import {decodeMeetingAudioToPcm,splitMeetingPcm} from './dist-server/server/meetingAudioPcm.js';
    assert.notEqual(process.getuid(),0);
    const durationMs=52125, sampleRate=16000, samples=durationMs*16;
    const pcm=Buffer.alloc(samples*2);
    for(let i=0;i<samples;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/sampleRate)*2000),i*2);
    const wav=Buffer.alloc(44+pcm.length);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);
    wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);
    wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
    const version=spawnSync('/usr/bin/ffmpeg',['-version'],{encoding:'utf8'});
    assert.equal(version.status,0);
    const results=[];
    for(const [mime,args] of [
      ['audio/wav',null],
      ['audio/webm',['-c:a','libopus','-f','webm']],
      ['audio/ogg',['-c:a','libopus','-f','ogg']],
      ['audio/mpeg',['-c:a','libmp3lame','-f','mp3']],
      ['audio/mp4',['-c:a','aac','-movflags','frag_keyframe+empty_moov','-f','mp4']],
    ]){
      let bytes=wav;
      if(args){
        const encoded=spawnSync('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-nostdin',
          '-protocol_whitelist','pipe','-i','pipe:0','-vn',...args,'pipe:1'],
          {input:wav,maxBuffer:4*1024*1024,timeout:30000,env:{PATH:'/usr/bin:/bin',LANG:'C'}});
        assert.equal(encoded.status,0,'Synthetic codec encoding failed: '+mime);
        bytes=encoded.stdout;
      }
      const decoded=await decodeMeetingAudioToPcm({bytes,mimeType:mime,expectedDurationMs:durationMs});
      assert.ok(Math.abs(decoded.length/2-samples)<=4096,'Unexpected codec duration: '+mime);
      if(mime==='audio/wav')assert.deepEqual(decoded,pcm);
      const chunks=splitMeetingPcm(decoded);
      assert.equal(chunks.length,2);
      assert.ok(chunks.every(chunk=>chunk.endSample-chunk.startSample<=800000));
      assert.equal(chunks.reduce((sum,chunk)=>sum+chunk.bytes.length,0),decoded.length);
      results.push({mime,inputBytes:bytes.length,outputSamples:decoded.length/2,
        chunkSamples:chunks.map(chunk=>chunk.endSample-chunk.startSample)});
    }
    console.log(JSON.stringify({ffmpeg:version.stdout.split('\n')[0],fixtures:results,
      source:'GENERATED_TONE_ONLY',provider:'NOT_RUN',cloud:'NOT_RUN'}));
  `]);
  mediaProof = JSON.parse(codecResult.stdout.trim());
  assert.equal(mediaProof.fixtures.length, 5);
  passed('actual-nonroot-five-audio-formats-decoding-and-sample-chunking');
} catch (error) {
  firstFailure = error;
  for (const name of [...containers].reverse()) {
    try {
      const container = inspectResource('container', name);
      if (!container || container.Config.Labels[label] !== nonce) continue;
      const logs = docker(['logs', name], { allowFailure: true });
      diagnostics.push({ name, state: container.State.Status, exitCode: container.State.ExitCode,
        logs: sanitize(`${logs.stdout ?? ''}${logs.stderr ?? ''}`).slice(-8000) });
    } catch (diagnosticError) {
      diagnostics.push({ name, unavailable: sanitize(diagnosticError.message) });
    }
  }
} finally {
  for (const name of [...containers].reverse()) {
    try {
      const container = inspectResource('container', name);
      if (!container) continue;
      assert.equal(container.Config.Labels[label], nonce);
      docker(['rm', '--force', '--volumes', name]);
      assert.equal(inspectResource('container', name), undefined);
    } catch (error) { cleanupFailures.push(error); }
  }
  for (const name of volumes) {
    try {
      assert.equal(inspectResource('volume', name)?.Labels[label], nonce);
      docker(['volume', 'rm', name]);
      assert.equal(inspectResource('volume', name), undefined);
    } catch (error) { cleanupFailures.push(error); }
  }
  for (const name of images) {
    try {
      assert.equal(inspectResource('image', name)?.Config.Labels[label], nonce);
      docker(['image', 'rm', name]);
      assert.equal(inspectResource('image', name), undefined);
    } catch (error) { cleanupFailures.push(error); }
  }
  // Only this mkdtemp directory; no global Docker or filesystem pruning.
  try {
    chmodSync(temp, 0o700);
    rmSync(temp, { recursive: true });
  } catch (error) { cleanupFailures.push(error); }
}

if (!firstFailure && cleanupFailures.length === 0) passed('owned-container-socket-volume-and-credential-cleanup');
const status = firstFailure || cleanupFailures.length ? 'FAIL' : 'PASS';
const result = {
  status, evidenceLevel: 'ISOLATED_LINUX_OCI_IAM_SHAPED_POSTGRES',
  sourceSha: process.env.GITHUB_SHA, releaseId: prefix, imageId, jobsImageId, asrImageId, mediaImageId, mediaProof,
  postgres: postgresVersion, migrationCount: appliedMigrationCount,
  expectedMigrationCount: binding ? Object.keys(binding.migrationSha256).length : 0,
  profileSha256: binding?.profileSha256, migrationSha256: binding?.migrationSha256,
  staticFixtureSha256: binding?.staticFixtureSha256, checks,
  dockerExecution: status, browserSmoke: 'NOT_RUN', productionIdentity: 'NOT_RUN',
  metadataProvider: 'FIXTURE_ONLY', cloudIamAuthentication: 'NOT_RUN', proxyAuthentication: 'NOT_RUN',
  sourceSupabaseAuthentication: 'NOT_RUN',
  speechProviderAuthentication: 'NOT_RUN', speechRecognition: 'NOT_RUN',
  cloudSqlReadback: 'NOT_RUN', registryPush: 'NOT_RUN', productionRelease: 'NOT_RUN',
  ...(firstFailure ? { failure: sanitize(firstFailure.message) } : {}),
  ...(diagnostics.length ? { diagnostics } : {}),
  ...(cleanupFailures.length ? { cleanupFailures: cleanupFailures.map(error => sanitize(error.message)) } : {}),
};
const output = resolve('output/qa/dev-139/oci', prefix);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status, evidenceLevel: result.evidenceLevel, checks: checks.length }));
if (status !== 'PASS') {
  throw new AggregateError([...(firstFailure ? [firstFailure] : []), ...cleanupFailures], 'DEV-139 isolated OCI verification failed');
}
