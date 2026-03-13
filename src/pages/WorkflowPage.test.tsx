import { describe, it, expect } from 'vitest';
import { useWorkflowStore } from '../store/workflowStore';

describe('WorkflowPage', () => {
  it('should be importable', async () => {
    const { WorkflowPage } = await import('../pages/WorkflowPage');
    expect(WorkflowPage).toBeDefined();
  });

  it('should have access to workflow store', () => {
    const store = useWorkflowStore.getState();
    expect(store.workflows).toBeDefined();
    expect(store.addWorkflow).toBeDefined();
    expect(store.selectedWorkflowId).toBeDefined();
  });
});
