import { useEffect } from 'react';
import { dataBackend, isLocalTestBackend } from '../services/dataBackend';
import { useFirestoreSync } from './useFirestoreSync';
import { useMemberSync } from './useMemberSync';
import { useSupabaseSync } from './useSupabaseSync';
import { useTagSync } from './useTagSync';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import type { TaskNode } from '../types';

const LOCAL_TEST_NODES_KEY = 'projed-local-test.nodes';

const readLocalTestBoardNodes = (serialized: string | null, workspaceId: string | null, boardId: string) => {
  if (!serialized) return [] as TaskNode[];
  try {
    const parsed = JSON.parse(serialized) as Record<string, TaskNode>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.values(parsed)
      .filter(node => node && node.boardId === boardId && (!workspaceId || node.workspaceId === workspaceId))
      .sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return null;
  }
};

function useLocalTestNodeSync() {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);

  useEffect(() => {
    if (!isLocalTestBackend || !activeBoardId) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOCAL_TEST_NODES_KEY || event.storageArea !== window.localStorage) return;
      const remoteNodes = readLocalTestBoardNodes(event.newValue, activeWorkspaceId, activeBoardId);
      if (!remoteNodes) return;

      const currentNodes = Object.values(useWbsStore.getState().nodes)
        .filter(node => node.boardId === activeBoardId && (!activeWorkspaceId || node.workspaceId === activeWorkspaceId))
        .sort((left, right) => left.id.localeCompare(right.id));
      if (JSON.stringify(currentNodes) === JSON.stringify(remoteNodes)) return;

      useWbsStore.getState().setNodes(remoteNodes, {
        scopeBoardIds: [activeBoardId],
        preserveOutOfScope: true,
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [activeBoardId, activeWorkspaceId]);
}

export function useDataSync() {
  useLocalTestNodeSync();
  useFirestoreSync({ enabled: dataBackend === 'firebase' });
  useSupabaseSync({ enabled: dataBackend === 'supabase' });
  useMemberSync();
  useTagSync();
}
