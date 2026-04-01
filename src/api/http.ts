import axios from 'axios';
import type { HttpRequest, RequestFolder } from '../store/requestStore';
import type { Workflow } from '../store/workflowStore';
import type { WorkflowRunLog, WorkflowRunNodeLog } from '../types/workflow';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

let healthCheckCache:
  | {
      timestamp: number;
      data: unknown;
      promise: Promise<unknown>;
    }
  | null = null;

export interface ProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
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
    return healthCheckCache.promise;
  }
  const promise = api.get('/health').then((response) => {
    healthCheckCache = {
      timestamp: Date.now(),
      data: response.data,
      promise,
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
  return promise;
};

export interface RequestStatePayload {
  requests: HttpRequest[];
  folders: RequestFolder[];
  selectedRequestId: string | null;
}

export interface RequestItemPayload {
  request: HttpRequest;
  selectedRequestId: string | null;
}

export interface WorkflowStatePayload {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
}

export interface WorkflowItemPayload {
  workflow: Workflow;
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

export type WorkflowRunLogPayload = Omit<WorkflowRunLog, 'id'>;

const normalizeStringMap = (value: unknown): Record<string, string> => (
  value && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
      acc[key] = String(item);
      return acc;
    }, {})
    : {}
);

const normalizeWorkflowRunNodeLog = (node: any): WorkflowRunNodeLog => ({
  requestId: typeof node?.requestId === 'string' ? node.requestId : '',
  requestName: typeof node?.requestName === 'string' ? node.requestName : '未命名节点',
  method: typeof node?.method === 'string' ? node.method : 'GET',
  url: typeof node?.url === 'string' ? node.url : '',
  status: node?.status === 'error' ? 'error' : 'success',
  statusCode: typeof node?.statusCode === 'number' ? node.statusCode : null,
  durationMs: typeof node?.durationMs === 'number' ? node.durationMs : 0,
  startedAt: typeof node?.startedAt === 'string' ? node.startedAt : new Date().toISOString(),
  finishedAt: typeof node?.finishedAt === 'string' ? node.finishedAt : new Date().toISOString(),
  upstreamRequestIds: Array.isArray(node?.upstreamRequestIds)
    ? node.upstreamRequestIds.filter((requestId: unknown) => typeof requestId === 'string')
    : [],
  requestInfo: {
    url: typeof node?.requestInfo?.url === 'string' ? node.requestInfo.url : (typeof node?.url === 'string' ? node.url : ''),
    method: typeof node?.requestInfo?.method === 'string' ? node.requestInfo.method : (typeof node?.method === 'string' ? node.method : 'GET'),
    headers: normalizeStringMap(node?.requestInfo?.headers),
    params: normalizeStringMap(node?.requestInfo?.params),
    body: node?.requestInfo?.body,
    resolvedInputs: node?.requestInfo?.resolvedInputs && typeof node.requestInfo.resolvedInputs === 'object'
      ? node.requestInfo.resolvedInputs
      : {},
  },
  responseData: node?.responseData,
  error: typeof node?.error === 'string' ? node.error : undefined,
});

const normalizeWorkflowRunLog = (log: any): WorkflowRunLog => ({
  id: typeof log?.id === 'string' ? log.id : '',
  workflowId: typeof log?.workflowId === 'string' ? log.workflowId : '',
  workflowName: typeof log?.workflowName === 'string' ? log.workflowName : '未命名工作流',
  status: log?.status === 'error' ? 'error' : 'success',
  startedAt: typeof log?.startedAt === 'string' ? log.startedAt : new Date().toISOString(),
  finishedAt: typeof log?.finishedAt === 'string' ? log.finishedAt : new Date().toISOString(),
  durationMs: typeof log?.durationMs === 'number' ? log.durationMs : 0,
  nodes: Array.isArray(log?.nodes) ? log.nodes.map(normalizeWorkflowRunNodeLog) : [],
});

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

export const saveRequestItem = async (payload: RequestItemPayload) => {
  const response = await api.put(`/requests-state/${payload.request.id}`, payload);
  return response.data;
};

export const deleteRequestItem = async (requestId: string, selectedRequestId: string | null) => {
  const response = await api.delete(`/requests-state/${requestId}`, {
    data: { selectedRequestId },
  });
  return response.data;
};

export const saveRequestSelection = async (selectedRequestId: string | null) => {
  const response = await api.patch('/requests-state/selection', { selectedRequestId });
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

export const saveWorkflowItem = async (payload: WorkflowItemPayload) => {
  const response = await api.put(`/workflows-state/${payload.workflow.id}`, payload);
  return response.data;
};

export const deleteWorkflowItem = async (workflowId: string, selectedWorkflowId: string | null) => {
  const response = await api.delete(`/workflows-state/${workflowId}`, {
    data: { selectedWorkflowId },
  });
  return response.data;
};

export const saveWorkflowSelection = async (selectedWorkflowId: string | null) => {
  const response = await api.patch('/workflows-state/selection', { selectedWorkflowId });
  return response.data;
};

export const fetchWorkflowAvailableRequests = async (): Promise<WorkflowAvailableRequest[]> => {
  const response = await api.get('/workflow-requests');
  const data = response.data || {};
  return Array.isArray(data.requests) ? data.requests : [];
};

export const fetchWorkflowRunLogs = async (workflowId: string): Promise<WorkflowRunLog[]> => {
  const response = await api.get(`/workflows-state/${workflowId}/logs`);
  const data = response.data || {};
  return Array.isArray(data.logs) ? data.logs.map(normalizeWorkflowRunLog) : [];
};

export const saveWorkflowRunLog = async (workflowId: string, payload: WorkflowRunLogPayload): Promise<WorkflowRunLog> => {
  const response = await api.post(`/workflows-state/${workflowId}/logs`, payload);
  return normalizeWorkflowRunLog(response.data?.log || {});
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
