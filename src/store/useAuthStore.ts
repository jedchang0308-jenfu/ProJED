import { create } from 'zustand';
import { authService } from '../services/authService';
import { clearMeetingDraftRecoveryForUser } from '../services/meetingDraftRecoveryService';
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
    try {
      const currentUserId = useAuthStore.getState().user?.uid;
      set({ loading: true, error: null });
      if (currentUserId) await clearMeetingDraftRecoveryForUser(currentUserId);
      await authService.signOut();
      set({ user: null, loading: false });
    } catch (error: any) {
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

// Initialize the global auth state listener once
authService.handleRedirectResult()
  .then((user) => {
    if (user) {
      useAuthStore.setState({ user, loading: false, error: null });
    }
  })
  .catch((error: any) => {
    useAuthStore.setState({ error: error.message, loading: false });
  });

authService.onAuthStateChanged((user) => {
  useAuthStore.setState({ user, loading: false });
});

export default useAuthStore;
