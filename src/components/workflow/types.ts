// Canvas constants
export const NODE_SIZE = 64;
export const NODE_WIDTH = NODE_SIZE;
export const NODE_HEIGHT = NODE_SIZE;
export const DEFAULT_ICON_URL = '/icons/default-icon.png';
export const TRIGGER_WIDTH = 180;
export const TRIGGER_HEIGHT = 64;
export const MIN_CANVAS_WIDTH = 0;
export const MIN_CANVAS_HEIGHT = 0;
export const COMPACT_NODE_SCALE = 0.85;
export const ORTHOGONAL_GAP = 30;
export const ROUTE_PADDING = 14;
export const ADD_PANEL_WIDTH = 280;
export const ADD_PANEL_HEIGHT = 300;
export const MIN_NODE_VERTICAL_GAP = 80;
export const MIN_NODE_HORIZONTAL_GAP = 80;

// Types
export type Point = { x: number; y: number };
export type RouteObstacle = { id: string; x: number; y: number; w: number; h: number };

// Utility functions
export const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

export const drawDefaultIcon = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number) => {
  const outerRadius = 18 / scale;
  const innerRadius = 10 / scale;
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

export const snapToGrid = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

export const clampOffset = (offset: number, _viewSize: number, _contentSize: number) => {
  return offset;
};

export const isRectOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const isPointInsideRect = (point: Point, rect: { x1: number; y1: number; x2: number; y2: number }) =>
  point.x > rect.x1 && point.x < rect.x2 && point.y > rect.y1 && point.y < rect.y2;

export const isSegmentBlocked = (a: Point, b: Point, rects: Array<{ x1: number; y1: number; x2: number; y2: number }>) => {
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

export const simplifyOrthogonalPath = (points: Point[]) => {
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

export const tryBuildOrthogonalPath = (
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

export const drawCurveConnection = (
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  scale: number,
  lineWidth: number = 2,
  dashed: boolean = true
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
  ctx.lineWidth = lineWidth / scale;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [6 / scale, 6 / scale] : []);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);
};
