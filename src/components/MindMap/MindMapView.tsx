import React from 'react';
import { Link2, Maximize2, Network, Plus, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import useDialogStore from '../../store/useDialogStore';
import { toast } from '../../store/useToastStore';
import { useTagStore } from '../../store/useTagStore';
import { matchesAssigneeFilter, matchesDueDateFilter } from '../../utils/taskFilters';
import { matchesTagFilters } from '../../utils/tags';
import type { TaskNode } from '../../types';
import { Button } from '../ui/Button';
import { compactClassNames } from '../ui/compactTokens';
import MindMapNode, { type MindMapDirection, type MindMapDropMode, type MindMapDropTarget } from './MindMapNode';

type PositionedTaskNode = TaskNode & { mindMapSide?: MindMapDirection };
type SideOverrides = Record<string, MindMapDirection>;
type RootSideDropTarget = MindMapDirection | null;

interface MindMapConnectorPath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  depth: number;
  direction: MindMapDirection;
  d: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface MindMapNoteRelationship {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  style?: MindMapRelationshipStyle;
  geometry?: MindMapRelationshipGeometry;
}

interface MindMapRelationshipStyle {
  strokeColor?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  labelColor?: string;
  labelFontSize?: number;
}

interface MindMapRelationshipGeometry {
  fromAnchor?: MindMapRelationshipAnchor;
  toAnchor?: MindMapRelationshipAnchor;
  controlPoints?: MindMapRelationshipPoint[];
}

interface MindMapRelationshipAnchor {
  xRatio: number;
  yRatio: number;
}

interface MindMapRelationshipPoint {
  x: number;
  y: number;
}

interface MindMapRelationshipPath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  d: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  screenFromX: number;
  screenFromY: number;
  screenToX: number;
  screenToY: number;
  c1X: number;
  c1Y: number;
  c2X: number;
  c2Y: number;
  screenC1X: number;
  screenC1Y: number;
  screenC2X: number;
  screenC2Y: number;
  labelX: number;
  labelY: number;
  screenLabelX: number;
  screenLabelY: number;
  style: Required<MindMapRelationshipStyle>;
}

interface MindMapRelationshipDraft {
  fromId: string;
}

interface RelationshipPointerDragState {
  relationshipId: string;
  handle: 'from' | 'to' | 'control-1' | 'control-2';
}

interface DragPreviewState {
  x: number;
  y: number;
  title: string;
  nodeId: string;
  targetNodeId?: string;
  targetParentId?: string;
  siblingBeforeId?: string;
  siblingAfterId?: string;
  dropPosition: MindMapDropMode | 'root';
  direction?: MindMapDirection;
  connectorPath?: string;
  insertionPreview?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

const createNodeId = () =>
  `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const createRelationshipId = () =>
  `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const defaultRelationshipStyle: Required<MindMapRelationshipStyle> = {
  strokeColor: '#0284c7',
  strokeWidth: 2.25,
  strokeDasharray: '7 6',
  arrowStart: false,
  arrowEnd: true,
  labelColor: '#334155',
  labelFontSize: 12,
};

const relationshipColorOptions = ['#0284c7', '#0f172a', '#16a34a', '#dc2626', '#9333ea', '#f97316'];
const relationshipWidthOptions = [1.5, 2.25, 3.5];
const relationshipDashOptions = [
  { label: '實線', value: '' },
  { label: '虛線', value: '7 6' },
  { label: '點線', value: '2 5' },
];

const mergeRelationshipStyle = (style?: MindMapRelationshipStyle): Required<MindMapRelationshipStyle> => ({
  ...defaultRelationshipStyle,
  ...style,
});

const clampRatio = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));

const getRelationshipStylePanelStyle = (screenX: number, screenY: number): React.CSSProperties => {
  if (typeof window === 'undefined') {
    return { left: screenX, top: screenY + 56, width: 284 };
  }
  const width = Math.min(284, Math.max(240, window.innerWidth - 24));
  const left = Math.min(
    Math.max(width / 2 + 12, screenX),
    window.innerWidth - width / 2 - 12,
  );
  const top = Math.min(
    Math.max(56, screenY + 56),
    Math.max(56, window.innerHeight - 124),
  );
  return {
    left,
    top,
    width,
  };
};

const getRelationshipEditorStyle = (screenX: number, screenY: number): React.CSSProperties => {
  if (typeof window === 'undefined') {
    return { left: screenX, top: screenY, width: 136 };
  }
  const width = Math.min(160, Math.max(128, window.innerWidth - 24));
  const left = Math.min(
    Math.max(width / 2 + 12, screenX),
    window.innerWidth - width / 2 - 12,
  );
  const top = Math.min(
    Math.max(48, screenY),
    Math.max(48, window.innerHeight - 48),
  );
  return { left, top, width };
};

const getParentKey = (parentId: string | null) => parentId || 'root';

const getSiblingNodes = (nodes: Record<string, TaskNode>, parentNodesIndex: Record<string, string[]>, parentId: string | null, boardId: string) =>
  (parentNodesIndex[getParentKey(parentId)] || [])
    .map(id => nodes[id])
    .filter((node): node is TaskNode => Boolean(node) && node.boardId === boardId && !node.isArchived)
    .sort((a, b) => a.order - b.order);

const getInsertOrder = (siblings: TaskNode[], targetId: string, mode: Extract<MindMapDropMode, 'before' | 'after'>) => {
  const targetIndex = siblings.findIndex(node => node.id === targetId);
  if (targetIndex < 0) return siblings.length;
  const target = siblings[targetIndex];
  if (mode === 'before') {
    const previous = siblings[targetIndex - 1];
    return previous ? (previous.order + target.order) / 2 : target.order - 1;
  }
  const next = siblings[targetIndex + 1];
  return next ? (target.order + next.order) / 2 : target.order + 1;
};

const sortTasks = (tasks: TaskNode[]) => [...tasks].sort((a, b) => a.order - b.order);

const getSideStorageKey = (boardId: string) => `projed.mindmap.rootSides.${boardId}`;
const getRelationshipStorageKey = (boardId: string) => `projed.mindmap.noteRelationships.${boardId}`;

const loadSideOverrides = (boardId: string): SideOverrides => {
  if (!boardId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getSideStorageKey(boardId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SideOverrides;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, MindMapDirection] => entry[1] === 'left' || entry[1] === 'right'),
    );
  } catch {
    return {};
  }
};

const saveSideOverrides = (boardId: string, overrides: SideOverrides) => {
  if (!boardId || typeof window === 'undefined') return;
  window.localStorage.setItem(getSideStorageKey(boardId), JSON.stringify(overrides));
};

const loadNoteRelationships = (boardId: string): MindMapNoteRelationship[] => {
  if (!boardId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getRelationshipStorageKey(boardId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MindMapNoteRelationship[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MindMapNoteRelationship =>
      item?.boardId === boardId &&
      typeof item.id === 'string' &&
      typeof item.fromId === 'string' &&
      typeof item.toId === 'string' &&
      typeof item.label === 'string',
    );
  } catch {
    return [];
  }
};

const saveNoteRelationships = (boardId: string, relationships: MindMapNoteRelationship[]) => {
  if (!boardId || typeof window === 'undefined') return;
  window.localStorage.setItem(getRelationshipStorageKey(boardId), JSON.stringify(relationships));
};

const splitRootNodes = (nodes: TaskNode[], sideOverrides: SideOverrides): { left: PositionedTaskNode[]; right: PositionedTaskNode[] } => {
  const left: PositionedTaskNode[] = [];
  const right: PositionedTaskNode[] = [];
  sortTasks(nodes).forEach((node, index) => {
    const side = sideOverrides[node.id] || (index % 2 === 0 ? 'right' : 'left');
    if (side === 'right') {
      right.push({ ...node, mindMapSide: 'right' });
    } else {
      left.push({ ...node, mindMapSide: 'left' });
    }
  });
  return { left, right };
};

const getDropModeFromPointer = (event: React.DragEvent<HTMLElement>): MindMapDropMode => {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'child';
};

const clampZoom = (value: number) => Math.min(2, Math.max(0.5, Number(value.toFixed(2))));

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
};

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
  const [selectedRelationshipId, setSelectedRelationshipId] = React.useState<string | null>(null);
  const [editingRelationshipId, setEditingRelationshipId] = React.useState<string | null>(null);
  const [editingRelationshipLabel, setEditingRelationshipLabel] = React.useState('');
  const [relationshipPointerDrag, setRelationshipPointerDrag] = React.useState<RelationshipPointerDragState | null>(null);
  const [dragPreview, setDragPreview] = React.useState<DragPreviewState | null>(null);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const mapSurfaceRef = React.useRef<HTMLDivElement>(null);
  const mapContentRef = React.useRef<HTMLDivElement>(null);
  const relationshipLabelInputRef = React.useRef<HTMLInputElement>(null);

  const boardId = activeBoardId || '';

  const matchesMindMapFilters = React.useCallback((node: TaskNode) =>
    Boolean(statusFilters[node.status || 'todo']) &&
    matchesDueDateFilter(node, dueWithinDays) &&
    matchesAssigneeFilter(node, selectedAssigneeIds) &&
    matchesTagFilters(node, selectedTagIds),
  [dueWithinDays, selectedAssigneeIds, selectedTagIds, statusFilters]);

  const rootNodes = React.useMemo(() => {
    if (!boardId) return [];
    const root = (parentNodesIndex.root || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode => Boolean(node) && node.boardId === boardId && !node.isArchived && matchesMindMapFilters(node));
    const boardRoot = (parentNodesIndex[boardId] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode => Boolean(node) && node.boardId === boardId && !node.isArchived && matchesMindMapFilters(node));
    const deduped = new Map<string, TaskNode>();
    [...root, ...boardRoot].forEach(node => deduped.set(node.id, node));
    return sortTasks(Array.from(deduped.values()));
  }, [boardId, matchesMindMapFilters, nodes, parentNodesIndex]);

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
    setRelationshipToolActive(false);
    setRelationshipDraft(null);
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
    setRelationshipPointerDrag(null);
  }, [boardId]);

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
    setNoteRelationships(prev => prev.filter(relationship =>
      relationship.boardId === boardId &&
      validNodeIds.has(relationship.fromId) &&
      validNodeIds.has(relationship.toId),
    ));
  }, [boardId, nodes, noteRelationshipsLoadedBoardId]);

  React.useEffect(() => {
    if (!selectedRelationshipId) return;
    if (noteRelationships.some(relationship => relationship.id === selectedRelationshipId)) return;
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
  }, [noteRelationships, selectedRelationshipId]);

  React.useEffect(() => {
    const allVisibleIds = Object.values(nodes)
      .filter(node => !node.isArchived)
      .map(node => node.id);
    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      allVisibleIds.forEach(id => next.add(id));
      return next;
    });
  }, [nodes]);

  React.useEffect(() => {
    if (selectedNodeId && nodes[selectedNodeId] && !nodes[selectedNodeId].isArchived) return;
    setSelectedNodeId(rootNodes[0]?.id ?? null);
  }, [nodes, rootNodes, selectedNodeId]);

  React.useEffect(() => {
    if (!selectedNodeId || editingNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      const selected = mapContentRef.current?.querySelector(`[data-mindmap-node="${selectedNodeId}"]`) as HTMLElement | null;
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
    (parentNodesIndex[nodeId] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode => Boolean(node) && !node.isArchived && node.boardId === boardId && matchesMindMapFilters(node))
      .sort((a, b) => a.order - b.order),
  [boardId, matchesMindMapFilters, nodes, parentNodesIndex]);

  const getRootAncestorId = React.useCallback((nodeId: string) => {
    let current = nodes[nodeId];
    const visited = new Set<string>();
    while (current?.parentId && nodes[current.parentId] && !visited.has(current.id)) {
      visited.add(current.id);
      current = nodes[current.parentId];
    }
    return current?.id || nodeId;
  }, [nodes]);

  const getNodeSide = React.useCallback((nodeId: string): MindMapDirection => {
    const rootId = getRootAncestorId(nodeId);
    const branch = mapContentRef.current?.querySelector(`[data-mindmap-node="${rootId}"]`) as HTMLElement | null;
    const domDirection = branch?.getAttribute('data-mindmap-node-direction');
    if (domDirection === 'left' || domDirection === 'right') return domDirection;
    return sideOverrides[rootId] || 'right';
  }, [getRootAncestorId, sideOverrides]);

  const updateRootSide = React.useCallback((nodeId: string, direction: MindMapDirection) => {
    setSideOverrides(prev => {
      const stored = loadSideOverrides(boardId);
      const next = { ...stored, ...prev, [nodeId]: direction };
      saveSideOverrides(boardId, next);
      return next;
    });
  }, [boardId]);

  const clearDragState = React.useCallback(() => {
    setDraggedNodeId(null);
    setDropTarget(null);
    setRootSideDropTarget(null);
    setDragPreview(null);
  }, []);

  const makeConnectorPath = React.useCallback((
    fromRect: DOMRect,
    toRect: DOMRect,
    surfaceRect: DOMRect,
    direction: MindMapDirection,
    variant: 'curve' | 'bracket' = 'curve',
  ) => {
    const fromX = (direction === 'right' ? fromRect.right - surfaceRect.left : fromRect.left - surfaceRect.left) / zoomLevel;
    const toX = (direction === 'right' ? toRect.left - surfaceRect.left : toRect.right - surfaceRect.left) / zoomLevel;
    const fromY = (fromRect.top - surfaceRect.top + fromRect.height / 2) / zoomLevel;
    const toY = (toRect.top - surfaceRect.top + toRect.height / 2) / zoomLevel;
    if (variant === 'bracket') {
      const gap = Math.max(Math.min(Math.abs(toX - fromX) * 0.42, 72), 34);
      const trunkX = direction === 'right'
        ? Math.min(fromX + gap, toX - 18)
        : Math.max(fromX - gap, toX + 18);
      return {
        d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} H ${trunkX.toFixed(2)} V ${toY.toFixed(2)} H ${toX.toFixed(2)}`,
        fromX,
        fromY,
        toX,
        toY,
      };
    }
    const delta = Math.max(Math.abs(toX - fromX) * 0.45, 44);
    const c1X = direction === 'right' ? fromX + delta : fromX - delta;
    const c2X = direction === 'right' ? toX - delta : toX + delta;
    return {
      d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`,
      fromX,
      fromY,
      toX,
      toY,
    };
  }, [zoomLevel]);

  const makeRelationshipPath = React.useCallback((
    relationship: MindMapNoteRelationship,
    fromRect: DOMRect,
    toRect: DOMRect,
    surfaceRect: DOMRect,
  ) => {
    const style = mergeRelationshipStyle(relationship.style);
    const fromCenterX = fromRect.left + fromRect.width / 2;
    const toCenterX = toRect.left + toRect.width / 2;
    const exitsRight = fromCenterX <= toCenterX;
    const fromAnchor = relationship.geometry?.fromAnchor;
    const toAnchor = relationship.geometry?.toAnchor;
    const fromX = fromAnchor
      ? (fromRect.left - surfaceRect.left + fromRect.width * clampRatio(fromAnchor.xRatio)) / zoomLevel
      : (exitsRight ? fromRect.right - surfaceRect.left : fromRect.left - surfaceRect.left) / zoomLevel;
    const toX = toAnchor
      ? (toRect.left - surfaceRect.left + toRect.width * clampRatio(toAnchor.xRatio)) / zoomLevel
      : (exitsRight ? toRect.left - surfaceRect.left : toRect.right - surfaceRect.left) / zoomLevel;
    const fromY = fromAnchor
      ? (fromRect.top - surfaceRect.top + fromRect.height * clampRatio(fromAnchor.yRatio)) / zoomLevel
      : (fromRect.top - surfaceRect.top + fromRect.height / 2) / zoomLevel;
    const toY = toAnchor
      ? (toRect.top - surfaceRect.top + toRect.height * clampRatio(toAnchor.yRatio)) / zoomLevel
      : (toRect.top - surfaceRect.top + toRect.height / 2) / zoomLevel;
    const horizontalSpan = Math.abs(toX - fromX);
    const verticalSpan = Math.abs(toY - fromY);
    const curveOffset = Math.max(150, Math.min(340, horizontalSpan * 0.42 + verticalSpan * 0.72));
    const defaultControlX = exitsRight
      ? Math.max(fromX, toX) + curveOffset
      : Math.min(fromX, toX) - curveOffset;
    const [controlOne, controlTwo] = relationship.geometry?.controlPoints || [];
    const c1X = controlOne?.x ?? defaultControlX;
    const c1Y = controlOne?.y ?? fromY;
    const c2X = controlTwo?.x ?? defaultControlX;
    const c2Y = controlTwo?.y ?? toY;
    const labelX = (c1X + c2X) / 2 + (exitsRight ? 12 : -12);
    const labelY = (c1Y + c2Y) / 2;
    const screenFromX = surfaceRect.left + fromX * zoomLevel;
    const screenFromY = surfaceRect.top + fromY * zoomLevel;
    const screenToX = surfaceRect.left + toX * zoomLevel;
    const screenToY = surfaceRect.top + toY * zoomLevel;
    const screenC1X = surfaceRect.left + c1X * zoomLevel;
    const screenC1Y = surfaceRect.top + c1Y * zoomLevel;
    const screenC2X = surfaceRect.left + c2X * zoomLevel;
    const screenC2Y = surfaceRect.top + c2Y * zoomLevel;
    const screenLabelX = surfaceRect.left + labelX * zoomLevel;
    const screenLabelY = surfaceRect.top + labelY * zoomLevel;

    return {
      d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${c1Y.toFixed(2)} ${c2X.toFixed(2)} ${c2Y.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`,
      fromX,
      fromY,
      toX,
      toY,
      screenFromX,
      screenFromY,
      screenToX,
      screenToY,
      c1X,
      c1Y,
      c2X,
      c2Y,
      screenC1X,
      screenC1Y,
      screenC2X,
      screenC2Y,
      labelX,
      labelY,
      screenLabelX,
      screenLabelY,
      style,
    };
  }, [zoomLevel]);

  const recomputeConnectors = React.useCallback(() => {
    const surface = mapContentRef.current;
    if (!surface) return;
    const surfaceRect = surface.getBoundingClientRect();
    const center = surface.querySelector('[data-mindmap-center]') as HTMLElement | null;
    if (!center) {
      setConnectorPaths([]);
      return;
    }
    const centerRect = center.getBoundingClientRect();
    const nextPaths: MindMapConnectorPath[] = [];
    const nextRelationshipPaths: MindMapRelationshipPath[] = [];
    const visibleNodes = Array.from(surface.querySelectorAll<HTMLElement>('[data-mindmap-node]'));
    const visibleNodeIds = new Set(visibleNodes.map(element => element.getAttribute('data-mindmap-node')).filter(Boolean));
    const visibleNodeById = new Map(
      visibleNodes
        .map(element => [element.getAttribute('data-mindmap-node'), element] as const)
        .filter((entry): entry is [string, HTMLElement] => Boolean(entry[0])),
    );

    rootNodes.forEach(root => {
      const rootElement = surface.querySelector(`[data-mindmap-node="${root.id}"]`) as HTMLElement | null;
      if (!rootElement) return;
      const direction = getNodeSide(root.id);
      const segment = makeConnectorPath(centerRect, rootElement.getBoundingClientRect(), surfaceRect, direction);
      nextPaths.push({
        id: `center-${root.id}`,
        fromNodeId: 'center',
        toNodeId: root.id,
        depth: 1,
        direction,
        ...segment,
      });
    });

    visibleNodes.forEach(element => {
      const childId = element.getAttribute('data-mindmap-node');
      if (!childId) return;
      const parentId = element.getAttribute('data-mindmap-parent-id');
      if (!parentId || !visibleNodeIds.has(parentId)) return;
      const parentElement = surface.querySelector(`[data-mindmap-node="${parentId}"]`) as HTMLElement | null;
      if (!parentElement) return;
      const direction = getNodeSide(childId);
      const level = Number(element.getAttribute('data-mindmap-node-level') || '1');
      const segment = makeConnectorPath(parentElement.getBoundingClientRect(), element.getBoundingClientRect(), surfaceRect, direction, 'bracket');
      nextPaths.push({
        id: `${parentId}-${childId}`,
        fromNodeId: parentId,
        toNodeId: childId,
        depth: level,
        direction,
        ...segment,
      });
    });

    noteRelationships.forEach(relationship => {
      const fromElement = visibleNodeById.get(relationship.fromId);
      const toElement = visibleNodeById.get(relationship.toId);
      if (!fromElement || !toElement) return;
      nextRelationshipPaths.push({
        id: relationship.id,
        fromNodeId: relationship.fromId,
        toNodeId: relationship.toId,
        label: relationship.label,
        ...makeRelationshipPath(relationship, fromElement.getBoundingClientRect(), toElement.getBoundingClientRect(), surfaceRect),
      });
    });

    setConnectorPaths(nextPaths);
    setRelationshipPaths(nextRelationshipPaths);
  }, [getNodeSide, makeConnectorPath, makeRelationshipPath, noteRelationships, rootNodes]);

  React.useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(recomputeConnectors);
    return () => window.cancelAnimationFrame(frame);
  }, [recomputeConnectors, rootsBySide, expandedNodeIds, editingNodeId, editingTitle, dropTarget, rootSideDropTarget, zoomLevel, relationshipToolActive, relationshipDraft]);

  React.useEffect(() => {
    const surface = mapContentRef.current;
    const scrollSurface = mapSurfaceRef.current;
    if (!surface) return undefined;
    const observer = new ResizeObserver(() => recomputeConnectors());
    observer.observe(surface);
    const nodesToObserve = Array.from(surface.querySelectorAll('[data-mindmap-node], [data-mindmap-center]'));
    nodesToObserve.forEach(element => observer.observe(element));
    const handleScrollOrResize = () => recomputeConnectors();
    scrollSurface?.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      observer.disconnect();
      scrollSurface?.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [connectorPaths.length, relationshipPaths.length, recomputeConnectors, rootNodes.length]);

  const wouldCreateCycle = React.useCallback((draggedId: string, newParentId: string | null) => {
    if (!newParentId) return false;
    if (draggedId === newParentId) return true;
    const visited = new Set<string>([draggedId]);
    let current: string | null = newParentId;
    while (current) {
      if (current === draggedId || visited.has(current)) return true;
      visited.add(current);
      current = nodes[current]?.parentId || null;
    }
    return false;
  }, [nodes]);

  const createPreviewConnectorPath = React.useCallback((
    event: React.DragEvent<HTMLElement>,
    targetElement: HTMLElement,
    direction: MindMapDirection,
  ) => {
    const targetRect = targetElement.getBoundingClientRect();
    const fromX = direction === 'right' ? targetRect.right : targetRect.left;
    const fromY = targetRect.top + targetRect.height / 2;
    const toX = event.clientX;
    const toY = event.clientY;
    const delta = Math.max(Math.abs(toX - fromX) * 0.45, 42);
    const c1X = direction === 'right' ? fromX + delta : fromX - delta;
    const c2X = direction === 'right' ? toX - delta : toX + delta;
    return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
  }, []);

  const createFixedConnectorPath = React.useCallback((
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    direction: MindMapDirection,
  ) => {
    const delta = Math.max(Math.abs(toX - fromX) * 0.45, 42);
    const c1X = direction === 'right' ? fromX + delta : fromX - delta;
    const c2X = direction === 'right' ? toX - delta : toX + delta;
    return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
  }, []);

  const createInsertionPreview = React.useCallback((
    targetElement: HTMLElement,
    targetNode: TaskNode | undefined,
    mode: MindMapDropMode,
    direction: MindMapDirection,
  ): Pick<DragPreviewState, 'connectorPath' | 'insertionPreview'> => {
    const targetRect = targetElement.getBoundingClientRect();
    const isLeft = direction === 'left';
    const parentSelector = mode === 'child'
      ? `[data-mindmap-node="${targetNode?.id || ''}"]`
      : targetNode?.parentId
        ? `[data-mindmap-node="${targetNode.parentId}"]`
        : '[data-mindmap-center]';
    const parentElement = document.querySelector(parentSelector) as HTMLElement | null;
    const parentRect = parentElement?.getBoundingClientRect() || targetRect;
    const insertionPreview = mode === 'child'
      ? {
          left: isLeft ? targetRect.left - 126 : targetRect.right + 24,
          top: targetRect.top + targetRect.height / 2 - 6,
          width: 112,
          height: 12,
        }
      : {
          left: targetRect.left,
          top: mode === 'before' ? targetRect.top - 12 : targetRect.bottom + 6,
          width: targetRect.width,
          height: 10,
        };
    const fromX = isLeft ? parentRect.left : parentRect.right;
    const fromY = parentRect.top + parentRect.height / 2;
    const toX = isLeft ? insertionPreview.left + insertionPreview.width : insertionPreview.left;
    const toY = insertionPreview.top + insertionPreview.height / 2;
    return {
      insertionPreview,
      connectorPath: createFixedConnectorPath(fromX, fromY, toX, toY, direction),
    };
  }, [createFixedConnectorPath]);

  const updateDragPreview = React.useCallback((
    event: React.DragEvent<HTMLElement>,
    patch: Omit<DragPreviewState, 'x' | 'y' | 'title' | 'nodeId'> & Partial<Pick<DragPreviewState, 'title' | 'nodeId'>>,
  ) => {
    const dragged = patch.nodeId ? nodes[patch.nodeId] : draggedNodeId ? nodes[draggedNodeId] : null;
    if (!dragged) return;
    setDragPreview({
      x: event.clientX,
      y: event.clientY,
      title: patch.title || dragged.title || '未命名任務',
      nodeId: patch.nodeId || dragged.id,
      ...patch,
    });
  }, [draggedNodeId, nodes]);

  const setTransparentDragImage = (event: React.DragEvent<HTMLElement>) => {
    const image = document.createElement('canvas');
    image.width = 1;
    image.height = 1;
    event.dataTransfer.setDragImage(image, 0, 0);
  };

  React.useEffect(() => {
    if (!draggedNodeId) return undefined;
    const handleWindowDragOver = (event: DragEvent) => {
      setDragPreview(prev => {
        if (!prev) return prev;
        if (prev.insertionPreview) {
          return { ...prev, x: event.clientX, y: event.clientY };
        }
        let connectorPath = prev.connectorPath;
        const direction = prev.direction || 'right';
        const targetSelector = prev.targetNodeId
          ? `[data-mindmap-node="${prev.targetNodeId}"]`
          : '[data-mindmap-center]';
        const targetElement = document.querySelector(targetSelector) as HTMLElement | null;
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const fromX = direction === 'right' ? rect.right : rect.left;
          const fromY = rect.top + rect.height / 2;
          const toX = event.clientX;
          const toY = event.clientY;
          const delta = Math.max(Math.abs(toX - fromX) * 0.45, 42);
          const c1X = direction === 'right' ? fromX + delta : fromX - delta;
          const c2X = direction === 'right' ? toX - delta : toX + delta;
          connectorPath = `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
        }
        return {
          ...prev,
          x: event.clientX,
          y: event.clientY,
          connectorPath,
        };
      });
    };
    window.addEventListener('dragover', handleWindowDragOver);
    return () => window.removeEventListener('dragover', handleWindowDragOver);
  }, [draggedNodeId]);

  const createTask = React.useCallback((parentId: string | null, order: number, title = '新任務') => {
    if (!canCreateTask || !activeWorkspaceId || !boardId) {
      toast.warning('你沒有新增任務的權限。');
      return null;
    }

    const node: TaskNode = {
      id: createNodeId(),
      workspaceId: activeWorkspaceId,
      boardId,
      parentId,
      title,
      status: 'todo',
      nodeType: 'task',
      order,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addNode(node);
    setSelectedNodeId(node.id);
    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      if (parentId) next.add(parentId);
      next.add(node.id);
      return next;
    });
    return node;
  }, [activeWorkspaceId, addNode, boardId, canCreateTask]);

  const handleCreateRoot = React.useCallback(() => {
    const order = rootNodes.length > 0 ? Math.max(...rootNodes.map(node => node.order)) + 1 : 0;
    createTask(null, order);
  }, [createTask, rootNodes]);

  const setZoom = React.useCallback((nextZoom: number) => {
    setZoomLevel(clampZoom(nextZoom));
    window.requestAnimationFrame(recomputeConnectors);
  }, [recomputeConnectors]);

  const fitToContent = React.useCallback(() => {
    const surface = mapSurfaceRef.current;
    const content = mapContentRef.current;
    if (!surface || !content) return;
    const contentWidth = content.scrollWidth || content.getBoundingClientRect().width;
    const contentHeight = content.scrollHeight || content.getBoundingClientRect().height;
    const widthRatio = surface.clientWidth / Math.max(contentWidth, 1);
    const heightRatio = surface.clientHeight / Math.max(contentHeight, 1);
    setZoom(Math.min(1.25, Math.max(0.5, Math.min(widthRatio, heightRatio) * 0.92)));
  }, [setZoom]);

  const startEdit = React.useCallback((nodeId: string, initialTitle?: string) => {
    if (!canEditTask) {
      toast.warning('你沒有編輯任務的權限。');
      return;
    }
    const node = nodes[nodeId];
    if (!node) return;
    setSelectedNodeId(nodeId);
    setEditingNodeId(nodeId);
    setEditingTitle(initialTitle ?? node.title ?? '');
  }, [canEditTask, nodes]);

  const commitEditForNode = React.useCallback((nodeId: string, title = editingTitle) => {
    const node = nodes[nodeId];
    if (!node) {
      setEditingNodeId(null);
      return false;
    }
    const nextTitle = title.trim() || '未命名任務';
    if (nextTitle !== node.title) updateNode(nodeId, { title: nextTitle });
    return true;
  }, [editingTitle, nodes, updateNode]);

  const commitEdit = React.useCallback(() => {
    if (!editingNodeId) return;
    commitEditForNode(editingNodeId);
    setEditingNodeId(null);
    setEditingTitle('');
  }, [commitEditForNode, editingNodeId]);

  const cancelEdit = React.useCallback(() => {
    setEditingNodeId(null);
    setEditingTitle('');
  }, []);

  const createSiblingForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const selected = nodes[nodeId];
    if (!selected) return null;
    const siblings = getSiblingNodes(nodes, parentNodesIndex, selected.parentId, boardId);
    const order = getInsertOrder(siblings, selected.id, 'after');
    const created = createTask(selected.parentId || null, order);
    if (created && !selected.parentId) {
      updateRootSide(created.id, getNodeSide(selected.id));
    }
    return created;
  }, [boardId, createTask, getNodeSide, handleCreateRoot, nodes, parentNodesIndex, updateRootSide]);

  const createSibling = React.useCallback(() => createSiblingForNode(selectedNodeId), [createSiblingForNode, selectedNodeId]);

  const createChildForNode = React.useCallback((nodeId: string | null) => {
    if (!nodeId) return handleCreateRoot();
    const selected = nodes[nodeId];
    if (!selected) return null;
    const children = getChildren(selected.id);
    const order = children.length > 0 ? Math.max(...children.map(node => node.order)) + 1 : 0;
    return createTask(selected.id, order);
  }, [createTask, getChildren, handleCreateRoot, nodes]);

  const createChild = React.useCallback(() => createChildForNode(selectedNodeId), [createChildForNode, selectedNodeId]);

  const archiveNode = React.useCallback(async () => {
    if (!selectedNodeId) return;
    if (!canDeleteTask) {
      toast.warning('你沒有刪除任務的權限。');
      return;
    }
    const selected = nodes[selectedNodeId];
    if (!selected) return;

    const collectDescendants = (nodeId: string, visited = new Set<string>()): string[] => {
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);
      return getChildren(nodeId).flatMap(child => [child.id, ...collectDescendants(child.id, visited)]);
    };
    const descendantIds = collectDescendants(selected.id);
    const deletingIds = new Set([selected.id, ...descendantIds]);
    const siblings = getSiblingNodes(nodes, parentNodesIndex, selected.parentId, boardId)
      .filter(node => !deletingIds.has(node.id));
    const previousSibling = siblings
      .filter(node => node.order < selected.order)
      .sort((a, b) => b.order - a.order)[0];
    const nextSibling = siblings
      .filter(node => node.order > selected.order)
      .sort((a, b) => a.order - b.order)[0];
    const parentCandidate = selected.parentId && nodes[selected.parentId] && !nodes[selected.parentId].isArchived
      ? nodes[selected.parentId]
      : null;
    const fallbackRoot = rootNodes.find(node => !deletingIds.has(node.id));
    const nextSelectionId = previousSibling?.id || parentCandidate?.id || nextSibling?.id || fallbackRoot?.id || null;
    const confirmed = descendantIds.length === 0
      ? true
      : await useDialogStore.getState().showConfirm(`「${selected.title || '未命名任務'}」包含 ${descendantIds.length} 個子任務。確認刪除後，整個分支都會移到回收桶。`);

    if (!confirmed) return;

    [selected.id, ...descendantIds].forEach(id => removeNode(id));
    setSelectedNodeId(nextSelectionId);
    setEditingNodeId(null);
  }, [boardId, canDeleteTask, getChildren, nodes, parentNodesIndex, removeNode, rootNodes, selectedNodeId]);

  const startRelationshipLabelEdit = React.useCallback((relationshipId: string) => {
    const relationship = noteRelationships.find(item => item.id === relationshipId);
    if (!relationship || !canEditTask) return;
    setSelectedRelationshipId(relationshipId);
    setSelectedNodeId(null);
    setEditingRelationshipId(relationshipId);
    setEditingRelationshipLabel(relationship.label || '有關');
  }, [canEditTask, noteRelationships]);

  const commitRelationshipLabelEdit = React.useCallback(() => {
    if (!editingRelationshipId) return;
    const nextLabel = editingRelationshipLabel.trim() || '有關';
    setNoteRelationships(prev => prev.map(item =>
      item.id === editingRelationshipId
        ? { ...item, label: nextLabel, updatedAt: Date.now() }
        : item,
    ));
    setEditingRelationshipId(null);
    setEditingRelationshipLabel('');
    window.requestAnimationFrame(recomputeConnectors);
  }, [editingRelationshipId, editingRelationshipLabel, recomputeConnectors]);

  const cancelRelationshipLabelEdit = React.useCallback(() => {
    setEditingRelationshipId(null);
    setEditingRelationshipLabel('');
  }, []);

  const editRelationshipLabel = React.useCallback(async (relationshipId: string) => {
    const relationship = noteRelationships.find(item => item.id === relationshipId);
    if (!relationship || !canEditTask) return;
    const label = await useDialogStore.getState().showPrompt('請輸入關聯線文字', relationship.label || '有關');
    if (label === null) return;
    setNoteRelationships(prev => prev.map(item =>
      item.id === relationshipId
        ? { ...item, label: label.trim() || '有關', updatedAt: Date.now() }
        : item,
    ));
    window.requestAnimationFrame(recomputeConnectors);
  }, [canEditTask, noteRelationships, recomputeConnectors]);

  const removeSelectedRelationship = React.useCallback(() => {
    if (!selectedRelationshipId) return;
    setNoteRelationships(prev => prev.filter(item => item.id !== selectedRelationshipId));
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
  }, [selectedRelationshipId]);

  const toggleRelationshipTool = React.useCallback(() => {
    if (!canEditTask) {
      toast.warning('沒有編輯權限，無法建立關聯線');
      return;
    }
    setRelationshipToolActive(active => {
      const nextActive = !active;
      if (nextActive && selectedNodeId) {
        setRelationshipDraft({ fromId: selectedNodeId });
      } else {
        setRelationshipDraft(null);
      }
      return nextActive;
    });
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
  }, [canEditTask, selectedNodeId]);

  const createNoteRelationship = React.useCallback(async (fromId: string, toId: string) => {
    if (!canEditTask || !boardId) return;
    if (fromId === toId) {
      toast.warning('關聯線需要連到另一個任務');
      return;
    }
    const fromNode = nodes[fromId];
    const toNode = nodes[toId];
    if (!fromNode || !toNode || fromNode.isArchived || toNode.isArchived) {
      setNoteRelationships(prev => prev.filter(item => item.fromId !== fromId && item.toId !== toId));
      return;
    }
    const existing = noteRelationships.find(item =>
      (item.fromId === fromId && item.toId === toId) ||
      (item.fromId === toId && item.toId === fromId),
    );
    if (existing) {
      setSelectedRelationshipId(existing.id);
      await editRelationshipLabel(existing.id);
      return;
    }
    const label = await useDialogStore.getState().showPrompt('請輸入關聯線文字', '有關');
    if (label === null) return;
    const now = Date.now();
    const relationship: MindMapNoteRelationship = {
      id: createRelationshipId(),
      boardId,
      fromId,
      toId,
      label: label.trim() || '有關',
      createdAt: now,
      updatedAt: now,
    };
    setNoteRelationships(prev => [...prev, relationship]);
    setSelectedRelationshipId(relationship.id);
    window.requestAnimationFrame(recomputeConnectors);
  }, [boardId, canEditTask, editRelationshipLabel, nodes, noteRelationships, recomputeConnectors]);
  React.useDebugValue(createNoteRelationship, () => 'legacy prompt relationship flow retired');

  const createNoteRelationshipInline = React.useCallback((fromId: string, toId: string) => {
    if (!canEditTask || !boardId) return;
    if (fromId === toId) {
      toast.warning('關聯線需要連到另一個任務');
      return;
    }
    const fromNode = nodes[fromId];
    const toNode = nodes[toId];
    if (!fromNode || !toNode || fromNode.isArchived || toNode.isArchived) {
      setNoteRelationships(prev => prev.filter(item => item.fromId !== fromId && item.toId !== toId));
      return;
    }
    const existing = noteRelationships.find(item =>
      (item.fromId === fromId && item.toId === toId) ||
      (item.fromId === toId && item.toId === fromId),
    );
    if (existing) {
      startRelationshipLabelEdit(existing.id);
      return;
    }
    const now = Date.now();
    const relationship: MindMapNoteRelationship = {
      id: createRelationshipId(),
      boardId,
      fromId,
      toId,
      label: '有關',
      createdAt: now,
      updatedAt: now,
    };
    setNoteRelationships(prev => [...prev, relationship]);
    setSelectedRelationshipId(relationship.id);
    setSelectedNodeId(null);
    setEditingRelationshipId(relationship.id);
    setEditingRelationshipLabel(relationship.label);
    window.requestAnimationFrame(recomputeConnectors);
  }, [boardId, canEditTask, nodes, noteRelationships, recomputeConnectors, startRelationshipLabelEdit]);

  const handleNodeSelect = React.useCallback((nodeId: string) => {
    if (!relationshipToolActive) {
      setSelectedNodeId(nodeId);
      setSelectedRelationshipId(null);
      return;
    }
    if (!relationshipDraft) {
      setRelationshipDraft({ fromId: nodeId });
      setSelectedNodeId(nodeId);
      setSelectedRelationshipId(null);
      return;
    }
    createNoteRelationshipInline(relationshipDraft.fromId, nodeId);
    setRelationshipToolActive(false);
    setRelationshipDraft(null);
  }, [createNoteRelationshipInline, relationshipDraft, relationshipToolActive]);

  const handleSurfaceClick = React.useCallback(() => {
    setSelectedNodeId(null);
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
    setRelationshipDraft(null);
  }, []);

  const getMapPointFromClient = React.useCallback((clientX: number, clientY: number): MindMapRelationshipPoint | null => {
    const surface = mapContentRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoomLevel,
      y: (clientY - rect.top) / zoomLevel,
    };
  }, [zoomLevel]);

  const getNodeElementAtPoint = React.useCallback((clientX: number, clientY: number) => {
    const surface = mapContentRef.current;
    if (!surface) return null;
    return Array.from(surface.querySelectorAll<HTMLElement>('[data-mindmap-node]')).find((element) => {
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }) || null;
  }, []);

  const getAnchorForElement = React.useCallback((clientX: number, clientY: number, element: HTMLElement): MindMapRelationshipAnchor => {
    const rect = element.getBoundingClientRect();
    return {
      xRatio: clampRatio((clientX - rect.left) / Math.max(rect.width, 1)),
      yRatio: clampRatio((clientY - rect.top) / Math.max(rect.height, 1)),
    };
  }, []);

  const updateRelationshipStyle = React.useCallback((relationshipId: string, patch: MindMapRelationshipStyle) => {
    setNoteRelationships(prev => prev.map(item =>
      item.id === relationshipId
        ? { ...item, style: { ...item.style, ...patch }, updatedAt: Date.now() }
        : item,
    ));
  }, []);

  const resetRelationshipStyle = React.useCallback((relationshipId: string) => {
    setNoteRelationships(prev => prev.map(item =>
      item.id === relationshipId
        ? { ...item, style: undefined, updatedAt: Date.now() }
        : item,
    ));
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
    setSelectedRelationshipId(relationshipId);
    setSelectedNodeId(null);
    setEditingRelationshipId(null);
    setRelationshipPointerDrag({ relationshipId, handle });
  }, [canEditTask]);

  React.useEffect(() => {
    if (!relationshipPointerDrag) return undefined;

    const handleMove = (event: PointerEvent) => {
      const point = getMapPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      setNoteRelationships(prev => prev.map(item => {
        if (item.id !== relationshipPointerDrag.relationshipId) return item;
        const geometry: MindMapRelationshipGeometry = { ...item.geometry };
        if (relationshipPointerDrag.handle === 'control-1' || relationshipPointerDrag.handle === 'control-2') {
          const current = geometry.controlPoints || [];
          geometry.controlPoints = [
            relationshipPointerDrag.handle === 'control-1' ? point : current[0] || point,
            relationshipPointerDrag.handle === 'control-2' ? point : current[1] || point,
          ];
          return { ...item, geometry, updatedAt: Date.now() };
        }
        const nodeId = relationshipPointerDrag.handle === 'from' ? item.fromId : item.toId;
        const nodeElement = mapContentRef.current?.querySelector(`[data-mindmap-node="${nodeId}"]`) as HTMLElement | null;
        if (!nodeElement) return item;
        const anchor = getAnchorForElement(event.clientX, event.clientY, nodeElement);
        if (relationshipPointerDrag.handle === 'from') geometry.fromAnchor = anchor;
        else geometry.toAnchor = anchor;
        return { ...item, geometry, updatedAt: Date.now() };
      }));
    };

    const handleUp = (event: PointerEvent) => {
      if (relationshipPointerDrag.handle === 'from' || relationshipPointerDrag.handle === 'to') {
        const targetElement = getNodeElementAtPoint(event.clientX, event.clientY);
        const targetNodeId = targetElement?.getAttribute('data-mindmap-node') || null;
        if (targetElement && targetNodeId) {
          const targetAnchor = getAnchorForElement(event.clientX, event.clientY, targetElement);
          setNoteRelationships(prev => prev.map(item => {
            if (item.id !== relationshipPointerDrag.relationshipId) return item;
            const otherNodeId = relationshipPointerDrag.handle === 'from' ? item.toId : item.fromId;
            if (targetNodeId === otherNodeId) return item;
            const geometry: MindMapRelationshipGeometry = { ...item.geometry };
            if (relationshipPointerDrag.handle === 'from') {
              geometry.fromAnchor = targetAnchor;
              return { ...item, fromId: targetNodeId, geometry, updatedAt: Date.now() };
            }
            geometry.toAnchor = targetAnchor;
            return { ...item, toId: targetNodeId, geometry, updatedAt: Date.now() };
          }));
        }
      }
      setRelationshipPointerDrag(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [getAnchorForElement, getMapPointFromClient, getNodeElementAtPoint, relationshipPointerDrag]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEditingTarget(event.target) || editingNodeId) return;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      toggleRelationshipTool();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      if (relationshipToolActive || relationshipDraft || selectedRelationshipId) {
        event.preventDefault();
        setRelationshipToolActive(false);
        setRelationshipDraft(null);
        setSelectedRelationshipId(null);
        setEditingRelationshipId(null);
      }
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRelationshipId) {
      event.preventDefault();
      removeSelectedRelationship();
      return;
    }

    if ((event.key === ' ' || event.key === 'Space') && selectedRelationshipId) {
      event.preventDefault();
      startRelationshipLabelEdit(selectedRelationshipId);
      return;
    }

    const visibleNodeIds = () =>
      Array.from(mapContentRef.current?.querySelectorAll<HTMLElement>('[data-mindmap-node]') || [])
        .map(element => element.getAttribute('data-mindmap-node'))
        .filter((id): id is string => Boolean(id));

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedNodeId) {
      const ids = visibleNodeIds();
      const currentIndex = ids.indexOf(selectedNodeId);
      if (currentIndex >= 0) {
        event.preventDefault();
        const nextIndex = event.key === 'ArrowUp'
          ? Math.max(0, currentIndex - 1)
          : Math.min(ids.length - 1, currentIndex + 1);
        setSelectedNodeId(ids[nextIndex]);
      }
      return;
    }

    if (event.key === 'ArrowLeft' && selectedNodeId) {
      event.preventDefault();
      const selected = nodes[selectedNodeId];
      if (selected?.parentId && nodes[selected.parentId]) {
        setSelectedNodeId(selected.parentId);
      }
      return;
    }

    if (event.key === 'ArrowRight' && selectedNodeId) {
      event.preventDefault();
      const children = getChildren(selectedNodeId);
      if (children[0]) {
        setExpandedNodeIds(prev => new Set(prev).add(selectedNodeId));
        setSelectedNodeId(children[0].id);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      createSibling();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      createChild();
      return;
    }

    if (event.key === 'F2' && selectedNodeId) {
      event.preventDefault();
      startEdit(selectedNodeId);
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
      event.preventDefault();
      void archiveNode();
      return;
    }

    if (event.key.length === 1 && selectedNodeId && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      startEdit(selectedNodeId, event.key);
    }
  }, [
    archiveNode,
    createChild,
    createSibling,
    editingNodeId,
    getChildren,
    nodes,
    relationshipDraft,
    relationshipToolActive,
    removeSelectedRelationship,
    selectedNodeId,
    selectedRelationshipId,
    startEdit,
    startRelationshipLabelEdit,
    toggleRelationshipTool,
  ]);

  const handleDragOverNode = React.useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (!canMoveTask || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = getDropModeFromPointer(event);
    const target = nodes[nodeId];
    const direction = getNodeSide(nodeId);
    const insertionPreview = createInsertionPreview(event.currentTarget, target, mode, direction);
    setDropTarget({ nodeId, mode });
    setRootSideDropTarget(null);
    updateDragPreview(event, {
      targetNodeId: nodeId,
      targetParentId: mode === 'child' ? nodeId : target?.parentId || undefined,
      siblingBeforeId: mode === 'after' ? nodeId : undefined,
      siblingAfterId: mode === 'before' ? nodeId : undefined,
      dropPosition: mode,
      direction,
      ...insertionPreview,
    });
  }, [canMoveTask, createInsertionPreview, draggedNodeId, getNodeSide, nodes, updateDragPreview]);

  const handleDropOnNode = React.useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (!canMoveTask || !draggedNodeId || draggedNodeId === nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = dropTarget?.nodeId === nodeId ? dropTarget.mode : getDropModeFromPointer(event);
    const target = nodes[nodeId];
    const dragged = nodes[draggedNodeId];
    if (!target || !dragged) return;

    if (mode === 'child') {
      if (wouldCreateCycle(draggedNodeId, target.id)) {
        toast.warning('不能把任務拖到自己的子任務底下。');
      } else {
        const children = getChildren(target.id).filter(child => child.id !== draggedNodeId);
        const order = children.length > 0 ? Math.max(...children.map(node => node.order)) + 1 : 0;
        updateNode(draggedNodeId, { parentId: target.id, order });
        setExpandedNodeIds(prev => new Set(prev).add(target.id));
      }
    } else {
      const nextParentId = target.parentId || null;
      if (wouldCreateCycle(draggedNodeId, nextParentId)) {
        toast.warning('不能建立循環任務階層。');
      } else {
        const siblings = getSiblingNodes(nodes, parentNodesIndex, nextParentId, boardId).filter(node => node.id !== draggedNodeId);
        const order = getInsertOrder(siblings, target.id, mode);
        if (!nextParentId) updateRootSide(draggedNodeId, getNodeSide(target.id));
        updateNode(draggedNodeId, { parentId: nextParentId, order });
      }
    }

    clearDragState();
  }, [boardId, canMoveTask, clearDragState, draggedNodeId, dropTarget, getChildren, getNodeSide, nodes, parentNodesIndex, updateNode, updateRootSide, wouldCreateCycle]);

  const handleDropOnCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    const dragged = nodes[draggedNodeId];
    if (!dragged) return;
    const order = rootNodes.length > 0 ? Math.max(...rootNodes.filter(node => node.id !== draggedNodeId).map(node => node.order)) + 1 : 0;
    updateNode(draggedNodeId, { parentId: null, order });
    if (!sideOverrides[draggedNodeId]) updateRootSide(draggedNodeId, 'right');
    clearDragState();
  }, [canMoveTask, clearDragState, draggedNodeId, nodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const handleDragOverCenter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    setDropTarget(null);
    setRootSideDropTarget(null);
    updateDragPreview(event, {
      targetParentId: undefined,
      dropPosition: 'root',
      direction: sideOverrides[draggedNodeId] || 'right',
      connectorPath: createPreviewConnectorPath(event, event.currentTarget, sideOverrides[draggedNodeId] || 'right'),
    });
  }, [canMoveTask, createPreviewConnectorPath, draggedNodeId, sideOverrides, updateDragPreview]);

  const handleDragOverSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    setRootSideDropTarget(direction);
    const center = mapContentRef.current?.querySelector('[data-mindmap-center]') as HTMLElement | null;
    updateDragPreview(event, {
      targetParentId: undefined,
      dropPosition: 'root',
      direction,
      connectorPath: createPreviewConnectorPath(event, center || event.currentTarget, direction),
    });
  }, [canMoveTask, createPreviewConnectorPath, draggedNodeId, updateDragPreview]);

  const handleDropOnSide = React.useCallback((event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => {
    if (!canMoveTask || !draggedNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const dragged = nodes[draggedNodeId];
    if (!dragged) return;
    const finalDirection = dragPreview?.direction || direction;
    const sameSideRoots = rootNodes.filter(node => node.id !== draggedNodeId && (sideOverrides[node.id] || getNodeSide(node.id)) === finalDirection);
    const order = sameSideRoots.length > 0 ? Math.max(...sameSideRoots.map(node => node.order)) + 1 : rootNodes.length + 1;
    updateRootSide(draggedNodeId, finalDirection);
    updateNode(draggedNodeId, { parentId: null, order });
    clearDragState();
  }, [canMoveTask, clearDragState, dragPreview, draggedNodeId, getNodeSide, nodes, rootNodes, sideOverrides, updateNode, updateRootSide]);

  const startRelationshipFromNode = React.useCallback((nodeId: string) => {
    if (!canEditTask) return;
    setRelationshipToolActive(true);
    setRelationshipDraft({ fromId: nodeId });
    setSelectedNodeId(nodeId);
    setSelectedRelationshipId(null);
    setEditingRelationshipId(null);
  }, [canEditTask]);

  const renderNode = React.useCallback((node: TaskNode, direction: MindMapDirection, level: number): React.ReactNode => (
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
      onToggleExpanded={(nodeId) => {
        setExpandedNodeIds(prev => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
      }}
      onEditStart={startEdit}
      onEditingTitleChange={setEditingTitle}
      onEditCommit={commitEdit}
      onEditCancel={cancelEdit}
      onDragStart={(nodeId, event) => {
        setTransparentDragImage(event);
        setDraggedNodeId(nodeId);
        setSelectedNodeId(nodeId);
        const node = nodes[nodeId];
        setDragPreview({
          x: event.clientX,
          y: event.clientY,
          title: node?.title || '未命名任務',
          nodeId,
          dropPosition: 'root',
          direction: getNodeSide(nodeId),
        });
      }}
      onDragMove={(event) => {
        if (!draggedNodeId || event.clientX === 0 || event.clientY === 0) return;
        setDragPreview(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : prev);
      }}
      onDragEnd={clearDragState}
      onDragOverNode={handleDragOverNode}
      onDropOnNode={handleDropOnNode}
      onRelationshipStart={startRelationshipFromNode}
      renderChild={renderNode}
    />
  ), [
    canEditTask,
    canMoveTask,
    cancelEdit,
    commitEdit,
    dropTarget,
    editingNodeId,
    editingTitle,
    expandedNodeIds,
    getChildren,
    getNodeSide,
    clearDragState,
    handleDragOverNode,
    handleDropOnNode,
    handleNodeSelect,
    nodes,
    relationshipToolActive,
    selectedNodeId,
    showStartDate,
    startRelationshipFromNode,
    startEdit,
  ]);

  if (!activeBoard) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-500">
        請先選擇一個專案。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white" data-mindmap-view onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={compactClassNames.toolbar}>
        <div className={compactClassNames.toolbarLeft}>
          <div className="flex min-w-0 items-center gap-2">
            <Network size={16} className="shrink-0 text-blue-500" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-700">心智圖</div>
              <div className="hidden truncate text-[11px] text-slate-500 sm:block">Enter 同層、Tab 子層、F2 改名、Delete 刪除</div>
            </div>
          </div>
        </div>
        <div className={compactClassNames.toolbarRight}>
          <div className="flex items-center gap-2">
            {isReadOnly ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                只讀模式
              </span>
            ) : null}
            <Button
              type="button"
              size="none"
              variant="secondary"
              onClick={toggleRelationshipTool}
              disabled={!canEditTask}
              title={relationshipToolActive ? '取消關聯線' : '建立筆記型關聯線'}
              className={`flex h-[30px] items-center gap-1.5 px-[10px] py-[5px] text-xs ${relationshipToolActive ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_3px_rgba(125,211,252,0.22)]' : ''}`}
              data-mindmap-note-relationship-tool
              data-active={relationshipToolActive ? 'true' : 'false'}
              data-source-node-id={relationshipDraft?.fromId || ''}
            >
              <Link2 size={15} />
              <span>{relationshipDraft ? '選擇終點' : '關聯線'}</span>
            </Button>
            <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm" data-mindmap-zoom-controls>
              <Button
                type="button"
                size="none"
                variant="ghost"
                onClick={() => setZoom(zoomLevel - 0.1)}
                className="flex h-7 w-7 items-center justify-center p-0"
                title="縮小"
                data-mindmap-zoom-out
              >
                <ZoomOut size={14} />
              </Button>
              <span className="min-w-[48px] px-1 text-center text-[11px] font-semibold text-slate-600" data-mindmap-zoom-label>
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                type="button"
                size="none"
                variant="ghost"
                onClick={() => setZoom(zoomLevel + 0.1)}
                className="flex h-7 w-7 items-center justify-center p-0"
                title="放大"
                data-mindmap-zoom-in
              >
                <ZoomIn size={14} />
              </Button>
              <Button
                type="button"
                size="none"
                variant="ghost"
                onClick={() => setZoom(1)}
                className="flex h-7 w-7 items-center justify-center p-0"
                title="重設 100%"
                data-mindmap-zoom-reset
              >
                <RotateCcw size={14} />
              </Button>
              <Button
                type="button"
                size="none"
                variant="ghost"
                onClick={fitToContent}
                className="flex h-7 w-7 items-center justify-center p-0"
                title="符合畫布"
                data-mindmap-zoom-fit
              >
                <Maximize2 size={14} />
              </Button>
            </div>
            <Button
              type="button"
              size="none"
              variant="secondary"
              onClick={handleCreateRoot}
              disabled={!canCreateTask}
              title={canCreateTask ? '新增主要分支' : '你沒有新增任務的權限'}
              className="flex h-[30px] items-center gap-1.5 px-[10px] py-[5px] text-xs"
              data-mindmap-create-root
            >
              <Plus size={15} />
              <span>新增分支</span>
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={mapSurfaceRef}
        className={`min-h-0 flex-1 overflow-auto ${compactClassNames.canvas}`}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setZoom(zoomLevel + (event.deltaY < 0 ? 0.08 : -0.08));
        }}
        onScroll={recomputeConnectors}
        data-mindmap-zoom-level={zoomLevel.toFixed(2)}
      >
        {rootNodes.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center">
            <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center" data-mindmap-empty>
              <Network className="mx-auto mb-3 text-slate-400" size={32} />
              <div className="text-sm font-bold text-slate-700">目前還沒有任務分支</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">建立第一個分支後，可用 Enter 新增同層、Tab 新增子層。</div>
              <Button
                type="button"
                size="sm"
                className="mt-4"
                onClick={handleCreateRoot}
                disabled={!canCreateTask}
              >
                新增第一個分支
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={mapContentRef}
            role="tree"
            aria-label="WBS 心智圖"
            className="relative flex min-h-full min-w-max items-center justify-center gap-12 px-10 py-12"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
            onClick={handleSurfaceClick}
            data-mindmap-surface
            data-mindmap-note-relationship-mode={relationshipToolActive ? 'true' : 'false'}
            data-mindmap-note-relationship-source-id={relationshipDraft?.fromId || ''}
          >
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible text-slate-300"
              data-mindmap-connector-overlay
            >
              {connectorPaths.map(path => (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-mindmap-connector-path={path.id}
                  data-from-node-id={path.fromNodeId}
                  data-to-node-id={path.toNodeId}
                  data-depth={path.depth}
                  data-direction={path.direction}
                  data-from-x={path.fromX.toFixed(2)}
                  data-from-y={path.fromY.toFixed(2)}
                  data-to-x={path.toX.toFixed(2)}
                  data-to-y={path.toY.toFixed(2)}
                />
              ))}
            </svg>

            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[15] h-full w-full overflow-visible"
              data-mindmap-note-relationship-overlay
            >
              <defs>
                <marker
                  id="mindmap-note-relationship-arrow"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 1 1 L 8 4.5 L 1 8 z" fill="#0284c7" />
                </marker>
              </defs>
              {relationshipPaths.map(path => {
                const selected = selectedRelationshipId === path.id;
                const textAnchor = path.labelX > Math.max(path.fromX, path.toX) ? 'start' : 'end';
                return (
                  <g
                    key={path.id}
                    data-mindmap-note-relationship={path.id}
                    data-from-node-id={path.fromNodeId}
                    data-to-node-id={path.toNodeId}
                    data-label={path.label}
                    data-selected={selected ? 'true' : 'false'}
                  >
                    <path
                      d={path.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="18"
                      style={{ pointerEvents: 'none' }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRelationshipId(path.id);
                        setSelectedNodeId(null);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        startRelationshipLabelEdit(path.id);
                      }}
                      data-mindmap-note-relationship-hitbox={path.id}
                      data-label={path.label}
                      data-from-node-id={path.fromNodeId}
                      data-to-node-id={path.toNodeId}
                    />
                    <path
                      d={path.d}
                      fill="none"
                      stroke={selected ? '#0ea5e9' : path.style.strokeColor}
                      strokeWidth={selected ? Math.max(path.style.strokeWidth + 1, 3.5) : path.style.strokeWidth}
                      strokeDasharray={path.style.strokeDasharray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerStart={path.style.arrowStart ? 'url(#mindmap-note-relationship-arrow)' : undefined}
                      markerEnd={path.style.arrowEnd ? 'url(#mindmap-note-relationship-arrow)' : undefined}
                      style={{ pointerEvents: 'none' }}
                      data-mindmap-note-relationship-path={path.id}
                      data-from-node-id={path.fromNodeId}
                      data-to-node-id={path.toNodeId}
                      data-label={path.label}
                      data-from-x={path.fromX.toFixed(2)}
                      data-from-y={path.fromY.toFixed(2)}
                      data-to-x={path.toX.toFixed(2)}
                      data-to-y={path.toY.toFixed(2)}
                      data-control-1-x={path.c1X.toFixed(2)}
                      data-control-1-y={path.c1Y.toFixed(2)}
                      data-control-2-x={path.c2X.toFixed(2)}
                      data-control-2-y={path.c2Y.toFixed(2)}
                      data-label-x={path.labelX.toFixed(2)}
                      data-label-y={path.labelY.toFixed(2)}
                      data-stroke-color={path.style.strokeColor}
                      data-stroke-width={path.style.strokeWidth}
                      data-stroke-dasharray={path.style.strokeDasharray}
                    />
                    {selected ? (
                      <>
                        <line
                          x1={path.c1X}
                          y1={path.c1Y}
                          x2={path.c2X}
                          y2={path.c2Y}
                          stroke="#bae6fd"
                          strokeDasharray="4 4"
                          strokeWidth="1.5"
                          style={{ pointerEvents: 'none' }}
                          data-mindmap-note-relationship-control-guide={path.id}
                        />
                        <circle
                          cx={path.fromX}
                          cy={path.fromY}
                          r={5}
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth="2"
                          className="cursor-grab active:cursor-grabbing"
                          style={{ pointerEvents: 'all' }}
                          onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'from')}
                          data-mindmap-note-relationship-svg-endpoint="from"
                          data-relationship-id={path.id}
                        />
                        <circle
                          cx={path.toX}
                          cy={path.toY}
                          r={5}
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth="2"
                          className="cursor-grab active:cursor-grabbing"
                          style={{ pointerEvents: 'all' }}
                          onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
                          data-mindmap-note-relationship-svg-endpoint="to"
                          data-relationship-id={path.id}
                        />
                        <rect
                          x={path.c1X - 5}
                          y={path.c1Y - 5}
                          width="10"
                          height="10"
                          rx="2"
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth="2"
                          className="cursor-grab active:cursor-grabbing"
                          style={{ pointerEvents: 'all' }}
                          onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-1')}
                          data-mindmap-note-relationship-svg-control-point="1"
                          data-relationship-id={path.id}
                        />
                        <rect
                          x={path.c2X - 5}
                          y={path.c2Y - 5}
                          width="10"
                          height="10"
                          rx="2"
                          fill="#ffffff"
                          stroke="#0ea5e9"
                          strokeWidth="2"
                          className="cursor-grab active:cursor-grabbing"
                          style={{ pointerEvents: 'all' }}
                          onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-2')}
                          data-mindmap-note-relationship-svg-control-point="2"
                          data-relationship-id={path.id}
                        />
                      </>
                    ) : null}
                    {editingRelationshipId !== path.id ? (
                      <text
                        x={path.labelX}
                        y={path.labelY}
                        textAnchor={textAnchor}
                        dominantBaseline="middle"
                        className="select-none font-semibold"
                        fill={path.style.labelColor}
                        stroke="#ffffff"
                        strokeWidth="4"
                        paintOrder="stroke"
                        style={{ pointerEvents: 'none', fontSize: path.style.labelFontSize }}
                        data-mindmap-note-relationship-label={path.id}
                      >
                        {path.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <div
              className={`relative z-10 flex min-w-[260px] flex-col items-end gap-4 rounded-lg border border-dashed p-2 transition-colors ${rootSideDropTarget === 'left' ? 'border-blue-300 bg-blue-50/70' : 'border-transparent'}`}
              data-mindmap-side-drop-zone="left"
              data-mindmap-side-drop-active={rootSideDropTarget === 'left' ? 'true' : 'false'}
              onDragOver={(event) => handleDragOverSide(event, 'left')}
              onDrop={(event) => handleDropOnSide(event, 'left')}
            >
              {rootsBySide.left.map(node => renderNode(node, 'left', 1))}
            </div>

            <div
              className="relative z-20 flex min-h-[64px] max-w-[300px] items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-center text-base font-bold text-blue-800 shadow-[0_14px_28px_rgba(37,99,235,0.12)] ring-4 ring-blue-100/70"
              data-mindmap-center
              onDragOver={(event) => {
                handleDragOverCenter(event);
              }}
              onDrop={handleDropOnCenter}
              title="拖曳任務到中心主題可移回主要分支"
            >
              <span className="line-clamp-2">{activeBoard.title || '未命名專案'}</span>
            </div>

            <div
              className={`relative z-10 flex min-w-[260px] flex-col items-start gap-4 rounded-lg border border-dashed p-2 transition-colors ${rootSideDropTarget === 'right' ? 'border-blue-300 bg-blue-50/70' : 'border-transparent'}`}
              data-mindmap-side-drop-zone="right"
              data-mindmap-side-drop-active={rootSideDropTarget === 'right' ? 'true' : 'false'}
              onDragOver={(event) => handleDragOverSide(event, 'right')}
              onDrop={(event) => handleDropOnSide(event, 'right')}
            >
              {rootsBySide.right.map(node => renderNode(node, 'right', 1))}
            </div>
          </div>
        )}
      </div>

      {relationshipPaths.map(path => {
        const dx = path.screenToX - path.screenFromX;
        const dy = path.screenToY - path.screenFromY;
        const length = Math.max(80, Math.hypot(dx, dy) - 64);
        const angle = Math.atan2(dy, dx);
        return (
          <button
            key={`line-hitbox-${path.id}`}
            type="button"
            aria-label={`關聯線：${path.label}`}
            className={`fixed z-[42] h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${(path.screenFromX + path.screenToX) / 2}px`,
              top: `${(path.screenFromY + path.screenToY) / 2}px`,
              width: `${length}px`,
              transform: `translate(-50%, -50%) rotate(${angle}rad)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedRelationshipId(path.id);
              setSelectedNodeId(null);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRelationshipLabelEdit(path.id);
            }}
            data-mindmap-note-relationship-line-click-target={path.id}
            data-label={path.label}
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
          />
        );
      })}

      {relationshipPaths.map(path => (
        <button
          key={`hitbox-${path.id}`}
          type="button"
          aria-label={`關聯線：${path.label}`}
          className={`fixed z-[43] h-8 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
          style={{
            left: `${path.screenLabelX}px`,
            top: `${path.screenLabelY}px`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedRelationshipId(path.id);
            setSelectedNodeId(null);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            setSelectedRelationshipId(path.id);
            setSelectedNodeId(null);
          }}
          onFocus={() => {
            setSelectedRelationshipId(path.id);
            setSelectedNodeId(null);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRelationshipLabelEdit(path.id);
          }}
          data-mindmap-note-relationship-click-target={path.id}
          data-label={path.label}
          data-from-node-id={path.fromNodeId}
          data-to-node-id={path.toNodeId}
        />
      ))}

      {relationshipPaths.map(path => (
        selectedRelationshipId === path.id ? (
          <React.Fragment key={`relationship-html-handles-${path.id}`}>
            <button
              type="button"
              className="fixed z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.screenFromX}px`, top: `${path.screenFromY}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'from')}
              data-mindmap-note-relationship-endpoint="from"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="fixed z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.screenToX}px`, top: `${path.screenToY}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
              data-mindmap-note-relationship-endpoint="to"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="fixed z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[2px] border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.screenC1X}px`, top: `${path.screenC1Y}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-1')}
              data-mindmap-note-relationship-control-point="1"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="fixed z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[2px] border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.screenC2X}px`, top: `${path.screenC2Y}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-2')}
              data-mindmap-note-relationship-control-point="2"
              data-relationship-id={path.id}
            />
          </React.Fragment>
        ) : null
      ))}

      {relationshipPaths.map(path => (
        editingRelationshipId === path.id ? (
          <input
            key={`relationship-editor-${path.id}`}
            ref={relationshipLabelInputRef}
            value={editingRelationshipLabel}
            onChange={(event) => setEditingRelationshipLabel(event.target.value)}
            onBlur={commitRelationshipLabelEdit}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') commitRelationshipLabelEdit();
              if (event.key === 'Escape') cancelRelationshipLabelEdit();
            }}
            className="fixed z-[64] h-8 -translate-x-1/2 -translate-y-1/2 rounded-md border border-sky-300 bg-white px-2 text-center text-xs font-semibold text-slate-700 shadow-[0_10px_22px_rgba(14,165,233,0.18)] outline-none ring-2 ring-sky-100"
            style={getRelationshipEditorStyle(path.screenLabelX, path.screenLabelY)}
            data-mindmap-note-relationship-label-input={path.id}
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
          />
        ) : null
      ))}

      {relationshipPaths.map(path => (
        selectedRelationshipId === path.id && editingRelationshipId !== path.id ? (
          <div
            key={`relationship-style-${path.id}`}
            className="fixed z-[60] flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] font-semibold text-slate-600 shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur"
            style={getRelationshipStylePanelStyle(path.screenLabelX, path.screenLabelY)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            data-mindmap-note-relationship-style-panel={path.id}
          >
            <div className="flex items-center gap-1" data-mindmap-note-relationship-style-colors>
              {relationshipColorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${path.style.strokeColor === color ? 'border-slate-900 ring-2 ring-sky-100' : 'border-slate-200'}`}
                  style={{ backgroundColor: color }}
                  title={`線色 ${color}`}
                  onClick={() => updateRelationshipStyle(path.id, { strokeColor: color })}
                  data-mindmap-note-relationship-style-color={color}
                />
              ))}
            </div>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-1" data-mindmap-note-relationship-style-widths>
              {relationshipWidthOptions.map(width => (
                <button
                  key={width}
                  type="button"
                  className={`rounded border px-1.5 py-0.5 ${path.style.strokeWidth === width ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  onClick={() => updateRelationshipStyle(path.id, { strokeWidth: width })}
                  data-mindmap-note-relationship-style-width={width}
                >
                  {width}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1" data-mindmap-note-relationship-style-dashes>
              {relationshipDashOptions.map(option => (
                <button
                  key={option.label}
                  type="button"
                  className={`rounded border px-1.5 py-0.5 ${path.style.strokeDasharray === option.value ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  onClick={() => updateRelationshipStyle(path.id, { strokeDasharray: option.value })}
                  data-mindmap-note-relationship-style-dash={option.value || 'solid'}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1" data-mindmap-note-relationship-style-arrows>
              <button
                type="button"
                className={`rounded border px-1.5 py-0.5 ${!path.style.arrowStart && !path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                onClick={() => updateRelationshipStyle(path.id, { arrowStart: false, arrowEnd: false })}
                data-mindmap-note-relationship-style-arrow="none"
              >
                無箭頭
              </button>
              <button
                type="button"
                className={`rounded border px-1.5 py-0.5 ${!path.style.arrowStart && path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                onClick={() => updateRelationshipStyle(path.id, { arrowStart: false, arrowEnd: true })}
                data-mindmap-note-relationship-style-arrow="end"
              >
                單箭頭
              </button>
              <button
                type="button"
                className={`rounded border px-1.5 py-0.5 ${path.style.arrowStart && path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                onClick={() => updateRelationshipStyle(path.id, { arrowStart: true, arrowEnd: true })}
                data-mindmap-note-relationship-style-arrow="both"
              >
                雙箭頭
              </button>
            </div>
            <div className="flex items-center gap-1" data-mindmap-note-relationship-style-label-fonts>
              {[11, 12, 14].map(size => (
                <button
                  key={size}
                  type="button"
                  className={`rounded border px-1.5 py-0.5 ${path.style.labelFontSize === size ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  onClick={() => updateRelationshipStyle(path.id, { labelFontSize: size })}
                  data-mindmap-note-relationship-style-label-size={size}
                >
                  {size}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:bg-slate-50"
              onClick={() => resetRelationshipStyle(path.id)}
              data-mindmap-note-relationship-style-reset
            >
              Reset
            </button>
          </div>
        ) : null
      ))}

      {dragPreview ? (
        <>
          {dragPreview.connectorPath ? (
            <svg className="pointer-events-none fixed inset-0 z-[70] h-screen w-screen overflow-visible" aria-hidden="true">
              <path
                d={dragPreview.connectorPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeDasharray="6 6"
                strokeLinecap="round"
                data-mindmap-drop-preview
                data-target-node-id={dragPreview.targetNodeId || ''}
                data-target-parent-id={dragPreview.targetParentId || ''}
                data-sibling-before-id={dragPreview.siblingBeforeId || ''}
                data-sibling-after-id={dragPreview.siblingAfterId || ''}
                data-drop-position={dragPreview.dropPosition}
                data-direction={dragPreview.direction || ''}
              />
            </svg>
          ) : null}
          {dragPreview.insertionPreview ? (
            <div
              className="pointer-events-none fixed z-[75] rounded-full bg-sky-300/80 shadow-[0_0_0_4px_rgba(125,211,252,0.28)] ring-1 ring-sky-400/60"
              style={{
                left: `${dragPreview.insertionPreview.left}px`,
                top: `${dragPreview.insertionPreview.top}px`,
                width: `${dragPreview.insertionPreview.width}px`,
                height: `${dragPreview.insertionPreview.height}px`,
              }}
              data-mindmap-insertion-preview
              data-node-id={dragPreview.nodeId}
              data-target-node-id={dragPreview.targetNodeId || ''}
              data-target-parent-id={dragPreview.targetParentId || ''}
              data-sibling-before-id={dragPreview.siblingBeforeId || ''}
              data-sibling-after-id={dragPreview.siblingAfterId || ''}
              data-drop-position={dragPreview.dropPosition}
              data-direction={dragPreview.direction || ''}
            />
          ) : null}
          <div
            className="pointer-events-none fixed z-[80] max-w-[260px] rounded-md border border-blue-300 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_16px_32px_rgba(15,23,42,0.18)] ring-4 ring-blue-100 transition-transform duration-75"
            style={{
              left: `${Math.min(dragPreview.x + 14, Math.max(12, window.innerWidth - 288))}px`,
              top: `${Math.min(dragPreview.y + 14, Math.max(12, window.innerHeight - 72))}px`,
            }}
            data-mindmap-drag-preview
            data-node-id={dragPreview.nodeId}
            data-target-node-id={dragPreview.targetNodeId || ''}
            data-target-parent-id={dragPreview.targetParentId || ''}
            data-sibling-before-id={dragPreview.siblingBeforeId || ''}
            data-sibling-after-id={dragPreview.siblingAfterId || ''}
            data-drop-position={dragPreview.dropPosition}
            data-direction={dragPreview.direction || ''}
          >
            <span className="block truncate">{dragPreview.title}</span>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default MindMapView;
