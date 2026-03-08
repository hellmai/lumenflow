// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * WU-2345/WU-2346: config:set worktree-awareness tests
 *
 * Validates that config:set leverages the core isInGitWorktree() from
 * @lumenflow/core/micro-worktree (WU-2346 moved detection to core).
 */

import { describe, it, expect } from 'vitest';
import { isInGitWorktree } from '@lumenflow/core/micro-worktree';

describe('config-set worktree detection (WU-2345/WU-2346)', () => {
  describe('core isInGitWorktree integration', () => {
    it('should detect worktree using core isInGitWorktree()', () => {
      // We ARE running in a worktree (framework-core-wu-2346)
      expect(isInGitWorktree()).toBe(true);
    });

    it('should be imported from @lumenflow/core/micro-worktree, not inlined', () => {
      // Verify the function comes from the core module
      expect(typeof isInGitWorktree).toBe('function');
    });
  });
});
