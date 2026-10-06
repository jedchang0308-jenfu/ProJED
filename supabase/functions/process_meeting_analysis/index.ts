import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveSupabaseFunctionKey } from "../_shared/supabaseApiKeys.mjs";

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", resolveSupabaseFunctionKey("secret"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MAX_ATTEMPTS = 2;
const RESERVATION_TWD_MICROS = 10_000_000;
const CONFIG_VERSION = "dev-123.v1";
const WORKER_SECRET_HEADER = "x-projed-worker-secret";

const requireWorkerSecret = (request: Request) => {
  const expected = Deno.env.get("DEV123_WORKER_SECRET")?.trim();
  const supplied = request.headers.get(WORKER_SECRET_HEADER)?.trim();
  if (!expected || !supplied || supplied !== expected) throw new Error("WORKER_AUTH_REQUIRED");
};

const hashText = async (text: string) => {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const tokenize = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 80));

const claimRun = async () => {
  const { data, error } = await supabase.schema("private").rpc("claim_meeting_analysis_run_v1");
  if (error) throw error;
  if (!data) return null;
  return { ...data, leaseToken: data.lease_token };
};

const reserveBudget = async (run: Record<string, any>) => {
  const month = String(run.budget_month ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).format(new Date()) + "-01");
  // The completion transaction reserves attempt 0 before the first claim;
  // subsequent claims use the next bounded attempt identity.
  const attemptId = `${run.id}:${Math.max(0, Number(run.attempt_count ?? 1) - 1)}`;
  const provider = String(run.provider_mode ?? "fake");
  const { data, error } = await supabase.schema("private").rpc("reserve_meeting_budget_v1", {
    p_budget_month: month,
    p_amount: RESERVATION_TWD_MICROS,
    p_attempt_id: attemptId,
    p_capture_id: run.capture_id,
    p_run_id: run.id,
    p_unit_identity: `${run.id}:${run.resume_stage}`,
    p_provider: provider,
    p_model: provider === "fake" ? "dev-123-fake" : "gemini-3.5-transcribe",
    p_price_version: CONFIG_VERSION,
  });
  if (error) throw error;
  return { allowed: Boolean(data), attemptId };
};

const buildFakeResolution = async (capture: Record<string, any>, run: Record<string, any>) => {
  const { data: existingTranscript, error: existingTranscriptError } = await supabase.from("meeting_transcript_segments")
    .select("id,transcript_revision_id").eq("producer_run_id", run.id).order("segment_index", { ascending: true }).limit(1).maybeSingle();
  if (existingTranscriptError) throw existingTranscriptError;
  if (existingTranscript) {
    const { data: existingResolution, error: existingResolutionError } = await supabase.from("meeting_segment_resolutions")
      .select("id").eq("capture_id", capture.id).eq("transcript_segment_id", existingTranscript.id).maybeSingle();
    if (existingResolutionError) throw existingResolutionError;
    return { transcriptId: existingTranscript.transcript_revision_id, resolutionId: existingResolution?.id ?? null, candidateCount: 0 };
  }
  const { data: record, error: recordError } = await supabase.from("knowledge_records").select("content,title,status").eq("id", capture.record_id).single();
  if (recordError) throw recordError;
  if (String(record.status) !== "draft") throw new Error("MEETING_RECORD_CONFLICT");
  const text = String(record.content || record.title || "").trim();
  const { data: tasks, error: taskError } = await supabase.from("wbs_items")
    .select("id,title,description,path,updated_at").eq("tenant_id", capture.tenant_id).eq("project_id", capture.project_id)
    .eq("is_archived", false).in("item_type", ["task", "milestone"]).limit(200);
  if (taskError) throw taskError;
  const { data: pointerIntervals, error: pointerError } = await supabase.from("meeting_pointer_intervals")
    .select("canonical_task_id,started_offset_ms,ended_offset_ms,visible").eq("capture_id", capture.id);
  if (pointerError) throw pointerError;
  const transcriptId = crypto.randomUUID();
  const durationMs = Math.max(1000, text.length * 60);
  const wordOffsets = Array.from(text.matchAll(/\S+/gu)).map((match, sourceWordIndex) => {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    return {
      text: match[0],
      start_ms: Math.floor(startIndex / Math.max(1, text.length) * durationMs),
      end_ms: Math.max(1, Math.ceil(endIndex / Math.max(1, text.length) * durationMs)),
      source_audio_segment_id: null,
      source_word_index: sourceWordIndex,
    };
  });
  const transcriptRow = {
    capture_id: capture.id, transcript_revision_id: transcriptId, producer_run_id: run.id, segment_index: 0,
    source_audio_ranges: [], start_offset_ms: 0, end_offset_ms: durationMs,
    raw_text: text, normalized_text: text, word_offsets: wordOffsets, source_hash: await hashText(text),
  };
  const { data: transcript, error: transcriptError } = await supabase.from("meeting_transcript_segments").insert(transcriptRow).select("*").single();
  if (transcriptError) throw transcriptError;
  const textTokens = tokenize(text);
  const pointerDurationByTask = new Map<string, number>();
  for (const interval of pointerIntervals ?? []) {
    const duration = Math.max(0, Number(interval.ended_offset_ms) - Number(interval.started_offset_ms));
    pointerDurationByTask.set(String(interval.canonical_task_id), (pointerDurationByTask.get(String(interval.canonical_task_id)) ?? 0) + duration);
  }
  const segmentDurationMs = Math.max(1, Number(transcript.end_offset_ms) - Number(transcript.start_offset_ms));
  const candidates = (tasks ?? []).map((task: Record<string, any>) => {
    const taskTokens = tokenize(`${task.title} ${task.description ?? ""}`);
    const overlap = Array.from(textTokens).filter(token => taskTokens.has(token)).length;
    const pointerFeature = Math.min(1, (pointerDurationByTask.get(String(task.id)) ?? 0) / segmentDurationMs);
    const matchingWordIndexes = wordOffsets
      .map((word, index) => ({ word, index }))
      .filter(({ word }) => Array.from(tokenize(word.text)).some(token => taskTokens.has(token)))
      .map(({ index }) => index);
    return {
      taskId: task.id, title: task.title, path: Array.isArray(task.path) ? task.path.join("/") : "",
      quoteRange: matchingWordIndexes.length > 0
        ? { fromWord: Math.min(...matchingWordIndexes), toWord: Math.max(...matchingWordIndexes) }
        : null,
      semanticScore: overlap / Math.max(1, textTokens.size), pointerFeature,
      source: overlap > 0 ? "lexical" : pointerFeature > 0 ? "pointer" : "lexical", snapshotHash: "",
    };
  }).filter((candidate: Record<string, any>) => candidate.semanticScore > 0 || candidate.pointerFeature > 0)
    .sort((a: Record<string, any>, b: Record<string, any>) => (b.semanticScore + b.pointerFeature) - (a.semanticScore + a.pointerFeature) || a.taskId.localeCompare(b.taskId)).slice(0, 12);
  for (const candidate of candidates) candidate.snapshotHash = await hashText(JSON.stringify(candidate));
  const { data: resolution, error: resolutionError } = await supabase.from("meeting_segment_resolutions").insert({
    capture_id: capture.id, transcript_segment_id: transcript.id, candidate_snapshot: candidates,
    latest_run_id: run.id, resolution_state: candidates.length ? "needs_review" : "pending", config_version: CONFIG_VERSION,
  }).select("*").single();
  if (resolutionError) throw resolutionError;
  if (candidates.length > 0) {
    const rows = candidates.map((candidate: Record<string, any>) => ({
      resolution_id: resolution.id, task_id: candidate.taskId, semantic_score: candidate.semanticScore,
      pointer_feature: candidate.pointerFeature, quote_range: candidate.quoteRange,
      ai_suggestion_version: CONFIG_VERSION,
    }));
    const { error: matchError } = await supabase.from("meeting_task_match_results").insert(rows);
    if (matchError) throw matchError;
  }
  return { transcriptId, resolutionId: resolution.id, candidateCount: candidates.length };
};

const processOne = async () => {
  const run = await claimRun();
  if (!run) return { status: "idle" };
  let attemptId: string | null = null;
  let capture: Record<string, any> | null = null;
  try {
    const { data, error: captureError } = await supabase.from("meeting_capture_sessions").select("*").eq("id", run.capture_id).single();
    if (captureError) throw captureError;
    capture = data;
    const mode = String(run.provider_mode ?? Deno.env.get("DEV123_PROVIDER_MODE") ?? "fake");
    // complete_meeting_upload_v1 reserves attempt 0 before the worker claims the
    // run.  A qualification-gated mode must release that reservation explicitly;
    // otherwise a fail-closed dispatch would leak the monthly budget.
    if (mode !== "fake") {
      attemptId = `${run.id}:${Math.max(0, Number(run.attempt_count ?? 1) - 1)}`;
      const { error: releaseError } = await supabase.schema("private").rpc("settle_meeting_budget_v1", {
        p_attempt_id: attemptId,
        p_actual_twd_micros: 0,
        p_usage_state: "known",
        p_outcome: "provider_qualification_required",
      });
      if (releaseError) throw releaseError;
      attemptId = null;
      throw new Error("PROVIDER_QUALIFICATION_REQUIRED");
    }
    const reservation = await reserveBudget(run);
    attemptId = reservation.attemptId;
    if (!reservation.allowed) {
      await supabase.from("meeting_analysis_runs").update({ state: "awaiting_budget", error_code: "BUDGET_CAP", lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", run.id).eq("lease_token", run.leaseToken);
      await supabase.from("meeting_capture_sessions").update({ state: "awaiting_budget", updated_at: new Date().toISOString() }).eq("id", capture.id).in("state", ["queued", "running", "awaiting_budget"]);
      return { status: "awaiting_budget", runId: run.id };
    }
    const result = await buildFakeResolution(capture, run);
    // Settle usage while the lease is still active.  If settlement fails, the
    // run remains retryable and the reserved/unknown attempt stays visible;
    // never publish a terminal ready run with an unsettled ledger row.
    if (attemptId) {
      const { error: settleError } = await supabase.schema("private").rpc("settle_meeting_budget_v1", {
        p_attempt_id: attemptId, p_actual_twd_micros: 0, p_usage_state: "known", p_outcome: "ready",
      });
      if (settleError) throw settleError;
    }
    const { data: completedRun, error: completeError } = await supabase.from("meeting_analysis_runs").update({
      state: "ready", resume_stage: "ready", transcript_revision_id: result.transcriptId,
      reserved_twd_micros: RESERVATION_TWD_MICROS, actual_twd_micros: 0,
      lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
    }).eq("id", run.id).eq("lease_token", run.leaseToken).select("id").maybeSingle();
    if (completeError) throw completeError;
    if (!completedRun) throw new Error("STALE_RUN_LEASE");
    const { data: readyCapture, error: readyCaptureError } = await supabase.from("meeting_capture_sessions").update({
      state: "ready", active_transcript_revision_id: result.transcriptId, updated_at: new Date().toISOString(),
    }).eq("id", capture.id).in("state", ["queued", "running", "awaiting_budget"]).select("id").maybeSingle();
    if (readyCaptureError) throw readyCaptureError;
    // Cancellation may win after the run is marked ready but before this
    // projection write.  A cancelled capture must never be resurrected by a
    // late worker response; the durable run/cleanup ledger remains authoritative.
    if (!readyCapture) throw new Error("CAPTURE_CANCELLED_OR_STATE_CHANGED");
    return { status: "ready", runId: run.id, candidateCount: result.candidateCount };
  } catch (error) {
    const attemptCount = Number(run.attempt_count ?? 0);
    const retryable = attemptCount < MAX_ATTEMPTS && error instanceof Error && error.message !== "PROVIDER_QUALIFICATION_REQUIRED";
    await supabase.from("meeting_analysis_runs").update({
      state: retryable ? "failed_retryable" : "failed_terminal", error_code: error instanceof Error ? error.message : "ANALYSIS_FAILED",
      next_attempt_at: new Date(Date.now() + (retryable ? 60_000 : 0)).toISOString(), lease_token: null, lease_expires_at: null,
    }).eq("id", run.id).eq("lease_token", run.leaseToken);
    if (capture) {
      await supabase.from("meeting_capture_sessions").update({
        state: retryable ? "failed_retryable" : "failed_terminal", updated_at: new Date().toISOString(),
      }).eq("id", capture.id).in("state", ["queued", "running", "awaiting_budget", "failed_retryable"]);
    }
    if (attemptId) {
      await supabase.schema("private").rpc("settle_meeting_budget_v1", {
        p_attempt_id: attemptId,
        p_actual_twd_micros: null,
        p_usage_state: "unknown",
        p_outcome: error instanceof Error ? error.message : "ANALYSIS_FAILED",
      });
    }
    console.error("[process_meeting_analysis]", error instanceof Error ? error.message : String(error));
    return { status: retryable ? "failed_retryable" : "failed_terminal", runId: run.id };
  }
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    requireWorkerSecret(request);
    return Response.json(await processOne());
  } catch (error) {
    if (error instanceof Error && error.message === "WORKER_AUTH_REQUIRED") {
      return Response.json({ error: "worker unauthorized" }, { status: 401 });
    }
    console.error("[process_meeting_analysis]", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "worker failed" }, { status: 500 });
  }
});
