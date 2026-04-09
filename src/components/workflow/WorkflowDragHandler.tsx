import React from 'react'

type DragContext = {
  // Minimal placeholder context for potential future wiring
  dragging?: boolean
}

export const handleCanvasMouseDown = (_ev: React.MouseEvent, _ctx?: DragContext) => {
  // Placeholder: actual logic retained in main workflow page during refactor
}

export const handleCanvasMouseMove = (_ev: React.MouseEvent, _ctx?: DragContext) => {
  // Placeholder
}

export const handleCanvasMouseUp = (_ev: React.MouseEvent, _ctx?: DragContext) => {
  // Placeholder
}

export default React.memo(function WorkflowDragHandler() {
  return null
})
