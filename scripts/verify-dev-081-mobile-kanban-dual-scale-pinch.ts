import { readFileSync } from 'node:fs';
import {
  KANBAN_LARGE_SCALE,
  KANBAN_PINCH_IN_RATIO,
  KANBAN_PINCH_MIN_DISTANCE_DELTA_PX,
  KANBAN_PINCH_OUT_RATIO,
  normalizeKanbanViewSize,
  resolveKanbanPinchTarget,
} from '../src/features/kanbanViewSize/kanbanViewSize';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const decisions = [
  ['compact to large', resolveKanbanPinchTarget({ viewSize: 'compact', initialDistance: 100, currentDistance: 140, touchCount: 2, alreadyCommitted: false }), 'large'],
  ['large to compact', resolveKanbanPinchTarget({ viewSize: 'large', initialDistance: 200, currentDistance: 150, touchCount: 2, alreadyCommitted: false }), 'compact'],
  ['ratio alone is insufficient', resolveKanbanPinchTarget({ viewSize: 'compact', initialDistance: 100, currentDistance: 114, touchCount: 2, alreadyCommitted: false }), null],
  ['delta alone is insufficient', resolveKanbanPinchTarget({ viewSize: 'compact', initialDistance: 500, currentDistance: 525, touchCount: 2, alreadyCommitted: false }), null],
  ['single touch cannot switch', resolveKanbanPinchTarget({ viewSize: 'compact', initialDistance: 100, currentDistance: 150, touchCount: 1, alreadyCommitted: false }), null],
  ['one gesture commits once', resolveKanbanPinchTarget({ viewSize: 'compact', initialDistance: 100, currentDistance: 160, touchCount: 2, alreadyCommitted: true }), null],
];

for (const [name, actual, expected] of decisions) assert(actual === expected, `${name}: expected ${expected}, got ${actual}`);
assert(normalizeKanbanViewSize('large') === 'large', 'large preference should normalize');
assert(normalizeKanbanViewSize('invalid') === 'compact', 'invalid preference should fail closed to compact');
assert(KANBAN_LARGE_SCALE >= 2 && KANBAN_LARGE_SCALE <= 3, 'large scale must remain within the 2–3x contract');
assert(KANBAN_PINCH_OUT_RATIO > 1 && KANBAN_PINCH_IN_RATIO < 1, 'pinch ratios must straddle 1');
assert(KANBAN_PINCH_MIN_DISTANCE_DELTA_PX > 0, 'pinch delta guard must be positive');

const sourceContracts: Array<[string, string[]]> = [
  ['src/hooks/useMobilePanBroker.ts', ['touchstart', 'touchmove', 'data-kanban-pinch-active', 'cancelActiveTaskDrag', 'wait-all-release']],
  ['src/features/kanbanViewSize/KanbanViewSizeProvider.tsx', ['readKanbanViewSize', 'writeKanbanViewSize', 'requestViewSize', 'requestAnimationFrame']],
  ['src/features/kanbanViewSize/kanbanViewSizeAnchor.ts', ['scrollLeft', 'scrollTop', 'scopeKey', 'driftPx']],
  ['src/components/Wbs/KanbanChecklist.tsx', ['--kanban-checklist-depth']],
  ['src/index.css', ['data-kanban-view-size="large"', '--kanban-column-width: 630px', '--kanban-l1-l2-title-size: 35px', '--kanban-l3-title-size: 30px', 'var(--task-hierarchy-indent, 6px)', 'var(--kanban-checklist-base, 4px)']],
];
for (const [file, needles] of sourceContracts) {
  const source = readFileSync(file, 'utf8');
  for (const needle of needles) assert(source.includes(needle), `${file} missing contract: ${needle}`);
}

const indexCss = readFileSync('src/index.css', 'utf8');
const mobileMediaStart = indexCss.indexOf('@media (max-width: 640px)');
const sharedDesktopCss = indexCss.slice(0, mobileMediaStart);
assert(mobileMediaStart > 0, 'mobile media boundary should exist');
assert(
  sharedDesktopCss.includes('.kanban-checklist-item')
    && sharedDesktopCss.includes('var(--kanban-checklist-depth, 0)')
    && sharedDesktopCss.includes('var(--task-hierarchy-indent, 6px)')
    && sharedDesktopCss.includes('var(--kanban-checklist-base, 4px)'),
  'checklist hierarchy indentation must be consumed by the shared desktop/mobile rule',
);

console.log(JSON.stringify({
  verifier: 'DEV-081 mobile kanban dual scale pinch',
  result: 'PASS',
  checks: decisions.length + sourceContracts.reduce((count, [, needles]) => count + needles.length, 0) + 6,
  thresholds: { outRatio: KANBAN_PINCH_OUT_RATIO, inRatio: KANBAN_PINCH_IN_RATIO, minDeltaPx: KANBAN_PINCH_MIN_DISTANCE_DELTA_PX, largeScale: KANBAN_LARGE_SCALE },
  note: 'pure state/contract verification only; browser UI evidence is separate',
}, null, 2));
