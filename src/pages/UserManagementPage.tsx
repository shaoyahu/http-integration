import React from 'react';
import { Alert, Button, Card, Form, Input, Layout, Modal, Select, Spin, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import axios from 'axios';
import { RouteSidebar } from '../components/RouteSidebar';
import { createAdminUser, fetchAdminIdentities, fetchAdminUsers, updateAdminUserStatus, type AdminIdentityItem, type AdminUserItem } from '../api/auth';

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
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [statusUpdating, setStatusUpdating] = React.useState<Record<string, boolean>>({});
  const [users, setUsers] = React.useState<AdminUserItem[]>([]);
  const [identities, setIdentities] = React.useState<AdminIdentityItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [userData, identityData] = await Promise.all([fetchAdminUsers(), fetchAdminIdentities()]);
        if (!cancelled) {
          setUsers(userData);
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
  }, []);

  const handleCreateUser = async (values: { username: string; identityIds: string[] }) => {
    setSubmitting(true);
    try {
      const created = await createAdminUser({ username: values.username.trim(), identityIds: values.identityIds });
      setUsers((prev) => [created, ...prev]);
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
    setStatusUpdating((prev) => ({ ...prev, [user.id]: true }));
    try {
      const updated = await updateAdminUserStatus(user.id, !Boolean(user.disabled));
      setUsers((prev) => prev.map((item) => (item.id === user.id ? updated : item)));
      message.success(Boolean(user.disabled) ? '已启用用户' : '已禁用用户');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setStatusUpdating((prev) => ({ ...prev, [user.id]: false }));
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
      width: 140,
      render: (_, record) => (
        <Button
          size="small"
          danger={!record.disabled}
          loading={Boolean(statusUpdating[record.id])}
          onClick={() => handleToggleDisabled(record)}
        >
          {record.disabled ? '启用用户' : '禁用用户'}
        </Button>
      ),
    },
  ];

  return (
    <Layout className="h-screen bg-white overflow-hidden">
      <RouteSidebar />
      <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Title level={3} className="!mb-2">用户管理</Title>
            <Button type="primary" onClick={() => setCreating(true)}>新增用户</Button>
          </div>
          <Paragraph className="!mb-5 text-gray-600">
            用户数据来自数据库，展示用户名、用户身份和最后登录时间。
          </Paragraph>
          {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spin tip="正在加载用户..." />
            </div>
          ) : (
            <Table rowKey="id" dataSource={users} columns={columns} pagination={false} />
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
    </Layout>
  );
};
