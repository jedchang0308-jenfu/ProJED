import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isQuickOAuthCallbackPage } from '../../features/quickTaskCapture/oauthClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const configuredSupabaseUrl = supabaseUrl;

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The quick PWA uses the OAuth 2.1 public-client callback handler when configured.
      detectSessionInUrl: !isQuickOAuthCallbackPage(),
    },
  }
);
