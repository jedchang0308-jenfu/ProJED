import type {
  CalendarSubscriptionAssigneeFilter,
  CalendarSubscriptionDateType,
  CalendarSubscriptionFilters,
  CalendarSubscriptionRow,
  Json,
  TenantRole,
} from './database.types';
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
  workspaceId: string;
  name: string;
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

const normalizeDateTypes = (dateTypes: CalendarSubscriptionDateType[]) =>
  Array.from(new Set(dateTypes));

const normalizeAssigneeFilter = (
  assignee: CalendarSubscriptionAssigneeFilter
): CalendarSubscriptionAssigneeFilter => {
  if (assignee.type !== 'selected') return assignee;

  return {
    type: 'selected',
    user_ids: Array.from(new Set(assignee.user_ids.filter(isUuid))),
    include_unassigned: Boolean(assignee.include_unassigned),
  };
};

const normalizeFilters = async (filters: CalendarSubscriptionFilters): Promise<CalendarSubscriptionFilters> => {
  const workspaceIds = await Promise.all(filters.workspace_ids.map(resolveWorkspaceId));
  const scopeType = filters.scope_type || 'workspace';
  return {
    scope_type: scopeType,
    workspace_ids: workspaceIds,
    board_ids: scopeType === 'board' ? await resolveBoardIds(workspaceIds, filters.board_ids || []) : [],
    assignee: normalizeAssigneeFilter(filters.assignee),
    date_types: normalizeDateTypes(filters.date_types),
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

const resolveBoardIds = async (workspaceIds: string[], boardIds: string[] = []): Promise<string[]> => {
  requireSupabase();
  const uniqueBoardIds = Array.from(new Set(boardIds.filter(Boolean)));
  if (uniqueBoardIds.length === 0) return [];

  const resolvedIds = uniqueBoardIds.filter(isUuid);
  const legacyIds = uniqueBoardIds.filter((boardId) => !isUuid(boardId));
  if (legacyIds.length === 0) return resolvedIds;

  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds));
  if (uniqueWorkspaceIds.length === 0) return resolvedIds;

  const { data, error } = await supabase
    .from('projects')
    .select('id,legacy_board_id,tenant_id')
    .in('tenant_id', uniqueWorkspaceIds)
    .in('legacy_board_id', legacyIds);
  assertNoError(error);

  const resolvedLegacyIds = new Set((data ?? []).map((project) => project.legacy_board_id).filter(Boolean));
  const missingLegacyId = legacyIds.find((boardId) => !resolvedLegacyIds.has(boardId));
  if (missingLegacyId) throw new Error(`找不到看板：${missingLegacyId}`);

  return Array.from(new Set([
    ...resolvedIds,
    ...(data ?? []).map((project) => project.id),
  ]));
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

  listBoardRefs: async (): Promise<CalendarBoardRef[]> => {
    requireSupabase();
    const { data, error } = await supabase
      .from('projects')
      .select('id,legacy_board_id,tenant_id,name')
      .order('created_at', { ascending: true });
    assertNoError(error);
    return (data ?? []).map((project) => ({
      id: project.id,
      appBoardId: project.legacy_board_id || project.id,
      workspaceId: project.tenant_id,
      name: project.name,
    }));
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
    const { error } = await supabase
      .from('calendar_subscriptions')
      .update({ is_active: false })
      .eq('id', subscriptionId);
    assertNoError(error);
  },

  enable: async (subscriptionId: string): Promise<void> => {
    requireSupabase();
    const { error } = await supabase
      .from('calendar_subscriptions')
      .update({ is_active: true })
      .eq('id', subscriptionId);
    assertNoError(error);
  },

  regenerateToken: async (subscriptionId: string): Promise<string> => {
    requireSupabase();
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const { error } = await supabase
      .from('calendar_subscriptions')
      .update({ token_hash: tokenHash, is_active: true })
      .eq('id', subscriptionId);
    assertNoError(error);
    return getCalendarFeedUrl(token);
  },
};
