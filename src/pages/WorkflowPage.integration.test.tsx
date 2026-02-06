import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'zustand';
import { WorkflowPage } from '../pages/WorkflowPage';
import { createWorkflowStore, WorkflowStore } from '../store/workflowStore';
import { createRequestStore } from '../store/requestStore';

describe('Workflow Execution Integration Tests', () => {
  let workflowStore: WorkflowStore;
  let requestStore: any;

  beforeEach(() => {
    workflowStore = createWorkflowStore();
    requestStore = createRequestStore();
  });

  it('should execute a complete workflow with parameter passing', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {
        token: 'abc123',
        user: { id: 'user1' }
      }
    });

    render(
      <Provider createStore={() => workflowStore}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'User Authentication Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add first request (login)
    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Configure first request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Login' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/login' } });

    const requestMethodSelect = screen.getByRole('combobox', { name: 'Method' });
    fireEvent.change(requestMethodSelect, { target: { value: 'POST' } });

    // Add output parameter for token
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'authToken' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.token' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Add second request (get user profile)
    fireEvent.click(addRequestButton);

    // Configure second request
    const requestNameInput2 = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput2, { target: { value: 'Get Profile' } });

    const requestUrlInput2 = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput2, { target: { value: 'https://api.example.com/user/profile' } });

    const requestMethodSelect2 = screen.getByRole('combobox', { name: 'Method' });
    fireEvent.change(requestMethodSelect2, { target: { value: 'GET' } });

    // Add input parameter for token
    const paramNameInput2 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput2, { target: { value: 'token' } });
    
    const paramTypeSelect2 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect2, { target: { value: 'string' } });
    
    const paramValueInput2 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput2, { target: { value: '{{workflow.requests[0].outputParams[0].name}}' } });
    
    const addParamButton2 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton2);

    // Execute workflow
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(2);
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          url: 'https://api.example.com/login',
          params: {},
          path: {},
          body: {},
          headers: {}
        })
      );
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/user/profile',
          params: {},
          path: {},
          body: {},
          headers: {
            Authorization: 'Bearer abc123'
          }
        })
      );
    });
  });

  it('should handle complex parameter extraction and substitution', async () => {
    const mockExecuteRequest = vi.fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            token: 'abc123',
            user: {
              id: 'user1',
              profile: {
                name: 'John Doe',
                email: 'john@example.com'
              }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'user1',
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      });

    render(
      <Provider createStore={() => workflowStore}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Complex Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add first request
    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Configure first request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Get Session' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/session' } });

    // Add multiple output parameters
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'userId' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.session.user.id' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    const paramNameInput2 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput2, { target: { value: 'userName' } });
    
    const paramPathInput2 = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput2, { target: { value: 'data.session.user.profile.name' } });
    
    const addParamButton2 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton2);

    // Add second request
    fireEvent.click(addRequestButton);

    // Configure second request
    const requestNameInput2 = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput2, { target: { value: 'Get User Details' } });

    const requestUrlInput2 = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput2, { target: { value: 'https://api.example.com/users/{{workflow.requests[0].outputParams[0].name}}' } });

    // Add input parameters
    const paramNameInput3 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput3, { target: { value: 'userId' } });
    
    const paramTypeSelect3 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect3, { target: { value: 'string' } });
    
    const paramValueInput3 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput3, { target: { value: '{{workflow.requests[0].outputParams[0].name}}' } });
    
    const addParamButton3 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton3);

    const paramNameInput4 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput4, { target: { value: 'userName' } });
    
    const paramTypeSelect4 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect4, { target: { value: 'string' } });
    
    const paramValueInput4 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput4, { target: { value: '{{workflow.requests[0].outputParams[1].name}}' } });
    
    const addParamButton4 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton4);

    // Execute workflow
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(2);
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/users/user1',
          params: {},
          path: {},
          body: {},
          headers: {}
        })
      );
    });
  });

  it('should handle workflow with conditional parameter values', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {
        success: true,
        user: { id: 'user1' }
      }
    });

    render(
      <Provider createStore={() => workflowStore}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Conditional Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add request with conditional parameter
    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Conditional Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/users/{{userId || "default"}}' } });

    // Add input parameter
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'userId' } });
    
    const paramTypeSelect = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect, { target: { value: 'string' } });
    
    const paramValueInput = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput, { target: { value: 'user123' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Execute workflow
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/users/user123',
          params: {},
          path: {},
          body: {},
          headers: {}
        })
      );
    });
  });

  it('should handle workflow execution with multiple requests and parameter chaining', async () => {
    const mockExecuteRequest = vi.fn()
      .mockResolvedValueOnce({
        data: {
          id: 'workflow1',
          name: 'Test Workflow',
          status: 'active'
        }
      })
      .mockResolvedValueOnce({
        data: {
          workflowId: 'workflow1',
          step: 1,
          status: 'completed'
        }
      })
      .mockResolvedValueOnce({
        data: {
          workflowId: 'workflow1',
          step: 2,
          status: 'completed'
        }
      });

    render(
      <Provider createStore={() => workflowStore}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Chained Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add three requests with parameter chaining
    const addRequestButton = screen.getByText('Add Request');
    
    // First request
    fireEvent.click(addRequestButton);
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Init' } });
    
    // Add output parameter
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'workflowId' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.id' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Second request
    fireEvent.click(addRequestButton);
    const requestNameInput2 = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput2, { target: { value: 'Step 1' } });
    
    // Add input parameter referencing output
    const paramNameInput2 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput2, { target: { value: 'workflowId' } });
    
    const paramTypeSelect2 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect2, { target: { value: 'string' } });
    
    const paramValueInput2 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput2, { target: { value: '{{workflow.requests[0].outputParams[0].name}}' } });
    
    const addParamButton2 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton2);

    // Third request
    fireEvent.click(addRequestButton);
    const requestNameInput3 = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput3, { target: { value: 'Step 2' } });
    
    // Add input parameter referencing output
    const paramNameInput3 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput3, { target: { value: 'workflowId' } });
    
    const paramTypeSelect3 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect3, { target: { value: 'string' } });
    
    const paramValueInput3 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput3, { target: { value: '{{workflow.requests[0].outputParams[0].name}}' } });
    
    const addParamButton3 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton3);

    // Execute workflow
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(3);
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/workflows/{{workflow.requests[0].outputParams[0].name}}',
          params: {},
          path: {},
          body: {},
          headers: {}
        })
      );
    });
  });

  it('should handle workflow execution errors and display appropriate messages', async () => {
    const mockExecuteRequest = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <Provider createStore={() => workflowStore}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and request
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Error Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Error Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/error' } });

    // Execute workflow
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});