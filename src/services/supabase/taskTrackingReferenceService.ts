import { isSupabaseConfigured, supabase } from './client';
import { mapWbsItemToTaskNode, resolveWorkspaceId, resolveProjectId } from './projedService';
import type { WbsItemRow } from './database.types';
import { TaskTrackingError } from '../../features/taskTracking/errors';
import type {
  CreateTrackingReferenceInput,
  MoveTrackingReferenceInput,
  TaskTrackingReference,
  TrackingReferenceMutation,
  TrackingReferenceService,
} from '../../features/taskTracking/types';
import { getReferenceSubtree } from '../../features/taskTracking/model';

const requireSupabase = () => {
  if (!isSupabaseConfigured) throw new TaskTrackingError('SCHEMA_NOT_READY', 'Supabase 尚未設定。');
};

const readReference = (value: unknown, ids: { workspaceId?: string; boardId?: string; sourceBoardId?: string; taskId?: string } = {}): TaskTrackingReference => {
  const row = (value && typeof value === 'object' && 'reference' in value)
    ? (value as { reference?: unknown }).reference
    : value;
  if (!row || typeof row !== 'object') throw new TaskTrackingError('SCHEMA_NOT_READY', 'Supabase 未回傳有效的追蹤副本。');
  const item = row as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.task_id !== 'string' || typeof item.project_id !== 'string') {
    throw new TaskTrackingError('SCHEMA_NOT_READY', '追蹤副本 schema 尚未就緒。');
  }
  return {
    id: item.id,
    taskId: ids.taskId ?? String(item.task_id),
    workspaceId: ids.workspaceId ?? String(item.workspace_id ?? item.tenant_id ?? ''),
    boardId: ids.boardId ?? (item.board_id ? String(item.board_id) : item.project_id),
    sourceBoardId: ids.sourceBoardId ?? (item.source_project_id ? String(item.source_project_id) : undefined),
    parentPlacementId: item.parent_placement_id ? String(item.parent_placement_id) : null,
    order: Number(item.sort_order ?? 0),
    kanbanStageId: item.kanban_stage_id ? String(item.kanban_stage_id) : undefined,
    revision: Number(item.revision ?? 1),
    createdAt: item.created_at ? new Date(String(item.created_at)).getTime() : Date.now(),
    updatedAt: item.updated_at ? new Date(String(item.updated_at)).getTime() : Date.now(),
    removedAt: item.removed_at ? new Date(String(item.removed_at)).getTime() : undefined,
  };
};

const invoke = async (fn: string, args: Record<string, unknown>) => {
  requireSupabase();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const message = error.message || 'Supabase 追蹤副本操作失敗。';
    if (/OPERATION_ID_CONFLICT/i.test(message)) throw new TaskTrackingError('OPERATION_ID_CONFLICT', message);
    if (/permission|rls|unauthor/i.test(message)) throw new TaskTrackingError('PERMISSION_DENIED', message);
    if (/DUPLICATE_REFERENCE|duplicate/i.test(message)) throw new TaskTrackingError('DUPLICATE_REFERENCE', message);
    if (/CYCLE_DETECTED|cycle/i.test(message)) throw new TaskTrackingError('CYCLE_DETECTED', message);
    if (/SUBTREE_CHANGED/i.test(message)) throw new TaskTrackingError('REVISION_CONFLICT', message);
    if (/revision|conflict/i.test(message)) throw new TaskTrackingError('REVISION_CONFLICT', message);
    if (/schema|function|relation|does not exist/i.test(message)) throw new TaskTrackingError('SCHEMA_NOT_READY', message);
    throw new Error(message);
  }
  return data;
};

export const supabaseTaskTrackingReferenceService: TrackingReferenceService = {
  async getCapability() {
    if (!isSupabaseConfigured) return { supported: false, reason: 'schema_not_ready' };
    try {
      await invoke('get_task_tracking_reference_capability_v1', {});
      return { supported: true };
    } catch (error) {
      if (error instanceof TaskTrackingError && error.code === 'SCHEMA_NOT_READY') return { supported: false, reason: 'schema_not_ready' };
      throw error;
    }
  },

  async listByWorkspace(workspaceId) {
    const tenantId = await resolveWorkspaceId(workspaceId);
    const data: unknown = await invoke('list_task_tracking_references_v1', { p_tenant_id: tenantId });
    if (!Array.isArray(data)) return [];
    const [{ data: projects }, { data: tasks }] = await Promise.all([
      supabase.from('projects').select('id,legacy_board_id').eq('tenant_id', tenantId),
      supabase.from('wbs_items').select('id,legacy_node_id,project_id').eq('tenant_id', tenantId),
    ]);
    const boardIds = new Map((projects ?? []).map(project => [project.id, project.legacy_board_id || project.id]));
    const taskIds = new Map((tasks ?? []).map(task => [task.id, { id: task.legacy_node_id || task.id, projectId: task.project_id }]));
    return data.map(value => {
      const row = (value && typeof value === 'object' && 'project_id' in value) ? value as { project_id?: unknown } : {};
      const taskId = value && typeof value === 'object' && 'task_id' in value ? String((value as { task_id?: unknown }).task_id) : undefined;
      const task = taskId ? taskIds.get(taskId) : undefined;
      return readReference(value, { workspaceId, taskId: task?.id ?? taskId, sourceBoardId: task?.projectId ? String(boardIds.get(String(task.projectId)) ?? task.projectId) : undefined, boardId: row.project_id ? String(boardIds.get(String(row.project_id)) ?? row.project_id) : undefined });
    });
  },

  async listCanonicalTasksByIds(workspaceId, taskIds) {
    const requestedIds = Array.from(new Set(taskIds.filter(Boolean)));
    if (requestedIds.length === 0) return [];
    const tenantId = await resolveWorkspaceId(workspaceId);
    const uuidIds = requestedIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    const legacyIds = requestedIds.filter(id => !uuidIds.includes(id));
    const queries = [
      ...(uuidIds.length > 0 ? [supabase.from('wbs_items').select('*').eq('tenant_id', tenantId).in('id', uuidIds)] : []),
      ...(legacyIds.length > 0 ? [supabase.from('wbs_items').select('*').eq('tenant_id', tenantId).in('legacy_node_id', legacyIds)] : []),
    ];
    const results = await Promise.all(queries);
    results.forEach(result => {
      if (result.error) throw new Error(result.error.message);
    });
    const rows = results.flatMap(result => result.data ?? []) as unknown as WbsItemRow[];
    const nodeIdByDbId = new Map(rows.map(item => [item.id, item.legacy_node_id || item.id]));
    // Project rows can be hidden when the canonical source Board is private,
    // even though the task itself is readable through an active target-board
    // reference.  Prefer a visible legacy board id when available, then let
    // the mapper fall back to the task metadata's legacy board id, and only
    // use the database UUID as the final compatibility fallback.
    const projectIds = Array.from(new Set(rows.map(item => item.project_id).filter(Boolean)));
    const { data: projects, error: projectsError } = projectIds.length > 0
      ? await supabase
        .from('projects')
        .select('id,legacy_board_id')
        .eq('tenant_id', tenantId)
        .in('id', projectIds)
      : { data: [], error: null };
    if (projectsError) throw new Error(projectsError.message);
    const boardIdByProjectId = new Map(
      (projects ?? []).map(project => [project.id, project.legacy_board_id || project.id]),
    );
    return rows.map(item => mapWbsItemToTaskNode(
      item,
      nodeIdByDbId,
      workspaceId,
      boardIdByProjectId.get(item.project_id),
    ));
  },

  async create(workspaceId, input: CreateTrackingReferenceInput) {
    const tenantId = await resolveWorkspaceId(workspaceId);
    const data = await invoke('create_task_tracking_reference_v1', {
      p_operation_id: input.operationId ?? crypto.randomUUID(),
      p_source_primary_placement_id: input.sourcePlacementId,
      // A primary placement's revision is not available from the task action
      // surface.  Null deliberately asks the RPC to lock/read the current
      // primary revision instead of assuming every task is still at revision 1.
      p_expected_revision: input.expectedRevision ?? null,
      p_client_platform: input.clientPlatform ?? 'web',
      p_tenant_id: tenantId,
    });
    return readReference(data);
  },

  async move(workspaceId, input: MoveTrackingReferenceInput) {
    const tenantId = await resolveWorkspaceId(workspaceId);
    const targetProjectId = await resolveProjectId(tenantId, input.targetBoardId);
    const currentReferences = await this.listByWorkspace(workspaceId);
    const expectedSubtreeIds = getReferenceSubtree(currentReferences, input.sourcePlacementId).map(reference => reference.id);
    const data = await invoke('move_task_tracking_reference_v1', {
      p_operation_id: input.operationId ?? crypto.randomUUID(),
      p_reference_root_placement_id: input.sourcePlacementId,
      p_expected_subtree_ids: expectedSubtreeIds.length ? expectedSubtreeIds : [input.sourcePlacementId],
      p_expected_revision: input.expectedRevision ?? 1,
      p_target_project_id: targetProjectId,
      p_target_parent_placement_id: input.targetParentPlacementId,
      p_anchor_placement_id: input.anchorPlacementId ?? null,
      p_position: input.position ?? 'append',
      p_client_platform: input.clientPlatform ?? 'web',
      p_tenant_id: tenantId,
    });
    return readReference(data);
  },

  async remove(workspaceId, input: TrackingReferenceMutation) {
    const tenantId = await resolveWorkspaceId(workspaceId);
    const currentReferences = await this.listByWorkspace(workspaceId);
    const expectedSubtreeIds = getReferenceSubtree(currentReferences, input.sourcePlacementId).map(reference => reference.id);
    await invoke('remove_task_tracking_reference_v1', {
      p_operation_id: input.operationId ?? crypto.randomUUID(),
      p_reference_root_placement_id: input.sourcePlacementId,
      p_expected_subtree_ids: expectedSubtreeIds.length ? expectedSubtreeIds : [input.sourcePlacementId],
      p_expected_revision: input.expectedRevision ?? 1,
      p_client_platform: input.clientPlatform ?? 'web',
      p_tenant_id: tenantId,
    });
  },

  async restore(workspaceId, input) {
    const tenantId = await resolveWorkspaceId(workspaceId);
    const data = await invoke('restore_task_tracking_reference_v1', {
      p_operation_id: input.operationId ?? crypto.randomUUID(),
      p_reference_root_placement_id: input.sourcePlacementId,
      p_expected_revision: input.expectedRevision ?? 1,
      p_client_platform: input.clientPlatform ?? 'web',
      p_tenant_id: tenantId,
    });
    return readReference(data);
  },
};
