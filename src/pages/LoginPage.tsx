import React, { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { loginUser } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

const parseLoginError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : '登录失败，请稍后重试';
  }
  const code = error.response?.data?.code;
  if (code === 'USER_NOT_FOUND') {
    return '用户不存在';
  }
  if (code === 'PASSWORD_INCORRECT') {
    return '密码错误';
  }
  return error.response?.data?.error || error.message || '登录失败，请稍后重试';
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const onFinish = async (values: { username: string; password: string }) => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await loginUser({
        username: values.username,
        password: values.password,
      });
      setSession(result.user);
      navigate('/requests', { replace: true });
    } catch (error) {
      setErrorMessage(parseLoginError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-sm">
        <div className="mb-6 text-center">
          <Title level={3} className="!mb-1">登录</Title>
        </div>

        {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item className="!mb-2">
            <Button type="primary" htmlType="submit" loading={isSubmitting} block>
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-4">
          <Text type="secondary">没有账号？</Text>
          {' '}
          <Link to="/register">立即注册</Link>
        </div>
      </Card>
    </div>
  );
};
