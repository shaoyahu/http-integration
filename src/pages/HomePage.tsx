import React from 'react';
import { Layout, Card, Typography, Button } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Content className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Title level={1} className="text-gray-800 mb-3">HTTP 客户端</Title>
          <Paragraph className="text-gray-600 text-lg">
            轻量级的 HTTP 请求管理工具
          </Paragraph>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <Card
            hoverable
            className="h-72 flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-xl border-2 hover:border-blue-300"
            onClick={() => navigate('/requests')}
          >
            <div className="bg-blue-50 p-6 rounded-full mb-4">
              <UnorderedListOutlined className="text-5xl text-blue-400" />
            </div>
            <Title level={3} className="mb-2 text-gray-800">请求管理</Title>
            <Paragraph className="text-gray-500 text-center mb-6">
              创建、编辑和测试 HTTP 请求
            </Paragraph>
            <Button 
              type="default"
              size="large"
              className="border-blue-400 text-blue-500 hover:bg-blue-50 hover:border-blue-500"
            >
              进入请求管理
            </Button>
          </Card>

          <Card
            hoverable
            className="h-72 flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-xl border-2 hover:border-emerald-300"
            onClick={() => navigate('/workflows')}
          >
            <div className="bg-emerald-50 p-6 rounded-full mb-4">
              <AppstoreOutlined className="text-5xl text-emerald-400" />
            </div>
            <Title level={3} className="mb-2 text-gray-800">工作流管理</Title>
            <Paragraph className="text-gray-500 text-center mb-6">
              创建工作流，按顺序执行多个请求
            </Paragraph>
            <Button 
              type="default"
              size="large"
              className="border-emerald-400 text-emerald-500 hover:bg-emerald-50 hover:border-emerald-500"
            >
              进入工作流管理
            </Button>
          </Card>
        </div>
      </div>
    </Content>
  );
};
