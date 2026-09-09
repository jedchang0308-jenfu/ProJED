import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const hoverCard = readFileSync('src/components/TaskDescriptionHoverCard.tsx', 'utf8');
const indicator = readFileSync('src/components/TaskDescriptionIndicator.tsx', 'utf8');
const mainLayout = readFileSync('src/components/MainLayout.tsx', 'utf8');
const sourceBySurface = {
  boardColumn: readFileSync('src/components/Wbs/KanbanColumn.tsx', 'utf8'),
  boardCard: readFileSync('src/components/Wbs/KanbanCard.tsx', 'utf8'),
  boardChecklist: readFileSync('src/components/Wbs/TaskChecklistTree.tsx', 'utf8'),
  list: readFileSync('src/components/Wbs/WbsNodeItem.tsx', 'utf8'),
  mindmap: readFileSync('src/components/MindMap/MindMapNode.tsx', 'utf8'),
  gantt: readFileSync('src/components/Gantt/GanttTaskBar.tsx', 'utf8'),
  calendar: readFileSync('src/components/CalendarView.tsx', 'utf8'),
  sharedSidebar: readFileSync('src/components/SharedTaskSidebar.tsx', 'utf8'),
};

assert('hover card is mounted once from MainLayout', mainLayout.includes('<TaskDescriptionHoverCard />'));
assert('hover delay is exactly one second', hoverCard.includes('TASK_DESCRIPTION_HOVER_DELAY_MS = 1000'));
assert('description reads the existing TaskNode projection', hoverCard.includes('.nodes[taskId]?.description?.trim()'));
assert('empty descriptions do not open a card', hoverCard.includes('if (!taskId || !description)'));
assert('fine-pointer media gate protects touch surfaces', hoverCard.includes("matchMedia('(hover: hover) and (pointer: fine)')"));
assert('portal avoids clipping by reading-mode containers', hoverCard.includes('createPortal(') && hoverCard.includes('document.body'));
assert('card is a semantic tooltip with stable DOM evidence', hoverCard.includes('role="tooltip"') && hoverCard.includes('data-task-description-hover-card="true"'));
assert('description is rendered as React text, not HTML', !hoverCard.includes('dangerouslySetInnerHTML'));
assert('long descriptions are viewport bounded', hoverCard.includes("maxWidth: 'min(380px, calc(100vw - 24px))'") && hoverCard.includes("maxHeight: 'min(320px, calc(100vh - 24px))'"));
assert('dismissal covers Escape, scroll, resize, blur and drag',
  ['keydown', 'scroll', 'resize', 'blur', 'dragstart'].every(eventName => hoverCard.includes(`'${eventName}'`)));
assert('mindmap inline editing suppresses hover description', hoverCard.includes('[data-mindmap-inline-title-editing="true"]'));

assert('indicator centralizes the non-empty description rule', indicator.includes('description?.trim()'));
assert('indicator uses the selected 9px AlignLeft glyph', indicator.includes('<AlignLeft size={9}'));
assert('indicator reserves exactly an 11px square', indicator.includes('h-[11px] w-[11px]'));
assert('indicator is non-interactive and hidden from accessibility APIs',
  indicator.includes('pointer-events-none') && indicator.includes('aria-hidden="true"'));
assert('indicator has stable rendered evidence without native tooltip text',
  indicator.includes('data-task-description-indicator="true"') && !indicator.includes('title='));

assert('description hover directly reuses the selected-preview task surface',
  hoverCard.includes('[data-task-surface-source="true"][data-task-id]'));

Object.entries(sourceBySurface).forEach(([surface, source]) => {
  const reusesSelectedPreviewSurface = ['boardColumn', 'boardCard', 'boardChecklist', 'list'].includes(surface);
  assert(`${surface} exposes its canonical hover surface`, reusesSelectedPreviewSurface
    ? source.includes('data-task-surface-source')
    : source.includes('data-task-description-hover-trigger'));
});

Object.entries(sourceBySurface).forEach(([surface, source]) => {
  assert(`${surface} renders the shared description indicator`, source.includes('<TaskDescriptionIndicator'));
});

['boardColumn', 'boardCard', 'boardChecklist', 'list'].forEach((surface) => {
  assert(`${surface} does not duplicate a title-only description trigger`,
    !sourceBySurface[surface as keyof typeof sourceBySurface].includes('data-task-description-hover-trigger'));
});

assert('calendar task segment no longer competes with a native title tooltip',
  !sourceBySurface.calendar.includes('title={`${seg.item.title}${seg.item.startDate'));

const artifact = {
  devId: 'DEV-111',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  surfaces: Object.keys(sourceBySurface),
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-111-task-description-hover-card',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactDirectory = resolve('output/playwright/dev-111-task-description-hover-card');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-111 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-111 static verification passed: ${checks.length} assertions.`);
