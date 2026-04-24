import React from 'react'
import type { Workflow } from '../../store/workflowStore'

type NodePositions = Record<string, { x: number; y: number }>

type Props = {
  workflow: Workflow | null
  nodePositions: NodePositions
  view: { scale: number; offsetX: number; offsetY: number }
  selectedNodeId: string | null
  onSelect?: (id: string) => void
  hoveredNodeId?: string | null
}

export const WorkflowNodes: React.FC<Props> = React.memo(() => null)

export default WorkflowNodes
