import { create } from 'zustand'

export interface HttpParam {
  key: string
  value: string
}

export interface ParamField {
  name: string
  type: 'params' | 'path' | 'body'
  required: boolean
  description?: string
}

export interface OutputField {
  name: string
  path: string
  description?: string
}

export interface Workflow {
  id: string
  name: string
  requests: WorkflowRequest[]
  createdAt: number
  updatedAt: number
  nodePositions?: Record<string, { x: number; y: number }>
}

export interface WorkflowRequest {
  id: string
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: HttpParam[]
  params: HttpParam[]
  body: string
  inputFields: ParamField[]
  outputFields: OutputField[]
  inputValues: Record<string, string>
  apiMappings?: Array<{ inputName: string; target: 'path' | 'params' | 'body'; key: string }>
}

interface WorkflowStore {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  addWorkflow: () => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  addRequestToWorkflow: (workflowId: string, request: any) => void
  removeRequestFromWorkflow: (workflowId: string, requestId: string) => void
  updateWorkflowRequestInputValue: (workflowId: string, requestId: string, fieldName: string, value: string) => void
  reorderWorkflowRequests: (workflowId: string, oldIndex: number, newIndex: number) => void
  setSelectedWorkflow: (id: string | null) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  selectedWorkflowId: null,
  addWorkflow: () => set((state) => ({
    workflows: [
      ...state.workflows,
      {
        id: Date.now().toString(),
        name: `工作流 ${state.workflows.length + 1}`,
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodePositions: {},
      },
    ],
    selectedWorkflowId: Date.now().toString(),
  })),
  updateWorkflow: (id, updates) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === id ? { ...wf, ...updates, updatedAt: updates.updatedAt || Date.now() } : wf
      ),
    })),
  deleteWorkflow: (id) =>
    set((state) => ({
      workflows: state.workflows.filter((wf) => wf.id !== id),
      selectedWorkflowId: state.selectedWorkflowId === id ? null : state.selectedWorkflowId,
    })),
  addRequestToWorkflow: (workflowId, request) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              updatedAt: Date.now(),
              requests: [
                ...wf.requests,
                {
                  ...request,
                  id: request.id || Date.now().toString(),
                  inputValues: {},
                  inputFields: request.inputFields || [],
                  outputFields: request.outputFields || [],
                  apiMappings: request.apiMappings || [],
                },
              ],
            }
          : wf
      ),
    })),
  removeRequestFromWorkflow: (workflowId, requestId) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              updatedAt: Date.now(),
              requests: wf.requests.filter((req) => req.id !== requestId),
              nodePositions: Object.fromEntries(Object.entries(wf.nodePositions || {}).filter(([key]) => key !== requestId)),
            }
          : wf
      ),
    })),
  updateWorkflowRequest: (workflowId, requestId, updates) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              updatedAt: Date.now(),
              requests: wf.requests.map((req) =>
                req.id === requestId ? { ...req, ...updates } : req
              ),
            }
          : wf
      ),
    })),
  updateWorkflowRequestInputValue: (workflowId, requestId, fieldName, value) =>
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === workflowId);
      if (!workflow) return state;

      const newRequests = workflow.requests.map((req) =>
        req.id === requestId ? { ...req, inputValues: { ...req.inputValues, [fieldName]: value } } : req
      );

      return {
        workflows: state.workflows.map((wf) => (wf.id === workflowId ? { ...wf, updatedAt: Date.now(), requests: newRequests } : wf)),
      };
    }),
  addOutputFieldsFromResponse: (workflowId, requestId, response) =>
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === workflowId);
      if (!workflow) return state;

      // Extract possible output fields from response
      const outputFields: OutputField[] = [];
      const visitedPaths = new Set<string>();

      const traverse = (obj: any, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return;

        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            traverse(value, currentPath);
          } else if (typeof value !== 'object' || value === null) {
            // Only add fields that are not objects or arrays
            if (!visitedPaths.has(currentPath)) {
              outputFields.push({
                name: key,
                path: currentPath,
                description: `从响应中提取的参数: ${currentPath}`,
              });
              visitedPaths.add(currentPath);
            }
          }
        }
      };

      traverse(response);

      const newRequests = workflow.requests.map((req) =>
        req.id === requestId ? { ...req, outputFields: [...req.outputFields, ...outputFields] } : req
      );

      return {
        workflows: state.workflows.map((wf) => (wf.id === workflowId ? { ...wf, updatedAt: Date.now(), requests: newRequests } : wf)),
      };
    }),
  reorderWorkflowRequests: (workflowId, oldIndex, newIndex) =>
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === workflowId);
      if (!workflow) return state;

      const newRequests = [...workflow.requests];
      const [movedItem] = newRequests.splice(oldIndex, 1);
      newRequests.splice(newIndex, 0, movedItem);

      return {
        workflows: state.workflows.map((wf) =>
          wf.id === workflowId ? { ...wf, updatedAt: Date.now(), requests: newRequests } : wf
        ),
      };
    }),
  setSelectedWorkflow: (id) => set({ selectedWorkflowId: id }),
}))
