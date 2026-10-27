import type { IncomingMessage } from 'node:http';

import { runActorTransaction, type ServerActorV1 } from './actorTransaction.js';
import { CollaborationReadRepository } from './collaborationRead.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import { DomainReadRepository } from './domainRead.js';
import { asKernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';

export type TrustedSessionActorResolver = (request: IncomingMessage) => Promise<ServerActorV1>;

export interface DomainReadHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type DomainReadOperation =
  | { readonly kind: 'workspaces' }
  | { readonly kind: 'scope-revisions' }
  | { readonly kind: 'workspace-members'; readonly workspaceRef: string }
  | { readonly kind: 'tags'; readonly workspaceRef: string }
  | { readonly kind: 'board-members'; readonly workspaceRef: string; readonly boardRef: string }
  | { readonly kind: 'role-permissions'; readonly workspaceRef: string; readonly boardRef: string }
  | { readonly kind: 'tasks'; readonly workspaceRef: string; readonly boardRef: string }
  | { readonly kind: 'dependencies'; readonly workspaceRef: string; readonly boardRef: string }
  | { readonly kind: 'invites'; readonly workspaceRef: string; readonly boardRef: string };

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function segment(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return decoded.length > 0 && decoded.length <= 512 && decoded !== '.' && decoded !== '..'
    && !decoded.includes('\\') && !hasControlCharacter(decoded)
    ? decoded
    : null;
}

function operationFor(rawUrl: string | undefined): DomainReadOperation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) {
    return null;
  }
  if (rawUrl === '/api/v1/workspaces') return { kind: 'workspaces' };
  if (rawUrl === '/api/v1/scope-revisions') return { kind: 'scope-revisions' };
  const parts = rawUrl.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces') return null;
  const workspaceRef = segment(parts[4] ?? '');
  if (!workspaceRef) return null;
  if (parts.length === 6 && parts[5] === 'members') return { kind: 'workspace-members', workspaceRef };
  if (parts.length === 6 && parts[5] === 'tags') return { kind: 'tags', workspaceRef };
  if (parts.length !== 8 || parts[5] !== 'boards') return null;
  const boardRef = segment(parts[6] ?? '');
  if (!boardRef) return null;
  switch (parts[7]) {
    case 'members': return { kind: 'board-members', workspaceRef, boardRef };
    case 'role-permissions': return { kind: 'role-permissions', workspaceRef, boardRef };
    case 'tasks': return { kind: 'tasks', workspaceRef, boardRef };
    case 'dependencies': return { kind: 'dependencies', workspaceRef, boardRef };
    case 'invites': return { kind: 'invites', workspaceRef, boardRef };
    default: return null;
  }
}

function errorResult(error: unknown, requestId: string): DomainReadHttpResult {
  const kernelError = asKernelError(error);
  return {
    matched: true,
    status: kernelError.httpStatus,
    body: {
      error: {
        code: kernelError.code,
        requestId,
        retryable: kernelError.httpStatus === 429 || kernelError.httpStatus >= 500,
      },
    },
  };
}

export function createDomainReadHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new DomainReadRepository(),
  collaborationRepository = new CollaborationReadRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<DomainReadHttpResult> => {
    const operation = operationFor(request.url);
    if (!operation) return { matched: false };
    if (request.method !== 'GET') {
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
    }
    if (!resolveActor) {
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      assertExpectedActor(request, actor);
      const data = await runActorTransaction(database, config, actor, async (port) => {
        switch (operation.kind) {
          case 'workspaces': return repository.listWorkspaces(port);
          case 'scope-revisions': return collaborationRepository.listResourceRevisions(port);
          case 'workspace-members': return repository.listWorkspaceMembers(port, operation.workspaceRef);
          case 'tags': return repository.listTags(port, operation.workspaceRef);
          case 'board-members': return repository.listBoardMembers(port, operation.workspaceRef, operation.boardRef);
          case 'role-permissions': return repository.getBoardRolePermissions(port, operation.workspaceRef, operation.boardRef);
          case 'tasks': return repository.listTasks(port, operation.workspaceRef, operation.boardRef);
          case 'dependencies': return repository.listDependencies(port, operation.workspaceRef, operation.boardRef);
          case 'invites': return collaborationRepository.listPendingInvites(port, operation.workspaceRef, operation.boardRef);
        }
      });
      return { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}

export function isPrivateApiRequest(rawUrl: string | undefined): boolean {
  return rawUrl === '/api' || rawUrl?.startsWith('/api/') === true;
}
