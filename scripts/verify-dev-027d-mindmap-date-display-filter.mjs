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
  mindMapView.includes("import { useTagStore } from '../../store/useTagStore';") &&
    mindMapView.includes('statusFilters = useBoardStore') &&
    mindMapView.includes('dueWithinDays = useBoardStore') &&
    mindMapView.includes('selectedAssigneeIds = useBoardStore') &&
    mindMapView.includes('showStartDate = useBoardStore') &&
    mindMapView.includes('selectedTagIds = useTagStore') &&
    mindMapView.includes('const mindMapFilters = React.useMemo(() => ({') &&
    mindMapView.includes('keyword:') &&
    mindMapView.includes('getMindMapRootNodes(nodes, parentNodesIndex, boardId, mindMapFilters)') &&
    mindMapView.includes('getMindMapChildren(nodes, parentNodesIndex, boardId, mindMapFilters, nodeId)'),
);

assert(
  'MindMap root and child traversal apply the shared task filter predicate',
  mindMapTree.includes("import { matchesTaskFilters, type TaskFilterState } from '../../features/taskFilters';") &&
    mindMapTree.includes('export type MindMapFilterState = TaskFilterState;') &&
    mindMapTree.includes('const matchesMindMapFilters = (node: TaskNode, filters: MindMapFilterState) =>') &&
    mindMapTree.includes('matchesTaskFilters(node, filters)') &&
    mindMapTree.includes('matchesMindMapFilters(node, filters)'),
);

assert(
  'MindMapNode renders filter-controlled compact date metadata',
  mindMapNode.includes("import dayjs from 'dayjs';") &&
    mindMapNode.includes('Calendar, ChevronDown, ChevronRight') &&
    mindMapNode.includes('showStartDate: boolean') &&
    mindMapNode.includes('const hasVisibleDates = (showStartDate && node.startDate) || node.endDate;') &&
    mindMapNode.includes("date.format('MM/DD')") &&
    mindMapNode.includes("date.format('YY/MM/DD')") &&
    mindMapNode.includes('data-mindmap-node-dates') &&
    mindMapNode.includes('data-start-date={showStartDate ? node.startDate ||') &&
    mindMapNode.includes('data-end-date={node.endDate ||'),
);

assert(
  'MindMapView passes start-date visibility into every recursive node',
  mindMapView.includes('showStartDate={showStartDate}') &&
    mindMapView.includes('const showStartDate = useBoardStore') &&
    mindMapView.includes('renderChild={renderNode}'),
);

assert(
  'Package exposes DEV-027D verifiers',
  pkg.includes('"verify:dev-027d-mindmap-date-display-filter"') &&
    pkg.includes('"verify:dev-027d-mindmap-date-display-filter-browser"'),
);

assert(
  'Browser verifier covers date badge, start date toggle, due filter, status filter, and assignee filter',
  browserVerifier.includes('date badge should expose start and end date metadata') &&
    browserVerifier.includes('showStartDate=false should hide the start date') &&
    browserVerifier.includes('dueWithinDays=7 should keep near due node visible') &&
    browserVerifier.includes('status filter should hide todo and keep completed') &&
    browserVerifier.includes('assignee filter should hide nodes assigned to other people') &&
    browserVerifier.includes('date badge should stay inside the branch node bounds'),
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
