import {
  COLLABORATION_ROLES,
  WORKSPACE_ROLE_CAPABILITIES,
  createDefaultBoardRolePermissionMatrix,
  normalizeBoardRolePermissionMatrix,
} from '../../types';
import type {
  ActivityEvent,
  AuditLogEntry,
  Board,
  BoardInvite,
  BoardInviteAcceptInput,
  BoardInviteCreateInput,
  BoardMember,
  BoardRolePermissionMatrix,
  CollaborationRole,
  CurrentBoardAccess,
  Dependency,
  PermissionCapability,
  TagColor,
  TaskNode,
  TaskTag,
  Workspace,
  WorkspaceMember,
} from '../../types';
import { isSupabaseConfigured, supabase } from './client';
import type { BoardInviteRow, BoardRolePermissionRow, Json, ProjectMemberRow, ProjectRow, TaskTagRow, TenantMemberRow, TenantRow, WbsDependencyRow, WbsItemRow } from './database.types';
import { hashBoardInviteToken } from '../../utils/boardInviteToken';

type WbsItemInsert = Partial<WbsItemRow>;
type BoardInviteInsert = Partial<BoardInviteRow>;
type BoardRolePermissionInsert = Partial<BoardRolePermissionRow>;
type TaskTagInsert = Partial<TaskTagRow>;
type WbsDependencyWithNodes = WbsDependencyRow & {
  from_item?: Pick<WbsItemRow, 'id' | 'legacy_node_id'> | null;
  to_item?: Pick<WbsItemRow, 'id' | 'legacy_node_id'> | null;
};
type WbsItemTagAssignment = {
  item_id: string;
  tag_id: string;
};
type ProfileJoin = {
  id: string;
  email: string | null;
  display_name: string | null;
};
type TenantMemberWithProfile = TenantMemberRow & {
  profiles?: ProfileJoin | ProfileJoin[] | null;
};
type ProjectMemberWithProfile = ProjectMemberRow & {
  profiles?: ProfileJoin | ProfileJoin[] | null;
};

const requireSupabase = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && UUID_RE.test(value));

const toTimestamp = (value: string | null | undefined) => (value ? new Date(value).getTime() : undefined);
const toDate = (value: string | undefined) => (value && value.trim() ? value : null);

const assertNoError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const isMissingTagTableError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error ?? '');
  return message.includes("Could not find the table 'public.task_tags'")
    || message.includes("Could not find the table 'public.wbs_item_tags'")
    || message.includes('task_tags')
    || message.includes('wbs_item_tags');
};

const isMissingBoardRolePermissionsTableError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error ?? '');
  return message.includes("Could not find the table 'public.board_role_permissions'")
    || message.includes('board_role_permissions');
};

const assertNoTagTableError = (error: { message: string } | null) => {
  if (!error) return false;
  if (isMissingTagTableError(error)) {
    console.warn('[supabaseTagService] Tag tables are not available; continuing without tags.');
    return true;
  }
  throw new Error(error.message);
};

const legacyOrId = (id: string, legacyId?: string | null) => legacyId || id;
const uniqueCapabilities = (capabilities: readonly PermissionCapability[]): PermissionCapability[] =>
  Array.from(new Set(capabilities));

const buildCurrentBoardAccess = (
  workspaceId: string,
  boardId: string,
  workspaceRole?: CollaborationRole,
  boardRole?: CollaborationRole,
  rolePermissions: BoardRolePermissionMatrix = createDefaultBoardRolePermissionMatrix()
): CurrentBoardAccess => {
  const capabilities: PermissionCapability[] = [];
  if (workspaceRole) {
    capabilities.push(...WORKSPACE_ROLE_CAPABILITIES[workspaceRole]);
    if (workspaceRole === 'owner' || workspaceRole === 'admin') {
      capabilities.push(...rolePermissions[workspaceRole]);
    }
  }
  if (boardRole) {
    capabilities.push(...rolePermissions[boardRole]);
  }
  return {
    workspaceId,
    boardId,
    workspaceRole,
    boardRole,
    capabilities: uniqueCapabilities(capabilities),
  };
};

const normalizeProfileJoin = (profile: ProfileJoin | ProfileJoin[] | null | undefined) => {
  const resolved = Array.isArray(profile) ? profile[0] : profile;
  return resolved
    ? {
        id: resolved.id,
        email: resolved.email,
        displayName: resolved.display_name,
      }
    : undefined;
};

const dependencySelect = `
  *,
  from_item:wbs_items!wbs_dependencies_from_item_id_fkey(id,legacy_node_id),
  to_item:wbs_items!wbs_dependencies_to_item_id_fkey(id,legacy_node_id)
`;

const mapTenantToWorkspace = (tenant: TenantRow, projects: ProjectRow[] = []): Workspace => ({
  id: legacyOrId(tenant.id, tenant.legacy_workspace_id),
  title: tenant.name,
  ownerId: tenant.owner_id ?? undefined,
  members: [],
  order: toTimestamp(tenant.created_at),
  createdAt: toTimestamp(tenant.created_at),
  boards: projects
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(project => ({
      id: legacyOrId(project.id, project.legacy_board_id),
      title: project.name,
      dependencies: [],
      order: project.sort_order,
      createdAt: toTimestamp(project.created_at),
    })),
});

const mapProjectToBoard = (project: ProjectRow): Board => ({
  id: legacyOrId(project.id, project.legacy_board_id),
  title: project.name,
  dependencies: [],
  order: project.sort_order,
  createdAt: toTimestamp(project.created_at),
});

const mapWbsItemToTaskNode = (
  item: WbsItemRow,
  nodeIdByDbId: Map<string, string> = new Map(),
  requestedWorkspaceId?: string,
  requestedBoardId?: string,
  tagIds: string[] = []
): TaskNode => {
  const metadata = item.metadata as Record<string, any> | null;
  return {
    id: legacyOrId(item.id, item.legacy_node_id),
    workspaceId: requestedWorkspaceId || metadata?.firebaseWorkspaceId || item.tenant_id,
    boardId: requestedBoardId || metadata?.firebaseBoardId || item.project_id,
    parentId: item.parent_id ? nodeIdByDbId.get(item.parent_id) ?? item.parent_id : null,
    title: item.title,
  detailNotes: Array.isArray(item.detail_notes) ? (item.detail_notes as unknown as TaskNode['detailNotes']) : undefined,
  description: item.description ?? undefined,
  status: item.status,
  assigneeId: item.assignee_id ?? undefined,
  collaboratorIds: item.collaborator_ids,
  startDate: item.start_date ?? undefined,
  endDate: item.end_date ?? undefined,
  isDurationLocked: item.is_duration_locked,
  nodeType: item.item_type,
  kanbanStageId: item.kanban_stage_id ?? undefined,
  order: item.sort_order,
  createdAt: toTimestamp(item.created_at),
  updatedAt: toTimestamp(item.updated_at),
  isArchived: item.is_archived,
  tagIds,
  };
};

const mapTaskTag = (row: TaskTagRow, requestedWorkspaceId?: string): TaskTag => ({
  id: legacyOrId(row.id, row.legacy_tag_id),
  workspaceId: requestedWorkspaceId || row.tenant_id,
  name: row.name,
  color: row.color as TagColor,
  order: row.sort_order,
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
});

const mapWorkspaceMember = (row: TenantMemberWithProfile, requestedWorkspaceId: string): WorkspaceMember => ({
  workspaceId: requestedWorkspaceId,
  userId: row.user_id,
  role: row.role,
  status: row.status,
  profile: normalizeProfileJoin(row.profiles),
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
});

const mapBoardMember = (
  row: ProjectMemberWithProfile,
  requestedWorkspaceId: string,
  requestedBoardId: string
): BoardMember => ({
  workspaceId: requestedWorkspaceId,
  boardId: requestedBoardId,
  userId: row.user_id,
  role: row.role,
  profile: normalizeProfileJoin(row.profiles),
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
});

const mapBoardRolePermissionRows = (rows: BoardRolePermissionRow[] = []): BoardRolePermissionMatrix => {
  const matrix = createDefaultBoardRolePermissionMatrix();
  rows.forEach(row => {
    matrix[row.role] = row.capabilities as PermissionCapability[];
  });
  return normalizeBoardRolePermissionMatrix(matrix);
};

const mapBoardInvite = (
  row: BoardInviteRow,
  requestedWorkspaceId: string,
  requestedBoardId: string
): BoardInvite => ({
  id: row.id,
  workspaceId: requestedWorkspaceId,
  boardId: requestedBoardId,
  email: row.email,
  invitedBy: row.invited_by,
  status: row.status,
  defaultRole: row.default_role,
  expiresAt: new Date(row.expires_at).getTime(),
  acceptedAt: toTimestamp(row.accepted_at),
  revokedAt: toTimestamp(row.revoked_at),
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
});

const mapDependency = (dep: WbsDependencyWithNodes): Dependency => ({
  id: legacyOrId(dep.id, dep.legacy_dependency_id),
  fromId: dep.from_item?.legacy_node_id || dep.from_item_id,
  fromSide: dep.from_side,
  toId: dep.to_item?.legacy_node_id || dep.to_item_id,
  toSide: dep.to_side,
  offset: dep.offset_days,
});

export const resolveWorkspaceId = async (workspaceId: string): Promise<string> => {
  if (isUuid(workspaceId)) return workspaceId;
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('legacy_workspace_id', workspaceId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`Supabase tenant not found for legacy workspace id: ${workspaceId}`);
  return data.id;
};

export const resolveProjectId = async (tenantId: string, projectId: string): Promise<string> => {
  if (isUuid(projectId)) return projectId;
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('legacy_board_id', projectId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`Supabase project not found for legacy board id: ${projectId}`);
  return data.id;
};

const resolveNodeId = async (tenantId: string, projectId: string, nodeId: string | null | undefined): Promise<string | null> => {
  if (!nodeId) return null;
  if (isUuid(nodeId)) return nodeId;
  const { data, error } = await supabase
    .from('wbs_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('legacy_node_id', nodeId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`Supabase WBS item not found for legacy node id: ${nodeId}`);
  return data.id;
};

const requireNodeId = async (tenantId: string, projectId: string, nodeId: string): Promise<string> => {
  const resolved = await resolveNodeId(tenantId, projectId, nodeId);
  if (!resolved) throw new Error('Supabase WBS item id is required.');
  return resolved;
};

const resolveTagId = async (tenantId: string, tagId: string): Promise<string> => {
  if (isUuid(tagId)) return tagId;
  const { data, error } = await supabase
    .from('task_tags')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('legacy_tag_id', tagId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`Supabase task tag not found for legacy tag id: ${tagId}`);
  return data.id;
};

const resolveDependencyId = async (tenantId: string, projectId: string, dependencyId: string): Promise<string> => {
  if (isUuid(dependencyId)) return dependencyId;
  const { data, error } = await supabase
    .from('wbs_dependencies')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('legacy_dependency_id', dependencyId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`Supabase dependency not found for legacy dependency id: ${dependencyId}`);
  return data.id;
};

const stripUndefinedForJson = (value: Record<string, unknown> | null | undefined): Json | null => {
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
};

const withLegacyEntityPayload = (
  payload: Record<string, unknown> | undefined,
  entityId: string | null | undefined
) => {
  if (!entityId || isUuid(entityId)) return payload ?? {};
  return { ...(payload ?? {}), legacyEntityId: entityId };
};

const resolveEventEntityId = async (
  tenantId: string,
  projectId: string | null,
  entityTable: string,
  entityId: string | null | undefined
): Promise<string | null> => {
  if (!entityId) return null;
  if (isUuid(entityId)) return entityId;
  if (entityTable === 'tenants') return resolveWorkspaceId(entityId);
  if (entityTable === 'projects') return resolveProjectId(tenantId, entityId);
  if (entityTable === 'wbs_items' && projectId) return resolveNodeId(tenantId, projectId, entityId);
  if (entityTable === 'wbs_dependencies' && projectId) return resolveDependencyId(tenantId, projectId, entityId);
  return null;
};

const taskNodeToInsert = async (tenantId: string, projectId: string, node: TaskNode): Promise<WbsItemInsert> => ({
  id: isUuid(node.id) ? node.id : undefined,
  tenant_id: tenantId,
  project_id: projectId,
  parent_id: await resolveNodeId(tenantId, projectId, node.parentId),
  legacy_node_id: isUuid(node.id) ? null : node.id,
  title: node.title,
  description: node.description ?? null,
  detail_notes: (node.detailNotes ?? []) as unknown as Json,
  status: node.status,
  assignee_id: isUuid(node.assigneeId) ? node.assigneeId : null,
  collaborator_ids: (node.collaboratorIds ?? []).filter(isUuid),
  start_date: toDate(node.startDate),
  end_date: toDate(node.endDate),
  is_duration_locked: node.isDurationLocked ?? false,
  item_type: node.nodeType ?? 'task',
  kanban_stage_id: node.kanbanStageId ?? null,
  sort_order: node.order,
  is_archived: node.isArchived ?? false,
  metadata: {
    firebaseWorkspaceId: node.workspaceId,
    firebaseBoardId: node.boardId,
  } satisfies Json,
});

export const supabaseWorkspaceService = {
  list: async (): Promise<Workspace[]> => {
    requireSupabase();
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: true });
    assertNoError(tenantsError);

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: true });
    assertNoError(projectsError);

    return (tenants ?? []).map(tenant =>
      mapTenantToWorkspace(tenant, (projects ?? []).filter(project => project.tenant_id === tenant.id))
    );
  },

  create: async (title?: string): Promise<Workspace> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('create_tenant_with_owner', {
      tenant_name: title || '未命名工作區',
    });
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created tenant.');
    return mapTenantToWorkspace(data);
  },

  update: async (workspaceId: string, updates: Partial<Workspace>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const { error } = await supabase
      .from('tenants')
      .update({ name: updates.title })
      .eq('id', tenantId);
    assertNoError(error);
  },

  restore: async (workspace: Workspace): Promise<void> => {
    requireSupabase();
    const payload = {
      id: isUuid(workspace.id) ? workspace.id : undefined,
      legacy_workspace_id: isUuid(workspace.id) ? null : workspace.id,
      name: workspace.title,
      owner_id: isUuid(workspace.ownerId) ? workspace.ownerId : null,
      metadata: {
        legacyMembers: workspace.members,
        legacyOrder: workspace.order ?? null,
        legacyCreatedAt: workspace.createdAt ?? null,
      } satisfies Json,
    };
    const { error } = await supabase
      .from('tenants')
      .upsert(payload, isUuid(workspace.id) ? undefined : { onConflict: 'legacy_workspace_id' });
    assertNoError(error);
  },

  delete: async (workspaceId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId);
    assertNoError(error);
  },
};

export const supabaseBoardService = {
  create: async (workspaceId: string, title?: string): Promise<Board> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    assertNoError(userError);
    const creatorId = userData.user?.id ?? null;
    const { data, error } = await supabase
      .from('projects')
      .insert({
        tenant_id: tenantId,
        name: title || '未命名看板',
        sort_order: Date.now(),
        created_by: creatorId,
      })
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created project.');
    if (creatorId) {
      const { data: workspaceMember, error: memberError } = await supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('user_id', creatorId)
        .eq('status', 'active')
        .maybeSingle();
      assertNoError(memberError);
      if (workspaceMember?.role) {
        const { error: boardMemberError } = await supabase
          .from('project_members')
          .upsert({
            tenant_id: tenantId,
            project_id: data.id,
            user_id: creatorId,
            role: workspaceMember.role,
          });
        assertNoError(boardMemberError);
      }
    }
    return mapProjectToBoard(data);
  },

  update: async (workspaceId: string, boardId: string, updates: Partial<Board>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { error } = await supabase
      .from('projects')
      .update({ name: updates.title, sort_order: updates.order })
      .eq('tenant_id', tenantId)
      .eq('id', projectId);
    assertNoError(error);
  },

  restore: async (workspaceId: string, board: Board): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const payload = {
      id: isUuid(board.id) ? board.id : undefined,
      tenant_id: tenantId,
      legacy_board_id: isUuid(board.id) ? null : board.id,
      name: board.title,
      sort_order: board.order,
      metadata: {
        legacyCreatedAt: board.createdAt ?? null,
      } satisfies Json,
    };
    const { error } = await supabase
      .from('projects')
      .upsert(payload, isUuid(board.id) ? undefined : { onConflict: 'tenant_id,legacy_board_id' });
    assertNoError(error);
  },

  delete: async (workspaceId: string, boardId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', projectId);
    assertNoError(error);
  },
};

export const supabaseMemberService = {
  listWorkspaceMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase
      .from('tenant_members')
      .select('tenant_id,user_id,role,status,created_at,updated_at,profiles(id,email,display_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    assertNoError(error);
    return ((data ?? []) as unknown as TenantMemberWithProfile[]).map(row => mapWorkspaceMember(row, workspaceId));
  },

  listBoardMembers: async (workspaceId: string, boardId: string): Promise<BoardMember[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('project_members')
      .select('project_id,tenant_id,user_id,role,created_at,updated_at,profiles(id,email,display_name)')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    assertNoError(error);
    return ((data ?? []) as unknown as ProjectMemberWithProfile[]).map(row => mapBoardMember(row, workspaceId, boardId));
  },

  getBoardRolePermissions: async (workspaceId: string, boardId: string): Promise<BoardRolePermissionMatrix> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('board_role_permissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);

    if (error && isMissingBoardRolePermissionsTableError(error)) {
      console.warn('[supabaseMemberService] board_role_permissions is not available; using default role permissions.');
      return createDefaultBoardRolePermissionMatrix();
    }
    assertNoError(error);
    return mapBoardRolePermissionRows((data ?? []) as BoardRolePermissionRow[]);
  },

  updateBoardRolePermissions: async (
    workspaceId: string,
    boardId: string,
    permissions: BoardRolePermissionMatrix
  ): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const normalizedPermissions = normalizeBoardRolePermissionMatrix(permissions);
    const rows: BoardRolePermissionInsert[] = COLLABORATION_ROLES.map(role => ({
      tenant_id: tenantId,
      project_id: projectId,
      role,
      capabilities: normalizedPermissions[role],
    }));

    const { error } = await supabase
      .from('board_role_permissions')
      .upsert(rows, { onConflict: 'tenant_id,project_id,role' });
    assertNoError(error);
  },

  getCurrentBoardAccess: async (
    workspaceId: string,
    boardId: string,
    userId: string
  ): Promise<CurrentBoardAccess> => {
    const [workspaceMembers, boardMembers, rolePermissions] = await Promise.all([
      supabaseMemberService.listWorkspaceMembers(workspaceId),
      supabaseMemberService.listBoardMembers(workspaceId, boardId),
      supabaseMemberService.getBoardRolePermissions(workspaceId, boardId),
    ]);
    const workspaceRole = workspaceMembers.find(member => member.userId === userId && member.status === 'active')?.role;
    const boardRole = boardMembers.find(member => member.userId === userId)?.role;
    return buildCurrentBoardAccess(workspaceId, boardId, workspaceRole, boardRole, rolePermissions);
  },

  upsertBoardMember: async (
    workspaceId: string,
    boardId: string,
    userId: string,
    role: CollaborationRole
  ): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data: before, error: beforeError } = await supabase
      .from('project_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    assertNoError(beforeError);

    const { error } = await supabase
      .from('project_members')
      .upsert({
        tenant_id: tenantId,
        project_id: projectId,
        user_id: userId,
        role,
      });
    assertNoError(error);

    const action: AuditLogEntry['action'] = before ? 'member_role_changed' : 'member_invited';
    supabaseEventLogService.logAudit({
      workspaceId,
      boardId,
      action,
      entityTable: 'project_members',
      entityId: userId,
      beforeData: before ? { userId, role: before.role, boardId } : null,
      afterData: { userId, role, boardId },
    }).catch(error => {
      console.warn('[auditLog] Failed to write board member audit event:', error);
    });
  },

  removeBoardMember: async (workspaceId: string, boardId: string, userId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data: before, error: beforeError } = await supabase
      .from('project_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    assertNoError(beforeError);

    if (before) {
      await supabaseEventLogService.logAudit({
        workspaceId,
        boardId,
        action: 'member_removed',
        entityTable: 'project_members',
        entityId: userId,
        beforeData: { userId, role: before.role, boardId },
        afterData: null,
      }).catch(error => {
        console.warn('[auditLog] Failed to write board member removal audit event:', error);
      });
    }

    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('user_id', userId);
    assertNoError(error);
  },
};

export const supabaseBoardInviteService = {
  listPending: async (workspaceId: string, boardId: string): Promise<BoardInvite[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('board_invites')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    assertNoError(error);
    return ((data ?? []) as BoardInviteRow[]).map(row => mapBoardInvite(row, workspaceId, boardId));
  },

  create: async (
    workspaceId: string,
    boardId: string,
    input: BoardInviteCreateInput
  ): Promise<BoardInvite> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    assertNoError(userError);
    if (!userData.user?.id) throw new Error('A signed-in user is required to create a board invite.');

    const payload: BoardInviteInsert = {
      tenant_id: tenantId,
      project_id: projectId,
      email: input.email,
      invited_by: userData.user.id,
      status: 'pending',
      default_role: input.defaultRole ?? 'member',
      token_hash: input.tokenHash,
      expires_at: new Date(input.expiresAt).toISOString(),
    };
    const { data, error } = await supabase
      .from('board_invites')
      .insert(payload)
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created board invite.');
    const invite = mapBoardInvite(data as BoardInviteRow, workspaceId, boardId);
    supabaseEventLogService.logAudit({
      workspaceId,
      boardId,
      action: 'invite_created',
      entityTable: 'board_invites',
      entityId: invite.id,
      beforeData: null,
      afterData: {
        inviteId: invite.id,
        email: invite.email,
        status: invite.status,
        defaultRole: invite.defaultRole,
        expiresAt: invite.expiresAt,
      },
    }).catch(error => {
      console.warn('[auditLog] Failed to write board invite created audit event:', error);
    });
    return invite;
  },

  revoke: async (workspaceId: string, boardId: string, inviteId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data: before, error: beforeError } = await supabase
      .from('board_invites')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('id', inviteId)
      .maybeSingle();
    assertNoError(beforeError);

    const { data: revoked, error } = await supabase
      .from('board_invites')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('id', inviteId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    assertNoError(error);

    if (before && revoked) {
      supabaseEventLogService.logAudit({
        workspaceId,
        boardId,
        action: 'invite_revoked',
        entityTable: 'board_invites',
        entityId: inviteId,
        beforeData: {
          inviteId,
          email: before.email,
          status: before.status,
          defaultRole: before.default_role,
          expiresAt: toTimestamp(before.expires_at),
        },
        afterData: {
          inviteId,
          email: revoked.email,
          status: revoked.status,
          defaultRole: revoked.default_role,
          revokedAt: toTimestamp(revoked.revoked_at),
        },
      }).catch(error => {
        console.warn('[auditLog] Failed to write board invite revoked audit event:', error);
      });
    }
  },

  accept: async (input: BoardInviteAcceptInput): Promise<BoardInvite> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('accept_board_invite', {
      invite_token_hash: await hashBoardInviteToken(input.token),
    });
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the accepted board invite.');
    const row = data as BoardInviteRow;
    const [{ data: tenant, error: tenantError }, { data: project, error: projectError }] = await Promise.all([
      supabase
        .from('tenants')
        .select('id,legacy_workspace_id')
        .eq('id', row.tenant_id)
        .maybeSingle(),
      supabase
        .from('projects')
        .select('id,legacy_board_id')
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.project_id)
        .maybeSingle(),
    ]);
    assertNoError(tenantError);
    assertNoError(projectError);
    return mapBoardInvite(
      row,
      tenant ? legacyOrId(tenant.id, tenant.legacy_workspace_id) : row.tenant_id,
      project ? legacyOrId(project.id, project.legacy_board_id) : row.project_id
    );
  },
};

export const supabaseNodeService = {
  listByProject: async (workspaceId: string, boardId: string): Promise<TaskNode[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('wbs_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    assertNoError(error);
    const nodeIdByDbId = new Map((data ?? []).map(item => [item.id, legacyOrId(item.id, item.legacy_node_id)]));

    let tagRows: TaskTagRow[] = [];
    let assignmentRows: WbsItemTagAssignment[] = [];
    try {
      const [tagResult, assignmentResult] = await Promise.all([
        supabase
          .from('task_tags')
          .select('*')
          .eq('tenant_id', tenantId),
        supabase
          .from('wbs_item_tags')
          .select('item_id,tag_id')
          .eq('tenant_id', tenantId)
          .eq('project_id', projectId),
      ]);
      const tagsUnavailable = assertNoTagTableError(tagResult.error) || assertNoTagTableError(assignmentResult.error);
      if (!tagsUnavailable) {
        tagRows = tagResult.data ?? [];
        assignmentRows = (assignmentResult.data ?? []) as WbsItemTagAssignment[];
      }
    } catch (error) {
      if (!isMissingTagTableError(error)) throw error;
      console.warn('[supabaseNodeService] Tag tables are not available; loading tasks without tags.');
    }

    const tagIdByDbId = new Map(tagRows.map(tag => [tag.id, legacyOrId(tag.id, tag.legacy_tag_id)]));
    const tagIdsByItemId = new Map<string, string[]>();
    assignmentRows.forEach(assignment => {
      const tagId = tagIdByDbId.get(assignment.tag_id) || assignment.tag_id;
      tagIdsByItemId.set(assignment.item_id, [...(tagIdsByItemId.get(assignment.item_id) || []), tagId]);
    });

    return (data ?? []).map(item => mapWbsItemToTaskNode(
      item,
      nodeIdByDbId,
      workspaceId,
      boardId,
      tagIdsByItemId.get(item.id) || []
    ));
  },

  create: async (workspaceId: string, boardId: string, node: TaskNode): Promise<TaskNode> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const insert = await taskNodeToInsert(tenantId, projectId, node);
    const { data, error } = await supabase
      .from('wbs_items')
      .insert(insert)
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created WBS item.');
    if (node.tagIds?.length) {
      await supabaseTagService.setNodeTags(workspaceId, boardId, mapWbsItemToTaskNode(data, new Map(), workspaceId, boardId).id, node.tagIds);
    }
    return mapWbsItemToTaskNode(data, new Map(), workspaceId, boardId);
  },

  update: async (workspaceId: string, boardId: string, nodeId: string, updates: Partial<TaskNode>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const updatePayload: WbsItemInsert = {};
    if ('parentId' in updates) updatePayload.parent_id = await resolveNodeId(tenantId, projectId, updates.parentId);
    if ('title' in updates) updatePayload.title = updates.title;
    if ('description' in updates) updatePayload.description = updates.description ?? null;
    if ('detailNotes' in updates) updatePayload.detail_notes = updates.detailNotes as unknown as Json;
    if ('status' in updates) updatePayload.status = updates.status;
    if ('assigneeId' in updates) updatePayload.assignee_id = isUuid(updates.assigneeId) ? updates.assigneeId : null;
    if ('collaboratorIds' in updates) updatePayload.collaborator_ids = (updates.collaboratorIds ?? []).filter(isUuid);
    if ('startDate' in updates) updatePayload.start_date = toDate(updates.startDate);
    if ('endDate' in updates) updatePayload.end_date = toDate(updates.endDate);
    if ('isDurationLocked' in updates) updatePayload.is_duration_locked = updates.isDurationLocked;
    if ('nodeType' in updates) updatePayload.item_type = updates.nodeType;
    if ('kanbanStageId' in updates) updatePayload.kanban_stage_id = updates.kanbanStageId ?? null;
    if ('order' in updates) updatePayload.sort_order = updates.order;
    if ('isArchived' in updates) updatePayload.is_archived = updates.isArchived;
    if (Object.keys(updatePayload).length > 0) {
      const query = supabase
        .from('wbs_items')
        .update(updatePayload)
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId);
      const { error } = await (isUuid(nodeId)
        ? query.eq('id', nodeId)
        : query.eq('legacy_node_id', nodeId));
      assertNoError(error);
    }
    if ('tagIds' in updates) {
      await supabaseTagService.setNodeTags(workspaceId, boardId, nodeId, updates.tagIds ?? []);
    }
  },

  delete: async (workspaceId: string, boardId: string, nodeId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const query = supabase
      .from('wbs_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    const { error } = await (isUuid(nodeId)
      ? query.eq('id', nodeId)
      : query.eq('legacy_node_id', nodeId));
    assertNoError(error);
  },

  batchUpdate: async (
    workspaceId: string,
    boardId: string,
    updates: { id: string; data: Partial<TaskNode> }[]
  ): Promise<void> => {
    requireSupabase();
    await Promise.all(
      updates.map(({ id, data }) =>
        supabaseNodeService.update(workspaceId, boardId, id, data)
      )
    );
  },

  deleteAllByProject: async (workspaceId: string, boardId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { error } = await supabase
      .from('wbs_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    assertNoError(error);
  },

  upsert: async (workspaceId: string, boardId: string, node: TaskNode): Promise<TaskNode> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const insert = await taskNodeToInsert(tenantId, projectId, node);
    const { data, error } = await supabase
      .from('wbs_items')
      .upsert(insert)
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the upserted WBS item.');
    if (node.tagIds) {
      await supabaseTagService.setNodeTags(workspaceId, boardId, mapWbsItemToTaskNode(data, new Map(), workspaceId, boardId).id, node.tagIds);
    }
    return mapWbsItemToTaskNode(data, new Map(), workspaceId, boardId);
  },
};

export const supabaseTagService = {
  listByWorkspace: async (workspaceId: string): Promise<TaskTag[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase
      .from('task_tags')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });
    if (assertNoTagTableError(error)) return [];
    return (data ?? []).map(tag => mapTaskTag(tag, workspaceId));
  },

  create: async (workspaceId: string, tag: TaskTag): Promise<TaskTag> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const payload: TaskTagInsert = {
      id: isUuid(tag.id) ? tag.id : undefined,
      tenant_id: tenantId,
      legacy_tag_id: isUuid(tag.id) ? null : tag.id,
      name: tag.name,
      color: tag.color,
      sort_order: tag.order,
      metadata: {
        legacyWorkspaceId: tag.workspaceId,
      } satisfies Json,
    };
    const { data, error } = await supabase
      .from('task_tags')
      .insert(payload)
      .select()
      .single();
    if (assertNoTagTableError(error)) return tag;
    if (!data) throw new Error('Supabase did not return the created task tag.');
    return mapTaskTag(data, workspaceId);
  },

  update: async (workspaceId: string, tagId: string, updates: Partial<TaskTag>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const updatePayload: TaskTagInsert = {};
    if ('name' in updates) updatePayload.name = updates.name;
    if ('color' in updates) updatePayload.color = updates.color;
    if ('order' in updates) updatePayload.sort_order = updates.order;
    const query = supabase
      .from('task_tags')
      .update(updatePayload)
      .eq('tenant_id', tenantId);
    const { error } = await (isUuid(tagId)
      ? query.eq('id', tagId)
      : query.eq('legacy_tag_id', tagId));
    assertNoTagTableError(error);
  },

  delete: async (workspaceId: string, tagId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const query = supabase
      .from('task_tags')
      .delete()
      .eq('tenant_id', tenantId);
    const { error } = await (isUuid(tagId)
      ? query.eq('id', tagId)
      : query.eq('legacy_tag_id', tagId));
    assertNoTagTableError(error);
  },

  setNodeTags: async (workspaceId: string, boardId: string, nodeId: string, tagIds: string[]): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const itemId = await requireNodeId(tenantId, projectId, nodeId);
    const { error: deleteError } = await supabase
      .from('wbs_item_tags')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('item_id', itemId);
    if (assertNoTagTableError(deleteError)) return;

    const uniqueTagIds = Array.from(new Set(tagIds));
    if (uniqueTagIds.length === 0) return;

    const resolvedTagIds = await Promise.all(uniqueTagIds.map(tagId => resolveTagId(tenantId, tagId)));
    const rows = resolvedTagIds.map(tagId => ({
      tenant_id: tenantId,
      project_id: projectId,
      item_id: itemId,
      tag_id: tagId,
    }));

    const { error: insertError } = await supabase
      .from('wbs_item_tags')
      .insert(rows);
    assertNoTagTableError(insertError);
  },
};

export const supabaseDependencyService = {
  listByProject: async (workspaceId: string, boardId: string): Promise<Dependency[]> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('wbs_dependencies')
      .select(dependencySelect)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    assertNoError(error);
    return ((data ?? []) as unknown as WbsDependencyWithNodes[]).map(mapDependency);
  },

  create: async (workspaceId: string, boardId: string, dependency: Omit<Dependency, 'id'>): Promise<Dependency> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { data, error } = await supabase
      .from('wbs_dependencies')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        from_item_id: await requireNodeId(tenantId, projectId, dependency.fromId),
        from_side: dependency.fromSide,
        to_item_id: await requireNodeId(tenantId, projectId, dependency.toId),
        to_side: dependency.toSide,
        offset_days: dependency.offset ?? 0,
      })
      .select(dependencySelect)
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created dependency.');
    return mapDependency(data as unknown as WbsDependencyWithNodes);
  },

  set: async (workspaceId: string, boardId: string, dependency: Dependency): Promise<Dependency> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const payload = {
      id: isUuid(dependency.id) ? dependency.id : undefined,
      legacy_dependency_id: isUuid(dependency.id) ? null : dependency.id,
      tenant_id: tenantId,
      project_id: projectId,
      from_item_id: await requireNodeId(tenantId, projectId, dependency.fromId),
      from_side: dependency.fromSide,
      to_item_id: await requireNodeId(tenantId, projectId, dependency.toId),
      to_side: dependency.toSide,
      offset_days: dependency.offset ?? 0,
    };
    const { data, error } = await supabase
      .from('wbs_dependencies')
      .upsert(payload, isUuid(dependency.id) ? undefined : { onConflict: 'tenant_id,project_id,legacy_dependency_id' })
      .select(dependencySelect)
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the upserted dependency.');
    return mapDependency(data as unknown as WbsDependencyWithNodes);
  },

  update: async (workspaceId: string, boardId: string, dependencyId: string, updates: Partial<Dependency>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const updatePayload: Partial<WbsDependencyRow> = {};
    if ('fromId' in updates && updates.fromId) updatePayload.from_item_id = await requireNodeId(tenantId, projectId, updates.fromId);
    if ('fromSide' in updates) updatePayload.from_side = updates.fromSide;
    if ('toId' in updates && updates.toId) updatePayload.to_item_id = await requireNodeId(tenantId, projectId, updates.toId);
    if ('toSide' in updates) updatePayload.to_side = updates.toSide;
    if ('offset' in updates) updatePayload.offset_days = updates.offset;
    const query = supabase
      .from('wbs_dependencies')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    const { error } = await (isUuid(dependencyId)
      ? query.eq('id', dependencyId)
      : query.eq('legacy_dependency_id', dependencyId));
    assertNoError(error);
  },

  delete: async (workspaceId: string, boardId: string, dependencyId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const query = supabase
      .from('wbs_dependencies')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    const { error } = await (isUuid(dependencyId)
      ? query.eq('id', dependencyId)
      : query.eq('legacy_dependency_id', dependencyId));
    assertNoError(error);
  },

  deleteAllByProject: async (workspaceId: string, boardId: string): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(workspaceId);
    const projectId = await resolveProjectId(tenantId, boardId);
    const { error } = await supabase
      .from('wbs_dependencies')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    assertNoError(error);
  },
};

export const supabaseEventLogService = {
  logActivity: async (event: Omit<ActivityEvent, 'id' | 'actorId' | 'createdAt'>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(event.workspaceId);
    const projectId = event.boardId ? await resolveProjectId(tenantId, event.boardId) : null;
    const entityId = await resolveEventEntityId(tenantId, projectId, event.entityTable, event.entityId);
    const payload = withLegacyEntityPayload(event.payload, event.entityId);
    const { error } = await supabase.rpc('log_activity_event', {
      target_tenant_id: tenantId,
      target_project_id: projectId,
      activity_event_type: event.eventType,
      activity_entity_table: event.entityTable,
      activity_entity_id: entityId,
      activity_payload: stripUndefinedForJson(payload) ?? {},
    });
    assertNoError(error);
  },

  logAudit: async (entry: Omit<AuditLogEntry, 'id' | 'actorId' | 'createdAt'>): Promise<void> => {
    requireSupabase();
    const tenantId = await resolveWorkspaceId(entry.workspaceId);
    const projectId = entry.boardId ? await resolveProjectId(tenantId, entry.boardId) : null;
    const entityId = await resolveEventEntityId(tenantId, projectId, entry.entityTable, entry.entityId);
    const beforeData = entry.beforeData === undefined || entry.beforeData === null
      ? null
      : withLegacyEntityPayload(entry.beforeData, entry.entityId);
    const afterData = entry.afterData === undefined || entry.afterData === null
      ? null
      : withLegacyEntityPayload(entry.afterData, entry.entityId);
    const { error } = await supabase.rpc('log_audit_event', {
      target_tenant_id: tenantId,
      target_project_id: projectId,
      audit_action: entry.action,
      audit_entity_table: entry.entityTable,
      audit_entity_id: entityId,
      audit_before_data: stripUndefinedForJson(beforeData),
      audit_after_data: stripUndefinedForJson(afterData),
    });
    assertNoError(error);
  },
};





