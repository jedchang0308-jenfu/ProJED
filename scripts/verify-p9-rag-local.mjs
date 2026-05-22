import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const tempDir = await mkdtemp(join(tmpdir(), 'projed-p9-rag-'));
const entryPoints = [
  'scripts/p9-rag-local-smoke.ts',
  'scripts/p9-trusted-embedding-worker-smoke.ts',
];

try {
  for (const entryPoint of entryPoints) {
    const outfile = join(tempDir, `${entryPoint.replace(/[\\/.:]/g, '-')}.mjs`);
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });

    await import(pathToFileURL(outfile).href);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
