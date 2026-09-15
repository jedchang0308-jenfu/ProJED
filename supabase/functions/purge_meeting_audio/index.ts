import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveSupabaseFunctionKey } from "../_shared/supabaseApiKeys.mjs";

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", resolveSupabaseFunctionKey("secret"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = "meeting-audio";
const CLEANUP_LEASE_MS = 5 * 60 * 1000;
const PURGE_SECRET_HEADER = "x-projed-purge-secret";

const requirePurgeSecret = (request: Request) => {
  const expected = Deno.env.get("DEV123_PURGE_SECRET")?.trim();
  const supplied = request.headers.get(PURGE_SECRET_HEADER)?.trim();
  if (!expected || !supplied || supplied !== expected) throw new Error("PURGE_AUTH_REQUIRED");
};

const updateSegment = async (id: string, values: Record<string, unknown>) => {
  const { error } = await supabase.from("meeting_capture_segments").update(values).eq("id", id);
  if (error) throw error;
};

const updateCleanup = async (obligationId: string, values: Record<string, unknown>, leaseToken?: string) => {
  let query = supabase.schema("private").from("meeting_artifact_cleanup").update(values).eq("obligation_id", obligationId);
  if (leaseToken) query = query.eq("lease_token", leaseToken);
  const { data, error } = await query.select("obligation_id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CLEANUP_LEASE_LOST");
};

const claimCleanup = async (row: Record<string, any>) => {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const previousLeaseToken = row.lease_token ? String(row.lease_token) : null;
  const previousLeaseExpiresAt = row.lease_expires_at ? Date.parse(String(row.lease_expires_at)) : null;
  if (previousLeaseExpiresAt && previousLeaseExpiresAt > now) return null;
  const leaseToken = crypto.randomUUID();
  const attempts = Number(row.attempts ?? 0) + 1;
  let query = supabase.schema("private").from("meeting_artifact_cleanup")
    .update({ state: "deleting", lease_token: leaseToken, lease_expires_at: new Date(now + CLEANUP_LEASE_MS).toISOString(), attempts, updated_at: nowIso })
    .eq("obligation_id", row.obligation_id)
    .in("state", ["pending", "deleting", "failed", "unknown"])
    .lte("due_at", nowIso);
  if (previousLeaseToken) {
    query = query.eq("lease_token", previousLeaseToken).lte("lease_expires_at", nowIso);
  } else {
    query = query.is("lease_token", null).is("lease_expires_at", null);
  }
  const { data, error } = await query.select("obligation_id").maybeSingle();
  if (error) throw error;
  return data ? { leaseToken, attempts } : null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    requirePurgeSecret(request);
    const { data: captures, error: captureError } = await supabase.from("meeting_capture_sessions")
      .select("id,audio_expires_at").not("audio_expires_at", "is", null).lte("audio_expires_at", new Date().toISOString()).limit(100);
    if (captureError) throw captureError;
    let purged = 0;
    let providerCleanupPending = 0;
    const expiredCaptureIds = (captures ?? []).map((capture) => String(capture.id));
    if (expiredCaptureIds.length > 0) {
      const { data: segments, error } = await supabase.from("meeting_capture_segments")
        .select("id,object_path,capture_id,upload_state").in("capture_id", expiredCaptureIds).in("upload_state", ["pending", "uploading", "uploaded", "verified", "expired"]).limit(500);
      if (error) throw error;
      for (const segment of segments ?? []) {
        await updateSegment(String(segment.id), { upload_state: "expired", last_error: null });
        if (!segment.object_path) {
          await updateSegment(String(segment.id), { upload_state: "purged" });
          purged += 1;
          continue;
        }
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([segment.object_path]);
        if (removeError) {
          await updateSegment(String(segment.id), { last_error: removeError.message });
          continue;
        }
        await updateSegment(String(segment.id), { upload_state: "purged", last_error: null });
        purged += 1;
      }
    }

    const { data: cleanupRows, error: cleanupError } = await supabase.schema("private").from("meeting_artifact_cleanup")
      .select("obligation_id,object_locator,state,kind,attempts,lease_token,lease_expires_at").in("state", ["pending", "deleting", "failed", "unknown"]).lte("due_at", new Date().toISOString()).limit(100);
    if (cleanupError) throw cleanupError;
    for (const row of cleanupRows ?? []) {
      const claim = await claimCleanup(row);
      if (!claim) continue;
      const kind = String(row.kind);
      if (kind === "provider") {
        // Provider files must never be treated as deleted without a qualified
        // adapter that can identify and verify the remote object. Keeping this
        // obligation retryable is safer than silently skipping it or guessing
        // a provider-specific identifier.
        providerCleanupPending += 1;
        await updateCleanup(String(row.obligation_id), {
          state: "failed",
          attempts: claim.attempts,
          error_code: "PROVIDER_CLEANUP_ADAPTER_REQUIRED",
          due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          lease_token: null,
          lease_expires_at: null,
        }, claim.leaseToken);
        continue;
      }
      if (kind !== "storage") continue;
      if (!row.object_locator) {
        await updateCleanup(String(row.obligation_id), {
          state: "failed",
          attempts: claim.attempts,
          error_code: "STORAGE_LOCATOR_MISSING",
          due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          lease_token: null,
          lease_expires_at: null,
        }, claim.leaseToken);
        continue;
      }
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([String(row.object_locator)]);
      await updateCleanup(String(row.obligation_id), removeError
        ? { state: "failed", error_code: removeError.message, attempts: claim.attempts, due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(), lease_token: null, lease_expires_at: null }
        : { state: "deleted", object_locator: null, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(), lease_token: null, lease_expires_at: null },
      claim.leaseToken);
    }
    return Response.json({ purged, cleanupProcessed: (cleanupRows ?? []).length, providerCleanupPending });
  } catch (error) {
    if (error instanceof Error && error.message === "PURGE_AUTH_REQUIRED") {
      return Response.json({ error: "purge unauthorized" }, { status: 401 });
    }
    console.error("[purge_meeting_audio]", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "purge failed" }, { status: 500 });
  }
});
