import { create } from 'zustand';
import { fetchCurrentUser } from '../api/auth';
import {
  ADMIN_ALL_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  USER_PERMISSIONS,
  USER_ROLES,
  type UserPermission,
  type UserRole,
} from '../constants/auth';

export interface AuthUser {
  id: string;
  username: string;
  nickname?: string;
  avatarUrl?: string;
  mustChangePassword?: boolean;
  lastLoginAt: string | null;
  role: UserRole;
  permissions: UserPermission[];
  identities?: Array<{ id: string; name: string; permissions: UserPermission[] }>;
}

interface AuthState {
  user: AuthUser | null;
  initialized: boolean;
  initializing: boolean;
  hasPermission: (permission: UserPermission) => boolean;
  hasAnyPermission: (permissions: UserPermission[]) => boolean;
  setSession: (user: AuthUser) => void;
  clearSession: () => void;
  initializeAuth: () => Promise<void>;
}

const normalizeAuthUser = (user: AuthUser): AuthUser => ({
  ...user,
  role: (
    user.role === USER_ROLES.ADMIN
    || user.permissions?.includes(USER_PERMISSIONS.ADMIN_PANEL)
    || (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin')
  )
    ? USER_ROLES.ADMIN
    : USER_ROLES.USER,
  permissions: (
    user.role === USER_ROLES.ADMIN
    || user.permissions?.includes(USER_PERMISSIONS.ADMIN_PANEL)
    || (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin')
  )
    ? [...ADMIN_ALL_PERMISSIONS]
    : (Array.isArray(user.permissions) && user.permissions.length > 0 ? user.permissions : [...DEFAULT_USER_PERMISSIONS]),
  mustChangePassword: Boolean(user.mustChangePassword),
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  initializing: false,
  hasPermission: (permission) => Boolean(get().user?.permissions?.includes(permission)),
  hasAnyPermission: (permissions) => {
    const userPermissions = get().user?.permissions || [];
    return permissions.some((permission) => userPermissions.includes(permission));
  },
  setSession: (user) => {
    set({ user: normalizeAuthUser(user), initialized: true, initializing: false });
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
      set({ user: normalizeAuthUser(user), initialized: true, initializing: false });
    } catch {
      set({ user: null, initialized: true, initializing: false });
    }
  },
}));
