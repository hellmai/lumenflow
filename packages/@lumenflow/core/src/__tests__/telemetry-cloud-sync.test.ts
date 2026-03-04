// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file telemetry-cloud-sync.test.ts
 * @description Behavioral tests for cloud telemetry sync with DORA source (WU-2315)
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncNdjsonTelemetryToCloud } from '../telemetry.js';

const TEST_TOKEN_ENV = 'LUMENFLOW_CLOUD_TOKEN_TEST';
const TEST_ENDPOINT = 'https://cloud.example.com';
const tempDirs: string[] = [];

function createWorkspaceRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'telemetry-cloud-sync-'));
  tempDirs.push(root);
  return root;
}

function writeWorkspaceYaml(root: string): void {
  const workspaceDoc: Record<string, unknown> = {
    id: 'workspace-test',
    control_plane: {
      endpoint: TEST_ENDPOINT,
      sync_interval: 1,
      batch_size: 10,
      auth: {
        token_env: TEST_TOKEN_ENV,
      },
    },
  };

  writeFileSync(path.join(root, 'workspace.yaml'), YAML.stringify(workspaceDoc), 'utf-8');
}

function writeTelemetryFiles(
  root: string,
  input: {
    gatesLines?: string[];
    flowLines?: string[];
    doraLines?: string[];
  },
): void {
  const telemetryDir = path.join(root, '.lumenflow', 'telemetry');
  mkdirSync(telemetryDir, { recursive: true });

  const gates = input.gatesLines ?? [];
  const flow = input.flowLines ?? [];
  const dora = input.doraLines ?? [];

  writeFileSync(path.join(telemetryDir, 'gates.ndjson'), `${gates.join('\n')}\n`, 'utf-8');
  writeFileSync(path.join(root, '.lumenflow', 'flow.log'), `${flow.join('\n')}\n`, 'utf-8');
  writeFileSync(path.join(telemetryDir, 'dora.ndjson'), `${dora.join('\n')}\n`, 'utf-8');
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('WU-2315: telemetry cloud sync includes DORA records', () => {
  it('ships gates, flow, and dora records and persists dora cursor offset', async () => {
    const root = createWorkspaceRoot();
    writeWorkspaceYaml(root);
    writeTelemetryFiles(root, {
      gatesLines: [
        JSON.stringify({
          timestamp: '2026-03-04T00:00:00.000Z',
          gate_name: 'format:check',
          passed: true,
          duration_ms: 120,
          wu_id: 'WU-2315',
        }),
      ],
      flowLines: [
        JSON.stringify({
          timestamp: '2026-03-04T00:00:01.000Z',
          script: 'wu:prep',
          step: 'start',
          wu_id: 'WU-2315',
        }),
      ],
      doraLines: [
        JSON.stringify({
          timestamp: '2026-03-04T00:00:02.000Z',
          metric: 'dora.deployment_frequency',
          value: 3.5,
          tier: 'high',
        }),
      ],
    });

    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({ accepted: 3 }));
    const result = await syncNdjsonTelemetryToCloud({
      workspaceRoot: root,
      fetchFn,
      now: () => 42_000,
      environment: {
        [TEST_TOKEN_ENV]: 'token-value',
      },
    });

    expect(result.recordsSent).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    const requestBodies = fetchFn.mock.calls.map(
      (call) =>
        JSON.parse(String(call[1]?.body)) as {
          workspace_id: string;
          records: Array<{ metric: string }>;
        },
    );
    expect(requestBodies.every((body) => body.workspace_id === 'workspace-test')).toBe(true);
    expect(requestBodies.flatMap((body) => body.records.map((record) => record.metric))).toEqual([
      'gates.duration_ms',
      'flow.event',
      'dora.deployment_frequency',
    ]);

    const statePath = path.join(root, '.lumenflow', 'telemetry', 'cloud-sync-state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      files: {
        gates: { offset: number };
        flow: { offset: number };
        dora: { offset: number };
      };
    };

    const doraSize = Buffer.byteLength(
      readFileSync(path.join(root, '.lumenflow', 'telemetry', 'dora.ndjson'), 'utf-8'),
      'utf8',
    );
    expect(state.files.dora.offset).toBe(doraSize);
  });
});
