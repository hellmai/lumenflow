#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file lane-status.ts
 * WU-2257: Lane status with --help support
 *
 * Shows lane lifecycle status. This is a read-only command,
 * so it does not need micro-worktree isolation.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { findProjectRoot, WORKSPACE_CONFIG_FILE_NAME } from '@lumenflow/core/config';
import { die } from '@lumenflow/core/error-handler';
import {
  ensureLaneLifecycleForProject,
  recommendLaneLifecycleNextStep,
} from './lane-lifecycle-process.js';
import { runCLI } from './cli-entry-point.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[lane:status]';
const ARG_HELP = '--help';

export const LANE_STATUS_HELP_TEXT = `Usage: pnpm lane:status

Show lane lifecycle status and recommended next step.

This is a read-only command that displays the current lane lifecycle
status (unconfigured, draft, or locked) and the recommended next step.

Options:
  ${ARG_HELP}    Show this help text and exit
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseLaneStatusArgs(argv: string[]): { help: boolean } {
  return { help: argv.includes(ARG_HELP) };
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

function ensureLumenflowInit(projectRoot: string): void {
  const configPath = path.join(projectRoot, WORKSPACE_CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    die(
      `${LOG_PREFIX} Missing ${WORKSPACE_CONFIG_FILE_NAME}.\n\n` +
        'Run `pnpm workspace-init --yes` first, then re-run lane lifecycle commands.',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve lane lifecycle status for lane:status without mutating config.
 */
export function resolveLaneLifecycleForStatus(projectRoot: string) {
  return ensureLaneLifecycleForProject(projectRoot, { persist: false });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const userArgs = process.argv.slice(2);
  const { help } = parseLaneStatusArgs(userArgs);

  if (help) {
    console.log(LANE_STATUS_HELP_TEXT);
    return;
  }

  const projectRoot = findProjectRoot();
  ensureLumenflowInit(projectRoot);

  const classification = resolveLaneLifecycleForStatus(projectRoot);
  const nextStep = recommendLaneLifecycleNextStep(classification.status);

  if (classification.source === 'migration') {
    console.log(`[lane:lifecycle] Migration check: ${classification.migrationReason}`);
    console.log(`[lane:lifecycle] Classified as: ${classification.status}`);
  }

  console.log(`Lane lifecycle status: ${classification.status}`);
  console.log(`Recommended next step: ${nextStep}`);
}

if (import.meta.main) {
  void runCLI(main);
}
