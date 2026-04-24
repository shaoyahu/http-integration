import { describe, expect, it } from 'vitest';
import type { WorkflowRunLog } from '../types/workflow';
import { buildRunLogLayout, getDefaultRunLogNodeId } from './workflowEditor';

const buildNode = (
  requestId: string,
  requestName: string,
  upstreamRequestIds: string[],
  downstreamRequestIds: string[]
) => ({
  requestId,
  requestName,
  method: 'GET' as const,
  url: `https://example.com/${requestId}`,
  status: 'success' as const,
  statusCode: 200,
  durationMs: 12,
  startedAt: '2026-04-21T00:00:00.000Z',
  finishedAt: '2026-04-21T00:00:00.012Z',
  upstreamRequestIds,
  downstreamRequestIds,
  requestInfo: {
    url: `https://example.com/${requestId}`,
    method: 'GET',
    headers: {},
    params: {},
    resolvedInputs: {},
  },
  responseData: { ok: true },
});

describe('workflowEditor run log helpers', () => {
  it('should build levels and branch paths for branch and merge logs', () => {
    const log: WorkflowRunLog = {
      id: 'log-1',
      workflowId: 'workflow-1',
      workflowName: '分支工作流',
      status: 'success',
      startedAt: '2026-04-21T00:00:00.000Z',
      finishedAt: '2026-04-21T00:00:01.000Z',
      durationMs: 1000,
      nodes: [
        buildNode('a', '节点 A', [], ['b', 'c']),
        buildNode('b', '节点 B', ['a'], ['d']),
        buildNode('c', '节点 C', ['a'], ['d']),
        buildNode('d', '节点 D', ['b', 'c'], []),
      ],
    };

    const layout = buildRunLogLayout(log);

    expect(layout.levels).toEqual([
      { level: 1, requestIds: ['a'] },
      { level: 2, requestIds: ['b', 'c'] },
      { level: 3, requestIds: ['d'] },
    ]);
    expect(layout.downstreamByRequestId.a).toEqual(['b', 'c']);
    expect(layout.upstreamByRequestId.d).toEqual(['b', 'c']);
    expect(layout.branchPaths).toEqual([
      ['a', 'b', 'd'],
      ['a', 'c', 'd'],
    ]);
  });

  it('should rebuild downstream relations from upstream metadata when needed', () => {
    const log: WorkflowRunLog = {
      id: 'log-2',
      workflowId: 'workflow-2',
      workflowName: '回填链路',
      status: 'success',
      startedAt: '2026-04-21T00:00:00.000Z',
      finishedAt: '2026-04-21T00:00:01.000Z',
      durationMs: 1000,
      nodes: [
        buildNode('root', 'Root', [], []),
        buildNode('child', 'Child', ['root'], []),
      ],
    };

    const layout = buildRunLogLayout(log);

    expect(layout.downstreamByRequestId.root).toEqual(['child']);
    expect(layout.branchPaths).toEqual([['root', 'child']]);
  });

  it('should prefer root nodes when choosing the default log node', () => {
    const log: WorkflowRunLog = {
      id: 'log-3',
      workflowId: 'workflow-3',
      workflowName: '默认节点',
      status: 'success',
      startedAt: '2026-04-21T00:00:00.000Z',
      finishedAt: '2026-04-21T00:00:01.000Z',
      durationMs: 1000,
      nodes: [
        buildNode('child', 'Child', ['root'], []),
        buildNode('root', 'Root', [], ['child']),
      ],
    };

    expect(getDefaultRunLogNodeId(log)).toBe('root');
  });
});
