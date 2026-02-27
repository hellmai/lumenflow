#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file lane-lock.ts
 * WU-2257: Lane lock with micro-worktree isolation and --help support
 *
 * Locks lane lifecycle status in workspace.yaml via micro-worktree
 * isolation (like lane:edit). Previously wrote directly to the
 * current checkout, causing side effects on main.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { findProjectRoot, WORKSPACE_CONFIG_FILE_NAME } from '@lumenflow/core/config';
import { die } from '@lumenflow/core/error-handler';
import { withMicroWorktree } from '@lumenflow/core/micro-worktree';
import {
  LANE_LIFECYCLE_STATUS,
  recommendLaneLifecycleNextStep,
  setLaneLifecycleStatus,
  validateLaneArtifacts,
} from './lane-lifecycle-process.js';
import { runCLI } from './cli-entry-point.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[lane:lock]';
const ARG_HELP = '--help';

export const LANE_LOCK_OPERATION_NAME = 'lane-lock';

export const LANE_LOCK_HELP_TEXT = `Usage: pnpm lane:lock

Lock lane lifecycle for delivery WUs.

Validates lane artifacts, then sets lane lifecycle status to "locked"
via micro-worktree isolation (changes committed atomically to main).

Prerequisites:
  - workspace.yaml must exist (run \`pnpm workspace-init --yes\` first)
  - Lane artifacts must pass validation (run \`pnpm lane:validate\` first)

Options:
  ${ARG_HELP}    Show this help text and exit
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseLaneLockArgs(argv: string[]): { help: boolean } {
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
        'Run `pnpm workspace-init --yes` first, then configure lane lifecycle.',
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const userArgs = process.argv.slice(2);
  const { help } = parseLaneLockArgs(userArgs);

  if (help) {
    console.log(LANE_LOCK_HELP_TEXT);
    return;
  }

  const projectRoot = findProjectRoot();
  ensureLumenflowInit(projectRoot);

  // Validate before attempting lock (read-only check against current state)
  const validation = validateLaneArtifacts(projectRoot);
  const passed = validation.warnings.length === 0 && validation.invalidLanes.length === 0;

  if (!passed) {
    console.log(`${LOG_PREFIX} Cannot lock lane lifecycle because validation failed:`);
    for (const warning of validation.warnings) {
      console.log(`  - ${warning}`);
    }
    for (const invalidLane of validation.invalidLanes) {
      console.log(`  - Invalid lane mapping: ${invalidLane}`);
    }
    console.log(`${LOG_PREFIX} Next step: pnpm lane:validate`);
    process.exitCode = 1;
    return;
  }

  console.log(`${LOG_PREFIX} Locking lane lifecycle via micro-worktree isolation (WU-2257)`);

  // WU-2257: Use micro-worktree to set lifecycle status atomically
  await withMicroWorktree({
    operation: LANE_LOCK_OPERATION_NAME,
    id: `lane-lock-${Date.now()}`,
    logPrefix: LOG_PREFIX,
    pushOnly: true,
    async execute({ worktreePath }) {
      setLaneLifecycleStatus(worktreePath, LANE_LIFECYCLE_STATUS.LOCKED);

      return {
        commitMessage: `chore: lane:lock set lifecycle status to ${LANE_LIFECYCLE_STATUS.LOCKED}`,
        files: [WORKSPACE_CONFIG_FILE_NAME],
      };
    },
  });

  console.log(`${LOG_PREFIX} Lane lifecycle status: ${LANE_LIFECYCLE_STATUS.LOCKED}`);
  console.log(
    `${LOG_PREFIX} Next step: ${recommendLaneLifecycleNextStep(LANE_LIFECYCLE_STATUS.LOCKED)}`,
  );
}

if (import.meta.main) {
  void runCLI(main);
}
