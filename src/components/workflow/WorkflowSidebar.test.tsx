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
  const onAddFolder = vi.fn()
  const onRenameFolder = vi.fn()
  const onDeleteFolder = vi.fn()
  const onReorderFolders = vi.fn()
  const onToggleFolderExpanded = vi.fn()
  const onMoveWorkflowToFolder = vi.fn()
  const setWorkflowSiderCollapsed = vi.fn()
  const setEditingId = vi.fn()
  const setEditingName = vi.fn()

  beforeEach(() => {
    onSelectWorkflow.mockReset()
    onAddWorkflow.mockReset()
    onDeleteWorkflow.mockReset()
    onRenameWorkflow.mockReset()
    onAddFolder.mockReset()
    onRenameFolder.mockReset()
    onDeleteFolder.mockReset()
    onReorderFolders.mockReset()
    onToggleFolderExpanded.mockReset()
    onMoveWorkflowToFolder.mockReset()
    setWorkflowSiderCollapsed.mockReset()
    setEditingId.mockReset()
    setEditingName.mockReset()
  })

  it('renders workflow list', () => {
    const workflows = [
      { id: 'w1', name: 'Workflow 1', requests: [], edges: [], createdAt: 0, updatedAt: 0, nodePositions: {} },
    ]
    const folders: any[] = []
    render(
      <WorkflowSidebar
        workflows={workflows as any}
        folders={folders}
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
        onAddFolder={onAddFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onReorderFolders={onReorderFolders}
        onToggleFolderExpanded={onToggleFolderExpanded}
        onMoveWorkflowToFolder={onMoveWorkflowToFolder}
      />
    )
    expect(screen.getByText('Workflow 1')).toBeTruthy()
  })

  it('selects a workflow when clicked', () => {
    const workflows = [
      { id: 'w1', name: 'Workflow 1', requests: [], edges: [], createdAt: 0, updatedAt: 0, nodePositions: {} },
    ]
    const folders: any[] = []
    render(
      <WorkflowSidebar
        workflows={workflows as any}
        folders={folders}
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
        onAddFolder={onAddFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onReorderFolders={onReorderFolders}
        onToggleFolderExpanded={onToggleFolderExpanded}
        onMoveWorkflowToFolder={onMoveWorkflowToFolder}
      />
    )
    const item = screen.getByText('Workflow 1')
    fireEvent.click(item)
    expect(onSelectWorkflow).toHaveBeenCalled()
  })

  it('renders search and action buttons', () => {
    const workflows: any[] = []
    const folders: any[] = []
    const result = render(
      <WorkflowSidebar
        workflows={workflows}
        folders={folders}
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
        onAddFolder={onAddFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onReorderFolders={onReorderFolders}
        onToggleFolderExpanded={onToggleFolderExpanded}
        onMoveWorkflowToFolder={onMoveWorkflowToFolder}
      />
    )
    expect(result.container.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})
