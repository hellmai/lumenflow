// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for workspace-config schemas
 *
 * WU-2223: Parity test — core's WorkspaceControlPlaneConfigSchema must accept
 * the exact shape that kernel/cloud-connect writes. Guards against future drift.
 *
 * @see {@link ../schemas/workspace-config.ts}
 */

import { describe, it, expect } from 'vitest';
import { WorkspaceControlPlaneConfigSchema } from '../schemas/workspace-config.js';

/** Canonical kernel-shape control_plane config (written by cloud:connect and config:set) */
const KERNEL_SHAPE_CONTROL_PLANE = {
  endpoint: 'https://cloud.lumenflow.dev',
  org_id: '10762bb6-1bf2-4c15-aa13-c4fd20bbc7b9',
  project_id: 'a2fc585f-8718-450b-a666-46ab7c8bb66b',
  sync_interval: 30,
  policy_mode: 'tighten-only' as const,
  auth: {
    token_env: 'LUMENFLOW_CLOUD_TOKEN',
  },
};

describe('WorkspaceControlPlaneConfigSchema (WU-2223)', () => {
  it('accepts kernel-shape control_plane config (project_id + auth.token_env)', () => {
    const result = WorkspaceControlPlaneConfigSchema.safeParse(KERNEL_SHAPE_CONTROL_PLANE);
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys via .strict()', () => {
    const withExtra = { ...KERNEL_SHAPE_CONTROL_PLANE, unknown_field: 'test' };
    const result = WorkspaceControlPlaneConfigSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { project_id: _, ...missing } = KERNEL_SHAPE_CONTROL_PLANE;
    const result = WorkspaceControlPlaneConfigSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it('rejects invalid auth.token_env format', () => {
    const badAuth = {
      ...KERNEL_SHAPE_CONTROL_PLANE,
      auth: { token_env: 'lowercase_invalid' },
    };
    const result = WorkspaceControlPlaneConfigSchema.safeParse(badAuth);
    expect(result.success).toBe(false);
  });

  it('does not accept old core-only fields (enabled, local_override)', () => {
    const oldShape = {
      enabled: true,
      endpoint: 'https://cloud.lumenflow.dev',
      org_id: 'test-org',
      sync_interval: 30,
      policy_mode: 'tighten-only' as const,
      local_override: false,
    };
    const result = WorkspaceControlPlaneConfigSchema.safeParse(oldShape);
    expect(result.success).toBe(false);
  });
});
