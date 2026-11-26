import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderOriginCutoverPlan } from './lib/dev139-origin-cutover-plan.mjs';

const options = {};
const allowed = new Set(['input', 'output']);
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/u);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) {
    throw new Error('Use unique --input=file [--output=file] options');
  }
  options[match[1]] = match[2];
}
if (!options.input) throw new Error('--input is required; this command only renders a plan');
let plan;
try { plan = renderOriginCutoverPlan(JSON.parse(readFileSync(resolve(options.input), 'utf8'))); }
catch { throw new Error('Origin cutover plan input is invalid; no provider operation was performed'); }
const output = `${JSON.stringify(plan, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), output, { flag: 'wx', mode: 0o600 });
else process.stdout.write(output);
