import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderAnalysisImageBuild } from './lib/dev139-analysis-image-build.mjs';

const allowed = new Set(['output', 'predecessor-image', 'release-id', 'source-generation', 'source-revision', 'source-sha256']);
const options = {};
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) {
    throw new Error('Use unique --predecessor-image=image --release-id=id --source-revision=sha --source-sha256=sha --source-generation=id [--output=file] options');
  }
  options[match[1]] = match[2];
}
for (const name of ['predecessor-image', 'release-id', 'source-generation', 'source-revision', 'source-sha256']) {
  if (!options[name]) throw new Error(`--${name} is required; this command only renders a build request`);
}

let plan;
try {
  plan = renderAnalysisImageBuild({
    predecessorRuntimeImage: options['predecessor-image'], releaseId: options['release-id'],
    sourceArchiveSha256: options['source-sha256'], sourceGeneration: options['source-generation'],
    sourceRevision: options['source-revision'],
  });
} catch { throw new Error('Analysis image build input is invalid; no provider operation was performed'); }
const text = `${JSON.stringify(plan, null, 2)}\n`;
if (options.output) writeFileSync(resolve(options.output), text, { flag: 'wx', mode: 0o600 });
else process.stdout.write(text);
