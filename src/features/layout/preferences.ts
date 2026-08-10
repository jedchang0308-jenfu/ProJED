import {
  getAccountScopedStorageKey,
  readStorageJson,
  writeStorageJson,
} from '../../utils/accountScopedStorage';

export const WORKSPACE_SIDEBAR_WIDTH_PREFS_KEY = 'projed-workspace-sidebar-width:v1';
export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 288;
export const MIN_WORKSPACE_SIDEBAR_WIDTH = 154;
export const MAX_WORKSPACE_SIDEBAR_WIDTH = 520;

const MOBILE_PANEL_GUTTER = 48;

const getViewportWidth = () => (typeof window === 'undefined' ? 1365 : window.innerWidth);

export const clampWorkspaceSidebarWidth = (
  value: number,
  viewportWidth = getViewportWidth(),
) => {
  const viewportMaxWidth = Math.max(
    MIN_WORKSPACE_SIDEBAR_WIDTH,
    Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, viewportWidth - MOBILE_PANEL_GUTTER),
  );
  return Math.round(Math.min(Math.max(value, MIN_WORKSPACE_SIDEBAR_WIDTH), viewportMaxWidth));
};

export const readWorkspaceSidebarWidth = (accountId: string | null | undefined) => {
  const stored = readStorageJson<number>(getAccountScopedStorageKey(WORKSPACE_SIDEBAR_WIDTH_PREFS_KEY, accountId));
  return typeof stored === 'number' && Number.isFinite(stored)
    ? clampWorkspaceSidebarWidth(stored)
    : DEFAULT_WORKSPACE_SIDEBAR_WIDTH;
};

export const writeWorkspaceSidebarWidth = (
  width: number,
  accountId: string | null | undefined,
) => {
  writeStorageJson(
    getAccountScopedStorageKey(WORKSPACE_SIDEBAR_WIDTH_PREFS_KEY, accountId),
    clampWorkspaceSidebarWidth(width),
  );
};
