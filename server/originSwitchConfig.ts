import { KernelError } from './errors.js';

export type OriginSwitchEntry = 'main' | 'quick';
export interface OriginSwitchRoute {
  readonly entry: OriginSwitchEntry;
  readonly sourceOrigin: string;
  readonly targetOrigin: string;
  readonly sourceSessionEntry: OriginSwitchEntry;
  readonly targetSessionEntry: OriginSwitchEntry;
}
export interface OriginSwitchConfig {
  readonly campaign: string;
  readonly routes: readonly OriginSwitchRoute[];
}
const entry = (value: unknown): value is OriginSwitchEntry => value === 'main' || value === 'quick';
function invalid(): never { throw new KernelError('CONFIG_INVALID', 'Origin guide configuration is invalid', 503); }
export function isPublicOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}

/** Unset means disabled. This is an explicit campaign, never a browser redirect. */
export function parseOriginSwitchConfig(raw: string | undefined,
  origins: Readonly<Record<OriginSwitchEntry, readonly string[]>>): OriginSwitchConfig | null {
  if (raw === undefined) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join('|') !== 'campaign|routes' || typeof data.campaign !== 'string'
    || !/^[a-zA-Z0-9._-]{1,80}$/u.test(data.campaign) || !Array.isArray(data.routes)
    || data.routes.length < 1 || data.routes.length > 8) invalid();
  const keys = new Set<string>();
  const routes = data.routes.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid();
    const route = item as Record<string, unknown>;
    if (Object.keys(route).sort().join('|') !== 'entry|sourceOrigin|sourceSessionEntry|targetOrigin|targetSessionEntry'
      || !entry(route.entry) || !entry(route.sourceSessionEntry) || !entry(route.targetSessionEntry)
      || !isPublicOrigin(route.sourceOrigin) || !isPublicOrigin(route.targetOrigin)
      || route.sourceOrigin === route.targetOrigin
      || !origins[route.sourceSessionEntry].includes(route.sourceOrigin)
      || !origins[route.targetSessionEntry].includes(route.targetOrigin)
      || (route.entry === 'main' && (route.sourceSessionEntry !== 'main' || route.targetSessionEntry !== 'main'))) invalid();
    const key = `${route.entry}/${route.sourceOrigin}`;
    if (keys.has(key)) invalid();
    keys.add(key);
    return Object.freeze({ ...route }) as unknown as OriginSwitchRoute;
  });
  return Object.freeze({ campaign: data.campaign, routes: Object.freeze(routes) });
}
