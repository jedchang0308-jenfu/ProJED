import { create } from 'zustand';
import type { TagColor, TaskTag } from '../types';
import { tagService } from '../services/dataBackend';
import { createTagId, DEFAULT_TAG_COLOR, sortTags } from '../utils/tags';

interface TagState {
  tags: TaskTag[];
  selectedTagIds: string[];
  loading: boolean;
  error: string | null;
}

interface TagActions {
  setTags: (tags: TaskTag[]) => void;
  loadTags: (workspaceId: string | null | undefined) => Promise<void>;
  createTag: (workspaceId: string, name: string, color?: TagColor) => Promise<TaskTag | null>;
  updateTag: (workspaceId: string, tagId: string, updates: Partial<TaskTag>) => Promise<void>;
  deleteTag: (workspaceId: string, tagId: string) => Promise<void>;
  toggleTagFilter: (tagId: string) => void;
  clearTagFilters: () => void;
}

const normalizeTagName = (name: string) => name.trim().slice(0, 40);

export const useTagStore = create<TagState & TagActions>((set, get) => ({
  tags: [],
  selectedTagIds: [],
  loading: false,
  error: null,

  setTags: (tags) => set({ tags: sortTags(tags) }),

  loadTags: async (workspaceId) => {
    if (!workspaceId) {
      set({ tags: [], selectedTagIds: [], loading: false, error: null });
      return;
    }

    set({ loading: true, error: null });
    try {
      const tags = await tagService.listByWorkspace(workspaceId);
      set((state) => ({
        tags: sortTags(tags),
        selectedTagIds: state.selectedTagIds.filter(id => tags.some(tag => tag.id === id)),
        loading: false,
      }));
    } catch (error) {
      console.error('[useTagStore] loadTags failed:', error);
      set({ loading: false, error: error instanceof Error ? error.message : 'Failed to load tags' });
    }
  },

  createTag: async (workspaceId, name, color = DEFAULT_TAG_COLOR) => {
    const trimmed = normalizeTagName(name);
    if (!workspaceId || !trimmed) return null;

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
      set((state) => ({
        tags: sortTags(state.tags.map(item => item.id === tag.id ? created : item)),
      }));
      return created;
    } catch (error) {
      console.error('[useTagStore] createTag failed:', error);
      set((state) => ({
        tags: state.tags.filter(item => item.id !== tag.id),
        error: error instanceof Error ? error.message : 'Failed to create tag',
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

    const previous = get().tags;
    set((state) => ({
      tags: sortTags(state.tags.map(tag => tag.id === tagId ? { ...tag, ...safeUpdates } : tag)),
    }));

    try {
      await tagService.update(workspaceId, tagId, safeUpdates);
    } catch (error) {
      console.error('[useTagStore] updateTag failed:', error);
      set({ tags: previous, error: error instanceof Error ? error.message : 'Failed to update tag' });
    }
  },

  deleteTag: async (workspaceId, tagId) => {
    const previous = get().tags;
    set((state) => ({
      tags: state.tags.filter(tag => tag.id !== tagId),
      selectedTagIds: state.selectedTagIds.filter(id => id !== tagId),
    }));

    try {
      await tagService.delete(workspaceId, tagId);
    } catch (error) {
      console.error('[useTagStore] deleteTag failed:', error);
      set({ tags: previous, error: error instanceof Error ? error.message : 'Failed to delete tag' });
    }
  },

  toggleTagFilter: (tagId) => {
    set((state) => ({
      selectedTagIds: state.selectedTagIds.includes(tagId)
        ? state.selectedTagIds.filter(id => id !== tagId)
        : [...state.selectedTagIds, tagId],
    }));
  },

  clearTagFilters: () => set({ selectedTagIds: [] }),
}));
