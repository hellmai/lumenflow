// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { getCurrentSession } from '@lumenflow/agent';
import { die } from '@lumenflow/core/error-handler';
import { getGitForCwd } from '@lumenflow/core/git-adapter';
import { ENV_VARS } from '@lumenflow/core/wu-constants';
import { auditOwnershipOverride, normalizeUsername } from './wu-done-preflight.js';

interface OwnershipAwareWUDoc extends Record<string, unknown> {
  assigned_to?: string | null;
  session_id?: string | null;
}

interface CurrentSessionSnapshot {
  sessionId: string | null;
  wuId: string | null;
}

interface StateMutationOwnershipInput {
  wuId: string;
  action: string;
  commandExample: string;
  doc: OwnershipAwareWUDoc;
  overrideOwner?: boolean;
  overrideReason?: string;
}

interface StateMutationOwnershipResult {
  valid: boolean;
  error: string | null;
  auditEntry: Record<string, unknown> | null;
}

async function resolveCurrentSession(): Promise<CurrentSessionSnapshot> {
  try {
    const session = await getCurrentSession();
    return {
      sessionId: session?.session_id ?? null,
      wuId: session?.wu_id ?? null,
    };
  } catch {
    return {
      sessionId: null,
      wuId: null,
    };
  }
}

async function resolveCurrentUser(): Promise<string | null> {
  try {
    const configuredEmail = (await getGitForCwd().getConfigValue('user.email')).trim();
    return configuredEmail || null;
  } catch {
    return process.env[ENV_VARS.GIT_USER] || process.env[ENV_VARS.USER] || null;
  }
}

async function buildOverrideAuditEntry(
  input: StateMutationOwnershipInput,
  currentSession: CurrentSessionSnapshot,
  currentUser: string | null,
): Promise<Record<string, unknown>> {
  return {
    timestamp: new Date().toISOString(),
    wu_id: input.wuId,
    action: input.action,
    assigned_to: input.doc.assigned_to ?? null,
    claimed_session: input.doc.session_id ?? null,
    active_session: currentSession.sessionId,
    active_session_wu: currentSession.wuId,
    modified_by: currentUser,
    reason: input.overrideReason ?? null,
    git_commit: (await getGitForCwd().getCommitHash()).trim(),
  };
}

function getOverrideReasonError(): string {
  return `--override-owner requires --reason "<why you're modifying another agent's WU>"`;
}

function buildCrossSessionError(
  wuId: string,
  action: string,
  commandExample: string,
  currentSession: CurrentSessionSnapshot,
  claimedSessionId: string | null,
): string {
  return (
    `\n❌ CLAIM OWNERSHIP VIOLATION: ${wuId} was claimed by a different session.\n\n` +
    `   Claimed session: ${claimedSessionId ?? 'none'}\n` +
    `   Active session: ${currentSession.sessionId ?? 'none'}\n` +
    `   Active session WU: ${currentSession.wuId ?? 'none'}\n\n` +
    `   WIP limits are stop signals. Do not ${action} another agent's WU to free a lane.\n\n` +
    `   📋 Options:\n` +
    `      1. Wait for the owning WU to complete or block itself\n` +
    `      2. Choose a different lane or fix the lane assignment\n` +
    `      3. Coordinate with the owning agent via mem:signal / mem:inbox / wu:escalate\n\n` +
    `   ⚠️  To override (manual recovery only):\n` +
    `      ${commandExample} --override-owner --reason "<why>"\n\n` +
    `   AGENTS: NEVER use --override-owner without explicit instruction.\n`
  );
}

function buildActiveSessionMismatchError(
  wuId: string,
  action: string,
  commandExample: string,
  currentSession: CurrentSessionSnapshot,
): string {
  return (
    `\n❌ SESSION OWNERSHIP VIOLATION: Active session is attached to another WU.\n\n` +
    `   Target WU: ${wuId}\n` +
    `   Active session WU: ${currentSession.wuId ?? 'none'}\n` +
    `   Active session: ${currentSession.sessionId ?? 'none'}\n\n` +
    `   Do not ${action} a different WU from the current agent session just to clear a lane.\n` +
    `   Switch to the owning WU session, or use explicit manual override with approval.\n\n` +
    `   ⚠️  To override (manual recovery only):\n` +
    `      ${commandExample} --override-owner --reason "<why>"\n`
  );
}

function buildAssignedOwnerError(
  wuId: string,
  action: string,
  commandExample: string,
  assignedTo: string,
  currentUser: string | null,
): string {
  return (
    `\n❌ OWNERSHIP VIOLATION: ${wuId} is assigned to someone else.\n\n` +
    `   Assigned to: ${assignedTo}\n` +
    `   Current user: ${currentUser ?? 'unknown'}\n\n` +
    `   Do not ${action} another agent's WU to free a lane.\n\n` +
    `   ⚠️  To override (manual recovery only):\n` +
    `      ${commandExample} --override-owner --reason "<why>"\n\n` +
    `   AGENTS: NEVER use --override-owner without explicit instruction.\n`
  );
}

export async function validateStateMutationOwnership(
  input: StateMutationOwnershipInput,
): Promise<StateMutationOwnershipResult> {
  const currentSession = await resolveCurrentSession();
  const currentUser = await resolveCurrentUser();
  const assignedTo =
    typeof input.doc.assigned_to === 'string' && input.doc.assigned_to.trim().length > 0
      ? input.doc.assigned_to
      : null;
  const claimedSessionId =
    typeof input.doc.session_id === 'string' && input.doc.session_id.trim().length > 0
      ? input.doc.session_id
      : null;

  const allowOverride = async (error: string): Promise<StateMutationOwnershipResult> => {
    if (!input.overrideOwner) {
      return { valid: false, error, auditEntry: null };
    }

    if (!input.overrideReason) {
      return {
        valid: false,
        error: getOverrideReasonError(),
        auditEntry: null,
      };
    }

    return {
      valid: true,
      error: null,
      auditEntry: await buildOverrideAuditEntry(input, currentSession, currentUser),
    };
  };

  if (currentSession.wuId && currentSession.wuId !== input.wuId) {
    return allowOverride(
      buildActiveSessionMismatchError(
        input.wuId,
        input.action,
        input.commandExample,
        currentSession,
      ),
    );
  }

  if (claimedSessionId) {
    if (currentSession.sessionId === claimedSessionId) {
      return { valid: true, error: null, auditEntry: null };
    }

    return allowOverride(
      buildCrossSessionError(
        input.wuId,
        input.action,
        input.commandExample,
        currentSession,
        claimedSessionId,
      ),
    );
  }

  if (assignedTo) {
    if (currentUser && normalizeUsername(assignedTo) === normalizeUsername(currentUser)) {
      return { valid: true, error: null, auditEntry: null };
    }

    return allowOverride(
      buildAssignedOwnerError(
        input.wuId,
        input.action,
        input.commandExample,
        assignedTo,
        currentUser,
      ),
    );
  }

  return { valid: true, error: null, auditEntry: null };
}

export async function assertStateMutationOwnership(
  input: StateMutationOwnershipInput,
): Promise<void> {
  const result = await validateStateMutationOwnership(input);
  if (!result.valid) {
    die(result.error ?? `Ownership validation failed for ${input.wuId}`);
  }

  if (result.auditEntry) {
    console.log(`\n⚠️  --override-owner: ${input.action} ${input.wuId} despite ownership mismatch`);
    console.log(`   Reason: ${input.overrideReason}\n`);
    auditOwnershipOverride(result.auditEntry);
  }
}
