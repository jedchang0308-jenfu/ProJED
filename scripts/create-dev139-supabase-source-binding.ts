import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  sha256Bytes,
  validateSupabaseSourceBinding,
  type SupabaseSourceBindingV1,
} from './dev139-supabase-source-contract.js';

const allowedOptions = new Set(['project-ref', 'mode', 'host', 'database', 'user', 'ca', 'output']);
const options: Record<string, string> = {};
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match || !allowedOptions.has(match[1]!) || Object.hasOwn(options, match[1]!)) {
    throw new Error('Arguments must be unique supported --name=value options');
  }
  options[match[1]!] = match[2]!;
}

if (!options.ca) throw new Error('--ca is required');
const certificatePath = resolve(options.ca);
const binding: SupabaseSourceBindingV1 = validateSupabaseSourceBinding({
  bindingVersion: 1,
  provider: 'supabase-postgres',
  projectRef: options['project-ref'] ?? '',
  connectionMode: options.mode ?? '',
  hostname: options.host ?? '',
  port: 5432,
  databaseName: options.database ?? 'postgres',
  readerRole: options.user ?? '',
  sslMode: 'verify-full',
  sslRootCertSha256: sha256Bytes(readFileSync(certificatePath)),
});

const serialized = `${JSON.stringify(binding, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), serialized, { encoding: 'utf8', flag: 'wx' });
else process.stdout.write(serialized);
