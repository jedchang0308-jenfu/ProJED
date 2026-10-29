import { readFileSync } from 'node:fs';

import { loadRuntimeConfig, sha256 } from './config.js';
import { RuntimeDatabase, type ExpectedMigration } from './db.js';
import { createKernelHttpServer } from './http.js';
import { createRuntimeSessionAuth } from './runtimeSessionAuth.js';
import {createGeminiRagProvider} from './geminiRagProvider.js';
import {parseMeetingSynthesisModel} from './meetingSynthesisHttp.js';

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const expectedMigrations: ExpectedMigration[] = config.profile.migrations.map(({ version, path }) => {
    const checksum = sha256(readFileSync(path));
    if (config.binding.migrationSha256[path] !== checksum) throw new Error(`Migration source changed: ${version}`);
    return { version, checksum };
  });
  const database = new RuntimeDatabase(config);
  await database.assertRuntimeBoundary(expectedMigrations);
  const http = createKernelHttpServer(config, database, expectedMigrations, {
    ...createRuntimeSessionAuth(config,database),
    ragProvider:process.env.GEMINI_API_KEY?createGeminiRagProvider({apiKey:process.env.GEMINI_API_KEY}):undefined,
    meetingSynthesisModel:parseMeetingSynthesisModel(process.env.GEMINI_MEETING_SYNTHESIS_MODEL),
  });
  const address = await http.listen();
  console.log(JSON.stringify({ event: 'projed_kernel_ready', entry: config.entry, host: address.host, port: address.port }));

  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    const forced = setTimeout(() => process.exit(1), config.profile.runtime.timeouts.shutdownMillis);
    forced.unref();
    try {
      await http.shutdown();
      console.log(JSON.stringify({ event: 'projed_kernel_stopped', signal }));
      clearTimeout(forced);
    } catch (error) {
      console.error(JSON.stringify({ event: 'projed_kernel_shutdown_failed', signal, code: (error as NodeJS.ErrnoException).code ?? 'UNKNOWN' }));
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'projed_kernel_start_failed', code: (error as { code?: string }).code ?? 'UNKNOWN' }));
  process.exitCode = 1;
});
