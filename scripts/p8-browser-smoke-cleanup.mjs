import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const failOnFound = args.has('--fail-on-found');
const smokeIdArg = process.argv.slice(2).find(arg => arg.startsWith('--smoke-id='));
const smokeId = smokeIdArg ? smokeIdArg.slice('--smoke-id='.length) : null;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const metadataFilter = smokeId
  ? { p8_browser_oauth_e2e: true, smoke_id: smokeId }
  : { p8_browser_oauth_e2e: true };

const { data: tenants, error: selectError } = await admin
  .from('tenants')
  .select('id,name,metadata')
  .contains('metadata', metadataFilter)
  .order('created_at', { ascending: true });

if (selectError) {
  console.error(`P8 browser smoke cleanup failed during select: ${selectError.message}`);
  process.exit(1);
}

const tenantIds = (tenants ?? []).map(tenant => tenant.id);

if (!dryRun && tenantIds.length > 0) {
  const { error: deleteError } = await admin
    .from('tenants')
    .delete()
    .in('id', tenantIds);

  if (deleteError) {
    console.error(`P8 browser smoke cleanup failed during delete: ${deleteError.message}`);
    process.exit(1);
  }
}

const found = tenantIds.length;
console.log(JSON.stringify({
  ok: !(failOnFound && found > 0),
  dry_run: dryRun,
  smoke_id: smokeId,
  found,
  cleaned: dryRun ? 0 : found,
  tenant_ids: tenantIds,
}, null, 2));

if (failOnFound && found > 0) {
  process.exit(1);
}
