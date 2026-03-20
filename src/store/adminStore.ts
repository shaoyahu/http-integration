import { create } from 'zustand';
import { fetchAdminStats, type AdminStatsPayload } from '../api/http';
import {
  fetchAdminUsers,
  fetchAdminIdentities,
  createAdminUser,
  updateAdminUserStatus,
  updateAdminUserIdentities,
  deleteAdminUser,
  createAdminIdentity,
  updateAdminIdentity,
  deleteAdminIdentity,
  type AdminUserItem,
  type AdminIdentityItem,
} from '../api/auth';
import type { UserPermission } from '../constants/auth';

export interface AdminUserQuery {
  keyword?: string;
  identityId?: string;
  lastLoginFilter?: 'all' | 'never' | '7d' | '30d';
  page?: number;
  pageSize?: number;
}

interface AdminState {
  // Stats
  stats: AdminStatsPayload;
  statsLoading: boolean;
  statsError: string | null;
  fetchStats: () => Promise<void>;

  // Users
  users: AdminUserItem[];
  usersTotal: number;
  usersPage: number;
  usersPageSize: number;
  usersLoading: boolean;
  usersError: string | null;
  fetchUsers: (query?: AdminUserQuery) => Promise<void>;
  createUser: (username: string, identityIds: string[]) => Promise<void>;
  toggleUserStatus: (userId: string, disabled: boolean) => Promise<void>;
  updateUserIdentities: (userId: string, identityIds: string[]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  // Identities
  identities: AdminIdentityItem[];
  identitiesLoading: boolean;
  identitiesError: string | null;
  fetchIdentities: () => Promise<void>;
  createIdentity: (name: string, permissionIds: UserPermission[]) => Promise<void>;
  updateIdentity: (identityId: string, name: string, permissionIds: UserPermission[]) => Promise<void>;
  deleteIdentity: (identityId: string) => Promise<void>;
}

const defaultStats: AdminStatsPayload = {
  totalRequests: 0,
  totalWorkflows: 0,
  ratio: { requests: 0, workflows: 0 },
};

export const useAdminStore = create<AdminState>((set, get) => ({
  // Stats
  stats: defaultStats,
  statsLoading: false,
  statsError: null,
  fetchStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const stats = await fetchAdminStats();
      set({ stats, statsLoading: false });
    } catch (error) {
      set({
        statsError: error instanceof Error ? error.message : '加载统计数据失败',
        statsLoading: false,
      });
    }
  },

  // Users
  users: [],
  usersTotal: 0,
  usersPage: 1,
  usersPageSize: 10,
  usersLoading: false,
  usersError: null,
  fetchUsers: async (query?: AdminUserQuery) => {
    set({ usersLoading: true, usersError: null });
    try {
      const data = await fetchAdminUsers({
        page: get().usersPage,
        pageSize: get().usersPageSize,
        ...query,
      });
      set({
        users: data.users,
        usersTotal: data.total,
        usersPage: data.page,
        usersPageSize: data.pageSize,
        usersLoading: false,
      });
    } catch (error) {
      set({
        usersError: error instanceof Error ? error.message : '加载用户列表失败',
        usersLoading: false,
      });
    }
  },
  createUser: async (username: string, identityIds: string[]) => {
    await createAdminUser({ username: username.trim(), identityIds });
    await get().fetchUsers();
  },
  toggleUserStatus: async (userId: string, disabled: boolean) => {
    await updateAdminUserStatus(userId, disabled);
    await get().fetchUsers();
  },
  updateUserIdentities: async (userId: string, identityIds: string[]) => {
    await updateAdminUserIdentities(userId, identityIds);
    await get().fetchUsers();
  },
  deleteUser: async (userId: string) => {
    await deleteAdminUser(userId);
    await get().fetchUsers();
  },

  // Identities
  identities: [],
  identitiesLoading: false,
  identitiesError: null,
  fetchIdentities: async () => {
    set({ identitiesLoading: true, identitiesError: null });
    try {
      const identities = await fetchAdminIdentities();
      set({ identities, identitiesLoading: false });
    } catch (error) {
      set({
        identitiesError: error instanceof Error ? error.message : '加载身份列表失败',
        identitiesLoading: false,
      });
    }
  },
  createIdentity: async (name: string, permissionIds: UserPermission[]) => {
    await createAdminIdentity({ name: name.trim(), permissionIds });
    await get().fetchIdentities();
  },
  updateIdentity: async (identityId: string, name: string, permissionIds: UserPermission[]) => {
    await updateAdminIdentity(identityId, { name: name.trim(), permissionIds });
    await get().fetchIdentities();
  },
  deleteIdentity: async (identityId: string) => {
    await deleteAdminIdentity(identityId);
    await get().fetchIdentities();
  },
}));
