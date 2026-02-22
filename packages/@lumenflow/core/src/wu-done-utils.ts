// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Utility functions for wu:done worktree completion.
 *
 * Extracted from wu-done-worktree.ts (WU-2014) to isolate small,
 * independent utility functions into a focused module.
 *
 * Functions:
 *   hasSessionCheckpoints          - WU-1943: Check if WU has memory checkpoints
 *   rollbackBranchOnMergeFailure   - WU-1943: Rollback branch after merge failure
 */

import { LOG_PREFIX, EMOJI } from './wu-constants.js';
import type { GitAdapter } from './git-adapter.js';
import { getErrorMessage } from './error-handler.js';

/**
 * WU-1943: Check if the session has checkpoints for the given WU
 *
 * Used to warn agents when they're completing a WU without checkpoints,
 * which means no recovery data if the session crashes.
 *
 * @param wuId - WU ID to check
 * @param nodes - Memory nodes for the WU (from queryByWu)
 * @returns True if checkpoints exist, false otherwise
 */
export function hasSessionCheckpoints(
  wuId: string,
  nodes: Array<{ type?: string }> | null | undefined,
): boolean {
  if (!wuId) {
    return false;
  }
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }

  return nodes.some((node) => node.type === 'checkpoint');
}

/**
 * WU-1943: Rollback branch to pre-commit SHA when merge fails
 *
 * When wu:done commits metadata to the lane branch but the subsequent merge
 * to main fails, this function rolls back the branch to its pre-commit state.
 * This prevents "zombie" states where the branch shows done but wasn't merged.
 *
 * @param gitAdapter - Git adapter instance (must be in worktree context)
 * @param preCommitSha - SHA to reset to (captured before metadata commit)
 * @param wuId - WU ID for logging
 * @returns Rollback result
 */
export async function rollbackBranchOnMergeFailure(
  gitAdapter: GitAdapter,
  preCommitSha: string,
  wuId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} WU-1943: Rolling back ${wuId} branch to pre-commit state...`,
    );

    // WU-2236: GitAdapter.reset expects (ref: string, options?: { hard?: boolean })
    // NOT an array like ['--hard', sha]
    await gitAdapter.reset(preCommitSha, { hard: true });

    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} WU-1943: Branch rollback complete for ${wuId}`,
    );

    return { success: true };
  } catch (error: unknown) {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} WU-1943: Could not rollback branch for ${wuId}: ${getErrorMessage(error)}`,
    );

    return { success: false, error: getErrorMessage(error) };
  }
}
