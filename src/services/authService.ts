import { requireFirebaseAuth, requireFirebaseDb } from './firebase';
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FirestoreUser } from '../types';
import { isSupabaseBackend } from './dataBackend';
import { isSupabaseConfigured, supabase } from './supabase/client';

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
  if (configuredUrl?.trim()) return configuredUrl;
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
  isSupabaseBackend && (getSupabaseAuthMode() === 'local-password' || isLocalSupabaseUrl());

const signInWithLocalSupabasePassword = async (): Promise<FirestoreUser> => {
  const { email, password } = getSupabaseSeedCredentials();
  if (!email || !password) {
    throw new Error('Local Supabase password auth is enabled, but VITE_SUPABASE_TEST_EMAIL or VITE_SUPABASE_TEST_PASSWORD is missing.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Local Supabase sign-in did not return a user.');
  return ensureSupabaseProfile(data.user);
};

export const authService = {
  signInWithGoogle: async (): Promise<FirestoreUser | null> => {
    if (isEmbeddedAuthBlocked()) {
      throw new Error('Google sign-in is blocked in this embedded browser. Open ProJED in Chrome or Safari.');
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
    const result = await signInWithPopup(requireFirebaseAuth(), provider);
    return ensureFirestoreUser(result.user);
  },

  handleRedirectResult: async (): Promise<FirestoreUser | null> => {
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
    if (isSupabaseBackend) {
      requireSupabaseAuth();

      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      return;
    }

    await firebaseSignOut(requireFirebaseAuth());
  },

  onAuthStateChanged: (callback: (user: FirestoreUser | null) => void) => {
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
            console.error('[authService] Supabase profile sync failed:', error);
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
