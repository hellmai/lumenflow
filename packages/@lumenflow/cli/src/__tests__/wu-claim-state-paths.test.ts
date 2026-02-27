// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearConfigCache } from '@lumenflow/core/config';
import {
  removeFromReadyAndAddToInProgressBacklog,
  toRelativeClaimWorktreePathForStorage,
} from '../wu-claim-state.js';

function createTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'lumenflow-wu-claim-state-'));
}

describe('removeFromReadyAndAddToInProgressBacklog', () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    previousCwd = process.cwd();
    process.chdir(tmpDir);
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
    process.chdir(previousCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes status projection to provided statusPath instead of backlog-relative sibling path', async () => {
    const backlogPath = path.join(tmpDir, 'planning', 'backlog.md');
    const statusPath = path.join(tmpDir, 'boards', 'status-board.md');
    const legacySiblingStatusPath = path.join(tmpDir, 'planning', 'status.md');

    writeFileSync(
      path.join(tmpDir, 'workspace.yaml'),
      `software_delivery:
  directories:
    backlogPath: planning/backlog.md
`,
      { encoding: 'utf-8' },
    );

    mkdirSync(path.dirname(backlogPath), { recursive: true });
    mkdirSync(path.dirname(statusPath), { recursive: true });

    await removeFromReadyAndAddToInProgressBacklog(
      backlogPath,
      statusPath,
      'WU-9090',
      'Config-driven status path projection',
      'Framework: Core Lifecycle',
    );

    expect(existsSync(backlogPath)).toBe(true);
    expect(existsSync(statusPath)).toBe(true);
    expect(existsSync(legacySiblingStatusPath)).toBe(false);
  });
});

describe('toRelativeClaimWorktreePathForStorage', () => {
  it('converts absolute worktree path to repo-relative path', () => {
    const value = toRelativeClaimWorktreePathForStorage(
      '/home/USER/source/hellmai/lumenflow-dev/worktrees/framework-cli-wu-commands-wu-2250',
      '/home/USER/source/hellmai/lumenflow-dev',
    );

    expect(value).toBe('worktrees/framework-cli-wu-commands-wu-2250');
  });

  it('normalizes relative path separators and strips leading dot segments', () => {
    const value = toRelativeClaimWorktreePathForStorage(
      './worktrees\\framework-cli-wu-commands-wu-2250',
      '/home/USER/source/hellmai/lumenflow-dev',
    );

    expect(value).toBe('worktrees/framework-cli-wu-commands-wu-2250');
  });
});
