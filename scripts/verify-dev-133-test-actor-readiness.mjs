import { createClient } from '@supabase/supabase-js';

// Load only local, non-production test configuration. This module never reads or
// uses a service-role key; both actors must pass through the ordinary Auth path.
await import('./load-local-env.mjs');

const expectedTestProjectRef = 'fhisnnufoeulxqrchldf';
const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const actorAEmail = String(
  process.env.DEV133_TEST_ACTOR_A_EMAIL || process.env.VITE_SUPABASE_TEST_EMAIL || ''
).trim();
const actorAPassword = String(
  process.env.DEV133_TEST_ACTOR_A_PASSWORD || process.env.VITE_SUPABASE_TEST_PASSWORD || ''
).trim();
const actorBEmail = String(process.env.DEV133_TEST_ACTOR_B_EMAIL || '').trim();
const actorBPassword = String(process.env.DEV133_TEST_ACTOR_B_PASSWORD || '').trim();

const output = {
  devId: 'DEV-133',
  status: 'BLOCKED',
  projectRef: null,
  checks: [],
  actors: [],
  mutation: 'none',
};

const finish = (exitCode = 0) => {
  console.log(JSON.stringify(output));
  process.exitCode = exitCode;
};

if (!supabaseUrl || !anonKey) {
  output.checks.push({ name: 'test-supabase-config', status: 'BLOCKED', reason: 'missing-url-or-anon-key' });
  finish(2);
} else {
  let urlProjectRef = null;
  try {
    urlProjectRef = new URL(supabaseUrl).hostname.split('.')[0] || null;
  } catch {
    urlProjectRef = null;
  }
  output.projectRef = urlProjectRef;
  if (urlProjectRef !== expectedTestProjectRef) {
    output.checks.push({
      name: 'test-project-boundary',
      status: 'BLOCKED',
      reason: 'supabase-url-is-not-authorized-test-project',
      expectedProjectRef: expectedTestProjectRef,
    });
    finish(2);
  } else if (!actorAEmail || !actorAPassword || !actorBEmail || !actorBPassword) {
    const missingEnv = [
      ['DEV133_TEST_ACTOR_A_EMAIL', actorAEmail],
      ['DEV133_TEST_ACTOR_A_PASSWORD', actorAPassword],
      ['DEV133_TEST_ACTOR_B_EMAIL', actorBEmail],
      ['DEV133_TEST_ACTOR_B_PASSWORD', actorBPassword],
    ].filter(([, value]) => !value).map(([name]) => name);
    output.checks.push({
      name: 'ordinary-session-credentials',
      status: 'BLOCKED',
      reason: 'two-test-actors-required',
      missingEnv,
    });
    finish(2);
  } else {
    const actors = [
      { alias: 'A', email: actorAEmail, password: actorAPassword },
      { alias: 'B', email: actorBEmail, password: actorBPassword },
    ];

    const inspectActor = async ({ alias, email, password }) => {
      const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const actor = { alias, authenticated: false, profile: false, activeMembershipCount: 0, workbenchRowCount: 0, ready: false };
      try {
        const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError || !signIn.session?.access_token) return { ...actor, reason: 'sign-in-failed' };

        const { data: verifiedUser, error: userError } = await client.auth.getUser(signIn.session.access_token);
        if (userError || !verifiedUser.user?.id) return { ...actor, reason: 'network-user-verification-failed' };
        actor.authenticated = true;

        const [profileResult, membershipResult, workbenchResult] = await Promise.all([
          client.from('profiles').select('id').eq('id', verifiedUser.user.id).limit(1),
          client.from('tenant_members').select('tenant_id').eq('user_id', verifiedUser.user.id).eq('status', 'active'),
          client.from('task_workbench_unplaced_items').select('id').eq('owner_id', verifiedUser.user.id).limit(1),
        ]);
        if (profileResult.error || membershipResult.error || workbenchResult.error) {
          return { ...actor, reason: 'ordinary-session-readback-failed' };
        }
        actor.profile = (profileResult.data || []).length > 0;
        actor.activeMembershipCount = (membershipResult.data || []).length;
        actor.workbenchRowCount = (workbenchResult.data || []).length;
        actor.ready = actor.profile && actor.activeMembershipCount > 0 && actor.workbenchRowCount > 0;
        return actor;
      } finally {
        await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
    };

    const actorResults = await Promise.all(actors.map(inspectActor));
    output.actors = actorResults;
    output.checks.push({
      name: 'ordinary-session-readiness',
      status: actorResults.every((actor) => actor.ready) ? 'PASS' : 'BLOCKED',
      evidence: 'ordinary Supabase Auth plus read-only profile, membership, and workbench queries',
    });
    output.status = actorResults.every((actor) => actor.ready) ? 'PASS' : 'BLOCKED';
    finish(output.status === 'PASS' ? 0 : 2);
  }
}
