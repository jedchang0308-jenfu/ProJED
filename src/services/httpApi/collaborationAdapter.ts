import type {
  Board,
  BoardInvite,
  BoardInviteAcceptInput,
  BoardInviteCreateInput,
  BoardMember,
  BoardRolePermissionMatrix,
  CollaborationRole,
  Workspace,
} from '../../types';
import {
  parseHttpBoard,
  parseHttpBoardMember,
  parseHttpRolePermissions,
  parseHttpWorkspace,
} from './domainReadAdapter';
import { HttpApiClient } from './httpApiClient';

export interface ResourceRevision {
  workspaceId: string;
  boardId?: string;
  revision: string;
  updatedAt: number;
}

export interface ProjedCollaborationAdapter {
  createWorkspace(title?: string, signal?: AbortSignal): Promise<Workspace>;
  updateWorkspace(workspaceRef: string, updates: Pick<Partial<Workspace>, 'title' | 'order'>, signal?: AbortSignal): Promise<Workspace>;
  deleteWorkspace(workspaceRef: string, signal?: AbortSignal): Promise<void>;
  createBoard(workspaceRef: string, title?: string, signal?: AbortSignal): Promise<Board>;
  updateBoard(workspaceRef: string, boardRef: string, updates: Pick<Partial<Board>, 'title' | 'order'>, signal?: AbortSignal): Promise<Board>;
  deleteBoard(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<void>;
  upsertBoardMember(
    workspaceRef: string,
    boardRef: string,
    userId: string,
    role: CollaborationRole,
    signal?: AbortSignal,
  ): Promise<BoardMember>;
  removeBoardMember(workspaceRef: string, boardRef: string, userId: string, signal?: AbortSignal): Promise<void>;
  updateRolePermissions(
    workspaceRef: string,
    boardRef: string,
    permissions: BoardRolePermissionMatrix,
    signal?: AbortSignal,
  ): Promise<BoardRolePermissionMatrix>;
  listPendingInvites(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<BoardInvite[]>;
  createInvite(
    workspaceRef: string,
    boardRef: string,
    input: BoardInviteCreateInput,
    signal?: AbortSignal,
  ): Promise<BoardInvite>;
  revokeInvite(workspaceRef: string, boardRef: string, inviteId: string, signal?: AbortSignal): Promise<void>;
  acceptInvite(input: BoardInviteAcceptInput, signal?: AbortSignal): Promise<BoardInvite>;
  listResourceRevisions(signal?: AbortSignal): Promise<ResourceRevision[]>;
}

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function data(value: unknown, label: string): unknown {
  const envelope = record(value, `${label}_ENVELOPE`);
  if (!hasOwn(envelope, 'data')) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return envelope.data;
}

function items(value: unknown, label: string): unknown[] {
  const parsed = data(value, label);
  if (!Array.isArray(parsed)) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return parsed;
}

function ref(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) throw new Error(`HTTP_API_INVALID_${label}`);
  return encodeURIComponent(value);
}

function boardPath(workspaceRef: string, boardRef: string, suffix = ''): string {
  const base = `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/boards/${ref(boardRef, 'BOARD_REF')}`;
  return suffix ? `${base}/${suffix}` : base;
}

function parseInvite(value: unknown): BoardInvite {
  const row = record(value, 'INVITE');
  if (typeof row.status !== 'string' || !['pending', 'accepted', 'revoked', 'expired'].includes(row.status)) {
    throw new Error('HTTP_API_INVALID_INVITE_STATUS');
  }
  if (typeof row.defaultRole !== 'string' || !['admin', 'project_manager', 'member', 'viewer'].includes(row.defaultRole)) {
    throw new Error('HTTP_API_INVALID_INVITE_ROLE');
  }
  for (const field of ['id', 'workspaceId', 'boardId', 'email'] as const) {
    if (typeof row[field] !== 'string' || row[field] === '') throw new Error(`HTTP_API_INVALID_INVITE_${field.toUpperCase()}`);
  }
  for (const field of ['expiresAt', 'createdAt', 'updatedAt'] as const) {
    if (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0) throw new Error(`HTTP_API_INVALID_INVITE_${field.toUpperCase()}`);
  }
  for (const field of ['acceptedAt', 'revokedAt'] as const) {
    if (row[field] !== undefined && (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0)) {
      throw new Error(`HTTP_API_INVALID_INVITE_${field.toUpperCase()}`);
    }
  }
  return row as unknown as BoardInvite;
}

function parseRevision(value: unknown): ResourceRevision {
  const row = record(value, 'REVISION');
  if (typeof row.workspaceId !== 'string' || row.workspaceId === ''
      || (row.boardId !== undefined && (typeof row.boardId !== 'string' || row.boardId === ''))
      || typeof row.revision !== 'string' || !/^[1-9][0-9]{0,18}$/.test(row.revision)
      || !Number.isSafeInteger(row.updatedAt) || Number(row.updatedAt) < 0) {
    throw new Error('HTTP_API_INVALID_REVISION');
  }
  return row as unknown as ResourceRevision;
}

function sparseUpdate(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => hasOwn(value, field)).map(field => [field, value[field]]));
}

export function createHttpCollaborationAdapter(client: HttpApiClient): ProjedCollaborationAdapter {
  return {
    async createWorkspace(title, signal) {
      const response = await client.request<unknown>('/api/v1/workspaces', {
        method: 'POST', body: title === undefined ? {} : { title }, signal,
      });
      return parseHttpWorkspace(data(response, 'WORKSPACE_CREATE'));
    },
    async updateWorkspace(workspaceRef, updates, signal) {
      const response = await client.request<unknown>(`/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}`, {
        method: 'PATCH', body: sparseUpdate(updates as Record<string, unknown>, ['title', 'order']), signal,
      });
      return parseHttpWorkspace(data(response, 'WORKSPACE_UPDATE'));
    },
    async deleteWorkspace(workspaceRef, signal) {
      await client.request<unknown>(`/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}`, { method: 'DELETE', signal });
    },
    async createBoard(workspaceRef, title, signal) {
      const response = await client.request<unknown>(`/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/boards`, {
        method: 'POST', body: title === undefined ? {} : { title }, signal,
      });
      return parseHttpBoard(data(response, 'BOARD_CREATE'));
    },
    async updateBoard(workspaceRef, boardRef, updates, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef), {
        method: 'PATCH', body: sparseUpdate(updates as Record<string, unknown>, ['title', 'order']), signal,
      });
      return parseHttpBoard(data(response, 'BOARD_UPDATE'));
    },
    async deleteBoard(workspaceRef, boardRef, signal) {
      await client.request<unknown>(boardPath(workspaceRef, boardRef), { method: 'DELETE', signal });
    },
    async upsertBoardMember(workspaceRef, boardRef, userId, role, signal) {
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `members/${ref(userId, 'USER_ID')}`,
      ), { method: 'PUT', body: { role }, signal });
      return parseHttpBoardMember(data(response, 'MEMBER_UPSERT'));
    },
    async removeBoardMember(workspaceRef, boardRef, userId, signal) {
      await client.request<unknown>(boardPath(workspaceRef, boardRef, `members/${ref(userId, 'USER_ID')}`), {
        method: 'DELETE', signal,
      });
    },
    async updateRolePermissions(workspaceRef, boardRef, permissions, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'role-permissions'), {
        method: 'PUT', body: { permissions }, signal,
      });
      return parseHttpRolePermissions(response);
    },
    async listPendingInvites(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'invites'), { signal });
      return items(response, 'INVITES').map(parseInvite);
    },
    async createInvite(workspaceRef, boardRef, input, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'invites'), {
        method: 'POST', body: input, signal,
      });
      return parseInvite(data(response, 'INVITE_CREATE'));
    },
    async revokeInvite(workspaceRef, boardRef, inviteId, signal) {
      await client.request<unknown>(boardPath(workspaceRef, boardRef, `invites/${ref(inviteId, 'INVITE_ID')}`), {
        method: 'DELETE', signal,
      });
    },
    async acceptInvite(input, signal) {
      const response = await client.request<unknown>('/api/v1/invites:accept', {
        method: 'POST', body: { token: input.token }, signal,
      });
      return parseInvite(data(response, 'INVITE_ACCEPT'));
    },
    async listResourceRevisions(signal) {
      const response = await client.request<unknown>('/api/v1/scope-revisions', { signal });
      return items(response, 'REVISIONS').map(parseRevision);
    },
  };
}
