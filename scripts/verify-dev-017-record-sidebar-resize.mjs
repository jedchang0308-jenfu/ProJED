import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8');

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};

assert('record sidebar defines persistent width key', source.includes('projed-record-sidebar-width'));
assert('record sidebar clamps minimum width', source.includes('MIN_RECORD_SIDEBAR_WIDTH = 320'));
assert('record sidebar clamps maximum width', source.includes('MAX_RECORD_SIDEBAR_WIDTH = 760'));
assert('record sidebar reserves main view width', source.includes('RECORD_SIDEBAR_MAIN_VIEW_MIN_WIDTH = 560'));
assert('record sidebar reads localStorage width', source.includes('readRecordSidebarWidth'));
assert('record sidebar persists localStorage width', source.includes('persistRecordSidebarWidth'));
assert('record sidebar uses css variable width on desktop', source.includes('sm:w-[var(--record-sidebar-width)]'));
assert('record sidebar no longer hard-codes desktop width', !source.includes('sm:w-[390px]'));
assert('record sidebar exposes resize handle', source.includes('record-sidebar-resize-handle'));
assert('record sidebar listens for pointer movement', source.includes("window.addEventListener('pointermove'"));
assert('record sidebar listens for pointer end', source.includes("window.addEventListener('pointerup'"));
assert('record sidebar supports keyboard resize', source.includes('handleResizeKeyDown'));
assert('record sidebar marks resize handle as separator', source.includes('role="separator"'));

if (failures.length > 0) {
  console.error('DEV-017 record sidebar resize verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-017 record sidebar resize verification passed: sidebar width is resizable and persisted.');
