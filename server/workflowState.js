const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

const normalizeWorkflowRequest = (request = {}, index = 0) => ({
  id: typeof request.id === 'string' && request.id.trim() ? request.id : `${Date.now()}-${index}`,
  name: typeof request.name === 'string' ? request.name : `请求 ${index + 1}`,
  method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) ? request.method : 'GET',
  url: typeof request.url === 'string' ? request.url : '',
  headers: Array.isArray(request.headers) ? request.headers : [],
  params: Array.isArray(request.params) ? request.params : [],
  body: typeof request.body === 'string' ? request.body : '',
  inputFields: Array.isArray(request.inputFields) ? request.inputFields : [],
  outputFields: Array.isArray(request.outputFields) ? request.outputFields : [],
  inputValues: request.inputValues && typeof request.inputValues === 'object' ? request.inputValues : {},
  apiMappings: Array.isArray(request.apiMappings) ? request.apiMappings : [],
});

export const normalizeWorkflowEdge = (edge = {}, requestIds = new Set(), index = 0) => {
  const sourceId = typeof edge.sourceId === 'string' ? edge.sourceId.trim() : '';
  const targetId = typeof edge.targetId === 'string' ? edge.targetId.trim() : '';
  if (!sourceId || !targetId) {
    return null;
  }

  const sourceIsValid = sourceId === 'trigger' || requestIds.has(sourceId);
  const targetIsValid = requestIds.has(targetId);
  if (!sourceIsValid || !targetIsValid) {
    return null;
  }

  return {
    id: typeof edge.id === 'string' && edge.id.trim()
      ? edge.id
      : `edge-${index}-${sourceId}-${targetId}`,
    sourceId,
    targetId,
  };
};

export const normalizeWorkflow = (workflow = {}, index = 0) => {
  const requests = Array.isArray(workflow.requests)
    ? workflow.requests.map((request, reqIdx) => normalizeWorkflowRequest(request, reqIdx))
    : [];
  const requestIds = new Set(requests.map((request) => request.id));
  const dedupedEdges = new Set();
  const edges = Array.isArray(workflow.edges)
    ? workflow.edges
      .map((edge, edgeIdx) => normalizeWorkflowEdge(edge, requestIds, edgeIdx))
      .filter(Boolean)
      .filter((edge) => {
        const key = `${edge.sourceId}->${edge.targetId}`;
        if (dedupedEdges.has(key)) {
          return false;
        }
        dedupedEdges.add(key);
        return true;
      })
    : [];

  return {
    id: typeof workflow.id === 'string' && workflow.id.trim() ? workflow.id : `${Date.now()}-${index}`,
    name: typeof workflow.name === 'string' ? workflow.name : `工作流 ${index + 1}`,
    folderId: workflow.folderId || null,
    requests,
    edges,
    createdAt: typeof workflow.createdAt === 'number' ? workflow.createdAt : Date.now(),
    updatedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
    nodePositions: workflow.nodePositions && typeof workflow.nodePositions === 'object' ? workflow.nodePositions : {},
  };
};

export const getSafeSelectedWorkflowId = (workflows = [], selectedWorkflowId = null) => (
  selectedWorkflowId && workflows.some((workflow) => workflow.id === selectedWorkflowId)
    ? selectedWorkflowId
    : (workflows[0]?.id || null)
);

export const normalizeWorkflowFolder = (folder = {}, index = 0) => ({
  id: typeof folder.id === 'string' && folder.id.trim() ? folder.id : `folder-${Date.now()}-${index}`,
  name: typeof folder.name === 'string' ? folder.name : `文件夹 ${index + 1}`,
  expanded: Boolean(folder.expanded),
});

export const normalizeWorkflowState = (payload = {}) => {
  const workflows = Array.isArray(payload.workflows)
    ? payload.workflows.map((workflow, index) => normalizeWorkflow(workflow, index))
    : [];
  const folders = Array.isArray(payload.folders)
    ? payload.folders.map((folder, index) => normalizeWorkflowFolder(folder, index))
    : [];
  const selectedWorkflowId = typeof payload.selectedWorkflowId === 'string' ? payload.selectedWorkflowId : null;
  const safeSelectedWorkflowId = getSafeSelectedWorkflowId(workflows, selectedWorkflowId);

  return {
    workflows,
    folders,
    selectedWorkflowId: safeSelectedWorkflowId,
  };
};

const normalizeIsoTimestamp = (value, fallback = new Date()) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback.toISOString();
};

const normalizeStringMap = (value = {}) => (
  value && typeof value === 'object'
    ? Object.entries(value).reduce((acc, [key, item]) => {
      if (typeof key === 'string' && key.trim()) {
        acc[key] = String(item);
      }
      return acc;
    }, {})
    : {}
);

export const maskSensitiveHeaders = (headers = {}) => (
  Object.entries(headers && typeof headers === 'object' ? headers : {}).reduce((acc, [key, value]) => {
    if (typeof key !== 'string' || !key.trim()) {
      return acc;
    }
    acc[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? '***' : String(value);
    return acc;
  }, {})
);

export const normalizeWorkflowRunNodeLog = (node = {}, index = 0) => {
  const startedAt = normalizeIsoTimestamp(node.startedAt);
  const finishedAt = normalizeIsoTimestamp(node.finishedAt, new Date(startedAt));
  const method = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(node.method) ? node.method : 'GET';

  return {
    requestId: typeof node.requestId === 'string' && node.requestId.trim() ? node.requestId : `request-${index + 1}`,
    requestName: typeof node.requestName === 'string' && node.requestName.trim() ? node.requestName : `请求 ${index + 1}`,
    method,
    url: typeof node.url === 'string' ? node.url : '',
    status: node.status === 'error' ? 'error' : 'success',
    statusCode: typeof node.statusCode === 'number' ? node.statusCode : null,
    durationMs: typeof node.durationMs === 'number' && node.durationMs >= 0 ? node.durationMs : 0,
    startedAt,
    finishedAt,
    upstreamRequestIds: Array.isArray(node.upstreamRequestIds)
      ? node.upstreamRequestIds.filter((requestId) => typeof requestId === 'string' && requestId.trim())
      : [],
    downstreamRequestIds: Array.isArray(node.downstreamRequestIds)
      ? node.downstreamRequestIds.filter((requestId) => typeof requestId === 'string' && requestId.trim())
      : [],
    requestInfo: {
      url: typeof node.requestInfo?.url === 'string' ? node.requestInfo.url : (typeof node.url === 'string' ? node.url : ''),
      method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(node.requestInfo?.method) ? node.requestInfo.method : method,
      headers: maskSensitiveHeaders(node.requestInfo?.headers || {}),
      params: normalizeStringMap(node.requestInfo?.params || {}),
      body: node.requestInfo?.body ?? null,
      resolvedInputs: node.requestInfo?.resolvedInputs && typeof node.requestInfo.resolvedInputs === 'object'
        ? node.requestInfo.resolvedInputs
        : {},
    },
    responseData: node.responseData ?? null,
    error: typeof node.error === 'string' ? node.error : undefined,
  };
};

export const normalizeWorkflowRunLog = (log = {}, fallback = {}) => {
  const nodes = Array.isArray(log.nodes)
    ? log.nodes.map((node, index) => normalizeWorkflowRunNodeLog(node, index))
    : [];
  const startedAt = normalizeIsoTimestamp(log.startedAt);
  const finishedAt = normalizeIsoTimestamp(log.finishedAt, new Date(startedAt));
  const durationMs = typeof log.durationMs === 'number' && log.durationMs >= 0
    ? log.durationMs
    : Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const status = log.status === 'error' || nodes.some((node) => node.status === 'error') ? 'error' : 'success';

  return {
    id: typeof log.id === 'string' && log.id.trim() ? log.id : '',
    workflowId: typeof log.workflowId === 'string' && log.workflowId.trim()
      ? log.workflowId
      : (typeof fallback.workflowId === 'string' ? fallback.workflowId : ''),
    workflowName: typeof log.workflowName === 'string' && log.workflowName.trim()
      ? log.workflowName
      : (typeof fallback.workflowName === 'string' ? fallback.workflowName : '未命名工作流'),
    status,
    startedAt,
    finishedAt,
    durationMs,
    nodes,
  };
};
