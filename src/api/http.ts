import axios from 'axios';
import type { HttpRequest } from '../store/requestStore';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export interface ProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
}

export const proxyRequest = async (proxyReq: ProxyRequest) => {
  const response = await api.post('/proxy', proxyReq);
  return response.data;
};

export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

export interface RequestStatePayload {
  requests: HttpRequest[];
  selectedRequestId: string | null;
}

export const fetchRequestState = async (): Promise<RequestStatePayload> => {
  const response = await api.get('/requests-state');
  const data = response.data || {};
  return {
    requests: Array.isArray(data.requests) ? data.requests : [],
    selectedRequestId: typeof data.selectedRequestId === 'string' ? data.selectedRequestId : null,
  };
};

export const saveRequestState = async (payload: RequestStatePayload) => {
  const response = await api.put('/requests-state', payload);
  return response.data;
};
