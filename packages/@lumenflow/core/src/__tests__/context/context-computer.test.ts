/**
 * @file context-computer.test.ts
 * @description Tests for context computer (unified context computation)
 *
 * WU-1090: Context-aware state machine for WU lifecycle commands
 *
 * TDD: RED phase - Tests written FIRST before implementation.
 *
 * Tests cover:
 * - Computing context with all modules
 * - Performance budget tracking
 * - WU ID resolution from options and worktree
 * - Session state building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../context/location-resolver.js', () => ({
  resolveLocation: vi.fn(),
}));

vi.mock('../../context/git-state-reader.js', () => ({
  readGitState: vi.fn(),
}));

vi.mock('../../context/wu-state-reader.js', () => ({
  readWuState: vi.fn(),
}));

import { computeContext, type ComputeContextResult } from '../../context/context-computer.js';
import { resolveLocation } from '../../context/location-resolver.js';
import { readGitState } from '../../context/git-state-reader.js';
import { readWuState } from '../../context/wu-state-reader.js';
import { CONTEXT_VALIDATION } from '../../wu-constants.js';

const { LOCATION_TYPES, THRESHOLDS } = CONTEXT_VALIDATION;

describe('computeContext', () => {
  const mockLocation = {
    type: LOCATION_TYPES.MAIN,
    cwd: '/repo',
    gitRoot: '/repo',
    mainCheckout: '/repo',
    worktreeName: null,
    worktreeWuId: null,
  };

  const mockGitState = {
    branch: 'main',
    isDetached: false,
    isDirty: false,
    hasStaged: false,
    ahead: 0,
    behind: 0,
    tracking: 'origin/main',
    modifiedFiles: [],
    hasError: false,
    errorMessage: null,
  };

  const mockWuState = {
    id: 'WU-1090',
    status: 'in_progress',
    lane: 'Framework: Core',
    title: 'Test WU',
    yamlPath: '/repo/docs/04-operations/tasks/wu/WU-1090.yaml',
    isConsistent: true,
    inconsistencyReason: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveLocation).mockResolvedValue(mockLocation);
    vi.mocked(readGitState).mockResolvedValue(mockGitState);
    vi.mocked(readWuState).mockResolvedValue(mockWuState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('computes context with all modules', async () => {
      // Act
      const result = await computeContext({ wuId: 'WU-1090' });

      // Assert
      expect(result.context.location).toEqual(mockLocation);
      expect(result.context.git).toEqual(mockGitState);
      expect(result.context.wu).toEqual(mockWuState);
    });

    it('returns null wu when no WU ID provided and not in worktree', async () => {
      // Act
      const result = await computeContext();

      // Assert
      expect(result.context.wu).toBeNull();
      expect(readWuState).not.toHaveBeenCalled();
    });

    it('resolves WU ID from worktree when in worktree', async () => {
      // Arrange
      const worktreeLocation = {
        ...mockLocation,
        type: LOCATION_TYPES.WORKTREE,
        worktreeName: 'framework-core-wu-1090',
        worktreeWuId: 'WU-1090',
      };
      vi.mocked(resolveLocation).mockResolvedValue(worktreeLocation);

      // Act
      const result = await computeContext();

      // Assert
      expect(readWuState).toHaveBeenCalledWith('WU-1090', '/repo');
      expect(result.context.wu).toEqual(mockWuState);
    });

    it('prefers explicit wuId over worktree WU ID', async () => {
      // Arrange
      const worktreeLocation = {
        ...mockLocation,
        type: LOCATION_TYPES.WORKTREE,
        worktreeName: 'framework-core-wu-1090',
        worktreeWuId: 'WU-1090',
      };
      vi.mocked(resolveLocation).mockResolvedValue(worktreeLocation);

      // Act
      await computeContext({ wuId: 'WU-2000' });

      // Assert - should use explicit WU ID, not worktree ID
      expect(readWuState).toHaveBeenCalledWith('WU-2000', '/repo');
    });
  });

  describe('session state', () => {
    it('builds session state with sessionId when provided', async () => {
      // Act
      const result = await computeContext({ sessionId: 'session-123' });

      // Assert
      expect(result.context.session).toEqual({
        isActive: true,
        sessionId: 'session-123',
      });
    });

    it('builds inactive session state when no sessionId', async () => {
      // Act
      const result = await computeContext();

      // Assert
      expect(result.context.session).toEqual({
        isActive: false,
        sessionId: null,
      });
    });
  });

  describe('performance tracking', () => {
    it('returns computation time in milliseconds', async () => {
      // Act
      const result = await computeContext();

      // Assert
      expect(typeof result.computationMs).toBe('number');
      expect(result.computationMs).toBeGreaterThanOrEqual(0);
    });

    it('tracks when budget is exceeded', async () => {
      // Arrange - make location resolution slow
      vi.mocked(resolveLocation).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, THRESHOLDS.CONTEXT_COMPUTATION_MS + 50));
        return mockLocation;
      });

      // Act
      const result = await computeContext();

      // Assert
      expect(result.exceededBudget).toBe(true);
      expect(result.computationMs).toBeGreaterThan(THRESHOLDS.CONTEXT_COMPUTATION_MS);
    });

    it('returns exceededBudget=false when within budget', async () => {
      // Act
      const result = await computeContext();

      // Assert
      expect(result.exceededBudget).toBe(false);
    });
  });

  describe('WU state handling', () => {
    it('returns null wu when WU not found', async () => {
      // Arrange
      vi.mocked(readWuState).mockResolvedValue(null);

      // Act
      const result = await computeContext({ wuId: 'WU-9999' });

      // Assert
      expect(result.context.wu).toBeNull();
    });

    it('handles WU state with inconsistency', async () => {
      // Arrange
      const inconsistentState = {
        ...mockWuState,
        isConsistent: false,
        inconsistencyReason: 'YAML says ready but state store says in_progress',
      };
      vi.mocked(readWuState).mockResolvedValue(inconsistentState);

      // Act
      const result = await computeContext({ wuId: 'WU-1090' });

      // Assert
      expect(result.context.wu?.isConsistent).toBe(false);
      expect(result.context.wu?.inconsistencyReason).toContain('YAML says ready');
    });
  });
});
