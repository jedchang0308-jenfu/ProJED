import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match) throw new Error('Arguments must use --name=value');
  return [match[1], match[2]];
}));
const serviceId = options.service ?? '';
const region = options.region ?? '';
if (!/^[a-z][a-z0-9-]{0,62}$/.test(serviceId)) throw new Error('A valid --service is required');
if (!/^[a-z]+-[a-z]+[0-9]$/.test(region)) throw new Error('A valid --region is required');

const config = JSON.parse(readFileSync(resolve('firebase.json'), 'utf8'));
if (!config.hosting || Array.isArray(config.hosting)) throw new Error('Expected one existing Hosting site configuration');
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
