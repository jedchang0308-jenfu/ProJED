import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const goal = read('src/components/GoalView.tsx');
const picker = read('src/components/TaskAssignmentPicker.tsx');
const statusStyles = read('src/components/ui/taskStatusStyles.ts');
const spec = read('ai-doc/specs/SPEC-120-goal-planning-minimal-density.md');
const qa = read('ai-doc/qa/QA-DEV-120-goal-planning-minimal-density.md');

const checks: Array<{ id: string; label: string; status: 'PASS' | 'FAIL'; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, label: string, condition: boolean, details?: unknown) => {
  checks.push({ id, label, status: condition ? 'PASS' : 'FAIL', details });
  if (!condition) failures.push(`${id} ${label}`);
};

const tableMarkup = goal.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
const headerMarkup = goal.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? '';
const planningMarkup = goal.slice(goal.indexOf('data-goal-column="owner"'), goal.indexOf('</tr>', goal.indexOf('data-goal-column="owner"')) + 5);

check('S01', 'Goal uses one native table and one scroll owner', (goal.match(/<table\b/g) ?? []).length === 1 && goal.includes('overflow-auto') && !goal.includes('scrollLeft') && !goal.includes('ResizeObserver'));
check('S02', 'Task name is table frozen first column', tableMarkup.includes('sticky left-0') && headerMarkup.includes('sticky left-0 top-0') && goal.includes('min-w-[252px]'));
check('S03', 'Fixed planning tracks and elastic content allocation are explicit', goal.includes('GOAL_PLANNING_WIDTHS') && goal.includes('owner: 112') && goal.includes('status: 64') && goal.includes('start: 96') && goal.includes('end: 96') && goal.includes('duration: 60') && goal.includes('hasElasticContentColumn') && goal.includes('<col />'));
check('S04', 'Table minimum width follows visible columns', goal.includes('GOAL_CONTENT_COLUMN_MIN_WIDTH_PX = 220') && goal.includes('visiblePlanningWidth') && goal.includes('goalTableMinWidth'));
check('S05', 'Planning controls stay mounted and use existing handlers', planningMarkup.includes('<TaskAssignmentPicker') && planningMarkup.includes('triggerVariant="quiet"') && planningMarkup.includes('<select') && planningMarkup.includes('type="date"') && planningMarkup.includes('type="number"') && goal.includes('updateNode(node.id'));
check('S06', 'Quiet owner variant preserves default consumer', picker.includes("triggerVariant?: 'default' | 'quiet'") && picker.includes("triggerVariant = 'default'") && picker.includes('triggerVariant === \'quiet\'') && !statusStyles.includes('quiet'));
check('S07', 'No Goal planning editor or date formatter state was added', !goal.includes('activePlanning') && !goal.includes('planningDraft') && !goal.includes('formatGoalDate') && !goal.includes('showPicker'));
check('S08', 'Normal controls remove boxed chrome while focus remains visible', goal.includes('GOAL_STATUS_SELECT_CLASS') && goal.includes('border border-transparent') && goal.includes('focus-visible:outline') && goal.includes('calendar-picker-indicator'));
check('S09', 'Empty values retain a visible minimal placeholder', goal.includes('peer-focus:hidden') && goal.includes('>—</span>'));
check('S10', 'Lock and due-today signals remain minimal and accessible', goal.includes('isDurationLocked') && goal.includes('aria-label') && !goal.includes('bg-orange-50/80'));
check('S11', 'Planning targets stay isolated from row action and drag', goal.includes('isTaskPrimaryActionTarget(event.target)') && goal.includes('data-goal-planning-control'));
check('S12', 'SPEC and QA agree on the frozen/width contract', spec.includes('112／64／96／96／60px') && qa.includes('112／64／96／96／60px') && spec.includes('native table') && qa.includes('native table'));
check('S13', 'Forbidden data and session boundaries remain absent', !goal.includes('GoalPlanningContext') && !goal.includes('useGoalPlanningStore') && !goal.includes('localStorage') && !goal.includes('schema') && !goal.includes('migration'));

const artifact = {
  devId: 'DEV-120',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-120-goal-planning-minimal-density',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};

const artifactDir = resolve('output/playwright/dev-120-goal-planning-minimal-density');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length) {
  console.error('DEV-120 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-120 static verification passed: ${checks.length} assertions.`);
