import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { LEGACY_ENTRY_TARGET, renderLegacyEntryHosting, renderLegacyEntryService } from '../../../scripts/lib/dev139-legacy-entry-plan.mjs';

const baseline = JSON.parse(readFileSync('firebase.json', 'utf8'));
const source = readFileSync('firebase.json');

test('old-origin plan sends root, Quick, SW, version assets and APIs to the same fixed relay without static shadowing', () => {
  const result = renderLegacyEntryHosting(baseline);
  assert.equal(result.hosting.site, 'projed-cc78d');
  assert.equal(result.hosting.public, 'legacy-entry-public');
  assert.deepEqual(result.hosting.ignore, ['**']);
  assert.deepEqual(result.hosting.rewrites, [{ source: '**', run: { serviceId: 'projed-legacy-entry', region: 'asia-east1' } }]);
  assert.equal(result.hosting.redirects, undefined);
  assert.equal(JSON.stringify(result).includes('run.app'), false, 'Browser URL must not move to the central host');
  assert.equal(result.hosting.headers[0].headers.find(header => header.key === 'Cache-Control').value.includes('no-store'), true);
  assert.throws(() => renderLegacyEntryHosting({ hosting: { ...baseline.hosting, redirects: [{ source: '**', destination: '/' }] } }), /reviewed/);
});

test('opt-in CLI creates only a new config/empty public and refuses existing config, nonempty public or unbound targets', () => {
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'dev139-entry-plan-'));
  const output = join(directory, 'firebase.legacy-entry.json');
  const args = ['scripts/create-dev139-hosting-config.mjs', '--mode=legacy-entry', '--service=projed-legacy-entry', '--region=asia-east1', `--output=${output}`];
  try {
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, 'PREPARED_NOT_DEPLOYED');
    assert.deepEqual(readdirSync(join(directory, LEGACY_ENTRY_TARGET.publicDirectory)), []);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), renderLegacyEntryHosting(baseline));
    assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
    writeFileSync(join(directory, LEGACY_ENTRY_TARGET.publicDirectory, 'index.html'), 'old-app');
    const next = args.slice(0, -1).concat(`--output=${join(directory, 'second.json')}`);
    assert.notEqual(spawnSync(process.execPath, next, { encoding: 'utf8' }).status, 0);
    for (const invalid of [
      args.filter(value => !value.startsWith('--output=')),
      args.map(value => value === '--service=projed-legacy-entry' ? '--service=projed-prod' : value),
      [...args, '--mode=api-only'], [...args, '--project=another-project'],
    ]) assert.notEqual(spawnSync(process.execPath, invalid, { encoding: 'utf8' }).status, 0);
    assert.deepEqual(readFileSync('firebase.json'), source);
  } finally {
    assert.equal(dirname(directory), temporaryRoot); assert.ok(basename(directory).startsWith('dev139-entry-plan-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('relay resource renderer is private, has its dedicated identity and has no SQL/network/credential composition', () => {
  const input = { image: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/projed-release/projed-legacy-entry@sha256:' + 'a'.repeat(64),
    sourceRevision: 'b'.repeat(40), releaseId: 'dev139-entry-fixture' };
  const plan = renderLegacyEntryService(input);
  assert.equal(plan.name, 'projects/projed-cc78d/locations/asia-east1/services/projed-legacy-entry');
  assert.equal(plan.invokerIamDisabled, false);
  assert.equal(plan.template.serviceAccount, LEGACY_ENTRY_TARGET.account);
  assert.deepEqual(plan.template.scaling, { minInstanceCount: 0, maxInstanceCount: 1 });
  assert.equal(plan.template.maxInstanceRequestConcurrency, 2);
  assert.equal(plan.template.vpcAccess, undefined);
  assert.equal(plan.template.volumes, undefined);
  assert.equal(plan.template.containers[0].env, undefined);
  assert.equal(plan.template.containers.length, 1);
  assert.equal(JSON.stringify(plan).includes('allUsers'), false);
  for (const image of ['image:latest', input.image.replace('/projed-legacy-entry@', '/projed-prod@')]) {
    assert.throws(() => renderLegacyEntryService({ ...input, image }), /immutable/);
  }
});
