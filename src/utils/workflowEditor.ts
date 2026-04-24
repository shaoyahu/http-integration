import type { Workflow, WorkflowRequest } from '../store/workflowStore';
import type {
  WorkflowExecutionAnalysis,
  WorkflowExplanation,
  WorkflowExplanationStep,
  WorkflowInputUsage,
  WorkflowNodePosition,
  WorkflowRunLog,
  WorkflowRunNodeLog,
} from '../types/workflow';

interface AutoLayoutOptions {
  canvasWidth: number;
  triggerX: number;
  triggerY: number;
  triggerWidth: number;
  triggerHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  verticalGap: number;
  horizontalGap: number;
  snapSize?: number;
}

interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ViewportOptions {
  viewportWidth: number;
  viewportHeight: number;
  minScale?: number;
  maxScale?: number;
  padding?: number;
  topInset?: number;
}

export interface WorkflowRunLogLevel {
  level: number;
  requestIds: string[];
}

export interface WorkflowRunLogLayout {
  levelByRequestId: Record<string, number>;
  upstreamByRequestId: Record<string, string[]>;
  downstreamByRequestId: Record<string, string[]>;
  rootRequestIds: string[];
  leafRequestIds: string[];
  branchPaths: string[][];
  levels: WorkflowRunLogLevel[];
}

const REFERENCE_PATTERN = /^\{\{([^.\s]+)\.([^}]+)\}\}$/;
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

const getRequestOrderMap = (workflow: Workflow) =>
  new Map(workflow.requests.map((request, index) => [request.id, index]));

const uniqueIds = (ids: string[]) => Array.from(new Set(ids));

export const parseWorkflowReference = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(REFERENCE_PATTERN);
  if (!match) {
    return null;
  }
  return {
    requestId: match[1],
    fieldName: match[2],
  };
};

export const getNestedValue = (obj: unknown, path: string): unknown => {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const analyzeWorkflow = (workflow: Workflow): WorkflowExecutionAnalysis => {
  const requestIds = workflow.requests.map((request) => request.id);
  const requestSet = new Set(requestIds);
  const requestOrderMap = getRequestOrderMap(workflow);
  const upstreamByRequestId: Record<string, string[]> = {};
  const downstreamByRequestId: Record<string, string[]> = {};
  const triggerTargets: string[] = [];

  requestIds.forEach((requestId) => {
    upstreamByRequestId[requestId] = [];
    downstreamByRequestId[requestId] = [];
  });

  (workflow.edges || []).forEach((edge) => {
    if (!requestSet.has(edge.targetId)) {
      return;
    }

    if (edge.sourceId === 'trigger') {
      triggerTargets.push(edge.targetId);
      return;
    }

    if (!requestSet.has(edge.sourceId)) {
      return;
    }

    upstreamByRequestId[edge.targetId].push(edge.sourceId);
    downstreamByRequestId[edge.sourceId].push(edge.targetId);
  });

  Object.keys(upstreamByRequestId).forEach((requestId) => {
    upstreamByRequestId[requestId] = uniqueIds(upstreamByRequestId[requestId]).sort((left, right) =>
      (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0)
    );
  });

  Object.keys(downstreamByRequestId).forEach((requestId) => {
    downstreamByRequestId[requestId] = uniqueIds(downstreamByRequestId[requestId]).sort((left, right) =>
      (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0)
    );
  });

  const reachable = new Set<string>();
  const visitQueue = [...uniqueIds(triggerTargets)];

  while (visitQueue.length > 0) {
    const currentId = visitQueue.shift();
    if (!currentId || reachable.has(currentId)) {
      continue;
    }
    reachable.add(currentId);
    (downstreamByRequestId[currentId] || []).forEach((nextId) => {
      if (!reachable.has(nextId)) {
        visitQueue.push(nextId);
      }
    });
  }

  const reachableRequestIds = requestIds.filter((requestId) => reachable.has(requestId));
  const disconnectedRequestIds = requestIds.filter((requestId) => !reachable.has(requestId));
  const indegree = new Map<string, number>();
  reachableRequestIds.forEach((requestId) => {
    indegree.set(
      requestId,
      (upstreamByRequestId[requestId] || []).filter((parentId) => reachable.has(parentId)).length
    );
  });

  const levelByRequestId: Record<string, number> = {};
  const orderedRequestIds: string[] = [];
  const readyQueue = reachableRequestIds.filter((requestId) => (indegree.get(requestId) || 0) === 0);

  readyQueue.sort((left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0));

  while (readyQueue.length > 0) {
    const currentId = readyQueue.shift();
    if (!currentId) {
      continue;
    }

    orderedRequestIds.push(currentId);

    const parentLevels = (upstreamByRequestId[currentId] || [])
      .filter((parentId) => parentId in levelByRequestId)
      .map((parentId) => levelByRequestId[parentId] + 1);
    const hasTriggerParent = triggerTargets.includes(currentId);
    levelByRequestId[currentId] = Math.max(hasTriggerParent ? 1 : 0, ...parentLevels, 1);

    (downstreamByRequestId[currentId] || []).forEach((childId) => {
      if (!reachable.has(childId)) {
        return;
      }
      const nextIndegree = Math.max(0, (indegree.get(childId) || 0) - 1);
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        readyQueue.push(childId);
        readyQueue.sort((left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0));
      }
    });
  }

  const cyclicRequestIds = reachableRequestIds.filter((requestId) => !orderedRequestIds.includes(requestId));
  cyclicRequestIds.forEach((requestId) => {
    const parentLevel = Math.max(
      0,
      ...(upstreamByRequestId[requestId] || [])
        .filter((parentId) => parentId in levelByRequestId)
        .map((parentId) => levelByRequestId[parentId])
    );
    levelByRequestId[requestId] = Math.max(parentLevel + 1, orderedRequestIds.length > 0 ? 2 : 1);
    orderedRequestIds.push(requestId);
  });

  return {
    orderedRequestIds,
    reachableRequestIds,
    disconnectedRequestIds,
    levelByRequestId,
    upstreamByRequestId,
    downstreamByRequestId,
    cyclicRequestIds,
  };
};

const buildInputUsage = (request: WorkflowRequest, workflow: Workflow): WorkflowInputUsage[] =>
  (request.inputFields || []).map((field) => {
    const rawValue = request.inputValues?.[field.name];
    const reference = parseWorkflowReference(rawValue);
    if (reference) {
      const sourceRequest = workflow.requests.find((item) => item.id === reference.requestId);
      return {
        fieldName: field.name,
        required: field.required,
        sourceType: 'upstream',
        value: rawValue ?? null,
        sourceRequestId: reference.requestId,
        sourceRequestName: sourceRequest?.name || reference.requestId,
        sourceFieldName: reference.fieldName,
      };
    }
    if (typeof rawValue === 'string' && rawValue.trim() !== '') {
      return {
        fieldName: field.name,
        required: field.required,
        sourceType: 'static',
        value: rawValue,
      };
    }
    return {
      fieldName: field.name,
      required: field.required,
      sourceType: 'empty',
      value: null,
    };
  });

const buildStepDescription = (step: WorkflowExplanationStep) => {
  const urlText = step.url || '未配置地址';
  const upstreamText = step.upstreamLabels.length > 0
    ? `，上游来自 ${step.upstreamLabels.join('、')}`
    : '';
  const inputText = step.inputUsages.length > 0
    ? `，消费 ${step.inputUsages.map((usage) => {
        if (usage.sourceType === 'upstream') {
          return `${usage.fieldName} <- ${usage.sourceRequestName || usage.sourceRequestId} / ${usage.sourceFieldName}`;
        }
        if (usage.sourceType === 'static') {
          return `${usage.fieldName} <- 手动值`;
        }
        return `${usage.fieldName} 未赋值`;
      }).join('；')}`
    : '，当前没有显式入参';

  return `${step.requestName} 调用 ${step.method} ${urlText}${upstreamText}${inputText}。`;
};

export const buildWorkflowExplanation = (workflow: Workflow): WorkflowExplanation => {
  if (workflow.requests.length === 0) {
    return {
      summary: ['当前工作流还是空的，先从“请求”面板拖入一个请求节点。'],
      steps: [],
      disconnectedRequestIds: [],
      warnings: [],
    };
  }

  const analysis = analyzeWorkflow(workflow);
  const requestMap = new Map(workflow.requests.map((request) => [request.id, request]));
  const steps: WorkflowExplanationStep[] = analysis.orderedRequestIds
    .map((requestId) => {
      const request = requestMap.get(requestId);
      if (!request) {
        return null;
      }
      const inputUsages = buildInputUsage(request, workflow);
      const step: WorkflowExplanationStep = {
        requestId,
        requestName: request.name,
        method: request.method,
        url: request.url,
        level: analysis.levelByRequestId[requestId] || 1,
        description: '',
        upstreamRequestIds: analysis.upstreamByRequestId[requestId] || [],
        upstreamLabels: (analysis.upstreamByRequestId[requestId] || [])
          .map((parentId) => requestMap.get(parentId)?.name || parentId),
        inputUsages,
        isDisconnected: false,
      };
      step.description = buildStepDescription(step);
      return step;
    })
    .filter((step): step is WorkflowExplanationStep => Boolean(step));

  const warnings: string[] = [];
  if (analysis.cyclicRequestIds.length > 0) {
    warnings.push('检测到回环或异常依赖，解释和自动排列已按回退顺序处理。');
  }
  if (analysis.reachableRequestIds.length === 0) {
    warnings.push('当前没有从手动触发器出发的主链路。');
  }

  const summary: string[] = [];
  summary.push(`工作流“${workflow.name}”由手动触发器开始。`);

  if (steps.length > 0) {
    const chainText = steps.length <= 4
      ? steps.map((step) => step.requestName).join(' -> ')
      : `${steps[0].requestName} -> ${steps[1].requestName} -> ... -> ${steps[steps.length - 1].requestName}`;
    summary.push(`主执行链路包含 ${steps.length} 个节点，执行顺序为 ${chainText}。`);
  } else {
    summary.push('当前还没有和触发器连通的请求节点，运行时不会执行任何请求。');
  }

  if (analysis.disconnectedRequestIds.length > 0) {
    const labels = analysis.disconnectedRequestIds
      .map((requestId) => requestMap.get(requestId)?.name || requestId)
      .join('、');
    summary.push(`以下节点尚未接入主链路：${labels}。`);
  }

  return {
    summary,
    steps,
    disconnectedRequestIds: analysis.disconnectedRequestIds,
    warnings,
  };
};

export const autoLayoutWorkflowNodes = (
  workflow: Workflow,
  options: AutoLayoutOptions
): Record<string, WorkflowNodePosition> => {
  const {
    canvasWidth,
    triggerX,
    triggerY,
    triggerWidth,
    triggerHeight,
    nodeWidth,
    nodeHeight,
    verticalGap,
    horizontalGap,
    snapSize = 20,
  } = options;

  const analysis = analyzeWorkflow(workflow);
  const requestOrderMap = getRequestOrderMap(workflow);
  const centerX = triggerX + triggerWidth / 2;
  const positions: Record<string, WorkflowNodePosition> = {};

  const groupedByLevel = new Map<number, string[]>();
  analysis.orderedRequestIds.forEach((requestId) => {
    const level = analysis.levelByRequestId[requestId] || 1;
    const current = groupedByLevel.get(level) || [];
    current.push(requestId);
    groupedByLevel.set(level, current);
  });

  Array.from(groupedByLevel.keys())
    .sort((left, right) => left - right)
    .forEach((level) => {
      const requestIds = [...(groupedByLevel.get(level) || [])];
      requestIds.sort((left, right) => {
        const leftParents = analysis.upstreamByRequestId[left] || [];
        const rightParents = analysis.upstreamByRequestId[right] || [];
        const leftParentAverage = leftParents.length > 0
          ? leftParents.reduce((acc, parentId) => acc + (positions[parentId]?.x ?? centerX), 0) / leftParents.length
          : centerX;
        const rightParentAverage = rightParents.length > 0
          ? rightParents.reduce((acc, parentId) => acc + (positions[parentId]?.x ?? centerX), 0) / rightParents.length
          : centerX;
        if (leftParentAverage !== rightParentAverage) {
          return leftParentAverage - rightParentAverage;
        }
        return (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0);
      });

      const totalWidth = requestIds.length * nodeWidth + Math.max(0, requestIds.length - 1) * horizontalGap;
      const startX = centerX - totalWidth / 2;
      const y = triggerY + triggerHeight + verticalGap + (level - 1) * (nodeHeight + verticalGap);

      requestIds.forEach((requestId, index) => {
        positions[requestId] = {
          x: Math.round((startX + index * (nodeWidth + horizontalGap)) / snapSize) * snapSize,
          y: Math.round(y / snapSize) * snapSize,
        };
      });
    });

  if (analysis.disconnectedRequestIds.length > 0) {
    const placedYValues = Object.values(positions).map((position) => position.y);
    const disconnectedStartY = placedYValues.length > 0
      ? Math.max(...placedYValues) + nodeHeight + verticalGap * 2
      : triggerY + triggerHeight + verticalGap;
    const maxColumns = Math.max(1, Math.floor(Math.max(canvasWidth, triggerWidth) / (nodeWidth + horizontalGap)));
    const columns = Math.min(Math.max(2, maxColumns), Math.max(2, analysis.disconnectedRequestIds.length));
    const gridWidth = columns * nodeWidth + Math.max(0, columns - 1) * horizontalGap;
    const gridStartX = centerX - gridWidth / 2;

    analysis.disconnectedRequestIds.forEach((requestId, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions[requestId] = {
        x: Math.round((gridStartX + column * (nodeWidth + horizontalGap)) / snapSize) * snapSize,
        y: Math.round((disconnectedStartY + row * (nodeHeight + verticalGap)) / snapSize) * snapSize,
      };
    });
  }

  return positions;
};

export const getWorkflowLayoutBounds = (
  nodePositions: Record<string, WorkflowNodePosition>,
  options: Pick<AutoLayoutOptions, 'triggerX' | 'triggerY' | 'triggerWidth' | 'triggerHeight' | 'nodeWidth' | 'nodeHeight'>
): LayoutBounds => {
  const {
    triggerX,
    triggerY,
    triggerWidth,
    triggerHeight,
    nodeWidth,
    nodeHeight,
  } = options;

  const boxes = [
    { minX: triggerX, minY: triggerY, maxX: triggerX + triggerWidth, maxY: triggerY + triggerHeight },
    ...Object.values(nodePositions).map((position) => ({
      minX: position.x,
      minY: position.y,
      maxX: position.x + nodeWidth,
      maxY: position.y + nodeHeight,
    })),
  ];

  return boxes.reduce<LayoutBounds>(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.minX),
      minY: Math.min(acc.minY, box.minY),
      maxX: Math.max(acc.maxX, box.maxX),
      maxY: Math.max(acc.maxY, box.maxY),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
};

export const getViewportForBounds = (
  bounds: LayoutBounds,
  options: ViewportOptions
) => {
  const {
    viewportWidth,
    viewportHeight,
    minScale = 0.5,
    maxScale = 1.1,
    padding = 80,
    topInset = 0,
  } = options;

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
  const scale = Math.max(
    minScale,
    Math.min(
      maxScale,
      viewportWidth / contentWidth,
      viewportHeight / contentHeight,
      1
    )
  );
  const offsetX = Math.max(0, bounds.minX - (viewportWidth / scale - (bounds.maxX - bounds.minX)) / 2);
  const offsetY = bounds.minY - padding - topInset / scale;

  return {
    scale,
    offsetX,
    offsetY,
  };
};

export const maskSensitiveHeaders = (headers: Record<string, unknown> = {}) =>
  Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    acc[normalizedKey] = SENSITIVE_HEADER_NAMES.has(normalizedKey) ? '***' : String(value);
    return acc;
  }, {});

export const sortRunLogsByStartedAt = (logs: WorkflowRunLog[]) =>
  [...logs].sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

export const getDefaultRunLogNodeId = (log: WorkflowRunLog | null) => {
  if (!log || log.nodes.length === 0) {
    return null;
  }
  const nodeMap = getRunLogNodeMap(log.nodes);
  const rootNode = log.nodes.find((node) =>
    (node.upstreamRequestIds || []).filter((requestId) => nodeMap.has(requestId)).length === 0
  );
  return (
    log.nodes.find((node) => node.status === 'error')?.requestId
    || rootNode?.requestId
    || log.nodes[0].requestId
  );
};

export const getRunLogNodeMap = (nodes: WorkflowRunNodeLog[]) =>
  new Map(nodes.map((node) => [node.requestId, node]));

const sortRunLogRequestIds = (
  requestIds: Iterable<string>,
  requestOrderMap: Map<string, number>
) => uniqueIds(Array.from(requestIds).filter((requestId) => requestOrderMap.has(requestId))).sort(
  (left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0)
);

export const buildRunLogLayout = (log: WorkflowRunLog | null): WorkflowRunLogLayout => {
  if (!log || log.nodes.length === 0) {
    return {
      levelByRequestId: {},
      upstreamByRequestId: {},
      downstreamByRequestId: {},
      rootRequestIds: [],
      leafRequestIds: [],
      branchPaths: [],
      levels: [],
    };
  }

  const requestOrderMap = new Map(log.nodes.map((node, index) => [node.requestId, index]));
  const upstreamSets = new Map(log.nodes.map((node) => [node.requestId, new Set<string>()]));
  const downstreamSets = new Map(log.nodes.map((node) => [node.requestId, new Set<string>()]));

  log.nodes.forEach((node) => {
    const upstreamIds = sortRunLogRequestIds(node.upstreamRequestIds || [], requestOrderMap);
    const downstreamIds = sortRunLogRequestIds(node.downstreamRequestIds || [], requestOrderMap);

    upstreamIds.forEach((parentId) => {
      upstreamSets.get(node.requestId)?.add(parentId);
      downstreamSets.get(parentId)?.add(node.requestId);
    });

    downstreamIds.forEach((childId) => {
      downstreamSets.get(node.requestId)?.add(childId);
      upstreamSets.get(childId)?.add(node.requestId);
    });
  });

  const upstreamByRequestId = Object.fromEntries(
    log.nodes.map((node) => [
      node.requestId,
      sortRunLogRequestIds(upstreamSets.get(node.requestId) || [], requestOrderMap),
    ])
  );

  const downstreamByRequestId = Object.fromEntries(
    log.nodes.map((node) => [
      node.requestId,
      sortRunLogRequestIds(downstreamSets.get(node.requestId) || [], requestOrderMap),
    ])
  );

  const rootRequestIds = log.nodes
    .map((node) => node.requestId)
    .filter((requestId) => (upstreamByRequestId[requestId] || []).length === 0);
  const safeRootRequestIds = rootRequestIds.length > 0 ? rootRequestIds : [log.nodes[0].requestId];

  const indegree = new Map(
    log.nodes.map((node) => [node.requestId, (upstreamByRequestId[node.requestId] || []).length])
  );
  const levelByRequestId: Record<string, number> = {};
  const orderedRequestIds: string[] = [];
  const visited = new Set<string>();
  const readyQueue = [...safeRootRequestIds];

  readyQueue.sort((left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0));

  while (readyQueue.length > 0) {
    const currentId = readyQueue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    orderedRequestIds.push(currentId);

    const parentLevel = Math.max(
      0,
      ...(upstreamByRequestId[currentId] || []).map((parentId) => levelByRequestId[parentId] || 0)
    );
    levelByRequestId[currentId] = Math.max(1, parentLevel + 1);

    (downstreamByRequestId[currentId] || []).forEach((childId) => {
      const nextIndegree = Math.max(0, (indegree.get(childId) || 0) - 1);
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        readyQueue.push(childId);
        readyQueue.sort((left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0));
      }
    });
  }

  log.nodes
    .map((node) => node.requestId)
    .filter((requestId) => !visited.has(requestId))
    .sort((left, right) => (requestOrderMap.get(left) ?? 0) - (requestOrderMap.get(right) ?? 0))
    .forEach((requestId) => {
      const parentLevel = Math.max(
        0,
        ...(upstreamByRequestId[requestId] || []).map((parentId) => levelByRequestId[parentId] || 0)
      );
      levelByRequestId[requestId] = Math.max(1, parentLevel + 1);
      orderedRequestIds.push(requestId);
      visited.add(requestId);
    });

  const levelMap = new Map<number, string[]>();
  orderedRequestIds.forEach((requestId) => {
    const level = levelByRequestId[requestId] || 1;
    const bucket = levelMap.get(level) || [];
    bucket.push(requestId);
    levelMap.set(level, bucket);
  });

  const levels = Array.from(levelMap.entries())
    .sort(([leftLevel], [rightLevel]) => leftLevel - rightLevel)
    .map(([level, requestIds]) => ({ level, requestIds }));

  const leafRequestIds = orderedRequestIds.filter(
    (requestId) => (downstreamByRequestId[requestId] || []).length === 0
  );

  const branchPaths: string[][] = [];
  const pathKeys = new Set<string>();

  const appendBranchPath = (path: string[]) => {
    const key = path.join('>');
    if (!pathKeys.has(key) && path.length > 0) {
      pathKeys.add(key);
      branchPaths.push(path);
    }
  };

  const walkBranch = (requestId: string, path: string[], pathSet: Set<string>) => {
    if (pathSet.has(requestId)) {
      appendBranchPath([...path, requestId]);
      return;
    }

    const nextPath = [...path, requestId];
    const children = downstreamByRequestId[requestId] || [];
    if (children.length === 0) {
      appendBranchPath(nextPath);
      return;
    }

    const nextPathSet = new Set(pathSet);
    nextPathSet.add(requestId);
    children.forEach((childId) => walkBranch(childId, nextPath, nextPathSet));
  };

  safeRootRequestIds.forEach((requestId) => walkBranch(requestId, [], new Set<string>()));

  if (branchPaths.length === 0) {
    appendBranchPath(orderedRequestIds);
  }

  return {
    levelByRequestId,
    upstreamByRequestId,
    downstreamByRequestId,
    rootRequestIds: safeRootRequestIds,
    leafRequestIds,
    branchPaths,
    levels,
  };
};
