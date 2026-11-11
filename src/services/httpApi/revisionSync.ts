import type { ResourceRevision } from './collaborationAdapter';

export type RevisionSnapshot = Map<string, string>;

export interface RevisionRefreshDecision {
  changed: boolean;
  refreshWorkspaces: boolean;
  refreshActiveScope: boolean;
}

const revisionKey = (workspaceId: string, boardId?: string) =>
  `${workspaceId}\u0000${boardId ?? ''}`;

export const createRevisionSnapshot = (revisions: readonly ResourceRevision[]): RevisionSnapshot =>
  new Map(revisions.map(item => [revisionKey(item.workspaceId, item.boardId), item.revision]));

export function decideRevisionRefresh(
  previous: RevisionSnapshot | null,
  next: RevisionSnapshot,
  activeWorkspaceId: string | null,
  activeBoardId: string | null,
): RevisionRefreshDecision {
  if (previous === null) {
    return { changed: true, refreshWorkspaces: true, refreshActiveScope: true };
  }

  const changedKeys = new Set<string>();
  for (const [key, revision] of next) {
    if (previous.get(key) !== revision) changedKeys.add(key);
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) changedKeys.add(key);
  }
  if (changedKeys.size === 0) {
    return { changed: false, refreshWorkspaces: false, refreshActiveScope: false };
  }

  const workspaceKey = activeWorkspaceId ? revisionKey(activeWorkspaceId) : null;
  const boardKey = activeWorkspaceId && activeBoardId
    ? revisionKey(activeWorkspaceId, activeBoardId)
    : null;
  return {
    changed: true,
    // Workspace/Board titles and visible memberships share the workspace index.
    refreshWorkspaces: true,
    refreshActiveScope: (workspaceKey !== null && changedKeys.has(workspaceKey))
      || (boardKey !== null && changedKeys.has(boardKey))
      || (boardKey !== null && !next.has(boardKey)),
  };
}
