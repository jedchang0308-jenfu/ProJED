import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import {
  CollaborationWriteRepository,
  type BoardCreateInput,
  type BoardInviteCreate,
  type BoardUpdateInput,
  type WorkspaceCreateInput,
  type WorkspaceUpdateInput,
} from './collaborationWrite.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { CollaborationRole } from './domainRead.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';

export interface CollaborationWriteHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type Operation =
  | { kind: 'workspace-create' }
  | { kind: 'workspace-update' | 'workspace-delete' | 'board-create'; workspaceRef: string }
  | { kind: 'board-update' | 'board-delete' | 'permissions-update' | 'invite-create'; workspaceRef: string; boardRef: string }
  | { kind: 'member-upsert' | 'member-delete'; workspaceRef: string; boardRef: string; itemRef: string }
  | { kind: 'invite-revoke'; workspaceRef: string; boardRef: string; itemRef: string }
  | { kind: 'invite-accept' };

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function segment(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return decoded.length > 0 && decoded.length <= 512 && decoded !== '.' && decoded !== '..'
    && !decoded.includes('/') && !decoded.includes('\\') && !hasControlCharacter(decoded)
    ? decoded
    : null;
}

function operationFor(rawUrl: string | undefined, method: string | undefined): Operation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  if (rawUrl === '/api/v1/workspaces' && method === 'POST') return { kind: 'workspace-create' };
  if (rawUrl === '/api/v1/invites:accept' && method === 'POST') return { kind: 'invite-accept' };
  const parts = rawUrl.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces') return null;
  const workspaceRef = segment(parts[4] ?? '');
  if (!workspaceRef) return null;
  if (parts.length === 5) {
    if (method === 'PATCH') return { kind: 'workspace-update', workspaceRef };
    if (method === 'DELETE') return { kind: 'workspace-delete', workspaceRef };
    return null;
  }
  if (parts.length === 6 && parts[5] === 'boards' && method === 'POST') return { kind: 'board-create', workspaceRef };
  if (parts.length < 7 || parts[5] !== 'boards') return null;
  const boardRef = segment(parts[6] ?? '');
  if (!boardRef) return null;
  if (parts.length === 7) {
    if (method === 'PATCH') return { kind: 'board-update', workspaceRef, boardRef };
    if (method === 'DELETE') return { kind: 'board-delete', workspaceRef, boardRef };
    return null;
  }
  if (parts.length === 8 && parts[7] === 'role-permissions' && method === 'PUT') {
    return { kind: 'permissions-update', workspaceRef, boardRef };
  }
  if (parts.length === 8 && parts[7] === 'invites' && method === 'POST') {
    return { kind: 'invite-create', workspaceRef, boardRef };
  }
  const itemRef = segment(parts[8] ?? '');
  if (!itemRef || parts.length !== 9) return null;
  if (parts[7] === 'members') {
    if (method === 'PUT') return { kind: 'member-upsert', workspaceRef, boardRef, itemRef };
    if (method === 'DELETE') return { kind: 'member-delete', workspaceRef, boardRef, itemRef };
  }
  if (parts[7] === 'invites' && method === 'DELETE') {
    return { kind: 'invite-revoke', workspaceRef, boardRef, itemRef };
  }
  return null;
}

function isCollaborationShape(rawUrl: string | undefined): boolean {
  if (rawUrl === '/api/v1/workspaces' || rawUrl === '/api/v1/invites:accept') return true;
  if (!rawUrl || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) return false;
  const parts = rawUrl.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces'
      || !segment(parts[4] ?? '')) return false;
  if (parts.length === 5) return true;
  if (parts[5] !== 'boards') return false;
  if (parts.length === 6) return true;
  if (!segment(parts[6] ?? '')) return false;
  if (parts.length === 7) return true;
  if (!['members', 'role-permissions', 'invites'].includes(parts[7] ?? '')) return false;
  return parts.length === 8 || (parts.length === 9 && Boolean(segment(parts[8] ?? '')));
}

function errorResult(error: unknown, requestId: string): CollaborationWriteHttpResult {
  const kernelError = asKernelError(error);
  return {
    matched: true,
    status: kernelError.httpStatus,
    body: { error: {
      code: kernelError.code,
      requestId,
      retryable: kernelError.httpStatus === 429 || kernelError.httpStatus >= 500,
    } },
  };
}

export function createCollaborationWriteHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new CollaborationWriteRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<CollaborationWriteHttpResult> => {
    if (request.method === 'GET' || request.method === 'HEAD') return { matched: false };
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      return isCollaborationShape(request.url)
        ? { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } }
        : { matched: false };
    }
    if (!resolveActor) {
      request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (!isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      const body = request.method === 'DELETE' ? {} : await readJsonBody(request);
      const data = await runActorTransaction(database, config, actor, async (port) => {
        switch (operation.kind) {
          case 'workspace-create': return repository.createWorkspace(port, body as WorkspaceCreateInput);
          case 'workspace-update': return repository.updateWorkspace(port, operation.workspaceRef, body as WorkspaceUpdateInput);
          case 'workspace-delete': return repository.deleteWorkspace(port, operation.workspaceRef);
          case 'board-create': return repository.createBoard(port, operation.workspaceRef, body as BoardCreateInput);
          case 'board-update': return repository.updateBoard(port, operation.workspaceRef, operation.boardRef, body as BoardUpdateInput);
          case 'board-delete': return repository.deleteBoard(port, operation.workspaceRef, operation.boardRef);
          case 'member-upsert': {
            if (typeof body.role !== 'string') throw new KernelError('DOMAIN_DATA_INVALID', 'role is required', 400);
            return repository.upsertBoardMember(
              port, operation.workspaceRef, operation.boardRef, operation.itemRef, body.role as CollaborationRole,
            );
          }
          case 'member-delete': return repository.removeBoardMember(
            port, operation.workspaceRef, operation.boardRef, operation.itemRef,
          );
          case 'permissions-update': {
            if (!Object.prototype.hasOwnProperty.call(body, 'permissions')) {
              throw new KernelError('DOMAIN_DATA_INVALID', 'permissions are required', 400);
            }
            return repository.updateRolePermissions(port, operation.workspaceRef, operation.boardRef, body.permissions);
          }
          case 'invite-create': return repository.createInvite(
            port, operation.workspaceRef, operation.boardRef, body as unknown as BoardInviteCreate,
          );
          case 'invite-revoke': return repository.revokeInvite(
            port, operation.workspaceRef, operation.boardRef, operation.itemRef,
          );
          case 'invite-accept': return repository.acceptInvite(port, body.token);
        }
      });
      const created = operation.kind === 'workspace-create' || operation.kind === 'board-create' || operation.kind === 'invite-create';
      return { matched: true, status: created ? 201 : 200, body: { data: data ?? null } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
