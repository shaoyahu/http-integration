import React from 'react';
import { Alert, Button, Card, Form, Input, Layout, Modal, Select, Spin, Table, Tag, Typography, message, Popconfirm } from 'antd';
import type { TableColumnsType } from 'antd';
import axios from 'axios';
import {
  createAdminIdentity,
  deleteAdminIdentity,
  fetchAdminIdentities,
  fetchAdminPermissionPoints,
  updateAdminIdentity,
  type AdminIdentityItem,
  type AdminPermissionPoint,
} from '../api/auth';
import { permissionLabelMap, type UserPermission } from '../constants/auth';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const toErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.details || error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

export const IdentityManagementPage: React.FC = () => {
  const [form] = Form.useForm<{ name: string; permissionIds: UserPermission[] }>();
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingIdentity, setEditingIdentity] = React.useState<AdminIdentityItem | null>(null);
  const [deletingIdentities, setDeletingIdentities] = React.useState<Record<string, boolean>>({});
  const [permissionPoints, setPermissionPoints] = React.useState<AdminPermissionPoint[]>([]);
  const [identities, setIdentities] = React.useState<AdminIdentityItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [identityData, permissionData] = await Promise.all([
          fetchAdminIdentities(),
          fetchAdminPermissionPoints(),
        ]);
        if (!cancelled) {
          setIdentities(identityData);
          setPermissionPoints(permissionData);
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

  const openCreateModal = () => {
    setEditingIdentity(null);
    form.setFieldsValue({ name: '', permissionIds: [] });
    setModalOpen(true);
  };

  const openEditModal = (record: AdminIdentityItem) => {
    setEditingIdentity(record);
    form.setFieldsValue({ name: record.name, permissionIds: record.permissions });
    setModalOpen(true);
  };

  const closeModal = () => {
    setEditingIdentity(null);
    setModalOpen(false);
    form.resetFields();
  };

  const handleSubmit = async (values: { name: string; permissionIds: UserPermission[] }) => {
    setSaving(true);
    try {
      if (editingIdentity) {
        const updated = await updateAdminIdentity(editingIdentity.id, { name: values.name.trim(), permissionIds: values.permissionIds });
        setIdentities((prev) => prev.map((item) => (item.id === editingIdentity.id ? { ...item, ...updated } : item)));
        message.success('身份更新成功');
      } else {
        const created = await createAdminIdentity({ name: values.name.trim(), permissionIds: values.permissionIds });
        setIdentities((prev) => [...prev, created]);
        message.success('新增身份成功');
      }
      closeModal();
      const latest = await fetchAdminIdentities();
      setIdentities(latest);
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIdentity = async (identity: AdminIdentityItem) => {
    if (identity.userCount > 0) {
      message.warning(`该身份下有 ${identity.userCount} 个用户，无法删除`);
      return;
    }
    setDeletingIdentities((prev) => ({ ...prev, [identity.id]: true }));
    try {
      await deleteAdminIdentity(identity.id);
      setIdentities((prev) => prev.filter((item) => item.id !== identity.id));
      message.success('身份已删除');
    } catch (error) {
      message.error(toErrorMessage(error));
    } finally {
      setDeletingIdentities((prev) => ({ ...prev, [identity.id]: false }));
    }
  };

  const columns: TableColumnsType<AdminIdentityItem> = [
    { title: '身份名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '身份权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (permissions: UserPermission[]) => (
        <div className="flex flex-wrap gap-2">
          {Array.isArray(permissions) && permissions.length > 0
            ? permissions.map((permission) => (
              <Tag key={permission}>{permissionLabelMap[permission] || permission}</Tag>
            ))
            : <span>-</span>}
        </div>
      ),
    },
    { title: '关联用户数', dataIndex: 'userCount', key: 'userCount', width: 120 },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Button size="small" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="删除身份"
            description={record.userCount > 0 ? `该身份下有 ${record.userCount} 个用户，无法删除` : '确定要删除该身份吗？此操作不可撤销。'}
            onConfirm={() => handleDeleteIdentity(record)}
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: Boolean(deletingIdentities[record.id]), disabled: record.userCount > 0 }}
          >
            <Button
              size="small"
              danger
              loading={Boolean(deletingIdentities[record.id])}
              disabled={record.userCount > 0}
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <>
      <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Title level={3} className="!mb-2">身份管理</Title>
            <Button type="primary" onClick={openCreateModal}>新增身份</Button>
          </div>
          <Paragraph className="!mb-5 text-gray-600">
            展示数据库中的所有身份，包括身份名称、身份权限和用户数量。
          </Paragraph>
          {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spin tip="正在加载身份..." />
            </div>
          ) : identities.length === 0 ? (
            <div className="py-12 text-center text-gray-500">暂无身份</div>
          ) : (
            <Table rowKey="id" dataSource={identities} columns={columns} pagination={false} />
          )}
        </Card>
      </Content>
      <Modal
        title={editingIdentity ? '编辑身份' : '新增身份'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editingIdentity ? '保存' : '创建'}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="身份名称"
            name="name"
            rules={[{ required: true, message: '请输入身份名称' }]}
          >
            <Input placeholder="请输入身份名称" />
          </Form.Item>
          <Form.Item
            label="身份权限"
            name="permissionIds"
            rules={[{ required: true, message: '请选择至少一个权限' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择权限"
              options={permissionPoints.map((point) => ({ label: point.name, value: point.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
