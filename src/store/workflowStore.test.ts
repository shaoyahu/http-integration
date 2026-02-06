import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkflowStore, WorkflowStore } from './workflowStore';

describe('Workflow Parameter Handling', () => {
  let store: WorkflowStore;

  beforeEach(() => {
    store = createWorkflowStore();
  });

  describe('Parameter Configuration', () => {
    it('should add input parameters to a workflow request', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      const param = {
        name: 'userId',
        type: 'string',
        value: '123',
        description: 'User identifier'
      };
      
      store.addInputParameter(workflowId, requestId, param);
      
      const workflow = store.workflows.get(workflowId);
      const request = workflow?.requests.find(req => req.id === requestId);
      
      expect(request?.inputParams).toHaveLength(1);
      expect(request?.inputParams[0]).toEqual(param);
    });

    it('should add output parameters to a workflow request', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      const param = {
        name: 'userId',
        path: 'data.id',
        description: 'Extract user ID from response'
      };
      
      store.addOutputParameter(workflowId, requestId, param);
      
      const workflow = store.workflows.get(workflowId);
      const request = workflow?.requests.find(req => req.id === requestId);
      
      expect(request?.outputParams).toHaveLength(1);
      expect(request?.outputParams[0]).toEqual(param);
    });

    it('should validate parameter names', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      const validParam = {
        name: 'validParam',
        type: 'string',
        value: 'test'
      };
      
      store.addInputParameter(workflowId, requestId, validParam);
      
      expect(() => {
        store.addInputParameter(workflowId, requestId, {
          name: 'validParam',
          type: 'string',
          value: 'duplicate'
        });
      }).toThrow('Parameter name "validParam" already exists for this request');
    });
  });

  describe('Parameter Passing Between Nodes', () => {
    it('should pass parameters from one request to another', () => {
      const workflowId = 'workflow1';
      const request1Id = 'request1';
      const request2Id = 'request2';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, request1Id);
      store.addRequestToWorkflow(workflowId, request2Id);
      
      // Add output parameter to first request
      store.addOutputParameter(workflowId, request1Id, {
        name: 'userId',
        path: 'data.id',
        description: 'User ID from first request'
      });
      
      // Add input parameter to second request that references the output
      store.addInputParameter(workflowId, request2Id, {
        name: 'userId',
        type: 'string',
        value: '{{workflow.requests[0].outputParams[0].name}}',
        description: 'User ID from first request'
      });
      
      const workflow = store.workflows.get(workflowId);
      const request1 = workflow?.requests.find(req => req.id === request1Id);
      const request2 = workflow?.requests.find(req => req.id === request2Id);
      
      expect(request1?.outputParams).toHaveLength(1);
      expect(request2?.inputParams).toHaveLength(1);
      expect(request2?.inputParams[0].value).toBe('{{workflow.requests[0].outputParams[0].name}}');
    });

    it('should handle complex parameter references', () => {
      const workflowId = 'workflow1';
      const request1Id = 'request1';
      const request2Id = 'request2';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, request1Id);
      store.addRequestToWorkflow(workflowId, request2Id);
      
      // Add output parameter to first request
      store.addOutputParameter(workflowId, request1Id, {
        name: 'token',
        path: 'data.token',
        description: 'Authentication token'
      });
      
      // Add input parameter to second request with complex reference
      store.addInputParameter(workflowId, request2Id, {
        name: 'authToken',
        type: 'string',
        value: '{{workflow.requests[0].outputParams[0].name}}',
        description: 'Token from first request'
      });
      
      const workflow = store.workflows.get(workflowId);
      const request2 = workflow?.requests.find(req => req.id === request2Id);
      
      expect(request2?.inputParams[0].value).toBe('{{workflow.requests[0].outputParams[0].name}}');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate input parameter types', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Valid number parameter
      store.addInputParameter(workflowId, requestId, {
        name: 'count',
        type: 'number',
        value: '10',
        description: 'Number of items'
      });
      
      // Invalid number parameter
      expect(() => {
        store.addInputParameter(workflowId, requestId, {
          name: 'invalidCount',
          type: 'number',
          value: 'not-a-number',
          description: 'Invalid number'
        });
      }).toThrow('Invalid value for parameter "invalidCount": not-a-number');
    });

    it('should validate required parameters', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Add required parameter without value
      store.addInputParameter(workflowId, requestId, {
        name: 'apiKey',
        type: 'string',
        required: true,
        description: 'API key'
      });
      
      const workflow = store.workflows.get(workflowId);
      const request = workflow?.requests.find(req => req.id === requestId);
      
      expect(request?.inputParams[0].required).toBe(true);
      expect(request?.inputParams[0].value).toBe('');
    });
  });

  describe('Parameter Extraction', () => {
    it('should extract parameters from response', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Add output parameter with path
      store.addOutputParameter(workflowId, requestId, {
        name: 'userId',
        path: 'data.user.id',
        description: 'Extract user ID'
      });
      
      const response = {
        data: {
          user: {
            id: '123',
            name: 'John Doe'
          }
        }
      };
      
      const extractedParams = store.extractOutputParameters(workflowId, requestId, response);
      
      expect(extractedParams).toEqual({
        userId: '123'
      });
    });

    it('should handle nested path extraction', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Add output parameter with nested path
      store.addOutputParameter(workflowId, requestId, {
        name: 'userName',
        path: 'data.user.profile.name',
        description: 'Extract user name'
      });
      
      const response = {
        data: {
          user: {
            profile: {
              name: 'John Doe',
              age: 30
            }
          }
        }
      };
      
      const extractedParams = store.extractOutputParameters(workflowId, requestId, response);
      
      expect(extractedParams).toEqual({
        userName: 'John Doe'
      });
    });

    it('should handle array path extraction', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Add output parameter with array path
      store.addOutputParameter(workflowId, requestId, {
        name: 'firstItemId',
        path: 'data.items[0].id',
        description: 'Extract first item ID'
      });
      
      const response = {
        data: {
          items: [
            { id: 'item1', name: 'Item 1' },
            { id: 'item2', name: 'Item 2' }
          ]
        }
      };
      
      const extractedParams = store.extractOutputParameters(workflowId, requestId, response);
      
      expect(extractedParams).toEqual({
        firstItemId: 'item1'
      });
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow with parameter passing', async () => {
      const workflowId = 'workflow1';
      const request1Id = 'request1';
      const request2Id = 'request2';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, request1Id);
      store.addRequestToWorkflow(workflowId, request2Id);
      
      // Add output parameter to first request
      store.addOutputParameter(workflowId, request1Id, {
        name: 'token',
        path: 'data.token',
        description: 'Authentication token'
      });
      
      // Add input parameter to second request that references the output
      store.addInputParameter(workflowId, request2Id, {
        name: 'authToken',
        type: 'string',
        value: '{{workflow.requests[0].outputParams[0].name}}',
        description: 'Token from first request'
      });
      
      // Mock request execution
      const mockExecuteRequest = async (requestId: string, params: any) => {
        if (requestId === request1Id) {
          return {
            data: {
              token: 'abc123',
              user: { id: 'user1' }
            }
          };
        } else if (requestId === request2Id) {
          return {
            data: {
              success: true,
              message: 'Request processed with token: ' + params.authToken
            }
          };
        }
        return { data: {} };
      };
      
      const result = await store.executeWorkflow(workflowId, mockExecuteRequest);
      
      expect(result.success).toBe(true);
      expect(result.results[request1Id].response?.data.token).toBe('abc123');
      expect(result.results[request2Id].response?.data.message).toBe('Request processed with token: abc123');
    });

    it('should handle parameter substitution during execution', async () => {
      const workflowId = 'workflow1';
      const request1Id = 'request1';
      const request2Id = 'request2';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, request1Id);
      store.addRequestToWorkflow(workflowId, request2Id);
      
      // Add output parameter to first request
      store.addOutputParameter(workflowId, request1Id, {
        name: 'userId',
        path: 'data.user.id',
        description: 'User ID'
      });
      
      // Add input parameter to second request with substitution
      store.addInputParameter(workflowId, request2Id, {
        name: 'targetUserId',
        type: 'string',
        value: '{{workflow.requests[0].outputParams[0].name}}',
        description: 'User ID from first request'
      });
      
      // Mock request execution
      const mockExecuteRequest = async (requestId: string, params: any) => {
        if (requestId === request1Id) {
          return {
            data: {
              user: { id: 'user123' }
            }
          };
        } else if (requestId === request2Id) {
          return {
            data: {
              target: params.targetUserId
            }
          };
        }
        return { data: {} };
      };
      
      const result = await store.executeWorkflow(workflowId, mockExecuteRequest);
      
      expect(result.success).toBe(true);
      expect(result.results[request2Id].response?.data.target).toBe('user123');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing output parameters', async () => {
      const workflowId = 'workflow1';
      const request1Id = 'request1';
      const request2Id = 'request2';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, request1Id);
      store.addRequestToWorkflow(workflowId, request2Id);
      
      // Add input parameter to second request that references non-existent output
      store.addInputParameter(workflowId, request2Id, {
        name: 'token',
        type: 'string',
        value: '{{workflow.requests[0].outputParams[0].name}}',
        description: 'Token from first request'
      });
      
      // Mock request execution that doesn't return the expected output
      const mockExecuteRequest = async (requestId: string) => {
        if (requestId === request1Id) {
          return { data: {} }; // No token in response
        }
        return { data: {} };
      };
      
      const result = await store.executeWorkflow(workflowId, mockExecuteRequest);
      
      expect(result.success).toBe(false);
      expect(result.errors[request2Id]).toBe('Missing required parameter: token');
    });

    it('should handle invalid parameter references', () => {
      const workflowId = 'workflow1';
      const requestId = 'request1';
      
      store.addWorkflow(workflowId);
      store.addRequestToWorkflow(workflowId, requestId);
      
      // Add input parameter with invalid reference
      store.addInputParameter(workflowId, requestId, {
        name: 'invalidParam',
        type: 'string',
        value: '{{nonexistent.param}}',
        description: 'Invalid reference'
      });
      
      const workflow = store.workflows.get(workflowId);
      const request = workflow?.requests.find(req => req.id === requestId);
      
      expect(() => {
        store.validateWorkflowParameters(workflowId);
      }).toThrow('Invalid parameter reference: nonexistent.param');
    });
  });
});