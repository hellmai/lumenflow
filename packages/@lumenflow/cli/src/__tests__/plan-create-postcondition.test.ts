// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tests for plan:create post-condition verification (WU-2391)
 *
 * Bug: plan:create reported success when withMicroWorktree completed
 * but the plan file was not actually committed to the target branch.
 * The command must verify the file landed before reporting success,
 * and surface git errors clearly on failure.
 *
 * TDD: Failing tests written BEFORE implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Track withMicroWorktree mock behavior
let mockWithMicroWorktreeImpl: (...args: unknown[]) => Promise<unknown>;

vi.mock('@lumenflow/core/git-adapter', () => {
  const mockShowFileAtRef = vi.fn().mockResolvedValue('# plan content');
  return {
    getGitForCwd: vi.fn(() => ({
      branch: vi.fn().mockResolvedValue({ current: 'main' }),
      status: vi.fn().mockResolvedValue({ isClean: () => true }),
      fetch: vi.fn().mockResolvedValue(undefined),
      showFileAtRef: mockShowFileAtRef,
    })),
    createGitForPath: vi.fn(() => ({
      showFileAtRef: mockShowFileAtRef,
    })),
    __mockShowFileAtRef: mockShowFileAtRef,
  };
});

vi.mock('@lumenflow/core/wu-helpers', () => ({
  ensureOnMain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@lumenflow/core/micro-worktree', () => ({
  withMicroWorktree: vi.fn(async (opts: Record<string, unknown>) => {
    return mockWithMicroWorktreeImpl(opts);
  }),
}));

vi.mock('@lumenflow/core/arg-parser', () => ({
  createWUParser: vi.fn(() => ({
    id: 'WU-9999',
    title: 'Test Plan',
    from: undefined,
  })),
  WU_OPTIONS: { id: {}, title: {} },
}));

vi.mock('./cli-entry-point.js', () => ({
  runCLI: vi.fn(),
}));

describe('plan:create post-condition verification (WU-2391)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `plan-create-postcond-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Default: withMicroWorktree succeeds and creates the file
    mockWithMicroWorktreeImpl = async (opts: unknown) => {
      const options = opts as { execute: (ctx: { worktreePath: string }) => Promise<unknown> };
      const result = await options.execute({ worktreePath: tempDir });
      return { ...(result as object), ref: 'FETCH_HEAD' };
    };
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('should exit non-zero when withMicroWorktree throws (commit/push failure)', async () => {
    // Simulate withMicroWorktree throwing an error (push failed)
    mockWithMicroWorktreeImpl = async () => {
      throw new Error('Push failed after 3 attempts. Origin main may have significant traffic.');
    };

    const { main } = await import('../plan-create.js');

    // main() calls die() on error, which calls process.exit(1)
    // We verify it throws/rejects rather than resolving successfully
    await expect(main()).rejects.toThrow(/Push failed/);
  });

  it('should surface the underlying git error message on failure', async () => {
    const gitError = 'remote: Permission denied to push to refs/heads/main';
    mockWithMicroWorktreeImpl = async () => {
      throw new Error(gitError);
    };

    const { main } = await import('../plan-create.js');

    await expect(main()).rejects.toThrow(gitError);
  });

  it('should verify plan file exists on target branch after push', async () => {
    // withMicroWorktree resolves (push "succeeded") but file is NOT on origin/main
    const { __mockShowFileAtRef: mockShow } =
      (await import('@lumenflow/core/git-adapter')) as unknown as {
        __mockShowFileAtRef: ReturnType<typeof vi.fn>;
      };
    mockShow.mockResolvedValue(''); // Empty = file not found on ref

    const { main } = await import('../plan-create.js');

    await expect(main()).rejects.toThrow(/plan file.*not found.*after push/i);
  });

  it('should succeed when plan file is verified on target branch', async () => {
    const { __mockShowFileAtRef: mockShow } =
      (await import('@lumenflow/core/git-adapter')) as unknown as {
        __mockShowFileAtRef: ReturnType<typeof vi.fn>;
      };
    mockShow.mockResolvedValue('# WU-9999 Plan - Test Plan\n');

    const { main } = await import('../plan-create.js');

    // Should resolve without error
    await expect(main()).resolves.toBeUndefined();
  });
});
