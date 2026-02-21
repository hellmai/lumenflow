// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

import type { KernelEvent } from '@lumenflow/kernel';

export type PolicyDecision = 'allow' | 'deny';

export const CONTROL_PLANE_POLICY_MODES = {
  AUTHORITATIVE: 'authoritative',
  TIGHTEN_ONLY: 'tighten-only',
  DEV_OVERRIDE: 'dev-override',
} as const;

export const CONTROL_PLANE_POLICY_MODE_VALUES = [
  CONTROL_PLANE_POLICY_MODES.AUTHORITATIVE,
  CONTROL_PLANE_POLICY_MODES.TIGHTEN_ONLY,
  CONTROL_PLANE_POLICY_MODES.DEV_OVERRIDE,
] as const;

export type ControlPlanePolicyMode = (typeof CONTROL_PLANE_POLICY_MODE_VALUES)[number];

export const DEFAULT_CONTROL_PLANE_AUTH_TOKEN_ENV = 'LUMENFLOW_CONTROL_PLANE_TOKEN';
export const CONTROL_PLANE_AUTH_TOKEN_ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export type { KernelEvent };

export interface ControlPlanePolicyRule {
  id: string;
  decision: PolicyDecision;
  reason?: string;
}

export interface ControlPlanePolicySet {
  default_decision: PolicyDecision;
  rules: ControlPlanePolicyRule[];
}

export interface TelemetryRecord {
  metric: string;
  value: number;
  timestamp: string;
  tags?: Record<string, string | number | boolean>;
}

export interface WorkspaceControlPlaneAuthConfig {
  token_env: string;
}

export interface WorkspaceControlPlaneConfig {
  endpoint: string;
  org_id: string;
  project_id: string;
  sync_interval: number;
  policy_mode: ControlPlanePolicyMode;
  auth: WorkspaceControlPlaneAuthConfig;
}

export interface WorkspaceControlPlaneSpec {
  id?: string;
  control_plane: WorkspaceControlPlaneConfig;
}

export interface PullPoliciesInput {
  workspace_id: string;
}

export interface PullConfigInput {
  workspace_id: string;
}

export interface PushTelemetryInput {
  workspace_id: string;
  records: TelemetryRecord[];
}

export interface PushEvidenceInput {
  workspace_id: string;
  evidence_refs: string[];
}

export interface PushKernelEventsInput {
  workspace_id: string;
  events: KernelEvent[];
}

export interface AuthenticateInput {
  workspace_id: string;
  org_id: string;
  agent_id: string;
  token_hint?: string;
}

export interface HeartbeatInput {
  workspace_id: string;
  session_id: string;
}

export interface AcceptedCount {
  accepted: number;
}

export interface ControlPlaneIdentity {
  workspace_id: string;
  org_id: string;
  agent_id: string;
  token: string;
}

export interface HeartbeatResult {
  status: 'ok';
  server_time: string;
}

export interface ControlPlaneSyncPort {
  pullPolicies(input: PullPoliciesInput): Promise<ControlPlanePolicySet>;
  pullConfig(input: PullConfigInput): Promise<WorkspaceControlPlaneSpec>;
  pushTelemetry(input: PushTelemetryInput): Promise<AcceptedCount>;
  pushEvidence(input: PushEvidenceInput): Promise<AcceptedCount>;
  pushKernelEvents(input: PushKernelEventsInput): Promise<AcceptedCount>;
  authenticate(input: AuthenticateInput): Promise<ControlPlaneIdentity>;
  heartbeat(input: HeartbeatInput): Promise<HeartbeatResult>;
}
