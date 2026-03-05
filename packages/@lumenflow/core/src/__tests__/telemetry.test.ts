// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file telemetry.test.ts
 * @description Tests for telemetry diagnostic detection
 *
 * WU-2184: Runtime diagnostics for misplaced config keys
 *
 * Acceptance Criteria:
 * AC1: resolveCloudSyncConfig warns when control_plane found at software_delivery.control_plane
 * AC2: Warning includes specific remediation command
 * AC3: Still returns null (no sync) but with diagnostic output
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectMisnestedControlPlane,
  emitCostEvent,
  syncNdjsonTelemetryToCloud,
  type MisnestedControlPlaneWarning,
} from '../telemetry.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Test constants to avoid magic strings
const PACK_KEY_SOFTWARE_DELIVERY = 'software_delivery';
const ROOT_KEY_CONTROL_PLANE = 'control_plane';
const ENDPOINT_VALUE = 'https://api.example.com';
const REMEDIATION_COMMAND_PREFIX = 'pnpm config:set --key control_plane';

describe('WU-2184: Runtime diagnostics for misplaced config keys', () => {
  describe('AC1: detectMisnestedControlPlane warns when control_plane found under software_delivery', () => {
    it('should return a warning when control_plane is nested under software_delivery', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          [ROOT_KEY_CONTROL_PLANE]: {
            endpoint: ENDPOINT_VALUE,
            auth: { token_env: 'LUMENFLOW_TOKEN' },
          },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).not.toBeNull();
      expect(result?.detectedPath).toBe(`${PACK_KEY_SOFTWARE_DELIVERY}.${ROOT_KEY_CONTROL_PLANE}`);
    });

    it('should return null when control_plane is correctly at the root', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [ROOT_KEY_CONTROL_PLANE]: {
          endpoint: ENDPOINT_VALUE,
          auth: { token_env: 'LUMENFLOW_TOKEN' },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).toBeNull();
    });

    it('should return null when control_plane is not present anywhere', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          lanes: [],
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).toBeNull();
    });

    it('should return null when software_delivery is not an object', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: 'not-an-object',
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).toBeNull();
    });

    it('should return null when workspace is empty', () => {
      const workspace: Record<string, unknown> = {};

      const result = detectMisnestedControlPlane(workspace);

      expect(result).toBeNull();
    });

    it('should still detect misnesting even when root control_plane also exists', () => {
      // Edge case: both root and nested exist. The root one is valid,
      // so no warning is needed (root takes precedence)
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [ROOT_KEY_CONTROL_PLANE]: {
          endpoint: ENDPOINT_VALUE,
          auth: { token_env: 'LUMENFLOW_TOKEN' },
        },
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          [ROOT_KEY_CONTROL_PLANE]: {
            endpoint: 'https://wrong.example.com',
          },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      // When root exists, no warning needed -- root is the correct location
      expect(result).toBeNull();
    });
  });

  describe('AC2: Warning includes specific remediation command', () => {
    it('should include a remediation message with pnpm config:set command', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          [ROOT_KEY_CONTROL_PLANE]: {
            endpoint: ENDPOINT_VALUE,
          },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).not.toBeNull();
      expect(result?.remediation).toContain(REMEDIATION_COMMAND_PREFIX);
    });

    it('should describe the misnesting in the warning message', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          [ROOT_KEY_CONTROL_PLANE]: {
            endpoint: ENDPOINT_VALUE,
          },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).not.toBeNull();
      expect(result?.message).toContain(ROOT_KEY_CONTROL_PLANE);
      expect(result?.message).toContain(PACK_KEY_SOFTWARE_DELIVERY);
    });
  });

  describe('AC3: resolveCloudSyncConfig integration - returns null with diagnostic', () => {
    it('should provide a complete MisnestedControlPlaneWarning shape', () => {
      const workspace: Record<string, unknown> = {
        id: 'test-workspace',
        [PACK_KEY_SOFTWARE_DELIVERY]: {
          [ROOT_KEY_CONTROL_PLANE]: {
            endpoint: ENDPOINT_VALUE,
            auth: { token_env: 'LUMENFLOW_TOKEN' },
          },
        },
      };

      const result = detectMisnestedControlPlane(workspace);

      expect(result).not.toBeNull();

      // Verify the shape of the warning
      const warning = result as MisnestedControlPlaneWarning;
      expect(warning).toHaveProperty('message');
      expect(warning).toHaveProperty('detectedPath');
      expect(warning).toHaveProperty('remediation');
      expect(typeof warning.message).toBe('string');
      expect(typeof warning.detectedPath).toBe('string');
      expect(typeof warning.remediation).toBe('string');
    });

    it('should emit warning via logger when syncNdjsonTelemetryToCloud encounters misnested config', async () => {
      // Create a temporary workspace with misnested control_plane
      const testDir = path.join(tmpdir(), `telemetry-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });

      const workspaceYaml = [
        'id: test-workspace',
        `${PACK_KEY_SOFTWARE_DELIVERY}:`,
        `  ${ROOT_KEY_CONTROL_PLANE}:`,
        `    endpoint: ${ENDPOINT_VALUE}`,
        '    auth:',
        '      token_env: LUMENFLOW_TOKEN',
      ].join('\n');

      writeFileSync(path.join(testDir, 'workspace.yaml'), workspaceYaml, 'utf-8');

      const warnMessages: string[] = [];
      const mockLogger = { warn: vi.fn((msg: string) => warnMessages.push(msg)) };

      const result = await syncNdjsonTelemetryToCloud({
        workspaceRoot: testDir,
        logger: mockLogger,
        environment: {},
      });

      // AC3: Still returns with skipped reason (no sync configured)
      expect(result.skippedReason).toBe('control-plane-unavailable');
      expect(result.recordsSent).toBe(0);

      // AC1: Logger was called with the misnesting warning
      expect(mockLogger.warn).toHaveBeenCalled();
      const allWarnText = warnMessages.join(' ');
      expect(allWarnText).toContain(ROOT_KEY_CONTROL_PLANE);
      expect(allWarnText).toContain(PACK_KEY_SOFTWARE_DELIVERY);

      // AC2: Remediation command was included
      expect(allWarnText).toContain(REMEDIATION_COMMAND_PREFIX);

      // Cleanup
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should NOT emit misnesting warning when control_plane is absent everywhere', async () => {
      const testDir = path.join(tmpdir(), `telemetry-test-no-cp-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });

      const workspaceYaml = [
        'id: test-workspace',
        `${PACK_KEY_SOFTWARE_DELIVERY}:`,
        '  lanes: []',
      ].join('\n');

      writeFileSync(path.join(testDir, 'workspace.yaml'), workspaceYaml, 'utf-8');

      const mockLogger = { warn: vi.fn() };

      await syncNdjsonTelemetryToCloud({
        workspaceRoot: testDir,
        logger: mockLogger,
        environment: {},
      });

      // No misnesting warning should be emitted
      const warnCalls = mockLogger.warn.mock.calls.map((call: unknown[]) => String(call[0]));
      const hasMisnestingWarning = warnCalls.some((msg: string) => msg.includes('misnested'));
      expect(hasMisnestingWarning).toBe(false);

      rmSync(testDir, { recursive: true, force: true });
    });
  });
});

describe('WU-2316: Cost telemetry emission and sync', () => {
  it('writes structured cost events to costs.ndjson', () => {
    const previousCwd = process.cwd();
    const testDir = path.join(tmpdir(), `telemetry-cost-emit-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      process.chdir(testDir);
      emitCostEvent({
        operation: 'llm.classification',
        model: 'gpt-4o-mini',
        input_tokens: 123,
        output_tokens: 45,
        cost_usd: 0.0123,
        agent_id: 'agent-1',
        session_id: 'session-1',
        wu_id: 'WU-2316',
      });

      const costsPath = path.join(testDir, '.lumenflow', 'telemetry', 'costs.ndjson');
      expect(existsSync(costsPath)).toBe(true);

      const line = readFileSync(costsPath, 'utf-8').trim();
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed.source_type).toBe('cost');
      expect(parsed.model).toBe('gpt-4o-mini');
      expect(parsed.cost_usd).toBe(0.0123);
      expect(parsed.input_tokens).toBe(123);
      expect(parsed.output_tokens).toBe(45);
      expect(parsed.wu_id).toBe('WU-2316');
      expect(parsed.agent_id).toBe('agent-1');
      expect(parsed.session_id).toBe('session-1');
    } finally {
      process.chdir(previousCwd);
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('syncs cost telemetry source and tracks costs cursor offset', async () => {
    const root = path.join(tmpdir(), `telemetry-cost-sync-${Date.now()}`);
    mkdirSync(path.join(root, '.lumenflow', 'telemetry'), { recursive: true });

    try {
      writeFileSync(
        path.join(root, 'workspace.yaml'),
        [
          'id: workspace-test',
          'control_plane:',
          '  endpoint: https://cloud.example.com',
          '  sync_interval: 1',
          '  auth:',
          '    token_env: LUMENFLOW_CLOUD_TOKEN',
        ].join('\n'),
        'utf-8',
      );

      writeFileSync(path.join(root, '.lumenflow', 'telemetry', 'gates.ndjson'), '\n', 'utf-8');
      writeFileSync(path.join(root, '.lumenflow', 'flow.log'), '\n', 'utf-8');
      writeFileSync(path.join(root, '.lumenflow', 'telemetry', 'dora.ndjson'), '\n', 'utf-8');
      writeFileSync(
        path.join(root, '.lumenflow', 'telemetry', 'costs.ndjson'),
        `${JSON.stringify({
          timestamp: '2026-03-05T00:00:00.000Z',
          source_type: 'cost',
          operation: 'llm.classification',
          model: 'gpt-4o-mini',
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.02,
          wu_id: 'WU-2316',
          agent_id: 'agent-1',
        })}\n`,
        'utf-8',
      );

      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ accepted: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await syncNdjsonTelemetryToCloud({
        workspaceRoot: root,
        fetchFn,
        now: () => 42_000,
        environment: {
          LUMENFLOW_CLOUD_TOKEN: 'test-token',
        },
      });

      expect(result.recordsSent).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)) as {
        records: Array<{ metric: string; value: number; tags?: Record<string, unknown> }>;
      };
      expect(body.records[0]?.metric).toBe('cost.usd');
      expect(body.records[0]?.value).toBe(0.02);
      expect(body.records[0]?.tags?.source).toBe('costs');
      expect(body.records[0]?.tags?.source_type).toBe('cost');

      const state = JSON.parse(
        readFileSync(path.join(root, '.lumenflow', 'telemetry', 'cloud-sync-state.json'), 'utf-8'),
      ) as {
        files: {
          costs: {
            offset: number;
          };
        };
      };
      const costsSize = Buffer.byteLength(
        readFileSync(path.join(root, '.lumenflow', 'telemetry', 'costs.ndjson'), 'utf-8'),
        'utf8',
      );
      expect(state.files.costs.offset).toBe(costsSize);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
