import { readFileSync } from 'node:fs';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const css = readFileSync('src/index.css', 'utf8');
const checklist = readFileSync('src/components/Wbs/KanbanChecklist.tsx', 'utf8');
const listRow = readFileSync('src/components/Wbs/WbsNodeItem.tsx', 'utf8');
const sharedSidebar = readFileSync('src/components/SharedTaskSidebar.tsx', 'utf8');
const gantt = readFileSync('src/components/GanttView.tsx', 'utf8');
const calendar = readFileSync('src/components/CalendarView.tsx', 'utf8');

const checks: Array<[string, boolean]> = [
  ['desktop shared token is 6px', css.includes('--task-hierarchy-indent: 6px;')],
  ['narrow shared token is 5px', /@media \(max-width: 767px\)[\s\S]*?:root\s*\{[\s\S]*?--task-hierarchy-indent: 5px;/.test(css)],
  ['generic hierarchy row consumes the shared token', css.includes('.task-hierarchy-indented-row') && css.includes('var(--task-hierarchy-depth, 0) * var(--task-hierarchy-indent, 6px)')],
  ['kanban checklist consumes the shared token', checklist.includes('var(--task-hierarchy-indent, 6px)') && checklist.includes('data-task-hierarchy-depth={depth}')],
  ['list rows consume shared depth without rem multiplication', listRow.includes('task-hierarchy-indented-row') && listRow.includes('data-task-hierarchy-surface="list"') && !listRow.includes('level * 1.25')],
  ['shared sidebar owns gantt/calendar surface identity', sharedSidebar.includes("type SharedTaskSidebarSurface = 'gantt' | 'calendar'") && sharedSidebar.includes('data-task-hierarchy-surface={surface}')],
  ['gantt passes its surface identity', gantt.includes('surface="gantt"')],
  ['calendar passes its surface identity', calendar.includes('surface="calendar"')],
  ['legacy per-view checklist indent declarations are removed', !css.includes('--kanban-checklist-indent:')],
];

for (const [name, passed] of checks) assert(passed, name);

console.log(JSON.stringify({
  verifier: 'DEV-087 cross-view hierarchy indent',
  result: 'PASS',
  checks: checks.length,
  surfaces: ['board L3+', 'list', 'gantt sidebar', 'calendar sidebar'],
  tokens: { desktop: '6px', narrow: '5px', breakpoint: '767px' },
}, null, 2));
