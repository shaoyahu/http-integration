import React from 'react'
import type { Workflow } from '../../store/workflowStore'

type View = { scale: number; offsetX: number; offsetY: number }

type RenderParams = {
  canvasSize: { width: number; height: number }
  view: View
  triggerPos: { x: number; y: number }
  selectedWorkflow: Workflow | null
}

export const renderCanvasFrame = (
  ctx: CanvasRenderingContext2D,
  params: RenderParams
) => {
  const { canvasSize, view, selectedWorkflow } = params
  if (!selectedWorkflow) {
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height)
    return
  }

  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvasSize.width, canvasSize.height)
  ctx.setTransform(
    dpr * view.scale,
    0,
    0,
    dpr * view.scale,
    -view.offsetX * dpr * view.scale,
    -view.offsetY * dpr * view.scale
  )
}

export default React.memo(function WorkflowCanvasRenderer() {
  return null
})
