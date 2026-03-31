import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkflowEdge, normalizeWorkflowState } from './workflowState.js';

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
