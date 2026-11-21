import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// Official image linked by https://docs.postgrest.org/en/v13/explanations/install.html#docker.
// Docker Hub v13.0.8, linux/amd64 manifest; one 5,979,658-byte compressed layer.
export const LEGACY_POSTGREST_IMAGE = 'postgrest/postgrest:v13.0.8@sha256:78009f2af21b261c01b07c60e12933a8d3978a1600a3c00e4598fe57efdef578';

export async function verifyLegacyClientFenceOci({ docker, createContainer, runOwnedContainer,
  pgName, fixtureNetwork, toolsImage, prefix, nonce, secrets }) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.match(prefix, /^dev139-oci-[a-f0-9]{24}$/u);
  assert.equal(fixtureNetwork, `container:${prefix}-network`);
  const database = `dev139_t07_${nonce}`;
  const authenticator = `dev139_t07_${nonce}_authenticator`;
  const jwtSecret = randomBytes(48).toString('hex');
  secrets.push(jwtSecret);
  docker(['exec', pgName, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
    '-U', 'postgres', '-d', 'postgres', '-c', `CREATE DATABASE ${database};`]);
  const env = ['--env', `DEV139_T07_DATABASE=${database}`, '--env', `DEV139_T07_AUTHENTICATOR=${authenticator}`,
    '--env', `DEV139_T07_JWT_SECRET=${jwtSecret}`];
  // QA and Supabase history are deliberately excluded from production images.
  // Mount only these source fixtures into the disposable build-tool container.
  const sourceMounts = [
    ['qa/dev-139/t07', '/app/qa/dev-139/t07'],
    ['qa/dev-139/migration/source-fixture.sql', '/app/qa/dev-139/migration/source-fixture.sql'],
    ['supabase/migrations', '/app/supabase/migrations'],
  ].flatMap(([from, to]) => ['--mount', `type=bind,src=${resolve(from)},dst=${to},readonly`]);
  const run = mode => runOwnedContainer(`t07-${mode}`, ['--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    ...sourceMounts, ...env, toolsImage, 'node', '--experimental-strip-types', 'qa/dev-139/t07/legacy-client-fence.mjs', mode],
  { network: fixtureNetwork, timeout: 60_000 });
  run('prepare');
  const postgrestName = `${prefix}-t07-postgrest`;
  createContainer(postgrestName, ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--env', `PGRST_DB_URI=postgresql://${authenticator}@127.0.0.1:5432/${database}`,
    '--env', 'PGRST_DB_SCHEMAS=public', '--env', 'PGRST_DB_ANON_ROLE=anon',
    '--env', `PGRST_JWT_SECRET=${jwtSecret}`, '--env', 'PGRST_SERVER_HOST=127.0.0.1',
    '--env', 'PGRST_SERVER_PORT=3000', '--env', 'PGRST_DB_POOL=2',
    LEGACY_POSTGREST_IMAGE], fixtureNetwork);
  const output = run('verify').stdout.trim().split(/\r?\n/u);
  const proof = JSON.parse(output.at(-1));
  assert.equal(proof.status, 'PASS');
  const image = JSON.parse(docker(['image', 'inspect', LEGACY_POSTGREST_IMAGE]).stdout)[0];
  assert.equal(image.Os, 'linux');
  assert.equal(image.Architecture, 'amd64');
  assert.ok(image.RepoDigests.some(digest => digest.endsWith('@sha256:78009f2af21b261c01b07c60e12933a8d3978a1600a3c00e4598fe57efdef578')));
  return { ...proof, postgrestImage: LEGACY_POSTGREST_IMAGE, postgrestImageId: image.Id,
    network: 'NONCE_OWNED_LOOPBACK_ONLY_NO_PUBLISHED_PORTS', database: 'SEPARATE_NONCE_DATABASE_ON_EXISTING_OCI_POSTGRES' };
}
