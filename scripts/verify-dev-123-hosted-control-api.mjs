import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const baseUrl = String(process.env.DEV123_HOSTED_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const secretKey = String(process.env.SUPABASE_SECRET_KEY ?? '').trim();
const workerSecret = String(process.env.DEV123_WORKER_SECRET ?? '').trim();
const outputPath = 'output/qa/dev-123/hosted-control-api-result.json';

if (!baseUrl || !publishableKey || !secretKey || !workerSecret) {
  throw new Error('Hosted Supabase URL, publishable/secret keys, and DEV123_WORKER_SECRET are required.');
}

const admin = createClient(baseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const browserClient = createClient(baseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const runSuffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const tenantId = randomUUID();
const projectId = randomUUID();
const recordId = randomUUID();
const taskId = randomUUID();
const email = `dev123.release.${runSuffix}@example.test`;
const password = `D3v123!${randomBytes(18).toString('base64url')}`;
const audioBytes = Buffer.from('DEV-123 hosted synthetic meeting audio fixture', 'utf8');
const audioSha256 = createHash('sha256').update(audioBytes).digest('hex');
const cases = [];
const failures = [];
let userId = '';
let accessToken = '';
let captureId = '';
let segmentId = '';
let runId = '';
let audioPath = '';
let cleanupComplete = false;

const sanitize = (value, key = '') => {
  if (/token|authorization|apikey|secret|password|signedurl|url/i.test(key)) return '[redacted]';
  if (typeof value === 'string' && (value.includes('/storage/v1/object/') || value.includes('token='))) return '[redacted]';
  if (Array.isArray(value)) return value.map(item => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]));
  }
  return value;
};

const record = (id, ok, details = {}) => {
  cases.push({ id, ok, details: sanitize(details) });
  if (!ok) failures.push(id);
};

const parseBody = async response => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
};

const functionCall = async (body, token = accessToken) => {
  const response = await fetch(`${baseUrl}/functions/v1/meeting_capture_control`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { response, body: await parseBody(response) };
};

const workerCall = async () => {
  const response = await fetch(`${baseUrl}/functions/v1/process_meeting_analysis`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      'x-projed-worker-secret': workerSecret,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return { response, body: await parseBody(response) };
};

const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assertNoOtherRunnableAnalysis = async (expectedRunId = '') => {
  const { data, error } = await admin.from('meeting_analysis_runs')
    .select('id,state')
    .in('state', ['queued', 'running', 'awaiting_budget'])
    .limit(20);
  if (error) throw error;
  const rows = data ?? [];
  return expectedRunId
    ? rows.length === 1 && rows[0].id === expectedRunId
    : rows.length === 0;
};

const cleanup = async () => {
  const cleanupErrors = [];
  if (audioPath) {
    const { error } = await admin.storage.from('meeting-audio').remove([audioPath]);
    if (error && !/not found/i.test(error.message)) cleanupErrors.push(`storage:${error.message}`);
  }
  if (captureId) {
    const { error } = await admin.from('meeting_capture_sessions').delete().eq('id', captureId);
    if (error) cleanupErrors.push(`capture:${error.message}`);
  }
  if (recordId) {
    const { error } = await admin.from('knowledge_records').delete().eq('id', recordId);
    if (error) cleanupErrors.push(`record:${error.message}`);
  }
  if (projectId) {
    const { error } = await admin.from('projects').delete().eq('id', projectId);
    if (error) cleanupErrors.push(`project:${error.message}`);
  }
  if (tenantId) {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId);
    if (error) cleanupErrors.push(`tenant:${error.message}`);
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) cleanupErrors.push(`user:${error.message}`);
  }
  const { count: tenantCount, error: tenantReadError } = await admin.from('tenants')
    .select('id', { count: 'exact', head: true }).eq('id', tenantId);
  const { count: captureCount, error: captureReadError } = await admin.from('meeting_capture_sessions')
    .select('id', { count: 'exact', head: true }).eq('id', captureId || randomUUID());
  if (tenantReadError) cleanupErrors.push(`tenant-read:${tenantReadError.message}`);
  if (captureReadError) cleanupErrors.push(`capture-read:${captureReadError.message}`);
  cleanupComplete = cleanupErrors.length === 0 && tenantCount === 0 && captureCount === 0;
  return { cleanupComplete, tenantCount, captureCount, errors: cleanupErrors };
};

try {
  const emptyQueue = await assertNoOtherRunnableAnalysis();
  record('H01-production-queue-isolated-before-fixture', emptyQueue, { emptyQueue });
  if (!emptyQueue) throw new Error('Existing runnable analysis detected; refusing to invoke the singleton worker.');

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createUserError) throw createUserError;
  userId = String(createdUser.user?.id ?? '');
  record('H02-disposable-auth-user-created', Boolean(userId), { userId });

  const fixtureRows = [
    await admin.from('profiles').insert({ id: userId, email, display_name: 'DEV-123 release fixture' }),
    await admin.from('tenants').insert({ id: tenantId, name: `DEV-123 RELEASE ${runSuffix}` }),
    await admin.from('tenant_members').insert({ tenant_id: tenantId, user_id: userId, role: 'owner', status: 'active' }),
    await admin.from('projects').insert({ id: projectId, tenant_id: tenantId, name: `DEV-123 RELEASE ${runSuffix}`, created_by: userId }),
    await admin.from('project_members').insert({ project_id: projectId, tenant_id: tenantId, user_id: userId, role: 'owner' }),
    await admin.from('wbs_items').insert({
      id: taskId, tenant_id: tenantId, project_id: projectId,
      title: '確認 DEV123 任務連結與滑鼠停留證據', description: '核對會議內容與任務連結',
      item_type: 'task', status: 'todo', path: [taskId], depth: 0, sort_order: 0,
      created_by: userId, updated_by: userId,
    }),
    await admin.from('knowledge_records').insert({
      id: recordId, tenant_id: tenantId, project_id: projectId, record_type: 'meeting',
      title: 'DEV-123 synthetic hosted meeting',
      content: '本次會議要確認 DEV123 任務連結與滑鼠停留證據，並核對下一步。',
      occurred_at: new Date().toISOString(), started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      recorded_by: userId, created_by: userId, status: 'draft', visibility: 'project', rag_enabled: false,
    }),
  ];
  const fixtureErrors = fixtureRows.map(result => result.error?.message).filter(Boolean);
  record('H03-synthetic-project-task-record-created', fixtureErrors.length === 0, { fixtureErrors });
  if (fixtureErrors.length) throw new Error(fixtureErrors[0]);

  const { data: session, error: signInError } = await browserClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  accessToken = String(session.session?.access_token ?? '');
  record('H04-disposable-user-authenticated', Boolean(accessToken), { authenticated: Boolean(accessToken) });

  const unauthenticated = await functionCall({ operation: 'begin', tenantId, projectId, recordId, idempotencyKey: `unauth-${runSuffix}` }, '');
  record('H05-control-api-fails-closed-without-user-jwt', unauthenticated.response.status === 401, { status: unauthenticated.response.status });

  const begin = await functionCall({ operation: 'begin', tenantId, projectId, recordId, idempotencyKey: `capture-${runSuffix}` });
  captureId = String(begin.body?.captureId ?? '');
  record('H06-begin-capture', begin.response.status === 200 && begin.body?.state === 'recording' && Boolean(captureId), { status: begin.response.status, state: begin.body?.state, captureId });

  const intervals = [{
    captureId, clockEpoch: 0, sequence: 0, canonicalTaskId: taskId, surfaceKind: 'task-row',
    startedOffsetMs: 100, endedOffsetMs: 950, visible: true, terminationReason: 'stop',
  }];
  const pointerDigest = jsonHash(intervals);
  const pointer = await functionCall({ operation: 'append-pointer', captureId, batchKey: `pointer-${runSuffix}`, digest: pointerDigest, intervals });
  record('H07-pointer-dwell-linked-to-canonical-task', pointer.response.status === 200 && pointer.body?.ackSequence === 0, { status: pointer.response.status, ackSequence: pointer.body?.ackSequence });

  const reserve = await functionCall({
    operation: 'reserve-segment', captureId, segmentIndex: 0, epoch: 0,
    startOffsetMs: 0, endOffsetMs: 1000, gapBeforeMs: 0, overlapMs: 0,
    mime: 'audio/webm', bytes: audioBytes.byteLength, reservationKey: `segment-${runSuffix}`,
  });
  segmentId = String(reserve.body?.segmentId ?? '');
  audioPath = String(reserve.body?.path ?? '');
  record('H08-reserve-private-audio-segment', reserve.response.status === 200 && Boolean(segmentId) && Boolean(audioPath) && Boolean(reserve.body?.signedUrl), { status: reserve.response.status, segmentId, audioPath });

  const upload = reserve.body?.signedUrl ? await fetch(String(reserve.body.signedUrl), {
    method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: audioBytes,
  }) : null;
  record('H09-signed-upload', upload?.ok === true, { status: upload?.status ?? null });
  const verify = await functionCall({ operation: 'verify-segment', captureId, segmentIndex: 0 });
  record('H10-verified-audio-digest', verify.response.status === 200 && verify.body?.segment?.upload_state === 'verified' && verify.body?.segment?.sha256 === audioSha256, { status: verify.response.status, uploadState: verify.body?.segment?.upload_state, sha256: verify.body?.segment?.sha256 });

  const stop = await functionCall({
    operation: 'stop', captureId, expectedSourceVersion: 1,
    epochManifest: [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 0, durationMs: 1000, gapBeforeMs: 0 }],
    finalPointerSequence: 0, sourceGaps: [], reason: 'hosted-release-smoke',
  });
  record('H11-stop-freezes-source', stop.response.status === 200 && stop.body?.state === 'stopped', { status: stop.response.status, state: stop.body?.state });
  const audioManifest = [{
    segmentIndex: 0, epoch: 0, bytes: audioBytes.byteLength, startOffsetMs: 0, endOffsetMs: 1000,
    overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: audioSha256, objectPath: audioPath, uploadState: 'verified',
  }];
  const complete = await functionCall({
    operation: 'complete-upload', captureId, expectedSourceVersion: 1, audioManifest,
    audioManifestHash: jsonHash(audioManifest), pointerManifestHash: pointerDigest, sourceCompleteness: 'complete',
  });
  runId = String(complete.body?.runId ?? '');
  record('H12-analysis-queued-in-fake-mode', complete.response.status === 200 && ['queued', 'awaiting_budget'].includes(complete.body?.state) && Boolean(runId), { status: complete.response.status, state: complete.body?.state, runId });

  const isolatedQueue = await assertNoOtherRunnableAnalysis(runId);
  record('H13-worker-target-is-only-runnable-analysis', isolatedQueue, { isolatedQueue, runId });
  if (!isolatedQueue) throw new Error('Runnable analysis set changed; refusing worker invocation.');
  const worker = await workerCall();
  record('H14-fake-worker-completes-without-provider-dispatch', worker.response.status === 200 && worker.body?.status === 'ready' && worker.body?.runId === runId, { status: worker.response.status, workerStatus: worker.body?.status, runId: worker.body?.runId });

  const review = await functionCall({ operation: 'review', captureId });
  const candidates = review.body?.segments?.flatMap(segment => segment.candidates ?? []) ?? [];
  const linkedCandidate = candidates.find(candidate => candidate.taskId === taskId);
  record('H15-task-recognition-uses-text-and-pointer-evidence', review.response.status === 200 && Boolean(linkedCandidate) && Number(linkedCandidate.pointerFeature) > 0 && Number(linkedCandidate.semanticScore) > 0, {
    status: review.response.status,
    candidateCount: candidates.length,
    linkedTaskId: linkedCandidate?.taskId ?? null,
    pointerFeature: linkedCandidate?.pointerFeature ?? null,
    semanticScore: linkedCandidate?.semanticScore ?? null,
  });

  const { data: runReadback, error: runReadError } = await admin.from('meeting_analysis_runs')
    .select('id,state,provider_mode,actual_twd_micros').eq('id', runId).single();
  record('H16-hosted-run-readback-is-ready-and-fake', !runReadError && runReadback?.state === 'ready' && runReadback?.provider_mode === 'fake' && Number(runReadback?.actual_twd_micros ?? -1) === 0, { runReadError: runReadError?.message ?? null, runReadback });

  const purgeWithoutSecret = await fetch(`${baseUrl}/functions/v1/purge_meeting_audio`, {
    method: 'POST', headers: { apikey: secretKey, 'Content-Type': 'application/json' }, body: '{}',
  });
  record('H17-purge-function-requires-dedicated-secret', purgeWithoutSecret.status === 401, { status: purgeWithoutSecret.status });
} catch (error) {
  record('UNCAUGHT', false, { error: error instanceof Error ? error.message : String(error) });
} finally {
  const cleanupResult = await cleanup();
  record('H18-synthetic-fixture-cleaned', cleanupResult.cleanupComplete, cleanupResult);
}

const result = {
  devId: 'DEV-123',
  releaseId: 'REL-001',
  status: failures.length ? 'FAIL' : 'PASS',
  environment: 'hosted-production-bound-synthetic-fixture',
  providerMode: 'fake',
  externalProviderDispatchPerformed: false,
  syntheticFixtureCreated: true,
  cleanupComplete,
  cases,
  failures,
  generatedAt: new Date().toISOString(),
};
mkdirSync('output/qa/dev-123', { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
