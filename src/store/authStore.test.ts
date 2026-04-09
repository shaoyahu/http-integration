import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { fetchCurrentUser } from '../api/auth';
import { USER_PERMISSIONS, USER_ROLES } from '../constants/auth';
import type { AuthUser } from './authStore';

vi.mock('../api/auth', () => ({
  fetchCurrentUser: vi.fn(),
}));

describe('AuthStore', () => {
  beforeEach(() => {
    // reset store state before each test
    useAuthStore.setState({
      user: null,
      initialized: false,
      initializing: false,
    } as any);
  });

  it('should initialize auth and set user when fetchCurrentUser succeeds', async () => {
    const fakeUser: AuthUser = {
      id: 'u1',
      username: 'alice',
      nickname: 'Alice',
      lastLoginAt: null,
      role: USER_ROLES.USER,
      permissions: [USER_PERMISSIONS.REQUEST_MANAGEMENT],
      avatarUrl: '',
    };
    // @ts-ignore
    (fetchCurrentUser as vi.Mock).mockResolvedValue(fakeUser);

    await useAuthStore.getState().initializeAuth();

    const state = useAuthStore.getState();
    expect(state.user).toBeTruthy();
    expect(state.user?.username).toBe('alice');
    // Should have at least one permission
    expect(state.hasPermission).toBeDefined();
  });

  it('should correctly evaluate hasPermission and hasAnyPermission', () => {
    const user: AuthUser = {
      id: 'u2',
      username: 'bob',
      lastLoginAt: null,
      role: USER_ROLES.USER,
      permissions: [USER_PERMISSIONS.REQUEST_MANAGEMENT, USER_PERMISSIONS.WORKFLOW_MANAGEMENT],
      avatarUrl: '',
    };
    useAuthStore.getState().setSession(user);
    const state = useAuthStore.getState();
    expect(state.hasPermission(USER_PERMISSIONS.REQUEST_MANAGEMENT)).toBe(true);
    expect(state.hasPermission(USER_PERMISSIONS.ADMIN_PANEL)).toBe(false);
    expect(state.hasAnyPermission([USER_PERMISSIONS.ADMIN_PANEL, USER_PERMISSIONS.WORKFLOW_MANAGEMENT])).toBe(true);
  });

  it('should login/logout flow via setSession and clearSession', () => {
    const user: AuthUser = {
      id: 'u3',
      username: 'carol',
      lastLoginAt: null,
      role: USER_ROLES.USER,
      permissions: [USER_PERMISSIONS.REQUEST_MANAGEMENT],
      avatarUrl: '',
    };
    useAuthStore.getState().setSession(user);
    expect(useAuthStore.getState().user?.username).toBe('carol');
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
