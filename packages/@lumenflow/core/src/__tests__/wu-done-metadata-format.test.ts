// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

// WU-2395: stageAndFormatMetadata must NOT pass .yaml files to prettier.
// WU YAML is already correctly formatted by writeWU (yaml.stringify). Passing it
// to prettier causes silent no-ops (no yaml plugin) or reformatting mismatches,
// both of which cause consumer CI format:check failures.

import { beforeEach, describe, it, expect, vi } from 'vitest';

const { mockExec, mockGit } = vi.hoisted(() => {
  const mockExec = vi.fn((_cmd: string, cb: (err: null, stdout: string) => void) => cb(null, ''));
  const mockGit = {
    add: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined),
  };
  return { mockExec, mockGit };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, exec: mockExec };
});

vi.mock('../git-adapter.js', () => ({
  getGitForCwd: () => mockGit,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

describe('stageAndFormatMetadata prettier targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockImplementation((_cmd: string, cb: (err: null, stdout: string) => void) =>
      cb(null, ''),
    );
    mockGit.add.mockResolvedValue(undefined);
    mockGit.raw.mockResolvedValue(undefined);
  });

  it('does not pass the WU yaml file to prettier', async () => {
    const { stageAndFormatMetadata } = await import('../wu-done-metadata.js');

    const wuPath = '/repo/docs/tasks/wu/WU-2395.yaml';
    const statusPath = '/repo/docs/tasks/status.md';
    const backlogPath = '/repo/docs/tasks/backlog.md';

    await stageAndFormatMetadata({
      id: 'WU-2395',
      wuPath,
      statusPath,
      backlogPath,
      stampsDir: '/repo/.lumenflow/stamps',
    });

    const calls = mockExec.mock.calls;
    const prettierCall = calls.find(([cmd]) => String(cmd).includes('prettier'));
    expect(prettierCall).toBeDefined();
    const cmd = String(prettierCall![0]);
    expect(cmd).not.toContain('WU-2395.yaml');
    expect(cmd).toContain('status.md');
    expect(cmd).toContain('backlog.md');
  });

  it('does not pass an initiative yaml file to prettier when provided', async () => {
    const { stageAndFormatMetadata } = await import('../wu-done-metadata.js');

    const wuPath = '/repo/docs/tasks/wu/WU-2395.yaml';
    const statusPath = '/repo/docs/tasks/status.md';
    const backlogPath = '/repo/docs/tasks/backlog.md';
    const initiativePath = '/repo/docs/tasks/initiatives/INIT-001.yaml';

    await stageAndFormatMetadata({
      id: 'WU-2395',
      wuPath,
      statusPath,
      backlogPath,
      stampsDir: '/repo/.lumenflow/stamps',
      initiativePath,
    });

    const calls = mockExec.mock.calls;
    const prettierCall = calls.find(([cmd]) => String(cmd).includes('prettier'));
    expect(prettierCall).toBeDefined();
    const cmd = String(prettierCall![0]);
    expect(cmd).not.toContain('WU-2395.yaml');
    expect(cmd).not.toContain('INIT-001.yaml');
    expect(cmd).toContain('status.md');
    expect(cmd).toContain('backlog.md');
  });
});
