// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from 'vitest';

describe('wu-prep pre-existing skip-gates guidance (WU-2357)', () => {
  describe('buildScopedUnitTestArgs', () => {
    it('builds a pnpm vitest command for declared tests.unit paths', async () => {
      const { buildScopedUnitTestArgs } = await import('../wu-prep.js');

      expect(
        buildScopedUnitTestArgs([
          'packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts',
          'packages/@lumenflow/cli/src/__tests__/wu-prep-skip-gates.test.ts',
        ]),
      ).toEqual([
        'vitest',
        'run',
        'packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts',
        'packages/@lumenflow/cli/src/__tests__/wu-prep-skip-gates.test.ts',
        '--passWithNoTests',
      ]);
    });
  });

  describe('checkPreExistingScopedUnitTestFailures', () => {
    it('treats worktree failures that also fail on main as pre-existing only', async () => {
      const { checkPreExistingScopedUnitTestFailures } = await import('../wu-prep.js');
      const execOnWorktree = vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'failing test',
      });
      const execOnMain = vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'same failing test',
      });

      const result = await checkPreExistingScopedUnitTestFailures({
        mainCheckout: '/repo',
        scopedUnitTests: ['packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts'],
        execOnWorktree,
        execOnMain,
      });

      expect(result.hasPreExisting).toBe(true);
      expect(result.hasNewFailures).toBe(false);
      expect(result.checkedPaths).toEqual([
        'packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts',
      ]);
    });

    it('treats worktree-only scoped test failures as newly introduced', async () => {
      const { checkPreExistingScopedUnitTestFailures } = await import('../wu-prep.js');
      const execOnWorktree = vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'new failing test',
      });
      const execOnMain = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const result = await checkPreExistingScopedUnitTestFailures({
        mainCheckout: '/repo',
        scopedUnitTests: ['packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts'],
        execOnWorktree,
        execOnMain,
      });

      expect(result.hasPreExisting).toBe(false);
      expect(result.hasNewFailures).toBe(true);
      expect(result.checkedPaths).toEqual([
        'packages/@lumenflow/cli/src/__tests__/wu-prep.test.ts',
      ]);
    });

    it('skips comparison when there are no declared scoped unit tests', async () => {
      const { checkPreExistingScopedUnitTestFailures } = await import('../wu-prep.js');
      const execOnWorktree = vi.fn();
      const execOnMain = vi.fn();

      const result = await checkPreExistingScopedUnitTestFailures({
        mainCheckout: '/repo',
        scopedUnitTests: [],
        execOnWorktree,
        execOnMain,
      });

      expect(result.hasPreExisting).toBe(false);
      expect(result.hasNewFailures).toBe(false);
      expect(result.checkedPaths).toEqual([]);
      expect(execOnWorktree).not.toHaveBeenCalled();
      expect(execOnMain).not.toHaveBeenCalled();
    });
  });

  describe('shouldOfferSkipGatesGuidance', () => {
    it('returns true when all detected blockers are pre-existing only', async () => {
      const { shouldOfferSkipGatesGuidance } = await import('../wu-prep.js');

      expect(
        shouldOfferSkipGatesGuidance([
          { hasPreExisting: true, hasNewFailures: false },
          { hasPreExisting: true, hasNewFailures: false },
        ]),
      ).toBe(true);
    });

    it('returns false when any detected blocker includes new failures', async () => {
      const { shouldOfferSkipGatesGuidance } = await import('../wu-prep.js');

      expect(
        shouldOfferSkipGatesGuidance([
          { hasPreExisting: true, hasNewFailures: false },
          { hasPreExisting: false, hasNewFailures: true },
        ]),
      ).toBe(false);
    });

    it('returns false when nothing was detected as pre-existing or new', async () => {
      const { shouldOfferSkipGatesGuidance } = await import('../wu-prep.js');

      expect(shouldOfferSkipGatesGuidance([{ hasPreExisting: false, hasNewFailures: false }])).toBe(
        false,
      );
    });
  });
});
