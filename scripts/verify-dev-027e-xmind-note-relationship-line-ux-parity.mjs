import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  browserVerifier: 'scripts/verify-dev-027e-xmind-note-relationship-line-ux-parity-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md',
  qa: 'ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md',
  packageJson: 'package.json',
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
const spec = read(files.spec);
const qa = read(files.qa);
const pkg = read(files.packageJson);
const inlineFunction = mindMapView.slice(
  mindMapView.indexOf('const createNoteRelationshipInline'),
  mindMapView.indexOf('const handleNodeSelect'),
);

assert(
  'Relationship data model supports note-only style and geometry without dependency semantics',
  mindMapView.includes('interface MindMapRelationshipStyle') &&
    mindMapView.includes('interface MindMapRelationshipGeometry') &&
    mindMapView.includes('fromAnchor?: MindMapRelationshipAnchor') &&
    mindMapView.includes('toAnchor?: MindMapRelationshipAnchor') &&
    mindMapView.includes('controlPoints?: MindMapRelationshipPoint[]') &&
    !mindMapView.includes('addDependency') &&
    !mindMapView.includes('createDependencyId'),
);

assert(
  'Creation main flow uses inline label editing instead of a modal prompt',
  mindMapView.includes('createNoteRelationshipInline') &&
    inlineFunction.includes('setEditingRelationshipId(relationship.id)') &&
    inlineFunction.includes('setEditingRelationshipLabel(relationship.label)') &&
    !inlineFunction.includes('showPrompt') &&
    mindMapView.includes('data-mindmap-note-relationship-label-input'),
);

assert(
  'Line body, label, keyboard deletion, Escape, and Space edit are selectable object interactions',
    mindMapView.includes('data-mindmap-note-relationship-hitbox') &&
    mindMapView.includes('data-mindmap-note-relationship-click-target') &&
    mindMapView.includes('startRelationshipLabelEdit') &&
    mindMapView.includes("event.key === ' ' || event.key === 'Space'") &&
    mindMapView.includes("event.key === 'Delete'") &&
    mindMapView.includes("event.key === 'Backspace'") &&
    mindMapView.includes("event.key === 'Escape'"),
);

assert(
  'Selected relationships expose Xmind-like endpoint and Bezier control handles',
  mindMapView.includes('startRelationshipPointerDrag') &&
    mindMapView.includes("handle: RelationshipPointerDragState['handle']") &&
    mindMapView.includes("relationshipPointerDrag.handle === 'control-1'") &&
    mindMapView.includes("relationshipPointerDrag.handle === 'control-2'") &&
    mindMapView.includes('data-mindmap-note-relationship-endpoint="from"') &&
    mindMapView.includes('data-mindmap-note-relationship-endpoint="to"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-point="1"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-point="2"'),
);

assert(
  'Relationship style panel exposes color, width, dash, arrows, label size, and reset',
  mindMapView.includes('relationshipColorOptions') &&
    mindMapView.includes('relationshipWidthOptions') &&
    mindMapView.includes('relationshipDashOptions') &&
    mindMapView.includes('data-mindmap-note-relationship-style-panel') &&
    mindMapView.includes('data-mindmap-note-relationship-style-color') &&
    mindMapView.includes('data-mindmap-note-relationship-style-width') &&
    mindMapView.includes('data-mindmap-note-relationship-style-dash') &&
    mindMapView.includes('data-mindmap-note-relationship-style-arrow') &&
    mindMapView.includes('data-mindmap-note-relationship-style-label-size') &&
    mindMapView.includes('data-mindmap-note-relationship-style-reset'),
);

assert(
  'Toolbar, shortcut, and right-click start relationship creation from a selected node',
  mindMapView.includes("event.key.toLowerCase() === 'r'") &&
    mindMapView.includes('toggleRelationshipTool()') &&
    mindMapView.includes('startRelationshipFromNode') &&
    mindMapNode.includes('onContextMenu') &&
    mindMapNode.includes('onRelationshipStart(node.id)') &&
    mindMapView.includes('data-source-node-id={relationshipDraft?.fromId || \'\'}'),
);

assert(
  'DEV-027E documentation and QA plan describe strict Xmind-like parity gates',
  spec.includes('inline edit') &&
    spec.includes('endpoint') &&
    spec.includes('control point') &&
    spec.includes('樣式') &&
    qa.includes('QA-027E-001') &&
    qa.includes('QA-027E-020'),
);

assert(
  'Package exposes DEV-027E static and browser verification commands',
  pkg.includes('"verify:dev-027e-xmind-note-relationship-line-ux-parity"') &&
    pkg.includes('"verify:dev-027e-xmind-note-relationship-line-ux-parity-browser"'),
);

assert(
  'Browser verifier covers inline edit, selection, style, handles, reconnect, shortcut, right-click, and zoom',
  browserVerifier.includes('inline relationship editor should open without a prompt') &&
    browserVerifier.includes('clicking the line body should select the relationship') &&
    browserVerifier.includes('relationship style panel should be visible') &&
    browserVerifier.includes('dragging a control point should update Bezier geometry') &&
    browserVerifier.includes('dragging endpoint to another task should reconnect the note relationship') &&
    browserVerifier.includes('Ctrl+Shift+R should start note relationship mode') &&
    browserVerifier.includes('right-clicking a task should start note relationship mode from that task') &&
    browserVerifier.includes('relationship geometry should remain finite after zoom'),
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
