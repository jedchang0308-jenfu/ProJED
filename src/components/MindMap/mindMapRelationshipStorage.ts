import type { MindMapNoteRelationship } from './mindMapGeometry';

const getRelationshipStorageKey = (boardId: string) => `projed.mindmap.noteRelationships.${boardId}`;

const isMindMapNoteRelationship = (
  item: Partial<MindMapNoteRelationship> | null | undefined,
  boardId: string,
): item is MindMapNoteRelationship =>
  item?.boardId === boardId &&
  typeof item.id === 'string' &&
  typeof item.fromId === 'string' &&
  typeof item.toId === 'string' &&
  typeof item.label === 'string' &&
  typeof item.createdAt === 'number' &&
  typeof item.updatedAt === 'number';

export const loadNoteRelationships = (boardId: string): MindMapNoteRelationship[] => {
  if (!boardId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getRelationshipStorageKey(boardId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<MindMapNoteRelationship>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => isMindMapNoteRelationship(item, boardId));
  } catch {
    return [];
  }
};

export const saveNoteRelationships = (boardId: string, relationships: MindMapNoteRelationship[]) => {
  if (!boardId || typeof window === 'undefined') return;
  window.localStorage.setItem(getRelationshipStorageKey(boardId), JSON.stringify(relationships));
};

export const sanitizeNoteRelationshipsForBoard = (
  boardId: string,
  relationships: MindMapNoteRelationship[],
  validNodeIds: Set<string>,
) =>
  relationships.filter(relationship =>
    relationship.boardId === boardId &&
    validNodeIds.has(relationship.fromId) &&
    validNodeIds.has(relationship.toId),
  );
