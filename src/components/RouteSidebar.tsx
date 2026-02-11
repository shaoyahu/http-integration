import React from 'react';
import { Layout, Tooltip } from 'antd';
import { ApiOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider } = Layout;

const navItems = [
  { key: 'requests', label: '请求管理', path: '/requests', icon: <ApiOutlined /> },
  { key: 'workflows', label: '工作流', path: '/workflows', icon: <ShareAltOutlined /> },
];

export const RouteSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = location.pathname.startsWith('/workflows') ? 'workflows' : 'requests';

  return (
    <Sider width={64} className="bg-white border-r border-gray-200">
      <div className="h-full flex flex-col items-center py-4 gap-3">
        {navItems.map((item) => {
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
      </div>
    </Sider>
  );
};
