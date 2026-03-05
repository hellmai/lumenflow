// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import {
  parseCostEventLine,
  readCostEvents,
  summarizeCostEvents,
  formatCostSummary,
} from '../cost-summary.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'cost-summary-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('cost-summary parser', () => {
  it('parses valid cost lines into normalized events', () => {
    const parsed = parseCostEventLine(
      JSON.stringify({
        timestamp: '2026-03-05T00:00:00.000Z',
        source_type: 'cost',
        operation: 'llm.classification',
        model: 'gpt-4o-mini',
        input_tokens: 120,
        output_tokens: 45,
        cost_usd: 0.01234,
        wu_id: 'WU-2316',
        agent_id: 'agent-1',
        session_id: 'session-1',
      }),
    );

    expect(parsed).toEqual({
      timestamp: '2026-03-05T00:00:00.000Z',
      sourceType: 'cost',
      operation: 'llm.classification',
      model: 'gpt-4o-mini',
      inputTokens: 120,
      outputTokens: 45,
      costUsd: 0.01234,
      wuId: 'WU-2316',
      agentId: 'agent-1',
      sessionId: 'session-1',
    });
  });

  it('returns null for malformed/non-cost lines', () => {
    expect(parseCostEventLine('')).toBeNull();
    expect(parseCostEventLine('{not-json')).toBeNull();
    expect(
      parseCostEventLine(
        JSON.stringify({
          timestamp: '2026-03-05T00:00:00.000Z',
          source_type: 'flow',
          operation: 'llm.classification',
          model: 'gpt-4o-mini',
          input_tokens: 10,
          output_tokens: 5,
          cost_usd: 0.001,
        }),
      ),
    ).toBeNull();
  });
});

describe('cost-summary aggregation', () => {
  it('reads local NDJSON and aggregates totals by model/agent/wu', () => {
    const root = createTempDir();
    const costsPath = path.join(root, 'costs.ndjson');

    writeFileSync(
      costsPath,
      [
        JSON.stringify({
          timestamp: '2026-03-05T00:00:00.000Z',
          source_type: 'cost',
          operation: 'llm.classification',
          model: 'gpt-4o-mini',
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.02,
          wu_id: 'WU-1',
          agent_id: 'agent-a',
        }),
        JSON.stringify({
          timestamp: '2026-03-05T00:00:01.000Z',
          source_type: 'cost',
          operation: 'llm.classification',
          model: 'gpt-4o-mini',
          input_tokens: 120,
          output_tokens: 40,
          cost_usd: 0.03,
          wu_id: 'WU-2',
          agent_id: 'agent-a',
        }),
        JSON.stringify({
          timestamp: '2026-03-05T00:00:02.000Z',
          source_type: 'cost',
          operation: 'llm.classification',
          model: 'gpt-4.1',
          input_tokens: 80,
          output_tokens: 30,
          cost_usd: 0.05,
          wu_id: 'WU-2',
          agent_id: 'agent-b',
        }),
      ].join('\n') + '\n',
      'utf-8',
    );

    const events = readCostEvents(costsPath);
    const summary = summarizeCostEvents(events);

    expect(summary.totalCostUsd).toBeCloseTo(0.1, 10);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(120);
    expect(summary.eventCount).toBe(3);

    expect(summary.byModel.map((row) => row.key)).toEqual(['gpt-4o-mini', 'gpt-4.1']);
    expect(summary.byAgent.map((row) => row.key)).toEqual(['agent-a', 'agent-b']);
    expect(summary.byWu.map((row) => row.key)).toEqual(['WU-2', 'WU-1']);
  });

  it('formats human-readable summary output', () => {
    const summary = summarizeCostEvents([
      {
        timestamp: '2026-03-05T00:00:00.000Z',
        sourceType: 'cost',
        operation: 'llm.classification',
        model: 'gpt-4o-mini',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.0025,
        wuId: 'WU-1',
        agentId: 'agent-a',
      },
    ]);

    const output = formatCostSummary(summary);
    expect(output).toContain('Cost Summary');
    expect(output).toContain('By Model:');
    expect(output).toContain('By Agent:');
    expect(output).toContain('By WU:');
    expect(output).toContain('gpt-4o-mini');
    expect(output).toContain('agent-a');
    expect(output).toContain('WU-1');
  });
});
