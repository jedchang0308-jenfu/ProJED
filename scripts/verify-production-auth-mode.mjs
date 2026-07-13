import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const authService = read('src/services/authService.ts');
const authGate = read('src/components/AuthGate.tsx');
const viteConfig = read('vite.config.js');

const checks = [
  {
    name: 'local-password auth mode is guarded by import.meta.env.DEV',
    ok: /import\.meta\.env\.DEV\s*&&\s*getSupabaseAuthMode\(\)\s*===\s*['"]local-password['"]/.test(authService) &&
      !/getSupabaseAuthMode\(\)\s*===\s*['"]local-password['"]\s*\|\|\s*isLocalSupabaseUrl\(\)/.test(authService),
  },
  {
    name: 'local Supabase URL remains the only production-compatible password auth path',
    ok: /isSupabaseBackend\s*&&\s*\(\s*isLocalSupabaseUrl\(\)\s*\|\|/.test(authService),
  },
  {
    name: 'auto test login is gated through isSupabaseLocalPasswordAuth',
    ok: /shouldAutoTestLogin\s*=[\s\S]*isLocalSupabasePasswordMode\s*&&[\s\S]*VITE_SUPABASE_AUTO_TEST_LOGIN\s*===\s*['"]true['"]/.test(authGate),
  },
  {
    name: 'Supabase OAuth redirect preserves board invite token',
    ok: authService.includes('BOARD_INVITE_TOKEN_PARAM') &&
      /new URLSearchParams\(window\.location\.search\)\.get\(BOARD_INVITE_TOKEN_PARAM\)/.test(authService) &&
      /redirectUrl\.searchParams\.set\(BOARD_INVITE_TOKEN_PARAM,\s*boardInviteToken\)/.test(authService),
  },
  {
    name: 'production build overrides local Supabase test credentials and auto-login settings',
    ok: viteConfig.includes("'import.meta.env.VITE_SUPABASE_TEST_EMAIL': JSON.stringify('')") &&
      viteConfig.includes("'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify('')") &&
      viteConfig.includes("'import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN': JSON.stringify('false')") &&
      viteConfig.includes("'import.meta.env.VITE_SUPABASE_AUTH_MODE': JSON.stringify('oauth-google')"),
  },
];

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.error('Production auth mode verification failed:');
  for (const check of failed) console.error(`- ${check.name}`);
  process.exit(1);
}

console.log(`Production auth mode verification passed: ${checks.length} checks.`);
