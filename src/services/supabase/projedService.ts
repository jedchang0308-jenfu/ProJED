import type { Board, Dependency, TaskNode, Workspace } from '../../types';
import { isSupabaseConfigured, supabase } from './client';
import type { Json, ProjectRow, TenantRow, WbsDependencyRow, WbsItemRow } from './database.types';

type WbsItemInsert = Partial<WbsItemRow>;
type WbsDependencyWithNodes = WbsDependencyRow & {
  from_item?: Pick<WbsItemRow, 'id' | 'legacy_node_id'> | null;
  to_item?: Pick<WbsItemRow, 'id' | 'legacy_node_id'> | null;
};

const requireSupabase = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && UUID_RE.test(value));

const toTimestamp = (value: string | null | undefined) => (value ? new Date(value).getTime() : undefined);
const toDate = (value: string | undefined) => (value && value.trim() ? value : null);

const assertNoError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const legacyOrId = (id: string, legacyId?: string | null) => legacyId || id;
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

const mapWbsItemToTaskNode = (item: WbsItemRow, nodeIdByDbId: Map<string, string> = new Map(), requestedWorkspaceId?: string, requestedBoardId?: string): TaskNode => {
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
  };
};

const mapDependency = (dep: WbsDependencyWithNodes): Dependency => ({
  id: legacyOrId(dep.id, dep.legacy_dependency_id),
  fromId: dep.from_item?.legacy_node_id || dep.from_item_id,
  fromSide: dep.from_side,
  toId: dep.to_item?.legacy_node_id || dep.to_item_id,
  toSide: dep.to_side,
  offset: dep.offset_days,
});

const resolveWorkspaceId = async (workspaceId: string): Promise<string> => {
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

const resolveProjectId = async (tenantId: string, projectId: string): Promise<string> => {
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
      tenant_name: title || 'Untitled workspace',
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
    const { data, error } = await supabase
      .from('projects')
      .insert({
        tenant_id: tenantId,
        name: title || 'Untitled board',
        sort_order: Date.now(),
      })
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('Supabase did not return the created project.');
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
    return (data ?? []).map(item => mapWbsItemToTaskNode(item, nodeIdByDbId, workspaceId, boardId));
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
    if ('startDate' in updates) updatePayload.start_date = toDate(updates.startDate);
    if ('endDate' in updates) updatePayload.end_date = toDate(updates.endDate);
    if ('isDurationLocked' in updates) updatePayload.is_duration_locked = updates.isDurationLocked;
    if ('nodeType' in updates) updatePayload.item_type = updates.nodeType;
    if ('kanbanStageId' in updates) updatePayload.kanban_stage_id = updates.kanbanStageId ?? null;
    if ('order' in updates) updatePayload.sort_order = updates.order;
    if ('isArchived' in updates) updatePayload.is_archived = updates.isArchived;
    const query = supabase
      .from('wbs_items')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId);
    const { error } = await (isUuid(nodeId)
      ? query.eq('id', nodeId)
      : query.eq('legacy_node_id', nodeId));
    assertNoError(error);
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
    return mapWbsItemToTaskNode(data, new Map(), workspaceId, boardId);
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






