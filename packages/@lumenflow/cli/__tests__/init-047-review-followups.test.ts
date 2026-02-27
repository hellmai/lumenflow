/**
 * WU-2260: INIT-047 review follow-ups
 *
 * Tests for three code review findings:
 * 1. checkWorktreeForDirtyFiles logs warning on git status failure (not silent)
 * 2. EmitCorrectiveEventOptions.type uses ValidEmitType (not string)
 * 3. wu:recover reset prints single error message (not redundant)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI_SRC = resolve(__dirname, '..', 'src');

describe('WU-2260: INIT-047 review follow-ups', () => {
  describe('Fix 1: checkWorktreeForDirtyFiles warns on failure', () => {
    it('should log a warning in the catch block, not silently return', () => {
      const source = readFileSync(
        resolve(CLI_SRC, 'wu-recover.ts'),
        'utf-8',
      );
      // The catch block should contain console.warn, not just "return []"
      const catchPattern = /catch\s*\(err\)\s*\{[^}]*console\.warn\([^)]*could not check worktree/s;
      expect(source).toMatch(catchPattern);
    });

    it('should not have a bare catch block that silently swallows errors', () => {
      const source = readFileSync(
        resolve(CLI_SRC, 'wu-recover.ts'),
        'utf-8',
      );
      // Should not have "catch {" (bare catch without variable)
      // in the checkWorktreeForDirtyFiles function
      const fnMatch = source.match(
        /export async function checkWorktreeForDirtyFiles[\s\S]*?^}/m,
      );
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![0]).not.toMatch(/catch\s*\{/);
    });
  });

  describe('Fix 2: emitCorrectiveEvent type uses ValidEmitType', () => {
    it('should use ValidEmitType in EmitCorrectiveEventOptions, not string union', () => {
      const source = readFileSync(
        resolve(CLI_SRC, 'state-emit.ts'),
        'utf-8',
      );
      // The interface should have "type: ValidEmitType" not "type: ValidEmitType | string"
      expect(source).toMatch(/type:\s*ValidEmitType\s*;/);
      expect(source).not.toMatch(/type:\s*ValidEmitType\s*\|\s*string/);
    });
  });

  describe('Fix 3: wu:recover reset shows single error message', () => {
    it('should not print both console.error and die() for missing --force', () => {
      const source = readFileSync(
        resolve(CLI_SRC, 'wu-recover.ts'),
        'utf-8',
      );
      // Should NOT have: console.error(warning) followed by die() in the force check block
      // Instead should have: die(warning || fallback)
      const forceCheckBlock = /if\s*\(requiresForceFlag\(action\)\s*&&\s*!force\)\s*\{([\s\S]*?)\}/;
      const match = source.match(forceCheckBlock);
      expect(match).toBeTruthy();
      const blockBody = match![1];
      // Should NOT have console.error in this block
      expect(blockBody).not.toContain('console.error');
      // Should have die() with the warning
      expect(blockBody).toMatch(/die\(warning\s*\|\|/);
    });
  });
});
