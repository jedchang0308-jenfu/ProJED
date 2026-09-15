import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const outputPath = 'output/qa/dev-123/hosted-readiness-result.json';
const npmCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const projectRef = String(process.env.DEV123_HOSTED_PROJECT_REF ?? '').trim();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
const baseUrl = String(process.env.DEV123_HOSTED_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const secretKey = String(process.env.SUPABASE_SECRET_KEY ?? '').trim();
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();

const requiredMigrations = [
  '20260914120000_dev_122_quick_unplaced_task_rpc.sql',
  '20260914122616_dev_123_meeting_task_resolution.sql',
  '20260914130548_dev_123_review_decisions.sql',
  '20260914133819_dev_123_control_hardening.sql',
  '20260914154451_dev_123_retry_atomicity.sql',
  '20260914161741_dev_123_projection_task_scope.sql',
  '20260915103000_dev_123_projection_accepted_links.sql',
  '20260915133000_dev_123_manifest_timeline_integrity.sql',
  '20260915170000_dev_123_projection_request_idempotency.sql',
];
const requiredFunctions = [
  'meeting_capture_control',
  'process_meeting_analysis',
  'purge_meeting_audio',
];

const checks = [];
const add = (id, status, details = {}) => checks.push({ id, status, details });

const parseJsonOutput = (text) => {
  const source = String(text ?? '').trim();
  if (!source) return null;
  try { return JSON.parse(source); } catch {
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
    for (const line of lines) {
      try { return JSON.parse(line); } catch { /* continue */ }
    }
  }
  return null;
};

const runCli = (args) => {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : npmCommand;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [npmCommand, 'supabase', ...args].join(' ')]
    : ['supabase', ...args];
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    timeout: 120_000,
  });
  const output = `${String(result.stdout ?? '')}${String(result.stderr ?? '')}`;
  if (result.error) throw new Error(result.error.message);
  if ((result.status ?? 1) !== 0) throw new Error(output.slice(-3000));
  return { output, json: parseJsonOutput(output) };
};

const migrationRemoteIds = output => {
  const ids = new Set();
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const match = line.match(/\|\s*`?(\d{12,14})`?\s*\|\s*`?(\d{12,14})`?\s*\|/);
    if (match?.[2]) ids.add(match[2]);
  }
  return ids;
};

const readApi = async (path, key, extra = {}) => {
  if (!baseUrl || !key) return { status: 'NOT_RUN', details: { reason: 'hosted URL and key were not provided' } };
  try {
    const apiHeaders = key.startsWith('sb_')
      ? { apikey: key }
      : { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { ...apiHeaders, ...extra },
    });
    const status = response.ok ? 'PASS' : [404, 406].includes(response.status) ? 'PENDING' : 'FAIL';
    return { status, details: { httpStatus: response.status } };
  } catch (error) {
    return { status: 'FAIL', details: { error: error instanceof Error ? error.message : String(error) } };
  }
};

const main = async () => {
  add('hosted-inputs', projectRef && accessToken ? 'PASS' : 'PENDING', {
    projectRefProvided: Boolean(projectRef),
    accessTokenProvided: Boolean(accessToken),
    remoteMutationPerformed: false,
  });

  let migrations = null;
  let functions = null;
  let lint = null;
  if (projectRef && accessToken) {
    try {
      migrations = runCli(['migration', 'list', '--project-ref', projectRef]);
      const remoteIds = new Set((migrations.json?.migrations ?? []).filter(item => item.remote).map(item => String(item.remote)));
      for (const id of migrationRemoteIds(migrations.output)) remoteIds.add(id);
      const missing = requiredMigrations.filter(file => !remoteIds.has(file.slice(0, file.indexOf('_'))));
      add('hosted-migration-history', missing.length === 0 ? 'PASS' : 'PENDING', {
        requiredMigrations: requiredMigrations.length,
        missingMigrations: missing,
      });
    } catch (error) {
      add('hosted-migration-history', 'FAIL', { error: error instanceof Error ? error.message : String(error) });
    }
    try {
      functions = runCli(['functions', 'list', '--project-ref', projectRef, '--output', 'json']);
      const functionRows = Array.isArray(functions.json) ? functions.json : functions.json?.functions ?? [];
      const remoteFunctions = new Set(functionRows.map(item => String(item.slug ?? item.name)));
      const missing = requiredFunctions.filter(name => !remoteFunctions.has(name));
      add('hosted-edge-functions', missing.length === 0 ? 'PASS' : 'PENDING', {
        requiredFunctions,
        missingFunctions: missing,
      });
    } catch (error) {
      add('hosted-edge-functions', 'FAIL', { error: error instanceof Error ? error.message : String(error) });
    }
    try {
      lint = runCli(['db', 'lint', '--linked', '--level', 'error', '--fail-on', 'error']);
      add('hosted-schema-lint', 'PASS', { resultCount: Array.isArray(lint.json?.results) ? lint.json.results.length : 0 });
    } catch (error) {
      add('hosted-schema-lint', 'FAIL', { error: error instanceof Error ? error.message : String(error) });
    }
  } else {
    add('hosted-migration-history', 'PENDING', { reason: 'hosted project ref/access token not provided' });
    add('hosted-edge-functions', 'PENDING', { reason: 'hosted project ref/access token not provided' });
    add('hosted-schema-lint', 'PENDING', { reason: 'hosted project ref/access token not provided' });
  }

  const publicProbe = await readApi('/rest/v1/meeting_capture_sessions?select=id&limit=0', secretKey || publishableKey);
  const privateProbe = await readApi('/rest/v1/meeting_artifact_cleanup?select=obligation_id&limit=0', secretKey, { 'Accept-Profile': 'private' });
  add('hosted-public-dev123-table', publicProbe.status, publicProbe.details);
  add('hosted-private-dev123-table-service-role', privateProbe.status, privateProbe.details);

  const failing = checks.filter(check => check.status === 'FAIL');
  const pending = checks.filter(check => check.status === 'PENDING' || check.status === 'NOT_RUN');
  const status = failing.length > 0 ? 'FAIL' : pending.length > 0 ? 'PENDING' : 'PASS';
  const result = {
    devId: 'DEV-123',
    status,
    environment: 'hosted-read-only-readiness',
    projectRef: projectRef || null,
    remoteMutationPerformed: false,
    checks,
    failures: failing.map(check => check.id),
    pending: pending.map(check => check.id),
    generatedAt: new Date().toISOString(),
  };
  mkdirSync('output/qa/dev-123', { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (status === 'FAIL') process.exitCode = 1;
}

await main();
