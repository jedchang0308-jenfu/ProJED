import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderAnalysisJobUpdate } from './lib/dev139-analysis-job-update.mjs';

const allowed = new Set(['analysis-image', 'baseline', 'binding', 'output', 'release-id', 'source-revision']);
const options = {};
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) {
    throw new Error('Use unique --baseline=file --binding=file --analysis-image=image --release-id=id --source-revision=sha [--output=file] options');
  }
  options[match[1]] = match[2];
}
for (const name of ['analysis-image', 'baseline', 'binding', 'release-id', 'source-revision']) {
  if (!options[name]) throw new Error(`--${name} is required; this command only renders an update request`);
}

let plan;
try {
  plan = renderAnalysisJobUpdate({
    analysisImage: options['analysis-image'],
    baseline: JSON.parse(readFileSync(resolve(options.baseline), 'utf8')),
    binding: JSON.parse(readFileSync(resolve(options.binding), 'utf8')),
    releaseId: options['release-id'],
    sourceRevision: options['source-revision'],
  });
} catch {
  throw new Error('Analysis Job update input is invalid; no provider operation was performed');
}
const text = `${JSON.stringify(plan, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), text, { flag: 'wx', mode: 0o600 });
else process.stdout.write(text);

