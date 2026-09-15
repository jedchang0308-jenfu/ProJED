import type { QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';

let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;

export const loadQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  const { supabase } = await import('../../services/supabase/client');
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user?.id || !session.access_token) {
    if (cachedSnapshot) authEpoch += 1;
    cachedSnapshot = null;
    return null;
  }
  if (cachedSnapshot?.accountId !== session.user.id) authEpoch += 1;
  cachedSnapshot = Object.freeze({ accountId: session.user.id, accessToken: session.access_token, authEpoch });
  return cachedSnapshot;
};

export const getQuickAuthSnapshot = () => cachedSnapshot;

export const bumpQuickAuthEpoch = () => {
  authEpoch += 1;
  cachedSnapshot = null;
};

export const startQuickGoogleSignIn = async (redirectTo: string) => {
  const { supabase } = await import('../../services/supabase/client');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
};

export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  const { supabase } = await import('../../services/supabase/client');
  const subscription = supabase.auth.onAuthStateChange((_event, session) => {
    const nextAccountId = session?.user?.id ?? null;
    if (cachedSnapshot?.accountId !== nextAccountId) authEpoch += 1;
    cachedSnapshot = nextAccountId && session?.access_token
      ? Object.freeze({ accountId: nextAccountId, accessToken: session.access_token, authEpoch })
      : null;
    onChange(cachedSnapshot);
  });
  return subscription.data.subscription;
};
