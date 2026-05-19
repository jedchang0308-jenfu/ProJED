import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `p5-smoke-${suffix}@example.invalid`;
const password = `P5-smoke-${suffix}-Aa1!`;
const legacyBoardId = `b_p5_${suffix}`;
const parentLegacyNodeId = `node_p5_parent_${suffix}`;
const childLegacyNodeId = `node_p5_child_${suffix}`;
const legacyDependencyId = `dep_p5_${suffix}`;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const assertOk = (label, result) => {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
};

let userId;
let tenantId;

try {
  const createdUser = assertOk(
    'admin.createUser',
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'P5 Smoke User' },
    })
  );
  userId = createdUser.user.id;

  assertOk(
    'signInWithPassword',
    await userClient.auth.signInWithPassword({ email, password })
  );

  const profile = assertOk(
    'profile upsert',
    await userClient
      .from('profiles')
      .upsert({ id: userId, email, display_name: 'P5 Smoke User' })
      .select()
      .single()
  );

  const tenant = assertOk(
    'create_tenant_with_owner',
    await userClient.rpc('create_tenant_with_owner', {
      tenant_name: `P5 Smoke Tenant ${suffix}`,
    })
  );
  tenantId = tenant.id;

  const project = assertOk(
    'project insert with legacy board id',
    await userClient
      .from('projects')
      .insert({
        tenant_id: tenantId,
        legacy_board_id: legacyBoardId,
        name: 'P5 Smoke Board',
        sort_order: Date.now(),
      })
      .select()
      .single()
  );

  const parentNode = assertOk(
    'parent WBS insert with legacy node id',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenantId,
        project_id: project.id,
        legacy_node_id: parentLegacyNodeId,
        title: 'P5 Parent',
        status: 'todo',
        item_type: 'group',
        sort_order: 1,
      })
      .select()
      .single()
  );

  const resolvedParent = assertOk(
    'legacy parent id resolution',
    await userClient
      .from('wbs_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('project_id', project.id)
      .eq('legacy_node_id', parentLegacyNodeId)
      .single()
  );

  const childNode = assertOk(
    'child WBS insert with resolved UUID parent',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenantId,
        project_id: project.id,
        parent_id: resolvedParent.id,
        legacy_node_id: childLegacyNodeId,
        title: 'P5 Child',
        status: 'in_progress',
        item_type: 'task',
        sort_order: 2,
      })
      .select()
      .single()
  );

  const dependency = assertOk(
    'dependency insert with legacy dependency id',
    await userClient
      .from('wbs_dependencies')
      .upsert(
        {
          tenant_id: tenantId,
          project_id: project.id,
          legacy_dependency_id: legacyDependencyId,
          from_item_id: parentNode.id,
          from_side: 'end',
          to_item_id: childNode.id,
          to_side: 'start',
          offset_days: 0,
        },
        { onConflict: 'tenant_id,project_id,legacy_dependency_id' }
      )
      .select()
      .single()
  );

  assertOk(
    'legacy node update',
    await userClient
      .from('wbs_items')
      .update({ title: 'P5 Child Updated' })
      .eq('tenant_id', tenantId)
      .eq('project_id', project.id)
      .eq('legacy_node_id', childLegacyNodeId)
  );

  assertOk(
    'dependency delete by legacy id',
    await userClient
      .from('wbs_dependencies')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('project_id', project.id)
      .eq('legacy_dependency_id', legacyDependencyId)
  );

  console.log(JSON.stringify({
    ok: true,
    profile: profile.id,
    tenant: tenantId,
    project: project.id,
    parent_node: parentNode.id,
    child_node: childNode.id,
    dependency: dependency.id,
  }, null, 2));
} finally {
  if (tenantId) {
    await admin.from('tenants').delete().eq('id', tenantId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
