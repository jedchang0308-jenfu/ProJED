import React from 'react';
import useBoardStore from '../../store/useBoardStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import useDialogStore from '../../store/useDialogStore';
import { toast } from '../../store/useToastStore';
import { useMemberStore } from '../../store/useMemberStore';
import { useTaskFilterStore } from '../../store/useTaskFilterStore';
import type { TaskNode } from '../../types';
import type { TaskActionId } from '../../interactions/task/types';
import { resolveTaskMenu } from '../../interactions/task/resolveTaskInteraction';
import MindMapCanvasShell from './MindMapCanvasShell';
import MindMapConnectorOverlay from './MindMapConnectorOverlay';
import MindMapDragPreviewBadge from './MindMapDragPreviewBadge';
import MindMapDragPreviewLayer, { type MindMapDragPreviewModel } from './MindMapDragPreviewLayer';
import { projectTaskFilterResults } from '../../features/taskFilters';
import { TaskFilterResultState } from '../ui/TaskFilterResultState';
import { buildExpandedProjectionTasks, buildProjectionParentIndex } from '../../features/taskTracking/model';
import { primaryPlacementId } from '../../features/taskTracking/model';
import MindMapNode, {
  type MindMapDirection,
  type MindMapDropMode,
  type MindMapDropTarget,
  type MindMapQuickCreateIntent,
} from './MindMapNode';
import MindMapRelationshipInteractionLayer from './MindMapRelationshipInteractionLayer';
import MindMapRelationshipOverlay from './MindMapRelationshipOverlay';
import MindMapRootLayout from './MindMapRootLayout';
import MindMapRelationshipStyleLayer from './MindMapRelationshipStyleLayer';
import MindMapToolbar from './MindMapToolbar';
import MindMapContextMenu, { type MindMapContextMenuState } from './MindMapContextMenu';
import MindMapBatchAssignmentPicker from './MindMapBatchAssignmentPicker';
import { isPrimaryPointerActivation } from '../../interactions/pointerActivation';
import {
  createInsertionPreview as createDragInsertionPreview,
  createPreviewConnectorPath as createDragPreviewConnectorPath,
  getDropModeFromPointer,
  setTransparentDragImage,
  updateDragPreviewPointerPosition,
} from './mindMapDrag';
import {
  getAnchorForElement as getAnchorForElementFromClient,
  getElementWorldRect,
  getMindMapCoordinateMapper,
  getMindMapSceneSize,
  getMindMapViewportSnapshot,
  getNodeElementAtPoint as getNodeElementAtPointInSurface,
  getWorldPointFromClient,
} from './mindMapDomGeometry';
import {
  clampMindMapScroll,
  deriveMindMapSceneLayout,
  getAnchoredMindMapScroll,
} from './mindMapCoordinateSystem';
import {
  getMindMapCenterDropUpdate,
  getMindMapNodeDropResult,
  getMindMapSideDropUpdate,
} from './mindMapDropCommands';
import {
  MINDMAP_CONTENT_BOUNDS_SELECTOR,
  MINDMAP_NODE_DIRECTION_ATTRIBUTE,
  getMindMapCenterElement,
  getMindMapNodeElement,
  getMindMapNodeId,
  isMindMapRelationshipInteractionElement,
} from './mindMapDomSelectors';
import { MINDMAP_MESSAGES, getMindMapArchiveTaskConfirmMessage } from './mindMapMessages';
import {
  makeRelationshipDraftPreview,
  type MindMapConnectorPath,
  type MindMapLayoutRect,
  type MindMapNoteRelationship,
  type MindMapRelationshipDraftPreview,
  type MindMapRelationshipPath,
  type MindMapRelationshipPoint,
  type MindMapRelationshipStyle,
} from './mindMapGeometry';
import {
  cancelPendingAnimationFrameRef,
  clearPendingTimeoutRef,
  scheduleCoalescedAnimationFrame,
} from './mindMapFrameScheduler';
import {
  addMindMapExpandedNodeId,
  addMindMapExpandedNodeIds,
  getMindMapExpansionPath,
  pruneMindMapExpandedNodeIds,
  toggleMindMapExpandedNodeId,
} from './mindMapExpansion';
import { buildMindMapOverlayPaths } from './mindMapOverlayPaths';
import {
  getMindMapKeyboardAction,
  isMindMapDeleteKey,
  isMindMapQuickTitleEditingTarget,
  isMindMapRelationshipLabelEditKey,
  isMindMapTextEditingTarget,
} from './mindMapKeyboard';
import {
  getMindMapContentStyle,
  getMindMapSceneTransformStyle,
  getMindMapStageStyle,
} from './mindMapLayoutStyle';
import {
  DEFAULT_MINDMAP_RELATIONSHIP_LABEL,
  appendMindMapNoteRelationship,
  createMindMapNoteRelationship,
  findExistingNoteRelationship,
  getCommittedMindMapRelationshipLabel,
  getMindMapRelationshipLabelDraft,
  getRelationshipEndpointNodeId,
  isValidRelationshipEndpoint,
  removeRelationshipById,
  removeRelationshipsForInvalidEndpoints,
  resetRelationshipStyleById,
  retargetRelationshipEndpointById,
  updateRelationshipControlPointById,
  updateRelationshipEndpointAnchorById,
  updateRelationshipLabelById,
  updateRelationshipStyleById,
  type MindMapRelationshipPointerHandle,
} from './mindMapRelationshipCommands';
import { loadNoteRelationships, sanitizeNoteRelationshipsForBoard, saveNoteRelationships } from './mindMapRelationshipStorage';
import {
  DEFAULT_MINDMAP_TASK_TITLE,
  createMindMapTaskNode,
  getMindMapArchiveTaskPlan,
  getMindMapChildTaskCreatePlan,
  getCommittedMindMapTitle,
  getMindMapSiblingTaskCreatePlan,
  getNextMindMapRootOrder,
} from './mindMapTaskCommands';
import {
  buildMindMapNavigationIndex,
  getMindMapHorizontalSelection,
  getMindMapVerticalSelection,
} from './mindMapNavigation';
import {
  createMindMapSelectionStore,
  type MindMapSelectionStore,
} from './mindMapSelectionStore';
import {
  getClientRectBounds,
  getMindMapMarqueeHits,
  getMindMapMarqueeOverlayStyle,
  getMindMapMarqueePrimary,
  hasReachedMindMapMarqueeThreshold,
  type MindMapMarqueeNodeCenter,
} from './mindMapMarquee';
import {
  applyMiddleMousePanFrame,
  clearMiddleMousePanTelemetry,
  createMiddleMousePanState,
  markMiddleMousePanActive,
  updateMiddleMousePanPointer,
  type MiddleMousePanState,
} from './mindMapPan';
import {
  getMindMapChildren,
  getMindMapRootNodes,
  getMindMapRootAncestorId,
  splitRootNodes,
  type SideOverrides,
} from './mindMapTree';
import { loadSideOverrides, persistSideOverridesWithReadback, saveSideOverrides } from './mindMapSideStorage';
import {
  collectMindMapForestTaskIds,
  createMindMapCopyClipboard,
  createMindMapCutClipboard,
  normalizeMindMapForestRoots,
  planMindMapCopyPasteAfter,
  planMindMapCutPasteAfter,
  type MindMapClipboard,
} from './mindMapClipboard';
import {
  centerMindMapContent as centerMindMapViewportContent,
  getFitZoomForBounds,
  getMindMapContentBounds as getMindMapViewportContentBounds,
  type MindMapContentCenterReason,
} from './mindMapViewport';
import {
  createMindMapZoomIntent,
  ZOOM_BUTTON_STEP,
  clampZoom,
  formatZoomLevel,
  getWheelZoomDelta,
  syncCommittedZoomTelemetry,
  type MindMapZoomAnchor,
} from './mindMapZoom';
import {
  clearTaskSelection,
  CLEAR_TASK_SELECTION_EVENT,
  openTaskDetails,
  START_MINDMAP_RELATIONSHIP_EVENT,
} from '../../utils/taskInteractions';

type RootSideDropTarget = MindMapDirection | null;

interface MindMapRelationshipDraft {
  fromId: string;
}

interface RelationshipPointerDragState {
  relationshipId: string;
  handle: MindMapRelationshipPointerHandle;
  initialRelationship: MindMapNoteRelationship;
  fallbackControlPoints: readonly [MindMapRelationshipPoint, MindMapRelationshipPoint];
}

interface MindMapMarqueeSession {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  centers: readonly MindMapMarqueeNodeCenter[];
  previousPlacementIds: readonly string[];
  previousPrimaryPlacementId: string | null;
  active: boolean;
}

type MindMapLocalMenuState = MindMapContextMenuState & Readonly<{
  selectedPlacementIds: readonly string[];
}>;

const createMindMapClipboardEntityId = (prefix: string) => (
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
);

const MINDMAP_CONTEXT_ACTION_IDS = resolveTaskMenu({
  interactionId: 'mindmap-local-context-menu',
  location: { hostMode: 'mindmap', origin: 'mode-primary' },
  surfaceId: 'mindmap.node',
  taskId: 'mindmap-selection',
  nodeRole: 'task',
  modality: 'fine-pointer',
  transientOwners: [],
  blockers: [],
});

const cloneMindMapRelationship = (relationship: MindMapNoteRelationship): MindMapNoteRelationship => ({
  ...relationship,
  style: relationship.style ? { ...relationship.style } : undefined,
  geometry: relationship.geometry ? {
    ...relationship.geometry,
    fromAnchor: relationship.geometry.fromAnchor ? { ...relationship.geometry.fromAnchor } : undefined,
    toAnchor: relationship.geometry.toAnchor ? { ...relationship.geometry.toAnchor } : undefined,
    controlPoints: relationship.geometry.controlPoints?.map(point => ({ ...point })),
  } : undefined,
});

interface DragPreviewState extends MindMapDragPreviewModel {
  x: number;
  y: number;
  title: string;
}

type MindMapGeometryDirtyReason =
  | 'initial'
  | 'node-set'
  | 'node-resize'
  | 'font-load'
  | 'expansion'
  | 'filter'
  | 'date-visibility'
  | 'root-side'
  | 'drop-commit'
  | 'relationship-edit'
  | 'viewport-layout';

const MINDMAP_POINTER_QUICK_TITLE_DELAY_MS = 240;
const isDev075ProbeEnabled = () => {
  if (typeof window === 'undefined') return false;
  const phase = new URLSearchParams(window.location.search).get('dev075Phase');
  return phase === 'baseline' || phase === 'after';
};

const MindMapView: React.FC = () => {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoard = useBoardStore(state => state.getActiveBoard());
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const nodes = useWbsStore(state => state.nodes);
  const dependencies = useWbsStore(state => state.dependencies);
  const trackingReferences = useWbsStore(state => state.trackingReferences);
  const taskLoading = useWbsStore(state => state.loading);
  const taskLoadError = useWbsStore(state => state.error);
  const parentNodesIndex = useWbsStore(state => state.parentNodesIndex);
  const projectionTasks = React.useMemo(
    () => buildExpandedProjectionTasks(Object.values(nodes), trackingReferences, activeBoardId || ''),
    [activeBoardId, nodes, trackingReferences],
  );
  const projectionNodes = React.useMemo(
    () => Object.fromEntries(projectionTasks.map(task => [task.id, task])),
    [projectionTasks],
  );
  const getCanonicalTaskId = React.useCallback((nodeId: string) => (
    projectionNodes[nodeId]?.canonicalTaskId || nodeId
  ), [projectionNodes]);
  const projectionParentNodesIndex = React.useMemo(
    () => buildProjectionParentIndex(projectionTasks),
    [projectionTasks],
  );
  const addNode = useWbsStore(state => state.addNode);
  const updateNode = useWbsStore(state => state.updateNode);
  const moveTrackingReference = useWbsStore(state => state.moveTrackingReference);
  const archiveTask = useWbsStore(state => state.archiveNode);
  const commitNodeBatch = useWbsStore(state => state.commitNodeBatch);
  const commitNodeForestCreate = useWbsStore(state => state.commitNodeForestCreate);
  const recoverNodeBatch = useWbsStore(state => state.recoverNodeBatch);
  const getNodeLockStatus = useWbsStore(state => state.getNodeLockStatus);
  const taskFilters = useTaskFilterStore(state => state.filters);
  const resetTaskFilters = useTaskFilterStore(state => state.resetFilters);
  const showStartDate = useBoardStore(state => state.showStartDate);
  const setSelectedTaskId = useBoardStore(state => state.setSelectedTaskId);
  const boardMembers = useMemberStore(state => state.boardMembers);
  const membersLoading = useMemberStore(state => state.loading);
  const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, canManageTaskReference, canAssignTask, canCreateDependency, isReadOnly } = useBoardPermissions();

  const [selectionStore] = React.useState<MindMapSelectionStore>(() => createMindMapSelectionStore());
  const dev075ProbeEnabled = React.useMemo(() => isDev075ProbeEnabled(), []);
  const [inlineTitleEditNodeId, setInlineTitleEditNodeId] = React.useState<string | null>(null);
  const [inlineTitleEditFocusNodeId, setInlineTitleEditFocusNodeId] = React.useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<Set<string>>(() => new Set());
  const [draggedNodeId, setDraggedNodeId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<MindMapDropTarget | null>(null);
  const [rootSideDropTarget, setRootSideDropTarget] = React.useState<RootSideDropTarget>(null);
  const [sideOverrides, setSideOverrides] = React.useState<SideOverrides>({});
  const [sideOverridesLoadedBoardId, setSideOverridesLoadedBoardId] = React.useState<string | null>(null);
  const [connectorPaths, setConnectorPaths] = React.useState<MindMapConnectorPath[]>([]);
  const [noteRelationships, setNoteRelationships] = React.useState<MindMapNoteRelationship[]>([]);
  const [noteRelationshipsLoadedBoardId, setNoteRelationshipsLoadedBoardId] = React.useState<string | null>(null);
  const [relationshipPaths, setRelationshipPaths] = React.useState<MindMapRelationshipPath[]>([]);
  const [relationshipToolActive, setRelationshipToolActive] = React.useState(false);
  const [relationshipDraft, setRelationshipDraft] = React.useState<MindMapRelationshipDraft | null>(null);
  const [relationshipDraftPreview, setRelationshipDraftPreview] = React.useState<MindMapRelationshipDraftPreview | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = React.useState<string | null>(null);
  const [hoveredRelationshipId, setHoveredRelationshipId] = React.useState<string | null>(null);
  const [editingRelationshipId, setEditingRelationshipId] = React.useState<string | null>(null);
  const [editingRelationshipLabel, setEditingRelationshipLabel] = React.useState('');
  const [relationshipPointerDrag, setRelationshipPointerDrag] = React.useState<RelationshipPointerDragState | null>(null);
  const [dragPreview, setDragPreview] = React.useState<DragPreviewState | null>(null);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const [clipboard, setClipboard] = React.useState<MindMapClipboard | null>(null);
  const [localMenu, setLocalMenu] = React.useState<MindMapLocalMenuState | null>(null);
  const [assignmentOpen, setAssignmentOpen] = React.useState(false);
  const [batchRecoveryMessage, setBatchRecoveryMessage] = React.useState<string | null>(null);
  const mindMapViewRef = React.useRef<HTMLDivElement>(null);
  const mapSurfaceRef = React.useRef<HTMLDivElement>(null);
  const mapStageRef = React.useRef<HTMLDivElement>(null);
  const mapContentRef = React.useRef<HTMLDivElement>(null);
  const nodeElementRegistryRef = React.useRef(new Map<string, HTMLElement>());
  const marqueeOverlayRef = React.useRef<HTMLDivElement>(null);
  const marqueeSessionRef = React.useRef<MindMapMarqueeSession | null>(null);
  const marqueeFrameRef = React.useRef<number | null>(null);
  const suppressNextSurfaceClickRef = React.useRef(false);
  const navigationNodeIdsRef = React.useRef<readonly string[]>([]);
  const pendingNodeFocusFrameRef = React.useRef<number | null>(null);
  const viewRenderCountRef = React.useRef(0);
  const navigationIndexBuildCountRef = React.useRef(0);
  const relationshipLabelInputRef = React.useRef<HTMLInputElement>(null);
  const middleMousePanRef = React.useRef<MiddleMousePanState | null>(null);
  const middleMousePanFrameRef = React.useRef<number | null>(null);
  const zoomLabelRef = React.useRef<HTMLSpanElement>(null);
  const zoomLevelRef = React.useRef(zoomLevel);
  const pointerQuickTitleTimerRef = React.useRef<number | null>(null);
  const autoCenteredBoardRef = React.useRef<string | null>(null);
  const selectionBoardRef = React.useRef<string | null>(null);
  const initialSelectionBoardRef = React.useRef<string | null>(null);
  const expansionBoardRef = React.useRef<string | null>(null);
  const connectorRecomputeCountRef = React.useRef(0);
  const connectorRecomputeFrameRef = React.useRef<number | null>(null);
  const geometryDirtyReasonsRef = React.useRef<Set<MindMapGeometryDirtyReason>>(new Set());
  const pendingZoomIntentRef = React.useRef<ReturnType<typeof createMindMapZoomIntent> | null>(null);
  const zoomIntentFrameRef = React.useRef<number | null>(null);
  const sceneLayoutRef = React.useRef(deriveMindMapSceneLayout({ width: 1, height: 1 }, { width: 1, height: 1 }, zoomLevel));
  const [sceneSize, setSceneSize] = React.useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = React.useState({ width: 1, height: 1 });
  const sceneLayout = React.useMemo(
    () => deriveMindMapSceneLayout(sceneSize, viewportSize, zoomLevel),
    [sceneSize, viewportSize, zoomLevel],
  );
  React.useLayoutEffect(() => {
    sceneLayoutRef.current = sceneLayout;
  }, [sceneLayout]);
  const mapContentStyle = React.useMemo(() => getMindMapContentStyle(), []);
  const stageStyle = React.useMemo(() => getMindMapStageStyle(sceneLayout), [sceneLayout]);
  const sceneStyle = React.useMemo(() => getMindMapSceneTransformStyle(sceneLayout), [sceneLayout]);

  const getCurrentCoordinateMapper = React.useCallback(() => {
    const surface = mapSurfaceRef.current;
    const scene = mapContentRef.current;
    if (!surface || !scene) return null;
    return getMindMapCoordinateMapper(scene, sceneLayoutRef.current, getMindMapViewportSnapshot(surface));
  }, []);

  const boardId = activeBoardId || '';

  const getPlacementIdForNodeId = React.useCallback((nodeId: string) => (
    projectionNodes[nodeId]?.trackingReferenceId || primaryPlacementId(nodeId)
  ), [projectionNodes]);

  const getNodeIdForPlacementId = React.useCallback((placementId: string | null) => {
    if (!placementId) return null;
    return placementId.startsWith('primary:') ? placementId.slice('primary:'.length) : placementId;
  }, []);

  const closeLocalMenu = React.useCallback((restoreAnchorFocus = false) => {
    setAssignmentOpen(false);
    setLocalMenu(current => {
      if (restoreAnchorFocus && current) {
        const nodeId = getNodeIdForPlacementId(current.anchorPlacementId);
        if (nodeId) window.requestAnimationFrame(() => nodeElementRegistryRef.current.get(nodeId)?.focus({ preventScroll: true }));
      }
      return null;
    });
  }, [getNodeIdForPlacementId]);

  const syncDev075ProbeAttributes = React.useCallback(() => {
    const element = mindMapViewRef.current;
    if (!element || !dev075ProbeEnabled) return;
    const diagnostics = selectionStore.getDiagnostics();
    element.setAttribute('data-mindmap-view-render-count', String(viewRenderCountRef.current));
    element.setAttribute('data-mindmap-selection-commit-count', String(diagnostics.commitCount));
    element.setAttribute('data-mindmap-selection-notification-count', String(diagnostics.notifiedNodeCount));
    element.setAttribute('data-mindmap-navigation-index-build-count', String(navigationIndexBuildCountRef.current));
  }, [dev075ProbeEnabled, selectionStore]);

  React.useLayoutEffect(() => {
    viewRenderCountRef.current += 1;
    syncDev075ProbeAttributes();
  });

  const cancelPendingNodeFocus = React.useCallback(() => {
    cancelPendingAnimationFrameRef(pendingNodeFocusFrameRef);
  }, []);

  const scheduleNodeFocus = React.useCallback((nodeId: string) => {
    cancelPendingNodeFocus();
    pendingNodeFocusFrameRef.current = window.requestAnimationFrame(() => {
      pendingNodeFocusFrameRef.current = null;
      if (selectionStore.getPrimaryPlacementId() !== getPlacementIdForNodeId(nodeId)) return;
      const element = nodeElementRegistryRef.current.get(nodeId);
      if (!element || document.activeElement === element) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (
        isMindMapTextEditingTarget(activeElement) ||
        activeElement.closest('[role="dialog"], [data-task-details-modal="true"]')
      )) return;
      if (element.getAttribute('data-mindmap-inline-title-editing') === 'true' &&
          element.querySelector('[data-mindmap-quick-title-input="true"]')) return;
      element.focus({ preventScroll: true });
    });
  }, [cancelPendingNodeFocus, getPlacementIdForNodeId, selectionStore]);

  const handleNodeElementChange = React.useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element) {
      nodeElementRegistryRef.current.set(nodeId, element);
      return;
    }
    nodeElementRegistryRef.current.delete(nodeId);
  }, []);

  const clearRelationshipLabelEdit = React.useCallback(() => {
    setEditingRelationshipId(null);
    setEditingRelationshipLabel('');
  }, []);

  const clearSelectedRelationship = React.useCallback(() => {
    setSelectedRelationshipId(null);
    clearRelationshipLabelEdit();
  }, [clearRelationshipLabelEdit]);

  const clearRelationshipDraftPreview = React.useCallback(() => {
    setRelationshipDraftPreview(null);
  }, []);

  const clearRelationshipDraft = React.useCallback(() => {
    setRelationshipDraft(null);
    clearRelationshipDraftPreview();
  }, [clearRelationshipDraftPreview]);

  const startRelationshipDraftFromNode = React.useCallback((nodeId: string) => {
    setRelationshipDraft({ fromId: nodeId });
    clearRelationshipDraftPreview();
  }, [clearRelationshipDraftPreview]);

  const clearRelationshipPointerDrag = React.useCallback(() => {
    setRelationshipPointerDrag(null);
  }, []);

  const cancelRelationshipPointerDrag = React.useCallback(() => {
    if (!relationshipPointerDrag) return;
    const initialRelationship = relationshipPointerDrag.initialRelationship;
    setNoteRelationships(prev => prev.map(item => item.id === initialRelationship.id ? initialRelationship : item));
    setRelationshipPointerDrag(null);
  }, [relationshipPointerDrag]);

  const finishRelationshipDraftMode = React.useCallback(() => {
    setRelationshipToolActive(false);
    clearRelationshipDraft();
  }, [clearRelationshipDraft]);

  const hoverRelationship = React.useCallback((relationshipId: string) => {
    setHoveredRelationshipId(relationshipId);
  }, []);

  const clearRelationshipHover = React.useCallback((relationshipId?: string) => {
    setHoveredRelationshipId(prev => relationshipId && prev !== relationshipId ? prev : null);
  }, []);

  const deactivateRelationshipMode = React.useCallback((options?: { clearPointerDrag?: boolean }) => {
    finishRelationshipDraftMode();
    clearSelectedRelationship();
    clearRelationshipHover();
    if (options?.clearPointerDrag) {
      clearRelationshipPointerDrag();
    }
  }, [clearRelationshipHover, clearRelationshipPointerDrag, clearSelectedRelationship, finishRelationshipDraftMode]);

  const selectRelationship = React.useCallback((relationshipId: string) => {
    clearPendingTimeoutRef(pointerQuickTitleTimerRef);
    cancelPendingNodeFocus();
    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    setSelectedRelationshipId(relationshipId);
    selectionStore.setSelectedNodeId(null);
    syncDev075ProbeAttributes();
  }, [cancelPendingNodeFocus, selectionStore, syncDev075ProbeAttributes]);

  const cancelPointerQuickTitleRequest = React.useCallback(() => {
    clearPendingTimeoutRef(pointerQuickTitleTimerRef);
  }, []);

  const selectNode = React.useCallback((nodeId: string | null) => {
    // Keep the inline editor alive when the newly-created node receives focus
    // and re-dispatches selection. Selecting a different node still exits edit
    // mode so the editor never remains attached to a stale task.
    cancelPointerQuickTitleRequest();
    setInlineTitleEditNodeId(editingNodeId => editingNodeId && editingNodeId !== nodeId ? null : editingNodeId);
    const placementId = nodeId ? getPlacementIdForNodeId(nodeId) : null;
    const change = selectionStore.setSelectedNodeId(placementId);
    syncDev075ProbeAttributes();
    if (change.changed && nodeId) scheduleNodeFocus(nodeId);
    if (change.changed && !nodeId) cancelPendingNodeFocus();
    setSelectedRelationshipId(null);
  }, [cancelPendingNodeFocus, cancelPointerQuickTitleRequest, getPlacementIdForNodeId, scheduleNodeFocus, selectionStore, syncDev075ProbeAttributes]);

  const hideMarqueeOverlay = React.useCallback(() => {
    const overlay = marqueeOverlayRef.current;
    if (overlay) overlay.style.display = 'none';
  }, []);

  const cancelMarquee = React.useCallback((restoreSelection = true) => {
    const session = marqueeSessionRef.current;
    cancelPendingAnimationFrameRef(marqueeFrameRef);
    marqueeSessionRef.current = null;
    hideMarqueeOverlay();
    if (session?.active && restoreSelection) {
      selectionStore.setSelection(session.previousPlacementIds, session.previousPrimaryPlacementId);
      syncDev075ProbeAttributes();
    }
  }, [hideMarqueeOverlay, selectionStore, syncDev075ProbeAttributes]);

  const applyMarqueeFrame = React.useCallback(() => {
    marqueeFrameRef.current = null;
    const session = marqueeSessionRef.current;
    const surface = mapSurfaceRef.current;
    const overlay = marqueeOverlayRef.current;
    if (!session || !surface || !overlay) return;
    if (!session.active && !hasReachedMindMapMarqueeThreshold(session.start, session.current)) return;
    session.active = true;
    const bounds = getClientRectBounds(session.start, session.current);
    const hits = getMindMapMarqueeHits(bounds, session.centers);
    const hitPlacementIds = hits.map(hit => hit.placementId);
    const navigationPlacementIds = navigationNodeIdsRef.current.map(getPlacementIdForNodeId);
    const primary = getMindMapMarqueePrimary(
      hitPlacementIds,
      session.previousPrimaryPlacementId,
      navigationPlacementIds,
    );
    selectionStore.setSelection(hitPlacementIds, primary);
    syncDev075ProbeAttributes();
    const style = getMindMapMarqueeOverlayStyle(bounds);
    Object.assign(overlay.style, {
      display: 'block',
      left: `${style.left}px`,
      top: `${style.top}px`,
      width: `${style.width}px`,
      height: `${style.height}px`,
    });
  }, [getPlacementIdForNodeId, selectionStore, syncDev075ProbeAttributes]);

  const handleMarqueePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0
      || !event.isPrimary
      || event.pointerType === 'touch'
      || relationshipToolActive
      || relationshipPointerDrag
      || draggedNodeId
      || inlineTitleEditNodeId
      || useDialogStore.getState().isOpen
    ) return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      isMindMapRelationshipInteractionElement(target)
      || target?.closest([
        '[data-mindmap-node]',
        '[data-mindmap-center]',
        '[data-mindmap-toggle]',
        '[data-mindmap-relationship-interaction]',
        '[data-mindmap-relationship-handle]',
        '[data-task-assignment-picker]',
      ].join(','))
    ) return;

    event.preventDefault();
    closeLocalMenu(false);
    cancelMarquee(false);
    const centers = [...nodeElementRegistryRef.current.entries()].flatMap(([nodeId, element]) => {
      if (!element.isConnected) return [];
      const rect = element.getBoundingClientRect();
      const placementId = element.getAttribute('data-task-placement-id') || getPlacementIdForNodeId(nodeId);
      return [{
        nodeId,
        placementId,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }];
    });
    marqueeSessionRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      centers,
      previousPlacementIds: [...selectionStore.getSelectedPlacementIds()],
      previousPrimaryPlacementId: selectionStore.getPrimaryPlacementId(),
      active: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic QA pointer events and older browsers may not own an active pointer.
      // The window-level cancel paths still make the marquee session safe to unwind.
    }
  }, [cancelMarquee, closeLocalMenu, draggedNodeId, getPlacementIdForNodeId, inlineTitleEditNodeId, relationshipPointerDrag, relationshipToolActive, selectionStore]);

  const handleMarqueePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.current = { x: event.clientX, y: event.clientY };
    if (hasReachedMindMapMarqueeThreshold(session.start, session.current)) event.preventDefault();
    if (marqueeFrameRef.current === null) {
      marqueeFrameRef.current = window.requestAnimationFrame(applyMarqueeFrame);
    }
  }, [applyMarqueeFrame]);

  const handleMarqueePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.current = { x: event.clientX, y: event.clientY };
    cancelPendingAnimationFrameRef(marqueeFrameRef);
    applyMarqueeFrame();
    const committed = Boolean(marqueeSessionRef.current?.active);
    marqueeSessionRef.current = null;
    hideMarqueeOverlay();
    if (committed) {
      suppressNextSurfaceClickRef.current = true;
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer ownership may already have been released by the browser.
    }
  }, [applyMarqueeFrame, hideMarqueeOverlay]);

  const handleMarqueePointerCancel = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    cancelMarquee(true);
  }, [cancelMarquee]);

  const commitInlineTitleEdit = React.useCallback((nodeId: string, title: string, restoreNodeFocus = false) => {
    if (canEditTask) {
      updateNode(nodeId, { title: getCommittedMindMapTitle(title) });
    }
    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    if (restoreNodeFocus) scheduleNodeFocus(nodeId);
  }, [canEditTask, scheduleNodeFocus, updateNode]);

  const cancelInlineTitleEdit = React.useCallback((nodeId: string, restoreNodeFocus = false) => {
    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    if (restoreNodeFocus) scheduleNodeFocus(nodeId);
  }, [scheduleNodeFocus]);

  const clearSelection = React.useCallback(() => {
    selectNode(null);
    clearSelectedRelationship();
    clearRelationshipDraft();
    clearRelationshipHover();
  }, [clearRelationshipDraft, clearRelationshipHover, clearSelectedRelationship, selectNode]);

  const beginRelationshipDraftSelection = React.useCallback((nodeId: string) => {
    startRelationshipDraftFromNode(nodeId);
    selectNode(nodeId);
  }, [selectNode, startRelationshipDraftFromNode]);

  const beginRelationshipDraftSelectionWithCleanup = React.useCallback((nodeId: string) => {
    if (!canEditTask) return;
    clearRelationshipHover();
    clearRelationshipLabelEdit();
    beginRelationshipDraftSelection(nodeId);
  }, [beginRelationshipDraftSelection, canEditTask, clearRelationshipHover, clearRelationshipLabelEdit]);

  const openRelationshipLabelEdit = React.useCallback((relationshipId: string, label: string) => {
    selectRelationship(relationshipId);
    setEditingRelationshipId(relationshipId);
    setEditingRelationshipLabel(getMindMapRelationshipLabelDraft(label));
  }, [selectRelationship]);

  const expandNodes = React.useCallback((nodeIds: Array<string | null | undefined>) => {
    setExpandedNodeIds(prev => addMindMapExpandedNodeIds(prev, nodeIds));
  }, []);

  const expandNode = React.useCallback((nodeId: string | null | undefined) => {
    setExpandedNodeIds(prev => addMindMapExpandedNodeId(prev, nodeId));
  }, []);

  const toggleNodeExpansion = React.useCallback((nodeId: string) => {
    setExpandedNodeIds(prev => toggleMindMapExpandedNodeId(prev, nodeId));
  }, []);

  React.useEffect(() => {
    mapSurfaceRef.current?.setAttribute('data-mindmap-recompute-count', String(connectorRecomputeCountRef.current));
  }, []);

  React.useEffect(() => {
    zoomLevelRef.current = zoomLevel;
    syncCommittedZoomTelemetry(mapSurfaceRef.current, zoomLabelRef.current, zoomLevel);
  }, [zoomLevel]);

  React.useEffect(() => () => {
    clearPendingTimeoutRef(pointerQuickTitleTimerRef);
    cancelPendingAnimationFrameRef(zoomIntentFrameRef);
    cancelPendingAnimationFrameRef(connectorRecomputeFrameRef);
    cancelPendingAnimationFrameRef(marqueeFrameRef);
  }, []);

  React.useEffect(() => {
    const cancelForViewportChange = () => cancelMarquee(true);
    window.addEventListener('resize', cancelForViewportChange);
    window.addEventListener('blur', cancelForViewportChange);
    return () => {
      window.removeEventListener('resize', cancelForViewportChange);
      window.removeEventListener('blur', cancelForViewportChange);
    };
  }, [cancelMarquee]);

  const filterProjection = React.useMemo(
    () => projectTaskFilterResults(projectionNodes, taskFilters, { boardId }),
    [boardId, projectionNodes, taskFilters],
  );

  const rootNodes = React.useMemo(() => {
    return getMindMapRootNodes(projectionNodes, projectionParentNodesIndex, boardId, filterProjection.visibleTaskIds);
  }, [boardId, filterProjection, projectionNodes, projectionParentNodesIndex]);

  React.useLayoutEffect(() => {
    const surface = mapSurfaceRef.current;
    const scene = mapContentRef.current;
    if (!surface || !scene) return undefined;
    const measure = () => {
      if (marqueeSessionRef.current?.active) cancelMarquee(true);
      setViewportSize({ width: surface.clientWidth, height: surface.clientHeight });
      setSceneSize(getMindMapSceneSize(scene));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    observer.observe(scene);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [boardId, cancelMarquee, rootNodes.length]);

  const rootsBySide = React.useMemo(() => splitRootNodes(rootNodes, sideOverrides), [rootNodes, sideOverrides]);

  React.useEffect(() => {
    setSideOverridesLoadedBoardId(null);
    setSideOverrides(loadSideOverrides(boardId));
    setSideOverridesLoadedBoardId(boardId);
  }, [boardId]);

  React.useEffect(() => {
    if (!boardId) return;
    if (sideOverridesLoadedBoardId !== boardId) return;
    saveSideOverrides(boardId, sideOverrides);
  }, [boardId, sideOverrides, sideOverridesLoadedBoardId]);

  React.useEffect(() => {
    setNoteRelationshipsLoadedBoardId(null);
    setNoteRelationships(loadNoteRelationships(boardId));
    setNoteRelationshipsLoadedBoardId(boardId);
    deactivateRelationshipMode({ clearPointerDrag: true });
  }, [boardId, deactivateRelationshipMode]);

  React.useEffect(() => {
    const handleClearTaskSelection = () => clearSelection();
    document.addEventListener(CLEAR_TASK_SELECTION_EVENT, handleClearTaskSelection);
    return () => document.removeEventListener(CLEAR_TASK_SELECTION_EVENT, handleClearTaskSelection);
  }, [clearSelection]);

  React.useEffect(() => () => {
    cancelPendingNodeFocus();
    // The component owns this store, so an actual unmount releases it with the
    // component. Clearing it here breaks React Strict Mode's effect replay:
    // the initialization guard survives the replay while the selection does not.
  }, [cancelPendingNodeFocus]);

  React.useEffect(() => {
    if (selectionBoardRef.current === boardId) return;
    selectionBoardRef.current = boardId;
    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    selectNode(null);
    setClipboard(null);
    closeLocalMenu(false);
    clearSelectedRelationship();
    clearRelationshipDraft();
  }, [boardId, clearRelationshipDraft, clearSelectedRelationship, closeLocalMenu, selectNode]);

  React.useEffect(() => {
    let active = true;
    setBatchRecoveryMessage(null);
    if (!boardId) return undefined;
    try {
      if (window.sessionStorage.getItem(`projed.mindmap.batch-recovery.v1.${boardId}`)) {
        setBatchRecoveryMessage('正在確認前一筆批次操作結果…');
      }
    } catch {
      setBatchRecoveryMessage('無法讀取批次復原狀態，已暫停新的批次操作。');
    }
    void recoverNodeBatch(boardId).then(outcome => {
      if (!active || !outcome) return;
      if (outcome.status === 'indeterminate') {
        setBatchRecoveryMessage(outcome.error || '前一筆批次操作結果未確認，已暫停新的批次操作。');
      } else if (outcome.status === 'compensated') {
        toast.warning('已還原前一筆未完成的批次操作。');
        setBatchRecoveryMessage(null);
      } else {
        setBatchRecoveryMessage(null);
      }
    });
    return () => { active = false; };
  }, [boardId, recoverNodeBatch]);

  React.useEffect(() => {
    if (!boardId || rootNodes.length === 0 || initialSelectionBoardRef.current === boardId) return;
    initialSelectionBoardRef.current = boardId;
    selectNode(rootNodes[0].id);
  }, [boardId, rootNodes, selectNode]);

  React.useEffect(() => {
    if (!boardId) return;
    if (noteRelationshipsLoadedBoardId !== boardId) return;
    saveNoteRelationships(boardId, noteRelationships);
  }, [boardId, noteRelationships, noteRelationshipsLoadedBoardId]);

  React.useEffect(() => {
    if (!boardId || noteRelationshipsLoadedBoardId !== boardId) return;
    const boardNodes = Object.values(nodes).filter(node => node.boardId === boardId && !node.isArchived);
    if (boardNodes.length === 0) return;
    const validNodeIds = new Set(
      boardNodes.map(node => node.id),
    );
    setNoteRelationships(prev => sanitizeNoteRelationshipsForBoard(boardId, prev, validNodeIds));
  }, [boardId, nodes, noteRelationshipsLoadedBoardId]);

  React.useEffect(() => {
    if (!selectedRelationshipId) return;
    if (noteRelationships.some(relationship => relationship.id === selectedRelationshipId)) return;
    clearSelectedRelationship();
  }, [clearSelectedRelationship, noteRelationships, selectedRelationshipId]);

  React.useEffect(() => {
    const boardNodes = boardId
      ? Object.values(projectionNodes).filter(node => node.boardId === boardId && !node.isArchived)
      : [];
    const validNodeIds = new Set(boardNodes.map(node => node.id));
    const boardChanged = expansionBoardRef.current !== boardId;

    if (boardChanged) {
      // Initialize a newly-entered board once, then keep user collapse choices
      // stable while remote/local node updates arrive for that same board.
      if (boardId && boardNodes.length === 0) return;
      expansionBoardRef.current = boardId;
      setExpandedNodeIds(prev => {
        const next = new Set(validNodeIds);
        if (next.size === prev.size && [...next].every(nodeId => prev.has(nodeId))) return prev;
        return next;
      });
      return;
    }

    setExpandedNodeIds(prev => {
      const next = pruneMindMapExpandedNodeIds(prev, validNodeIds);
      return next;
    });
  }, [boardId, projectionNodes]);

  React.useEffect(() => {
    const validPlacementIds = selectionStore.getSelectedPlacementIds().filter(placementId => {
      const nodeId = getNodeIdForPlacementId(placementId);
      const selectedNode = nodeId ? projectionNodes[nodeId] || nodes[nodeId] : null;
      return Boolean(selectedNode && selectedNode.boardId === boardId && !selectedNode.isArchived);
    });
    if (validPlacementIds.length === selectionStore.getSelectedPlacementIds().length) return;
    selectionStore.setSelection(validPlacementIds);
    syncDev075ProbeAttributes();
  }, [boardId, getNodeIdForPlacementId, nodes, projectionNodes, selectionStore, syncDev075ProbeAttributes]);

  React.useEffect(() => {
    if (!editingRelationshipId) return;
    const frame = window.requestAnimationFrame(() => {
      relationshipLabelInputRef.current?.focus();
      relationshipLabelInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingRelationshipId]);

  const getChildren = React.useCallback((nodeId: string) =>
    getMindMapChildren(projectionNodes, projectionParentNodesIndex, boardId, filterProjection.visibleTaskIds, nodeId),
  [boardId, filterProjection, projectionNodes, projectionParentNodesIndex]);

  const navigationIndex = React.useMemo(() => {
    return buildMindMapNavigationIndex(rootsBySide, expandedNodeIds, getChildren);
  }, [expandedNodeIds, getChildren, rootsBySide]);

  React.useLayoutEffect(() => {
    navigationNodeIdsRef.current = navigationIndex.nodeIds;
  }, [navigationIndex]);

  React.useLayoutEffect(() => {
    if (!dev075ProbeEnabled) return;
    navigationIndexBuildCountRef.current += 1;
    syncDev075ProbeAttributes();
  }, [dev075ProbeEnabled, navigationIndex, syncDev075ProbeAttributes]);

  const getNodeSide = React.useCallback((nodeId: string): MindMapDirection => {
    const rootId = getMindMapRootAncestorId(projectionNodes, nodeId);
    const branch = getMindMapNodeElement(mapContentRef.current, rootId);
    const domDirection = branch?.getAttribute(MINDMAP_NODE_DIRECTION_ATTRIBUTE);
    if (domDirection === 'left' || domDirection === 'right') return domDirection;
    return sideOverrides[rootId] || 'right';
  }, [projectionNodes, sideOverrides]);

  const getLocalRect = React.useCallback((element: HTMLElement): MindMapLayoutRect => {
    const mapper = getCurrentCoordinateMapper();
    if (mapper) return getElementWorldRect(element, mapper);
    return {
      left: 0,
      top: 0,
      right: element.offsetWidth,
      bottom: element.offsetHeight,
      width: element.offsetWidth,
      height: element.offsetHeight,
    };
  }, [getCurrentCoordinateMapper]);

  const updateRootSide = React.useCallback((nodeId: string, direction: MindMapDirection) => {
    setSideOverrides(prev => {
      const stored = loadSideOverrides(boardId);
      const next = { ...stored, ...prev, [nodeId]: direction };
      saveSideOverrides(boardId, next);
      return next;
    });
  }, [boardId]);

  const setNodeDropPreviewTarget = React.useCallback((target: MindMapDropTarget) => {
    setDropTarget(target);
    setRootSideDropTarget(null);
  }, []);

  const setRootDropPreviewTarget = React.useCallback((target: RootSideDropTarget) => {
    setDropTarget(null);
    setRootSideDropTarget(target);
  }, []);

  const clearDragState = React.useCallback(() => {
    setDraggedNodeId(null);
    setDropTarget(null);
    setRootSideDropTarget(null);
    setDragPreview(null);
  }, []);

  const recomputeConnectors = React.useCallback(() => {
    const surface = mapContentRef.current;
    if (!surface) return;
    const reasons = Array.from(geometryDirtyReasonsRef.current).sort();
    geometryDirtyReasonsRef.current.clear();
    if (reasons.length === 0) return;
    connectorRecomputeCountRef.current += 1;
    mapSurfaceRef.current?.setAttribute('data-mindmap-recompute-count', String(connectorRecomputeCountRef.current));
    mapSurfaceRef.current?.setAttribute('data-mindmap-last-geometry-reasons', reasons.join(','));
    const overlayPaths = buildMindMapOverlayPaths({
      surface,
      rootNodes,
      noteRelationships,
      getNodeSide,
      getLocalRect,
    });
    setConnectorPaths(overlayPaths.connectorPaths);
    setRelationshipPaths(overlayPaths.relationshipPaths);
  }, [getLocalRect, getNodeSide, noteRelationships, rootNodes]);

  const markGeometryDirty = React.useCallback((reason: MindMapGeometryDirtyReason) => {
    geometryDirtyReasonsRef.current.add(reason);
    scheduleCoalescedAnimationFrame(connectorRecomputeFrameRef, recomputeConnectors);
  }, [recomputeConnectors]);

  const scheduleConnectorRecompute = React.useCallback(() => {
    markGeometryDirty('relationship-edit');
  }, [markGeometryDirty]);

  React.useLayoutEffect(() => {
    markGeometryDirty('node-set');
  }, [markGeometryDirty, rootsBySide, expandedNodeIds, dropTarget, rootSideDropTarget, relationshipToolActive, relationshipDraft]);

  React.useEffect(() => {
    const surface = mapContentRef.current;
    if (!surface) return undefined;
    const observer = new ResizeObserver(() => {
      if (marqueeSessionRef.current?.active) cancelMarquee(true);
      markGeometryDirty('node-resize');
    });
    const handleResize = () => markGeometryDirty('viewport-layout');
    observer.observe(surface);
    const nodesToObserve = Array.from(surface.querySelectorAll(MINDMAP_CONTENT_BOUNDS_SELECTOR));
    nodesToObserve.forEach(element => observer.observe(element));
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [cancelMarquee, markGeometryDirty, rootNodes.length]);

  React.useEffect(() => {
    const stopPan = () => {
      const surface = mapSurfaceRef.current;
      cancelPendingAnimationFrameRef(middleMousePanFrameRef);
      middleMousePanRef.current = null;
      clearMiddleMousePanTelemetry(surface);
    };
    const tick = () => {
      const pan = middleMousePanRef.current;
      const surface = mapSurfaceRef.current;
      if (!pan || !surface) {
        middleMousePanFrameRef.current = null;
        return;
      }
      applyMiddleMousePanFrame(surface, pan);
      middleMousePanFrameRef.current = window.requestAnimationFrame(tick);
    };
    const handleMouseMove = (event: MouseEvent) => {
      const pan = middleMousePanRef.current;
      if (!pan) return;
      event.preventDefault();
      updateMiddleMousePanPointer(pan, event.clientX, event.clientY);
      if (middleMousePanFrameRef.current === null) {
        middleMousePanFrameRef.current = window.requestAnimationFrame(tick);
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', stopPan);
    window.addEventListener('blur', stopPan);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopPan);
      window.removeEventListener('blur', stopPan);
      stopPan();
    };
  }, []);

  const getDragPreviewConnectorPath = React.useCallback((
    event: React.DragEvent<HTMLElement>,
    targetElement: HTMLElement,
    direction: MindMapDirection,
  ) => {
    const surface = mapContentRef.current;
    const mapper = getCurrentCoordinateMapper();
    if (!surface || !mapper) return '';
    return createDragPreviewConnectorPath(event, targetElement, mapper, direction);
  }, [getCurrentCoordinateMapper]);

  const getDragInsertionPreview = React.useCallback((
    targetElement: HTMLElement,
    targetNode: TaskNode | undefined,
    mode: MindMapDropMode,
    direction: MindMapDirection,
  ): Pick<DragPreviewState, 'connectorPath' | 'insertionPreview'> => {
    const surface = mapContentRef.current;
    const mapper = getCurrentCoordinateMapper();
    if (!surface || !mapper) return {};
    return createDragInsertionPreview(targetElement, targetNode, mode, direction, surface, mapper);
  }, [getCurrentCoordinateMapper]);

  const updateDragPreview = React.useCallback((
    event: React.DragEvent<HTMLElement>,
    patch: Omit<DragPreviewState, 'x' | 'y' | 'title' | 'nodeId'> & Partial<Pick<DragPreviewState, 'title' | 'nodeId'>>,
  ) => {
    const dragged = patch.nodeId
      ? projectionNodes[patch.nodeId] || nodes[patch.nodeId]
      : draggedNodeId
        ? projectionNodes[draggedNodeId] || nodes[draggedNodeId]
        : null;
    if (!dragged) return;
    setDragPreview({
      x: event.clientX,
      y: event.clientY,
      title: patch.title || dragged.title || DEFAULT_MINDMAP_TASK_TITLE,
      nodeId: patch.nodeId || dragged.id,
      ...patch,
    });
  }, [draggedNodeId, nodes, projectionNodes]);

  React.useEffect(() => {
    if (!draggedNodeId) return undefined;
    const handleWindowDragOver = (event: DragEvent) => {
      setDragPreview(prev => {
        if (!prev) return prev;
        if (prev.insertionPreview) {
          return updateDragPreviewPointerPosition(prev, event);
        }
        let connectorPath = prev.connectorPath;
        const direction = prev.direction || 'right';
        const targetElement = prev.targetNodeId
          ? getMindMapNodeElement(document, prev.targetNodeId)
          : getMindMapCenterElement(document);
        const mapper = getCurrentCoordinateMapper();
        if (targetElement && mapper) {
          connectorPath = createDragPreviewConnectorPath(event, targetElement, mapper, direction);
        }
        return updateDragPreviewPointerPosition({ ...prev, connectorPath }, event);
      });
    };
    window.addEventListener('dragover', handleWindowDragOver);
    return () => window.removeEventListener('dragover', handleWindowDragOver);
  }, [draggedNodeId, getCurrentCoordinateMapper]);

  const createTask = React.useCallback((
    parentId: string | null,
    order: number,
    title = DEFAULT_MINDMAP_TASK_TITLE,
  ) => {
    if (!canCreateTask || !activeWorkspaceId || !boardId) {
      toast.warning(MINDMAP_MESSAGES.noCreateTaskPermission);
      return null;
    }

    const node = createMindMapTaskNode({
      workspaceId: activeWorkspaceId,
      boardId,
      parentId,
      title,
      order,
    });
    addNode(node);
    selectNode(node.id);
    const expansionPath = getMindMapExpansionPath(nodes, parentId, boardId);
    expandNodes([...expansionPath, node.id]);
    if (canEditTask) {
      setInlineTitleEditNodeId(node.id);
      setInlineTitleEditFocusNodeId(node.id);
    }
    return node;
  }, [activeWorkspaceId, addNode, boardId, canCreateTask, canEditTask, expandNodes, nodes, selectNode]);

  const handleCreateRoot = React.useCallback(() => {
    createTask(null, getNextMindMapRootOrder(rootNodes));
  }, [createTask, rootNodes]);

  const getMindMapContentBounds = React.useCallback(() => {
    const content = mapContentRef.current;
    const mapper = getCurrentCoordinateMapper();
    if (!content || !mapper) return null;
    return getMindMapViewportContentBounds(content, mapper);
  }, [getCurrentCoordinateMapper]);

  const centerMindMapContent = React.useCallback((reason: MindMapContentCenterReason = 'repair') => {
    const surface = mapSurfaceRef.current;
    const bounds = getMindMapContentBounds();
    if (!surface || !bounds) return false;
    return centerMindMapViewportContent(surface, bounds, sceneLayoutRef.current, reason);
  }, [getMindMapContentBounds]);

  const flushPendingZoomIntent = React.useCallback(() => {
    const intent = pendingZoomIntentRef.current;
    const surface = mapSurfaceRef.current;
    if (!intent || !surface) return;
    const viewport = getMindMapViewportSnapshot(surface);
    if (intent.anchor) {
      const rawScroll = getAnchoredMindMapScroll(
        intent.anchor.world,
        { x: intent.anchor.clientX, y: intent.anchor.clientY },
        sceneLayoutRef.current,
        viewport,
      );
      const clamped = clampMindMapScroll(rawScroll, sceneLayoutRef.current, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
      surface.scrollLeft = clamped.left;
      surface.scrollTop = clamped.top;
    } else if (intent.centerContent) {
      centerMindMapContent('fit');
    }
    pendingZoomIntentRef.current = null;
  }, [centerMindMapContent]);

  React.useLayoutEffect(() => {
    flushPendingZoomIntent();
  }, [flushPendingZoomIntent, sceneLayout, zoomLevel]);

  const commitZoom = React.useCallback((
    nextZoom: number,
    anchor?: MindMapZoomAnchor | null,
    afterCommit: 'preserve-anchor' | 'center-content' = 'preserve-anchor',
  ) => {
    cancelMarquee(true);
    const targetZoom = clampZoom(nextZoom);
    const previousZoom = zoomLevelRef.current;
    pendingZoomIntentRef.current = createMindMapZoomIntent(
      targetZoom,
      anchor ?? null,
      afterCommit === 'center-content',
    );
    zoomLevelRef.current = targetZoom;
    setZoomLevel(targetZoom);
    if (previousZoom === targetZoom) {
      scheduleCoalescedAnimationFrame(zoomIntentFrameRef, flushPendingZoomIntent);
    }
  }, [cancelMarquee, flushPendingZoomIntent]);

  const setZoom = React.useCallback((nextZoom: number) => {
    commitZoom(nextZoom, null, 'center-content');
  }, [commitZoom]);

  const zoomOut = React.useCallback(() => {
    setZoom(zoomLevelRef.current - ZOOM_BUTTON_STEP);
  }, [setZoom]);

  const zoomIn = React.useCallback(() => {
    setZoom(zoomLevelRef.current + ZOOM_BUTTON_STEP);
  }, [setZoom]);

  const resetZoom = React.useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  const handleWheelZoom = React.useCallback((event: WheelEvent) => {
    if (marqueeSessionRef.current?.active) cancelMarquee(true);
    if (!event.ctrlKey && !event.metaKey) return;
    const surface = mapSurfaceRef.current;
    const mapper = getCurrentCoordinateMapper();
    if (!surface || !mapper) return;
    event.preventDefault();
    const currentIntent = pendingZoomIntentRef.current;
    const anchor = currentIntent?.anchor || {
      clientX: event.clientX,
      clientY: event.clientY,
      world: mapper.clientToWorld({ x: event.clientX, y: event.clientY }),
    };
    const targetZoom = clampZoom((currentIntent?.targetZoom || zoomLevelRef.current) + getWheelZoomDelta(event.deltaY));
    pendingZoomIntentRef.current = createMindMapZoomIntent(targetZoom, anchor, false);
    scheduleCoalescedAnimationFrame(zoomIntentFrameRef, () => {
      const intent = pendingZoomIntentRef.current;
      if (!intent) return;
      zoomLevelRef.current = intent.targetZoom;
      setZoomLevel(intent.targetZoom);
    });
  }, [cancelMarquee, getCurrentCoordinateMapper]);

  React.useEffect(() => {
    const surface = mapSurfaceRef.current;
    if (!surface) return undefined;
    const options = { passive: false } as AddEventListenerOptions;
    surface.addEventListener('wheel', handleWheelZoom, options);
    return () => surface.removeEventListener('wheel', handleWheelZoom, options);
  }, [handleWheelZoom]);

  const startMiddleMousePan = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const surface = mapSurfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    middleMousePanRef.current = createMiddleMousePanState(event.clientX, event.clientY);
    markMiddleMousePanActive(surface);
    surface.focus({ preventScroll: true });
  }, []);

  const fitToContent = React.useCallback(() => {
    const surface = mapSurfaceRef.current;
    const bounds = getMindMapContentBounds();
    if (!surface || !bounds) return;
    const targetZoom = getFitZoomForBounds(surface, bounds);
    commitZoom(targetZoom, null, 'center-content');
  }, [commitZoom, getMindMapContentBounds]);

  React.useLayoutEffect(() => {
    if (!boardId || rootNodes.length === 0) {
      autoCenteredBoardRef.current = null;
      return undefined;
    }
    const centerKey = `${boardId}:${rootNodes.map(node => node.id).join('|')}`;
    if (autoCenteredBoardRef.current === centerKey) return undefined;
    const frames: number[] = [];
    let attempts = 0;
    const tryCenter = () => {
      attempts += 1;
      if (centerMindMapContent('initial')) {
        autoCenteredBoardRef.current = centerKey;
        markGeometryDirty('initial');
        return;
      }
      if (attempts < 8) {
        frames.push(window.requestAnimationFrame(tryCenter));
      }
    };
    frames.push(window.requestAnimationFrame(() => {
      frames.push(window.requestAnimationFrame(() => {
        if (centerMindMapContent('initial')) {
          autoCenteredBoardRef.current = centerKey;
          markGeometryDirty('initial');
        } else {
          frames.push(window.requestAnimationFrame(tryCenter));
        }
      }));
    }));
    return () => {
      frames.forEach(frame => window.cancelAnimationFrame(frame));
    };
  }, [boardId, centerMindMapContent, markGeometryDirty, rootNodes]);

  const createSiblingForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const plan = getMindMapSiblingTaskCreatePlan({ nodeId, nodes, parentNodesIndex, boardId });
    if (!plan) return null;
    const created = createTask(plan.parentId, plan.order, DEFAULT_MINDMAP_TASK_TITLE);
    if (created && plan.inheritRootSideFromId) {
      updateRootSide(created.id, getNodeSide(plan.inheritRootSideFromId));
    }
    return created;
  }, [boardId, createTask, getNodeSide, handleCreateRoot, nodes, parentNodesIndex, updateRootSide]);

  const createChildForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const plan = getMindMapChildTaskCreatePlan({ nodeId, nodes, getChildren });
    return plan
      ? createTask(plan.parentId, plan.order, DEFAULT_MINDMAP_TASK_TITLE)
      : null;
  }, [createTask, getChildren, handleCreateRoot, nodes]);

  const continueInlineTitleEdit = React.useCallback((
    nodeId: string,
    title: string,
    intent: MindMapQuickCreateIntent,
  ) => {
    if (!canEditTask) {
      setInlineTitleEditNodeId(null);
      setInlineTitleEditFocusNodeId(null);
      return;
    }
    updateNode(nodeId, { title: getCommittedMindMapTitle(title) });
    const created = intent === 'child'
      ? createChildForNode(nodeId)
      : createSiblingForNode(nodeId);
    if (!created) {
      setInlineTitleEditNodeId(null);
      setInlineTitleEditFocusNodeId(null);
    }
  }, [canEditTask, createChildForNode, createSiblingForNode, updateNode]);

  const archiveNode = React.useCallback(async (nodeId?: string) => {
    const targetNodeId = nodeId || getNodeIdForPlacementId(selectionStore.getPrimaryPlacementId());
    if (!targetNodeId) return;
    const projected = projectionNodes[targetNodeId] || nodes[targetNodeId];
    if (projected?.isTrackingReference) {
      toast.warning('追蹤副本只能移除此處追蹤，不能封存原任務。');
      return;
    }
    if (!canDeleteTask) {
      toast.warning(MINDMAP_MESSAGES.noArchiveTaskPermission);
      return;
    }
    const plan = getMindMapArchiveTaskPlan({ selectedNodeId: targetNodeId, nodes, parentNodesIndex, boardId, rootNodes, getChildren });
    if (!plan) return;
    const confirmed = plan.descendantIds.length === 0
      ? true
      : await useDialogStore.getState().showConfirm(getMindMapArchiveTaskConfirmMessage(plan.selected.title || DEFAULT_MINDMAP_TASK_TITLE, plan.descendantIds.length));

    if (!confirmed) return;

    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    [plan.selected.id, ...plan.descendantIds].forEach(id => archiveTask(id));
    selectNode(plan.nextSelectionId);
  }, [archiveTask, boardId, canDeleteTask, getChildren, getNodeIdForPlacementId, nodes, parentNodesIndex, projectionNodes, rootNodes, selectNode, selectionStore]);

  const localMenuSelection = React.useMemo(() => {
    const placementIds = localMenu?.selectedPlacementIds || [];
    const placementNodes = placementIds.flatMap(placementId => {
      const nodeId = getNodeIdForPlacementId(placementId);
      const node = nodeId ? projectionNodes[nodeId] || nodes[nodeId] : null;
      return node ? [{ placementId, nodeId: node.id, node }] : [];
    });
    const canonicalTaskIds = Array.from(new Set(placementNodes.map(item => item.node.canonicalTaskId || item.node.id)));
    return {
      placementIds,
      placementNodes,
      canonicalTaskIds,
      canonicalNodes: canonicalTaskIds.flatMap(taskId => nodes[taskId] ? [nodes[taskId]] : []),
      hasTrackingProjection: placementNodes.some(item => Boolean(item.node.isTrackingReference)),
      anchorNodeId: getNodeIdForPlacementId(localMenu?.anchorPlacementId || null),
    };
  }, [getNodeIdForPlacementId, localMenu, nodes, projectionNodes]);

  const localMenuForestRootIds = React.useMemo(() => (
    normalizeMindMapForestRoots(localMenuSelection.canonicalTaskIds, nodes)
  ), [localMenuSelection.canonicalTaskIds, nodes]);

  const cutTaskIds = React.useMemo(() => new Set(
    clipboard?.mode === 'cut' ? collectMindMapForestTaskIds(clipboard.rootIds, nodes) : [],
  ), [clipboard, nodes]);

  const assigneeOptions = React.useMemo(() => boardMembers.map(member => ({
    id: member.userId,
    label: member.profile?.displayName || member.profile?.email || member.userId,
    role: member.role,
  })), [boardMembers]);

  const localMenuActionState = React.useMemo(() => {
    const enabled: Partial<Record<TaskActionId, boolean>> = {};
    const disabledReasons: Partial<Record<TaskActionId, string>> = {};
    const selectionCount = localMenuSelection.placementIds.length;
    const isMulti = selectionCount > 1;
    const anchorNode = localMenuSelection.anchorNodeId
      ? projectionNodes[localMenuSelection.anchorNodeId] || nodes[localMenuSelection.anchorNodeId]
      : null;
    const lock = (actionId: TaskActionId, reason: string) => {
      enabled[actionId] = false;
      disabledReasons[actionId] = reason;
    };
    MINDMAP_CONTEXT_ACTION_IDS.forEach(actionId => { enabled[actionId] = true; });

    if (!anchorNode || selectionCount === 0) {
      MINDMAP_CONTEXT_ACTION_IDS.forEach(actionId => lock(actionId, '選取內容已失效'));
      return { enabled, disabledReasons };
    }
    if (batchRecoveryMessage) {
      ['task.copy', 'task.cut', 'task.paste-after', 'task.assign', 'task.archive'].forEach(actionId => (
        lock(actionId as TaskActionId, '前一筆批次操作結果待確認')
      ));
    }
    if (isMulti) {
      [
        'task.open-details',
        'task.create-sibling',
        'task.create-child',
        'task.create-relationship',
        'task.create-tracking-reference',
        'task.remove-tracking-reference',
        'task.promote',
        'task.demote',
      ].forEach(actionId => lock(actionId as TaskActionId, '多選時不支援此操作'));
    }
    if (localMenuSelection.hasTrackingProjection) {
      ['task.copy', 'task.cut', 'task.paste-after', 'task.assign', 'task.archive'].forEach(actionId => (
        lock(actionId as TaskActionId, '選取包含追蹤副本，無法安全批次修改正本')
      ));
    }
    if (!canCreateTask) {
      ['task.create-sibling', 'task.create-child'].forEach(actionId => lock(actionId as TaskActionId, '缺少建立任務權限'));
    }
    if (!canEditTask) lock('task.create-relationship', '缺少編輯任務權限');
    if (!canMoveTask) lock('task.cut', '缺少移動任務權限');
    if (!canAssignTask) lock('task.assign', '缺少指派任務權限');
    if (!canDeleteTask) lock('task.archive', '缺少封存任務權限');
    if (!canManageTaskReference) {
      lock('task.create-tracking-reference', '缺少管理追蹤副本權限');
      lock('task.remove-tracking-reference', '缺少管理追蹤副本權限');
    }
    if (!clipboard) {
      lock('task.paste-after', '尚未複製或剪下任務');
    } else if (clipboard.boardId !== boardId) {
      lock('task.paste-after', '剪貼內容不屬於目前看板');
    } else if (anchorNode.isTrackingReference) {
      lock('task.paste-after', '追蹤副本不能作為貼上錨點');
    } else if (clipboard.mode === 'copy' && !canCreateTask) {
      lock('task.paste-after', '缺少建立任務權限');
    } else if (clipboard.mode === 'copy' && clipboard.dependencies.length > 0 && !canCreateDependency) {
      lock('task.paste-after', '複製內容含內部依賴，缺少建立依賴權限');
    } else if (clipboard.mode === 'cut' && !canMoveTask) {
      lock('task.paste-after', '缺少移動任務權限');
    }
    if (anchorNode.isTrackingReference) {
      lock('task.create-sibling', '追蹤副本不支援新增同階任務');
      lock('task.create-child', '追蹤副本不支援新增子任務');
    }
    return { enabled, disabledReasons };
  }, [
    batchRecoveryMessage,
    boardId,
    canAssignTask,
    canCreateDependency,
    canCreateTask,
    canDeleteTask,
    canEditTask,
    canManageTaskReference,
    canMoveTask,
    clipboard,
    localMenuSelection,
    nodes,
    projectionNodes,
  ]);

  const reportBatchOutcome = React.useCallback((
    outcome: Awaited<ReturnType<typeof commitNodeBatch>>,
    successMessage: string,
  ) => {
    if (outcome.status === 'committed') {
      toast.success(successMessage);
      return true;
    }
    if (outcome.status === 'indeterminate') {
      const message = outcome.error || '操作結果未確認，已暫停相同批次操作。';
      setBatchRecoveryMessage(message);
      toast.error(message);
      return false;
    }
    toast.error(outcome.error || (outcome.status === 'compensated' ? '操作失敗，已還原原狀。' : '操作未完成。'));
    return false;
  }, []);

  const handleMindMapCopy = React.useCallback(() => {
    if (localMenuSelection.hasTrackingProjection || localMenuForestRootIds.length === 0) return;
    setClipboard(createMindMapCopyClipboard(
      boardId,
      localMenuForestRootIds,
      nodes,
      dependencies,
    ));
    closeLocalMenu(true);
    toast.success(`已複製 ${localMenuForestRootIds.length} 個任務分支。`);
  }, [boardId, closeLocalMenu, dependencies, localMenuForestRootIds, localMenuSelection.hasTrackingProjection, nodes]);

  const handleMindMapCut = React.useCallback(() => {
    if (!canMoveTask || localMenuSelection.hasTrackingProjection || localMenuForestRootIds.length === 0) return;
    setClipboard(createMindMapCutClipboard(boardId, localMenuForestRootIds, nodes));
    closeLocalMenu(true);
    toast.success(`已剪下 ${localMenuForestRootIds.length} 個任務分支；貼上前不會移動資料。`);
  }, [boardId, canMoveTask, closeLocalMenu, localMenuForestRootIds, localMenuSelection.hasTrackingProjection, nodes]);

  const handleMindMapPasteAfter = React.useCallback(async () => {
    const anchorNodeId = localMenuSelection.anchorNodeId;
    const anchor = anchorNodeId ? projectionNodes[anchorNodeId] || nodes[anchorNodeId] : null;
    if (!clipboard || !anchor || anchor.isTrackingReference || clipboard.boardId !== boardId) return;
    closeLocalMenu(false);
    try {
      if (clipboard.mode === 'copy') {
        if (!canCreateTask || (clipboard.dependencies.length > 0 && !canCreateDependency)) return;
        const plan = planMindMapCopyPasteAfter({
          clipboard,
          anchorTaskId: anchor.id,
          currentNodes: nodes,
          now: Date.now(),
          createTaskId: () => createMindMapClipboardEntityId('node'),
          createNoteId: () => createMindMapClipboardEntityId('note'),
          createDependencyId: () => createMindMapClipboardEntityId('dep'),
        });
        const beforeSides = { ...sideOverrides };
        const afterSides = { ...sideOverrides };
        if (plan.destinationParentId === null) {
          const anchorSide = getNodeSide(anchor.id);
          plan.clonePlan.rootIds.forEach(rootId => { afterSides[rootId] = anchorSide; });
        }
        const outcome = await commitNodeForestCreate({
          nodes: plan.clonePlan.nodes,
          dependencies: plan.clonePlan.dependencies,
          existingUpdatesById: plan.updatesById,
          label: '貼上複製任務',
          presentation: {
            commit: () => persistSideOverridesWithReadback(boardId, afterSides),
            compensate: () => persistSideOverridesWithReadback(boardId, beforeSides),
            beforeFingerprint: JSON.stringify(beforeSides),
            afterFingerprint: JSON.stringify(afterSides),
            onCommitted: () => setSideOverrides(afterSides),
            onCompensated: () => setSideOverrides(beforeSides),
          },
        });
        if (!reportBatchOutcome(outcome, `已貼上 ${plan.clonePlan.rootIds.length} 個任務分支。`)) return;
        const rootPlacements = plan.clonePlan.rootIds.map(primaryPlacementId);
        selectionStore.setSelection(rootPlacements, rootPlacements[0] || null);
        if (plan.clonePlan.rootIds[0]) scheduleNodeFocus(plan.clonePlan.rootIds[0]);
        return;
      }

      if (!canMoveTask) return;
      const plan = planMindMapCutPasteAfter({
        clipboard,
        anchorTaskId: anchor.id,
        nodes,
        sideOverrides,
        anchorSide: getNodeSide(anchor.id),
      });
      const beforeSides = { ...sideOverrides };
      const afterSides = { ...sideOverrides };
      Object.entries(plan.sideAfter).forEach(([rootId, side]) => {
        if (side) afterSides[rootId] = side;
        else delete afterSides[rootId];
      });
      const outcome = await commitNodeBatch(plan.updatesById, {
        label: '剪下並貼上任務',
        recoveryKind: 'cut-paste',
        presentation: {
          commit: () => persistSideOverridesWithReadback(boardId, afterSides),
          compensate: () => persistSideOverridesWithReadback(boardId, beforeSides),
          beforeFingerprint: JSON.stringify(beforeSides),
          afterFingerprint: JSON.stringify(afterSides),
          onCommitted: () => setSideOverrides(afterSides),
          onCompensated: () => setSideOverrides(beforeSides),
        },
      });
      if (!reportBatchOutcome(outcome, `已移動 ${plan.rootIds.length} 個任務分支。`)) return;
      setClipboard(null);
      const rootPlacements = plan.rootIds.map(primaryPlacementId);
      selectionStore.setSelection(rootPlacements, rootPlacements[0] || null);
      if (plan.rootIds[0]) scheduleNodeFocus(plan.rootIds[0]);
    } catch (error) {
      if (clipboard.mode === 'cut' && error instanceof Error && error.message.includes('剪下來源已變更')) {
        setClipboard(null);
      }
      toast.error(error instanceof Error ? error.message : '貼上失敗。');
    }
  }, [
    boardId,
    canCreateDependency,
    canCreateTask,
    canMoveTask,
    clipboard,
    closeLocalMenu,
    commitNodeBatch,
    commitNodeForestCreate,
    getNodeSide,
    localMenuSelection.anchorNodeId,
    nodes,
    projectionNodes,
    reportBatchOutcome,
    scheduleNodeFocus,
    selectionStore,
    sideOverrides,
  ]);

  const archivePlacementSelection = React.useCallback(async (placementIds: readonly string[]) => {
    if (!canDeleteTask || placementIds.length === 0) return false;
    const placementNodes = placementIds.flatMap(placementId => {
      const nodeId = getNodeIdForPlacementId(placementId);
      const node = nodeId ? projectionNodes[nodeId] || nodes[nodeId] : null;
      return node ? [node] : [];
    });
    if (placementNodes.some(node => node.isTrackingReference)) {
      toast.warning('選取包含追蹤副本，無法安全批次封存正本。');
      return false;
    }
    const canonicalTaskIds = Array.from(new Set(placementNodes.map(node => node.canonicalTaskId || node.id)));
    const forestRootIds = normalizeMindMapForestRoots(canonicalTaskIds, nodes);
    if (forestRootIds.length === 0) return false;
    const taskIds = collectMindMapForestTaskIds(forestRootIds, nodes);
    const descendantCount = taskIds.length - forestRootIds.length;
    const confirmed = descendantCount === 0 || await useDialogStore.getState().showConfirm(
      `將封存 ${forestRootIds.length} 個任務分支與其 ${descendantCount} 個子任務，確定繼續？`,
    );
    if (!confirmed) return false;
    const outcome = await commitNodeBatch(
      Object.fromEntries(taskIds.map(id => [id, { isArchived: true }])),
      { label: '批次封存任務', recoveryKind: 'archive' },
    );
    if (!reportBatchOutcome(outcome, `已封存 ${taskIds.length} 個任務。`)) return false;
    setClipboard(current => current?.mode === 'cut' ? null : current);
    selectionStore.setSelection([]);
    closeLocalMenu(false);
    return true;
  }, [canDeleteTask, closeLocalMenu, commitNodeBatch, getNodeIdForPlacementId, nodes, projectionNodes, reportBatchOutcome, selectionStore]);

  const handleMindMapBatchArchive = React.useCallback(async () => {
    await archivePlacementSelection(localMenuSelection.placementIds);
  }, [archivePlacementSelection, localMenuSelection.placementIds]);

  const handleMindMapAssignmentApply = React.useCallback(async (updatesById: Readonly<Record<string, Partial<TaskNode>>>) => {
    if (!canAssignTask || localMenuSelection.hasTrackingProjection) return;
    const outcome = await commitNodeBatch({ ...updatesById }, { label: '批次指派任務', recoveryKind: 'assign' });
    if (reportBatchOutcome(outcome, `已更新 ${Object.keys(updatesById).length} 個任務的指派。`)) {
      closeLocalMenu(false);
    }
  }, [canAssignTask, closeLocalMenu, commitNodeBatch, localMenuSelection.hasTrackingProjection, reportBatchOutcome]);

  const handleMindMapMenuAction = React.useCallback(async (actionId: TaskActionId) => {
    if (localMenuActionState.enabled[actionId] === false) return;
    const anchorNodeId = localMenuSelection.anchorNodeId;
    switch (actionId) {
      case 'task.open-details':
        if (anchorNodeId) {
          const projected = projectionNodes[anchorNodeId] || nodes[anchorNodeId];
          const taskId = projected?.canonicalTaskId || anchorNodeId;
          selectNode(anchorNodeId);
          setSelectedTaskId(taskId);
          openTaskDetails(taskId, projected?.trackingReferenceId);
        }
        closeLocalMenu(false);
        return;
      case 'task.create-sibling':
        createSiblingForNode(anchorNodeId);
        closeLocalMenu(false);
        return;
      case 'task.create-child':
        createChildForNode(anchorNodeId);
        closeLocalMenu(false);
        return;
      case 'task.create-relationship':
        if (anchorNodeId) {
          beginRelationshipDraftSelectionWithCleanup(anchorNodeId);
          setRelationshipToolActive(true);
        }
        closeLocalMenu(false);
        return;
      case 'task.copy':
        handleMindMapCopy();
        return;
      case 'task.cut':
        handleMindMapCut();
        return;
      case 'task.paste-after':
        await handleMindMapPasteAfter();
        return;
      case 'task.archive':
        await handleMindMapBatchArchive();
        return;
      default:
        return;
    }
  }, [
    beginRelationshipDraftSelectionWithCleanup,
    closeLocalMenu,
    createChildForNode,
    createSiblingForNode,
    handleMindMapBatchArchive,
    handleMindMapCopy,
    handleMindMapCut,
    handleMindMapPasteAfter,
    localMenuActionState.enabled,
    localMenuSelection.anchorNodeId,
    nodes,
    projectionNodes,
    selectNode,
    setSelectedTaskId,
  ]);

  const startRelationshipLabelEdit = React.useCallback((relationshipId: string) => {
    const relationship = noteRelationships.find(item => item.id === relationshipId);
    if (!relationship || !canEditTask) return;
    openRelationshipLabelEdit(relationshipId, relationship.label);
  }, [canEditTask, noteRelationships, openRelationshipLabelEdit]);

  const commitRelationshipLabelEdit = React.useCallback(() => {
    if (!editingRelationshipId) return;
    const nextLabel = getCommittedMindMapRelationshipLabel(editingRelationshipLabel);
    setNoteRelationships(prev => updateRelationshipLabelById(prev, editingRelationshipId, nextLabel));
    clearRelationshipLabelEdit();
    scheduleConnectorRecompute();
  }, [clearRelationshipLabelEdit, editingRelationshipId, editingRelationshipLabel, scheduleConnectorRecompute]);

  const removeRelationshipAndClearSelection = React.useCallback((relationshipId: string) => {
    setNoteRelationships(prev => removeRelationshipById(prev, relationshipId));
    clearSelectedRelationship();
  }, [clearSelectedRelationship]);

  const removeSelectedRelationship = React.useCallback(() => {
    if (!selectedRelationshipId) return;
    removeRelationshipAndClearSelection(selectedRelationshipId);
  }, [removeRelationshipAndClearSelection, selectedRelationshipId]);

  const toggleRelationshipTool = React.useCallback(() => {
    if (!canEditTask) {
      toast.warning(MINDMAP_MESSAGES.noEditRelationshipPermission);
      return;
    }
    const selectedNodeId = getNodeIdForPlacementId(selectionStore.getSelectedNodeId());
    setRelationshipToolActive(active => {
      const nextActive = !active;
      if (nextActive && selectedNodeId) {
        beginRelationshipDraftSelectionWithCleanup(selectedNodeId);
      } else {
        clearRelationshipDraft();
      }
      return nextActive;
    });
    clearSelectedRelationship();
  }, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearRelationshipDraft, clearSelectedRelationship, getNodeIdForPlacementId, selectionStore]);

  const createNoteRelationshipInline = React.useCallback((fromId: string, toId: string) => {
    if (!canEditTask || !boardId) return;
    if (fromId === toId) {
      toast.warning(MINDMAP_MESSAGES.relationshipSelfLinkBlocked);
      return;
    }
    if (!isValidRelationshipEndpoint(nodes, fromId) || !isValidRelationshipEndpoint(nodes, toId)) {
      setNoteRelationships(prev => removeRelationshipsForInvalidEndpoints(prev, fromId, toId));
      return;
    }
    const existing = findExistingNoteRelationship(noteRelationships, fromId, toId);
    if (existing) {
      startRelationshipLabelEdit(existing.id);
      return;
    }
    const relationship = createMindMapNoteRelationship({
      boardId,
      fromId,
      toId,
      label: DEFAULT_MINDMAP_RELATIONSHIP_LABEL,
    });
    setNoteRelationships(prev => appendMindMapNoteRelationship(prev, relationship));
    openRelationshipLabelEdit(relationship.id, relationship.label);
    clearRelationshipDraftPreview();
    scheduleConnectorRecompute();
  }, [boardId, canEditTask, clearRelationshipDraftPreview, nodes, noteRelationships, openRelationshipLabelEdit, scheduleConnectorRecompute, startRelationshipLabelEdit]);

  const handleNodeSelect = React.useCallback((nodeId: string) => {
    closeLocalMenu(false);
    if (!relationshipToolActive) {
      selectNode(nodeId);
      return;
    }
    if (!relationshipDraft) {
      beginRelationshipDraftSelection(nodeId);
      return;
    }
    createNoteRelationshipInline(relationshipDraft.fromId, nodeId);
    finishRelationshipDraftMode();
  }, [beginRelationshipDraftSelection, closeLocalMenu, createNoteRelationshipInline, finishRelationshipDraftMode, relationshipDraft, relationshipToolActive, selectNode]);

  const handleNodePointerPrimary = React.useCallback((nodeId: string) => {
    handleNodeSelect(nodeId);
    const projected = projectionNodes[nodeId] || nodes[nodeId];
    // A tracking projection may open the canonical details, but it must not
    // enter inline editing because the reference has no local task content.
    if (!canEditTask || projected?.isTrackingReference || relationshipToolActive || draggedNodeId) return;
    pointerQuickTitleTimerRef.current = window.setTimeout(() => {
      pointerQuickTitleTimerRef.current = null;
      setInlineTitleEditNodeId(nodeId);
      setInlineTitleEditFocusNodeId(null);
    }, MINDMAP_POINTER_QUICK_TITLE_DELAY_MS);
  }, [canEditTask, draggedNodeId, handleNodeSelect, nodes, projectionNodes, relationshipToolActive]);

  const handleNodeOpenDetails = React.useCallback((nodeId: string, trackingReferenceId?: string) => {
    if (relationshipToolActive || draggedNodeId) return;
    const taskId = getCanonicalTaskId(nodeId);
    selectNode(nodeId);
    setSelectedTaskId(taskId);
    openTaskDetails(taskId, trackingReferenceId);
  }, [draggedNodeId, getCanonicalTaskId, relationshipToolActive, selectNode, setSelectedTaskId]);

  const handleNodeContextMenu = React.useCallback((nodeId: string, _title: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const projected = projectionNodes[nodeId] || nodes[nodeId];
    const taskId = projected?.canonicalTaskId || nodeId;
    const placementId = getPlacementIdForNodeId(nodeId);
    cancelMarquee(true);
    if (selectionStore.isNodeSelected(placementId)) {
      selectionStore.setPrimaryPlacementId(placementId);
    } else {
      selectionStore.setSelection([placementId], placementId);
    }
    syncDev075ProbeAttributes();
    setSelectedTaskId(taskId);
    setAssignmentOpen(false);
    setLocalMenu({
      x: event.clientX,
      y: event.clientY,
      anchorPlacementId: placementId,
      selectedPlacementIds: [...selectionStore.getSelectedPlacementIds()],
    });
  }, [cancelMarquee, getPlacementIdForNodeId, nodes, projectionNodes, selectionStore, setSelectedTaskId, syncDev075ProbeAttributes]);

  React.useEffect(() => {
    const handleStartRelationship = (event: Event) => {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!canEditTask || !taskId || !nodes[taskId]) return;
      setInlineTitleEditNodeId(null);
      setInlineTitleEditFocusNodeId(null);
      clearSelectedRelationship();
      beginRelationshipDraftSelectionWithCleanup(taskId);
      setRelationshipToolActive(true);
    };

    document.addEventListener(START_MINDMAP_RELATIONSHIP_EVENT, handleStartRelationship);
    return () => document.removeEventListener(START_MINDMAP_RELATIONSHIP_EVENT, handleStartRelationship);
  }, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearSelectedRelationship, nodes]);

  const handleSurfaceClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextSurfaceClickRef.current) {
      suppressNextSurfaceClickRef.current = false;
      return;
    }
    if (isMindMapRelationshipInteractionElement(event.target)) {
      return;
    }
    clearTaskSelection();
    closeLocalMenu(false);
    clearSelection();
    clearRelationshipLabelEdit();
  }, [clearRelationshipLabelEdit, clearSelection, closeLocalMenu]);

  const updateRelationshipDraftPreview = React.useCallback((clientX: number, clientY: number) => {
    const fromId = relationshipDraft?.fromId;
    const surface = mapContentRef.current;
    if (!fromId || !surface) {
      clearRelationshipDraftPreview();
      return;
    }
    const mapper = getCurrentCoordinateMapper();
    if (!mapper) {
      clearRelationshipDraftPreview();
      return;
    }
    const source = getMindMapNodeElement(surface, fromId);
    if (!source) {
      clearRelationshipDraftPreview();
      return;
    }
    const rect = getLocalRect(source);
    setRelationshipDraftPreview(makeRelationshipDraftPreview(
      fromId,
      rect,
      getWorldPointFromClient(clientX, clientY, mapper),
      getNodeSide(fromId),
    ));
  }, [clearRelationshipDraftPreview, getCurrentCoordinateMapper, getLocalRect, getNodeSide, relationshipDraft]);

  React.useEffect(() => {
    if (!relationshipToolActive || !relationshipDraft) {
      clearRelationshipDraftPreview();
      return undefined;
    }
    const handleMove = (event: PointerEvent) => {
      updateRelationshipDraftPreview(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [clearRelationshipDraftPreview, relationshipDraft, relationshipToolActive, updateRelationshipDraftPreview]);

  const updateRelationshipStyle = React.useCallback((relationshipId: string, patch: MindMapRelationshipStyle) => {
    setNoteRelationships(prev => updateRelationshipStyleById(prev, relationshipId, patch));
  }, []);

  const resetRelationshipStyle = React.useCallback((relationshipId: string) => {
    setNoteRelationships(prev => resetRelationshipStyleById(prev, relationshipId));
  }, []);

  const startRelationshipPointerDrag = React.useCallback((
    event: React.PointerEvent<Element>,
    relationshipId: string,
    handle: RelationshipPointerDragState['handle'],
  ) => {
    if (!isPrimaryPointerActivation(event)) return;
    if (!canEditTask) return;
    const initialRelationship = noteRelationships.find(item => item.id === relationshipId);
    const relationshipPath = relationshipPaths.find(path => path.id === relationshipId);
    if (!initialRelationship || !relationshipPath) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectRelationship(relationshipId);
    clearRelationshipLabelEdit();
    setRelationshipPointerDrag({
      relationshipId,
      handle,
      initialRelationship: cloneMindMapRelationship(initialRelationship),
      fallbackControlPoints: [
        { x: relationshipPath.c1X, y: relationshipPath.c1Y },
        { x: relationshipPath.c2X, y: relationshipPath.c2Y },
      ],
    });
  }, [canEditTask, clearRelationshipLabelEdit, noteRelationships, relationshipPaths, selectRelationship]);

  React.useEffect(() => {
    if (!relationshipPointerDrag) return undefined;

    const handleMove = (event: PointerEvent) => {
      const surface = mapContentRef.current;
      if (!surface) return;
      const mapper = getCurrentCoordinateMapper();
      if (!mapper) return;
      const point = getWorldPointFromClient(event.clientX, event.clientY, mapper);
      const handle = relationshipPointerDrag.handle;
      if (handle === 'control-1' || handle === 'control-2') {
        setNoteRelationships(prev => updateRelationshipControlPointById(
          prev,
          relationshipPointerDrag.relationshipId,
          handle,
          point,
          { fallbackControlPoints: relationshipPointerDrag.fallbackControlPoints },
        ));
        return;
      }
      if (handle !== 'from' && handle !== 'to') return;
      setNoteRelationships(prev => {
        const nodeId = getRelationshipEndpointNodeId(prev, relationshipPointerDrag.relationshipId, handle);
        if (!nodeId) return prev;
        const nodeElement = getMindMapNodeElement(mapContentRef.current, nodeId);
        if (!nodeElement) return prev;
        const anchor = getAnchorForElementFromClient(event.clientX, event.clientY, nodeElement);
        return updateRelationshipEndpointAnchorById(
          prev,
          relationshipPointerDrag.relationshipId,
          handle,
          anchor,
        );
      });
    };

    const handleUp = (event: PointerEvent) => {
      const handle = relationshipPointerDrag.handle;
      if (handle === 'from' || handle === 'to') {
        const surface = mapContentRef.current;
        const targetElement = surface ? getNodeElementAtPointInSurface(surface, event.clientX, event.clientY) : null;
        const targetNodeId = targetElement ? getMindMapNodeId(targetElement) : null;
        if (targetElement && targetNodeId) {
          const targetAnchor = getAnchorForElementFromClient(event.clientX, event.clientY, targetElement);
          setNoteRelationships(prev => retargetRelationshipEndpointById(
            prev,
            relationshipPointerDrag.relationshipId,
            handle,
            targetNodeId,
            targetAnchor,
          ));
        }
      }
      clearRelationshipPointerDrag();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', cancelRelationshipPointerDrag);
    window.addEventListener('blur', cancelRelationshipPointerDrag);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', cancelRelationshipPointerDrag);
      window.removeEventListener('blur', cancelRelationshipPointerDrag);
    };
  }, [cancelRelationshipPointerDrag, clearRelationshipPointerDrag, getCurrentCoordinateMapper, relationshipPointerDrag]);

  React.useEffect(() => {
    if (!selectedRelationshipId) return undefined;
    const handleRelationshipWindowKeyDown = (event: KeyboardEvent) => {
      if (isMindMapTextEditingTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        cancelRelationshipPointerDrag();
        clearSelectedRelationship();
        return;
      }
      if (isMindMapRelationshipLabelEditKey(event)) {
        event.preventDefault();
        startRelationshipLabelEdit(selectedRelationshipId);
        return;
      }
      if (isMindMapDeleteKey(event)) {
        event.preventDefault();
        removeRelationshipAndClearSelection(selectedRelationshipId);
      }
    };
    window.addEventListener('keydown', handleRelationshipWindowKeyDown);
    return () => window.removeEventListener('keydown', handleRelationshipWindowKeyDown);
  }, [cancelRelationshipPointerDrag, clearSelectedRelationship, removeRelationshipAndClearSelection, selectedRelationshipId, startRelationshipLabelEdit]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('[data-mindmap-context-menu="true"]')) return;
    if (event.key === 'Escape' && document.querySelector('[data-global-context-menu="true"], [data-mindmap-context-menu="true"]')) {
      return;
    }
    const consumeMindMapKeyboardEvent = () => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
    };
    const selectedNodeId = getNodeIdForPlacementId(selectionStore.getPrimaryPlacementId());
    const selectedPlacementIds = selectionStore.getSelectedPlacementIds();
    const hasMultiSelection = selectedPlacementIds.length > 1;
    const action = getMindMapKeyboardAction(event, {
      isEditingText: isMindMapTextEditingTarget(event.target),
      isQuickTitleEditing: isMindMapQuickTitleEditingTarget(event.target),
      hasSelectedNode: Boolean(selectedNodeId),
      hasSelectedRelationship: Boolean(selectedRelationshipId),
      hasRelationshipMode: Boolean(relationshipToolActive || relationshipDraft || selectedRelationshipId),
    });
    if (!action) return;

    if (action.type === 'toggle-relationship-tool') {
      consumeMindMapKeyboardEvent();
      toggleRelationshipTool();
      return;
    }

    if (action.type === 'deactivate-relationship-mode') {
      consumeMindMapKeyboardEvent();
      if (relationshipPointerDrag) cancelRelationshipPointerDrag();
      deactivateRelationshipMode();
      return;
    }

    if (action.type === 'clear-selection') {
      consumeMindMapKeyboardEvent();
      if (clipboard?.mode === 'cut') {
        setClipboard(null);
        closeLocalMenu(false);
        toast.success('已取消剪下。');
        return;
      }
      clearTaskSelection();
      clearSelection();
      return;
    }

    if (action.type === 'remove-selected-relationship' && selectedRelationshipId) {
      consumeMindMapKeyboardEvent();
      removeSelectedRelationship();
      return;
    }

    if (action.type === 'edit-selected-relationship-label' && selectedRelationshipId) {
      consumeMindMapKeyboardEvent();
      startRelationshipLabelEdit(selectedRelationshipId);
      return;
    }

    if (hasMultiSelection && (
      action.type === 'select-vertical'
      || action.type === 'select-horizontal'
      || action.type === 'create-sibling'
      || action.type === 'create-child'
    )) {
      consumeMindMapKeyboardEvent();
      if (selectedNodeId) selectNode(selectedNodeId);
      return;
    }

    if (action.type === 'select-vertical' && selectedNodeId) {
      const nextSelectionId = getMindMapVerticalSelection(
        selectedNodeId,
        navigationIndex,
        action.direction,
      );
      if (nextSelectionId) {
        consumeMindMapKeyboardEvent();
        selectNode(nextSelectionId);
      }
      return;
    }

    if (action.type === 'select-horizontal' && selectedNodeId) {
      consumeMindMapKeyboardEvent();
      const horizontalSelection = getMindMapHorizontalSelection(
        selectedNodeId,
        navigationIndex,
        action.direction,
        nodeId => nodes[nodeId]?.parentId || null,
        getChildren,
      );
      if (horizontalSelection?.expandNodeId) {
        expandNode(horizontalSelection.expandNodeId);
      }
      if (horizontalSelection && horizontalSelection.nodeId !== selectedNodeId) {
        selectNode(horizontalSelection.nodeId);
      }
      return;
    }

    if (action.type === 'create-sibling') {
      consumeMindMapKeyboardEvent();
      createSiblingForNode(selectedNodeId);
      return;
    }

    if (action.type === 'create-child') {
      consumeMindMapKeyboardEvent();
      createChildForNode(selectedNodeId);
      return;
    }

    if (action.type === 'archive-selected-node' && selectedNodeId) {
      consumeMindMapKeyboardEvent();
      void archivePlacementSelection(selectedPlacementIds);
    }
  }, [
    archivePlacementSelection,
    clipboard,
    closeLocalMenu,
    deactivateRelationshipMode,
    createChildForNode,
    createSiblingForNode,
    clearSelection,
    cancelRelationshipPointerDrag,
    expandNode,
    getChildren,
    getNodeIdForPlacementId,
    navigationIndex,
    nodes,
    relationshipDraft,
    relationshipPointerDrag,
    relationshipToolActive,
    removeSelectedRelationship,
    selectNode,
    selectionStore,
    selectedRelationshipId,
    startRelationshipLabelEdit,
    toggleRelationshipTool,
  ]);

  const handleRelationshipHotkey = React.useCallback((event: React.KeyboardEvent<HTMLElement>, relationshipId: string) => {
    if (isMindMapRelationshipLabelEditKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      startRelationshipLabelEdit(relationshipId);
      return;
    }
    if (isMindMapDeleteKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      removeRelationshipAndClearSelection(relationshipId);
    }
  }, [removeRelationshipAndClearSelection, startRelationshipLabelEdit]);

  const handleDragOverNode = React.useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = getDropModeFromPointer(event.currentTarget, event);
    const target = projectionNodes[nodeId] || nodes[nodeId];
    const direction = getNodeSide(nodeId);
    const insertionPreview = getDragInsertionPreview(event.currentTarget, target, mode, direction);
    setNodeDropPreviewTarget({ nodeId, mode });
    updateDragPreview(event, {
      targetNodeId: nodeId,
      targetParentId: mode === 'child' ? nodeId : target?.parentId || undefined,
      siblingBeforeId: mode === 'after' ? nodeId : undefined,
      siblingAfterId: mode === 'before' ? nodeId : undefined,
      dropPosition: mode,
      direction,
      ...insertionPreview,
    });
  }, [canManageTaskReference, canMoveTask, draggedNodeId, getDragInsertionPreview, getNodeSide, nodes, projectionNodes, setNodeDropPreviewTarget, updateDragPreview]);

  const handleDropOnNode = React.useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = dropTarget?.nodeId === nodeId ? dropTarget.mode : getDropModeFromPointer(event.currentTarget, event);
    const target = projectionNodes[nodeId] || nodes[nodeId];
    const dragged = projectionNodes[draggedNodeId] || nodes[draggedNodeId];
    if (!target || !dragged) return;

    // A canonical primary placement cannot be nested below a non-owning
    // reference; only the reference placement itself may be moved there.
    if (target.isTrackingReference && !dragged.isTrackingReference) {
      toast.warning('主要任務不能放到追蹤副本下。');
      clearDragState();
      return;
    }

    if (dragged.isTrackingReference && dragged.trackingReferenceId) {
      if (!canManageTaskReference) return;
      const targetPlacementId = target.trackingReferenceId || `primary:${target.id}`;
      const targetParentPlacementId = mode === 'child'
        ? targetPlacementId
        : target.trackingReferenceParentPlacementId
          ?? (target.parentId ? `primary:${target.parentId}` : null);
      void moveTrackingReference({
        referenceId: dragged.trackingReferenceId,
        targetBoardId: boardId,
        targetParentPlacementId,
        anchorPlacementId: mode === 'child' ? null : targetPlacementId,
        position: mode === 'child' ? 'append' : mode,
      }).catch(error => {
        toast.error(error instanceof Error ? error.message : '移動追蹤副本失敗，原位置已保留。');
      });
      if (mode === 'child') expandNode(target.id);
      clearDragState();
      return;
    }
    if (!canMoveTask) return;

    const result = getMindMapNodeDropResult({
      boardId,
      draggedNodeId,
      mode,
      target,
      nodes,
      parentNodesIndex,
      getChildren,
      getNodeSide,
    });
    if (result.type === 'blocked') {
      toast.warning(result.reason === 'child-cycle'
        ? MINDMAP_MESSAGES.dragWouldCreateChildCycle
        : MINDMAP_MESSAGES.dragWouldCreateHierarchyCycle);
    } else {
      const { update } = result;
      if (update.rootSide) updateRootSide(update.nodeId, update.rootSide);
      updateNode(update.nodeId, { parentId: update.parentId, order: update.order });
      if (update.expandNodeId) expandNode(update.expandNodeId);
    }

    clearDragState();
  }, [boardId, canManageTaskReference, canMoveTask, clearDragState, draggedNodeId, dropTarget, expandNode, getChildren, getNodeSide, moveTrackingReference, nodes, parentNodesIndex, projectionNodes, updateNode, updateRootSide]);

  const handleDropOnCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId) return;
    event.preventDefault();
    const dragged = projectionNodes[draggedNodeId] || nodes[draggedNodeId];
    if (!dragged) return;
    if (dragged.isTrackingReference && dragged.trackingReferenceId) {
      if (canManageTaskReference) {
        void moveTrackingReference({
          referenceId: dragged.trackingReferenceId,
          targetBoardId: boardId,
          targetParentPlacementId: null,
          position: 'append',
        }).catch(error => toast.error(error instanceof Error ? error.message : '移動追蹤副本失敗，原位置已保留。'));
      }
      clearDragState();
      return;
    }
    if (!canMoveTask) return;
    const update = getMindMapCenterDropUpdate({ draggedNodeId, rootNodes, sideOverrides });
    updateNode(update.nodeId, { parentId: update.parentId, order: update.order });
    if (update.rootSide) updateRootSide(update.nodeId, update.rootSide);
    clearDragState();
  }, [boardId, canManageTaskReference, canMoveTask, clearDragState, draggedNodeId, moveTrackingReference, nodes, projectionNodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const handleDragOverCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId) return;
    event.preventDefault();
    setRootDropPreviewTarget(null);
    updateDragPreview(event, {
      targetParentId: undefined,
      dropPosition: 'root',
      direction: sideOverrides[draggedNodeId] || 'right',
      connectorPath: getDragPreviewConnectorPath(event, event.currentTarget, sideOverrides[draggedNodeId] || 'right'),
    });
  }, [canManageTaskReference, canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, sideOverrides, updateDragPreview]);

  const handleDragOverSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    setRootDropPreviewTarget(direction);
    const center = getMindMapCenterElement(mapContentRef.current);
    updateDragPreview(event, {
      targetParentId: undefined,
      dropPosition: 'root',
      direction,
      connectorPath: getDragPreviewConnectorPath(event, center || event.currentTarget, direction),
    });
  }, [canManageTaskReference, canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, updateDragPreview]);

  const handleDropOnSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if ((!canMoveTask && !canManageTaskReference) || !draggedNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const dragged = projectionNodes[draggedNodeId] || nodes[draggedNodeId];
    if (!dragged) return;
    if (dragged.isTrackingReference && dragged.trackingReferenceId) {
      if (canManageTaskReference) {
        void moveTrackingReference({
          referenceId: dragged.trackingReferenceId,
          targetBoardId: boardId,
          targetParentPlacementId: null,
          position: 'append',
        }).catch(error => toast.error(error instanceof Error ? error.message : '移動追蹤副本失敗，原位置已保留。'));
      }
      clearDragState();
      return;
    }
    if (!canMoveTask) return;
    const update = getMindMapSideDropUpdate({
      draggedNodeId,
      direction,
      previewDirection: dragPreview?.direction,
      rootNodes,
      sideOverrides,
      getNodeSide,
    });
    if (update.rootSide) updateRootSide(update.nodeId, update.rootSide);
    updateNode(update.nodeId, { parentId: update.parentId, order: update.order });
    clearDragState();
  }, [boardId, canManageTaskReference, canMoveTask, clearDragState, dragPreview, draggedNodeId, getNodeSide, moveTrackingReference, nodes, projectionNodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const handleNodeDragStart = React.useCallback((nodeId: string, event: React.DragEvent<HTMLDivElement>) => {
    closeLocalMenu(false);
    cancelMarquee(true);
    setTransparentDragImage(event.dataTransfer);
    setDraggedNodeId(nodeId);
    selectNode(nodeId);
    updateDragPreview(event, {
      nodeId,
      dropPosition: 'root',
      direction: getNodeSide(nodeId),
    });
  }, [cancelMarquee, closeLocalMenu, getNodeSide, selectNode, updateDragPreview]);

  const handleNodeDragMove = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedNodeId || event.clientX === 0 || event.clientY === 0) return;
    setDragPreview(prev => updateDragPreviewPointerPosition(prev, event));
  }, [draggedNodeId]);

  const renderNode = (node: TaskNode, direction: MindMapDirection, level: number): React.ReactNode => (
    <MindMapNode
      key={node.id}
      node={node}
      childrenNodes={getChildren(node.id)}
      direction={direction}
      level={level}
      selectionStore={selectionStore}
      dev075ProbeEnabled={dev075ProbeEnabled}
      expandedNodeIds={expandedNodeIds}
      dropTarget={dropTarget}
      isRelationshipModeActive={relationshipToolActive}
      isCutPending={cutTaskIds.has(node.canonicalTaskId || node.id)}
      showStartDate={showStartDate}
      dateLockStatus={getNodeLockStatus(node.canonicalTaskId || node.id, dependencies)}
      canMoveTask={canMoveTask || canManageTaskReference}
      canManageTaskReference={canManageTaskReference}
      isTitleEditing={inlineTitleEditNodeId === node.id}
      autoFocusTitleInput={inlineTitleEditFocusNodeId === node.id}
      onTitleEditCommit={commitInlineTitleEdit}
      onTitleEditContinue={continueInlineTitleEdit}
      onTitleEditCancel={cancelInlineTitleEdit}
      onTitleEditDelete={archiveNode}
      onSelect={handleNodeSelect}
      onPointerPrimary={handleNodePointerPrimary}
      onOpenDetails={handleNodeOpenDetails}
      onOpenContextMenu={handleNodeContextMenu}
      onToggleExpanded={toggleNodeExpansion}
      onDragStart={handleNodeDragStart}
      onDragMove={handleNodeDragMove}
      onDragEnd={clearDragState}
      onDragOverNode={handleDragOverNode}
      onDropOnNode={handleDropOnNode}
      onNodeElementChange={handleNodeElementChange}
      renderChild={renderNode}
    />
  );

  if (!activeBoard) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-500">
        {MINDMAP_MESSAGES.selectBoardPrompt}
      </div>
    );
  }

  return (
    <div ref={mindMapViewRef} className="flex h-full flex-col overflow-hidden bg-white" data-mindmap-view onKeyDown={handleKeyDown} tabIndex={-1}>
      <MindMapToolbar
        isReadOnly={isReadOnly}
        canEditTask={canEditTask}
        relationshipToolActive={relationshipToolActive}
        relationshipDraftFromId={relationshipDraft?.fromId || ''}
        zoomLevel={zoomLevel}
        zoomLabelRef={zoomLabelRef}
        onToggleRelationshipTool={toggleRelationshipTool}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onZoomReset={resetZoom}
        onZoomFit={fitToContent}
      />

      {batchRecoveryMessage ? (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-mindmap-batch-recovery-alert="true">
          {batchRecoveryMessage}
        </div>
      ) : null}


      <MindMapCanvasShell
        surfaceRef={mapSurfaceRef}
        stageRef={mapStageRef}
        contentRef={mapContentRef}
        marqueeOverlayRef={marqueeOverlayRef}
        zoomLevelText={formatZoomLevel(zoomLevel)}
        mapContentStyle={mapContentStyle}
        stageStyle={stageStyle}
        sceneStyle={sceneStyle}
        relationshipToolActive={relationshipToolActive}
        relationshipDraftFromId={relationshipDraft?.fromId || ''}
        hasContent={!taskLoading && !taskLoadError && filterProjection.matchedTaskIds.size > 0}
        emptyState={(
          <TaskFilterResultState
            projection={filterProjection}
            loading={taskLoading}
            error={taskLoadError}
            onReset={resetTaskFilters}
            onCreate={handleCreateRoot}
            canCreate={canCreateTask}
          />
        )}
        onMouseDown={startMiddleMousePan}
        onContentClick={handleSurfaceClick}
        onContentPointerDown={handleMarqueePointerDown}
        onContentPointerMove={handleMarqueePointerMove}
        onContentPointerUp={handleMarqueePointerUp}
        onContentPointerCancel={handleMarqueePointerCancel}
      >
            <MindMapConnectorOverlay connectorPaths={connectorPaths} />

            <MindMapRelationshipOverlay
              relationshipPaths={relationshipPaths}
              relationshipDraftPreview={relationshipDraftPreview}
              selectedRelationshipId={selectedRelationshipId}
              hoveredRelationshipId={hoveredRelationshipId}
              editingRelationshipId={editingRelationshipId}
            />

            <MindMapDragPreviewLayer dragPreview={dragPreview} />

            <MindMapRelationshipInteractionLayer
              relationshipPaths={relationshipPaths}
              selectedRelationshipId={selectedRelationshipId}
              hoveredRelationshipId={hoveredRelationshipId}
              editingRelationshipId={editingRelationshipId}
              zoomLevel={zoomLevel}
              editingRelationshipLabel={editingRelationshipLabel}
              relationshipToolActive={relationshipToolActive}
              relationshipLabelInputRef={relationshipLabelInputRef}
              startRelationshipLabelEdit={startRelationshipLabelEdit}
              startRelationshipPointerDrag={startRelationshipPointerDrag}
              handleRelationshipHotkey={handleRelationshipHotkey}
              selectRelationship={selectRelationship}
              hoverRelationship={hoverRelationship}
              clearRelationshipHover={clearRelationshipHover}
              updateRelationshipLabelDraft={setEditingRelationshipLabel}
              commitRelationshipLabelEdit={commitRelationshipLabelEdit}
              cancelRelationshipLabelEdit={clearRelationshipLabelEdit}
            />

            <MindMapRootLayout
              rootsBySide={rootsBySide}
              rootSideDropTarget={rootSideDropTarget}
              boardTitle={activeBoard.title}
              renderNode={renderNode}
              onDragOverSide={handleDragOverSide}
              onDropOnSide={handleDropOnSide}
              onDragOverCenter={handleDragOverCenter}
              onDropOnCenter={handleDropOnCenter}
            />
      </MindMapCanvasShell>

      {localMenu ? (
        <MindMapContextMenu
          state={localMenu}
          selectionCount={localMenu.selectedPlacementIds.length}
          actionIds={MINDMAP_CONTEXT_ACTION_IDS}
          enabled={localMenuActionState.enabled}
          disabledReasons={localMenuActionState.disabledReasons}
          onAction={handleMindMapMenuAction}
          hideDisabled
          onClose={() => closeLocalMenu(true)}
          assignmentOpen={assignmentOpen}
          assignmentSummary={localMenu.selectedPlacementIds.length > 1 ? `${localMenu.selectedPlacementIds.length} 個任務的混合狀態` : undefined}
          onToggleAssignment={() => {
            if (localMenuActionState.enabled['task.assign'] !== false) setAssignmentOpen(current => !current);
          }}
          assignmentContent={(
            <MindMapBatchAssignmentPicker
              nodes={localMenuSelection.canonicalNodes}
              options={assigneeOptions}
              membersLoading={membersLoading}
              disabled={localMenuActionState.enabled['task.assign'] === false}
              onApply={handleMindMapAssignmentApply}
            />
          )}
        />
      ) : null}

      <MindMapRelationshipStyleLayer
        relationshipPaths={relationshipPaths}
        selectedRelationshipId={selectedRelationshipId}
        editingRelationshipId={editingRelationshipId}
        onUpdateStyle={updateRelationshipStyle}
        onResetStyle={resetRelationshipStyle}
      />
      <MindMapDragPreviewBadge dragPreview={dragPreview} />
      <div aria-live="polite" className="sr-only" data-mindmap-selection-live-region="true">
        {localMenu ? `已選取 ${localMenu.selectedPlacementIds.length} 個任務` : clipboard?.mode === 'cut' ? `已剪下 ${clipboard.rootIds.length} 個任務分支` : ''}
      </div>
    </div>
  );
};

export default MindMapView;
