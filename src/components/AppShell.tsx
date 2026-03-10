import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { RouteSidebar } from './RouteSidebar';

export const AppShell: React.FC = () => (
  <Layout className="h-screen bg-white overflow-hidden">
    <RouteSidebar />
    <Outlet />
  </Layout>
);
