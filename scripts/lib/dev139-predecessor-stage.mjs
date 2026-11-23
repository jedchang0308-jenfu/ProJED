import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { sha256 } from '../release/production-contract.mjs';
import { verifyPublicPredecessor } from './dev139-http-artifact.mjs';

/** Copies exactly the verified public manifest entries, never the release
 * directory's env/receipts or the whole outputs tree. Original manifest bytes
 * stay immutable; the portable selection supplies its relocated public path. */
export function stagePublicPredecessor({ manifestPath, distDir, output }) {
  const verified = verifyPublicPredecessor(manifestPath, { distDir });
  const destination = resolve(output), source = verified.distDir;
  if (existsSync(destination) || destination === source || destination.startsWith(source + sep)) {
    throw new Error('Predecessor staging requires a new directory outside its source');
  }
  for (const entry of verified.tree.entries) {
    const target = resolve(destination, 'dist', entry.path);
    if (!target.startsWith(resolve(destination, 'dist') + sep)) throw new Error('Predecessor file path escapes public staging');
    const bytes = readFileSync(join(source, entry.path));
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('Predecessor source changed before staging');
  }
  mkdirSync(join(destination, 'dist'), { recursive: true });
  for (const entry of verified.tree.entries) {
    const target = join(destination, 'dist', entry.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, entry.path), target, constants.COPYFILE_EXCL);
  }
  const bytes = readFileSync(manifestPath);
  if (sha256(bytes) !== verified.manifestSha256) throw new Error('Predecessor manifest changed during staging');
  writeFileSync(join(destination, 'manifest.json'), bytes, { flag: 'wx' });
  const selection = { kind: 'projed.predecessor-stage.v1', distDir: 'dist', manifestSha256: sha256(bytes),
    treeSha256: verified.tree.treeSha256, releaseId: verified.manifest.releaseId };
  writeFileSync(join(destination, 'predecessor-selection.json'), JSON.stringify(selection, null, 2) + '\n', { flag: 'wx' });
  verifyPublicPredecessor(join(destination, 'manifest.json'));
  return selection;
}
