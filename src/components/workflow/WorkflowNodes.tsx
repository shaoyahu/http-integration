import React from 'react'
import type { Workflow } from '../store/workflowStore'

type NodePositions = Record<string, { x: number; y: number }>

type Props = {
  workflow: Workflow | null
  nodePositions: NodePositions
  view: { scale: number; offsetX: number; offsetY: number }
  selectedNodeId: string | null
  onSelect?: (id: string) => void
  hoveredNodeId?: string | null
}

// Lightweight, memoized placeholder. The actual canvas rendering is handled by
// WorkflowCanvasRenderer in this refactor stage.
export const WorkflowNodes: React.FC<Props> = React.memo(({ workflow }) => {
  return null
})

export default WorkflowNodes
