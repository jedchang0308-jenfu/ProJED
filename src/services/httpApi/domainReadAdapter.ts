import {
  BOARD_PERMISSION_CAPABILITIES,
  COLLABORATION_ROLES,
  createDefaultBoardRolePermissionMatrix,
  normalizeBoardRolePermissionMatrix,
  type Board,
  type BoardMember,
  type BoardRolePermissionMatrix,
  type CollaborationMemberProfile,
  type CollaborationRole,
  type Dependency,
  type MembershipStatus,
  type TaskNode,
  type TaskStatus,
  type TaskTag,
  type TagColor,
  type Workspace,
  type WorkspaceMember,
} from '../../types';
import { isTaskNoteRichContent } from '../../utils/taskNoteRichContent';
import { HttpApiClient } from './httpApiClient';

export interface ProjedDomainReadAdapter {
  listWorkspaces(signal?: AbortSignal): Promise<Workspace[]>;
  listWorkspaceMembers(workspaceRef: string, signal?: AbortSignal): Promise<WorkspaceMember[]>;
  listTags(workspaceRef: string, signal?: AbortSignal): Promise<TaskTag[]>;
  listBoardMembers(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<BoardMember[]>;
  getBoardRolePermissions(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<BoardRolePermissionMatrix>;
  listTasks(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<TaskNode[]>;
  listDependencies(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<Dependency[]>;
}

const ROLES = new Set<string>(COLLABORATION_ROLES);
const MEMBERSHIP_STATUSES = new Set<MembershipStatus>(['active', 'invited', 'suspended']);
const TASK_STATUSES = new Set<TaskStatus>(['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold']);
const CAPABILITIES = new Set<string>(BOARD_PERMISSION_CAPABILITIES);
const TAG_COLORS = new Set<TagColor>(['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black', 'gray']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`HTTP_API_INVALID_${label}`);
  }
  return [...value];
}

function items(value: unknown, label: string): unknown[] {
  const envelope = record(value, `${label}_ENVELOPE`);
  if (!Array.isArray(envelope.data)) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return envelope.data;
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  return record(record(value, `${label}_ENVELOPE`).data, `${label}_DATA`);
}

function ref(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) {
    throw new Error(`HTTP_API_INVALID_${label}`);
  }
  return encodeURIComponent(value);
}

export function parseHttpDependency(value: unknown): Dependency {
  const row = record(value, 'DEPENDENCY');
  const fromSide = row.fromSide;
  const toSide = row.toSide;
  if ((fromSide !== 'start' && fromSide !== 'end') || (toSide !== 'start' && toSide !== 'end')) {
    throw new Error('HTTP_API_INVALID_DEPENDENCY_SIDE');
  }
  const offset = optionalNumber(row.offset, 'DEPENDENCY_OFFSET');
  return {
    id: stringValue(row.id, 'DEPENDENCY_ID'),
    fromId: stringValue(row.fromId, 'DEPENDENCY_FROM_ID'),
    fromSide,
    toId: stringValue(row.toId, 'DEPENDENCY_TO_ID'),
    toSide,
    ...(offset === undefined ? {} : { offset }),
  };
}

export function parseHttpBoard(value: unknown): Board {
  const row = record(value, 'BOARD');
  if (!Array.isArray(row.dependencies)) throw new Error('HTTP_API_INVALID_BOARD_DEPENDENCIES');
  const dependencies = row.dependencies.map(parseHttpDependency);
  const order = optionalNumber(row.order, 'BOARD_ORDER');
  const createdAt = optionalNumber(row.createdAt, 'BOARD_CREATED_AT');
  return {
    id: stringValue(row.id, 'BOARD_ID'),
    title: stringValue(row.title, 'BOARD_TITLE'),
    dependencies,
    ...(order === undefined ? {} : { order }),
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

export function parseHttpWorkspace(value: unknown): Workspace {
  const row = record(value, 'WORKSPACE');
  if (!Array.isArray(row.boards)) throw new Error('HTTP_API_INVALID_WORKSPACE_BOARDS');
  const order = optionalNumber(row.order, 'WORKSPACE_ORDER');
  const createdAt = optionalNumber(row.createdAt, 'WORKSPACE_CREATED_AT');
  const ownerId = optionalString(row.ownerId, 'WORKSPACE_OWNER_ID');
  const members = optionalStringArray(row.members, 'WORKSPACE_MEMBERS');
  return {
    id: stringValue(row.id, 'WORKSPACE_ID'),
    title: stringValue(row.title, 'WORKSPACE_TITLE'),
    boards: row.boards.map(parseHttpBoard),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(members === undefined ? {} : { members }),
    ...(order === undefined ? {} : { order }),
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

function role(value: unknown): CollaborationRole {
  if (typeof value !== 'string' || !ROLES.has(value)) throw new Error('HTTP_API_INVALID_ROLE');
  return value as CollaborationRole;
}

function profile(value: unknown): CollaborationMemberProfile | undefined {
  if (value === undefined) return undefined;
  const row = record(value, 'PROFILE');
  if (row.email !== null && typeof row.email !== 'string') throw new Error('HTTP_API_INVALID_PROFILE_EMAIL');
  if (row.displayName !== null && typeof row.displayName !== 'string') throw new Error('HTTP_API_INVALID_PROFILE_NAME');
  return {
    id: stringValue(row.id, 'PROFILE_ID'),
    email: row.email as string | null,
    displayName: row.displayName as string | null,
  };
}

function memberBase(value: unknown) {
  const row = record(value, 'MEMBER');
  const createdAt = optionalNumber(row.createdAt, 'MEMBER_CREATED_AT');
  const updatedAt = optionalNumber(row.updatedAt, 'MEMBER_UPDATED_AT');
  const memberProfile = profile(row.profile);
  return {
    row,
    workspaceId: stringValue(row.workspaceId, 'MEMBER_WORKSPACE_ID'),
    userId: stringValue(row.userId, 'MEMBER_USER_ID'),
    role: role(row.role),
    ...(memberProfile ? { profile: memberProfile } : {}),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

function workspaceMember(value: unknown): WorkspaceMember {
  const parsed = memberBase(value);
  if (typeof parsed.row.status !== 'string' || !MEMBERSHIP_STATUSES.has(parsed.row.status as MembershipStatus)) {
    throw new Error('HTTP_API_INVALID_MEMBERSHIP_STATUS');
  }
  return {
    workspaceId: parsed.workspaceId,
    userId: parsed.userId,
    role: parsed.role,
    status: parsed.row.status as MembershipStatus,
    ...(parsed.profile ? { profile: parsed.profile } : {}),
    ...(parsed.createdAt === undefined ? {} : { createdAt: parsed.createdAt }),
    ...(parsed.updatedAt === undefined ? {} : { updatedAt: parsed.updatedAt }),
  };
}

export function parseHttpBoardMember(value: unknown): BoardMember {
  const parsed = memberBase(value);
  const boardId = stringValue(parsed.row.boardId, 'MEMBER_BOARD_ID');
  return {
    workspaceId: parsed.workspaceId,
    boardId,
    userId: parsed.userId,
    role: parsed.role,
    ...(parsed.profile ? { profile: parsed.profile } : {}),
    ...(parsed.createdAt === undefined ? {} : { createdAt: parsed.createdAt }),
    ...(parsed.updatedAt === undefined ? {} : { updatedAt: parsed.updatedAt }),
  };
}

export function parseHttpTask(value: unknown): TaskNode {
  const row = record(value, 'TASK');
  if (typeof row.status !== 'string' || !TASK_STATUSES.has(row.status as TaskStatus)) {
    throw new Error('HTTP_API_INVALID_TASK_STATUS');
  }
  if (row.parentId !== null && typeof row.parentId !== 'string') throw new Error('HTTP_API_INVALID_TASK_PARENT');
  if (typeof row.order !== 'number' || !Number.isFinite(row.order)) throw new Error('HTTP_API_INVALID_TASK_ORDER');
  const assigneeIds = optionalStringArray(row.assigneeIds, 'TASK_ASSIGNEE_IDS');
  const collaboratorIds = optionalStringArray(row.collaboratorIds, 'TASK_COLLABORATOR_IDS');
  const tagIds = optionalStringArray(row.tagIds, 'TASK_TAG_IDS');
  const storageId = optionalString(row.storageId, 'TASK_STORAGE_ID');
  const description = optionalString(row.description, 'TASK_DESCRIPTION');
  const assigneeId = optionalString(row.assigneeId, 'TASK_ASSIGNEE_ID');
  const startDate = optionalString(row.startDate, 'TASK_START_DATE');
  const endDate = optionalString(row.endDate, 'TASK_END_DATE');
  const isDurationLocked = optionalBoolean(row.isDurationLocked, 'TASK_DURATION_LOCKED');
  const kanbanStageId = optionalString(row.kanbanStageId, 'TASK_KANBAN_STAGE_ID');
  const createdAt = optionalNumber(row.createdAt, 'TASK_CREATED_AT');
  const updatedAt = optionalNumber(row.updatedAt, 'TASK_UPDATED_AT');
  const isArchived = optionalBoolean(row.isArchived, 'TASK_ARCHIVED');
  if (row.nodeType !== undefined && !['group', 'milestone', 'task'].includes(String(row.nodeType))) {
    throw new Error('HTTP_API_INVALID_TASK_NODE_TYPE');
  }
  if (row.detailNotes !== undefined) {
    if (!Array.isArray(row.detailNotes) || !row.detailNotes.every(note => {
      if (!note || typeof note !== 'object' || Array.isArray(note)) return false;
      const value = note as Record<string, unknown>;
      if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.content !== 'string') return false;
      return value.richContent === undefined || isTaskNoteRichContent(value.richContent);
    })) throw new Error('HTTP_API_INVALID_TASK_DETAIL_NOTES');
  }
  return {
    id: stringValue(row.id, 'TASK_ID'),
    ...(storageId === undefined ? {} : { storageId }),
    workspaceId: stringValue(row.workspaceId, 'TASK_WORKSPACE_ID'),
    boardId: stringValue(row.boardId, 'TASK_BOARD_ID'),
    parentId: row.parentId as string | null,
    title: stringValue(row.title, 'TASK_TITLE'),
    ...(row.detailNotes === undefined ? {} : { detailNotes: row.detailNotes as TaskNode['detailNotes'] }),
    ...(description === undefined ? {} : { description }),
    status: row.status as TaskStatus,
    ...(assigneeIds === undefined ? {} : { assigneeIds }),
    ...(assigneeId === undefined ? {} : { assigneeId }),
    ...(collaboratorIds === undefined ? {} : { collaboratorIds }),
    ...(tagIds === undefined ? {} : { tagIds }),
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    ...(isDurationLocked === undefined ? {} : { isDurationLocked }),
    ...(row.nodeType === undefined ? {} : { nodeType: row.nodeType as TaskNode['nodeType'] }),
    ...(kanbanStageId === undefined ? {} : { kanbanStageId }),
    order: row.order,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(isArchived === undefined ? {} : { isArchived }),
  };
}

export function parseHttpTag(value: unknown): TaskTag {
  const row = record(value, 'TAG');
  if (typeof row.color !== 'string' || !TAG_COLORS.has(row.color as TagColor)) {
    throw new Error('HTTP_API_INVALID_TAG_COLOR');
  }
  const createdAt = optionalNumber(row.createdAt, 'TAG_CREATED_AT');
  const updatedAt = optionalNumber(row.updatedAt, 'TAG_UPDATED_AT');
  const order = optionalNumber(row.order, 'TAG_ORDER');
  if (order === undefined) throw new Error('HTTP_API_INVALID_TAG_ORDER');
  return {
    id: stringValue(row.id, 'TAG_ID'),
    workspaceId: stringValue(row.workspaceId, 'TAG_WORKSPACE_ID'),
    name: stringValue(row.name, 'TAG_NAME'),
    color: row.color as TagColor,
    order,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

export function parseHttpRolePermissions(value: unknown): BoardRolePermissionMatrix {
  const source = dataRecord(value, 'ROLE_PERMISSIONS');
  const partial: Partial<BoardRolePermissionMatrix> = {};
  const fixedOwner = createDefaultBoardRolePermissionMatrix().owner;
  for (const collaborationRole of COLLABORATION_ROLES) {
    const configured = source[collaborationRole];
    if (!Array.isArray(configured) || !configured.every(item => typeof item === 'string' && CAPABILITIES.has(item))) {
      throw new Error(`HTTP_API_INVALID_ROLE_PERMISSIONS_${collaborationRole.toUpperCase()}`);
    }
    partial[collaborationRole] = [...configured] as BoardRolePermissionMatrix[CollaborationRole];
  }
  const receivedOwner = new Set(partial.owner);
  if (receivedOwner.size !== fixedOwner.length || fixedOwner.some(capability => !receivedOwner.has(capability))) {
    throw new Error('HTTP_API_INVALID_ROLE_PERMISSIONS_OWNER_FIXED');
  }
  return normalizeBoardRolePermissionMatrix(partial);
}

function boardPath(workspaceRef: string, boardRef: string, suffix: string): string {
  return `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/boards/${ref(boardRef, 'BOARD_REF')}/${suffix}`;
}

export function createHttpDomainReadAdapter(client: HttpApiClient): ProjedDomainReadAdapter {
  return {
    async listWorkspaces(signal) {
      const response = await client.request<unknown>('/api/v1/workspaces', { signal });
      return items(response, 'WORKSPACES').map(parseHttpWorkspace);
    },
    async listWorkspaceMembers(workspaceRef, signal) {
      const response = await client.request<unknown>(`/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/members`, { signal });
      return items(response, 'WORKSPACE_MEMBERS').map(workspaceMember);
    },
    async listTags(workspaceRef, signal) {
      const response = await client.request<unknown>(`/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/tags`, { signal });
      return items(response, 'TAGS').map(parseHttpTag);
    },
    async listBoardMembers(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'members'), { signal });
      return items(response, 'BOARD_MEMBERS').map(parseHttpBoardMember);
    },
    async getBoardRolePermissions(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'role-permissions'), { signal });
      return parseHttpRolePermissions(response);
    },
    async listTasks(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'tasks'), { signal });
      return items(response, 'TASKS').map(parseHttpTask);
    },
    async listDependencies(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'dependencies'), { signal });
      return items(response, 'DEPENDENCIES').map(parseHttpDependency);
    },
  };
}
