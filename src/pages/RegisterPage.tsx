import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { fetchCaptcha, registerUser } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

const parseRegisterError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : '注册失败，请稍后重试';
  }
  const code = error.response?.data?.code;
  if (code === 'USER_ALREADY_EXISTS') {
    return '用户名已存在';
  }
  return error.response?.data?.error || error.message || '注册失败，请稍后重试';
};

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');

  const refreshVerifyCode = async () => {
    setIsCaptchaLoading(true);
    try {
      const captcha = await fetchCaptcha();
      setCaptchaId(captcha.captchaId);
      setCaptchaSvg(captcha.captchaSvg);
    } catch {
      setErrorMessage('加载校验码失败，请稍后重试');
    } finally {
      setIsCaptchaLoading(false);
    }
  };

  useEffect(() => {
    refreshVerifyCode();
  }, []);

  const onFinish = async (values: { username: string; password: string; confirmPassword: string; verifyCodeInput: string }) => {
    if (values.password !== values.confirmPassword) {
      setErrorMessage('两次密码输入不一致');
      return;
    }
    if (!captchaId) {
      setErrorMessage('校验码尚未加载完成');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await registerUser({
        username: values.username,
        password: values.password,
        captchaId,
        captchaCode: values.verifyCodeInput.trim(),
      });
      setSession(result.user);
      navigate('/requests', { replace: true });
    } catch (error) {
      setErrorMessage(parseRegisterError(error));
      refreshVerifyCode();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-sm">
        <div className="mb-6 text-center">
          <Title level={3} className="!mb-1">注册</Title>
        </div>

        {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item label="确认密码" name="confirmPassword" rules={[{ required: true, message: '请再次输入密码' }]}>
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>
          <Form.Item label="校验码" required>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Form.Item name="verifyCodeInput" noStyle rules={[{ required: true, message: '请输入校验码' }]}>
                  <Input placeholder="请输入校验码" />
                </Form.Item>
              </div>
              {captchaSvg ? (
                <button
                  type="button"
                  onClick={refreshVerifyCode}
                  className="h-9 flex items-center p-0 border-0 bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  disabled={isCaptchaLoading}
                  aria-label="刷新校验码"
                  title="点击刷新校验码"
                >
                  <div
                    className="inline-block"
                    dangerouslySetInnerHTML={{ __html: captchaSvg }}
                  />
                </button>
              ) : (
                <div className="h-9 flex items-center">
                  <Text type="secondary">加载中...</Text>
                </div>
              )}
            </div>
          </Form.Item>
          <Form.Item className="!mb-2">
            <Button type="primary" htmlType="submit" loading={isSubmitting} block>
              注册并登录
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-4">
          <Text type="secondary">已有账号？</Text>
          {' '}
          <Link to="/login">去登录</Link>
        </div>
      </Card>
    </div>
  );
};
