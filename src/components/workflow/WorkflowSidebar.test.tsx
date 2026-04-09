import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowSidebar } from './WorkflowSidebar'
import { USER_ROLES } from '../../constants/auth'

describe('WorkflowSidebar', () => {
  const onSelectWorkflow = vi.fn()
  const onAddWorkflow = vi.fn()
  const onDeleteWorkflow = vi.fn()
  const onRenameWorkflow = vi.fn()
  const setWorkflowSiderCollapsed = vi.fn()
  const setEditingId = vi.fn()
  const setEditingName = vi.fn()

  beforeEach(() => {
    onSelectWorkflow.mockReset()
    onAddWorkflow.mockReset()
    onDeleteWorkflow.mockReset()
    onRenameWorkflow.mockReset()
    setWorkflowSiderCollapsed.mockReset()
    setEditingId.mockReset()
    setEditingName.mockReset()
  })

  it('renders workflow list', () => {
    const workflows = [
      { id: 'w1', name: 'Workflow 1', requests: [], edges: [], createdAt: 0, updatedAt: 0, nodePositions: {} },
    ]
    render(
      <WorkflowSidebar
        workflows={workflows as any}
        selectedWorkflowId={null}
        isLoadingState={false}
        databaseStatusText="OK"
        databaseStatusColor="green"
        workflowSiderCollapsed={false}
        editingId={null}
        editingName={''}
        setWorkflowSiderCollapsed={setWorkflowSiderCollapsed as any}
        setEditingId={setEditingId as any}
        setEditingName={setEditingName as any}
        onSelectWorkflow={onSelectWorkflow}
        onAddWorkflow={onAddWorkflow}
        onDeleteWorkflow={onDeleteWorkflow}
        onRenameWorkflow={onRenameWorkflow}
      />
    )
    expect(screen.getByText('Workflow 1')).toBeTruthy()
  })

  it('selects a workflow when clicked', () => {
    const workflows = [
      { id: 'w1', name: 'Workflow 1', requests: [], edges: [], createdAt: 0, updatedAt: 0, nodePositions: {} },
    ]
    render(
      <WorkflowSidebar
        workflows={workflows as any}
        selectedWorkflowId={null}
        isLoadingState={false}
        databaseStatusText="OK"
        databaseStatusColor="green"
        workflowSiderCollapsed={false}
        editingId={null}
        editingName={''}
        setWorkflowSiderCollapsed={setWorkflowSiderCollapsed as any}
        setEditingId={setEditingId as any}
        setEditingName={setEditingName as any}
        onSelectWorkflow={onSelectWorkflow}
        onAddWorkflow={onAddWorkflow}
        onDeleteWorkflow={onDeleteWorkflow}
        onRenameWorkflow={onRenameWorkflow}
      />
    )
    const item = screen.getByText('Workflow 1')
    fireEvent.click(item)
    expect(onSelectWorkflow).toHaveBeenCalled()
  })

  it('calls add workflow when add button is clicked', () => {
    const workflows = []
    render(
      <WorkflowSidebar
        workflows={workflows as any}
        selectedWorkflowId={null}
        isLoadingState={false}
        databaseStatusText="OK"
        databaseStatusColor="green"
        workflowSiderCollapsed={false}
        editingId={null}
        editingName={''}
        setWorkflowSiderCollapsed={setWorkflowSiderCollapsed as any}
        setEditingId={setEditingId as any}
        setEditingName={setEditingName as any}
        onSelectWorkflow={onSelectWorkflow}
        onAddWorkflow={onAddWorkflow}
        onDeleteWorkflow={onDeleteWorkflow}
        onRenameWorkflow={onRenameWorkflow}
      />
    )
    // The first child is the Add Workflow row
    const addRow = screen.getByText(/添加工作流/)
    fireEvent.click(addRow)
    expect(onAddWorkflow).toHaveBeenCalled()
  })
})
