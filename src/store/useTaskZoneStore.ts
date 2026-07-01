import { create } from 'zustand';
import { taskZoneService } from '../services/dataBackend';
import type { PersonalTaskPlacementInput, PersonalTaskZoneInfo, TaskNode } from '../types';

const createClientMutationId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type TaskZoneState = {
  tasks: TaskNode[];
  zone: PersonalTaskZoneInfo | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
};

type TaskZoneActions = {
  load: () => Promise<void>;
  createTask: (input: { title: string; description?: string | null; suggestedDueDate?: string | null }) => Promise<TaskNode | null>;
  updateTask: (taskId: string, updates: Partial<TaskNode>) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  placeTaskOnBoard: (input: Omit<PersonalTaskPlacementInput, 'placementClientMutationId'>) => Promise<TaskNode>;
  getUnplacedCount: () => number;
};

const sortTasks = (tasks: TaskNode[]) =>
  [...tasks].filter(task => !task.isArchived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

const getRootTasks = (tasks: TaskNode[]) => {
  const ids = new Set(tasks.map(task => task.id));
  return tasks.filter(task => !task.parentId || !ids.has(task.parentId));
};

const useTaskZoneStore = create<TaskZoneState & TaskZoneActions>((set, get) => ({
  tasks: [],
  zone: null,
  isLoading: false,
  isMutating: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const { zone, tasks } = await taskZoneService.loadZoneTasks();
      set({ zone, tasks: sortTasks(getRootTasks(tasks)), isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : '任務專區載入失敗。';
      set({ error: message, isLoading: false });
    }
  },

  createTask: async ({ title, description = null, suggestedDueDate = null }) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;
    set({ isMutating: true, error: null });
    try {
      const task = await taskZoneService.createQuickTask({
        clientMutationId: createClientMutationId('quick_task'),
        title: trimmedTitle,
        description,
        suggestedDueDate,
        sourceContext: { source: 'task_zone' },
      });
      set(state => ({
        tasks: sortTasks([task, ...state.tasks.filter(existing => existing.id !== task.id)]),
        zone: state.zone || { workspaceId: task.workspaceId, boardId: task.boardId },
        isMutating: false,
      }));
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : '快速建立任務失敗。';
      set({ error: message, isMutating: false });
      throw error;
    }
  },

  updateTask: async (taskId, updates) => {
    const current = get().tasks.find(task => task.id === taskId);
    if (!current) return;
    const finalUpdates = {
      ...updates,
      updatedAt: Date.now(),
    };
    const updatedTask = { ...current, ...finalUpdates };
    set(state => ({
      tasks: sortTasks(state.tasks.map(task => task.id === taskId ? updatedTask : task)),
    }));
    try {
      await taskZoneService.updateTask(taskId, finalUpdates);
    } catch (error) {
      set(state => ({
        tasks: sortTasks(state.tasks.map(task => task.id === taskId ? current : task)),
        error: error instanceof Error ? error.message : '任務更新失敗。',
      }));
      throw error;
    }
  },

  removeTask: async (taskId) => {
    const current = get().tasks.find(task => task.id === taskId);
    if (!current) return;
    set(state => ({ tasks: state.tasks.filter(task => task.id !== taskId) }));
    try {
      await taskZoneService.archiveTask(taskId);
    } catch (error) {
      set(state => ({
        tasks: sortTasks([current, ...state.tasks]),
        error: error instanceof Error ? error.message : '任務刪除失敗。',
      }));
      throw error;
    }
  },

  placeTaskOnBoard: async (input) => {
    const placed = await taskZoneService.placeTaskOnBoard({
      ...input,
      placementClientMutationId: createClientMutationId('task_zone_place'),
    });
    set(state => ({ tasks: state.tasks.filter(task => task.id !== input.taskId) }));
    return placed;
  },

  getUnplacedCount: () => getRootTasks(get().tasks).filter(task => !task.isArchived && task.status !== 'completed').length,
}));

export default useTaskZoneStore;
