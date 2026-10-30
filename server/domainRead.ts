import type { ActorQueryPort } from './actorTransaction.js';
import { KernelError } from './errors.js';

export const COLLABORATION_ROLES = ['owner', 'admin', 'project_manager', 'member', 'viewer'] as const;
export type CollaborationRole = typeof COLLABORATION_ROLES[number];

export const PERMISSION_CAPABILITIES = [
  'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
  'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
  'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit',
] as const;
export type PermissionCapability = typeof PERMISSION_CAPABILITIES[number];
const PERMISSION_SET = new Set<string>(PERMISSION_CAPABILITIES);
const TASK_NOTE_NODE_TYPES = new Set(['root', 'paragraph', 'heading', 'list', 'listitem', 'link', 'text', 'linebreak']);

export interface WorkspaceIdentity {
  id: string;
  legacyWorkspaceId: string;
}

export interface BoardIdentity {
  id: string;
  legacyBoardId: string;
  tenantId: string;
  legacyWorkspaceId: string;
}

export interface DomainWorkspace {
  id: string;
  title: string;
  boards: Array<{ id: string; title: string; dependencies: []; order?: number; createdAt: number }>;
  ownerId?: string;
  order?: number;
  createdAt: number;
}

export interface DomainWorkspaceMember {
  workspaceId: string;
  userId: string;
  role: CollaborationRole;
  status: 'active' | 'invited' | 'suspended';
  profile: { id: string; email: string | null; displayName: string | null };
  createdAt: number;
  updatedAt: number;
}

export interface DomainBoardMember {
  workspaceId: string;
  boardId: string;
  userId: string;
  role: CollaborationRole;
  profile: { id: string; email: string | null; displayName: string | null };
  createdAt: number;
  updatedAt: number;
}

export type DomainRolePermissionMatrix = Record<CollaborationRole, string[]>;

export interface DomainTask {
  id: string;
  storageId: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  title: string;
  detailNotes: unknown[];
  description?: string;
  status: 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';
  assigneeIds: string[];
  assigneeId?: string;
  collaboratorIds: string[];
  tagIds: string[];
  startDate?: string;
  endDate?: string;
  isDurationLocked?: boolean;
  nodeType?: 'group' | 'milestone' | 'task';
  kanbanStageId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export interface DomainDependency {
  id: string;
  fromId: string;
  fromSide: 'start' | 'end';
  toId: string;
  toSide: 'start' | 'end';
  offset?: number;
}

export interface DomainTaskTag {
  id: string;
  storageId: string;
  workspaceId: string;
  name: string;
  color: 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue' | 'sky' | 'lime' | 'pink' | 'black' | 'gray';
  order: number;
  createdAt: number;
  updatedAt: number;
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Resource is unavailable', 404);
}

function domainInvalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 503);
}

function milliseconds(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) domainInvalid('Domain timestamp is invalid');
  return parsed;
}

function optionalNumber(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validTaskNoteNode(value: unknown): boolean {
  const node = record(value);
  if (!node || typeof node.type !== 'string' || !TASK_NOTE_NODE_TYPES.has(node.type)) return false;
  return node.children === undefined
    || (Array.isArray(node.children) && node.children.every(validTaskNoteNode));
}

export function validTaskDetailNotes(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.every((entry) => {
    const note = record(entry);
    if (!note || typeof note.id !== 'string' || typeof note.title !== 'string' || typeof note.content !== 'string') {
      return false;
    }
    if (note.richContent === undefined) return true;
    const richContent = record(note.richContent);
    const editorState = record(richContent?.editorState);
    return richContent?.schema === 'task-note.lexical-v1'
      && validTaskNoteNode(editorState?.root)
      && record(editorState?.root)?.type === 'root';
  });
}

export async function resolveWorkspace(
  port: ActorQueryPort,
  workspaceRef: string,
  requireTenantScope = false,
): Promise<WorkspaceIdentity> {
  const result = await port.query<{ id: string; legacy_workspace_id: string }>(`
    SELECT tenant.id::text AS id, tenant.legacy_workspace_id
      FROM projed_core.tenants tenant
     WHERE (tenant.id::text = $1 OR tenant.legacy_workspace_id = $1)
       AND ($2::boolean = false
         OR projed_core.actor_has_workspace_capability_v1(tenant.id, 'manage_workspace_members'))
     LIMIT 2
  `, [workspaceRef, requireTenantScope]);
  if (result.rows.length !== 1) notFound();
  return { id: result.rows[0]!.id, legacyWorkspaceId: result.rows[0]!.legacy_workspace_id };
}

export async function resolveBoard(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<BoardIdentity> {
  const workspace = await resolveWorkspace(port, workspaceRef);
  const result = await port.query<{ id: string; legacy_board_id: string; tenant_id: string }>(`
    SELECT project.id::text AS id, project.legacy_board_id, project.tenant_id::text AS tenant_id
      FROM projed_core.projects project
     WHERE project.tenant_id = $1::uuid
       AND (project.id::text = $2 OR project.legacy_board_id = $2)
     LIMIT 2
  `, [workspace.id, boardRef]);
  if (result.rows.length !== 1) notFound();
  return {
    id: result.rows[0]!.id,
    legacyBoardId: result.rows[0]!.legacy_board_id,
    tenantId: result.rows[0]!.tenant_id,
    legacyWorkspaceId: workspace.legacyWorkspaceId,
  };
}

export class DomainReadRepository {
  async listWorkspaces(port: ActorQueryPort): Promise<DomainWorkspace[]> {
    const tenants = await port.query<{
      id: string; legacy_workspace_id: string; title: string; owner_id: string | null;
      sort_order: number | null; created_at_ms: string;
    }>(`
      SELECT id::text AS id, legacy_workspace_id, title, owner_id::text AS owner_id,
             sort_order, floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms
        FROM projed_core.tenants
       ORDER BY sort_order NULLS LAST, created_at, id
    `);
    if (tenants.rows.length === 0) return [];
    const projects = await port.query<{
      tenant_id: string; id: string; legacy_board_id: string; title: string;
      sort_order: number | null; created_at_ms: string;
    }>(`
      SELECT tenant_id::text AS tenant_id, id::text AS id, legacy_board_id, title,
             sort_order, floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms
        FROM projed_core.projects
       ORDER BY tenant_id, sort_order NULLS LAST, created_at, id
    `);
    const boardsByTenant = new Map<string, DomainWorkspace['boards']>();
    for (const project of projects.rows) {
      const target = boardsByTenant.get(project.tenant_id) ?? [];
      target.push({
        id: project.legacy_board_id,
        title: project.title,
        dependencies: [],
        ...(optionalNumber(project.sort_order) === undefined ? {} : { order: project.sort_order! }),
        createdAt: milliseconds(project.created_at_ms),
      });
      boardsByTenant.set(project.tenant_id, target);
    }
    return tenants.rows.map(tenant => ({
      id: tenant.legacy_workspace_id,
      title: tenant.title,
      boards: boardsByTenant.get(tenant.id) ?? [],
      ...(tenant.owner_id === null ? {} : { ownerId: tenant.owner_id }),
      ...(optionalNumber(tenant.sort_order) === undefined ? {} : { order: tenant.sort_order! }),
      createdAt: milliseconds(tenant.created_at_ms),
    }));
  }

  async listWorkspaceMembers(port: ActorQueryPort, workspaceRef: string): Promise<DomainWorkspaceMember[]> {
    const workspace = await resolveWorkspace(port, workspaceRef, true);
    const result = await port.query<{
      user_id: string; role: CollaborationRole; status: DomainWorkspaceMember['status'];
      member_email: string | null; member_display_name: string | null;
      created_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT user_id::text AS user_id, role, status, member_email, member_display_name,
             floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.tenant_members
       WHERE tenant_id = $1::uuid
       ORDER BY created_at, user_id
    `, [workspace.id]);
    return result.rows.map(row => ({
      workspaceId: workspace.legacyWorkspaceId,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      profile: { id: row.user_id, email: row.member_email, displayName: row.member_display_name },
      createdAt: milliseconds(row.created_at_ms),
      updatedAt: milliseconds(row.updated_at_ms),
    }));
  }

  async listBoardMembers(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<DomainBoardMember[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const result = await port.query<{
      user_id: string; role: CollaborationRole; member_email: string | null; member_display_name: string | null;
      created_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT user_id::text AS user_id, role, member_email, member_display_name,
             floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.project_members
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
       ORDER BY created_at, user_id
    `, [board.tenantId, board.id]);
    return result.rows.map(row => ({
      workspaceId: board.legacyWorkspaceId,
      boardId: board.legacyBoardId,
      userId: row.user_id,
      role: row.role,
      profile: { id: row.user_id, email: row.member_email, displayName: row.member_display_name },
      createdAt: milliseconds(row.created_at_ms),
      updatedAt: milliseconds(row.updated_at_ms),
    }));
  }

  async getBoardRolePermissions(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
  ): Promise<DomainRolePermissionMatrix> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const result = await port.query<{ role: CollaborationRole; capabilities: string[] }>(`
      SELECT role, capabilities
        FROM projed_core.board_role_permissions
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid
       ORDER BY role
    `, [board.tenantId, board.id]);
    const matrix = Object.fromEntries(COLLABORATION_ROLES.map(role => [role, null])) as Record<CollaborationRole, string[] | null>;
    for (const row of result.rows) {
      if (!COLLABORATION_ROLES.includes(row.role) || matrix[row.role] !== null
          || !Array.isArray(row.capabilities) || row.capabilities.some(capability => !PERMISSION_SET.has(capability))) {
        domainInvalid('Board role permissions are invalid');
      }
      matrix[row.role] = [...new Set(row.capabilities)];
    }
    if (COLLABORATION_ROLES.some(role => matrix[role] === null)) domainInvalid('Board role permissions are incomplete');
    return matrix as DomainRolePermissionMatrix;
  }

  async listTasks(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<DomainTask[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const result = await port.query<{
      storage_id: string; legacy_task_id: string; parent_legacy_id: string | null; title: string;
      detail_notes: unknown; description: string | null; status: DomainTask['status']; assignee_ids: string[];
      collaborator_ids: string[]; tag_ids: string[]; start_date: string | null; end_date: string | null;
      duration_locked: boolean | null; node_type: DomainTask['nodeType'] | null; kanban_stage_id: string | null;
      sort_order: number; archived: boolean; created_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT item.id::text AS storage_id, item.legacy_task_id,
             parent.legacy_task_id AS parent_legacy_id, item.title, item.detail_notes,
             item.description, item.status, item.assignee_ids::text[], item.collaborator_ids::text[],
             COALESCE(tags.legacy_tag_ids, ARRAY[]::text[]) AS tag_ids,
             to_char(item.start_date, 'YYYY-MM-DD') AS start_date,
             to_char(item.end_date, 'YYYY-MM-DD') AS end_date,
             item.duration_locked, item.node_type, item.kanban_stage_id, item.sort_order, item.archived,
             floor(extract(epoch FROM item.created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM item.updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.wbs_items item
        LEFT JOIN projed_core.wbs_items parent
          ON parent.tenant_id = item.tenant_id AND parent.project_id = item.project_id AND parent.id = item.parent_id
        LEFT JOIN LATERAL (
          SELECT array_agg(tag.legacy_tag_id ORDER BY tag.sort_order, tag.id) AS legacy_tag_ids
            FROM projed_core.wbs_item_tags assignment
            JOIN projed_core.task_tags tag
              ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
           WHERE assignment.tenant_id = item.tenant_id
             AND assignment.project_id = item.project_id
             AND assignment.item_id = item.id
        ) tags ON true
       WHERE item.tenant_id = $1::uuid AND item.project_id = $2::uuid
       ORDER BY item.sort_order, item.created_at, item.id
    `, [board.tenantId, board.id]);
    return result.rows.map(row => {
      if (!validTaskDetailNotes(row.detail_notes)) domainInvalid('Task detail notes are invalid');
      return {
        id: row.legacy_task_id,
        storageId: row.storage_id,
        workspaceId: board.legacyWorkspaceId,
        boardId: board.legacyBoardId,
        parentId: row.parent_legacy_id,
        title: row.title,
        detailNotes: row.detail_notes,
        ...(row.description === null ? {} : { description: row.description }),
        status: row.status,
        assigneeIds: row.assignee_ids,
        ...(row.assignee_ids[0] ? { assigneeId: row.assignee_ids[0] } : {}),
        collaboratorIds: row.collaborator_ids,
        tagIds: row.tag_ids,
        ...(row.start_date === null ? {} : { startDate: row.start_date }),
        ...(row.end_date === null ? {} : { endDate: row.end_date }),
        ...(row.duration_locked === null ? {} : { isDurationLocked: row.duration_locked }),
        ...(row.node_type === null ? {} : { nodeType: row.node_type }),
        ...(row.kanban_stage_id === null ? {} : { kanbanStageId: row.kanban_stage_id }),
        order: row.sort_order,
        createdAt: milliseconds(row.created_at_ms),
        updatedAt: milliseconds(row.updated_at_ms),
        isArchived: row.archived,
      };
    });
  }

  async listTags(port: ActorQueryPort, workspaceRef: string): Promise<DomainTaskTag[]> {
    const workspace = await resolveWorkspace(port, workspaceRef);
    const result = await port.query<{
      storage_id: string; legacy_tag_id: string; name: string; color: DomainTaskTag['color'];
      sort_order: number; created_at_ms: string; updated_at_ms: string;
    }>(`
      SELECT id::text AS storage_id, legacy_tag_id, name, color, sort_order,
             floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms,
             floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS updated_at_ms
        FROM projed_core.task_tags
       WHERE tenant_id = $1::uuid
       ORDER BY sort_order, id
    `, [workspace.id]);
    return result.rows.map(row => ({
      id: row.legacy_tag_id,
      storageId: row.storage_id,
      workspaceId: workspace.legacyWorkspaceId,
      name: row.name,
      color: row.color,
      order: row.sort_order,
      createdAt: milliseconds(row.created_at_ms),
      updatedAt: milliseconds(row.updated_at_ms),
    }));
  }

  async listDependencies(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<DomainDependency[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const result = await port.query<{
      legacy_dependency_id: string; from_legacy_id: string; from_side: DomainDependency['fromSide'];
      to_legacy_id: string; to_side: DomainDependency['toSide']; offset_value: number | null;
    }>(`
      SELECT dependency.legacy_dependency_id, source.legacy_task_id AS from_legacy_id,
             dependency.from_side, target.legacy_task_id AS to_legacy_id,
             dependency.to_side, dependency.offset_value
        FROM projed_core.wbs_dependencies dependency
        JOIN projed_core.wbs_items source
          ON source.tenant_id = dependency.tenant_id AND source.project_id = dependency.project_id
         AND source.id = dependency.from_id
        JOIN projed_core.wbs_items target
          ON target.tenant_id = dependency.tenant_id AND target.project_id = dependency.project_id
         AND target.id = dependency.to_id
       WHERE dependency.tenant_id = $1::uuid AND dependency.project_id = $2::uuid
       ORDER BY dependency.legacy_dependency_id
    `, [board.tenantId, board.id]);
    return result.rows.map(row => ({
      id: row.legacy_dependency_id,
      fromId: row.from_legacy_id,
      fromSide: row.from_side,
      toId: row.to_legacy_id,
      toSide: row.to_side,
      ...(row.offset_value === null ? {} : { offset: row.offset_value }),
    }));
  }
}
