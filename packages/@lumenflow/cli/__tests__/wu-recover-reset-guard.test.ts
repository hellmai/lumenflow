/**
 * @file wu-recover-reset-guard.test.ts
 * Tests for WU-2238: wu:recover --action reset should require --force for destructive ops
 *
 * TDD: RED phase - Tests written BEFORE implementation
 *
 * Acceptance criteria:
 * - wu:recover --action reset without --force prints warning and aborts
 * - wu:recover --action reset --force proceeds with current behavior
 * - Warning message lists what will be destroyed (remote branch, state store event)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONTEXT_VALIDATION } from '@lumenflow/core/wu-constants';

const { RECOVERY_ACTIONS } = CONTEXT_VALIDATION;

// Mock git adapter
vi.mock('@lumenflow/core/git-adapter', () => ({
  getGitForCwd: vi.fn(() => ({
    worktreeRemove: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
  })),
}));

describe('WU-2238: reset action requires --force for destructive ops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requiresForceFlag', () => {
    it('returns true for reset action', async () => {
      const { requiresForceFlag } = await import('../dist/wu-recover.js');

      expect(requiresForceFlag(RECOVERY_ACTIONS.RESET)).toBe(true);
    });

    it('still returns true for nuke action', async () => {
      const { requiresForceFlag } = await import('../dist/wu-recover.js');

      expect(requiresForceFlag(RECOVERY_ACTIONS.NUKE)).toBe(true);
    });

    it('returns false for resume action', async () => {
      const { requiresForceFlag } = await import('../dist/wu-recover.js');

      expect(requiresForceFlag(RECOVERY_ACTIONS.RESUME)).toBe(false);
    });

    it('returns false for cleanup action', async () => {
      const { requiresForceFlag } = await import('../dist/wu-recover.js');

      expect(requiresForceFlag(RECOVERY_ACTIONS.CLEANUP)).toBe(false);
    });
  });

  describe('getResetWarningMessage', () => {
    it('returns a warning message listing what will be destroyed', async () => {
      const { getResetWarningMessage } = await import('../dist/wu-recover.js');

      const message = getResetWarningMessage('WU-100');

      expect(message).toContain('WU-100');
      expect(message).toContain('remote branch');
      expect(message).toContain('state store');
      expect(message).toContain('--force');
    });
  });

  describe('getDestructiveActionWarning', () => {
    it('returns reset-specific warning for reset action', async () => {
      const { getDestructiveActionWarning } = await import('../dist/wu-recover.js');

      const warning = getDestructiveActionWarning(RECOVERY_ACTIONS.RESET, 'WU-100');

      expect(warning).toContain('WU-100');
      expect(warning).toContain('remote branch');
      expect(warning).toContain('--force');
    });

    it('returns generic warning for nuke action', async () => {
      const { getDestructiveActionWarning } = await import('../dist/wu-recover.js');

      const warning = getDestructiveActionWarning(RECOVERY_ACTIONS.NUKE, 'WU-100');

      expect(warning).toContain('--force');
    });

    it('returns empty string for non-destructive actions', async () => {
      const { getDestructiveActionWarning } = await import('../dist/wu-recover.js');

      const warning = getDestructiveActionWarning(RECOVERY_ACTIONS.RESUME, 'WU-100');

      expect(warning).toBe('');
    });
  });
});
