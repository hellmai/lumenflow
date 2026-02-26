// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for scripts/wu-stamp.mjs (Break-Glass WU Stamp Tool)
 *
 * Tests validate all acceptance criteria:
 * AC1: Runs without packages/dist
 * AC2: Creates valid .lumenflow/stamps/WU-XXX.done file
 * AC3: Appends valid completion event to wu-events.jsonl
 * AC4: Commits atomically via micro-worktree pattern (tested via mock)
 * AC5: Idempotent on re-run (no duplicate stamps or events)
 * AC6: Prints break-glass warning on execution
 *
 * Strategy: Subprocess execution tests (authentic break-glass usage pattern)
 * plus static analysis of script content for structural guarantees.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_PATH = resolve(join(import.meta.dirname, '..', '..', 'scripts', 'wu-stamp.mjs'));
const TEST_WU_ID = 'WU-9999';
const TEST_WU_TITLE = 'Test break-glass stamp';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/** Create an isolated temp directory simulating a project root with git repo */
function createTestProjectRoot(): string {
  const tmpBase = join(
    tmpdir(),
    `wu-stamp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(tmpBase, { recursive: true });

  // Initialize a git repo so the script's git commands don't fail unexpectedly
  execSync('git init', { cwd: tmpBase, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpBase, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpBase, stdio: 'pipe' });

  // Create required directories
  mkdirSync(join(tmpBase, '.lumenflow', 'stamps'), { recursive: true });
  mkdirSync(join(tmpBase, '.lumenflow', 'state'), { recursive: true });

  // Create an initial commit so HEAD exists
  writeFileSync(join(tmpBase, '.gitkeep'), '');
  execSync('git add .gitkeep && git commit -m "init"', { cwd: tmpBase, stdio: 'pipe' });

  return tmpBase;
}

/** Clean up test project root */
function cleanupTestProjectRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures in test teardown
  }
}

/**
 * Copy the wu-stamp.mjs script into the test project root.
 * The script derives its project root from import.meta.dirname, so it must
 * live inside the test root's scripts/ directory for isolation.
 */
function copyScriptToTestRoot(testRoot: string): string {
  const scriptsDir = join(testRoot, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });
  const destPath = join(scriptsDir, 'wu-stamp.mjs');
  writeFileSync(destPath, content, { encoding: 'utf-8' });
  return destPath;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run wu-stamp.mjs as a subprocess in the test project root */
function runWuStamp(testRoot: string, args: string[]): RunResult {
  const scriptPath = join(testRoot, 'scripts', 'wu-stamp.mjs');
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      encoding: 'utf-8',
      cwd: testRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (error.stdout || '').toString(),
      stderr: (error.stderr || '').toString(),
      exitCode: error.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scripts/wu-stamp.mjs', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = createTestProjectRoot();
    copyScriptToTestRoot(testRoot);
  });

  afterEach(() => {
    cleanupTestProjectRoot(testRoot);
  });

  // -------------------------------------------------------------------------
  // AC6: Prints break-glass warning on execution
  // -------------------------------------------------------------------------
  describe('AC6: break-glass warning', () => {
    it('prints BREAK-GLASS warning banner on execution', () => {
      const result = runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);
      expect(result.stdout).toContain('BREAK-GLASS TOOL');
      expect(result.stdout).toContain('FOR EMERGENCY USE ONLY');
      expect(result.stdout).toContain('pnpm wu:done');
    });
  });

  // -------------------------------------------------------------------------
  // Argument validation
  // -------------------------------------------------------------------------
  describe('argument validation', () => {
    it('exits with error when --id is missing', () => {
      const result = runWuStamp(testRoot, ['--title', TEST_WU_TITLE]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('--id is required');
    });

    it('exits with error when --title is missing', () => {
      const result = runWuStamp(testRoot, ['--id', TEST_WU_ID]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('--title is required');
    });

    it('exits with error for invalid WU ID format', () => {
      const result = runWuStamp(testRoot, [
        '--id',
        'INVALID-123',
        '--title',
        TEST_WU_TITLE,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Invalid WU ID format');
    });

    it('accepts valid WU ID format (WU-XXXX)', () => {
      // Will fail at git fetch (no remote), but should pass arg validation
      const result = runWuStamp(testRoot, ['--id', 'WU-42', '--title', TEST_WU_TITLE]);
      expect(result.stderr).not.toContain('Invalid WU ID format');
      expect(result.stderr).not.toContain('--id is required');
      expect(result.stderr).not.toContain('--title is required');
    });

    it('shows help with --help flag', () => {
      const result = runWuStamp(testRoot, ['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--id');
      expect(result.stdout).toContain('--title');
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Creates valid .lumenflow/stamps/WU-XXX.done file
  // -------------------------------------------------------------------------
  describe('AC2: stamp file creation', () => {
    it('creates stamp file with correct format', () => {
      // Run the script -- will fail at git fetch/push, but stamp is created before that
      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const stampPath = join(testRoot, '.lumenflow', 'stamps', `${TEST_WU_ID}.done`);
      expect(existsSync(stampPath)).toBe(true);

      const content = readFileSync(stampPath, { encoding: 'utf-8' });
      // Verify format matches stamp-utils.ts STAMP_TEMPLATE:
      // "WU WU-XXXX \u2014 Title\nCompleted: YYYY-MM-DD\n"
      expect(content).toContain(`WU ${TEST_WU_ID}`);
      expect(content).toContain('\u2014'); // em dash
      expect(content).toContain(TEST_WU_TITLE);
      expect(content).toMatch(/Completed: \d{4}-\d{2}-\d{2}/);
    });

    it('creates stamps directory if it does not exist', () => {
      rmSync(join(testRoot, '.lumenflow', 'stamps'), { recursive: true, force: true });

      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const stampPath = join(testRoot, '.lumenflow', 'stamps', `${TEST_WU_ID}.done`);
      expect(existsSync(stampPath)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Appends valid completion event to wu-events.jsonl
  // -------------------------------------------------------------------------
  describe('AC3: event appending', () => {
    it('appends a completion event to wu-events.jsonl', () => {
      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const eventsPath = join(testRoot, '.lumenflow', 'state', 'wu-events.jsonl');
      expect(existsSync(eventsPath)).toBe(true);

      const content = readFileSync(eventsPath, { encoding: 'utf-8' });
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toBeDefined();
      const lastEvent = JSON.parse(lastLine!);

      expect(lastEvent.type).toBe('complete');
      expect(lastEvent.wuId).toBe(TEST_WU_ID);
      expect(lastEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('creates state directory and events file if they do not exist', () => {
      rmSync(join(testRoot, '.lumenflow', 'state'), { recursive: true, force: true });

      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const eventsPath = join(testRoot, '.lumenflow', 'state', 'wu-events.jsonl');
      expect(existsSync(eventsPath)).toBe(true);
    });

    it('preserves existing events when appending', () => {
      const eventsPath = join(testRoot, '.lumenflow', 'state', 'wu-events.jsonl');
      const existingEvent = JSON.stringify({
        type: 'claim',
        wuId: 'WU-1234',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      writeFileSync(eventsPath, existingEvent + '\n', { encoding: 'utf-8' });

      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const content = readFileSync(eventsPath, { encoding: 'utf-8' });
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]!).wuId).toBe('WU-1234');
      expect(JSON.parse(lines[1]!).wuId).toBe(TEST_WU_ID);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Idempotent on re-run
  // -------------------------------------------------------------------------
  describe('AC5: idempotency', () => {
    it('does not create duplicate stamp on second run', () => {
      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const stampPath = join(testRoot, '.lumenflow', 'stamps', `${TEST_WU_ID}.done`);
      const firstContent = readFileSync(stampPath, { encoding: 'utf-8' });

      const result = runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const secondContent = readFileSync(stampPath, { encoding: 'utf-8' });
      expect(secondContent).toBe(firstContent);
      expect(result.stdout).toContain('idempotent skip');
    });

    it('does not append duplicate event on second run', () => {
      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const eventsPath = join(testRoot, '.lumenflow', 'state', 'wu-events.jsonl');
      const firstContent = readFileSync(eventsPath, { encoding: 'utf-8' });
      const firstLineCount = firstContent.trim().split('\n').length;

      const result = runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const secondContent = readFileSync(eventsPath, { encoding: 'utf-8' });
      const secondLineCount = secondContent.trim().split('\n').length;
      expect(secondLineCount).toBe(firstLineCount);
      expect(result.stdout).toContain('idempotent skip');
    });

    it('reports nothing to commit when both stamp and event already exist', () => {
      runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      const result = runWuStamp(testRoot, ['--id', TEST_WU_ID, '--title', TEST_WU_TITLE]);

      expect(result.stdout).toContain('Nothing to commit');
      expect(result.exitCode).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC1: Runs without packages/*/dist
  // -------------------------------------------------------------------------
  describe('AC1: no dist dependency', () => {
    it('script file contains only node: built-in imports', () => {
      const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });

      const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
      const imports = importMatches.map((m) => {
        const match = m.match(/from\s+['"]([^'"]+)['"]/);
        return match?.[1] ?? '';
      });

      for (const imp of imports) {
        expect(imp).toMatch(/^node:/);
      }
    });

    it('script does not require or import from packages/ or dist/', () => {
      const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });

      expect(content).not.toMatch(/from\s+['"].*packages\//);
      expect(content).not.toMatch(/from\s+['"].*dist\//);
      expect(content).not.toMatch(/require\(['"].*packages\//);
      expect(content).not.toMatch(/require\(['"].*dist\//);
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Commits atomically via micro-worktree pattern
  // -------------------------------------------------------------------------
  describe('AC4: micro-worktree commit pattern', () => {
    it('script implements micro-worktree pattern', () => {
      const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });

      // The git() helper joins args, so keywords appear as separate array elements
      expect(content).toContain("'worktree', 'add'");
      expect(content).toContain("'worktree', 'remove'");
      expect(content).toContain('mktemp');
      expect(content).toContain("'push'");
      expect(content).toContain("'branch', '-D'");
    });

    it('uses LUMENFLOW_FORCE env var for break-glass bypass', () => {
      const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });
      expect(content).toContain('LUMENFLOW_FORCE');
      expect(content).toContain('LUMENFLOW_FORCE_REASON');
    });

    it('cleanup runs even on failure (try/finally pattern)', () => {
      const content = readFileSync(SCRIPT_PATH, { encoding: 'utf-8' });
      expect(content).toContain('} finally {');
      expect(content).toMatch(/finally\s*\{[\s\S]*worktree.*remove/);
    });
  });

  // -------------------------------------------------------------------------
  // Security: Input validation
  // -------------------------------------------------------------------------
  describe('security: input validation', () => {
    it('rejects WU IDs with shell injection characters', () => {
      const maliciousIds = [
        'WU-123; rm -rf /',
        'WU-123$(whoami)',
        'WU-123`whoami`',
        'WU-123 && cat /etc/passwd',
        'WU-abc',
      ];

      for (const id of maliciousIds) {
        const result = runWuStamp(testRoot, ['--id', id, '--title', TEST_WU_TITLE]);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('Invalid WU ID format');
      }
    });
  });
});
