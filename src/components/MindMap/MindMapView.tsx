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
import MindMapNode, { type MindMapDirection, type MindMapDropMode, type MindMapDropTarget } from './MindMapNode';
import MindMapRelationshipInteractionLayer from './MindMapRelationshipInteractionLayer';
import MindMapRelationshipOverlay from './MindMapRelationshipOverlay';
import MindMapRootLayout from './MindMapRootLayout';
import MindMapRelationshipStyleLayer from './MindMapRelationshipStyleLayer';
import MindMapToolbar from './MindMapToolbar';
import {
  createInsertionPreview as createDragInsertionPreview,
  createPreviewConnectorPath as createDragPreviewConnectorPath,
  createScreenDragConnectorPath,
  getDropModeFromPointer,
  setTransparentDragImage,
  updateDragPreviewPointerPosition,
} from './mindMapDrag';
import {
  getAnchorForElement as getAnchorForElementFromClient,
  getElementLocalRect,
  getLocalLineSegmentStyle,
  getMapPointFromClient as getMapPointFromClientInSurface,
  getNodeElementAtPoint as getNodeElementAtPointInSurface,
} from './mindMapDomGeometry';
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
import { MINDMAP_MESSAGES, getMindMapDeleteTaskConfirmMessage } from './mindMapMessages';
import {
  makeRelationshipDraftPreview,
  type MindMapConnectorPath,
  type MindMapLayoutRect,
  type MindMapNoteRelationship,
  type MindMapRelationshipDraftPreview,
  type MindMapRelationshipPath,
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
  toggleMindMapExpandedNodeId,
} from './mindMapExpansion';
import { buildMindMapOverlayPaths } from './mindMapOverlayPaths';
import {
  getMindMapKeyboardAction,
  isMindMapDeleteKey,
  isMindMapRelationshipLabelEditKey,
  isMindMapTextEditingTarget,
} from './mindMapKeyboard';
import { getMindMapContentStyle } from './mindMapLayoutStyle';
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
  getCommittedMindMapTitle,
  getMindMapArchiveTaskPlan,
  getMindMapChildTaskCreatePlan,
  getMindMapSiblingTaskCreatePlan,
  getNextMindMapRootOrder,
} from './mindMapTaskCommands';
import {
  getFirstChildSelection,
  getParentSelection,
  getVisibleMindMapNodeIds,
  getVisibleNodeSelectionByVerticalArrow,
} from './mindMapSelection';
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
import { loadSideOverrides, saveSideOverrides } from './mindMapSideStorage';
import {
  centerMindMapContent as centerMindMapViewportContent,
  getFitZoomForBounds,
  getMindMapContentBounds as getMindMapViewportContentBounds,
  type MindMapContentCenterReason,
} from './mindMapViewport';
import {
  ZOOM_BUTTON_STEP,
  ZOOM_PREVIEW_COMMIT_DELAY_MS,
  applyZoomPreviewTelemetry,
  clampZoom,
  clearZoomPreviewTelemetry,
  formatZoomLevel,
  getAnchoredZoomScrollDelta,
  getWheelZoomDelta,
  getZoomAnchorFromClient,
  syncCommittedZoomTelemetry,
  type MindMapZoomAnchor,
} from './mindMapZoom';
import { openTaskDetails } from '../../utils/taskInteractions';

type RootSideDropTarget = MindMapDirection | null;

interface MindMapRelationshipDraft {
  fromId: string;
}

interface RelationshipPointerDragState {
  relationshipId: string;
  handle: MindMapRelationshipPointerHandle;
}

interface DragPreviewState extends MindMapDragPreviewModel {
  x: number;
  y: number;
  title: string;
}

const MindMapView: React.FC = () => {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoard = useBoardStore(state => state.getActiveBoard());
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const nodes = useWbsStore(state => state.nodes);
  const parentNodesIndex = useWbsStore(state => state.parentNodesIndex);
  const addNode = useWbsStore(state => state.addNode);
  const updateNode = useWbsStore(state => state.updateNode);
  const removeNode = useWbsStore(state => state.removeNode);
  const statusFilters = useBoardStore(state => state.statusFilters);
  const dueWithinDays = useBoardStore(state => state.dueWithinDays);
  const selectedAssigneeIds = useBoardStore(state => state.selectedAssigneeIds);
  const showStartDate = useBoardStore(state => state.showStartDate);
  const setSelectedTaskId = useBoardStore(state => state.setSelectedTaskId);
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const selectedTagIds = useTagStore(state => state.selectedTagIds);
  const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, isReadOnly } = useBoardPermissions();

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');
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
  const mapSurfaceRef = React.useRef<HTMLDivElement>(null);
  const mapContentRef = React.useRef<HTMLDivElement>(null);
  const relationshipLabelInputRef = React.useRef<HTMLInputElement>(null);
  const middleMousePanRef = React.useRef<MiddleMousePanState | null>(null);
  const middleMousePanFrameRef = React.useRef<number | null>(null);
  const zoomLabelRef = React.useRef<HTMLSpanElement>(null);
  const zoomLevelRef = React.useRef(zoomLevel);
  const zoomPreviewLevelRef = React.useRef(zoomLevel);
  const zoomPreviewFrameRef = React.useRef<number | null>(null);
  const zoomPreviewCommitTimerRef = React.useRef<number | null>(null);
  const zoomSuppressReleaseTimerRef = React.useRef<number | null>(null);
  const zoomSuppressTokenRef = React.useRef(0);
  const autoCenteredBoardRef = React.useRef<string | null>(null);
  const suppressZoomScrollRecomputeRef = React.useRef(false);
  const connectorRecomputeCountRef = React.useRef(0);
  const connectorRecomputeFrameRef = React.useRef<number | null>(null);
  const zoomPreviewAnchorRef = React.useRef<MindMapZoomAnchor | null>(null);
  const mapContentStyle = React.useMemo(() => getMindMapContentStyle(zoomLevel), [zoomLevel]);

  const boardId = activeBoardId || '';

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
    setSelectedRelationshipId(relationshipId);
    setSelectedNodeId(null);
  }, []);

  const selectNode = React.useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedRelationshipId(null);
  }, []);

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

  const clearNodeEdit = React.useCallback(() => {
    setEditingNodeId(null);
    setEditingTitle('');
  }, []);

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
    zoomPreviewLevelRef.current = zoomLevel;
    syncCommittedZoomTelemetry(mapSurfaceRef.current, zoomLabelRef.current, zoomLevel);
  }, [zoomLevel]);

  React.useEffect(() => () => {
    clearPendingTimeoutRef(zoomPreviewCommitTimerRef);
    clearPendingTimeoutRef(zoomSuppressReleaseTimerRef);
    cancelPendingAnimationFrameRef(zoomPreviewFrameRef);
    cancelPendingAnimationFrameRef(connectorRecomputeFrameRef);
  }, []);

  const mindMapFilters = React.useMemo(() => ({
    statusFilters,
    dueWithinDays,
    selectedAssigneeIds,
    selectedTagIds,
    keyword: '',
  }), [dueWithinDays, selectedAssigneeIds, selectedTagIds, statusFilters]);

  const rootNodes = React.useMemo(() => {
    return getMindMapRootNodes(nodes, parentNodesIndex, boardId, mindMapFilters);
  }, [boardId, mindMapFilters, nodes, parentNodesIndex]);

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
    const allVisibleIds = Object.values(nodes)
      .filter(node => !node.isArchived)
      .map(node => node.id);
    expandNodes(allVisibleIds);
  }, [expandNodes, nodes]);

  React.useEffect(() => {
    if (selectedNodeId && nodes[selectedNodeId] && !nodes[selectedNodeId].isArchived) return;
    selectNode(rootNodes[0]?.id ?? null);
  }, [nodes, rootNodes, selectNode, selectedNodeId]);

  React.useEffect(() => {
    if (!selectedNodeId || editingNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      const selected = getMindMapNodeElement(mapContentRef.current, selectedNodeId);
      selected?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingNodeId, selectedNodeId]);

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

  const getNodeSide = React.useCallback((nodeId: string): MindMapDirection => {
    const rootId = getMindMapRootAncestorId(nodes, nodeId);
    const branch = getMindMapNodeElement(mapContentRef.current, rootId);
    const domDirection = branch?.getAttribute(MINDMAP_NODE_DIRECTION_ATTRIBUTE);
    if (domDirection === 'left' || domDirection === 'right') return domDirection;
    return sideOverrides[rootId] || 'right';
  }, [nodes, sideOverrides]);

  const getLocalRect = React.useCallback((element: HTMLElement, surface: HTMLElement): MindMapLayoutRect => {
    return getElementLocalRect(element, surface, zoomLevelRef.current);
  }, []);

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
    if (suppressZoomScrollRecomputeRef.current) return;
    const surface = mapContentRef.current;
    if (!surface) return;
    connectorRecomputeCountRef.current += 1;
    mapSurfaceRef.current?.setAttribute('data-mindmap-recompute-count', String(connectorRecomputeCountRef.current));
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

  const scheduleConnectorRecompute = React.useCallback(() => {
    scheduleCoalescedAnimationFrame(connectorRecomputeFrameRef, recomputeConnectors);
  }, [recomputeConnectors]);

  React.useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(recomputeConnectors);
    return () => window.cancelAnimationFrame(frame);
  }, [recomputeConnectors, rootsBySide, expandedNodeIds, editingNodeId, editingTitle, dropTarget, rootSideDropTarget, relationshipToolActive, relationshipDraft]);

  React.useEffect(() => {
    const surface = mapContentRef.current;
    if (!surface) return undefined;
    const observer = new ResizeObserver(() => {
      if (suppressZoomScrollRecomputeRef.current) return;
      recomputeConnectors();
    });
    observer.observe(surface);
    const nodesToObserve = Array.from(surface.querySelectorAll(MINDMAP_CONTENT_BOUNDS_SELECTOR));
    nodesToObserve.forEach(element => observer.observe(element));
    window.addEventListener('resize', recomputeConnectors);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recomputeConnectors);
    };
  }, [recomputeConnectors, rootNodes.length]);

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
    if (!surface) return '';
    return createDragPreviewConnectorPath(event, targetElement, surface, zoomLevelRef.current, direction);
  }, []);

  const getDragInsertionPreview = React.useCallback((
    targetElement: HTMLElement,
    targetNode: TaskNode | undefined,
    mode: MindMapDropMode,
    direction: MindMapDirection,
  ): Pick<DragPreviewState, 'connectorPath' | 'insertionPreview'> => {
    const surface = mapContentRef.current;
    if (!surface) return {};
    return createDragInsertionPreview(targetElement, targetNode, mode, direction, surface, zoomLevelRef.current);
  }, []);

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
        if (targetElement) {
          connectorPath = createScreenDragConnectorPath(event, targetElement, direction);
        }
        return updateDragPreviewPointerPosition({ ...prev, connectorPath }, event);
      });
    };
    window.addEventListener('dragover', handleWindowDragOver);
    return () => window.removeEventListener('dragover', handleWindowDragOver);
  }, [draggedNodeId]);

  const createTask = React.useCallback((parentId: string | null, order: number, title = DEFAULT_MINDMAP_TASK_TITLE) => {
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
    expandNodes([parentId, node.id]);
    return node;
  }, [activeWorkspaceId, addNode, boardId, canCreateTask, expandNodes, selectNode]);

  const handleCreateRoot = React.useCallback(() => {
    createTask(null, getNextMindMapRootOrder(rootNodes));
  }, [createTask, rootNodes]);

  const clearZoomPreview = React.useCallback(() => {
    const surface = mapSurfaceRef.current;
    const content = mapContentRef.current;
    cancelPendingAnimationFrameRef(zoomPreviewFrameRef);
    clearZoomPreviewTelemetry(surface, content);
    zoomPreviewAnchorRef.current = null;
  }, []);

  const getMindMapContentBounds = React.useCallback(() => {
    const content = mapContentRef.current;
    if (!content) return null;
    return getMindMapViewportContentBounds(content, zoomLevelRef.current);
  }, []);

  const centerMindMapContent = React.useCallback((reason: MindMapContentCenterReason = 'repair') => {
    const surface = mapSurfaceRef.current;
    const content = mapContentRef.current;
    if (!surface || !content) return false;
    return centerMindMapViewportContent(surface, content, zoomLevelRef.current, reason);
  }, []);

  const commitZoom = React.useCallback((
    nextZoom: number,
    anchor?: MindMapZoomAnchor | null,
    afterCommit: 'preserve-anchor' | 'center-content' = 'preserve-anchor',
  ) => {
    const targetZoom = clampZoom(nextZoom);
    const previousZoom = zoomLevelRef.current || zoomLevel;
    zoomLevelRef.current = targetZoom;
    zoomPreviewLevelRef.current = targetZoom;
    clearPendingTimeoutRef(zoomPreviewCommitTimerRef);
    clearPendingTimeoutRef(zoomSuppressReleaseTimerRef);
    const suppressToken = zoomSuppressTokenRef.current + 1;
    zoomSuppressTokenRef.current = suppressToken;
    suppressZoomScrollRecomputeRef.current = true;
    setZoomLevel(targetZoom);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const surface = mapSurfaceRef.current;
        if (surface && anchor && previousZoom !== targetZoom) {
          const scrollDelta = getAnchoredZoomScrollDelta(anchor, previousZoom, targetZoom);
          surface.scrollLeft += scrollDelta.left;
          surface.scrollTop += scrollDelta.top;
        }
        clearZoomPreview();
        if (afterCommit === 'center-content') {
          centerMindMapContent('fit');
        }
        zoomSuppressReleaseTimerRef.current = window.setTimeout(() => {
          if (zoomSuppressTokenRef.current === suppressToken) {
            suppressZoomScrollRecomputeRef.current = false;
            zoomSuppressReleaseTimerRef.current = null;
          }
        }, 260);
      });
    });
  }, [centerMindMapContent, clearZoomPreview, zoomLevel]);

  const applyZoomPreview = React.useCallback(() => {
    scheduleCoalescedAnimationFrame(zoomPreviewFrameRef, () => {
      const surface = mapSurfaceRef.current;
      const content = mapContentRef.current;
      const anchor = zoomPreviewAnchorRef.current;
      if (!surface || !content || !anchor) return;
      const previewZoom = zoomPreviewLevelRef.current;
      applyZoomPreviewTelemetry(surface, content, zoomLabelRef.current, anchor, previewZoom);
    });
  }, []);

  const scheduleZoomPreviewCommit = React.useCallback(() => {
    clearPendingTimeoutRef(zoomPreviewCommitTimerRef);
    zoomPreviewCommitTimerRef.current = window.setTimeout(() => {
      zoomPreviewCommitTimerRef.current = null;
      commitZoom(zoomPreviewLevelRef.current, zoomPreviewAnchorRef.current);
    }, ZOOM_PREVIEW_COMMIT_DELAY_MS);
  }, [commitZoom]);

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

  const handleWheelZoom = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const surface = mapSurfaceRef.current;
    const content = mapContentRef.current;
    if (!surface || !content) return;
    event.preventDefault();

    if (!zoomPreviewAnchorRef.current) {
      const rect = content.getBoundingClientRect();
      zoomPreviewAnchorRef.current = getZoomAnchorFromClient(event.clientX, event.clientY, rect, zoomLevelRef.current);
    }

    zoomPreviewLevelRef.current = clampZoom(zoomPreviewLevelRef.current + getWheelZoomDelta(event.deltaY));
    applyZoomPreview();
    scheduleZoomPreviewCommit();
  }, [applyZoomPreview, scheduleZoomPreviewCommit]);

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
    const targetZoom = getFitZoomForBounds(surface, bounds, zoomLevelRef.current);
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
        window.requestAnimationFrame(recomputeConnectors);
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
          recomputeConnectors();
        } else {
          frames.push(window.requestAnimationFrame(tryCenter));
        }
      }));
    }));
    return () => {
      frames.forEach(frame => window.cancelAnimationFrame(frame));
    };
  }, [boardId, centerMindMapContent, recomputeConnectors, rootNodes]);

  const startEdit = React.useCallback((nodeId: string, initialTitle?: string) => {
    if (!canEditTask) {
      toast.warning(MINDMAP_MESSAGES.noEditTaskPermission);
      return;
    }
    const node = nodes[nodeId];
    if (!node) return;
    selectNode(nodeId);
    clearRelationshipLabelEdit();
    setEditingNodeId(nodeId);
    setEditingTitle(initialTitle ?? node.title ?? '');
  }, [canEditTask, clearRelationshipLabelEdit, nodes, selectNode]);

  const commitEditForNode = React.useCallback((nodeId: string, title = editingTitle) => {
    const node = nodes[nodeId];
    if (!node) return false;
    const nextTitle = getCommittedMindMapTitle(title);
    if (nextTitle !== node.title) updateNode(nodeId, { title: nextTitle });
    return true;
  }, [editingTitle, nodes, updateNode]);

  const commitEdit = React.useCallback(() => {
    if (!editingNodeId) return;
    commitEditForNode(editingNodeId);
    clearNodeEdit();
  }, [clearNodeEdit, commitEditForNode, editingNodeId]);

  const createSiblingForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const plan = getMindMapSiblingTaskCreatePlan({ nodeId, nodes, parentNodesIndex, boardId });
    if (!plan) return null;
    const created = createTask(plan.parentId, plan.order);
    if (created && plan.inheritRootSideFromId) {
      updateRootSide(created.id, getNodeSide(plan.inheritRootSideFromId));
    }
    return created;
  }, [boardId, createTask, getNodeSide, handleCreateRoot, nodes, parentNodesIndex, updateRootSide]);

  const createChildForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const plan = getMindMapChildTaskCreatePlan({ nodeId, nodes, getChildren });
    return plan ? createTask(plan.parentId, plan.order) : null;
  }, [createTask, getChildren, handleCreateRoot, nodes]);

  const archiveNode = React.useCallback(async () => {
    if (!selectedNodeId) return;
    if (!canDeleteTask) {
      toast.warning(MINDMAP_MESSAGES.noDeleteTaskPermission);
      return;
    }
    const plan = getMindMapArchiveTaskPlan({ selectedNodeId, nodes, parentNodesIndex, boardId, rootNodes, getChildren });
    if (!plan) return;
    const confirmed = plan.descendantIds.length === 0
      ? true
      : await useDialogStore.getState().showConfirm(getMindMapDeleteTaskConfirmMessage(plan.selected.title || DEFAULT_MINDMAP_TASK_TITLE, plan.descendantIds.length));

    if (!confirmed) return;

    [plan.selected.id, ...plan.descendantIds].forEach(id => removeNode(id));
    selectNode(plan.nextSelectionId);
    clearNodeEdit();
  }, [boardId, canDeleteTask, clearNodeEdit, getChildren, nodes, parentNodesIndex, removeNode, rootNodes, selectNode, selectedNodeId]);

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
  }, [beginRelationshipDraftSelectionWithCleanup, canEditTask, clearRelationshipDraft, clearSelectedRelationship, selectedNodeId]);

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

  const handleNodeOpenDetails = React.useCallback((nodeId: string) => {
    if (relationshipToolActive || editingNodeId || draggedNodeId) return;
    selectNode(nodeId);
    setSelectedTaskId(nodeId);
    openTaskDetails(nodeId);
  }, [draggedNodeId, editingNodeId, relationshipToolActive, selectNode, setSelectedTaskId]);

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
    });
  }, [selectNode, setContextMenuState, setSelectedTaskId]);

  const handleSurfaceClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMindMapRelationshipInteractionElement(event.target)) {
      return;
    }
    selectNode(null);
    clearRelationshipLabelEdit();
    clearRelationshipDraft();
  }, [clearRelationshipDraft, clearRelationshipLabelEdit, selectNode]);

  const updateRelationshipDraftPreview = React.useCallback((clientX: number, clientY: number) => {
    const fromId = relationshipDraft?.fromId;
    const surface = mapContentRef.current;
    if (!fromId || !surface) {
      clearRelationshipDraftPreview();
      return;
    }
    const source = getMindMapNodeElement(surface, fromId);
    if (!source) {
      clearRelationshipDraftPreview();
      return;
    }
    const rect = getLocalRect(source, surface);
    setRelationshipDraftPreview(makeRelationshipDraftPreview(
      fromId,
      rect,
      getMapPointFromClientInSurface(clientX, clientY, surface, zoomLevelRef.current),
    ));
  }, [clearRelationshipDraftPreview, getLocalRect, relationshipDraft]);

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
    if (!canEditTask) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectRelationship(relationshipId);
    clearRelationshipLabelEdit();
    setRelationshipPointerDrag({ relationshipId, handle });
  }, [canEditTask, clearRelationshipLabelEdit, selectRelationship]);

  React.useEffect(() => {
    if (!relationshipPointerDrag) return undefined;

    const handleMove = (event: PointerEvent) => {
      const surface = mapContentRef.current;
      if (!surface) return;
      const point = getMapPointFromClientInSurface(event.clientX, event.clientY, surface, zoomLevelRef.current);
      if (!point) return;
      const handle = relationshipPointerDrag.handle;
      if (handle === 'control-1' || handle === 'control-2') {
        setNoteRelationships(prev => updateRelationshipControlPointById(
          prev,
          relationshipPointerDrag.relationshipId,
          handle,
          point,
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
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [clearRelationshipPointerDrag, relationshipPointerDrag]);

  React.useEffect(() => {
    if (!selectedRelationshipId) return undefined;
    const handleRelationshipWindowKeyDown = (event: KeyboardEvent) => {
      if (isMindMapTextEditingTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
  }, [clearSelectedRelationship, removeRelationshipAndClearSelection, selectedRelationshipId, startRelationshipLabelEdit]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const consumeMindMapKeyboardEvent = () => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
    };
    const action = getMindMapKeyboardAction(event, {
      isEditingText: isMindMapTextEditingTarget(event.target),
      isEditingNode: Boolean(editingNodeId),
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
      deactivateRelationshipMode();
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
      const ids = getVisibleMindMapNodeIds(mapContentRef.current);
      const nextSelectionId = getVisibleNodeSelectionByVerticalArrow(
        selectedNodeId,
        ids,
        action.direction,
      );
      if (nextSelectionId) {
        consumeMindMapKeyboardEvent();
        selectNode(nextSelectionId);
      }
      return;
    }

    if (action.type === 'select-parent' && selectedNodeId) {
      consumeMindMapKeyboardEvent();
      const parentSelectionId = getParentSelection(selectedNodeId, nodes);
      if (parentSelectionId) selectNode(parentSelectionId);
      return;
    }

    if (action.type === 'select-first-child' && selectedNodeId) {
      consumeMindMapKeyboardEvent();
      const children = getChildren(selectedNodeId);
      const firstChildId = getFirstChildSelection(children);
      if (firstChildId) {
        expandNode(selectedNodeId);
        selectNode(firstChildId);
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

    if (action.type === 'rename-selected' && selectedNodeId) {
      consumeMindMapKeyboardEvent();
      startEdit(selectedNodeId, action.initialTitle);
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
    editingNodeId,
    expandNode,
    getChildren,
    nodes,
    relationshipDraft,
    relationshipToolActive,
    removeSelectedRelationship,
    selectNode,
    selectedNodeId,
    selectedRelationshipId,
    startEdit,
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
      selectedNodeId={selectedNodeId}
      editingNodeId={editingNodeId}
      editingTitle={editingTitle}
      expandedNodeIds={expandedNodeIds}
      dropTarget={dropTarget}
      isRelationshipModeActive={relationshipToolActive}
      showStartDate={showStartDate}
      canEditTask={canEditTask}
      canMoveTask={canMoveTask}
      onSelect={handleNodeSelect}
      onOpenDetails={handleNodeOpenDetails}
      onOpenContextMenu={handleNodeContextMenu}
      onToggleExpanded={toggleNodeExpansion}
      onEditStart={startEdit}
      onEditingTitleChange={setEditingTitle}
      onEditCommit={commitEdit}
      onEditCancel={clearNodeEdit}
      onDragStart={handleNodeDragStart}
      onDragMove={handleNodeDragMove}
      onDragEnd={clearDragState}
      onDragOverNode={handleDragOverNode}
      onDropOnNode={handleDropOnNode}
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
    <div className="flex h-full flex-col overflow-hidden bg-white" data-mindmap-view onKeyDown={handleKeyDown} tabIndex={-1}>
      <MindMapToolbar
        isReadOnly={isReadOnly}
        canEditTask={canEditTask}
        canCreateTask={canCreateTask}
        relationshipToolActive={relationshipToolActive}
        relationshipDraftFromId={relationshipDraft?.fromId || ''}
        zoomLevel={zoomLevel}
        zoomLabelRef={zoomLabelRef}
        onToggleRelationshipTool={toggleRelationshipTool}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onZoomReset={resetZoom}
        onZoomFit={fitToContent}
        onCreateRoot={handleCreateRoot}
      />


      <MindMapCanvasShell
        surfaceRef={mapSurfaceRef}
        contentRef={mapContentRef}
        zoomLevelText={formatZoomLevel(zoomLevel)}
        mapContentStyle={mapContentStyle}
        relationshipToolActive={relationshipToolActive}
        relationshipDraftFromId={relationshipDraft?.fromId || ''}
        hasContent={rootNodes.length > 0}
        emptyState={<MindMapEmptyState canCreateTask={canCreateTask} onCreateRoot={handleCreateRoot} />}
        onWheel={handleWheelZoom}
        onMouseDown={startMiddleMousePan}
        onContentClick={handleSurfaceClick}
      >
            <MindMapConnectorOverlay connectorPaths={connectorPaths} />

            <MindMapRelationshipOverlay
              relationshipPaths={relationshipPaths}
              relationshipDraftPreview={relationshipDraftPreview}
              selectedRelationshipId={selectedRelationshipId}
              hoveredRelationshipId={hoveredRelationshipId}
              editingRelationshipId={editingRelationshipId}
              selectRelationship={selectRelationship}
              hoverRelationship={hoverRelationship}
              clearRelationshipHover={clearRelationshipHover}
              startRelationshipLabelEdit={startRelationshipLabelEdit}
              startRelationshipPointerDrag={startRelationshipPointerDrag}
            />

            <MindMapDragPreviewLayer dragPreview={dragPreview} />

            <MindMapRelationshipInteractionLayer
              relationshipPaths={relationshipPaths}
              selectedRelationshipId={selectedRelationshipId}
              hoveredRelationshipId={hoveredRelationshipId}
              editingRelationshipId={editingRelationshipId}
              editingRelationshipLabel={editingRelationshipLabel}
              relationshipToolActive={relationshipToolActive}
              relationshipLabelInputRef={relationshipLabelInputRef}
              getLocalLineSegmentStyle={getLocalLineSegmentStyle}
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
