import assert from 'node:assert/strict';
import { getPwaInstallContext } from '../src/services/pwaInstallService';

const stored = new Map<string, string>([
  ['projed.pwaInstall.status', JSON.stringify({ installed: true, dismissed: false })],
]);

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => stored.get(key) ?? null },
});

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    standalone: false,
  },
});

let appDisplayMode = false;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { matchMedia: (query: string) => ({ matches: query === '(display-mode: minimal-ui)' && appDisplayMode }) },
});

const afterRemoval = getPwaInstallContext();
assert.equal(afterRemoval.status.installed, false, 'historical installed flag must not mask removal');
assert.equal(afterRemoval.platform, 'android-browser', 'Chrome must show an install path after removal');

appDisplayMode = true;
const installed = getPwaInstallContext();
assert.equal(installed.status.installed, true);
assert.equal(installed.platform, 'standalone');

console.log('DEV-130 optional reinstall install-state regression: PASS');
