import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const detailsModal = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');
const dev028Browser = readFileSync('scripts/verify-dev-028-cross-mode-task-interactions-browser.pw.js', 'utf8');

const desktopGridContract = 'lg:grid-cols-[5.5rem_24rem_minmax(0,1fr)] lg:items-end lg:gap-x-3 lg:gap-y-2';
const scheduleContract = 'lg:grid-cols-[8rem_2rem_8rem_auto] lg:gap-x-0 lg:gap-y-1';

assert(
  'desktop metadata outer and shared control grids use the same three-column contract',
  detailsModal.split(desktopGridContract).length - 1 === 2,
);
assert(
  'desktop columns keep status compact, dates exact and assignment flexible',
  detailsModal.includes('lg:grid-cols-[5.5rem_24rem_minmax(0,1fr)]'),
);
assert(
  'desktop metadata uses a consistent twelve-pixel column gutter',
  detailsModal.split('lg:gap-x-3').length - 1 >= 2,
);
assert(
  'date controls use explicit non-overlapping desktop tracks',
  detailsModal.includes(scheduleContract),
);
assert(
  'date labels and first-row labels share the same four-pixel vertical rhythm',
  detailsModal.includes('lg:gap-y-1')
    && detailsModal.includes('className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true"'),
);
assert(
  'date arrow fills its complete center track for symmetric spacing',
  detailsModal.includes('data-task-details-date-range-arrow="true"')
    && detailsModal.includes('className="col-start-2 flex h-8 w-full shrink-0 items-center justify-center'),
);
assert(
  'end date and duration retain the joined-control contract',
  detailsModal.includes('rounded-md rounded-r-none border-r-0')
    && detailsModal.includes('data-task-details-duration-inline="true"'),
);
assert(
  'status, schedule, assignment and tags keep stable metadata selectors',
  ['status', 'assignment', 'tags'].every((field) => detailsModal.includes(`data-task-details-meta-field="${field}"`))
    && detailsModal.includes('data-task-details-schedule-controls="true"'),
);
assert(
  'DEV-028 rendered regression checks label baseline alignment',
  dev028Browser.includes('desktop task metadata labels should share one visual baseline'),
);
assert(
  'DEV-028 rendered regression checks precise date control spacing',
  dev028Browser.includes('dateControlsPreciselySpaced')
    && dev028Browser.includes('arrowRect.width >= 24'),
);

const artifact = {
  devId: 'DEV-112',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-112-task-details-metadata-alignment',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};

const artifactDirectory = resolve('output/playwright/dev-112-task-details-metadata-alignment');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-112 static verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-112 static verification passed: ${checks.length} assertions.`);
