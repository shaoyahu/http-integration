// Barrel of lightweight, extracted workflow UI pieces.
// Note: These are lightweight shims to keep the repository compiling after the refactor.
// They are intentionally minimal and focus on API compatibility.

import React from 'react'

// Constants used by the canvas/workflow rendering.
export const MIN_CANVAS_WIDTH = 1200
export const MIN_CANVAS_HEIGHT = 800
export const NODE_SIZE = 120
export const NODE_WIDTH = 120
export const NODE_HEIGHT = 120
export const TRIGGER_WIDTH = 180
export const TRIGGER_HEIGHT = 100
export const MIN_NODE_VERTICAL_GAP = 20
export const MIN_NODE_HORIZONTAL_GAP = 20

// Simple utilities (basic in-file implementations to keep existing usage working).
export const clampOffset = (offset: number, viewportSize: number, contentSize: number) => {
  if (!Number.isFinite(offset)) return 0
  if (!Number.isFinite(viewportSize) || !Number.isFinite(contentSize)) return offset
  const max = Math.max(0, contentSize - viewportSize)
  return Math.max(0, Math.min(offset, max))
}

export const snapToGrid = (value: number, grid: number) => Math.round(value / grid) * grid

// Re-export actual component implementations
export { WorkflowSidebar } from './WorkflowSidebar'
export { WorkflowToolbar } from './WorkflowToolbar'
export { WorkflowNodeDetail } from './WorkflowNodeDetail'
export { WorkflowResultsPanel } from './WorkflowResultsPanel'
export { WorkflowAddPanel } from './WorkflowAddPanel'

// Re-export shape for file imports that expect a named export from this barrel.
export type { React }

// Re-export the small subset of constants/functions for ergonomic imports in other files.
export { MIN_CANVAS_WIDTH as _MIN_CANVAS_WIDTH, MIN_CANVAS_HEIGHT as _MIN_CANVAS_HEIGHT }
