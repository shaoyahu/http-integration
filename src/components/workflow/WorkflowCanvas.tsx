import React from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import {
  NODE_SIZE,
  NODE_WIDTH,
  NODE_HEIGHT,
  TRIGGER_WIDTH,
  TRIGGER_HEIGHT,
  COMPACT_NODE_SCALE,
  MIN_NODE_VERTICAL_GAP,
  MIN_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  drawRoundedRect,
  drawDefaultIcon,
  drawCurveConnection,
  clampOffset,
} from './types';

interface WorkflowCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  setCanvasSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  view: { scale: number; offsetX: number; offsetY: number };
  setView: React.Dispatch<React.SetStateAction<{ scale: number; offsetX: number; offsetY: number }>>;
  nodePositions: Record<string, { x: number; y: number }>;
  nodePositionsRef: React.MutableRefObject<Record<string, { x: number; y: number }>>;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  connectingFrom: { nodeId: string; pointType: 'output' } | null;
  setConnectingFrom: React.Dispatch<React.SetStateAction<{ nodeId: string; pointType: 'output' } | null>>;
  mousePos: { x: number; y: number } | null;
  setMousePos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  spaceDown: boolean;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeDrag: (id: string, x: number, y: number) => void;
  onNodeDragEnd: (id: string, moved: boolean) => void;
  onCanvasPanStart: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onConnectorCreate: (sourceNodeId: string, targetNodeId: string) => void;
  onAddNode: (x: number, y: number, afterRequestId: string | null) => void;
  onNodeDuplicate: (nodeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  canvasRef,
  canvasContainerRef,
  canvasSize,
  setCanvasSize,
  view,
  setView,
  nodePositions,
  nodePositionsRef,
  selectedNodeId,
  hoveredNodeId,
  setHoveredNodeId,
  connectingFrom,
  setConnectingFrom,
  mousePos,
  setMousePos,
  spaceDown,
  onNodeSelect,
  onNodeDrag,
  onNodeDragEnd,
  onCanvasPanStart,
  onConnectorCreate,
  onAddNode,
  onNodeDuplicate,
  onNodeDelete,
}) => {
  const { workflows, selectedWorkflowId, updateWorkflow } = useWorkflowStore();
  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId);

  const triggerPos = React.useMemo(
    () => ({ x: canvasSize.width / 2 - TRIGGER_WIDTH / 2, y: 12 }),
    [canvasSize]
  );

  // Resize observer for canvas
  React.useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const updateSize = () => {
      const width = Math.max(MIN_CANVAS_WIDTH, container.clientWidth);
      const height = Math.max(MIN_CANVAS_HEIGHT, container.clientHeight);
      setCanvasSize({ width, height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedWorkflowId, canvasContainerRef, setCanvasSize]);

  // Update view offset when canvas size changes
  React.useEffect(() => {
    const container = canvasContainerRef.current;
    const viewWidth = container ? container.clientWidth / view.scale : canvasSize.width / view.scale;
    const viewHeight = container ? container.clientHeight / view.scale : canvasSize.height / view.scale;
    setView((prev) => ({
      ...prev,
      offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
      offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
    }));
  }, [canvasSize, view.scale, canvasContainerRef, setView]);

  // Sync nodePositions to ref
  React.useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions, nodePositionsRef]);

  const getCanvasPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return {
      x: sx / view.scale + view.offsetX,
      y: sy / view.scale + view.offsetY,
    };
  };

  const hitTestNode = (x: number, y: number) => {
    if (!selectedWorkflow) return null;
    for (let i = selectedWorkflow.requests.length - 1; i >= 0; i -= 1) {
      const req = selectedWorkflow.requests[i];
      const pos = nodePositions[req.id];
      if (!pos) continue;
      if (x >= pos.x && x <= pos.x + NODE_SIZE && y >= pos.y && y <= pos.y + NODE_SIZE) {
        return req;
      }
    }
    return null;
  };

  const hitTestToolbar = (x: number, y: number, nodePos: { x: number; y: number }): 'duplicate' | 'delete' | null => {
    const toolbarWidth = 60;
    const toolbarHeight = 28;
    const toolbarX = nodePos.x + NODE_SIZE / 2 - toolbarWidth / 2;
    const toolbarY = nodePos.y - toolbarHeight - 8;

    if (x >= toolbarX && x <= toolbarX + toolbarWidth && y >= toolbarY && y <= toolbarY + toolbarHeight) {
      if (x < toolbarX + 30) {
        return 'duplicate';
      }
      return 'delete';
    }
    return null;
  };

  const hitTestConnectorPoint = (x: number, y: number): { nodeId: string; pointType: 'input' | 'output' } | null => {
    if (!selectedWorkflow) return null;

    // Check trigger output point
    const triggerOutputX = triggerPos.x + TRIGGER_WIDTH / 2;
    const triggerOutputY = triggerPos.y + TRIGGER_HEIGHT;
    const triggerDist = Math.sqrt((x - triggerOutputX) ** 2 + (y - triggerOutputY) ** 2);
    if (triggerDist <= 12) {
      return { nodeId: 'trigger', pointType: 'output' };
    }

    // Check node input/output points
    for (const req of selectedWorkflow.requests) {
      const pos = nodePositionsRef.current[req.id];
      if (!pos) continue;

      const inputX = pos.x + NODE_SIZE / 2;
      const inputY = pos.y;
      const inputDist = Math.sqrt((x - inputX) ** 2 + (y - inputY) ** 2);
      if (inputDist <= 12) {
        return { nodeId: req.id, pointType: 'input' };
      }

      const outputX = pos.x + NODE_SIZE / 2;
      const outputY = pos.y + NODE_HEIGHT;
      const outputDist = Math.sqrt((x - outputX) ** 2 + (y - outputY) ** 2);
      if (outputDist <= 12) {
        return { nodeId: req.id, pointType: 'output' };
      }
    }

    return null;
  };

  // Canvas rendering
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedWorkflow) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, -view.offsetX * dpr * view.scale, -view.offsetY * dpr * view.scale);

    // Fill the visible viewport in world coordinates
    const visibleLeft = view.offsetX;
    const visibleTop = view.offsetY;
    const visibleRight = view.offsetX + canvasSize.width / view.scale;
    const visibleBottom = view.offsetY + canvasSize.height / view.scale;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(visibleLeft, visibleTop, visibleRight - visibleLeft, visibleBottom - visibleTop);

    ctx.fillStyle = '#e5e7eb';
    const grid = 40;
    const startX = Math.floor(visibleLeft / grid) * grid;
    const endX = Math.ceil(visibleRight / grid) * grid;
    const startY = Math.floor(visibleTop / grid) * grid;
    const endY = Math.ceil(visibleBottom / grid) * grid;
    for (let x = startX; x <= endX; x += grid) {
      for (let y = startY; y <= endY; y += grid) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2 / view.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const compactMode = view.scale < COMPACT_NODE_SCALE;

    // Trigger node
    drawRoundedRect(ctx, triggerPos.x, triggerPos.y, TRIGGER_WIDTH, TRIGGER_HEIGHT, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1 / view.scale;
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = '600 14px sans-serif';
    ctx.fillText('手动触发器', triggerPos.x + 16, triggerPos.y + 34);
    if (!compactMode) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.fillText('点击顶部按钮运行', triggerPos.x + 16, triggerPos.y + 56);
    }

    // Draw connections based on edges
    const edges = selectedWorkflow.edges || [];
    for (const edge of edges) {
      let startPos: { x: number; y: number } | null = null;
      let endPos: { x: number; y: number } | null = null;

      if (edge.sourceId === 'trigger') {
        startPos = { x: triggerPos.x + TRIGGER_WIDTH / 2, y: triggerPos.y + TRIGGER_HEIGHT };
      } else {
        const sourceNodePos = nodePositionsRef.current[edge.sourceId];
        if (sourceNodePos) {
          startPos = { x: sourceNodePos.x + NODE_WIDTH / 2, y: sourceNodePos.y + NODE_HEIGHT };
        }
      }

      const targetNodePos = nodePositionsRef.current[edge.targetId];
      if (targetNodePos) {
        endPos = { x: targetNodePos.x + NODE_WIDTH / 2, y: targetNodePos.y };
      }

      if (startPos && endPos) {
        drawCurveConnection(ctx, startPos, endPos, '#6b7280', view.scale);
      }
    }

    // Draw preview line while connecting
    if (connectingFrom && mousePos) {
      let startPos: { x: number; y: number } | null = null;

      if (connectingFrom.nodeId === 'trigger') {
        startPos = { x: triggerPos.x + TRIGGER_WIDTH / 2, y: triggerPos.y + TRIGGER_HEIGHT };
      } else {
        const sourcePos = nodePositionsRef.current[connectingFrom.nodeId];
        if (sourcePos) {
          startPos = { x: sourcePos.x + NODE_WIDTH / 2, y: sourcePos.y + NODE_HEIGHT };
        }
      }

      if (startPos) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2 / view.scale;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw trigger output connector point
    const triggerOutputY = triggerPos.y + TRIGGER_HEIGHT;
    const triggerOutputX = triggerPos.x + TRIGGER_WIDTH / 2;
    const isTriggerHovered = hoveredNodeId === 'trigger';
    const outputRadius = (isTriggerHovered || connectingFrom?.nodeId === 'trigger') ? 8 / view.scale : 6 / view.scale;
    ctx.fillStyle = (isTriggerHovered || connectingFrom?.nodeId === 'trigger') ? '#60a5fa' : '#9ca3af';
    ctx.beginPath();
    ctx.arc(triggerOutputX, triggerOutputY, outputRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / view.scale;
    ctx.stroke();

    selectedWorkflow.requests.forEach((req, reqIndex) => {
      const pos = nodePositions[req.id] || { x: 24, y: 24 };
      const isSelected = req.id === selectedNodeId;

      drawRoundedRect(ctx, pos.x, pos.y, NODE_SIZE, NODE_SIZE, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#60a5fa' : '#e5e7eb';
      ctx.lineWidth = (isSelected ? 2 : 1) / view.scale;
      ctx.stroke();

      const centerX = pos.x + NODE_SIZE / 2;
      const centerY = pos.y + NODE_SIZE / 2;

      if (req.iconUrl) {
        const img = new Image();
        img.src = req.iconUrl;
        if (img.complete && img.naturalWidth > 0) {
          const iconSize = 44 / view.scale;
          ctx.drawImage(img, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
        } else {
          drawDefaultIcon(ctx, centerX, centerY, view.scale);
        }
      } else {
        drawDefaultIcon(ctx, centerX, centerY, view.scale);
      }

      const nameX = pos.x + NODE_SIZE + 8;
      const nameY = pos.y + NODE_SIZE / 2 + 4;
      ctx.fillStyle = '#111827';
      ctx.font = '500 12px sans-serif';
      const rawName = req.name || `请求 ${reqIndex + 1}`;
      const maxNameWidth = 120;
      let displayName = rawName;
      if (ctx.measureText(rawName).width > maxNameWidth) {
        while (ctx.measureText(displayName + '…').width > maxNameWidth && displayName.length > 0) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '…';
      }
      ctx.fillText(displayName, nameX, nameY);

      // Draw input connector point (top)
      const isNodeHovered = hoveredNodeId === req.id;
      const inputX = pos.x + NODE_SIZE / 2;
      const inputY = pos.y;
      const inputRadius = (isNodeHovered || connectingFrom) ? 8 / view.scale : 6 / view.scale;
      ctx.fillStyle = (isNodeHovered || connectingFrom) ? '#60a5fa' : '#9ca3af';
      ctx.beginPath();
      ctx.arc(inputX, inputY, inputRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / view.scale;
      ctx.stroke();

      // Draw output connector point (bottom)
      const outputX = pos.x + NODE_SIZE / 2;
      const outputY = pos.y + NODE_HEIGHT;
      const outputNodeRadius = (isNodeHovered || connectingFrom?.nodeId === req.id) ? 8 / view.scale : 6 / view.scale;
      ctx.fillStyle = (isNodeHovered || connectingFrom?.nodeId === req.id) ? '#60a5fa' : '#9ca3af';
      ctx.beginPath();
      ctx.arc(outputX, outputY, outputNodeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / view.scale;
      ctx.stroke();

      if (isSelected) {
        const toolbarWidth = 60;
        const toolbarHeight = 28;
        const toolbarX = pos.x + NODE_SIZE / 2 - toolbarWidth / 2;
        const toolbarY = pos.y - toolbarHeight - 8;

        drawRoundedRect(ctx, toolbarX, toolbarY, toolbarWidth, toolbarHeight, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1 / view.scale;
        ctx.stroke();

        const btn1X = toolbarX + 20;
        const btn1Y = toolbarY + toolbarHeight / 2;
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1.5 / view.scale;
        ctx.beginPath();
        ctx.moveTo(btn1X - 4, btn1Y - 4);
        ctx.lineTo(btn1X + 4, btn1Y - 4);
        ctx.lineTo(btn1X + 4, btn1Y + 4);
        ctx.lineTo(btn1X - 4, btn1Y + 4);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(btn1X + 2, btn1Y - 4);
        ctx.lineTo(btn1X + 6, btn1Y);
        ctx.lineTo(btn1X + 2, btn1Y + 4);

        const btn2X = toolbarX + 40;
        const btn2Y = toolbarY + toolbarHeight / 2;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5 / view.scale;
        ctx.beginPath();
        ctx.moveTo(btn2X - 4, btn2Y - 4);
        ctx.lineTo(btn2X + 4, btn2Y + 4);
        ctx.moveTo(btn2X + 4, btn2Y - 4);
        ctx.lineTo(btn2X - 4, btn2Y + 4);
        ctx.stroke();
      }
    });
  }, [selectedWorkflow, nodePositions, selectedNodeId, view, canvasSize, triggerPos, hoveredNodeId, connectingFrom, mousePos, nodePositionsRef]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedWorkflow) return;
    const { x, y } = getCanvasPoint(event);

    // Check for connector point interaction
    const connectorPoint = hitTestConnectorPoint(x, y);
    if (connectorPoint && connectorPoint.pointType === 'output') {
      setConnectingFrom({ nodeId: connectorPoint.nodeId, pointType: 'output' });
      setMousePos({ x, y });
      return;
    }

    if (selectedNodeId) {
      const selectedPos = nodePositions[selectedNodeId];
      if (selectedPos) {
        const toolbarAction = hitTestToolbar(x, y, selectedPos);
        if (toolbarAction === 'duplicate') {
          onNodeDuplicate(selectedNodeId);
          return;
        }
        if (toolbarAction === 'delete') {
          onNodeDelete(selectedNodeId);
          return;
        }
      }
    }

    const node = hitTestNode(x, y);
    if (!node) {
      // Check if clicking on trigger area
      if (x >= triggerPos.x && x <= triggerPos.x + TRIGGER_WIDTH &&
          y >= triggerPos.y && y <= triggerPos.y + TRIGGER_HEIGHT) {
        // Don't start pan on trigger click
        return;
      }
      onCanvasPanStart(event);
      return;
    }
    const pos = nodePositions[node.id];
    if (!pos) return;

    // Start drag
    onNodeDrag(node.id, x, y);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedWorkflow) return;
    const { x, y } = getCanvasPoint(event);

    // Update mouse position for preview line
    if (connectingFrom) {
      setMousePos({ x, y });
    }

    // Update hover state
    const connectorPoint = hitTestConnectorPoint(x, y);
    if (connectorPoint) {
      setHoveredNodeId(connectorPoint.nodeId);
    } else {
      const node = hitTestNode(x, y);
      if (node) {
        setHoveredNodeId(node.id);
      } else {
        // Check if hovering trigger
        if (x >= triggerPos.x && x <= triggerPos.x + TRIGGER_WIDTH &&
            y >= triggerPos.y && y <= triggerPos.y + TRIGGER_HEIGHT) {
          setHoveredNodeId('trigger');
        } else {
          setHoveredNodeId(null);
        }
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedWorkflow) return;
    const { x, y } = getCanvasPoint(event);

    // Handle connection creation
    if (connectingFrom) {
      const connectorPoint = hitTestConnectorPoint(x, y);
      if (connectorPoint && connectorPoint.pointType === 'input') {
        onConnectorCreate(connectingFrom.nodeId, connectorPoint.nodeId);
      }
      setConnectingFrom(null);
      setMousePos(null);
    }
  };

  return { handleMouseDown, handleMouseMove, handleMouseUp };
};

export default WorkflowCanvas;
