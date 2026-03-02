// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { GitAdapter } from '@lumenflow/core/git-adapter';
import { createGitForPath } from '@lumenflow/core/git-adapter';
import {
  executeBranchOnlyCompletion,
  executeBranchPRCompletion,
} from '@lumenflow/core/wu-done-branch-only';
import { executeWorktreeCompletion } from '@lumenflow/core/wu-done-worktree';
import { detectAlreadyMergedNoWorktree } from '@lumenflow/core/wu-done-merged-worktree';
import { releaseLaneLock } from '@lumenflow/core/lane-lock';
import { getErrorMessage } from '@lumenflow/core/error-handler';
import { EMOJI, EXIT_CODES, LOG_PREFIX } from '@lumenflow/core/wu-constants';
import { WU_DONE_EVENTS } from '@lumenflow/core/wu-done-machine';

interface WuDocForModeExecution {
  lane?: string;
  title?: string;
  [key: string]: unknown;
}

interface CompletionResult {
  cleanupSafe?: boolean;
  success?: boolean;
  committed?: boolean;
  pushed?: boolean;
  merged?: boolean;
  recovered?: boolean;
  prUrl?: string | null;
}

interface TransactionStateLike {
  id: string;
  timestamp: string;
  wuYamlContent: string | null;
  stampExisted: boolean;
  backlogContent: string | null;
  statusContent: string | null;
  mainSHA: string;
  laneBranch: string;
}

interface PipelineActorPort {
  send: (event: { type: string; error?: string }) => void;
  stop: () => void;
  getSnapshot: () => { value: unknown; context: { failedAt?: unknown } };
}

interface ExecuteModeSpecificCompletionOptions {
  id: string;
  args: Record<string, unknown>;
  docMain: WuDocForModeExecution;
  title: string;
  isDocsOnly: boolean;
  maxCommitLength: number;
  isBranchPR: boolean;
  effectiveBranchOnly: boolean;
  worktreePath: string | null;
  resolvedWorktreePath: string | null;
  pipelineActor: PipelineActorPort;
  validateStagedFiles: (
    wuId: string,
    isDocsOnly: boolean,
    gitAdapter?: GitAdapter,
    options?: { metadataAllowlist?: string[] },
  ) => Promise<void>;
  defaultBranchFrom: (doc: Record<string, unknown>) => string | null | undefined;
  executeAlreadyMergedFinalize: (args: {
    id: string;
    title: string;
    lane: string;
    doc: Record<string, unknown>;
  }) => Promise<{ success: boolean }>;
  recordTransactionState: (
    id: string,
    wuPath: string,
    stampPath: string,
    backlogPath: string,
    statusPath: string,
  ) => TransactionStateLike;
  rollbackTransaction: (
    state: TransactionStateLike,
    wuPath: string,
    stampPath: string,
    backlogPath: string,
    statusPath: string,
  ) => Promise<void>;
}

/**
 * WU-2167: Execute mode-specific wu:done completion while keeping main() as a thin orchestrator.
 */
export async function executeModeSpecificCompletion({
  id,
  args,
  docMain,
  title,
  isDocsOnly,
  maxCommitLength,
  isBranchPR,
  effectiveBranchOnly,
  worktreePath,
  resolvedWorktreePath,
  pipelineActor,
  validateStagedFiles,
  defaultBranchFrom,
  executeAlreadyMergedFinalize,
  recordTransactionState,
  rollbackTransaction,
}: ExecuteModeSpecificCompletionOptions): Promise<CompletionResult> {
  const completionResult: CompletionResult = { cleanupSafe: true };

  const baseContext = {
    id,
    args,
    docMain,
    title,
    isDocsOnly,
    maxCommitLength,
    validateStagedFiles,
  };

  try {
    let modeCompletionResult: CompletionResult;

    if (isBranchPR) {
      const laneBranch = defaultBranchFrom(docMain);
      const branchPRContext = {
        ...baseContext,
        laneBranch,
      };
      modeCompletionResult = await executeBranchPRCompletion(branchPRContext);
    } else if (effectiveBranchOnly) {
      const branchOnlyContext = {
        ...baseContext,
        recordTransactionState,
        rollbackTransaction,
      };
      modeCompletionResult = await executeBranchOnlyCompletion(branchOnlyContext);
    } else {
      if (!worktreePath) {
        const laneBranch = defaultBranchFrom(docMain);
        const mergedDetection = await detectAlreadyMergedNoWorktree({
          wuId: id,
          laneBranch: laneBranch || '',
          worktreePath: resolvedWorktreePath,
        });

        if (mergedDetection.merged && !mergedDetection.worktreeExists) {
          console.log(
            `${LOG_PREFIX.DONE} ${EMOJI.INFO} WU-1746: Worktree missing but branch already merged to main`,
          );
          const mergedTitle = title || String(docMain.title || id);
          const mergedResult = await executeAlreadyMergedFinalize({
            id,
            title: mergedTitle,
            lane: String(docMain.lane || ''),
            doc: docMain as Record<string, unknown>,
          });
          modeCompletionResult = {
            success: mergedResult.success,
            committed: true,
            pushed: true,
            merged: true,
            cleanupSafe: true,
          };
        } else {
          throw new Error(`Missing worktree path for ${id} completion in worktree mode`);
        }
      } else {
        const worktreeGitForValidation = createGitForPath(worktreePath);
        const worktreeContext = {
          ...baseContext,
          worktreePath,
          validateStagedFiles: (
            wuId: string,
            docsOnly: boolean,
            options?: { metadataAllowlist?: string[] },
          ) => validateStagedFiles(wuId, docsOnly, worktreeGitForValidation, options),
        };
        modeCompletionResult = await executeWorktreeCompletion(worktreeContext);
      }
    }

    pipelineActor.send({ type: WU_DONE_EVENTS.COMMIT_COMPLETE });
    pipelineActor.send({ type: WU_DONE_EVENTS.MERGE_COMPLETE });
    pipelineActor.send({ type: WU_DONE_EVENTS.PUSH_COMPLETE });

    if ('recovered' in modeCompletionResult && modeCompletionResult.recovered) {
      try {
        const lane = docMain.lane;
        if (lane) releaseLaneLock(lane, { wuId: id });
      } catch {
        // Ignore lock release errors during cleanup path
      }
      pipelineActor.stop();
      process.exit(EXIT_CODES.SUCCESS);
    }

    return modeCompletionResult;
  } catch (err) {
    const failureStage =
      completionResult.committed === false
        ? WU_DONE_EVENTS.COMMIT_FAILED
        : completionResult.merged === false
          ? WU_DONE_EVENTS.MERGE_FAILED
          : completionResult.pushed === false
            ? WU_DONE_EVENTS.PUSH_FAILED
            : WU_DONE_EVENTS.COMMIT_FAILED;

    pipelineActor.send({
      type: failureStage,
      error: getErrorMessage(err),
    });

    const failedSnapshot = pipelineActor.getSnapshot();
    console.error(
      `${LOG_PREFIX.DONE} Pipeline state: ${failedSnapshot.value} (failedAt: ${failedSnapshot.context.failedAt})`,
    );
    pipelineActor.stop();

    try {
      const lane = docMain.lane;
      if (lane) releaseLaneLock(lane, { wuId: id });
    } catch {
      // Ignore lock release errors during failure path
    }

    console.error(
      `\n${LOG_PREFIX.DONE} ${EMOJI.FAILURE} Mode execution failed: ${getErrorMessage(err)}`,
    );
    console.error(
      `${LOG_PREFIX.DONE} ${EMOJI.INFO} Next step: resolve the reported error and retry: pnpm wu:done --id ${id}`,
    );

    const cleanupSafe =
      typeof err === 'object' &&
      err !== null &&
      'cleanupSafe' in err &&
      typeof (err as { cleanupSafe?: unknown }).cleanupSafe === 'boolean'
        ? (err as { cleanupSafe?: boolean }).cleanupSafe
        : undefined;
    if (cleanupSafe === false) {
      console.log(
        `\n${LOG_PREFIX.DONE} ${EMOJI.WARNING} WU-1811: Worktree preserved - rerun wu:done to recover`,
      );
    }

    process.exit(EXIT_CODES.ERROR);
  }
}
