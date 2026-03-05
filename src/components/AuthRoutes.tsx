import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../store/authStore';

const CenteredLoading: React.FC = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-white">
    <Spin size="large" tip="正在校验登录状态..." />
  </div>
);

export const ProtectedRoute: React.FC = () => {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <CenteredLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
    return <Navigate to="/requests" replace />;
  }

  return <Outlet />;
};
