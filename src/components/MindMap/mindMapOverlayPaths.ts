import type { MindMapDirection } from './MindMapNode';
import {
  MINDMAP_CENTER_SELECTOR,
  MINDMAP_NODE_ATTRIBUTE,
  MINDMAP_NODE_LEVEL_ATTRIBUTE,
  MINDMAP_NODE_SELECTOR,
  MINDMAP_PARENT_ATTRIBUTE,
  getMindMapNodeId,
} from './mindMapDomSelectors';
import {
  makeConnectorPath,
  makeRelationshipPath,
  type MindMapConnectorPath,
  type MindMapLayoutRect,
  type MindMapNoteRelationship,
  type MindMapRelationshipPath,
} from './mindMapGeometry';

interface MindMapOverlayRootNode {
  id: string;
}

interface MindMapOverlayPathBuildInput {
  surface: HTMLElement;
  rootNodes: MindMapOverlayRootNode[];
  noteRelationships: MindMapNoteRelationship[];
  getNodeSide: (nodeId: string) => MindMapDirection;
  getLocalRect: (element: HTMLElement, surface: HTMLElement) => MindMapLayoutRect;
}

interface MindMapOverlayPathBuildResult {
  connectorPaths: MindMapConnectorPath[];
  relationshipPaths: MindMapRelationshipPath[];
  hasCenter: boolean;
}

const getVisibleNodeElements = (surface: HTMLElement) =>
  Array.from(surface.querySelectorAll<HTMLElement>(MINDMAP_NODE_SELECTOR));

const getVisibleNodeIds = (visibleNodes: HTMLElement[]) =>
  new Set(visibleNodes.map(getMindMapNodeId).filter(Boolean));

const getVisibleNodeById = (visibleNodes: HTMLElement[]) =>
  new Map(
    visibleNodes
      .map(element => [getMindMapNodeId(element), element] as const)
      .filter((entry): entry is [string, HTMLElement] => Boolean(entry[0])),
  );

export const buildMindMapOverlayPaths = ({
  surface,
  rootNodes,
  noteRelationships,
  getNodeSide,
  getLocalRect,
}: MindMapOverlayPathBuildInput): MindMapOverlayPathBuildResult => {
  const center = surface.querySelector(MINDMAP_CENTER_SELECTOR) as HTMLElement | null;
  if (!center) {
    return {
      connectorPaths: [],
      relationshipPaths: [],
      hasCenter: false,
    };
  }

  const centerRect = getLocalRect(center, surface);
  const connectorPaths: MindMapConnectorPath[] = [];
  const relationshipPaths: MindMapRelationshipPath[] = [];
  const visibleNodes = getVisibleNodeElements(surface);
  const visibleNodeIds = getVisibleNodeIds(visibleNodes);
  const visibleNodeById = getVisibleNodeById(visibleNodes);

  rootNodes.forEach(root => {
    const rootElement = visibleNodeById.get(root.id);
    if (!rootElement) return;
    const direction = getNodeSide(root.id);
    const segment = makeConnectorPath(centerRect, getLocalRect(rootElement, surface), direction);
    connectorPaths.push({
      id: `center-${root.id}`,
      fromNodeId: 'center',
      toNodeId: root.id,
      depth: 1,
      direction,
      ...segment,
    });
  });

  visibleNodes.forEach(element => {
    const childId = element.getAttribute(MINDMAP_NODE_ATTRIBUTE);
    if (!childId) return;
    const parentId = element.getAttribute(MINDMAP_PARENT_ATTRIBUTE);
    if (!parentId || !visibleNodeIds.has(parentId)) return;
    const parentElement = visibleNodeById.get(parentId);
    if (!parentElement) return;
    const direction = getNodeSide(childId);
    const level = Number(element.getAttribute(MINDMAP_NODE_LEVEL_ATTRIBUTE) || '1');
    const segment = makeConnectorPath(getLocalRect(parentElement, surface), getLocalRect(element, surface), direction, 'bracket');
    connectorPaths.push({
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
    relationshipPaths.push({
      id: relationship.id,
      fromNodeId: relationship.fromId,
      toNodeId: relationship.toId,
      label: relationship.label,
      ...makeRelationshipPath(relationship, getLocalRect(fromElement, surface), getLocalRect(toElement, surface)),
    });
  });

  return {
    connectorPaths,
    relationshipPaths,
    hasCenter: true,
  };
};
