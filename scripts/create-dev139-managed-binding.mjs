import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createManagedBinding,
  loadManagedBindingFiles,
  parseManagedBindingOptions,
  serializeManagedBinding,
} from './lib/dev139-managed-binding.mjs';

const options = parseManagedBindingOptions(process.argv.slice(2));
const instance = options.instance ?? '';
const files = loadManagedBindingFiles(process.cwd());
const binding = createManagedBinding({
  ...files,
  instance,
  database: options.database ?? 'jenfu_prod',
});

const serialized = serializeManagedBinding(binding);
if (options.output) writeFileSync(resolve(options.output), serialized, { encoding: 'utf8', flag: 'wx' });
else process.stdout.write(serialized);
