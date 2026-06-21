import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/types/index.ts',
  app: 'src/App.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
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
    app.includes("from './components/MindMap/MindMapView'"),
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
    mindMapView.includes('data-mindmap-center') &&
    mindMapView.includes('data-mindmap-create-root') &&
    mindMapView.includes('activeBoard.title'),
);

assert(
  'MindMap node displays task title as branch text',
  mindMapNode.includes('data-mindmap-node') &&
    mindMapNode.includes('data-mindmap-node-title') &&
    mindMapNode.includes('node.title') &&
    mindMapNode.includes('data-mindmap-title-input'),
);

assert(
  'Keyboard model covers Enter Tab F2 Delete and typing rename',
  mindMapView.includes("event.key === 'Enter'") &&
    mindMapView.includes("event.key === 'Tab'") &&
    mindMapView.includes("event.key === 'F2'") &&
    mindMapView.includes("event.key === 'Delete'") &&
    mindMapView.includes("event.key === 'Backspace'") &&
    mindMapView.includes('event.key.length === 1'),
);

assert(
  'Drag hierarchy has cycle guard and drop modes',
  mindMapView.includes('wouldCreateCycle') &&
    mindMapView.includes("mode === 'child'") &&
    mindMapView.includes("'before'") &&
    mindMapView.includes("'after'") &&
    mindMapView.includes('data-mindmap-connector-overlay') &&
    mindMapView.includes('data-mindmap-connector-path'),
);

assert(
  'DEV-027A has connector overlay metadata and side persistence',
  mindMapView.includes('projed.mindmap.rootSides') &&
    mindMapView.includes('data-mindmap-side-drop-zone') &&
    mindMapView.includes('data-mindmap-node-direction') &&
    mindMapView.includes('data-from-node-id') &&
    mindMapView.includes('data-to-node-id') &&
    mindMapView.includes('data-from-x') &&
    mindMapView.includes('data-to-x'),
);

assert(
  'DEV-027A exposes drag preview and drop preview metadata',
  mindMapView.includes('data-mindmap-drag-preview') &&
    mindMapView.includes('data-mindmap-drop-preview') &&
    mindMapView.includes('data-drop-position') &&
    mindMapView.includes('data-target-parent-id') &&
    mindMapView.includes('setTransparentDragImage'),
);

assert(
  'Permissions protect create edit move delete',
  mindMapView.includes('canCreateTask') &&
    mindMapView.includes('canEditTask') &&
    mindMapView.includes('canMoveTask') &&
    mindMapView.includes('canDeleteTask') &&
    mindMapView.includes('只讀模式'),
);

assert(
  'Delete subtree has confirmation guard',
  mindMapView.includes('showConfirm') &&
    mindMapView.includes('子任務') &&
    mindMapView.includes('整個分支都會移到回收桶'),
);

assert(
  'Package exposes DEV-027 verifier',
  pkg.includes('"verify:dev-027-xmind-like-mind-map-mode"') &&
    pkg.includes('"verify:dev-027-xmind-like-mind-map-browser"') &&
    pkg.includes('"verify:dev-027-xmind-connector-lines-browser"') &&
    pkg.includes('"verify:dev-027-xmind-drag-preview-browser"'),
);

assert(
  'Browser verifier covers drag hierarchy, cycle guard, mobile, and viewer read-only',
  browserVerifier.includes('dragging onto another branch center should reparent as a child') &&
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
