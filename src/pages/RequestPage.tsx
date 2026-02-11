import React from 'react';
import { Layout } from 'antd';
import { Sidebar } from '../components/Sidebar';
import { RequestEditor } from '../components/RequestEditor';
import { RouteSidebar } from '../components/RouteSidebar';

const { Content } = Layout;

export const RequestPage: React.FC = () => {
  return (
    <Layout className="h-screen bg-white overflow-hidden">
      <RouteSidebar />
      <Sidebar />
      <Content className="flex-1 min-h-0 overflow-hidden bg-[#f5f5f5]" style={{ padding: 0 }}>
        <div className="h-full overflow-auto p-4">
          <RequestEditor />
        </div>
      </Content>
    </Layout>
  );
};
