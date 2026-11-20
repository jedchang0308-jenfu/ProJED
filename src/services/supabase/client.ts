import { createClient } from '@supabase/supabase-js';
import { BackendFeatureUnavailableError, isHttpBackend } from '../backendMode';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configuredSupabaseUrl = isHttpBackend ? undefined : supabaseUrl;
export const isSupabaseConfigured = Boolean(configuredSupabaseUrl && supabaseAnonKey);

// Legacy adapters import this singleton even when HTTP handles the request.
// Constructing the SDK would start Auth against storage on the original PWA origin.
export const supabase = isHttpBackend
  ? new Proxy({} as ReturnType<typeof createClient<Database>>, {
    get() { throw new BackendFeatureUnavailableError('Supabase'); },
  })
  : createClient<Database>(
    supabaseUrl ?? 'https://placeholder.supabase.co',
    supabaseAnonKey ?? 'placeholder-anon-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
