import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequestPage } from './pages/RequestPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { AdminPage } from './pages/AdminPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { IdentityManagementPage } from './pages/IdentityManagementPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute, PublicOnlyRoute, getDefaultAuthorizedPath } from './components/AuthRoutes';
import { useAuthStore } from './store/authStore';
import { USER_PERMISSIONS } from './constants/auth';

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const user = useAuthStore((state) => state.user);
  const defaultPath = getDefaultAuthorizedPath(user);

  React.useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={defaultPath} replace />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute requiredPermissions={[USER_PERMISSIONS.REQUEST_MANAGEMENT]} />}>
        <Route path="/requests" element={<RequestPage />} />
      </Route>
      <Route element={<ProtectedRoute requiredPermissions={[USER_PERMISSIONS.WORKFLOW_MANAGEMENT]} />}>
        <Route path="/workflows" element={<WorkflowPage />} />
      </Route>
      <Route element={<ProtectedRoute requiredPermissions={[USER_PERMISSIONS.ADMIN_PANEL]} />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/users" element={<UserManagementPage />} />
        <Route path="/admin/identities" element={<IdentityManagementPage />} />
        <Route path="/admin/user-permissions" element={<Navigate to="/admin/users" replace />} />
        <Route path="/user-permissions" element={<Navigate to="/admin/users" replace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/forbidden" element={<ForbiddenPage />} />
      </Route>
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

export default App;
