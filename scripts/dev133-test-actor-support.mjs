import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const testProjectRef = 'fhisnnufoeulxqrchldf';
const allowedKeys = new Set([
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_TEST_EMAIL', 'VITE_SUPABASE_TEST_PASSWORD',
  'DEV133_TEST_ACTOR_A_EMAIL', 'DEV133_TEST_ACTOR_A_PASSWORD',
  'DEV133_TEST_ACTOR_B_EMAIL', 'DEV133_TEST_ACTOR_B_PASSWORD',
]);

export function loadTestActorConfig(root = process.cwd(), environment = process.env) {
  const values = {};
  for (const key of allowedKeys) if (environment[key]) values[key] = environment[key];
  // Do not import the generic loader: it includes production/admin env files.
  for (const filename of ['.env.test.local', '.env.local']) {
    const file = path.join(root, filename);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
      const match = line.trim().match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/u);
      if (!match || !allowedKeys.has(match[1]) || values[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      values[match[1]] = value;
    }
  }
  return values;
}

export function isAuthorizedTestUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === `${testProjectRef}.supabase.co`
      && !url.username && !url.password && !url.port && url.pathname === '/'
      && !url.search && !url.hash;
  } catch { return false; }
}

export function distinctReadyActors(results) {
  return results.length === 2 && results.every(result => result.actor.ready && result.accountId)
    && results[0].accountId !== results[1].accountId;
}

export function isPublicTestKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return claims.role === 'anon' && claims.ref === testProjectRef;
  } catch { return false; }
}
