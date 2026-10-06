import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveSupabaseFunctionKey } from "../_shared/supabaseApiKeys.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const AUDIO_BUCKET = "meeting-audio";
const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const SIGNED_PLAYBACK_TTL_SECONDS = 60;
const MAX_AUDIO_SEGMENT_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_AUDIO_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

const serviceKey = resolveSupabaseFunctionKey("secret");
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const errorResponse = (message: string, status = 400) => json({ error: message }, status);

const publicError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Authentication required") return { code: "AUTH_REQUIRED", status: 401 };
  if (["Project write access required", "Meeting editor access required", "FORBIDDEN"].includes(message)) {
    return { code: "FORBIDDEN", status: 403 };
  }
  if (["MEETING_RECORD_CONFLICT", "SOURCE_CONFLICT", "RECORD_VERSION_CONFLICT", "REVIEW_VERSION_CONFLICT", "PROJECTION_REQUEST_CONFLICT"].includes(message)) {
    return { code: message, status: 409 };
  }
  if (/^[A-Z][A-Z0-9_]{2,79}$/.test(message)) return { code: message, status: 400 };
  return { code: "MEETING_CAPTURE_REQUEST_FAILED", status: 400 };
};

const getToken = (request: Request) => {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
};

const requireUuid = (value: unknown, field: string) => {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} is invalid`);
  return value;
};

const hashJson = async (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const requireAudioMime = (value: unknown) => {
  const mime = String(value ?? "audio/webm").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME.has(mime)) throw new Error("Audio MIME is not allowed");
  return mime;
};

const audioExtension = (mime: string) => mime === "audio/mp4" ? "m4a" : mime === "audio/mpeg" ? "mp3" : mime === "audio/wav" ? "wav" : mime === "audio/ogg" ? "ogg" : "webm";

const sourceVersionOf = (capture: Record<string, any>) => {
  const version = Number(capture.source_version ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new Error("Source version is invalid");
  return version;
};

const normalizeEpochManifest = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Epoch manifest is invalid");
  let previousEpoch = -1;
  let previousOffset = -1;
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Epoch manifest is invalid");
    const entry = item as Record<string, unknown>;
    const epoch = Number(entry.epoch);
    const captureOffsetMs = Number(entry.captureOffsetMs ?? entry.capture_offset_ms);
    const monotonicStart = Number(entry.monotonicStart ?? entry.monotonic_start);
    const durationMs = Number(entry.durationMs ?? entry.duration_ms ?? 0);
    const gapBeforeMs = Number(entry.gapBeforeMs ?? entry.gap_before_ms ?? 0);
    if (!Number.isInteger(epoch) || epoch < 0 || epoch <= previousEpoch
      || !Number.isFinite(captureOffsetMs) || captureOffsetMs < 0 || captureOffsetMs < previousOffset
      || !Number.isFinite(monotonicStart) || monotonicStart < 0
      || !Number.isFinite(durationMs) || durationMs < 0
      || !Number.isInteger(gapBeforeMs) || gapBeforeMs < 0) {
      throw new Error(`Epoch manifest is invalid at ${index}`);
    }
    previousEpoch = epoch;
    previousOffset = captureOffsetMs;
    return { epoch, captureOffsetMs, monotonicStart, durationMs, gapBeforeMs };
  });
};

const normalizeSourceGaps = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 4096) throw new Error("Source gaps are invalid");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Source gaps are invalid");
    const entry = item as Record<string, unknown>;
    const startOffsetMs = Number(entry.startOffsetMs ?? entry.start_offset_ms);
    const endOffsetMs = Number(entry.endOffsetMs ?? entry.end_offset_ms);
    const reason = String(entry.reason ?? entry.terminationReason ?? "gap").slice(0, 80);
    if (!Number.isInteger(startOffsetMs) || startOffsetMs < 0 || !Number.isInteger(endOffsetMs) || endOffsetMs <= startOffsetMs || !reason) {
      throw new Error(`Source gaps are invalid at ${index}`);
    }
    return { startOffsetMs, endOffsetMs, reason };
  });
};

const assertEpochManifestDoesNotRewind = (existing: unknown, next: Array<Record<string, number>>) => {
  const existingRows = Array.isArray(existing) ? existing : [];
  const existingLast = existingRows.length > 0 ? existingRows[existingRows.length - 1] as Record<string, unknown> : null;
  const nextLast = next.length > 0 ? next[next.length - 1] : null;
  if (!existingLast || !nextLast) return;
  const existingEpoch = Number(existingLast.epoch);
  const nextEpoch = Number(nextLast.epoch);
  if (Number.isInteger(existingEpoch) && Number.isInteger(nextEpoch) && nextEpoch < existingEpoch) throw new Error("EPOCH_CONFLICT");
  if (nextEpoch === existingEpoch && next.length < existingRows.length) throw new Error("EPOCH_CONFLICT");
};

const segmentPath = (capture: Record<string, any>, sourceVersion: number, segmentIndex: number, mime: string) => (
  `${capture.tenant_id}/${capture.project_id}/${capture.record_id}/${capture.id}/v${sourceVersion}/${segmentIndex}.${audioExtension(mime)}`
);

const resolveScope = async (tenantRef: string, projectRef: string) => {
  const tenantQuery = UUID_RE.test(tenantRef)
    ? supabase.from("tenants").select("id").eq("id", tenantRef).maybeSingle()
    : supabase.from("tenants").select("id").eq("legacy_workspace_id", tenantRef).maybeSingle();
  const { data: tenant, error: tenantError } = await tenantQuery;
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error("Workspace not found");
  const projectQuery = UUID_RE.test(projectRef)
    ? supabase.from("projects").select("id,tenant_id").eq("id", projectRef).eq("tenant_id", tenant.id).maybeSingle()
    : supabase.from("projects").select("id,tenant_id").eq("legacy_board_id", projectRef).eq("tenant_id", tenant.id).maybeSingle();
  const { data: project, error: projectError } = await projectQuery;
  if (projectError) throw projectError;
  if (!project) throw new Error("Project not found");
  return { tenantId: tenant.id as string, projectId: project.id as string };
};

type ActorAndProjectOptions = {
  allowPrivateOwner?: boolean;
};

const actorAndProject = async (
  request: Request,
  tenantRef: string,
  projectRef: string,
  options: ActorAndProjectOptions = {},
) => {
  const { tenantId, projectId } = await resolveScope(tenantRef, projectRef);
  const token = getToken(request);
  if (!token) throw new Error("Authentication required");
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) throw new Error("Authentication required");
  const userId = userData.user.id;
  const { data: membership, error } = await supabase
    .from("project_members")
    .select("project_id,tenant_id,user_id,role")
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!options.allowPrivateOwner && (!membership || ["suspended", "viewer"].includes(String(membership.role)))) throw new Error("Project write access required");
  return { userId, role: membership ? String(membership.role) : "private-owner", tenantId, projectId, membership };
};

const getCapture = async (captureId: string) => {
  const { data, error } = await supabase.from("meeting_capture_sessions").select("*").eq("id", captureId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Capture not found");
  return data;
};

const assertCaptureEditor = async (request: Request, capture: Record<string, any>) => {
  const actor = await actorAndProject(request, String(capture.tenant_id), String(capture.project_id), { allowPrivateOwner: true });
  const { data: record, error } = await supabase.from("knowledge_records")
    .select("id,record_type,visibility,created_by,recorded_by")
    .eq("id", capture.record_id).maybeSingle();
  if (error) throw error;
  if (!record || record.record_type !== "meeting") throw new Error("Meeting record not found");
  if (record.visibility === "private") {
    if (record.created_by !== actor.userId && record.recorded_by !== actor.userId) throw new Error("Meeting editor access required");
  } else if (!actor.membership || ["suspended", "viewer"].includes(String(actor.membership.role))) {
    throw new Error("Project write access required");
  }
  return { ...actor, record };
};

const toProgress = (row: Record<string, unknown>) => ({
  captureId: row.id,
  state: row.state,
  sourceVersion: row.source_version,
  lastProgressAt: row.last_progress_at ? Date.parse(String(row.last_progress_at)) : null,
  stoppedAt: row.stopped_at ? Date.parse(String(row.stopped_at)) : null,
  audioExpiresAt: row.audio_expires_at ? Date.parse(String(row.audio_expires_at)) : null,
  reviewRevision: Number(row.review_revision ?? 0),
  pointerLoss: Boolean(row.pointer_loss),
  sourceCompleteness: row.source_completeness,
  finalPointerSequence: row.final_pointer_sequence == null ? null : Number(row.final_pointer_sequence),
  sourceGaps: Array.isArray(row.source_gaps) ? row.source_gaps : [],
});

const begin = async (request: Request, body: Record<string, unknown>) => {
  const tenantRef = String(body.tenantId ?? "");
  const projectRef = String(body.projectId ?? "");
  const recordId = requireUuid(body.recordId, "recordId");
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 160) throw new Error("idempotencyKey is required");
  const actor = await actorAndProject(request, tenantRef, projectRef, { allowPrivateOwner: true });
  const { userId, tenantId, projectId } = actor;
  const { data: record, error: recordError } = await supabase
    .from("knowledge_records").select("id,tenant_id,project_id,record_type,created_by,recorded_by,visibility,status")
    .eq("id", recordId).maybeSingle();
  if (recordError) throw recordError;
  if (!record || record.tenant_id !== tenantId || record.project_id !== projectId || record.record_type !== "meeting") throw new Error("Meeting record not found");
  if (record.visibility === "private") {
    if (record.created_by !== userId && record.recorded_by !== userId) throw new Error("Meeting editor access required");
  } else if (!actor.membership || ["suspended", "viewer"].includes(String(actor.membership.role))) {
    throw new Error("Project write access required");
  }
  if (record.status !== "draft") throw new Error("MEETING_RECORD_CONFLICT");
  const { data: existing, error: existingError } = await supabase.from("meeting_capture_sessions")
    .select("*").eq("record_id", recordId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { captureId: existing.id, state: existing.state, sourceVersion: sourceVersionOf(existing), startedAt: existing.started_at ?? existing.created_at, idempotent: true };
  const { data: created, error } = await supabase.from("meeting_capture_sessions").insert({
    tenant_id: tenantId, project_id: projectId, record_id: recordId, created_by: userId,
    idempotency_key: idempotencyKey, state: "recording", last_progress_at: new Date().toISOString(),
    // Retention starts at the server-authoritative stop time, not at begin.
    audio_expires_at: null, started_at: new Date().toISOString(), stopped_reason: null,
  }).select("id,state,source_version,started_at").single();
  if (error) throw error;
  return { captureId: created.id, state: created.state, sourceVersion: Number(created.source_version ?? 1), startedAt: created.started_at, idempotent: false };
};

const progress = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (!["recording", "paused"].includes(String(capture.state))) throw new Error("Capture cannot accept progress");
  const epochManifest = normalizeEpochManifest(body.epochManifest ?? capture.epoch_manifest ?? []);
  assertEpochManifestDoesNotRewind(capture.epoch_manifest, epochManifest);
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    epoch_manifest: epochManifest,
    last_progress_at: new Date().toISOString(),
    state: capture.state === "paused" ? "paused" : "recording",
  }).eq("id", captureId).in("state", ["recording", "paused"]).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("MEETING_RECORD_CONFLICT");
  return toProgress(data);
};

const pause = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (capture.state !== "recording") throw new Error("Capture cannot be paused");
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    state: "paused", last_progress_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", captureId).eq("state", "recording").select("*").single();
  if (error) throw error;
  return toProgress(data);
};

const resume = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (capture.state !== "paused") throw new Error("Capture cannot be resumed");
  const epochManifest = normalizeEpochManifest(body.epochManifest ?? capture.epoch_manifest ?? []);
  assertEpochManifestDoesNotRewind(capture.epoch_manifest, epochManifest);
  const previousEpoch = Array.isArray(capture.epoch_manifest) && capture.epoch_manifest.length > 0
    ? Number((capture.epoch_manifest[capture.epoch_manifest.length - 1] as Record<string, unknown>).epoch)
    : -1;
  const nextEpoch = epochManifest.length > 0 ? Number(epochManifest[epochManifest.length - 1].epoch) : -1;
  if (nextEpoch <= previousEpoch) throw new Error("EPOCH_CONFLICT");
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    state: "recording", epoch_manifest: epochManifest, last_progress_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", captureId).eq("state", "paused").select("*").single();
  if (error) throw error;
  return toProgress(data);
};

const stop = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const expectedSourceVersion = Number(body.expectedSourceVersion);
  if (!Number.isInteger(expectedSourceVersion) || expectedSourceVersion < 1) throw new Error("SOURCE_VERSION_REQUIRED");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (sourceVersionOf(capture) !== expectedSourceVersion) throw new Error("SOURCE_CONFLICT");
  if (!["recording", "paused", "stopped"].includes(String(capture.state))) throw new Error("Capture cannot be stopped");
  const epochManifest = normalizeEpochManifest(body.epochManifest ?? capture.epoch_manifest ?? []);
  assertEpochManifestDoesNotRewind(capture.epoch_manifest, epochManifest);
  const finalPointerSequence = body.finalPointerSequence == null
    ? (capture.final_pointer_sequence == null ? null : Number(capture.final_pointer_sequence))
    : Number(body.finalPointerSequence);
  if (finalPointerSequence != null && (!Number.isInteger(finalPointerSequence) || finalPointerSequence < -1)) throw new Error("Pointer sequence is invalid");
  const sourceGaps = normalizeSourceGaps(body.gaps ?? body.sourceGaps ?? capture.source_gaps ?? []);
  // Ignore client wall-clock input.  The server owns the retention anchor so a
  // skewed or replayed browser cannot extend or shorten the seven-day window.
  const stoppedAt = capture.stopped_at ?? new Date().toISOString();
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    state: "stopped", stopped_at: stoppedAt,
    audio_expires_at: new Date(Date.parse(stoppedAt) + AUDIO_RETENTION_MS).toISOString(),
    epoch_manifest: epochManifest,
    final_pointer_sequence: finalPointerSequence,
    source_gaps: sourceGaps,
    pointer_loss: Boolean(body.pointerLoss),
    stopped_reason: String(body.reason ?? (capture.state === "paused" ? "paused-stop" : "user-stop")).slice(0, 120),
    last_progress_at: new Date().toISOString(),
  }).eq("id", captureId).in("state", ["recording", "paused", "stopped"]).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("MEETING_RECORD_CONFLICT");
  return toProgress(data);
};

const appendPointer = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (!["recording", "paused", "stopped", "uploading"].includes(String(capture.state))) throw new Error("Capture no longer accepts pointer evidence");
  const intervals = Array.isArray(body.intervals) ? body.intervals : [];
  if (intervals.length > 500) throw new Error("Pointer batch is too large");
  if (new TextEncoder().encode(JSON.stringify(intervals)).byteLength > 128 * 1024) throw new Error("Pointer batch is too large");
  const batchKey = String(body.batchKey ?? "");
  const digest = String(body.digest ?? "");
  if (!batchKey || !digest) throw new Error("Pointer batch identity is required");
  if (await hashJson(intervals) !== digest) throw new Error("Pointer batch digest mismatch");
  const taskIds = intervals.map((item) => String((item as Record<string, unknown>).canonicalTaskId ?? ""));
  if (taskIds.some((id) => !UUID_RE.test(id))) throw new Error("Pointer task identity is invalid");
  const sequences = intervals.map((item) => Number((item as Record<string, unknown>).sequence ?? -1));
  if (sequences.some((sequence) => !Number.isInteger(sequence) || sequence < 0) || new Set(sequences).size !== sequences.length) throw new Error("Pointer sequence is invalid");
  for (const item of intervals) {
    const value = item as Record<string, unknown>;
    const itemCaptureId = String(value.captureId ?? value.capture_id ?? captureId);
    const clockEpoch = Number(value.clockEpoch ?? value.clock_epoch);
    const started = Number(value.startedOffsetMs ?? value.started_offset_ms);
    const ended = Number(value.endedOffsetMs ?? value.ended_offset_ms);
    const surfaceKind = String(value.surfaceKind ?? value.surface_kind ?? "unknown").trim();
    const terminationReason = String(value.terminationReason ?? value.termination_reason ?? "flush").trim();
    if (itemCaptureId !== captureId || !Number.isInteger(clockEpoch) || clockEpoch < 0
      || !Number.isInteger(started) || started < 0 || !Number.isInteger(ended) || ended <= started
      || !surfaceKind || surfaceKind.length > 120 || !terminationReason || terminationReason.length > 80) {
      throw new Error("Pointer interval is invalid");
    }
  }
  if (taskIds.length > 0) {
    const { data: tasks, error } = await supabase.from("wbs_items").select("id")
      .eq("tenant_id", capture.tenant_id)
      .eq("project_id", capture.project_id)
      .eq("is_archived", false)
      .in("item_type", ["task", "milestone"])
      .in("id", taskIds);
    if (error) throw error;
    if ((tasks ?? []).length !== new Set(taskIds).size) throw new Error("Pointer task is outside project");
  }
  if (intervals.length > 0) {
    const { data: existingRows, error: existingError } = await supabase.from("meeting_pointer_intervals")
      .select("sequence,batch_key,batch_digest").eq("capture_id", captureId).in("sequence", sequences);
    if (existingError) throw existingError;
    if ((existingRows ?? []).some((row) => String(row.batch_digest) !== digest || String(row.batch_key) !== batchKey)) throw new Error("Pointer batch digest conflict");
    const rows = intervals.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        capture_id: captureId,
        clock_epoch: Number(value.clock_epoch ?? value.clockEpoch ?? 0),
        sequence: Number(value.sequence ?? 0),
        canonical_task_id: String(value.canonical_task_id ?? value.canonicalTaskId ?? ""),
        surface_kind: String(value.surface_kind ?? value.surfaceKind ?? "unknown"),
        started_offset_ms: Number(value.started_offset_ms ?? value.startedOffsetMs ?? 0),
        ended_offset_ms: Number(value.ended_offset_ms ?? value.endedOffsetMs ?? 0),
        visible: value.visible !== false,
        termination_reason: String(value.termination_reason ?? value.terminationReason ?? "flush"),
        batch_key: batchKey,
        batch_digest: digest,
      };
    });
    const { error } = await supabase.from("meeting_pointer_intervals").upsert(rows, { onConflict: "capture_id,sequence", ignoreDuplicates: true });
    if (error) throw error;
  }
  const ackSequence = intervals.reduce((max, item) => Math.max(max, Number((item as Record<string, unknown>).sequence ?? -1)), -1);
  return { ackSequence };
};

const reserveSegment = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const segmentIndex = Number(body.segmentIndex);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 4095) throw new Error("segmentIndex is invalid");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (!["recording", "paused", "stopped", "uploading"].includes(String(capture.state))) throw new Error("Capture is not accepting audio");
  const sourceVersion = sourceVersionOf(capture);
  const mime = requireAudioMime(body.mime);
  const bytes = Number(body.bytes ?? 0);
  if (bytes !== 0 && (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_AUDIO_SEGMENT_BYTES)) throw new Error("Audio byte count is invalid");
  const reservationKey = String(body.reservationKey ?? `${captureId}:v${sourceVersion}:segment:${segmentIndex}`).slice(0, 180);
  const startOffsetMs = Number(body.startOffsetMs ?? body.start_offset_ms ?? 0);
  const endOffsetMs = Number(body.endOffsetMs ?? body.end_offset_ms ?? 0);
  const epoch = Number(body.epoch ?? 0);
  const overlapMs = Number(body.overlapMs ?? body.overlap_ms ?? 0);
  const gapBeforeMs = Number(body.gapBeforeMs ?? body.gap_before_ms ?? 0);
  if (!Number.isInteger(epoch) || epoch < 0 || !Number.isInteger(overlapMs) || overlapMs < 0 || overlapMs > 500
    || !Number.isInteger(gapBeforeMs) || gapBeforeMs < 0
    || !Number.isInteger(startOffsetMs) || startOffsetMs < 0
    || (endOffsetMs !== 0 && (!Number.isInteger(endOffsetMs) || endOffsetMs <= startOffsetMs))) {
    throw new Error("Audio segment timeline is invalid");
  }
  const path = segmentPath(capture, sourceVersion, segmentIndex, mime);
  const { data: existing, error: existingError } = await supabase.from("meeting_capture_segments")
    .select("*").eq("capture_id", captureId).eq("source_version", sourceVersion).eq("segment_index", segmentIndex).maybeSingle();
  if (existingError) throw existingError;
  if (existing && String(existing.object_path) !== path) throw new Error("Audio segment path conflict");
  if (existing && String(existing.reservation_key ?? reservationKey) !== reservationKey) throw new Error("AUDIO_RESERVATION_CONFLICT");
  if (existing && (Number(existing.epoch) !== epoch
    || Number(existing.start_offset_ms) !== startOffsetMs
    || Number(existing.end_offset_ms) !== (endOffsetMs || startOffsetMs + 1)
    || Number(existing.overlap_ms) !== overlapMs
    || Number(existing.gap_before_ms) !== gapBeforeMs
    || String(existing.mime).toLowerCase() !== mime)) {
    throw new Error("AUDIO_RESERVATION_CONFLICT");
  }
  if (existing?.upload_state === "verified") {
    return {
      segmentId: existing.id,
      sourceVersion,
      segmentIndex,
      path,
      token: null,
      signedUrl: null,
      expiresAt: Date.now(),
      uploadState: "verified",
      alreadyVerified: true,
      sha256: existing.sha256,
      bytes: Number(existing.bytes ?? 0),
    };
  }
  const { data: segment, error: segmentError } = existing
    ? { data: existing, error: null }
    : await supabase.from("meeting_capture_segments").insert({
      capture_id: captureId, source_version: sourceVersion, segment_index: segmentIndex,
      epoch, start_offset_ms: startOffsetMs,
      end_offset_ms: Math.max(1, Math.ceil(endOffsetMs || startOffsetMs + 1)),
      overlap_ms: overlapMs,
      gap_before_ms: gapBeforeMs,
      object_path: path, mime, bytes: bytes || 0, reservation_key: reservationKey,
      upload_state: "pending", upload_token_expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
    }).select("*").single();
  if (segmentError) throw segmentError;
  if (!segment) throw new Error("Unable to reserve audio segment");
  const cleanupAttemptId = `storage:${captureId}:v${sourceVersion}:segment:${segmentIndex}`;
  const { data: cleanup, error: cleanupLookupError } = await supabase.schema("private").from("meeting_artifact_cleanup")
    .select("obligation_id").eq("attempt_id", cleanupAttemptId).eq("kind", "storage").maybeSingle();
  if (cleanupLookupError) throw cleanupLookupError;
  if (!cleanup) {
    const { error: cleanupError } = await supabase.schema("private").from("meeting_artifact_cleanup").insert({
      capture_id: captureId, attempt_id: cleanupAttemptId, kind: "storage", object_locator: path,
      state: "pending", upload_token_expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
      due_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
    });
    if (cleanupError && cleanupError.code !== "23505") throw cleanupError;
  }
  const { data: tokenData, error: tokenError } = await supabase.storage.from(AUDIO_BUCKET).createSignedUploadUrl(path);
  if (tokenError || !tokenData) throw tokenError ?? new Error("Unable to create upload token");
  await supabase.from("meeting_capture_segments").update({
    upload_state: existing?.upload_state === "verified" ? "verified" : "uploading",
    upload_token_expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
  }).eq("id", segment.id);
  return { segmentId: segment.id, sourceVersion, segmentIndex, path, token: tokenData.token, signedUrl: tokenData.signedUrl, expiresAt: Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000, uploadState: "uploading", alreadyVerified: false, sha256: null, bytes: Number(segment.bytes ?? 0) };
};

const verifySegment = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const segmentIndex = Number(body.segmentIndex);
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  const sourceVersion = sourceVersionOf(capture);
  const { data: segment, error: segmentError } = await supabase.from("meeting_capture_segments")
    .select("*").eq("capture_id", captureId).eq("source_version", sourceVersion).eq("segment_index", segmentIndex).maybeSingle();
  if (segmentError) throw segmentError;
  if (!segment) throw new Error("Audio segment reservation not found");
  if (capture.audio_expires_at && Date.parse(String(capture.audio_expires_at)) <= Date.now()) throw new Error("AUDIO_EXPIRED");
  const uploadTokenExpiresAt = Date.parse(String(segment.upload_token_expires_at ?? ""));
  if (!Number.isFinite(uploadTokenExpiresAt) || uploadTokenExpiresAt <= Date.now()) {
    await supabase.from("meeting_capture_segments").update({ last_error: "UPLOAD_TOKEN_EXPIRED" }).eq("id", segment.id);
    throw new Error("UPLOAD_TOKEN_EXPIRED");
  }
  const { data: blob, error: downloadError } = await supabase.storage.from(AUDIO_BUCKET).download(String(segment.object_path));
  if (downloadError || !blob) throw downloadError ?? new Error("Audio object is not available");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (Number(segment.bytes) > 0 && Number(segment.bytes) !== bytes.byteLength) throw new Error("Audio object byte count mismatch");
  const { data: verified, error: updateError } = await supabase.from("meeting_capture_segments").update({
    bytes: bytes.byteLength, sha256, upload_state: "verified", verified_at: new Date().toISOString(), last_error: null,
  }).eq("id", segment.id).select("id,segment_index,source_version,bytes,sha256,upload_state,object_path").single();
  if (updateError) throw updateError;
  return { segment: verified };
};

const completeUpload = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const expectedSourceVersion = Number(body.expectedSourceVersion);
  if (!Number.isInteger(expectedSourceVersion) || expectedSourceVersion < 1) throw new Error("SOURCE_VERSION_REQUIRED");
  const capture = await getCapture(captureId);
  const actor = await assertCaptureEditor(request, capture);
  if (sourceVersionOf(capture) !== expectedSourceVersion) throw new Error("SOURCE_CONFLICT");
  if (!["stopped", "uploading", "queued", "awaiting_budget"].includes(String(capture.state))) throw new Error("Capture is not ready to complete");
  const sourceCompleteness = ["complete", "partial", "missing"].includes(String(body.sourceCompleteness)) ? String(body.sourceCompleteness) : "partial";
  const audioManifest = Array.isArray(body.audioManifest) ? body.audioManifest : [];
  const normalizedManifest = audioManifest.map((item) => {
    const value = item as Record<string, unknown>;
    const segmentIndex = Number(value.segmentIndex ?? value.segment_index);
    const epoch = Number(value.epoch);
    const bytes = Number(value.bytes ?? 0);
    const startOffsetMs = Number(value.startOffsetMs ?? value.start_offset_ms);
    const endOffsetMs = Number(value.endOffsetMs ?? value.end_offset_ms);
    const overlapMs = Number(value.overlapMs ?? value.overlap_ms ?? 0);
    const gapBeforeMs = Number(value.gapBeforeMs ?? value.gap_before_ms ?? 0);
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0) throw new Error("Audio manifest segment index is invalid");
    if (!Number.isInteger(epoch) || epoch < 0) throw new Error("Audio manifest epoch is invalid");
    if (!Number.isFinite(startOffsetMs) || !Number.isFinite(endOffsetMs) || endOffsetMs <= startOffsetMs) throw new Error("Audio manifest offsets are invalid");
    if (!Number.isInteger(overlapMs) || overlapMs < 0 || overlapMs > 500 || !Number.isInteger(gapBeforeMs) || gapBeforeMs < 0) throw new Error("Audio manifest timeline is invalid");
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_AUDIO_SEGMENT_BYTES) throw new Error("Audio manifest byte count is invalid");
    const mime = requireAudioMime(value.mime);
    const sha256 = String(value.sha256 ?? "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Audio manifest SHA-256 is invalid");
    return { segmentIndex, epoch, bytes, startOffsetMs, endOffsetMs, overlapMs, gapBeforeMs, mime, sha256, objectPath: String(value.objectPath ?? value.object_path ?? ""), uploadState: String(value.uploadState ?? value.upload_state ?? "") };
  });
  const indexSet = new Set(normalizedManifest.map((item) => item.segmentIndex));
  if (indexSet.size !== normalizedManifest.length) throw new Error("Audio manifest has duplicate segments");
  const audioManifestHash = String(body.audioManifestHash ?? "");
  const pointerManifestHash = String(body.pointerManifestHash ?? "");
  if (!audioManifestHash || !pointerManifestHash) throw new Error("Source manifest hashes are required");
  const { data, error } = await supabase.rpc("complete_meeting_upload_v1", {
    p_capture_id: captureId,
    p_actor_id: actor.userId,
    p_expected_source_version: expectedSourceVersion,
    p_audio_manifest: normalizedManifest,
    p_audio_manifest_hash: audioManifestHash,
    p_pointer_manifest_hash: pointerManifestHash,
    p_source_completeness: sourceCompleteness,
    p_provider_mode: Deno.env.get("DEV123_PROVIDER_MODE") ?? "fake",
  });
  if (error) throw error;
  return data;
};

const uploadToken = async (request: Request, body: Record<string, unknown>) => {
  return reserveSegment(request, body);
};

const status = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  return toProgress(capture);
};

const playbackUrl = async (request: Request, body: Record<string, unknown>) => {
  const segmentId = requireUuid(body.segmentId, "segmentId");
  const recordId = requireUuid(body.recordId, "recordId");
  const { data: segment, error: segmentError } = await supabase.from("meeting_capture_segments")
    .select("id,capture_id,object_path,upload_state").eq("id", segmentId).maybeSingle();
  if (segmentError) throw segmentError;
  if (!segment) throw new Error("Audio segment not found");
  const capture = await getCapture(String(segment.capture_id));
  if (String(capture.record_id) !== recordId) throw new Error("Audio segment does not belong to record");
  await assertCaptureEditor(request, capture);
  if (["cancelled", "expired"].includes(String(capture.state))) throw new Error("AUDIO_EXPIRED");
  if (capture.audio_expires_at && Date.parse(String(capture.audio_expires_at)) <= Date.now()) throw new Error("AUDIO_EXPIRED");
  if (String(segment.upload_state) !== "verified") throw new Error("Audio segment is not available");
  const expiresAt = Math.min(Date.now() + SIGNED_PLAYBACK_TTL_SECONDS * 1000, Date.parse(String(capture.audio_expires_at ?? new Date(Date.now() + SIGNED_PLAYBACK_TTL_SECONDS * 1000).toISOString())));
  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(String(segment.object_path), Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)));
  if (error || !data) throw error ?? new Error("Unable to create playback URL");
  return { segmentId, url: data.signedUrl, expiresAt };
};

const cancelCapture = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (!["created", "recording", "paused", "stopped", "uploading", "queued", "running", "awaiting_budget", "failed_retryable"].includes(String(capture.state))) {
    return { captureId, state: capture.state, idempotent: true };
  }
  const reason = String(body.reason ?? "user-cancel").slice(0, 160);
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    state: "cancelled", stopped_reason: reason, last_progress_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", captureId).eq("state", capture.state).select("id,state,source_version").maybeSingle();
  if (error) throw error;
  if (!data) {
    // A worker may have reached a terminal state after the editor read the
    // capture.  Never overwrite a newer terminal result with cancellation.
    const current = await getCapture(captureId);
    if (!["created", "recording", "paused", "stopped", "uploading", "queued", "running", "awaiting_budget", "failed_retryable"].includes(String(current.state))) {
      return { captureId, state: current.state, idempotent: true };
    }
    throw new Error("MEETING_RECORD_CONFLICT");
  }
  const cancelNow = new Date().toISOString();
  const { error: pendingRunError } = await supabase.from("meeting_analysis_runs").update({
    state: "cancelled", error_code: "CANCELLED_BEFORE_DISPATCH", lease_token: null, lease_expires_at: null, updated_at: cancelNow,
  }).eq("capture_id", captureId).in("state", ["queued", "awaiting_budget", "failed_retryable"]);
  if (pendingRunError) throw pendingRunError;
  // An in-flight worker may already have sent provider content.  Cancel its
  // result application, but keep its reserved/unknown attempt for reconciliation.
  const { error: activeRunError } = await supabase.from("meeting_analysis_runs").update({
    state: "cancelled", error_code: "CANCELLED_IN_FLIGHT", lease_token: null, lease_expires_at: null, updated_at: cancelNow,
  }).eq("capture_id", captureId).eq("state", "running");
  if (activeRunError) throw activeRunError;
  const { data: segments, error: segmentError } = await supabase.from("meeting_capture_segments")
    .select("object_path,segment_index,source_version,upload_token_expires_at").eq("capture_id", captureId).neq("upload_state", "purged");
  if (segmentError) throw segmentError;
  for (const segment of segments ?? []) {
    const attemptId = `storage:${captureId}:v${segment.source_version}:segment:${segment.segment_index}`;
    const { data: existing, error: lookupError } = await supabase.schema("private").from("meeting_artifact_cleanup").select("obligation_id").eq("attempt_id", attemptId).eq("kind", "storage").maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) {
      const { error: cleanupError } = await supabase.schema("private").from("meeting_artifact_cleanup").insert({
        capture_id: captureId, attempt_id: attemptId, kind: "storage", object_locator: segment.object_path,
        state: "pending", upload_token_expires_at: segment.upload_token_expires_at, due_at: new Date().toISOString(),
      });
      if (cleanupError && cleanupError.code !== "23505") throw cleanupError;
    }
  }
  const { data: pendingRuns, error: pendingLookupError } = await supabase.from("meeting_analysis_runs")
    .select("id").eq("capture_id", captureId).eq("error_code", "CANCELLED_BEFORE_DISPATCH");
  if (pendingLookupError) throw pendingLookupError;
  const pendingRunIds = (pendingRuns ?? []).map(run => String(run.id));
  if (pendingRunIds.length > 0) {
    const { data: reservedAttempts, error: attemptError } = await supabase.schema("private").from("meeting_ai_usage_attempts")
      .select("attempt_id").in("run_id", pendingRunIds).eq("usage_state", "reserved");
    if (attemptError) throw attemptError;
    for (const attempt of reservedAttempts ?? []) {
      const { error: settleError } = await supabase.schema("private").rpc("settle_meeting_budget_v1", {
        p_attempt_id: String(attempt.attempt_id),
        p_actual_twd_micros: 0,
        p_usage_state: "known",
        p_outcome: "cancelled_before_dispatch",
      });
      if (settleError) throw settleError;
    }
  }
  return { captureId: data.id, state: data.state, sourceVersion: data.source_version, idempotent: false };
};

const reviseSource = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const expectedSourceVersion = Number(body.expectedSourceVersion);
  if (!Number.isInteger(expectedSourceVersion) || expectedSourceVersion < 1) throw new Error("expectedSourceVersion is invalid");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  if (sourceVersionOf(capture) !== expectedSourceVersion) throw new Error("SOURCE_CONFLICT");
  if (!["stopped", "queued", "ready", "failed_retryable", "failed_terminal"].includes(String(capture.state))) throw new Error("Capture cannot revise source");
  const nextVersion = expectedSourceVersion + 1;
  const { data, error } = await supabase.from("meeting_capture_sessions").update({
    source_version: nextVersion, source_parent_version: expectedSourceVersion, source_frozen_at: null,
    audio_manifest_hash: null, pointer_manifest_hash: null, source_completeness: "missing", state: "stopped",
    updated_at: new Date().toISOString(),
  }).eq("id", captureId).eq("source_version", expectedSourceVersion).select("id,state,source_version,source_parent_version").single();
  if (error) throw error;
  return { captureId: data.id, state: data.state, sourceVersion: data.source_version, parentVersion: data.source_parent_version };
};

const retryRun = async (request: Request, body: Record<string, unknown>) => {
  const runId = requireUuid(body.runId, "runId");
  const requestKey = String(body.requestKey ?? "").trim();
  const mode = String(body.mode ?? "retry");
  if (!requestKey || requestKey.length > 180) throw new Error("requestKey is required");
  if (!["retry", "rematch", "retranscribe"].includes(mode)) throw new Error("Retry mode is invalid");
  const { data: sourceRun, error: sourceError } = await supabase.from("meeting_analysis_runs").select("*").eq("id", runId).maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceRun) throw new Error("Analysis run not found");
  const capture = await getCapture(String(sourceRun.capture_id));
  const actor = await assertCaptureEditor(request, capture);
  const { data, error: retryError } = await supabase.rpc("retry_meeting_analysis_v1", {
    p_capture_id: capture.id,
    p_source_run_id: runId,
    p_actor_id: actor.userId,
    p_request_key: requestKey,
    p_mode: mode,
  });
  if (retryError) throw retryError;
  if (!data) throw new Error("MEETING_RECORD_CONFLICT");
  return data;
};

const review = async (request: Request, body: Record<string, unknown>) => {
  const captureId = requireUuid(body.captureId, "captureId");
  const capture = await getCapture(captureId);
  await assertCaptureEditor(request, capture);
  const { data: transcript, error: transcriptError } = await supabase.from("meeting_transcript_segments")
    .select("id,segment_index,start_offset_ms,end_offset_ms,raw_text,normalized_text,word_offsets,transcript_revision_id")
    .eq("capture_id", captureId).order("segment_index", { ascending: true }).limit(100);
  if (transcriptError) throw transcriptError;
  const { data: audioSegments, error: audioSegmentError } = await supabase.from("meeting_capture_segments")
    .select("id,start_offset_ms,end_offset_ms,upload_state,source_version")
    .eq("capture_id", captureId).eq("source_version", sourceVersionOf(capture)).eq("upload_state", "verified")
    .order("segment_index", { ascending: true });
  if (audioSegmentError) throw audioSegmentError;
  const { data: resolutions, error: resolutionError } = await supabase.from("meeting_segment_resolutions")
    .select("id,transcript_segment_id,candidate_snapshot,resolution_state,revision,human_reviewed,human_empty_decision")
    .eq("capture_id", captureId);
  if (resolutionError) throw resolutionError;
  const resolutionBySegment = new Map((resolutions ?? []).map(row => [String(row.transcript_segment_id), row]));
  const resolutionIds = (resolutions ?? []).map(row => String(row.id));
  const { data: matches, error: matchError } = resolutionIds.length
    ? await supabase.from("meeting_task_match_results").select("resolution_id,task_id,semantic_score,pointer_feature,quote_range,ai_suggestion_version,decision,decision_source").in("resolution_id", resolutionIds)
    : { data: [], error: null };
  if (matchError) throw matchError;
  const taskIds = Array.from(new Set((matches ?? []).map(row => String(row.task_id))));
  const { data: tasks, error: taskError } = taskIds.length
    ? await supabase.from("wbs_items").select("id,title,path,description").in("id", taskIds)
      .eq("tenant_id", capture.tenant_id).eq("project_id", capture.project_id)
      .eq("is_archived", false).in("item_type", ["task", "milestone"])
    : { data: [], error: null };
  if (taskError) throw taskError;
  const taskById = new Map((tasks ?? []).map(task => [String(task.id), task]));
  const matchesByResolution = new Map<string, any[]>();
  for (const match of matches ?? []) {
    const task = taskById.get(String(match.task_id));
    if (!task) continue;
    const list = matchesByResolution.get(String(match.resolution_id)) ?? [];
    list.push({
      taskId: task.id,
      title: task.title,
      path: Array.isArray(task.path) ? task.path.join("/") : "",
      semanticScore: Number(match.semantic_score ?? 0),
      pointerFeature: Number(match.pointer_feature ?? 0),
      quoteRange: match.quote_range && typeof match.quote_range === "object" ? match.quote_range : null,
      source: String(match.decision_source) === "human"
        ? "human"
        : Number(match.pointer_feature ?? 0) > 0 && Number(match.semantic_score ?? 0) <= 0
          ? "pointer"
          : "lexical",
      decision: match.decision,
      aiSuggestionVersion: match.ai_suggestion_version,
    });
    matchesByResolution.set(String(match.resolution_id), list);
  }
  return {
    captureId,
    state: capture.state,
    reviewRevision: Number(capture.review_revision ?? 0),
    segments: (transcript ?? []).map(segment => {
      const resolution = resolutionBySegment.get(String(segment.id));
      return {
        segmentId: segment.id,
        audioSegmentId: (audioSegments ?? []).find(audio => Number(audio.end_offset_ms) > Number(segment.start_offset_ms) && Number(audio.start_offset_ms) < Number(segment.end_offset_ms))?.id ?? null,
        transcriptRevisionId: segment.transcript_revision_id,
        text: segment.raw_text,
        startOffsetMs: Number(segment.start_offset_ms),
        endOffsetMs: Number(segment.end_offset_ms),
        wordOffsets: segment.word_offsets,
        resolutionId: resolution?.id ?? null,
        resolutionRevision: Number(resolution?.revision ?? 0),
        decision: resolution?.resolution_state ?? "pending",
        humanReviewed: Boolean(resolution?.human_reviewed),
        humanEmptyDecision: Boolean(resolution?.human_empty_decision),
        candidates: matchesByResolution.get(String(resolution?.id ?? "")) ?? [],
      };
    }),
  };
};

const decideMatch = async (request: Request, body: Record<string, unknown>) => {
  const resolutionId = requireUuid(body.resolutionId, "resolutionId");
  const { data: resolution, error: resolutionError } = await supabase.from("meeting_segment_resolutions")
    .select("id,capture_id").eq("id", resolutionId).maybeSingle();
  if (resolutionError) throw resolutionError;
  if (!resolution) throw new Error("Resolution not found");
  const capture = await getCapture(String(resolution.capture_id));
  const actor = await assertCaptureEditor(request, capture);
  const expectedRevision = body.expectedResolutionRevision == null ? null : Number(body.expectedResolutionRevision);
  const operations = Array.isArray(body.operations) ? body.operations : [];
  const { data, error } = await supabase.rpc("decide_meeting_match_v1", {
    p_resolution_id: resolutionId,
    p_actor_id: actor.userId,
    p_expected_resolution_revision: expectedRevision,
    p_operations: operations,
  });
  if (error) throw error;
  return data;
};

const saveProjection = async (request: Request, body: Record<string, unknown>) => {
  const recordId = requireUuid(body.recordId, "recordId");
  const captureId = requireUuid(body.captureId, "captureId");
  // Projection is a meeting raw-adjacent write. Resolve scope from the
  // capture and apply the private-record creator/recorded_by guard; client
  // supplied tenant/project values must not widen the write boundary.
  const capture = await getCapture(captureId);
  if (String(capture.record_id) !== recordId) throw new Error("MEETING_RECORD_CONFLICT");
  const actor = await assertCaptureEditor(request, capture);
  const userDraft = (body.userDraft && typeof body.userDraft === "object") ? body.userDraft as Record<string, unknown> : {};
  const requestedLinks = Array.isArray(body.taskLinks) ? body.taskLinks as Array<Record<string, unknown>> : [];
  const { data: projectItems, error: itemError } = await supabase.from("wbs_items")
    .select("id,legacy_node_id").eq("tenant_id", actor.tenantId).eq("project_id", actor.projectId);
  if (itemError) throw itemError;
  const itemByReference = new Map<string, string>();
  for (const item of projectItems ?? []) {
    itemByReference.set(String(item.id), String(item.id));
    if (item.legacy_node_id) itemByReference.set(String(item.legacy_node_id), String(item.id));
  }
  const links = requestedLinks.map((link) => {
    const itemId = itemByReference.get(String(link.nodeId ?? link.itemId ?? ""));
    if (!itemId) throw new Error("TASK_OUTSIDE_PROJECT");
    return { item_id: itemId, role: String(link.role ?? "related") };
  });
  const requestKey = String(body.requestKey ?? `${recordId}:${Date.now()}`);
  const payloadHash = await hashJson({ userDraft, links, requestKey });
  const { data, error } = await supabase.rpc("save_meeting_projection_v1", {
    p_record_id: recordId,
    p_capture_id: captureId,
    p_actor_id: actor.userId,
    p_expected_record_updated_at: body.expectedRecordUpdatedAt ?? null,
    p_expected_review_revision: body.expectedReviewRevision ?? null,
    p_title: String(userDraft.title ?? ""),
    p_content: String(userDraft.content ?? ""),
    p_status: String(userDraft.status ?? "draft"),
    p_metadata: userDraft.metadata ?? {},
    p_task_links: links,
    p_request_key: requestKey,
    p_payload_hash: payloadHash,
  });
  if (error) throw error;
  return { savedRecord: data };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({}, 204);
  if (request.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = String(body.operation ?? "");
    const result = operation === "begin" ? await begin(request, body)
      : operation === "progress" ? await progress(request, body)
      : operation === "pause" ? await pause(request, body)
      : operation === "resume" ? await resume(request, body)
      : operation === "stop" ? await stop(request, body)
      : operation === "append-pointer" ? await appendPointer(request, body)
      : operation === "reserve-segment" ? await reserveSegment(request, body)
      : operation === "verify-segment" ? await verifySegment(request, body)
      : operation === "complete-upload" ? await completeUpload(request, body)
      : operation === "upload-token" ? await uploadToken(request, body)
      : operation === "status" ? await status(request, body)
      : operation === "playback-url" ? await playbackUrl(request, body)
      : operation === "revise-source" ? await reviseSource(request, body)
      : operation === "retry" ? await retryRun(request, body)
      : operation === "cancel" ? await cancelCapture(request, body)
      : operation === "review" ? await review(request, body)
      : operation === "decide-match" ? await decideMatch(request, body)
      : operation === "save-projection" ? await saveProjection(request, body)
      : null;
    if (!result) return errorResponse("Unsupported operation", 400);
    return json(result);
  } catch (error) {
    const safe = publicError(error);
    console.error("[meeting_capture_control]", safe.code);
    if (Deno.env.get("DEV123_LOCAL_EDGE_RUNTIME") === "true") {
      const diagnostic = error instanceof Error ? error.message : JSON.stringify(error);
      console.error("[meeting_capture_control][local]", diagnostic);
    }
    return errorResponse(safe.code, safe.status);
  }
});
