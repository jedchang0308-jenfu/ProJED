import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderProjedCloudRun } from './lib/dev139-cloud-run-plan.mjs';

const options = {};
const allowed = new Set(['input', 'output']);
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) throw new Error('Use unique --input=file [--output=file] options');
  options[match[1]] = match[2];
}
if (!options.input) throw new Error('--input is required; this command only renders requests');
let plan;
try { plan = renderProjedCloudRun(JSON.parse(readFileSync(resolve(options.input), 'utf8'))); }
catch { throw new Error('Cloud Run plan input is invalid; no provider operation was performed'); }
const text = `${JSON.stringify(plan, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), text, { flag: 'wx', mode: 0o600 });
else process.stdout.write(text);
