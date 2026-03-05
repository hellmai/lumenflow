#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  createHttpControlPlaneSyncPort,
  parseWorkspaceControlPlaneConfig,
  type ApprovalStatus,
  type ListApprovalsInput,
  type ListApprovalsResult,
} from '@lumenflow/control-plane-sdk';
import { CONFIG_FILES } from '@lumenflow/core/wu-constants';
import { parseYAML } from '@lumenflow/core/wu-yaml';
import { runCLI } from './cli-entry-point.js';

const LOG_PREFIX = '[approval:list]';
const WORKSPACE_PATH = CONFIG_FILES.WORKSPACE_CONFIG;
const STATUS_VALUES = new Set<ApprovalStatus>(['pending', 'approved', 'rejected', 'expired']);

interface CliOptions {
  status?: ApprovalStatus;
  type?: string;
  limit?: number;
  workspaceId?: string;
  json: boolean;
}

interface ControlPlaneApprovalContext {
  workspaceId: string;
  syncPort: ReturnType<typeof createHttpControlPlaneSyncPort>;
}

function parseOptions(argv: string[] = process.argv): CliOptions {
  const program = new Command()
    .name('approval-list')
    .description('List approvals from the configured control-plane')
    .option('--status <status>', 'Filter by status: pending, approved, rejected, expired')
    .option('--type <type>', 'Filter by approval type')
    .option('--limit <count>', 'Maximum approvals to return')
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
    status?: string;
    type?: string;
    limit?: string;
    workspaceId?: string;
    json?: boolean;
  }>();

  const statusRaw = parsed.status?.trim();
  const status = statusRaw as ApprovalStatus | undefined;
  if (statusRaw && !STATUS_VALUES.has(status!)) {
    throw new Error(`Invalid --status: ${statusRaw}`);
  }

  let limit: number | undefined;
  if (parsed.limit) {
    const parsedLimit = Number.parseInt(parsed.limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      throw new Error(`Invalid --limit: ${parsed.limit}`);
    }
    limit = parsedLimit;
  }

  return {
    status,
    type: parsed.type?.trim(),
    limit,
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

function formatListResult(result: ListApprovalsResult): string {
  const lines: string[] = [];
  lines.push(`${LOG_PREFIX} ${result.approvals.length} approval(s)`);
  for (const approval of result.approvals) {
    lines.push(`- ${approval.approval_id} [${approval.status}] ${approval.type}`);
  }
  if (result.next_cursor) {
    lines.push(`${LOG_PREFIX} next_cursor=${result.next_cursor}`);
  }
  return lines.join('\n');
}

export async function runApprovalList(
  options: CliOptions,
  input: {
    workspaceRoot?: string;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<ListApprovalsResult> {
  const { workspaceId, syncPort } = resolveApprovalContext(
    input.workspaceRoot ?? process.cwd(),
    input.environment ?? process.env,
    options.workspaceId,
  );

  if (!syncPort.listApprovals) {
    throw new Error('Control-plane adapter does not support listApprovals');
  }

  const payload: ListApprovalsInput = {
    workspace_id: workspaceId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.limit ? { limit: options.limit } : {}),
  };

  return syncPort.listApprovals(payload);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const options = parseOptions(argv);
  const result = await runApprovalList(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatListResult(result));
}

if (import.meta.main) {
  void runCLI(main);
}
