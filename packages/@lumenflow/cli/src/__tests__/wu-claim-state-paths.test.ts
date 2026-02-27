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
  normalizeClaimPathForWorktree,
  resolveClaimPathInWorktree,
  getWorktreeCommitFiles,
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

describe('WU-2259: claim path isolation for micro-worktree writes', () => {
  it('normalizes absolute source-root paths to repo-relative claim metadata paths', () => {
    const normalized = normalizeClaimPathForWorktree(
      '/repo/docs/04-operations/tasks/wu/WU-2259.yaml',
      '/repo',
    );

    expect(normalized).toBe('docs/04-operations/tasks/wu/WU-2259.yaml');
  });

  it('resolves absolute source-root paths under the micro-worktree root', () => {
    const resolved = resolveClaimPathInWorktree(
      '/repo/docs/04-operations/tasks/status.md',
      '/tmp/micro-wu-2259',
      '/repo',
    );

    expect(resolved).toBe('/tmp/micro-wu-2259/docs/04-operations/tasks/status.md');
  });

  it('keeps already-relative claim metadata paths stable', () => {
    const normalized = normalizeClaimPathForWorktree('docs/04-operations/tasks/backlog.md', '/r');
    const resolved = resolveClaimPathInWorktree(
      '.lumenflow/state/wu-events.jsonl',
      '/tmp/micro',
      '/r',
    );

    expect(normalized).toBe('docs/04-operations/tasks/backlog.md');
    expect(resolved).toBe('/tmp/micro/.lumenflow/state/wu-events.jsonl');
  });

  it('returns repo-relative worktree commit files even when directories are configured as absolute', () => {
    const tmpDir = createTempDir();
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    clearConfigCache();

    try {
      const absoluteWuDir = path.join(tmpDir, 'docs/04-operations/tasks/wu');
      writeFileSync(
        path.join(tmpDir, 'workspace.yaml'),
        `software_delivery:
  directories:
    wuDir: ${absoluteWuDir}
  state:
    stateDir: ${path.join(tmpDir, '.lumenflow/state')}
`,
        { encoding: 'utf-8' },
      );

      const files = getWorktreeCommitFiles('WU-2259');
      expect(files).toContain('docs/04-operations/tasks/wu/WU-2259.yaml');
      expect(files).toContain('.lumenflow/state/wu-events.jsonl');
      expect(files.some((filePath) => path.isAbsolute(filePath))).toBe(false);
    } finally {
      clearConfigCache();
      process.chdir(previousCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
