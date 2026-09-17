import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGoalHierarchyDecorations,
  type GoalHierarchyDecoration,
} from '../src/features/goalMode/hierarchyPresentation';
import type { HierarchicalTaskViewItem } from '../src/utils/taskHierarchy';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const goal = read('src/components/GoalView.tsx');
const accountPreferences = read('src/services/accountPreferencesService.ts');
const hierarchyPresentation = read('src/features/goalMode/hierarchyPresentation.ts');
const taskHierarchy = read('src/utils/taskHierarchy.ts');
const projection = read('src/features/goalMode/projection.ts');
const sharedRow = read('src/components/Wbs/TaskHierarchyIndentedRow.tsx');
const goalGuides = read('src/components/Wbs/GoalHierarchyGuides.tsx');
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
check('S09', 'owned guide and count hooks are presentation-only and accessible', goal.includes('data-goal-task-cell="true"') && goal.includes('data-goal-group-span') && goalGuides.includes('data-goal-hierarchy-guides') && goalGuides.includes('data-goal-hierarchy-guide-owner') && goalGuides.includes('data-goal-hierarchy-guide-active') && goalGuides.includes("'incoming-vertical'") && goalGuides.includes("'incoming-branch'") && goal.includes('data-goal-collapse-toggle') && goalGuides.includes('aria-hidden="true"') && goal.includes('data-goal-descendant-count') && hierarchyPresentation.includes('Object.freeze'));
check('S10', 'connector reading guide keeps task-name surface quiet while planning/content owner tint remains explicit', css.includes('@supports selector(tr:has(> td))') && css.includes('[data-goal-planning-control]') && css.includes('[data-goal-task-cell]') && css.includes('Keep every frozen task-name level on one shared surface') && goal.includes('data-goal-content-scope') && goal.includes('activeContentOwnerIds') && !css.includes('tr:hover > *'));
check('S11', 'ephemeral hover scope does not create a store, content clone or second table', (goal.match(/<table\b/g) ?? []).length === 1 && goal.includes('activeHierarchyScopeId') && !goal.includes('GoalPlanningContext') && !goal.includes('useGoalHierarchyStore') && !goal.includes('cloneContent') && !hierarchyPresentation.includes('useState'));
check('S12', 'spec, QA, dev task and map agree on the R28 meeting-history no-clipping contract', spec.includes('R8 Compact X-axis Contract') && spec.includes('R9 Soft Connector Tone Addendum') && spec.includes('R10 Active Task Lineage Highlight Addendum') && spec.includes('R11 Active Contrast Addendum') && spec.includes('R12 RowSpan Ownership Contrast Correction') && spec.includes('R16 Active Self Upstream Vertical Suppression') && spec.includes('R17 Tree X-axis Spacing Addendum') && spec.includes('R18 Neutral Task-name Surface Addendum') && spec.includes('R19 Uniform Task-name Surface Addendum') && spec.includes('R20 Soft Located Task-name Tint Addendum') && spec.includes('R21 Description Column Collapse Addendum') && spec.includes('R22 All Goal Columns Collapse Preference Addendum') && spec.includes('R23 Fixed Task-name Lane Addendum') && spec.includes('R24 Compact Column Toggle Visual Addendum') && spec.includes('R25 Compact Collapsed Width Addendum') && spec.includes('R26 Date Placeholder and Content-fit Width Addendum') && spec.includes('R27 Remove Duration-lock Marker Addendum') && spec.includes('R28 Meeting History Scroll Clipping Addendum') && spec.includes('goalCollapsedColumns') && spec.includes('ownerTaskId') && goal.includes('onMouseEnter={cell.kind ===') && goal.includes('onFocusCapture={cell.kind ===') && goal.includes('onMouseEnter={() => onHierarchyScopeChange(node.id)}') && qa.includes('R22～R23 Executed') && qa.includes('R24 Executed') && qa.includes('R25 Executed') && qa.includes('R26 Executed') && qa.includes('R27 Executed') && qa.includes('B11') && qa.includes('B12') && qa.includes('B13') && qa.includes('B14') && qa.includes('B15') && qa.includes('B16') && qa.includes('B17') && qa.includes('B18') && qa.includes('V17') && qa.includes('V20') && devTask.includes('R18 Neutral Task-name Surface Closure') && devTask.includes('R19 Uniform Task-name Surface Closure') && devTask.includes('R20 Soft Located Task-name Tint Closure') && devTask.includes('R21 Description Column Collapse Closure') && devTask.includes('R22 All Goal Columns Collapse Preference Closure') && devTask.includes('R23 Fixed Task-name Lane Closure') && devTask.includes('R24 Compact Column Toggle Visual Closure') && devTask.includes('R25 Compact Collapsed Width Closure') && devTask.includes('R26 Date Placeholder and Content-fit Width Closure') && devTask.includes('R27 Remove Duration-lock Marker Closure') && devTask.includes('R28 Meeting History Scroll Clipping Closure') && map.includes('R28 Implemented'));
check('S13', 'Goal task-name lane has no inter-row gridline while root boundaries remain explicit', !goal.includes("className={`border-b border-slate-200") && css.includes('tbody > tr[data-goal-task-row] > *') && css.includes('border-bottom: 0') && css.includes('data-goal-level="0"]:not(:first-child)'));
check('S14', 'wired tree renders five owned line segments without endpoints or a legacy elbow', goalGuides.includes("'continuation'") && goalGuides.includes("'incoming-vertical'") && goalGuides.includes("'incoming-branch'") && goalGuides.includes("'child-stem'") && goalGuides.includes("'root-branch'") && !goalGuides.includes("'endpoint'") && !goalGuides.includes('continuation-replaced') && !css.includes('goal-hierarchy-guide-elbow') && !css.includes('goal-hierarchy-guide-endpoint'));
check('S15', 'Goal X spacing increases by 30 percent while branch／disclosure geometry remains aligned', css.includes('--task-hierarchy-indent: 10.4px') && css.includes('--goal-hierarchy-lane-start: 20px') && css.includes('--goal-hierarchy-branch-width: 14.4px') && css.includes('--goal-hierarchy-node-control-anchor: 16px') && css.includes('padding-right: 10px') && goal.includes('task-title-text min-w-0 flex-1 truncate pr-1') && css.includes('right: auto') && css.includes('data-goal-hierarchy-scope="parent"') && !sharedRow.includes('--task-hierarchy-indent: 10.4px'));
check('S16', 'Goal active connectors use a heavier centered stroke while task-name surface stays quiet and planning scope tint remains', css.includes('--goal-hierarchy-line-color: rgb(148 163 184 / 42%)') && css.includes('--goal-hierarchy-line-active-color: rgb(99 102 241 / 76%)') && css.includes('border-radius: 999px') && css.includes('width: 2px') && css.includes('height: 2px') && css.includes('background-color: rgb(199 210 254 / 94%)') && css.includes('background-color: rgb(224 231 255 / 90%)') && css.includes('Keep every frozen task-name level on one shared surface'));
  check('S17', 'Goal scrollable comparison cells expose horizontal and vertical gridlines while task-name cells stay open', css.includes('tbody > tr[data-goal-task-row] > [data-goal-column]') && css.includes('border-bottom: 1px solid') && css.includes('border-right: 1px solid') && css.includes('tbody > tr[data-goal-task-row] > *') && css.includes('border-bottom: 0'));
check('S18', 'Goal collapse control is a keyboard-accessible node dot on its owned tree lane without a visible chevron', css.includes('button[data-goal-collapse-toggle]::before') && css.includes('button[data-goal-collapse-toggle] > svg') && css.includes('display: none') && css.includes('[aria-expanded="false"]::before') && css.includes('width: 20px') && css.includes('height: 20px') && goal.includes('hasChildren={hasChildren}') && sharedRow.includes('aria-expanded={hasChildren ? expanded : undefined}'));
check('S19', 'active task suppresses both self incoming segments while retaining its descendant lineage', goalGuides.includes('const isCurrentTaskIncomingRelation =') && goalGuides.includes('if (isCurrentTaskIncomingRelation) return false') && goalGuides.includes("isRelationActive(decoration.parentId)") && spec.includes('R16 Active Self Upstream Vertical Suppression'));
check('S20', 'R17 keeps the 8px baseline traceable and documents the 10.4px Goal spacing token', css.includes('8px baseline × 1.30') && css.includes('--goal-hierarchy-branch-width: 14.4px') && spec.includes('10.4px') && qa.includes('10.4px') && devTask.includes('10.4px') && map.includes('10.4px'));
check('S21', 'R18 keeps the task-name lane on its base surface while planning/content scope tint remains', css.includes('Keep every frozen task-name level on one shared surface') && css.includes('[data-goal-hierarchy-scope="parent"] > [data-goal-planning-control]') && css.includes('[data-goal-content-scope="active"]') && !css.includes('[data-goal-hierarchy-scope="parent"] > th[data-goal-task-cell]'));
check('S22', 'all Goal hierarchy levels use one task-name cell surface', goal.includes('bg-white py-0 align-middle text-left font-normal') && !goal.includes("node.level === 0 ? 'bg-surface-panel'") && !goal.includes("node.level === 1 ? 'bg-white'") && !goal.includes("node.level > 1 ? 'bg-slate-50'"));
check('S23', 'every collapsible Goal column exposes an accessible quiet toggle with responsive 24px/20px hit targets and 18px/16px state glyphs while the fixed task lane stays outside the set', goal.includes("type GoalColumnKey = 'description'") && goal.includes('GoalColumnHeader') && goal.includes('data-goal-column-toggle={column}') && goal.includes('data-goal-column-toggle-state') && goal.includes('data-goal-column-toggle-glyph') && goal.includes('aria-expanded={!collapsed}') && goal.includes('h-6 w-6') && goal.includes('h-5 w-5') && goal.includes('h-[18px] w-[18px]') && goal.includes('h-4 w-4') && goal.includes('rounded-[5px]') && goal.includes('rounded-[4px]') && goal.includes('focus-visible:ring-2') && goal.includes('motion-reduce:transition-none') && goal.includes('GOAL_COLLAPSED_COLUMN_WIDTH_PX = 22.4') && goal.includes('w-[22.4px]') && goal.includes('min-w-[22.4px]') && goal.includes('data-goal-column-collapsed="true"') && goal.includes('data-goal-collapsed-columns') && goal.includes('style={{ width: goalTableMinWidth, minWidth: goalTableMinWidth }}') && !goal.includes("toggleGoalColumn('task')") && !goal.includes('column="task"'));
check('S24', 'Goal column collapse preferences are account-scoped and persisted through the existing UI preference service', goal.includes('useAuthStore') && goal.includes('hydrateAccountLayoutPreferences') && goal.includes('persistAccountLayoutPreferences') && goal.includes('goalCollapsedColumns') && accountPreferences.includes('goalCollapsedColumns') && accountPreferences.includes('profiles') && accountPreferences.includes('projed-ui-preferences:v1'));
check('S25', 'task-name lane remains fixed and visible without a column collapse control', goal.includes('id="goal-column-task"') && goal.includes('任務名稱') && goal.includes('GOAL_TASK_COLUMN_WIDTH_PX = 252') && goal.includes('min-w-[252px]') && !goal.includes("toggleGoalColumn('task')") && !goal.includes('data-goal-column-toggle="task"'));
check('S26', 'empty Goal date cells omit the dash placeholder and planning headers fit their labels', goal.includes('owner: 144') && goal.includes('status: 72') && goal.includes('start: 112') && goal.includes('end: 112') && goal.includes('duration: 84') && goal.includes('data-goal-column-label={column}') && goal.includes('whitespace-nowrap leading-none') && !goal.includes('localStartDate ? <span') && !goal.includes('localEndDate ? <span'));
check('S27', 'duration lock remains a functional date constraint without rendering an inline L marker', goal.includes('{lockStatus.endLocked ? <Link') && goal.includes('isEndDateEffectivelyLocked') && !goal.includes('text-[10px] font-semibold text-slate-400">L</span>'));
check('S28', 'meeting history keeps a scrollbar while hiding any partially visible quick-note row', goal.includes('GOAL_CONTENT_LINE_HEIGHT_PX = 20') && goal.includes('lineAlignedScroll?: boolean') && goal.includes('lineAlignedViewportHeight') && goal.includes('data-goal-content-line-aligned') && goal.includes('data-goal-content-row-clipped') && goal.includes('React.useLayoutEffect') && goal.includes('lineAlignedScroll canEdit={false}') && goal.includes('Math.floor((cell.rowSpan * GOAL_CONTENT_ROW_HEIGHT_PX) / GOAL_CONTENT_LINE_HEIGHT_PX)') && css.includes('data-goal-content-row-clipped="true"'));

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
