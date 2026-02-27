// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @file lane-lock.test.ts
 * WU-2257: Tests for lane:lock micro-worktree isolation and --help flag
 *
 * TDD RED phase: These tests define the expected behavior:
 * - lane:lock uses micro-worktree isolation (like lane:edit)
 * - --help shows help text and exits without executing lock logic
 * - lane:validate uses micro-worktree isolation
 * - lane:setup --lock uses micro-worktree isolation
 * - --help works on lane:status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test: lane:lock --help parsing
// ---------------------------------------------------------------------------

describe('lane:lock', () => {
  describe('parseLaneLockArgs', () => {
    // Import will be added when implementation exports the function
    let parseLaneLockArgs: (argv: string[]) => { help: boolean };

    beforeEach(async () => {
      const mod = await import('../lane-lock.js');
      parseLaneLockArgs = mod.parseLaneLockArgs;
    });

    it('returns help=true when --help is in argv', () => {
      const result = parseLaneLockArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('returns help=false when --help is not in argv', () => {
      const result = parseLaneLockArgs([]);
      expect(result.help).toBe(false);
    });
  });

  describe('HELP_TEXT export', () => {
    it('exports HELP_TEXT constant', async () => {
      const mod = await import('../lane-lock.js');
      expect(mod.LANE_LOCK_HELP_TEXT).toBeDefined();
      expect(mod.LANE_LOCK_HELP_TEXT).toContain('lane:lock');
    });
  });

  describe('OPERATION_NAME export', () => {
    it('exports LANE_LOCK_OPERATION_NAME for micro-worktree', async () => {
      const mod = await import('../lane-lock.js');
      expect(mod.LANE_LOCK_OPERATION_NAME).toBe('lane-lock');
    });
  });
});

// ---------------------------------------------------------------------------
// Test: lane:validate --help parsing
// ---------------------------------------------------------------------------

describe('lane:validate', () => {
  describe('parseLaneValidateArgs', () => {
    let parseLaneValidateArgs: (argv: string[]) => { help: boolean };

    beforeEach(async () => {
      const mod = await import('../lane-validate.js');
      parseLaneValidateArgs = mod.parseLaneValidateArgs;
    });

    it('returns help=true when --help is in argv', () => {
      const result = parseLaneValidateArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('returns help=false when --help is not in argv', () => {
      const result = parseLaneValidateArgs([]);
      expect(result.help).toBe(false);
    });
  });

  describe('HELP_TEXT export', () => {
    it('exports HELP_TEXT constant', async () => {
      const mod = await import('../lane-validate.js');
      expect(mod.LANE_VALIDATE_HELP_TEXT).toBeDefined();
      expect(mod.LANE_VALIDATE_HELP_TEXT).toContain('lane:validate');
    });
  });

  describe('OPERATION_NAME export', () => {
    it('exports LANE_VALIDATE_OPERATION_NAME for micro-worktree', async () => {
      const mod = await import('../lane-validate.js');
      expect(mod.LANE_VALIDATE_OPERATION_NAME).toBe('lane-validate');
    });
  });
});

// ---------------------------------------------------------------------------
// Test: lane:setup --help parsing
// ---------------------------------------------------------------------------

describe('lane:setup', () => {
  describe('parseLaneSetupArgs', () => {
    let parseLaneSetupArgs: (argv: string[]) => { help: boolean; lock: boolean };

    beforeEach(async () => {
      const mod = await import('../lane-setup.js');
      parseLaneSetupArgs = mod.parseLaneSetupArgs;
    });

    it('returns help=true when --help is in argv', () => {
      const result = parseLaneSetupArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('returns help=false when --help is not in argv', () => {
      const result = parseLaneSetupArgs([]);
      expect(result.help).toBe(false);
    });

    it('returns lock=true when --lock is in argv', () => {
      const result = parseLaneSetupArgs(['--lock']);
      expect(result.lock).toBe(true);
    });

    it('returns lock=false when --lock is not in argv', () => {
      const result = parseLaneSetupArgs([]);
      expect(result.lock).toBe(false);
    });
  });

  describe('HELP_TEXT export', () => {
    it('exports HELP_TEXT constant', async () => {
      const mod = await import('../lane-setup.js');
      expect(mod.LANE_SETUP_HELP_TEXT).toBeDefined();
      expect(mod.LANE_SETUP_HELP_TEXT).toContain('lane:setup');
    });
  });

  describe('OPERATION_NAME export', () => {
    it('exports LANE_SETUP_OPERATION_NAME for micro-worktree', async () => {
      const mod = await import('../lane-setup.js');
      expect(mod.LANE_SETUP_OPERATION_NAME).toBe('lane-setup');
    });
  });
});

// ---------------------------------------------------------------------------
// Test: lane:status --help parsing
// ---------------------------------------------------------------------------

describe('lane:status', () => {
  describe('parseLaneStatusArgs', () => {
    let parseLaneStatusArgs: (argv: string[]) => { help: boolean };

    beforeEach(async () => {
      const mod = await import('../lane-status.js');
      parseLaneStatusArgs = mod.parseLaneStatusArgs;
    });

    it('returns help=true when --help is in argv', () => {
      const result = parseLaneStatusArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('returns help=false when --help is not in argv', () => {
      const result = parseLaneStatusArgs([]);
      expect(result.help).toBe(false);
    });
  });

  describe('HELP_TEXT export', () => {
    it('exports HELP_TEXT constant', async () => {
      const mod = await import('../lane-status.js');
      expect(mod.LANE_STATUS_HELP_TEXT).toBeDefined();
      expect(mod.LANE_STATUS_HELP_TEXT).toContain('lane:status');
    });
  });
});
