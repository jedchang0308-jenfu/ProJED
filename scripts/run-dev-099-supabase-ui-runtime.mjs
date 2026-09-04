import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd());
const candidate = resolve(root, '..', '.worktrees', 'ProJED', 'capa-001-dev099');
const state = resolve(process.env.TEMP || root, 'capa-001-dev099-supabase-ui-4012');
const parse = file => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/)
  .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/))
  .filter(Boolean)
  .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
const localEnv = parse(resolve(root, '.env.local'));
if (!existsSync(resolve(candidate, 'node_modules', 'vite', 'bin', 'vite.js'))) throw new Error('candidate Vite dependency missing');
mkdirSync(state, { recursive: true });
const env = { ...process.env, VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_URL: localEnv.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: localEnv.VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_AUTH_MODE: 'local-password', VITE_SUPABASE_TEST_EMAIL: localEnv.VITE_SUPABASE_TEST_EMAIL, VITE_SUPABASE_TEST_PASSWORD: localEnv.VITE_SUPABASE_TEST_PASSWORD, VITE_SUPABASE_AUTO_TEST_LOGIN: 'true', VITE_ENABLE_SUPABASE_DIAGNOSTICS: 'true' };
const child = spawn(process.execPath, [resolve(candidate, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'test', '--host', '127.0.0.1', '--port', '4012', '--strictPort'], { cwd: candidate, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
child.unref();
console.log(JSON.stringify({ project: candidate, purpose: 'DEV-099 real Supabase TEST UI provider/back-navigation', port: 4012, ownerPid: child.pid, cleanup: 'taskkill exact owner tree after browser gate', state }));
