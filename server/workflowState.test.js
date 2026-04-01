import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskSensitiveHeaders,
  normalizeWorkflowEdge,
  normalizeWorkflowRunLog,
  normalizeWorkflowState,
} from './workflowState.js';

test('normalizeWorkflowState keeps valid workflow edges across persistence boundaries', () => {
  const normalized = normalizeWorkflowState({
    workflows: [
      {
        id: 'wf-1',
        name: 'Workflow 1',
        requests: [
          { id: 'req-a', name: 'A' },
          { id: 'req-b', name: 'B' },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'trigger', targetId: 'req-a' },
          { id: 'edge-2', sourceId: 'req-a', targetId: 'req-b' },
        ],
      },
    ],
    selectedWorkflowId: 'wf-1',
  });

  assert.equal(normalized.workflows.length, 1);
  assert.equal(normalized.workflows[0].edges.length, 2);
  assert.deepEqual(
    normalized.workflows[0].edges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
    [
      { sourceId: 'trigger', targetId: 'req-a' },
      { sourceId: 'req-a', targetId: 'req-b' },
    ]
  );
});

test('normalizeWorkflowState drops edges that point to missing requests', () => {
  const normalized = normalizeWorkflowState({
    workflows: [
      {
        id: 'wf-1',
        requests: [
          { id: 'req-a', name: 'A' },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'trigger', targetId: 'req-a' },
          { id: 'edge-2', sourceId: 'req-a', targetId: 'req-missing' },
          { id: 'edge-3', sourceId: 'req-missing', targetId: 'req-a' },
        ],
      },
    ],
    selectedWorkflowId: 'wf-1',
  });

  assert.equal(normalized.workflows[0].edges.length, 1);
  assert.equal(normalized.workflows[0].edges[0].id, 'edge-1');
});

test('normalizeWorkflowEdge synthesizes a stable edge id when legacy data omits one', () => {
  const edge = normalizeWorkflowEdge(
    { sourceId: 'trigger', targetId: 'req-a' },
    new Set(['req-a']),
    3
  );

  assert.equal(edge?.id, 'edge-3-trigger-req-a');
});

test('maskSensitiveHeaders redacts authentication related headers', () => {
  const masked = maskSensitiveHeaders({
    Authorization: 'Bearer token',
    Cookie: 'a=b',
    Accept: 'application/json',
  });

  assert.deepEqual(masked, {
    Authorization: '***',
    Cookie: '***',
    Accept: 'application/json',
  });
});

test('normalizeWorkflowRunLog preserves nodes and masks request headers', () => {
  const normalized = normalizeWorkflowRunLog({
    workflowId: 'wf-1',
    workflowName: 'Workflow 1',
    status: 'error',
    startedAt: '2026-04-01T05:00:00.000Z',
    finishedAt: '2026-04-01T05:00:01.000Z',
    durationMs: 1000,
    nodes: [
      {
        requestId: 'req-a',
        requestName: 'Request A',
        method: 'GET',
        url: 'https://example.com',
        status: 'error',
        statusCode: 401,
        durationMs: 100,
        startedAt: '2026-04-01T05:00:00.100Z',
        finishedAt: '2026-04-01T05:00:00.200Z',
        requestInfo: {
          url: 'https://example.com',
          method: 'GET',
          headers: {
            Authorization: 'Bearer secret',
            Accept: 'application/json',
          },
          params: {
            id: 1,
          },
          resolvedInputs: {
            userId: '123',
          },
        },
        responseData: {
          error: 'unauthorized',
        },
        error: 'Unauthorized',
      },
    ],
  });

  assert.equal(normalized.workflowId, 'wf-1');
  assert.equal(normalized.nodes.length, 1);
  assert.equal(normalized.nodes[0].requestInfo.headers.Authorization, '***');
  assert.equal(normalized.nodes[0].requestInfo.headers.Accept, 'application/json');
  assert.deepEqual(normalized.nodes[0].requestInfo.params, { id: '1' });
  assert.deepEqual(normalized.nodes[0].requestInfo.resolvedInputs, { userId: '123' });
});
