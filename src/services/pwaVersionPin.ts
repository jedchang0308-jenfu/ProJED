// Keep these keys aligned with scripts/pwa-version-entry.mjs (the dependency-free entry).
export const APP_VERSION_TAB_KEY = 'projed:pwa:tab-version:v1';
export const APP_VERSION_ADOPTED_KEY = 'projed:pwa:adopted-version:v1';
export const APP_VERSION_NAVIGATION_KEY = 'projed:pwa:version-navigation:v1';

type VersionBoot = { version: string; mayAdopt: boolean; confirmed?: boolean; timer?: number };
type VersionWindow = Window & { __PROJED_VERSION_BOOT__?: VersionBoot };

export const isPinnedAppVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^(release|build):[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);

export function reserveAppVersionNavigation(version: string): boolean {
  if (!isPinnedAppVersion(version)) return false;
  try {
    sessionStorage.setItem(APP_VERSION_NAVIGATION_KEY, JSON.stringify({ version, createdAt: Date.now() }));
    return true;
  } catch { return false; }
}

// Called only after the actual running JS and embedded HTML identities agree.
export function confirmLoadedAppVersion(version: string): boolean {
  if (!isPinnedAppVersion(version)) return false;
  const embedded = document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content');
  if (embedded !== version) return false;
  const boot = (window as VersionWindow).__PROJED_VERSION_BOOT__;
  if (boot && boot.version !== version) return false;
  try {
    sessionStorage.setItem(APP_VERSION_TAB_KEY, version);
    if (!boot?.confirmed && (boot?.mayAdopt || !localStorage.getItem(APP_VERSION_ADOPTED_KEY))) {
      localStorage.setItem(APP_VERSION_ADOPTED_KEY, version);
    }
    if (boot) {
      boot.confirmed = true;
      window.clearTimeout(boot.timer);
    }
    return true;
  } catch { return false; }
}
