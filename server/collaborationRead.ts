import type { ActorQueryPort } from './actorTransaction.js';
import type { CollaborationRole } from './domainRead.js';
import { resolveBoard } from './domainRead.js';
import { KernelError } from './errors.js';

export interface DomainBoardInvite {
  id: string;
  workspaceId: string;
  boardId: string;
  email: string;
  invitedBy?: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  defaultRole: CollaborationRole;
  expiresAt: number;
  acceptedAt?: number;
  revokedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DomainResourceRevision {
  workspaceId: string;
  boardId?: string;
  revision: string;
  updatedAt: number;
}

function timestamp(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Domain timestamp is invalid', 503);
  }
  return parsed;
}

function invite(row: {
  id: string; legacy_workspace_id: string; legacy_board_id: string; email: string;
  invited_by: string | null; status: DomainBoardInvite['status']; default_role: CollaborationRole;
  expires_at_ms: string; accepted_at_ms: string | null; revoked_at_ms: string | null;
  created_at_ms: string; updated_at_ms: string;
}): DomainBoardInvite {
  const acceptedAt = timestamp(row.accepted_at_ms);
  const revokedAt = timestamp(row.revoked_at_ms);
  return {
    id: row.id,
    workspaceId: row.legacy_workspace_id,
    boardId: row.legacy_board_id,
    email: row.email,
    ...(row.invited_by ? { invitedBy: row.invited_by } : {}),
    status: row.status,
    defaultRole: row.default_role,
    expiresAt: timestamp(row.expires_at_ms)!,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
    createdAt: timestamp(row.created_at_ms)!,
    updatedAt: timestamp(row.updated_at_ms)!,
  };
}

export class CollaborationReadRepository {
  async listPendingInvites(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
  ): Promise<DomainBoardInvite[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'manage-members');
    const result = await port.query<{
      id: string; legacy_workspace_id: string; legacy_board_id: string; email: string;
      invited_by: string | null; status: DomainBoardInvite['status']; default_role: CollaborationRole;
      expires_at_ms: string; accepted_at_ms: string | null; revoked_at_ms: string | null;
      created_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT invite.id::text AS id, invite.legacy_workspace_id, invite.legacy_board_id,
             invite.email, invite.invited_by::text AS invited_by, invite.status, invite.default_role,
             floor(extract(epoch FROM invite.expires_at) * 1000)::bigint::text AS expires_at_ms,
             CASE WHEN invite.accepted_at IS NULL THEN NULL
               ELSE floor(extract(epoch FROM invite.accepted_at) * 1000)::bigint::text END AS accepted_at_ms,
             CASE WHEN invite.revoked_at IS NULL THEN NULL
               ELSE floor(extract(epoch FROM invite.revoked_at) * 1000)::bigint::text END AS revoked_at_ms,
             floor(extract(epoch FROM invite.created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM invite.updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.board_invites invite
       WHERE invite.tenant_id = $1::uuid AND invite.project_id = $2::uuid AND invite.status = 'pending'
       ORDER BY invite.created_at DESC, invite.id
    `, [board.tenantId, board.id]);
    return result.rows.map(invite);
  }

  async listResourceRevisions(port: ActorQueryPort): Promise<DomainResourceRevision[]> {
    const result = await port.query<{
      legacy_workspace_id: string; legacy_board_id: string | null;
      revision: string; updated_at_ms: string;
    }>(`
      SELECT tenant.legacy_workspace_id, project.legacy_board_id,
             revision.revision::text AS revision,
             floor(extract(epoch FROM revision.updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.resource_revisions revision
        JOIN projed_core.tenants tenant ON tenant.id = revision.tenant_id
        LEFT JOIN projed_core.projects project
          ON project.tenant_id = revision.tenant_id AND project.id = revision.project_id
       ORDER BY tenant.legacy_workspace_id, project.legacy_board_id NULLS FIRST
    `);
    return result.rows.map(row => ({
      workspaceId: row.legacy_workspace_id,
      ...(row.legacy_board_id === null ? {} : { boardId: row.legacy_board_id }),
      revision: row.revision,
      updatedAt: timestamp(row.updated_at_ms)!,
    }));
  }
}
