// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file metrics-snapshot.test.ts
 * @description Behavioral tests for metrics-snapshot helpers (WU-2315)
 */

import { describe, it, expect, vi } from 'vitest';
import type { MetricsSnapshot } from '@lumenflow/metrics';
import {
  SKIP_GATES_AUDIT_FILENAME as READER_SKIP_GATES_AUDIT_FILENAME,
  parseSkipGatesAuditLine,
  buildDoraTelemetryRecords,
  emitDoraTelemetryRecords,
} from '../metrics-snapshot.js';
import {
  SKIP_GATES_AUDIT_FILENAME as WRITER_SKIP_GATES_AUDIT_FILENAME,
  buildSkipGatesAuditEntry,
} from '../wu-done.js';

function createSnapshotWithDora(): MetricsSnapshot {
  return {
    dora: {
      deploymentFrequency: {
        deploysPerWeek: 3.5,
        status: 'high',
      },
      leadTimeForChanges: {
        averageHours: 8,
        medianHours: 6,
        p90Hours: 20,
        status: 'elite',
      },
      changeFailureRate: {
        failurePercentage: 12.5,
        totalDeployments: 16,
        failures: 2,
        status: 'high',
      },
      meanTimeToRecovery: {
        averageHours: 2,
        incidents: 1,
        status: 'high',
      },
    },
  };
}

describe('WU-2315: skip-gates audit schema parity', () => {
  it('writer and reader share the same skip-gates audit filename', () => {
    expect(WRITER_SKIP_GATES_AUDIT_FILENAME).toBe(READER_SKIP_GATES_AUDIT_FILENAME);
  });

  it('reader parses writer-shaped skip-gates audit entries', () => {
    const entry = buildSkipGatesAuditEntry({
      id: 'WU-2315',
      reason: 'pre-existing',
      fixWU: 'WU-2316',
      worktreePath: '/repo/worktrees/framework-metrics-wu-2315',
      userName: 'Tom',
      userEmail: 'tom@example.com',
      commitHash: 'abc123',
      timestamp: new Date('2026-03-04T12:00:00.000Z'),
    });

    const parsed = parseSkipGatesAuditLine(JSON.stringify(entry));
    expect(parsed).not.toBeNull();
    expect(parsed?.wuId).toBe('WU-2315');
    expect(parsed?.reason).toBe('pre-existing');
    expect(parsed?.gate).toBe('all');
  });

  it('returns null for invalid skip-gates schema', () => {
    const missingGate = JSON.stringify({
      timestamp: '2026-03-04T12:00:00.000Z',
      wu_id: 'WU-2315',
      reason: 'missing gate',
    });
    expect(parseSkipGatesAuditLine(missingGate)).toBeNull();
  });
});

describe('WU-2315: DORA telemetry emission', () => {
  it('builds four DORA telemetry records from snapshot data', () => {
    const records = buildDoraTelemetryRecords(createSnapshotWithDora());
    expect(records).toHaveLength(4);
    expect(records.map((record) => record.metric)).toEqual([
      'dora.deployment_frequency',
      'dora.lead_time_hours',
      'dora.cfr_percent',
      'dora.mttr_hours',
    ]);
  });

  it('does not emit telemetry records in dry-run mode', () => {
    const emitRecord = vi.fn();
    const count = emitDoraTelemetryRecords(createSnapshotWithDora(), {
      dryRun: true,
      emitRecord,
    });
    expect(count).toBe(0);
    expect(emitRecord).not.toHaveBeenCalled();
  });

  it('emits four telemetry records in non-dry-run mode', () => {
    const emitRecord = vi.fn();
    const count = emitDoraTelemetryRecords(createSnapshotWithDora(), {
      dryRun: false,
      emitRecord,
    });
    expect(count).toBe(4);
    expect(emitRecord).toHaveBeenCalledTimes(4);
  });
});
