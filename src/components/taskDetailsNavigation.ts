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
  const [navigation, setNavigation] = React.useState<{ entries: TaskDetailsNavigationEntry[]; index: number }>({
    entries: [],
    index: -1,
  });
  const { entries, index } = navigation;
  const current = entries[index] || null;

  const openRoot = React.useCallback((entry: TaskDetailsNavigationEntry) => {
    setNavigation({ entries: openTaskDetailsNavigation(entry), index: 0 });
  }, []);

  const push = React.useCallback((entry: TaskDetailsNavigationEntry) => {
    setNavigation(currentNavigation => {
      const currentEntry = currentNavigation.entries[currentNavigation.index];
      if (currentEntry?.taskId === entry.taskId
        && currentEntry.trackingReferenceId === entry.trackingReferenceId) {
        return currentNavigation;
      }
      const nextEntries = currentNavigation.entries.slice(0, currentNavigation.index + 1);
      nextEntries.push(entry);
      return { entries: nextEntries, index: nextEntries.length - 1 };
    });
  }, []);

  const back = React.useCallback(() => {
    if (index <= 0) return null;
    const previous = entries[index - 1] || null;
    setNavigation(currentNavigation => currentNavigation.index > 0
      ? { ...currentNavigation, index: currentNavigation.index - 1 }
      : currentNavigation);
    return previous;
  }, [entries, index]);

  const forward = React.useCallback(() => {
    if (index < 0 || index >= entries.length - 1) return null;
    const next = entries[index + 1] || null;
    setNavigation(currentNavigation => currentNavigation.index < currentNavigation.entries.length - 1
      ? { ...currentNavigation, index: currentNavigation.index + 1 }
      : currentNavigation);
    return next;
  }, [entries, index]);

  const clear = React.useCallback(() => setNavigation({ entries: clearTaskDetailsNavigation(), index: -1 }), []);

  return {
    entries,
    current,
    canGoBack: index > 0,
    canGoForward: index >= 0 && index < entries.length - 1,
    openRoot,
    push,
    back,
    forward,
    clear,
  };
};
