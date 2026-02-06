import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'zustand';
import { WorkflowPage } from '../pages/WorkflowPage';
import { createWorkflowStore, WorkflowStore } from '../store/workflowStore';
import { createRequestStore } from '../store/requestStore';

describe('Import Output Parameters Functionality', () => {
  let workflowStore: WorkflowStore;
  let requestStore: any;

  beforeEach(() => {
    workflowStore = createWorkflowStore();
    requestStore = createRequestStore();
  });

  it('should allow importing output parameters from response', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        profile: {
          age: 30,
          location: 'New York'
        }
      }
    });

    render(
      <Provider createStore={() => workflowStore}>
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

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Test Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/user' } });

    // Execute workflow
    const executeButton = screen.getByText('运行工作流');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    });

    // Check for import button
    const importButton = screen.getByText('导入出参');
    expect(importButton).toBeInTheDocument();

    // Click import button
    fireEvent.click(importButton);

    // Verify output fields were added
    const workflow = workflowStore.workflows.find((wf) => wf.id === workflowStore.selectedWorkflowId);
    const request = workflow?.requests[0];
    
    expect(request?.outputFields).toHaveLength(4);
    expect(request?.outputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', path: 'id' }),
        expect.objectContaining({ name: 'name', path: 'name' }),
        expect.objectContaining({ name: 'email', path: 'email' }),
        expect.objectContaining({ name: 'profile', path: 'profile' })
      ])
    );
  });

  it('should show success message when importing output parameters', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {
        id: '123',
        name: 'John Doe'
      }
    });

    render(
      <Provider createStore={() => workflowStore}>
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

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Test Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/user' } });

    // Execute workflow
    const executeButton = screen.getByText('运行工作流');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    });

    // Click import button
    const importButton = screen.getByText('导入出参');
    fireEvent.click(importButton);

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText('已为 Test Request 导入 2 个出参字段')).toBeInTheDocument();
    });
  });

  it('should handle empty response data when importing', async () => {
    const mockExecuteRequest = vi.fn().mockResolvedValue({
      data: {}
    });

    render(
      <Provider createStore={() => workflowStore}>
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

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Test Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/empty' } });

    // Execute workflow
    const executeButton = screen.getByText('运行工作流');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    });

    // Click import button
    const importButton = screen.getByText('导入出参');
    fireEvent.click(importButton);

    // Check for success message (should be 0 fields)
    await waitFor(() => {
      expect(screen.getByText('已为 Test Request 导入 0 个出参字段')).toBeInTheDocument();
    });
  });

  it('should not show import button for failed requests', async () => {
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
    fireEvent.change(workflowNameInput, { target: { value: 'Test Workflow' } });
    fireEvent.click(screen.getByText('Create'));

    const addRequestButton = screen.getByText('Add Request');
    fireEvent.click(addRequestButton);

    // Configure request
    const requestNameInput = screen.getByPlaceholderText('Request Name');
    fireEvent.change(requestNameInput, { target: { value: 'Test Request' } });

    const requestUrlInput = screen.getByPlaceholderText('URL');
    fireEvent.change(requestUrlInput, { target: { value: 'https://api.example.com/error' } });

    // Execute workflow
    const executeButton = screen.getByText('运行工作流');
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    });

    // Check that import button is not shown for failed request
    expect(screen.queryByText('导入出参')).not.toBeInTheDocument();
  });
});