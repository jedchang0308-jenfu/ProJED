import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const baseUrl = String(process.env.DEV123_LOCAL_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const anonKey = String(process.env.DEV123_LOCAL_SUPABASE_ANON_KEY ?? '').trim();
const serviceRoleKey = String(process.env.DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const email = String(process.env.DEV123_LOCAL_SUPABASE_TEST_EMAIL ?? 'test@example.com').trim();
const password = String(process.env.DEV123_LOCAL_SUPABASE_TEST_PASSWORD ?? 'password123');
const outputPath = 'output/qa/dev-123/auth-storage-local-result.json';
const tenantId = 'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1';
const projectId = 'b2b2b2b2-c2c2-d2d2-e2e2-f2f2f2f2f2f2';

const cases = [];
const failures = [];
const record = (id, ok, details = {}) => {
  cases.push({ id, ok, details });
  if (!ok) failures.push(id);
};

const headers = (key, token = key, extra = {}) => ({
  apikey: key,
  authorization: `Bearer ${token}`,
  ...extra,
});

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
};

const run = async () => {
  if (!baseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('DEV123_LOCAL_SUPABASE_URL, DEV123_LOCAL_SUPABASE_ANON_KEY and DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const login = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: headers(anonKey, anonKey, { 'content-type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  });
  const accessToken = String(login.body?.access_token ?? '');
  record('auth-login', login.response.ok && Boolean(accessToken), { status: login.response.status });
  if (!accessToken) throw new Error(`Auth login failed with status ${login.response.status}`);

  const authUser = await request('/auth/v1/user', { headers: headers(anonKey, accessToken) });
  record('auth-user-readback', authUser.response.ok && authUser.body?.email === email, { status: authUser.response.status, userId: authUser.body?.id ?? null });

  const rawAnon = await request('/rest/v1/meeting_capture_sessions?select=id&limit=1', {
    headers: headers(anonKey, anonKey),
  });
  record('raw-capture-anonymous-denied', [401, 403].includes(rawAnon.response.status), { status: rawAnon.response.status });

  const rawUser = await request('/rest/v1/meeting_capture_sessions?select=id&limit=1', {
    headers: headers(anonKey, accessToken),
  });
  record('raw-capture-authenticated-denied', [401, 403].includes(rawUser.response.status), { status: rawUser.response.status });

  const privateUser = await request('/rest/v1/meeting_artifact_cleanup?select=obligation_id&limit=1', {
    headers: headers(anonKey, accessToken, { 'Accept-Profile': 'private' }),
  });
  record('private-schema-authenticated-denied', [401, 403].includes(privateUser.response.status), { status: privateUser.response.status });

  const privateService = await request('/rest/v1/meeting_artifact_cleanup?select=obligation_id&limit=1', {
    headers: headers(serviceRoleKey, serviceRoleKey, { 'Accept-Profile': 'private' }),
  });
  record('private-schema-service-role-readback', privateService.response.ok, { status: privateService.response.status });

  const rawService = await request('/rest/v1/meeting_capture_sessions?select=id&limit=1', {
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  record('raw-capture-service-role-readback', rawService.response.ok, { status: rawService.response.status });

  const bucket = await request('/storage/v1/bucket/meeting-audio', {
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  record('audio-bucket-private', bucket.response.ok && bucket.body?.public === false, { status: bucket.response.status, public: bucket.body?.public ?? null });

  const privatePath = `dev123-auth-${randomUUID()}.txt`;
  const upload = await request(`/storage/v1/object/meeting-audio/${privatePath}`, {
    method: 'POST',
    headers: headers(serviceRoleKey, serviceRoleKey, { 'content-type': 'text/plain', 'x-upsert': 'false' }),
    body: 'dev123-auth-storage-probe',
  });
  record('service-storage-upload', upload.response.ok, { status: upload.response.status });

  const userObject = await request(`/storage/v1/object/meeting-audio/${privatePath}`, {
    headers: headers(anonKey, accessToken),
  });
  record('private-object-authenticated-denied', !userObject.response.ok, { status: userObject.response.status });

  const serviceObject = await request(`/storage/v1/object/meeting-audio/${privatePath}`, {
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  record('private-object-service-readback', serviceObject.response.ok && serviceObject.body === 'dev123-auth-storage-probe', { status: serviceObject.response.status });

  const recordId = randomUUID();
  const captureId = randomUUID();
  const knowledge = await request('/rest/v1/knowledge_records', {
    method: 'POST',
    headers: headers(serviceRoleKey, serviceRoleKey, { 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({
      id: recordId,
      tenant_id: tenantId,
      project_id: projectId,
      record_type: 'meeting',
      title: 'DEV-123 auth storage probe',
      content: 'synthetic only',
      occurred_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      status: 'draft',
      visibility: 'project',
      created_by: authUser.body.id,
      recorded_by: authUser.body.id,
    }),
  });
  record('service-record-fixture', knowledge.response.ok, { status: knowledge.response.status });
  if (!knowledge.response.ok) throw new Error(`Fixture record failed with status ${knowledge.response.status}`);

  const capture = await request('/rest/v1/meeting_capture_sessions', {
    method: 'POST',
    headers: headers(serviceRoleKey, serviceRoleKey, { 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({
      id: captureId,
      tenant_id: tenantId,
      project_id: projectId,
      record_id: recordId,
      created_by: authUser.body.id,
      idempotency_key: `dev123-auth-${captureId}`,
      state: 'created',
    }),
  });
  record('service-capture-fixture', capture.response.ok, { status: capture.response.status });

  const captureUser = await request(`/rest/v1/meeting_capture_sessions?id=eq.${captureId}&select=id`, {
    headers: headers(anonKey, accessToken),
  });
  record('capture-row-authenticated-denied', [401, 403].includes(captureUser.response.status), { status: captureUser.response.status });

  const cleanupCapture = await request(`/rest/v1/meeting_capture_sessions?id=eq.${captureId}`, {
    method: 'DELETE',
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  const cleanupRecord = await request(`/rest/v1/knowledge_records?id=eq.${recordId}`, {
    method: 'DELETE',
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  const cleanupObject = await request(`/storage/v1/object/meeting-audio/${privatePath}`, {
    method: 'DELETE',
    headers: headers(serviceRoleKey, serviceRoleKey),
  });
  record('synthetic-fixture-cleanup', cleanupCapture.response.ok && cleanupRecord.response.ok && cleanupObject.response.ok, {
    capture: cleanupCapture.response.status,
    record: cleanupRecord.response.status,
    object: cleanupObject.response.status,
  });
};

const main = async () => {
  let error = null;
  try {
    await run();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    failures.push('UNCAUGHT');
  }
  const result = {
    devId: 'DEV-123',
    status: failures.length === 0 && !error ? 'PASS' : 'FAIL',
    environment: 'task-owned-local-supabase-auth-storage',
    cases,
    failures,
    error,
    generatedAt: new Date().toISOString(),
  };
  mkdirSync('output/qa/dev-123', { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
};

await main();
