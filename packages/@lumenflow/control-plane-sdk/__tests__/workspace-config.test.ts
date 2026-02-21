// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  ControlPlaneConfigSchema,
  WorkspaceControlPlaneSchema,
  parseWorkspaceControlPlaneConfig,
} from '../src/workspace-config.js';

describe('workspace control-plane config parsing', () => {
  it('parses valid config with canonical control-plane contract', () => {
    const parsed = parseWorkspaceControlPlaneConfig({
      control_plane: {
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 60,
        policy_mode: 'tighten-only',
        auth: {
          token_env: 'LUMENFLOW_CONTROL_PLANE_TOKEN',
        },
      },
    });

    expect(parsed.id).toBeUndefined();
    expect(parsed.control_plane).toEqual({
      endpoint: 'https://control-plane.example',
      org_id: 'org-1',
      project_id: 'proj-1',
      sync_interval: 60,
      policy_mode: 'tighten-only',
      auth: {
        token_env: 'LUMENFLOW_CONTROL_PLANE_TOKEN',
      },
    });
  });

  it('parses optional id', () => {
    const parsed = WorkspaceControlPlaneSchema.parse({
      id: 'workspace-1',
      control_plane: {
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
        auth: {
          token_env: 'CONTROL_PLANE_TOKEN',
        },
      },
    });

    expect(parsed.id).toBe('workspace-1');
  });

  it('rejects malformed top-level input and missing required fields', () => {
    expect(() => parseWorkspaceControlPlaneConfig(null)).toThrow(
      'Invalid workspace config: expected an object',
    );
    expect(() =>
      parseWorkspaceControlPlaneConfig({
        control_plane: {
          org_id: 'org-1',
          project_id: 'proj-1',
          sync_interval: 30,
          policy_mode: 'authoritative',
          auth: {
            token_env: 'CONTROL_PLANE_TOKEN',
          },
        },
      }),
    ).toThrow('Invalid control_plane config: missing required field control_plane.endpoint');
    expect(() => parseWorkspaceControlPlaneConfig({})).toThrow(
      'Invalid control_plane config: expected an object',
    );
  });

  it('rejects invalid control-plane values', () => {
    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: '',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
        auth: {
          token_env: 'CONTROL_PLANE_TOKEN',
        },
      }),
    ).toThrow('Invalid control_plane.endpoint: expected a non-empty string');

    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'not-a-url',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
        auth: {
          token_env: 'CONTROL_PLANE_TOKEN',
        },
      }),
    ).toThrow('Invalid control_plane.endpoint: expected a valid URL');

    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 0,
        policy_mode: 'authoritative',
        auth: {
          token_env: 'CONTROL_PLANE_TOKEN',
        },
      }),
    ).toThrow('Invalid control_plane.sync_interval: expected a positive integer');

    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'legacy',
        auth: {
          token_env: 'CONTROL_PLANE_TOKEN',
        },
      }),
    ).toThrow('Invalid control_plane.policy_mode');
  });

  it('rejects invalid id and auth contract field types', () => {
    expect(() =>
      WorkspaceControlPlaneSchema.parse({
        id: '   ',
        control_plane: {
          endpoint: 'https://control-plane.example',
          org_id: 'org-1',
          project_id: 'proj-1',
          sync_interval: 30,
          policy_mode: 'authoritative',
          auth: {
            token_env: 'CONTROL_PLANE_TOKEN',
          },
        },
      }),
    ).toThrow('Invalid id: expected a non-empty string when provided');

    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
        auth: {
          token_env: 123,
        },
      }),
    ).toThrow('Invalid control_plane.auth.token_env: expected a non-empty string');
  });

  it('rejects missing auth and invalid token_env semantics', () => {
    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
      }),
    ).toThrow('Invalid control_plane.auth: expected an object');

    expect(() =>
      ControlPlaneConfigSchema.parse({
        endpoint: 'https://control-plane.example',
        org_id: 'org-1',
        project_id: 'proj-1',
        sync_interval: 30,
        policy_mode: 'authoritative',
        auth: {
          token_env: 'lowercase_token',
        },
      }),
    ).toThrow('Invalid control_plane.auth.token_env: expected an uppercase env var name');
  });
});
