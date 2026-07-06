import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const files = {
  view: 'src/components/MindMap/MindMapView.tsx',
  drag: 'src/components/MindMap/mindMapDrag.ts',
  dropCommands: 'src/components/MindMap/mindMapDropCommands.ts',
  domGeometry: 'src/components/MindMap/mindMapDomGeometry.ts',
  domSelectors: 'src/components/MindMap/mindMapDomSelectors.ts',
  geometry: 'src/components/MindMap/mindMapGeometry.ts',
  relationshipCommands: 'src/components/MindMap/mindMapRelationshipCommands.ts',
  relationshipStorage: 'src/components/MindMap/mindMapRelationshipStorage.ts',
  overlayPaths: 'src/components/MindMap/mindMapOverlayPaths.ts',
  connectorOverlay: 'src/components/MindMap/MindMapConnectorOverlay.tsx',
  relationshipOverlay: 'src/components/MindMap/MindMapRelationshipOverlay.tsx',
  relationshipInteractionLayer: 'src/components/MindMap/MindMapRelationshipInteractionLayer.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  relationshipStyleLayer: 'src/components/MindMap/MindMapRelationshipStyleLayer.tsx',
  relationshipStyleDrawer: 'src/components/MindMap/MindMapRelationshipStyleDrawer.tsx',
  emptyState: 'src/components/MindMap/MindMapEmptyState.tsx',
  rootLayout: 'src/components/MindMap/MindMapRootLayout.tsx',
  toolbar: 'src/components/MindMap/MindMapToolbar.tsx',
  dragPreviewLayer: 'src/components/MindMap/MindMapDragPreviewLayer.tsx',
  dragPreviewBadge: 'src/components/MindMap/MindMapDragPreviewBadge.tsx',
  expansion: 'src/components/MindMap/mindMapExpansion.ts',
  selection: 'src/components/MindMap/mindMapSelection.ts',
  zoom: 'src/components/MindMap/mindMapZoom.ts',
  pan: 'src/components/MindMap/mindMapPan.ts',
  keyboard: 'src/components/MindMap/mindMapKeyboard.ts',
  messages: 'src/components/MindMap/mindMapMessages.ts',
  tree: 'src/components/MindMap/mindMapTree.ts',
  taskCommands: 'src/components/MindMap/mindMapTaskCommands.ts',
  frameScheduler: 'src/components/MindMap/mindMapFrameScheduler.ts',
  sideStorage: 'src/components/MindMap/mindMapSideStorage.ts',
  viewport: 'src/components/MindMap/mindMapViewport.ts',
  relationshipBrowser: 'scripts/verify-dev-027e-xmind-note-relationship-line-ux-parity-browser.pw.js',
  systemHealthBrowser: 'scripts/verify-dev-027g-mindmap-system-health-browser.pw.js',
  bundleHealth: 'scripts/verify-dev-027g-mindmap-bundle-health.mjs',
  packageJson: 'package.json',
  canvasShell: 'src/components/MindMap/MindMapCanvasShell.tsx',
  layoutStyle: 'src/components/MindMap/mindMapLayoutStyle.ts',
  firestoreSync: 'src/hooks/useFirestoreSync.ts',
  viteConfig: 'vite.config.js',
  app: 'src/App.tsx',
};

const results = [];
const check = (name, ok, details = undefined) => {
  results.push({ name, ok: Boolean(ok), ...(details === undefined ? {} : { details }) });
};
const countMatches = (content, token) => content.split(token).length - 1;

for (const [name, file] of Object.entries(files)) {
  check(`file exists:${name}`, fs.existsSync(path.join(root, file)), file);
}

const view = read(files.view);
const drag = read(files.drag);
const dropCommands = read(files.dropCommands);
const domGeometry = read(files.domGeometry);
const domSelectors = read(files.domSelectors);
const geometry = read(files.geometry);
const relationshipCommands = read(files.relationshipCommands);
const relationshipStorage = read(files.relationshipStorage);
const overlayPaths = read(files.overlayPaths);
const connectorOverlay = read(files.connectorOverlay);
const relationshipOverlay = read(files.relationshipOverlay);
const relationshipInteractionLayer = read(files.relationshipInteractionLayer);
const mindMapNode = read(files.mindMapNode);
const relationshipStyleLayer = read(files.relationshipStyleLayer);
const relationshipStyleDrawer = read(files.relationshipStyleDrawer);
const emptyState = read(files.emptyState);
const rootLayout = read(files.rootLayout);
const toolbar = read(files.toolbar);
const dragPreviewLayer = read(files.dragPreviewLayer);
const dragPreviewBadge = read(files.dragPreviewBadge);
const expansion = read(files.expansion);
const selection = read(files.selection);
const zoom = read(files.zoom);
const pan = read(files.pan);
const keyboard = read(files.keyboard);
const messages = read(files.messages);
const tree = read(files.tree);
const taskCommands = read(files.taskCommands);
const frameScheduler = read(files.frameScheduler);
const sideStorage = read(files.sideStorage);
const viewport = read(files.viewport);
const relationshipBrowser = read(files.relationshipBrowser);
const systemHealthBrowser = read(files.systemHealthBrowser);
const bundleHealth = read(files.bundleHealth);
const packageJson = JSON.parse(read(files.packageJson));
const canvasShell = read(files.canvasShell);
const layoutStyle = read(files.layoutStyle);
const firestoreSync = read(files.firestoreSync);
const viteConfig = read(files.viteConfig);
const app = read(files.app);

const forbiddenViewDefinitions = [
  'const makeConnectorPath =',
  'const makeRelationshipPath =',
  'const createLocalConnectorPath =',
  'const getRelationshipCurveHitSegments =',
  'const isReasonableRelationshipControlPoint =',
  'const isFinitePoint =',
  'const getCubicPoint =',
  'const getRelationshipStorageKey =',
  'const loadNoteRelationships =',
  'const saveNoteRelationships =',
  'const MIN_ZOOM =',
  'const MAX_ZOOM =',
  'const clampZoom =',
  'const formatZoomLevel =',
  'const getWheelZoomDelta =',
  'const getLocalLineSegmentStyle =',
  'const getMiddleMousePanVelocity =',
  'const applyMiddleMousePanFrame =',
  'const MIDDLE_MOUSE_PAN_DEAD_ZONE =',
  'const isTextEditingTarget =',
  'const sortTasks =',
  'const getSiblingNodes =',
  'const getInsertOrder =',
  'const splitRootNodes =',
  'const matchesMindMapFilters =',
  'const getSideStorageKey =',
  'const loadSideOverrides =',
  'const saveSideOverrides =',
  'const getFitZoomForBounds =',
  'const getDropModeFromPointer =',
  'const createPreviewConnectorPath =',
  'const createInsertionPreview =',
  'const createScreenDragConnectorPath =',
  'const createNodeId =',
  'const collectDescendants =',
  'const previousSibling =',
  'const nextSibling =',
  'const updateRelationshipStyleById =',
  'const resetRelationshipStyleById =',
  'const updateRelationshipControlPointById =',
  'const updateRelationshipEndpointAnchorById =',
  'const retargetRelationshipEndpointById =',
];

check(
  'MindMapView imports the extracted geometry contract module',
  view.includes("from './mindMapGeometry'") &&
    [
      'makeRelationshipDraftPreview',
    ].every(token => view.includes(token)),
);

check(
  'MindMapView no longer owns connector, relationship path, cubic, or stale-control geometry builders',
  forbiddenViewDefinitions.every(token => !view.includes(token)),
  forbiddenViewDefinitions.filter(token => view.includes(token)),
);

check(
  'Mind map helper modules keep implementation-only types and helpers private instead of expanding the import surface',
  [
    'export interface MindMapOverlayRootNode',
    'export interface MindMapOverlayPathBuildInput',
    'export interface MindMapOverlayPathBuildResult',
  ].every(token => !overlayPaths.includes(token)) &&
    !taskCommands.includes('export interface CreateMindMapTaskNodeOptions') &&
    !relationshipCommands.includes('export const createRelationshipId') &&
    !relationshipCommands.includes('export type MindMapRelationshipEndpointHandle') &&
    !relationshipCommands.includes('export type MindMapRelationshipControlHandle') &&
    !tree.includes('export const getParentKey') &&
    !tree.includes('export const sortTasks') &&
    !tree.includes('export const matchesMindMapFilters') &&
    !tree.includes('export type PositionedTaskNode') &&
    !zoom.includes('export interface MindMapZoomRect') &&
    !drag.includes('export interface MindMapDragPointer') &&
    !drag.includes('export interface MindMapInsertionPreviewRect') &&
    !drag.includes('export interface MindMapDragPreviewGeometry') &&
    !pan.includes('export interface MiddleMousePanVelocity') &&
    !pan.includes('export const MIDDLE_MOUSE_PAN_DEAD_ZONE') &&
    !pan.includes('export const MIDDLE_MOUSE_PAN_MAX_SPEED') &&
    !pan.includes('export const MIDDLE_MOUSE_PAN_ACCELERATION') &&
    !relationshipStorage.includes('export const getRelationshipStorageKey') &&
    !sideStorage.includes('export const getSideStorageKey') &&
    !dropCommands.includes('export type MindMapNodeDropBlockedReason') &&
    !dropCommands.includes('export interface MindMapDropMoveUpdate') &&
    !dropCommands.includes('export type MindMapNodeDropResult') &&
    !keyboard.includes('export type MindMapKeyboardAction') &&
    !taskCommands.includes('export interface MindMapTaskCreatePlan') &&
    !taskCommands.includes('export interface MindMapArchiveTaskPlan') &&
    !geometry.includes('export const defaultRelationshipStyle') &&
    !geometry.includes('export const mergeRelationshipStyle') &&
    !geometry.includes('export const isFinitePoint') &&
    !geometry.includes('export const isReasonableRelationshipControlPoint') &&
    !geometry.includes('export const getCubicPoint') &&
    [
      'interface MindMapOverlayRootNode',
      'interface MindMapOverlayPathBuildInput',
      'interface MindMapOverlayPathBuildResult',
      'interface CreateMindMapTaskNodeOptions',
      'const createRelationshipId =',
      "type MindMapRelationshipEndpointHandle = 'from' | 'to';",
      "type MindMapRelationshipControlHandle = 'control-1' | 'control-2';",
      'const getParentKey = (parentId: string | null) => parentId ||',
      'const sortTasks =',
      'const matchesMindMapFilters =',
      'type PositionedTaskNode = TaskNode & { mindMapSide?: MindMapDirection };',
      'interface MindMapZoomRect',
      'interface MindMapDragPointer',
      'interface MindMapInsertionPreviewRect',
      'interface MindMapDragPreviewGeometry',
      'interface MiddleMousePanVelocity',
      'const MIDDLE_MOUSE_PAN_DEAD_ZONE = 8;',
      'const getRelationshipStorageKey =',
      'const getSideStorageKey =',
      "type MindMapNodeDropBlockedReason = 'child-cycle' | 'hierarchy-cycle';",
      'interface MindMapDropMoveUpdate',
      'type MindMapNodeDropResult =',
      'type MindMapKeyboardAction =',
      'interface MindMapTaskCreatePlan',
      'interface MindMapArchiveTaskPlan',
      'const defaultRelationshipStyle: Required<MindMapRelationshipStyle> =',
      'const mergeRelationshipStyle = (style?: MindMapRelationshipStyle): Required<MindMapRelationshipStyle> =>',
      'const isFinitePoint = (point?: MindMapRelationshipPoint): point is MindMapRelationshipPoint =>',
      'const isReasonableRelationshipControlPoint =',
      'const getCubicPoint =',
    ].every(token =>
      overlayPaths.includes(token) ||
      taskCommands.includes(token) ||
      dropCommands.includes(token) ||
      keyboard.includes(token) ||
      relationshipCommands.includes(token) ||
      tree.includes(token) ||
      zoom.includes(token) ||
      drag.includes(token) ||
      pan.includes(token) ||
      relationshipStorage.includes(token) ||
      sideStorage.includes(token) ||
      geometry.includes(token),
    ),
);

check(
  'Geometry module owns relationship schema, path builders, stale-control guard, and draft preview builder',
  [
    'export interface MindMapNoteRelationship',
    'export interface MindMapRelationshipGeometry',
    'const isReasonableRelationshipControlPoint',
    'export const makeConnectorPath',
    'export const makeRelationshipPath',
    'export const makeRelationshipDraftPreview',
    'export const createLocalConnectorPath',
  ].every(token => geometry.includes(token)),
);

check(
  'Relationship path builder keeps legacy screen-space control points from rendering as exploded curves',
  geometry.includes('endpointDistance * 1.4 + 120') &&
    geometry.includes('canUseStoredControls') &&
    geometry.includes('isReasonableRelationshipControlPoint(controlOne') &&
    geometry.includes('isReasonableRelationshipControlPoint(controlTwo'),
);

check(
  'Relationship persistence and dangling-node cleanup are isolated from the view component',
  view.includes("from './mindMapRelationshipStorage'") &&
    relationshipStorage.includes('const getRelationshipStorageKey') &&
    !relationshipStorage.includes('export const getRelationshipStorageKey') &&
    relationshipStorage.includes('export const loadNoteRelationships') &&
    relationshipStorage.includes('export const saveNoteRelationships') &&
    relationshipStorage.includes('export const sanitizeNoteRelationshipsForBoard') &&
    relationshipStorage.includes('validNodeIds.has(relationship.fromId)') &&
    relationshipStorage.includes('validNodeIds.has(relationship.toId)'),
);

check(
  'Connector and relationship overlay path construction is isolated from the view component',
  view.includes("from './mindMapOverlayPaths'") &&
    view.includes('buildMindMapOverlayPaths({') &&
    view.includes('setConnectorPaths(overlayPaths.connectorPaths)') &&
    view.includes('setRelationshipPaths(overlayPaths.relationshipPaths)') &&
    [
      'export const buildMindMapOverlayPaths',
      "from './mindMapDomSelectors'",
      'surface.querySelector(MINDMAP_CENTER_SELECTOR)',
      'querySelectorAll<HTMLElement>(MINDMAP_NODE_SELECTOR)',
      'getMindMapNodeId(element)',
      'element.getAttribute(MINDMAP_PARENT_ATTRIBUTE)',
      'element.getAttribute(MINDMAP_NODE_LEVEL_ATTRIBUTE)',
      'getVisibleNodeById',
      'makeConnectorPath(centerRect',
      "makeConnectorPath(getLocalRect(parentElement, surface), getLocalRect(element, surface), direction, 'bracket')",
      'makeRelationshipPath(relationship, getLocalRect(fromElement, surface), getLocalRect(toElement, surface))',
      'hasCenter: false',
      'hasCenter: true',
    ].every(token => overlayPaths.includes(token)) &&
    !view.includes('const nextPaths: MindMapConnectorPath[]') &&
    !view.includes('const nextRelationshipPaths: MindMapRelationshipPath[]') &&
    !view.includes('const visibleNodeById = new Map') &&
    !view.includes('makeRelationshipPath(relationship, getLocalRect') &&
    !overlayPaths.includes("querySelectorAll<HTMLElement>('[data-mindmap-node]')") &&
    !overlayPaths.includes("surface.querySelector('[data-mindmap-center]')"),
);

check(
  'Relationship mutations schedule connector recompute through a single coalesced frame helper',
  view.includes('const scheduleConnectorRecompute = React.useCallback(() => {') &&
    view.includes('const connectorRecomputeFrameRef = React.useRef<number | null>(null);') &&
    view.includes("from './mindMapFrameScheduler'") &&
    view.includes('scheduleCoalescedAnimationFrame(connectorRecomputeFrameRef, recomputeConnectors);') &&
    view.includes('cancelPendingAnimationFrameRef(connectorRecomputeFrameRef);') &&
    frameScheduler.includes('export const scheduleCoalescedAnimationFrame =') &&
    frameScheduler.includes('if (frameRef.current !== null) return;') &&
    frameScheduler.includes('frameRef.current = window.requestAnimationFrame(() => {') &&
    frameScheduler.includes('frameRef.current = null;') &&
    frameScheduler.includes('callback();') &&
    !view.includes('connectorRecomputeFrameRef.current = window.requestAnimationFrame(() => {') &&
    !view.includes('window.cancelAnimationFrame(connectorRecomputeFrameRef.current);') &&
    countMatches(view, 'scheduleConnectorRecompute();') === 2 &&
    countMatches(view, 'window.requestAnimationFrame(recomputeConnectors)') === 2 &&
    [
      '}, [clearRelationshipLabelEdit, editingRelationshipId, editingRelationshipLabel, scheduleConnectorRecompute])',
      '}, [boardId, canEditTask, clearRelationshipDraftPreview, nodes, noteRelationships, openRelationshipLabelEdit, scheduleConnectorRecompute, startRelationshipLabelEdit])',
    ].every(token => view.includes(token)),
);

check(
  'Timer and animation-frame cleanup helpers are centralized while local frame loops stay explicit',
  frameScheduler.includes('export const clearPendingTimeoutRef =') &&
    frameScheduler.includes('window.clearTimeout(timerRef.current);') &&
    frameScheduler.includes('timerRef.current = null;') &&
    frameScheduler.includes('export const cancelPendingAnimationFrameRef =') &&
    frameScheduler.includes('window.cancelAnimationFrame(frameRef.current);') &&
    frameScheduler.includes('frameRef.current = null;') &&
    view.includes('clearPendingTimeoutRef(zoomPreviewCommitTimerRef);') &&
    view.includes('clearPendingTimeoutRef(zoomSuppressReleaseTimerRef);') &&
    view.includes('scheduleCoalescedAnimationFrame(zoomPreviewFrameRef, () => {') &&
    view.includes('cancelPendingAnimationFrameRef(zoomPreviewFrameRef);') &&
    view.includes('cancelPendingAnimationFrameRef(middleMousePanFrameRef);') &&
    view.includes('cancelPendingAnimationFrameRef(connectorRecomputeFrameRef);') &&
    !view.includes('window.clearTimeout(zoomPreviewCommitTimerRef.current);') &&
    !view.includes('window.clearTimeout(zoomSuppressReleaseTimerRef.current);') &&
    !view.includes('zoomPreviewFrameRef.current = window.requestAnimationFrame(() => {') &&
    !view.includes('window.cancelAnimationFrame(zoomPreviewFrameRef.current);') &&
    !view.includes('window.cancelAnimationFrame(middleMousePanFrameRef.current);') &&
    !view.includes('window.cancelAnimationFrame(connectorRecomputeFrameRef.current);'),
);

check(
  'Selected relationship cleanup is centralized for delete and invalidation flows',
  view.includes('const clearRelationshipLabelEdit = React.useCallback(() => {') &&
  view.includes('const clearSelectedRelationship = React.useCallback(() => {') &&
  view.includes('setSelectedRelationshipId(null);') &&
    view.includes('clearRelationshipLabelEdit();') &&
  view.includes('const removeRelationshipAndClearSelection = React.useCallback((relationshipId: string) => {') &&
    view.includes('setNoteRelationships(prev => removeRelationshipById(prev, relationshipId));') &&
    countMatches(view, 'clearSelectedRelationship();') >= 4 &&
    countMatches(view, 'removeRelationshipAndClearSelection(') === 3 &&
    !view.includes('removeRelationshipById(prev, selectedRelationshipId)') &&
    [
      '}, [clearSelectedRelationship, noteRelationships, selectedRelationshipId])',
      '}, [clearSelectedRelationship])',
      '}, [removeRelationshipAndClearSelection, selectedRelationshipId])',
      '}, [removeRelationshipAndClearSelection, startRelationshipLabelEdit])',
      '}, [clearRelationshipLabelEdit])',
    ].every(token => view.includes(token)) &&
    [
      '}, [beginRelationshipDraftSelection, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectedNodeId])',
      '}, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectedNodeId])',
    ].some(token => view.includes(token)) &&
    [
      '}, [removeRelationshipAndClearSelection, selectedRelationshipId, startRelationshipLabelEdit])',
      '}, [clearSelectedRelationship, removeRelationshipAndClearSelection, selectedRelationshipId, startRelationshipLabelEdit])',
    ].some(token => view.includes(token)),
);

check(
  'Relationship label edit opening is centralized for existing and newly-created relationships',
  view.includes('const openRelationshipLabelEdit = React.useCallback((relationshipId: string, label: string) => {') &&
    view.includes('setEditingRelationshipId(relationshipId);') &&
    view.includes('setEditingRelationshipLabel(getMindMapRelationshipLabelDraft(label));') &&
    countMatches(view, 'openRelationshipLabelEdit(') === 2 &&
    view.includes('openRelationshipLabelEdit(relationshipId, relationship.label);') &&
    view.includes('openRelationshipLabelEdit(relationship.id, relationship.label);') &&
    !view.includes('setEditingRelationshipLabel(relationship.label);') &&
    !view.includes('setEditingRelationshipLabel(getMindMapRelationshipLabelDraft(relationship.label));') &&
    [
      '}, [canEditTask, noteRelationships, openRelationshipLabelEdit])',
      '}, [boardId, canEditTask, clearRelationshipDraftPreview, nodes, noteRelationships, openRelationshipLabelEdit, scheduleConnectorRecompute, startRelationshipLabelEdit])',
    ].every(token => view.includes(token)),
);

check(
  'Relationship label edit cleanup is centralized for commit, cancel, surface, pointer, and node-start flows',
  view.includes('const clearRelationshipLabelEdit = React.useCallback(() => {') &&
    countMatches(view, 'setEditingRelationshipId(null);') === 1 &&
    view.includes("setEditingRelationshipLabel('');") &&
    countMatches(view, 'clearRelationshipLabelEdit();') >= 5 &&
    view.includes('cancelRelationshipLabelEdit={clearRelationshipLabelEdit}') &&
    !view.includes('const cancelRelationshipLabelEdit = React.useCallback') &&
    [
      '}, [clearRelationshipLabelEdit])',
      '}, [clearRelationshipLabelEdit, editingRelationshipId, editingRelationshipLabel, scheduleConnectorRecompute])',
      '}, [clearRelationshipDraft, clearRelationshipLabelEdit, selectNode])',
      '}, [canEditTask, clearRelationshipLabelEdit, selectRelationship])',
      '}, [beginRelationshipDraftSelection, canEditTask, clearRelationshipHover, clearRelationshipLabelEdit])',
      '}, [canEditTask, clearRelationshipLabelEdit, nodes, selectNode])',
    ].every(token => view.includes(token)),
);

check(
  'Relationship label draft updates keep a semantic child prop without a parent pass-through wrapper',
  !view.includes('const updateRelationshipLabelDraft = React.useCallback((label: string) => {') &&
    view.includes('updateRelationshipLabelDraft={setEditingRelationshipLabel}') &&
    countMatches(view, 'setEditingRelationshipLabel') === 4 &&
    [
      'updateRelationshipLabelDraft: (label: string) => void;',
      'updateRelationshipLabelDraft,',
      'onChange={(event) => updateRelationshipLabelDraft(event.target.value)}',
      'commitRelationshipLabelEdit',
      'cancelRelationshipLabelEdit',
    ].every(token => relationshipInteractionLayer.includes(token)) &&
    !relationshipInteractionLayer.includes('setEditingRelationshipLabel') &&
    !relationshipInteractionLayer.includes('React.Dispatch<React.SetStateAction<string>>'),
);

check(
  'Relationship draft and preview cleanup are centralized while preserving preview-only invalidation paths',
    view.includes('const clearRelationshipDraftPreview = React.useCallback(() => {') &&
    view.includes('const clearRelationshipDraft = React.useCallback(() => {') &&
    view.includes('const startRelationshipDraftFromNode = React.useCallback((nodeId: string) => {') &&
    view.includes('const beginRelationshipDraftSelection = React.useCallback((nodeId: string) => {') &&
    view.includes('startRelationshipDraftFromNode(nodeId);') &&
    view.includes('selectNode(nodeId);') &&
    countMatches(view, 'setRelationshipDraftPreview(null);') === 1 &&
    countMatches(view, 'clearRelationshipDraftPreview();') === 6 &&
    countMatches(view, 'setRelationshipDraft(null);') === 1 &&
    countMatches(view, 'setRelationshipDraft({ fromId:') === 1 &&
    countMatches(view, 'clearRelationshipDraft();') === 3 &&
    countMatches(view, 'startRelationshipDraftFromNode(') === 1 &&
    countMatches(view, 'beginRelationshipDraftSelection(') >= 2 &&
    view.includes('const beginRelationshipDraftSelectionWithCleanup = React.useCallback((nodeId: string) => {') &&
    [
      '}, [clearRelationshipDraftPreview])',
      '}, [selectNode, startRelationshipDraftFromNode])',
      '}, [boardId, canEditTask, clearRelationshipDraftPreview, nodes, noteRelationships, openRelationshipLabelEdit, scheduleConnectorRecompute, startRelationshipLabelEdit])',
      '}, [clearRelationshipDraftPreview, getLocalRect, relationshipDraft])',
      '}, [clearRelationshipDraftPreview, relationshipDraft, relationshipToolActive, updateRelationshipDraftPreview])',
      '}, [beginRelationshipDraftSelection, createNoteRelationshipInline, finishRelationshipDraftMode, relationshipDraft, relationshipToolActive, selectNode])',
      '}, [clearRelationshipHover, clearRelationshipPointerDrag, clearSelectedRelationship, finishRelationshipDraftMode])',
    ].every(token => view.includes(token)) &&
    [
      '}, [beginRelationshipDraftSelection, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectedNodeId])',
      '}, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectedNodeId])',
    ].some(token => view.includes(token)),
);

check(
  'Relationship draft mode finish and full deactivation are centralized without clearing new-relationship label edit state',
  view.includes('const finishRelationshipDraftMode = React.useCallback(() => {') &&
    view.includes('const deactivateRelationshipMode = React.useCallback((options?: { clearPointerDrag?: boolean }) => {') &&
    countMatches(view, 'setRelationshipToolActive(false);') === 1 &&
    countMatches(view, 'finishRelationshipDraftMode();') === 2 &&
    view.includes('clearRelationshipDraft();') &&
    view.includes('clearRelationshipHover();') &&
    view.includes('if (options?.clearPointerDrag) {') &&
    view.includes('clearRelationshipPointerDrag();') &&
    countMatches(view, 'deactivateRelationshipMode(') === 2 &&
    view.includes('deactivateRelationshipMode({ clearPointerDrag: true });') &&
    view.includes('deactivateRelationshipMode();') &&
    [
      '}, [clearRelationshipDraft])',
      '}, [clearRelationshipHover, clearRelationshipPointerDrag, clearSelectedRelationship, finishRelationshipDraftMode])',
      '}, [boardId, deactivateRelationshipMode])',
    ].every(token => view.includes(token)),
);

check(
  'Relationship hover state is encapsulated behind semantic callbacks instead of leaking the parent setter to child layers',
  view.includes('const hoverRelationship = React.useCallback((relationshipId: string) => {') &&
    view.includes('const clearRelationshipHover = React.useCallback((relationshipId?: string) => {') &&
    view.includes('setHoveredRelationshipId(prev => relationshipId && prev !== relationshipId ? prev : null);') &&
    view.includes('hoverRelationship={hoverRelationship}') &&
    view.includes('clearRelationshipHover={clearRelationshipHover}') &&
    countMatches(view, 'setHoveredRelationshipId') === 3 &&
    countMatches(view, 'hoverRelationship={hoverRelationship}') === 2 &&
    countMatches(view, 'clearRelationshipHover={clearRelationshipHover}') === 2 &&
    [
      'hoverRelationship: (relationshipId: string) => void;',
      'clearRelationshipHover: (relationshipId?: string) => void;',
      'onPointerEnter={() => hoverRelationship(path.id)}',
      'onPointerLeave={() => clearRelationshipHover(path.id)}',
    ].every(token => relationshipOverlay.includes(token)) &&
    [
      'hoverRelationship: (relationshipId: string) => void;',
      'clearRelationshipHover: (relationshipId?: string) => void;',
      'onPointerEnter={() => hoverRelationship(path.id)}',
      'onPointerLeave={() => clearRelationshipHover(path.id)}',
    ].every(token => relationshipInteractionLayer.includes(token)) &&
    !relationshipOverlay.includes('setHoveredRelationshipId') &&
    !relationshipInteractionLayer.includes('setHoveredRelationshipId'),
);

check(
  'Relationship pointer drag cleanup is centralized for board reset and pointerup',
  view.includes('const clearRelationshipPointerDrag = React.useCallback(() => {') &&
    countMatches(view, 'setRelationshipPointerDrag(null);') === 1 &&
    countMatches(view, 'clearRelationshipPointerDrag();') === 2 &&
    view.includes('setRelationshipPointerDrag({ relationshipId, handle });') &&
    view.includes('}, [clearRelationshipPointerDrag, relationshipPointerDrag])') &&
    !view.includes('const getMapPointFromClient = React.useCallback') &&
    !view.includes('const getNodeElementAtPoint = React.useCallback') &&
    !view.includes('const getAnchorForElement = React.useCallback'),
);

check(
  'Relationship selection is centralized in the parent and delegated to relationship layers',
    view.includes('const selectRelationship = React.useCallback((relationshipId: string) => {') &&
    view.includes('setSelectedRelationshipId(relationshipId);') &&
    view.includes('setSelectedNodeId(null);') &&
    countMatches(view, 'selectRelationship(') === 2 &&
    countMatches(view, 'selectRelationship={selectRelationship}') === 2 &&
    [
      'selectRelationship: (relationshipId: string) => void;',
      'selectRelationship(path.id);',
    ].every(token => relationshipOverlay.includes(token)) &&
    [
      'selectRelationship: (relationshipId: string) => void;',
      'const selectRelationshipFromEvent = (event: React.SyntheticEvent, path: MindMapRelationshipPath) => {',
      'selectRelationship(path.id);',
    ].every(token => relationshipInteractionLayer.includes(token)) &&
    !relationshipOverlay.includes('setSelectedRelationshipId') &&
    !relationshipOverlay.includes('setSelectedNodeId') &&
    !relationshipInteractionLayer.includes('setSelectedRelationshipId') &&
    !relationshipInteractionLayer.includes('setSelectedNodeId'),
);

check(
  'Node selection clears relationship selection through a single parent helper',
  view.includes('const selectNode = React.useCallback((nodeId: string | null) => {') &&
    view.includes('setSelectedNodeId(nodeId);') &&
    view.includes('setSelectedRelationshipId(null);') &&
    countMatches(view, 'setSelectedNodeId(') === 2 &&
    countMatches(view, 'selectNode(') >= 11 &&
    countMatches(view, 'selectNode(nodeId);') >= 4 &&
    view.includes('selectNode(rootNodes[0]?.id ?? null);') &&
    view.includes('selectNode(nextSelectionId);') &&
    view.includes('selectNode(null);') &&
    view.includes('selectNode(parentSelectionId);') &&
    view.includes('selectNode(firstChildId);') &&
    [
      '}, [beginRelationshipDraftSelection, createNoteRelationshipInline, finishRelationshipDraftMode, relationshipDraft, relationshipToolActive, selectNode])',
      '}, [activeWorkspaceId, addNode, boardId, canCreateTask, expandNodes, selectNode])',
      '}, [boardId, canDeleteTask, clearNodeEdit, getChildren, nodes, parentNodesIndex, removeNode, rootNodes, selectNode, selectedNodeId])',
      '}, [clearRelationshipDraft, clearRelationshipLabelEdit, selectNode])',
      '}, [getNodeSide, selectNode, updateDragPreview])',
      '}, [beginRelationshipDraftSelection, canEditTask, clearRelationshipHover, clearRelationshipLabelEdit])',
      '}, [canEditTask, clearRelationshipLabelEdit, nodes, selectNode])',
    ].every(token => view.includes(token)),
);

check(
  'Node title edit cleanup is centralized for commit, cancel, and delete flows',
  view.includes('const clearNodeEdit = React.useCallback(() => {') &&
    view.includes('setEditingNodeId(null);') &&
    view.includes("setEditingTitle('');") &&
    countMatches(view, 'clearNodeEdit();') === 2 &&
    view.includes('onEditCancel={clearNodeEdit}') &&
    !view.includes('const cancelEdit = React.useCallback') &&
    [
      '}, [clearNodeEdit, commitEditForNode, editingNodeId])',
      '}, [boardId, canDeleteTask, clearNodeEdit, getChildren, nodes, parentNodesIndex, removeNode, rootNodes, selectNode, selectedNodeId])',
    ].every(token => view.includes(token)),
);

check(
  'Node title draft updates keep a semantic child prop without a parent pass-through wrapper',
  !view.includes('const updateNodeTitleDraft = React.useCallback((title: string) => {') &&
    view.includes('onEditingTitleChange={setEditingTitle}') &&
    mindMapNode.includes('onEditingTitleChange: (title: string) => void;') &&
    mindMapNode.includes('onChange={(event) => onEditingTitleChange(event.target.value)}') &&
    !mindMapNode.includes('setEditingTitle') &&
    !mindMapNode.includes('React.Dispatch<React.SetStateAction'),
);

check(
  'Node expansion toggles are encapsulated behind a semantic callback instead of inline state mutation in renderNode',
  view.includes('const toggleNodeExpansion = React.useCallback((nodeId: string) => {') &&
    view.includes('onToggleExpanded={toggleNodeExpansion}') &&
    !view.includes('onToggleExpanded={(nodeId)') &&
    countMatches(view, 'toggleMindMapExpandedNodeId(prev, nodeId)') === 1 &&
    mindMapNode.includes('onToggleExpanded: (nodeId: string) => void;') &&
    mindMapNode.includes('onToggleExpanded(node.id);') &&
    !mindMapNode.includes('setExpandedNodeIds') &&
    !mindMapNode.includes('toggleMindMapExpandedNodeId'),
);

check(
  'Retired prompt-based relationship creation dead code is removed',
  !view.includes('const createNoteRelationship = React.useCallback') &&
    !view.includes('const editRelationshipLabel = React.useCallback') &&
    !view.includes('React.useDebugValue(createNoteRelationship') &&
    !view.includes('showPrompt(MINDMAP_MESSAGES.relationshipLabelPrompt') &&
    !messages.includes('relationshipLabelPrompt'),
);

check(
  'Mind map DOM selector contract is centralized for query and attribute consumers',
  [
    "export const MINDMAP_NODE_ATTRIBUTE = 'data-mindmap-node'",
    "export const MINDMAP_NODE_DIRECTION_ATTRIBUTE = 'data-mindmap-node-direction'",
    "export const MINDMAP_NODE_LEVEL_ATTRIBUTE = 'data-mindmap-node-level'",
    "export const MINDMAP_PARENT_ATTRIBUTE = 'data-mindmap-parent-id'",
    'export const MINDMAP_NODE_SELECTOR',
    'export const MINDMAP_CENTER_SELECTOR',
    'export const MINDMAP_CONTENT_BOUNDS_SELECTOR',
    'export const getMindMapNodeSelector',
    'export const getMindMapNodeElement',
    'export const getMindMapCenterElement',
    'export const getMindMapNodeId',
  ].every(token => domSelectors.includes(token)) &&
    view.includes("from './mindMapDomSelectors'") &&
    [
      'getMindMapNodeElement(mapContentRef.current, selectedNodeId)',
      'getMindMapNodeElement(mapContentRef.current, rootId)',
      'getMindMapNodeElement(document, prev.targetNodeId)',
      'getMindMapNodeElement(surface, fromId)',
      'getMindMapNodeElement(mapContentRef.current, nodeId)',
      'getMindMapCenterElement(document)',
      'getMindMapCenterElement(mapContentRef.current)',
      'MINDMAP_CONTENT_BOUNDS_SELECTOR',
      'getMindMapNodeId(targetElement)',
    ].every(token => view.includes(token)) &&
    !view.includes('getMindMapNodeSelector') &&
    !view.includes('MINDMAP_CENTER_SELECTOR') &&
    [
      "querySelector(`[data-mindmap-node=\"${",
      "querySelector('[data-mindmap-center]')",
      "querySelectorAll('[data-mindmap-node], [data-mindmap-center]')",
      "getAttribute('data-mindmap-node')",
      "getAttribute('data-mindmap-node-direction')",
    ].every(token => !view.includes(token)),
);

check(
  'Mind map connector SVG overlay rendering is isolated from the view component with map-local path telemetry preserved',
  view.includes("import MindMapConnectorOverlay from './MindMapConnectorOverlay'") &&
    view.includes('<MindMapConnectorOverlay connectorPaths={connectorPaths} />') &&
    [
      'data-mindmap-connector-overlay',
      'data-mindmap-connector-path',
      'data-depth={path.depth}',
      'data-direction={path.direction}',
    ].every(token => !view.includes(token)) &&
    [
      'const MindMapConnectorOverlay',
      'data-mindmap-connector-overlay',
      'data-mindmap-connector-path={path.id}',
      'data-from-node-id={path.fromNodeId}',
      'data-to-node-id={path.toNodeId}',
      'data-depth={path.depth}',
      'data-direction={path.direction}',
      'data-from-x={path.fromX.toFixed(2)}',
      'data-to-y={path.toY.toFixed(2)}',
    ].every(token => connectorOverlay.includes(token)),
);

check(
  'Relationship SVG overlay and draft preview rendering are isolated from the view component with zoom-stable map-local attributes preserved',
  view.includes("import MindMapRelationshipOverlay from './MindMapRelationshipOverlay'") &&
    view.includes('<MindMapRelationshipOverlay') &&
    view.includes('relationshipDraftPreview={relationshipDraftPreview}') &&
    [
      'data-mindmap-note-relationship-overlay',
      'data-mindmap-note-relationship={path.id}',
      'data-mindmap-note-relationship-hitbox',
      'data-mindmap-note-relationship-path',
      'data-mindmap-note-relationship-control-guide',
      'data-mindmap-note-relationship-control-arm',
      'data-mindmap-note-relationship-svg-endpoint',
      'data-mindmap-note-relationship-svg-control-point',
      'data-mindmap-note-relationship-label',
      'data-mindmap-note-relationship-draft-preview',
      'data-mindmap-note-relationship-draft-preview-path',
    ].every(token => !view.includes(token)) &&
    [
      'const MindMapRelationshipOverlay',
      'data-mindmap-note-relationship-overlay',
      'data-mindmap-note-relationship={path.id}',
      'data-mindmap-note-relationship-hitbox={path.id}',
      'data-mindmap-note-relationship-path={path.id}',
      'data-from-x={path.fromX.toFixed(2)}',
      'data-control-1-x={path.c1X.toFixed(2)}',
      'data-control-2-y={path.c2Y.toFixed(2)}',
      'data-label-x={path.labelX.toFixed(2)}',
      'data-mindmap-note-relationship-control-guide={path.id}',
      'data-mindmap-note-relationship-control-arm="from"',
      'data-mindmap-note-relationship-control-arm="to"',
      'data-mindmap-note-relationship-svg-endpoint="from"',
      'data-mindmap-note-relationship-svg-endpoint="to"',
      'data-mindmap-note-relationship-svg-control-point="1"',
      'data-mindmap-note-relationship-svg-control-point="2"',
      'data-mindmap-note-relationship-label={path.id}',
      'data-mindmap-note-relationship-draft-preview',
      'data-mindmap-note-relationship-draft-coordinate-space="map-local"',
      'data-draft-from-x={relationshipDraftPreview.fromX.toFixed(2)}',
      'data-mindmap-note-relationship-draft-preview-path',
      'markerEnd="url(#mindmap-note-relationship-draft-arrow)"',
    ].every(token => relationshipOverlay.includes(token)),
);

check(
  'Mind map user-facing messages are centralized outside the view component',
  view.includes("import { MINDMAP_MESSAGES, getMindMapDeleteTaskConfirmMessage } from './mindMapMessages'") &&
    [
      'MINDMAP_MESSAGES.noCreateTaskPermission',
      'MINDMAP_MESSAGES.noEditTaskPermission',
      'MINDMAP_MESSAGES.noDeleteTaskPermission',
      'getMindMapDeleteTaskConfirmMessage(plan.selected.title || DEFAULT_MINDMAP_TASK_TITLE, plan.descendantIds.length)',
      'MINDMAP_MESSAGES.noEditRelationshipPermission',
      'MINDMAP_MESSAGES.relationshipSelfLinkBlocked',
      'MINDMAP_MESSAGES.dragWouldCreateChildCycle',
      'MINDMAP_MESSAGES.dragWouldCreateHierarchyCycle',
      'MINDMAP_MESSAGES.selectBoardPrompt',
    ].every(token => view.includes(token)) &&
    [
      'export const MINDMAP_MESSAGES',
      "selectBoardPrompt: '請先選擇一個看板'",
      "noCreateTaskPermission: '目前沒有新增任務權限'",
      "noEditTaskPermission: '目前沒有編輯任務權限'",
      "noDeleteTaskPermission: '目前沒有刪除任務權限'",
      "noEditRelationshipPermission: '目前沒有編輯關聯線權限'",
      "relationshipSelfLinkBlocked: '關聯線不能連到同一個任務'",
      "dragWouldCreateChildCycle: '不能把任務拖到自己的子任務底下'",
      "dragWouldCreateHierarchyCycle: '這個拖曳會造成階層循環'",
      'export const getMindMapDeleteTaskConfirmMessage',
    ].every(token => messages.includes(token)) &&
    [
      '目前沒有新增任務權限',
      '目前沒有編輯任務權限',
      '目前沒有刪除任務權限',
      '目前沒有編輯關聯線權限',
      '關聯線不能連到同一個任務',
      '輸入關聯線文字',
      '不能把任務拖到自己的子任務底下',
      '這個拖曳會造成階層循環',
      '請先選擇一個看板',
      '刪除「${selected.title',
    ].every(token => !view.includes(token)),
);

check(
  'Relationship creation, label fallback, dedupe, style, control-point, endpoint-anchor, and endpoint-retarget commands are isolated from the view component',
  view.includes("from './mindMapRelationshipCommands'") &&
    [
      'export const DEFAULT_MINDMAP_RELATIONSHIP_LABEL',
      'const createRelationshipId =',
      'export const getMindMapRelationshipLabelDraft',
      'export const getCommittedMindMapRelationshipLabel',
      'export const findExistingNoteRelationship',
      'export const isValidRelationshipEndpoint',
      'export const removeRelationshipsForInvalidEndpoints',
      'export const removeRelationshipById',
      'export const appendMindMapNoteRelationship',
      'export const createMindMapNoteRelationship',
      'export const updateRelationshipLabelById',
      'export const updateRelationshipStyleById',
      'export const resetRelationshipStyleById',
      'export const updateRelationshipControlPointById',
      'export const getRelationshipEndpointNodeId',
      'export const updateRelationshipEndpointAnchorById',
      'export const retargetRelationshipEndpointById',
      "MindMapRelationshipPointerHandle",
      "targetNodeId === otherNodeId",
      "geometry.controlPoints = [",
    ].every(token => relationshipCommands.includes(token)) &&
    !relationshipCommands.includes('export const createRelationshipId') &&
    [
      'findExistingNoteRelationship(noteRelationships, fromId, toId)',
      'isValidRelationshipEndpoint(nodes, fromId)',
      'removeRelationshipsForInvalidEndpoints(prev, fromId, toId)',
      'removeRelationshipById(prev, relationshipId)',
      'createMindMapNoteRelationship({',
      'setNoteRelationships(prev => appendMindMapNoteRelationship(prev, relationship));',
      '}, [boardId, canEditTask, clearRelationshipDraftPreview, nodes, noteRelationships, openRelationshipLabelEdit, scheduleConnectorRecompute, startRelationshipLabelEdit])',
      'getMindMapRelationshipLabelDraft(label)',
      'getCommittedMindMapRelationshipLabel(editingRelationshipLabel)',
      'DEFAULT_MINDMAP_RELATIONSHIP_LABEL',
      'updateRelationshipLabelById(prev, editingRelationshipId, nextLabel)',
      'updateRelationshipStyleById(prev, relationshipId, patch)',
      'resetRelationshipStyleById(prev, relationshipId)',
      'updateRelationshipControlPointById(',
      'getRelationshipEndpointNodeId(prev, relationshipPointerDrag.relationshipId, handle)',
      'updateRelationshipEndpointAnchorById(',
      'retargetRelationshipEndpointById(',
    ].every(token => view.includes(token)) &&
    !view.includes('createRelationshipId()') &&
    !view.includes('const relationship: MindMapNoteRelationship = {') &&
    !view.includes('createdAt: now') &&
    !view.includes('updatedAt: now') &&
    !view.includes('const geometry: MindMapRelationshipGeometry') &&
    !view.includes('geometry.controlPoints = [') &&
    !view.includes('prev.find(relationship => relationship.id === relationshipPointerDrag.relationshipId)') &&
    !view.includes('const otherNodeId = relationshipPointerDrag.handle') &&
    !view.includes('prev.filter(item => item.id !== selectedRelationshipId)') &&
    !view.includes('prev.filter(item => item.id !== relationshipId)') &&
    !view.includes('const appendNoteRelationship = React.useCallback') &&
    !view.includes('appendNoteRelationship(relationship);') &&
    !view.includes('setNoteRelationships(prev => [...prev, relationship])') &&
    !view.includes("relationship.label || '關聯'") &&
    !view.includes("label.trim() || '關聯'") &&
    !view.includes("editingRelationshipLabel.trim() || '關聯'") &&
    !view.includes("label: '??'"),
);

check(
  'Relationship interaction hitboxes, handles, and inline label editor are isolated from the view component with map-local coordinates preserved',
  view.includes("import MindMapRelationshipInteractionLayer from './MindMapRelationshipInteractionLayer'") &&
    view.includes('<MindMapRelationshipInteractionLayer') &&
    view.includes('relationshipPaths={relationshipPaths}') &&
    [
      'data-mindmap-note-relationship-curve-click-target',
      'data-mindmap-note-relationship-line-click-target',
      'data-mindmap-note-relationship-click-target',
      'data-mindmap-note-relationship-control-point',
      'data-mindmap-note-relationship-label-input',
      'getRelationshipCurveHitSegments(path)',
    ].every(token => !view.includes(token)) &&
    [
      'getRelationshipCurveHitSegments',
      'data-mindmap-note-relationship-curve-click-target={path.id}',
      'data-mindmap-note-relationship-line-click-target={path.id}',
      'data-mindmap-note-relationship-click-target={path.id}',
      'data-mindmap-note-relationship-endpoint="from"',
      'data-mindmap-note-relationship-endpoint="to"',
      'data-mindmap-note-relationship-control-point="1"',
      'data-mindmap-note-relationship-control-point="2"',
      'data-mindmap-note-relationship-screen-control-point="1"',
      'data-mindmap-note-relationship-screen-control-point="2"',
      'data-mindmap-note-relationship-label-input={path.id}',
      'data-mindmap-note-relationship-coordinate-space="map-local"',
      'getLocalLineSegmentStyle(path.fromX, path.fromY, path.c1X, path.c1Y)',
      'startRelationshipPointerDrag(event, path.id,',
      'updateRelationshipLabelDraft(event.target.value)',
      'commitRelationshipLabelEdit',
      'cancelRelationshipLabelEdit',
    ].every(token => relationshipInteractionLayer.includes(token)),
);

check(
  'Relationship style drawer list layer and drawer UI are isolated from the view component while keeping Xmind-style drawer data attributes',
  view.includes("import MindMapRelationshipStyleLayer from './MindMapRelationshipStyleLayer'") &&
    view.includes('<MindMapRelationshipStyleLayer') &&
    view.includes('onUpdateStyle={updateRelationshipStyle}') &&
    !view.includes("import MindMapRelationshipStyleDrawer from './MindMapRelationshipStyleDrawer'") &&
    !view.includes('<MindMapRelationshipStyleDrawer') &&
    !view.includes('relationshipPaths.map(path => (') &&
    !view.includes('relationshipColorOptions') &&
    !view.includes('relationshipWidthOptions') &&
    !view.includes('relationshipDashOptions') &&
    !view.includes('data-mindmap-note-relationship-style-panel={path.id}') &&
    !view.includes('data-mindmap-note-relationship-style-colors') &&
    !view.includes('data-mindmap-note-relationship-style-arrows') &&
    [
      'const MindMapRelationshipStyleLayer',
      'relationshipColorOptions',
      'relationshipWidthOptions',
      'relationshipDashOptions',
      'relationshipPaths.map(path => (',
      '<MindMapRelationshipStyleDrawer',
      'selectedRelationshipId === path.id',
      'editingRelationshipId !== path.id',
      'onUpdateStyle={onUpdateStyle}',
      'onResetStyle={onResetStyle}',
    ].every(token => relationshipStyleLayer.includes(token)) &&
    [
      'const MindMapRelationshipStyleDrawer',
      'data-mindmap-note-relationship-style-panel={path.id}',
      'data-mindmap-note-relationship-style-drawer="true"',
      'data-mindmap-note-relationship-style-colors',
      'data-mindmap-note-relationship-style-widths',
      'data-mindmap-note-relationship-style-dashes',
      'data-mindmap-note-relationship-style-arrows',
      'data-mindmap-note-relationship-style-label-fonts',
      'data-mindmap-note-relationship-style-reset',
      'onUpdateStyle(path.id, { strokeColor: color })',
      'onUpdateStyle(path.id, { strokeDasharray: option.value })',
      'onResetStyle(path.id)',
    ].every(token => relationshipStyleDrawer.includes(token)) &&
    geometry.includes("export const relationshipDashOptions = [") &&
    geometry.includes("value: ''") &&
    geometry.includes("value: '7 6'") &&
    geometry.includes("value: '2 5'") &&
    !view.includes('const relationshipDashOptions = ['),
);

check(
  'Mind map toolbar controls are isolated from the view component while keeping zoom and relationship tool data attributes',
  view.includes("import MindMapToolbar from './MindMapToolbar'") &&
    view.includes('<MindMapToolbar') &&
    view.includes('const zoomOut = React.useCallback(() => {') &&
    view.includes('const zoomIn = React.useCallback(() => {') &&
    view.includes('const resetZoom = React.useCallback(() => {') &&
    view.includes('setZoom(zoomLevelRef.current - ZOOM_BUTTON_STEP);') &&
    view.includes('setZoom(zoomLevelRef.current + ZOOM_BUTTON_STEP);') &&
    view.includes('onZoomOut={zoomOut}') &&
    view.includes('onZoomIn={zoomIn}') &&
    view.includes('onZoomReset={resetZoom}') &&
    view.includes('onZoomFit={fitToContent}') &&
    !view.includes('onZoomOut={() => setZoom') &&
    !view.includes('onZoomIn={() => setZoom') &&
    !view.includes('onZoomReset={() => setZoom') &&
    [
      'data-mindmap-zoom-controls',
      'data-mindmap-zoom-out',
      'data-mindmap-zoom-label',
      'data-mindmap-zoom-reset',
      'data-mindmap-zoom-fit',
      'data-mindmap-note-relationship-tool',
      'data-mindmap-create-root',
    ].every(token => !view.includes(token)) &&
    !/data-mindmap-zoom-in(\s|>)/.test(view) &&
    [
      'const MindMapToolbar',
      'data-mindmap-zoom-controls',
      'data-mindmap-zoom-out',
      'data-mindmap-zoom-label',
      'data-mindmap-zoom-in',
      'data-mindmap-zoom-reset',
      'data-mindmap-zoom-fit',
      'data-mindmap-note-relationship-tool',
      'data-active={relationshipToolActive ?',
      'data-source-node-id={relationshipDraftFromId}',
      'data-mindmap-create-root',
      'zoomLabelRef',
      'Math.round(zoomLevel * 100)',
    ].every(token => toolbar.includes(token)),
);

check(
  'Root branch columns and center topic drop zones are isolated from the view component with drag/drop data attributes preserved',
  view.includes("import MindMapRootLayout from './MindMapRootLayout'") &&
    view.includes('<MindMapRootLayout') &&
    view.includes('rootsBySide={rootsBySide}') &&
    view.includes('renderNode={renderNode}') &&
    [
      'data-mindmap-side-drop-zone',
      'data-mindmap-side-drop-active',
      'rootsBySide.left.map',
      'rootsBySide.right.map',
    ].every(token => !view.includes(token)) &&
    [
      'const MindMapRootLayout',
      'data-mindmap-side-drop-zone="left"',
      "data-mindmap-side-drop-active={rootSideDropTarget === 'left' ? 'true' : 'false'}",
      'data-mindmap-center',
      'onDragOver={onDragOverCenter}',
      'onDrop={onDropOnCenter}',
      'data-mindmap-side-drop-zone="right"',
      "data-mindmap-side-drop-active={rootSideDropTarget === 'right' ? 'true' : 'false'}",
      "rootsBySide.left.map(node => renderNode(node, 'left', 1))",
      "rootsBySide.right.map(node => renderNode(node, 'right', 1))",
    ].every(token => rootLayout.includes(token)),
);

check(
  'Mind map empty state UI is isolated from the view component while preserving create-root affordance',
  view.includes("import MindMapEmptyState from './MindMapEmptyState'") &&
    view.includes('<MindMapEmptyState canCreateTask={canCreateTask} onCreateRoot={handleCreateRoot} />') &&
    [
      'data-mindmap-empty',
      '尚無心智圖任務',
      '新增第一個任務',
    ].every(token => !view.includes(token)) &&
    [
      'const MindMapEmptyState',
      'data-mindmap-empty',
      'onClick={onCreateRoot}',
      'disabled={!canCreateTask}',
      '尚無心智圖任務',
      '新增第一個任務',
    ].every(token => emptyState.includes(token)),
);

check(
  'Mind map canvas scroll surface and zoom content layer are isolated from the view component with telemetry data attributes preserved',
  view.includes("import MindMapCanvasShell from './MindMapCanvasShell'") &&
    view.includes('<MindMapCanvasShell') &&
    view.includes('surfaceRef={mapSurfaceRef}') &&
    view.includes('contentRef={mapContentRef}') &&
    view.includes('zoomLevelText={formatZoomLevel(zoomLevel)}') &&
    view.includes('hasContent={rootNodes.length > 0}') &&
    [
      'data-mindmap-zoom-level',
      'data-mindmap-zoom-interaction',
      'data-mindmap-middle-pan',
      'data-mindmap-surface',
      'data-mindmap-pan-padding',
      'data-mindmap-zoom-renderer',
      'data-mindmap-zoom-quality',
      'data-mindmap-note-relationship-mode',
      'data-mindmap-note-relationship-source-id',
      'compactClassNames.canvas',
    ].every(token => !view.includes(token)) &&
    [
      'const MindMapCanvasShell',
      'compactClassNames.canvas',
      'data-mindmap-zoom-level={zoomLevelText}',
      'data-mindmap-zoom-interaction="preview-then-vector-commit"',
      'data-mindmap-middle-pan="true"',
      'role="tree"',
      'aria-label="WBS 心智圖"',
      'data-mindmap-surface',
      'data-mindmap-pan-padding="xmind-edge"',
      'data-mindmap-zoom-renderer="css-zoom-layer"',
      'data-mindmap-zoom-quality="zoom-only-no-path-recompute"',
      "data-mindmap-note-relationship-mode={relationshipToolActive ? 'true' : 'false'}",
      'data-mindmap-note-relationship-source-id={relationshipDraftFromId}',
      'hasContent ? (',
      'emptyState',
    ].every(token => canvasShell.includes(token)) &&
    !view.includes('handleMindMapScroll') &&
    !view.includes('onScroll={') &&
    !view.includes("addEventListener('scroll'") &&
    !view.includes("removeEventListener('scroll'") &&
    !canvasShell.includes('onScroll:') &&
    !canvasShell.includes('onScroll={'),
);

check(
  'Mind map content layout CSS variables are isolated from the view component',
  view.includes("import { getMindMapContentStyle } from './mindMapLayoutStyle'") &&
    view.includes('const mapContentStyle = React.useMemo(() => getMindMapContentStyle(zoomLevel), [zoomLevel])') &&
    [
      "'--mindmap-root-gap'",
      "'--mindmap-node-gap'",
      "'--mindmap-date-font-size'",
      "'--mindmap-center-radius'",
    ].every(token => !view.includes(token)) &&
    [
      'export const getMindMapContentStyle',
      "'--mindmap-zoom': zoomLevel",
      "'--mindmap-root-gap': '48px'",
      "'--mindmap-node-gap': '20px'",
      "'--mindmap-children-gap': '12px'",
      "'--mindmap-date-font-size': '10px'",
      "'--mindmap-root-side-min-width': '260px'",
      "'--mindmap-center-radius': '12px'",
      'zoom: zoomLevel',
    ].every(token => layoutStyle.includes(token)),
);

check(
  'Zoom policy, wheel delta, preview telemetry, and anchor scroll math are isolated from the view component',
  view.includes("from './mindMapZoom'") &&
    [
      'export const MIN_ZOOM',
      'export const MAX_ZOOM',
      'export const ZOOM_BUTTON_STEP',
      'export const ZOOM_PREVIEW_COMMIT_DELAY_MS',
      'export const clampZoom',
      'export const formatZoomLevel',
      'export const getZoomPercentText',
      'export const syncCommittedZoomTelemetry',
      'export const getWheelZoomDelta',
      'export const getZoomAnchorFromClient',
      'export const getZoomPreviewScale',
      'export const clearZoomPreviewTelemetry',
      'export const applyZoomPreviewTelemetry',
      'export const getAnchoredZoomScrollDelta',
      "content.style.transformOrigin = `${anchor.contentX}px ${anchor.contentY}px`",
      "content.setAttribute('data-mindmap-zoom-preview-transform', 'scale')",
      "surface.setAttribute('data-mindmap-zoom-preview-active', 'true')",
      "surface.setAttribute('data-mindmap-zoom-preview-level', formatZoomLevel(previewZoom))",
      "surface.setAttribute('data-mindmap-zoom-preview-scale', previewScale.toFixed(4))",
    ].every(token => zoom.includes(token)) &&
    view.includes('syncCommittedZoomTelemetry(mapSurfaceRef.current, zoomLabelRef.current, zoomLevel)') &&
    view.includes('clearZoomPreviewTelemetry(surface, content)') &&
    view.includes('applyZoomPreviewTelemetry(surface, content, zoomLabelRef.current, anchor, previewZoom)') &&
    view.includes('getZoomAnchorFromClient(event.clientX, event.clientY, rect, zoomLevelRef.current)') &&
    view.includes('getAnchoredZoomScrollDelta(anchor, previousZoom, targetZoom)') &&
    !view.includes('getZoomPreviewScale(previewZoom, anchor.baseZoom)') &&
    !view.includes("content.style.transformOrigin = `${anchor.contentX}px ${anchor.contentY}px`") &&
    !view.includes("content.setAttribute('data-mindmap-zoom-preview-transform', 'scale')") &&
    !view.includes("surface.setAttribute('data-mindmap-zoom-preview-active', 'true')") &&
    !view.includes("surface.setAttribute('data-mindmap-zoom-preview-level', formatZoomLevel(previewZoom))") &&
    !view.includes("surface.setAttribute('data-mindmap-zoom-preview-scale', previewScale.toFixed(4))") &&
    !view.includes("zoomLabelRef.current.textContent = `${Math.round(zoomLevel * 100)}%`") &&
    !view.includes("zoomLabelRef.current.textContent = `${Math.round(previewZoom * 100)}%`"),
);

check(
  'Map-local DOM coordinate conversion and relationship handle segment styles are isolated from the view component',
  view.includes("from './mindMapDomGeometry'") &&
    [
      "from './mindMapDomSelectors'",
      'export const getElementLocalRect',
      'export const getMapPointFromClient',
      'export const getNodeElementAtPoint',
      'export const getAnchorForElement',
      'export const getLocalLineSegmentStyle',
      'querySelectorAll<HTMLElement>(MINDMAP_NODE_SELECTOR)',
    ].every(token => domGeometry.includes(token)) &&
    domGeometry.includes('offsetParent') &&
    domGeometry.includes('getBoundingClientRect()') &&
    domGeometry.includes('safeZoom') &&
    view.includes('getElementLocalRect(element, surface, zoomLevelRef.current)') &&
    view.includes('getMapPointFromClientInSurface(clientX, clientY, surface, zoomLevelRef.current)') &&
    view.includes('getMapPointFromClientInSurface(event.clientX, event.clientY, surface, zoomLevelRef.current)') &&
    view.includes('getNodeElementAtPointInSurface(surface, event.clientX, event.clientY)') &&
    view.includes('getAnchorForElementFromClient(event.clientX, event.clientY, nodeElement)') &&
    view.includes('getAnchorForElementFromClient(event.clientX, event.clientY, targetElement)') &&
    !domGeometry.includes("querySelectorAll<HTMLElement>('[data-mindmap-node]')"),
);

check(
  'Middle-mouse velocity pan policy and telemetry mutations are isolated from the view component',
  view.includes("from './mindMapPan'") &&
    [
      'export interface MiddleMousePanState',
      'export const createMiddleMousePanState',
      'export const updateMiddleMousePanPointer',
      'export const getMiddleMousePanVelocity',
      'export const markMiddleMousePanActive',
      'export const clearMiddleMousePanTelemetry',
      'export const applyMiddleMousePanFrame',
    ].every(token => pan.includes(token)) &&
    [
      'const MIDDLE_MOUSE_PAN_DEAD_ZONE = 8;',
      'const MIDDLE_MOUSE_PAN_MAX_SPEED = 36;',
      'const MIDDLE_MOUSE_PAN_ACCELERATION = 0.075;',
    ].every(token => pan.includes(token)) &&
    view.includes('middleMousePanRef.current = createMiddleMousePanState(event.clientX, event.clientY)') &&
    view.includes('markMiddleMousePanActive(surface)') &&
    view.includes('updateMiddleMousePanPointer(pan, event.clientX, event.clientY)') &&
    view.includes('applyMiddleMousePanFrame(surface, pan)') &&
    view.includes('clearMiddleMousePanTelemetry(surface)') &&
    !view.includes('Math.min(36, (Math.abs') &&
    !view.includes('const deadZone = 8'),
);

check(
  'Mind map keyboard shortcut predicates are isolated from the view component without changing Xmind-style key behavior',
  view.includes("from './mindMapKeyboard'") &&
    [
      'export const isMindMapTextEditingTarget',
      'export const isMindMapDeleteKey',
      'export const isMindMapSpaceKey',
      'export const isMindMapRelationshipLabelEditKey',
      'export const isMindMapRelationshipToolToggleKey',
      'export const hasMindMapShortcutModifier',
      'export const isMindMapPlainTextEditKey',
      'export const getMindMapKeyboardAction',
      "type: 'toggle-relationship-tool'",
      "type: 'deactivate-relationship-mode'",
      "type: 'remove-selected-relationship'",
      "type: 'edit-selected-relationship-label'",
      "type: 'select-vertical', direction: 'up'",
      "type: 'select-vertical', direction: 'down'",
      "type: 'select-parent'",
      "type: 'select-first-child'",
      "type: 'create-sibling'",
      "type: 'create-child'",
      "type: 'archive-selected-node'",
      "event.key === 'Delete' || event.key === 'Backspace'",
      "event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space'",
      "isMindMapSpaceKey(event) || event.key === 'Enter' || event.key === 'F2'",
    ].every(token => keyboard.includes(token)) &&
    [
      'getMindMapKeyboardAction(event, {',
      'isMindMapTextEditingTarget(event.target)',
      'isMindMapRelationshipLabelEditKey(event)',
      'isMindMapDeleteKey(event)',
      "action.type === 'toggle-relationship-tool'",
      "action.type === 'select-vertical'",
      "action.type === 'archive-selected-node'",
    ].every(token => view.includes(token)) &&
    !keyboard.includes("type: 'rename-selected'") &&
    !keyboard.includes('isMindMapPlainTextEditKey') &&
    !view.includes("action.type === 'rename-selected'") &&
    !view.includes('isMindMapRelationshipToolToggleKey(event)') &&
    !view.includes('hasMindMapShortcutModifier(event)') &&
    !view.includes('isMindMapSpaceKey(event)') &&
    !view.includes('isMindMapPlainTextEditKey(event)') &&
    !view.includes('event.key === \'Spacebar\'') &&
    !view.includes("event.key === 'Delete' || event.key === 'Backspace'") &&
    !view.includes('event.key.length === 1 && selectedNodeId'),
);

check(
  'Mind map expanded-node Set mutations are isolated from the view component',
  view.includes("from './mindMapExpansion'") &&
    [
      'export const addMindMapExpandedNodeIds',
      'export const addMindMapExpandedNodeId',
      'export const toggleMindMapExpandedNodeId',
      'const next = new Set(expandedNodeIds)',
      'nodeIds.forEach((nodeId) => {',
      'if (nodeId) next.add(nodeId)',
      'if (next.has(nodeId)) next.delete(nodeId)',
      'else next.add(nodeId)',
    ].every(token => expansion.includes(token)) &&
    [
      'const expandNodes = React.useCallback((nodeIds: Array<string | null | undefined>) => {',
      'const expandNode = React.useCallback((nodeId: string | null | undefined) => {',
      'setExpandedNodeIds(prev => addMindMapExpandedNodeIds(prev, nodeIds));',
      'setExpandedNodeIds(prev => addMindMapExpandedNodeId(prev, nodeId));',
      'toggleMindMapExpandedNodeId(prev, nodeId)',
      'expandNodes(allVisibleIds)',
      'expandNodes([parentId, node.id])',
      'expandNode(selectedNodeId)',
      'expandNode(update.expandNodeId)',
    ].every(token => view.includes(token)) &&
    dropCommands.includes('expandNodeId: target.id') &&
    countMatches(view, 'setExpandedNodeIds(prev =>') === 3 &&
    !view.includes('addMindMapExpandedNodeIds(prev, allVisibleIds)') &&
    !view.includes('addMindMapExpandedNodeIds(prev, [parentId, node.id])') &&
    !view.includes('addMindMapExpandedNodeId(prev, selectedNodeId)') &&
    !view.includes('addMindMapExpandedNodeId(prev, target.id)') &&
    !view.includes('allVisibleIds.forEach(id => next.add(id))') &&
    !view.includes('if (parentId) next.add(parentId)') &&
    !view.includes('new Set(prev).add(selectedNodeId)') &&
    !view.includes('new Set(prev).add(target.id)') &&
    !view.includes('if (next.has(nodeId)) next.delete(nodeId)'),
);

check(
  'Mind map tree filtering, root splitting, sibling ordering, and insert-order policy are isolated from the view component',
  view.includes("from './mindMapTree'") &&
    [
      'export type MindMapFilterState = TaskFilterState;',
      'const sortTasks =',
      'const matchesMindMapFilters =',
      'export const getSiblingNodes',
      'export const getInsertOrder',
      'export const getMindMapRootNodes',
      'export const getMindMapChildren',
      'export const getMindMapRootAncestorId',
      'export const wouldCreateMindMapCycle',
      'export const splitRootNodes',
    ].every(token => tree.includes(token)) &&
    !tree.includes('export const sortTasks') &&
    !tree.includes('export const matchesMindMapFilters') &&
    tree.includes('matchesTaskFilters(node, filters)') &&
    tree.includes('new Map<string, TaskNode>()') &&
    tree.includes('let current = nodes[nodeId]') &&
    tree.includes('while (current?.parentId && nodes[current.parentId] && !visited.has(current.id))') &&
    tree.includes('const visited = new Set<string>([draggedId])') &&
    tree.includes('let current: string | null = newParentId') &&
    view.includes('getMindMapRootNodes(nodes, parentNodesIndex, boardId, mindMapFilters)') &&
    view.includes('getMindMapChildren(nodes, parentNodesIndex, boardId, mindMapFilters, nodeId)') &&
    view.includes('getMindMapRootAncestorId(nodes, nodeId)') &&
    dropCommands.includes('wouldCreateMindMapCycle(nodes, draggedNodeId, target.id)') &&
    dropCommands.includes('wouldCreateMindMapCycle(nodes, draggedNodeId, nextParentId)') &&
    view.includes('splitRootNodes(rootNodes, sideOverrides)') &&
    !view.includes('wouldCreateMindMapCycle(nodes, draggedNodeId, target.id)') &&
    !view.includes('wouldCreateMindMapCycle(nodes, draggedNodeId, nextParentId)') &&
    !view.includes('matchesTaskFilters') &&
    !view.includes('let current = nodes[nodeId]') &&
    !view.includes('while (current?.parentId && nodes[current.parentId] && !visited.has(current.id))') &&
    !view.includes('const visited = new Set<string>([draggedId])') &&
    !view.includes('let current: string | null = newParentId') &&
    !view.includes('(parentNodesIndex.root || [])'),
);

check(
  'Root-side persistence is isolated from the view component without changing the localStorage contract',
  view.includes("from './mindMapSideStorage'") &&
    [
      'const getSideStorageKey',
      'export const loadSideOverrides',
      'export const saveSideOverrides',
      'projed.mindmap.rootSides.',
      "entry[1] === 'left' || entry[1] === 'right'",
      'window.localStorage.getItem(getSideStorageKey(boardId))',
      'window.localStorage.setItem(getSideStorageKey(boardId), JSON.stringify(overrides))',
    ].every(token => sideStorage.includes(token)) &&
    !sideStorage.includes('export const getSideStorageKey') &&
    view.includes('setSideOverrides(loadSideOverrides(boardId))') &&
    view.includes('saveSideOverrides(boardId, sideOverrides)') &&
    view.includes('const stored = loadSideOverrides(boardId)') &&
    !view.includes('projed.mindmap.rootSides.') &&
    !view.includes('window.localStorage.getItem') &&
    !view.includes('window.localStorage.setItem'),
);

check(
  'Mind map task creation, title fallback, and root/child order policies are isolated from the view component',
  view.includes("from './mindMapTaskCommands'") &&
    [
      'export const DEFAULT_MINDMAP_TASK_TITLE',
      'const createMindMapNodeId =',
      'export const createMindMapTaskNode',
      'export const getCommittedMindMapTitle',
      'export const getNextMindMapRootOrder',
      'export const getNextMindMapChildOrder',
      'export const getNextMindMapSideRootOrder',
      'export const getMindMapSiblingTaskCreatePlan',
      'export const getMindMapChildTaskCreatePlan',
      'export const getMindMapArchiveTaskPlan',
      "inheritRootSideFromId: selected.parentId ? undefined : selected.id",
      'order: getInsertOrder(siblings, selected.id,',
      'order: getNextMindMapChildOrder(getChildren(selected.id))',
      'nextSelectionId: getNextSelectionAfterDelete(selected, siblings, nodes, rootNodes, deletingIds)',
      "title.trim() || DEFAULT_MINDMAP_TASK_TITLE",
      '? Math.max(...sameSideRoots.map(node => node.order)) + 1',
      ': fallbackOrder',
      "status: 'todo'",
      "nodeType: 'task'",
    ].every(token => taskCommands.includes(token)) &&
    view.includes('const node = createMindMapTaskNode({') &&
    view.includes('getCommittedMindMapTitle(title)') &&
    view.includes('getNextMindMapRootOrder(rootNodes)') &&
    view.includes('getMindMapSiblingTaskCreatePlan({ nodeId, nodes, parentNodesIndex, boardId })') &&
    view.includes('getMindMapChildTaskCreatePlan({ nodeId, nodes, getChildren })') &&
    view.includes('getMindMapArchiveTaskPlan({ selectedNodeId, nodes, parentNodesIndex, boardId, rootNodes, getChildren })') &&
    dropCommands.includes('getNextMindMapSideRootOrder(sameSideRoots, rootNodes.length + 1)') &&
    dropCommands.includes('getNextMindMapRootOrder(rootNodes.filter(node => node.id !== draggedNodeId))') &&
    view.includes('createSiblingForNode(selectedNodeId);') &&
    view.includes('createChildForNode(selectedNodeId);') &&
    !view.includes('const createSibling = React.useCallback') &&
    !view.includes('const createChild = React.useCallback') &&
    !view.includes('Date.now().toString(36)') &&
    !view.includes("title.trim() || '新任務'") &&
    !view.includes('sameSideRoots.length > 0 ? Math.max(...sameSideRoots.map(node => node.order)) + 1 : rootNodes.length + 1') &&
    !view.includes('getNextMindMapChildOrder(children)') &&
    !view.includes('getInsertOrder(siblings, selected.id,') &&
    !view.includes('getNextSelectionAfterDelete(selected, siblings, nodes, rootNodes, deletingIds)') &&
    !view.includes('getNextMindMapSideRootOrder(sameSideRoots, rootNodes.length + 1)') &&
    !view.includes('getNextMindMapRootOrder(rootNodes.filter(node => node.id !== draggedNodeId))') &&
    !view.includes("status: 'todo',") &&
    !view.includes("nodeType: 'task',"),
);

check(
  'Drag/drop move decisions are isolated from the view component as pure command helpers',
  view.includes("from './mindMapDropCommands'") &&
    [
      'export const getMindMapNodeDropResult',
      'export const getMindMapCenterDropUpdate',
      'export const getMindMapSideDropUpdate',
      "return { type: 'blocked', reason: 'child-cycle' }",
      "return { type: 'blocked', reason: 'hierarchy-cycle' }",
      'rootSide: nextParentId ? undefined : getNodeSide(target.id)',
      "rootSide: sideOverrides[draggedNodeId] ? undefined : 'right'",
      'const finalDirection = previewDirection || direction',
      'getNextMindMapSideRootOrder(sameSideRoots, rootNodes.length + 1)',
    ].every(token => dropCommands.includes(token)) &&
    view.includes('const result = getMindMapNodeDropResult({') &&
    view.includes('const update = getMindMapCenterDropUpdate({ draggedNodeId, rootNodes, sideOverrides });') &&
    view.includes('const update = getMindMapSideDropUpdate({') &&
    view.includes("result.reason === 'child-cycle'") &&
    !view.includes('const nextParentId = target.parentId || null') &&
    !view.includes('const sameSideRoots = rootNodes.filter') &&
    !view.includes('const finalDirection = dragPreview?.direction || direction') &&
    !view.includes('const order = getNextMindMapRootOrder(rootNodes.filter(node => node.id !== draggedNodeId))') &&
    !view.includes('const children = getChildren(target.id).filter(child => child.id !== draggedNodeId)'),
);

check(
  'Viewport bounds, fit zoom, and content-centering scroll math are isolated from the view component',
  view.includes("from './mindMapViewport'") &&
    [
      'export interface MindMapContentBounds',
      'export const getMindMapContentBounds',
      'export const centerMindMapContent',
      'export const getFitZoomForBounds',
      "from './mindMapDomSelectors'",
      'querySelectorAll<HTMLElement>(MINDMAP_CONTENT_BOUNDS_SELECTOR)',
      'surface.scrollLeft = Math.max(0, Math.min(surface.scrollWidth - surface.clientWidth, nextLeft))',
      'surface.scrollTop = Math.max(0, Math.min(surface.scrollHeight - surface.clientHeight, nextTop))',
      "surface.setAttribute('data-mindmap-content-centered', reason)",
      "surface.setAttribute('data-mindmap-visible-bounds-width', bounds.width.toFixed(2))",
      'currentZoom * Math.min(widthRatio, heightRatio) * 0.86',
    ].every(token => viewport.includes(token)) &&
    view.includes('getMindMapViewportContentBounds(content, zoomLevelRef.current)') &&
    view.includes('centerMindMapViewportContent(surface, content, zoomLevelRef.current, reason)') &&
    view.includes('getFitZoomForBounds(surface, bounds, zoomLevelRef.current)') &&
    !view.includes("querySelectorAll<HTMLElement>('[data-mindmap-node], [data-mindmap-center]')") &&
    !viewport.includes("querySelectorAll<HTMLElement>('[data-mindmap-node], [data-mindmap-center]')") &&
    !view.includes("surface.setAttribute('data-mindmap-visible-bounds-width'") &&
    !view.includes('surface.scrollLeft = Math.max(0, Math.min(surface.scrollWidth - surface.clientWidth, nextLeft))'),
);

check(
  'ResizeObserver lifecycle is not coupled to connector or relationship path state updates',
    view.includes('const observer = new ResizeObserver(() => {') &&
    view.includes('const nodesToObserve = Array.from(surface.querySelectorAll(MINDMAP_CONTENT_BOUNDS_SELECTOR));') &&
    view.includes('nodesToObserve.forEach(element => observer.observe(element));') &&
    view.includes('}, [recomputeConnectors, rootNodes.length]);') &&
    !view.includes('handleMindMapScroll') &&
    !view.includes('connectorPaths.length,') &&
    !view.includes('relationshipPaths.length, recomputeConnectors') &&
    !view.includes('connectorPaths.length') &&
    !view.includes('relationshipPaths.length'),
);

check(
  'Drag/drop preview mode, connector path, insertion placeholder, and dragover path math are isolated from the view component',
  view.includes("from './mindMapDrag'") &&
    [
      'export const getDropModeFromPointer',
      'export const updateDragPreviewPointerPosition',
      'preview: T | null',
      'pointer: MindMapDragPointer',
      'preview ? { ...preview, x: pointer.clientX, y: pointer.clientY } : preview',
      'export const createPreviewConnectorPath',
      'export const createInsertionPreview',
      'export const createScreenDragConnectorPath',
      "from './mindMapDomSelectors'",
      'getMindMapNodeSelector(targetNode?.id ||',
      'getMindMapNodeSelector(targetNode.parentId)',
      'MINDMAP_CENTER_SELECTOR',
      "ratio < 0.25",
      "ratio > 0.75",
      'getMapPointFromClient(pointer.clientX, pointer.clientY, surface, zoomLevel)',
      "left: isLeft ? targetRect.left - 126 : targetRect.right + 24",
      "top: mode === 'before' ? targetRect.top - 12 : targetRect.bottom + 6",
      'createLocalConnectorPath(fromX, fromY, toX, toY, direction)',
      'Math.max(Math.abs(toX - fromX) * 0.45, 42)',
    ].every(token => drag.includes(token)) &&
    view.includes('createDragPreviewConnectorPath(event, targetElement, surface, zoomLevelRef.current, direction)') &&
    view.includes('createDragInsertionPreview(targetElement, targetNode, mode, direction, surface, zoomLevelRef.current)') &&
    view.includes('createScreenDragConnectorPath(event, targetElement, direction)') &&
    view.includes('updateDragPreviewPointerPosition(prev, event)') &&
    view.includes('updateDragPreviewPointerPosition({ ...prev, connectorPath }, event)') &&
    view.includes('getDropModeFromPointer(event.currentTarget, event)') &&
    !view.includes('ratio < 0.25') &&
    !view.includes('targetRect.left - 126') &&
    !view.includes('Math.max(Math.abs(toX - fromX) * 0.45, 42)') &&
    !view.includes('{ ...prev, x: event.clientX, y: event.clientY }') &&
    !drag.includes('[data-mindmap-node="${targetNode') &&
    !drag.includes("'[data-mindmap-center]'"),
);

check(
  'Drag/drop target state updates are centralized for node, center, side, and clear flows',
  view.includes('const setNodeDropPreviewTarget = React.useCallback((target: MindMapDropTarget) => {') &&
    view.includes('const setRootDropPreviewTarget = React.useCallback((target: RootSideDropTarget) => {') &&
    countMatches(view, 'setDropTarget(') === 3 &&
    countMatches(view, 'setRootSideDropTarget(') === 3 &&
    countMatches(view, 'setNodeDropPreviewTarget(') === 1 &&
    countMatches(view, 'setRootDropPreviewTarget(') === 2 &&
    view.includes('setNodeDropPreviewTarget({ nodeId, mode });') &&
    view.includes('setRootDropPreviewTarget(null);') &&
    view.includes('setRootDropPreviewTarget(direction);') &&
    [
      '}, [canMoveTask, draggedNodeId, getDragInsertionPreview, getNodeSide, nodes, setNodeDropPreviewTarget, updateDragPreview])',
      '}, [canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, sideOverrides, updateDragPreview])',
      '}, [canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, updateDragPreview])',
    ].every(token => view.includes(token)),
);

check(
  'Mind map node drag start and move handlers are named callbacks outside renderNode',
  drag.includes('export const setTransparentDragImage = (dataTransfer: DataTransfer) => {') &&
    drag.includes("const image = document.createElement('canvas');") &&
    drag.includes('dataTransfer.setDragImage(image, 0, 0);') &&
    view.includes('setTransparentDragImage(event.dataTransfer);') &&
    view.includes('const handleNodeDragStart = React.useCallback((nodeId: string, event: React.DragEvent<HTMLDivElement>) => {') &&
    view.includes('const handleNodeDragMove = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {') &&
    view.includes('updateDragPreview(event, {') &&
    view.includes("dropPosition: 'root',") &&
    view.includes('onDragStart={handleNodeDragStart}') &&
    view.includes('onDragMove={handleNodeDragMove}') &&
    view.includes('}, [getNodeSide, selectNode, updateDragPreview])') &&
    view.includes('setDragPreview(prev => updateDragPreviewPointerPosition(prev, event));') &&
    view.includes('}, [draggedNodeId])') &&
    !view.includes('const setTransparentDragImage = React.useCallback') &&
    !view.includes("document.createElement('canvas')") &&
    !view.includes('setDragImage(image, 0, 0)') &&
    !view.includes("title: node?.title || DEFAULT_MINDMAP_TASK_TITLE") &&
    !view.includes('onDragStart={(nodeId, event) => {') &&
    !view.includes('onDragMove={(event) => {'),
);

check(
  'Drag/drop preview rendering is isolated from the view component while keeping map-local and cursor badge data attributes',
  view.includes("import MindMapDragPreviewBadge from './MindMapDragPreviewBadge'") &&
    view.includes("import MindMapDragPreviewLayer, { type MindMapDragPreviewModel } from './MindMapDragPreviewLayer'") &&
    view.includes('<MindMapDragPreviewLayer dragPreview={dragPreview} />') &&
    view.includes('<MindMapDragPreviewBadge dragPreview={dragPreview} />') &&
    view.includes('interface DragPreviewState extends MindMapDragPreviewModel') &&
    !view.includes('data-mindmap-drop-preview-overlay') &&
    !view.includes('data-mindmap-insertion-preview') &&
    !view.includes('data-mindmap-drag-preview') &&
    [
      'export interface MindMapDragPreviewModel',
      'data-mindmap-drop-preview-overlay',
      'data-mindmap-drop-preview-coordinate-space="map-local"',
      'data-mindmap-drop-preview',
      'data-mindmap-insertion-preview',
      'data-mindmap-insertion-preview-coordinate-space="map-local"',
      "data-sibling-before-id={dragPreview.siblingBeforeId || ''}",
      "data-sibling-after-id={dragPreview.siblingAfterId || ''}",
      'data-drop-position={dragPreview.dropPosition}',
      "data-direction={dragPreview.direction || ''}",
    ].every(token => dragPreviewLayer.includes(token)) &&
    [
      'const MindMapDragPreviewBadge',
      'data-mindmap-drag-preview',
      'Math.min(dragPreview.x + 14',
      'Math.max(12, window.innerWidth - 288)',
      "data-target-node-id={dragPreview.targetNodeId || ''}",
      'data-drop-position={dragPreview.dropPosition}',
      '<span className="block truncate">{dragPreview.title}</span>',
    ].every(token => dragPreviewBadge.includes(token)),
);

check(
  'Keyboard selection and delete-after-focus state transitions are isolated from the view component',
  view.includes("from './mindMapSelection'") &&
    [
      'export const collectMindMapDescendantIds',
      'export const getNextSelectionAfterDelete',
      'export const getVisibleNodeSelectionByVerticalArrow',
      'export const getVisibleMindMapNodeIds',
      'export const getParentSelection',
      'export const getFirstChildSelection',
      'previousSibling?.id || parentCandidate?.id || nextSibling?.id || fallbackRoot?.id || null',
      "direction === 'up'",
      "from './mindMapDomSelectors'",
      'querySelectorAll<HTMLElement>(MINDMAP_NODE_SELECTOR)',
      '.map(getMindMapNodeId)',
      'selected?.parentId && nodes[selected.parentId]',
    ].every(token => selection.includes(token)) &&
    taskCommands.includes('collectMindMapDescendantIds(selected.id, getChildren)') &&
    taskCommands.includes('getNextSelectionAfterDelete(selected, siblings, nodes, rootNodes, deletingIds)') &&
    view.includes('getVisibleMindMapNodeIds(mapContentRef.current)') &&
    view.includes('getVisibleNodeSelectionByVerticalArrow(') &&
    view.includes('getParentSelection(selectedNodeId, nodes)') &&
    view.includes('getFirstChildSelection(children)') &&
    !view.includes("querySelectorAll<HTMLElement>('[data-mindmap-node]')") &&
    !selection.includes("querySelectorAll<HTMLElement>('[data-mindmap-node]')") &&
    !view.includes('collectMindMapDescendantIds(selected.id, getChildren)') &&
    !view.includes('getNextSelectionAfterDelete(selected, siblings, nodes, rootNodes, deletingIds)') &&
    !view.includes('const previousSibling = siblings') &&
    !view.includes('const parentCandidate = selected.parentId') &&
    !view.includes('const nextSelectionId = previousSibling?.id || parentCandidate?.id'),
);

check(
  'Browser QC covers stale relationship geometry at low zoom and zoom-invariant local path data',
  relationshipBrowser.includes('injectStaleControlPointRelationship') &&
    relationshipBrowser.includes('stale-relationship-controlpoints-43zoom.png') &&
    relationshipBrowser.includes('zooming should not recompute or rewrite relationship path geometry or local interaction coordinates') &&
    relationshipBrowser.includes('const viewport = page.viewportSize() || { width: 1440, height: 900 };') &&
    relationshipBrowser.includes('Math.min(sourceBox.x + sourceBox.width + 96, viewport.width - 24)'),
);

check(
  'Package exposes the mind map system-health verification gate',
  packageJson.scripts?.['verify:dev-027g-mindmap-system-health'] === 'node scripts/verify-dev-027g-mindmap-system-health.mjs',
);

check(
  'System-health browser QC covers complete zoom/pan fixture without relationship geometry recompute',
  packageJson.scripts?.['verify:dev-027g-mindmap-system-health-browser']?.includes('verify-dev-027g-mindmap-system-health-browser.pw.js') &&
    systemHealthBrowser.includes('system-health fixture should include date badges, connectors, relationship label hitbox, endpoints, control points, and arms before zoom') &&
    systemHealthBrowser.includes('wheel zoom preview should not recompute or rewrite relationship path geometry or local interaction coordinates') &&
    systemHealthBrowser.includes('zooming should not recompute or rewrite relationship path geometry or local interaction coordinates') &&
    systemHealthBrowser.includes('button zoom should not recompute or rewrite relationship path geometry or local interaction coordinates') &&
    systemHealthBrowser.includes('middle-mouse pan should only scroll the viewport and must not rewrite or recompute relationship geometry') &&
    systemHealthBrowser.includes('const selectRelationshipForStyle = async (label) => {') &&
    systemHealthBrowser.includes('[data-mindmap-note-relationship-tool][data-active="false"]') &&
    systemHealthBrowser.includes('relationshipCurveTargetByLabel(label)') &&
    systemHealthBrowser.includes('relationshipLineTargetByLabel(label)') &&
    systemHealthBrowser.includes('selectedRelationshipByLabel') &&
    systemHealthBrowser.includes('data-mindmap-recompute-count') &&
    systemHealthBrowser.includes('data-mindmap-node-dates') &&
    systemHealthBrowser.includes('data-mindmap-note-relationship-screen-control-point') &&
    systemHealthBrowser.includes('data-mindmap-note-relationship-screen-control-arm'),
);

check(
  'Bundle health gate covers useWbsStore dynamic-import regression and Vite vendor chunking',
  packageJson.scripts?.['verify:dev-027g-mindmap-bundle-health'] === 'node scripts/verify-dev-027g-mindmap-bundle-health.mjs' &&
    firestoreSync.includes("import { useWbsStore } from '../store/useWbsStore';") &&
    firestoreSync.includes('useWbsStore.getState().setNodes(nodes);') &&
    !firestoreSync.includes("import('../store/useWbsStore')") &&
    [
      'manualChunks(id)',
      "return 'vendor-firebase'",
      "return 'vendor-supabase'",
      "return 'vendor-editor'",
      "return 'vendor-dnd'",
      "return 'vendor-react'",
      "return 'vendor-icons'",
    ].every(token => viteConfig.includes(token)) &&
    app.includes("import { lazy, Suspense, useEffect, useRef } from 'react';") &&
    [
      "const MindMapView = lazy(() => import('./components/MindMap/MindMapView'))",
      "const BoardView = lazy(() => import('./components/BoardView'))",
      "const GanttView = lazy(() => import('./components/GanttView'))",
      "const CalendarView = lazy(() => import('./components/CalendarView'))",
      "const RecordsView = lazy(() => import('./components/Records/RecordsView'))",
      '<Suspense fallback=',
    ].every(token => app.includes(token)) &&
    [
      "import MindMapView from './components/MindMap/MindMapView'",
      "import BoardView from './components/BoardView'",
      "import GanttView from './components/GanttView'",
      "import CalendarView from './components/CalendarView'",
      "import RecordsView from './components/Records/RecordsView'",
    ].every(token => !app.includes(token)) &&
    [
      'useFirestoreSync uses the existing static useWbsStore import',
      'App code-splits non-home workspace views',
      'production build no longer reports useWbsStore mixed static/dynamic import warning',
      'production build no longer reports chunks larger than 500 kB',
      'production build keeps the initial app chunk below the default Vite 500 kB warning threshold',
      'production build no longer reports circular manual chunks',
      'production build emits explicit vendor chunks',
    ].every(token => bundleHealth.includes(token)),
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
