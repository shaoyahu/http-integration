import React from 'react';
import { Avatar, Button, Layout, Popover, Tooltip, Typography } from 'antd';
import { ApiOutlined, IdcardOutlined, SettingOutlined, ShareAltOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { logoutUser } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { USER_PERMISSIONS, USER_ROLES } from '../constants/auth';
import { getDefaultAuthorizedPath } from './AuthRoutes';

const { Sider } = Layout;
const { Text } = Typography;

export const RouteSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const user = useAuthStore((state) => state.user);
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const isAdminRoute = location.pathname.startsWith('/admin');
  const mainNavItems = [
    permissions.includes(USER_PERMISSIONS.REQUEST_MANAGEMENT)
      ? { key: 'requests', label: '请求管理', path: '/requests', icon: <ApiOutlined /> }
      : null,
    permissions.includes(USER_PERMISSIONS.WORKFLOW_MANAGEMENT)
      ? { key: 'workflows', label: '工作流管理', path: '/workflows', icon: <ShareAltOutlined /> }
      : null,
  ].filter(Boolean) as { key: string; label: string; path: string; icon: React.ReactNode }[];
  const adminNavItems = [
    { key: 'admin', label: '管理后台', path: '/admin', icon: <SettingOutlined /> },
    { key: 'userManagement', label: '用户管理', path: '/admin/users', icon: <TeamOutlined /> },
    { key: 'identityManagement', label: '身份管理', path: '/admin/identities', icon: <IdcardOutlined /> },
  ];
  const sidebarItems = isAdminRoute ? adminNavItems : mainNavItems;
  let activeKey = '';
  if (location.pathname.startsWith('/workflows')) {
    activeKey = 'workflows';
  } else if (location.pathname.startsWith('/requests')) {
    activeKey = 'requests';
  } else if (
    location.pathname.startsWith('/admin/users')
    || location.pathname.startsWith('/admin/user-permissions')
    || location.pathname.startsWith('/user-permissions')
  ) {
    activeKey = 'userManagement';
  } else if (location.pathname.startsWith('/admin/identities')) {
    activeKey = 'identityManagement';
  } else if (location.pathname.startsWith('/admin')) {
    activeKey = 'admin';
  }
  const userInitial = (user?.username || 'U').trim().slice(0, 1).toUpperCase();
  const hasAdminPanelPermission = permissions.includes(USER_PERMISSIONS.ADMIN_PANEL);
  const canAccessAdmin = user?.role === USER_ROLES.ADMIN
    || hasAdminPanelPermission
    || (typeof user?.username === 'string' && user.username.trim().toLowerCase() === 'admin');
  const switchLabel = isAdminRoute ? '业务页面' : '管理后台';
  const switchPath = isAdminRoute ? getDefaultAuthorizedPath(user) : '/admin';

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
      {canAccessAdmin ? (
        <Button className="mb-2" block onClick={() => navigate(switchPath)}>
          {switchLabel}
        </Button>
      ) : null}
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
