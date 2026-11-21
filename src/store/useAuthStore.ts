import { create } from 'zustand';
import { authService } from '../services/authService';
import { isHttpBackend } from '../services/backendMode';
import { clearMeetingDraftRecoveryForUser } from '../services/meetingDraftRecoveryService';
import { markRecordSessionLogout, cancelRecordSessionLogout } from '../services/recordSessionProtection';
import type { AuthStore } from '../types';

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  
  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null });
      const user = await authService.signInWithGoogle();
      set({ user: user ?? null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  
  signOut: async () => {
    const currentUserId = useAuthStore.getState().user?.uid;
    try {
      if (currentUserId && isHttpBackend) markRecordSessionLogout(currentUserId);
      set({ loading: true, error: null });
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
    if (user || isHttpBackend) {
      useAuthStore.setState({ user, loading: false, error: null });
    }
  })
  .catch((error: any) => {
    useAuthStore.setState({ error: error.message, loading: false });
  });

if (!isHttpBackend) {
  authService.onAuthStateChanged((user) => {
    useAuthStore.setState({ user, loading: false });
  });
}

export default useAuthStore;
