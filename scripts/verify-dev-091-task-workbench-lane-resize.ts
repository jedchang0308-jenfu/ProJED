import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const browserStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { innerWidth: 1440, localStorage: browserStorage },
});

const preferences = await import('../src/features/taskWorkbench/preferences');
const accountStorage = await import('../src/utils/accountScopedStorage');

assert.equal(preferences.clampTaskWorkbenchUnplacedRatio(-1), 0.18);
assert.equal(preferences.clampTaskWorkbenchUnplacedRatio(2), 0.82);
assert.equal(preferences.clampTaskWorkbenchUnplacedRatio(Number.NaN), 0.5);
assert.equal(preferences.clampTaskWorkbenchUnplacedRatio(0.6274), 0.627);

const accountA = 'account-a';
const accountB = 'account-b';
const prefsA = preferences.createDefaultTaskWorkbenchPanelPrefs();
const prefsB = preferences.createDefaultTaskWorkbenchPanelPrefs();
preferences.writeTaskWorkbenchPanelPrefs({ ...prefsA, unplacedRatio: 0.63 }, accountA);
preferences.writeTaskWorkbenchPanelPrefs({ ...prefsB, unplacedRatio: 0.34 }, accountB);
assert.equal(preferences.readTaskWorkbenchPanelPrefs(accountA).unplacedRatio, 0.63);
assert.equal(preferences.readTaskWorkbenchPanelPrefs(accountB).unplacedRatio, 0.34);

const outOfRangeKey = accountStorage.getAccountScopedStorageKey(
  preferences.TASK_WORKBENCH_PANEL_PREFS_KEY,
  'account-out-of-range',
);
assert.ok(outOfRangeKey);
browserStorage.setItem(outOfRangeKey, JSON.stringify({ ...prefsA, unplacedRatio: 9 }));
assert.equal(preferences.readTaskWorkbenchPanelPrefs('account-out-of-range').unplacedRatio, 0.82);

const panelSource = readFileSync('src/components/TaskWorkbenchPanel.tsx', 'utf8');
const accountPreferenceSource = readFileSync('src/services/accountPreferencesService.ts', 'utf8');
const checks: Array<[string, boolean]> = [
  ['single horizontal separator exists', panelSource.includes('data-task-workbench-lane-resize-handle="true"') && panelSource.includes('aria-orientation="horizontal"')],
  ['splitter exposes percentage accessibility state', panelSource.includes('aria-valuenow={Math.round(unplacedRatio * 100)}') && panelSource.includes('aria-valuetext={`未歸位')],
  ['pointer activation is primary-only', panelSource.includes('const handleLaneResizeStart') && panelSource.includes('if (!isPrimaryPointerActivation(event)) return;')],
  ['keyboard resizing supports vertical arrows and boundaries', panelSource.includes("event.key === 'ArrowUp'") && panelSource.includes("event.key === 'ArrowDown'") && panelSource.includes("event.key === 'Home'") && panelSource.includes("event.key === 'End'")],
  ['pointer resize persists only after completion', panelSource.includes('persistTaskWorkbenchUnplacedRatio(unplacedRatioRef.current, accountId)') && panelSource.includes("window.addEventListener('pointerup', cleanup)")],
  ['account layout namespace owns the remote preference', accountPreferenceSource.includes('taskWorkbenchUnplacedRatio?: number') && accountPreferenceSource.includes('layout.taskWorkbenchUnplacedRatio = clampTaskWorkbenchUnplacedRatio')],
  ['remote hydration restores the split', panelSource.includes('preferences.taskWorkbenchUnplacedRatio') && panelSource.includes('setUnplacedRatio(hydratedRatio)')],
  ['splitter is one minimal line without visible helper copy', panelSource.includes('data-task-workbench-lane-divider-line="true"') && !panelSource.includes('data-task-workbench-lane-resize-help')],
];

for (const [name, passed] of checks) assert.equal(passed, true, name);

console.log(JSON.stringify({
  verifier: 'DEV-091 task workbench lane resize',
  result: 'PASS',
  checks: checks.length + 8,
  ratios: { default: 0.5, minimum: 0.18, maximum: 0.82, accountA: 0.63, accountB: 0.34 },
}, null, 2));
