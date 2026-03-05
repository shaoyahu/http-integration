import React from 'react';
import { Avatar, Button, Layout, Popover, Tooltip, Typography } from 'antd';
import { ApiOutlined, SettingOutlined, ShareAltOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { logoutUser } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const { Sider } = Layout;
const { Text } = Typography;

const navItems = [
  { key: 'requests', label: '请求管理', path: '/requests', icon: <ApiOutlined /> },
  { key: 'workflows', label: '工作流', path: '/workflows', icon: <ShareAltOutlined /> },
];

const adminNavItems = [
  { key: 'admin', label: '管理后台', path: '/admin', icon: <SettingOutlined /> },
];

export const RouteSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const user = useAuthStore((state) => state.user);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const sidebarItems = isAdminRoute ? adminNavItems : navItems;
  const activeKey = location.pathname.startsWith('/workflows')
    ? 'workflows'
    : (location.pathname.startsWith('/requests')
      ? 'requests'
      : (isAdminRoute ? 'admin' : ''));
  const userInitial = (user?.username || 'U').trim().slice(0, 1).toUpperCase();
  const switchLabel = isAdminRoute ? '开发平台' : '管理后台';
  const switchPath = isAdminRoute ? '/requests' : '/admin';

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Ignore server logout failure and clear local session.
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  const userCard = (
    <div className="w-56">
      <div className="flex items-center gap-3 mb-4">
        <Avatar size={42} icon={!user?.username ? <UserOutlined /> : undefined}>
          {user?.username ? userInitial : undefined}
        </Avatar>
        <div className="min-w-0">
          <Text strong className="block truncate">{user?.username || '当前用户'}</Text>
          <Text type="secondary" className="text-xs">已登录</Text>
        </div>
      </div>
      <Button className="mb-2" block onClick={() => navigate(switchPath)}>
        {switchLabel}
      </Button>
      <Button danger block onClick={handleLogout}>
        退出登录
      </Button>
    </div>
  );

  return (
    <Sider width={64} className="bg-white border-r border-gray-200">
      <div className="h-full flex flex-col items-center py-4 gap-3">
        {sidebarItems.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <Tooltip key={item.key} title={item.label} placement="right">
              <button
                type="button"
                onClick={() => navigate(item.path)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.icon}
              </button>
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <Popover content={userCard} trigger="click" placement="rightBottom">
          <button
            type="button"
            className="w-10 h-10 mb-1 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:border-blue-400 transition-colors"
          >
            <Avatar size={30} icon={!user?.username ? <UserOutlined /> : undefined}>
              {user?.username ? userInitial : undefined}
            </Avatar>
          </button>
        </Popover>
      </div>
    </Sider>
  );
};
