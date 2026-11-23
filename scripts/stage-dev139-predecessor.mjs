import { stagePublicPredecessor } from './lib/dev139-predecessor-stage.mjs';
const options = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(manifest|dist|output)=(.+)$/.exec(arg);
  if (!match || Object.hasOwn(options, match[1])) throw new Error('Use unique --manifest, --dist and --output options');
  options[match[1]] = match[2];
}
if (!options.manifest || !options.output) throw new Error('A predecessor manifest and new output directory are required');
const result = stagePublicPredecessor({ manifestPath: options.manifest, distDir: options.dist, output: options.output });
console.log(JSON.stringify({ status: 'PUBLIC_PREDECESSOR_STAGED_NOT_DEPLOYED', ...result }));
