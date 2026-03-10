import axios from 'axios';
import type { HttpRequest, RequestFolder } from '../store/requestStore';
import type { Workflow } from '../store/workflowStore';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

let healthCheckCache:
  | {
      timestamp: number;
      data: any;
      promise: Promise<any> | null;
    }
  | null = null;

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
  const now = Date.now();
  if (healthCheckCache?.data && now - healthCheckCache.timestamp < 10000) {
    return healthCheckCache.data;
  }
  if (healthCheckCache?.promise) {
    return await healthCheckCache.promise;
  }
  const promise = api.get('/health').then((response) => {
    healthCheckCache = {
      timestamp: Date.now(),
      data: response.data,
      promise: null,
    };
    return response.data;
  }).catch((error) => {
    healthCheckCache = null;
    throw error;
  });
  healthCheckCache = {
    timestamp: now,
    data: null,
    promise,
  };
  return await promise;
};

export interface RequestStatePayload {
  requests: HttpRequest[];
  folders: RequestFolder[];
  selectedRequestId: string | null;
}

export interface WorkflowStatePayload {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
}

export interface WorkflowAvailableRequest extends HttpRequest {
  ownerUserId?: string;
  ownerUsername?: string;
  isPublic?: boolean;
}

export interface AdminStatsPayload {
  totalRequests: number;
  totalWorkflows: number;
  ratio: {
    requests: number;
    workflows: number;
  };
}

export const fetchRequestState = async (): Promise<RequestStatePayload> => {
  const response = await api.get('/requests-state');
  const data = response.data || {};
  return {
    requests: Array.isArray(data.requests) ? data.requests : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
    selectedRequestId: typeof data.selectedRequestId === 'string' ? data.selectedRequestId : null,
  };
};

export const saveRequestState = async (payload: RequestStatePayload) => {
  const response = await api.put('/requests-state', payload);
  return response.data;
};

export const fetchWorkflowState = async (): Promise<WorkflowStatePayload> => {
  const response = await api.get('/workflows-state');
  const data = response.data || {};
  return {
    workflows: Array.isArray(data.workflows) ? data.workflows : [],
    selectedWorkflowId: typeof data.selectedWorkflowId === 'string' ? data.selectedWorkflowId : null,
  };
};

export const saveWorkflowState = async (payload: WorkflowStatePayload) => {
  const response = await api.put('/workflows-state', payload);
  return response.data;
};

export const fetchWorkflowAvailableRequests = async (): Promise<WorkflowAvailableRequest[]> => {
  const response = await api.get('/workflow-requests');
  const data = response.data || {};
  return Array.isArray(data.requests) ? data.requests : [];
};

export const fetchAdminStats = async (): Promise<AdminStatsPayload> => {
  const response = await api.get('/admin/stats');
  const data = response.data || {};
  return {
    totalRequests: typeof data.totalRequests === 'number' ? data.totalRequests : 0,
    totalWorkflows: typeof data.totalWorkflows === 'number' ? data.totalWorkflows : 0,
    ratio: {
      requests: typeof data.ratio?.requests === 'number' ? data.ratio.requests : 0,
      workflows: typeof data.ratio?.workflows === 'number' ? data.ratio.workflows : 0,
    },
  };
};
