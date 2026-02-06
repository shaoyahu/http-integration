import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkflowPage } from '../pages/WorkflowPage';
import { createWorkflowStore, WorkflowStore } from '../store/workflowStore';
import { Provider } from 'zustand';

describe('WorkflowPage Parameter Handling', () => {
  let store: WorkflowStore;

  beforeEach(() => {
    store = createWorkflowStore();
  });

  it('should allow adding input parameters to workflow requests', async () => {
    render(
      <Provider createStore={() => store}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and request
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Add input parameter
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'userId' } });
    
    const paramTypeSelect = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect, { target: { value: 'string' } });
    
    const paramValueInput = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput, { target: { value: '123' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    await waitFor(() => {
      expect(screen.getByText('userId')).toBeInTheDocument();
      expect(screen.getByText('string')).toBeInTheDocument();
      expect(screen.getByText('123')).toBeInTheDocument();
    });
  });

  it('should allow adding output parameters to workflow requests', async () => {
    render(
      <Provider createStore={() => store}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and request
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Add output parameter
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'token' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.token' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    await waitFor(() => {
      expect(screen.getByText('token')).toBeInTheDocument();
      expect(screen.getByText('data.token')).toBeInTheDocument();
    });
  });

  it('should handle parameter references between requests', async () => {
    render(
      <Provider createStore={() => store}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and two requests
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add first request
    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Add output parameter to first request
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'token' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.token' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Add second request
    fireEvent.click(addRequestButton);

    // Add input parameter to second request with reference
    const paramNameInput2 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput2, { target: { value: 'authToken' } });
    
    const paramTypeSelect2 = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect2, { target: { value: 'string' } });
    
    const paramValueInput2 = screen.getByPlaceholderText('Parameter Value');
    fireEvent.change(paramValueInput2, { target: { value: '{{workflow.requests[0].outputParams[0].name}}' } });
    
    const addParamButton2 = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton2);

    await waitFor(() => {
      expect(screen.getByText('authToken')).toBeInTheDocument();
      expect(screen.getByText('{{workflow.requests[0].outputParams[0].name}}')).toBeInTheDocument();
    });
  });

  it('should validate parameter input during workflow execution', async () => {
    render(
      <Provider createStore={() => store}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and request with required parameter
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Add required input parameter
    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'apiKey' } });
    
    const paramTypeSelect = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.change(paramTypeSelect, { target: { value: 'string' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Try to execute workflow without providing required parameter
    const executeButton = screen.getByText('Execute Workflow');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText('Missing required parameter: apiKey')).toBeInTheDocument();
    });
  });

  it('should execute workflow with parameter passing', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {
        token: 'abc123',
        user: { id: 'user1' }
      }
    });

    render(
      <Provider createStore={() => store}>
        <WorkflowPage />
      </Provider>
    );

    // Add workflow and requests with parameter passing
    const addWorkflowButton = screen.getByText('Add Workflow');
    fireEvent.click(addWorkflowButton);

    const workflowNameInput = screen.getByPlaceholderText('Workflow Name');
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    // Add first request with output parameter
    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    const paramNameInput = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput, { target: { value: 'token' } });
    
    const paramPathInput = screen.getByPlaceholderText('Response Path (e.g., data.token)');
    fireEvent.change(paramPathInput, { target: { value: 'data.token' } });
    
    const addParamButton = screen.getByText('Add Parameter');
    fireEvent.click(addParamButton);

    // Add second request with input parameter referencing output
    fireEvent.click(addRequestButton);

    const paramNameInput2 = screen.getByPlaceholderText('Parameter Name');
    fireEvent.change(paramNameInput2, { target: { value: 'authToken' } });
    
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
          authToken: 'abc123'
        })
      );
    });
  });
});