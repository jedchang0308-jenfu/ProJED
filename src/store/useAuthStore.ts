import { create } from 'zustand';
import { authService } from '../services/authService';
import { isHttpBackend } from '../services/backendMode';
import { clearMeetingDraftRecoveryForUser } from '../services/meetingDraftRecoveryService';
import { markRecordSessionLogout, cancelRecordSessionLogout } from '../services/recordSessionProtection';
import type { AuthStore } from '../types';
import { HttpApiError } from '../services/httpApi/httpApiClient';

let authGeneration = 0;
let loginController: AbortController | undefined;
let loginTimer: ReturnType<typeof setTimeout> | undefined;
function clearLoginAttempt() {
  if (loginTimer !== undefined) clearTimeout(loginTimer);
  loginTimer = undefined;
  loginController?.abort();
  loginController = undefined;
}

const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  signingIn: false,
  error: null,
  
  signInWithGoogle: async () => {
    if (get().signingIn || get().loading) return;
    const generation = ++authGeneration;
    loginController = new AbortController();
    const signal = loginController.signal;
    set({ signingIn: true, error: null });
    // Keep the login button locked through navigation, not just the API call.
    loginTimer = setTimeout(() => {
      if (generation !== authGeneration) return;
      ++authGeneration;
      clearLoginAttempt();
      set({ signingIn: false, error: '登入未完成，請重試。' });
    }, 60_000);
    try {
      const user = await authService.signInWithGoogle(signal);
      if (generation !== authGeneration) return;
      if (!user && isHttpBackend) return;
      clearLoginAttempt();
      set({ user: user ?? null, loading: false, signingIn: false });
    } catch (error: any) {
      if (generation !== authGeneration) return;
      if (error instanceof HttpApiError && error.status === 409 && error.code === 'DB_BUSY') {
        set({ error: '登入已在進行中，請稍候。' });
        return;
      }
      clearLoginAttempt();
      set({ error: error.message, loading: false, signingIn: false });
    }
  },
  
  signOut: async () => {
    ++authGeneration;
    clearLoginAttempt();
    const currentUserId = useAuthStore.getState().user?.uid;
    try {
      if (currentUserId && isHttpBackend) markRecordSessionLogout(currentUserId);
      set({ loading: true, signingIn: false, error: null });
      if (currentUserId) await clearMeetingDraftRecoveryForUser(currentUserId);
      await authService.signOut();
      set({ user: null, loading: false });
    } catch (error: any) {
      if (currentUserId && isHttpBackend) cancelRecordSessionLogout(currentUserId);
      set({ error: error.message, loading: false });
    }
  },

  updateDisplayName: async (displayName) => {
    try {
      set({ error: null });
      const user = await authService.updateDisplayName(displayName);
      set({ user });
    } catch (error: any) {
      const message = error?.message || '顯示名稱儲存失敗。';
      set({ error: message });
      throw new Error(message);
    }
  },
}));

// The HTTP callback runs on the server. One Session read resolves the initial
// state; a second bootstrap response could overwrite a newer login or denial.
authService.handleRedirectResult()
  .then((user) => {
    if (authGeneration !== 0) return;
    if (user || isHttpBackend) {
      useAuthStore.setState({ user, loading: false, error: null });
    }
  })
  .catch((error: any) => {
    if (authGeneration !== 0) return;
    useAuthStore.setState({ error: error.message, loading: false });
  });

if (!isHttpBackend) {
  authService.onAuthStateChanged((user) => {
    if (useAuthStore.getState().signingIn && !user) return;
    if (user) { ++authGeneration; clearLoginAttempt(); }
    useAuthStore.setState({ user, loading: false, signingIn: false });
  });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !useAuthStore.getState().signingIn) return;
    ++authGeneration;
    clearLoginAttempt();
    useAuthStore.setState({ signingIn: false, error: '登入未完成，請重試。' });
  });
}

export default useAuthStore;
