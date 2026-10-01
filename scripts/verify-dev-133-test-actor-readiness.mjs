import { createClient } from '@supabase/supabase-js';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey, distinctReadyActors, testProjectRef } from './dev133-test-actor-support.mjs';
import { inspectTestActor } from './dev133-actor-probe.mjs';

const config = loadTestActorConfig();
const supabaseUrl = (config.VITE_SUPABASE_URL || '').trim();
const anonKey = (config.VITE_SUPABASE_ANON_KEY || '').trim();
const browserMode = process.argv.includes('--browser');
const actors = [
  { alias: 'A', email: config.DEV133_TEST_ACTOR_A_EMAIL || config.VITE_SUPABASE_TEST_EMAIL, password: config.DEV133_TEST_ACTOR_A_PASSWORD || config.VITE_SUPABASE_TEST_PASSWORD },
  { alias: 'B', email: config.DEV133_TEST_ACTOR_B_EMAIL, password: config.DEV133_TEST_ACTOR_B_PASSWORD },
];
const output = { devId: 'DEV-133', status: 'BLOCKED', projectRef: testProjectRef, checks: [], actors: [], mutation: 'no-business-data-writes' };
const finish = () => {
  console.log(JSON.stringify(output));
  process.exitCode = output.status === 'PASS' ? 0 : 2;
};

async function passwordActor(actor) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: actor.email.trim(), password: actor.password });
    if (error || !data.session?.access_token) return { actor: { alias: actor.alias, ready: false, reason: 'sign-in-failed' }, accountId: null };
    return await inspectTestActor(client, actor.alias, actor.email.trim(), data.session.access_token);
  } catch {
    return { actor: { alias: actor.alias, ready: false, reason: 'sign-in-failed' }, accountId: null };
  } finally { await client.auth.signOut({ scope: 'local' }).catch(() => undefined); }
}

async function main() {
  if (!isAuthorizedTestUrl(supabaseUrl) || !isPublicTestKey(anonKey)) {
    output.checks.push({ name: 'test-project-boundary', status: 'BLOCKED', reason: 'missing-config-or-unauthorized-test-url' });
    return finish();
  }
  const missing = actors.flatMap(actor => [
    !actor.email && `DEV133_TEST_ACTOR_${actor.alias}_EMAIL`,
    (!browserMode || actor.alias === 'A') && !actor.password && `DEV133_TEST_ACTOR_${actor.alias}_PASSWORD`,
  ]).filter(Boolean);
  if (missing.length) {
    output.checks.push({ name: 'ordinary-session-credentials', status: 'BLOCKED', missingEnv: missing });
    return finish();
  }
  if (browserMode) {
    const actorA = await passwordActor(actors[0]);
    if (!actorA.actor.ready) {
      output.actors = [actorA.actor];
      return finish();
    }
    const { runGoogleActorReadiness } = await import('./run-dev-133-google-actor-readiness.mjs');
    await runGoogleActorReadiness({ supabaseUrl, anonKey, expectedEmail: actors[1].email.trim(), actorA, output });
    return finish();
  }
  const results = await Promise.all(actors.map(passwordActor));
  output.actors = results.map(result => result.actor);
  output.status = distinctReadyActors(results) ? 'PASS' : 'BLOCKED';
  output.checks.push({ name: 'distinct-ordinary-session-readiness', status: output.status });
  finish();
}

main().catch(() => {
  output.checks.push({ name: 'readiness-runner', status: 'BLOCKED', reason: 'runner-failed-see-sanitized-lifecycle' });
  finish();
});
