import { createAppSessionService } from './appSessionService.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import { KernelError } from './errors.js';
import type { KernelHttpOptions } from './http.js';
import { CURRENT_PRODUCTION_IDENTITY_PINS, IdentityConsumer } from './identityConsumer.js';
import { createPlatformHandoffClient, type PlatformHandoffBinding } from './platformHandoff.js';
import { createPlatformIdentityVerifier } from './platformIdentityVerifier.js';
import {
  createPlatformPrincipalStateReader, PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT, PLATFORM_PROJED_PRINCIPAL_STATE_SQL,
} from './platformPrincipalState.js';
import { PostgresAppSessionStore } from './postgresAppSessionStore.js';
import { GooglePrincipalMappingResolver } from './principalMappings.js';
import { createServiceIdentityTokenProvider } from './serviceIdentityToken.js';
import { createExternalInvitationPublisher } from './externalBoardInvites.js';
import { parseOriginSwitchConfig } from './originSwitchConfig.js';

function configError(): never { throw new KernelError('CONFIG_INVALID','Published Session configuration is incomplete',503); }
type RuntimeSessionAuthOptions = KernelHttpOptions & {
  readonly resolveMeetingRunActor?: ReturnType<typeof createAppSessionService>['resolveMeetingRunActor'];
};

function origin(value: string | undefined): string {
  if (!value) configError();
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value && url.username === '' && url.password === '') return value;
  } catch { /* Fail closed below. */ }
  return configError();
}

function publicOrigins(primary: string, additional: string | undefined): readonly string[] {
  if (additional === undefined) return Object.freeze([primary]);
  let values: unknown;
  try { values = JSON.parse(additional); } catch { configError(); }
  if (!Array.isArray(values) || values.length > 7 || values.some(value => typeof value !== 'string')) configError();
  const result = [primary, ...values.map(value => origin(value as string))];
  if (new Set(result).size !== result.length) configError();
  return Object.freeze(result);
}

/** Production composition cannot be activated by an environment flag or QA actor. */
export function createRuntimeSessionAuth(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeSessionAuthOptions {
  // Disposable kernels use explicit local test transports, never live owners.
  if (config.env === 'disposable') return {};
  if (CURRENT_PRODUCTION_IDENTITY_PINS.length === 0) return {};
  if (config.env !== 'managed') configError();
  const brokerOrigin = origin(env.PROJED_SSO_BROKER_ORIGIN);
  const main = origin(env.PROJED_MAIN_PUBLIC_ORIGIN);
  const quick = origin(env.PROJED_QUICK_PUBLIC_ORIGIN ?? main);
  const origins = Object.freeze({
    main: publicOrigins(main, env.PROJED_MAIN_ADDITIONAL_PUBLIC_ORIGINS),
    quick: publicOrigins(quick, env.PROJED_QUICK_ADDITIONAL_PUBLIC_ORIGINS),
  });
  // Preserve an explicitly shared legacy primary, but do not collapse two
  // independent entries onto one added origin with the same host-only cookie.
  if (origins.main.some(value => origins.quick.includes(value) && (value !== main || value !== quick))) configError();
  const pin = CURRENT_PRODUCTION_IDENTITY_PINS.find(value => value.contractVersion === 'jenfu.sso-handoff.v4'
    && value.issuer === `${brokerOrigin}/api/sso` && value.audience === 'projed');
  if (!pin) configError();
  const binding: PlatformHandoffBinding = {
    contractVersion: 'jenfu.sso-handoff.v4', issuer: pin.issuer,
    manifestSha256: pin.manifestSha256, audience: 'projed',
  };
  const states = createPlatformPrincipalStateReader({
    contractBinding: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
    handoffBinding: binding, environment: 'production',
    query: {
      async query(text, values) {
        if (text !== PLATFORM_PROJED_PRINCIPAL_STATE_SQL || values.length !== 3) configError();
        const lease = await database.checkout();
        try {
          const result = await lease.client.query(text,[...values]);
          lease.release();
          return { rows: result.rows };
        } catch {
          lease.release(true);
          throw new KernelError('IDENTITY_STATE_UNAVAILABLE','Current identity state is unavailable',503);
        }
      },
    },
  });
  const mappings = new GooglePrincipalMappingResolver(database);
  const handoffs = createPlatformHandoffClient({
    environment: 'production', brokerOrigin, binding,
    callbacks: { main: origins.main.map(value => `${value}/api/auth/jenfu-sso/callback`),
      quick: origins.quick.map(value => `${value}/api/auth/jenfu-sso/callback`) },
    tokenProvider: createServiceIdentityTokenProvider({ brokerOrigin }),
  });
  const consumer = new IdentityConsumer({
    pins: CURRENT_PRODUCTION_IDENTITY_PINS, mappings,
    verifier: createPlatformIdentityVerifier({ handoffs,stateReader:states,binding,environment:'production' }),
  });
  const auth = createAppSessionService({
    store: new PostgresAppSessionStore(database), consumer, mappings, binding,
    pins: CURRENT_PRODUCTION_IDENTITY_PINS, origins, environment:'production',
  });
  return { publishExternalInvitation:createExternalInvitationPublisher(),dispatchAuth:auth.dispatchAuth,resolveActor:auth.resolveActor,
    originSwitchCampaign:parseOriginSwitchConfig(env.PROJED_ORIGIN_SWITCH_CAMPAIGN,origins),
    resolveSessionInfo:auth.resolveSessionInfo,resolveLogoutIdentity:auth.resolveLogoutIdentity,
    destroySession:auth.destroySession,resolveMeetingRunActor:auth.resolveMeetingRunActor };
}
