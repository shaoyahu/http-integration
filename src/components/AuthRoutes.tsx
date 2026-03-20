import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore, isAdminUser, type AuthUser } from '../store/authStore';
import { USER_PERMISSIONS, type UserPermission } from '../constants/auth';

const CenteredLoading: React.FC = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-white">
    <Spin size="large" tip="正在校验登录状态..." />
  </div>
);

export const getDefaultAuthorizedPath = (user: AuthUser | null): string => {
  if (!user) {
    return '/login';
  }
  if (isAdminUser(user)) {
    return '/admin';
  }
  return getDefaultPlatformPath(user);
};

export const getDefaultPlatformPath = (user: AuthUser | null): string => {
  if (!user) {
    return '/login';
  }
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes(USER_PERMISSIONS.REQUEST_MANAGEMENT)) {
    return '/requests';
  }
  if (permissions.includes(USER_PERMISSIONS.WORKFLOW_MANAGEMENT)) {
    return '/workflows';
  }
  if (permissions.includes(USER_PERMISSIONS.ADMIN_PANEL)) {
    return '/admin';
  }
  return '/forbidden';
};

interface ProtectedRouteProps {
  requiredPermissions?: UserPermission[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredPermissions = [] }) => {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <CenteredLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (isAdminUser(user)) {
    return <Outlet />;
  }
  if (requiredPermissions.length > 0 && !requiredPermissions.some((permission) => userPermissions.includes(permission))) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
};

export const PublicOnlyRoute: React.FC = () => {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <CenteredLoading />;
  }

  if (user) {
    return <Navigate to={getDefaultAuthorizedPath(user)} replace />;
  }

  return <Outlet />;
};
