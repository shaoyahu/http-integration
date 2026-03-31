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

export const normalizeWorkflowState = (payload = {}) => {
  const workflows = Array.isArray(payload.workflows)
    ? payload.workflows.map((workflow, index) => normalizeWorkflow(workflow, index))
    : [];
  const selectedWorkflowId = typeof payload.selectedWorkflowId === 'string' ? payload.selectedWorkflowId : null;
  const safeSelectedWorkflowId = getSafeSelectedWorkflowId(workflows, selectedWorkflowId);

  return {
    workflows,
    selectedWorkflowId: safeSelectedWorkflowId,
  };
};
