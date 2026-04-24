import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowNodeDetail } from './WorkflowNodeDetail'

describe('WorkflowNodeDetail', () => {
  const onClose = vi.fn()
  const updateWorkflowRequestInputValue = vi.fn()

  beforeEach(() => {
    onClose.mockReset()
    updateWorkflowRequestInputValue.mockReset()
  })

  it('renders null when no node is selected', () => {
    const { container } = render(
      <WorkflowNodeDetail
        selectedNodeId={null}
        selectedWorkflow={null as any}
        resultsLength={0}
        onClose={onClose}
        updateWorkflowRequestInputValue={updateWorkflowRequestInputValue as any}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders node details correctly', () => {
    const workflow = {
      id: 'wf1',
      requests: [
        {
          id: 'node1',
          name: 'Test Request',
          method: 'GET',
          url: 'https://example.com',
          inputFields: [],
          outputFields: [],
          inputValues: {},
        },
      ],
    }

    render(
      <WorkflowNodeDetail
        selectedNodeId={'node1'}
        selectedWorkflow={workflow as any}
        resultsLength={0}
        onClose={onClose}
        updateWorkflowRequestInputValue={updateWorkflowRequestInputValue as any}
      />
    )

    // Title and request name should be present
    expect(screen.getByText('请求详情')).toBeTruthy()
    expect(screen.getByText('Test Request')).toBeTruthy()
  })

  it('should call onClose when close button is clicked', () => {
    const workflow = {
      id: 'wf1',
      requests: [
        {
          id: 'node1',
          name: 'Test Request',
          method: 'GET',
          url: 'https://example.com',
          inputFields: [],
          outputFields: [],
          inputValues: {},
        },
      ],
    }

    render(
      <WorkflowNodeDetail
        selectedNodeId={'node1'}
        selectedWorkflow={workflow as any}
        resultsLength={0}
        onClose={onClose}
        updateWorkflowRequestInputValue={updateWorkflowRequestInputValue as any}
      />
    )

    // Find the close button by its aria-label/icon wrapper and click
    const closeBtn = screen.getByRole('button')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
