import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { CURRENT_LEGACY_ENTRY_BINDING } from './legacyEntryBinding.js';
import { createLegacyEntryRelay } from './legacyEntryRelay.js';

/** Import/check-only never reads credentials, connects DB or contacts upstream. */
export function legacyEntryCheck() {
  return { event: 'projed_legacy_entry_check', status: 'CHECK_ONLY',
    transport: CURRENT_LEGACY_ENTRY_BINDING === null ? 'UNPUBLISHED' : 'QUALIFICATION_BOUND',
    upstream: 'NOT_CONTACTED', userAuthority: 'APP_SESSION_REQUIRED', database: 'NOT_CONNECTED', models: 'NOT_RUN' } as const;
}

export function legacyEntryPort(value = '8080'): number {
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535) throw new Error('LEGACY_ENTRY_PORT_INVALID');
  return Number(value);
}

/** Stop accepting immediately; bound active-request draining within Run shutdown.
 * Closing a dispatched request cancels transport, never retries its write. */
export async function stopLegacyEntry(server: Server, timeoutMs = 8_000): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8_000) throw new Error('LEGACY_ENTRY_SHUTDOWN_INVALID');
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => server.closeAllConnections(), timeoutMs);
    server.close(error => { clearTimeout(deadline); if (error) reject(error); else resolve(); });
    server.closeIdleConnections();
  });
}

export async function legacyEntryMain(args: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (args.length === 1 && args[0] === '--check-only') { console.log(JSON.stringify(legacyEntryCheck())); return; }
  if (args.length !== 0) throw new Error('LEGACY_ENTRY_ARGUMENT_INVALID');
  const port = legacyEntryPort(env.PORT);
  // The source binding is authoritative. Neither env JSON nor a QA actor can
  // publish transport; null refuses before listen or metadata token retrieval.
  const server = createLegacyEntryRelay(CURRENT_LEGACY_ENTRY_BINDING);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(); });
  });
  console.log(JSON.stringify({ event: 'projed_legacy_entry_ready', port }));
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    void stopLegacyEntry(server).catch(() => { process.exitCode = 1; });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  server.once('close', () => { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void legacyEntryMain().catch(() => {
    console.error(JSON.stringify({ event: 'projed_legacy_entry_failed', code: 'LEGACY_ENTRY_UNAVAILABLE' }));
    process.exitCode = 1;
  });
}
