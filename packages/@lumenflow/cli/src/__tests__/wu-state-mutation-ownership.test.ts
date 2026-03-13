// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getCurrentSession } from '@lumenflow/agent';
import { getGitForCwd } from '@lumenflow/core/git-adapter';
import { validateStateMutationOwnership } from '../wu-state-mutation-ownership.js';

vi.mock('@lumenflow/agent', () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock('@lumenflow/core/git-adapter', () => ({
  getGitForCwd: vi.fn(),
}));

describe('WU-2461: state mutation ownership guard', () => {
  const mockGit = {
    getConfigValue: vi.fn(),
    getCommitHash: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getGitForCwd).mockReturnValue(mockGit as UnsafeAny);
    mockGit.getConfigValue.mockResolvedValue('owner@example.com');
    mockGit.getCommitHash.mockResolvedValue('abc123');
    vi.mocked(getCurrentSession).mockResolvedValue({
      session_id: 'session-owner',
      wu_id: 'WU-2461',
    } as UnsafeAny);
  });

  it('passes when active session and claimed session match the target WU', async () => {
    const result = await validateStateMutationOwnership({
      wuId: 'WU-2461',
      action: 'block',
      commandExample: 'pnpm wu:block --id WU-2461',
      doc: {
        assigned_to: 'owner@example.com',
        session_id: 'session-owner',
      },
    });

    expect(result.valid).toBe(true);
    expect(result.auditEntry).toBeNull();
  });

  it('blocks when the active session belongs to a different WU', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      session_id: 'session-other',
      wu_id: 'WU-9999',
    } as UnsafeAny);

    const result = await validateStateMutationOwnership({
      wuId: 'WU-2461',
      action: 'block',
      commandExample: 'pnpm wu:block --id WU-2461',
      doc: {
        assigned_to: 'owner@example.com',
        session_id: 'session-owner',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('SESSION OWNERSHIP VIOLATION');
    expect(result.error).toContain('Active session WU: WU-9999');
  });

  it('blocks when the claimed session differs from the active session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      session_id: 'session-other',
      wu_id: 'WU-2461',
    } as UnsafeAny);

    const result = await validateStateMutationOwnership({
      wuId: 'WU-2461',
      action: 'release',
      commandExample: 'pnpm wu:release --id WU-2461',
      doc: {
        assigned_to: 'owner@example.com',
        session_id: 'session-owner',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('CLAIM OWNERSHIP VIOLATION');
    expect(result.error).toContain("Do not release another agent's WU");
  });

  it('allows explicit override and emits an audit entry', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      session_id: 'session-other',
      wu_id: 'WU-2461',
    } as UnsafeAny);

    const result = await validateStateMutationOwnership({
      wuId: 'WU-2461',
      action: 'reset',
      commandExample: 'pnpm wu:recover --id WU-2461 --action reset',
      doc: {
        assigned_to: 'owner@example.com',
        session_id: 'session-owner',
      },
      overrideOwner: true,
      overrideReason: 'Explicit human recovery instruction',
    });

    expect(result.valid).toBe(true);
    expect(result.auditEntry).toMatchObject({
      wu_id: 'WU-2461',
      action: 'reset',
      active_session: 'session-other',
      claimed_session: 'session-owner',
      modified_by: 'owner@example.com',
      reason: 'Explicit human recovery instruction',
    });
  });

  it('falls back to assigned_to ownership when session metadata is absent', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    mockGit.getConfigValue.mockResolvedValue('other@example.com');

    const result = await validateStateMutationOwnership({
      wuId: 'WU-2461',
      action: 'unblock',
      commandExample: 'pnpm wu:unblock --id WU-2461',
      doc: {
        assigned_to: 'owner@example.com',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('OWNERSHIP VIOLATION');
    expect(result.error).toContain('Assigned to: owner@example.com');
  });

  it('is wired into the mutating WU state commands', () => {
    const blockSource = readFileSync(new URL('../wu-block.ts', import.meta.url), 'utf-8');
    const unblockSource = readFileSync(new URL('../wu-unblock.ts', import.meta.url), 'utf-8');
    const releaseSource = readFileSync(new URL('../wu-release.ts', import.meta.url), 'utf-8');
    const recoverSource = readFileSync(new URL('../wu-recover.ts', import.meta.url), 'utf-8');

    expect(blockSource).toContain('assertStateMutationOwnership');
    expect(unblockSource).toContain('assertStateMutationOwnership');
    expect(releaseSource).toContain('assertStateMutationOwnership');
    expect(recoverSource).toContain('assertStateMutationOwnership');
  });

  it('adds explicit cross-WU guidance to claim failures', () => {
    const claimValidationSource = readFileSync(
      new URL('../wu-claim-validation.ts', import.meta.url),
      'utf-8',
    );
    const claimSource = readFileSync(new URL('../wu-claim.ts', import.meta.url), 'utf-8');

    expect(claimValidationSource).toContain(
      'Do not use wu:block, wu:release, wu:recover, or wu:unblock',
    );
    expect(claimSource).toContain('Do not modify');
  });
});
