import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  mindMapDrag: 'src/components/MindMap/mindMapDrag.ts',
  mindMapGeometry: 'src/components/MindMap/mindMapGeometry.ts',
  mindMapOverlayPaths: 'src/components/MindMap/mindMapOverlayPaths.ts',
  mindMapPan: 'src/components/MindMap/mindMapPan.ts',
  mindMapSelection: 'src/components/MindMap/mindMapSelection.ts',
  mindMapViewport: 'src/components/MindMap/mindMapViewport.ts',
  mindMapZoom: 'src/components/MindMap/mindMapZoom.ts',
  mindMapKeyboard: 'src/components/MindMap/mindMapKeyboard.ts',
  mindMapCanvasShell: 'src/components/MindMap/MindMapCanvasShell.tsx',
  mindMapToolbar: 'src/components/MindMap/MindMapToolbar.tsx',
  mindMapDragPreviewLayer: 'src/components/MindMap/MindMapDragPreviewLayer.tsx',
  mindMapLayoutStyle: 'src/components/MindMap/mindMapLayoutStyle.ts',
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
const mindMapDrag = read(files.mindMapDrag);
const mindMapGeometry = read(files.mindMapGeometry);
const mindMapOverlayPaths = read(files.mindMapOverlayPaths);
const mindMapPan = read(files.mindMapPan);
const mindMapSelection = read(files.mindMapSelection);
const mindMapViewport = read(files.mindMapViewport);
const mindMapZoom = read(files.mindMapZoom);
const mindMapKeyboard = read(files.mindMapKeyboard);
const mindMapCanvasShell = read(files.mindMapCanvasShell);
const mindMapToolbar = read(files.mindMapToolbar);
const mindMapDragPreviewLayer = read(files.mindMapDragPreviewLayer);
const mindMapLayoutStyle = read(files.mindMapLayoutStyle);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);
const devTask = read(files.devTask);
const backlog = read(files.backlog);
const documentationMap = read(files.documentationMap);

assert(
  'New task insertion selects without entering rename input',
  mindMapView.includes('selectNode(node.id)') &&
    !mindMapView.includes('setEditingNodeId(node.id)') &&
    !mindMapView.includes('setEditingTitle(node.title)') &&
    !mindMapView.includes('continuousInsertNodeIds') &&
    !mindMapView.includes('handleEditCreateShortcut') &&
    !mindMapNode.includes('onEditCreateShortcut') &&
    mindMapNode.includes('data-mindmap-node-order'),
);

assert(
  'Keyboard selection and direct typing rename match Xmind-style focus behavior',
  mindMapKeyboard.includes("event.key === 'ArrowUp'") &&
    mindMapKeyboard.includes("event.key === 'ArrowDown'") &&
    mindMapKeyboard.includes("event.key === 'ArrowLeft'") &&
    mindMapKeyboard.includes("event.key === 'ArrowRight'") &&
    mindMapKeyboard.includes("return { type: 'rename-selected', initialTitle: event.key }") &&
    mindMapView.includes('selected?.focus({ preventScroll: true })') &&
    mindMapKeyboard.includes('event.key.length === 1') &&
    mindMapView.includes('getMindMapKeyboardAction(event, {') &&
    mindMapView.includes('startEdit(selectedNodeId, action.initialTitle)'),
);

assert(
  'Deleting a branch preserves Xmind-style nearest-task focus',
  mindMapView.includes("from './mindMapSelection'") &&
    mindMapSelection.includes('export const getNextSelectionAfterDelete') &&
    mindMapSelection.includes('previousSibling?.id || parentCandidate?.id || nextSibling?.id || fallbackRoot?.id || null') &&
    mindMapView.includes('getMindMapArchiveTaskPlan({ selectedNodeId, nodes, parentNodesIndex, boardId, rootNodes, getChildren })') &&
    mindMapView.includes('selectNode(plan.nextSelectionId)') &&
    !mindMapView.includes('setSelectedNodeId(null);\n    setEditingNodeId(null);'),
);

assert(
  'Enter sibling inherits side and inserts after selected',
  mindMapView.includes('getMindMapSiblingTaskCreatePlan({ nodeId, nodes, parentNodesIndex, boardId })') &&
    mindMapView.includes('updateRootSide(created.id, getNodeSide(plan.inheritRootSideFromId))') &&
    mindMapView.includes('createSiblingForNode') &&
    mindMapView.includes('createChildForNode'),
);

assert(
  'Zoom controls and zoom state are exposed',
  mindMapToolbar.includes('data-mindmap-zoom-controls') &&
    mindMapCanvasShell.includes('data-mindmap-zoom-level') &&
    mindMapCanvasShell.includes('data-mindmap-zoom-renderer="css-zoom-layer"') &&
    mindMapCanvasShell.includes('data-mindmap-zoom-quality="zoom-only-no-path-recompute"') &&
    mindMapToolbar.includes('data-mindmap-zoom-in') &&
    mindMapToolbar.includes('data-mindmap-zoom-out') &&
    mindMapToolbar.includes('data-mindmap-zoom-reset') &&
    mindMapToolbar.includes('data-mindmap-zoom-fit') &&
    mindMapView.includes("from './mindMapZoom'") &&
    mindMapView.includes('clampZoom') &&
    mindMapZoom.includes('export const MIN_ZOOM = 0.25') &&
    mindMapZoom.includes('export const MAX_ZOOM = 4') &&
    mindMapZoom.includes('export const ZOOM_PRECISION = 3') &&
    mindMapZoom.includes('export const ZOOM_BUTTON_STEP = 0.05') &&
    mindMapZoom.includes('export const ZOOM_WHEEL_STEP = 0.03') &&
    mindMapView.includes('formatZoomLevel') &&
    mindMapView.includes('suppressZoomScrollRecomputeRef') &&
    mindMapView.includes('connectorRecomputeCountRef') &&
    mindMapView.includes('data-mindmap-recompute-count') &&
    mindMapView.includes('getLocalRect') &&
    mindMapView.includes('ZOOM_PREVIEW_COMMIT_DELAY_MS') &&
    mindMapView.includes('getWheelZoomDelta') &&
    mindMapView.includes('handleWheelZoom') &&
    mindMapView.includes("from './mindMapViewport'") &&
    mindMapView.includes('getMindMapContentBounds') &&
    mindMapView.includes('centerMindMapContent') &&
    mindMapViewport.includes("surface.setAttribute('data-mindmap-content-centered', reason)") &&
    mindMapViewport.includes("surface.setAttribute('data-mindmap-visible-bounds-width', bounds.width.toFixed(2))") &&
    mindMapViewport.includes('export const getFitZoomForBounds') &&
    mindMapView.includes('zoomPreviewLevelRef') &&
    mindMapCanvasShell.includes('data-mindmap-zoom-interaction="preview-then-vector-commit"') &&
    mindMapView.includes('data-mindmap-zoom-preview-active') &&
    mindMapView.includes('data-mindmap-zoom-preview-transform') &&
    mindMapView.includes('zoomLevelText={formatZoomLevel(zoomLevel)}') &&
    mindMapView.includes("setAttribute('data-mindmap-zoom-preview-level', formatZoomLevel(previewZoom))") &&
    mindMapLayoutStyle.includes("'--mindmap-zoom': zoomLevel") &&
    mindMapLayoutStyle.includes('zoom: zoomLevel') &&
    mindMapLayoutStyle.includes("'--mindmap-node-font-size'") &&
    mindMapCanvasShell.includes('gap-[var(--mindmap-root-gap)]') &&
    mindMapNode.includes('text-[length:var(--mindmap-node-font-size)]') &&
    mindMapNode.includes('gap-[var(--mindmap-children-gap)]') &&
    !mindMapView.includes("'--mindmap-node-font-size': `${14 * zoomLevel}px`") &&
    !mindMapView.includes('strokeWidth={2 * zoomLevel}') &&
    !mindMapView.includes('transform: `scale(${zoomLevel})`'),
);

assert(
  'Middle mouse canvas panning and Xmind-like edge scroll padding are exposed',
  mindMapView.includes("from './mindMapPan'") &&
    mindMapView.includes('startMiddleMousePan') &&
    mindMapView.includes('requestAnimationFrame(tick)') &&
    mindMapView.includes('createMiddleMousePanState(event.clientX, event.clientY)') &&
    mindMapView.includes('updateMiddleMousePanPointer(pan, event.clientX, event.clientY)') &&
    mindMapView.includes('applyMiddleMousePanFrame(surface, pan)') &&
    mindMapPan.includes('export interface MiddleMousePanState') &&
    mindMapPan.includes('currentX') &&
    mindMapPan.includes('currentY') &&
    mindMapPan.includes('data-mindmap-middle-pan-mode') &&
    mindMapPan.includes('data-mindmap-middle-pan-speed-x') &&
    mindMapPan.includes('MIDDLE_MOUSE_PAN_DEAD_ZONE') &&
    mindMapPan.includes('MIDDLE_MOUSE_PAN_ACCELERATION') &&
    mindMapCanvasShell.includes('data-mindmap-middle-pan="true"') &&
    mindMapPan.includes('data-mindmap-middle-pan-active') &&
    mindMapCanvasShell.includes('data-mindmap-pan-padding="xmind-edge"') &&
    mindMapCanvasShell.includes('min-w-[260vw]') &&
    mindMapCanvasShell.includes('px-[55vw]'),
);

assert(
  'Parent-child connectors use tidy bracket topology',
    mindMapGeometry.includes("variant: 'curve' | 'bracket'") &&
    mindMapGeometry.includes("variant === 'bracket'") &&
    mindMapGeometry.includes(' H ${trunkX.toFixed(2)} V ${toY.toFixed(2)} H ') &&
    mindMapOverlayPaths.includes("makeConnectorPath(getLocalRect(parentElement, surface), getLocalRect(element, surface), direction, 'bracket')") &&
    mindMapNode.includes('data-mindmap-children-group'),
);

assert(
  'Drag insertion preview has explicit placeholder and fidelity metadata',
  mindMapDragPreviewLayer.includes('data-mindmap-insertion-preview') &&
    mindMapView.includes("from './mindMapDrag'") &&
    mindMapDrag.includes('export const createInsertionPreview') &&
    mindMapDrag.includes('export const getDropModeFromPointer') &&
    mindMapDrag.includes('export const createPreviewConnectorPath') &&
    mindMapDrag.includes('export const createScreenDragConnectorPath') &&
    mindMapView.includes('insertionPreview') &&
    mindMapDragPreviewLayer.includes('data-sibling-before-id') &&
    mindMapDragPreviewLayer.includes('data-sibling-after-id') &&
    mindMapDragPreviewLayer.includes('data-target-parent-id'),
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
    browserVerifier.includes('mind map should be visible and centered immediately after entering the mode') &&
    browserVerifier.includes('zoom level should change after zoom-in') &&
    browserVerifier.includes('zoom button should only scale the viewport and must not recompute connector or relationship paths') &&
    browserVerifier.includes('zoom/pan validation fixture should include tasks, date badges, tree connectors, selected relationship line, relationship label, endpoints, and control points') &&
    browserVerifier.includes('button zoom evidence should still include date badges plus selected relationship label, endpoints, and control points') &&
    browserVerifier.includes('zoom button changes should keep the mind map visible instead of jumping to blank space') &&
    browserVerifier.includes('fit-to-content should zoom and scroll to visible mind map content, not a blank padded canvas') &&
    browserVerifier.includes('wheel zoom should use transient preview transform during continuous zoom') &&
    browserVerifier.includes('wheel zoom should commit back to zoom layer after idle') &&
    browserVerifier.includes('wheel zoom committed state should remain one zoom layer without path recompute') &&
    browserVerifier.includes('wheel zoom evidence should still include date badges plus selected relationship label, endpoints, and control points') &&
    browserVerifier.includes('middle-mouse pan evidence should still include date badges plus selected relationship label, endpoints, and control points') &&
    browserVerifier.includes('middle-mouse pan should only scroll the viewport and must not rewrite or recompute the selected relationship path') &&
    browserVerifier.includes('middle mouse offset should continuously pan faster as the cursor moves farther from the press point') &&
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
