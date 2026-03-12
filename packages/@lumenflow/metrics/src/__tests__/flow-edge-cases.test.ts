// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Edge case tests for SPACE / flow metrics calculations.
 *
 * Covers:
 * - Flow state with all same-status WUs
 * - Bottleneck analysis with diamond dependencies
 * - Critical path through complex DAGs
 * - Metrics snapshot type filtering
 * - Lane health status classification edges
 */
import { describe, it, expect } from 'vitest';
import { calculateFlowState } from '../flow/calculate-flow-state.js';
import {
  topologicalSort,
  criticalPath,
  impactScore,
  analyzeBottlenecks,
  getBottleneckAnalysis,
  type DependencyGraph,
} from '../flow/analyze-bottlenecks.js';
import { captureMetricsSnapshot } from '../flow/capture-metrics-snapshot.js';
import type { WUMetrics, DependencyGraphNode } from '../types.js';

function makeNode(
  id: string,
  blocks: string[] = [],
  blockedBy: string[] = [],
  status = 'ready',
): DependencyGraphNode {
  return { id, title: `Title: ${id}`, blocks, blockedBy, status };
}

describe('flow state edge cases', () => {
  it('handles single WU in each status', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'A', status: 'ready' },
      { id: 'WU-2', title: 'b', lane: 'A', status: 'in_progress' },
      { id: 'WU-3', title: 'c', lane: 'A', status: 'blocked' },
      { id: 'WU-4', title: 'd', lane: 'A', status: 'waiting' },
      { id: 'WU-5', title: 'e', lane: 'A', status: 'done' },
    ];
    const result = calculateFlowState(wuMetrics);
    expect(result.ready).toBe(1);
    expect(result.inProgress).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.waiting).toBe(1);
    expect(result.done).toBe(1);
    expect(result.totalActive).toBe(4);
  });

  it('all done WUs yield totalActive of 0', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'A', status: 'done' },
      { id: 'WU-2', title: 'b', lane: 'A', status: 'done' },
    ];
    const result = calculateFlowState(wuMetrics);
    expect(result.totalActive).toBe(0);
    expect(result.done).toBe(2);
  });
});

describe('bottleneck analysis edge cases', () => {
  it('diamond dependency pattern: single node blocks two which converge', () => {
    // WU-1 blocks WU-2 and WU-3, both block WU-4
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2', 'WU-3'], [])],
      ['WU-2', makeNode('WU-2', ['WU-4'], ['WU-1'])],
      ['WU-3', makeNode('WU-3', ['WU-4'], ['WU-1'])],
      ['WU-4', makeNode('WU-4', [], ['WU-2', 'WU-3'])],
    ]);
    const bottlenecks = analyzeBottlenecks(graph, 4);
    expect(bottlenecks[0]?.id).toBe('WU-1');
    expect(bottlenecks[0]?.score).toBe(3);
  });

  it('impactScore returns 0 for a node not in the graph', () => {
    const graph: DependencyGraph = new Map([['WU-1', makeNode('WU-1', [], [])]]);
    expect(impactScore(graph, 'WU-999')).toBe(0);
  });

  it('impactScore returns 0 for a done node', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], [], 'done')],
      ['WU-2', makeNode('WU-2', [], ['WU-1'])],
    ]);
    expect(impactScore(graph, 'WU-1')).toBe(0);
  });

  it('impactScore returns 0 for a leaf node (no downstream)', () => {
    const graph: DependencyGraph = new Map([['WU-1', makeNode('WU-1', [], [])]]);
    expect(impactScore(graph, 'WU-1')).toBe(0);
  });

  it('analyzeBottlenecks limits output to requested count', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-3'], [])],
      ['WU-2', makeNode('WU-2', ['WU-3'], [])],
      ['WU-3', makeNode('WU-3', [], ['WU-1', 'WU-2'])],
    ]);
    const bottlenecks = analyzeBottlenecks(graph, 1);
    expect(bottlenecks).toHaveLength(1);
  });
});

describe('topological sort edge cases', () => {
  it('single node graph', () => {
    const graph: DependencyGraph = new Map([['WU-1', makeNode('WU-1', [], [])]]);
    const result = topologicalSort(graph);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toEqual(['WU-1']);
  });

  it('all done nodes yield empty order', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], [], 'done')],
      ['WU-2', makeNode('WU-2', [], ['WU-1'], 'done')],
    ]);
    const result = topologicalSort(graph);
    expect(result.order).toEqual([]);
    expect(result.hasCycle).toBe(false);
  });

  it('detects a simple cycle between two nodes', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], ['WU-2'])],
      ['WU-2', makeNode('WU-2', ['WU-1'], ['WU-1'])],
    ]);
    const result = topologicalSort(graph);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodes).toBeDefined();
    expect(result.cycleNodes?.length).toBeGreaterThan(0);
  });
});

describe('critical path edge cases', () => {
  it('returns empty path for all-done graph', () => {
    const graph: DependencyGraph = new Map([['WU-1', makeNode('WU-1', [], [], 'done')]]);
    const result = criticalPath(graph);
    expect(result.path).toEqual([]);
    expect(result.length).toBe(0);
  });

  it('returns warning for cyclic graph', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], ['WU-2'])],
      ['WU-2', makeNode('WU-2', ['WU-1'], ['WU-1'])],
    ]);
    const result = criticalPath(graph);
    expect(result.warning).toBeDefined();
    expect(result.cycleNodes).toBeDefined();
  });

  it('finds correct path in 3-node chain', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], [])],
      ['WU-2', makeNode('WU-2', ['WU-3'], ['WU-1'])],
      ['WU-3', makeNode('WU-3', [], ['WU-2'])],
    ]);
    const result = criticalPath(graph);
    expect(result.path).toEqual(['WU-1', 'WU-2', 'WU-3']);
    expect(result.length).toBe(3);
  });
});

describe('getBottleneckAnalysis', () => {
  it('returns both bottlenecks and critical path', () => {
    const graph: DependencyGraph = new Map([
      ['WU-1', makeNode('WU-1', ['WU-2'], [])],
      ['WU-2', makeNode('WU-2', [], ['WU-1'])],
    ]);
    const analysis = getBottleneckAnalysis(graph, 5);
    expect(analysis.bottlenecks).toBeDefined();
    expect(analysis.criticalPath).toBeDefined();
    expect(analysis.bottlenecks.length).toBeGreaterThan(0);
  });

  it('uses default limit of 10', () => {
    const graph: DependencyGraph = new Map([['WU-1', makeNode('WU-1', [], [])]]);
    const analysis = getBottleneckAnalysis(graph);
    expect(analysis.bottlenecks).toBeDefined();
  });
});

describe('captureMetricsSnapshot edge cases', () => {
  it('captures only DORA when type is "dora"', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'dora',
    });
    expect(snapshot.dora).toBeDefined();
    expect(snapshot.lanes).toBeUndefined();
    expect(snapshot.flow).toBeUndefined();
  });

  it('captures only lanes when type is "lanes"', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'lanes',
    });
    expect(snapshot.dora).toBeUndefined();
    expect(snapshot.lanes).toBeDefined();
    expect(snapshot.flow).toBeUndefined();
  });

  it('captures only flow when type is "flow"', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'flow',
    });
    expect(snapshot.dora).toBeUndefined();
    expect(snapshot.lanes).toBeUndefined();
    expect(snapshot.flow).toBeDefined();
  });

  it('captures all metric types when type is "all"', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'all',
    });
    expect(snapshot.dora).toBeDefined();
    expect(snapshot.lanes).toBeDefined();
    expect(snapshot.flow).toBeDefined();
  });

  it('computes lane health status correctly for mixed WU statuses', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [
        { id: 'WU-1', title: 'a', lane: 'Ops', status: 'done', cycleTimeHours: 10 },
        { id: 'WU-2', title: 'b', lane: 'Ops', status: 'in_progress' },
        { id: 'WU-3', title: 'c', lane: 'Ops', status: 'blocked' },
        { id: 'WU-4', title: 'd', lane: 'Dev', status: 'done', cycleTimeHours: 20 },
      ],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'lanes',
    });

    expect(snapshot.lanes).toBeDefined();
    expect(snapshot.lanes?.totalActive).toBe(2);
    expect(snapshot.lanes?.totalBlocked).toBe(1);
    expect(snapshot.lanes?.totalCompleted).toBe(2);

    const opsLane = snapshot.lanes?.lanes.find((l) => l.lane === 'Ops');
    expect(opsLane).toBeDefined();
    expect(opsLane?.status).toBe('at-risk');
    expect(opsLane?.wusCompleted).toBe(1);
    expect(opsLane?.wusInProgress).toBe(1);
    expect(opsLane?.wusBlocked).toBe(1);
  });

  it('lane health is "healthy" when no WUs are blocked', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [
        { id: 'WU-1', title: 'a', lane: 'Ops', status: 'in_progress' },
        { id: 'WU-2', title: 'b', lane: 'Ops', status: 'done', cycleTimeHours: 5 },
      ],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'lanes',
    });
    const opsLane = snapshot.lanes?.lanes.find((l) => l.lane === 'Ops');
    expect(opsLane?.status).toBe('healthy');
  });

  it('lane health is "blocked" when all in-progress are blocked', () => {
    const snapshot = captureMetricsSnapshot({
      commits: [],
      wuMetrics: [
        { id: 'WU-1', title: 'a', lane: 'Ops', status: 'blocked' },
        { id: 'WU-2', title: 'b', lane: 'Ops', status: 'blocked' },
      ],
      skipGatesEntries: [],
      weekStart: new Date('2026-03-01'),
      weekEnd: new Date('2026-03-07'),
      type: 'lanes',
    });
    const opsLane = snapshot.lanes?.lanes.find((l) => l.lane === 'Ops');
    expect(opsLane?.status).toBe('blocked');
  });
});
