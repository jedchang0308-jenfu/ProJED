import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/types/index.ts',
  app: 'src/App.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  mindMapRootLayout: 'src/components/MindMap/MindMapRootLayout.tsx',
  mindMapToolbar: 'src/components/MindMap/MindMapToolbar.tsx',
  mindMapKeyboard: 'src/components/MindMap/mindMapKeyboard.ts',
  mindMapDropCommands: 'src/components/MindMap/mindMapDropCommands.ts',
  mindMapTree: 'src/components/MindMap/mindMapTree.ts',
  mindMapConnectorOverlay: 'src/components/MindMap/MindMapConnectorOverlay.tsx',
  mindMapDrag: 'src/components/MindMap/mindMapDrag.ts',
  mindMapDragPreviewBadge: 'src/components/MindMap/MindMapDragPreviewBadge.tsx',
  mindMapDragPreviewLayer: 'src/components/MindMap/MindMapDragPreviewLayer.tsx',
  mindMapMessages: 'src/components/MindMap/mindMapMessages.ts',
  mindMapSideStorage: 'src/components/MindMap/mindMapSideStorage.ts',
  taskDetailsModal: 'src/components/TaskDetailsModal.tsx',
  browserVerifier: 'scripts/verify-dev-027-xmind-like-mind-map-browser.pw.js',
  connectorVerifier: 'scripts/verify-dev-027-xmind-connector-lines-browser.pw.js',
  dragPreviewVerifier: 'scripts/verify-dev-027-xmind-drag-preview-browser.pw.js',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md',
  qa: 'ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md',
  qc: 'ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md',
  devTask: 'ai-doc/dev_task.md',
  backlog: 'ai-doc/backlog.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];

const assert = (name, ok, details = undefined) => {
  results.push({ name, ok, details });
};

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const types = read(files.types);
const app = read(files.app);
const mainLayout = read(files.mainLayout);
const mindMapView = read(files.mindMapView);
const mindMapNode = read(files.mindMapNode);
const mindMapRootLayout = read(files.mindMapRootLayout);
const mindMapToolbar = read(files.mindMapToolbar);
const mindMapKeyboard = read(files.mindMapKeyboard);
const mindMapDropCommands = read(files.mindMapDropCommands);
const mindMapTree = read(files.mindMapTree);
const mindMapConnectorOverlay = read(files.mindMapConnectorOverlay);
const mindMapDrag = read(files.mindMapDrag);
const mindMapDragPreviewBadge = read(files.mindMapDragPreviewBadge);
const mindMapDragPreviewLayer = read(files.mindMapDragPreviewLayer);
const mindMapMessages = read(files.mindMapMessages);
const mindMapSideStorage = read(files.mindMapSideStorage);
const taskDetailsModal = read(files.taskDetailsModal);
const browserVerifier = read(files.browserVerifier);
const connectorVerifier = read(files.connectorVerifier);
const dragPreviewVerifier = read(files.dragPreviewVerifier);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);
const qc = read(files.qc);
const devTask = read(files.devTask);
const backlog = read(files.backlog);
const documentationMap = read(files.documentationMap);

assert(
  'ViewMode includes mindmap',
  types.includes("'mindmap'") && types.includes('export type ViewMode'),
);

assert(
  'App renders MindMapView for mindmap mode',
  app.includes("case 'mindmap'") &&
    app.includes('MindMapView') &&
    app.includes("import('./components/MindMap/MindMapView')"),
);

assert(
  'MainLayout exposes 心智圖 mode switcher option',
  mainLayout.includes("value: 'mindmap'") &&
    mainLayout.includes("label: '心智圖'") &&
    mainLayout.includes('Network') &&
    mainLayout.includes("'list', 'mindmap', 'board'"),
);

assert(
  'MindMapView uses existing WBS store without backend data model',
  mindMapView.includes('useWbsStore') &&
    mindMapView.includes('addNode') &&
    mindMapView.includes('updateNode') &&
    mindMapView.includes('removeNode') &&
    !mindMapView.includes('fetch('),
);

assert(
  'MindMapView has stable selectors and center topic',
  mindMapView.includes('data-mindmap-view') &&
    mindMapView.includes('boardTitle={activeBoard.title}') &&
    mindMapRootLayout.includes('data-mindmap-center') &&
    mindMapRootLayout.includes("boardTitle || '\\u672a\\u547d\\u540d\\u770b\\u677f'") &&
    mindMapToolbar.includes('data-mindmap-create-root'),
);

assert(
  'MindMap node displays task title as branch text',
  mindMapNode.includes('data-mindmap-node') &&
    mindMapNode.includes('data-mindmap-node-title') &&
    mindMapNode.includes('node.title') &&
    !mindMapNode.includes('data-mindmap-title-input'),
);

assert(
  'Keyboard model covers Enter Tab Delete and detail-only title editing',
  mindMapKeyboard.includes("event.key === 'Enter'") &&
    mindMapKeyboard.includes("event.key === 'Tab'") &&
    mindMapKeyboard.includes("event.key === 'Delete'") &&
    mindMapKeyboard.includes("event.key === 'Backspace'") &&
    !mindMapKeyboard.includes("type: 'rename-selected'") &&
    !mindMapView.includes("action.type === 'rename-selected'") &&
    mindMapView.includes('openTaskDetails(nodeId)') &&
    mindMapView.includes('prepareNewTaskNaming(node.id)') &&
    taskDetailsModal.includes('data-task-details-title-input="true"'),
);

assert(
  'Drag hierarchy has cycle guard and drop modes',
  mindMapDropCommands.includes('wouldCreateMindMapCycle') &&
    mindMapDropCommands.includes("mode === 'child'") &&
    mindMapTree.includes("mode: Extract<MindMapDropMode, 'before' | 'after'>") &&
    mindMapConnectorOverlay.includes('data-mindmap-connector-overlay') &&
    mindMapConnectorOverlay.includes('data-mindmap-connector-path'),
);

assert(
  'DEV-027A has connector overlay metadata and side persistence',
  mindMapSideStorage.includes('projed.mindmap.rootSides') &&
    mindMapRootLayout.includes('data-mindmap-side-drop-zone') &&
    mindMapNode.includes('data-mindmap-node-direction') &&
    mindMapConnectorOverlay.includes('data-from-node-id') &&
    mindMapConnectorOverlay.includes('data-to-node-id') &&
    mindMapConnectorOverlay.includes('data-from-x') &&
    mindMapConnectorOverlay.includes('data-to-x'),
);

assert(
  'DEV-027A exposes drag preview and drop preview metadata',
  mindMapDragPreviewBadge.includes('data-mindmap-drag-preview') &&
    mindMapDragPreviewLayer.includes('data-mindmap-drop-preview') &&
    mindMapDragPreviewLayer.includes('data-drop-position') &&
    mindMapDragPreviewLayer.includes('data-target-parent-id') &&
    mindMapDrag.includes('setTransparentDragImage') &&
    mindMapView.includes('setTransparentDragImage(event.dataTransfer)'),
);

assert(
  'Permissions protect create edit move delete',
  mindMapView.includes('canCreateTask') &&
    mindMapView.includes('canEditTask') &&
    mindMapView.includes('canMoveTask') &&
    mindMapView.includes('canDeleteTask') &&
    mindMapToolbar.includes('唯讀'),
);

assert(
  'Delete subtree has confirmation guard',
  mindMapView.includes('showConfirm') &&
    mindMapMessages.includes('getMindMapDeleteTaskConfirmMessage') &&
    mindMapMessages.includes('子任務') &&
    mindMapMessages.includes('刪除後會一併移除'),
);

assert(
  'Package exposes DEV-027 verifier',
  pkg.includes('"verify:dev-027-xmind-like-mind-map-mode"') &&
    pkg.includes('"verify:dev-027-xmind-like-mind-map-browser"') &&
    pkg.includes('"verify:dev-027-xmind-connector-lines-browser"') &&
    pkg.includes('"verify:dev-027-xmind-drag-preview-browser"'),
);

assert(
  'Browser verifier covers detail-only naming, drag hierarchy, cycle guard, mobile, and viewer read-only',
  browserVerifier.includes('dragging onto another branch center should reparent as a child') &&
    browserVerifier.includes('data-task-details-title-input') &&
    browserVerifier.includes('should not open the outer mind map rename input') &&
    browserVerifier.includes('cycle guard should reject dragging a parent under its descendant') &&
    browserVerifier.includes('mobile mind map canvas should remain horizontally scrollable') &&
    browserVerifier.includes('viewer create-root button should be disabled') &&
    browserVerifier.includes('viewer branches should not be draggable') &&
    browserVerifier.includes('DEV-027 viewer mind map'),
);

assert(
  'DEV-027A browser verifiers cover geometry and same-side drag preview',
  connectorVerifier.includes('geometry: evidence') &&
    connectorVerifier.includes('fromDistance > 6') &&
    connectorVerifier.includes('nodeOverlaps.length === 0') &&
    dragPreviewVerifier.includes('data-mindmap-drag-preview') &&
    dragPreviewVerifier.includes('data-mindmap-drop-preview') &&
    dragPreviewVerifier.includes('same-side layout should persist after hard reload') &&
    dragPreviewVerifier.includes('dev-027A-drag-preview-sequence'),
);

assert(
  'PM docs define DEV-027 scope and QA',
  spec.includes('SPEC-027') &&
    spec.includes('Xmind-like 心智圖模式') &&
    spec.includes('不新增資料表') &&
    qa.includes('QA-DEV-027') &&
    qa.includes('Visible Error Sweep') &&
    qc.includes('verify:dev-027-xmind-like-mind-map-browser') &&
    devTask.includes('DEV-027') &&
    backlog.includes('DEV-027') &&
    documentationMap.includes('DEV-027'),
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
