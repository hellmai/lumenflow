/**
 * @file worktree-manager.test.ts
 * @description Tests for WorktreeManager - git worktree lifecycle management
 *
 * TDD: Write tests first, then implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SimpleGit } from 'simple-git';
import { WorktreeManager, createWorktreeManager } from '../../src/git/worktree-manager.js';
import { GitAdapter } from '../../src/git/git-adapter.js';
import * as fs from 'node:fs';

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
}));

describe('WorktreeManager', () => {
  let mockGit: {
    status: ReturnType<typeof vi.fn>;
    raw: ReturnType<typeof vi.fn>;
    branch: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
  };
  let mockAdapter: GitAdapter;

  beforeEach(() => {
    mockGit = {
      status: vi.fn().mockResolvedValue({
        isClean: vi.fn().mockReturnValue(true),
        modified: [],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        created: [],
      }),
      raw: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
    };
    mockAdapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept a GitAdapter instance', () => {
      const manager = new WorktreeManager({ git: mockAdapter });
      expect(manager).toBeInstanceOf(WorktreeManager);
    });

    it('should accept a baseDir option', () => {
      const manager = new WorktreeManager({
        git: mockAdapter,
        baseDir: '/path/to/repo',
      });
      expect(manager).toBeInstanceOf(WorktreeManager);
    });
  });

  describe('create', () => {
    it('should create a worktree with a new branch', async () => {
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      const result = await manager.create({
        path: 'worktrees/feature-wu-123',
        branch: 'lane/feature/wu-123',
      });

      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree',
        'add',
        'worktrees/feature-wu-123',
        '-b',
        'lane/feature/wu-123',
      ]);
      expect(result).toEqual({
        path: 'worktrees/feature-wu-123',
        branch: 'lane/feature/wu-123',
      });
    });

    it('should create a worktree from a start point', async () => {
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      await manager.create({
        path: 'worktrees/feature-wu-123',
        branch: 'lane/feature/wu-123',
        startPoint: 'origin/main',
      });

      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree',
        'add',
        'worktrees/feature-wu-123',
        '-b',
        'lane/feature/wu-123',
        'origin/main',
      ]);
    });

    it('should throw if path is empty', async () => {
      const manager = new WorktreeManager({ git: mockAdapter });

      await expect(
        manager.create({
          path: '',
          branch: 'lane/feature/wu-123',
        }),
      ).rejects.toThrow('Worktree path is required');
    });

    it('should throw if branch is empty', async () => {
      const manager = new WorktreeManager({ git: mockAdapter });

      await expect(
        manager.create({
          path: 'worktrees/feature',
          branch: '',
        }),
      ).rejects.toThrow('Branch name is required');
    });
  });

  describe('remove', () => {
    it('should remove a worktree', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      await manager.remove('worktrees/feature-wu-123');

      expect(mockGit.raw).toHaveBeenCalledWith(['worktree', 'remove', 'worktrees/feature-wu-123']);
    });

    it('should force remove if option is set', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      await manager.remove('worktrees/feature-wu-123', { force: true });

      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree',
        'remove',
        '--force',
        'worktrees/feature-wu-123',
      ]);
    });

    it('should clean up orphan directory after remove', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // Initial check
        .mockReturnValueOnce(true); // Post-remove check
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      await manager.remove('worktrees/feature-wu-123');

      expect(fs.rmSync).toHaveBeenCalledWith('worktrees/feature-wu-123', {
        recursive: true,
        force: true,
      });
    });

    it('should not fail if worktree does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const manager = new WorktreeManager({ git: mockAdapter });
      // Should not throw
      await expect(manager.remove('worktrees/nonexistent')).resolves.not.toThrow();
    });

    it('should clean up directory even if git worktree remove fails', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockGit.raw.mockRejectedValue(new Error('worktree not found'));

      const manager = new WorktreeManager({ git: mockAdapter });

      // Should not throw - cleanup is best-effort
      await expect(manager.remove('worktrees/broken')).resolves.not.toThrow();
      expect(fs.rmSync).toHaveBeenCalledWith('worktrees/broken', {
        recursive: true,
        force: true,
      });
    });

    it('should throw if path is empty', async () => {
      const manager = new WorktreeManager({ git: mockAdapter });

      await expect(manager.remove('')).rejects.toThrow('Worktree path is required');
    });
  });

  describe('list', () => {
    it('should return list of worktrees', async () => {
      const porcelainOutput = `worktree /home/user/repo
HEAD abc123
branch refs/heads/main

worktree /home/user/repo/worktrees/feature-wu-123
HEAD def456
branch refs/heads/lane/feature/wu-123

`;
      mockGit.raw.mockResolvedValue(porcelainOutput);

      const manager = new WorktreeManager({ git: mockAdapter });
      const worktrees = await manager.list();

      expect(mockGit.raw).toHaveBeenCalledWith(['worktree', 'list', '--porcelain']);
      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).toEqual({
        path: '/home/user/repo',
        head: 'abc123',
        branch: 'main',
      });
      expect(worktrees[1]).toEqual({
        path: '/home/user/repo/worktrees/feature-wu-123',
        head: 'def456',
        branch: 'lane/feature/wu-123',
      });
    });

    it('should handle detached HEAD', async () => {
      const porcelainOutput = `worktree /home/user/repo
HEAD abc123
detached

`;
      mockGit.raw.mockResolvedValue(porcelainOutput);

      const manager = new WorktreeManager({ git: mockAdapter });
      const worktrees = await manager.list();

      expect(worktrees[0]).toEqual({
        path: '/home/user/repo',
        head: 'abc123',
        branch: null,
      });
    });

    it('should handle empty worktree list', async () => {
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      const worktrees = await manager.list();

      expect(worktrees).toHaveLength(0);
    });
  });

  describe('exists', () => {
    it('should return true if worktree exists', async () => {
      const porcelainOutput = `worktree /home/user/repo/worktrees/feature-wu-123
HEAD def456
branch refs/heads/lane/feature/wu-123

`;
      mockGit.raw.mockResolvedValue(porcelainOutput);

      const manager = new WorktreeManager({ git: mockAdapter });
      const exists = await manager.exists('/home/user/repo/worktrees/feature-wu-123');

      expect(exists).toBe(true);
    });

    it('should return false if worktree does not exist', async () => {
      mockGit.raw.mockResolvedValue('');

      const manager = new WorktreeManager({ git: mockAdapter });
      const exists = await manager.exists('/nonexistent/path');

      expect(exists).toBe(false);
    });
  });
});

describe('createWorktreeManager', () => {
  it('should be a factory function', () => {
    expect(typeof createWorktreeManager).toBe('function');
  });
});
