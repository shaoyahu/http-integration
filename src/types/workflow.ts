export interface HttpParam {
  key: string
  value: string
}

export interface ParamField {
  name: string
  type: 'params' | 'path' | 'body'
  required: boolean
  value?: string
  description?: string
}

export interface OutputField {
  name: string
  path: string
  description?: string
}

export interface ApiMapping {
  inputName: string
  target: 'path' | 'params' | 'body'
  key: string
}

export interface WorkflowNodePosition {
  x: number
  y: number
}

export interface WorkflowExecutionAnalysis {
  orderedRequestIds: string[]
  reachableRequestIds: string[]
  disconnectedRequestIds: string[]
  levelByRequestId: Record<string, number>
  upstreamByRequestId: Record<string, string[]>
  downstreamByRequestId: Record<string, string[]>
  cyclicRequestIds: string[]
}

export interface WorkflowInputUsage {
  fieldName: string
  required: boolean
  sourceType: 'upstream' | 'static' | 'empty'
  value: string | null
  sourceRequestId?: string
  sourceRequestName?: string
  sourceFieldName?: string
}

export interface WorkflowExplanationStep {
  requestId: string
  requestName: string
  method: string
  url: string
  level: number
  description: string
  upstreamRequestIds: string[]
  upstreamLabels: string[]
  inputUsages: WorkflowInputUsage[]
  isDisconnected: boolean
}

export interface WorkflowExplanation {
  summary: string[]
  steps: WorkflowExplanationStep[]
  disconnectedRequestIds: string[]
  warnings: string[]
}

export interface WorkflowRuntimeRequestInfo {
  url: string
  method: string
  headers: Record<string, string>
  params: Record<string, string>
  body?: unknown
  resolvedInputs?: Record<string, unknown>
}

export interface WorkflowRunNodeLog {
  requestId: string
  requestName: string
  method: string
  url: string
  status: 'success' | 'error'
  statusCode: number | null
  durationMs: number
  startedAt: string
  finishedAt: string
  upstreamRequestIds: string[]
  requestInfo: WorkflowRuntimeRequestInfo
  responseData?: unknown
  error?: string
}

export interface WorkflowRunLog {
  id: string
  workflowId: string
  workflowName: string
  status: 'success' | 'error'
  startedAt: string
  finishedAt: string
  durationMs: number
  nodes: WorkflowRunNodeLog[]
}
