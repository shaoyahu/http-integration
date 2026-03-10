import { api } from './http';
import type { UserPermission, UserRole } from '../constants/auth';
import axios from 'axios';

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

export interface AuthSuccessResponse {
  user: AuthUser;
}

export interface CaptchaResponse {
  captchaId: string;
  captchaSvg: string;
  expiresAt: string;
}

export const fetchCaptcha = async () => {
  const response = await api.get<CaptchaResponse>('/auth/captcha');
  return response.data;
};

export const registerUser = async (payload: { username: string; password: string; captchaId: string; captchaCode: string }) => {
  const response = await api.post<AuthSuccessResponse>('/auth/register', payload);
  return response.data;
};

export const loginUser = async (payload: { username: string; password: string }) => {
  const response = await api.post<AuthSuccessResponse>('/auth/login', payload);
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get<{ user: AuthUser }>('/auth/me');
  return response.data.user;
};

export const logoutUser = async () => {
  const response = await api.post<{ ok: boolean }>('/auth/logout');
  return response.data;
};

export const updateCurrentUserProfile = async (payload: {
  nickname?: string;
  avatarUrl?: string;
  currentPassword?: string;
  newPassword?: string;
}) => {
  const response = await api.put<{ user: AuthUser }>('/auth/profile', payload);
  return response.data.user;
};

export interface UserPermissionItem {
  id: string;
  username: string;
  role: UserRole;
  permissions: UserPermission[];
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface AdminUserItem {
  id: string;
  username: string;
  identityIds?: string[];
  identities: string[];
  disabled?: boolean;
  lastLoginAt: string | null;
}

export interface AdminUserQuery {
  keyword?: string;
  identityId?: string;
  lastLoginFilter?: 'all' | 'never' | '7d' | '30d';
  page?: number;
  pageSize?: number;
}

export interface AdminUserListResponse {
  users: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminIdentityItem {
  id: string;
  name: string;
  permissions: UserPermission[];
  userCount: number;
}

export interface AdminPermissionPoint {
  id: UserPermission;
  name: string;
}

const tryGetUsersWithFallback = async (paths: string[]) => {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const response = await api.get<{ users: UserPermissionItem[] }>(path);
      return response.data.users;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('加载用户权限失败');
};

const tryUpdateUserWithFallback = async (paths: string[], permissions: UserPermission[]) => {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const response = await api.put<{ user: UserPermissionItem }>(path, { permissions });
      return response.data.user;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('更新用户权限失败');
};

export const fetchUserPermissions = async () => {
  return await tryGetUsersWithFallback([
    '/admin/users',
    '/admin/user-permissions',
    '/user-permissions',
  ]);
};

export const updateUserPermissions = async (userId: string, permissions: UserPermission[]) => {
  const encodedUserId = encodeURIComponent(userId);
  return await tryUpdateUserWithFallback([
    `/admin/users/${encodedUserId}`,
    `/admin/user-permissions/${encodedUserId}`,
    `/user-permissions/${encodedUserId}`,
  ], permissions);
};

export const fetchAdminUsers = async (query: AdminUserQuery = {}) => {
  const response = await api.get<AdminUserListResponse>('/admin/users', { params: query });
  return response.data;
};

export const fetchAdminIdentities = async () => {
  const response = await api.get<{ identities: AdminIdentityItem[] }>('/admin/identities');
  return response.data.identities;
};

export const fetchAdminPermissionPoints = async () => {
  const response = await api.get<{ permissions: AdminPermissionPoint[] }>('/admin/permissions');
  return response.data.permissions;
};

export const createAdminUser = async (payload: { username: string; identityIds: string[] }) => {
  const response = await api.post<{ user: AdminUserItem }>('/admin/users', payload);
  return response.data.user;
};

export const updateAdminUserStatus = async (userId: string, disabled: boolean) => {
  const response = await api.put<{ user: AdminUserItem }>(`/admin/users/${encodeURIComponent(userId)}/status`, { disabled });
  return response.data.user;
};

export const updateAdminUserIdentities = async (userId: string, identityIds: string[]) => {
  const response = await api.put<{ user: AdminUserItem }>(`/admin/users/${encodeURIComponent(userId)}/identities`, { identityIds });
  return response.data.user;
};

export const createAdminIdentity = async (payload: { name: string; permissionIds: UserPermission[] }) => {
  const response = await api.post<{ identity: AdminIdentityItem }>('/admin/identities', payload);
  return response.data.identity;
};

export const updateAdminIdentity = async (identityId: string, payload: { name: string; permissionIds: UserPermission[] }) => {
  const response = await api.put<{ identity: AdminIdentityItem }>(`/admin/identities/${encodeURIComponent(identityId)}`, payload);
  return response.data.identity;
};
