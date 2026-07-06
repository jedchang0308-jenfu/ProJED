import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FEED_TASK_LIMIT, buildCalendarFeedIcs } from "./ics.mjs";

type SubscriptionFilters = {
  workspace_ids?: string[];
  project_ids?: string[];
  scope_type?: string;
  assignee?: {
    type?: string;
    user_id?: string;
    user_ids?: string[];
    include_unassigned?: boolean;
  };
  date_types?: string[];
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = new Set(["owner", "admin", "project_manager"]);
const DATE_TYPES = new Set(["start_date", "due_date"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const normalizeFilters = (filters: SubscriptionFilters) => ({
  workspaceIds: Array.from(new Set((filters.workspace_ids ?? []).filter(Boolean))),
  projectIds: Array.from(new Set((filters.project_ids ?? []).filter((item) => UUID_RE.test(item)))),
  scopeType: ["board", "workspace", "custom"].includes(filters.scope_type ?? "")
    ? filters.scope_type ?? "workspace"
    : "workspace",
  assignee: filters.assignee ?? { type: "me" },
  dateTypes: Array.from(new Set((filters.date_types ?? []).filter((item) => DATE_TYPES.has(item)))),
});

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
  const { dateTypes } = normalizeFilters(subscription.filters_json);
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
  const items = ((taskRows ?? []) as WbsItem[]).filter((item) =>
    (dateTypes.includes("start_date") && item.start_date)
    || (dateTypes.includes("due_date") && item.end_date)
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
