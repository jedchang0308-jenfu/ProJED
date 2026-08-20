import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  mindMapGeometry: 'src/components/MindMap/mindMapGeometry.ts',
  relationshipOverlay: 'src/components/MindMap/MindMapRelationshipOverlay.tsx',
  relationshipInteraction: 'src/components/MindMap/MindMapRelationshipInteractionLayer.tsx',
  relationshipStyleLayer: 'src/components/MindMap/MindMapRelationshipStyleLayer.tsx',
  relationshipStyleDrawer: 'src/components/MindMap/MindMapRelationshipStyleDrawer.tsx',
  mindMapToolbar: 'src/components/MindMap/MindMapToolbar.tsx',
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
const relationshipOverlay = read(files.relationshipOverlay);
const relationshipInteraction = read(files.relationshipInteraction);
const relationshipStyleLayer = read(files.relationshipStyleLayer);
const relationshipStyleDrawer = read(files.relationshipStyleDrawer);
const mindMapToolbar = read(files.mindMapToolbar);
const relationshipUi = [
  mindMapView,
  relationshipOverlay,
  relationshipInteraction,
  relationshipStyleLayer,
  relationshipStyleDrawer,
  mindMapToolbar,
].join('\n');
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
    inlineFunction.includes('openRelationshipLabelEdit(relationship.id, relationship.label)') &&
    !inlineFunction.includes('showPrompt') &&
    relationshipInteraction.includes('data-mindmap-note-relationship-label-input'),
);

assert(
  'Line body, label, keyboard deletion, Escape, and Space edit are selectable object interactions',
    relationshipOverlay.includes('data-mindmap-note-relationship-hitbox') &&
    relationshipInteraction.includes('data-mindmap-note-relationship-click-target') &&
    relationshipInteraction.includes('hoveredRelationshipId') &&
    relationshipInteraction.includes('hoverRelationship(path.id)') &&
    relationshipInteraction.includes("data-hovered={hoveredRelationshipId === path.id ? 'true' : 'false'}") &&
    relationshipInteraction.includes('getRelationshipCurveHitSegments') &&
    relationshipInteraction.includes('data-mindmap-note-relationship-curve-click-target') &&
    relationshipUi.includes('startRelationshipLabelEdit') &&
    mindMapView.includes('handleRelationshipHotkey') &&
    mindMapView.includes('isMindMapRelationshipLabelEditKey(event)') &&
    mindMapView.includes('isMindMapDeleteKey(event)') &&
    relationshipInteraction.includes("event.key === 'Escape'"),
);

assert(
  'Creation preview follows cursor with an Xmind-like dashed arrow before endpoint selection',
  mindMapGeometry.includes('export interface MindMapRelationshipDraftPreview') &&
    mindMapGeometry.includes('export const makeRelationshipDraftPreview') &&
    mindMapView.includes('updateRelationshipDraftPreview') &&
    relationshipOverlay.includes('data-mindmap-note-relationship-draft-preview') &&
    relationshipOverlay.includes('data-mindmap-note-relationship-draft-preview-path') &&
    relationshipOverlay.includes('markerEnd="url(#mindmap-note-relationship-draft-arrow)"') &&
    relationshipOverlay.includes('strokeDasharray="6 5"'),
);

assert(
  'Relationship label is rendered directly on the line instead of offset beside it',
  mindMapGeometry.includes('const labelX = (c1X + c2X) / 2;') &&
    relationshipOverlay.includes('textAnchor="middle"'),
);

assert(
  'Selected relationships keep endpoints while omitting redlined Bezier control visuals',
    mindMapView.includes('startRelationshipPointerDrag') &&
    mindMapView.includes("handle: RelationshipPointerDragState['handle']") &&
    mindMapView.includes('const handle = relationshipPointerDrag.handle;') &&
    relationshipInteraction.includes('data-mindmap-note-relationship-endpoint="from"') &&
    relationshipInteraction.includes('data-mindmap-note-relationship-endpoint="to"') &&
    relationshipInteraction.includes('rounded-full border-2 border-sky-500') &&
    !relationshipOverlay.includes('data-mindmap-note-relationship-control-arm=') &&
    !relationshipOverlay.includes('data-mindmap-note-relationship-svg-control-point=') &&
    !relationshipInteraction.includes('data-mindmap-note-relationship-control-point=') &&
    !relationshipInteraction.includes('data-mindmap-note-relationship-screen-control-arm=') &&
    !relationshipInteraction.includes('data-mindmap-note-relationship-screen-control-point='),
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
  relationshipStyleLayer.includes('relationshipColorOptions') &&
    relationshipStyleLayer.includes('relationshipWidthOptions') &&
    relationshipStyleLayer.includes('relationshipDashOptions') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-panel') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-drawer="true"') &&
    relationshipStyleDrawer.includes('right-0 top-[88px]') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-color') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-width') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-dash') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-arrow') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-label-size') &&
    relationshipStyleDrawer.includes('data-mindmap-note-relationship-style-reset'),
);

assert(
  'Toolbar and shortcut start relationship creation while right-click preserves the shared task menu',
  mindMapView.includes("action.type === 'toggle-relationship-tool'") &&
    mindMapView.includes('toggleRelationshipTool()') &&
    mindMapToolbar.includes('onToggleRelationshipTool') &&
    mindMapNode.includes('onContextMenu') &&
    mindMapView.includes("kind: 'task'") &&
    mindMapToolbar.includes('data-source-node-id={relationshipDraftFromId}'),
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
  'Browser verifier covers inline edit, selection, style, endpoint, redline cleanup, reconnect, shortcut, right-click, and zoom',
  browserVerifier.includes('inline relationship editor should open without a prompt') &&
    browserVerifier.includes('draft relationship preview should follow the cursor in the map-local zoom layer before selecting endpoint') &&
    browserVerifier.includes('data-mindmap-note-relationship-draft-coordinate-space') &&
    browserVerifier.includes('hovering the line body should highlight the relationship') &&
    browserVerifier.includes('clicking the line body should select the relationship') &&
    browserVerifier.includes('relationship style panel should be visible') &&
    browserVerifier.includes('relationship style controls should render as a right drawer instead of a floating popover') &&
    browserVerifier.includes('selected relationship should omit redlined control arms, guides, and square points') &&
    browserVerifier.includes('editing a relationship label should not restore redlined control elements') &&
    browserVerifier.includes('dragging endpoint to another task should reconnect the note relationship') &&
    browserVerifier.includes('Ctrl+Shift+R should start note relationship mode') &&
    browserVerifier.includes('right-clicking a task should open the task menu and should not start note relationship mode') &&
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
