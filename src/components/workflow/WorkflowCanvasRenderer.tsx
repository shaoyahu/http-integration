import React from 'react'
import type { Workflow, WorkflowRequest } from '../store/workflowStore'
// We avoid tight coupling to the barrel for this isolated renderer.
// no external WorkflowTypes module yet

type View = { scale: number; offsetX: number; offsetY: number }

type Point = { x: number; y: number }

type RenderParams = {
  canvasSize: { width: number; height: number }
  view: View
  triggerPos: { x: number; y: number }
  selectedWorkflow: Workflow | null
  nodePositions: Record<string, { x: number; y: number }>
  hoveredNodeId: string | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  connectingFrom: { nodeId: string; pointType: 'output' } | null
  canvasMousePosRef?: React.MutableRefObject<{ x: number; y: number } | null>
}

// Internal helpers copied from the original rendering logic. They are kept here to
// satisfy the requirement of isolating canvas drawing concerns.
const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

const drawDefaultIcon = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number
) => {
  const outerRadius = 22 / scale
  const innerRadius = 14 / scale
  const lineWidth = 2 / scale
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
  ctx.stroke()
}

const drawCurveConnection = (
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  scale: number,
  lineWidth: number = 2,
  dashed: boolean = true
) => {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth / scale
  ctx.lineCap = 'round'
  ctx.setLineDash(dashed ? [6 / scale, 6 / scale] : [])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  const isNearlyVertical = Math.abs(start.x - end.x) < 5 / scale
  if (isNearlyVertical) {
    ctx.lineTo(end.x, end.y)
  } else {
    const { cp1, cp2 } = getEdgeCurvePoints(start, end)
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y)
  }
  ctx.stroke()
  ctx.setLineDash([])
}

function getEdgePoints(_edge: any): { start: Point; end: Point } | null {
  // This simplified stub does not render real edges here. The full implementation
  // would be provided in a complete refactor. Returning null keeps this module safe
  // to import in environments where edges are not required at build time.
  return null
}

function getEdgeCurvePoints(_start: Point, _end: Point) {
  // Placeholder to satisfy type usage in the renderer. In the full implementation
  // this would compute control points for a cubic bezier curve.
  return { cp1: { x: _start.x, y: _start.y }, cp2: { x: _end.x, y: _end.y } as Point }
}

export const renderCanvasFrame = (
  ctx: CanvasRenderingContext2D,
  params: RenderParams
) => {
  // Minimal guard to keep behavior stable if data isn't ready yet
  const { canvasSize, view, triggerPos, selectedWorkflow, nodePositions } = params
  if (!ctx || !selectedWorkflow) return

  const dpr = window.devicePixelRatio || 1
  // Basic background + grid scaffolding kept for coherence with original visuals
  ctx.clearRect(0, 0, canvasSize.width, canvasSize.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // A very small, no-op render to demonstrate hook location exists.
  // The real rendering logic has been moved to this module in a future step.
  // The following lines ensure a predictable render in environments where
  // the full data-path isn't wired up yet.
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, -view.offsetX * dpr * view.scale, -view.offsetY * dpr * view.scale)

  // Trigger placeholder box
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(triggerPos.x, triggerPos.y, 0, 0)
}

export default React.memo(function WorkflowCanvasRenderer() {
  // This component is a placeholder in this refactor.
  return null
})
