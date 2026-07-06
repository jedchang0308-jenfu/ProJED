import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FEED_TASK_LIMIT, buildCalendarFeedIcs } from "./ics.mjs";

type SubscriptionFilters = {
  version?: number;
  workspace_ids?: string[];
  project_ids?: string[];
  scope_type?: string;
  v2_scope_type?: string;
  assignee?: {
    type?: string;
    user_id?: string;
    user_ids?: string[];
    include_unassigned?: boolean;
  };
  date_types?: string[];
  global_filter?: Partial<TaskFilterState>;
  board_overrides?: Record<string, BoardFilterOverride>;
};

type TaskFilterState = {
  statusFilters: Record<string, boolean>;
  dueWithinDays: number | null;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
  keyword: string;
};

type BoardFilterOverride = Partial<TaskFilterState> & {
  enabled?: boolean;
};

type CalendarSubscription = {
  id: string;
  owner_user_id: string;
  name: string;
  filters_json: SubscriptionFilters;
  is_active: boolean;
  expires_at: string | null;
};

type TenantMember = {
  tenant_id: string;
  user_id: string;
  role: string;
  status: string;
};

type ProjectMember = {
  tenant_id: string;
  project_id: string;
  user_id: string;
  role: string;
};

type ProjectRow = {
  id: string;
  tenant_id: string;
};

type WbsItem = {
  id: string;
  tenant_id: string;
  project_id: string;
  legacy_node_id: string | null;
  title: string;
  description: string | null;
  status: string;
  assignee_id: string | null;
  start_date: string | null;
  end_date: string | null;
  item_type: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type WbsItemWithTags = WbsItem & {
  tagIds: string[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = new Set(["owner", "admin", "project_manager"]);
const DATE_TYPES = new Set(["start_date", "due_date"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNASSIGNED_ASSIGNEE_FILTER = "__unassigned__";
const DEFAULT_STATUS_FILTERS: Record<string, boolean> = {
  todo: true,
  in_progress: true,
  delayed: true,
  completed: false,
  unsure: true,
  onhold: true,
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const hashString = async (message: string) => {
  const encoded = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const responseText = (body: string, status = 200, contentType = "text/plain; charset=utf-8") =>
  new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });

const extractToken = (req: Request) => {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  if (tokenFromQuery) return tokenFromQuery;
  const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return decodeURIComponent(segment.replace(/\.ics$/i, ""));
};

const isExpired = (expiresAt: string | null) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
    : [];

const normalizeTaskFilterState = (value?: Partial<TaskFilterState> | null): TaskFilterState => ({
  statusFilters: {
    ...DEFAULT_STATUS_FILTERS,
    ...(value?.statusFilters ?? {}),
  },
  dueWithinDays: typeof value?.dueWithinDays === "number" && Number.isFinite(value.dueWithinDays)
    ? value.dueWithinDays
    : null,
  selectedAssigneeIds: normalizeStringArray(value?.selectedAssigneeIds),
  selectedTagIds: normalizeStringArray(value?.selectedTagIds),
  keyword: typeof value?.keyword === "string" ? value.keyword : "",
});

const normalizeBoardOverrides = (value: SubscriptionFilters["board_overrides"] | undefined) => {
  const normalized: Record<string, BoardFilterOverride> = {};
  for (const [boardId, override] of Object.entries(value ?? {})) {
    if (!UUID_RE.test(boardId)) continue;
    if (override?.enabled === false) {
      normalized[boardId] = { enabled: false };
      continue;
    }
    normalized[boardId] = {
      ...normalizeTaskFilterState(override),
      enabled: true,
    };
  }
  return normalized;
};

const normalizeFilters = (filters: SubscriptionFilters) => {
  const isV2 = filters.version === 2 || filters.v2_scope_type === "all_accessible_boards_snapshot";
  return {
    version: isV2 ? 2 : 1,
    workspaceIds: Array.from(new Set((filters.workspace_ids ?? []).filter(Boolean))),
    projectIds: Array.from(new Set((filters.project_ids ?? []).filter((item) => UUID_RE.test(item)))),
    scopeType: ["board", "workspace", "custom"].includes(filters.scope_type ?? "")
      ? filters.scope_type ?? (isV2 ? "custom" : "workspace")
      : isV2 ? "custom" : "workspace",
    v2ScopeType: filters.v2_scope_type,
    assignee: filters.assignee ?? { type: "me" },
    dateTypes: Array.from(new Set((filters.date_types ?? []).filter((item) => DATE_TYPES.has(item)))),
    globalFilter: normalizeTaskFilterState(filters.global_filter),
    boardOverrides: normalizeBoardOverrides(filters.board_overrides),
  };
};

const getTodayInTaipei = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

const dateDiffInDays = (fromIsoDate: string, toIsoDate: string) => {
  const [fromYear, fromMonth, fromDay] = fromIsoDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toIsoDate.split("-").map(Number);
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toTime = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.floor((toTime - fromTime) / 86400000);
};

const hasTaskCalendarDate = (item: WbsItem, dateTypes: string[]) =>
  dateTypes.some((type) => type === "start_date" ? Boolean(item.start_date) : Boolean(item.end_date));

const matchesDueDateFilter = (item: WbsItem, dueWithinDays: number | null) => {
  if (dueWithinDays === null) return true;
  if (!item.end_date) return false;
  return dateDiffInDays(getTodayInTaipei(), item.end_date) <= dueWithinDays;
};

const matchesAssigneeFilter = (item: WbsItem, selectedAssigneeIds: string[]) => {
  if (selectedAssigneeIds.length === 0) return true;
  if (!item.assignee_id) return selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER);
  return selectedAssigneeIds.includes(item.assignee_id);
};

const matchesTagFilter = (item: WbsItemWithTags, selectedTagIds: string[]) => {
  if (selectedTagIds.length === 0) return true;
  return selectedTagIds.some((tagId) => item.tagIds.includes(tagId));
};

const matchesKeywordFilter = (item: WbsItem, keyword: string) => {
  const trimmed = keyword.trim().toLocaleLowerCase();
  if (!trimmed) return true;
  return item.title.toLocaleLowerCase().includes(trimmed);
};

const getEffectiveTaskFilter = (
  filters: ReturnType<typeof normalizeFilters>,
  projectId: string,
): TaskFilterState | null => {
  if (filters.version !== 2) return null;
  const override = filters.boardOverrides[projectId];
  if (override?.enabled === false) return null;
  return override ? normalizeTaskFilterState(override) : filters.globalFilter;
};

const matchesV2TaskFilters = (
  item: WbsItemWithTags,
  filters: ReturnType<typeof normalizeFilters>,
) => {
  if (filters.version !== 2) return true;
  const taskFilter = getEffectiveTaskFilter(filters, item.project_id);
  if (!taskFilter) return false;
  return Boolean(taskFilter.statusFilters[item.status || "todo"]) &&
    matchesDueDateFilter(item, taskFilter.dueWithinDays) &&
    matchesAssigneeFilter(item, taskFilter.selectedAssigneeIds) &&
    matchesTagFilter(item, taskFilter.selectedTagIds) &&
    matchesKeywordFilter(item, taskFilter.keyword);
};

const getSelectedTagIds = (filters: ReturnType<typeof normalizeFilters>) => {
  if (filters.version !== 2) return [];
  const ids = new Set(filters.globalFilter.selectedTagIds);
  for (const override of Object.values(filters.boardOverrides)) {
    if (override.enabled === false) continue;
    normalizeTaskFilterState(override).selectedTagIds.forEach((tagId) => ids.add(tagId));
  }
  return Array.from(ids);
};

const attachTaskTags = async (
  items: WbsItem[],
  filters: ReturnType<typeof normalizeFilters>,
): Promise<WbsItemWithTags[]> => {
  const selectedTagIds = getSelectedTagIds(filters);
  if (items.length === 0 || selectedTagIds.length === 0) {
    return items.map((item) => ({ ...item, tagIds: [] }));
  }

  const { data, error } = await supabase
    .from("wbs_item_tags")
    .select("item_id,tag_id")
    .in("item_id", items.map((item) => item.id))
    .in("tag_id", selectedTagIds);
  if (error) throw error;

  const tagsByItemId = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ item_id: string; tag_id: string }>) {
    tagsByItemId.set(row.item_id, [...(tagsByItemId.get(row.item_id) ?? []), row.tag_id]);
  }

  return items.map((item) => ({
    ...item,
    tagIds: tagsByItemId.get(item.id) ?? [],
  }));
};

const normalizeAssigneeSelection = (subscription: CalendarSubscription) => {
  const { assignee } = normalizeFilters(subscription.filters_json);
  if (assignee.type === "user" && assignee.user_id) {
    return {
      userIds: [assignee.user_id].filter((userId) => UUID_RE.test(userId)),
      includeUnassigned: false,
    };
  }

  if (assignee.type === "selected") {
    return {
      userIds: Array.from(new Set((assignee.user_ids ?? []).filter((userId) => UUID_RE.test(userId)))),
      includeUnassigned: Boolean(assignee.include_unassigned),
    };
  }

  return {
    userIds: [subscription.owner_user_id],
    includeUnassigned: false,
  };
};

const getAllowedTenantAndProjectScope = async (subscription: CalendarSubscription) => {
  const { workspaceIds, projectIds, scopeType } = normalizeFilters(subscription.filters_json);
  if (workspaceIds.length === 0) return { tenantIds: [], projectIds: [] };
  const assigneeSelection = normalizeAssigneeSelection(subscription);
  if (assigneeSelection.userIds.length === 0 && !assigneeSelection.includeUnassigned) {
    return { tenantIds: [], projectIds: [] };
  }

  const { data: ownerMemberships, error: ownerMembershipsError } = await supabase
    .from("tenant_members")
    .select("tenant_id,user_id,role,status")
    .eq("user_id", subscription.owner_user_id)
    .eq("status", "active")
    .in("tenant_id", workspaceIds);
  if (ownerMembershipsError) throw ownerMembershipsError;

  const memberships = (ownerMemberships ?? []) as TenantMember[];
  const memberTenantIds = Array.from(new Set(memberships.map((membership) => membership.tenant_id)));
  if (memberTenantIds.length === 0) return { tenantIds: [], projectIds: [] };

  const tenantAdminIds = new Set(
    memberships
      .filter((membership) => ADMIN_ROLES.has(membership.role))
      .map((membership) => membership.tenant_id)
  );

  const { data: projectRows, error: projectsError } = await supabase
    .from("projects")
    .select("id,tenant_id")
    .in("tenant_id", memberTenantIds);
  if (projectsError) throw projectsError;

  const projects = (projectRows ?? []) as ProjectRow[];
  if (projects.length === 0) return { tenantIds: [], projectIds: [] };

  const candidateProjectIds = projects.map((project) => project.id);
  const { data: projectMembershipRows, error: projectMembershipsError } = await supabase
    .from("project_members")
    .select("tenant_id,project_id,user_id,role")
    .eq("user_id", subscription.owner_user_id)
    .in("project_id", candidateProjectIds);
  if (projectMembershipsError) throw projectMembershipsError;

  const projectMemberships = (projectMembershipRows ?? []) as ProjectMember[];
  const projectMemberIds = new Set(projectMemberships.map((membership) => membership.project_id));
  const projectManagerIds = new Set(
    projectMemberships
      .filter((membership) => ADMIN_ROLES.has(membership.role))
      .map((membership) => membership.project_id)
  );

  const requiresManagePermission = assigneeSelection.includeUnassigned
    || assigneeSelection.userIds.some((userId) => userId !== subscription.owner_user_id);

  let readableProjects = projects.filter((project) =>
    tenantAdminIds.has(project.tenant_id) || projectMemberIds.has(project.id)
  );

  if (requiresManagePermission) {
    readableProjects = readableProjects.filter((project) =>
      tenantAdminIds.has(project.tenant_id) || projectManagerIds.has(project.id)
    );
  }

  if (scopeType === "board") {
    readableProjects = projectIds.length === 1
      ? readableProjects.filter((project) => project.id === projectIds[0])
      : [];
  } else if (scopeType === "custom" && projectIds.length > 0) {
    const selectedProjectIds = new Set(projectIds);
    readableProjects = readableProjects.filter((project) => selectedProjectIds.has(project.id));
  }

  let allowedTenantIds = Array.from(new Set(readableProjects.map((project) => project.tenant_id)));
  let allowedProjectIds = Array.from(new Set(readableProjects.map((project) => project.id)));

  if (allowedTenantIds.length === 0 || allowedProjectIds.length === 0) {
    return { tenantIds: [], projectIds: [] };
  }

  if (assigneeSelection.userIds.length > 0) {
    const { data: assigneeMemberships, error: assigneeMembershipsError } = await supabase
      .from("tenant_members")
      .select("tenant_id,user_id,role,status")
      .in("user_id", assigneeSelection.userIds)
      .eq("status", "active")
      .in("tenant_id", allowedTenantIds);
    if (assigneeMembershipsError) throw assigneeMembershipsError;

    const membershipKeys = new Set(
      ((assigneeMemberships ?? []) as TenantMember[]).map((item) => `${item.tenant_id}:${item.user_id}`)
    );
    allowedTenantIds = allowedTenantIds.filter((tenantId) =>
      assigneeSelection.userIds.every((userId) => membershipKeys.has(`${tenantId}:${userId}`))
    );
    const allowedTenantSet = new Set(allowedTenantIds);
    allowedProjectIds = allowedProjectIds.filter((projectId) => {
      const project = readableProjects.find((item) => item.id === projectId);
      return Boolean(project && allowedTenantSet.has(project.tenant_id));
    });
  }

  return {
    tenantIds: allowedTenantIds,
    projectIds: allowedProjectIds,
  };
};

const buildIcs = async (
  subscription: CalendarSubscription,
  allowedScope: { tenantIds: string[]; projectIds: string[] }
) => {
  const normalizedFilters = normalizeFilters(subscription.filters_json);
  const { dateTypes } = normalizedFilters;
  const assigneeSelection = normalizeAssigneeSelection(subscription);

  if (allowedScope.tenantIds.length === 0 || allowedScope.projectIds.length === 0 || dateTypes.length === 0) {
    return buildCalendarFeedIcs({
      subscription,
      assigneeUserId: assigneeSelection.userIds[0] ?? subscription.owner_user_id,
    });
  }

  let taskQuery = supabase
    .from("wbs_items")
    .select("id,tenant_id,project_id,legacy_node_id,title,description,status,assignee_id,start_date,end_date,item_type,updated_at,metadata")
    .eq("is_archived", false)
    .neq("item_type", "group")
    .in("tenant_id", allowedScope.tenantIds)
    .in("project_id", allowedScope.projectIds)
    .order("updated_at", { ascending: false })
    .limit(FEED_TASK_LIMIT);

  if (assigneeSelection.userIds.length > 0 && assigneeSelection.includeUnassigned) {
    taskQuery = taskQuery.or(`assignee_id.in.(${assigneeSelection.userIds.join(",")}),assignee_id.is.null`);
  } else if (assigneeSelection.userIds.length > 0) {
    taskQuery = taskQuery.in("assignee_id", assigneeSelection.userIds);
  } else if (assigneeSelection.includeUnassigned) {
    taskQuery = taskQuery.is("assignee_id", null);
  }

  const { data: taskRows, error: taskError } = await taskQuery;
  if (taskError) throw taskError;

  const taskLimitReached = (taskRows ?? []).length >= FEED_TASK_LIMIT;
  const itemsWithTags = await attachTaskTags((taskRows ?? []) as WbsItem[], normalizedFilters);
  const items = itemsWithTags.filter((item) =>
    hasTaskCalendarDate(item, dateTypes) && matchesV2TaskFilters(item, normalizedFilters)
  );

  const projectIds = Array.from(new Set(items.map((item) => item.project_id)));
  const tenantIds = Array.from(new Set(items.map((item) => item.tenant_id)));

  const [tenantResult, projectResult, assigneeResult] = await Promise.all([
    tenantIds.length
      ? supabase.from("tenants").select("id,name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("projects").select("id,name").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    assigneeSelection.userIds.length
      ? supabase.from("profiles").select("id,email,display_name").in("id", assigneeSelection.userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  if (projectResult.error) throw projectResult.error;
  if (assigneeResult.error) throw assigneeResult.error;

  const tenantNameById = new Map((tenantResult.data ?? []).map((tenant: any) => [tenant.id, tenant.name]));
  const projectNameById = new Map((projectResult.data ?? []).map((project: any) => [project.id, project.name]));
  const assigneeProfileById = new Map(
    ((assigneeResult.data ?? []) as Array<{ id: string; email: string | null; display_name: string | null }>)
      .map((profile) => [profile.id, { email: profile.email, display_name: profile.display_name }])
  );
  return buildCalendarFeedIcs({
    subscription,
    items,
    dateTypes,
    tenantNameById,
    projectNameById,
    assigneeProfileById,
    assigneeUserId: assigneeSelection.userIds[0] ?? subscription.owner_user_id,
    appBaseUrl: Deno.env.get("PROJED_APP_URL") ?? "",
    taskLimitReached,
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responseText("", 204);
  if (req.method !== "GET") return responseText("Method not allowed", 405);

  const token = extractToken(req);
  if (!token) return responseText("Calendar feed not found", 404);

  try {
    const tokenHash = await hashString(token);
    const { data, error } = await supabase
      .from("calendar_subscriptions")
      .select("id,owner_user_id,name,filters_json,is_active,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return responseText("Calendar feed not found", 404);

    const subscription = data as CalendarSubscription;
    if (!subscription.is_active || isExpired(subscription.expires_at)) {
      return responseText("Calendar feed is disabled", 410);
    }

    const allowedScope = await getAllowedTenantAndProjectScope(subscription);
    const ics = await buildIcs(subscription, allowedScope);

    await supabase
      .from("calendar_subscriptions")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", subscription.id);

    return responseText(ics, 200, "text/calendar; charset=utf-8");
  } catch (error) {
    console.error("[calendar-feed]", error);
    return responseText("Calendar feed error", 500);
  }
});
