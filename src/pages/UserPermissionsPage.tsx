import React from 'react';
import { Alert, Card, Checkbox, Layout, Space, Spin, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import axios from 'axios';
import { fetchUserPermissions, updateUserPermissions, type UserPermissionItem } from '../api/auth';
import { permissionLabelMap, USER_PERMISSIONS, type UserPermission } from '../constants/auth';

const { Content } = Layout;
const { Title, Paragraph, Text } = Typography;

const permissionOptions: { label: string; value: UserPermission }[] = [
  { label: permissionLabelMap[USER_PERMISSIONS.REQUEST_MANAGEMENT], value: USER_PERMISSIONS.REQUEST_MANAGEMENT },
  { label: permissionLabelMap[USER_PERMISSIONS.WORKFLOW_MANAGEMENT], value: USER_PERMISSIONS.WORKFLOW_MANAGEMENT },
  { label: permissionLabelMap[USER_PERMISSIONS.ADMIN_PANEL], value: USER_PERMISSIONS.ADMIN_PANEL },
];

const toErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.details || error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

const roleLabelMap = {
  user: '普通用户',
  admin: '管理员',
} as const;

export const UserPermissionsPage: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [savingUserIds, setSavingUserIds] = React.useState<Record<string, boolean>>({});
  const [users, setUsers] = React.useState<UserPermissionItem[]>([]);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchUserPermissions();
      setUsers(data);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handlePermissionChange = async (userId: string, checkedValues: UserPermission[]) => {
    const targetUser = users.find((item) => item.id === userId);
    if (targetUser?.role === 'admin' && !checkedValues.includes(USER_PERMISSIONS.ADMIN_PANEL)) {
      message.warning('管理员必须保留管理后台权限');
      return;
    }
    setSavingUserIds((prev) => ({ ...prev, [userId]: true }));
    try {
      const updated = await updateUserPermissions(userId, checkedValues);
      setUsers((prev) => prev.map((item) => (item.id === userId ? updated : item)));
      message.success('权限更新成功');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setSavingUserIds((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const columns: TableColumnsType<UserPermissionItem> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 160,
    },
    {
      title: '用户身份',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: UserPermissionItem['role']) => (
        <Tag color={role === 'admin' ? 'gold' : 'default'}>
          {roleLabelMap[role]}
        </Tag>
      ),
    },
    {
      title: '身份权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (permissions: UserPermission[], record) => {
        const options = permissionOptions.map((option) => ({
          ...option,
          disabled: Boolean(savingUserIds[record.id]) || (record.role === 'admin' && option.value === USER_PERMISSIONS.ADMIN_PANEL),
        }));
        return (
          <Space direction="vertical">
            <Checkbox.Group
              options={options}
              value={permissions}
              onChange={(values) => handlePermissionChange(record.id, values as UserPermission[])}
            />
            {savingUserIds[record.id] ? <Text type="secondary">保存中...</Text> : null}
          </Space>
        );
      },
    },
    {
      title: '最后登录时间',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 220,
      render: (value: string | null) => value ? new Date(value).toLocaleString() : '-',
    },
  ];

  return (
      <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
        <Card>
          <Title level={3} className="!mb-2">用户权限</Title>
          <Paragraph className="!mb-5 text-gray-600">
            用户身份分为普通用户与管理员。根据身份权限（请求管理权限、工作流管理权限、管理后台权限）自动生成身份。
          </Paragraph>
          {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spin tip="正在加载用户权限..." />
            </div>
          ) : (
            <Table
              rowKey="id"
              dataSource={users}
              columns={columns}
              pagination={false}
            />
          )}
        </Card>
      </Content>
  );
};
