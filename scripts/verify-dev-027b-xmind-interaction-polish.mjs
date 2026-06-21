import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  browserVerifier: 'scripts/verify-dev-027b-xmind-interaction-polish-browser.pw.js',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-027B-xmind-interaction-polish.md',
  qa: 'ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md',
  devTask: 'ai-doc/dev_task.md',
  backlog: 'ai-doc/backlog.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const mindMapView = read(files.mindMapView);
const mindMapNode = read(files.mindMapNode);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);
const devTask = read(files.devTask);
const backlog = read(files.backlog);
const documentationMap = read(files.documentationMap);

assert(
  'New task insertion selects without entering rename input',
  mindMapView.includes('setSelectedNodeId(node.id)') &&
    !mindMapView.includes('setEditingNodeId(node.id)') &&
    !mindMapView.includes('setEditingTitle(node.title)') &&
    !mindMapView.includes('continuousInsertNodeIds') &&
    !mindMapView.includes('handleEditCreateShortcut') &&
    !mindMapNode.includes('onEditCreateShortcut') &&
    mindMapNode.includes('data-mindmap-node-order'),
);

assert(
  'Keyboard selection and direct typing rename match Xmind-style focus behavior',
  mindMapView.includes("event.key === 'ArrowUp'") &&
    mindMapView.includes("event.key === 'ArrowDown'") &&
    mindMapView.includes("event.key === 'ArrowLeft'") &&
    mindMapView.includes("event.key === 'ArrowRight'") &&
    mindMapView.includes('selected?.focus({ preventScroll: true })') &&
    mindMapView.includes('event.key.length === 1') &&
    mindMapView.includes('startEdit(selectedNodeId, event.key)'),
);

assert(
  'Deleting a branch preserves Xmind-style nearest-task focus',
  mindMapView.includes('const previousSibling = siblings') &&
    mindMapView.includes('const parentCandidate = selected.parentId') &&
    mindMapView.includes('const nextSelectionId = previousSibling?.id || parentCandidate?.id') &&
    mindMapView.includes('setSelectedNodeId(nextSelectionId)') &&
    !mindMapView.includes('setSelectedNodeId(null);\n    setEditingNodeId(null);'),
);

assert(
  'Enter sibling inherits side and inserts after selected',
  mindMapView.includes('getInsertOrder(siblings, selected.id, \'after\')') &&
    mindMapView.includes('updateRootSide(created.id, getNodeSide(selected.id))') &&
    mindMapView.includes('createSiblingForNode') &&
    mindMapView.includes('createChildForNode'),
);

assert(
  'Zoom controls and zoom state are exposed',
  mindMapView.includes('data-mindmap-zoom-controls') &&
    mindMapView.includes('data-mindmap-zoom-level') &&
    mindMapView.includes('data-mindmap-zoom-in') &&
    mindMapView.includes('data-mindmap-zoom-out') &&
    mindMapView.includes('data-mindmap-zoom-reset') &&
    mindMapView.includes('data-mindmap-zoom-fit') &&
    mindMapView.includes('clampZoom') &&
    mindMapView.includes('transform: `scale(${zoomLevel})`'),
);

assert(
  'Parent-child connectors use tidy bracket topology',
  mindMapView.includes("variant: 'curve' | 'bracket'") &&
    mindMapView.includes("variant === 'bracket'") &&
    mindMapView.includes(' H ${trunkX.toFixed(2)} V ${toY.toFixed(2)} H ') &&
    mindMapNode.includes('data-mindmap-children-group'),
);

assert(
  'Drag insertion preview has explicit placeholder and fidelity metadata',
  mindMapView.includes('data-mindmap-insertion-preview') &&
    mindMapView.includes('createInsertionPreview') &&
    mindMapView.includes('insertionPreview') &&
    mindMapView.includes('data-sibling-before-id') &&
    mindMapView.includes('data-sibling-after-id') &&
    mindMapView.includes('data-target-parent-id'),
);

assert(
  'Package exposes DEV-027B verifiers',
  pkg.includes('"verify:dev-027b-xmind-interaction-polish"') &&
    pkg.includes('"verify:dev-027b-xmind-interaction-polish-browser"'),
);

assert(
  'Browser verifier covers selection-first insertion, arrows, direct rename, zoom, tidy connector, and insertion preview',
  browserVerifier.includes('newly created branch should be selected without opening rename input') &&
    browserVerifier.includes('Tab-created child should be selected without opening rename input') &&
    browserVerifier.includes('Enter-created sibling should be selected without opening rename input') &&
    browserVerifier.includes('ArrowUp should move selection to the previous visible sibling') &&
    browserVerifier.includes('typing on selected branch should rename the selected task') &&
    browserVerifier.includes('Delete should select the previous same-level task after removing a branch') &&
    browserVerifier.includes('Delete should select the parent task when no previous same-level task exists') &&
    browserVerifier.includes('zoom level should change after zoom-in') &&
    browserVerifier.includes('child connector paths should share a tidy trunk') &&
    browserVerifier.includes('drag insertion preview should expose sibling metadata or target parent metadata') &&
    browserVerifier.includes('preview metadata should match post-drop state'),
);

assert(
  'PM docs define DEV-027B scope and strict QA',
  spec.includes('SPEC-027B') &&
    spec.includes('data-mindmap-title-input') &&
    spec.includes('ArrowUp') &&
    spec.includes('rename mode') &&
    spec.includes('Zoomable high-resolution canvas') &&
    spec.includes('Tidy connector topology') &&
    spec.includes('Drag insertion preview fidelity') &&
    qa.includes('QA-DEV-027B') &&
    qa.includes('data-mindmap-title-input') &&
    devTask.includes('DEV-027B') &&
    devTask.includes('selection-first insert') &&
    backlog.includes('DEV-027B') &&
    documentationMap.includes('DEV-027B'),
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
