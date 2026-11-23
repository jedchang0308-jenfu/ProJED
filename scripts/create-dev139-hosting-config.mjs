import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LEGACY_ENTRY_TARGET, renderLegacyEntryHosting } from './lib/dev139-legacy-entry-plan.mjs';

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match) throw new Error('Arguments must use --name=value');
  if (!['service', 'region', 'output', 'mode'].includes(match[1])) throw new Error('Unknown Hosting option');
  if (Object.hasOwn(options, match[1])) throw new Error('Duplicate Hosting option');
  options[match[1]] = match[2];
}
const serviceId = options.service ?? '';
const region = options.region ?? '';
if (!/^[a-z][a-z0-9-]{0,62}$/.test(serviceId)) throw new Error('A valid --service is required');
if (!/^[a-z]+-[a-z]+[0-9]$/.test(region)) throw new Error('A valid --region is required');

const config = JSON.parse(readFileSync(resolve('firebase.json'), 'utf8'));
if (!config.hosting || Array.isArray(config.hosting)) throw new Error('Expected one existing Hosting site configuration');
if (options.mode === 'legacy-entry') {
  if (serviceId !== LEGACY_ENTRY_TARGET.service || region !== LEGACY_ENTRY_TARGET.region || !options.output) {
    throw new Error('Legacy entry requires its fixed service/region and a new --output file');
  }
  const output = resolve(options.output);
  if (existsSync(output)) throw new Error('Refusing to replace an existing Hosting config');
  const publicDirectory = resolve(dirname(output), LEGACY_ENTRY_TARGET.publicDirectory);
  if (existsSync(publicDirectory)) {
    if (lstatSync(publicDirectory).isSymbolicLink() || !lstatSync(publicDirectory).isDirectory() || readdirSync(publicDirectory).length) {
      throw new Error('Legacy entry Hosting public must be an empty real directory');
    }
  }
  const generated = renderLegacyEntryHosting(config);
  mkdirSync(publicDirectory, { recursive: true });
  writeFileSync(output, `${JSON.stringify(generated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'PREPARED_NOT_DEPLOYED', output, publicDirectory,
    project: LEGACY_ENTRY_TARGET.project, predecessorAssets: 'REQUIRED_BEFORE_SWITCH', publicIam: 'NOT_AUTHORIZED' })}\n`);
  process.exit(0);
}
if (options.mode !== undefined && options.mode !== 'api-only') throw new Error('Unknown Hosting mode');
const existingRewrites = config.hosting.rewrites ?? [];
if (existingRewrites.some(rewrite => rewrite.source === '/api{,/**}' || rewrite.regex?.includes('/api'))) {
  throw new Error('Existing Hosting config already owns the API namespace');
}
const generated = {
  ...config,
  hosting: {
    ...config.hosting,
    rewrites: [
      { source: '/api{,/**}', run: { serviceId, region } },
      ...existingRewrites,
    ],
  },
};
const serialized = `${JSON.stringify(generated, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), serialized, { encoding: 'utf8', flag: 'wx' });
else process.stdout.write(serialized);
