import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequestPage } from './pages/RequestPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute, PublicOnlyRoute } from './components/AuthRoutes';
import { useAuthStore } from './store/authStore';

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  React.useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/requests" replace />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/requests" element={<RequestPage />} />
        <Route path="/workflows" element={<WorkflowPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/requests" replace />} />
    </Routes>
  );
}

export default App;
