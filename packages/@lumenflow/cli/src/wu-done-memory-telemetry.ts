// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { createCheckpoint } from '@lumenflow/memory/checkpoint';
import { createSignal, loadSignals } from '@lumenflow/memory/signal';
import { queryByWu } from '@lumenflow/memory/store';
import { hasSessionCheckpoints } from '@lumenflow/core/wu-done-worktree';
import { die, getErrorMessage } from '@lumenflow/core/error-handler';
import { emitWUFlowEvent } from '@lumenflow/core/telemetry';
import { EMOJI, LOG_PREFIX, STRING_LITERALS } from '@lumenflow/core/wu-constants';

// WU-2166: Extracted memory/signal constants from wu-done.ts
const MEMORY_SIGNAL_TYPES = {
  WU_COMPLETION: 'wu_completion',
} as const;

const MEMORY_CHECKPOINT_NOTES = {
  PRE_GATES: 'Pre-gates checkpoint for recovery if gates fail',
} as const;

const MEMORY_SIGNAL_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const CHECKPOINT_GATE_MODES = {
  OFF: 'off',
  WARN: 'warn',
  BLOCK: 'block',
} as const;

type CheckpointGateMode = (typeof CHECKPOINT_GATE_MODES)[keyof typeof CHECKPOINT_GATE_MODES];

const CHECKPOINT_GATE_CONFIG = {
  PATH: 'memory.enforcement.require_checkpoint_for_done',
  COMMAND_PREFIX: 'pnpm mem:checkpoint --wu',
  WARN_TAG: 'WU-1998',
} as const;

type CheckpointNodes = Awaited<ReturnType<typeof queryByWu>>;

interface EnforceCheckpointGateForDoneOptions {
  id: string;
  workspacePath: string;
  mode: CheckpointGateMode;
  queryByWuFn?: (basePath: string, wuId: string) => Promise<CheckpointNodes>;
  hasSessionCheckpointsFn?: (wuId: string, wuNodes: CheckpointNodes) => boolean;
  log?: (message: string) => void;
  blocker?: (message: string) => void;
}

function buildCheckpointGateBlockMessage(id: string): string {
  return (
    `${STRING_LITERALS.NEWLINE}${LOG_PREFIX.DONE} ${EMOJI.FAILURE} No checkpoints found for ${id} session.${STRING_LITERALS.NEWLINE}` +
    `${LOG_PREFIX.DONE} ${CHECKPOINT_GATE_CONFIG.PATH} is set to '${CHECKPOINT_GATE_MODES.BLOCK}'.${STRING_LITERALS.NEWLINE}` +
    `${LOG_PREFIX.DONE} Create a checkpoint before completing: ${CHECKPOINT_GATE_CONFIG.COMMAND_PREFIX} ${id}${STRING_LITERALS.NEWLINE}`
  );
}

function buildCheckpointGateWarnMessages(id: string): string[] {
  return [
    `${STRING_LITERALS.NEWLINE}${LOG_PREFIX.DONE} ${EMOJI.INFO} ${CHECKPOINT_GATE_CONFIG.WARN_TAG}: No prior checkpoints recorded for ${id} in this session.`,
    `${LOG_PREFIX.DONE} A pre-gates checkpoint will be created automatically by wu:done.`,
    `${LOG_PREFIX.DONE} For earlier crash recovery, run '${CHECKPOINT_GATE_CONFIG.COMMAND_PREFIX} ${id}' after each acceptance criterion, before gates, or every 30 tool calls.${STRING_LITERALS.NEWLINE}`,
  ];
}

export function resolveCheckpointGateMode(mode: unknown): CheckpointGateMode {
  if (mode === CHECKPOINT_GATE_MODES.OFF) {
    return CHECKPOINT_GATE_MODES.OFF;
  }
  if (mode === CHECKPOINT_GATE_MODES.BLOCK) {
    return CHECKPOINT_GATE_MODES.BLOCK;
  }
  return CHECKPOINT_GATE_MODES.WARN;
}

export async function enforceCheckpointGateForDone({
  id,
  workspacePath,
  mode,
  queryByWuFn = queryByWu,
  hasSessionCheckpointsFn = hasSessionCheckpoints,
  log = console.log,
  blocker = (message: string) => {
    die(message);
  },
}: EnforceCheckpointGateForDoneOptions): Promise<void> {
  if (mode === CHECKPOINT_GATE_MODES.OFF) {
    return;
  }

  let wuNodes: CheckpointNodes;
  try {
    wuNodes = await queryByWuFn(workspacePath, id);
    if (hasSessionCheckpointsFn(id, wuNodes)) {
      return;
    }
  } catch {
    // Fail-open: checkpoint discovery issues should not block wu:done.
    return;
  }

  if (mode === CHECKPOINT_GATE_MODES.BLOCK) {
    blocker(buildCheckpointGateBlockMessage(id));
    return;
  }

  const warnMessages = buildCheckpointGateWarnMessages(id);
  for (const message of warnMessages) {
    log(message);
  }
}

/**
 * Non-blocking wrapper around mem:checkpoint.
 */
export async function createPreGatesCheckpoint(
  id: string,
  worktreePath: string | null,
  baseDir: string = process.cwd(),
): Promise<void> {
  try {
    const result = await createCheckpoint(baseDir, {
      note: MEMORY_CHECKPOINT_NOTES.PRE_GATES,
      wuId: id,
      progress: `Starting gates execution for ${id}`,
      nextSteps: worktreePath
        ? `Gates running in worktree: ${worktreePath}`
        : 'Gates running in branch-only mode',
      trigger: 'wu-done-pre-gates',
    });
    if (result.success) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Pre-gates checkpoint created (${result.checkpoint.id})`,
      );
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Could not create pre-gates checkpoint: ${getErrorMessage(err)}`,
    );
  }
}

/**
 * Non-blocking wrapper around mem:signal.
 */
export async function broadcastCompletionSignal(
  id: string,
  title: string,
  baseDir: string = process.cwd(),
): Promise<void> {
  try {
    const result = await createSignal(baseDir, {
      message: `${MEMORY_SIGNAL_TYPES.WU_COMPLETION}: ${id} - ${title}`,
      wuId: id,
    });
    if (result.success) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Completion signal broadcast (${result.signal.id})`,
      );
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Could not broadcast completion signal: ${getErrorMessage(err)}`,
    );
  }
}

/**
 * Non-blocking inbox check for recent parallel-agent signals.
 */
export async function checkInboxForRecentSignals(
  id: string,
  baseDir: string = process.cwd(),
): Promise<void> {
  try {
    const since = new Date(Date.now() - MEMORY_SIGNAL_WINDOW_MS);
    const signals = await loadSignals(baseDir, {
      since,
      unreadOnly: true,
      compatibilityMode: 'skip-legacy',
    });
    const relevantSignals = signals.filter((s) => s.wu_id !== id);

    if (relevantSignals.length > 0) {
      console.log(`\n${LOG_PREFIX.DONE} ${EMOJI.INFO} Recent signals from parallel agents:`);
      for (const signal of relevantSignals.slice(0, 5)) {
        const timestamp = new Date(signal.created_at).toLocaleTimeString();
        console.log(`  - [${timestamp}] ${signal.message}`);
      }
      if (relevantSignals.length > 5) {
        console.log(`  ... and ${relevantSignals.length - 5} more`);
      }
      console.log(`  Run 'pnpm mem:inbox' for full list\n`);
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Could not check inbox for signals: ${getErrorMessage(err)}`,
    );
  }
}

/**
 * WU-2166: Keep wu-done flow telemetry as a lightweight helper while delegating
 * file output semantics to core telemetry.
 */
export function emitTelemetry(event: Record<string, unknown>): void {
  emitWUFlowEvent(event);
}
