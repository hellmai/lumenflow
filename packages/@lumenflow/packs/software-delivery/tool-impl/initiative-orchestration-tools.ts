// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ToolOutput } from '@lumenflow/kernel';
import { UTF8_ENCODING } from '../constants.js';

const INITIATIVE_ORCHESTRATION_TOOLS = {
  INITIATIVE_ADD_WU: 'initiative:add-wu',
  INITIATIVE_BULK_ASSIGN: 'initiative:bulk-assign',
  INITIATIVE_CREATE: 'initiative:create',
  INITIATIVE_EDIT: 'initiative:edit',
  INITIATIVE_LIST: 'initiative:list',
  INITIATIVE_PLAN: 'initiative:plan',
  INITIATIVE_REMOVE_WU: 'initiative:remove-wu',
  INITIATIVE_STATUS: 'initiative:status',
  ORCHESTRATE_INIT_STATUS: 'orchestrate:init-status',
  ORCHESTRATE_INITIATIVE: 'orchestrate:initiative',
  ORCHESTRATE_MONITOR: 'orchestrate:monitor',
  PLAN_CREATE: 'plan:create',
  PLAN_EDIT: 'plan:edit',
  PLAN_LINK: 'plan:link',
  PLAN_PROMOTE: 'plan:promote',
  DELEGATION_LIST: 'delegation:list',
  DOCS_SYNC: 'docs:sync',
  INIT_PLAN: 'init:plan',
  LUMENFLOW: 'lumenflow',
  LUMENFLOW_DOCTOR: 'lumenflow:doctor',
  LUMENFLOW_INTEGRATE: 'lumenflow:integrate',
  LUMENFLOW_RELEASE: 'lumenflow:release',
  LUMENFLOW_UPGRADE: 'lumenflow:upgrade',
  SYNC_TEMPLATES: 'sync:templates',
} as const;

type InitiativeOrchestrationToolName =
  (typeof INITIATIVE_ORCHESTRATION_TOOLS)[keyof typeof INITIATIVE_ORCHESTRATION_TOOLS];

const INITIATIVE_ORCHESTRATION_TOOL_ERROR_CODES: Record<InitiativeOrchestrationToolName, string> = {
  'initiative:add-wu': 'INITIATIVE_ADD_WU_ERROR',
  'initiative:bulk-assign': 'INITIATIVE_BULK_ASSIGN_ERROR',
  'initiative:create': 'INITIATIVE_CREATE_ERROR',
  'initiative:edit': 'INITIATIVE_EDIT_ERROR',
  'initiative:list': 'INITIATIVE_LIST_ERROR',
  'initiative:plan': 'INITIATIVE_PLAN_ERROR',
  'initiative:remove-wu': 'INITIATIVE_REMOVE_WU_ERROR',
  'initiative:status': 'INITIATIVE_STATUS_ERROR',
  'orchestrate:init-status': 'ORCHESTRATE_INIT_STATUS_ERROR',
  'orchestrate:initiative': 'ORCHESTRATE_INITIATIVE_ERROR',
  'orchestrate:monitor': 'ORCHESTRATE_MONITOR_ERROR',
  'plan:create': 'PLAN_CREATE_ERROR',
  'plan:edit': 'PLAN_EDIT_ERROR',
  'plan:link': 'PLAN_LINK_ERROR',
  'plan:promote': 'PLAN_PROMOTE_ERROR',
  'delegation:list': 'DELEGATION_LIST_ERROR',
  'docs:sync': 'DOCS_SYNC_ERROR',
  'init:plan': 'INIT_PLAN_ERROR',
  lumenflow: 'LUMENFLOW_INIT_ERROR',
  'lumenflow:doctor': 'LUMENFLOW_DOCTOR_ERROR',
  'lumenflow:integrate': 'LUMENFLOW_INTEGRATE_ERROR',
  'lumenflow:release': 'LUMENFLOW_RELEASE_ERROR',
  'lumenflow:upgrade': 'LUMENFLOW_UPGRADE_ERROR',
  'sync:templates': 'SYNC_TEMPLATES_ALIAS_ERROR',
};

const INITIATIVE_ORCHESTRATION_TOOL_SCRIPT_PATHS: Record<InitiativeOrchestrationToolName, string> =
  {
    'initiative:add-wu': 'packages/@lumenflow/cli/dist/initiative-add-wu.js',
    'initiative:bulk-assign': 'packages/@lumenflow/cli/dist/initiative-bulk-assign-wus.js',
    'initiative:create': 'packages/@lumenflow/cli/dist/initiative-create.js',
    'initiative:edit': 'packages/@lumenflow/cli/dist/initiative-edit.js',
    'initiative:list': 'packages/@lumenflow/cli/dist/initiative-list.js',
    'initiative:plan': 'packages/@lumenflow/cli/dist/initiative-plan.js',
    'initiative:remove-wu': 'packages/@lumenflow/cli/dist/initiative-remove-wu.js',
    'initiative:status': 'packages/@lumenflow/cli/dist/initiative-status.js',
    'orchestrate:init-status': 'packages/@lumenflow/cli/dist/orchestrate-init-status.js',
    'orchestrate:initiative': 'packages/@lumenflow/cli/dist/orchestrate-initiative.js',
    'orchestrate:monitor': 'packages/@lumenflow/cli/dist/orchestrate-monitor.js',
    'plan:create': 'packages/@lumenflow/cli/dist/plan-create.js',
    'plan:edit': 'packages/@lumenflow/cli/dist/plan-edit.js',
    'plan:link': 'packages/@lumenflow/cli/dist/plan-link.js',
    'plan:promote': 'packages/@lumenflow/cli/dist/plan-promote.js',
    'delegation:list': 'packages/@lumenflow/cli/dist/delegation-list.js',
    'docs:sync': 'packages/@lumenflow/cli/dist/docs-sync.js',
    'init:plan': 'packages/@lumenflow/cli/dist/initiative-plan.js',
    lumenflow: 'packages/@lumenflow/cli/dist/init.js',
    'lumenflow:doctor': 'packages/@lumenflow/cli/dist/doctor.js',
    'lumenflow:integrate': 'packages/@lumenflow/cli/dist/commands/integrate.js',
    'lumenflow:release': 'packages/@lumenflow/cli/dist/release.js',
    'lumenflow:upgrade': 'packages/@lumenflow/cli/dist/lumenflow-upgrade.js',
    'sync:templates': 'packages/@lumenflow/cli/dist/sync-templates.js',
  };

const FLAG_NAMES = {
  ADD_LANE: '--add-lane',
  ADD_PHASE: '--add-phase',
  ADD_SUCCESS_METRIC: '--add-success-metric',
  APPEND: '--append',
  APPLY: '--apply',
  CHECKPOINT_PER_WAVE: '--checkpoint-per-wave',
  CLIENT: '--client',
  CONFIG: '--config',
  CONTENT: '--content',
  CREATE: '--create',
  CREATED: '--created',
  DESCRIPTION: '--description',
  DRY_RUN: '--dry-run',
  FORCE: '--force',
  FORMAT: '--format',
  FRAMEWORK: '--framework',
  FULL: '--full',
  ID: '--id',
  INITIATIVE: '--initiative',
  JSON: '--json',
  MERGE: '--merge',
  MINIMAL: '--minimal',
  NOTES: '--notes',
  PHASE: '--phase',
  PHASE_ID: '--phase-id',
  PHASE_STATUS: '--phase-status',
  PLAN: '--plan',
  PRIORITY: '--priority',
  PROGRESS: '--progress',
  RECOVER: '--recover',
  REMOVE_LANE: '--remove-lane',
  SECTION: '--section',
  SIGNALS_ONLY: '--signals-only',
  SINCE: '--since',
  SLUG: '--slug',
  STATUS: '--status',
  SYNC_FROM_INITIATIVE: '--sync-from-initiative',
  TARGET_DATE: '--target-date',
  THRESHOLD: '--threshold',
  TITLE: '--title',
  UNBLOCK: '--unblock',
  VENDOR: '--vendor',
  WU: '--wu',
} as const;

const LUMENFLOW_DEFAULT_SUBCOMMAND = 'commands';

const MISSING_PARAMETER_MESSAGES = {
  CLIENT_REQUIRED: 'client is required',
  DELEGATION_TARGET_REQUIRED: 'Either wu or initiative is required',
  ID_REQUIRED: 'id is required',
  INITIATIVE_REQUIRED: 'initiative is required',
  PLAN_REQUIRED: 'plan is required',
  TITLE_REQUIRED: 'title is required',
  WU_REQUIRED: 'wu is required',
} as const;

interface CommandExecutionResult {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object') {
    return input as Record<string, unknown>;
  }
  return {};
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => entry !== null);
}

function toIntegerString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function appendFlagIfTrue(args: string[], enabled: unknown, flagName: string): void {
  if (enabled === true) {
    args.push(flagName);
  }
}

function appendValueIfPresent(
  args: string[],
  flagName: string,
  value: unknown,
  converter: (value: unknown) => string | null = toStringValue,
): void {
  const converted = converter(value);
  if (converted) {
    args.push(flagName, converted);
  }
}

function runInitiativeOrchestrationCommand(
  toolName: InitiativeOrchestrationToolName,
  args: string[],
): CommandExecutionResult {
  const scriptPath = INITIATIVE_ORCHESTRATION_TOOL_SCRIPT_PATHS[toolName];
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
  const result = spawnSync(process.execPath, [absoluteScriptPath, ...args], {
    cwd: process.cwd(),
    encoding: UTF8_ENCODING,
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    spawnError: result.error?.message,
  };
}

function createMissingParameterOutput(message: string): ToolOutput {
  return {
    success: false,
    error: {
      code: 'MISSING_PARAMETER',
      message,
    },
  };
}

function createFailureOutput(
  toolName: InitiativeOrchestrationToolName,
  execution: CommandExecutionResult,
): ToolOutput {
  const stderrMessage = execution.stderr.trim();
  const stdoutMessage = execution.stdout.trim();
  const message =
    execution.spawnError ??
    (stderrMessage.length > 0
      ? stderrMessage
      : stdoutMessage.length > 0
        ? stdoutMessage
        : `${toolName} failed`);

  return {
    success: false,
    error: {
      code: INITIATIVE_ORCHESTRATION_TOOL_ERROR_CODES[toolName],
      message,
      details: {
        exit_code: execution.status,
        stdout: execution.stdout,
        stderr: execution.stderr,
      },
    },
  };
}

function parseJsonOutput(stdout: string): unknown | null {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function createSuccessOutput(
  toolName: InitiativeOrchestrationToolName,
  execution: CommandExecutionResult,
): ToolOutput {
  const parsedJson = parseJsonOutput(execution.stdout);
  if (parsedJson !== null) {
    return {
      success: true,
      data: parsedJson,
    };
  }

  const message = execution.stdout.trim().length > 0 ? execution.stdout.trim() : `${toolName} ran`;
  return {
    success: true,
    data: {
      message,
    },
  };
}

function executeInitiativeOrchestrationTool(
  toolName: InitiativeOrchestrationToolName,
  args: string[],
): ToolOutput {
  const execution = runInitiativeOrchestrationCommand(toolName, args);
  if (!execution.ok) {
    return createFailureOutput(toolName, execution);
  }
  return createSuccessOutput(toolName, execution);
}

function requireId(parsed: Record<string, unknown>): string | null {
  const id = toStringValue(parsed.id);
  return id ?? null;
}

function requireInitiative(parsed: Record<string, unknown>): string | null {
  const initiative = toStringValue(parsed.initiative);
  return initiative ?? null;
}

function requireWu(parsed: Record<string, unknown>): string | null {
  const wu = toStringValue(parsed.wu);
  return wu ?? null;
}

function buildInitiativePlanArgs(parsed: Record<string, unknown>): string[] | null {
  const initiative = requireInitiative(parsed);
  if (!initiative) {
    return null;
  }
  const args = [FLAG_NAMES.INITIATIVE, initiative];
  appendValueIfPresent(args, FLAG_NAMES.PLAN, parsed.plan);
  appendFlagIfTrue(args, parsed.create, FLAG_NAMES.CREATE);
  return args;
}

export async function initiativeListTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendValueIfPresent(args, FLAG_NAMES.STATUS, parsed.status);
  appendValueIfPresent(args, FLAG_NAMES.FORMAT, parsed.format);
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_LIST, args);
}

export async function initiativeStatusTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }
  const args = [FLAG_NAMES.ID, id];
  appendValueIfPresent(args, FLAG_NAMES.FORMAT, parsed.format);
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_STATUS, args);
}

export async function initiativeCreateTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }
  const title = toStringValue(parsed.title);
  if (!title) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.TITLE_REQUIRED);
  }

  const args = [FLAG_NAMES.ID, id];
  appendValueIfPresent(args, FLAG_NAMES.SLUG, parsed.slug);
  args.push(FLAG_NAMES.TITLE, title);
  appendValueIfPresent(args, FLAG_NAMES.PRIORITY, parsed.priority);
  appendValueIfPresent(args, '--owner', parsed.owner);
  appendValueIfPresent(args, FLAG_NAMES.TARGET_DATE, parsed.target_date);

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_CREATE, args);
}

export async function initiativeEditTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }

  const args = [FLAG_NAMES.ID, id];
  appendValueIfPresent(args, FLAG_NAMES.DESCRIPTION, parsed.description);
  appendValueIfPresent(args, FLAG_NAMES.STATUS, parsed.status);
  appendValueIfPresent(args, '--blocked-by', parsed.blocked_by);
  appendValueIfPresent(args, '--blocked-reason', parsed.blocked_reason);
  appendFlagIfTrue(args, parsed.unblock, FLAG_NAMES.UNBLOCK);
  appendValueIfPresent(args, FLAG_NAMES.NOTES, parsed.notes);
  appendValueIfPresent(args, FLAG_NAMES.PHASE_ID, parsed.phase_id);
  appendValueIfPresent(args, FLAG_NAMES.PHASE_STATUS, parsed.phase_status);
  appendValueIfPresent(args, FLAG_NAMES.CREATED, parsed.created);

  for (const lane of toStringArray(parsed.add_lane)) {
    args.push(FLAG_NAMES.ADD_LANE, lane);
  }
  for (const lane of toStringArray(parsed.remove_lane)) {
    args.push(FLAG_NAMES.REMOVE_LANE, lane);
  }
  for (const phase of toStringArray(parsed.add_phase)) {
    args.push(FLAG_NAMES.ADD_PHASE, phase);
  }
  for (const metric of toStringArray(parsed.add_success_metric)) {
    args.push(FLAG_NAMES.ADD_SUCCESS_METRIC, metric);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_EDIT, args);
}

export async function initiativeAddWuTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const initiative = requireInitiative(parsed);
  if (!initiative) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }
  const wu = requireWu(parsed);
  if (!wu) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.WU_REQUIRED);
  }

  const args = [FLAG_NAMES.INITIATIVE, initiative, FLAG_NAMES.WU, wu];
  appendValueIfPresent(args, FLAG_NAMES.PHASE, parsed.phase, toIntegerString);

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_ADD_WU, args);
}

export async function initiativeRemoveWuTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const initiative = requireInitiative(parsed);
  if (!initiative) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }
  const wu = requireWu(parsed);
  if (!wu) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.WU_REQUIRED);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_REMOVE_WU, [
    FLAG_NAMES.INITIATIVE,
    initiative,
    FLAG_NAMES.WU,
    wu,
  ]);
}

export async function initiativeBulkAssignTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendValueIfPresent(args, FLAG_NAMES.CONFIG, parsed.config);
  appendFlagIfTrue(args, parsed.apply, FLAG_NAMES.APPLY);
  appendValueIfPresent(args, FLAG_NAMES.SYNC_FROM_INITIATIVE, parsed.sync_from_initiative);

  return executeInitiativeOrchestrationTool(
    INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_BULK_ASSIGN,
    args,
  );
}

export async function initiativePlanTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args = buildInitiativePlanArgs(parsed);
  if (!args) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INITIATIVE_PLAN, args);
}

export async function initPlanTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args = buildInitiativePlanArgs(parsed);
  if (!args) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.INIT_PLAN, args);
}

export async function orchestrateInitStatusTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const initiative = requireInitiative(parsed);
  if (!initiative) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }
  return executeInitiativeOrchestrationTool(
    INITIATIVE_ORCHESTRATION_TOOLS.ORCHESTRATE_INIT_STATUS,
    [FLAG_NAMES.INITIATIVE, initiative],
  );
}

export async function orchestrateInitiativeTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const initiative = requireInitiative(parsed);
  if (!initiative) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.INITIATIVE_REQUIRED);
  }

  const args = [FLAG_NAMES.INITIATIVE, initiative];
  appendFlagIfTrue(args, parsed.dry_run, FLAG_NAMES.DRY_RUN);
  appendFlagIfTrue(args, parsed.progress, FLAG_NAMES.PROGRESS);
  appendFlagIfTrue(args, parsed.checkpoint_per_wave, FLAG_NAMES.CHECKPOINT_PER_WAVE);

  return executeInitiativeOrchestrationTool(
    INITIATIVE_ORCHESTRATION_TOOLS.ORCHESTRATE_INITIATIVE,
    args,
  );
}

export async function orchestrateMonitorTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendValueIfPresent(args, FLAG_NAMES.THRESHOLD, parsed.threshold, toIntegerString);
  appendFlagIfTrue(args, parsed.recover, FLAG_NAMES.RECOVER);
  appendFlagIfTrue(args, parsed.dry_run, FLAG_NAMES.DRY_RUN);
  appendValueIfPresent(args, FLAG_NAMES.SINCE, parsed.since);
  appendValueIfPresent(args, FLAG_NAMES.WU, parsed.wu);
  appendFlagIfTrue(args, parsed.signals_only, FLAG_NAMES.SIGNALS_ONLY);

  return executeInitiativeOrchestrationTool(
    INITIATIVE_ORCHESTRATION_TOOLS.ORCHESTRATE_MONITOR,
    args,
  );
}

export async function planCreateTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }
  const title = toStringValue(parsed.title);
  if (!title) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.TITLE_REQUIRED);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.PLAN_CREATE, [
    FLAG_NAMES.ID,
    id,
    FLAG_NAMES.TITLE,
    title,
  ]);
}

export async function planEditTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }

  const args = [FLAG_NAMES.ID, id];
  appendValueIfPresent(args, FLAG_NAMES.SECTION, parsed.section);
  appendValueIfPresent(args, FLAG_NAMES.CONTENT, parsed.content);
  appendValueIfPresent(args, FLAG_NAMES.APPEND, parsed.append);

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.PLAN_EDIT, args);
}

export async function planLinkTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }
  const plan = toStringValue(parsed.plan);
  if (!plan) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.PLAN_REQUIRED);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.PLAN_LINK, [
    FLAG_NAMES.ID,
    id,
    FLAG_NAMES.PLAN,
    plan,
  ]);
}

export async function planPromoteTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const id = requireId(parsed);
  if (!id) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.ID_REQUIRED);
  }

  const args = [FLAG_NAMES.ID, id];
  appendFlagIfTrue(args, parsed.force, FLAG_NAMES.FORCE);

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.PLAN_PROMOTE, args);
}

export async function delegationListTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const wu = requireWu(parsed);
  const initiative = requireInitiative(parsed);
  if (!wu && !initiative) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.DELEGATION_TARGET_REQUIRED);
  }

  const args: string[] = [];
  if (wu) {
    args.push(FLAG_NAMES.WU, wu);
  }
  if (initiative) {
    args.push(FLAG_NAMES.INITIATIVE, initiative);
  }
  appendFlagIfTrue(args, parsed.json, FLAG_NAMES.JSON);

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.DELEGATION_LIST, args);
}

export async function docsSyncTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendValueIfPresent(args, FLAG_NAMES.VENDOR, parsed.vendor);
  appendFlagIfTrue(args, parsed.force, FLAG_NAMES.FORCE);
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.DOCS_SYNC, args);
}

export async function lumenflowTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendValueIfPresent(args, FLAG_NAMES.CLIENT, parsed.client);
  appendFlagIfTrue(args, parsed.merge, FLAG_NAMES.MERGE);
  appendFlagIfTrue(args, parsed.full, FLAG_NAMES.FULL);
  appendFlagIfTrue(args, parsed.minimal, FLAG_NAMES.MINIMAL);
  appendValueIfPresent(args, FLAG_NAMES.FRAMEWORK, parsed.framework);
  if (args.length === 0) {
    args.push(LUMENFLOW_DEFAULT_SUBCOMMAND);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.LUMENFLOW, args);
}

export async function lumenflowDoctorTool(_input: unknown): Promise<ToolOutput> {
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.LUMENFLOW_DOCTOR, []);
}

export async function lumenflowIntegrateTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const client = toStringValue(parsed.client);
  if (!client) {
    return createMissingParameterOutput(MISSING_PARAMETER_MESSAGES.CLIENT_REQUIRED);
  }

  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.LUMENFLOW_INTEGRATE, [
    FLAG_NAMES.CLIENT,
    client,
  ]);
}

export async function lumenflowReleaseTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendFlagIfTrue(args, parsed.dry_run, FLAG_NAMES.DRY_RUN);
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.LUMENFLOW_RELEASE, args);
}

export async function lumenflowUpgradeTool(_input: unknown): Promise<ToolOutput> {
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.LUMENFLOW_UPGRADE, []);
}

export async function syncTemplatesTool(input: unknown): Promise<ToolOutput> {
  const parsed = toRecord(input);
  const args: string[] = [];
  appendFlagIfTrue(args, parsed.dry_run, FLAG_NAMES.DRY_RUN);
  appendFlagIfTrue(args, parsed.verbose, '--verbose');
  appendFlagIfTrue(args, parsed.check_drift, '--check-drift');
  return executeInitiativeOrchestrationTool(INITIATIVE_ORCHESTRATION_TOOLS.SYNC_TEMPLATES, args);
}
