import { create } from 'zustand';
import type { TagColor, TaskTag } from '../types';
import { tagService } from '../services/dataBackend';
import { createTagId, DEFAULT_TAG_COLOR, sortTags } from '../utils/tags';
import useAuthStore from './useAuthStore';
import { filterReadIdentity } from '../features/taskFilters/optionSource';

interface TagState {
  tags: TaskTag[];
  loading: boolean;
  error: string | null;
  loadedWorkspaceId: string | null;
}

interface TagActions {
  setTags: (tags: TaskTag[], workspaceId?: string | null) => void;
  beginTagLoad: (workspaceId: string | null) => void;
  failTagLoad: (error: unknown) => void;
  loadTags: (workspaceId: string | null | undefined) => Promise<void>;
  createTag: (workspaceId: string, name: string, color?: TagColor) => Promise<TaskTag | null>;
  updateTag: (workspaceId: string, tagId: string, updates: Partial<TaskTag>) => Promise<void>;
  deleteTag: (workspaceId: string, tagId: string) => Promise<void>;
}

const normalizeTagName = (name: string) => name.trim().slice(0, 40);
let tagLoadGeneration = 0;
let tagScope: { identity: string | null; workspaceId: string | null } | null = null;
const currentIdentity = () => filterReadIdentity(useAuthStore.getState().user);
const selectTagScope = (workspaceId: string | null, invalidateReads = true) => {
  const identity = currentIdentity();
  const changed = !tagScope || tagScope.identity !== identity || tagScope.workspaceId !== workspaceId;
  if (changed) tagScope = { identity, workspaceId };
  if (changed || invalidateReads) tagLoadGeneration += 1;
  return { identity, changed, scope: tagScope, generation: tagLoadGeneration };
};

export const useTagStore = create<TagState & TagActions>((set, get) => ({
  tags: [],
  loading: false,
  error: null,
  loadedWorkspaceId: null,

  setTags: (tags, workspaceId = null) => {
    selectTagScope(workspaceId);
    set({
      tags: sortTags(tags),
      loading: false,
      error: null,
      loadedWorkspaceId: workspaceId,
    });
  },
  beginTagLoad: (workspaceId) => {
    const { changed } = selectTagScope(workspaceId);
    set({ ...(changed && { tags: [] }), loading: true, error: null, loadedWorkspaceId: null });
  },
  failTagLoad: error => set({
    loading: false,
    error: error instanceof Error ? error.message : '無法載入標籤。',
    loadedWorkspaceId: null,
  }),

  loadTags: async (workspaceId) => {
    const read = selectTagScope(workspaceId ?? null);
    const isCurrent = () => read.generation === tagLoadGeneration && read.identity === currentIdentity();
    if (!workspaceId) {
      set({ tags: [], loading: false, error: null, loadedWorkspaceId: null });
      return;
    }

    set({ ...(read.changed && { tags: [] }), loading: true, error: null, loadedWorkspaceId: null });
    try {
      const tags = await tagService.listByWorkspace(workspaceId);
      if (!isCurrent()) return;
      set({ tags: sortTags(tags), loading: false, error: null, loadedWorkspaceId: workspaceId });
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[useTagStore] loadTags failed:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : '無法載入標籤。',
        loadedWorkspaceId: null,
      });
    }
  },

  createTag: async (workspaceId, name, color = DEFAULT_TAG_COLOR) => {
    const trimmed = normalizeTagName(name);
    if (!workspaceId || !trimmed) return null;
    const { scope, identity } = selectTagScope(workspaceId, false);
    const isCurrent = () => scope === tagScope && identity === currentIdentity();

    const now = Date.now();
    const tag: TaskTag = {
      id: createTagId(),
      workspaceId,
      name: trimmed,
      color,
      order: get().tags.length,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({ tags: sortTags([...state.tags, tag]) }));

    try {
      const created = await tagService.create(workspaceId, tag);
      if (!isCurrent()) return null;
      set((state) => ({
        tags: sortTags(state.tags.map(item => item.id === tag.id ? created : item)),
      }));
      return created;
    } catch (error) {
      if (!isCurrent()) return null;
      console.error('[useTagStore] createTag failed:', error);
      set((state) => ({
        tags: state.tags.filter(item => item.id !== tag.id),
        error: error instanceof Error ? error.message : '無法建立標籤。',
      }));
      return null;
    }
  },

  updateTag: async (workspaceId, tagId, updates) => {
    const safeUpdates: Partial<TaskTag> = {
      ...updates,
      updatedAt: Date.now(),
    };
    if (updates.name !== undefined) {
      const trimmed = normalizeTagName(updates.name);
      if (!trimmed) return;
      safeUpdates.name = trimmed;
    }
    const { scope, identity } = selectTagScope(workspaceId, false);
    const isCurrent = () => scope === tagScope && identity === currentIdentity();

    const previous = get().tags;
    set((state) => ({
      tags: sortTags(state.tags.map(tag => tag.id === tagId ? { ...tag, ...safeUpdates } : tag)),
    }));

    try {
      await tagService.update(workspaceId, tagId, safeUpdates);
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[useTagStore] updateTag failed:', error);
      set({ tags: previous, error: error instanceof Error ? error.message : '無法更新標籤。' });
    }
  },

  deleteTag: async (workspaceId, tagId) => {
    const { scope, identity } = selectTagScope(workspaceId, false);
    const isCurrent = () => scope === tagScope && identity === currentIdentity();
    const previous = get().tags;
    set((state) => ({
      tags: state.tags.filter(tag => tag.id !== tagId),
    }));

    try {
      await tagService.delete(workspaceId, tagId);
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[useTagStore] deleteTag failed:', error);
      set({ tags: previous, error: error instanceof Error ? error.message : '無法刪除標籤。' });
    }
  },
}));
