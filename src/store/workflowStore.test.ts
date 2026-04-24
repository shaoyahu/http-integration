import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './workflowStore';
import type { WorkflowRequest } from './workflowStore';

describe('WorkflowStore', () => {
  let store: typeof useWorkflowStore;

  beforeEach(() => {
    store = useWorkflowStore;
    store.setState({
      workflows: [],
      selectedWorkflowId: null,
    });
  });

  describe('Workflow Management', () => {
    it('should add a workflow', () => {
      store.getState().addWorkflow();
      
      const state = store.getState();
      expect(state.workflows).toHaveLength(1);
      expect(state.selectedWorkflowId).toBe(state.workflows[0].id);
    });

    it('should update a workflow', () => {
      store.getState().addWorkflow();
      const workflowId = store.getState().workflows[0].id;
      
      store.getState().updateWorkflow(workflowId, { name: 'Updated Workflow' });
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.name).toBe('Updated Workflow');
    });

    it('should delete a workflow and select the next one', () => {
      store.getState().addWorkflow();
      store.getState().addWorkflow();
      
      const stateBeforeDelete = store.getState();
      const firstId = stateBeforeDelete.workflows[0].id;
      const secondId = stateBeforeDelete.workflows[1].id;
      
      store.getState().deleteWorkflow(firstId);
      
      const state = store.getState();
      expect(state.workflows).toHaveLength(1);
      expect(state.selectedWorkflowId).toBe(secondId);
    });
  });

  describe('Request Management', () => {
    let workflowId: string;

    beforeEach(() => {
      store.getState().addWorkflow();
      workflowId = store.getState().workflows[0].id;
    });

    it('should add a request to workflow', () => {
      const request: Partial<WorkflowRequest> = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };
      
      store.getState().addRequestToWorkflow(workflowId, request);
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.requests).toHaveLength(1);
      expect(workflow?.requests[0].name).toBe('Test Request');
    });

    it('should remove a request from workflow', () => {
      const request: Partial<WorkflowRequest> = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };
      
      store.getState().addRequestToWorkflow(workflowId, request);
      store.getState().removeRequestFromWorkflow(workflowId, 'test-request-1');
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.requests).toHaveLength(0);
    });

    it('should remove related edges when deleting a request', () => {
      const request1: Partial<WorkflowRequest> = {
        id: 'request-1',
        name: 'Request 1',
        method: 'GET',
        url: 'https://example.com/1',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };
      const request2: Partial<WorkflowRequest> = {
        id: 'request-2',
        name: 'Request 2',
        method: 'GET',
        url: 'https://example.com/2',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };

      store.getState().addRequestToWorkflow(workflowId, request1);
      store.getState().addRequestToWorkflow(workflowId, request2);
      store.getState().addEdge(workflowId, 'trigger', 'request-1');
      store.getState().addEdge(workflowId, 'request-1', 'request-2');

      store.getState().removeRequestFromWorkflow(workflowId, 'request-1');

      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.edges).toHaveLength(0);
    });

    it('should update input values', () => {
      const request: Partial<WorkflowRequest> = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com',
        headers: [],
        params: [],
        body: '',
        inputFields: [{ name: 'userId', type: 'params', required: true }],
        outputFields: [],
        inputValues: {},
      };
      
      store.getState().addRequestToWorkflow(workflowId, request);
      store.getState().updateWorkflowRequestInputValue(workflowId, 'test-request-1', 'userId', '123');
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.requests[0].inputValues['userId']).toBe('123');
    });

    it('should reorder workflow requests', () => {
      const request1: Partial<WorkflowRequest> = {
        id: 'request-1',
        name: 'Request 1',
        method: 'GET',
        url: 'https://example.com/1',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };
      const request2: Partial<WorkflowRequest> = {
        id: 'request-2',
        name: 'Request 2',
        method: 'POST',
        url: 'https://example.com/2',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [],
        inputValues: {},
      };
      
      store.getState().addRequestToWorkflow(workflowId, request1);
      store.getState().addRequestToWorkflow(workflowId, request2);
      
      store.getState().reorderWorkflowRequests(workflowId, 1, 0);
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.requests[0].id).toBe('request-2');
      expect(workflow?.requests[1].id).toBe('request-1');
    });

    it('should add output fields from nested response data without duplicates', () => {
      const request: Partial<WorkflowRequest> = {
        id: 'request-with-output',
        name: 'Request With Output',
        method: 'GET',
        url: 'https://example.com',
        headers: [],
        params: [],
        body: '',
        inputFields: [],
        outputFields: [{ name: 'existing', path: 'data.id' }],
        inputValues: {},
      };

      store.getState().addRequestToWorkflow(workflowId, request);
      store.getState().addOutputFieldsFromResponse(workflowId, 'request-with-output', {
        data: {
          id: 1,
          user: {
            name: 'alice',
          },
        },
      });
      store.getState().addOutputFieldsFromResponse(workflowId, 'request-with-output', {
        data: {
          id: 1,
          user: {
            name: 'alice',
          },
        },
      });

      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      const requestAfterImport = workflow?.requests.find((item) => item.id === 'request-with-output');

      expect(requestAfterImport?.outputFields).toEqual([
        { name: 'existing', path: 'data.id' },
        { name: 'data', path: 'data', description: '从响应中提取的参数: data' },
        { name: 'user', path: 'data.user', description: '从响应中提取的参数: data.user' },
        { name: 'name', path: 'data.user.name', description: '从响应中提取的参数: data.user.name' },
      ]);
    });
  });

  describe('Duplicate Request', () => {
    let workflowId: string;

    beforeEach(() => {
      store.getState().addWorkflow();
      workflowId = store.getState().workflows[0].id;
    });

    it('should duplicate a workflow request', () => {
      const request: Partial<WorkflowRequest> = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com',
        headers: [],
        params: [],
        body: '',
        inputFields: [{ name: 'userId', type: 'params', required: true }],
        outputFields: [],
        inputValues: { userId: '123' },
      };
      
      store.getState().addRequestToWorkflow(workflowId, request);
      const newId = store.getState().duplicateWorkflowRequest(workflowId, 'test-request-1');
      
      const workflow = store.getState().workflows.find(w => w.id === workflowId);
      expect(workflow?.requests).toHaveLength(2);
      expect(workflow?.requests[1].id).toBe(newId);
      expect(workflow?.requests[1].name).toBe('Test Request (副本)');
    });
  });
});
