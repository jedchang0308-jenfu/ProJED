import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const INSTANCE_RE = /^[a-z][a-z0-9-]{5,29}:[a-z0-9-]+:[a-z][a-z0-9-]{0,97}$/;

const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match) throw new Error('Arguments must use --name=value');
  return [match[1], match[2]];
}));

const instance = options.instance ?? '';
if (!INSTANCE_RE.test(instance)) throw new Error('A valid --instance=project:region:instance is required');
if (options.database && options.database !== 'projed') throw new Error('Managed database name must be projed');

const profilePath = resolve('config/dev-139/s3-managed.profile.json');
const profileBytes = readFileSync(profilePath);
const profile = JSON.parse(profileBytes.toString('utf8'));
if (profile.profileVersion !== 1 || profile.appKey !== 'projed' || profile.environment !== 'managed'
    || profile.database?.namePattern !== '^projed$' || profile.database?.host !== 'cloud-sql-unix'
    || profile.roles?.runtime !== 'projed_runtime_disposable') {
  throw new Error('Managed profile contract mismatch');
}

const binding = {
  databaseName: 'projed',
  databasePort: 5432,
  runtimeRole: profile.roles.runtime,
  connectionMode: 'cloud-sql-unix',
  cloudSqlInstance: instance,
  profileSha256: sha256(profileBytes),
  migrationSha256: Object.fromEntries(profile.migrations.map(({ path }) => [path, sha256(readFileSync(resolve(path)))])),
  staticFixtureSha256: sha256(readFileSync(resolve(profile.staticFixturePath, 'dev139-cloud-run-meta.json'))),
};

const serialized = `${JSON.stringify(binding, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), serialized, { encoding: 'utf8', flag: 'wx' });
else process.stdout.write(serialized);
