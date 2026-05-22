import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

process.env.PROJED_ENV ||= 'p9';
await import('./load-local-env.mjs');

const tempDir = await mkdtemp(join(tmpdir(), 'projed-p9-rag-seed-'));

try {
  const outfile = join(tempDir, 'seed-p9-rag.mjs');
  await build({
    entryPoints: ['scripts/seed-p9-rag.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
