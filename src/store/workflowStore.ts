import { create } from 'zustand'
import type { HttpParam, ParamField, OutputField, WorkflowNodePosition } from '../types/workflow'

export type { HttpParam, ParamField, OutputField }

const NODE_WIDTH = 80

export interface WorkflowEdge {
  id: string
  sourceId: string
  targetId: string
}

export interface Workflow {
  id: string
  name: string
  requests: WorkflowRequest[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  nodePositions?: Record<string, WorkflowNodePosition>
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
  iconUrl?: string
}

interface WorkflowStore {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  setWorkflowState: (workflows: Workflow[], selectedWorkflowId: string | null) => void
  addWorkflow: () => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  addRequestToWorkflow: (workflowId: string, request: Partial<WorkflowRequest>) => void
  removeRequestFromWorkflow: (workflowId: string, requestId: string) => void
  updateWorkflowRequestInputValue: (workflowId: string, requestId: string, fieldName: string, value: string) => void
  reorderWorkflowRequests: (workflowId: string, oldIndex: number, newIndex: number) => void
  setSelectedWorkflow: (id: string | null) => void
  duplicateWorkflowRequest: (workflowId: string, requestId: string) => string | null
  addOutputFieldsFromResponse: (workflowId: string, requestId: string, response: unknown) => void
  addEdge: (workflowId: string, sourceId: string, targetId: string) => void
  removeEdge: (workflowId: string, edgeId: string) => void
  updateEdge: (workflowId: string, edgeId: string, sourceId: string, targetId: string) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  selectedWorkflowId: null,
  setWorkflowState: (workflows, selectedWorkflowId) =>
    set({
      workflows: Array.isArray(workflows) ? workflows : [],
      selectedWorkflowId: selectedWorkflowId && workflows.some((wf) => wf.id === selectedWorkflowId)
        ? selectedWorkflowId
        : (workflows[0]?.id || null),
    }),
  addWorkflow: () =>
    set((state) => {
      const now = Date.now()
      const workflowId = `${now}-${Math.random().toString(36).slice(2, 8)}`
      return {
        workflows: [
          ...state.workflows,
          {
            id: workflowId,
            name: `工作流 ${state.workflows.length + 1}`,
            requests: [],
            edges: [],
            createdAt: now,
            updatedAt: now,
            nodePositions: {},
          },
        ],
        selectedWorkflowId: workflowId,
      }
    }),
  updateWorkflow: (id, updates) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === id ? { ...wf, ...updates, updatedAt: updates.updatedAt ?? Date.now() } : wf
      ),
    })),
  deleteWorkflow: (id) =>
    set((state) => {
      const remainingWorkflows = state.workflows.filter((wf) => wf.id !== id);
      let nextSelectedId = state.selectedWorkflowId;
      if (state.selectedWorkflowId === id) {
        nextSelectedId = remainingWorkflows[0]?.id || null;
      }
      return {
        workflows: remainingWorkflows,
        selectedWorkflowId: nextSelectedId,
      };
    }),
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
              edges: (wf.edges || []).filter((edge) => edge.sourceId !== requestId && edge.targetId !== requestId),
              nodePositions: Object.fromEntries(Object.entries(wf.nodePositions || {}).filter(([key]) => key !== requestId)),
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

      const traverse = (obj: unknown, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return;

        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          const currentPath = path ? `${path}.${key}` : key;

          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Also add the object itself as a valid output field (not just leaf nodes)
            if (!visitedPaths.has(currentPath)) {
              outputFields.push({
                name: key,
                path: currentPath,
                description: `从响应中提取的参数: ${currentPath}`,
              });
              visitedPaths.add(currentPath);
            }
            traverse(value, currentPath);
          } else if (typeof value !== 'object' || value === null) {
            // Leaf nodes (primitives and array elements)
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
  duplicateWorkflowRequest: (workflowId, requestId) => {
    let newId: string | null = null;
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === workflowId);
      if (!workflow) return state;

      const requestIndex = workflow.requests.findIndex((req) => req.id === requestId);
      if (requestIndex === -1) return state;

      const originalRequest = workflow.requests[requestIndex];
      // Use unique ID with timestamp + random + counter to avoid collisions
      newId = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duplicatedRequest: WorkflowRequest = {
        ...originalRequest,
        id: newId,
        name: `${originalRequest.name} (副本)`,
        inputValues: { ...originalRequest.inputValues },
      };

      const newRequests = [...workflow.requests];
      newRequests.splice(requestIndex + 1, 0, duplicatedRequest);

      const newNodePositions = {
        ...workflow.nodePositions,
        [newId]: workflow.nodePositions?.[requestId]
          ? {
              x: (workflow.nodePositions[requestId]?.x || 0) + NODE_WIDTH + 40,
              y: workflow.nodePositions[requestId]?.y || 0,
            }
          : { x: 0, y: 0 },
      };

      return {
        workflows: state.workflows.map((wf) =>
          wf.id === workflowId
            ? { ...wf, updatedAt: Date.now(), requests: newRequests, nodePositions: newNodePositions }
            : wf
        ),
      };
    });
    return newId;
  },
  addEdge: (workflowId, sourceId, targetId) =>
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === workflowId);
      if (!workflow) return state;

      const edges = workflow.edges || [];
      // Check for duplicate edge in both directions
      const existingEdge = edges.find(
        (e) => (e.sourceId === sourceId && e.targetId === targetId) ||
               (e.sourceId === targetId && e.targetId === sourceId)
      );
      if (existingEdge) return state;

      const newEdge: WorkflowEdge = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId,
        targetId,
      };
      
      return {
        workflows: state.workflows.map((wf) =>
          wf.id === workflowId
            ? { ...wf, updatedAt: Date.now(), edges: [...edges, newEdge] }
            : wf
        ),
      };
    }),
  removeEdge: (workflowId, edgeId) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              updatedAt: Date.now(),
              edges: (wf.edges || []).filter((e) => e.id !== edgeId),
            }
          : wf
      ),
    })),
  updateEdge: (workflowId, edgeId, sourceId, targetId) =>
    set((state) => ({
      workflows: state.workflows.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              updatedAt: Date.now(),
              edges: (wf.edges || []).map((e) =>
                e.id === edgeId ? { ...e, sourceId, targetId } : e
              ),
            }
          : wf
      ),
    })),
}))

// Selectors for easier state access
export const selectWorkflows = (state: WorkflowStore) => state.workflows;
export const selectSelectedWorkflowId = (state: WorkflowStore) => state.selectedWorkflowId;
export const selectSelectedWorkflow = (state: WorkflowStore): Workflow | null => {
  const id = state.selectedWorkflowId;
  if (!id) return null;
  const wf = state.workflows.find((w) => w.id === id);
  return wf ?? null;
};
export const selectSelectedWorkflowRequests = (state: WorkflowStore): WorkflowRequest[] => {
  const wf = selectSelectedWorkflow(state);
  return wf?.requests ?? [];
};
