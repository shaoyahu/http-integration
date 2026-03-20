import React, { useCallback, useState } from 'react';
import { Layout, Button, Input, List, Space, Popconfirm, message, Empty, Tag, Tooltip, Dropdown, Drawer } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, EditOutlined, ImportOutlined, LeftOutlined, RightOutlined, PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useWorkflowStore } from '../store/workflowStore';
import Editor from '@monaco-editor/react';
import { applyPathMapping, parseBodyValue, setNestedValue } from '../utils/requestPayload';
import { fetchWorkflowAvailableRequests, fetchWorkflowState, healthCheck, proxyRequest, saveWorkflowState, type WorkflowAvailableRequest } from '../api/http';
import { HTTP_METHOD_COLORS } from '../constants/http';
import { formatResponseData } from '../utils/response';

const { Sider, Content } = Layout;

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const details = error.response?.data?.details || error.response?.data?.error || error.message;
    return status ? `HTTP ${status}: ${details}` : details;
  }
  return error instanceof Error ? error.message : String(error);
};

const getSaveStatusText = (isLoading: boolean, isSaving: boolean, saveError: string | null) => {
  if (isLoading) {
    return '正在加载工作流...';
  }
  if (isSaving) {
    return '保存中...';
  }
  if (saveError) {
    return `保存失败：${saveError}`;
  }
  return '已保存';
};

const buildCurl = (url: string, method: string, params: Record<string, string>, body?: unknown) => {
  let fullUrl = url;
  const entries = Object.entries(params || {});
  if (entries.length > 0) {
    const query = entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    fullUrl += fullUrl.includes('?') ? `&${query}` : `?${query}`;
  }
  const parts = [`curl -X ${method}`];
  if (body !== undefined) {
    parts.push(`-H "Content-Type: application/json"`);
    parts.push(`-d '${JSON.stringify(body)}'`);
  }
  parts.push(`"${fullUrl}"`);
  return parts.join(' ');
};

const NODE_SIZE = 80;
const NODE_WIDTH = NODE_SIZE;
const NODE_HEIGHT = NODE_SIZE;
const TRIGGER_WIDTH = 220;
const TRIGGER_HEIGHT = 80;
const MIN_CANVAS_WIDTH = 0;
const MIN_CANVAS_HEIGHT = 0;
const COMPACT_NODE_SCALE = 0.85;
const ORTHOGONAL_GAP = 30;
const ROUTE_PADDING = 14;
const ADD_PANEL_WIDTH = 280;
const ADD_PANEL_HEIGHT = 300;
const MIN_NODE_VERTICAL_GAP = 80;
const MIN_NODE_HORIZONTAL_GAP = 40;

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawDefaultIcon = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number) => {
  const outerRadius = 22 / scale;
  const innerRadius = 14 / scale;
  const lineWidth = 2 / scale;
  
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = lineWidth;
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.stroke();
};

const snapToGrid = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

const clampOffset = (offset: number, _viewSize: number, _contentSize: number) => {
  // Keep panning always available; background/grid is drawn by visible world window.
  return offset;
};

const isRectOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

type Point = { x: number; y: number };
type RouteObstacle = { id: string; x: number; y: number; w: number; h: number };

const isPointInsideRect = (point: Point, rect: { x1: number; y1: number; x2: number; y2: number }) =>
  point.x > rect.x1 && point.x < rect.x2 && point.y > rect.y1 && point.y < rect.y2;

const isSegmentBlocked = (a: Point, b: Point, rects: Array<{ x1: number; y1: number; x2: number; y2: number }>) => {
  if (a.x === b.x) {
    const x = a.x;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return rects.some((rect) => x > rect.x1 && x < rect.x2 && y1 < rect.y2 && y2 > rect.y1);
  }
  if (a.y === b.y) {
    const y = a.y;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    return rects.some((rect) => y > rect.y1 && y < rect.y2 && x1 < rect.x2 && x2 > rect.x1);
  }
  return true;
};

const simplifyOrthogonalPath = (points: Point[]) => {
  if (points.length <= 2) return points;
  const simplified: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = simplified[simplified.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;
    if (!sameX && !sameY) {
      simplified.push(curr);
    }
  }
  simplified.push(points[points.length - 1]);
  return simplified;
};

const tryBuildOrthogonalPath = (
  start: Point,
  end: Point,
  obstacles: RouteObstacle[],
  canvasWidth: number,
  canvasHeight: number,
  ignoreIds: string[] = [],
  gap: number = ORTHOGONAL_GAP
) => {
  const startAnchor = { x: start.x, y: start.y + gap };
  const endAnchor = { x: end.x, y: end.y - gap };

  const expandedObstacles = obstacles
    .filter((obs) => !ignoreIds.includes(obs.id))
    .map((obs) => ({
      x1: obs.x - ROUTE_PADDING,
      y1: obs.y - ROUTE_PADDING,
      x2: obs.x + obs.w + ROUTE_PADDING,
      y2: obs.y + obs.h + ROUTE_PADDING,
    }));

  // When target is above source, force a side detour so the edge still exits from
  // source bottom and does not visually "come out" of the source top.
  if (end.y <= start.y) {
    const lateralOffset = NODE_WIDTH / 2 + ROUTE_PADDING + gap;
    const sideCandidates = Array.from(
      new Set([
        start.x + lateralOffset,
        start.x - lateralOffset,
        end.x + lateralOffset,
        end.x - lateralOffset,
      ])
    ).filter((x) => Math.abs(x - start.x) > 1);

    let bestPath: Point[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const sideX of sideCandidates) {
      const candidate = [
        start,
        startAnchor,
        { x: sideX, y: startAnchor.y },
        { x: sideX, y: endAnchor.y },
        endAnchor,
        end,
      ];
      let blocked = false;
      let cost = 0;
      for (let i = 0; i < candidate.length - 1; i += 1) {
        const a = candidate[i];
        const b = candidate[i + 1];
        if (isSegmentBlocked(a, b, expandedObstacles)) {
          blocked = true;
          break;
        }
        cost += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      }
      if (!blocked && cost < bestCost) {
        bestCost = cost;
        bestPath = candidate;
      }
    }

    if (bestPath) {
      return simplifyOrthogonalPath(bestPath);
    }
  }

  const xSet = new Set<number>([startAnchor.x, endAnchor.x, 0, canvasWidth]);
  const ySet = new Set<number>([startAnchor.y, endAnchor.y, 0, canvasHeight]);
  expandedObstacles.forEach((rect) => {
    xSet.add(rect.x1);
    xSet.add(rect.x2);
    ySet.add(rect.y1);
    ySet.add(rect.y2);
  });
  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  type GraphNode = Point & { key: string };
  const nodes = new Map<string, GraphNode>();
  const byX = new Map<number, GraphNode[]>();
  const byY = new Map<number, GraphNode[]>();

  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (expandedObstacles.some((rect) => isPointInsideRect(point, rect))) continue;
      const key = `${x},${y}`;
      const node = { x, y, key };
      nodes.set(key, node);
      if (!byX.has(x)) byX.set(x, []);
      if (!byY.has(y)) byY.set(y, []);
      byX.get(x)!.push(node);
      byY.get(y)!.push(node);
    }
  }

  const startKey = `${startAnchor.x},${startAnchor.y}`;
  const endKey = `${endAnchor.x},${endAnchor.y}`;
  if (!nodes.has(startKey) || !nodes.has(endKey)) {
    return null;
  }

  const adjacency = new Map<string, Array<{ to: string; cost: number }>>();
  const linkLine = (list: GraphNode[], axis: 'x' | 'y') => {
    const sorted = [...list].sort((a, b) => (axis === 'x' ? a.y - b.y : a.x - b.x));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (isSegmentBlocked(a, b, expandedObstacles)) continue;
      const cost = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (!adjacency.has(a.key)) adjacency.set(a.key, []);
      if (!adjacency.has(b.key)) adjacency.set(b.key, []);
      adjacency.get(a.key)!.push({ to: b.key, cost });
      adjacency.get(b.key)!.push({ to: a.key, cost });
    }
  };
  byX.forEach((list) => linkLine(list, 'x'));
  byY.forEach((list) => linkLine(list, 'y'));

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const visited = new Set<string>();
  nodes.forEach((_v, key) => {
    distances.set(key, Number.POSITIVE_INFINITY);
    previous.set(key, null);
  });
  distances.set(startKey, 0);

  while (visited.size < nodes.size) {
    let currentKey: string | null = null;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const [key, distance] of distances.entries()) {
      if (!visited.has(key) && distance < minDistance) {
        minDistance = distance;
        currentKey = key;
      }
    }
    if (!currentKey || minDistance === Number.POSITIVE_INFINITY) break;
    if (currentKey === endKey) break;
    visited.add(currentKey);

    const edges = adjacency.get(currentKey) || [];
    for (const edge of edges) {
      if (visited.has(edge.to)) continue;
      const alt = minDistance + edge.cost;
      if (alt < (distances.get(edge.to) || Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, alt);
        previous.set(edge.to, currentKey);
      }
    }
  }

  if ((distances.get(endKey) || Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) {
    return null;
  }

  const routed: Point[] = [];
  let cursor: string | null = endKey;
  while (cursor) {
    const node = nodes.get(cursor);
    if (node) routed.push({ x: node.x, y: node.y });
    cursor = previous.get(cursor) || null;
  }
  routed.reverse();

  const path = [start, startAnchor, ...routed.slice(1, routed.length - 1), endAnchor, end];
  return simplifyOrthogonalPath(path);
};

const drawCurveConnection = (
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  scale: number
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curvature = Math.min(Math.max(distance * 0.5, 30), 100);
  
  const cp1x = start.x;
  const cp1y = start.y + curvature;
  const cp2x = end.x;
  const cp2y = end.y - curvature;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
  ctx.stroke();
};

export const WorkflowPage: React.FC = () => {
  const { workflows, selectedWorkflowId, setWorkflowState, addWorkflow, updateWorkflow, deleteWorkflow, setSelectedWorkflow, removeRequestFromWorkflow, updateWorkflowRequestInputValue, addEdge, removeEdge } = useWorkflowStore();
  const [availableRequests, setAvailableRequests] = useState<WorkflowAvailableRequest[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; pointType: 'output' } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const nodePositionsRef = React.useRef<Record<string, { x: number; y: number }>>({});
  const [view, setView] = useState<{ scale: number; offsetX: number; offsetY: number }>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addPanelPos, setAddPanelPos] = useState<{ x: number; y: number; afterRequestId: string | null }>({ x: 0, y: 0, afterRequestId: null });
  const [spaceDown, setSpaceDown] = useState(false);
  const [nodeSearch, setNodeSearch] = useState('');
  const [workflowSiderCollapsed, setWorkflowSiderCollapsed] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isSavingState, setIsSavingState] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isDatabaseConnected, setIsDatabaseConnected] = useState(false);
  const [showSavedStatus, setShowSavedStatus] = useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null);
  const addPanelRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    id: string | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    mode: 'drag' | 'pan' | null;
    originOffsetX: number;
    originOffsetY: number;
  }>({ id: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false, mode: null, originOffsetX: 0, originOffsetY: 0 });
  const spaceDownRef = React.useRef(false);
  const initializedRef = React.useRef(false);
  const lastSavedRef = React.useRef('');
  const saveTimerRef = React.useRef<number | null>(null);
  const latestSaveRequestIdRef = React.useRef(0);
  const saveInFlightRef = React.useRef(false);
  const queuedPayloadRef = React.useRef<{ workflows: typeof workflows; selectedWorkflowId: string | null } | null>(null);

  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId);
  const lastUpdated = selectedWorkflow?.updatedAt || selectedWorkflow?.createdAt;
  const filteredAvailableRequests = availableRequests.filter((req) => (req.name || '').toLowerCase().includes(addSearch.toLowerCase()));
  const triggerPos = React.useMemo(
    () => ({ x: canvasSize.width / 2 - TRIGGER_WIDTH / 2, y: 12 }),
    [canvasSize]
  );

  const showSaveStatus = isLoadingState || isSavingState || Boolean(saveError) || showSavedStatus;
  const statusText = showSaveStatus
    ? getSaveStatusText(isLoadingState, isSavingState, saveError)
    : (isDatabaseConnected ? '数据库已连接' : '数据库未连接');
  const statusColor = showSaveStatus
    ? (saveError ? 'error' : (isLoadingState || isSavingState ? 'processing' : 'success'))
    : (isDatabaseConnected ? 'success' : 'error');

  const persistWorkflowState = useCallback(
    async (payload: { workflows: typeof workflows; selectedWorkflowId: string | null }) => {
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        return;
      }
      if (saveInFlightRef.current) {
        queuedPayloadRef.current = payload;
        return;
      }

      const requestId = latestSaveRequestIdRef.current + 1;
      latestSaveRequestIdRef.current = requestId;
      saveInFlightRef.current = true;
      setIsSavingState(true);
      setSaveError(null);

      try {
        await saveWorkflowState(payload);
        lastSavedRef.current = serialized;
        setLastSavedAt(Date.now());
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        throw new Error(details);
      } finally {
        saveInFlightRef.current = false;
        if (latestSaveRequestIdRef.current === requestId) {
          setIsSavingState(false);
        }
        if (queuedPayloadRef.current) {
          const latestPayload = queuedPayloadRef.current;
          queuedPayloadRef.current = null;
          const latestSerialized = JSON.stringify(latestPayload);
          if (latestSerialized !== lastSavedRef.current) {
            await persistWorkflowState(latestPayload);
          }
        }
      }
    },
    []
  );

  React.useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsLoadingState(true);
      try {
        const [data, requestOptions] = await Promise.all([
          fetchWorkflowState(),
          fetchWorkflowAvailableRequests(),
        ]);
        if (cancelled) {
          return;
        }
        setWorkflowState(data.workflows, data.selectedWorkflowId);
        setAvailableRequests(requestOptions);
        setSaveError(null);
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        console.error('Failed to load workflows state from DB:', details);
      } finally {
        if (cancelled) {
          return;
        }
        const snapshot = useWorkflowStore.getState();
        lastSavedRef.current = JSON.stringify({
          workflows: snapshot.workflows,
          selectedWorkflowId: snapshot.selectedWorkflowId,
        });
        initializedRef.current = true;
        setIsLoadingState(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [setWorkflowState]);

  React.useEffect(() => {
    const unsubscribe = useWorkflowStore.subscribe((state) => {
      if (!initializedRef.current) {
        return;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(async () => {
        const payload = {
          workflows: state.workflows,
          selectedWorkflowId: state.selectedWorkflowId,
        };
        try {
          await persistWorkflowState(payload);
        } catch (error) {
          const details = getErrorMessage(error);
          console.error('Failed to save workflows state to DB:', details);
        }
      }, 1200);
    });
    return () => {
      unsubscribe();
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [persistWorkflowState]);

  React.useEffect(() => {
    let mounted = true;
    const checkDatabaseStatus = async () => {
      try {
        const result = await healthCheck();
        if (!mounted) {
          return;
        }
        setIsDatabaseConnected(result?.status === 'ok');
      } catch {
        if (!mounted) {
          return;
        }
        setIsDatabaseConnected(false);
      }
    };
    checkDatabaseStatus();
    const timer = window.setInterval(checkDatabaseStatus, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (!lastSavedAt || isLoadingState || isSavingState || saveError) {
      return;
    }
    setShowSavedStatus(true);
    const timer = window.setTimeout(() => {
      setShowSavedStatus(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [lastSavedAt, isLoadingState, isSavingState, saveError]);

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
  }, [selectedWorkflowId, isLoadingState]);

  React.useEffect(() => {
    const container = canvasContainerRef.current;
    const viewWidth = container ? container.clientWidth / view.scale : canvasSize.width / view.scale;
    const viewHeight = container ? container.clientHeight / view.scale : canvasSize.height / view.scale;
    setView((prev) => ({
      ...prev,
      offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
      offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
    }));
  }, [canvasSize, view.scale]);

  React.useEffect(() => {
    if (!selectedWorkflow) return;
    setNodePositions((prev) => {
      const next: Record<string, { x: number; y: number }> = {};
      let index = 0;
      const centerX = canvasSize.width / 2 - NODE_WIDTH / 2;
      for (const req of selectedWorkflow.requests) {
        next[req.id] =
          selectedWorkflow.nodePositions?.[req.id] ||
          prev[req.id] || {
            x: centerX,
            y: triggerPos.y + TRIGGER_HEIGHT + MIN_NODE_VERTICAL_GAP + index * (NODE_HEIGHT + MIN_NODE_VERTICAL_GAP),
          };
        index += 1;
      }
      return next;
    });
  }, [selectedWorkflow, triggerPos, canvasSize]);

  React.useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDownRef.current = true;
        setSpaceDown(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    setAddPanelOpen(false);
    setAddSearch('');
    setSelectedNodeId(null);
    setView({ scale: 1, offsetX: 0, offsetY: 0 });
  }, [selectedWorkflowId]);

  React.useEffect(() => {
    if (!selectedWorkflow || !selectedNodeId) return;
    if (!selectedWorkflow.requests.find((req) => req.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedWorkflow, selectedNodeId]);

  React.useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      if (!addPanelOpen) return;
      const target = event.target as Node;
      if (addPanelRef.current && addPanelRef.current.contains(target)) return;
      setAddPanelOpen(false);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [addPanelOpen]);

  const runStatusMap = results.reduce((acc, result) => {
    acc[result.requestId] = { status: result.status, statusCode: result.statusCode };
    return acc;
  }, {} as Record<string, { status: 'success' | 'error'; statusCode?: number }>);

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

    // Fill the visible viewport in world coordinates so zoom-out doesn't leave blank bottom/right areas.
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

    // Draw trigger output connector point (always visible on hover of trigger area)
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
      const outputRadius = (isNodeHovered || connectingFrom?.nodeId === req.id) ? 8 / view.scale : 6 / view.scale;
      ctx.fillStyle = (isNodeHovered || connectingFrom?.nodeId === req.id) ? '#60a5fa' : '#9ca3af';
      ctx.beginPath();
      ctx.arc(outputX, outputY, outputRadius, 0, Math.PI * 2);
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
  }, [selectedWorkflow, nodePositions, runStatusMap, selectedNodeId, view, canvasSize, triggerPos, hoveredNodeId, connectingFrom, mousePos]);

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      updateWorkflow(id, { name: newName.trim() });
      message.success('工作流已重命名');
    }
    setEditingId(null);
  };

  const startEditing = (e: React.MouseEvent, wf: any) => {
    e.stopPropagation();
    setEditingId(wf.id);
    setEditingName(wf.name);
  };

const handleRunWorkflow = async () => {
    if (!selectedWorkflow) {
      return;
    }

    setRunning(true);
    setResults([]);

    try {
      const workflowResults: any[] = [];
      const localRequestOutputs: any[] = [];
      const edges = selectedWorkflow.edges || [];

      const getExecutionOrder = (): string[] => {
        const order: string[] = [];
        const visited = new Set<string>();
        
        const findNextNodes = (nodeId: string): string[] => {
          return edges
            .filter((e) => e.sourceId === nodeId)
            .map((e) => e.targetId);
        };

        const traverse = (nodeId: string) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);
          order.push(nodeId);
          
          const nextNodes = findNextNodes(nodeId);
          for (const nextId of nextNodes) {
            traverse(nextId);
          }
        };

        traverse('trigger');
        return order.filter((id) => id !== 'trigger');
      };

      const executionOrder = getExecutionOrder();

      for (const requestId of executionOrder) {
        const request = selectedWorkflow.requests.find((r) => r.id === requestId);
        if (!request) continue;

        try {
          let headers = request.headers.reduce(
            (acc, h) => (h.key ? { ...acc, [h.key]: h.value } : acc),
            {} as Record<string, string>
          );

          let params = { ...request.params.reduce(
            (acc, p) => (p.key ? { ...acc, [p.key]: p.value } : acc),
            {} as Record<string, string>
          )};

          let url = request.url;
          let body = request.body;
          let bodyObj: Record<string, any> | null = {};
          if (body && body.trim() !== '') {
            try {
              bodyObj = JSON.parse(body);
            } catch (e) {
              bodyObj = null;
            }
          }
          let bodyUpdated = false;
          const mappings = request.apiMappings || [];

          if (request.inputFields && request.inputFields.length > 0) {
            for (const field of request.inputFields) {

              const value = request.inputValues?.[field.name];

              if (value === undefined && field.required) {
                throw new Error(`${field.name} 是必填字段`);
              }

              let processedValue = value;
              if (value && value.startsWith('{{') && value.endsWith('}}')) {
                const ref = value.slice(2, -2);
                const [refRequestId, fieldName] = ref.split('.');
                const refRequest = localRequestOutputs.find((output) => output.requestId === refRequestId);
                if (refRequest) {
                  const refOutput = refRequest.outputs.find((out) => out.name === fieldName);
                  if (refOutput) {
                    processedValue = refOutput.value;
                  }
                }
              }

              if (processedValue !== undefined) {
                const mapping = mappings.find((m: any) => m.inputName === field.name && m.key);
                if (mapping) {
                  if (mapping.target === 'path') {
                    url = applyPathMapping(url, mapping.key, String(processedValue));
                  } else if (mapping.target === 'params') {
                    params[mapping.key] = String(processedValue);
                  } else if (mapping.target === 'body') {
                    if (!bodyObj) {
                      throw new Error(`Body 格式错误`);
                    }
                    setNestedValue(bodyObj, mapping.key, parseBodyValue(processedValue));
                    bodyUpdated = true;
                  }
                } else if (field.type === 'params') {
                  params[field.name] = String(processedValue);
                } else if (field.type === 'body') {
                  if (!bodyObj) {
                    throw new Error(`Body 格式错误`);
                  }
                  setNestedValue(bodyObj, field.name, parseBodyValue(processedValue));
                  bodyUpdated = true;
                } else if (field.type === 'path') {
                  url = applyPathMapping(url, field.name, String(processedValue));
                }
              }
            }
          }

          if (bodyUpdated) {
            body = JSON.stringify(bodyObj || {}, null, 2);
          }

          let requestBody = undefined;
          if (['POST', 'PUT', 'PATCH'].includes(request.method) && body) {
            try {
              requestBody = JSON.parse(body);
            } catch (e) {
              requestBody = body;
            }
          }

          const startTime = Date.now();
          const response = await proxyRequest({
            url,
            method: request.method,
            headers,
            body: requestBody,
            params,
          });
          const time = Date.now() - startTime;

          const responseData = response.data !== undefined && response.data !== null ? response.data : response;
          const outputData: any = {};
          if (request.outputFields && request.outputFields.length > 0) {
            for (const field of request.outputFields) {
              try {
                const keys = field.path.split('.');
                let value = responseData;
                for (const key of keys) {
                  value = value?.[key];
                }
                outputData[field.name] = value;
              } catch (e) {
                outputData[field.name] = undefined;
              }
            }
          }

          localRequestOutputs.push({
            requestId: request.id,
            requestName: request.name,
            outputs: Object.entries(outputData).map(([key, value]) => ({
              name: key,
              value,
            })),
          });

          workflowResults.push({
            requestId: request.id,
            name: request.name,
            status: 'success',
            statusCode: response.status || 200,
            time,
            data: responseData,
            headers: response.headers || {},
            requestInfo: {
              url,
              method: request.method,
              params,
              body: requestBody,
              headers,
            },
          });
        } catch (error: any) {
          workflowResults.push({
            requestId: request.id,
            name: request.name,
            status: 'error',
            statusCode: error.response?.status || 500,
            time: 0,
            error: error.message,
            data: error.response?.data || error.message,
            headers: error.response?.headers || {},
            requestInfo: {
              url,
              method: request.method,
              params,
              body: requestBody,
              headers,
            },
          });
          break;
        }
      }

      setResults(workflowResults);
      message.success('工作流执行完成');
    } catch (error) {
      message.error('工作流执行失败');
    } finally {
      setRunning(false);
    }
  };

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

  const getAddPanelStyle = () => {
    const container = canvasContainerRef.current;
    const anchorScreenX = (addPanelPos.x - view.offsetX) * view.scale;
    const anchorScreenY = (addPanelPos.y - view.offsetY) * view.scale;
    const margin = 12;
    const gap = 14;

    if (!container) {
      return {
        left: anchorScreenX + gap,
        top: anchorScreenY - ADD_PANEL_HEIGHT / 2,
      };
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const canPlaceRight = anchorScreenX + gap + ADD_PANEL_WIDTH <= containerWidth - margin;
    const left = canPlaceRight
      ? anchorScreenX + gap
      : Math.max(margin, anchorScreenX - gap - ADD_PANEL_WIDTH);
    const preferredTop = anchorScreenY - ADD_PANEL_HEIGHT / 2;
    const maxTop = Math.max(margin, containerHeight - ADD_PANEL_HEIGHT - margin);
    const top = Math.max(margin, Math.min(preferredTop, maxTop));

    return { left, top };
  };

  const focusNode = (id: string) => {
    const pos = nodePositionsRef.current[id];
    if (!pos) return;
    const container = canvasContainerRef.current;
    const viewWidth = container ? container.clientWidth / view.scale : canvasSize.width / view.scale;
    const viewHeight = container ? container.clientHeight / view.scale : canvasSize.height / view.scale;
    const nextOffsetX = clampOffset(pos.x + NODE_WIDTH / 2 - viewWidth / 2, viewWidth, canvasSize.width);
    const nextOffsetY = clampOffset(pos.y + NODE_HEIGHT / 2 - viewHeight / 2, viewHeight, canvasSize.height);
    setView((prev) => ({ ...prev, offsetX: nextOffsetX, offsetY: nextOffsetY }));
    setSelectedNodeId(id);
  };

  const handleRequestSelect = (requestKey: string) => {
    if (!selectedWorkflow) return;
    const request = availableRequests.find((r) => `${r.ownerUserId || 'self'}:${r.id}` === requestKey);
    if (request) {
      const newId = Date.now().toString();
      const nextRequest = {
        ...request,
        id: newId,
        inputValues: {},
        inputFields: request.inputFields || [],
        outputFields: request.outputFields || [],
        apiMappings: request.apiMappings || [],
      };
      const existingRequests = [...selectedWorkflow.requests];
      const currentRequests = [...existingRequests];
      const insertIndex = addPanelPos.afterRequestId
        ? currentRequests.findIndex((req) => req.id === addPanelPos.afterRequestId) + 1
        : currentRequests.length;
      const normalizedIndex = insertIndex < 0 ? currentRequests.length : insertIndex;
      currentRequests.splice(normalizedIndex, 0, nextRequest as any);

      const clampPos = (x: number, y: number, snapX: boolean = true, snapY: boolean = true) => ({
        x: Math.max(0, snapX ? snapToGrid(x, 20) : x),
        y: Math.max(0, snapY ? snapToGrid(y, 20) : y),
      });

      const prevReq = normalizedIndex > 0 ? currentRequests[normalizedIndex - 1] : null;
      const nextReq = normalizedIndex < existingRequests.length ? existingRequests[normalizedIndex] : null;
      const prevPos = prevReq ? nodePositionsRef.current[prevReq.id] : null;
      const nextPos = nextReq ? nodePositionsRef.current[nextReq.id] : null;

      const nextPositions: Record<string, { x: number; y: number }> = {
        ...nodePositions,
      };

      let targetX = addPanelPos.x - NODE_WIDTH / 2;
      let targetY = addPanelPos.y - NODE_HEIGHT / 2;

      if (!prevReq && existingRequests.length === 0) {
        // First real node: place below trigger with minimum gap.
        targetX = triggerPos.x + TRIGGER_WIDTH / 2 - NODE_WIDTH / 2;
        targetY = triggerPos.y + TRIGGER_HEIGHT + MIN_NODE_VERTICAL_GAP;
      } else if (prevPos && !nextPos) {
        // Append at tail: place directly under previous node with minimum gap.
        targetX = prevPos.x;
        targetY = prevPos.y + NODE_HEIGHT + MIN_NODE_VERTICAL_GAP;
      } else if (prevPos && nextPos) {
        // Insert in middle: place between previous and next with minimum spacing.
        const minY = prevPos.y + NODE_HEIGHT + MIN_NODE_VERTICAL_GAP;
        const maxY = nextPos.y - NODE_HEIGHT - MIN_NODE_VERTICAL_GAP;
        targetX = (prevPos.x + nextPos.x) / 2;

        if (minY <= maxY) {
          targetY = (minY + maxY) / 2;
        } else {
          const requiredShift = snapToGrid(minY - maxY, 20);
          for (let i = normalizedIndex; i < existingRequests.length; i += 1) {
            const reqToShift = existingRequests[i];
            const original = nextPositions[reqToShift.id] || nodePositionsRef.current[reqToShift.id];
            if (!original) continue;
            nextPositions[reqToShift.id] = clampPos(original.x, original.y + requiredShift);
          }
          targetY = minY;
        }
      };

      if (!prevReq && existingRequests.length === 0) {
        // Keep first node center exactly aligned with trigger center so the connector is vertical.
        nextPositions[newId] = clampPos(targetX, targetY, false, true);
      } else {
        nextPositions[newId] = clampPos(targetX, targetY);
      }
      setNodePositions(nextPositions);
      updateWorkflow(selectedWorkflow.id, { requests: currentRequests, nodePositions: nextPositions });
      setSelectedNodeId(newId);
      message.success('请求已添加');
    }
    setAddPanelOpen(false);
    setAddSearch('');
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedWorkflow) return;
    const { x, y } = getCanvasPoint(event);
    dragRef.current.moved = false;
    dragRef.current.mode = null;

    const startPan = () => {
      dragRef.current.mode = 'pan';
      dragRef.current.startX = event.clientX;
      dragRef.current.startY = event.clientY;
      dragRef.current.originOffsetX = view.offsetX;
      dragRef.current.originOffsetY = view.offsetY;
    };

    if (spaceDownRef.current || event.button === 1) {
      startPan();
      return;
    }

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
          const newId = useWorkflowStore.getState().duplicateWorkflowRequest(selectedWorkflow.id, selectedNodeId);
          if (newId) {
            setSelectedNodeId(newId);
            message.success('节点已复制');
          }
          return;
        }
        if (toolbarAction === 'delete') {
          removeRequestFromWorkflow(selectedWorkflow.id, selectedNodeId);
          setSelectedNodeId(null);
          message.success('节点已删除');
          return;
        }
      }
    }

    const node = hitTestNode(x, y);
    if (!node) {
      // Left-drag blank area to pan canvas directly.
      startPan();
      return;
    }
    const pos = nodePositions[node.id];
    if (!pos) return;
    dragRef.current.id = node.id;
    dragRef.current.startX = x;
    dragRef.current.startY = y;
    dragRef.current.offsetX = x - pos.x;
    dragRef.current.offsetY = y - pos.y;
    dragRef.current.mode = 'drag';
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
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

    if (dragRef.current.mode === 'pan') {
      const dx = (event.clientX - dragRef.current.startX) / view.scale;
      const dy = (event.clientY - dragRef.current.startY) / view.scale;
      const container = canvasContainerRef.current;
      const viewWidth = container ? container.clientWidth / view.scale : canvasSize.width / view.scale;
      const viewHeight = container ? container.clientHeight / view.scale : canvasSize.height / view.scale;
      setView((prev) => ({
        ...prev,
        offsetX: clampOffset(dragRef.current.originOffsetX - dx, viewWidth, canvasSize.width),
        offsetY: clampOffset(dragRef.current.originOffsetY - dy, viewHeight, canvasSize.height),
      }));
      return;
    }

    if (dragRef.current.id) {
      const id = dragRef.current.id;
      const newX = x - dragRef.current.offsetX;
      const newY = y - dragRef.current.offsetY;
      const clampedX = Math.max(0, newX);
      const clampedY = Math.max(0, newY);
      if (Math.abs(x - dragRef.current.startX) > 4 || Math.abs(y - dragRef.current.startY) > 4) {
        dragRef.current.moved = true;
      }
      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: clampedX, y: clampedY },
      }));
    }
  };

  const handleCanvasMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedWorkflow) return;
    const { x, y } = getCanvasPoint(event);

    // Handle connection creation
    if (connectingFrom) {
      const connectorPoint = hitTestConnectorPoint(x, y);
      if (connectorPoint && connectorPoint.pointType === 'input') {
        // Create edge
        addEdge(selectedWorkflow.id, connectingFrom.nodeId, connectorPoint.nodeId);
        message.success('连接已创建');
      }
      setConnectingFrom(null);
      setMousePos(null);
      return;
    }

    const dragId = dragRef.current.id;
    const moved = dragRef.current.moved;

    if (dragRef.current.mode === 'pan') {
      dragRef.current.mode = null;
      return;
    }

    if (dragId) {
      if (!moved) {
        setSelectedNodeId(dragId);
      } else {
        const current = nodePositionsRef.current[dragId];
        if (current) {
          updateWorkflow(selectedWorkflow.id, { nodePositions: { ...nodePositionsRef.current } });
        }
      }
    }
    dragRef.current.id = null;
    dragRef.current.mode = null;
  };

  return (
    <>
      <Sider width={250} theme="light" collapsed={workflowSiderCollapsed} collapsedWidth={0} className="border-r border-gray-200 relative" style={{ overflow: 'visible' }}>
        {!workflowSiderCollapsed && (
          <>
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 margin-0">工作流</h2>
              <div className="flex items-center gap-2">
                <Tag color={statusColor} className="m-0">
                  {statusText}
                </Tag>
                <Button
                  type="text"
                  size="small"
                  icon={<MenuFoldOutlined />}
                  onClick={() => setWorkflowSiderCollapsed(true)}
                  className="text-gray-400 hover:text-gray-600"
                />
              </div>
            </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-t border-gray-200">
              <div
                onClick={() => {
                  if (isLoadingState) {
                    return;
                  }
                  addWorkflow();
                }}
                className={`flex items-center gap-2 px-4 py-3 transition-colors ${
                  isLoadingState
                    ? 'cursor-not-allowed text-gray-400 bg-gray-50'
                    : 'cursor-pointer hover:bg-gray-50 text-gray-600 hover:text-gray-800'
                }`}
              >
                <PlusOutlined />
                <span>添加工作流</span>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {isLoadingState ? (
                <div className="px-3 py-3 space-y-2 animate-pulse">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="h-10 rounded-md bg-gray-200/80" />
                  ))}
                </div>
              ) : workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflow(wf.id)}
                  className={`px-4 py-3 cursor-pointer hover:bg-blue-50 ${
                    selectedWorkflowId === wf.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {editingId === wf.id ? (
                        <Input
                          size="small"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onPressEnter={() => handleRename(wf.id, editingName)}
                          onBlur={() => handleRename(wf.id, editingName)}
                          autoFocus
                          className="flex-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="truncate font-medium">{wf.name}</span>
                      )}
                    </div>
                    <div className="flex items-center flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                      <EditOutlined
                        className="text-gray-400 hover:text-blue-500"
                        onClick={(e) => startEditing(e, wf)}
                      />
                      <Popconfirm
                        title="删除工作流"
                        description="确定要删除这个工作流吗？"
                        onConfirm={() => deleteWorkflow(wf.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <DeleteOutlined className="ml-2 text-gray-400 hover:text-red-500" />
                      </Popconfirm>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {wf.requests.length} 个请求
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
        )}
      </Sider>

      <Content className="flex-1 bg-[#f5f5f5] overflow-hidden !p-0 !relative">
        {workflowSiderCollapsed && (
          <Button
            type="primary"
            shape="circle"
            size="middle"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setWorkflowSiderCollapsed(false)}
            className="!absolute !left-2 !top-1/2 !-translate-y-1/2 z-30 shadow-md border-2 border-white"
          />
        )}
        <div className="h-full flex flex-col">
          {isLoadingState ? (
            <div className="h-full overflow-auto p-4">
              <div className="space-y-4 animate-pulse">
                <div className="h-12 rounded-lg bg-gray-200/80" />
                <div className="h-[520px] rounded-lg bg-white border border-gray-200" />
              </div>
            </div>
          ) : selectedWorkflow ? (
            <>
              <div className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <div className="text-base font-semibold text-gray-800 truncate">{selectedWorkflow.name}</div>
                    <div className="text-xs text-gray-500">
                      最近修改 {lastUpdated ? new Date(lastUpdated).toLocaleString() : '--'}
                    </div>
                  </div>
                </div>
                <Space>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleRunWorkflow}
                    loading={running}
                    size="middle"
                  >
                    运行工作流
                  </Button>
                </Space>
              </div>

              <div className="flex-1 min-h-0 relative">
                <div ref={canvasContainerRef} className="absolute inset-0 overflow-hidden">
                  <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm p-2 w-[260px]">
                    <Input
                      size="small"
                      placeholder="搜索节点并定位"
                      value={nodeSearch}
                      onChange={(e) => setNodeSearch(e.target.value)}
                    />
                    {nodeSearch.trim() && selectedWorkflow && (
                      <div className="mt-2 max-h-[200px] overflow-auto border border-gray-100 rounded">
                        {selectedWorkflow.requests
                          .filter((req) => (req.name || '').toLowerCase().includes(nodeSearch.toLowerCase()))
                          .map((req) => (
                            <div
                              key={req.id}
                              className="px-2 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                              onClick={() => focusNode(req.id)}
                            >
                              <Tag color={HTTP_METHOD_COLORS[req.method] || 'default'} className="m-0">
                                {req.method}
                              </Tag>
                              <span className="truncate">{req.name}</span>
                            </div>
                          ))}
                        {selectedWorkflow.requests.filter((req) => (req.name || '').toLowerCase().includes(nodeSearch.toLowerCase())).length === 0 && (
                          <div className="px-2 py-2 text-sm text-gray-500">无匹配节点</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm p-2 flex items-center gap-2">
                    <Button
                      size="small"
                      onClick={() => {
                        const nextScale = Math.min(2, view.scale * 1.1);
                        setView((prev) => {
                          const container = canvasContainerRef.current;
                          const viewWidth = container ? container.clientWidth / nextScale : canvasSize.width / nextScale;
                          const viewHeight = container ? container.clientHeight / nextScale : canvasSize.height / nextScale;
                          return {
                            scale: nextScale,
                            offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
                            offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
                          };
                        });
                      }}
                    >
                      +
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        const nextScale = Math.max(0.5, view.scale * 0.9);
                        setView((prev) => {
                          const container = canvasContainerRef.current;
                          const viewWidth = container ? container.clientWidth / nextScale : canvasSize.width / nextScale;
                          const viewHeight = container ? container.clientHeight / nextScale : canvasSize.height / nextScale;
                          return {
                            scale: nextScale,
                            offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
                            offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
                          };
                        });
                      }}
                    >
                      -
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0 })}
                    >
                      重置
                    </Button>
                    <span className="text-xs text-gray-500 w-12 text-right">{Math.round(view.scale * 100)}%</span>
                  </div>
                    <canvas
                      ref={canvasRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      className="block"
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      onWheel={(event) => {
                        event.preventDefault();
                        const useZoom = event.metaKey || event.altKey;
                        if (useZoom) {
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const sx = event.clientX - rect.left;
                          const sy = event.clientY - rect.top;
                          const worldX = sx / view.scale + view.offsetX;
                          const worldY = sy / view.scale + view.offsetY;
                          const nextScale = Math.min(2, Math.max(0.5, view.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
                          const nextOffsetX = worldX - sx / nextScale;
                          const nextOffsetY = worldY - sy / nextScale;
                          const container = canvasContainerRef.current;
                          const viewWidth = container ? container.clientWidth / nextScale : canvasSize.width / nextScale;
                          const viewHeight = container ? container.clientHeight / nextScale : canvasSize.height / nextScale;
                          setView({
                            scale: nextScale,
                            offsetX: clampOffset(nextOffsetX, viewWidth, canvasSize.width),
                            offsetY: clampOffset(nextOffsetY, viewHeight, canvasSize.height),
                          });
                          return;
                        }
                        const container = canvasContainerRef.current;
                        const viewWidth = container ? container.clientWidth / view.scale : canvasSize.width / view.scale;
                        const viewHeight = container ? container.clientHeight / view.scale : canvasSize.height / view.scale;
                        const nextOffsetX = view.offsetX + event.deltaX / view.scale;
                        const nextOffsetY = view.offsetY + event.deltaY / view.scale;
                        setView({
                          ...view,
                          offsetX: clampOffset(nextOffsetX, viewWidth, canvasSize.width),
                          offsetY: clampOffset(nextOffsetY, viewHeight, canvasSize.height),
                        });
                      }}
                      style={{ touchAction: 'none', cursor: spaceDown ? 'grab' : 'default' }}
                    />
                </div>

                {results.length > 0 && (
                  <div className="absolute top-0 right-0 bottom-0 w-[340px] bg-white border-l border-gray-200 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
                      执行结果
                    </div>
                    <div className="flex-1 overflow-auto">
                      <List
                        dataSource={results}
                        renderItem={(result) => (
                          <List.Item className="border-b border-gray-100 last:border-0">
                            <div
                              className="w-full cursor-pointer hover:bg-gray-50 rounded p-2 -m-2"
                              onClick={() => {
                                setSelectedResult(result);
                                setDetailDrawerOpen(true);
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{result.name}</span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-medium ${
                                      result.status === 'success'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-500'
                                    }`}
                                  >
                                    {result.statusCode}
                                  </span>
                                  {result.status === 'success' && (
                                    <Tooltip title="从响应结果导入出参字段">
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<ImportOutlined />}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (result.data && selectedWorkflowId) {
                                            const workflow = workflows.find((wf) => wf.id === selectedWorkflowId);
                                            if (workflow) {
                                              const request = workflow.requests.find((req) => req.id === result.requestId);
                                              if (request) {
                                                useWorkflowStore.getState().addOutputFieldsFromResponse(selectedWorkflowId, request.id, result.data);
                                                message.success(`已为 ${request.name} 导入 ${Object.keys(result.data).length} 个出参字段`);
                                              }
                                            }
                                          }
                                        }}
                                      >
                                        导入出参
                                      </Button>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-gray-500">
                                状态: {result.status === 'success' ? '成功' : '失败'}
                                {result.time > 0 && ` · 耗时: ${result.time}ms`}
                              </div>
                              {result.error && (
                                <div className="text-sm text-red-500 mt-1">
                                  错误: {result.error}
                                </div>
                              )}
                            </div>
                          </List.Item>
                        )}
                      />
                    </div>
                  </div>
                )}

                {selectedNodeId && selectedWorkflow && (
                  <div
                    className="absolute top-0 w-[360px] max-h-full bg-white border-l border-gray-200 overflow-hidden flex flex-col"
                    style={{ right: results.length > 0 ? 340 : 0 }}
                  >
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="font-medium text-gray-800">请求详情</div>
                      <Button size="small" onClick={() => setSelectedNodeId(null)}>关闭</Button>
                    </div>
                    <div className="p-4 space-y-3 overflow-auto">
                      {(() => {
                        const node = selectedWorkflow.requests.find((req) => req.id === selectedNodeId);
                        if (!node) return <div className="text-sm text-gray-500">未找到请求</div>;
                        const index = selectedWorkflow.requests.findIndex((req) => req.id === node.id);
                        const previousOutputs = selectedWorkflow.requests
                          .slice(0, index)
                          .map((prevRequest) => ({
                            requestId: prevRequest.id,
                            requestName: prevRequest.name,
                            outputs: prevRequest.outputFields || [],
                          }));
                        return (
                          <>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">请求名称</div>
                              <div className="text-sm font-medium text-gray-800">{node.name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">请求方法</div>
                              <Tag color={HTTP_METHOD_COLORS[node.method] || 'default'}>{node.method}</Tag>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">请求地址</div>
                              <div className="text-sm text-gray-800 break-all">{node.url || '--'}</div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500">请求参数</div>
                              {node.inputFields && node.inputFields.length > 0 ? (
                                node.inputFields.map((field: any, fieldIndex: number) => {
                                  const dropdownItems = previousOutputs.flatMap((output) =>
                                    output.outputs.map((out: any) => ({
                                      key: `${output.requestId}.${out.name}`,
                                      label: `${output.requestName} / ${out.name}`,
                                      value: `${output.requestId}.${out.name}`,
                                    }))
                                  );
                                  return (
                                    <div key={`${field.name}-${fieldIndex}`} className="flex items-center gap-2">
                                      <div className="w-24 text-xs text-gray-600 truncate">
                                        {field.name || `未命名${fieldIndex + 1}`}
                                      </div>
                                      <Input
                                        size="small"
                                        placeholder="请输入参数值"
                                        value={node.inputValues?.[field.name] || ''}
                                        onChange={(e) => updateWorkflowRequestInputValue(selectedWorkflow.id, node.id, field.name, e.target.value)}
                                      />
                                      <Dropdown
                                        menu={{
                                          items: dropdownItems,
                                          onClick: ({ key }) => updateWorkflowRequestInputValue(selectedWorkflow.id, node.id, field.name, `{{${key}}}`),
                                        }}
                                        trigger={['click']}
                                        disabled={dropdownItems.length === 0}
                                      >
                                        <Button size="small" disabled={dropdownItems.length === 0}>出参</Button>
                                      </Dropdown>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-sm text-gray-500">未配置入参</div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {addPanelOpen && (
                  <div
                    ref={addPanelRef}
                    className="absolute bg-white border border-gray-200 rounded-lg shadow-lg w-[280px] p-3 z-20"
                    style={getAddPanelStyle()}
                  >
                    <Input
                      size="small"
                      placeholder="搜索请求"
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      className="mb-2"
                    />
                    <div className="max-h-[260px] overflow-auto space-y-1">
                      {filteredAvailableRequests
                        .map((req) => (
                          <div
                            key={`${req.ownerUserId || 'self'}:${req.id}`}
                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleRequestSelect(`${req.ownerUserId || 'self'}:${req.id}`)}
                          >
                            <Tag color={HTTP_METHOD_COLORS[req.method] || 'default'} className="m-0">
                              {req.method}
                            </Tag>
                            <span className="text-sm text-gray-800 truncate">{req.name}</span>
                            {req.isPublic && req.ownerUserId ? (
                              <Tag className="m-0" color="gold">
                                公开
                              </Tag>
                            ) : null}
                            {req.ownerUsername ? (
                              <span className="ml-auto text-xs text-gray-400 truncate max-w-[72px]">{req.ownerUsername}</span>
                            ) : null}
                          </div>
                        ))}
                      {filteredAvailableRequests.length === 0 && (
                        <div className="text-sm text-gray-500 px-2 py-3">无匹配请求</div>
                      )}
                    </div>
                  </div>
                )}

              </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Empty description="请创建或选择一个工作流" />
          </div>
        )}
        </div>

        <Drawer
          open={detailDrawerOpen}
          onClose={() => setDetailDrawerOpen(false)}
          placement="right"
          width={720}
          title={null}
        >
          {selectedResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-gray-800 truncate">{selectedResult.name}</div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500 whitespace-nowrap">
                    状态码 {selectedResult.statusCode} · 耗时 {selectedResult.time ? `${selectedResult.time}ms` : '--'}
                  </div>
                  {(() => {
                    const currentIndex = results.findIndex((r) => r.requestId === selectedResult.requestId);
                    const hasPrev = currentIndex > 0;
                    const hasNext = currentIndex >= 0 && currentIndex < results.length - 1;
                    return (
                      <div className="flex items-center gap-2">
                        <Button
                          size="small"
                          icon={<LeftOutlined />}
                          disabled={!hasPrev}
                          onClick={() => {
                            if (hasPrev) {
                              setSelectedResult(results[currentIndex - 1]);
                            }
                          }}
                        >
                          上一条
                        </Button>
                        <Button
                          size="small"
                          icon={<RightOutlined />}
                          disabled={!hasNext}
                          onClick={() => {
                            if (hasNext) {
                              setSelectedResult(results[currentIndex + 1]);
                            }
                          }}
                        >
                          下一条
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">请求信息</div>
                <pre className="bg-gray-100 rounded p-3 text-xs whitespace-pre-wrap break-all">
                  {selectedResult.requestInfo
                    ? buildCurl(
                        selectedResult.requestInfo.url,
                        selectedResult.requestInfo.method,
                        selectedResult.requestInfo.params || {},
                        selectedResult.requestInfo.body
                      )
                    : '请求信息不可用'}
                </pre>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">响应结果</div>
                <div className="border border-gray-200 rounded bg-white">
                  <Editor
                    height="320px"
                    defaultLanguage="json"
                    value={formatResponseData(selectedResult.data)}
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      readOnly: true,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">响应头</div>
                <div className="border border-gray-200 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2 w-1/2">Header</th>
                        <th className="text-left px-3 py-2 w-1/2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.headers && Object.keys(selectedResult.headers).length > 0 ? (
                        Object.entries(selectedResult.headers).map(([key, value]) => (
                          <tr key={key} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-700">{key}</td>
                            <td className="px-3 py-2 text-gray-600 break-all">{String(value)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-3 py-3 text-gray-500" colSpan={2}>无响应头</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Drawer>
      </Content>
    </>
  );
};
