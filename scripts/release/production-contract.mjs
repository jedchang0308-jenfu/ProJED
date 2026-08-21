import crypto from 'node:crypto';

export const PRODUCTION_CONTRACT = Object.freeze({
  schemaVersion: 1,
  taskId: 'DEV-083',
  projectId: 'projed-cc78d',
  siteId: 'projed-cc78d',
  canonicalOrigin: 'https://projed-cc78d.web.app',
  canonicalRedirectUrl: 'https://projed-cc78d.web.app/',
  backend: 'supabase',
  supabaseProjectRef: 'knodlkxqpcqyrtgwpdst',
  supabaseUrl: 'https://knodlkxqpcqyrtgwpdst.supabase.co',
  forbiddenSupabaseProjectRef: 'fhisnnufoeulxqrchldf',
  authMode: 'oauth-google',
  candidateChannel: 'production-candidate',
  candidateExpires: '1d',
  publicRequiredKeys: Object.freeze([
    'VITE_DATA_BACKEND',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_AUTH_REDIRECT_URL',
    'VITE_GOOGLE_CLIENT_ID',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_MEASUREMENT_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
  ]),
  publicOptionalKeys: Object.freeze([
    'VITE_PROJED_APP_URL',
    'VITE_GOOGLE_CALENDAR_FEED_URL',
    'VITE_DIAGNOSTICS_ENABLED',
    'VITE_SUPABASE_AUTH_MODE',
    'VITE_SUPABASE_AUTO_TEST_LOGIN',
    'VITE_SUPABASE_TEST_EMAIL',
    'VITE_SUPABASE_TEST_PASSWORD',
  ]),
  fixedPublicValues: Object.freeze({
    VITE_DATA_BACKEND: 'supabase',
    VITE_SUPABASE_AUTH_MODE: 'oauth-google',
    VITE_SUPABASE_AUTO_TEST_LOGIN: 'false',
    VITE_SUPABASE_TEST_EMAIL: '',
    VITE_SUPABASE_TEST_PASSWORD: '',
    VITE_DIAGNOSTICS_ENABLED: 'false',
  }),
  serverOnlyKeys: Object.freeze([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_ACCESS_TOKEN',
    'GEMINI_API_KEY',
  ]),
});

export const PUBLIC_ENV_KEYS = Object.freeze([
  ...PRODUCTION_CONTRACT.publicRequiredKeys,
  ...PRODUCTION_CONTRACT.publicOptionalKeys,
]);

export const SERVER_ONLY_KEYS = Object.freeze([
  ...PRODUCTION_CONTRACT.serverOnlyKeys,
]);

const sortForJson = value => {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortForJson(value[key])]));
  return value;
};

export const canonicalJson = value => JSON.stringify(sortForJson(value), null, 2);

export const sha256 = input => crypto.createHash('sha256').update(input).digest('hex');

export const contractDigest = () => sha256(canonicalJson({
  ...PRODUCTION_CONTRACT,
  publicRequiredKeys: [...PRODUCTION_CONTRACT.publicRequiredKeys],
  publicOptionalKeys: [...PRODUCTION_CONTRACT.publicOptionalKeys],
  fixedPublicValues: { ...PRODUCTION_CONTRACT.fixedPublicValues },
  serverOnlyKeys: [...PRODUCTION_CONTRACT.serverOnlyKeys],
}));

export const isLoopbackUrl = value => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const isProductionSupabaseUrl = value => value === PRODUCTION_CONTRACT.supabaseUrl;

export const isCanonicalRedirect = value => value === PRODUCTION_CONTRACT.canonicalRedirectUrl;

export const isSafeHttpsFeed = value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !isLoopbackUrl(value);
  } catch {
    return false;
  }
};
