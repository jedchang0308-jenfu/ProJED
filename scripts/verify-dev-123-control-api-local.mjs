import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const baseUrl = String(process.env.DEV123_LOCAL_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = String(process.env.DEV123_LOCAL_SUPABASE_ANON_KEY ?? '').trim();
const serviceRoleKey = String(process.env.DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const outputPath = 'output/qa/dev-123/control-api-local-result.json';
const userEmail = 'test@example.com';
const userPassword = 'password123';
const userId = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';
const tenantId = 'a1a1a1a1-b1b1-41c1-81d1-e1e1e1e1e1e1';
const projectId = 'b2b2b2b2-c2c2-42d2-82e2-f2f2f2f2f2f2';
const foreignProjectId = 'c3c3c3c3-d3d3-43d3-83d3-f3f3f3f3f3f3';
const recordId = '22222222-2222-4222-8222-222222222222';
const foreignRecordId = '33333333-3333-4333-8333-333333333333';
const taskId = '11111111-1111-4111-8111-111111111111';
const foreignTaskId = '44444444-4444-4444-8444-444444444444';
const audioBytes = Buffer.from('DEV-123 local control API audio fixture', 'utf8');
let audioPath = `${tenantId}/${projectId}/${recordId}/CONTROL_CAPTURE/v1/0.webm`;
const audioPaths = [];

if (!baseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('DEV123_LOCAL_SUPABASE_URL, DEV123_LOCAL_SUPABASE_ANON_KEY and DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY are required');
}

const failures = [];
const cases = [];
const evidenceSensitiveKey = /^(?:token|signedurl|url|authorization|apikey|secret|password)$/i;
const sanitizeEvidence = (value, key = '') => {
  if (evidenceSensitiveKey.test(key)) return '[redacted]';
  if (typeof value === 'string' && (value.includes('token=') || value.includes('/storage/v1/object/sign/') || value.includes('/storage/v1/object/upload/sign/'))) return '[redacted]';
  if (Array.isArray(value)) return value.map(item => sanitizeEvidence(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeEvidence(entryValue, entryKey)]));
  return value;
};
const record = (id, ok, details = {}) => {
  cases.push({ id, ok, details: sanitizeEvidence(details) });
  if (!ok) failures.push(id);
};

const parseBody = async (response) => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await parseBody(response);
  return { response, body };
};

// Edge runtime returns its Docker-internal signed URL host (`kong:8000`),
// while this verifier runs on the host. Preserve the signed path/query and
// only rewrite the network origin for the task-owned local API.
const hostReachableSignedUrl = (value) => {
  const parsed = new URL(value);
  const base = new URL(baseUrl);
  parsed.protocol = base.protocol;
  parsed.hostname = base.hostname;
  parsed.port = base.port;
  return parsed.toString();
};

const rest = async (tablePath, options = {}) => request(`/rest/v1/${tablePath}`, {
  ...options,
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  },
});

const functionCall = async (accessToken, body) => request('/functions/v1/meeting_capture_control', {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const workerCall = async () => request('/functions/v1/process_meeting_analysis', {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'x-projed-worker-secret': 'dev123-local-worker',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
});

const jsonHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const audioHash = createHash('sha256').update(audioBytes).digest('hex');

const cleanup = async () => {
  try {
    for (const path of new Set(audioPaths.concat(audioPath))) {
      if (!path) continue;
      await request(`/storage/v1/object/meeting-audio/${path}`, {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
    }
  } catch {
    // Cleanup is best effort here; the wrapper records runtime cleanup separately.
  }
  try {
    await rest(`knowledge_records?id=eq.${recordId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await rest(`knowledge_records?id=eq.${foreignRecordId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  } catch {
    // The verifier reports functional failures; the wrapper still tears down the database.
  }
  try {
    await rest(`projects?id=eq.${projectId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await rest(`projects?id=eq.${foreignProjectId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await rest(`tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  } catch {
    // The task-owned database is torn down by the wrapper after every run.
  }
};

let accessToken = '';
let captureId = '';
let segmentId = '';
let runId = '';

try {
  const login = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  accessToken = String(login.body?.access_token ?? '');
  record('P01-auth-login', login.response.status === 200 && Boolean(accessToken), { status: login.response.status });

  const tenantInsert = await rest('tenants', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ id: tenantId, name: 'DEV-123 control API fixture tenant' }),
  });
  record('fixture-tenant', [200, 201].includes(tenantInsert.response.status), { status: tenantInsert.response.status, body: tenantInsert.body });
  const tenantMemberInsert = await rest('tenant_members', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role: 'owner', status: 'active' }),
  });
  record('fixture-tenant-member', [200, 201].includes(tenantMemberInsert.response.status), { status: tenantMemberInsert.response.status, body: tenantMemberInsert.body });
  const projectInsert = await rest('projects', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ id: projectId, tenant_id: tenantId, name: 'DEV-123 control API fixture project', created_by: userId }),
  });
  record('fixture-project', [200, 201].includes(projectInsert.response.status), { status: projectInsert.response.status, body: projectInsert.body });
  const projectMemberInsert = await rest('project_members', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ project_id: projectId, tenant_id: tenantId, user_id: userId, role: 'owner' }),
  });
  record('fixture-project-member', [200, 201].includes(projectMemberInsert.response.status), { status: projectMemberInsert.response.status, body: projectMemberInsert.body });

  const foreignProjectInsert = await rest('projects', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ id: foreignProjectId, tenant_id: tenantId, name: 'DEV-123 foreign project fixture', created_by: userId }),
  });
  record('fixture-foreign-project', [200, 201].includes(foreignProjectInsert.response.status), { status: foreignProjectInsert.response.status });
  const foreignRecordInsert = await rest('knowledge_records', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      id: foreignRecordId, tenant_id: tenantId, project_id: foreignProjectId, record_type: 'meeting',
      title: 'DEV-123 foreign fixture meeting', content: 'synthetic only',
      occurred_at: new Date().toISOString(), started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      recorded_by: userId, created_by: userId, status: 'draft', visibility: 'project', rag_enabled: false,
    }),
  });
  record('fixture-foreign-record', [200, 201].includes(foreignRecordInsert.response.status), { status: foreignRecordInsert.response.status });
  const foreignTaskInsert = await rest('wbs_items', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      id: foreignTaskId, tenant_id: tenantId, project_id: foreignProjectId, title: 'DEV-123 foreign task fixture',
      item_type: 'task', status: 'todo', path: [foreignTaskId], depth: 0, sort_order: 0,
      created_by: userId, updated_by: userId,
    }),
  });
  record('fixture-foreign-task', [200, 201].includes(foreignTaskInsert.response.status), { status: foreignTaskInsert.response.status });

  const unauthenticated = await functionCall('', {
    operation: 'begin', tenantId, projectId, recordId, idempotencyKey: 'control-api-unauthenticated',
  });
  record('P01-missing-auth', unauthenticated.response.status === 401 && unauthenticated.body?.error === 'AUTH_REQUIRED', {
    status: unauthenticated.response.status, body: unauthenticated.body,
  });
  const invalidAuth = await functionCall(anonKey, {
    operation: 'begin', tenantId, projectId, recordId, idempotencyKey: 'control-api-invalid-auth',
  });
  record('P01-invalid-auth', invalidAuth.response.status === 401 && invalidAuth.body?.error === 'AUTH_REQUIRED', {
    status: invalidAuth.response.status, body: invalidAuth.body,
  });

  const taskInsert = await rest('wbs_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      id: taskId, tenant_id: tenantId, project_id: projectId, title: 'DEV-123 control API fixture task',
      item_type: 'task', status: 'todo', path: [taskId], depth: 0, sort_order: 0,
      created_by: userId, updated_by: userId,
    }),
  });
  record('fixture-task', [200, 201].includes(taskInsert.response.status), { status: taskInsert.response.status, body: taskInsert.body });

  const recordInsert = await rest('knowledge_records', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      id: recordId, tenant_id: tenantId, project_id: projectId, record_type: 'meeting',
      title: 'DEV-123 control API fixture meeting', content: 'manual fixture content',
      occurred_at: new Date().toISOString(), started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(), recorded_by: userId, created_by: userId,
      status: 'draft', visibility: 'project', rag_enabled: false,
    }),
  });
  record('fixture-record', [200, 201].includes(recordInsert.response.status), { status: recordInsert.response.status, body: recordInsert.body });

  const begin = await functionCall(accessToken, {
    operation: 'begin', tenantId, projectId, recordId, idempotencyKey: 'control-api-capture-v1',
  });
  captureId = String(begin.body?.captureId ?? '');
  record('P02-begin', begin.response.status === 200 && /^[0-9a-f-]{36}$/i.test(captureId) && begin.body?.state === 'recording', {
    status: begin.response.status, body: begin.body, captureId, state: begin.body?.state,
  });

  const beginReplay = await functionCall(accessToken, {
    operation: 'begin', tenantId, projectId, recordId, idempotencyKey: 'control-api-capture-v1',
  });
  record('P05-begin-idempotency', beginReplay.response.status === 200 && beginReplay.body?.captureId === captureId && beginReplay.body?.idempotent === true, {
    status: beginReplay.response.status, body: beginReplay.body, captureId: beginReplay.body?.captureId, idempotent: beginReplay.body?.idempotent,
  });

  const status = await functionCall(accessToken, { operation: 'status', captureId });
  record('P02-status', status.response.status === 200 && status.body?.state === 'recording', { status: status.response.status, body: status.body, state: status.body?.state });

  const foreignBegin = await functionCall(accessToken, {
    operation: 'begin', tenantId, projectId: foreignProjectId, recordId: foreignRecordId,
    idempotencyKey: 'control-api-cross-project-begin',
  });
  record('P02-cross-project-begin-denied', [400, 403].includes(foreignBegin.response.status) && foreignBegin.body?.captureId == null, {
    status: foreignBegin.response.status, body: foreignBegin.body,
  });

  const foreignPointerIntervals = [{
    captureId, clockEpoch: 0, sequence: 99, canonicalTaskId: foreignTaskId, surfaceKind: 'task-row',
    startedOffsetMs: 100, endedOffsetMs: 900, visible: true, terminationReason: 'stop',
  }];
  const foreignPointer = await functionCall(accessToken, {
    operation: 'append-pointer', captureId, batchKey: 'control-api-cross-project-pointer',
    digest: jsonHash(foreignPointerIntervals), intervals: foreignPointerIntervals,
  });
  record('P13-cross-project-pointer-denied', [400, 403].includes(foreignPointer.response.status), {
    status: foreignPointer.response.status, body: foreignPointer.body,
  });

  const intervals = [{
    captureId, clockEpoch: 0, sequence: 0, canonicalTaskId: taskId, surfaceKind: 'task-row',
    startedOffsetMs: 100, endedOffsetMs: 900, visible: true, terminationReason: 'stop',
  }];
  const pointerDigest = jsonHash(intervals);
  const pointer = await functionCall(accessToken, {
    operation: 'append-pointer', captureId, batchKey: 'control-api-pointer-v1', digest: pointerDigest, intervals,
  });
  record('P22-pointer-append', pointer.response.status === 200 && pointer.body?.ackSequence === 0, { status: pointer.response.status, ackSequence: pointer.body?.ackSequence });
  const pointerReplay = await functionCall(accessToken, {
    operation: 'append-pointer', captureId, batchKey: 'control-api-pointer-v1', digest: pointerDigest, intervals,
  });
  record('P17-pointer-idempotency', pointerReplay.response.status === 200 && pointerReplay.body?.ackSequence === 0, { status: pointerReplay.response.status, ackSequence: pointerReplay.body?.ackSequence });

  const reserve = await functionCall(accessToken, {
    operation: 'reserve-segment', captureId, segmentIndex: 0, epoch: 0,
    startOffsetMs: 0, endOffsetMs: 1000, gapBeforeMs: 0, overlapMs: 0,
    mime: 'audio/webm', bytes: audioBytes.byteLength, reservationKey: 'control-api-segment-v1',
  });
  segmentId = String(reserve.body?.segmentId ?? '');
  audioPath = String(reserve.body?.path ?? audioPath);
  audioPaths.push(audioPath);
  record('P06-reserve-segment', reserve.response.status === 200 && Boolean(segmentId) && Boolean(reserve.body?.signedUrl), {
    status: reserve.response.status, body: reserve.body, segmentId, uploadState: reserve.body?.uploadState,
  });

  const signedUrl = String(reserve.body?.signedUrl ?? '');
  const upload = signedUrl ? await fetch(hostReachableSignedUrl(signedUrl), {
    method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: audioBytes,
  }) : null;
  record('P06-storage-upload', upload?.ok === true, { status: upload?.status ?? null });

  const verify = await functionCall(accessToken, { operation: 'verify-segment', captureId, segmentIndex: 0 });
  record('P06-verify-segment', verify.response.status === 200 && verify.body?.segment?.upload_state === 'verified' && verify.body?.segment?.sha256 === audioHash, {
    status: verify.response.status, body: verify.body, uploadState: verify.body?.segment?.upload_state, sha256: verify.body?.segment?.sha256,
  });

  const epochManifest = [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 0, durationMs: 1000, gapBeforeMs: 0 }];
  const stop = await functionCall(accessToken, {
    operation: 'stop', captureId, expectedSourceVersion: 1, epochManifest, finalPointerSequence: 0, sourceGaps: [], reason: 'control-api-test',
  });
  record('P02-stop', Boolean(stop.response.status === 200 && stop.body?.state === 'stopped' && stop.body?.audioExpiresAt), {
    status: stop.response.status, body: stop.body, state: stop.body?.state, audioExpiresAt: stop.body?.audioExpiresAt,
  });

  const audioManifest = [{
    segmentIndex: 0, epoch: 0, bytes: audioBytes.byteLength, startOffsetMs: 0, endOffsetMs: 1000,
    overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: audioHash, objectPath: audioPath, uploadState: 'verified',
  }];
  const audioManifestHash = jsonHash(audioManifest);
  const complete = await functionCall(accessToken, {
    operation: 'complete-upload', captureId, expectedSourceVersion: 1, audioManifest,
    audioManifestHash, pointerManifestHash: pointerDigest, sourceCompleteness: 'complete',
  });
  runId = String(complete.body?.runId ?? '');
  record('P07-complete-upload', complete.response.status === 200 && ['queued', 'awaiting_budget'].includes(complete.body?.state) && Boolean(runId), {
    status: complete.response.status, body: complete.body, state: complete.body?.state, runId, sourceComplete: complete.body?.sourceComplete,
  });

  const completeReplay = await functionCall(accessToken, {
    operation: 'complete-upload', captureId, expectedSourceVersion: 1, audioManifest,
    audioManifestHash, pointerManifestHash: pointerDigest, sourceCompleteness: 'complete',
  });
  record('P05-complete-idempotency', completeReplay.response.status === 200 && completeReplay.body?.runId === runId && completeReplay.body?.idempotent === true, {
    status: completeReplay.response.status, body: completeReplay.body, runId: completeReplay.body?.runId, idempotent: completeReplay.body?.idempotent,
  });

  const playback = await functionCall(accessToken, { operation: 'playback-url', segmentId, recordId });
  record('P14-playback-url', playback.response.status === 200 && Boolean(playback.body?.url) && Number(playback.body?.expiresAt) > Date.now(), {
    status: playback.response.status, body: playback.body, expiresAt: playback.body?.expiresAt,
  });

  const review = await functionCall(accessToken, { operation: 'review', captureId });
  record('B10-review-empty-candidate', review.response.status === 200 && review.body?.captureId === captureId && Array.isArray(review.body?.segments), {
    status: review.response.status, segments: review.body?.segments?.length ?? null,
  });

  const cancel = await functionCall(accessToken, { operation: 'cancel', captureId, reason: 'control-api-test-cleanup' });
  record('P14-cancel', cancel.response.status === 200 && cancel.body?.state === 'cancelled', { status: cancel.response.status, body: cancel.body, state: cancel.body?.state });

  const expiredPlayback = await functionCall(accessToken, { operation: 'playback-url', segmentId, recordId });
  record('P15-cancelled-playback-denied', expiredPlayback.response.status === 400 && expiredPlayback.body?.error === 'AUDIO_EXPIRED', {
    status: expiredPlayback.response.status, body: expiredPlayback.body, error: expiredPlayback.body?.error,
  });

  const cancelledRetry = await functionCall(accessToken, {
    operation: 'retry', runId, requestKey: 'control-api-cancelled-retry', mode: 'retry',
  });
  record('P21-cancelled-retry-denied', [400, 409].includes(cancelledRetry.response.status) && cancelledRetry.body?.runId == null, {
    status: cancelledRetry.response.status, body: cancelledRetry.body,
  });

  const captureReadback = await rest(`meeting_capture_sessions?id=eq.${captureId}&select=id,state,source_completeness,source_frozen_at`, { method: 'GET' });
  record('P10-service-raw-readback', captureReadback.response.status === 200 && captureReadback.body?.[0]?.state === 'cancelled' && captureReadback.body?.[0]?.source_completeness === 'complete', {
    status: captureReadback.response.status, state: captureReadback.body?.[0]?.state, sourceCompleteness: captureReadback.body?.[0]?.source_completeness,
  });

  // A second synthetic capture exercises the queued -> worker -> ready path
  // without weakening the first capture's queued-cancel/expiry assertions.
  const workerBegin = await functionCall(accessToken, {
    operation: 'begin', tenantId, projectId, recordId, idempotencyKey: 'control-api-worker-v1',
  });
  const workerCaptureId = String(workerBegin.body?.captureId ?? '');
  record('P09-worker-begin', workerBegin.response.status === 200 && /^[0-9a-f-]{36}$/i.test(workerCaptureId) && workerBegin.body?.state === 'recording', {
    status: workerBegin.response.status, body: workerBegin.body, captureId: workerCaptureId,
  });

  const workerReserve = await functionCall(accessToken, {
    operation: 'reserve-segment', captureId: workerCaptureId, segmentIndex: 0, epoch: 0,
    startOffsetMs: 0, endOffsetMs: 1000, gapBeforeMs: 0, overlapMs: 0,
    mime: 'audio/webm', bytes: audioBytes.byteLength, reservationKey: 'control-api-worker-segment-v1',
  });
  const workerSegmentId = String(workerReserve.body?.segmentId ?? '');
  const workerAudioPath = String(workerReserve.body?.path ?? '');
  if (workerAudioPath) audioPaths.push(workerAudioPath);
  record('P09-worker-reserve', workerReserve.response.status === 200 && Boolean(workerSegmentId) && Boolean(workerReserve.body?.signedUrl), {
    status: workerReserve.response.status, body: workerReserve.body, segmentId: workerSegmentId,
  });

  const workerUpload = workerReserve.body?.signedUrl ? await fetch(hostReachableSignedUrl(String(workerReserve.body.signedUrl)), {
    method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: audioBytes,
  }) : null;
  record('P09-worker-storage-upload', workerUpload?.ok === true, { status: workerUpload?.status ?? null });

  const workerVerify = await functionCall(accessToken, { operation: 'verify-segment', captureId: workerCaptureId, segmentIndex: 0 });
  record('P09-worker-verify', workerVerify.response.status === 200 && workerVerify.body?.segment?.upload_state === 'verified' && workerVerify.body?.segment?.sha256 === audioHash, {
    status: workerVerify.response.status, body: workerVerify.body, uploadState: workerVerify.body?.segment?.upload_state,
  });

  const workerStop = await functionCall(accessToken, {
    operation: 'stop', captureId: workerCaptureId, expectedSourceVersion: 1,
    epochManifest: [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 0, durationMs: 1000, gapBeforeMs: 0 }],
    finalPointerSequence: 0, sourceGaps: [], reason: 'control-api-worker-test',
  });
  record('P09-worker-stop', workerStop.response.status === 200 && workerStop.body?.state === 'stopped', {
    status: workerStop.response.status, body: workerStop.body,
  });

  const workerManifest = [{
    segmentIndex: 0, epoch: 0, bytes: audioBytes.byteLength, startOffsetMs: 0, endOffsetMs: 1000,
    overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: audioHash, objectPath: workerAudioPath, uploadState: 'verified',
  }];
  const workerComplete = await functionCall(accessToken, {
    operation: 'complete-upload', captureId: workerCaptureId, expectedSourceVersion: 1,
    audioManifest: workerManifest, audioManifestHash: jsonHash(workerManifest),
    pointerManifestHash: pointerDigest, sourceCompleteness: 'complete',
  });
  const workerRunId = String(workerComplete.body?.runId ?? '');
  record('P09-worker-queue', workerComplete.response.status === 200 && ['queued', 'awaiting_budget'].includes(workerComplete.body?.state) && Boolean(workerRunId), {
    status: workerComplete.response.status, body: workerComplete.body, runId: workerRunId,
  });

  const workerDispatch = await workerCall();
  record('P09-worker-fake-ready', workerDispatch.response.status === 200 && workerDispatch.body?.status === 'ready' && workerDispatch.body?.runId === workerRunId, {
    status: workerDispatch.response.status, body: workerDispatch.body,
  });
  const workerRunReadback = await rest(`meeting_analysis_runs?id=eq.${workerRunId}&select=id,state,transcript_revision_id,actual_twd_micros`, { method: 'GET' });
  const workerTranscriptReadback = await rest(`meeting_transcript_segments?producer_run_id=eq.${workerRunId}&select=id,raw_text,word_offsets`, { method: 'GET' });
  record('P09-worker-transcript-readback', workerRunReadback.response.status === 200 && workerRunReadback.body?.[0]?.state === 'ready' && workerTranscriptReadback.response.status === 200 && workerTranscriptReadback.body?.length === 1 && Array.isArray(workerTranscriptReadback.body?.[0]?.word_offsets), {
    runStatus: workerRunReadback.response.status, state: workerRunReadback.body?.[0]?.state, transcriptStatus: workerTranscriptReadback.response.status, transcriptCount: workerTranscriptReadback.body?.length ?? null,
  });
  const workerUsageReadback = await rest(`meeting_ai_usage_attempts?attempt_id=eq.${encodeURIComponent(`${workerRunId}:0`)}&select=attempt_id,usage_state,actual_twd_micros`, {
    method: 'GET', headers: { 'Accept-Profile': 'private' },
  });
  record('P09-worker-budget-settlement', workerUsageReadback.response.status === 200 && workerUsageReadback.body?.[0]?.usage_state === 'known' && Number(workerUsageReadback.body?.[0]?.actual_twd_micros ?? -1) === 0, {
    status: workerUsageReadback.response.status, body: workerUsageReadback.body,
  });

  const workerCaptureStateReadback = await rest(`meeting_capture_sessions?id=eq.${workerCaptureId}&select=id,state,source_version,audio_expires_at,source_completeness`, { method: 'GET' });
  const workerSourceRunStateReadback = await rest(`meeting_analysis_runs?id=eq.${workerRunId}&select=id,state,source_version,manual_retry_count,request_key`, { method: 'GET' });
  record('P21-retry-precondition-readback', workerCaptureStateReadback.response.status === 200 && workerSourceRunStateReadback.response.status === 200 && workerCaptureStateReadback.body?.[0]?.state === 'ready' && workerSourceRunStateReadback.body?.[0]?.state === 'ready', {
    capture: workerCaptureStateReadback.body?.[0], sourceRun: workerSourceRunStateReadback.body?.[0],
  });

  const retry = await functionCall(accessToken, {
    operation: 'retry', runId: workerRunId, requestKey: 'control-api-worker-retry-v1', mode: 'retry',
  });
  const retryRunId = String(retry.body?.runId ?? '');
  record('P21-retry-atomic', retry.response.status === 200 && retry.body?.idempotent === false && /^[0-9a-f-]{36}$/i.test(retryRunId) && retryRunId !== workerRunId, {
    status: retry.response.status, body: retry.body, runId: retryRunId,
  });
  const retryReplay = await functionCall(accessToken, {
    operation: 'retry', runId: workerRunId, requestKey: 'control-api-worker-retry-v1', mode: 'retry',
  });
  record('P21-retry-idempotency', retryReplay.response.status === 200 && retryReplay.body?.idempotent === true && retryReplay.body?.runId === retryRunId, {
    status: retryReplay.response.status, body: retryReplay.body, runId: retryReplay.body?.runId,
  });
  const retryConflict = await functionCall(accessToken, {
    operation: 'retry', runId: workerRunId, requestKey: 'control-api-worker-retry-conflict', mode: 'retry',
  });
  record('P21-retry-conflict-no-orphan', [400, 409].includes(retryConflict.response.status) && retryConflict.body?.runId == null, {
    status: retryConflict.response.status, body: retryConflict.body,
  });

  const purgeUnauthorized = await request('/functions/v1/purge_meeting_audio', {
    method: 'POST', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }, body: JSON.stringify({}),
  });
  record('P09-purge-secret-required', purgeUnauthorized.response.status === 401, { status: purgeUnauthorized.response.status, body: purgeUnauthorized.body });
  const expireWorkerCapture = await rest(`meeting_capture_sessions?id=eq.${workerCaptureId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ audio_expires_at: new Date(Date.now() - 1000).toISOString() }),
  });
  const purge = await request('/functions/v1/purge_meeting_audio', {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-projed-purge-secret': 'dev123-local-purge',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const purgedSegment = await rest(`meeting_capture_segments?id=eq.${workerSegmentId}&select=id,upload_state`, { method: 'GET' });
  record('P09-purge-expired-audio', expireWorkerCapture.response.ok && purge.response.status === 200 && Number(purge.body?.purged ?? 0) >= 1 && purgedSegment.response.status === 200 && purgedSegment.body?.[0]?.upload_state === 'purged', {
    expireStatus: expireWorkerCapture.response.status, status: purge.response.status, body: purge.body, segment: purgedSegment.body,
  });
} catch (error) {
  record('UNCAUGHT', false, { error: error instanceof Error ? error.message : String(error) });
} finally {
  await cleanup();
}

const result = {
  devId: 'DEV-123',
  status: failures.length ? 'FAIL' : 'PASS',
  environment: 'task-owned-local-supabase-control-api-edge',
  cases,
  failures,
  generatedAt: new Date().toISOString(),
};
mkdirSync('output/qa/dev-123', { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
