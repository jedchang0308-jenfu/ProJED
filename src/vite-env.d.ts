/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_BACKEND?: 'firebase' | 'supabase' | 'local-test';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_AUTH_REDIRECT_URL?: string;
  readonly VITE_PROJED_APP_URL?: string;
  readonly VITE_SUPABASE_AUTH_MODE?: string;
  readonly VITE_SUPABASE_TEST_EMAIL?: string;
  readonly VITE_SUPABASE_TEST_PASSWORD?: string;
  readonly VITE_SUPABASE_AUTO_TEST_LOGIN?: string;
  readonly VITE_ENABLE_SUPABASE_DIAGNOSTICS?: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
