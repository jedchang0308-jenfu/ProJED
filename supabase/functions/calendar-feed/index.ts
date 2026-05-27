import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FEED_TASK_LIMIT, buildCalendarFeedIcs } from "./ics.mjs";

type SubscriptionFilters = {
  workspace_ids?: string[];
  assignee?: { type?: string; user_id?: string };
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
  assignee: filters.assignee ?? { type: "me" },
  dateTypes: Array.from(new Set((filters.date_types ?? []).filter((item) => DATE_TYPES.has(item)))),
});

const getAllowedTenantIds = async (subscription: CalendarSubscription) => {
  const { workspaceIds, assignee } = normalizeFilters(subscription.filters_json);
  if (workspaceIds.length === 0) return [];

  const { data: ownerMemberships, error: ownerMembershipsError } = await supabase
    .from("tenant_members")
    .select("tenant_id,user_id,role,status")
    .eq("user_id", subscription.owner_user_id)
    .eq("status", "active")
    .in("tenant_id", workspaceIds);
  if (ownerMembershipsError) throw ownerMembershipsError;

  const memberships = (ownerMemberships ?? []) as TenantMember[];
  let allowedTenantIds = memberships.map((membership) => membership.tenant_id);

  const assigneeUserId = assignee.type === "user" && assignee.user_id
    ? assignee.user_id
    : subscription.owner_user_id;

  if (assigneeUserId !== subscription.owner_user_id) {
    const adminTenantIds = memberships
      .filter((membership) => ADMIN_ROLES.has(membership.role))
      .map((membership) => membership.tenant_id);

    if (adminTenantIds.length === 0) return [];

    const { data: assigneeMemberships, error: assigneeMembershipsError } = await supabase
      .from("tenant_members")
      .select("tenant_id,user_id,role,status")
      .eq("user_id", assigneeUserId)
      .eq("status", "active")
      .in("tenant_id", adminTenantIds);
    if (assigneeMembershipsError) throw assigneeMembershipsError;

    const assigneeTenantIds = new Set(((assigneeMemberships ?? []) as TenantMember[]).map((item) => item.tenant_id));
    allowedTenantIds = adminTenantIds.filter((tenantId) => assigneeTenantIds.has(tenantId));
  }

  return allowedTenantIds;
};

const buildIcs = async (subscription: CalendarSubscription, allowedTenantIds: string[]) => {
  const { assignee, dateTypes } = normalizeFilters(subscription.filters_json);
  const assigneeUserId = assignee.type === "user" && assignee.user_id
    ? assignee.user_id
    : subscription.owner_user_id;

  if (allowedTenantIds.length === 0 || dateTypes.length === 0) {
    return buildCalendarFeedIcs({
      subscription,
      assigneeUserId,
    });
  }

  const { data: taskRows, error: taskError } = await supabase
    .from("wbs_items")
    .select("id,tenant_id,project_id,legacy_node_id,title,description,status,assignee_id,start_date,end_date,item_type,updated_at,metadata")
    .eq("assignee_id", assigneeUserId)
    .eq("is_archived", false)
    .neq("item_type", "group")
    .in("tenant_id", allowedTenantIds)
    .order("updated_at", { ascending: false })
    .limit(FEED_TASK_LIMIT);
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
    supabase.from("profiles").select("id,email,display_name").eq("id", assigneeUserId).maybeSingle(),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  if (projectResult.error) throw projectResult.error;
  if (assigneeResult.error) throw assigneeResult.error;

  const tenantNameById = new Map((tenantResult.data ?? []).map((tenant: any) => [tenant.id, tenant.name]));
  const projectNameById = new Map((projectResult.data ?? []).map((project: any) => [project.id, project.name]));
  const assigneeProfile = assigneeResult.data as { email: string | null; display_name: string | null } | null;
  return buildCalendarFeedIcs({
    subscription,
    items,
    dateTypes,
    tenantNameById,
    projectNameById,
    assigneeProfile,
    assigneeUserId,
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

    const allowedTenantIds = await getAllowedTenantIds(subscription);
    const ics = await buildIcs(subscription, allowedTenantIds);

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
