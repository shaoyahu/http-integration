import React, { useCallback, useState } from 'react';
import { Layout, Button, Space, message, Empty, Drawer } from 'antd';
import { PlayCircleOutlined, MenuUnfoldOutlined, LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useWorkflowStore } from '../store/workflowStore';
import type { Workflow } from '../store/workflowStore';
import Editor from '@monaco-editor/react';
import { applyPathMapping, parseBodyValue, setNestedValue } from '../utils/requestPayload';
import {
  deleteWorkflowItem,
  fetchWorkflowAvailableRequests,
  fetchWorkflowState,
  healthCheck,
  proxyRequest,
  saveWorkflowItem,
  saveWorkflowSelection,
  saveWorkflowState,
  type WorkflowAvailableRequest,
  type WorkflowStatePayload,
} from '../api/http';
import { formatResponseData } from '../utils/response';
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

const { Content } = Layout;

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
  const canvasSizeRef = React.useRef(canvasSize);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addPanelPos, setAddPanelPos] = useState<{ x: number; y: number; afterRequestId: string | null }>({ x: 0, y: 0, afterRequestId: null });
  const [spaceDown, setSpaceDown] = useState(false);
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
  const lastSavedSerializedRef = React.useRef('');
  const lastSavedSnapshotRef = React.useRef<WorkflowStatePayload>({ workflows: [], selectedWorkflowId: null });
  const saveTimerRef = React.useRef<number | null>(null);
  const latestSaveRequestIdRef = React.useRef(0);
  const saveInFlightRef = React.useRef(false);
  const queuedPersistRef = React.useRef<WorkflowPersistRequest | null>(null);

  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId);
  const lastUpdated = selectedWorkflow?.updatedAt || selectedWorkflow?.createdAt;
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
    async (request: WorkflowPersistRequest) => {
      const serialized = serializeWorkflowSnapshot(request.snapshot);
      if (serialized === lastSavedSerializedRef.current) {
        return;
      }
      if (saveInFlightRef.current) {
        queuedPersistRef.current = request;
        return;
      }

      const requestId = latestSaveRequestIdRef.current + 1;
      latestSaveRequestIdRef.current = requestId;
      saveInFlightRef.current = true;
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
        if (queuedPersistRef.current) {
          const latestRequest = queuedPersistRef.current;
          queuedPersistRef.current = null;
          const latestSerialized = serializeWorkflowSnapshot(latestRequest.snapshot);
          if (latestSerialized !== lastSavedSerializedRef.current) {
            await persistWorkflowState(latestRequest);
          }
        }
      }
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
    const unsubscribe = useWorkflowStore.subscribe((state) => {
      if (!initializedRef.current) {
        return;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
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

  type Point = { x: number; y: number };

  const getEdgePoints = (edge: { sourceId: string; targetId: string }): { start: Point; end: Point } | null => {
    let start: Point | null = null;
    let end: Point | null = null;

    if (edge.sourceId === 'trigger') {
      start = { x: triggerPos.x + TRIGGER_WIDTH / 2, y: triggerPos.y + TRIGGER_HEIGHT };
    } else {
      const sourceNodePos = nodePositionsRef.current[edge.sourceId];
      if (sourceNodePos) {
        start = { x: sourceNodePos.x + NODE_WIDTH / 2, y: sourceNodePos.y + NODE_HEIGHT };
      }
    }

    const targetNodePos = nodePositionsRef.current[edge.targetId];
    if (targetNodePos) {
      end = { x: targetNodePos.x + NODE_WIDTH / 2, y: targetNodePos.y };
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
        targetX = triggerPos.x + TRIGGER_WIDTH / 2 - NODE_WIDTH / 2;
        targetY = triggerPos.y + TRIGGER_HEIGHT + MIN_NODE_VERTICAL_GAP;
      } else if (prevPos && !nextPos) {
        targetX = prevPos.x;
        targetY = prevPos.y + NODE_HEIGHT + MIN_NODE_VERTICAL_GAP;
      } else if (prevPos && nextPos) {
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
        const current = nodePositionsRef.current[dragId];
        if (current) {
          updateWorkflow(selectedWorkflow.id, { nodePositions: { ...nodePositionsRef.current } });
        }
      }
    }
    dragRef.current.id = null;
    dragRef.current.mode = null;
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

  const handleImportOutputFields = (result: any) => {
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
      const { cp1, cp2 } = getEdgeCurvePoints(start, end);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / scale;
      ctx.lineCap = 'round';
      ctx.setLineDash(dashed ? [6 / scale, 6 / scale] : []);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
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
        ctx.setLineDash([6 / view.scale, 6 / view.scale]);
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
          drawDefaultIcon(centerX, centerY, view.scale);
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
  }, [selectedWorkflow, nodePositions, selectedNodeId, selectedEdgeId, view, canvasSize, triggerPos, hoveredNodeId, connectingFrom, mousePos]);

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
        isLoadingState={isLoadingState}
        statusColor={statusColor}
        statusText={statusText}
        workflowSiderCollapsed={workflowSiderCollapsed}
        setWorkflowSiderCollapsed={setWorkflowSiderCollapsed}
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
              {/* Header */}
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
                  <WorkflowToolbar
                    view={view}
                    setView={setView}
                    canvasContainerRef={canvasContainerRef}
                    canvasSize={canvasSize}
                    selectedWorkflow={selectedWorkflow}
                    focusNode={focusNode}
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
                  workflows={workflows}
                  selectedWorkflowId={selectedWorkflowId}
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
