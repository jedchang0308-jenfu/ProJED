import type {
  CalendarSubscriptionBoardFilterOverride,
  CalendarSubscriptionBoardFilterSnapshot,
  CalendarSubscriptionAssigneeFilter,
  CalendarSubscriptionDateType,
  CalendarSubscriptionFilters,
  CalendarSubscriptionScopeType,
  CalendarSubscriptionRow,
  Json,
  TenantRole,
} from './database.types';
import { normalizeTaskFilters } from '../../features/taskFilters';
import { configuredSupabaseUrl, isSupabaseConfigured, supabase } from './client';

export type CalendarSubscription = {
  id: string;
  name: string;
  filters: CalendarSubscriptionFilters;
  isActive: boolean;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarWorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: TenantRole;
  email: string | null;
  displayName: string | null;
};

export type CalendarWorkspaceRef = {
  id: string;
  appWorkspaceId: string;
  name: string;
};

export type CalendarBoardRef = {
  id: string;
  appBoardId: string;
  name: string;
  workspaceId: string;
  appWorkspaceId: string;
  workspaceName: string;
  path: string;
};

export type CalendarSubscriptionInput = {
  name: string;
  filters: CalendarSubscriptionFilters;
};

export type CalendarSubscriptionWithUrl = {
  subscription: CalendarSubscription;
  feedUrl: string;
};

const TOKEN_BYTES = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireSupabase = () => {
  if (!isSupabaseConfigured) {
    throw new Error('尚未設定 Supabase。請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。');
  }
};

const assertNoError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && UUID_RE.test(value));

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const generateToken = () => {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const mapSubscription = (row: CalendarSubscriptionRow): CalendarSubscription => ({
  id: row.id,
  name: row.name,
  filters: row.filters_json as unknown as CalendarSubscriptionFilters,
  isActive: row.is_active,
  expiresAt: row.expires_at,
  lastAccessedAt: row.last_accessed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeDateTypes = (dateTypes: CalendarSubscriptionDateType[] | undefined) =>
  Array.from(new Set((dateTypes ?? []).filter(
    (dateType): dateType is CalendarSubscriptionDateType => dateType === 'start_date' || dateType === 'due_date'
  )));

const normalizeAssigneeFilter = (
  assignee: CalendarSubscriptionAssigneeFilter | undefined
): CalendarSubscriptionAssigneeFilter => {
  const normalizedAssignee = assignee ?? { type: 'me' as const };
  if (normalizedAssignee.type !== 'selected') return normalizedAssignee;

  return {
    type: 'selected',
    user_ids: Array.from(new Set(normalizedAssignee.user_ids.filter(isUuid))),
    include_unassigned: Boolean(normalizedAssignee.include_unassigned),
  };
};

const unique = <T extends string>(items: T[]) => Array.from(new Set(items.filter(Boolean)));

const normalizeScopeType = (
  scopeType: CalendarSubscriptionScopeType | undefined
): CalendarSubscriptionScopeType => (
  scopeType === 'board' || scopeType === 'custom' || scopeType === 'workspace'
    ? scopeType
    : 'workspace'
);

const normalizeFilters = async (filters: CalendarSubscriptionFilters): Promise<CalendarSubscriptionFilters> => {
  if (filters.version === 3 || filters.v3_scope_type === 'per_board_filter_snapshot') {
    return normalizeV3Filters(filters);
  }

  if (filters.version === 2 || filters.v2_scope_type === 'all_accessible_boards_snapshot') {
    return normalizeV2Filters(filters);
  }

  const scopeType = normalizeScopeType(filters.scope_type);
  const resolvedWorkspaceIds = unique(await Promise.all(filters.workspace_ids.map(resolveWorkspaceId)));
  const projectRefs = await Promise.all(
    (filters.project_ids ?? []).map((projectId) => resolveBoardRef(projectId, resolvedWorkspaceIds))
  );
  const resolvedProjectIds = unique(projectRefs.map((project) => project.id));
  const projectWorkspaceIds = unique(projectRefs.map((project) => project.workspaceId));
  const base = {
    assignee: normalizeAssigneeFilter(filters.assignee),
    date_types: normalizeDateTypes(filters.date_types),
  };

  if (scopeType === 'board') {
    const project = projectRefs[0];
    if (!project || resolvedProjectIds.length !== 1) {
      throw new Error('目前看板訂閱需要剛好選擇一個看板。');
    }
    return {
      ...base,
      scope_type: 'board',
      workspace_ids: unique([...resolvedWorkspaceIds, project.workspaceId]),
      project_ids: [project.id],
    };
  }

  if (scopeType === 'custom') {
    return {
      ...base,
      scope_type: 'custom',
      workspace_ids: unique([...resolvedWorkspaceIds, ...projectWorkspaceIds]),
      ...(resolvedProjectIds.length > 0 ? { project_ids: resolvedProjectIds } : {}),
    };
  }

  return {
    ...base,
    scope_type: 'workspace',
    workspace_ids: resolvedWorkspaceIds,
  };
};

const normalizeBoardOverrides = async (
  overrides: CalendarSubscriptionFilters['board_overrides'] | undefined,
  resolvedWorkspaceIds: string[],
  resolvedProjectIds: string[],
): Promise<Record<string, CalendarSubscriptionBoardFilterOverride>> => {
  const normalized: Record<string, CalendarSubscriptionBoardFilterOverride> = {};
  if (!overrides) return normalized;

  for (const [boardId, override] of Object.entries(overrides)) {
    const boardRef = await resolveBoardRef(boardId, resolvedWorkspaceIds);
    if (!resolvedProjectIds.includes(boardRef.id)) {
      throw new Error(`看板條件不屬於此訂閱範圍：${boardRef.path}`);
    }

    if (override.enabled === false) {
      normalized[boardRef.id] = { enabled: false };
      continue;
    }

    normalized[boardRef.id] = {
      ...normalizeTaskFilters(override),
      enabled: true,
    };
  }

  return normalized;
};

const normalizeV2Filters = async (filters: CalendarSubscriptionFilters): Promise<CalendarSubscriptionFilters> => {
  const resolvedWorkspaceIds = unique(await Promise.all(filters.workspace_ids.map(resolveWorkspaceId)));
  const projectRefs = await Promise.all(
    (filters.project_ids ?? []).map((projectId) => resolveBoardRef(projectId, resolvedWorkspaceIds))
  );
  const resolvedProjectIds = unique(projectRefs.map((project) => project.id));
  const projectWorkspaceIds = unique(projectRefs.map((project) => project.workspaceId));
  const workspaceIds = unique([...resolvedWorkspaceIds, ...projectWorkspaceIds]);

  if (workspaceIds.length === 0 || resolvedProjectIds.length === 0) {
    throw new Error('新版行事曆訂閱至少需要一個可讀工作區與看板。');
  }

  const boardOverrides = await normalizeBoardOverrides(filters.board_overrides, workspaceIds, resolvedProjectIds);

  return {
    version: 2,
    v2_scope_type: 'all_accessible_boards_snapshot',
    scope_type: 'custom',
    workspace_ids: workspaceIds,
    project_ids: resolvedProjectIds,
    assignee: normalizeAssigneeFilter(filters.assignee),
    date_types: normalizeDateTypes(filters.date_types),
    global_filter: normalizeTaskFilters(filters.global_filter),
    ...(Object.keys(boardOverrides).length > 0 ? { board_overrides: boardOverrides } : {}),
  };
};

const normalizeV3Filters = async (filters: CalendarSubscriptionFilters): Promise<CalendarSubscriptionFilters> => {
  const inputProjectIds = unique(filters.project_ids ?? []);
  if (inputProjectIds.length === 0 || !filters.board_filters) {
    throw new Error('逐看板行事曆訂閱至少需要一張看板與完整條件快照。');
  }

  const resolvedWorkspaceIds = unique(await Promise.all(filters.workspace_ids.map(resolveWorkspaceId)));
  const projectRefs = await Promise.all(
    inputProjectIds.map((projectId) => resolveBoardRef(projectId, resolvedWorkspaceIds))
  );
  const resolvedProjectIds = unique(projectRefs.map((project) => project.id));
  if (resolvedProjectIds.length !== inputProjectIds.length) {
    throw new Error('逐看板行事曆訂閱包含重複看板。');
  }

  const inputBoardFilters = filters.board_filters;
  const inputSnapshotKeys = Object.keys(inputBoardFilters);
  const usedSnapshotKeys = new Set<string>();
  const normalizedBoardFilters: Record<string, CalendarSubscriptionBoardFilterSnapshot> = {};

  projectRefs.forEach((project, index) => {
    const inputProjectId = inputProjectIds[index];
    const snapshotKey = [inputProjectId, project.id, project.appBoardId]
      .find((candidate) => Boolean(candidate && inputBoardFilters[candidate]));
    if (!snapshotKey || usedSnapshotKeys.has(snapshotKey)) {
      throw new Error(`看板缺少獨立條件快照：${project.path}`);
    }
    const snapshot = inputBoardFilters[snapshotKey];
    if (!snapshot || typeof snapshot.included !== 'boolean') {
      throw new Error(`看板條件快照格式錯誤：${project.path}`);
    }
    usedSnapshotKeys.add(snapshotKey);
    const snapshotDateTypes = normalizeDateTypes(snapshot.date_types);
    if (snapshot.included && snapshotDateTypes.length === 0) {
      throw new Error(`看板至少需要一種事件日期：${project.path}`);
    }
    normalizedBoardFilters[project.id] = {
      included: snapshot.included,
      date_types: snapshotDateTypes,
      filters: normalizeTaskFilters(snapshot.filters),
    };
  });

  if (usedSnapshotKeys.size !== inputSnapshotKeys.length) {
    throw new Error('逐看板條件快照必須與訂閱看板完全一致。');
  }
  if (!Object.values(normalizedBoardFilters).some((snapshot) => snapshot.included)) {
    throw new Error('逐看板行事曆訂閱至少需要包含一張看板。');
  }

  return {
    version: 3,
    v3_scope_type: 'per_board_filter_snapshot',
    workspace_ids: unique([
      ...resolvedWorkspaceIds,
      ...projectRefs.map((project) => project.workspaceId),
    ]),
    project_ids: resolvedProjectIds,
    board_filters: normalizedBoardFilters,
  };
};

const toJson = (filters: CalendarSubscriptionFilters): Json => filters as unknown as Json;

export const getCalendarFeedUrl = (token: string) => {
  const configuredBase = import.meta.env.VITE_CALENDAR_FEED_BASE_URL as string | undefined;
  const base = configuredBase?.trim()
    || (configuredSupabaseUrl ? `${configuredSupabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed` : '');
  if (!base) throw new Error('尚未設定行事曆訂閱網址。');
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(token)}.ics`;
};

export const resolveWorkspaceId = async (workspaceId: string): Promise<string> => {
  requireSupabase();
  if (isUuid(workspaceId)) return workspaceId;

  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('legacy_workspace_id', workspaceId)
    .maybeSingle();
  assertNoError(error);
  if (!data?.id) throw new Error(`找不到工作區：${workspaceId}`);
  return data.id;
};

export const resolveBoardRef = async (
  boardId: string,
  workspaceIds: string[] = []
): Promise<CalendarBoardRef> => {
  requireSupabase();
  const resolvedWorkspaceIds = unique(await Promise.all(workspaceIds.map(resolveWorkspaceId)));

  let query = supabase
    .from('projects')
    .select('id,legacy_board_id,name,tenant_id')
    .limit(1);
  query = isUuid(boardId)
    ? query.eq('id', boardId)
    : query.eq('legacy_board_id', boardId);
  if (resolvedWorkspaceIds.length > 0) {
    query = query.in('tenant_id', resolvedWorkspaceIds);
  }

  const { data: projectData, error: projectError } = await query.maybeSingle();
  assertNoError(projectError);
  if (!projectData?.id) throw new Error(`找不到看板：${boardId}`);

  const { data: workspaceData, error: workspaceError } = await supabase
    .from('tenants')
    .select('id,legacy_workspace_id,name')
    .eq('id', projectData.tenant_id)
    .maybeSingle();
  assertNoError(workspaceError);

  const workspaceId = workspaceData?.id ?? projectData.tenant_id;
  const appWorkspaceId = workspaceData?.legacy_workspace_id || workspaceId;
  const workspaceName = workspaceData?.name ?? workspaceId.slice(0, 8);
  const appBoardId = projectData.legacy_board_id || projectData.id;

  return {
    id: projectData.id,
    appBoardId,
    name: projectData.name,
    workspaceId,
    appWorkspaceId,
    workspaceName,
    path: `${workspaceName} / ${projectData.name}`,
  };
};

export const calendarSubscriptionService = {
  list: async (): Promise<CalendarSubscription[]> => {
    requireSupabase();
    const { data, error } = await supabase
      .from('calendar_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    assertNoError(error);
    return (data ?? []).map(mapSubscription);
  },

  listWorkspaceMembers: async (workspaceIds: string[]): Promise<CalendarWorkspaceMember[]> => {
    requireSupabase();
    const resolvedWorkspaceIds = await Promise.all(workspaceIds.map(resolveWorkspaceId));
    const uniqueWorkspaceIds = Array.from(new Set(resolvedWorkspaceIds));
    if (uniqueWorkspaceIds.length === 0) return [];

    const { data, error } = await supabase
      .from('tenant_members')
      .select('tenant_id,user_id,role,profiles(id,email,display_name)')
      .in('tenant_id', uniqueWorkspaceIds)
      .eq('status', 'active');
    assertNoError(error);

    return ((data ?? []) as any[]).map((row) => ({
      workspaceId: row.tenant_id,
      userId: row.user_id,
      role: row.role,
      email: row.profiles?.email ?? null,
      displayName: row.profiles?.display_name ?? null,
    }));
  },

  listWorkspaceRefs: async (): Promise<CalendarWorkspaceRef[]> => {
    requireSupabase();
    const { data, error } = await supabase
      .from('tenants')
      .select('id,legacy_workspace_id,name')
      .order('created_at', { ascending: true });
    assertNoError(error);
    return (data ?? []).map((tenant) => ({
      id: tenant.id,
      appWorkspaceId: tenant.legacy_workspace_id || tenant.id,
      name: tenant.name,
    }));
  },

  listBoardRefs: async (workspaceIds: string[] = []): Promise<CalendarBoardRef[]> => {
    requireSupabase();
    const resolvedWorkspaceIds = unique(await Promise.all(workspaceIds.map(resolveWorkspaceId)));
    let projectQuery = supabase
      .from('projects')
      .select('id,legacy_board_id,name,tenant_id,sort_order')
      .order('sort_order', { ascending: true });
    if (resolvedWorkspaceIds.length > 0) {
      projectQuery = projectQuery.in('tenant_id', resolvedWorkspaceIds);
    }

    const { data: projects, error: projectsError } = await projectQuery;
    assertNoError(projectsError);
    if (!projects?.length) return [];

    const tenantIds = unique(projects.map((project) => project.tenant_id));
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id,legacy_workspace_id,name')
      .in('id', tenantIds);
    assertNoError(tenantsError);

    const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
    return projects.map((project) => {
      const tenant = tenantById.get(project.tenant_id);
      const workspaceId = tenant?.id ?? project.tenant_id;
      const appWorkspaceId = tenant?.legacy_workspace_id || workspaceId;
      const workspaceName = tenant?.name ?? workspaceId.slice(0, 8);
      const appBoardId = project.legacy_board_id || project.id;
      return {
        id: project.id,
        appBoardId,
        name: project.name,
        workspaceId,
        appWorkspaceId,
        workspaceName,
        path: `${workspaceName} / ${project.name}`,
      };
    });
  },

  create: async (input: CalendarSubscriptionInput, ownerUserId: string): Promise<CalendarSubscriptionWithUrl> => {
    requireSupabase();
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const filters = await normalizeFilters(input.filters);
    const { data, error } = await supabase
      .from('calendar_subscriptions')
      .insert({
        owner_user_id: ownerUserId,
        name: input.name.trim(),
        token_hash: tokenHash,
        filters_json: toJson(filters),
      })
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('行事曆訂閱未建立成功。');
    return {
      subscription: mapSubscription(data),
      feedUrl: getCalendarFeedUrl(token),
    };
  },

  update: async (subscriptionId: string, input: CalendarSubscriptionInput): Promise<CalendarSubscription> => {
    requireSupabase();
    const filters = await normalizeFilters(input.filters);
    const { data, error } = await supabase
      .from('calendar_subscriptions')
      .update({
        name: input.name.trim(),
        filters_json: toJson(filters),
      })
      .eq('id', subscriptionId)
      .select()
      .single();
    assertNoError(error);
    if (!data) throw new Error('行事曆訂閱未更新成功。');
    return mapSubscription(data);
  },

  disable: async (subscriptionId: string): Promise<void> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('set_calendar_subscription_active', {
      target_subscription_id: subscriptionId,
      target_is_active: false,
    });
    assertNoError(error);
    if (!data) throw new Error('找不到可停用的行事曆訂閱。');
  },

  enable: async (subscriptionId: string): Promise<void> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('set_calendar_subscription_active', {
      target_subscription_id: subscriptionId,
      target_is_active: true,
    });
    assertNoError(error);
    if (!data) throw new Error('找不到可啟用的行事曆訂閱。');
  },

  regenerateToken: async (subscriptionId: string): Promise<string> => {
    requireSupabase();
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const { data, error } = await supabase.rpc('rotate_calendar_subscription_token', {
      target_subscription_id: subscriptionId,
      target_token_hash: tokenHash,
    });
    assertNoError(error);
    if (!data) throw new Error('找不到可重生連結的行事曆訂閱。');
    return getCalendarFeedUrl(token);
  },

  delete: async (subscriptionId: string): Promise<void> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('delete_calendar_subscription', {
      target_subscription_id: subscriptionId,
    });
    assertNoError(error);
    if (!data) throw new Error('找不到可刪除的行事曆訂閱。');
  },
};
