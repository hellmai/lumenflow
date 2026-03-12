#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file gate-co-change.ts
 * WU-2393: Safe co-change rule management via micro-worktree
 *
 * Enables adding, removing, editing, and listing co-change gate rules
 * in workspace.yaml without directly writing to main. Uses the
 * micro-worktree isolation pattern (WU-1262) to commit changes atomically.
 *
 * Usage:
 *   pnpm gate:co-change --add --name route-test --trigger "src/api/** /route.ts" --require "src/api/** /__tests__/route.test.ts" --severity error
 *   pnpm gate:co-change --remove --name route-test
 *   pnpm gate:co-change --edit --name route-test --severity warn
 *   pnpm gate:co-change --list
 */

import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import {
  findProjectRoot,
  getWorkspaceInitCommand,
  WORKSPACE_CONFIG_FILE_NAME,
} from '@lumenflow/core/config';
import { WORKSPACE_V2_KEYS } from '@lumenflow/core/config-schema';
import { CoChangeRuleConfigSchema } from '@lumenflow/core/config-schema';
import { createError, ErrorCodes } from '@lumenflow/core/error-handler';
import { die } from '@lumenflow/core/error-handler';
import { FILE_SYSTEM } from '@lumenflow/core/wu-constants';
import { withMicroWorktree } from '@lumenflow/core/micro-worktree';
import { createRequire } from 'node:module';
import { runCLI } from './cli-entry-point.js';
import { asRecord } from './object-guards.js';
import { DEFAULT_DB_CO_CHANGE_RULES } from './gates-runners.js';
import type { CoChangeRuleConfig } from '@lumenflow/core/config-schema';

// WU-2437: micromatch has no ESM export and no @types. Use createRequire
// instead of bare require() which throws ReferenceError in ESM context.
const esmRequire = createRequire(import.meta.url);
const micromatch = esmRequire('micromatch') as {
  isMatch: (str: string, pattern: string | string[]) => boolean;
  makeRe: (pattern: string) => RegExp | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[gate:co-change]';
const OPERATION_NAME = 'gate-co-change';

const ARG_ADD = '--add';
const ARG_REMOVE = '--remove';
const ARG_EDIT = '--edit';
const ARG_LIST = '--list';
const ARG_NAME = '--name';
const ARG_TRIGGER = '--trigger';
const ARG_REQUIRE = '--require';
const ARG_SEVERITY = '--severity';
const ARG_GUIDANCE = '--guidance';
const ARG_HELP = '--help';

const COMMIT_PREFIX = 'chore: gate:co-change';
const SOFTWARE_DELIVERY_KEY = WORKSPACE_V2_KEYS.SOFTWARE_DELIVERY;

const VALID_SEVERITIES = ['warn', 'error', 'off'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Operation = 'add' | 'remove' | 'edit' | 'list';

export interface GateCoChangeOptions {
  operation: Operation;
  name?: string;
  triggers?: string[];
  requires?: string[];
  severity?: 'warn' | 'error' | 'off';
  guidance?: string;
}

interface CoChangeEditResult {
  ok: boolean;
  rules?: CoChangeRuleConfig[];
  error?: string;
}

interface ConfigDoc {
  gates?: {
    co_change?: CoChangeRuleConfig[];
    include_builtin_co_change_defaults?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface WorkspaceDoc {
  [SOFTWARE_DELIVERY_KEY]?: ConfigDoc;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP_TEXT = `Usage: pnpm gate:co-change <operation> [options]

Manage co-change gate rules in workspace.yaml via micro-worktree commit.

Operations (exactly one required):
  ${ARG_ADD}              Add a new co-change rule
  ${ARG_REMOVE}           Remove a co-change rule by name
  ${ARG_EDIT}             Edit an existing co-change rule
  ${ARG_LIST}             List all co-change rules (built-in + custom)

Options:
  ${ARG_NAME} <name>      Rule name (required for --add, --remove, --edit)
  ${ARG_TRIGGER} <glob>   Trigger glob pattern (repeatable, required for --add)
  ${ARG_REQUIRE} <glob>   Require glob pattern (repeatable, required for --add)
  ${ARG_SEVERITY} <level> Severity: warn, error, off (default: error)
  ${ARG_GUIDANCE} <text>  Actionable guidance shown on rule failure
  ${ARG_HELP}             Show this help

Examples:
  pnpm gate:co-change --add --name route-test \\
    --trigger "src/app/api/**/route.ts" \\
    --require "src/app/api/**/__tests__/route.test.ts" \\
    --severity error --guidance "API routes must have a sibling test"

  pnpm gate:co-change --remove --name route-test

  pnpm gate:co-change --edit --name route-test --severity warn

  pnpm gate:co-change --list
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseGateCoChangeArgs(argv: string[]): GateCoChangeOptions {
  if (argv.includes(ARG_HELP)) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  let operation: Operation | undefined;
  let name: string | undefined;
  const triggers: string[] = [];
  const requires: string[] = [];
  let severity: 'warn' | 'error' | 'off' | undefined;
  let guidance: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case ARG_ADD:
        operation = 'add';
        break;
      case ARG_REMOVE:
        operation = 'remove';
        break;
      case ARG_EDIT:
        operation = 'edit';
        break;
      case ARG_LIST:
        operation = 'list';
        break;
      case ARG_NAME:
        name = next;
        i++;
        break;
      case ARG_TRIGGER:
        triggers.push(next);
        i++;
        break;
      case ARG_REQUIRE:
        requires.push(next);
        i++;
        break;
      case ARG_SEVERITY: {
        if (!VALID_SEVERITIES.includes(next as (typeof VALID_SEVERITIES)[number])) {
          throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${ARG_SEVERITY} must be one of: ${VALID_SEVERITIES.join(', ')}. Got: ${next}`,
          );
        }
        severity = next as 'warn' | 'error' | 'off';
        i++;
        break;
      }
      case ARG_GUIDANCE:
        guidance = next;
        i++;
        break;
      default:
        break;
    }
  }

  if (!operation) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      `An operation is required (${ARG_ADD}, ${ARG_REMOVE}, ${ARG_EDIT}, or ${ARG_LIST}). Run with ${ARG_HELP} for usage.`,
    );
  }

  // Validate operation-specific requirements
  if (operation === 'add') {
    if (!name) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `${ARG_NAME} is required for ${ARG_ADD}.`);
    }
    if (triggers.length === 0) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `At least one ${ARG_TRIGGER} is required for ${ARG_ADD}.`,
      );
    }
    if (requires.length === 0) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `At least one ${ARG_REQUIRE} is required for ${ARG_ADD}.`,
      );
    }
  }

  if (operation === 'remove' && !name) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${ARG_NAME} is required for ${ARG_REMOVE}.`);
  }

  if (operation === 'edit') {
    if (!name) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `${ARG_NAME} is required for ${ARG_EDIT}.`);
    }
    const hasEdits =
      triggers.length > 0 ||
      requires.length > 0 ||
      severity !== undefined ||
      guidance !== undefined;
    if (!hasEdits) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `At least one edit flag is required for ${ARG_EDIT} (${ARG_TRIGGER}, ${ARG_REQUIRE}, ${ARG_SEVERITY}, ${ARG_GUIDANCE}).`,
      );
    }
  }

  return {
    operation,
    name,
    triggers: triggers.length > 0 ? triggers : undefined,
    requires: requires.length > 0 ? requires : undefined,
    severity,
    guidance,
  };
}

// ---------------------------------------------------------------------------
// Glob validation
// ---------------------------------------------------------------------------

/**
 * Validate that a glob pattern is syntactically valid.
 * Uses micromatch (same engine as gates-runners) to test parse.
 */
export function validateGlobPattern(pattern: string): { ok: boolean; error?: string } {
  try {
    micromatch.makeRe(pattern);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid glob pattern "${pattern}": ${message}` };
  }
}

/**
 * Validate all glob patterns in trigger and require arrays.
 */
function validateAllGlobs(
  triggers?: string[],
  requires?: string[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const pattern of triggers ?? []) {
    const result = validateGlobPattern(pattern);
    if (!result.ok) errors.push(result.error!);
  }

  for (const pattern of requires ?? []) {
    const result = validateGlobPattern(pattern);
    if (!result.ok) errors.push(result.error!);
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Pure mutation logic (no side effects, testable)
// ---------------------------------------------------------------------------

/**
 * Get the set of built-in rule names for conflict detection.
 */
function getBuiltinRuleNames(): Set<string> {
  return new Set(DEFAULT_DB_CO_CHANGE_RULES.map((r) => r.name));
}

export function applyAddRule(
  existingRules: CoChangeRuleConfig[],
  options: GateCoChangeOptions,
): CoChangeEditResult {
  const { name, triggers, requires, severity, guidance } = options;

  // Check duplicate name in custom rules
  if (existingRules.some((r) => r.name === name)) {
    return {
      ok: false,
      error: `${LOG_PREFIX} Rule "${name}" already exists. Use ${ARG_EDIT} to modify it.`,
    };
  }

  // Validate globs
  const globCheck = validateAllGlobs(triggers, requires);
  if (!globCheck.ok) {
    return { ok: false, error: `${LOG_PREFIX} ${globCheck.errors.join('; ')}` };
  }

  const newRule: CoChangeRuleConfig = {
    name: name!,
    trigger_patterns: triggers!,
    require_patterns: requires!,
    severity: severity ?? 'error',
  };
  if (guidance !== undefined) {
    newRule.guidance = guidance;
  }

  // Validate against Zod schema
  const parsed = CoChangeRuleConfigSchema.safeParse(newRule);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error: `${LOG_PREFIX} Schema validation failed: ${issues}` };
  }

  return { ok: true, rules: [...existingRules, parsed.data] };
}

export function applyRemoveRule(
  existingRules: CoChangeRuleConfig[],
  options: GateCoChangeOptions,
): CoChangeEditResult {
  const { name } = options;

  // Block removal of built-in rules
  const builtinNames = getBuiltinRuleNames();
  if (builtinNames.has(name!)) {
    return {
      ok: false,
      error:
        `${LOG_PREFIX} "${name}" is a built-in rule. ` +
        `To disable it, use: pnpm config:set --key software_delivery.gates.include_builtin_co_change_defaults --value false ` +
        `or add an override with: pnpm gate:co-change --add --name ${name} --trigger <pattern> --require <pattern> --severity off`,
    };
  }

  const targetIndex = existingRules.findIndex((r) => r.name === name);
  if (targetIndex === -1) {
    const available = existingRules.map((r) => r.name).join(', ');
    return {
      ok: false,
      error: `${LOG_PREFIX} Rule "${name}" not found.${available ? ` Custom rules: ${available}` : ' No custom rules configured.'}`,
    };
  }

  const updated = [...existingRules];
  updated.splice(targetIndex, 1);
  return { ok: true, rules: updated };
}

export function applyEditRule(
  existingRules: CoChangeRuleConfig[],
  options: GateCoChangeOptions,
): CoChangeEditResult {
  const { name, triggers, requires, severity, guidance } = options;

  const targetIndex = existingRules.findIndex((r) => r.name === name);
  if (targetIndex === -1) {
    const available = existingRules.map((r) => r.name).join(', ');
    return {
      ok: false,
      error: `${LOG_PREFIX} Rule "${name}" not found.${available ? ` Custom rules: ${available}` : ' No custom rules configured.'}`,
    };
  }

  // Validate globs if provided
  const globCheck = validateAllGlobs(triggers, requires);
  if (!globCheck.ok) {
    return { ok: false, error: `${LOG_PREFIX} ${globCheck.errors.join('; ')}` };
  }

  const updated = JSON.parse(JSON.stringify(existingRules)) as CoChangeRuleConfig[];
  const target = updated[targetIndex];

  // Overwrite semantics: if provided, replace entirely
  if (triggers !== undefined) target.trigger_patterns = triggers;
  if (requires !== undefined) target.require_patterns = requires;
  if (severity !== undefined) target.severity = severity;
  if (guidance !== undefined) target.guidance = guidance;

  // Validate edited rule against schema
  const parsed = CoChangeRuleConfigSchema.safeParse(target);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error: `${LOG_PREFIX} Schema validation failed: ${issues}` };
  }

  updated[targetIndex] = parsed.data;
  return { ok: true, rules: updated };
}

// ---------------------------------------------------------------------------
// List display
// ---------------------------------------------------------------------------

export function formatRuleList(
  customRules: CoChangeRuleConfig[],
  includeBuiltinDefaults: boolean,
): string {
  const lines: string[] = [];

  if (includeBuiltinDefaults) {
    lines.push('Built-in rules:');
    for (const rule of DEFAULT_DB_CO_CHANGE_RULES) {
      lines.push(formatRuleEntry(rule, '[built-in]'));
    }
    lines.push('');
  } else {
    lines.push('Built-in rules: disabled (include_builtin_co_change_defaults: false)');
    lines.push('');
  }

  lines.push('Custom rules:');
  if (customRules.length === 0) {
    lines.push('  (none)');
  } else {
    for (const rule of customRules) {
      lines.push(formatRuleEntry(rule, '[custom]'));
    }
  }

  return lines.join('\n');
}

function formatRuleEntry(rule: CoChangeRuleConfig, label: string): string {
  const lines: string[] = [];
  lines.push(`  ${label} ${rule.name} (severity: ${rule.severity})`);
  lines.push(`    triggers: ${rule.trigger_patterns.join(', ')}`);
  lines.push(`    requires: ${rule.require_patterns.join(', ')}`);
  if (rule.guidance) {
    lines.push(`    guidance: ${rule.guidance}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Config I/O helpers
// ---------------------------------------------------------------------------

function readConfigDoc(configPath: string): ConfigDoc {
  const content = readFileSync(configPath, FILE_SYSTEM.UTF8 as BufferEncoding);
  const workspace = asRecord(YAML.parse(content)) as WorkspaceDoc | null;
  if (!workspace) {
    return {};
  }
  return (asRecord(workspace[SOFTWARE_DELIVERY_KEY]) as ConfigDoc | null) ?? {};
}

function writeConfigDoc(configPath: string, config: ConfigDoc): void {
  const content = readFileSync(configPath, FILE_SYSTEM.UTF8 as BufferEncoding);
  const workspace = (asRecord(YAML.parse(content)) as WorkspaceDoc | null) ?? {};
  workspace[SOFTWARE_DELIVERY_KEY] = config;
  const nextContent = YAML.stringify(workspace);
  writeFileSync(configPath, nextContent, FILE_SYSTEM.UTF8 as BufferEncoding);
}

// ---------------------------------------------------------------------------
// Build commit message
// ---------------------------------------------------------------------------

function buildCommitMessage(options: GateCoChangeOptions): string {
  switch (options.operation) {
    case 'add':
      return `${COMMIT_PREFIX} add rule '${options.name}'`;
    case 'remove':
      return `${COMMIT_PREFIX} remove rule '${options.name}'`;
    case 'edit': {
      const edits: string[] = [];
      if (options.triggers) edits.push('triggers');
      if (options.requires) edits.push('requires');
      if (options.severity) edits.push(`severity=${options.severity}`);
      if (options.guidance) edits.push('guidance');
      return `${COMMIT_PREFIX} edit rule '${options.name}' (${edits.join(', ')})`;
    }
    default:
      return `${COMMIT_PREFIX} update`;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const userArgs = process.argv.slice(2);
  const options = parseGateCoChangeArgs(userArgs);

  const projectRoot = findProjectRoot();

  // List operation reads from main — no micro-worktree needed
  if (options.operation === 'list') {
    const configPath = path.join(projectRoot, WORKSPACE_CONFIG_FILE_NAME);
    if (!existsSync(configPath)) {
      die(
        `${LOG_PREFIX} Missing ${WORKSPACE_CONFIG_FILE_NAME}. Run \`${getWorkspaceInitCommand(projectRoot)}\` first.`,
      );
    }
    const config = readConfigDoc(configPath);
    const customRules = (config.gates?.co_change ?? []) as CoChangeRuleConfig[];
    const includeDefaults = config.gates?.include_builtin_co_change_defaults !== false;
    console.log(formatRuleList(customRules, includeDefaults));
    return;
  }

  console.log(
    `${LOG_PREFIX} ${options.operation} co-change rule "${options.name}" via micro-worktree isolation (WU-2393)`,
  );

  await withMicroWorktree({
    operation: OPERATION_NAME,
    id: `gate-co-change-${Date.now()}`,
    logPrefix: LOG_PREFIX,
    pushOnly: true,
    async execute({ worktreePath }) {
      const configRelPath = WORKSPACE_CONFIG_FILE_NAME;
      const configPath = path.join(worktreePath, configRelPath);

      if (!existsSync(configPath)) {
        die(`${LOG_PREFIX} Config file not found in micro-worktree: ${configRelPath}`);
      }

      // Read current config
      const config = readConfigDoc(configPath);
      if (!config.gates) {
        config.gates = {};
      }
      const existingRules = (config.gates.co_change ?? []) as CoChangeRuleConfig[];

      // Apply operation
      let result: CoChangeEditResult;
      switch (options.operation) {
        case 'add':
          result = applyAddRule(existingRules, options);
          break;
        case 'remove':
          result = applyRemoveRule(existingRules, options);
          break;
        case 'edit':
          result = applyEditRule(existingRules, options);
          break;
        default:
          die(`${LOG_PREFIX} Unexpected operation: ${options.operation}`);
          return { commitMessage: '', files: [] };
      }

      if (!result.ok) {
        die(result.error!);
      }

      // Write updated config
      config.gates.co_change = result.rules;
      writeConfigDoc(configPath, config);

      console.log(`${LOG_PREFIX} Rule "${options.name}" ${options.operation}ed successfully.`);

      return {
        commitMessage: buildCommitMessage(options),
        files: [configRelPath],
      };
    },
  });

  console.log(`${LOG_PREFIX} Done.`);
}

if (import.meta.main) {
  void runCLI(main);
}
