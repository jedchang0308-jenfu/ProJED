import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(process.cwd());
const envPath = resolve(root, '.env.local');
const outputDirectory = resolve(root, 'output/qa/dev-095');

const parseEnvFile = (path) => {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
};

const env = { ...parseEnvFile(envPath), ...process.env };
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const email = env.VITE_SUPABASE_TEST_EMAIL;
const password = env.VITE_SUPABASE_TEST_PASSWORD;
const checks = [];
const failures = [];
const check = (id, status, evidence) => {
  checks.push({ id, status, evidence });
  if (status !== 'PASS') failures.push({ id, status, evidence });
};

const errorMessage = error => error?.message || String(error || 'unknown error');
const isSchemaError = error => /function|relation|schema|does not exist|could not find/i.test(errorMessage(error));

const main = async () => {
  if (!url || !anonKey || !email || !password) {
    check('T00-test-credentials', 'BLOCKED', 'VITE_SUPABASE_URL/ANON_KEY/TEST_EMAIL/TEST_PASSWORD 未完整設定。');
  } else {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: sessionData, error: authError } = await client.auth.signInWithPassword({ email, password });
    if (authError || !sessionData.session?.user) {
      check('T00-test-auth', 'BLOCKED', `TEST user sign-in failed: ${errorMessage(authError)}`);
    } else {
      check('T00-test-auth', 'PASS', `authenticated TEST user ${sessionData.session.user.id.slice(0, 8)}…`);

      const { data: capability, error: capabilityError } = await client.rpc('get_task_tracking_reference_capability_v1');
      if (capabilityError) {
        check('T08-readiness-probe', isSchemaError(capabilityError) ? 'BLOCKED' : 'FAIL', `capability RPC: ${errorMessage(capabilityError)}`);
      } else {
        const supported = capability && typeof capability === 'object' && capability.supported === true;
        check('T08-readiness-probe', supported ? 'PASS' : 'FAIL', capability);
      }

      const { data: tenants, error: tenantError } = await client.from('tenants').select('id,legacy_workspace_id').limit(20);
      if (tenantError) {
        check('T09-visible-tenant-scope', 'FAIL', errorMessage(tenantError));
      } else {
        check('T09-visible-tenant-scope', 'PASS', { tenantCount: tenants?.length || 0 });
      }

      const tenantIds = (tenants || []).map(tenant => tenant.id).filter(Boolean);
      for (const tenantId of tenantIds) {
        const { data: placementRows, error: placementError } = await client
          .from('wbs_item_placements')
          .select('id,task_id,project_id,placement_kind,removed_at')
          .eq('tenant_id', tenantId)
          .limit(20);
        check(`T-schema-placements-${tenantId.slice(0, 8)}`, placementError ? (isSchemaError(placementError) ? 'BLOCKED' : 'FAIL') : 'PASS', placementError ? errorMessage(placementError) : { visiblePlacementRows: placementRows?.length || 0 });

        const { data: projects, error: projectError } = await client
          .from('projects')
          .select('id,legacy_board_id')
          .eq('tenant_id', tenantId)
          .limit(20);
        if (projectError) {
          check(`T-visible-projects-${tenantId.slice(0, 8)}`, 'FAIL', errorMessage(projectError));
          continue;
        }
        check(`T-visible-projects-${tenantId.slice(0, 8)}`, 'PASS', { projectCount: projects?.length || 0 });
        for (const project of projects || []) {
          const { data: projection, error: projectionError } = await client.rpc('get_board_task_projection_v1', {
            p_tenant_id: tenantId,
            p_project_id: project.id,
          });
          check(`T-projection-${project.id.slice(0, 8)}`, projectionError ? (isSchemaError(projectionError) ? 'BLOCKED' : 'FAIL') : 'PASS', projectionError ? errorMessage(projectionError) : { rowCount: Array.isArray(projection) ? projection.length : null });
        }
      }

      await client.auth.signOut().catch(() => undefined);
    }
  }

  const blocked = checks.filter(item => item.status === 'BLOCKED').length;
  const failed = checks.filter(item => item.status === 'FAIL').length;
  const status = failed > 0 ? 'failed' : blocked > 0 ? 'blocked' : 'passed';
  const artifact = {
    dev: 'DEV-095', devId: 'DEV-095', sourceRevision: 'working-tree',
    environment: 'supabase-test-readonly-preflight', provider: 'supabase', status,
    passed: status === 'passed', mutationsPerformed: false, checks,
    summary: { PASS: checks.filter(item => item.status === 'PASS').length, FAIL: failed, NOT_RUN: 0, BLOCKED: blocked },
    notCovered: ['T01-T07 two-user mutation/realtime lifecycle remains unexecuted', 'remote migration/deploy/release remain gated'],
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'supabase-test-preflight.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(artifact, null, 2));
  if (status === 'failed') process.exitCode = 1;
};

await main();
