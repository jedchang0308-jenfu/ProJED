import { useCallback, useSyncExternalStore } from 'react';

export type MindMapSelectionChange = Readonly<{
  changed: boolean;
  previousNodeId: string | null;
  selectedNodeId: string | null;
  notifiedNodeCount: number;
}>;

export interface MindMapSelectionStore {
  getSelectedNodeId(): string | null;
  isNodeSelected(nodeId: string): boolean;
  setSelectedNodeId(nodeId: string | null): MindMapSelectionChange;
  subscribeNode(nodeId: string, listener: () => void): () => void;
  getDiagnostics(): Readonly<{ commitCount: number; notifiedNodeCount: number }>;
  dispose(): void;
}

export const createMindMapSelectionStore = (): MindMapSelectionStore => {
  let selectedNodeId: string | null = null;
  let commitCount = 0;
  let notifiedNodeCount = 0;
  const listenersByNodeId = new Map<string, Set<() => void>>();

  const notifyNode = (nodeId: string | null) => {
    if (!nodeId) return 0;
    const listeners = listenersByNodeId.get(nodeId);
    if (!listeners?.size) return 0;
    const snapshot = [...listeners];
    snapshot.forEach(listener => listener());
    return snapshot.length;
  };

  return {
    getSelectedNodeId: () => selectedNodeId,
    isNodeSelected: nodeId => selectedNodeId === nodeId,
    setSelectedNodeId: nodeId => {
      const previousNodeId = selectedNodeId;
      if (previousNodeId === nodeId) {
        return {
          changed: false,
          previousNodeId,
          selectedNodeId: previousNodeId,
          notifiedNodeCount: 0,
        };
      }
      selectedNodeId = nodeId;
      commitCount += 1;
      const notified = notifyNode(previousNodeId) + (nodeId === previousNodeId ? 0 : notifyNode(nodeId));
      notifiedNodeCount += notified;
      return {
        changed: true,
        previousNodeId,
        selectedNodeId: nodeId,
        notifiedNodeCount: notified,
      };
    },
    subscribeNode: (nodeId, listener) => {
      const listeners = listenersByNodeId.get(nodeId) || new Set<() => void>();
      listeners.add(listener);
      listenersByNodeId.set(nodeId, listeners);
      return () => {
        const current = listenersByNodeId.get(nodeId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listenersByNodeId.delete(nodeId);
      };
    },
    getDiagnostics: () => ({ commitCount, notifiedNodeCount }),
    dispose: () => {
      listenersByNodeId.clear();
    },
  };
};

export const useMindMapNodeSelected = (store: MindMapSelectionStore, nodeId: string) => {
  const subscribe = useCallback((listener: () => void) => store.subscribeNode(nodeId, listener), [nodeId, store]);
  const getSnapshot = useCallback(() => store.isNodeSelected(nodeId), [nodeId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
