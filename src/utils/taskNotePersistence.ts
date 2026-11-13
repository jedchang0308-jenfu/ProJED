import type {
  TaskNode,
  TaskNotePersistenceSnapshot,
} from '../types';

const canonicalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeJsonValue(item)]),
  );
};

export const taskNoteSnapshotFromNode = (
  node: Pick<TaskNode, 'detailNotes' | 'description' | 'updatedAt'>,
): TaskNotePersistenceSnapshot => ({
  detailNotes: node.detailNotes ?? [],
  description: node.description ?? null,
  ...(node.updatedAt !== undefined ? { updatedAt: node.updatedAt } : {}),
});

/**
 * Mirrors JSONB equality for note payloads: object key order is irrelevant,
 * while array order and every persisted rich-text value remain significant.
 */
export const areTaskNoteSnapshotsEqual = (
  left: TaskNotePersistenceSnapshot,
  right: TaskNotePersistenceSnapshot,
): boolean => (
  left.description === right.description
  && JSON.stringify(canonicalizeJsonValue(left.detailNotes))
    === JSON.stringify(canonicalizeJsonValue(right.detailNotes))
);
