// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Edge case tests for DORA metrics calculations.
 *
 * Complements the happy-path coverage in __tests__/dora/ with edge cases:
 * - Single data point scenarios
 * - Overlapping time windows
 * - Empty data across all metric types
 * - Boundary values at classification thresholds
 */
import { describe, it, expect } from 'vitest';
import {
  calculateDeploymentFrequency,
  calculateLeadTime,
  calculateCFR,
  calculateMTTR,
  calculateDORAMetrics,
  identifyEmergencyFixes,
} from '../dora/calculate-dora-metrics.js';
import type { GitCommit, WUMetrics, SkipGatesEntry } from '../types.js';

describe('DORA edge cases: deployment frequency', () => {
  it('counts exactly 1 commit for a 1-deploy high classification', () => {
    const weekStart = new Date('2026-03-01');
    const weekEnd = new Date('2026-03-07');
    const commits: GitCommit[] = [
      { hash: 'single', timestamp: new Date('2026-03-03'), message: 'feat: only one' },
    ];
    const result = calculateDeploymentFrequency(commits, weekStart, weekEnd);
    expect(result.deploysPerWeek).toBe(1);
    expect(result.status).toBe('high');
  });

  it('counts exactly 5 commits at the elite/high boundary', () => {
    const weekStart = new Date('2026-03-01');
    const weekEnd = new Date('2026-03-07');
    const commits: GitCommit[] = Array.from({ length: 5 }, (_, i) => ({
      hash: `h${i}`,
      timestamp: new Date('2026-03-03'),
      message: `feat: ${i}`,
    }));
    const result = calculateDeploymentFrequency(commits, weekStart, weekEnd);
    expect(result.deploysPerWeek).toBe(5);
    expect(result.status).toBe('high');
  });

  it('includes commits at exact weekStart and weekEnd timestamps', () => {
    const weekStart = new Date('2026-03-01T00:00:00.000Z');
    const weekEnd = new Date('2026-03-07T23:59:59.999Z');
    const commits: GitCommit[] = [
      { hash: 'start', timestamp: weekStart, message: 'feat: at start' },
      { hash: 'end', timestamp: weekEnd, message: 'feat: at end' },
    ];
    const result = calculateDeploymentFrequency(commits, weekStart, weekEnd);
    expect(result.deploysPerWeek).toBe(2);
  });

  it('excludes commits just outside the time window', () => {
    const weekStart = new Date('2026-03-01T00:00:00.001Z');
    const weekEnd = new Date('2026-03-07T23:59:59.999Z');
    const commits: GitCommit[] = [
      { hash: 'before', timestamp: new Date('2026-03-01T00:00:00.000Z'), message: 'before' },
      { hash: 'inside', timestamp: new Date('2026-03-03T12:00:00.000Z'), message: 'inside' },
    ];
    const result = calculateDeploymentFrequency(commits, weekStart, weekEnd);
    expect(result.deploysPerWeek).toBe(1);
  });
});

describe('DORA edge cases: lead time', () => {
  it('handles single WU metric correctly', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'solo', lane: 'Ops', status: 'done', cycleTimeHours: 12 },
    ];
    const result = calculateLeadTime(wuMetrics);
    expect(result.averageHours).toBe(12);
    expect(result.medianHours).toBe(12);
    expect(result.p90Hours).toBe(12);
    expect(result.status).toBe('elite');
  });

  it('filters out non-numeric cycle times without crashing', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'Ops', status: 'done' },
      { id: 'WU-2', title: 'b', lane: 'Ops', status: 'in_progress' },
    ];
    const result = calculateLeadTime(wuMetrics);
    expect(result.averageHours).toBe(0);
    expect(result.status).toBe('low');
  });

  it('rounds averageHours to one decimal place', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'Ops', status: 'done', cycleTimeHours: 10 },
      { id: 'WU-2', title: 'b', lane: 'Ops', status: 'done', cycleTimeHours: 11 },
      { id: 'WU-3', title: 'c', lane: 'Ops', status: 'done', cycleTimeHours: 12 },
    ];
    const result = calculateLeadTime(wuMetrics);
    expect(result.averageHours).toBe(11);
  });

  it('returns high status at exactly 24h boundary', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'Ops', status: 'done', cycleTimeHours: 24 },
    ];
    const result = calculateLeadTime(wuMetrics);
    expect(result.status).toBe('high');
  });

  it('returns elite status at just under 24h', () => {
    const wuMetrics: WUMetrics[] = [
      { id: 'WU-1', title: 'a', lane: 'Ops', status: 'done', cycleTimeHours: 23.9 },
    ];
    const result = calculateLeadTime(wuMetrics);
    expect(result.status).toBe('elite');
  });
});

describe('DORA edge cases: change failure rate', () => {
  it('handles no failures with commits', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'feat: a' },
    ];
    const result = calculateCFR(commits, []);
    expect(result.failurePercentage).toBe(0);
    expect(result.totalDeployments).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.status).toBe('elite');
  });

  it('handles all-failure scenario', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'feat: a' },
    ];
    const entries: SkipGatesEntry[] = [
      { timestamp: new Date(), wuId: 'WU-1', reason: 'broke', gate: 'test' },
    ];
    const result = calculateCFR(commits, entries);
    expect(result.failurePercentage).toBe(100);
    expect(result.status).toBe('low');
  });

  it('handles exactly 15% boundary (elite/high)', () => {
    const commits: GitCommit[] = Array.from({ length: 100 }, (_, i) => ({
      hash: `h${i}`,
      timestamp: new Date(),
      message: `feat: ${i}`,
    }));
    const entries: SkipGatesEntry[] = Array.from({ length: 15 }, (_, i) => ({
      timestamp: new Date(),
      wuId: `WU-${i}`,
      reason: 'test',
      gate: 'lint',
    }));
    const result = calculateCFR(commits, entries);
    expect(result.failurePercentage).toBe(15);
    expect(result.status).toBe('high');
  });
});

describe('DORA edge cases: MTTR', () => {
  it('handles multiple emergency fix pairs and averages their recovery times', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date('2026-01-01T00:00:00Z'), message: 'EMERGENCY: break1' },
      { hash: 'b', timestamp: new Date('2026-01-01T01:00:00Z'), message: 'EMERGENCY: fix1' },
      { hash: 'c', timestamp: new Date('2026-01-02T00:00:00Z'), message: 'EMERGENCY: break2' },
      { hash: 'd', timestamp: new Date('2026-01-02T03:00:00Z'), message: 'EMERGENCY: fix2' },
    ];
    const result = calculateMTTR(commits);
    expect(result.incidents).toBe(2);
    expect(result.averageHours).toBe(2);
  });

  it('ignores trailing odd emergency fix (unpaired)', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date('2026-01-01T00:00:00Z'), message: 'EMERGENCY: break' },
      { hash: 'b', timestamp: new Date('2026-01-01T00:30:00Z'), message: 'EMERGENCY: fix' },
      { hash: 'c', timestamp: new Date('2026-01-02T00:00:00Z'), message: 'EMERGENCY: orphan' },
    ];
    const result = calculateMTTR(commits);
    expect(result.incidents).toBe(1);
    expect(result.averageHours).toBe(0.5);
  });

  it('returns elite for MTTR under 1 hour', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date('2026-01-01T00:00:00Z'), message: 'EMERGENCY: break' },
      { hash: 'b', timestamp: new Date('2026-01-01T00:30:00Z'), message: 'EMERGENCY: fix' },
    ];
    const result = calculateMTTR(commits);
    expect(result.averageHours).toBe(0.5);
    expect(result.status).toBe('elite');
  });
});

describe('DORA edge cases: identifyEmergencyFixes', () => {
  it('matches EMERGENCY substring in any position', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'feat: NON_EMERGENCY update' },
    ];
    // The function uses .includes('EMERGENCY'), so any substring match counts
    const result = identifyEmergencyFixes(commits);
    expect(result).toHaveLength(1);
  });

  it('does not match lowercase emergency', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'fix: emergency hotfix' },
    ];
    const result = identifyEmergencyFixes(commits);
    expect(result).toHaveLength(0);
  });

  it('matches EMERGENCY anywhere in message', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'foo EMERGENCY bar' },
    ];
    const result = identifyEmergencyFixes(commits);
    expect(result).toHaveLength(1);
  });

  it('matches fix(EMERGENCY) pattern', () => {
    const commits: GitCommit[] = [
      { hash: 'a', timestamp: new Date(), message: 'fix(EMERGENCY): restored service' },
    ];
    const result = identifyEmergencyFixes(commits);
    expect(result).toHaveLength(1);
  });
});

describe('DORA edge cases: calculateDORAMetrics integration', () => {
  it('handles entirely empty inputs gracefully', () => {
    const weekStart = new Date('2026-03-01');
    const weekEnd = new Date('2026-03-07');
    const result = calculateDORAMetrics([], [], [], weekStart, weekEnd);

    expect(result.deploymentFrequency.deploysPerWeek).toBe(0);
    expect(result.deploymentFrequency.status).toBe('low');
    expect(result.leadTimeForChanges.averageHours).toBe(0);
    expect(result.leadTimeForChanges.status).toBe('low');
    expect(result.changeFailureRate.failurePercentage).toBe(0);
    expect(result.meanTimeToRecovery.incidents).toBe(0);
    expect(result.meanTimeToRecovery.status).toBe('elite');
  });
});
