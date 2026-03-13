import React, { useEffect, useState } from 'react';
import { Avatar, Button, Input, Layout, Modal, Popover, Tooltip, Typography, Upload, message } from 'antd';
import { ApiOutlined, IdcardOutlined, LeftOutlined, RightOutlined, SettingOutlined, ShareAltOutlined, TeamOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { logoutUser, updateCurrentUserProfile } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { USER_PERMISSIONS, USER_ROLES } from '../constants/auth';
import { getDefaultPlatformPath } from './AuthRoutes';

const { Sider } = Layout;
const { Text } = Typography;
const SIDEBAR_EXPANDED_KEY = 'route_sidebar_expanded';

export const RouteSidebar: React.FC = () => {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_EXPANDED_KEY) === 'true';
  });
  const navigate = useNavigate();
  const location = useLocation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const setSession = useAuthStore((state) => state.setSession);
  const user = useAuthStore((state) => state.user);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
  const displayName = (user?.nickname || user?.username || '当前用户').trim();
  const userInitial = (displayName || 'U').slice(0, 1).toUpperCase();
  const hasAdminPanelPermission = permissions.includes(USER_PERMISSIONS.ADMIN_PANEL);
  const canAccessAdmin = user?.role === USER_ROLES.ADMIN
    || hasAdminPanelPermission
    || (typeof user?.username === 'string' && user.username.trim().toLowerCase() === 'admin');
  const switchLabel = isAdminRoute ? '开发平台' : '管理后台';
  const switchPath = isAdminRoute ? getDefaultPlatformPath(user) : '/admin';

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(expanded));
  }, [expanded]);

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

  const openProfileModal = () => {
    setNickname(user?.nickname || '');
    setAvatarUrl(user?.avatarUrl || '');
    setPasswordEditing(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileModalOpen(true);
  };

  const handleAvatarPick = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return false;
    }
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      message.error('头像图片不能超过 2MB');
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === 'string' ? reader.result : '');
      message.success('头像已选择，点击保存后生效');
    };
    reader.onerror = () => {
      message.error('头像读取失败，请重试');
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleProfileSave = async () => {
    if (!user) {
      return;
    }
    if (passwordEditing) {
      if (!currentPassword) {
        message.error('请输入当前密码');
        return;
      }
      if (newPassword.length < 6) {
        message.error('新密码至少为 6 位');
        return;
      }
      if (newPassword !== confirmPassword) {
        message.error('两次输入的新密码不一致');
        return;
      }
    }

    const payload: { nickname?: string; avatarUrl?: string; currentPassword?: string; newPassword?: string } = {};
    payload.nickname = nickname.trim();
    payload.avatarUrl = avatarUrl.trim();
    if (passwordEditing) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    try {
      setSavingProfile(true);
      const updatedUser = await updateCurrentUserProfile(payload);
      setSession(updatedUser);
      setProfileModalOpen(false);
      message.success('个人信息已更新');
    } catch (error: any) {
      const detail = error?.response?.data?.error || error?.message || '更新失败';
      message.error(String(detail));
    } finally {
      setSavingProfile(false);
    }
  };

  const userCard = (
    <div className="w-56">
      <div className="flex items-center gap-3 mb-4">
        <Avatar size={42} src={user?.avatarUrl} icon={!displayName ? <UserOutlined /> : undefined}>
          {displayName ? userInitial : undefined}
        </Avatar>
        <div className="min-w-0">
          <Text strong className="block truncate">{displayName}</Text>
          <Text type="secondary" className="block truncate text-xs">{user?.username || ''}</Text>
          <Text type="secondary" className="text-xs">已登录</Text>
        </div>
      </div>
      <Button className="mb-2" block onClick={openProfileModal}>
        编辑信息
      </Button>
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
    <Sider
      width={expanded ? 220 : 64}
      className="bg-white border-r border-gray-200 transition-all duration-200 relative"
      style={{ flex: `0 0 ${expanded ? 220 : 64}px`, maxWidth: expanded ? 220 : 64, minWidth: expanded ? 220 : 64, width: expanded ? 220 : 64 }}
    >
      <div className={`h-full flex flex-col py-4 gap-3 ${expanded ? 'px-3' : 'items-center'}`}>
        {sidebarItems.map((item) => {
          const isActive = activeKey === item.key;
          const button = (
            <button
              type="button"
              onClick={() => navigate(item.path)}
              className={`transition-colors rounded-lg ${
                expanded
                  ? `w-full h-11 px-3 flex items-center gap-3 ${isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
                  : `w-10 h-10 flex items-center justify-center ${isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="flex items-center justify-center text-base">{item.icon}</span>
              {expanded ? <span className="text-sm font-medium truncate">{item.label}</span> : null}
            </button>
          );
          return expanded ? (
            <div key={item.key}>{button}</div>
          ) : (
            <Tooltip key={item.key} title={item.label} placement="right">
              {button}
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <Popover content={userCard} trigger="click" placement="rightBottom">
          <button
            type="button"
            className={`mb-1 rounded-full border border-gray-200 bg-white hover:border-blue-400 transition-colors ${
              expanded
                ? 'w-full rounded-2xl px-3 py-2.5 flex items-center gap-3 justify-start'
                : 'w-10 h-10 flex items-center justify-center'
            }`}
          >
            <Avatar size={30} src={user?.avatarUrl} icon={!displayName ? <UserOutlined /> : undefined}>
              {displayName ? userInitial : undefined}
            </Avatar>
            {expanded ? (
              <div className="min-w-0 text-left">
                <div className="text-sm font-medium text-gray-800 truncate">{displayName}</div>
                <div className="text-xs text-gray-500 truncate">{user?.username || ''}</div>
              </div>
            ) : null}
          </button>
        </Popover>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="absolute -right-3 top-12 w-6 h-6 rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center z-20"
        aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
      >
        {expanded ? <LeftOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      </button>
      <Modal
        title="编辑个人信息"
        open={profileModalOpen}
        onOk={handleProfileSave}
        onCancel={() => {
          setProfileModalOpen(false);
          setPasswordEditing(false);
        }}
        confirmLoading={savingProfile}
        okText="保存"
        cancelText="取消"
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-700 mb-2">头像</div>
            <div className="flex items-center gap-3">
              <Avatar size={52} src={avatarUrl || undefined} icon={!avatarUrl ? <UserOutlined /> : undefined}>
                {!avatarUrl ? userInitial : undefined}
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => handleAvatarPick(file as File)}
                    accept="image/*"
                  >
                    <Button icon={<UploadOutlined />}>上传头像</Button>
                  </Upload>
                  {avatarUrl ? (
                    <Button onClick={() => setAvatarUrl('')}>移除头像</Button>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-500">支持图片文件，大小不超过 2MB</div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">昵称</div>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="请输入昵称"
              maxLength={32}
            />
          </div>
          {!passwordEditing ? (
            <div className="pt-1 border-t border-gray-100">
              <Button onClick={() => setPasswordEditing(true)}>修改密码</Button>
            </div>
          ) : (
            <>
              <div className="pt-1 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm text-gray-700">修改密码</div>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setPasswordEditing(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  取消修改
                </Button>
              </div>
              <div>
                <div className="text-sm text-gray-700 mb-1">当前密码</div>
                <Input.Password
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="请输入当前密码"
                />
              </div>
              <div>
                <div className="text-sm text-gray-700 mb-1">新密码</div>
                <Input.Password
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <div className="text-sm text-gray-700 mb-1">确认新密码</div>
                <Input.Password
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </Sider>
  );
};
