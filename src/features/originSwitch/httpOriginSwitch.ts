import { HttpApiClient, HttpApiError, type HttpExpectedActor } from '../../services/httpApi/httpApiClient';
import { createHttpSessionAdapter, type ProjedAppEntry } from '../../services/httpApi/sessionAdapter';
import { guideStorageKey, type DestinationInspection, type GuideEntry, type GuideScope, type GuideStorage } from './guide';
import { ORIGIN_SWITCH_UUID } from './locator';

export interface OriginSwitchRoute {
  entry: GuideEntry;
  sourceOrigin: string;
  targetOrigin: string;
  sourceSessionEntry: ProjedAppEntry;
  targetSessionEntry: ProjedAppEntry;
}
export interface OriginSwitchConfig { campaign: string; routes: OriginSwitchRoute[] }
export interface OriginSwitchIntent extends GuideScope { id: string; expiresAt: number }
export interface OriginSwitchReceipt extends OriginSwitchIntent { destination: DestinationInspection | null }

const invalid = () => new Error('ORIGIN_SWITCH_RESPONSE_INVALID');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const exact = (value: unknown, keys: string[]) => {
  const result = object(value);
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(result, key))) throw invalid();
  return result;
};
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const entry = (value: unknown): value is GuideEntry => value === 'main' || value === 'quick';
const origin = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
  catch { return false; }
};
const expiry = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > Date.now();
const data = (value: unknown) => exact(value, ['data']).data;

export function parseOriginSwitchConfig(value: unknown): OriginSwitchConfig | null {
  const payload = data(value);
  if (payload === null) return null;
  const config = exact(payload, ['campaign', 'routes']);
  if (!text(config.campaign) || !Array.isArray(config.routes) || config.routes.length > 16) throw invalid();
  const routes = config.routes.map(value => {
    const route = exact(value, ['entry', 'sourceOrigin', 'targetOrigin', 'sourceSessionEntry', 'targetSessionEntry']);
    if (!entry(route.entry) || !entry(route.sourceSessionEntry) || !entry(route.targetSessionEntry)
      || !origin(route.sourceOrigin) || !origin(route.targetOrigin) || route.sourceOrigin === route.targetOrigin) throw invalid();
    return route as unknown as OriginSwitchRoute;
  });
  return { campaign: config.campaign, routes };
}

function parseIntent(value: unknown, expected: { id: string; accountId: string }, receipt: boolean): OriginSwitchReceipt {
  const payload = exact(value, ['id', 'campaign', 'sourceOrigin', 'targetOrigin', 'accountId', 'entry', 'expiresAt',
    ...(receipt ? ['destination'] : [])]);
  if (payload.id !== expected.id || !ORIGIN_SWITCH_UUID.test(expected.id) || payload.accountId !== expected.accountId
    || !text(payload.campaign) || !origin(payload.sourceOrigin) || !origin(payload.targetOrigin)
    || payload.sourceOrigin === payload.targetOrigin || !entry(payload.entry) || !expiry(payload.expiresAt)) throw invalid();
  const destination = receipt ? payload.destination : null;
  if (destination !== null) {
    const proof = exact(destination, ['sourceOrigin', 'targetOrigin', 'accountId', 'entry', 'workspaceMatched', 'permissionsMatched', 'expiresAt']);
    if (proof.sourceOrigin !== payload.sourceOrigin || proof.targetOrigin !== payload.targetOrigin
      || proof.accountId !== payload.accountId || proof.entry !== payload.entry
      || typeof proof.workspaceMatched !== 'boolean' || typeof proof.permissionsMatched !== 'boolean' || !expiry(proof.expiresAt)) throw invalid();
  }
  return { ...payload, destination } as unknown as OriginSwitchReceipt;
}

export function createHttpOriginSwitchAdapter(client: HttpApiClient) {
  const actor = client.snapshotExpectedActor();
  const request = async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
    const current = client.snapshotExpectedActor();
    if (current.accountId !== actor.accountId || current.contextId !== actor.contextId) throw new Error('ORIGIN_SWITCH_ACTOR_CHANGED');
    return client.request<unknown>(path, { method, ...(body === undefined ? {} : { body }), expectedActor: actor,
      signal: AbortSignal.timeout(5000) });
  };
  const read = async (id: string): Promise<OriginSwitchReceipt | null> => {
    if (!ORIGIN_SWITCH_UUID.test(id)) throw invalid();
    const payload = data(await request(`/api/v1/origin-switch/intents/${id}`));
    return payload === null ? null : parseIntent(payload, { id, accountId: actor.accountId }, true);
  };
  return {
    actor: actor as Readonly<HttpExpectedActor>,
    config: async () => parseOriginSwitchConfig(await request('/api/v1/origin-switch/config')),
    read,
    async create(id: string, scope: GuideScope): Promise<OriginSwitchIntent> {
      if (!ORIGIN_SWITCH_UUID.test(id) || scope.accountId !== actor.accountId) throw invalid();
      const payload = data(await request('/api/v1/origin-switch/intents', 'POST', {
        id, campaign: scope.campaign, entry: scope.entry, targetOrigin: scope.targetOrigin,
      }));
      const intent = parseIntent(payload, { id, accountId: actor.accountId },
        Object.prototype.hasOwnProperty.call(object(payload), 'destination'));
      assertIntentScope(intent, scope);
      return intent;
    },
    async confirm(id: string): Promise<OriginSwitchReceipt> {
      if (!ORIGIN_SWITCH_UUID.test(id)) throw invalid();
      return parseIntent(data(await request(`/api/v1/origin-switch/intents/${id}/confirm`, 'POST', {})),
        { id, accountId: actor.accountId }, true);
    },
  };
}

export function assertIntentScope(intent: OriginSwitchIntent, scope: GuideScope): void {
  if (['campaign', 'sourceOrigin', 'targetOrigin', 'accountId', 'entry'].some(key =>
    intent[key as keyof GuideScope] !== scope[key as keyof GuideScope])) throw invalid();
}

export function createSourceOriginSwitchConnection(scope: GuideScope, client: HttpApiClient, storage: GuideStorage,
  open: (url: string) => void, newId: () => string = () => crypto.randomUUID()) {
  const adapter = createHttpOriginSwitchAdapter(client);
  const key = `${guideStorageKey(scope)}:intent:${adapter.actor.contextId}`;
  let id = storage.getItem(key);
  if (id !== null && !ORIGIN_SWITCH_UUID.test(id)) throw invalid();
  const read = async () => {
    if (!id) return null;
    const receipt = await adapter.read(id);
    if (receipt) assertIntentScope(receipt, scope);
    return receipt;
  };
  const openDestination = async () => {
    const allocate = () => {
      id = newId();
      if (!ORIGIN_SWITCH_UUID.test(id)) throw invalid();
      storage.setItem(key, id); // Must be durable before a possibly unknown POST.
    };
    if (!id) allocate();
    let intent: OriginSwitchIntent | null;
    try { intent = await read(); }
    catch (error) {
      // This user action may replace a known-invalid intent. Unknown/denied
      // reads retain the same id and never silently create another one.
      if (!(error instanceof HttpApiError) || error.status !== 409 || error.code !== 'REVISION_CONFLICT') throw error;
      allocate();
      intent = await read();
    }
    if (!intent) {
      try { intent = await adapter.create(id!, scope); }
      catch (error) {
        intent = await read(); // Unknown POST: authoritative same-id readback first.
        if (!intent) throw error;
      }
    }
    assertIntentScope(intent, scope);
    const target = new URL(scope.entry === 'quick' ? '/quick-task/' : '/', scope.targetOrigin);
    target.hash = `projed-origin-switch=${id}`;
    open(target.href);
  };
  return { openDestination, inspectDestination: async () => (await read())?.destination ?? null,
    requestInstall: async (): Promise<'unavailable'> => { await openDestination(); return 'unavailable'; } };
}

/** The target uses its own bound Session and exact configured route. The locator
 * grants nothing and source draft inventory is deliberately never consulted. */
export async function confirmOriginSwitchDestination(id: string, config: OriginSwitchConfig, guideEntry: GuideEntry,
  client: HttpApiClient, currentOrigin: string, storage?: GuideStorage): Promise<DestinationInspection> {
  const candidates = config.routes.filter(route => route.targetOrigin === currentOrigin && route.entry === guideEntry);
  if (!candidates.length || new Set(candidates.map(route => route.targetSessionEntry)).size !== 1) throw invalid();
  const adapter = createHttpOriginSwitchAdapter(client);
  const attemptKey = `projed.origin-switch.confirm.v1:${JSON.stringify([id, adapter.actor.accountId, adapter.actor.contextId])}`;
  await createHttpSessionAdapter(client).verifyBoundActor(adapter.actor.accountId, candidates[0].targetSessionEntry);
  let confirmed: OriginSwitchReceipt | null;
  try {
    if (storage?.getItem(attemptKey) === 'attempted') confirmed = await adapter.read(id);
    else {
      storage?.setItem(attemptKey, 'attempted');
      confirmed = await adapter.confirm(id);
    }
  }
  catch (error) {
    // A target cannot read an unconfirmed source intent. Only an already
    // committed confirmation makes this same-id readback available.
    confirmed = await adapter.read(id);
    if (!confirmed) throw error;
  }
  if (!confirmed) throw invalid();
  const route = candidates.find(route => route.sourceOrigin === confirmed.sourceOrigin && route.targetOrigin === confirmed.targetOrigin);
  if (!route) throw invalid();
  assertIntentScope(confirmed, { ...route, campaign: config.campaign, accountId: adapter.actor.accountId });
  if (!confirmed.destination?.workspaceMatched || !confirmed.destination.permissionsMatched) throw invalid();
  return confirmed.destination;
}
