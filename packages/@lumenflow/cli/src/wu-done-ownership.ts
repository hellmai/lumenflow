// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

export interface ClaimSessionOwnershipInput {
  wuId: string;
  claimedSessionId?: string | null;
  activeSessionId?: string | null;
  force: boolean;
  /** WU-2341: If true, a valid wu:prep checkpoint exists, authorizing session handoff. */
  hasValidPrepCheckpoint?: boolean;
}

export interface ClaimSessionOwnershipResult {
  valid: boolean;
  auditRequired: boolean;
  error: string | null;
}

export function validateClaimSessionOwnership({
  wuId,
  claimedSessionId,
  activeSessionId,
  force,
  hasValidPrepCheckpoint,
}: ClaimSessionOwnershipInput): ClaimSessionOwnershipResult {
  // Legacy WUs without claim-session metadata remain supported.
  if (!claimedSessionId) {
    return { valid: true, auditRequired: false, error: null };
  }

  if (claimedSessionId === activeSessionId) {
    return { valid: true, auditRequired: false, error: null };
  }

  // WU-2341: wu:prep checkpoint proves authorized handoff between sessions.
  // This is the normal wu:prep (worktree session) -> wu:done (main session) flow.
  if (hasValidPrepCheckpoint) {
    return { valid: true, auditRequired: false, error: null };
  }

  if (force) {
    return { valid: true, auditRequired: true, error: null };
  }

  const activeDisplay = activeSessionId || 'none';
  return {
    valid: false,
    auditRequired: false,
    error:
      `\n❌ CLAIM OWNERSHIP VIOLATION: ${wuId} was claimed by a different session.\n\n` +
      `   Claimed session: ${claimedSessionId}\n` +
      `   Active session: ${activeDisplay}\n\n` +
      `   WIP limits are stop signals. Do not complete another agent's WU.\n` +
      `   If this is orphan recovery, rerun with --force and provide --reason.\n`,
  };
}
