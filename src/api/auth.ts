import { api } from './http';

export interface AuthUser {
  id: string;
  username: string;
  lastLoginAt: string | null;
}

export interface AuthSuccessResponse {
  user: AuthUser;
}

export interface CaptchaResponse {
  captchaId: string;
  captchaSvg: string;
  expiresAt: string;
}

export const fetchCaptcha = async () => {
  const response = await api.get<CaptchaResponse>('/auth/captcha');
  return response.data;
};

export const registerUser = async (payload: { username: string; password: string; captchaId: string; captchaCode: string }) => {
  const response = await api.post<AuthSuccessResponse>('/auth/register', payload);
  return response.data;
};

export const loginUser = async (payload: { username: string; password: string }) => {
  const response = await api.post<AuthSuccessResponse>('/auth/login', payload);
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get<{ user: AuthUser }>('/auth/me');
  return response.data.user;
};

export const logoutUser = async () => {
  const response = await api.post<{ ok: boolean }>('/auth/logout');
  return response.data;
};
