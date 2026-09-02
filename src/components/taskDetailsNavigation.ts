import React from 'react';

export type TaskDetailsNavigationEntry = {
  taskId: string;
  trackingReferenceId?: string;
  returnFocusPlacementId?: string;
};

export const TASK_DETAILS_NAVIGATE_EVENT = 'task-details-navigate';

export type TaskDetailsPersistenceDecision = 'idle' | 'wait' | 'stay' | 'run';

export const openTaskDetailsNavigation = (entry: TaskDetailsNavigationEntry): TaskDetailsNavigationEntry[] => [entry];

export const pushTaskDetailsNavigation = (
  entries: readonly TaskDetailsNavigationEntry[],
  entry: TaskDetailsNavigationEntry,
): TaskDetailsNavigationEntry[] => {
  const currentEntry = entries[entries.length - 1];
  if (currentEntry?.taskId === entry.taskId
    && currentEntry.trackingReferenceId === entry.trackingReferenceId) {
    return [...entries];
  }
  return [...entries, entry];
};

export const popTaskDetailsNavigation = (entries: readonly TaskDetailsNavigationEntry[]) => ({
  entries: entries.length > 1 ? entries.slice(0, -1) : [...entries],
  previous: entries.length > 1 ? entries[entries.length - 2] || null : null,
});

export const clearTaskDetailsNavigation = (): TaskDetailsNavigationEntry[] => [];

export const resolveTaskDetailsPersistenceDecision = ({
  pendingCount,
  hasFailedUpdates,
  hasPendingTransition,
}: {
  pendingCount: number;
  hasFailedUpdates: boolean;
  hasPendingTransition: boolean;
}): TaskDetailsPersistenceDecision => {
  if (pendingCount > 0) return 'wait';
  if (hasFailedUpdates) return 'stay';
  if (hasPendingTransition) return 'run';
  return 'idle';
};

export const requestTaskDetailsNavigation = (detail: Omit<TaskDetailsNavigationEntry, 'returnFocusPlacementId'> & { returnFocusPlacementId?: string }) => {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(TASK_DETAILS_NAVIGATE_EVENT, { detail }));
};

/**
 * Keeps task-detail navigation in one modal instance.  The stack is local to
 * the host that owns the modal, so Back never changes the active view or
 * creates a second overlay.
 */
export const useTaskDetailsNavigation = () => {
  const [entries, setEntries] = React.useState<TaskDetailsNavigationEntry[]>([]);
  const current = entries[entries.length - 1] || null;

  const openRoot = React.useCallback((entry: TaskDetailsNavigationEntry) => {
    setEntries(openTaskDetailsNavigation(entry));
  }, []);

  const push = React.useCallback((entry: TaskDetailsNavigationEntry) => {
    setEntries((currentEntries) => pushTaskDetailsNavigation(currentEntries, entry));
  }, []);

  const pop = React.useCallback(() => {
    const result = popTaskDetailsNavigation(entries);
    setEntries(result.entries);
    return result.previous;
  }, [entries]);

  const clear = React.useCallback(() => setEntries(clearTaskDetailsNavigation()), []);

  return {
    entries,
    current,
    canGoBack: entries.length > 1,
    openRoot,
    push,
    pop,
    clear,
  };
};
