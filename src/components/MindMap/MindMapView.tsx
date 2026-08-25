import React from 'react';
import useBoardStore from '../../store/useBoardStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import useDialogStore from '../../store/useDialogStore';
import { toast } from '../../store/useToastStore';
import { useTagStore } from '../../store/useTagStore';
import type { TaskNode } from '../../types';
import MindMapCanvasShell from './MindMapCanvasShell';
import MindMapConnectorOverlay from './MindMapConnectorOverlay';
import MindMapDragPreviewBadge from './MindMapDragPreviewBadge';
import MindMapDragPreviewLayer, { type MindMapDragPreviewModel } from './MindMapDragPreviewLayer';
import MindMapEmptyState from './MindMapEmptyState';
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
  applyMiddleMousePanFrame,
  clearLeftMousePanTelemetry,
  clearMiddleMousePanTelemetry,
  createLeftMousePanState,
  createMiddleMousePanState,
  getLeftMousePanUpdate,
  isLeftMousePanBlockedTarget,
  isMindMapNativeScrollbarPointer,
  markMiddleMousePanActive,
  setLeftMousePanTelemetry,
  updateMiddleMousePanPointer,
  type LeftMousePanState,
  type MiddleMousePanState,
} from './mindMapPan';
import {
  getMindMapChildren,
  getMindMapRootNodes,
  getMindMapRootAncestorId,
  splitRootNodes,
  type SideOverrides,
} from './mindMapTree';
import { loadSideOverrides, saveSideOverrides } from './mindMapSideStorage';
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
  const parentNodesIndex = useWbsStore(state => state.parentNodesIndex);
  const addNode = useWbsStore(state => state.addNode);
  const updateNode = useWbsStore(state => state.updateNode);
  const archiveTask = useWbsStore(state => state.archiveNode);
  const statusFilters = useBoardStore(state => state.statusFilters);
  const dueWithinDays = useBoardStore(state => state.dueWithinDays);
  const overdueOnly = useBoardStore(state => state.overdueOnly);
  const selectedAssigneeIds = useBoardStore(state => state.selectedAssigneeIds);
  const showStartDate = useBoardStore(state => state.showStartDate);
  const setSelectedTaskId = useBoardStore(state => state.setSelectedTaskId);
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const selectedTagIds = useTagStore(state => state.selectedTagIds);
  const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, isReadOnly } = useBoardPermissions();

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
  const mindMapViewRef = React.useRef<HTMLDivElement>(null);
  const mapSurfaceRef = React.useRef<HTMLDivElement>(null);
  const mapStageRef = React.useRef<HTMLDivElement>(null);
  const mapContentRef = React.useRef<HTMLDivElement>(null);
  const nodeElementRegistryRef = React.useRef(new Map<string, HTMLElement>());
  const pendingNodeFocusFrameRef = React.useRef<number | null>(null);
  const viewRenderCountRef = React.useRef(0);
  const navigationIndexBuildCountRef = React.useRef(0);
  const relationshipLabelInputRef = React.useRef<HTMLInputElement>(null);
  const leftMousePanRef = React.useRef<LeftMousePanState | null>(null);
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
      if (selectionStore.getSelectedNodeId() !== nodeId) return;
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
  }, [cancelPendingNodeFocus, selectionStore]);

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
    const change = selectionStore.setSelectedNodeId(nodeId);
    syncDev075ProbeAttributes();
    if (change.changed && nodeId) scheduleNodeFocus(nodeId);
    if (change.changed && !nodeId) cancelPendingNodeFocus();
    setSelectedRelationshipId(null);
  }, [cancelPendingNodeFocus, cancelPointerQuickTitleRequest, scheduleNodeFocus, selectionStore, syncDev075ProbeAttributes]);

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
  }, []);

  React.useEffect(() => {
    const surface = mapSurfaceRef.current;
    if (!surface) return undefined;
    let suppressNextClick = false;
    let suppressTimer: number | null = null;

    const clearSuppressTimer = () => {
      if (suppressTimer === null) return;
      window.clearTimeout(suppressTimer);
      suppressTimer = null;
    };

    const scheduleSuppressReset = () => {
      clearSuppressTimer();
      suppressTimer = window.setTimeout(() => {
        suppressNextClick = false;
        suppressTimer = null;
      }, 0);
    };

    const resetLeftPan = () => {
      const wasActive = Boolean(leftMousePanRef.current?.active);
      if (wasActive) {
        suppressNextClick = true;
        scheduleSuppressReset();
      }
      leftMousePanRef.current = null;
      clearLeftMousePanTelemetry(surface);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pan = leftMousePanRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      const update = getLeftMousePanUpdate(pan, event.clientX, event.clientY);
      if (!update.active) return;
      if (!pan.active) {
        pan.active = true;
        setLeftMousePanTelemetry(surface, 'active');
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      surface.scrollLeft = update.scrollLeft;
      surface.scrollTop = update.scrollTop;
      surface.setAttribute('data-mindmap-left-pan-delta-x', (event.clientX - pan.startX).toFixed(2));
      surface.setAttribute('data-mindmap-left-pan-delta-y', (event.clientY - pan.startY).toFixed(2));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const pan = leftMousePanRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      resetLeftPan();
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
      clearSuppressTimer();
    };

    setLeftMousePanTelemetry(surface, 'idle');
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    window.addEventListener('blur', resetLeftPan);
    surface.addEventListener('click', handleClickCapture, true);
    return () => {
      clearSuppressTimer();
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      window.removeEventListener('blur', resetLeftPan);
      surface.removeEventListener('click', handleClickCapture, true);
      resetLeftPan();
    };
  }, [activeBoardId]);

  const mindMapFilters = React.useMemo(() => ({
    statusFilters,
    dueWithinDays,
    overdueOnly,
    selectedAssigneeIds,
    selectedTagIds,
    keyword: '',
  }), [dueWithinDays, overdueOnly, selectedAssigneeIds, selectedTagIds, statusFilters]);

  const rootNodes = React.useMemo(() => {
    return getMindMapRootNodes(nodes, parentNodesIndex, boardId, mindMapFilters);
  }, [boardId, mindMapFilters, nodes, parentNodesIndex]);

  React.useLayoutEffect(() => {
    const surface = mapSurfaceRef.current;
    const scene = mapContentRef.current;
    if (!surface || !scene) return undefined;
    const measure = () => {
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
  }, [boardId, rootNodes.length]);

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
    selectionStore.dispose();
  }, [cancelPendingNodeFocus, selectionStore]);

  React.useEffect(() => {
    if (selectionBoardRef.current === boardId) return;
    selectionBoardRef.current = boardId;
    setInlineTitleEditNodeId(null);
    setInlineTitleEditFocusNodeId(null);
    selectNode(null);
    clearSelectedRelationship();
    clearRelationshipDraft();
  }, [boardId, clearRelationshipDraft, clearSelectedRelationship, selectNode]);

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
      ? Object.values(nodes).filter(node => node.boardId === boardId && !node.isArchived)
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
  }, [boardId, nodes]);

  React.useEffect(() => {
    const selectedNodeId = selectionStore.getSelectedNodeId();
    if (!selectedNodeId) return;
    const selectedNode = nodes[selectedNodeId];
    if (selectedNode && selectedNode.boardId === boardId && !selectedNode.isArchived) return;
    selectNode(null);
  }, [boardId, nodes, selectNode, selectionStore]);

  React.useEffect(() => {
    if (!editingRelationshipId) return;
    const frame = window.requestAnimationFrame(() => {
      relationshipLabelInputRef.current?.focus();
      relationshipLabelInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingRelationshipId]);

  const getChildren = React.useCallback((nodeId: string) =>
    getMindMapChildren(nodes, parentNodesIndex, boardId, mindMapFilters, nodeId),
  [boardId, mindMapFilters, nodes, parentNodesIndex]);

  const navigationIndex = React.useMemo(() => {
    return buildMindMapNavigationIndex(rootsBySide, expandedNodeIds, getChildren);
  }, [expandedNodeIds, getChildren, rootsBySide]);

  React.useLayoutEffect(() => {
    if (!dev075ProbeEnabled) return;
    navigationIndexBuildCountRef.current += 1;
    syncDev075ProbeAttributes();
  }, [dev075ProbeEnabled, navigationIndex, syncDev075ProbeAttributes]);

  const getNodeSide = React.useCallback((nodeId: string): MindMapDirection => {
    const rootId = getMindMapRootAncestorId(nodes, nodeId);
    const branch = getMindMapNodeElement(mapContentRef.current, rootId);
    const domDirection = branch?.getAttribute(MINDMAP_NODE_DIRECTION_ATTRIBUTE);
    if (domDirection === 'left' || domDirection === 'right') return domDirection;
    return sideOverrides[rootId] || 'right';
  }, [nodes, sideOverrides]);

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
    const observer = new ResizeObserver(() => markGeometryDirty('node-resize'));
    const handleResize = () => markGeometryDirty('viewport-layout');
    observer.observe(surface);
    const nodesToObserve = Array.from(surface.querySelectorAll(MINDMAP_CONTENT_BOUNDS_SELECTOR));
    nodesToObserve.forEach(element => observer.observe(element));
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [markGeometryDirty, rootNodes.length]);

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
    const dragged = patch.nodeId ? nodes[patch.nodeId] : draggedNodeId ? nodes[draggedNodeId] : null;
    if (!dragged) return;
    setDragPreview({
      x: event.clientX,
      y: event.clientY,
      title: patch.title || dragged.title || DEFAULT_MINDMAP_TASK_TITLE,
      nodeId: patch.nodeId || dragged.id,
      ...patch,
    });
  }, [draggedNodeId, nodes]);

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
  }, [flushPendingZoomIntent]);

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
  }, [getCurrentCoordinateMapper]);

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

  const startLeftMousePan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const surface = mapSurfaceRef.current;
    const blocked = (
      !surface ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.pointerType !== 'mouse' ||
      Boolean(draggedNodeId) ||
      relationshipToolActive ||
      Boolean(relationshipPointerDrag) ||
      isLeftMousePanBlockedTarget(event.target) ||
      (surface ? isMindMapNativeScrollbarPointer(surface, event.clientX, event.clientY) : true)
    );
    if (blocked || !surface) {
      leftMousePanRef.current = null;
      clearLeftMousePanTelemetry(surface);
      return;
    }
    leftMousePanRef.current = createLeftMousePanState(
      event.pointerId,
      event.clientX,
      event.clientY,
      surface.scrollLeft,
      surface.scrollTop,
    );
    setLeftMousePanTelemetry(surface, 'armed');
  }, [draggedNodeId, relationshipPointerDrag, relationshipToolActive]);

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
    const targetNodeId = nodeId || selectionStore.getSelectedNodeId();
    if (!targetNodeId) return;
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
  }, [archiveTask, boardId, canDeleteTask, getChildren, nodes, parentNodesIndex, rootNodes, selectNode, selectionStore]);

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
    const selectedNodeId = selectionStore.getSelectedNodeId();
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
  }, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectionStore]);

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
  }, [beginRelationshipDraftSelection, createNoteRelationshipInline, finishRelationshipDraftMode, relationshipDraft, relationshipToolActive, selectNode]);

  const handleNodePointerPrimary = React.useCallback((nodeId: string) => {
    handleNodeSelect(nodeId);
    if (!canEditTask || relationshipToolActive || draggedNodeId) return;
    pointerQuickTitleTimerRef.current = window.setTimeout(() => {
      pointerQuickTitleTimerRef.current = null;
      setInlineTitleEditNodeId(nodeId);
      setInlineTitleEditFocusNodeId(null);
    }, MINDMAP_POINTER_QUICK_TITLE_DELAY_MS);
  }, [canEditTask, draggedNodeId, handleNodeSelect, relationshipToolActive]);

  const handleNodeOpenDetails = React.useCallback((nodeId: string) => {
    if (relationshipToolActive || draggedNodeId) return;
    selectNode(nodeId);
    setSelectedTaskId(nodeId);
    openTaskDetails(nodeId);
  }, [draggedNodeId, relationshipToolActive, selectNode, setSelectedTaskId]);

  const handleNodeContextMenu = React.useCallback((nodeId: string, title: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    selectNode(nodeId);
    setSelectedTaskId(nodeId);
    setContextMenuState({
      kind: 'task',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      nodeId,
      title,
      interactionLocation: { hostMode: 'mindmap', origin: 'mode-primary' },
      surfaceId: 'mindmap.node',
      interactionId: `mindmap-context-${nodeId}-${Date.now().toString(36)}`,
    });
  }, [selectNode, setContextMenuState, setSelectedTaskId]);

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
    if (isMindMapRelationshipInteractionElement(event.target)) {
      return;
    }
    clearTaskSelection();
    clearSelection();
    clearRelationshipLabelEdit();
  }, [clearRelationshipLabelEdit, clearSelection]);

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
    if (event.key === 'Escape' && document.querySelector('[data-global-context-menu="true"]')) {
      return;
    }
    const consumeMindMapKeyboardEvent = () => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
    };
    const selectedNodeId = selectionStore.getSelectedNodeId();
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
      void archiveNode();
    }
  }, [
    archiveNode,
    deactivateRelationshipMode,
    createChildForNode,
    createSiblingForNode,
    clearSelection,
    cancelRelationshipPointerDrag,
    expandNode,
    getChildren,
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
    if (!canMoveTask || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = getDropModeFromPointer(event.currentTarget, event);
    const target = nodes[nodeId];
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
  }, [canMoveTask, draggedNodeId, getDragInsertionPreview, getNodeSide, nodes, setNodeDropPreviewTarget, updateDragPreview]);

  const handleDropOnNode = React.useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (!canMoveTask || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = dropTarget?.nodeId === nodeId ? dropTarget.mode : getDropModeFromPointer(event.currentTarget, event);
    const target = nodes[nodeId];
    const dragged = nodes[draggedNodeId];
    if (!target || !dragged) return;

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
  }, [boardId, canMoveTask, clearDragState, draggedNodeId, dropTarget, expandNode, getChildren, getNodeSide, nodes, parentNodesIndex, updateNode, updateRootSide]);

  const handleDropOnCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    const dragged = nodes[draggedNodeId];
    if (!dragged) return;
    const update = getMindMapCenterDropUpdate({ draggedNodeId, rootNodes, sideOverrides });
    updateNode(update.nodeId, { parentId: update.parentId, order: update.order });
    if (update.rootSide) updateRootSide(update.nodeId, update.rootSide);
    clearDragState();
  }, [canMoveTask, clearDragState, draggedNodeId, nodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const handleDragOverCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    setRootDropPreviewTarget(null);
    updateDragPreview(event, {
      targetParentId: undefined,
      dropPosition: 'root',
      direction: sideOverrides[draggedNodeId] || 'right',
      connectorPath: getDragPreviewConnectorPath(event, event.currentTarget, sideOverrides[draggedNodeId] || 'right'),
    });
  }, [canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, sideOverrides, updateDragPreview]);

  const handleDragOverSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if (!canMoveTask || !draggedNodeId) return;
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
  }, [canMoveTask, draggedNodeId, getDragPreviewConnectorPath, setRootDropPreviewTarget, updateDragPreview]);

  const handleDropOnSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const dragged = nodes[draggedNodeId];
    if (!dragged) return;
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
  }, [canMoveTask, clearDragState, dragPreview, draggedNodeId, getNodeSide, nodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const handleNodeDragStart = React.useCallback((nodeId: string, event: React.DragEvent<HTMLDivElement>) => {
    setTransparentDragImage(event.dataTransfer);
    setDraggedNodeId(nodeId);
    selectNode(nodeId);
    updateDragPreview(event, {
      nodeId,
      dropPosition: 'root',
      direction: getNodeSide(nodeId),
    });
  }, [getNodeSide, selectNode, updateDragPreview]);

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
      showStartDate={showStartDate}
      canMoveTask={canMoveTask}
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


      <MindMapCanvasShell
        surfaceRef={mapSurfaceRef}
        stageRef={mapStageRef}
        contentRef={mapContentRef}
        zoomLevelText={formatZoomLevel(zoomLevel)}
        mapContentStyle={mapContentStyle}
        stageStyle={stageStyle}
        sceneStyle={sceneStyle}
        relationshipToolActive={relationshipToolActive}
        relationshipDraftFromId={relationshipDraft?.fromId || ''}
        hasContent={rootNodes.length > 0}
        emptyState={<MindMapEmptyState canCreateTask={canCreateTask} onCreateRoot={handleCreateRoot} />}
        onMouseDown={startMiddleMousePan}
        onPointerDown={startLeftMousePan}
        onContentClick={handleSurfaceClick}
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

      <MindMapRelationshipStyleLayer
        relationshipPaths={relationshipPaths}
        selectedRelationshipId={selectedRelationshipId}
        editingRelationshipId={editingRelationshipId}
        onUpdateStyle={updateRelationshipStyle}
        onResetStyle={resetRelationshipStyle}
      />
      <MindMapDragPreviewBadge dragPreview={dragPreview} />
    </div>
  );
};

export default MindMapView;
