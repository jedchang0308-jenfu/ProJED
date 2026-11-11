import type { Dependency, TaskNode, TaskTag } from '../../types';
import { parseHttpDependency, parseHttpTag, parseHttpTask } from './domainReadAdapter';
import { HttpApiClient } from './httpApiClient';

export interface ProjedDomainWriteAdapter {
  createTask(workspaceRef: string, boardRef: string, task: TaskNode, signal?: AbortSignal): Promise<TaskNode>;
  updateTask(workspaceRef: string, boardRef: string, taskRef: string, updates: Partial<TaskNode>, signal?: AbortSignal): Promise<TaskNode>;
  batchUpdateTasks(
    workspaceRef: string,
    boardRef: string,
    updates: Array<{ id: string; data: Partial<TaskNode> }>,
    signal?: AbortSignal,
  ): Promise<TaskNode[]>;
  deleteTask(workspaceRef: string, boardRef: string, taskRef: string, signal?: AbortSignal): Promise<void>;
  setTaskTags(workspaceRef: string, boardRef: string, taskRef: string, tagRefs: string[], signal?: AbortSignal): Promise<TaskNode>;
  createTag(workspaceRef: string, tag: TaskTag, signal?: AbortSignal): Promise<TaskTag>;
  updateTag(workspaceRef: string, tagRef: string, updates: Partial<TaskTag>, signal?: AbortSignal): Promise<TaskTag>;
  deleteTag(workspaceRef: string, tagRef: string, signal?: AbortSignal): Promise<void>;
  createDependency(
    workspaceRef: string,
    boardRef: string,
    dependency: Omit<Dependency, 'id'>,
    signal?: AbortSignal,
  ): Promise<Dependency>;
  setDependency(workspaceRef: string, boardRef: string, dependency: Dependency, signal?: AbortSignal): Promise<Dependency>;
  updateDependency(
    workspaceRef: string,
    boardRef: string,
    dependencyRef: string,
    updates: Partial<Dependency>,
    signal?: AbortSignal,
  ): Promise<Dependency>;
  deleteDependency(workspaceRef: string, boardRef: string, dependencyRef: string, signal?: AbortSignal): Promise<void>;
}

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

function ref(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) throw new Error(`HTTP_API_INVALID_${label}`);
  return encodeURIComponent(value);
}

function boardPath(workspaceRef: string, boardRef: string, suffix: string): string {
  return `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/boards/${ref(boardRef, 'BOARD_REF')}/${suffix}`;
}

function data(value: unknown, label: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOwn(value, 'data')) {
    throw new Error(`HTTP_API_INVALID_${label}_ENVELOPE`);
  }
  return (value as { data: unknown }).data;
}

function taskCreateBody(task: TaskNode): Record<string, unknown> {
  return {
    id: task.id,
    parentId: task.parentId,
    title: task.title,
    detailNotes: task.detailNotes ?? [],
    description: task.description ?? null,
    status: task.status,
    assigneeIds: task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []),
    collaboratorIds: task.collaboratorIds ?? [],
    tagIds: task.tagIds ?? [],
    startDate: task.startDate ?? null,
    endDate: task.endDate ?? null,
    isDurationLocked: task.isDurationLocked ?? null,
    nodeType: task.nodeType ?? null,
    kanbanStageId: task.kanbanStageId ?? null,
    order: task.order,
    isArchived: task.isArchived ?? false,
  };
}

function taskUpdateBody(updates: Partial<TaskNode>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const fields: Array<keyof TaskNode> = [
    'parentId', 'title', 'detailNotes', 'description', 'status', 'assigneeIds', 'assigneeId', 'collaboratorIds',
    'tagIds', 'startDate', 'endDate', 'isDurationLocked', 'nodeType', 'kanbanStageId', 'order', 'isArchived',
  ];
  for (const field of fields) {
    if (hasOwn(updates, field)) body[field] = updates[field] ?? (
      ['description', 'startDate', 'endDate', 'isDurationLocked', 'nodeType', 'kanbanStageId', 'parentId'].includes(field)
        ? null
        : updates[field]
    );
  }
  return body;
}

export function createHttpDomainWriteAdapter(client: HttpApiClient): ProjedDomainWriteAdapter {
  return {
    async createTask(workspaceRef, boardRef, task, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'tasks'), {
        method: 'POST', body: taskCreateBody(task), signal,
      });
      return parseHttpTask(data(response, 'TASK_CREATE'));
    },
    async updateTask(workspaceRef, boardRef, taskRef, updates, signal) {
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `tasks/${ref(taskRef, 'TASK_REF')}`,
      ), { method: 'PATCH', body: taskUpdateBody(updates), signal });
      return parseHttpTask(data(response, 'TASK_UPDATE'));
    },
    async batchUpdateTasks(workspaceRef, boardRef, updates, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'tasks:batch-update'), {
        method: 'POST',
        body: { updates: updates.map(update => ({ id: update.id, data: taskUpdateBody(update.data) })) },
        signal,
      });
      const rows = data(response, 'TASK_BATCH');
      if (!Array.isArray(rows)) throw new Error('HTTP_API_INVALID_TASK_BATCH_DATA');
      return rows.map(parseHttpTask);
    },
    async deleteTask(workspaceRef, boardRef, taskRef, signal) {
      await client.request<unknown>(boardPath(workspaceRef, boardRef, `tasks/${ref(taskRef, 'TASK_REF')}`), {
        method: 'DELETE', signal,
      });
    },
    async setTaskTags(workspaceRef, boardRef, taskRef, tagRefs, signal) {
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `tasks/${ref(taskRef, 'TASK_REF')}/tags`,
      ), { method: 'PUT', body: { tagIds: tagRefs }, signal });
      return parseHttpTask(data(response, 'TASK_TAGS'));
    },
    async createTag(workspaceRef, tag, signal) {
      const response = await client.request<unknown>(
        `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/tags`,
        { method: 'POST', body: { id: tag.id, name: tag.name, color: tag.color, order: tag.order }, signal },
      );
      return parseHttpTag(data(response, 'TAG_CREATE'));
    },
    async updateTag(workspaceRef, tagRef, updates, signal) {
      const body: Record<string, unknown> = {};
      for (const field of ['name', 'color', 'order'] as const) if (hasOwn(updates, field)) body[field] = updates[field];
      const response = await client.request<unknown>(
        `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/tags/${ref(tagRef, 'TAG_REF')}`,
        { method: 'PATCH', body, signal },
      );
      return parseHttpTag(data(response, 'TAG_UPDATE'));
    },
    async deleteTag(workspaceRef, tagRef, signal) {
      await client.request<unknown>(
        `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/tags/${ref(tagRef, 'TAG_REF')}`,
        { method: 'DELETE', signal },
      );
    },
    async createDependency(workspaceRef, boardRef, dependency, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'dependencies'), {
        method: 'POST', body: dependency, signal,
      });
      return parseHttpDependency(data(response, 'DEPENDENCY_CREATE'));
    },
    async setDependency(workspaceRef, boardRef, dependency, signal) {
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `dependencies/${ref(dependency.id, 'DEPENDENCY_REF')}`,
      ), { method: 'PUT', body: dependency, signal });
      return parseHttpDependency(data(response, 'DEPENDENCY_SET'));
    },
    async updateDependency(workspaceRef, boardRef, dependencyRef, updates, signal) {
      const body = { ...updates };
      delete body.id;
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `dependencies/${ref(dependencyRef, 'DEPENDENCY_REF')}`,
      ), { method: 'PATCH', body, signal });
      return parseHttpDependency(data(response, 'DEPENDENCY_UPDATE'));
    },
    async deleteDependency(workspaceRef, boardRef, dependencyRef, signal) {
      await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `dependencies/${ref(dependencyRef, 'DEPENDENCY_REF')}`,
      ), { method: 'DELETE', signal });
    },
  };
}
