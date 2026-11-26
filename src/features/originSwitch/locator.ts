import type { GuideEntry, GuideStorage } from './guide';

export const ORIGIN_SWITCH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const locatorStorageKey = (entry: GuideEntry) => `projed.origin-switch.locator.v1:${entry}`;

/** Locator only. Capture before normal login removes the fragment; no identity
 * or completion is inferred from either this value or browser storage. */
export function captureOriginSwitchLocator(entry: GuideEntry, location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>, storage: GuideStorage): void {
  if (!location.hash.startsWith('#projed-origin-switch=')) return;
  const id = location.hash.slice('#projed-origin-switch='.length);
  try {
    storage.setItem(locatorStorageKey(entry), ORIGIN_SWITCH_UUID.test(id) ? id : '');
  } finally { history.replaceState(null, '', `${location.pathname}${location.search}`); }
}

export function readOriginSwitchLocator(entry: GuideEntry, storage: GuideStorage): string | null {
  const id = storage.getItem(locatorStorageKey(entry));
  return id !== null && ORIGIN_SWITCH_UUID.test(id) ? id : null;
}
