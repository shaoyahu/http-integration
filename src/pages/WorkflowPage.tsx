import React, { useCallback, useState } from 'react';
import { UndoOutlined, RedoOutlined } from '@ant-design/icons';
import { Layout, Button, message, Empty, Drawer, Input, Tag, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  MenuUnfoldOutlined,
  LeftOutlined,
  RightOutlined,
  DeleteOutlined,
  NodeIndexOutlined,
  SearchOutlined,
  FileSearchOutlined,
  ApiOutlined,
  CloseOutlined,
  BarsOutlined,
  PlusOutlined,
  DeploymentUnitOutlined,
  RetweetOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useWorkflowStore } from '../store/workflowStore';
import type { Workflow, WorkflowRequest } from '../store/workflowStore';
import Editor from '@monaco-editor/react';
import { applyPathMapping, parseBodyValue, setNestedValue } from '../utils/requestPayload';
import {
  deleteWorkflowItem,
  fetchWorkflowAvailableRequests,
  fetchWorkflowRunLogs,
  fetchWorkflowState,
  healthCheck,
  proxyRequest,
  saveWorkflowItem,
  saveWorkflowRunLog,
  saveWorkflowSelection,
  saveWorkflowState,
  type WorkflowAvailableRequest,
  type WorkflowRunLogPayload,
  type WorkflowStatePayload,
} from '../api/http';
import { formatResponseData } from '../utils/response';
import type { WorkflowExplanation, WorkflowRunLog, WorkflowRunNodeLog } from '../types/workflow';
import {
  analyzeWorkflow,
  autoLayoutWorkflowNodes,
  buildWorkflowExplanation,
  getDefaultRunLogNodeId,
  getNestedValue,
  getViewportForBounds,
  getWorkflowLayoutBounds,
  maskSensitiveHeaders,
  parseWorkflowReference,
  sortRunLogsByStartedAt,
} from '../utils/workflowEditor';
import {
  WorkflowSidebar,
  WorkflowToolbar,
  WorkflowNodeDetail,
  WorkflowResultsPanel,
  WorkflowAddPanel,
  MIN_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  NODE_SIZE,
  NODE_WIDTH,
  NODE_HEIGHT,
  TRIGGER_WIDTH,
  TRIGGER_HEIGHT,
  MIN_NODE_VERTICAL_GAP,
  clampOffset,
  snapToGrid,
  MIN_NODE_HORIZONTAL_GAP,
} from '../components/workflow';
import { renderCanvasFrame } from '../components/workflow/WorkflowCanvasRenderer';

const { Content } = Layout;
const WORKFLOW_VIEW_TOP_INSET = 104;

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const details = error.response?.data?.details || error.response?.data?.error || error.message;
    return status ? `HTTP ${status}: ${details}` : details;
  }
  return error instanceof Error ? error.message : String(error);
};

const getSaveStatusText = (
  isLoading: boolean,
  isSaving: boolean,
  isDirty: boolean,
  saveError: string | null
) => {
  if (isLoading) {
    return '正在加载工作流...';
  }
  if (saveError) {
    return '保存失败，请重试';
  }
  if (isSaving) {
    return '保存中...';
  }
  if (isDirty) {
    return '未保存';
  }
  return '已保存';
};

const getSaveStatusColor = (
  isLoading: boolean,
  isSaving: boolean,
  isDirty: boolean,
  saveError: string | null
): 'default' | 'processing' | 'success' | 'error' | 'warning' => {
  if (saveError) {
    return 'error';
  }
  if (isLoading || isSaving) {
    return 'processing';
  }
  if (isDirty) {
    return 'warning';
  }
  return 'success';
};

const getDurationText = (durationMs: number) => (durationMs > 0 ? `${durationMs}ms` : '--');

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

type WorkflowPersistRequest =
  | { type: 'full'; snapshot: WorkflowStatePayload }
  | { type: 'workflow'; snapshot: WorkflowStatePayload; workflow: Workflow }
  | { type: 'delete'; snapshot: WorkflowStatePayload; workflowId: string }
  | { type: 'selection'; snapshot: WorkflowStatePayload };

const buildWorkflowSnapshot = (state: { workflows: Workflow[]; selectedWorkflowId: string | null }): WorkflowStatePayload => ({
  workflows: state.workflows,
  selectedWorkflowId: state.selectedWorkflowId,
});

const serializeWorkflowSnapshot = (snapshot: WorkflowStatePayload) => JSON.stringify(snapshot);

const buildWorkflowPersistRequest = (
  previous: WorkflowStatePayload,
  next: WorkflowStatePayload
): WorkflowPersistRequest | null => {
  if (serializeWorkflowSnapshot(previous) === serializeWorkflowSnapshot(next)) {
    return null;
  }

  const prevIds = previous.workflows.map((workflow) => workflow.id);
  const nextIds = next.workflows.map((workflow) => workflow.id);
  const addedIds = nextIds.filter((id) => !prevIds.includes(id));
  const removedIds = prevIds.filter((id) => !nextIds.includes(id));
  const prevWorkflowMap = new Map(previous.workflows.map((workflow) => [workflow.id, workflow]));
  const nextWorkflowMap = new Map(next.workflows.map((workflow) => [workflow.id, workflow]));
  const changedCommonIds = nextIds.filter((id) => prevWorkflowMap.has(id)).filter((id) => {
    const previousWorkflow = prevWorkflowMap.get(id);
    const nextWorkflow = nextWorkflowMap.get(id);
    return JSON.stringify(previousWorkflow) !== JSON.stringify(nextWorkflow);
  });

  if (addedIds.length === 0 && removedIds.length === 0) {
    if (changedCommonIds.length === 0 && previous.selectedWorkflowId !== next.selectedWorkflowId) {
      return { type: 'selection', snapshot: next };
    }
    if (changedCommonIds.length === 1) {
      const workflow = nextWorkflowMap.get(changedCommonIds[0]);
      if (workflow) {
        return { type: 'workflow', snapshot: next, workflow };
      }
    }
    return { type: 'full', snapshot: next };
  }

  if (addedIds.length === 1 && removedIds.length === 0 && changedCommonIds.length === 0) {
    const workflow = nextWorkflowMap.get(addedIds[0]);
    if (workflow) {
      return { type: 'workflow', snapshot: next, workflow };
    }
  }

  if (removedIds.length === 1 && addedIds.length === 0 && changedCommonIds.length === 0) {
    return { type: 'delete', snapshot: next, workflowId: removedIds[0] };
  }

  return { type: 'full', snapshot: next };
};

const MIN_NODE_GAP = 20;

const rectsOverlap = (
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  gap: number, horizontalGap: number
): boolean => !(ax + aw + gap <= bx || bx + bw + gap <= ax || ay + ah + gap <= by || by + bh + gap <= ay);

const pushOutOfCollision = (
  draggedId: string,
  x: number, y: number,
  others: Record<string, { x: number; y: number }>,
  size: number, gap: number,
  canvasWidth?: number, canvasHeight?: number
): { x: number; y: number } => {
  let nx = x, ny = y;
  let iterations = 0;
  const maxIterations = 20;
  const hGap = gap * 3;

  do {
    let pushed = false;

    for (const [id, p] of Object.entries(others)) {
      if (id === draggedId) continue;
      if (!rectsOverlap(nx, ny, size, size, p.x, p.y, size, size, gap, hGap)) continue;

      const leftEdge = p.x;
      const rightEdge = p.x + size;
      const topEdge = p.y;
      const bottomEdge = p.y + size;

      const myRight = nx + size;
      const myBottom = ny + size;

      let moveX = 0, moveY = 0;

      if (myRight + hGap <= leftEdge) {
        moveX = leftEdge - myRight - hGap;
      } else if (nx >= rightEdge + hGap) {
        moveX = -(nx - rightEdge - hGap);
      } else if (myBottom + gap <= topEdge) {
        moveY = topEdge - myBottom - gap;
      } else if (ny >= bottomEdge + gap) {
        moveY = -(ny - bottomEdge - gap);
      } else {
        const overlapLeft = myRight + hGap - leftEdge;
        const overlapRight = rightEdge + hGap - nx;
        const overlapTop = myBottom + gap - topEdge;
        const overlapBottom = bottomEdge + gap - ny;
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          moveX = minOverlap === overlapLeft ? -overlapLeft : overlapRight;
        } else {
          moveY = minOverlap === overlapTop ? -overlapTop : overlapBottom;
        }
      }

      if (moveX !== 0 || moveY !== 0) {
        nx += moveX;
        ny += moveY;
        pushed = true;
      }
    }

    iterations++;
    if (!pushed) break;
  } while (iterations < maxIterations);

  const boundedX = Math.min(nx, (canvasWidth || Infinity) - size);
  const boundedY = Math.min(ny, (canvasHeight || Infinity) - size);

  return { x: Math.max(0, boundedX), y: Math.max(0, boundedY) };
};

export const WorkflowPage: React.FC = () => {
  const {
    workflows,
    selectedWorkflowId,
    setWorkflowState,
    addWorkflow,
    updateWorkflow,
    deleteWorkflow,
    setSelectedWorkflow,
    removeRequestFromWorkflow,
    removeEdge,
    updateWorkflowRequestInputValue,
    addEdge,
  } = useWorkflowStore();

  const [availableRequests, setAvailableRequests] = useState<WorkflowAvailableRequest[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<WorkflowRunNodeLog[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; pointType: 'output' } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // Separate ref for canvas-drawing mouse position to avoid triggering canvas redraws
  const canvasMousePosRef = React.useRef<{ x: number; y: number } | null>(null);
  const [selectedResult, setSelectedResult] = useState<WorkflowRunNodeLog | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const nodePositionsRef = React.useRef<Record<string, { x: number; y: number }>>({});
  // Undo/redo state stacks
  const [undoStack, setUndoStack] = useState<WorkflowStatePayload[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowStatePayload[]>([]);

  const currentSnapshot = React.useMemo(
    () => buildWorkflowSnapshot({ workflows, selectedWorkflowId }),
    [workflows, selectedWorkflowId]
  );
  const currentSerializedSnapshot = React.useMemo(
    () => serializeWorkflowSnapshot(currentSnapshot),
    [currentSnapshot]
  );

  const saveToUndo = useCallback((snapshot: WorkflowStatePayload) => {
    setUndoStack((prev) => [...prev.slice(-20), snapshot]); // Keep last 20 snapshots
    setRedoStack([]);
  }, []);
  
  // Apply a snapshot to the store/state and update last saved refs
  const applySnapshot = useCallback((snapshot: WorkflowStatePayload) => {
    setWorkflowState(snapshot.workflows, snapshot.selectedWorkflowId);
    lastSavedSnapshotRef.current = snapshot;
    lastSavedSerializedRef.current = serializeWorkflowSnapshot(snapshot);
  }, [setWorkflowState]);
  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, currentSnapshot]);
    applySnapshot(prev as unknown as WorkflowStatePayload);
  }, [undoStack, currentSnapshot, applySnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((u) => [...u, currentSnapshot]);
    applySnapshot(next as unknown as WorkflowStatePayload);
  }, [redoStack, currentSnapshot, applySnapshot]);
  const [view, setView] = useState<{ scale: number; offsetX: number; offsetY: number }>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });
  const canvasSizeRef = React.useRef(canvasSize);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addPanelPos, setAddPanelPos] = useState<{ x: number; y: number; afterRequestId: string | null }>({ x: 0, y: 0, afterRequestId: null });
  const [spaceDown, setSpaceDown] = useState(false);
  const [workflowSiderCollapsed, setWorkflowSiderCollapsed] = useState(false);
  const [activeAssistTab, setActiveAssistTab] = useState<'requests' | 'search' | 'logs' | 'explain'>('requests');
  const [assistPanelOpen, setAssistPanelOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [runLogs, setRunLogs] = useState<WorkflowRunLog[]>([]);
  const [selectedRunLog, setSelectedRunLog] = useState<WorkflowRunLog | null>(null);
  const [selectedRunLogNodeId, setSelectedRunLogNodeId] = useState<string | null>(null);
  const [runLogDrawerOpen, setRunLogDrawerOpen] = useState(false);
  const [draggingRequestKey, setDraggingRequestKey] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ x: number; y: number } | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isSavingState, setIsSavingState] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Auto-save indicator: shows a subtle Saving... toast in the header during background autosaves
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isDatabaseConnected, setIsDatabaseConnected] = useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null);
  const addPanelRef = React.useRef<HTMLDivElement | null>(null);
  const shouldResetViewOnWorkflowChangeRef = React.useRef(false);
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
  const lastSavedSerializedRef = React.useRef('');
  const lastSavedSnapshotRef = React.useRef<WorkflowStatePayload>({ workflows: [], selectedWorkflowId: null });
  const saveTimerRef = React.useRef<number | null>(null);
  const savePromiseRef = React.useRef<Promise<void>>(Promise.resolve());

  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId);
  const lastUpdated = selectedWorkflow?.updatedAt || selectedWorkflow?.createdAt;
  const triggerPos = React.useMemo(
    () => ({ x: canvasSize.width / 2 - TRIGGER_WIDTH / 2, y: WORKFLOW_VIEW_TOP_INSET + 20 }),
    [canvasSize, WORKFLOW_VIEW_TOP_INSET]
  );
  const isDirty = initializedRef.current && currentSerializedSnapshot !== lastSavedSerializedRef.current;
  const saveStatusText = getSaveStatusText(isLoadingState, isSavingState, isDirty, saveError);
  const saveStatusColor = getSaveStatusColor(isLoadingState, isSavingState, isDirty, saveError);
  const databaseStatusText = isDatabaseConnected ? '数据库在线' : '数据库离线';
  const databaseStatusColor = isDatabaseConnected ? 'success' : 'error';
  const workflowExplanation = React.useMemo<WorkflowExplanation>(
    () => (selectedWorkflow ? buildWorkflowExplanation(selectedWorkflow) : {
      summary: ['请选择一个工作流。'],
      steps: [],
      disconnectedRequestIds: [],
      warnings: [],
    }),
    [selectedWorkflow]
  );
  const selectedRunLogNode = selectedRunLog?.nodes.find((node) => node.requestId === selectedRunLogNodeId) || null;
  const filteredWorkflowRequests = React.useMemo(() => {
    if (!selectedWorkflow) {
      return [];
    }
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return selectedWorkflow.requests;
    }
    return selectedWorkflow.requests.filter((request) => request.name.toLowerCase().includes(keyword));
  }, [searchTerm, selectedWorkflow]);

  const persistWorkflowState = useCallback(
    (request: WorkflowPersistRequest) => {
      const serialized = serializeWorkflowSnapshot(request.snapshot);
      if (serialized === lastSavedSerializedRef.current) {
        return Promise.resolve();
      }
      const persistTask = async () => {
        setIsSavingState(true);
        setSaveError(null);

        try {
          if (request.type === 'workflow') {
            await saveWorkflowItem({
              workflow: request.workflow,
              selectedWorkflowId: request.snapshot.selectedWorkflowId,
            });
          } else if (request.type === 'delete') {
            await deleteWorkflowItem(request.workflowId, request.snapshot.selectedWorkflowId);
          } else if (request.type === 'selection') {
            await saveWorkflowSelection(request.snapshot.selectedWorkflowId);
          } else {
            await saveWorkflowState(request.snapshot);
          }

          lastSavedSerializedRef.current = serialized;
          lastSavedSnapshotRef.current = request.snapshot;
        } catch (error) {
          const details = getErrorMessage(error);
          setSaveError(details);
          throw new Error(details);
        } finally {
          setIsSavingState(false);
        }
      };

      savePromiseRef.current = savePromiseRef.current
        .catch(() => undefined)
        .then(persistTask);

      return savePromiseRef.current;
    },
    []
  );

  React.useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

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
        const snapshot = buildWorkflowSnapshot(useWorkflowStore.getState());
        lastSavedSnapshotRef.current = snapshot;
        lastSavedSerializedRef.current = serializeWorkflowSnapshot(snapshot);
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
    // Existing general autosave for any store changes (kept as fallback). We'll also add a targeted autosave for
    // nodePositions and selectedWorkflow with a 2s debounce and a dedicated visual indicator.
    const unsubscribe = useWorkflowStore.subscribe((state) => {
      if (!initializedRef.current) {
        return;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      // Keep existing behavior but keep debounce modest to avoid too many saves
      saveTimerRef.current = window.setTimeout(async () => {
        const snapshot = buildWorkflowSnapshot(state);
        const request = buildWorkflowPersistRequest(lastSavedSnapshotRef.current, snapshot);
        if (!request) {
          return;
        }
        try {
          await persistWorkflowState(request);
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

  // Targeted debounced autosave for nodePositions and selectedWorkflow with 2s delay
  React.useEffect(() => {
    if (!selectedWorkflow) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      // Build snapshot from current store state
      const snapshot = buildWorkflowSnapshot(useWorkflowStore.getState());
      const request = buildWorkflowPersistRequest(lastSavedSnapshotRef.current, snapshot);
      if (!request) return;
      setIsAutoSaving(true);
      try {
        await persistWorkflowState(request);
      } catch (error) {
        const details = getErrorMessage(error);
        console.error('Auto-save failed:', details);
      } finally {
        setIsAutoSaving(false);
      }
    }, 2000);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [nodePositions, selectedWorkflow]);

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
    if (!selectedWorkflowId) {
      setRunLogs([]);
      setSelectedRunLog(null);
      setSelectedRunLogNodeId(null);
      return;
    }

    let cancelled = false;
    const loadRunLogs = async () => {
      try {
        const logs = await fetchWorkflowRunLogs(selectedWorkflowId);
        if (cancelled) {
          return;
        }
        setRunLogs(sortRunLogsByStartedAt(logs));
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load workflow run logs:', getErrorMessage(error));
      }
    };

    loadRunLogs();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  // Update canvas size based on container
  React.useEffect(() => {
    // Delay to ensure container is rendered (container only exists when !isLoadingState && selectedWorkflow)
    const timer = window.setTimeout(() => {
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
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedWorkflowId, isLoadingState, selectedWorkflow]);

  // Initialize node positions when workflow changes
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
    let cancelled = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts while typing in inputs
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? '';
      if (tag === 'input' || tag === 'textarea' || (target?.isContentEditable ?? false)) {
        return;
      }
      // Space for panning/space-dragging
      if (event.code === 'Space') {
        spaceDownRef.current = true;
        setSpaceDown(true);
        return;
      }

      // Escape - Deselect current node/edge
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        return;
      }

      // Delete/Backspace - Delete selected node or edge
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (selectedNodeId) {
          removeRequestFromWorkflow(selectedWorkflowId ?? '', selectedNodeId);
          setSelectedNodeId(null);
        } else if (selectedEdgeId) {
          removeEdge(selectedWorkflowId ?? '', selectedEdgeId);
          setSelectedEdgeId(null);
        }
        return;
      }

      // Undo - Ctrl/Cmd+Z (if supported by store)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        const undoFn = (useWorkflowStore as any).undo;
        if (typeof undoFn === 'function') {
          event.preventDefault();
          try {
            undoFn();
          } catch {
            // ignore
          }
        }
        return;
      }

      // Save - Ctrl/Cmd+S
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const snapshot = currentSnapshot;
        const request = buildWorkflowPersistRequest(lastSavedSnapshotRef.current, snapshot);
        if (request) {
          persistWorkflowState(request).catch((err) => {
            console.error('Keyboard Save failed', err);
          });
        }
        return;
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
  }, [selectedWorkflowId, selectedNodeId, selectedEdgeId, removeRequestFromWorkflow, removeEdge, setSelectedNodeId, setSelectedEdgeId, currentSnapshot, lastSavedSnapshotRef, persistWorkflowState]);

  React.useEffect(() => {
    setAddPanelOpen(false);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setResults([]);
    setSelectedResult(null);
    shouldResetViewOnWorkflowChangeRef.current = true;
  }, [selectedWorkflowId]);

  React.useEffect(() => {
    if (!selectedWorkflow || !selectedNodeId) return;
    if (!selectedWorkflow.requests.find((req) => req.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedWorkflow, selectedNodeId]);

  React.useEffect(() => {
    if (!selectedWorkflow || !selectedEdgeId) return;
    if (!(selectedWorkflow.edges || []).find((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedWorkflow, selectedEdgeId]);

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

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const latestSnapshot = buildWorkflowSnapshot(useWorkflowStore.getState());
    const request = buildWorkflowPersistRequest(lastSavedSnapshotRef.current, latestSnapshot);
    if (request) {
      await persistWorkflowState(request);
      return;
    }

    await savePromiseRef.current;
  }, [persistWorkflowState]);

  const handleRetrySave = useCallback(async () => {
    try {
      await flushPendingSave();
      message.success('工作流已保存');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }, [flushPendingSave]);

  const ensureWorkflowReadyToRun = useCallback(async () => {
    if (saveError) {
      message.error('当前保存失败，请先重试保存');
      return false;
    }

    try {
      await flushPendingSave();
    } catch (error) {
      message.error(getErrorMessage(error));
      return false;
    }

    return true;
  }, [flushPendingSave, saveError]);

  const handleRunWorkflow = async () => {
    if (!selectedWorkflowId) {
      return;
    }

    const canRun = await ensureWorkflowReadyToRun();
    if (!canRun) {
      return;
    }

    const latestWorkflow = useWorkflowStore.getState().workflows.find((workflow) => workflow.id === selectedWorkflowId);
    if (!latestWorkflow) {
      return;
    }

    setRunning(true);
    setResults([]);
    setSelectedResult(null);

    try {
      const workflowStartedAt = new Date();
      const workflowResults: WorkflowRunNodeLog[] = [];
      const requestOutputMap = new Map<string, Record<string, unknown>>();
      const analysis = analyzeWorkflow(latestWorkflow);
      const executionOrder = analysis.orderedRequestIds;

      for (const requestId of executionOrder) {
        const request = latestWorkflow.requests.find((item) => item.id === requestId);
        if (!request) {
          continue;
        }

        let headers = request.headers.reduce<Record<string, string>>(
          (acc, header) => (header.key ? { ...acc, [header.key]: header.value } : acc),
          {}
        );
        let params = request.params.reduce<Record<string, string>>(
          (acc, param) => (param.key ? { ...acc, [param.key]: param.value } : acc),
          {}
        );
        let url = request.url;
        let body = request.body;
        let requestBody: unknown = undefined;
        const resolvedInputs: Record<string, unknown> = {};
        const requestStartedAt = new Date();
        const startTime = Date.now();

        try {
          let bodyObj: Record<string, unknown> | null = {};
          if (body && body.trim() !== '') {
            try {
              bodyObj = JSON.parse(body);
            } catch {
              bodyObj = null;
            }
          }

          let bodyUpdated = false;
          const mappings = request.apiMappings || [];

          for (const field of request.inputFields || []) {
            const value = request.inputValues?.[field.name];
            const reference = parseWorkflowReference(value);

            let processedValue: unknown = value;
            if (reference) {
              const upstreamOutput = requestOutputMap.get(reference.requestId);
              if (upstreamOutput === undefined) {
                console.warn(`警告: 引用 {{${reference.requestId}.${reference.fieldName}}} 指向的请求尚未执行或不存在`);
              } else if (getNestedValue(upstreamOutput, reference.fieldName) === undefined) {
                console.warn(`警告: 引用 {{${reference.requestId}.${reference.fieldName}}} 指向的字段不存在于上游响应中`);
              }
              processedValue = getNestedValue(upstreamOutput, reference.fieldName);
            }

            if ((processedValue === undefined || processedValue === '') && field.required) {
              throw new Error(`${field.name} 是必填字段`);
            }

            if (processedValue === undefined || processedValue === '') {
              continue;
            }

            resolvedInputs[field.name] = processedValue;

            const mapping = mappings.find((item) => item.inputName === field.name && item.key);
            if (mapping) {
              if (mapping.target === 'path') {
                url = applyPathMapping(url, mapping.key, String(processedValue));
              } else if (mapping.target === 'params') {
                params[mapping.key] = String(processedValue);
              } else if (mapping.target === 'body') {
                if (!bodyObj) {
                  throw new Error('Body 格式错误');
                }
                setNestedValue(bodyObj, mapping.key, parseBodyValue(processedValue));
                bodyUpdated = true;
              }
              continue;
            }

            if (field.type === 'params') {
              params[field.name] = String(processedValue);
            } else if (field.type === 'body') {
              if (!bodyObj) {
                throw new Error('Body 格式错误');
              }
              setNestedValue(bodyObj, field.name, parseBodyValue(processedValue));
              bodyUpdated = true;
            } else if (field.type === 'path') {
              url = applyPathMapping(url, field.name, String(processedValue));
            }
          }

          if (bodyUpdated) {
            body = JSON.stringify(bodyObj || {}, null, 2);
          }

          if (['POST', 'PUT', 'PATCH'].includes(request.method) && body) {
            try {
              requestBody = JSON.parse(body);
            } catch {
              requestBody = body;
            }
          }

          const response = await proxyRequest({
            url,
            method: request.method,
            headers,
            body: requestBody,
            params,
          });
          const durationMs = Date.now() - startTime;
          const requestFinishedAt = new Date();
          const responseData = response.data !== undefined && response.data !== null ? response.data : response;

          const outputData = (request.outputFields || []).reduce<Record<string, unknown>>((acc, field) => {
            try {
              const value = field.path.split('.').reduce<unknown>((cursor, key) => (
                cursor && typeof cursor === 'object'
                  ? (cursor as Record<string, unknown>)[key]
                  : undefined
              ), responseData);
              acc[field.name] = value;
            } catch {
              acc[field.name] = undefined;
            }
            return acc;
          }, {});

          requestOutputMap.set(request.id, outputData);

          workflowResults.push({
            requestId: request.id,
            requestName: request.name,
            method: request.method,
            url,
            status: 'success',
            statusCode: typeof response.status === 'number' ? response.status : 200,
            durationMs,
            startedAt: requestStartedAt.toISOString(),
            finishedAt: requestFinishedAt.toISOString(),
            upstreamRequestIds: analysis.upstreamByRequestId[request.id] || [],
            requestInfo: {
              url,
              method: request.method,
              headers: maskSensitiveHeaders(headers),
              params,
              body: requestBody,
              resolvedInputs,
            },
            responseData,
          });
        } catch (error) {
          const requestFinishedAt = new Date();
          const details = getErrorMessage(error);
          const axiosStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
          const axiosData = axios.isAxiosError(error) ? error.response?.data : undefined;
          workflowResults.push({
            requestId: request.id,
            requestName: request.name,
            method: request.method,
            url,
            status: 'error',
            statusCode: typeof axiosStatus === 'number' ? axiosStatus : 500,
            durationMs: Math.max(0, Date.now() - startTime),
            startedAt: requestStartedAt.toISOString(),
            finishedAt: requestFinishedAt.toISOString(),
            upstreamRequestIds: analysis.upstreamByRequestId[request.id] || [],
            requestInfo: {
              url,
              method: request.method,
              headers: maskSensitiveHeaders(headers),
              params,
              body: requestBody,
              resolvedInputs,
            },
            responseData: axiosData ?? details,
            error: details,
          });
          break;
        }
      }

      const workflowFinishedAt = new Date();
      const status = workflowResults.some((node) => node.status === 'error') ? 'error' : 'success';
      const logPayload: WorkflowRunLogPayload = {
        workflowId: latestWorkflow.id,
        workflowName: latestWorkflow.name,
        status,
        startedAt: workflowStartedAt.toISOString(),
        finishedAt: workflowFinishedAt.toISOString(),
        durationMs: workflowFinishedAt.getTime() - workflowStartedAt.getTime(),
        nodes: workflowResults,
      };

      setResults(workflowResults);
      if (workflowResults.length > 0) {
        const currentNode = workflowResults.find((node) => node.status === 'error') || workflowResults[0];
        setSelectedResult(currentNode);
      }

      try {
        const savedLog = await saveWorkflowRunLog(latestWorkflow.id, logPayload);
        setRunLogs((previous) => sortRunLogsByStartedAt([savedLog, ...previous.filter((log) => log.id !== savedLog.id)]));
        setActiveAssistTab('logs');
        setAssistPanelOpen(true);
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        console.error('Failed to save workflow run log:', errorMsg);
        message.error(`运行日志保存失败: ${errorMsg}`);
      }

      if (workflowResults.length === 0) {
        message.warning('当前没有接入手动触发器的节点');
      } else if (status === 'error') {
        message.error('工作流执行失败');
      } else {
        message.success('工作流执行完成');
      }
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

  const getCanvasPointFromClient = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
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

  type Point = { x: number; y: number };

  const getEdgePoints = (edge: { sourceId: string; targetId: string }): { start: Point; end: Point } | null => {
    let start: Point | null = null;
    let end: Point | null = null;

    if (edge.sourceId === 'trigger') {
      start = { x: triggerPos.x + TRIGGER_WIDTH / 2, y: triggerPos.y + TRIGGER_HEIGHT };
    } else {
      const sourceNodePos = nodePositions[edge.sourceId] ?? nodePositionsRef.current[edge.sourceId];
      if (sourceNodePos) {
        start = { x: sourceNodePos.x + NODE_SIZE / 2, y: sourceNodePos.y + NODE_SIZE };
      } else {
        console.warn(`Edge rendering: source node position not found for ${edge.sourceId}`);
      }
    }

    const targetNodePos = nodePositions[edge.targetId] ?? nodePositionsRef.current[edge.targetId];
    if (targetNodePos) {
      end = { x: targetNodePos.x + NODE_SIZE / 2, y: targetNodePos.y };
    } else {
      console.warn(`Edge rendering: target node position not found for ${edge.targetId}`);
    }

    if (!start || !end) {
      return null;
    }

    return { start, end };
  };

  const getEdgeCurvePoints = (start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(Math.max(distance * 0.5, 30), 100);

    return {
      cp1: { x: start.x, y: start.y + curvature },
      cp2: { x: end.x, y: end.y - curvature },
    };
  };

  const getBezierPoint = (start: Point, cp1: Point, cp2: Point, end: Point, t: number): Point => {
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT ** 3 * start.x
        + 3 * oneMinusT ** 2 * t * cp1.x
        + 3 * oneMinusT * t ** 2 * cp2.x
        + t ** 3 * end.x,
      y: oneMinusT ** 3 * start.y
        + 3 * oneMinusT ** 2 * t * cp1.y
        + 3 * oneMinusT * t ** 2 * cp2.y
        + t ** 3 * end.y,
    };
  };

  const getDistanceToSegment = (point: Point, start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) {
      return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
    }

    const t = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy))
    );
    const projectionX = start.x + t * dx;
    const projectionY = start.y + t * dy;

    return Math.sqrt((point.x - projectionX) ** 2 + (point.y - projectionY) ** 2);
  };

  const hitTestEdge = (x: number, y: number): string | null => {
    if (!selectedWorkflow) return null;

    let closestEdgeId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    const threshold = 10 / view.scale;

    for (const edge of selectedWorkflow.edges || []) {
      const points = getEdgePoints(edge);
      if (!points) continue;

      const { start, end } = points;
      const { cp1, cp2 } = getEdgeCurvePoints(start, end);
      let previous = start;

      for (let step = 1; step <= 24; step += 1) {
        const current = getBezierPoint(start, cp1, cp2, end, step / 24);
        const distance = getDistanceToSegment({ x, y }, previous, current);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEdgeId = edge.id;
        }
        previous = current;
      }
    }

    return closestDistance <= threshold ? closestEdgeId : null;
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
      const shouldShowInputConnector = Boolean(connectingFrom) && connectingFrom?.nodeId !== req.id;
      const shouldShowOutputConnector = hoveredNodeId === req.id || connectingFrom?.nodeId === req.id;
      if (!shouldShowInputConnector && !shouldShowOutputConnector) continue;

      const inputX = pos.x + NODE_SIZE / 2;
      const inputY = pos.y;
      const inputDist = Math.sqrt((x - inputX) ** 2 + (y - inputY) ** 2);
      if (shouldShowInputConnector && inputDist <= 12) {
        return { nodeId: req.id, pointType: 'input' };
      }

      const outputX = pos.x + NODE_SIZE / 2;
      const outputY = pos.y + NODE_HEIGHT;
      const outputDist = Math.sqrt((x - outputX) ** 2 + (y - outputY) ** 2);
      if (shouldShowOutputConnector && outputDist <= 12) {
        return { nodeId: req.id, pointType: 'output' };
      }
    }

    return null;
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
  const fitViewToPositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    const container = canvasContainerRef.current;
    if (!container) {
      return;
    }

    const bounds = getWorkflowLayoutBounds(positions, {
      triggerX: triggerPos.x,
      triggerY: triggerPos.y,
      triggerWidth: TRIGGER_WIDTH,
      triggerHeight: TRIGGER_HEIGHT,
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
    });

    setView(getViewportForBounds(bounds, {
      viewportWidth: container.clientWidth,
      viewportHeight: container.clientHeight,
      topInset: WORKFLOW_VIEW_TOP_INSET,
    }));
  }, [triggerPos]);

  const addRequestToCanvas = useCallback((
    request: WorkflowAvailableRequest,
    placement?: { x: number; y: number; afterRequestId?: string | null }
  ) => {
    if (!selectedWorkflow) {
      return;
    }
    // Save current state for undo before mutating the workflow
    saveToUndo(buildWorkflowSnapshot(useWorkflowStore.getState()));

    const newId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const nextRequest: WorkflowRequest = {
      id: newId,
      name: request.name,
      method: request.method,
      url: request.url,
      headers: request.headers || [],
      params: request.params || [],
      body: request.body || '',
      inputFields: request.inputFields || [],
      outputFields: request.outputFields || [],
      inputValues: {},
      apiMappings: request.apiMappings || [],
      iconUrl: request.iconUrl,
    };

    const currentRequests = [...selectedWorkflow.requests];
    const insertIndex = placement?.afterRequestId
      ? currentRequests.findIndex((item) => item.id === placement.afterRequestId) + 1
      : currentRequests.length;
    const normalizedIndex = insertIndex < 0 ? currentRequests.length : insertIndex;
    currentRequests.splice(normalizedIndex, 0, nextRequest);

    const currentPositions = { ...nodePositionsRef.current };
    const fallbackX = triggerPos.x + TRIGGER_WIDTH / 2 - NODE_WIDTH / 2;
    const fallbackY = triggerPos.y + TRIGGER_HEIGHT + MIN_NODE_VERTICAL_GAP;
    const previousRequest = normalizedIndex > 0 ? currentRequests[normalizedIndex - 1] : null;
    const previousPosition = previousRequest ? currentPositions[previousRequest.id] : null;
    const nextPosition = placement
      ? {
          x: Math.max(0, snapToGrid(placement.x - NODE_WIDTH / 2, 20)),
          y: Math.max(0, snapToGrid(placement.y - NODE_HEIGHT / 2, 20)),
        }
      : previousPosition
        ? {
            x: previousPosition.x,
            y: previousPosition.y + NODE_HEIGHT + MIN_NODE_VERTICAL_GAP,
          }
        : {
            x: fallbackX,
            y: fallbackY,
          };

    const mergedPositions = {
      ...currentPositions,
      [newId]: nextPosition,
    };

    // Save before mutating node positions and workflow state
    saveToUndo(buildWorkflowSnapshot(useWorkflowStore.getState()));
    setNodePositions(mergedPositions);
    updateWorkflow(selectedWorkflow.id, {
      requests: currentRequests,
      nodePositions: mergedPositions,
    });
    setSelectedNodeId(newId);
    setActiveAssistTab('requests');
    message.success('请求已添加');
  }, [selectedWorkflow, triggerPos, updateWorkflow]);

  const handleRequestSelect = (requestKey: string, placement?: { x: number; y: number; afterRequestId?: string | null }) => {
    const request = availableRequests.find((item) => `${item.ownerUserId || 'self'}:${item.id}` === requestKey);
    if (request) {
      addRequestToCanvas(request, placement || {
        x: addPanelPos.x || triggerPos.x + TRIGGER_WIDTH / 2,
        y: addPanelPos.y || triggerPos.y + TRIGGER_HEIGHT + MIN_NODE_VERTICAL_GAP,
        afterRequestId: addPanelPos.afterRequestId,
      });
    }
    setAddPanelOpen(false);
  };

  const handleAutoLayout = useCallback(() => {
    if (!selectedWorkflow) {
      return;
    }

    const nextPositions = autoLayoutWorkflowNodes(selectedWorkflow, {
      canvasWidth: Math.max(canvasSize.width, canvasContainerRef.current?.clientWidth || canvasSize.width),
      triggerX: triggerPos.x,
      triggerY: triggerPos.y,
      triggerWidth: TRIGGER_WIDTH,
      triggerHeight: TRIGGER_HEIGHT,
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      verticalGap: MIN_NODE_VERTICAL_GAP,
      horizontalGap: MIN_NODE_HORIZONTAL_GAP,
    });

    setNodePositions(nextPositions);
    updateWorkflow(selectedWorkflow.id, { nodePositions: nextPositions });
    fitViewToPositions(nextPositions);
    message.success('节点已自动排列');
  }, [canvasSize.width, fitViewToPositions, selectedWorkflow, triggerPos, updateWorkflow]);

  const handleResetView = useCallback(() => {
    if (Object.keys(nodePositionsRef.current).length === 0) {
      fitViewToPositions({});
      return;
    }
    fitViewToPositions(nodePositionsRef.current);
  }, [fitViewToPositions]);

  React.useEffect(() => {
    if (!selectedWorkflow || !shouldResetViewOnWorkflowChangeRef.current) {
      return;
    }
    if (selectedWorkflow.requests.length > 0 && Object.keys(nodePositions).length < selectedWorkflow.requests.length) {
      return;
    }

    handleResetView();
    shouldResetViewOnWorkflowChangeRef.current = false;
  }, [handleResetView, nodePositions, selectedWorkflow]);

  const openRunLogDetail = useCallback((log: WorkflowRunLog) => {
    setSelectedRunLog(log);
    setSelectedRunLogNodeId(getDefaultRunLogNodeId(log));
    setRunLogDrawerOpen(true);
  }, []);

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
      setSelectedEdgeId(null);
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
          setSelectedEdgeId(null);
          message.success('节点已删除');
          return;
        }
      }
    }

    const edgeId = hitTestEdge(x, y);
    if (edgeId) {
      setSelectedNodeId(null);
      setSelectedEdgeId(edgeId);
      return;
    }

    const node = hitTestNode(x, y);
    if (!node) {
      setSelectedEdgeId(null);
      startPan();
      return;
    }
    const pos = nodePositions[node.id];
    if (!pos) return;
    setSelectedEdgeId(null);
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

    // Update mouse position for preview line (UI state)
    if (connectingFrom) {
      setMousePos({ x, y });
    }
    // Also update drawing mouse position in a ref to avoid redraws
    canvasMousePosRef.current = { x, y };

    // Update hover state
    const connectorPoint = hitTestConnectorPoint(x, y);
    if (connectorPoint) {
      setHoveredNodeId(connectorPoint.nodeId);
    } else {
      const node = hitTestNode(x, y);
      if (node) {
        setHoveredNodeId(node.id);
      } else {
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
      if (Math.abs(x - dragRef.current.startX) > 4 || Math.abs(y - dragRef.current.startY) > 4) {
        dragRef.current.moved = true;
      }
      // Save current state for undo before mutating node position
      saveToUndo(buildWorkflowSnapshot(useWorkflowStore.getState()));
      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: Math.max(0, newX), y: Math.max(0, newY) },
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
        // Save before mutating the workflow by creating an edge
        saveToUndo(buildWorkflowSnapshot(useWorkflowStore.getState()));
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
        setSelectedEdgeId(null);
      } else {
        const finalPos = nodePositions[dragId];
        if (finalPos) {
          const others = Object.fromEntries(Object.entries(nodePositions).filter(([key]) => key !== dragId));
          const { x, y } = pushOutOfCollision(dragId, finalPos.x, finalPos.y, others, NODE_SIZE, MIN_NODE_GAP, canvasSize.width, canvasSize.height);
          const newPositions = { ...nodePositions, [dragId]: { x, y } };
          setNodePositions(newPositions);
          updateWorkflow(selectedWorkflow.id, { nodePositions: newPositions });
        }
      }
    }
    dragRef.current.id = null;
    dragRef.current.mode = null;
  };

  const handleCanvasDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!selectedWorkflow || !draggingRequestKey) {
      return;
    }
    event.preventDefault();
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    setDropPreview(point);
  };

  const handleCanvasDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDropPreview(null);
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const requestKey = event.dataTransfer.getData('application/workflow-request') || draggingRequestKey;
    if (!requestKey) {
      return;
    }
    event.preventDefault();
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    handleRequestSelect(requestKey, point);
    setDraggingRequestKey(null);
    setDropPreview(null);
  };

  const selectedEdgeAction = React.useMemo(() => {
    if (!selectedWorkflow || !selectedEdgeId) {
      return null;
    }

    const selectedEdge = (selectedWorkflow.edges || []).find((edge) => edge.id === selectedEdgeId);
    if (!selectedEdge) {
      return null;
    }

    const points = getEdgePoints(selectedEdge);
    if (!points) {
      return null;
    }

    const { cp1, cp2 } = getEdgeCurvePoints(points.start, points.end);
    const midpoint = getBezierPoint(points.start, cp1, cp2, points.end, 0.5);
    const screenX = (midpoint.x - view.offsetX) * view.scale;
    const screenY = (midpoint.y - view.offsetY) * view.scale;
    const isVisible = screenX >= 0 && screenX <= canvasSize.width && screenY >= 0 && screenY <= canvasSize.height;

    if (!isVisible) {
      return null;
    }

    return {
      id: selectedEdge.id,
      x: screenX,
      y: screenY,
    };
  }, [selectedWorkflow, selectedEdgeId, nodePositions, triggerPos, view, canvasSize]);

  const handleImportOutputFields = (result: WorkflowRunNodeLog) => {
    if (result.responseData && selectedWorkflowId) {
      const workflow = workflows.find((wf) => wf.id === selectedWorkflowId);
      if (workflow) {
        const request = workflow.requests.find((req) => req.id === result.requestId);
        if (request) {
          useWorkflowStore.getState().addOutputFieldsFromResponse(selectedWorkflowId, request.id, result.responseData);
          const responseObject = typeof result.responseData === 'object' && result.responseData !== null
            ? Object.keys(result.responseData as Record<string, unknown>).length
            : 0;
          message.success(`已为 ${request.name} 导入 ${responseObject} 个出参字段`);
        }
      }
    }
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

    const compactMode = view.scale < 0.85;

    // Trigger node
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    };

    const drawDefaultIcon = (centerX: number, centerY: number, scale: number) => {
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

    const drawCurveConnection = (
      start: Point,
      end: Point,
      color: string,
      scale: number,
      lineWidth: number = 2,
      dashed: boolean = true
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / scale;
      ctx.lineCap = 'round';
      ctx.setLineDash(dashed ? [6 / scale, 6 / scale] : []);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);

      const isNearlyVertical = Math.abs(start.x - end.x) < 5 / scale;
      if (isNearlyVertical) {
        ctx.lineTo(end.x, end.y);
      } else {
        const { cp1, cp2 } = getEdgeCurvePoints(start, end);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      }

      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawRoundedRect(triggerPos.x, triggerPos.y, TRIGGER_WIDTH, TRIGGER_HEIGHT, 12);
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
      const points = getEdgePoints(edge);
      if (points) {
        const isSelected = edge.id === selectedEdgeId;
        drawCurveConnection(
          points.start,
          points.end,
          isSelected ? '#2563eb' : '#6b7280',
          view.scale,
          isSelected ? 4 : 2,
          !isSelected
        );
      }
    }

    // Draw preview line while connecting
    if (connectingFrom && canvasMousePosRef.current) {
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
        ctx.setLineDash([6 / view.scale, 6 / view.scale]);
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        const mp = canvasMousePosRef.current;
        if (mp) ctx.lineTo(mp.x, mp.y);
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

      drawRoundedRect(pos.x, pos.y, NODE_SIZE, NODE_SIZE, 12);
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
          img.onload = () => {
            const iconSize = 44 / view.scale;
            ctx.drawImage(img, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
          };
          img.onerror = () => {
            drawDefaultIcon(centerX, centerY, view.scale);
          };
          // Do not draw default icon here to avoid duplicate rendering
        }
      } else {
        drawDefaultIcon(centerX, centerY, view.scale);
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
      const shouldShowInputConnector = Boolean(connectingFrom) && connectingFrom?.nodeId !== req.id;
      const shouldShowOutputConnector = isNodeHovered || connectingFrom?.nodeId === req.id;
      const inputX = pos.x + NODE_SIZE / 2;
      const inputY = pos.y;
      if (shouldShowInputConnector) {
        const inputNodeRadius = 8 / view.scale;
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.arc(inputX, inputY, inputNodeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / view.scale;
        ctx.stroke();
      }

      if (shouldShowOutputConnector) {
        const outputX = pos.x + NODE_SIZE / 2;
        const outputY = pos.y + NODE_HEIGHT;
        const outputNodeRadius = 8 / view.scale;
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.arc(outputX, outputY, outputNodeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / view.scale;
        ctx.stroke();
      }

      if (isSelected) {
        const toolbarWidth = 60;
        const toolbarHeight = 28;
        const toolbarX = pos.x + NODE_SIZE / 2 - toolbarWidth / 2;
        const toolbarY = pos.y - toolbarHeight - 8;

        drawRoundedRect(toolbarX, toolbarY, toolbarWidth, toolbarHeight, 6);
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
  }, [selectedWorkflow, nodePositions, selectedNodeId, selectedEdgeId, view, canvasSize, triggerPos, hoveredNodeId, connectingFrom]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const container = canvasContainerRef.current;
      const currentCanvasSize = canvasSizeRef.current;
      const useZoom = event.metaKey || event.altKey;

      setView((prev) => {
        if (useZoom) {
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const worldX = sx / prev.scale + prev.offsetX;
          const worldY = sy / prev.scale + prev.offsetY;
          const nextScale = Math.min(2, Math.max(0.5, prev.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
          const nextOffsetX = worldX - sx / nextScale;
          const nextOffsetY = worldY - sy / nextScale;
          const viewWidth = container ? container.clientWidth / nextScale : currentCanvasSize.width / nextScale;
          const viewHeight = container ? container.clientHeight / nextScale : currentCanvasSize.height / nextScale;

          return {
            scale: nextScale,
            offsetX: clampOffset(nextOffsetX, viewWidth, currentCanvasSize.width),
            offsetY: clampOffset(nextOffsetY, viewHeight, currentCanvasSize.height),
          };
        }

        const viewWidth = container ? container.clientWidth / prev.scale : currentCanvasSize.width / prev.scale;
        const viewHeight = container ? container.clientHeight / prev.scale : currentCanvasSize.height / prev.scale;
        const nextOffsetX = prev.offsetX + event.deltaX / prev.scale;
        const nextOffsetY = prev.offsetY + event.deltaY / prev.scale;

        return {
          ...prev,
          offsetX: clampOffset(nextOffsetX, viewWidth, currentCanvasSize.width),
          offsetY: clampOffset(nextOffsetY, viewHeight, currentCanvasSize.height),
        };
      });
    };

    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleCanvasWheel);
    };
  }, [setView]);

  return (
    <>
      <WorkflowSidebar
        workflows={workflows}
        selectedWorkflowId={selectedWorkflowId}
        isLoadingState={isLoadingState}
        databaseStatusColor={databaseStatusColor}
        databaseStatusText={databaseStatusText}
        workflowSiderCollapsed={workflowSiderCollapsed}
        editingId={editingId}
        editingName={editingName}
        setWorkflowSiderCollapsed={setWorkflowSiderCollapsed}
        setEditingId={setEditingId}
        setEditingName={setEditingName}
        onSelectWorkflow={setSelectedWorkflow}
        onAddWorkflow={addWorkflow}
        onDeleteWorkflow={deleteWorkflow}
        onRenameWorkflow={(id, name) => updateWorkflow(id, { name })}
      />

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
              <div className="flex-1 min-h-0 relative">
                <div
                  ref={canvasContainerRef}
                  className={`absolute inset-0 overflow-hidden ${draggingRequestKey ? 'ring-1 ring-blue-200' : ''}`}
                  onDragOver={handleCanvasDragOver}
                  onDrop={handleCanvasDrop}
                  onDragLeave={handleCanvasDragLeave}
                >
                  <div className="absolute left-4 right-4 top-4 z-20">
                    <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg px-5 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-800 truncate">{selectedWorkflow.name}</div>
                        <div className="text-xs text-gray-500">
                          最近修改 {lastUpdated ? new Date(lastUpdated).toLocaleString() : '--'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Tag color={saveStatusColor} className="m-0 rounded-full px-3 py-1">
                          {saveStatusText}
                        </Tag>
                        {isAutoSaving ? (
                          <span className="text-sm text-gray-600 ml-2" title="Auto-saving in background">Saving...</span>
                        ) : null}
                        {saveError ? (
                          <Button size="small" icon={<ReloadOutlined />} onClick={handleRetrySave}>
                            重试保存
                          </Button>
                        ) : null}
                        <Button
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={handleRunWorkflow}
                          loading={running}
                          size="middle"
                        >
                          运行工作流
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="absolute left-4 top-24 z-20 flex items-start gap-3">
                    <div className="w-14 bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg flex flex-col items-center py-3 gap-2">
                      {[
                        { key: 'requests', label: '请求', icon: <ApiOutlined /> },
                        { key: 'search', label: '搜索', icon: <SearchOutlined /> },
                        { key: 'logs', label: '日志', icon: <FileSearchOutlined /> },
                        { key: 'auto-layout', label: '自动排列', icon: <DeploymentUnitOutlined /> },
                        { key: 'reset-view', label: '重置视角', icon: <RetweetOutlined /> },
                        { key: 'explain', label: '流程解释', icon: <NodeIndexOutlined /> },
                      ].map((item) => {
                        const isPanelItem = item.key === 'requests' || item.key === 'search' || item.key === 'logs' || item.key === 'explain';
                        const isActive = isPanelItem && assistPanelOpen && activeAssistTab === item.key;

                        return (
                          <Tooltip key={item.key} title={item.label} placement="right">
                            <Button
                              type={isActive ? 'primary' : 'text'}
                              className="!w-10 !h-10 !flex !items-center !justify-center"
                              onClick={() => {
                                if (item.key === 'auto-layout') {
                                  handleAutoLayout();
                                  return;
                                }
                                if (item.key === 'reset-view') {
                                  handleResetView();
                                  return;
                                }
                                if (assistPanelOpen && activeAssistTab === item.key) {
                                  setAssistPanelOpen(false);
                                  return;
                                }
                                setActiveAssistTab(item.key as 'requests' | 'search' | 'logs' | 'explain');
                                setAssistPanelOpen(true);
                              }}
                              icon={item.icon}
                            />
                          </Tooltip>
                        );
                      })}
                    </div>

                    {assistPanelOpen ? (
                      <div className="w-[340px] max-h-[min(720px,calc(100vh-220px))] bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                          <div className="font-medium text-gray-800">
                            {{
                              requests: '请求列表',
                              search: '节点搜索',
                              logs: '运行日志',
                              explain: '流程解释',
                            }[activeAssistTab]}
                          </div>
                          <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setAssistPanelOpen(false)} />
                        </div>

                        {activeAssistTab === 'requests' ? (
                          <div className="flex-1 overflow-auto p-3 space-y-2">
                            <div className="text-xs text-gray-500">
                              拖拽请求到画布中可直接创建节点，也可以点击“添加”快速插入。
                            </div>
                            {availableRequests.map((request) => (
                              <div
                                key={`${request.ownerUserId || 'self'}:${request.id}`}
                                draggable
                                onDragStart={(event) => {
                                  const requestKey = `${request.ownerUserId || 'self'}:${request.id}`;
                                  event.dataTransfer.setData('application/workflow-request', requestKey);
                                  event.dataTransfer.effectAllowed = 'copy';
                                  setDraggingRequestKey(requestKey);
                                }}
                                onDragEnd={() => {
                                  setDraggingRequestKey(null);
                                  setDropPreview(null);
                                }}
                                className="border border-gray-200 rounded-xl p-3 bg-white hover:border-blue-300 hover:shadow-sm cursor-grab active:cursor-grabbing"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-800 truncate">{request.name}</div>
                                    <div className="text-xs text-gray-500 truncate">{request.url || '未配置地址'}</div>
                                  </div>
                                  <Tag color="blue" className="m-0">{request.method}</Tag>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="text-xs text-gray-500 truncate">
                                    {request.isPublic && request.ownerUsername
                                      ? `来源：${request.ownerUsername}（公开）`
                                      : '来源：我的请求'}
                                  </div>
                                  <Button
                                    size="small"
                                    icon={<PlusOutlined />}
                                    onClick={() => handleRequestSelect(`${request.ownerUserId || 'self'}:${request.id}`)}
                                  >
                                    添加
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {availableRequests.length === 0 ? (
                              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用请求" />
                            ) : null}
                          </div>
                        ) : null}

                        {activeAssistTab === 'search' ? (
                          <div className="flex-1 overflow-auto p-3 space-y-3">
                            <Input
                              allowClear
                              placeholder="按节点名称搜索"
                              prefix={<SearchOutlined className="text-gray-400" />}
                              value={searchTerm}
                              onChange={(event) => setSearchTerm(event.target.value)}
                            />
                            <div className="space-y-2">
                              {filteredWorkflowRequests.map((request) => (
                                <div
                                  key={request.id}
                                  onClick={() => focusNode(request.id)}
                                  className={`border rounded-xl p-3 cursor-pointer transition-colors ${
                                    selectedNodeId === request.id
                                      ? 'border-blue-400 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:border-blue-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium text-gray-800 truncate">{request.name}</div>
                                    <Tag color="geekblue" className="m-0">{request.method}</Tag>
                                  </div>
                                  <div className="text-xs text-gray-500 truncate mt-1">{request.url || '未配置地址'}</div>
                                </div>
                              ))}
                              {filteredWorkflowRequests.length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的节点" />
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {activeAssistTab === 'logs' ? (
                          <div className="flex-1 overflow-auto p-3 space-y-2">
                            {runLogs.map((log) => (
                              <div
                                key={log.id}
                                onClick={() => openRunLogDetail(log)}
                                className="border border-gray-200 rounded-xl p-3 bg-white hover:border-blue-300 cursor-pointer"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-gray-800">
                                    {new Date(log.startedAt).toLocaleString()}
                                  </div>
                                  <Tag color={log.status === 'success' ? 'success' : 'error'} className="m-0">
                                    {log.status === 'success' ? '成功' : '失败'}
                                  </Tag>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  耗时 {getDurationText(log.durationMs)} · {log.nodes.length} 个节点
                                </div>
                              </div>
                            ))}
                            {runLogs.length === 0 ? (
                              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" />
                            ) : null}
                          </div>
                        ) : null}

                        {activeAssistTab === 'explain' ? (
                          <div className="flex-1 overflow-auto p-4 space-y-4">
                            <div className="space-y-2">
                              {workflowExplanation.summary.map((item) => (
                                <p key={item} className="text-sm text-gray-700 leading-6 m-0">
                                  {item}
                                </p>
                              ))}
                            </div>

                            {workflowExplanation.warnings.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {workflowExplanation.warnings.map((warning) => (
                                  <Tag key={warning} color="warning" className="m-0">{warning}</Tag>
                                ))}
                              </div>
                            ) : null}

                            <div className="space-y-2">
                              {workflowExplanation.steps.map((step, index) => (
                                <div
                                  key={step.requestId}
                                  onClick={() => focusNode(step.requestId)}
                                  className={`rounded-2xl border p-3 cursor-pointer transition-colors ${
                                    selectedNodeId === step.requestId
                                      ? 'border-blue-400 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:border-blue-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-medium text-gray-800">
                                      第 {index + 1} 步 · {step.requestName}
                                    </div>
                                    <Tag color="cyan" className="m-0">{step.method}</Tag>
                                  </div>
                                  <div className="text-xs text-gray-500 leading-5">
                                    {step.description}
                                  </div>
                                </div>
                              ))}
                              {workflowExplanation.steps.length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可解释的执行链路" />
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <Button type="default" size="small" onClick={handleUndo} disabled={undoStack.length === 0} icon={<UndoOutlined />} title="Undo" />
                    <Button type="default" size="small" onClick={handleRedo} disabled={redoStack.length === 0} icon={<RedoOutlined />} title="Redo" />
                  </div>
                  <WorkflowToolbar
                    view={view}
                    setView={setView}
                    canvasContainerRef={canvasContainerRef}
                    canvasSize={canvasSize}
                    clampOffset={clampOffset}
                  />

                  <canvas
                    ref={canvasRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    className="block"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    style={{ touchAction: 'none', cursor: spaceDown ? 'grab' : 'default' }}
                  />

                  {draggingRequestKey && dropPreview ? (
                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: (dropPreview.x - view.offsetX) * view.scale,
                        top: (dropPreview.y - view.offsetY) * view.scale,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-100/60 flex items-center justify-center text-xs text-blue-700">
                        放到这里
                      </div>
                    </div>
                  ) : null}

                  {selectedWorkflow && selectedEdgeAction ? (
                    <Button
                      danger
                      shape="circle"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        removeEdge(selectedWorkflow.id, selectedEdgeAction.id);
                        setSelectedEdgeId(null);
                        message.success('连接已删除');
                      }}
                      className="!absolute z-20 shadow-md"
                      style={{
                        left: selectedEdgeAction.x,
                        top: selectedEdgeAction.y,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  ) : null}
                </div>

                <WorkflowResultsPanel
                  results={results}
                  onSelectResult={setSelectedResult}
                  onDetailOpen={() => setDetailDrawerOpen(true)}
                  onImportOutputFields={handleImportOutputFields}
                />

                <WorkflowNodeDetail
                  selectedNodeId={selectedNodeId}
                  selectedWorkflow={selectedWorkflow}
                  resultsLength={results.length}
                  onClose={() => setSelectedNodeId(null)}
                  updateWorkflowRequestInputValue={updateWorkflowRequestInputValue}
                />

                <WorkflowAddPanel
                  addPanelOpen={addPanelOpen}
                  addPanelRef={addPanelRef}
                  addPanelPos={addPanelPos}
                  view={view}
                  onRequestSelect={handleRequestSelect}
                  availableRequests={availableRequests}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <Empty description="请创建或选择一个工作流" />
            </div>
          )}
        </div>

        {/* Result detail drawer */}
        <Drawer
          open={detailDrawerOpen}
          onClose={() => setDetailDrawerOpen(false)}
          placement="right"
          width={720}
          extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setDetailDrawerOpen(false)} />}
          styles={{
            body: { padding: 0 },
            wrapper: { top: 64, height: 'calc(100vh - 88px)' },
          }}
          className="[&_.ant-drawer-content]:bg-white/95 [&_.ant-drawer-content]:backdrop-blur [&_.ant-drawer-content]:border [&_.ant-drawer-content]:border-gray-200 [&_.ant-drawer-content]:rounded-2xl [&_.ant-drawer-content]:shadow-lg"
        >
          {selectedResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-gray-800 truncate">{selectedResult.requestName}</div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500 whitespace-nowrap">
                    状态码 {selectedResult.statusCode ?? '--'} · 耗时 {getDurationText(selectedResult.durationMs)}
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
                <div className="text-sm font-semibold text-gray-700 mb-2">实际入参</div>
                <div className="border border-gray-200 rounded bg-white">
                  <Editor
                    height="180px"
                    defaultLanguage="json"
                    value={formatResponseData(selectedResult.requestInfo?.resolvedInputs || {})}
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
                <div className="text-sm font-semibold text-gray-700 mb-2">响应结果</div>
                <div className="border border-gray-200 rounded bg-white">
                  <Editor
                    height="320px"
                    defaultLanguage="json"
                    value={formatResponseData(selectedResult.responseData)}
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
              {selectedResult.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {selectedResult.error}
                </div>
              ) : null}
            </div>
          )}
        </Drawer>

        <Drawer
          open={runLogDrawerOpen}
          onClose={() => setRunLogDrawerOpen(false)}
          placement="right"
          width={960}
          title={selectedRunLog ? `${selectedRunLog.workflowName} · ${new Date(selectedRunLog.startedAt).toLocaleString()}` : '运行日志'}
        >
          {selectedRunLog ? (
            <div className="h-full flex gap-4">
              <div className="w-[260px] flex-shrink-0 border-r border-gray-100 pr-4 overflow-auto">
                <div className="space-y-2">
                  {selectedRunLog.nodes.map((node, index) => (
                    <div
                      key={node.requestId}
                      onClick={() => setSelectedRunLogNodeId(node.requestId)}
                      className={`rounded-xl border p-3 cursor-pointer ${
                        selectedRunLogNodeId === node.requestId
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          第 {index + 1} 步 · {node.requestName}
                        </div>
                        <Tag color={node.status === 'success' ? 'success' : 'error'} className="m-0">
                          {node.status === 'success' ? '成功' : '失败'}
                        </Tag>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        状态码 {node.statusCode ?? '--'} · 耗时 {getDurationText(node.durationMs)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-w-0 overflow-auto">
                {selectedRunLogNode ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-gray-800">{selectedRunLogNode.requestName}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {selectedRunLogNode.method} {selectedRunLogNode.url || '--'}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        状态码 {selectedRunLogNode.statusCode ?? '--'} · 耗时 {getDurationText(selectedRunLogNode.durationMs)}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2">实际入参</div>
                      <div className="border border-gray-200 rounded bg-white">
                        <Editor
                          height="180px"
                          defaultLanguage="json"
                          value={formatResponseData(selectedRunLogNode.requestInfo?.resolvedInputs || {})}
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
                      <div className="text-sm font-semibold text-gray-700 mb-2">请求快照</div>
                      <pre className="bg-gray-100 rounded p-3 text-xs whitespace-pre-wrap break-all">
                        {buildCurl(
                          selectedRunLogNode.requestInfo.url,
                          selectedRunLogNode.requestInfo.method,
                          selectedRunLogNode.requestInfo.params || {},
                          selectedRunLogNode.requestInfo.body
                        )}
                      </pre>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2">响应快照</div>
                      <div className="border border-gray-200 rounded bg-white">
                        <Editor
                          height="320px"
                          defaultLanguage="json"
                          value={formatResponseData(selectedRunLogNode.responseData)}
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

                    {selectedRunLogNode.error ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        {selectedRunLogNode.error}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Empty description="暂无节点详情" />
                )}
              </div>
            </div>
          ) : (
            <Empty description="暂无日志详情" />
          )}
        </Drawer>
      </Content>
    </>
  );
};
