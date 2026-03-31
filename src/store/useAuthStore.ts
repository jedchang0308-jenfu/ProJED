import { create } from 'zustand';
import { authService } from '../services/authService';
import type { AuthStore } from '../types';

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  
  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null });
      const user = await authService.signInWithGoogle();
      set({ user, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  
  signOut: async () => {
    try {
      set({ loading: true, error: null });
      await authService.signOut();
      set({ user: null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  }
}));

// Initialize the global auth state listener once
authService.onAuthStateChanged((user) => {
  useAuthStore.setState({ user, loading: false });
});

export default useAuthStore;
