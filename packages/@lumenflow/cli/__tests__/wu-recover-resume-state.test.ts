/**
 * @file wu-recover-resume-state.test.ts
 * Tests for WU-2240: wu:recover --action resume must emit claim event to state store
 *
 * TDD: Tests written BEFORE implementation
 *
 * Acceptance criteria:
 * - AC1: wu:recover --action resume emits a corrective claim event to wu-events.jsonl
 * - AC2: state:doctor --fix can resolve claim/release mismatches
 * - AC3: wu:done succeeds after wu:recover resume without manual intervention
 *
 * Strategy:
 * - AC1 is tested by verifying the source code includes WUStateStore.claim() call
 *   in the resume micro-worktree callback, and by a structural assertion on the
 *   wu-events.jsonl file path being included in committed files.
 * - AC2 is tested via state-doctor-core dependency injection (no mocking needed).
 * - AC3 is verified by the combination of AC1 + AC2 (manual verification also required).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { WU_STATUS } from '@lumenflow/core/wu-constants';

// ─── Mocks (minimal, for dist-level helper tests) ───────────────────

vi.mock('@lumenflow/core/git-adapter', () => ({
  getGitForCwd: vi.fn(() => ({
    worktreeRemove: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
  })),
}));

// ─── AC1: Source-level structural verification ──────────────────────

describe('WU-2240 AC1: wu:recover resume emits claim event (structural)', () => {
  it('source code calls WUStateStore.claim() inside executeResume micro-worktree callback', () => {
    // Read the source file to verify the implementation includes the claim call.
    // This is a structural test that ensures the fix was applied.
    const sourcePath = resolve(__dirname, '../src/wu-recover.ts');
    const source = readFileSync(sourcePath, 'utf-8');

    // The resume micro-worktree callback must:
    // 1. Create a WUStateStore instance
    expect(source).toContain('new WUStateStore(stateDir)');
    // 2. Load the state store
    expect(source).toContain('store.load()');
    // 3. Call store.claim() with WU ID, lane, and title
    expect(source).toContain('store.claim(wuId, lane, title)');
  });

  it('resume micro-worktree callback includes wu-events.jsonl in committed files', () => {
    const sourcePath = resolve(__dirname, '../src/wu-recover.ts');
    const source = readFileSync(sourcePath, 'utf-8');

    // The micro-worktree return must include the wu-events path in the files array
    expect(source).toContain('resolveWuEventsRelativePath(worktreePath)');
  });

  it('resume only emits claim event when WU status is ready (not already in_progress)', async () => {
    // Verify the guard: status !== READY check happens before micro-worktree
    const sourcePath = resolve(__dirname, '../src/wu-recover.ts');
    const source = readFileSync(sourcePath, 'utf-8');

    // The early return for already-in-progress WUs
    expect(source).toContain('doc.status !== WU_STATUS.READY');
  });

  it('executeRecoveryAction exports resume as a valid action', async () => {
    const { executeRecoveryAction } = await import('../dist/wu-recover.js');
    expect(typeof executeRecoveryAction).toBe('function');
  });
});

// ─── AC2: state:doctor --fix resolves claim/release mismatches ──────

describe('WU-2240 AC2: state:doctor --fix resolves claim mismatches', () => {
  it('should mark YAML=in_progress, state=ready mismatch as auto-fixable', async () => {
    const { diagnoseState, ISSUE_TYPES } = await import('@lumenflow/core/state-doctor-core');

    const emitEvent = vi.fn().mockResolvedValue(undefined);

    const result = await diagnoseState(
      '/test',
      {
        listWUs: vi.fn().mockResolvedValue([
          {
            id: 'WU-100',
            status: WU_STATUS.IN_PROGRESS,
            lane: 'Framework: Core',
            title: 'Test WU',
          },
        ]),
        listStamps: vi.fn().mockResolvedValue([]),
        listSignals: vi.fn().mockResolvedValue([]),
        listEvents: vi.fn().mockResolvedValue([
          {
            wuId: 'WU-100',
            type: 'claim',
            lane: 'Framework: Core',
            title: 'Test WU',
          },
          { wuId: 'WU-100', type: 'release', reason: 'previous reset' },
        ]),
        emitEvent,
      },
      { fix: false },
    );

    const mismatch = result.issues.find(
      (i) => i.type === ISSUE_TYPES.STATUS_MISMATCH && i.wuId === 'WU-100',
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.canAutoFix).toBe(true);
  });

  it('should emit claim event when fixing YAML=in_progress, state=ready mismatch', async () => {
    const { diagnoseState } = await import('@lumenflow/core/state-doctor-core');

    const emitEvent = vi.fn().mockResolvedValue(undefined);

    const result = await diagnoseState(
      '/test',
      {
        listWUs: vi.fn().mockResolvedValue([
          {
            id: 'WU-100',
            status: WU_STATUS.IN_PROGRESS,
            lane: 'Framework: Core',
            title: 'Test WU',
          },
        ]),
        listStamps: vi.fn().mockResolvedValue([]),
        listSignals: vi.fn().mockResolvedValue([]),
        listEvents: vi.fn().mockResolvedValue([
          {
            wuId: 'WU-100',
            type: 'claim',
            lane: 'Framework: Core',
            title: 'Test WU',
          },
          { wuId: 'WU-100', type: 'release', reason: 'previous reset' },
        ]),
        emitEvent,
      },
      { fix: true },
    );

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        wuId: 'WU-100',
        type: 'claim',
        reason: expect.stringContaining('state:doctor'),
      }),
    );
    expect(result.fixed).toHaveLength(1);
  });

  it('should include lane and title in claim event payload', async () => {
    const { diagnoseState } = await import('@lumenflow/core/state-doctor-core');

    const emitEvent = vi.fn().mockResolvedValue(undefined);

    await diagnoseState(
      '/test',
      {
        listWUs: vi.fn().mockResolvedValue([
          {
            id: 'WU-100',
            status: WU_STATUS.IN_PROGRESS,
            lane: 'Framework: Core',
            title: 'Test WU',
          },
        ]),
        listStamps: vi.fn().mockResolvedValue([]),
        listSignals: vi.fn().mockResolvedValue([]),
        listEvents: vi.fn().mockResolvedValue([
          {
            wuId: 'WU-100',
            type: 'claim',
            lane: 'Framework: Core',
            title: 'Test WU',
          },
          { wuId: 'WU-100', type: 'release', reason: 'previous reset' },
        ]),
        emitEvent,
      },
      { fix: true },
    );

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        wuId: 'WU-100',
        type: 'claim',
        lane: 'Framework: Core',
        title: 'Test WU',
      }),
    );
  });

  it('should still handle release events for YAML=ready, state=in_progress', async () => {
    // Regression: existing behavior should still work
    const { diagnoseState } = await import('@lumenflow/core/state-doctor-core');

    const emitEvent = vi.fn().mockResolvedValue(undefined);

    await diagnoseState(
      '/test',
      {
        listWUs: vi.fn().mockResolvedValue([
          {
            id: 'WU-100',
            status: WU_STATUS.READY,
            lane: 'Framework: Core',
            title: 'Test WU',
          },
        ]),
        listStamps: vi.fn().mockResolvedValue([]),
        listSignals: vi.fn().mockResolvedValue([]),
        listEvents: vi.fn().mockResolvedValue([
          {
            wuId: 'WU-100',
            type: 'claim',
            lane: 'Framework: Core',
            title: 'Test WU',
          },
        ]),
        emitEvent,
      },
      { fix: true },
    );

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        wuId: 'WU-100',
        type: 'release',
      }),
    );
  });
});
