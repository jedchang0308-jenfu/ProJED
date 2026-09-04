import { useCallback, useSyncExternalStore } from 'react';

export type MindMapSelectionSnapshot = Readonly<{
  selectedPlacementIds: readonly string[];
  primaryPlacementId: string | null;
}>;

export type MindMapSelectionChange = Readonly<{
  changed: boolean;
  previousNodeId: string | null;
  selectedNodeId: string | null;
  previousPlacementIds: readonly string[];
  selectedPlacementIds: readonly string[];
  primaryPlacementId: string | null;
  notifiedNodeCount: number;
}>;

export type MindMapSingleSelectionChange = Readonly<{
  changed: boolean;
  previousNodeId: string | null;
  selectedNodeId: string | null;
  notifiedNodeCount: number;
}>;

export interface MindMapSelectionStore {
  /** Compatibility alias: the returned identity is a visual placement id. */
  getSelectedNodeId(): string | null;
  getPrimaryPlacementId(): string | null;
  getSelectedPlacementIds(): readonly string[];
  getSnapshot(): MindMapSelectionSnapshot;
  isNodeSelected(placementId: string): boolean;
  /** Compatibility alias for replacing selection with zero or one placement. */
  setSelectedNodeId(placementId: string | null): MindMapSingleSelectionChange;
  setSelection(placementIds: readonly string[], primaryPlacementId?: string | null): MindMapSelectionChange;
  setPrimaryPlacementId(placementId: string): MindMapSelectionChange;
  subscribeNode(placementId: string, listener: () => void): () => void;
  getDiagnostics(): Readonly<{ commitCount: number; notifiedNodeCount: number }>;
  dispose(): void;
}

const normalizeSelection = (
  placementIds: readonly string[],
  requestedPrimary: string | null | undefined,
  previousPrimary: string | null,
) => {
  const selectedPlacementIds = Array.from(new Set(placementIds.filter(Boolean)));
  const selected = new Set(selectedPlacementIds);
  const primaryPlacementId = requestedPrimary && selected.has(requestedPrimary)
    ? requestedPrimary
    : previousPrimary && selected.has(previousPrimary)
      ? previousPrimary
      : selectedPlacementIds[0] || null;
  return { selectedPlacementIds, selected, primaryPlacementId };
};

export const createMindMapSelectionStore = (): MindMapSelectionStore => {
  let selectedPlacementIds: readonly string[] = [];
  let selected = new Set<string>();
  let primaryPlacementId: string | null = null;
  let commitCount = 0;
  let notifiedNodeCount = 0;
  const listenersByPlacementId = new Map<string, Set<() => void>>();

  const notifyPlacement = (placementId: string) => {
    const listeners = listenersByPlacementId.get(placementId);
    if (!listeners?.size) return 0;
    const snapshot = [...listeners];
    snapshot.forEach(listener => listener());
    return snapshot.length;
  };

  const setSelection = (
    placementIds: readonly string[],
    requestedPrimary?: string | null,
  ): MindMapSelectionChange => {
    const previousPlacementIds = selectedPlacementIds;
    const previousSelected = selected;
    const previousPrimary = primaryPlacementId;
    const next = normalizeSelection(placementIds, requestedPrimary, previousPrimary);
    const membershipChanged = previousSelected.size !== next.selected.size
      || [...previousSelected].some(placementId => !next.selected.has(placementId));
    const primaryChanged = previousPrimary !== next.primaryPlacementId;
    if (!membershipChanged && !primaryChanged) {
      return {
        changed: false,
        previousNodeId: previousPrimary,
        selectedNodeId: previousPrimary,
        previousPlacementIds,
        selectedPlacementIds,
        primaryPlacementId,
        notifiedNodeCount: 0,
      };
    }

    selectedPlacementIds = next.selectedPlacementIds;
    selected = next.selected;
    primaryPlacementId = next.primaryPlacementId;
    commitCount += 1;

    const changedMembership = new Set<string>();
    previousSelected.forEach(placementId => {
      if (!selected.has(placementId)) changedMembership.add(placementId);
    });
    selected.forEach(placementId => {
      if (!previousSelected.has(placementId)) changedMembership.add(placementId);
    });
    const notified = [...changedMembership].reduce((count, placementId) => count + notifyPlacement(placementId), 0);
    notifiedNodeCount += notified;

    return {
      changed: true,
      previousNodeId: previousPrimary,
      selectedNodeId: primaryPlacementId,
      previousPlacementIds,
      selectedPlacementIds,
      primaryPlacementId,
      notifiedNodeCount: notified,
    };
  };

  return {
    getSelectedNodeId: () => primaryPlacementId,
    getPrimaryPlacementId: () => primaryPlacementId,
    getSelectedPlacementIds: () => selectedPlacementIds,
    getSnapshot: () => ({ selectedPlacementIds, primaryPlacementId }),
    isNodeSelected: placementId => selected.has(placementId),
    setSelectedNodeId: placementId => {
      const change = setSelection(placementId ? [placementId] : [], placementId);
      return {
        changed: change.changed,
        previousNodeId: change.previousNodeId,
        selectedNodeId: change.selectedNodeId,
        notifiedNodeCount: change.notifiedNodeCount,
      };
    },
    setSelection,
    setPrimaryPlacementId: placementId => (
      selected.has(placementId)
        ? setSelection(selectedPlacementIds, placementId)
        : setSelection([placementId], placementId)
    ),
    subscribeNode: (placementId, listener) => {
      const listeners = listenersByPlacementId.get(placementId) || new Set<() => void>();
      listeners.add(listener);
      listenersByPlacementId.set(placementId, listeners);
      return () => {
        const current = listenersByPlacementId.get(placementId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listenersByPlacementId.delete(placementId);
      };
    },
    getDiagnostics: () => ({ commitCount, notifiedNodeCount }),
    dispose: () => {
      listenersByPlacementId.clear();
      selectedPlacementIds = [];
      selected.clear();
      primaryPlacementId = null;
    },
  };
};

export const useMindMapNodeSelected = (store: MindMapSelectionStore, placementId: string) => {
  const subscribe = useCallback((listener: () => void) => store.subscribeNode(placementId, listener), [placementId, store]);
  const getSnapshot = useCallback(() => store.isNodeSelected(placementId), [placementId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
