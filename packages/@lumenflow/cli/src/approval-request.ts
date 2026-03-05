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
  type RequestApprovalInput,
} from '@lumenflow/control-plane-sdk';
import { CONFIG_FILES } from '@lumenflow/core/wu-constants';
import { parseYAML } from '@lumenflow/core/wu-yaml';
import { runCLI } from './cli-entry-point.js';

const LOG_PREFIX = '[approval:request]';
const WORKSPACE_PATH = CONFIG_FILES.WORKSPACE_CONFIG;
const DEFAULT_REQUESTER_TYPE: ApprovalActorType = 'agent';
const REQUESTER_TYPE_VALUES = new Set<ApprovalActorType>(['agent', 'user']);

interface CliOptions {
  type: string;
  subject: string;
  context?: string;
  requesterId?: string;
  requesterType: ApprovalActorType;
  expiresAt?: string;
  workspaceId?: string;
  json: boolean;
}

interface ControlPlaneApprovalContext {
  workspaceId: string;
  syncPort: ReturnType<typeof createHttpControlPlaneSyncPort>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object payload');
  }
  return value as Record<string, unknown>;
}

function parseJsonRecord(value: string, label: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(value));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${label}: ${reason}`);
  }
}

function parseOptions(argv: string[] = process.argv): CliOptions {
  const program = new Command()
    .name('approval-request')
    .description('Request an approval from the configured control-plane')
    .requiredOption('--type <type>', 'Approval type (for example: wu_assignment)')
    .requiredOption('--subject <json>', 'JSON object describing the approval subject')
    .option('--context <json>', 'Optional JSON object with additional context')
    .option('--requester-id <id>', 'Requester identifier')
    .option('--requester-type <type>', 'Requester type: agent or user', DEFAULT_REQUESTER_TYPE)
    .option('--expires-at <iso>', 'Optional expiry timestamp (ISO-8601)')
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
    type: string;
    subject: string;
    context?: string;
    requesterId?: string;
    requesterType?: string;
    expiresAt?: string;
    workspaceId?: string;
    json?: boolean;
  }>();

  const requesterTypeRaw = (parsed.requesterType ?? DEFAULT_REQUESTER_TYPE).trim();
  if (!REQUESTER_TYPE_VALUES.has(requesterTypeRaw as ApprovalActorType)) {
    throw new Error(`Invalid --requester-type: ${requesterTypeRaw}`);
  }

  return {
    type: parsed.type.trim(),
    subject: parsed.subject,
    context: parsed.context,
    requesterId: parsed.requesterId?.trim(),
    requesterType: requesterTypeRaw as ApprovalActorType,
    expiresAt: parsed.expiresAt?.trim(),
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

function formatResultLine(result: { approval_id: string; status: string; type: string }): string {
  return `${LOG_PREFIX} Created ${result.approval_id} (${result.status}) for type ${result.type}`;
}

export async function runApprovalRequest(
  options: CliOptions,
  input: {
    workspaceRoot?: string;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<unknown> {
  const subject = parseJsonRecord(options.subject, '--subject');
  const context = options.context ? parseJsonRecord(options.context, '--context') : undefined;
  const { workspaceId, syncPort } = resolveApprovalContext(
    input.workspaceRoot ?? process.cwd(),
    input.environment ?? process.env,
    options.workspaceId,
  );

  if (!syncPort.requestApproval) {
    throw new Error('Control-plane adapter does not support requestApproval');
  }

  const payload: RequestApprovalInput = {
    workspace_id: workspaceId,
    type: options.type,
    subject,
    requester_type: options.requesterType,
    ...(options.requesterId ? { requester_id: options.requesterId } : {}),
    ...(options.expiresAt ? { expires_at: options.expiresAt } : {}),
    ...(context ? { context } : {}),
  };

  return syncPort.requestApproval(payload);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const options = parseOptions(argv);
  const result = (await runApprovalRequest(options)) as {
    approval_id: string;
    status: string;
    type: string;
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
