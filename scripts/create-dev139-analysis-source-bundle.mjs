import { resolve } from 'node:path';
import { createAnalysisSourceBundle } from './lib/dev139-analysis-source-bundle.mjs';

const options = {};
const allowed = new Set(['output-dir', 'release-id', 'source-revision']);
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) {
    throw new Error('Use unique --source-revision=sha --release-id=id --output-dir=dir options');
  }
  options[match[1]] = match[2];
}
if (!options['source-revision'] || !options['release-id'] || !options['output-dir']) {
  throw new Error('Source revision, release ID, and output directory are required; no provider operation was performed');
}
let result;
try {
  result = createAnalysisSourceBundle({
    repoRoot: process.cwd(),
    outputDir: resolve(options['output-dir']),
    releaseId: options['release-id'],
    sourceRevision: options['source-revision'],
  });
} catch {
  throw new Error('Analysis source bundle creation failed; no provider operation was performed');
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
