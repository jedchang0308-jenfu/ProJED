import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const result = spawnSync(process.execPath, [
  'scripts/create-dev139-hosting-config.mjs',
  '--service=projed-api',
  '--region=asia-east1',
], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const generated = JSON.parse(result.stdout);
const baseline = JSON.parse(readFileSync('firebase.json', 'utf8'));

assert.deepEqual(generated.hosting.rewrites[0], {
  source: '/api{,/**}',
  run: { serviceId: 'projed-api', region: 'asia-east1' },
});
assert.deepEqual(generated.hosting.rewrites.slice(1), baseline.hosting.rewrites);
assert.equal(generated.hosting.rewrites.at(-1)?.destination, '/index.html');
assert.equal(generated.hosting.public, baseline.hosting.public);
assert.deepEqual(generated.hosting.headers, baseline.hosting.headers);
assert.equal(JSON.stringify(baseline).includes('projed-api'), false, 'live Hosting config must remain unchanged before release');

for (const args of [
  ['--service=../other', '--region=asia-east1'],
  ['--service=projed-api', '--region=not-a-region'],
]) {
  const invalid = spawnSync(process.execPath, ['scripts/create-dev139-hosting-config.mjs', ...args], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
}

console.log(JSON.stringify({
  status: 'PASS',
  apiRewriteFirst: true,
  legacyStaticRewritesPreserved: baseline.hosting.rewrites.length,
  liveConfigChanged: false,
}));
