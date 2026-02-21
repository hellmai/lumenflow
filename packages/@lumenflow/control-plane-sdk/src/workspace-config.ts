// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import {
  CONTROL_PLANE_AUTH_TOKEN_ENV_PATTERN,
  CONTROL_PLANE_POLICY_MODE_VALUES,
  type ControlPlanePolicyMode,
  type WorkspaceControlPlaneAuthConfig,
  type WorkspaceControlPlaneConfig,
  type WorkspaceControlPlaneSpec,
} from './sync-port.js';

const CONTROL_PLANE_POLICY_MODE_SET = new Set<string>(CONTROL_PLANE_POLICY_MODE_VALUES);
const CONTROL_PLANE_REQUIRED_FIELDS = [
  'endpoint',
  'org_id',
  'project_id',
  'sync_interval',
  'policy_mode',
] as const;

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function asPositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${field}: expected a positive integer`);
  }

  return value;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }

  return value;
}

function asUrlString(value: unknown, field: string): string {
  const parsed = asNonEmptyString(value, field);

  try {
    void new URL(parsed);
  } catch {
    throw new Error(`Invalid ${field}: expected a valid URL`);
  }

  return parsed;
}

function asPolicyMode(value: unknown): ControlPlanePolicyMode {
  if (typeof value === 'string' && CONTROL_PLANE_POLICY_MODE_SET.has(value)) {
    return value as ControlPlanePolicyMode;
  }

  throw new Error('Invalid control_plane.policy_mode');
}

function asEnvVarName(value: unknown, field: string): string {
  const parsed = asNonEmptyString(value, field);
  if (!CONTROL_PLANE_AUTH_TOKEN_ENV_PATTERN.test(parsed)) {
    throw new Error(`Invalid ${field}: expected an uppercase env var name`);
  }
  return parsed;
}

function parseAuthConfig(input: unknown): WorkspaceControlPlaneAuthConfig {
  if (!isObject(input)) {
    throw new Error('Invalid control_plane.auth: expected an object');
  }

  return {
    token_env: asEnvVarName(input.token_env, 'control_plane.auth.token_env'),
  };
}

function parseControlPlaneConfig(input: unknown): WorkspaceControlPlaneConfig {
  if (!isObject(input)) {
    throw new Error('Invalid control_plane config: expected an object');
  }

  for (const field of CONTROL_PLANE_REQUIRED_FIELDS) {
    if (!(field in input)) {
      throw new Error(
        `Invalid control_plane config: missing required field control_plane.${field}`,
      );
    }
  }

  return {
    endpoint: asUrlString(input.endpoint, 'control_plane.endpoint'),
    org_id: asNonEmptyString(input.org_id, 'control_plane.org_id'),
    project_id: asNonEmptyString(input.project_id, 'control_plane.project_id'),
    sync_interval: asPositiveInt(input.sync_interval, 'control_plane.sync_interval'),
    policy_mode: asPolicyMode(input.policy_mode),
    auth: parseAuthConfig(input.auth),
  };
}

export const ControlPlaneConfigSchema = {
  parse: parseControlPlaneConfig,
} as const;

export const WorkspaceControlPlaneSchema = {
  parse(input: unknown): WorkspaceControlPlaneSpec {
    if (!isObject(input)) {
      throw new Error('Invalid workspace config: expected an object');
    }

    const idRaw = input.id;
    const id =
      idRaw === undefined
        ? undefined
        : typeof idRaw === 'string' && idRaw.trim().length > 0
          ? idRaw
          : (() => {
              throw new Error('Invalid id: expected a non-empty string when provided');
            })();

    return {
      id,
      control_plane: parseControlPlaneConfig(input.control_plane),
    };
  },
} as const;

export function parseWorkspaceControlPlaneConfig(input: unknown): WorkspaceControlPlaneSpec {
  return WorkspaceControlPlaneSchema.parse(input);
}
