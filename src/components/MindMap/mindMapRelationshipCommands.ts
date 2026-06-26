import type { TaskNode } from '../../types';
import type {
  MindMapNoteRelationship,
  MindMapRelationshipAnchor,
  MindMapRelationshipPoint,
  MindMapRelationshipStyle,
} from './mindMapGeometry';

type MindMapRelationshipEndpointHandle = 'from' | 'to';
type MindMapRelationshipControlHandle = 'control-1' | 'control-2';
export type MindMapRelationshipPointerHandle =
  | MindMapRelationshipEndpointHandle
  | MindMapRelationshipControlHandle;

export const DEFAULT_MINDMAP_RELATIONSHIP_LABEL = '關聯';

const createRelationshipId = () =>
  `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const getMindMapRelationshipLabelDraft = (label: string | null | undefined) =>
  label || DEFAULT_MINDMAP_RELATIONSHIP_LABEL;

export const getCommittedMindMapRelationshipLabel = (label: string) =>
  label.trim() || DEFAULT_MINDMAP_RELATIONSHIP_LABEL;

export const findExistingNoteRelationship = (
  relationships: MindMapNoteRelationship[],
  fromId: string,
  toId: string,
) =>
  relationships.find(item =>
    (item.fromId === fromId && item.toId === toId) ||
    (item.fromId === toId && item.toId === fromId),
  );

export const isValidRelationshipEndpoint = (
  nodes: Record<string, TaskNode>,
  nodeId: string,
) => {
  const node = nodes[nodeId];
  return Boolean(node && !node.isArchived);
};

export const removeRelationshipsForInvalidEndpoints = (
  relationships: MindMapNoteRelationship[],
  fromId: string,
  toId: string,
) => relationships.filter(item => item.fromId !== fromId && item.toId !== toId);

export const removeRelationshipById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
) => relationships.filter(item => item.id !== relationshipId);

export const appendMindMapNoteRelationship = (
  relationships: MindMapNoteRelationship[],
  relationship: MindMapNoteRelationship,
) => [...relationships, relationship];

export const createMindMapNoteRelationship = ({
  boardId,
  fromId,
  toId,
  label,
  now = Date.now(),
  id = createRelationshipId(),
}: {
  boardId: string;
  fromId: string;
  toId: string;
  label: string;
  now?: number;
  id?: string;
}): MindMapNoteRelationship => ({
  id,
  boardId,
  fromId,
  toId,
  label,
  createdAt: now,
  updatedAt: now,
});

export const updateRelationshipLabelById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  label: string,
  now = Date.now(),
) =>
  relationships.map(item =>
    item.id === relationshipId
      ? { ...item, label, updatedAt: now }
      : item,
  );

export const updateRelationshipStyleById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  patch: MindMapRelationshipStyle,
  now = Date.now(),
) =>
  relationships.map(item =>
    item.id === relationshipId
      ? { ...item, style: { ...item.style, ...patch }, updatedAt: now }
      : item,
  );

export const resetRelationshipStyleById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  now = Date.now(),
) =>
  relationships.map(item =>
    item.id === relationshipId
      ? { ...item, style: undefined, updatedAt: now }
      : item,
  );

export const updateRelationshipControlPointById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  handle: MindMapRelationshipControlHandle,
  point: MindMapRelationshipPoint,
  now = Date.now(),
) =>
  relationships.map(item => {
    if (item.id !== relationshipId) return item;
    const geometry = { ...item.geometry };
    const current = geometry.controlPoints || [];
    geometry.controlPoints = [
      handle === 'control-1' ? point : current[0] || point,
      handle === 'control-2' ? point : current[1] || point,
    ];
    return { ...item, geometry, updatedAt: now };
  });

export const getRelationshipEndpointNodeId = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  handle: MindMapRelationshipEndpointHandle,
) => {
  const relationship = relationships.find(item => item.id === relationshipId);
  if (!relationship) return null;
  return handle === 'from' ? relationship.fromId : relationship.toId;
};

export const updateRelationshipEndpointAnchorById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  handle: MindMapRelationshipEndpointHandle,
  anchor: MindMapRelationshipAnchor,
  now = Date.now(),
) =>
  relationships.map(item => {
    if (item.id !== relationshipId) return item;
    const geometry = { ...item.geometry };
    if (handle === 'from') geometry.fromAnchor = anchor;
    else geometry.toAnchor = anchor;
    return { ...item, geometry, updatedAt: now };
  });

export const retargetRelationshipEndpointById = (
  relationships: MindMapNoteRelationship[],
  relationshipId: string,
  handle: MindMapRelationshipEndpointHandle,
  targetNodeId: string,
  targetAnchor: MindMapRelationshipAnchor,
  now = Date.now(),
) =>
  relationships.map(item => {
    if (item.id !== relationshipId) return item;
    const otherNodeId = handle === 'from' ? item.toId : item.fromId;
    if (targetNodeId === otherNodeId) return item;
    const geometry = { ...item.geometry };
    if (handle === 'from') {
      geometry.fromAnchor = targetAnchor;
      return { ...item, fromId: targetNodeId, geometry, updatedAt: now };
    }
    geometry.toAnchor = targetAnchor;
    return { ...item, toId: targetNodeId, geometry, updatedAt: now };
  });
