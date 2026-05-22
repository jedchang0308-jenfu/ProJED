process.env.PROJED_ENV ||= 'test';

await import('./load-local-env.mjs');

const environment = process.env.PROJED_ENV || 'test';
const backend = process.env.VITE_DATA_BACKEND === 'supabase' ? 'supabase' : 'firebase';

const requiredByBackend = {
  firebase: [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_GOOGLE_CLIENT_ID',
  ],
  supabase: [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_AUTH_REDIRECT_URL',
  ],
};

const required = requiredByBackend[backend];
const missing = required.filter((key) => !process.env[key]);

const summary = {
  ok: missing.length === 0,
  environment,
  backend,
  envFilePriority: [
    `.env.${environment}.local`,
    `.env.${environment}`,
    '.env.p8.local',
    '.env.local',
    '.env.development.local',
    '.env.production.local',
    '.env',
  ],
  missing,
  detected: {
    firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || null,
    redirectUrl: process.env.VITE_SUPABASE_AUTH_REDIRECT_URL || process.env.SUPABASE_AUTH_REDIRECT_URL || null,
  },
};

if (!summary.ok) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
