import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { createAppSessionService } from '../../../server/appSessionService.js';
import type { RuntimeConfig, SourceProfile } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { createExternalInvitationPublisher } from '../../../server/externalBoardInvites.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { CURRENT_PRODUCTION_IDENTITY_PINS, IdentityConsumer } from '../../../server/identityConsumer.js';
import { createPlatformHandoffClient } from '../../../server/platformHandoff.js';
import { createPlatformIdentityVerifier } from '../../../server/platformIdentityVerifier.js';
import { createPlatformPrincipalStateReader, PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT } from '../../../server/platformPrincipalState.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import { GooglePrincipalMappingResolver } from '../../../server/principalMappings.js';

/** Test-only composition. All identity/provider evidence remains LOCAL_SIMULATION. */
export async function startOwnerSessionHttpConsumer(options: {
  root: string;
  databaseName: string;
  databasePort: number;
  brokerOrigin: string;
  manifestSha256: string;
  tokenProvider: (audience: string) => Promise<string>;
  externalOwnerOrigin?: string;
}) {
  if (!/^dev014_[a-f0-9]{20}$/u.test(options.databaseName)
      || !Number.isSafeInteger(options.databasePort) || options.databasePort < 1024
      || options.databasePort > 65535 || CURRENT_PRODUCTION_IDENTITY_PINS.length !== 0) {
    throw new Error('LOCAL_SIMULATION_CONSUMER_BINDING_REJECTED');
  }
  const profile = JSON.parse(readFileSync(resolve(options.root, 'config/dev-139/s3-read-disposable.profile.json'), 'utf8')) as SourceProfile;
  const config = {
    env: 'disposable', entry: 'main', host: '127.0.0.1', port: 0,
    databaseUrl: `postgresql://projed_runtime_disposable@127.0.0.1:${options.databasePort}/${options.databaseName}`,
    profile, staticRoot: resolve(options.root, profile.staticFixturePath),
  } as RuntimeConfig;
  const database = new RuntimeDatabase(config);
  let ownerAuthorizationQueries = 0;
  let lastStateRead: { readAtMs: number; clientCompletedAtMs: number } | null = null;
  let lastDatabaseFailure: { code: string; statementSha256: string; relation?: string; reason?: string } | null = null;
  const checkout = database.checkout.bind(database);
  database.checkout = async () => {
    const lease = await checkout();
    return { release: lease.release, client: new Proxy(lease.client, {
      get(target, key, receiver) {
        if (key !== 'query') return Reflect.get(target, key, receiver);
        return (...args: unknown[]) => {
          const command = args[0];
          const sql = typeof command === 'string' ? command
            : command && typeof command === 'object' && 'text' in command ? String(command.text) : '';
          if (/\b(?:platform_contract|orgmaster_contract)\./u.test(sql)) ownerAuthorizationQueries++;
          const result = Reflect.apply(target.query, target, args);
          if (!result || typeof result.then !== 'function') return result;
          return result.then((response: { rows?: Array<{ read_at?: unknown }> }) => {
            if (sql.includes('platform_contract.read_projed_principal_state_v1')) {
              const raw = response.rows?.[0]?.read_at;
              const readAtMs = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
              if (Number.isFinite(readAtMs)) lastStateRead = { readAtMs, clientCompletedAtMs: Date.now() };
            }
            return response;
          }).catch((error: unknown) => {
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
            const message = error instanceof Error ? error.message : '';
            lastDatabaseFailure = { code: /^[A-Z0-9_]{3,64}$/u.test(code) ? code : 'UNKNOWN',
              statementSha256: createHash('sha256').update(sql).digest('hex'),
              relation: /\b(?:FROM|INTO|UPDATE)\s+([a-z_]+\.[a-z_]+)/iu.exec(sql)?.[1],
              ...(/^[A-Z][A-Z0-9_]{2,80}$/u.test(message) ? { reason: message } : {}),
            };
            throw error;
          });
        };
      },
    }) };
  };
  const publishExternalInvitation = options.externalOwnerOrigin
    ? createExternalInvitationPublisher(async audience => {
      if (audience !== 'https://orgmaster-prod-9536592944.asia-east1.run.app') throw new Error('LOCAL_SIMULATION_EXTERNAL_AUDIENCE_REJECTED');
      return 'LOCAL_SIMULATION.projed-external-caller';
    }, async (input, init) => {
      const target = new URL(String(input));
      if (target.href !== 'https://orgmaster-prod-9536592944.asia-east1.run.app/api/internal/projed-external-requests/v1') {
        throw new Error('LOCAL_SIMULATION_EXTERNAL_TARGET_REJECTED');
      }
      const local = new URL(options.externalOwnerOrigin!);
      if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.origin !== options.externalOwnerOrigin) {
        throw new Error('LOCAL_SIMULATION_EXTERNAL_ORIGIN_REJECTED');
      }
      return fetch(new URL(target.pathname, local), init);
    }) : undefined;
  let auth: ReturnType<typeof createAppSessionService> | undefined;
  const getAuth = () => {
    if (!auth) throw new Error('LOCAL_SIMULATION_CONSUMER_NOT_READY');
    return auth;
  };
  const kernel = createKernelHttpServer(config, database, [], {
    publishExternalInvitation,
    dispatchAuth: (...args) => getAuth().dispatchAuth(...args),
    resolveActor: (...args) => getAuth().resolveActor(...args),
    resolveSessionInfo: (...args) => getAuth().resolveSessionInfo(...args),
    resolveLogoutIdentity: (...args) => getAuth().resolveLogoutIdentity(...args),
    destroySession: (...args) => getAuth().destroySession(...args),
  });
  try {
    const address = await kernel.listen();
    const origin = `http://${address.host}:${address.port}`;
    const binding = {
      contractVersion: 'jenfu.sso-handoff.v4' as const, audience: 'projed' as const,
      issuer: `${options.brokerOrigin}/api/sso`, manifestSha256: options.manifestSha256,
    };
    const states = createPlatformPrincipalStateReader({
      contractBinding: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
      handoffBinding: binding, environment: 'test',
      query: { async query(sql, values) {
        const lease = await database.checkout();
        try { return { rows: (await lease.client.query(sql, [...values])).rows }; }
        finally { lease.release(); }
      } },
    });
    const mappings = new GooglePrincipalMappingResolver(database);
    const handoffs = createPlatformHandoffClient({
      environment: 'test', brokerOrigin: options.brokerOrigin, binding,
      callbacks: { main: `${origin}/api/auth/jenfu-sso/callback`, quick: `${origin}/api/auth/jenfu-sso/callback` },
      tokenProvider: options.tokenProvider,
    });
    const consumer = new IdentityConsumer({ pins: [binding], mappings,
      verifier: createPlatformIdentityVerifier({ handoffs, stateReader: states, binding, environment: 'test' }),
    });
    auth = createAppSessionService({
      store: new PostgresAppSessionStore(database), consumer, mappings, binding,
      pins: [binding], origins: { main: origin, quick: origin }, environment: 'test',
    });
    return { origin, shutdown: () => kernel.shutdown(), readCounters: () => ({ ownerAuthorizationQueries, lastDatabaseFailure, lastStateRead }) };
  } catch (error) {
    if (kernel.server.listening) await kernel.shutdown();
    else await database.end();
    throw error;
  }
}
