import { create } from 'zustand';
import { fetchCurrentUser } from '../api/auth';

export interface AuthUser {
  id: string;
  username: string;
  lastLoginAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  initialized: boolean;
  initializing: boolean;
  setSession: (user: AuthUser) => void;
  clearSession: () => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  initializing: false,
  setSession: (user) => {
    set({ user, initialized: true, initializing: false });
  },
  clearSession: () => {
    set({ user: null, initialized: true, initializing: false });
  },
  initializeAuth: async () => {
    const { initialized, initializing } = get();
    if (initialized || initializing) {
      return;
    }
    set({ initializing: true });
    try {
      const user = await fetchCurrentUser();
      set({ user, initialized: true, initializing: false });
    } catch {
      set({ user: null, initialized: true, initializing: false });
    }
  },
}));
