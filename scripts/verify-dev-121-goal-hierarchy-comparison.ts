import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGoalHierarchyDecorations,
  type GoalHierarchyDecoration,
} from '../src/features/goalMode/hierarchyPresentation';
import type { HierarchicalTaskViewItem } from '../src/utils/taskHierarchy';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const goal = read('src/components/GoalView.tsx');
const hierarchyPresentation = read('src/features/goalMode/hierarchyPresentation.ts');
const taskHierarchy = read('src/utils/taskHierarchy.ts');
const projection = read('src/features/goalMode/projection.ts');
const sharedRow = read('src/components/Wbs/TaskHierarchyIndentedRow.tsx');
const css = read('src/index.css');
const spec = read('ai-doc/specs/SPEC-121-goal-hierarchy-comparison-grid.md');
const qa = read('ai-doc/qa/QA-DEV-121-goal-hierarchy-comparison-grid.md');
const devTask = read('ai-doc/dev_task.md');
const map = read('ai-doc/documentation_map.md');

const checks: Array<{ id: string; label: string; status: 'PASS' | 'FAIL'; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, label: string, condition: boolean, details?: unknown) => {
  checks.push({ id, label, status: condition ? 'PASS' : 'FAIL', details });
  if (!condition) failures.push(`${id} ${label}`);
};

const item = (id: string, level: number, parentId: string | null = null): HierarchicalTaskViewItem => ({
  id,
  parentId,
  level,
  row: 0,
  type: level === 0 ? 'list' : level === 1 ? 'card' : 'checklist',
} as HierarchicalTaskViewItem);

const fullyExpanded = [
  item('root-a', 0),
  item('a-1', 1, 'root-a'),
  item('a-1-a', 2, 'a-1'),
  item('a-1-a-1', 3, 'a-1-a'),
  item('a-1-b', 2, 'a-1'),
  item('a-2', 1, 'root-a'),
  item('root-b', 0),
  item('b-1', 1, 'root-b'),
];
const rendered = fullyExpanded;
const collapsedRoot = fullyExpanded.filter(entry => !['a-1', 'a-1-a', 'a-1-a-1', 'a-1-b', 'a-2'].includes(entry.id));
const decorations = buildGoalHierarchyDecorations({ renderedItems: rendered, fullyExpandedItems: fullyExpanded });
const collapsedDecorations = buildGoalHierarchyDecorations({ renderedItems: collapsedRoot, fullyExpandedItems: fullyExpanded });

const decoration = (mapValue: ReadonlyMap<string, GoalHierarchyDecoration>, id: string) => mapValue.get(id);

check('S01', 'projector is pure and has no runtime/UI imports', !hierarchyPresentation.includes('React') && !hierarchyPresentation.includes('document') && !hierarchyPresentation.includes('window') && !hierarchyPresentation.includes('useWbsStore') && hierarchyPresentation.includes('ReadonlyMap'));
check('S02', 'projector exposes owned relation facts without root boundary duplication', hierarchyPresentation.includes('parentId') && hierarchyPresentation.includes('isLastVisibleSibling') && hierarchyPresentation.includes('hasVisibleChildren') && hierarchyPresentation.includes('ancestorTaskIds') && hierarchyPresentation.includes('ancestorContinuations') && hierarchyPresentation.includes('ownerTaskId') && hierarchyPresentation.includes('eligibleDescendantCount') && !hierarchyPresentation.includes('startsRootGroup') && !hierarchyPresentation.includes('endsRootGroup'));
check('S03', 'last sibling and owned ancestor continuations are correct', decoration(decorations, 'a-1')?.isLastVisibleSibling === false && decoration(decorations, 'a-2')?.isLastVisibleSibling === true && JSON.stringify(decoration(decorations, 'a-1-a-1')?.ancestorContinuations) === JSON.stringify([{ guideLevel: 0, ownerTaskId: 'root-a' }, { guideLevel: 1, ownerTaskId: 'a-1' }]) && JSON.stringify(decoration(decorations, 'a-1-a-1')?.ancestorTaskIds) === JSON.stringify(['root-a', 'a-1', 'a-1-a']), { a1: decoration(decorations, 'a-1'), leaf: decoration(decorations, 'a-1-a-1') });
check('S04', 'fully-expanded descendant counts include every filtered eligible descendant', decoration(decorations, 'root-a')?.eligibleDescendantCount === 5 && decoration(decorations, 'a-1')?.eligibleDescendantCount === 3 && decoration(decorations, 'root-b')?.eligibleDescendantCount === 1, { rootA: decoration(decorations, 'root-a'), a1: decoration(decorations, 'a-1'), rootB: decoration(decorations, 'root-b') });
check('S05', 'collapse recomputes visible child geometry while counts stay available', collapsedDecorations.size === 3 && decoration(collapsedDecorations, 'root-a')?.eligibleDescendantCount === 5 && decoration(collapsedDecorations, 'root-a')?.hasVisibleChildren === false && decoration(collapsedDecorations, 'root-b')?.hasVisibleChildren === true && decoration(collapsedDecorations, 'root-b')?.ancestorContinuations.length === 0 && !collapsedDecorations.has('a-1'), { keys: Array.from(collapsedDecorations.keys()), rootA: decoration(collapsedDecorations, 'root-a') });
check('S06', 'invalid projections fail closed without changing rows', buildGoalHierarchyDecorations({ renderedItems: [item('duplicate', 0), item('duplicate', 0)], fullyExpandedItems: [item('duplicate', 0)] }).size === 0 && buildGoalHierarchyDecorations({ renderedItems: [item('root-a', 0), item('missing', 1, 'root-a')], fullyExpandedItems: fullyExpanded }).size === 0 && buildGoalHierarchyDecorations({ renderedItems: [item('root-a', 0), item('a-1-a', 2, 'root-a')], fullyExpandedItems: fullyExpanded }).size === 0);
check('S07', 'Goal retains shared hierarchy, sparse projection, native table and one scroll owner', goal.includes("buildHierarchicalTaskItems") && goal.includes('buildGoalSparseProjection') && (goal.match(/<table\b/g) ?? []).length === 1 && goal.includes('data-goal-view="true"') && goal.includes('overflow-auto'));
check('S08', 'shared hierarchy and content ownership remain outside DEV-121 projector', !taskHierarchy.includes('goalHierarchy') && !projection.includes('goalHierarchy') && !sharedRow.includes('goalHierarchy') && goal.includes("from '../utils/taskHierarchy'") && goal.includes("from '../features/goalMode/projection'"));
check('S09', 'owned guide and count hooks are presentation-only and accessible', goal.includes('data-goal-task-cell="true"') && goal.includes('data-goal-group-span') && goal.includes('data-goal-hierarchy-guides') && goal.includes('data-goal-hierarchy-guide-owner') && goal.includes('data-goal-hierarchy-guide-active') && goal.includes("'incoming-vertical'") && goal.includes("'incoming-branch'") && goal.includes('data-goal-collapse-toggle') && goal.includes('aria-hidden="true"') && goal.includes('data-goal-descendant-count') && hierarchyPresentation.includes('Object.freeze'));
check('S10', 'connector reading guide scopes task/planning cells while rowSpan owner tint remains explicit', css.includes('@supports selector(tr:has(> td))') && css.includes('[data-goal-planning-control]') && css.includes('[data-goal-task-cell]') && goal.includes('data-goal-content-scope') && goal.includes('activeContentOwnerIds') && !css.includes('tr:hover > *'));
check('S11', 'ephemeral hover scope does not create a store, content clone or second table', (goal.match(/<table\b/g) ?? []).length === 1 && goal.includes('activeHierarchyScopeId') && !goal.includes('GoalPlanningContext') && !goal.includes('useGoalHierarchyStore') && !goal.includes('cloneContent') && !hierarchyPresentation.includes('useState'));
check('S12', 'spec, QA, dev task and map agree on the completed R13 all-column reverse content location contract', spec.includes('R8 Compact X-axis Contract') && spec.includes('R9 Soft Connector Tone Addendum') && spec.includes('R10 Active Task Lineage Highlight Addendum') && spec.includes('R11 Active Contrast Addendum') && spec.includes('R12 RowSpan Ownership Contrast Correction') && spec.includes('R13 Reverse Content Location Addendum') && spec.includes('ownerTaskId') && goal.includes('onMouseEnter={cell.kind ===') && goal.includes('onFocusCapture={cell.kind ===') && goal.includes('onMouseEnter={() => onHierarchyScopeChange(node.id)}') && qa.includes('R13 Executed') && qa.includes('B11') && qa.includes('B12') && qa.includes('V17') && devTask.includes('R13 Reverse Content Location Closure') && map.includes('R13 Implemented'));
check('S13', 'Goal task rows have no inter-row gridline while root boundaries remain explicit', !goal.includes("className={`border-b border-slate-200") && css.includes('tbody > tr[data-goal-task-row] > *') && css.includes('border-bottom: 0') && css.includes('data-goal-level="0"]:not(:first-child)'));
check('S14', 'wired tree renders five owned line segments without endpoints or a legacy elbow', goal.includes("'continuation'") && goal.includes("'incoming-vertical'") && goal.includes("'incoming-branch'") && goal.includes("'child-stem'") && goal.includes("'root-branch'") && !goal.includes("'endpoint'") && !goal.includes('continuation-replaced') && !css.includes('goal-hierarchy-guide-elbow') && !css.includes('goal-hierarchy-guide-endpoint'));
check('S15', 'Goal-only geometry minimizes X indentation and title distance while preserving the left disclosure slot', css.includes('--task-hierarchy-indent: 8px') && css.includes('--goal-hierarchy-lane-start: 20px') && css.includes('--goal-hierarchy-branch-width: 12px') && css.includes('padding-right: 10px') && goal.includes('task-title-text min-w-0 flex-1 truncate pr-1') && css.includes('left: 0') && css.includes('right: auto') && css.includes('data-goal-hierarchy-scope="parent"') && !sharedRow.includes('--task-hierarchy-indent: 8px'));
check('S16', 'Goal active connectors use a heavier centered stroke and located cells use stronger scope tint', css.includes('--goal-hierarchy-line-color: rgb(148 163 184 / 42%)') && css.includes('--goal-hierarchy-line-active-color: rgb(99 102 241 / 76%)') && css.includes('border-radius: 999px') && css.includes('width: 2px') && css.includes('height: 2px') && css.includes('background-color: rgb(199 210 254 / 94%)') && css.includes('background-color: rgb(224 231 255 / 90%)'));

const artifact = {
  devId: 'DEV-121',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-121-goal-hierarchy-comparison',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactDir = resolve('output/playwright/dev-121-goal-hierarchy-comparison');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length) {
  console.error('DEV-121 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-121 static verification passed: ${checks.length} assertions.`);
