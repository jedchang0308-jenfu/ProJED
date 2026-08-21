import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSupabaseFunctionKey } from '../supabase/functions/_shared/supabaseApiKeys.mjs';

const readEnv = values => name => values[name];

assert.equal(
  resolveSupabaseFunctionKey('publishable', readEnv({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_map' }),
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_single',
  })),
  'sb_publishable_map',
  'publishable map must be authoritative',
);

assert.equal(
  resolveSupabaseFunctionKey('secret', readEnv({ SUPABASE_SECRET_KEY: 'sb_secret_single' })),
  'sb_secret_single',
  'local singular secret fallback must remain supported',
);

assert.throws(
  () => resolveSupabaseFunctionKey('secret', readEnv({ SUPABASE_SECRET_KEYS: '{invalid' })),
  /SUPABASE_SECRET_KEYS must be a JSON object/,
);
assert.throws(
  () => resolveSupabaseFunctionKey('publishable', readEnv({ SUPABASE_PUBLISHABLE_KEYS: '{}' })),
  /does not contain a non-empty default key/,
);
assert.throws(
  () => resolveSupabaseFunctionKey('secret', readEnv({})),
  /Missing SUPABASE_SECRET_KEYS or SUPABASE_SECRET_KEY/,
);

const root = process.cwd();
const calendar = fs.readFileSync(path.join(root, 'supabase/functions/calendar-feed/index.ts'), 'utf8');
const knowledge = fs.readFileSync(path.join(root, 'supabase/functions/match_project_knowledge/index.ts'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

assert.match(calendar, /resolveSupabaseFunctionKey\("secret"\)/);
assert.doesNotMatch(calendar, /Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE_KEY["']\)/);
assert.match(knowledge, /resolveSupabaseFunctionKey\('publishable'\)/);
assert.doesNotMatch(knowledge, /Deno\.env\.get\(["']SUPABASE_ANON_KEY["']\)/);
assert.match(config, /\[functions\.match_project_knowledge\][\s\S]*?verify_jwt\s*=\s*false/);
assert.match(config, /\[functions\.calendar-feed\][\s\S]*?verify_jwt\s*=\s*false/);

console.log('verify:dev-083-edge-key-rotation passed');
