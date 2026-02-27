/**
 * @file wu-done-already-merged-isolation.test.ts
 * WU-2248: Verify that ALL wu:done code paths for already-merged WUs
 * use micro-worktree isolation instead of writing directly to local main.
 *
 * Two code paths exist for already-merged WUs:
 * 1. --already-merged flag (WU-2211): Uses executeAlreadyMergedFinalize
 * 2. Auto-detected merged (WU-1746): Previously used executeAlreadyMergedCompletion
 *    which wrote directly to local main. WU-2248 fixes this.
 *
 * AC1: wu:done --already-merged uses micro-worktree isolation same as normal wu:done
 * AC2: No direct commits to local main from any wu:done code path
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WU_DONE_SOURCE_PATH = path.resolve(__dirname, '../src/wu-done.ts');

const WU_DONE_ALREADY_MERGED_SOURCE_PATH = path.resolve(
  __dirname,
  '../src/wu-done-already-merged.ts',
);

describe('WU-2248: wu:done already-merged code paths use micro-worktree isolation', () => {
  const wuDoneSource = readFileSync(WU_DONE_SOURCE_PATH, 'utf-8');

  describe('AC1: --already-merged flag path uses micro-worktree', () => {
    it('wu-done-already-merged.ts imports withMicroWorktree from core', () => {
      const alreadyMergedSource = readFileSync(WU_DONE_ALREADY_MERGED_SOURCE_PATH, 'utf-8');
      expect(alreadyMergedSource).toContain('withMicroWorktree');
    });
  });

  describe('AC2: No direct commits to local main from any wu:done code path', () => {
    it('wu-done.ts does NOT call executeAlreadyMergedCompletion (direct-write path)', () => {
      // executeAlreadyMergedCompletion writes directly to local main without
      // micro-worktree isolation. wu-done.ts must NOT call it.
      //
      // The import may still exist (re-exported or used elsewhere), but the
      // actual call site in the WU-1746 auto-detect path must use the
      // micro-worktree-based executeAlreadyMergedFinalize instead.

      // Find call sites (not import lines). An actual function call looks like:
      // executeAlreadyMergedCompletion({
      // We exclude import/from lines.
      const lines = wuDoneSource.split('\n');
      const callLines = lines.filter((line) => {
        const trimmed = line.trim();
        // Skip import/export lines
        if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
          return false;
        }
        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
          return false;
        }
        return trimmed.includes('executeAlreadyMergedCompletion(');
      });

      expect(callLines).toHaveLength(0);
    });

    it('wu-done.ts does NOT import executeAlreadyMergedCompletion from core', () => {
      // After WU-2248, the non-isolated function should no longer be imported
      const importPattern = /import\s*\{[^}]*executeAlreadyMergedCompletion[^}]*\}\s*from/;
      expect(wuDoneSource).not.toMatch(importPattern);
    });

    it('wu-done.ts WU-1746 auto-detect path calls executeAlreadyMergedFinalize', () => {
      // The WU-1746 code path (worktree missing but branch merged) must use
      // the micro-worktree-based finalize function
      const lines = wuDoneSource.split('\n');
      const finalizeCalls = lines.filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
          return false;
        }
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
          return false;
        }
        return trimmed.includes('executeAlreadyMergedFinalize');
      });

      // There should be at least 2 call sites:
      // 1. The --already-merged flag path (WU-2211)
      // 2. The WU-1746 auto-detect path
      expect(finalizeCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
