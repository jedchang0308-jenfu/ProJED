import { createHash, randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import type { DomainBoardInvite } from './collaborationRead.js';
import {
  COLLABORATION_ROLES,
  DomainReadRepository,
  PERMISSION_CAPABILITIES,
  type CollaborationRole,
  type DomainBoardMember,
  type DomainRolePermissionMatrix,
  type DomainWorkspace,
  resolveBoard,
  resolveWorkspace,
} from './domainRead.js';
import { KernelError } from './errors.js';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<string>(COLLABORATION_ROLES);
const INVITE_ROLES = new Set<CollaborationRole>(['admin', 'project_manager', 'member', 'viewer']);
const CAPABILITIES = new Set<string>(PERMISSION_CAPABILITIES);
const MAX_INVITE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_PERMISSIONS: DomainRolePermissionMatrix = {
  owner: [...PERMISSION_CAPABILITIES],
  admin: [...PERMISSION_CAPABILITIES],
  project_manager: [
    'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
    'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
    'create_dependency', 'delete_dependency', 'read_activity', 'write_activity',
  ],
  member: [
    'read_board', 'create_task', 'edit_task', 'move_task', 'delete_task',
    'manage_task_reference', 'assign_task', 'create_dependency', 'read_activity', 'write_activity',
  ],
  viewer: ['read_board', 'read_activity'],
};

export interface WorkspaceCreateInput { title?: string }
export interface WorkspaceUpdateInput { title?: string; order?: number | null }
export interface BoardCreateInput { title?: string }
export interface BoardUpdateInput { title?: string; order?: number | null }
export interface BoardTransferInput { targetWorkspaceId: string; expectedBoardTitle: string }
export interface BoardTransferPreview {
  blocked: boolean;
  reasons: string[];
  sourceWorkspaceId: string;
  sourceWorkspaceTitle: string | null;
  targetWorkspaceId: string;
  targetWorkspaceTitle: string | null;
  boardId: string;
  boardTitle: string;
  transferLocked: false;
  counts: {
    targetActiveMembers: number;
    preservedMembers: number;
    removedMembers: number;
    tasks: number;
    dependencies: number;
    tagsToMap: number;
    documents: 0;
    records: number;
    pendingInvitesToRevoke: number;
    ragDocumentsToResync: 0;
    revokedInvites?: number;
    remappedTags?: number;
    ragJobsCreated?: 0;
  };
}
export interface BoardInviteCreate {
  email: string;
  tokenHash: string;
  expiresAt: number;
  defaultRole?: CollaborationRole;
}
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function invalid(message: string, status = 400): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, status);
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Resource is unavailable', 404);
}

function title(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 500) invalid(`${label} is invalid`);
  return value;
}

function finiteOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${label} is invalid`);
  return value;
}

function role(value: unknown, invite = false): CollaborationRole {
  if (typeof value !== 'string' || !ROLES.has(value) || (invite && !INVITE_ROLES.has(value as CollaborationRole))) {
    invalid('role is invalid');
  }
  return value as CollaborationRole;
}

function email(value: unknown): string {
  if (typeof value !== 'string') invalid('email is invalid');
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 320 || !EMAIL_RE.test(normalized)) invalid('email is invalid');
  return normalized;
}

function milliseconds(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new KernelError('DOMAIN_DATA_INVALID', 'Timestamp is invalid', 503);
  return parsed;
}

function mapInvite(row: {
  id: string; legacy_workspace_id: string; legacy_board_id: string; email: string;
  invited_by: string | null; status: DomainBoardInvite['status']; default_role: CollaborationRole;
  expires_at_ms: string; accepted_at_ms: string | null; revoked_at_ms: string | null;
  created_at_ms: string; updated_at_ms: string;
}): DomainBoardInvite {
  const acceptedAt = milliseconds(row.accepted_at_ms);
  const revokedAt = milliseconds(row.revoked_at_ms);
  return {
    id: row.id,
    workspaceId: row.legacy_workspace_id,
    boardId: row.legacy_board_id,
    email: row.email,
    ...(row.invited_by ? { invitedBy: row.invited_by } : {}),
    status: row.status,
    defaultRole: row.default_role,
    expiresAt: milliseconds(row.expires_at_ms)!,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
    createdAt: milliseconds(row.created_at_ms)!,
    updatedAt: milliseconds(row.updated_at_ms)!,
  };
}

async function currentProfile(port: ActorQueryPort): Promise<{ id: string; email: string | null; displayName: string | null }> {
  const result = await port.query<{ id: string; email: string | null; display_name: string | null }>(`
    SELECT id::text AS id, email, display_name
      FROM projed_core.profiles
     WHERE id = projed_core.current_actor_user_id_v1()
  `);
  if (result.rows.length !== 1) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
  return {
    id: result.rows[0]!.id,
    email: result.rows[0]!.email,
    displayName: result.rows[0]!.display_name,
  };
}

async function assertWorkspaceCapability(port: ActorQueryPort, tenantId: string, capability: string): Promise<void> {
  const result = await port.query<{ allowed: boolean }>(`
    SELECT projed_core.actor_has_workspace_capability_v1($1::uuid, $2::text) AS allowed
  `, [tenantId, capability]);
  if (result.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
}

async function bumpRevision(port: ActorQueryPort, tenantId: string, projectId: string | null): Promise<void> {
  const result = await port.query(`
    UPDATE projed_core.resource_revisions
       SET revision = revision + 1, updated_at = now()
     WHERE tenant_id = $1::uuid AND project_id IS NOT DISTINCT FROM $2::uuid
       AND revision < 9223372036854775807
  `, [tenantId, projectId]);
  if (result.rowCount !== 1) throw new KernelError('DB_BOUNDARY_INVALID', 'Resource revision is unavailable', 503);
}

function validateMatrix(value: unknown): DomainRolePermissionMatrix {
  if (!isRecord(value) || Object.keys(value).length !== COLLABORATION_ROLES.length
      || Object.keys(value).some(key => !ROLES.has(key))) invalid('role permission matrix is invalid');
  const result = {} as DomainRolePermissionMatrix;
  for (const collaborationRole of COLLABORATION_ROLES) {
    const configured = value[collaborationRole];
    if (!Array.isArray(configured) || configured.some(item => typeof item !== 'string' || !CAPABILITIES.has(item))) {
      invalid('role permission matrix is invalid');
    }
    result[collaborationRole] = [...new Set(configured as string[])];
  }
  const owner = new Set(result.owner);
  if (owner.size !== PERMISSION_CAPABILITIES.length || PERMISSION_CAPABILITIES.some(item => !owner.has(item))) {
    invalid('owner permissions are fixed');
  }
  return result;
}

export class CollaborationWriteRepository {
  constructor(private readonly readRepository = new DomainReadRepository()) {}

  async createWorkspace(port: ActorQueryPort, input: WorkspaceCreateInput): Promise<DomainWorkspace> {
    if (!isRecord(input) || Object.keys(input).some(key => key !== 'title')) invalid('workspace input is invalid');
    const profile = await currentProfile(port);
    const id = randomUUID();
    const workspaceTitle = input.title === undefined ? '未命名工作區' : title(input.title, 'workspace title');
    await port.query(`
      INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id)
      VALUES ($1::uuid, $1, $2, $3::uuid)
    `, [id, workspaceTitle, profile.id]);
    await port.authorizeWorkspaceBootstrap(id);
    await port.query(`
      INSERT INTO projed_core.tenant_members(
        tenant_id, user_id, role, status, member_email, member_display_name
      ) VALUES ($1::uuid, $2::uuid, 'owner', 'active', $3, $4)
    `, [id, profile.id, profile.email, profile.displayName]);
    await port.query(`
      INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision)
      VALUES ($1::uuid, $2::uuid, NULL, true, 1)
    `, [profile.id, id]);
    await port.query(`
      INSERT INTO projed_core.resource_revisions(tenant_id, project_id) VALUES ($1::uuid, NULL)
    `, [id]);
    const created = (await this.readRepository.listWorkspaces(port)).find(workspace => workspace.id === id);
    if (!created) notFound();
    return created;
  }

  async updateWorkspace(
    port: ActorQueryPort,
    workspaceRef: string,
    updates: WorkspaceUpdateInput,
  ): Promise<DomainWorkspace> {
    if (!isRecord(updates) || Object.keys(updates).some(key => !['title', 'order'].includes(key))) {
      invalid('workspace update is invalid');
    }
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertWorkspaceCapability(port, workspace.id, 'manage_workspace_settings');
    const columns: string[] = [];
    const values: unknown[] = [workspace.id];
    if (hasOwn(updates, 'title')) {
      values.push(title(updates.title, 'workspace title'));
      columns.push(`title = $${values.length}`);
    }
    if (hasOwn(updates, 'order')) {
      values.push(finiteOrNull(updates.order, 'workspace order'));
      columns.push(`sort_order = $${values.length}`);
    }
    if (columns.length) {
      columns.push('updated_at = now()');
      await port.query(`UPDATE projed_core.tenants SET ${columns.join(', ')} WHERE id = $1::uuid`, values);
      await bumpRevision(port, workspace.id, null);
    }
    const result = (await this.readRepository.listWorkspaces(port)).find(item => item.id === workspace.legacyWorkspaceId);
    if (!result) notFound();
    return result;
  }

  async deleteWorkspace(port: ActorQueryPort, workspaceRef: string): Promise<void> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertWorkspaceCapability(port, workspace.id, 'delete_workspace');
    const result = await port.query('DELETE FROM projed_core.tenants WHERE id = $1::uuid', [workspace.id]);
    if (result.rowCount !== 1) notFound();
  }

  async createBoard(
    port: ActorQueryPort,
    workspaceRef: string,
    input: BoardCreateInput,
  ): Promise<DomainWorkspace['boards'][number]> {
    if (!isRecord(input) || Object.keys(input).some(key => key !== 'title')) invalid('board input is invalid');
    const workspace = await resolveWorkspace(port, workspaceRef);
    await assertWorkspaceCapability(port, workspace.id, 'create_board');
    const profile = await currentProfile(port);
    const membership = await port.query<{ role: CollaborationRole }>(`
      SELECT role FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
    `, [workspace.id, profile.id]);
    if (membership.rows.length !== 1) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    const id = randomUUID();
    const boardTitle = input.title === undefined ? '未命名看板' : title(input.title, 'board title');
    await port.query(`
      INSERT INTO projed_core.projects(id, tenant_id, legacy_board_id, title, sort_order, created_by)
      VALUES ($1::uuid, $2::uuid, $1, $3, $4, $5::uuid)
    `, [id, workspace.id, boardTitle, Date.now(), profile.id]);
    await port.authorizeBoardMutation(workspace.id, id, 'bootstrap');
    for (const collaborationRole of COLLABORATION_ROLES) {
      await port.query(`
        INSERT INTO projed_core.board_role_permissions(tenant_id, project_id, role, capabilities)
        VALUES ($1::uuid, $2::uuid, $3, $4::text[])
      `, [workspace.id, id, collaborationRole, DEFAULT_PERMISSIONS[collaborationRole]]);
    }
    await port.query(`
      INSERT INTO projed_core.project_members(
        tenant_id, project_id, user_id, role, member_email, member_display_name
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
    `, [workspace.id, id, profile.id, membership.rows[0]!.role, profile.email, profile.displayName]);
    await port.query(`
      INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, 1)
      ON CONFLICT DO NOTHING
    `, [profile.id, workspace.id, id]);
    await port.query(`
      INSERT INTO projed_core.resource_revisions(tenant_id, project_id) VALUES ($1::uuid, $2::uuid)
    `, [workspace.id, id]);
    await bumpRevision(port, workspace.id, null);
    const result = (await this.readRepository.listWorkspaces(port))
      .find(item => item.id === workspace.legacyWorkspaceId)?.boards.find(board => board.id === id);
    if (!result) notFound();
    return result;
  }

  async updateBoard(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    updates: BoardUpdateInput,
  ): Promise<DomainWorkspace['boards'][number]> {
    if (!isRecord(updates) || Object.keys(updates).some(key => !['title', 'order'].includes(key))) {
      invalid('board update is invalid');
    }
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const columns: string[] = [];
    const values: unknown[] = [board.tenantId, board.id];
    if (hasOwn(updates, 'title')) {
      values.push(title(updates.title, 'board title'));
      columns.push(`title = $${values.length}`);
    }
    if (hasOwn(updates, 'order')) {
      values.push(finiteOrNull(updates.order, 'board order'));
      columns.push(`sort_order = $${values.length}`);
    }
    if (columns.length) {
      columns.push('updated_at = now()');
      const result = await port.query(`
        UPDATE projed_core.projects SET ${columns.join(', ')}
         WHERE tenant_id = $1::uuid AND id = $2::uuid
      `, values);
      if (result.rowCount !== 1) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
      await bumpRevision(port, board.tenantId, board.id);
    }
    const result = (await this.readRepository.listWorkspaces(port))
      .find(item => item.id === board.legacyWorkspaceId)?.boards.find(item => item.id === board.legacyBoardId);
    if (!result) notFound();
    return result;
  }

  async deleteBoard(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<void> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'edit-settings');
    const result = await port.query(`
      DELETE FROM projed_core.projects WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [board.tenantId, board.id]);
    if (result.rowCount !== 1) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    await bumpRevision(port, board.tenantId, null);
  }

  async upsertBoardMember(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    userId: string,
    requestedRole: CollaborationRole,
  ): Promise<DomainBoardMember> {
    if (!UUID_RE.test(userId)) invalid('userId is invalid');
    const normalizedRole = role(requestedRole);
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'manage-members');
    const target = await port.query<{
      user_id: string; status: string; member_email: string | null; member_display_name: string | null;
    }>(`
      SELECT user_id::text AS user_id, status, member_email, member_display_name
        FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
    `, [board.tenantId, userId]);
    if (target.rows.length !== 1) notFound();
    const existing = await port.query<{ role: CollaborationRole }>(`
      SELECT role FROM projed_core.project_members
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND user_id = $3::uuid
    `, [board.tenantId, board.id, userId]);
    if (existing.rows[0]?.role === 'owner' && normalizedRole !== 'owner') {
      throw new KernelError('ACCESS_DENIED', 'Board owner cannot be demoted', 403);
    }
    if (existing.rows.length) {
      await port.query(`
        UPDATE projed_core.project_members
           SET role = $4, member_email = $5, member_display_name = $6, updated_at = now()
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND user_id = $3::uuid
      `, [board.tenantId, board.id, userId, normalizedRole, target.rows[0]!.member_email, target.rows[0]!.member_display_name]);
    } else {
      await port.query(`
        INSERT INTO projed_core.project_members(
          tenant_id, project_id, user_id, role, member_email, member_display_name
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
      `, [board.tenantId, board.id, userId, normalizedRole, target.rows[0]!.member_email, target.rows[0]!.member_display_name]);
    }
    await port.query(`
      INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, 1)
      ON CONFLICT (local_user_id, tenant_id, project_id) DO UPDATE
        SET active = true,
            scope_revision = projed_core.actor_scope_access.scope_revision + 1,
            updated_at = now()
    `, [userId, board.tenantId, board.id]);
    await bumpRevision(port, board.tenantId, board.id);
    const member = (await this.readRepository.listBoardMembers(port, workspaceRef, boardRef))
      .find(item => item.userId === userId);
    if (!member) notFound();
    return member;
  }

  async removeBoardMember(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    userId: string,
  ): Promise<void> {
    if (!UUID_RE.test(userId)) invalid('userId is invalid');
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'manage-members');
    const existing = await port.query<{ role: CollaborationRole; self: boolean }>(`
      SELECT role, user_id = projed_core.current_actor_user_id_v1() AS self
        FROM projed_core.project_members
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND user_id = $3::uuid
    `, [board.tenantId, board.id, userId]);
    if (existing.rows.length !== 1) notFound();
    if (existing.rows[0]!.role === 'owner' || existing.rows[0]!.self) {
      throw new KernelError('ACCESS_DENIED', 'Board owner or current actor cannot be removed', 403);
    }
    const result = await port.query(`
      DELETE FROM projed_core.project_members
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND user_id = $3::uuid
    `, [board.tenantId, board.id, userId]);
    if (result.rowCount !== 1) notFound();
    await port.query(`
      UPDATE projed_core.actor_scope_access
         SET active = false, scope_revision = scope_revision + 1, updated_at = now()
       WHERE local_user_id = $3::uuid AND tenant_id = $1::uuid AND project_id = $2::uuid AND active
    `, [board.tenantId, board.id, userId]);
    await bumpRevision(port, board.tenantId, board.id);
  }

  async updateRolePermissions(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    value: unknown,
  ): Promise<DomainRolePermissionMatrix> {
    const permissions = validateMatrix(value);
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'configure-permissions');
    for (const collaborationRole of COLLABORATION_ROLES) {
      const result = await port.query(`
        UPDATE projed_core.board_role_permissions
           SET capabilities = $4::text[], updated_at = now()
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND role = $3
      `, [board.tenantId, board.id, collaborationRole, permissions[collaborationRole]]);
      if (result.rowCount !== 1) throw new KernelError('DB_BOUNDARY_INVALID', 'Board role permissions are incomplete', 503);
    }
    await bumpRevision(port, board.tenantId, board.id);
    return this.readRepository.getBoardRolePermissions(port, workspaceRef, boardRef);
  }

  async createInvite(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    input: BoardInviteCreate,
  ): Promise<DomainBoardInvite> {
    if (!isRecord(input) || Object.keys(input).some(key => !['email', 'tokenHash', 'expiresAt', 'defaultRole'].includes(key))) {
      invalid('invite input is invalid');
    }
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'manage-members');
    const normalizedEmail = email(input.email);
    const defaultRole = role(input.defaultRole ?? 'member', true);
    if (!HASH_RE.test(input.tokenHash)) invalid('tokenHash is invalid');
    if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= Date.now()
        || input.expiresAt > Date.now() + MAX_INVITE_AGE_MS) invalid('expiresAt is invalid');
    const existing = await port.query(`
      SELECT id FROM projed_core.board_invites
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND email = $3 AND status = 'pending'
    `, [board.tenantId, board.id, normalizedEmail]);
    if (existing.rows.length) invalid('A pending invite already exists', 409);
    const id = randomUUID();
    try {
      await port.query(`
        INSERT INTO projed_core.board_invites(
          id, tenant_id, project_id, legacy_workspace_id, legacy_board_id,
          email, invited_by, status, default_role, token_hash, expires_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, projed_core.current_actor_user_id_v1(),
          'pending', $7, $8, to_timestamp($9::double precision / 1000.0)
        )
      `, [
        id, board.tenantId, board.id, board.legacyWorkspaceId, board.legacyBoardId,
        normalizedEmail, defaultRole, input.tokenHash, input.expiresAt,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') invalid('A pending invite already exists', 409);
      throw error;
    }
    await bumpRevision(port, board.tenantId, board.id);
    return this.getInvite(port, id);
  }

  async revokeInvite(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    inviteId: string,
  ): Promise<void> {
    if (!UUID_RE.test(inviteId)) invalid('inviteId is invalid');
    const board = await resolveBoard(port, workspaceRef, boardRef);
    await port.authorizeBoardMutation(board.tenantId, board.id, 'manage-members');
    const result = await port.query(`
      UPDATE projed_core.board_invites
         SET status = 'revoked', revoked_at = now(), updated_at = now()
       WHERE id = $3::uuid AND tenant_id = $1::uuid AND project_id = $2::uuid AND status = 'pending'
    `, [board.tenantId, board.id, inviteId]);
    if (result.rowCount !== 1) notFound();
    await bumpRevision(port, board.tenantId, board.id);
  }

  async acceptInvite(port: ActorQueryPort, token: unknown): Promise<DomainBoardInvite> {
    if (typeof token !== 'string' || token.length < 16 || token.length > 512) invalid('invite token is invalid');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const profile = await currentProfile(port);
    if (!profile.email) throw new KernelError('ACCESS_DENIED', 'Verified actor email is required', 403);
    const result = await port.query<{
      id: string; tenant_id: string; project_id: string; email: string; status: DomainBoardInvite['status'];
      default_role: CollaborationRole; expires_at_ms: string;
    }>(`
      SELECT id::text AS id, tenant_id::text AS tenant_id, project_id::text AS project_id,
             email, status, default_role,
             floor(extract(epoch FROM expires_at) * 1000)::bigint::text AS expires_at_ms
        FROM projed_core.board_invites
       WHERE token_hash = $1
       FOR UPDATE
    `, [tokenHash]);
    if (result.rows.length !== 1) notFound();
    const invite = result.rows[0]!;
    if (invite.email !== profile.email.trim().toLowerCase()) throw new KernelError('ACCESS_DENIED', 'Invite email does not match actor', 403);
    if (invite.status !== 'pending') invalid('Invite is no longer pending', 409);
    if (Number(invite.expires_at_ms) <= Date.now()) invalid('Invite has expired', 409);
    await port.query(`
      INSERT INTO projed_core.tenant_members(
        tenant_id, user_id, role, status, member_email, member_display_name
      ) VALUES ($1::uuid, $2::uuid, 'member', 'active', $3, $4)
      ON CONFLICT (tenant_id, user_id) DO NOTHING
    `, [invite.tenant_id, profile.id, profile.email.trim().toLowerCase(), profile.displayName]);
    const activeAnchor = await port.query(`
      SELECT 1 FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
    `, [invite.tenant_id, profile.id]);
    if (activeAnchor.rows.length !== 1) {
      throw new KernelError('ACCESS_DENIED', 'Workspace membership is unavailable', 403);
    }
    await port.query(`
      INSERT INTO projed_core.project_members(
        tenant_id, project_id, user_id, role, member_email, member_display_name
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [invite.tenant_id, invite.project_id, profile.id, invite.default_role, profile.email.trim().toLowerCase(), profile.displayName]);
    await port.query(`
      INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, 1)
      ON CONFLICT (local_user_id, tenant_id, project_id) DO UPDATE
        SET active = true,
            scope_revision = projed_core.actor_scope_access.scope_revision + 1,
            updated_at = now()
    `, [profile.id, invite.tenant_id, invite.project_id]);
    const accepted = await port.query(`
      UPDATE projed_core.board_invites
         SET status = 'accepted', accepted_at = now(), updated_at = now()
       WHERE id = $1::uuid AND status = 'pending'
    `, [invite.id]);
    if (accepted.rowCount !== 1) invalid('Invite is no longer pending', 409);
    await bumpRevision(port, invite.tenant_id, invite.project_id);
    return this.getInvite(port, invite.id);
  }

  async previewBoardTransfer(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    targetWorkspaceRef: string,
  ): Promise<BoardTransferPreview> {
    if (typeof targetWorkspaceRef !== 'string' || targetWorkspaceRef.trim() === '') {
      invalid('targetWorkspaceId is invalid');
    }
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const target = await resolveWorkspace(port, targetWorkspaceRef);
    const identity = await port.query<{
      source_title: string; target_title: string; board_title: string;
      source_manager: boolean; target_admin: boolean;
    }>(`
      SELECT source.title AS source_title, target.title AS target_title, project.title AS board_title,
             projed_core.actor_has_board_capability_v1(
               source.id, project.id, 'move_board_between_workspaces'
             ) AS source_manager,
             projed_core.actor_has_workspace_capability_v1(
               target.id, 'manage_workspace_settings'
             ) AS target_admin
        FROM projed_core.projects project
        JOIN projed_core.tenants source ON source.id = project.tenant_id
        JOIN projed_core.tenants target ON target.id = $3::uuid
       WHERE source.id = $1::uuid AND project.id = $2::uuid
    `, [board.tenantId, board.id, target.id]);
    if (identity.rows.length !== 1) notFound();
    const row = identity.rows[0]!;
    const reasons: string[] = [];
    if (board.tenantId === target.id) reasons.push('source_and_target_are_same');
    if (!row.source_manager) reasons.push('source_project_manager_required');
    if (!row.target_admin) reasons.push('target_workspace_admin_required');

    if (reasons.length > 0) {
      return {
        blocked: true,
        reasons,
        sourceWorkspaceId: board.legacyWorkspaceId,
        sourceWorkspaceTitle: row.source_title,
        targetWorkspaceId: target.legacyWorkspaceId,
        targetWorkspaceTitle: row.target_title,
        boardId: board.legacyBoardId,
        boardTitle: row.board_title,
        transferLocked: false,
        counts: {
          targetActiveMembers: 0, preservedMembers: 0, removedMembers: 0,
          tasks: 0, dependencies: 0, tagsToMap: 0, documents: 0, records: 0,
          pendingInvitesToRevoke: 0, ragDocumentsToResync: 0,
        },
      };
    }

    await port.authorizeBoardTransfer(board.tenantId, board.id, target.id);
    const counts = await port.query<{
      target_active_members: string; preserved_members: string; removed_members: string;
      tasks: string; dependencies: string; tags_to_map: string; records: string; pending_invites: string;
      cross_board_tracking_references: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM projed_core.tenant_members
          WHERE tenant_id = $3::uuid AND status = 'active') AS target_active_members,
        (SELECT count(*)::text FROM projed_core.project_members member
          WHERE member.tenant_id = $1::uuid AND member.project_id = $2::uuid
            AND EXISTS (SELECT 1 FROM projed_core.tenant_members target_member
              WHERE target_member.tenant_id = $3::uuid AND target_member.user_id = member.user_id
                AND target_member.status = 'active')) AS preserved_members,
        (SELECT count(*)::text FROM projed_core.project_members member
          WHERE member.tenant_id = $1::uuid AND member.project_id = $2::uuid
            AND NOT EXISTS (SELECT 1 FROM projed_core.tenant_members target_member
              WHERE target_member.tenant_id = $3::uuid AND target_member.user_id = member.user_id
                AND target_member.status = 'active')) AS removed_members,
        (SELECT count(*)::text FROM projed_core.wbs_items
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS tasks,
        (SELECT count(*)::text FROM projed_core.wbs_dependencies
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS dependencies,
        (SELECT count(DISTINCT tag_id)::text FROM projed_core.wbs_item_tags
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS tags_to_map,
        (SELECT count(*)::text FROM projed_core.knowledge_records
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid) AS records,
        (SELECT count(*)::text FROM projed_core.board_invites
          WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND status = 'pending') AS pending_invites,
        (SELECT count(*)::text FROM projed_core.task_tracking_references reference
          WHERE reference.tenant_id = $1::uuid
            AND (reference.task_project_id = $2::uuid OR reference.target_project_id = $2::uuid)
            AND reference.task_project_id <> reference.target_project_id
            AND (
              reference.removed_at IS NULL
              OR EXISTS (
                SELECT 1 FROM projed_core.task_tracking_reference_staging staging
                 WHERE staging.tenant_id = reference.tenant_id
                   AND reference.id = ANY(staging.subtree_ids)
              )
            )) AS cross_board_tracking_references
    `, [board.tenantId, board.id, target.id]);
    const count = counts.rows[0]!;
    return {
      blocked: Number(count.cross_board_tracking_references) > 0,
      reasons: Number(count.cross_board_tracking_references) > 0
        ? ['cross_board_tracking_references_must_be_removed_or_staged_in_same_board']
        : [],
      sourceWorkspaceId: board.legacyWorkspaceId,
      sourceWorkspaceTitle: row.source_title,
      targetWorkspaceId: target.legacyWorkspaceId,
      targetWorkspaceTitle: row.target_title,
      boardId: board.legacyBoardId,
      boardTitle: row.board_title,
      transferLocked: false,
      counts: {
        targetActiveMembers: Number(count.target_active_members),
        preservedMembers: Number(count.preserved_members),
        removedMembers: Number(count.removed_members),
        tasks: Number(count.tasks),
        dependencies: Number(count.dependencies),
        tagsToMap: Number(count.tags_to_map),
        documents: 0,
        records: Number(count.records),
        pendingInvitesToRevoke: Number(count.pending_invites),
        ragDocumentsToResync: 0,
      },
    };
  }

  async moveBoardToWorkspace(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    input: BoardTransferInput,
  ): Promise<BoardTransferPreview> {
    if (!isRecord(input) || Object.keys(input).some(key => !['targetWorkspaceId', 'expectedBoardTitle'].includes(key))
        || typeof input.targetWorkspaceId !== 'string' || typeof input.expectedBoardTitle !== 'string') {
      invalid('board transfer input is invalid');
    }
    const preview = await this.previewBoardTransfer(port, workspaceRef, boardRef, input.targetWorkspaceId);
    if (preview.blocked) throw new KernelError('ACCESS_DENIED', 'Board transfer is not authorized', 403);
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const target = await resolveWorkspace(port, input.targetWorkspaceId);
    await port.authorizeBoardTransfer(board.tenantId, board.id, target.id);
    const locked = await port.query<{ title: string }>(`
      SELECT title FROM projed_core.projects
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE
    `, [board.tenantId, board.id]);
    if (locked.rows.length !== 1) notFound();
    if (locked.rows[0]!.title !== input.expectedBoardTitle) {
      invalid('Board title confirmation does not match', 409);
    }

    const profile = await currentProfile(port);
    const targetMembership = await port.query<{
      role: CollaborationRole; member_email: string | null; member_display_name: string | null;
    }>(`
      SELECT role, member_email, member_display_name
        FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
    `, [target.id, profile.id]);
    if (targetMembership.rows.length !== 1 || !['owner', 'admin'].includes(targetMembership.rows[0]!.role)) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }

    const assignments = await port.query<{
      item_id: string; tag_id: string; legacy_tag_id: string; name: string; color: string; sort_order: number;
    }>(`
      SELECT assignment.item_id::text AS item_id, tag.id::text AS tag_id,
             tag.legacy_tag_id, tag.name, tag.color, tag.sort_order
        FROM projed_core.wbs_item_tags assignment
        JOIN projed_core.task_tags tag
          ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
       WHERE assignment.tenant_id = $1::uuid AND assignment.project_id = $2::uuid
       ORDER BY tag.sort_order, tag.id, assignment.item_id
    `, [board.tenantId, board.id]);
    const targetTags = await port.query<{
      id: string; legacy_tag_id: string; name: string; color: string;
    }>(`
      SELECT id::text AS id, legacy_tag_id, name, color
        FROM projed_core.task_tags WHERE tenant_id = $1::uuid
    `, [target.id]);
    const targetByLegacy = new Map(targetTags.rows.map(tag => [tag.legacy_tag_id, tag]));
    const targetBySemantic = new Map(targetTags.rows.map(tag => [`${tag.name.toLowerCase()}\u0000${tag.color}`, tag]));
    const usedLegacyIds = new Set(targetTags.rows.map(tag => tag.legacy_tag_id));
    const tagMap = new Map<string, string>();
    for (const sourceTag of new Map(assignments.rows.map(row => [row.tag_id, row])).values()) {
      const semanticKey = `${sourceTag.name.toLowerCase()}\u0000${sourceTag.color}`;
      const exact = targetByLegacy.get(sourceTag.legacy_tag_id);
      const semantic = targetBySemantic.get(semanticKey);
      if (exact && exact.name === sourceTag.name && exact.color === sourceTag.color) {
        tagMap.set(sourceTag.tag_id, exact.id);
        continue;
      }
      if (semantic) {
        tagMap.set(sourceTag.tag_id, semantic.id);
        continue;
      }
      let legacyTagId = sourceTag.legacy_tag_id;
      while (usedLegacyIds.has(legacyTagId)) {
        legacyTagId = `${sourceTag.legacy_tag_id.slice(0, 210)}-moved-${randomUUID().slice(0, 8)}`;
      }
      const targetTagId = randomUUID();
      await port.query(`
        INSERT INTO projed_core.task_tags(id, tenant_id, legacy_tag_id, name, color, sort_order)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
      `, [targetTagId, target.id, legacyTagId, sourceTag.name, sourceTag.color, sourceTag.sort_order]);
      usedLegacyIds.add(legacyTagId);
      targetBySemantic.set(semanticKey, {
        id: targetTagId, legacy_tag_id: legacyTagId, name: sourceTag.name, color: sourceTag.color,
      });
      tagMap.set(sourceTag.tag_id, targetTagId);
    }

    await port.query(`
      DELETE FROM projed_core.wbs_item_tags
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
    `, [board.tenantId, board.id]);
    await port.query(`
      DELETE FROM projed_core.actor_scope_access access
       WHERE access.tenant_id = $1::uuid AND access.project_id = $2::uuid
         AND NOT EXISTS (SELECT 1 FROM projed_core.tenant_members target_member
           WHERE target_member.tenant_id = $3::uuid AND target_member.user_id = access.local_user_id
             AND target_member.status = 'active')
    `, [board.tenantId, board.id, target.id]);
    await port.query(`
      DELETE FROM projed_core.project_members member
       WHERE member.tenant_id = $1::uuid AND member.project_id = $2::uuid
         AND NOT EXISTS (SELECT 1 FROM projed_core.tenant_members target_member
           WHERE target_member.tenant_id = $3::uuid AND target_member.user_id = member.user_id
             AND target_member.status = 'active')
    `, [board.tenantId, board.id, target.id]);
    const revoked = await port.query(`
      UPDATE projed_core.board_invites
         SET status = 'revoked', revoked_at = now(), updated_at = now()
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND status = 'pending'
    `, [board.tenantId, board.id]);
    const transferContext = await port.query<{ source_valid: boolean; target_valid: boolean }>(`
      SELECT projed_core.board_transfer_source_context_valid_v1($1::uuid, $2::uuid) AS source_valid,
             projed_core.board_transfer_target_context_valid_v1($3::uuid, $2::uuid) AS target_valid
    `, [board.tenantId, board.id, target.id]);
    if (!transferContext.rows[0]?.source_valid || !transferContext.rows[0]?.target_valid) {
      throw new KernelError('DB_BOUNDARY_INVALID', 'Board transfer context is unavailable', 503);
    }
    await port.query(`
      DELETE FROM projed_core.task_tracking_references reference
       WHERE reference.tenant_id = $1::uuid
         AND (reference.task_project_id = $2::uuid OR reference.target_project_id = $2::uuid)
         AND reference.task_project_id <> reference.target_project_id
         AND reference.removed_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM projed_core.task_tracking_reference_staging staging
            WHERE staging.tenant_id = reference.tenant_id
              AND reference.id = ANY(staging.subtree_ids)
         )
    `, [board.tenantId, board.id]);
    const moved = await (async () => {
      try {
        return await port.query(`
          UPDATE projed_core.projects
             SET tenant_id = $3::uuid, sort_order = extract(epoch FROM clock_timestamp()) * 1000, updated_at = now()
           WHERE tenant_id = $1::uuid AND id = $2::uuid
        `, [board.tenantId, board.id, target.id]);
      } catch (error) {
        if ((error as { code?: string; constraint?: string }).code === '23505'
            && (error as { constraint?: string }).constraint === 'projects_tenant_legacy_uq') {
          invalid('Target workspace already contains this board identifier', 409);
        }
        throw error;
      }
    })();
    if (moved.rowCount !== 1) throw new KernelError('ACCESS_DENIED', 'Board transfer is not authorized', 403);
    await port.query(`
      UPDATE projed_core.board_invites
         SET legacy_workspace_id = $3, updated_at = now()
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
    `, [target.id, board.id, target.legacyWorkspaceId]);

    const managers = await port.query(`
      SELECT 1 FROM projed_core.project_members
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND role IN ('owner', 'admin', 'project_manager')
       LIMIT 1
    `, [target.id, board.id]);
    if (managers.rows.length === 0) {
      const member = targetMembership.rows[0]!;
      await port.query(`
        INSERT INTO projed_core.project_members(
          tenant_id, project_id, user_id, role, member_email, member_display_name
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
        ON CONFLICT (project_id, user_id) DO UPDATE
          SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role,
              member_email = EXCLUDED.member_email, member_display_name = EXCLUDED.member_display_name,
              updated_at = now()
      `, [target.id, board.id, profile.id, member.role, member.member_email, member.member_display_name]);
    }
    await port.query(`
      INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, 1)
      ON CONFLICT (local_user_id, tenant_id, project_id) DO UPDATE
        SET active = true, scope_revision = projed_core.actor_scope_access.scope_revision + 1,
            updated_at = now()
    `, [profile.id, target.id, board.id]);
    for (const assignment of assignments.rows) {
      const targetTagId = tagMap.get(assignment.tag_id);
      if (!targetTagId) throw new KernelError('DB_BOUNDARY_INVALID', 'Tag mapping is unavailable', 503);
      await port.query(`
        INSERT INTO projed_core.wbs_item_tags(tenant_id, project_id, item_id, tag_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
        ON CONFLICT DO NOTHING
      `, [target.id, board.id, assignment.item_id, targetTagId]);
    }

    await port.query(`
      INSERT INTO projed_core.activity_events(
        id, tenant_id, project_id, actor_id, event_type, entity_table, entity_id, entity_ref, payload
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, projed_core.current_actor_user_id_v1(),
        'project_workspace_transferred', 'projects', $3::uuid, $4,
        jsonb_build_object('sourceWorkspaceId', $5::text, 'targetWorkspaceId', $6::text)
      )
    `, [randomUUID(), target.id, board.id, board.legacyBoardId, board.legacyWorkspaceId, target.legacyWorkspaceId]);
    await port.query(`
      INSERT INTO projed_core.audit_logs(
        id, tenant_id, project_id, actor_id, action, entity_table, entity_id, entity_ref, before_data, after_data
      ) VALUES (
        $1::uuid, $2::uuid, NULL, projed_core.current_actor_user_id_v1(),
        'project_workspace_transferred_out', 'projects', $3::uuid, $4,
        jsonb_build_object('workspaceId', $5::text), jsonb_build_object('workspaceId', $6::text)
      ), (
        $7::uuid, $8::uuid, $3::uuid, projed_core.current_actor_user_id_v1(),
        'project_workspace_transferred_in', 'projects', $3::uuid, $4,
        jsonb_build_object('workspaceId', $5::text), jsonb_build_object('workspaceId', $6::text)
      )
    `, [
      randomUUID(), board.tenantId, board.id, board.legacyBoardId,
      board.legacyWorkspaceId, target.legacyWorkspaceId, randomUUID(), target.id,
    ]);
    await bumpRevision(port, board.tenantId, null);
    await bumpRevision(port, target.id, null);
    await bumpRevision(port, target.id, board.id);

    return {
      ...preview,
      sourceWorkspaceTitle: preview.sourceWorkspaceTitle,
      targetWorkspaceId: target.legacyWorkspaceId,
      counts: {
        ...preview.counts,
        revokedInvites: revoked.rowCount ?? 0,
        remappedTags: tagMap.size,
        ragJobsCreated: 0,
      },
    };
  }

  private async getInvite(port: ActorQueryPort, inviteId: string): Promise<DomainBoardInvite> {
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
       WHERE invite.id = $1::uuid
    `, [inviteId]);
    if (result.rows.length !== 1) notFound();
    return mapInvite(result.rows[0]!);
  }
}
