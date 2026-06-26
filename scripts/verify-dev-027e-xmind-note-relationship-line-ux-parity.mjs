import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  mindMapGeometry: 'src/components/MindMap/mindMapGeometry.ts',
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
const mindMapGeometry = read(files.mindMapGeometry);
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
  mindMapGeometry.includes('export interface MindMapRelationshipStyle') &&
    mindMapGeometry.includes('export interface MindMapRelationshipGeometry') &&
    mindMapGeometry.includes('fromAnchor?: MindMapRelationshipAnchor') &&
    mindMapGeometry.includes('toAnchor?: MindMapRelationshipAnchor') &&
    mindMapGeometry.includes('controlPoints?: MindMapRelationshipPoint[]') &&
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
    mindMapView.includes('hoveredRelationshipId') &&
    mindMapView.includes('setHoveredRelationshipId(path.id)') &&
    mindMapView.includes('data-hovered={hovered ? \'true\' : \'false\'}') &&
    mindMapView.includes('getRelationshipCurveHitSegments') &&
    mindMapView.includes('data-mindmap-note-relationship-curve-click-target') &&
    mindMapView.includes('startRelationshipLabelEdit') &&
    mindMapView.includes("event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space'") &&
    mindMapView.includes('handleRelationshipHotkey') &&
    mindMapView.includes("event.key === 'Delete'") &&
    mindMapView.includes("event.key === 'Backspace'") &&
    mindMapView.includes("event.key === 'Escape'"),
);

assert(
  'Creation preview follows cursor with an Xmind-like dashed arrow before endpoint selection',
  mindMapGeometry.includes('export interface MindMapRelationshipDraftPreview') &&
    mindMapGeometry.includes('export const makeRelationshipDraftPreview') &&
    mindMapView.includes('updateRelationshipDraftPreview') &&
    mindMapView.includes('data-mindmap-note-relationship-draft-preview') &&
    mindMapView.includes('data-mindmap-note-relationship-draft-preview-path') &&
    mindMapView.includes('markerEnd="url(#mindmap-note-relationship-draft-arrow)"') &&
    mindMapView.includes('strokeDasharray="6 5"'),
);

assert(
  'Relationship label is rendered directly on the line instead of offset beside it',
  mindMapGeometry.includes('const labelX = (c1X + c2X) / 2;') &&
    mindMapView.includes('textAnchor="middle"'),
);

assert(
  'Selected relationships expose Xmind-like endpoint and Bezier control handles',
  mindMapView.includes('startRelationshipPointerDrag') &&
    mindMapView.includes("handle: RelationshipPointerDragState['handle']") &&
    mindMapView.includes("relationshipPointerDrag.handle === 'control-1'") &&
    mindMapView.includes("relationshipPointerDrag.handle === 'control-2'") &&
    mindMapView.includes('data-mindmap-note-relationship-endpoint="from"') &&
    mindMapView.includes('data-mindmap-note-relationship-endpoint="to"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-arm="from"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-arm="to"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-arm-overlay') &&
    mindMapView.includes('data-mindmap-note-relationship-screen-control-arm="from"') &&
    mindMapView.includes('data-mindmap-note-relationship-screen-control-arm="to"') &&
    mindMapView.includes('data-mindmap-note-relationship-screen-control-point="1"') &&
    mindMapView.includes('data-mindmap-note-relationship-screen-control-point="2"') &&
    mindMapView.includes('rounded-full border-[3px] border-white bg-sky-500') &&
    mindMapView.includes('data-mindmap-note-relationship-control-point="1"') &&
    mindMapView.includes('data-mindmap-note-relationship-control-point="2"'),
);

assert(
  'Legacy or stale screen-space relationship control points are ignored before rendering',
  mindMapGeometry.includes('isReasonableRelationshipControlPoint') &&
    mindMapGeometry.includes('canUseStoredControls') &&
    mindMapGeometry.includes('endpointDistance * 1.4 + 120') &&
    browserVerifier.includes('legacy screen-space relationship control points should be ignored instead of exploding the line') &&
    browserVerifier.includes('legacy screen-space relationship control points should stay stable near 43% zoom') &&
    browserVerifier.includes('stale control point regression should run near the user-reported 43% zoom level'),
);

assert(
  'Relationship style panel exposes color, width, dash, arrows, label size, and reset',
  mindMapView.includes('relationshipColorOptions') &&
    mindMapView.includes('relationshipWidthOptions') &&
    mindMapView.includes('relationshipDashOptions') &&
    mindMapView.includes('data-mindmap-note-relationship-style-panel') &&
    mindMapView.includes('data-mindmap-note-relationship-style-drawer="true"') &&
    mindMapView.includes('right-0 top-[88px]') &&
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
    browserVerifier.includes('draft relationship preview should follow the cursor in the map-local zoom layer before selecting endpoint') &&
    browserVerifier.includes('data-mindmap-note-relationship-draft-coordinate-space') &&
    browserVerifier.includes('hovering the line body should highlight the relationship') &&
    browserVerifier.includes('clicking the line body should select the relationship') &&
    browserVerifier.includes('relationship style panel should be visible') &&
    browserVerifier.includes('relationship style controls should render as a right drawer instead of a floating popover') &&
    browserVerifier.includes('selected relationship adjustment control points should be visibly sized on screen') &&
    browserVerifier.includes('dragging a control point should update Bezier geometry') &&
    browserVerifier.includes('dragging endpoint to another task should reconnect the note relationship') &&
    browserVerifier.includes('Ctrl+Shift+R should start note relationship mode') &&
    browserVerifier.includes('right-clicking a task should start note relationship mode from that task') &&
    browserVerifier.includes('legacy screen-space relationship control points should stay stable near 43% zoom') &&
    browserVerifier.includes('relationship geometry should remain finite after zoom') &&
    browserVerifier.includes('zooming should not recompute or rewrite relationship path geometry or local interaction coordinates'),
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
