import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

test('legacy Edge handlers pause new work while their read-only calendar continues', async t => {
  const env = new Map(Object.entries({
    PROJED_LEGACY_WRITE_MODE: 'paused', SUPABASE_URL: 'http://fixture.invalid', SUPABASE_SECRET_KEY: 'synthetic',
    DEV123_PURGE_SECRET: 'synthetic', DEV123_WORKER_SECRET: 'synthetic',
  }));
  let handler;
  let calendarUpdates = 0;
  let dbCalls = 0;
  const serve = callback => { handler = callback; };
  const from = table => {
    dbCalls++;
    assert.equal(table, 'calendar_subscriptions');
    const query = {
      select: () => query, eq: () => query,
      update() { calendarUpdates++; return query; },
      maybeSingle: async () => ({ data: { id: 'subscription', owner_user_id: 'owner',
        name: 'Private calendar', filters_json: {}, is_active: true, expires_at: null } }),
    };
    return query;
  };
  t.mock.method(globalThis, 'fetch', () => assert.fail('No external calls are allowed'));
  globalThis.Deno = { env: { get: key => env.get(key) }, serve };
  globalThis.dev139EdgeFixture = { serve, createClient: () => ({ from }) };
  // Run each checked-in handler. Replace only its two remote runtime imports.
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2' || specifier === 'https://deno.land/std@0.177.0/http/server.ts') {
      return { url: 'data:text/javascript,export const { serve, createClient } = globalThis.dev139EdgeFixture;', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  } });
  t.after(() => { hooks.deregister(); delete globalThis.Deno; delete globalThis.dev139EdgeFixture; });
  const load = async name => {
    handler = undefined;
    await import(`../../../supabase/functions/${name}/index.ts`);
    assert.equal(typeof handler, 'function');
    return handler;
  };
  const post = (headers, body = {}) => new Request('https://fixture.invalid/function', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const assertPaused = async response => {
    assert.equal(response.status, 503);
    const { error } = await response.json();
    assert.equal(error.code, 'PROJED_SOURCE_WRITE_PAUSED');
    assert.match(error.message, /恢復後重試/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  };
  for (const [name, headers] of [
    ['purge_meeting_audio', { 'x-projed-purge-secret': 'synthetic' }],
    ['process_meeting_analysis', { 'x-projed-worker-secret': 'synthetic' }],
    ['match_project_knowledge', { Authorization: 'Bearer synthetic' }],
    ['synthesize_meeting_record', { Authorization: 'Bearer synthetic' }],
  ]) {
    const run = await load(name);
    assert.equal((await run(post({}))).status, 401);
    await assertPaused(await run(post(headers)));
  }
  const capture = await load('meeting_capture_control');
  for (const operation of ['begin', 'upload-token', 'reserve-segment', 'complete-upload', 'save-projection']) {
    await assertPaused(await capture(post({ Authorization: 'Bearer synthetic' }, { operation })));
  }
  assert.equal((await capture(post({}, { operation: 'begin' }))).status, 401);
  for (const operation of ['status', 'playback-url']) {
    // Missing IDs reach the original input checks before any SDK access.
    assert.equal((await capture(post({ Authorization: 'Bearer synthetic' }, { operation }))).status, 400);
  }
  assert.equal(dbCalls, 0);
  const calendar = await load('calendar-feed');
  for (const mode of ['paused', 'unexpected', 'open', undefined]) {
    if (mode === undefined) env.delete('PROJED_LEGACY_WRITE_MODE');
    else env.set('PROJED_LEGACY_WRITE_MODE', mode);
    const before = calendarUpdates;
    const response = await calendar(new Request('https://fixture.invalid/calendar-feed?token=synthetic'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /BEGIN:VCALENDAR/);
    assert.equal(calendarUpdates - before, mode === 'open' || mode === undefined ? 1 : 0);
  }
});
