import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { requireFirebaseDb } from '../services/firebase';
import { dataBackend } from '../services/dataBackend';
import { isSupabaseConfigured, supabase } from '../services/supabase/client';
import { supabaseTagService } from '../services/supabase/projedService';
import useBoardStore from '../store/useBoardStore';
import { useTagStore } from '../store/useTagStore';
import type { TaskTag } from '../types';

export function useTagSync() {
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const workspaces = useBoardStore(s => s.workspaces);
  const setTags = useTagStore(s => s.setTags);
  const loadTags = useTagStore(s => s.loadTags);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setTags([]);
      return;
    }

    if (dataBackend === 'firebase') {
      const firestoreDb = requireFirebaseDb();
      const unsubscribe = onSnapshot(
        collection(firestoreDb, 'workspaces', activeWorkspaceId, 'tags'),
        (snapshot) => {
          setTags(snapshot.docs.map(docSnap => ({
            ...(docSnap.data() as TaskTag),
            id: docSnap.id,
            workspaceId: activeWorkspaceId,
          })));
        },
        (error) => {
          console.error('[useTagSync] Firebase tag snapshot error:', error);
        }
      );
      return unsubscribe;
    }

    if (dataBackend === 'supabase') {
      if (!isSupabaseConfigured) {
        setTags([]);
        return;
      }
      if (workspaces.length === 0 || !workspaces.some(workspace => workspace.id === activeWorkspaceId)) {
        setTags([]);
        return;
      }

      let cancelled = false;
      const loadSupabaseTags = async () => {
        try {
          const tags = await supabaseTagService.listByWorkspace(activeWorkspaceId);
          if (!cancelled) setTags(tags);
        } catch (error) {
          console.error('[useTagSync] Supabase tag load error:', error);
        }
      };

      void loadSupabaseTags();
      const channel = supabase
        .channel(`projed-tags-${activeWorkspaceId}-${activeBoardId || 'workspace'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_tags' }, () => void loadSupabaseTags())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wbs_item_tags' }, () => void loadSupabaseTags())
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    }

    void loadTags(activeWorkspaceId);
  }, [activeWorkspaceId, activeBoardId, workspaces, setTags, loadTags]);
}
