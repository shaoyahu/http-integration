import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

const { Content } = Layout;

export const AdminLayout: React.FC = () => {
  return (
    <Layout className="h-full bg-white">
      <Content className="h-full overflow-auto p-6">
        <Outlet />
      </Content>
    </Layout>
  );
};
