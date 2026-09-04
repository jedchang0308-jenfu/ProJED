import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapTree: 'src/components/MindMap/mindMapTree.ts',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  browserVerifier: 'scripts/verify-dev-027d-mindmap-date-display-filter-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const mindMapView = read(files.mindMapView);
const mindMapTree = read(files.mindMapTree);
const mindMapNode = read(files.mindMapNode);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);

assert(
  'MindMapView reads the shared board task filter state',
  mindMapView.includes("import { useTaskFilterStore } from '../../store/useTaskFilterStore';") &&
    mindMapView.includes('useTaskFilterStore(state => state.filters)') &&
    mindMapView.includes('showStartDate = useBoardStore') &&
    mindMapView.includes('projectTaskFilterResults') &&
    mindMapView.includes('filterProjection.visibleTaskIds'),
);

assert(
  'MindMap root and child traversal use canonical projection visible IDs',
  mindMapTree.includes('visibleTaskIds: ReadonlySet<string>') &&
    mindMapTree.includes('visibleTaskIds.has(node.id)') &&
    !mindMapTree.includes('matchesTaskFilters'),
);

assert(
  'MindMapNode reuses shared Kanban date and status presentation',
  mindMapNode.includes("import { TaskDateBadge } from '../Wbs/TaskDateBadge';") &&
    mindMapNode.includes("import { taskStatusTitleClass } from '../ui/taskStatusStyles';") &&
    mindMapNode.includes('showStartDate: boolean') &&
    mindMapNode.includes('const hasVisibleDates = (showStartDate && node.startDate) || node.endDate;') &&
    mindMapNode.includes('taskStatusTitleClass[node.status]') &&
    mindMapNode.includes('<TaskDateBadge') &&
    mindMapNode.includes('surface="checklist"') &&
    mindMapNode.includes('startLocked={dateLockStatus.startLocked}') &&
    mindMapNode.includes('endLocked={dateLockStatus.endLocked}') &&
    !mindMapNode.includes('border-amber-200 bg-amber-50') &&
    mindMapNode.includes('data-mindmap-node-dates') &&
    mindMapNode.includes('data-start-date={showStartDate ? node.startDate ||') &&
    mindMapNode.includes('data-end-date={node.endDate ||'),
);

assert(
  'MindMapView passes start-date visibility into every recursive node',
  mindMapView.includes('showStartDate={showStartDate}') &&
    mindMapView.includes('dateLockStatus={getNodeLockStatus(node.canonicalTaskId || node.id, dependencies)}') &&
    mindMapView.includes('const showStartDate = useBoardStore') &&
    mindMapView.includes('renderChild={renderNode}'),
);

assert(
  'Package exposes DEV-027D verifiers',
  pkg.includes('"verify:dev-027d-mindmap-date-display-filter"') &&
    pkg.includes('"verify:dev-027d-mindmap-date-display-filter-browser"'),
);

assert(
  'Browser verifier covers shared date/status visuals, start date toggle, and task filters',
  browserVerifier.includes('date badge should expose start and end date metadata') &&
    browserVerifier.includes('Mind Map should render the shared Kanban date badge') &&
    browserVerifier.includes('task titles should reuse shared status colors') &&
    browserVerifier.includes('showStartDate=false should hide the start date') &&
    browserVerifier.includes('dueWithinDays=7 should keep near due node visible') &&
    browserVerifier.includes('status filter should hide todo and keep completed') &&
    browserVerifier.includes('assignee filter should hide nodes assigned to other people') &&
    browserVerifier.includes('date badge should stay inside the branch node bounds') &&
    browserVerifier.includes('shared date badge should remain contained without page overflow at 768px'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
