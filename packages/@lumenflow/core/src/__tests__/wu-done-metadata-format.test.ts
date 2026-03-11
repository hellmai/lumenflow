// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

// WU-2396: wu:done metadata must be formatted and verified with the
// consumer repo's Prettier before commit. YAML files must stay in the target
// set because writeWU() output does not necessarily match prettier --check.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFile, mockGit } = vi.hoisted(() => {
  const mockExecFile = vi.fn(
    (
      _command: string,
      _args: readonly string[],
      _options: { cwd?: string } | undefined,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => callback(null, '', ''),
  );
  const mockGit = {
    add: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined),
  };
  return { mockExecFile, mockGit };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, execFile: mockExecFile };
});

vi.mock('../git-adapter.js', () => ({
  getGitForCwd: () => mockGit,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

describe('stageAndFormatMetadata prettier verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: { cwd?: string } | undefined,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(null, '', ''),
    );
    mockGit.add.mockResolvedValue(undefined);
    mockGit.raw.mockResolvedValue(undefined);
  });

  it('formats and verifies YAML and markdown files from the provided repo root', async () => {
    const { stageAndFormatMetadata } = await import('../wu-done-metadata.js');

    const wuPath = '/repo/docs/tasks/wu/WU-2396.yaml';
    const initiativePath = '/repo/docs/tasks/initiatives/INIT-001.yaml';
    const statusPath = '/repo/docs/tasks/status.md';
    const backlogPath = '/repo/docs/tasks/backlog.md';
    const filesToFormat = [wuPath, statusPath, backlogPath, initiativePath];

    await stageAndFormatMetadata({
      id: 'WU-2396',
      wuPath,
      statusPath,
      backlogPath,
      stampsDir: '/repo/.lumenflow/stamps',
      initiativePath,
      repoRoot: '/repo',
    });

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['exec', 'prettier', '--write', ...filesToFormat],
      { cwd: '/repo' },
      expect.any(Function),
    );
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['exec', 'prettier', '--check', ...filesToFormat],
      { cwd: '/repo' },
      expect.any(Function),
    );
    expect(mockGit.add).toHaveBeenNthCalledWith(2, filesToFormat);
  });

  it('aborts when the post-format prettier check still fails', async () => {
    const { stageAndFormatMetadata } = await import('../wu-done-metadata.js');

    mockExecFile
      .mockImplementationOnce(
        (
          _command: string,
          _args: readonly string[],
          _options: { cwd?: string } | undefined,
          callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => callback(null, '', ''),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: readonly string[],
          _options: { cwd?: string } | undefined,
          callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => callback(new Error('prettier check failed'), '', ''),
      );

    await expect(
      stageAndFormatMetadata({
        id: 'WU-2396',
        wuPath: '/repo/docs/tasks/wu/WU-2396.yaml',
        statusPath: '/repo/docs/tasks/status.md',
        backlogPath: '/repo/docs/tasks/backlog.md',
        stampsDir: '/repo/.lumenflow/stamps',
        repoRoot: '/repo',
      }),
    ).rejects.toThrow('Failed to format metadata with Prettier');

    expect(mockGit.add).toHaveBeenCalledTimes(1);
  });
});
