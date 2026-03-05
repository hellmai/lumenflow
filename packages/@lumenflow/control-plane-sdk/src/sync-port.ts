// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: Apache-2.0

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

/**
 * SDK-local wire contract for kernel events.
 *
 * This intentionally avoids importing @lumenflow/kernel from the published SDK.
 * Monorepo CI enforces assignability parity against kernel's upstream type.
 */
export interface SdkKernelEvent {
  schema_version: number;
  kind: string;
  timestamp: string;
  task_id?: string;
  workspace_id?: string;
  run_id?: string;
  message?: string;
  reason?: string;
  wait_for?: string;
  by?: string;
  session_id?: string;
  config_hash?: string;
  changes_summary?: string;
  spec?: 'task' | 'workspace';
  id?: string;
  expected_hash?: string;
  actual_hash?: string;
  evidence_refs?: string[];
  parent_task_id?: string;
  delegation_id?: string;
  note?: string;
  progress?: string;
}

export type KernelEvent = SdkKernelEvent;

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
  agent_id?: string;
  wu_id?: string;
  health?: HeartbeatHealth;
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

export interface HeartbeatHealth {
  busy?: boolean;
  stalled?: boolean;
  last_progress_at?: string;
}

export interface HeartbeatAssignment {
  wu_id: string;
  action: 'claim' | 'continue' | 'abort';
  hint?: string;
}

export interface HeartbeatResult {
  status: 'ok';
  server_time: string;
  next_heartbeat_ms?: number;
  assignment?: HeartbeatAssignment;
  budget_remaining_usd?: number;
  coalesced_signals?: number;
}

export type ApprovalDecision = 'approved' | 'rejected' | 'expired';
export type ApprovalStatus = 'pending' | ApprovalDecision;
export type ApprovalActorType = 'agent' | 'user';

export interface ApprovalRecord {
  approval_id: string;
  workspace_id: string;
  type: string;
  status: ApprovalStatus;
  subject: Record<string, unknown>;
  context?: Record<string, unknown>;
  requester_id?: string;
  requester_type?: ApprovalActorType;
  reviewer_id?: string;
  reviewer_type?: ApprovalActorType;
  decision_reason?: string;
  requested_at: string;
  decided_at?: string;
}

export interface RequestApprovalInput {
  workspace_id: string;
  type: string;
  subject: Record<string, unknown>;
  context?: Record<string, unknown>;
  requester_id?: string;
  requester_type?: ApprovalActorType;
  expires_at?: string;
}

export interface ResolveApprovalInput {
  workspace_id: string;
  approval_id: string;
  decision: ApprovalDecision;
  reason?: string;
  reviewer_id?: string;
  reviewer_type?: ApprovalActorType;
}

export interface ListApprovalsInput {
  workspace_id: string;
  status?: ApprovalStatus;
  type?: string;
  limit?: number;
  cursor?: string;
}

export interface ListApprovalsResult {
  approvals: ApprovalRecord[];
  next_cursor?: string;
}

export interface ControlPlaneSyncPort {
  pullPolicies(input: PullPoliciesInput): Promise<ControlPlanePolicySet>;
  pullConfig(input: PullConfigInput): Promise<WorkspaceControlPlaneSpec>;
  pushTelemetry(input: PushTelemetryInput): Promise<AcceptedCount>;
  pushEvidence(input: PushEvidenceInput): Promise<AcceptedCount>;
  pushKernelEvents(input: PushKernelEventsInput): Promise<AcceptedCount>;
  authenticate(input: AuthenticateInput): Promise<ControlPlaneIdentity>;
  heartbeat(input: HeartbeatInput): Promise<HeartbeatResult>;
  requestApproval?(input: RequestApprovalInput): Promise<ApprovalRecord>;
  resolveApproval?(input: ResolveApprovalInput): Promise<ApprovalRecord>;
  listApprovals?(input: ListApprovalsInput): Promise<ListApprovalsResult>;
}
