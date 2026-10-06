import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { requireFirebaseDb } from '../services/firebase';
import { dataBackend } from '../services/dataBackend';
import { isSupabaseConfigured, supabase } from '../services/supabase/client';
import { supabaseTagService } from '../services/supabase/projedService';
import useBoardStore from '../store/useBoardStore';
import { useTagStore } from '../store/useTagStore';
import type { TaskTag } from '../types';
import { createCoalescedAsyncRefresh } from '../utils/coalescedAsyncRefresh';

export function useTagSync() {
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const workspaces = useBoardStore(s => s.workspaces);
  const setTags = useTagStore(s => s.setTags);
  const beginTagLoad = useTagStore(s => s.beginTagLoad);
  const failTagLoad = useTagStore(s => s.failTagLoad);
  const loadTags = useTagStore(s => s.loadTags);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setTags([], null);
      return;
    }

    if (dataBackend === 'firebase') {
      beginTagLoad(activeWorkspaceId);
      const firestoreDb = requireFirebaseDb();
      const unsubscribe = onSnapshot(
        collection(firestoreDb, 'workspaces', activeWorkspaceId, 'tags'),
        (snapshot) => {
          setTags(snapshot.docs.map(docSnap => ({
            ...(docSnap.data() as TaskTag),
            id: docSnap.id,
            workspaceId: activeWorkspaceId,
          })), activeWorkspaceId);
        },
        (error) => {
          console.error('[useTagSync] Firebase tag snapshot error:', error);
          failTagLoad(error);
        }
      );
      return unsubscribe;
    }

    if (dataBackend === 'supabase') {
      if (!isSupabaseConfigured) {
        setTags([], null);
        return;
      }
      if (workspaces.length === 0 || !workspaces.some(workspace => workspace.id === activeWorkspaceId)) {
        setTags([], null);
        return;
      }

      beginTagLoad(activeWorkspaceId);
      let cancelled = false;
      const loadSupabaseTags = async () => {
        const tags = await supabaseTagService.listByWorkspace(activeWorkspaceId);
        if (!cancelled) setTags(tags, activeWorkspaceId);
      };

      const tagRefresh = createCoalescedAsyncRefresh(loadSupabaseTags, {
        onError: error => {
          console.error('[useTagSync] Supabase tag load error:', error);
          if (!cancelled) failTagLoad(error);
        },
      });
      tagRefresh.request({ immediate: true });

      const channel = supabase
        .channel(`projed-tags-${activeWorkspaceId}-${activeBoardId || 'workspace'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_tags' }, () => tagRefresh.request())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wbs_item_tags' }, () => tagRefresh.request())
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') tagRefresh.request({ immediate: true });
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[useTagSync] Supabase realtime channel error:', error ?? status);
          }
        });

      const refreshVisibleTags = () => {
        if (document.visibilityState === 'visible') tagRefresh.request({ immediate: true });
      };
      window.addEventListener('online', refreshVisibleTags);
      document.addEventListener('visibilitychange', refreshVisibleTags);

      return () => {
        cancelled = true;
        tagRefresh.cancel();
        window.removeEventListener('online', refreshVisibleTags);
        document.removeEventListener('visibilitychange', refreshVisibleTags);
        void supabase.removeChannel(channel);
      };
    }

    void loadTags(activeWorkspaceId);
  }, [activeWorkspaceId, activeBoardId, workspaces, setTags, beginTagLoad, failTagLoad, loadTags]);
}
