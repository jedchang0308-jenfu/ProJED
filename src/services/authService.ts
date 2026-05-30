import { requireFirebaseAuth, requireFirebaseDb } from './firebase';
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FirestoreUser } from '../types';
import { isLocalTestBackend, isSupabaseBackend } from './dataBackend';
import { isSupabaseConfigured, supabase } from './supabase/client';
import { BOARD_INVITE_TOKEN_PARAM } from '../utils/boardInviteToken';

type SupabaseUser = NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']>;

export const isEmbeddedAuthBlocked = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const isInAppBrowser =
    /FBAN|FBAV|Instagram|Line|MicroMessenger|Threads/i.test(ua);

  return isStandalone || isInAppBrowser;
};

const getGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

const ensureFirestoreUser = async (user: FirebaseUser): Promise<FirestoreUser> => {
  const db = requireFirebaseDb();
  const userRef = doc(db, 'users', user.uid);
  const docSnap = await getDoc(userRef);

  const firestoreUser: FirestoreUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    createdAt: Date.now(),
  };

  if (!docSnap.exists()) {
    await setDoc(userRef, firestoreUser);
  }

  return firestoreUser;
};

const mapSupabaseUser = (user: SupabaseUser): FirestoreUser => ({
  uid: user.id,
  email: user.email ?? null,
  displayName:
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : null,
  createdAt: user.created_at ? new Date(user.created_at).getTime() : undefined,
});

const ensureSupabaseProfile = async (user: SupabaseUser): Promise<FirestoreUser> => {
  const mappedUser = mapSupabaseUser(user);
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: mappedUser.uid,
      email: mappedUser.email,
      display_name: mappedUser.displayName,
    });
  if (error) throw new Error(error.message);
  return mappedUser;
};

const requireSupabaseAuth = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
};

const getSupabaseAuthRedirectUrl = () => {
  const configuredUrl = import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL as string | undefined;
  const boardInviteToken = new URLSearchParams(window.location.search).get(BOARD_INVITE_TOKEN_PARAM);

  if (configuredUrl?.trim()) {
    if (!boardInviteToken) return configuredUrl;
    const redirectUrl = new URL(configuredUrl);
    redirectUrl.searchParams.set(BOARD_INVITE_TOKEN_PARAM, boardInviteToken);
    return redirectUrl.toString();
  }

  if (boardInviteToken) {
    const redirectUrl = new URL(`${window.location.origin}${window.location.pathname}`);
    redirectUrl.searchParams.set(BOARD_INVITE_TOKEN_PARAM, boardInviteToken);
    return redirectUrl.toString();
  }

  return `${window.location.origin}${window.location.pathname}`;
};

const getSupabaseAuthMode = () => {
  const mode = import.meta.env.VITE_SUPABASE_AUTH_MODE as string | undefined;
  return mode?.trim().toLowerCase() || 'oauth-google';
};

const isLocalSupabaseUrl = () => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return Boolean(url && /127\.0\.0\.1:54321|localhost:54321/.test(url));
};

const getSupabaseSeedCredentials = () => {
  const email = import.meta.env.VITE_SUPABASE_TEST_EMAIL as string | undefined;
  const password = import.meta.env.VITE_SUPABASE_TEST_PASSWORD as string | undefined;
  return { email: email?.trim() || '', password: password?.trim() || '' };
};

export const isSupabaseLocalPasswordAuth = () =>
  isSupabaseBackend && (isLocalSupabaseUrl() || (import.meta.env.DEV && getSupabaseAuthMode() === 'local-password'));

export const isLocalTestAuth = () => isLocalTestBackend;

const LOCAL_TEST_SESSION_KEY = 'projed-local-test.session';
export const LOCAL_TEST_SELECTED_ACCOUNT_KEY = 'projed-local-test.selected-account';

export type LocalTestAccount = FirestoreUser & {
  id: string;
  role: 'owner' | 'admin' | 'project_manager' | 'member' | 'viewer';
  password: string;
};

export const LOCAL_TEST_ACCOUNTS: LocalTestAccount[] = [
  {
    id: 'local-test-user',
    uid: 'local-test-user',
    role: 'owner',
    email: 'test@projed.local',
    displayName: '本機測試擁有者',
    password: 'local-test',
    createdAt: 1704067200000,
  },
  {
    id: 'local-test-admin',
    uid: 'local-test-admin',
    role: 'admin',
    email: 'admin@projed.local',
    displayName: '本機測試管理員',
    password: 'local-test',
    createdAt: 1704067200000,
  },
  {
    id: 'local-test-pm',
    uid: 'local-test-pm',
    role: 'project_manager',
    email: 'pm@projed.local',
    displayName: '本機測試專案管理者',
    password: 'local-test',
    createdAt: 1704067200000,
  },
  {
    id: 'local-test-member',
    uid: 'local-test-member',
    role: 'member',
    email: 'member@projed.local',
    displayName: '本機測試成員',
    password: 'local-test',
    createdAt: 1704067200000,
  },
  {
    id: 'local-test-viewer',
    uid: 'local-test-viewer',
    role: 'viewer',
    email: 'viewer@projed.local',
    displayName: '本機測試檢視者',
    password: 'local-test',
    createdAt: 1704067200000,
  },
  {
    id: 'local-test-analyst',
    uid: 'local-test-analyst',
    role: 'member',
    email: 'analyst@projed.local',
    displayName: '本機測試分析員',
    password: 'local-test',
    createdAt: 1704067200000,
  },
];

const localTestUser: FirestoreUser = {
  uid: 'local-test-user',
  email: 'test@projed.local',
  displayName: 'ProJED 固定測試帳號',
  createdAt: 1704067200000,
};

const getSelectedLocalTestUser = (): FirestoreUser => {
  const selectedId = localStorage.getItem(LOCAL_TEST_SELECTED_ACCOUNT_KEY);
  const selected = LOCAL_TEST_ACCOUNTS.find(account => account.id === selectedId);
  if (!selected) return localTestUser;
  return {
    uid: selected.uid,
    email: selected.email,
    displayName: selected.displayName,
    createdAt: selected.createdAt,
  };
};

const signInWithLocalTestUser = async (): Promise<FirestoreUser> => {
  const selectedUser = getSelectedLocalTestUser();
  localStorage.setItem(LOCAL_TEST_SESSION_KEY, JSON.stringify(selectedUser));
  return selectedUser;
};

const getLocalTestSession = (): FirestoreUser | null => {
  try {
    const stored = localStorage.getItem(LOCAL_TEST_SESSION_KEY);
    return stored ? JSON.parse(stored) as FirestoreUser : null;
  } catch {
    return null;
  }
};

const signInWithLocalSupabasePassword = async (): Promise<FirestoreUser> => {
  const { email, password } = getSupabaseSeedCredentials();
  if (!email || !password) {
    throw new Error('本機 Supabase 密碼登入已啟用，但缺少 VITE_SUPABASE_TEST_EMAIL 或 VITE_SUPABASE_TEST_PASSWORD。');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('本機 Supabase 登入未回傳使用者。');
  return ensureSupabaseProfile(data.user);
};

export const authService = {
  signInWithGoogle: async (): Promise<FirestoreUser | null> => {
    if (isLocalTestAuth()) {
      return signInWithLocalTestUser();
    }

    if (isEmbeddedAuthBlocked()) {
      throw new Error('此內嵌瀏覽器無法使用 Google 登入。請改用 Chrome 或 Safari 開啟 ProJED。');
    }

    if (isSupabaseBackend) {
      requireSupabaseAuth();

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        return ensureSupabaseProfile(sessionData.session.user);
      }

      if (isSupabaseLocalPasswordAuth()) {
        return signInWithLocalSupabasePassword();
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getSupabaseAuthRedirectUrl(),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        const message = error.message || '';
        if (message.includes('Unsupported provider')) {
          return signInWithLocalSupabasePassword();
        }
        throw new Error(message);
      }
      return null;
    }

    const provider = getGoogleProvider();
    let result;
    try {
      result = await signInWithPopup(requireFirebaseAuth(), provider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(requireFirebaseAuth(), provider);
        return null;
      }
      throw error;
    }
    return ensureFirestoreUser(result.user);
  },

  handleRedirectResult: async (): Promise<FirestoreUser | null> => {
    if (isLocalTestAuth()) {
      return getLocalTestSession();
    }

    if (isSupabaseBackend) {
      if (!isSupabaseConfigured) return null;

      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
      return data.session?.user ? ensureSupabaseProfile(data.session.user) : null;
    }

    const result = await getRedirectResult(requireFirebaseAuth());
    if (!result?.user) return null;
    return ensureFirestoreUser(result.user);
  },

  signOut: async (): Promise<void> => {
    if (isLocalTestAuth()) {
      localStorage.removeItem(LOCAL_TEST_SESSION_KEY);
      return;
    }

    if (isSupabaseBackend) {
      requireSupabaseAuth();

      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      return;
    }

    await firebaseSignOut(requireFirebaseAuth());
  },

  onAuthStateChanged: (callback: (user: FirestoreUser | null) => void) => {
    if (isLocalTestAuth()) {
      callback(getLocalTestSession());
      return () => undefined;
    }

    if (isSupabaseBackend) {
      if (!isSupabaseConfigured) {
        callback(null);
        return () => undefined;
      }

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          callback(null);
          return;
        }

        ensureSupabaseProfile(session.user)
          .then(callback)
          .catch(error => {
            console.error('[authService] Supabase 個人資料同步失敗:', error);
            callback(mapSupabaseUser(session.user));
          });
      });
      return () => data.subscription.unsubscribe();
    }

    return onAuthStateChanged(requireFirebaseAuth(), async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        callback({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
      } else {
        callback(null);
      }
    });
  },
};
