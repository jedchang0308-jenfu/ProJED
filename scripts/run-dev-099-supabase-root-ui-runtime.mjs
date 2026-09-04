import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd());
const parse = file => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/)
  .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/))
  .filter(Boolean)
  .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
const localEnv = parse(resolve(root, '.env.local'));
const vitePath = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vitePath)) throw new Error('root Vite dependency missing');
const port = 4013;
const child = spawn(process.execPath, [vitePath, '--mode', 'test', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  env: {
    ...process.env,
    VITE_DATA_BACKEND: 'supabase',
    VITE_SUPABASE_URL: localEnv.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: localEnv.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_AUTH_MODE: 'local-password',
    VITE_SUPABASE_TEST_EMAIL: localEnv.VITE_SUPABASE_TEST_EMAIL,
    VITE_SUPABASE_TEST_PASSWORD: localEnv.VITE_SUPABASE_TEST_PASSWORD,
    VITE_SUPABASE_AUTO_TEST_LOGIN: 'true',
    VITE_ENABLE_SUPABASE_DIAGNOSTICS: 'true',
  },
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore'],
});
child.unref();
console.log(JSON.stringify({ project: root, purpose: 'CAPA-001 supplemental DEV-098 integration Back smoke on Supabase TEST', port, ownerPid: child.pid, cleanup: 'taskkill exact owner tree after smoke' }));
