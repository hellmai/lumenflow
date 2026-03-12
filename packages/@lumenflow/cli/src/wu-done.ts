#!/usr/bin/env node
// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WU Done Helper
 *
 * Canonical sequence (Worktree mode - DEFAULT):
 * 1) Run gates in lane worktree (validates the change, not just main)
 * 2) Pre-flight validation: run ALL pre-commit hooks before merge (prevents partial completion)
 * 3) cd into worktree
 * 4) Auto-update WU YAML/backlog/status to Done in worktree (unless --no-auto)
 * 5) Create `.lumenflow/stamps/WU-{id}.done` in worktree
 * 6) Validate staged files against whitelist
 * 7) Commit metadata changes in worktree (on lane branch)
 * 8) cd back to main
 * 9) Merge lane branch to main with --ff-only (metadata + code merged atomically)
 * 10) Push to `main`
 * 11) Remove the associated worktree (unless --no-remove)
 * 12) Optionally delete the lane branch (with --delete-branch)
 * 13) Emit telemetry to .lumenflow/flow.log
 *
 * Canonical sequence (Branch-Only mode - LEGACY):
 * 1) Run gates on lane branch (in main checkout)
 * 2) Pre-flight validation
 * 3) Merge lane branch to main
 * 4) Update metadata on main
 * 5) Commit and push
 * 6) Delete lane branch
 *
 * Usage:
 *   pnpm wu:done --id WU-334 [--worktree worktrees/intelligence-wu-334] [--no-auto] [--no-remove] [--no-merge] [--delete-branch]
 *
 * WU-2542: This script imports utilities from @lumenflow/core package.
 * Full migration to thin shim pending @lumenflow/core CLI export implementation.
 */

// WU-2542: Import from @lumenflow/core to establish shim layer dependency

import '@lumenflow/core';

// WU-1663: XState pipeline actor for state-driven orchestration
import { createActor } from 'xstate';
import { wuDoneMachine, WU_DONE_EVENTS } from '@lumenflow/core/wu-done-machine';

// WU-1153: wu:done guard for uncommitted code_paths is implemented in core package
// The guard runs in executeWorktreeCompletion() before metadata transaction
// See: packages/@lumenflow/core/src/wu-done-validation.ts

import { execSync } from 'node:child_process';
import type { ZodIssue } from 'zod';
import { runGates } from './gates.js';
import { executeGates, resolveCheckpointSkipResult } from './wu-done-gates.js';
// WU-2102: Import scoped test resolver for wu:done gate fallback
import { resolveScopedUnitTestsForPrep } from './wu-prep.js';
import { buildClaimRepairCommand } from './wu-claim-repair-guidance.js';
import { resolveStateDir, resolveWuEventsRelativePath } from './state-path-resolvers.js';
import {
  appendClaimSessionOverrideAuditEvent,
  auditOwnershipOverride,
  checkBacklogConsistencyForWU,
  checkOwnership,
  computeBranchOnlyFallback,
  runWuDoneStagedValidation,
} from './wu-done-preflight.js';
import { getGitForCwd } from '@lumenflow/core/git-adapter';
import { die, getErrorMessage } from '@lumenflow/core/error-handler';
// WU-1223: Location detection for worktree check
import { resolveLocation } from '@lumenflow/core/context/location-resolver';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  appendFileSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
// WU-1825: Import from unified code-path-validator (consolidates 3 validators)
import { validateWUCodePaths } from '@lumenflow/core/code-path-validator';
import { rollbackFiles } from '@lumenflow/core/rollback-utils';
import {
  validateInputs,
  detectModeAndPaths,
  defaultBranchFrom,
  runCleanup,
  validateSpecCompleteness,
  // WU-1805: Preflight code_paths validation before gates
  executePreflightCodePathValidation,
  buildPreflightCodePathErrorMessage,
  // WU-2310: Type vs code_paths preflight validation
  validateTypeVsCodePathsPreflight,
  buildTypeVsCodePathsErrorMessage,
} from '@lumenflow/core/wu-done-validators';
import { formatPreflightWarnings } from '@lumenflow/core/wu-preflight-validators';
// WU-1825: validateCodePathsExist moved to unified code-path-validator
import { validateCodePathsExist } from '@lumenflow/core/code-path-validator';
import {
  BRANCHES,
  PATTERNS,
  DEFAULTS,
  LOG_PREFIX,
  EMOJI,
  GIT,
  SESSION,
  WU_STATUS,
  FILE_SYSTEM,
  EXIT_CODES,
  STRING_LITERALS,
  MICRO_WORKTREE_OPERATIONS,
  TELEMETRY_STEPS,
  ENV_VARS,
  getWUStatusDisplay,
  // WU-1223: Location types for worktree detection
  CONTEXT_VALIDATION,
} from '@lumenflow/core/wu-constants';
import { getDocsOnlyPrefixes, DOCS_ONLY_ROOT_FILES } from '@lumenflow/core';
import { printStatusPreview } from '@lumenflow/core/wu-done-ui';
import { ensureOnMain } from '@lumenflow/core/wu-helpers';
import { WU_PATHS } from '@lumenflow/core/wu-paths';
import { getConfig, clearConfigCache } from '@lumenflow/core/config';
import { writeWU, appendNote, parseYAML } from '@lumenflow/core/wu-yaml';
import {
  PLACEHOLDER_SENTINEL,
  validateWU,
  validateDoneWU,
  validateApprovalGates,
} from '@lumenflow/core/wu-schema';
import { autoRebaseBranch } from '@lumenflow/core/wu-done-worktree';
// WU-2211: --already-merged finalize-only mode
import {
  verifyCodePathsOnMainHead,
  executeAlreadyMergedFinalize as executeAlreadyMergedFinalizeFromModule,
} from './wu-done-already-merged.js';
import { executeModeSpecificCompletion } from './wu-done-mode-execution.js';
import { checkWUConsistency } from '@lumenflow/core/wu-consistency-checker';
// WU-1542: Use blocking mode compliance check (replaces non-blocking checkMandatoryAgentsCompliance)
import { checkMandatoryAgentsComplianceBlocking } from '@lumenflow/core/orchestration-rules';
import { endSessionForWU, getCurrentSessionForWU } from '@lumenflow/agent/auto-session';
import { runBackgroundProcessCheck } from '@lumenflow/core/process-detector';
import { WUStateStore } from '@lumenflow/core/wu-state-store';
// WU-1763: Memory store for loading discoveries (lifecycle nudges)
import { loadMemory } from '@lumenflow/memory/store';
// WU-1603: Atomic lane locking - release lock on WU completion
import { releaseLaneLock } from '@lumenflow/core/lane-lock';
// WU-1747: Checkpoint and lock for concurrent load resilience
import { clearCheckpoint } from '@lumenflow/core/wu-checkpoint';
// WU-1946: Spawn registry for tracking sub-agent spawns
import { DelegationRegistryStore } from '@lumenflow/core/delegation-registry-store';
import { DelegationStatus } from '@lumenflow/core/delegation-registry-schema';
import { ensureCleanWorktree } from './wu-done-check.js';
// WU-1366: Auto cleanup after wu:done success
// WU-1533: commitCleanupChanges auto-commits dirty state files after cleanup
import { runAutoCleanupAfterDone, commitCleanupChanges } from './wu-done-auto-cleanup.js';
// WU-1471 AC4: Hook counter cleanup on wu:done completion
import { cleanupHookCounters } from './hooks/auto-checkpoint-utils.js';
// WU-1473: Mark completed-WU signals as read using receipt-aware behavior
import { markCompletedWUSignalsAsRead } from './hooks/enforcement-generator.js';
import { evaluateMainDirtyMutationGuard } from './hooks/dirty-guard.js';
// WU-1474: Decay policy invocation during completion lifecycle
import { runDecayOnDone } from './wu-done-decay.js';
import { validateClaimSessionOwnership } from './wu-done-ownership.js';
import {
  broadcastCompletionSignal,
  checkInboxForRecentSignals,
  createPreGatesCheckpoint,
  emitTelemetry,
  enforceCheckpointGateForDone,
  resolveCheckpointGateMode,
} from './wu-done-memory-telemetry.js';
import {
  enforceSpawnProvenanceForDone,
  enforceWuBriefEvidenceForDone,
  printExposureWarnings,
  validateAccessibilityOrDie,
  validateDocsOnlyFlag,
} from './wu-done-policies.js';
import {
  detectParallelCompletions,
  ensureNoAutoStagedOrNoop,
  runTripwireCheck,
  validateBranchOnlyMode,
  validateStagedFiles,
} from './wu-done-git-ops.js';
import { flushWuLifecycleSync } from './wu-lifecycle-sync/service.js';
import { WU_LIFECYCLE_COMMANDS } from './wu-lifecycle-sync/constants.js';

export {
  buildGatesCommand,
  buildMissingSpawnPickupEvidenceMessage,
  buildMissingSpawnProvenanceMessage,
  buildMissingWuBriefEvidenceMessage,
  enforceSpawnProvenanceForDone,
  enforceWuBriefEvidenceForDone,
  hasSpawnPickupEvidence,
  printExposureWarnings,
  shouldEnforceSpawnProvenance,
  shouldEnforceWuBriefEvidence,
  validateAccessibilityOrDie,
  validateDocsOnlyFlag,
} from './wu-done-policies.js';
export { isBranchAlreadyMerged } from './wu-done-git-ops.js';
export {
  checkBacklogConsistencyForWU,
  computeBranchOnlyFallback,
  normalizeUsername,
} from './wu-done-preflight.js';
export {
  CHECKPOINT_GATE_MODES,
  enforceCheckpointGateForDone,
  resolveCheckpointGateMode,
} from './wu-done-memory-telemetry.js';

interface WUDocLike extends Record<string, unknown> {
  id?: string;
  title?: string;
  initiative?: string;
  lane?: string;
  type?: string;
  status?: string;
  locked?: boolean;
  baseline_main_sha?: string;
  code_paths?: string[];
  notes?: string | string[];
  assigned_to?: string | null;
  worktree_path?: string;
  session_id?: string;
}

interface WorktreePathSanitizeResult {
  changed: boolean;
  action: 'none' | 'removed' | 'relativized';
}

export interface WorktreePathMigrationResult {
  filesScanned: number;
  filesUpdated: number;
  removedFromDone: number;
  relativizedActive: number;
}

interface SanitizeWorktreePathMetadataOptions {
  projectRoot?: string;
  wuDirRelativePath?: string;
  repoRootForRelativize?: string;
}

const WU_FILE_NAME_PATTERN = /^WU-\d+\.ya?ml$/;

function normalizeRepoRelativePathForYaml(rawPath: string): string {
  return rawPath.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function toRepoRelativePathForYaml(worktreePath: string, repoRoot: string): string {
  const candidate = path.isAbsolute(worktreePath)
    ? path.relative(repoRoot, worktreePath)
    : worktreePath;
  const normalized = normalizeRepoRelativePathForYaml(candidate);
  return normalized.length > 0 ? normalized : '.';
}

/**
 * WU-2247: sanitize a single WU document's worktree_path metadata.
 *
 * - done WUs: strip worktree_path entirely
 * - active WUs: relativize absolute worktree_path for portability/privacy
 */
export function sanitizeWUDocWorktreePath(
  doc: WUDocLike,
  repoRootForRelativize: string = process.cwd(),
): WorktreePathSanitizeResult {
  const currentPath = typeof doc.worktree_path === 'string' ? doc.worktree_path.trim() : '';
  if (!currentPath) {
    return { changed: false, action: 'none' };
  }

  if (doc.status === WU_STATUS.DONE) {
    delete doc.worktree_path;
    return { changed: true, action: 'removed' };
  }

  if (path.isAbsolute(currentPath)) {
    doc.worktree_path = toRepoRelativePathForYaml(currentPath, repoRootForRelativize);
    return { changed: doc.worktree_path !== currentPath, action: 'relativized' };
  }

  const normalizedRelative = normalizeRepoRelativePathForYaml(currentPath);
  if (normalizedRelative !== currentPath) {
    doc.worktree_path = normalizedRelative;
    return { changed: true, action: 'relativized' };
  }

  return { changed: false, action: 'none' };
}

/**
 * WU-2247: batch-sanitize tracked WU YAML metadata in repo.
 */
export function sanitizeWorktreePathMetadataInRepo(
  options: SanitizeWorktreePathMetadataOptions = {},
): WorktreePathMigrationResult {
  const projectRoot = options.projectRoot || process.cwd();
  const wuDirRelativePath = options.wuDirRelativePath || WU_PATHS.WU_DIR();
  const repoRootForRelativize = options.repoRootForRelativize || projectRoot;
  const wuDirAbsolutePath = path.resolve(projectRoot, wuDirRelativePath);

  if (!existsSync(wuDirAbsolutePath)) {
    return {
      filesScanned: 0,
      filesUpdated: 0,
      removedFromDone: 0,
      relativizedActive: 0,
    };
  }

  const result: WorktreePathMigrationResult = {
    filesScanned: 0,
    filesUpdated: 0,
    removedFromDone: 0,
    relativizedActive: 0,
  };

  for (const entry of readdirSync(wuDirAbsolutePath, { withFileTypes: true })) {
    if (!entry.isFile() || !WU_FILE_NAME_PATTERN.test(entry.name)) {
      continue;
    }

    result.filesScanned += 1;
    const wuPath = path.join(wuDirAbsolutePath, entry.name);
    const raw = readFileSync(wuPath, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding });
    const parsed = parseYAML(raw);
    const doc = normalizeWUDocLike(parsed);
    const sanitizeResult = sanitizeWUDocWorktreePath(doc, repoRootForRelativize);

    if (!sanitizeResult.changed) {
      continue;
    }

    writeWU(wuPath, doc);
    result.filesUpdated += 1;
    if (sanitizeResult.action === 'removed') {
      result.removedFromDone += 1;
    }
    if (sanitizeResult.action === 'relativized') {
      result.relativizedActive += 1;
    }
  }

  return result;
}

function normalizeWUDocLike(doc: unknown): WUDocLike {
  if (!doc || typeof doc !== 'object') {
    return {};
  }

  const normalized: WUDocLike = { ...(doc as Record<string, unknown>) };
  if (typeof normalized.status !== 'string') {
    delete normalized.status;
  }
  return normalized;
}

interface TransactionState {
  id: string;
  timestamp: string;
  wuYamlContent: string | null;
  stampExisted: boolean;
  backlogContent: string | null;
  statusContent: string | null;
  mainSHA: string;
  laneBranch: string;
}

interface WuDoneArgsLike {
  skipGates?: boolean;
  reason?: string;
  fixWu?: string;
  force?: boolean;
  overrideOwner?: boolean;
  skipCosGates?: boolean;
  skipExposureCheck?: boolean;
  skipAccessibilityCheck?: boolean;
  allowTodo?: boolean;
  noAutoRebase?: boolean;
  docsOnly?: boolean;
  [key: string]: unknown;
}

interface PreFlightParams {
  id: string;
  args: WuDoneArgsLike;
  isBranchOnly: boolean;
  isDocsOnly: boolean;
  docMain: WUDocLike;
  docForValidation: WUDocLike;
  derivedWorktree: string | null;
}

interface StateHudParams {
  id: string;
  docMain: WUDocLike;
  isBranchOnly: boolean;
  isDocsOnly: boolean;
  derivedWorktree: string | null;
  STAMPS_DIR: string;
}

// WU-2099: Shared resolvers extracted to state-path-resolvers.ts

/**
 * WU-1804: Preflight validation for claim metadata before gates.
 *
 * Validates that the WU is properly claimed before running gates:
 * 1. Worktree YAML status must be 'in_progress'
 * 2. State store must show WU as 'in_progress'
 *
 * If either fails, exits before gates with actionable guidance to repair claim metadata.
 * This prevents burning tokens on gates that will ultimately fail.
 *
 * @param {string} id - WU ID
 * @param {string} worktreePath - Path to the worktree
 * @param {string} yamlStatus - Current status from worktree YAML
 * @returns {Promise<void>}
 */
async function validateClaimMetadataBeforeGates(
  id: string,
  worktreePath: string,
  yamlStatus: unknown,
) {
  const errors = [];

  // Check 1: YAML status must be in_progress
  if (yamlStatus !== WU_STATUS.IN_PROGRESS) {
    errors.push(`Worktree YAML status is '${yamlStatus}', expected '${WU_STATUS.IN_PROGRESS}'`);
  }

  // Check 2: State store must show WU as in_progress
  const resolvedWorktreePath = path.resolve(worktreePath);
  const stateDir = resolveStateDir(resolvedWorktreePath);
  const eventsPath = path.join(
    resolvedWorktreePath,
    resolveWuEventsRelativePath(resolvedWorktreePath),
  );

  try {
    const store = new WUStateStore(stateDir);
    await store.load();
    const inProgress = store.getByStatus(WU_STATUS.IN_PROGRESS);
    if (!inProgress.has(id)) {
      errors.push(`State store does not show ${id} as in_progress (path: ${eventsPath})`);
    }
  } catch (err) {
    errors.push(`Cannot read state store: ${getErrorMessage(err)} (path: ${eventsPath})`);
  }

  // If no errors, we're good
  if (errors.length === 0) {
    return;
  }

  // Build actionable error message with canonical wu:repair --claim guidance
  const repairCommand = buildClaimRepairCommand(id);
  die(
    `❌ CLAIM METADATA VALIDATION FAILED (WU-1804)\n\n` +
      `Cannot proceed with wu:done - the WU is not properly claimed.\n\n` +
      `Issues detected:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
      `This typically happens when:\n` +
      `  • A crash/rebase interrupted worktree creation\n` +
      `  • The claim transaction was partially completed\n` +
      `  • Another process modified the WU state\n\n` +
      `Next step:\n` +
      `  ${repairCommand}\n\n` +
      `After repair, retry:\n` +
      `  pnpm wu:done --id ${id}\n\n` +
      `See: https://lumenflow.dev/reference/troubleshooting-wu-done/ for more recovery options.`,
  );
}

// _assertWorktreeWUInProgressInStateStore removed (WU-2400): dead code,
// strict subset of validateClaimMetadataBeforeGates which already covers
// YAML status + state store checks with actionable repair guidance.

/**
 * WU-1946: Update spawn registry on WU completion.
 * Non-blocking wrapper - failures logged as warnings.
 *
 * When a WU is completed via wu:done, this function updates the spawn registry
 * to mark the spawned entry as completed (if one exists). This allows orchestrators
 * to track sub-agent spawn completion status.
 *
 * Gracefully skips if:
 * - No spawn entry found for this WU (legacy WU created before registry)
 * - Registry file doesn't exist
 * - Any error during update
 *
 * @param {string} id - WU ID being completed
 * @param {string} baseDir - Base directory containing .lumenflow/state/
 * @returns {Promise<void>}
 */
export async function updateSpawnRegistryOnCompletion(id: string, baseDir: string = process.cwd()) {
  try {
    const store = new DelegationRegistryStore(resolveStateDir(baseDir));
    await store.load();

    const spawnEntry = store.getByTarget(id);

    // Graceful skip if no spawn entry found (legacy WU)
    if (!spawnEntry) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.INFO} No spawn registry entry found for ${id} (legacy WU or not spawned)`,
      );
      return;
    }

    // Update status to completed with completedAt timestamp
    await store.updateStatus(spawnEntry.id, DelegationStatus.COMPLETED);
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Spawn registry updated: ${id} marked as completed`,
    );
  } catch (err) {
    // Non-blocking: spawn registry update failure should not block wu:done
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Could not update spawn registry for ${id}: ${getErrorMessage(err)}`,
    );
  }
}

// Git config keys used for user identification
const GIT_CONFIG_USER_NAME = 'user.name';
const GIT_CONFIG_USER_EMAIL = 'user.email';

// Default fallback messages
const DEFAULT_NO_REASON = '(no reason provided)';
const DEFAULT_NO_FIX_WU = '(no fix WU specified)';
const DEFAULT_UNKNOWN_WORKTREE = '(unknown)';
export const SKIP_GATES_AUDIT_FILENAME = 'skip-gates-audit.ndjson';
const SKIP_GATES_ALL_GATE_NAME = 'all';

// WU-1281: isDocsOnlyByPaths removed - use shouldSkipWebTests from path-classifiers.ts
// The validators already use shouldSkipWebTests via detectDocsOnlyByPaths wrapper.
// Keeping the export for backward compatibility but re-exporting the canonical function.
export { shouldSkipWebTests as isDocsOnlyByPaths } from '@lumenflow/core/path-classifiers';

/**
 * Read commitlint header-max-length from config, fallback to DEFAULTS.MAX_COMMIT_SUBJECT
 * WU-1281: Using centralized constant instead of hardcoded 100
 */
function getCommitHeaderLimit() {
  try {
    const configPath = path.join(process.cwd(), '.commitlintrc.json');
    if (!existsSync(configPath)) return DEFAULTS.MAX_COMMIT_SUBJECT;
    const cfg = JSON.parse(
      readFileSync(configPath, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding }),
    );
    return cfg?.rules?.['header-max-length']?.[2] ?? DEFAULTS.MAX_COMMIT_SUBJECT;
  } catch {
    return DEFAULTS.MAX_COMMIT_SUBJECT; // Fallback if config is malformed or missing
  }
}

// ensureOnMain() moved to wu-helpers.ts (WU-1256)

/**
 * WU-2400: Generic audit entry appender — shared by auditSkipGates and auditSkipCosGates.
 * Consolidates the duplicate git-identity lookup, JSON serialisation, and file-append logic.
 */
async function appendAuditEntry(
  filename: string,
  buildEntry: (git: { userName: string; userEmail: string; commitHash: string }) => object,
  worktreePath: string | null,
  options?: { logLabel?: string },
): Promise<void> {
  const auditBaseDir = worktreePath || process.cwd();
  const auditPath = path.join(auditBaseDir, '.lumenflow', filename);
  const auditDir = path.dirname(auditPath);
  if (!existsSync(auditDir)) mkdirSync(auditDir, { recursive: true });
  const gitAdapter = getGitForCwd();
  const userName = await gitAdapter.getConfigValue(GIT_CONFIG_USER_NAME);
  const userEmail = await gitAdapter.getConfigValue(GIT_CONFIG_USER_EMAIL);
  const commitHash = await gitAdapter.getCommitHash();
  const entry = buildEntry({
    userName: userName.trim(),
    userEmail: userEmail.trim(),
    commitHash: commitHash.trim(),
  });
  const line = JSON.stringify(entry);
  appendFileSync(auditPath, `${line}\n`, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding });
  const label = options?.logLabel ?? `Audit event logged to`;
  console.log(
    `${LOG_PREFIX.DONE} ${EMOJI.MEMO} ${label} ${path.relative(process.cwd(), auditPath) || auditPath}`,
  );
}

async function auditSkipGates(
  id: string,
  reason: unknown,
  fixWU: unknown,
  worktreePath: string | null,
): Promise<void> {
  await appendAuditEntry(
    SKIP_GATES_AUDIT_FILENAME,
    (git) =>
      buildSkipGatesAuditEntry({
        id,
        reason,
        fixWU,
        worktreePath,
        userName: git.userName,
        userEmail: git.userEmail,
        commitHash: git.commitHash,
      }),
    worktreePath,
    { logLabel: 'Skip-gates event logged to' },
  );
}

interface SkipGatesAuditEntry {
  timestamp: string;
  wu_id: string;
  reason: string;
  gate: string;
  fix_wu: string;
  worktree: string;
  git_user: string;
  git_commit: string;
}

interface BuildSkipGatesAuditEntryInput {
  id: string;
  reason: unknown;
  fixWU: unknown;
  worktreePath: string | null;
  userName: string;
  userEmail: string;
  commitHash: string;
  timestamp?: Date;
}

export function buildSkipGatesAuditEntry(
  input: BuildSkipGatesAuditEntryInput,
): SkipGatesAuditEntry {
  const reasonText = typeof input.reason === 'string' ? input.reason : undefined;
  const fixWUText = typeof input.fixWU === 'string' ? input.fixWU : undefined;

  return {
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    wu_id: input.id,
    reason: reasonText || DEFAULT_NO_REASON,
    gate: SKIP_GATES_ALL_GATE_NAME,
    fix_wu: fixWUText || DEFAULT_NO_FIX_WU,
    worktree: input.worktreePath || DEFAULT_UNKNOWN_WORKTREE,
    git_user: `${input.userName} <${input.userEmail}>`,
    git_commit: input.commitHash,
  };
}

/**
 * Audit trail for COS gates skip (COS v1.3 S7)
 * WU-1852: Renamed from skip-cos-gates to avoid referencing non-existent CLI flag
 * WU-2400: Delegates to appendAuditEntry to remove DRY violation
 */
async function auditSkipCosGates(
  id: string,
  reason: unknown,
  worktreePath: string | null,
): Promise<void> {
  const reasonText = typeof reason === 'string' ? reason : undefined;
  await appendAuditEntry(
    'skip-cos-gates-audit.log',
    (git) => ({
      timestamp: new Date().toISOString(),
      wu_id: id,
      reason: reasonText || DEFAULT_NO_REASON,
      git_user: `${git.userName} <${git.userEmail}>`,
      git_commit: git.commitHash,
    }),
    worktreePath,
    { logLabel: 'Skip-COS-gates event logged to' },
  );
}

// WU-2308: validateAllPreCommitHooks moved to wu-done-validators.ts
// Now accepts worktreePath parameter to run audit from worktree context

// Note: updateStatusRemoveInProgress, addToStatusCompleted, and moveWUToDoneBacklog
// have been extracted to tools/lib/wu-status-updater.ts and imported above (WU-1163)
//
// Note: ensureStamp has been replaced with createStamp from tools/lib/stamp-utils.ts (WU-1163)
//
// Note: readWUPreferWorktree, detectCurrentWorktree, defaultWorktreeFrom, detectWorkspaceMode,
// defaultBranchFrom, branchExists, runCleanup have been extracted to
// tools/lib/wu-done-validators.ts and imported above (WU-1215)

/**
 * WU-755 + WU-1230: Record transaction state for rollback
 * @param {string} id - WU ID
 * @param {string} wuPath - Path to WU YAML
 * @param {string} stampPath - Path to stamp file
 * @param {string} backlogPath - Path to backlog.md (WU-1230)
 * @param {string} statusPath - Path to status.md (WU-1230)
 * @returns {object} - Transaction state for rollback
 */
function recordTransactionState(
  id: string,
  wuPath: string,
  stampPath: string,
  backlogPath: string,
  statusPath: string,
): TransactionState {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is a required local tool in the CLI runtime.
  const mainSHA = execSync('git rev-parse HEAD', {
    encoding: FILE_SYSTEM.UTF8 as BufferEncoding,
  }).trim();
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is a required local tool in the CLI runtime.
  const laneBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: FILE_SYSTEM.UTF8 as BufferEncoding,
  }).trim();
  return {
    id,
    timestamp: new Date().toISOString(),
    wuYamlContent: existsSync(wuPath)
      ? readFileSync(wuPath, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding })
      : null,
    stampExisted: existsSync(stampPath),
    backlogContent: existsSync(backlogPath)
      ? readFileSync(backlogPath, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding })
      : null,
    statusContent: existsSync(statusPath)
      ? readFileSync(statusPath, { encoding: FILE_SYSTEM.UTF8 as BufferEncoding })
      : null,
    mainSHA,
    laneBranch,
  };
}

/**
 * WU-755 + WU-1230: Rollback transaction on failure
 * @param {object} txState - Transaction state from recordTransactionState
 * @param {string} wuPath - Path to WU YAML
 * @param {string} stampPath - Path to stamp file
 * @param {string} backlogPath - Path to backlog.md (WU-1230)
 * @param {string} statusPath - Path to status.md (WU-1230)
 */

// ── WU-2400: Named rollback sub-operations extracted from rollbackTransaction ──

/** Unstage all staged files and discard working tree changes. */
async function resetGitStaging(): Promise<void> {
  // Step 1: Unstage all staged files FIRST
  try {
    const gitAdapter = getGitForCwd();
    await gitAdapter.raw(['reset', 'HEAD']);
    console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Unstaged all files`);
  } catch {
    // Ignore - may not have anything staged
  }

  // Step 2: Discard working directory changes (reset to last commit)
  try {
    const gitAdapter = getGitForCwd();
    await gitAdapter.raw(['checkout', '--', '.']);
    console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Reset working tree to HEAD`);
  } catch {
    // Ignore - may not have anything to discard
  }
}

/** Remove stamp file unconditionally if it exists (WU-1440). */
function removeStampIfExists(stampPath: string): void {
  if (!existsSync(stampPath)) return;
  try {
    unlinkSync(stampPath);
    console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Removed ${stampPath}`);
  } catch (err) {
    console.error(
      `${LOG_PREFIX.DONE} ${EMOJI.FAILURE} Failed to remove stamp: ${getErrorMessage(err)}`,
    );
  }
}

/** Build file list and restore from transaction snapshot (WU-1255). */
function restoreFilesFromSnapshot(
  txState: TransactionState,
  wuPath: string,
  backlogPath: string,
  statusPath: string,
): ReturnType<typeof rollbackFiles> {
  const filesToRestore = [];

  if (txState.backlogContent && existsSync(backlogPath)) {
    filesToRestore.push({ name: 'backlog.md', path: backlogPath, content: txState.backlogContent });
  }
  if (txState.statusContent && existsSync(statusPath)) {
    filesToRestore.push({ name: 'status.md', path: statusPath, content: txState.statusContent });
  }
  if (txState.wuYamlContent && existsSync(wuPath)) {
    filesToRestore.push({ name: 'WU YAML', path: wuPath, content: txState.wuYamlContent });
  }

  const restoreResult = rollbackFiles(filesToRestore);

  for (const name of restoreResult.restored) {
    console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Restored ${name}`);
  }
  for (const err of restoreResult.errors) {
    console.error(
      `${LOG_PREFIX.DONE} ${EMOJI.FAILURE} Failed to restore ${err.name}: ${err.error}`,
    );
  }

  return restoreResult;
}

/** Reset main branch to original SHA if we drifted during the transaction. */
async function resetMainBranchIfNeeded(txState: TransactionState): Promise<void> {
  try {
    const gitAdapter = getGitForCwd();
    const currentBranch = await gitAdapter.getCurrentBranch();
    if (currentBranch === BRANCHES.MAIN) {
      const currentSHA = await gitAdapter.getCommitHash();
      if (currentSHA !== txState.mainSHA) {
        await gitAdapter.reset(txState.mainSHA, { hard: true });
        console.log(
          `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Reset main to ${txState.mainSHA.slice(0, GIT.SHA_SHORT_LENGTH)}`,
        );
      }
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX.DONE} Warning: Could not reset main: ${getErrorMessage(e)}`);
  }
}

/** WU-1280: Verify clean git status after rollback and log any residue. */
async function verifyCleanGitStateAfterRollback(): Promise<void> {
  try {
    const gitAdapter = getGitForCwd();
    const statusOutput = (await gitAdapter.raw(['status', '--porcelain'])).trim();
    if (statusOutput) {
      printStatusPreview(statusOutput);
    } else {
      console.log(`${LOG_PREFIX.DONE} ✅ Working tree is clean`);
    }
  } catch {
    // Ignore - git status may fail in edge cases
  }
}

// ── End of extracted rollback sub-operations ──

async function rollbackTransaction(
  txState: TransactionState,
  wuPath: string,
  stampPath: string,
  backlogPath: string,
  statusPath: string,
): Promise<void> {
  console.error(
    `\n${LOG_PREFIX.DONE} ${EMOJI.WARNING} ROLLING BACK TRANSACTION (WU-755 + WU-1230 + WU-1255 + WU-1280)...`,
  );

  // WU-1280: ATOMIC ROLLBACK - Clean git state FIRST, then restore files
  // WU-2400: Delegates to named sub-operations for readability.
  await resetGitStaging();
  removeStampIfExists(stampPath);
  const restoreResult = restoreFilesFromSnapshot(txState, wuPath, backlogPath, statusPath);
  await resetMainBranchIfNeeded(txState);
  await verifyCleanGitStateAfterRollback();

  // WU-1255: Report final status with all errors
  if (restoreResult.errors.length > 0) {
    console.error(
      `\n${LOG_PREFIX.DONE} ${EMOJI.WARNING} Rollback completed with ${restoreResult.errors.length} error(s):`,
    );
    for (const err of restoreResult.errors) {
      console.error(`  - ${err.name}: ${err.error}`);
    }
    console.error(`${LOG_PREFIX.DONE} Manual intervention required for failed files`);
    console.error(`${LOG_PREFIX.DONE} See playbook.md section 12 "Scenario D" for recovery steps`);
  } else {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Rollback complete - WU state fully reverted (no infinite loop)`,
    );
  }
}

/**
 * Validate WU code paths for incomplete work markers and Mock classes
 * @param {object} doc - WU YAML document
 * @param {string} id - WU ID
 * @param {boolean} allowTodo - Allow incomplete work markers (with warning)
 * @param {string|null} worktreePath - Path to worktree to validate files from
 */
function runWUValidator(
  doc: WUDocLike,
  id: string,
  allowTodo = false,
  worktreePath: string | null = null,
): void {
  console.log(`\n${LOG_PREFIX.DONE} Running WU validator for ${id}...`);

  // Check if WU has code_paths defined
  const codePaths = doc.code_paths || [];
  if (codePaths.length === 0) {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} No code_paths defined in WU YAML, skipping validator`,
    );
    return;
  }

  // Check if incomplete work flag requires justification in notes
  if (allowTodo) {
    // Handle both string and array formats for notes (WU-654)
    let notesText = '';
    if (typeof doc.notes === 'string') {
      notesText = doc.notes;
    } else if (Array.isArray(doc.notes)) {
      notesText = doc.notes.join(STRING_LITERALS.NEWLINE);
    }

    const hasJustification =
      notesText.toLowerCase().includes('todo') || notesText.toLowerCase().includes('allow-todo');
    if (!hasJustification) {
      die(
        '--allow-todo flag requires justification in WU YAML notes field.\n' +
          'Add a note explaining why TODOs are acceptable for this WU.',
      );
    }
  }

  // Validate from worktree if available (ensures we check the lane branch code)
  const validateOptions: { allowTodos: boolean; worktreePath?: string } = { allowTodos: allowTodo };
  if (worktreePath && existsSync(worktreePath)) {
    validateOptions.worktreePath = worktreePath;
    console.log(`${LOG_PREFIX.DONE} Validating code paths from worktree: ${worktreePath}`);
  }

  // Run validation
  const result = validateWUCodePaths(codePaths, validateOptions);

  // Display warnings
  if (result.warnings.length > 0) {
    console.log('\n⚠️  WU VALIDATOR WARNINGS:');
    result.warnings.forEach((warning) => console.log(warning));
  }

  // Handle errors
  if (!result.valid) {
    console.log('\n❌ WU VALIDATOR FAILED:');
    result.errors.forEach((error) => console.log(error));
    console.log('\nFix these issues before marking WU as done.');
    console.log(
      'Alternatively, use --allow-todo if TODOs are acceptable (requires justification in notes).',
    );
    die('WU validation failed. See errors above.');
  }

  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} WU validator passed`);
}

/**
 * Execute pre-flight checks before gates
 * Extracted from main() to reduce complexity (WU-1215 Phase 2 Extraction #3)
 * @param {object} params - Parameters
 * @param {string} params.id - WU ID
 * @param {object} params.args - Parsed CLI arguments
 * @param {boolean} params.isBranchOnly - Whether in branch-only mode
 * @param {boolean} params.isDocsOnly - Whether this is a docs-only WU
 * @param {object} params.docMain - Main WU YAML document
 * @param {object} params.docForValidation - WU YAML document to validate (worktree or main)
 * @param {string|null} params.derivedWorktree - Derived worktree path
 * @returns {Promise<{title: string, docForValidation: object}>} Updated title and doc
 */

// ── WU-2400: Named validator functions extracted from executePreFlightChecks ──

/** Validate WU YAML against Zod schema and done-specific rules. */
function preflightValidateYamlSchema(docForValidation: WUDocLike): ReturnType<typeof validateWU> {
  console.log(`${LOG_PREFIX.DONE} Validating WU YAML structure...`);
  const schemaResult = validateWU(docForValidation);
  if (!schemaResult.success) {
    const errors = schemaResult.error.issues
      .map((issue: ZodIssue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join(STRING_LITERALS.NEWLINE);
    die(`❌ WU YAML validation failed:\n\n${errors}\n\nFix these issues before running wu:done`);
  }

  if (docForValidation.status === WU_STATUS.DONE) {
    const doneResult = validateDoneWU(schemaResult.data);
    if (!doneResult.valid) {
      die(
        `❌ WU not ready for done status:\n\n${doneResult.errors.map((e) => `  - ${e}`).join(STRING_LITERALS.NEWLINE)}`,
      );
    }
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} WU YAML validation passed`);
  return schemaResult;
}

/** WU-2079: Ensure required approvals are present before allowing completion. */
function preflightValidateApprovalGates(
  id: string,
  schemaData: Parameters<typeof validateApprovalGates>[0],
): void {
  console.log(`${LOG_PREFIX.DONE} Checking approval gates...`);
  const approvalResult = validateApprovalGates(schemaData);
  if (!approvalResult.valid) {
    const governancePath = getConfig({ projectRoot: process.cwd() }).directories.governancePath;
    die(
      `❌ Approval gates not satisfied:\n\n${approvalResult.errors.map((e) => `  - ${e}`).join(STRING_LITERALS.NEWLINE)}\n\n` +
        `📋 To fix:\n` +
        `   1. Request approval from the required role(s)\n` +
        `   2. Add their email(s) to the 'approved_by' field in the WU YAML\n` +
        `   3. Re-run: pnpm wu:done --id ${id}\n\n` +
        `   See ${governancePath} for role definitions.`,
    );
  }
  if (approvalResult.warnings.length > 0) {
    approvalResult.warnings.forEach((w) => {
      console.warn(`${LOG_PREFIX.DONE} ⚠️  ${w}`);
    });
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Approval gates passed`);
}

/** WU-1805 + WU-2310: Validate code_paths consistency (preflight + type vs code_paths). */
async function preflightValidateCodePathsConsistency(
  id: string,
  docForValidation: WUDocLike,
  derivedWorktree: string | null,
): Promise<void> {
  // WU-1805: Preflight code_paths and test_paths validation
  const preflightResult = await executePreflightCodePathValidation(id, {
    rootDir: process.cwd(),
    worktreePath: derivedWorktree,
  });
  if (!preflightResult.valid) {
    const errorMessage = buildPreflightCodePathErrorMessage(id, preflightResult);
    die(errorMessage);
  }
  if (Array.isArray(preflightResult.warnings) && preflightResult.warnings.length > 0) {
    const warningLines = formatPreflightWarnings(
      preflightResult.warnings,
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Reality preflight warnings:`,
    );
    for (const line of warningLines) {
      console.log(line.startsWith('  - ') ? `${LOG_PREFIX.DONE} ${line}` : line);
    }
  }

  // WU-2310: Preflight type vs code_paths validation
  console.log(`${LOG_PREFIX.DONE} Validating type vs code_paths (WU-2310)...`);
  const typeVsCodePathsResult = validateTypeVsCodePathsPreflight(docForValidation);
  if (!typeVsCodePathsResult.valid) {
    const errorMessage = buildTypeVsCodePathsErrorMessage(id, typeVsCodePathsResult.blockedPaths);
    die(errorMessage);
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Type vs code_paths validation passed`);
}

/** WU-1234 + WU-1276: Validate backlog and WU state store consistency. */
async function preflightValidateBacklogAndStateConsistency(id: string): Promise<void> {
  console.log(`${LOG_PREFIX.DONE} Checking backlog consistency...`);
  const backlogPath = WU_PATHS.BACKLOG();
  const backlogConsistency = checkBacklogConsistencyForWU(id, backlogPath);
  if (!backlogConsistency.valid) {
    die(backlogConsistency.error ?? 'Backlog consistency check failed');
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Backlog consistency check passed`);

  console.log(`${LOG_PREFIX.DONE} Checking WU state consistency...`);
  const stateCheck = await checkWUConsistency(id);
  if (!stateCheck.valid) {
    const errors = stateCheck.errors
      .map((e) => `  - ${e.type}: ${e.description}`)
      .join(STRING_LITERALS.NEWLINE);
    die(
      `Pre-existing inconsistencies for ${id}:\n${errors}\n\n` +
        `Fix with: pnpm wu:repair --id ${id}`,
    );
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} WU state consistency check passed`);
}

/** Validate worktree state: branch-only vs worktree mode, parallel detection, claim metadata. */
async function preflightValidateWorktreeState(params: {
  id: string;
  args: WuDoneArgsLike;
  isBranchOnly: boolean;
  docMain: WUDocLike;
  docForValidation: WUDocLike;
  derivedWorktree: string | null;
}): Promise<void> {
  const { id, args, isBranchOnly, docMain, docForValidation, derivedWorktree } = params;

  if (isBranchOnly) {
    const laneBranch = await defaultBranchFrom(docMain);
    if (!laneBranch) die('Cannot determine lane branch from WU YAML');

    const validation = await validateBranchOnlyMode(laneBranch);
    if (!validation.valid) {
      die(validation.error ?? 'Branch-only mode validation failed');
    }

    console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Branch-Only mode validation passed`);
    console.log(`${LOG_PREFIX.DONE} Working on branch: ${laneBranch}`);
    return;
  }

  // Worktree mode: must be on main
  await ensureOnMain(getGitForCwd());

  // P0 EMERGENCY FIX Part 1: Restore wu-events.jsonl BEFORE parallel completion check
  // WU-2370: Preserve wu:brief evidence lines across the restore.
  if (derivedWorktree) {
    const wuEventsRelPath = resolveWuEventsRelativePath(derivedWorktree);
    const wuEventsAbsPath = path.join(derivedWorktree, wuEventsRelPath);

    let uncommittedBriefLines: string[] = [];
    try {
      const preRestoreContent = readFileSync(wuEventsAbsPath, {
        encoding: FILE_SYSTEM.UTF8 as BufferEncoding,
      });
      const committedContent = (() => {
        try {
          return execSync(`git -C "${derivedWorktree}" show HEAD:"${wuEventsRelPath}"`, {
            encoding: FILE_SYSTEM.UTF8 as BufferEncoding,
          });
        } catch {
          return '';
        }
      })();
      const committedLines = new Set(committedContent.trim().split('\n').filter(Boolean));
      uncommittedBriefLines = preRestoreContent
        .trim()
        .split('\n')
        .filter((line) => !committedLines.has(line) && line.includes('[wu:brief]'));
    } catch {
      // Non-fatal: file might not exist
    }

    try {
      execSync(`git -C "${derivedWorktree}" restore "${wuEventsRelPath}"`);
    } catch {
      // Non-fatal: file might not exist or already clean
    }

    if (uncommittedBriefLines.length > 0) {
      try {
        appendFileSync(wuEventsAbsPath, uncommittedBriefLines.join('\n') + '\n', {
          encoding: FILE_SYSTEM.UTF8 as BufferEncoding,
        });
      } catch {
        // Non-fatal: best-effort evidence preservation
      }
    }
  }

  // WU-1382: Detect parallel completions and warn
  // WU-1584 Fix #3: Trigger auto-rebase instead of just warning
  console.log(`${LOG_PREFIX.DONE} Checking for parallel WU completions...`);
  const parallelResult = await detectParallelCompletions(id, docForValidation);
  if (parallelResult.hasParallelCompletions) {
    console.warn(parallelResult.warning);
    emitTelemetry({
      script: 'wu-done',
      wu_id: id,
      step: 'parallel_detection',
      parallel_wus: parallelResult.completedWUs,
      count: parallelResult.completedWUs.length,
    });

    await checkInboxForRecentSignals(id);

    if (derivedWorktree && !args.noAutoRebase) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.INFO} WU-1584: Triggering auto-rebase to incorporate parallel completions...`,
      );
      const laneBranch = await defaultBranchFrom(docForValidation);
      if (laneBranch) {
        const rebaseResult = await autoRebaseBranch(laneBranch, derivedWorktree, id);
        if (rebaseResult.success) {
          console.log(
            `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} WU-1584: Auto-rebase complete - parallel completions incorporated`,
          );
          emitTelemetry({
            script: MICRO_WORKTREE_OPERATIONS.WU_DONE,
            wu_id: id,
            step: TELEMETRY_STEPS.PARALLEL_AUTO_REBASE,
            parallel_wus: parallelResult.completedWUs,
            count: parallelResult.completedWUs.length,
          });
        } else {
          console.error(`${LOG_PREFIX.DONE} ${EMOJI.FAILURE} Auto-rebase failed`);
          console.error(rebaseResult.error);
          die(
            `WU-1584: Auto-rebase failed after detecting parallel completions.\n` +
              `Manual resolution required - see instructions above.`,
          );
        }
      }
    } else if (!args.noAutoRebase) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Cannot auto-rebase (no worktree path) - proceeding with caution`,
      );
    } else {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Auto-rebase disabled (--no-auto-rebase) - proceeding with caution`,
      );
    }
  }

  // WU-1381: Detect background processes that might interfere with gates
  if (derivedWorktree) {
    await runBackgroundProcessCheck(derivedWorktree);
  }

  // WU-1804: Fail fast before gates with comprehensive claim metadata check.
  if (derivedWorktree) {
    await validateClaimMetadataBeforeGates(id, derivedWorktree, docForValidation.status);
  }
}

/** Validate ownership: session ownership + assigned_to ownership (worktree mode only). */
async function preflightValidateOwnership(params: {
  id: string;
  args: WuDoneArgsLike;
  isBranchOnly: boolean;
  docForValidation: WUDocLike;
  derivedWorktree: string | null;
}): Promise<void> {
  const { id, args, isBranchOnly, docForValidation, derivedWorktree } = params;
  if (isBranchOnly) return;

  const activeSession = getCurrentSessionForWU();
  const prepCheckpointResult = await resolveCheckpointSkipResult(id, derivedWorktree || null);
  const sessionOwnership = validateClaimSessionOwnership({
    wuId: id,
    claimedSessionId:
      typeof docForValidation.session_id === 'string' ? docForValidation.session_id : null,
    activeSessionId: activeSession?.session_id ?? null,
    force: Boolean(args.force),
    hasValidPrepCheckpoint: prepCheckpointResult.canSkip,
    skipGates: Boolean(args['skip-gates']),
  });

  if (!sessionOwnership.valid) {
    die(sessionOwnership.error ?? 'Claim-session ownership check failed');
  }

  if (
    sessionOwnership.auditRequired &&
    typeof docForValidation.session_id === 'string' &&
    derivedWorktree
  ) {
    await appendClaimSessionOverrideAuditEvent({
      wuId: id,
      claimedSessionId: docForValidation.session_id,
      activeSessionId: activeSession?.session_id ?? null,
      reason: args.reason || 'force ownership override',
      worktreePath: derivedWorktree,
    });
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Claim-session ownership overridden with --force; audit checkpoint recorded.`,
    );
  }

  const ownershipCheck = await checkOwnership(
    id,
    docForValidation,
    derivedWorktree,
    args.overrideOwner,
    args.reason,
  );

  if (!ownershipCheck.valid) {
    die(ownershipCheck.error ?? 'Ownership check failed');
  }

  if (ownershipCheck.auditEntry) {
    auditOwnershipOverride(ownershipCheck.auditEntry);

    const overrideNote = `Ownership override: Completed by ${ownershipCheck.auditEntry.completed_by} (assigned to ${ownershipCheck.auditEntry.assigned_to}). Reason: ${args.reason}`;
    appendNote(docForValidation, overrideNote);

    if (derivedWorktree) {
      const wtWUPath = path.join(derivedWorktree, WU_PATHS.WU(id));
      if (existsSync(wtWUPath)) {
        writeWU(wtWUPath, docForValidation);
      }
    }
  }
}

/** WU-1280: Early spec completeness validation (before gates). */
function preflightValidateSpecCompleteness(id: string, docForValidation: WUDocLike): void {
  console.log(`\n${LOG_PREFIX.DONE} Validating spec completeness for ${id}...`);
  const specResult = validateSpecCompleteness(docForValidation, id);
  if (!specResult.valid) {
    console.error(`\n❌ Spec completeness validation failed for ${id}:\n`);
    specResult.errors.forEach((err) => console.error(`  - ${err}`));
    const specConfig = getConfig();
    console.error(
      `\nFix these issues before running wu:done:\n` +
        `  1. Update ${specConfig.directories.wuDir}/${id}.yaml\n` +
        `  2. Fill description with Context/Problem/Solution\n` +
        `  3. Replace ${PLACEHOLDER_SENTINEL} text with specific criteria\n` +
        `  4. List all modified files in code_paths\n` +
        `  5. Add at least one test path (unit, e2e, integration, or manual)\n` +
        `  6. Re-run: pnpm wu:done --id ${id}\n\n` +
        `See: CLAUDE.md §2.7 "WUs are specs, not code"\n`,
    );
    die(`Cannot mark ${id} as done - spec incomplete`);
  }
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Spec completeness check passed`);

  // WU-1351: Validate code_paths files exist
  console.log(`\n${LOG_PREFIX.DONE} Validating code_paths existence for ${id}...`);
}

/** WU-1324 + WU-1542: Check mandatory agent compliance. */
function preflightCheckMandatoryAgents(
  id: string,
  args: WuDoneArgsLike,
  codePaths: string[],
): void {
  const compliance = checkMandatoryAgentsComplianceBlocking(codePaths, id, {
    blocking: Boolean(args.requireAgents),
  });

  if (compliance.blocking && compliance.errorMessage) {
    die(compliance.errorMessage);
  } else if (!compliance.compliant) {
    console.warn(`\n${LOG_PREFIX.DONE} ${EMOJI.WARNING} MANDATORY AGENT WARNING`);
    console.warn(`The following mandatory agents were not confirmed as invoked:`);
    for (const agent of compliance.missing) {
      console.warn(`  • ${agent}`);
    }
    console.warn(`\nThis is a NON-BLOCKING warning.`);
    console.warn(`Use --require-agents to make this a blocking error.\n`);
  }
}

/** Validate --skip-gates requirements: --reason and --fix-wu are mandatory. */
function preflightValidateSkipGatesRequirements(args: WuDoneArgsLike): void {
  if (!args.skipGates) return;
  if (!args.reason) {
    die('--skip-gates requires --reason "<explanation of why gates are being skipped>"');
  }
  if (!args.fixWu) {
    die('--skip-gates requires --fix-wu WU-{id} (the WU that will fix the failing tests)');
  }
  if (!PATTERNS.WU_ID.test(args.fixWu.toUpperCase())) {
    die(`Invalid --fix-wu value '${args.fixWu}'. Expected format: WU-123`);
  }
}

// ── End of extracted validators ──

async function executePreFlightChecks({
  id,
  args,
  isBranchOnly,
  isDocsOnly,
  docMain,
  docForValidation,
  derivedWorktree,
}: PreFlightParams): Promise<{ title: string; docForValidation: WUDocLike }> {
  // WU-2400: Delegates to named validator functions to reduce cognitive complexity.
  const schemaResult = preflightValidateYamlSchema(docForValidation);
  // schemaResult.data is guaranteed defined: preflightValidateYamlSchema die()s on failure
  preflightValidateApprovalGates(id, schemaResult.data!);
  await preflightValidateCodePathsConsistency(id, docForValidation, derivedWorktree);

  // Tripwire: Scan commands log for violations
  runTripwireCheck();

  await preflightValidateBacklogAndStateConsistency(id);
  await preflightValidateWorktreeState({
    id,
    args,
    isBranchOnly,
    docMain,
    docForValidation,
    derivedWorktree,
  });

  // Use worktree title for commit message (not stale main title)
  const title = docForValidation.title || docMain.title || '';

  if (isDocsOnly) {
    console.log('\n📝 Docs-only WU detected');
    console.log('   - Gates will skip lint/typecheck/tests');
    console.log('   - Only docs/markdown paths allowed\n');
  }

  if (isBranchOnly) {
    console.log('\n🌿 Branch-Only mode detected');
    console.log('   - Gates run in main checkout on lane branch');
    console.log('   - No worktree to remove\n');
  }

  await preflightValidateOwnership({
    id,
    args,
    isBranchOnly,
    docForValidation,
    derivedWorktree,
  });

  preflightValidateSpecCompleteness(id, docForValidation);

  // code_paths existence check (continuation of spec completeness)
  const codePathsResult = await validateCodePathsExist(docForValidation, id, {
    worktreePath: derivedWorktree,
    targetBranch: isBranchOnly ? 'HEAD' : BRANCHES.MAIN,
  });
  if ('valid' in codePathsResult && !codePathsResult.valid) {
    console.error(`\n❌ code_paths validation failed for ${id}:\n`);
    if ('errors' in codePathsResult) {
      codePathsResult.errors.forEach((err: string) => console.error(err));
    }
    die(`Cannot mark ${id} as done - code_paths missing from target branch`);
  }

  preflightCheckMandatoryAgents(id, args, docForValidation.code_paths || []);

  // WU-1012: Validate --docs-only flag usage (BLOCKING)
  const docsOnlyValidation = validateDocsOnlyFlag(docForValidation, { docsOnly: args.docsOnly });
  if (!docsOnlyValidation.valid) {
    die(docsOnlyValidation.errors[0]);
  }

  // WU-1999: Exposure validation (NON-BLOCKING warning)
  printExposureWarnings(docForValidation, { skipExposureCheck: args.skipExposureCheck });

  // WU-2022: Feature accessibility validation (BLOCKING)
  validateAccessibilityOrDie(docForValidation, {
    skipAccessibilityCheck: args.skipAccessibilityCheck,
  });

  // Run WU validator
  runWUValidator(docForValidation, id, args.allowTodo, derivedWorktree);

  preflightValidateSkipGatesRequirements(args);

  return { title, docForValidation };
}

/**
 * Print State HUD for visibility
 * Extracted from main() to reduce complexity (WU-1215 Phase 2 Extraction #4)
 * @param {object} params - Parameters
 * @param {string} params.id - WU ID
 * @param {object} params.docMain - Main WU YAML document
 * @param {boolean} params.isBranchOnly - Whether in branch-only mode
 * @param {boolean} params.isDocsOnly - Whether this is a docs-only WU
 * @param {string|null} params.derivedWorktree - Derived worktree path
 * @param {string} params.STAMPS_DIR - Stamps directory path
 */
export function getYamlStatusForDisplay(status: unknown) {
  return getWUStatusDisplay(status);
}

export function evaluateWuDoneMainMutationGuard(options: {
  mainCheckout: string;
  isBranchPr: boolean;
  hasActiveWorktreeContext: boolean;
  mainStatus: string;
}) {
  return evaluateMainDirtyMutationGuard({
    commandName: 'wu:done',
    mainCheckout: options.mainCheckout,
    mainStatus: options.mainStatus,
    hasActiveWorktreeContext: options.hasActiveWorktreeContext,
    isBranchPrMode: options.isBranchPr,
  });
}

function printStateHUD({
  id,
  docMain,
  isBranchOnly,
  isDocsOnly,
  derivedWorktree,
  STAMPS_DIR,
}: StateHudParams): void {
  const stampExists = existsSync(path.join(STAMPS_DIR, `${id}.done`)) ? 'yes' : 'no';
  const yamlStatus = getYamlStatusForDisplay(docMain.status);
  const yamlLocked = docMain.locked === true ? 'true' : 'false';
  const mode = isBranchOnly ? 'branch-only' : isDocsOnly ? 'docs-only' : 'worktree';
  const branch = defaultBranchFrom(docMain) || 'n/a';
  const worktreeDisplay = isBranchOnly ? 'none' : derivedWorktree || 'none';
  console.log(
    `\n${LOG_PREFIX.DONE} HUD: WU=${id} status=${yamlStatus} stamp=${stampExists} locked=${yamlLocked} mode=${mode} branch=${branch} worktree=${worktreeDisplay}`,
  );
}

// ── WU-2400: Extracted path-specific handlers from main() ──

/**
 * WU-2211: Handle --already-merged early exit path.
 * Skips merge phase, gates, worktree detection. Only writes metadata.
 */
async function executeAlreadyMergedFinalizePath(id: string, docMain: WUDocLike): Promise<never> {
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.INFO} WU-2211: --already-merged mode activated`);

  // Safety check: verify code_paths exist on HEAD of main
  const codePaths = (docMain.code_paths as string[]) || [];
  const verification = await verifyCodePathsOnMainHead(codePaths);

  if (!verification.valid) {
    die(
      `${EMOJI.FAILURE} --already-merged safety check failed\n\n` +
        `${verification.error}\n\n` +
        `Cannot finalize ${id}: code_paths must exist on HEAD before using --already-merged.`,
    );
  }

  console.log(
    `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Safety check passed: all ${codePaths.length} code_paths verified on HEAD`,
  );

  // Execute finalize-only path
  const title = String(docMain.title || id);
  const lane = String(docMain.lane || '');
  const finalizeResult = await executeAlreadyMergedFinalizeFromModule({
    id,
    title,
    lane,
    doc: docMain as Record<string, unknown>,
  });

  if (!finalizeResult.success) {
    die(
      `${EMOJI.FAILURE} --already-merged finalization failed\n\n` +
        `Errors:\n${finalizeResult.errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Partial state may remain. Rerun: pnpm wu:done --id ${id} --already-merged`,
    );
  }

  // Release lane lock (non-blocking)
  try {
    const lane = docMain.lane;
    if (lane) {
      const releaseResult = releaseLaneLock(lane, { wuId: id });
      if (releaseResult.released && !releaseResult.notFound) {
        console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Lane lock released for "${lane}"`);
      }
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} Warning: Could not release lane lock: ${getErrorMessage(err)}`,
    );
  }

  // End agent session (non-blocking)
  try {
    endSessionForWU();
  } catch {
    // Non-blocking
  }

  // Broadcast completion signal (non-blocking)
  await broadcastCompletionSignal(id, title);

  console.log(`\n${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} ${id} finalized via --already-merged`);
  console.log(`- WU: ${id} -- ${title}`);

  clearConfigCache();
  process.exit(EXIT_CODES.SUCCESS);
}

/**
 * WU-2400: The normal wu:done pipeline (validation, gates, completion, cleanup).
 * Extracted from main() to reduce cognitive complexity.
 */
async function executeNormalWuDonePath(params: {
  id: string;
  args: ReturnType<typeof validateInputs>['args'];
  docMain: WUDocLike;
  initialDocForValidation: WUDocLike;
  isBranchOnly: boolean;
  isBranchPR: boolean;
  derivedWorktree: string | null;
  isDocsOnly: boolean;
  mainCheckoutPath: string;
  WU_PATH: string;
  STATUS_PATH: string;
  BACKLOG_PATH: string;
  STAMPS_DIR: string;
}): Promise<void> {
  const {
    id,
    args,
    docMain,
    initialDocForValidation,
    isBranchOnly,
    isBranchPR,
    derivedWorktree,
    isDocsOnly,
    mainCheckoutPath,
    WU_PATH,
    STATUS_PATH,
    BACKLOG_PATH,
    STAMPS_DIR,
  } = params;

  // WU-1663: Determine prepPassed early for pipeline actor input.
  const earlySkipResult = await resolveCheckpointSkipResult(id, derivedWorktree || null);
  const prepPassed = earlySkipResult.canSkip;

  // WU-1663: Create XState pipeline actor for state-driven orchestration.
  const pipelineActor = createActor(wuDoneMachine, {
    input: {
      wuId: id,
      worktreePath: derivedWorktree,
      prepPassed,
    },
  });
  pipelineActor.start();

  pipelineActor.send({
    type: WU_DONE_EVENTS.START,
    wuId: id,
    worktreePath: derivedWorktree || '',
  });

  // WU-1590: branch-pr has no worktree, treat like branch-only for path resolution and ensureOnMain skip
  const isNoWorktreeMode = isBranchOnly || isBranchPR;
  const resolvedWorktreePath =
    derivedWorktree && !isNoWorktreeMode
      ? path.isAbsolute(derivedWorktree)
        ? derivedWorktree
        : path.resolve(mainCheckoutPath, derivedWorktree)
      : null;
  const worktreeExists = resolvedWorktreePath ? existsSync(resolvedWorktreePath) : false;
  const { allowFallback: allowBranchOnlyFallback, effectiveBranchOnly } = computeBranchOnlyFallback(
    {
      isBranchOnly: isNoWorktreeMode,
      branchOnlyRequested: args.branchOnly,
      worktreeExists,
      derivedWorktree,
    },
  );
  if (allowBranchOnlyFallback) {
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Worktree missing (${resolvedWorktreePath}). Proceeding in branch-only mode because --branch-only was provided.`,
    );
  }

  const effectiveDerivedWorktree = effectiveBranchOnly ? null : derivedWorktree;
  const effectiveWorktreePath = effectiveBranchOnly ? null : resolvedWorktreePath;

  const mainStatus = await getGitForCwd().getStatus();
  const mainMutationGuard = evaluateWuDoneMainMutationGuard({
    mainCheckout: mainCheckoutPath,
    isBranchPr: isBranchPR,
    hasActiveWorktreeContext: Boolean(effectiveWorktreePath && existsSync(effectiveWorktreePath)),
    mainStatus,
  });
  if (mainMutationGuard.blocked) {
    die(mainMutationGuard.message ?? 'wu:done blocked by dirty-main guard.');
  }

  // WU-2327: Verify current-session wu:brief evidence before pre-flight restores
  await enforceWuBriefEvidenceForDone(id, docMain, {
    baseDir: effectiveWorktreePath || mainCheckoutPath,
    force: Boolean(args.force),
  });

  // WU-1169: Ensure worktree is clean before proceeding
  if (effectiveWorktreePath && existsSync(effectiveWorktreePath)) {
    await ensureCleanWorktree(effectiveWorktreePath);
  }

  // Pre-flight checks
  let preFlightResult: Awaited<ReturnType<typeof executePreFlightChecks>>;
  try {
    preFlightResult = await executePreFlightChecks({
      id,
      args,
      isBranchOnly: effectiveBranchOnly,
      isDocsOnly,
      docMain,
      docForValidation: initialDocForValidation,
      derivedWorktree: effectiveDerivedWorktree,
    });
  } catch (preFlightErr) {
    pipelineActor.send({
      type: WU_DONE_EVENTS.VALIDATION_FAILED,
      error: getErrorMessage(preFlightErr),
    });
    pipelineActor.stop();
    throw preFlightErr;
  }
  const title = preFlightResult.title;

  pipelineActor.send({ type: WU_DONE_EVENTS.VALIDATION_PASSED });

  // WU-1599: Enforce auditable spawn provenance for initiative-governed WUs.
  await enforceSpawnProvenanceForDone(id, docMain, {
    baseDir: mainCheckoutPath,
    force: Boolean(args.force),
  });

  // Step 0: Run gates
  const worktreePath = effectiveWorktreePath;

  // WU-1471 AC3 + WU-1998: Config-driven checkpoint gate
  const checkpointGateConfig = getConfig();
  const requireCheckpoint = resolveCheckpointGateMode(
    checkpointGateConfig.memory?.enforcement?.require_checkpoint_for_done,
  );
  await enforceCheckpointGateForDone({
    id,
    workspacePath: worktreePath || mainCheckoutPath,
    mode: requireCheckpoint,
  });

  pipelineActor.send({ type: WU_DONE_EVENTS.PREPARATION_COMPLETE });

  // WU-2102: Resolve scoped test paths from WU spec tests.unit for gate fallback
  const scopedTestPathsForDone = resolveScopedUnitTestsForPrep({
    tests: docMain.tests as { unit?: unknown } | undefined,
  });

  let gateExecutionResult: Awaited<ReturnType<typeof executeGates>>;
  try {
    gateExecutionResult = await executeGates(
      {
        id,
        args,
        isBranchOnly: effectiveBranchOnly,
        isDocsOnly,
        worktreePath,
        scopedTestPaths: scopedTestPathsForDone,
      },
      {
        auditSkipGates,
        auditSkipCosGates,
        createPreGatesCheckpoint,
        emitTelemetry,
      },
    );
  } catch (gateErr) {
    pipelineActor.send({
      type: WU_DONE_EVENTS.GATES_FAILED,
      error: getErrorMessage(gateErr),
    });
    pipelineActor.stop();
    throw gateErr;
  }

  if (gateExecutionResult.skippedByCheckpoint) {
    pipelineActor.send({ type: WU_DONE_EVENTS.GATES_SKIPPED });
  } else {
    pipelineActor.send({ type: WU_DONE_EVENTS.GATES_PASSED });
  }

  printStateHUD({
    id,
    docMain,
    isBranchOnly: effectiveBranchOnly,
    isDocsOnly,
    derivedWorktree: effectiveDerivedWorktree,
    STAMPS_DIR,
  });

  // Step 0.5 + 0.6: Pre-flight staged validation policy and tasks:validate guard.
  await runWuDoneStagedValidation({
    id,
    worktreePath,
    gateResult: {
      fullGatesRanInCurrentRun: gateExecutionResult.fullGatesRanInCurrentRun,
      skippedByCheckpoint: gateExecutionResult.skippedByCheckpoint,
      checkpointId: gateExecutionResult.checkpointId,
    },
    skipGates: Boolean(args.skipGates),
    runGatesFn: ({ cwd }) => runGates({ cwd, docsOnly: false }),
  });

  // Step 1: Execute mode-specific completion workflow (WU-2167)
  let completionResult: {
    cleanupSafe?: boolean;
    success?: boolean;
    committed?: boolean;
    pushed?: boolean;
    merged?: boolean;
    recovered?: boolean;
    prUrl?: string | null;
  } = { cleanupSafe: true };

  if (!args.noAuto) {
    completionResult = await executeModeSpecificCompletion({
      id,
      args,
      docMain,
      title,
      isDocsOnly,
      maxCommitLength: getCommitHeaderLimit(),
      isBranchPR,
      effectiveBranchOnly,
      worktreePath,
      resolvedWorktreePath,
      pipelineActor: {
        send: (event) => pipelineActor.send(event as never),
        stop: () => pipelineActor.stop(),
        getSnapshot: () =>
          pipelineActor.getSnapshot() as { value: unknown; context: { failedAt?: unknown } },
      },
      validateStagedFiles,
      defaultBranchFrom: (doc) => defaultBranchFrom(doc as Record<string, unknown>),
      executeAlreadyMergedFinalize: executeAlreadyMergedFinalizeFromModule,
      recordTransactionState,
      rollbackTransaction,
    });
  } else {
    await ensureNoAutoStagedOrNoop([WU_PATH, STATUS_PATH, BACKLOG_PATH, STAMPS_DIR]);
  }

  // WU-2262: Do not run repository-wide worktree_path sanitation from local main during wu:done.

  // Step 6 & 7: Cleanup (remove worktree, delete branch)
  if (completionResult.cleanupSafe !== false) {
    await runCleanup(docMain, args);
  } else {
    console.log(
      `\n${LOG_PREFIX.DONE} ${EMOJI.WARNING} WU-1811: Skipping worktree cleanup - metadata/push incomplete`,
    );
  }

  // WU-1603: Release lane lock after successful completion
  try {
    const lane = docMain.lane;
    if (lane) {
      const releaseResult = releaseLaneLock(lane, { wuId: id });
      if (releaseResult.released && !releaseResult.notFound) {
        console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Lane lock released for "${lane}"`);
      }
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} Warning: Could not release lane lock: ${getErrorMessage(err)}`,
    );
  }

  // WU-1438: Auto-end agent session
  try {
    const sessionResult = endSessionForWU();
    if (sessionResult.ended) {
      const sessionId = sessionResult.summary?.session_id;
      if (sessionId) {
        console.log(
          `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Agent session ended (${sessionId.slice(0, SESSION.ID_DISPLAY_LENGTH)}...)`,
        );
      }
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} Warning: Could not end agent session: ${getErrorMessage(err)}`,
    );
  }

  // WU-1588: Broadcast completion signal after session end
  await broadcastCompletionSignal(id, title);

  // WU-1473: Mark completed-WU signals as read
  const markResult = await markCompletedWUSignalsAsRead(mainCheckoutPath, id);
  if (markResult.markedCount > 0) {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Marked ${markResult.markedCount} signal(s) as read for ${id}`,
    );
  }

  // WU-1946: Update spawn registry to mark WU as completed
  await updateSpawnRegistryOnCompletion(id, mainCheckoutPath);

  await flushWuLifecycleSync(
    {
      command: WU_LIFECYCLE_COMMANDS.DONE,
      wuId: id,
    },
    {
      workspaceRoot: mainCheckoutPath,
      logger: {
        warn: (message) => console.warn(`${LOG_PREFIX.DONE} ${message}`),
      },
    },
  );

  // WU-1747: Clear checkpoint on successful completion
  clearCheckpoint(id, { baseDir: worktreePath || undefined });

  // WU-1471 AC4: Remove per-WU hook counter file on completion
  cleanupHookCounters(mainCheckoutPath, id);

  // WU-1474: Invoke decay archival when memory.decay policy is configured
  try {
    const decayConfig = getConfig().memory?.decay;
    const decayResult = await runDecayOnDone(mainCheckoutPath, decayConfig);
    if (decayResult.ran && decayResult.archivedCount > 0) {
      console.log(
        `${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Decay archival: ${decayResult.archivedCount} stale memory node(s) archived`,
      );
    } else if (decayResult.error) {
      console.warn(
        `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Decay archival skipped (fail-open): ${decayResult.error}`,
      );
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX.DONE} ${EMOJI.WARNING} Decay archival error (fail-open): ${getErrorMessage(err)}`,
    );
  }

  // WU-1663: Cleanup complete - transition to final done state
  pipelineActor.send({ type: WU_DONE_EVENTS.CLEANUP_COMPLETE });

  const finalSnapshot = pipelineActor.getSnapshot();
  console.log(`${LOG_PREFIX.DONE} Pipeline state: ${finalSnapshot.value} (WU-1663)`);
  pipelineActor.stop();

  console.log(
    `\n${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Transaction COMMIT - all steps succeeded (WU-755)`,
  );
  console.log(`${LOG_PREFIX.DONE} ${EMOJI.SUCCESS} Marked done, pushed, and cleaned up.`);
  console.log(`- WU: ${id} — ${title}`);

  clearConfigCache();

  // WU-1763: Print lifecycle nudges (conditional, non-blocking)
  const discoveries = await loadDiscoveriesForWU(mainCheckoutPath, id);
  printDiscoveryNudge(id, discoveries.count, discoveries.ids);

  if (worktreePath) {
    const changedDocs = await detectChangedDocPaths(worktreePath, BRANCHES.MAIN);
    printDocValidationNudge(id, changedDocs);
  }

  const currentBranch = (await getGitForCwd().getCurrentBranch()).trim();
  const shouldRunCleanupMutations =
    currentBranch.length > 0 &&
    currentBranch !== BRANCHES.MAIN &&
    currentBranch !== BRANCHES.MASTER;

  if (shouldRunCleanupMutations) {
    await runAutoCleanupAfterDone(mainCheckoutPath);
    await commitCleanupChanges({ targetBranch: currentBranch });
  } else {
    console.log(
      `${LOG_PREFIX.DONE} ${EMOJI.INFO} WU-1611: Skipping auto-cleanup mutations on protected branch ${currentBranch}`,
    );
  }
}

// ── End of extracted path-specific handlers ──

export async function main() {
  // Allow pre-push hook to recognize wu:done automation (WU-1030)
  process.env[ENV_VARS.WU_TOOL] = 'wu-done';

  // Validate CLI arguments and WU ID format
  const { args, id } = validateInputs(process.argv);

  // WU-1223: Check if running from worktree - wu:done requires main checkout
  const { LOCATION_TYPES } = CONTEXT_VALIDATION;
  const currentLocation = await resolveLocation();
  if (currentLocation.type === LOCATION_TYPES.WORKTREE) {
    die(
      `${EMOJI.FAILURE} wu:done must be run from main checkout, not from a worktree.\n\n` +
        `Current location: ${currentLocation.cwd}\n\n` +
        `WU-1223 NEW WORKFLOW:\n` +
        `  1. From worktree, run: pnpm wu:prep --id ${id}\n` +
        `     (This runs gates and prepares for completion)\n\n` +
        `  2. From main, run: cd ${currentLocation.mainCheckout} && pnpm wu:done --id ${id}\n` +
        `     (This does merge + cleanup only)\n\n` +
        `Use wu:prep to run gates in the worktree, then wu:done from main for merge/cleanup.`,
    );
  }

  // Detect workspace mode and calculate paths
  const pathInfo = await detectModeAndPaths(id, args);
  const {
    WU_PATH,
    STATUS_PATH,
    BACKLOG_PATH,
    STAMPS_DIR,
    docMain: docMainRaw,
    isBranchOnly,
    isBranchPR,
    derivedWorktree,
    docForValidation: initialDocForValidationRaw,
    isDocsOnly,
  } = pathInfo;
  const docMain = normalizeWUDocLike(docMainRaw);
  const initialDocForValidation = normalizeWUDocLike(initialDocForValidationRaw);
  const mainCheckoutPath = process.cwd();

  // WU-2400: Dispatch to extracted path-specific handlers.
  if (args.alreadyMerged) {
    await executeAlreadyMergedFinalizePath(id, docMain);
  }

  await executeNormalWuDonePath({
    id,
    args,
    docMain,
    initialDocForValidation,
    isBranchOnly,
    isBranchPR,
    derivedWorktree,
    isDocsOnly,
    mainCheckoutPath,
    WU_PATH,
    STATUS_PATH,
    BACKLOG_PATH,
    STAMPS_DIR,
  });
}

/**
 * WU-1763: Print discovery summary nudge when discoveries exist for this WU.
 * Conditional output - only prints when discoveryCount > 0.
 * Non-blocking, single-line output to avoid flooding the console.
 *
 * @param {string} id - WU ID being completed
 * @param {number} discoveryCount - Number of open discoveries for this WU
 * @param {string[]} discoveryIds - List of discovery IDs (limited to 5 in output)
 */
export function printDiscoveryNudge(
  id: string,
  discoveryCount: number,
  discoveryIds: string[],
): void {
  if (discoveryCount > 0) {
    const displayIds = discoveryIds.slice(0, 5).join(', ');
    const moreText = discoveryCount > 5 ? ` (+${discoveryCount - 5} more)` : '';
    console.log(
      `\n${LOG_PREFIX.DONE} 💡 ${discoveryCount} open discoveries: ${displayIds}${moreText}`,
    );
    console.log(`   Triage with: pnpm mem:triage --wu ${id}`);
  }
}

/**
 * WU-1763: Print documentation validation nudge when docs changed.
 * Conditional output - only prints when changedDocPaths.length > 0.
 * Non-blocking, single-line output to avoid flooding the console.
 *
 * @param {string} id - WU ID being completed
 * @param {string[]} changedDocPaths - List of documentation paths that changed
 */
export function printDocValidationNudge(id: string, changedDocPaths: string[]): void {
  if (changedDocPaths.length > 0) {
    console.log(`\n${LOG_PREFIX.DONE} 💡 Documentation changed (${changedDocPaths.length} files).`);
    console.log(`   Consider: pnpm validate:context && pnpm docs:linkcheck`);
  }
}

/**
 * WU-1763: Load discoveries for a WU from memory store.
 * Non-blocking - returns empty array on errors.
 *
 * @param {string} baseDir - Base directory containing .lumenflow/memory/
 * @param {string} wuId - WU ID to load discoveries for
 * @returns {Promise<{count: number, ids: string[]}>} Discovery count and IDs
 */
async function loadDiscoveriesForWU(
  baseDir: string,
  wuId: string,
): Promise<{ count: number; ids: string[] }> {
  try {
    const memory = await loadMemory(path.join(baseDir, '.lumenflow/memory'));
    const wuNodes = memory.byWu.get(wuId) || [];
    const discoveries = wuNodes.filter(
      (node: { type?: string; id: string }) => node.type === 'discovery',
    );
    return {
      count: discoveries.length,
      ids: discoveries.map((d: { id: string }) => d.id),
    };
  } catch {
    // Non-blocking: return empty on errors
    return { count: 0, ids: [] };
  }
}

/**
 * WU-1763: Detect documentation paths from changed files.
 * Non-blocking - returns empty array on errors.
 *
 * @param {string} worktreePath - Path to worktree
 * @param {string} baseBranch - Base branch to compare against
 * @returns {Promise<string[]>} List of changed documentation paths
 */
async function detectChangedDocPaths(worktreePath: string, baseBranch: string) {
  try {
    const git = getGitForCwd();
    // Get files changed in this branch vs base
    const diff = await git.raw(['diff', '--name-only', baseBranch]);
    const changedFiles: string[] = diff.split('\n').filter(Boolean);
    const docsOnlyPrefixes = getDocsOnlyPrefixes({ projectRoot: worktreePath }).map((prefix) =>
      prefix.toLowerCase(),
    );
    const docsRootFiles = DOCS_ONLY_ROOT_FILES.map((pattern) => pattern.toLowerCase());

    // Filter to documentation-related files using configured prefixes.
    return changedFiles.filter((filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, '/').trim();
      const lowerPath = normalizedPath.toLowerCase();

      if (docsOnlyPrefixes.some((prefix) => lowerPath.startsWith(prefix))) {
        return true;
      }

      if (!lowerPath.endsWith('.md')) {
        return false;
      }

      return docsRootFiles.some((pattern) => lowerPath.startsWith(pattern));
    });
  } catch {
    // Non-blocking: return empty on errors
    return [];
  }
}

// Guard main() execution for testability (WU-1366)
// When imported as a module for testing, main() should not auto-run
// WU-1071: Use import.meta.main instead of process.argv[1] comparison
// The old pattern fails with pnpm symlinks because process.argv[1] is the symlink
// path but import.meta.url resolves to the real path - they never match
import { runCLI } from './cli-entry-point.js';
if (import.meta.main) {
  void runCLI(main);
}
