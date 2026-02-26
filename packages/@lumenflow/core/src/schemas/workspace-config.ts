// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Workspace V2 Configuration Schemas
 *
 * Control plane and workspace extension schemas for workspace.yaml integration.
 *
 * @module schemas/workspace-config
 */

import { z } from 'zod';
import { WORKSPACE_V2_KEYS } from '../config-contract.js';

export { WORKSPACE_V2_KEYS };

export const WorkspaceControlPlanePolicyModeSchema = z.enum([
  'authoritative',
  'tighten-only',
  'dev-override',
]);

const CONTROL_PLANE_AUTH_TOKEN_ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const WorkspaceControlPlaneAuthConfigSchema = z
  .object({
    token_env: z
      .string()
      .regex(CONTROL_PLANE_AUTH_TOKEN_ENV_PATTERN, 'Expected uppercase environment variable name'),
  })
  .strict();

/**
 * WU-2223: Aligned with kernel's WorkspaceControlPlaneConfigSchema.
 * This is the shape written by cloud:connect and config:set.
 */
export const WorkspaceControlPlaneConfigSchema = z
  .object({
    endpoint: z.string().url(),
    org_id: z.string().min(1),
    project_id: z.string().min(1),
    sync_interval: z.number().int().positive(),
    policy_mode: WorkspaceControlPlanePolicyModeSchema,
    auth: WorkspaceControlPlaneAuthConfigSchema,
  })
  .strict();

export const WorkspaceSoftwareDeliverySchema = z.record(z.string(), z.unknown());

export const WorkspaceV2ExtensionsSchema = z.object({
  [WORKSPACE_V2_KEYS.SOFTWARE_DELIVERY]: WorkspaceSoftwareDeliverySchema,
  [WORKSPACE_V2_KEYS.CONTROL_PLANE]: WorkspaceControlPlaneConfigSchema.optional(),
});

export type WorkspaceControlPlanePolicyMode = z.infer<typeof WorkspaceControlPlanePolicyModeSchema>;
export type WorkspaceControlPlaneConfig = z.infer<typeof WorkspaceControlPlaneConfigSchema>;
export type WorkspaceSoftwareDeliveryConfig = z.infer<typeof WorkspaceSoftwareDeliverySchema>;
export type WorkspaceV2Extensions = z.infer<typeof WorkspaceV2ExtensionsSchema>;
