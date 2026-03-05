#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  createHttpControlPlaneSyncPort,
  parseWorkspaceControlPlaneConfig,
  type ApprovalActorType,
  type ApprovalDecision,
  type ResolveApprovalInput,
} from '@lumenflow/control-plane-sdk';
import { CONFIG_FILES } from '@lumenflow/core/wu-constants';
import { parseYAML } from '@lumenflow/core/wu-yaml';
import { runCLI } from './cli-entry-point.js';

const LOG_PREFIX = '[approval:review]';
const WORKSPACE_PATH = CONFIG_FILES.WORKSPACE_CONFIG;
const DEFAULT_REVIEWER_TYPE: ApprovalActorType = 'user';
const REVIEWER_TYPE_VALUES = new Set<ApprovalActorType>(['agent', 'user']);
const DECISION_VALUES = new Set<ApprovalDecision>(['approved', 'rejected', 'expired']);

interface CliOptions {
  approvalId: string;
  decision: ApprovalDecision;
  reason?: string;
  reviewerId?: string;
  reviewerType: ApprovalActorType;
  workspaceId?: string;
  json: boolean;
}

interface ControlPlaneApprovalContext {
  workspaceId: string;
  syncPort: ReturnType<typeof createHttpControlPlaneSyncPort>;
}

function parseOptions(argv: string[] = process.argv): CliOptions {
  const program = new Command()
    .name('approval-review')
    .description('Resolve a pending approval in the configured control-plane')
    .requiredOption('--id <approvalId>', 'Approval identifier')
    .requiredOption('--decision <decision>', 'Decision: approved, rejected, or expired')
    .option('--reason <reason>', 'Optional decision reason')
    .option('--reviewer-id <id>', 'Reviewer identifier')
    .option('--reviewer-type <type>', 'Reviewer type: agent or user', DEFAULT_REVIEWER_TYPE)
    .option('--workspace-id <id>', 'Override workspace_id from workspace.yaml')
    .option('--json', 'Output JSON response', false)
    .exitOverride();

  try {
    program.parse(argv);
  } catch (error: unknown) {
    const commanderError = error as { code?: string };
    if (
      commanderError.code === 'commander.helpDisplayed' ||
      commanderError.code === 'commander.version'
    ) {
      process.exit(0);
    }
    throw error;
  }

  const parsed = program.opts<{
    id: string;
    decision: string;
    reason?: string;
    reviewerId?: string;
    reviewerType?: string;
    workspaceId?: string;
    json?: boolean;
  }>();

  const decision = parsed.decision.trim() as ApprovalDecision;
  if (!DECISION_VALUES.has(decision)) {
    throw new Error(`Invalid --decision: ${parsed.decision}`);
  }

  const reviewerTypeRaw = (parsed.reviewerType ?? DEFAULT_REVIEWER_TYPE).trim();
  if (!REVIEWER_TYPE_VALUES.has(reviewerTypeRaw as ApprovalActorType)) {
    throw new Error(`Invalid --reviewer-type: ${reviewerTypeRaw}`);
  }

  return {
    approvalId: parsed.id.trim(),
    decision,
    reason: parsed.reason?.trim(),
    reviewerId: parsed.reviewerId?.trim(),
    reviewerType: reviewerTypeRaw as ApprovalActorType,
    workspaceId: parsed.workspaceId?.trim(),
    json: parsed.json ?? false,
  };
}

function resolveApprovalContext(
  workspaceRoot: string,
  environment: NodeJS.ProcessEnv,
  workspaceIdOverride?: string,
): ControlPlaneApprovalContext {
  const workspaceFilePath = join(workspaceRoot, WORKSPACE_PATH);
  if (!existsSync(workspaceFilePath)) {
    throw new Error(`Missing workspace config: ${workspaceFilePath}`);
  }

  const workspaceDocument = parseYAML(readFileSync(workspaceFilePath, 'utf-8'));
  const parsed = parseWorkspaceControlPlaneConfig(workspaceDocument);
  const workspaceId = workspaceIdOverride ?? parsed.id;
  if (!workspaceId) {
    throw new Error('workspace.yaml must include id or pass --workspace-id');
  }

  return {
    workspaceId,
    syncPort: createHttpControlPlaneSyncPort(parsed.control_plane, undefined, {
      environment,
    }),
  };
}

function formatResultLine(result: {
  approval_id: string;
  status: string;
  decision_reason?: string;
}): string {
  const reasonSuffix = result.decision_reason ? ` (${result.decision_reason})` : '';
  return `${LOG_PREFIX} Updated ${result.approval_id} -> ${result.status}${reasonSuffix}`;
}

export async function runApprovalReview(
  options: CliOptions,
  input: {
    workspaceRoot?: string;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<unknown> {
  const { workspaceId, syncPort } = resolveApprovalContext(
    input.workspaceRoot ?? process.cwd(),
    input.environment ?? process.env,
    options.workspaceId,
  );

  if (!syncPort.resolveApproval) {
    throw new Error('Control-plane adapter does not support resolveApproval');
  }

  const payload: ResolveApprovalInput = {
    workspace_id: workspaceId,
    approval_id: options.approvalId,
    decision: options.decision,
    reviewer_type: options.reviewerType,
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.reviewerId ? { reviewer_id: options.reviewerId } : {}),
  };

  return syncPort.resolveApproval(payload);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const options = parseOptions(argv);
  const result = (await runApprovalReview(options)) as {
    approval_id: string;
    status: string;
    decision_reason?: string;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatResultLine(result));
}

if (import.meta.main) {
  void runCLI(main);
}
