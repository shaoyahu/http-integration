import React from 'react'
import type { Workflow } from '../store/workflowStore'

type Point = { x: number; y: number }
type Edge = { id: string; sourceId: string; targetId: string }

type Props = {
  workflow: Workflow | null
  edges: Edge[]
  view: { scale: number; offsetX: number; offsetY: number }
  nodePositions?: Record<string, Point>
  onEdgeClick?: (edgeId: string) => void
}

// Placeholder component for edge drawing. The actual rendering can be wired when
// integrating the canvas renderer.
export const WorkflowConnections: React.FC<Props> = React.memo(({ workflow }) => {
  return null
})

export default WorkflowConnections
