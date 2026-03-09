import React from 'react';
import { Button, Card, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getDefaultAuthorizedPath } from '../components/AuthRoutes';

const { Title, Paragraph } = Typography;

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  return (
    <div className="h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <Title level={3} className="!mb-2">无访问权限</Title>
        <Paragraph className="text-gray-600 !mb-6">
          当前账号没有访问该页面所需的权限。请联系管理员为你分配身份权限。
        </Paragraph>
        <div className="flex gap-3">
          <Button type="primary" onClick={() => navigate(getDefaultAuthorizedPath(user), { replace: true })}>
            返回可访问页面
          </Button>
        </div>
      </Card>
    </div>
  );
};
