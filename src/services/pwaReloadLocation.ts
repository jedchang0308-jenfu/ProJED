import type { ViewMode } from '../types';

type ReloadLocation = {
  view: ViewMode;
  workspaceId: string | null;
  boardId: string | null;
};

const KEY = 'projed:pwa:reload-location:v1';
let readCurrentLocation: (() => ReloadLocation) | undefined;

export const registerPwaReloadLocation = (read: () => ReloadLocation) => {
  readCurrentLocation = read;
};

export const getPwaReloadLocationView = () => readCurrentLocation?.().view;

export const capturePwaReloadLocation = (targetVersion: string): boolean => {
  if (!readCurrentLocation) return true;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ targetVersion, location: readCurrentLocation() }));
    return true;
  } catch {
    return false;
  }
};

export const readPwaReloadLocation = (): ReloadLocation | null => {
  if (typeof window === 'undefined') return null;
  try {
    const requestedVersion = new URL(window.location.href).searchParams.get('projed_update_latest');
    const currentVersion = document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content');
    if (!requestedVersion || requestedVersion !== currentVersion) return null;
    const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (raw?.targetVersion !== currentVersion) return null;
    const value = raw.location;
    if (typeof value?.view !== 'string'
      || (value.workspaceId !== null && typeof value.workspaceId !== 'string')
      || (value.boardId !== null && typeof value.boardId !== 'string')) return null;
    return value;
  } catch {
    return null;
  }
};

export const clearPwaReloadLocation = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
};
