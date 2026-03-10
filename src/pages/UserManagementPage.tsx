import React from 'react';
import { Alert, Button, Card, Form, Input, Layout, Modal, Select, Spin, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import axios from 'axios';
import { createAdminUser, fetchAdminIdentities, fetchAdminUsers, updateAdminUserIdentities, updateAdminUserStatus, type AdminIdentityItem, type AdminUserItem } from '../api/auth';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const toErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.details || error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

export const UserManagementPage: React.FC = () => {
  const [form] = Form.useForm<{ username: string; identityIds: string[] }>();
  const [identityForm] = Form.useForm<{ identityIds: string[] }>();
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [identityModalOpen, setIdentityModalOpen] = React.useState(false);
  const [identitySubmitting, setIdentitySubmitting] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<AdminUserItem | null>(null);
  const [statusUpdating, setStatusUpdating] = React.useState<Record<string, boolean>>({});
  const [users, setUsers] = React.useState<AdminUserItem[]>([]);
  const [identities, setIdentities] = React.useState<AdminIdentityItem[]>([]);
  const [keyword, setKeyword] = React.useState('');
  const [identityId, setIdentityId] = React.useState<string>('all');
  const [lastLoginFilter, setLastLoginFilter] = React.useState<'all' | 'never' | '7d' | '30d'>('all');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [total, setTotal] = React.useState(0);

  const loadUsers = React.useCallback(async (currentPage: number, currentPageSize: number, currentKeyword: string, currentIdentityId: string, currentLastLoginFilter: 'all' | 'never' | '7d' | '30d') => {
    const userData = await fetchAdminUsers({
      page: currentPage,
      pageSize: currentPageSize,
      keyword: currentKeyword.trim() || undefined,
      identityId: currentIdentityId !== 'all' ? currentIdentityId : undefined,
      lastLoginFilter: currentLastLoginFilter,
    });
    setUsers(userData.users);
    setTotal(userData.total);
    setPage(userData.page);
    setPageSize(userData.pageSize);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [userData, identityData] = await Promise.all([
          fetchAdminUsers({
            page,
            pageSize,
            keyword: keyword.trim() || undefined,
            identityId: identityId !== 'all' ? identityId : undefined,
            lastLoginFilter,
          }),
          fetchAdminIdentities(),
        ]);
        if (!cancelled) {
          setUsers(userData.users);
          setTotal(userData.total);
          setPage(userData.page);
          setPageSize(userData.pageSize);
          setIdentities(identityData);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [identityId, keyword, lastLoginFilter, page, pageSize]);

  const handleCreateUser = async (values: { username: string; identityIds: string[] }) => {
    setSubmitting(true);
    try {
      await createAdminUser({ username: values.username.trim(), identityIds: values.identityIds });
      await loadUsers(page, pageSize, keyword, identityId, lastLoginFilter);
      setCreating(false);
      form.resetFields();
      message.success('新增用户成功');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDisabled = async (user: AdminUserItem) => {
    if (user.username.trim().toLowerCase() === 'admin' && !user.disabled) {
      message.warning('admin 用户禁止被禁用');
      return;
    }
    setStatusUpdating((prev) => ({ ...prev, [user.id]: true }));
    try {
      await updateAdminUserStatus(user.id, !Boolean(user.disabled));
      await loadUsers(page, pageSize, keyword, identityId, lastLoginFilter);
      message.success(Boolean(user.disabled) ? '已启用用户' : '已禁用用户');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setStatusUpdating((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  const openIdentityModal = (user: AdminUserItem) => {
    setEditingUser(user);
    identityForm.setFieldsValue({ identityIds: user.identityIds || [] });
    setIdentityModalOpen(true);
  };

  const handleUpdateIdentities = async (values: { identityIds: string[] }) => {
    if (!editingUser) {
      return;
    }
    const isAdminUser = editingUser.username.trim().toLowerCase() === 'admin';
    if (isAdminUser && !values.identityIds.includes('identity_admin')) {
      message.warning('admin 用户不能移除管理员身份');
      return;
    }
    setIdentitySubmitting(true);
    try {
      await updateAdminUserIdentities(editingUser.id, values.identityIds);
      await loadUsers(page, pageSize, keyword, identityId, lastLoginFilter);
      setIdentityModalOpen(false);
      setEditingUser(null);
      identityForm.resetFields();
      message.success('用户身份已更新');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setIdentitySubmitting(false);
    }
  };

  const columns: TableColumnsType<AdminUserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 200 },
    {
      title: '用户身份',
      dataIndex: 'identities',
      key: 'identities',
      render: (identities: string[]) => (
        <div className="flex flex-wrap gap-2">
          {Array.isArray(identities) && identities.length > 0
            ? identities.map((identity) => <Tag key={identity}>{identity}</Tag>)
            : <span>-</span>}
        </div>
      ),
    },
    {
      title: '用户最后登录时间',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 240,
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => {
        const isAdminUser = record.username.trim().toLowerCase() === 'admin';
        return (
          <div className="flex items-center gap-2">
            <Button
              size="small"
              onClick={() => openIdentityModal(record)}
            >
              修改身份
            </Button>
            <Button
              size="small"
              danger={!record.disabled}
              disabled={isAdminUser && !record.disabled}
              loading={Boolean(statusUpdating[record.id])}
              onClick={() => handleToggleDisabled(record)}
            >
              {record.disabled ? '启用用户' : '禁用用户'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Title level={3} className="!mb-2">用户管理</Title>
            <Button type="primary" onClick={() => setCreating(true)}>新增用户</Button>
          </div>
          <Paragraph className="!mb-5 text-gray-600">
            用户数据来自数据库，展示用户名、用户身份和最后登录时间。
          </Paragraph>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="搜索用户名"
              className="w-64"
              allowClear
            />
            <Select
              value={identityId}
              onChange={(value) => {
                setIdentityId(value);
                setPage(1);
              }}
              className="w-48"
              options={[
                { label: '全部身份', value: 'all' },
                ...identities.map((identity) => ({ label: identity.name, value: identity.id })),
              ]}
            />
            <Select
              value={lastLoginFilter}
              onChange={(value) => {
                setLastLoginFilter(value);
                setPage(1);
              }}
              className="w-48"
              options={[
                { label: '全部登录时间', value: 'all' },
                { label: '从未登录', value: 'never' },
                { label: '近 7 天登录', value: '7d' },
                { label: '近 30 天登录', value: '30d' },
              ]}
            />
          </div>
          {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spin tip="正在加载用户..." />
            </div>
          ) : (
            <Table
              rowKey="id"
              dataSource={users}
              columns={columns}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (count) => `共 ${count} 个用户`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
            />
          )}
        </Card>
      </Content>
      <Modal
        title="新增用户"
        open={creating}
        onCancel={() => {
          setCreating(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateUser}
          initialValues={{ identityIds: identities.length > 0 ? [identities[0].id] : [] }}
        >
          <Form.Item
            label="用户名称"
            name="username"
            rules={[{ required: true, message: '请输入用户名称' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            label="用户身份"
            name="identityIds"
            rules={[{ required: true, message: '请选择至少一个身份' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择用户身份"
              options={identities.map((identity) => ({ label: identity.name, value: identity.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`修改用户身份${editingUser ? ` - ${editingUser.username}` : ''}`}
        open={identityModalOpen}
        onCancel={() => {
          setIdentityModalOpen(false);
          setEditingUser(null);
          identityForm.resetFields();
        }}
        onOk={() => identityForm.submit()}
        confirmLoading={identitySubmitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={identityForm} layout="vertical" onFinish={handleUpdateIdentities}>
          <Form.Item
            label="用户身份"
            name="identityIds"
            rules={[{ required: true, message: '请选择至少一个身份' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择用户身份"
              options={identities.map((identity) => ({
                label: identity.name,
                value: identity.id,
                disabled: editingUser?.username.trim().toLowerCase() === 'admin' && identity.id === 'identity_admin',
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
