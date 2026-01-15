/**
 * @file git-adapter.test.ts
 * @description Tests for GitAdapter - core git operations wrapper
 *
 * TDD: Write tests first, then implementation
 * RED phase confirmed - tests fail without implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SimpleGit, StatusResult, BranchSummary } from 'simple-git';
import { GitAdapter, createGitAdapter } from '../../src/git/git-adapter.js';

// Mock simple-git module
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

describe('GitAdapter', () => {
  let mockGit: {
    status: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
    branch: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
    pull: ReturnType<typeof vi.fn>;
    raw: ReturnType<typeof vi.fn>;
    revparse: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGit = {
      status: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      merge: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      raw: vi.fn(),
      revparse: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept a simple-git instance via dependency injection', () => {
      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      expect(adapter).toBeInstanceOf(GitAdapter);
    });

    it('should accept a baseDir option', () => {
      const adapter = new GitAdapter({
        git: mockGit as unknown as SimpleGit,
        baseDir: '/some/path',
      });
      expect(adapter).toBeInstanceOf(GitAdapter);
    });
  });

  describe('getStatus', () => {
    it('should return git status information', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(true),
        modified: [],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        created: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const status = await adapter.getStatus();

      expect(mockGit.status).toHaveBeenCalled();
      expect(status).toEqual({
        isClean: true,
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        renamed: [],
        conflicted: [],
      });
    });

    it('should report modified files', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(false),
        modified: ['file1.ts', 'file2.ts'],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        created: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const status = await adapter.getStatus();

      expect(status.isClean).toBe(false);
      expect(status.modified).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should report untracked files from not_added and created', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(false),
        modified: [],
        staged: [],
        not_added: ['untracked1.ts'],
        created: ['created1.ts'],
        deleted: [],
        renamed: [],
        conflicted: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const status = await adapter.getStatus();

      expect(status.untracked).toContain('untracked1.ts');
      expect(status.untracked).toContain('created1.ts');
    });
  });

  describe('commit', () => {
    it('should commit with the provided message', async () => {
      mockGit.commit.mockResolvedValue({ commit: 'abc123' });

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const result = await adapter.commit('feat: add new feature');

      expect(mockGit.commit).toHaveBeenCalledWith('feat: add new feature');
      expect(result).toEqual({ hash: 'abc123' });
    });

    it('should throw if message is empty', async () => {
      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });

      await expect(adapter.commit('')).rejects.toThrow('Commit message is required');
    });
  });

  describe('push', () => {
    it('should push to origin by default', async () => {
      mockGit.push.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.push();

      expect(mockGit.push).toHaveBeenCalledWith('origin', undefined, {});
    });

    it('should push to specified remote and branch', async () => {
      mockGit.push.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.push({ remote: 'upstream', branch: 'main' });

      expect(mockGit.push).toHaveBeenCalledWith('upstream', 'main', {});
    });

    it('should support setUpstream option', async () => {
      mockGit.push.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.push({ branch: 'feature', setUpstream: true });

      expect(mockGit.push).toHaveBeenCalledWith('origin', 'feature', { '-u': null });
    });
  });

  describe('mergeFastForward', () => {
    it('should perform fast-forward only merge', async () => {
      mockGit.merge.mockResolvedValue({ result: 'success' });

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const result = await adapter.mergeFastForward('feature-branch');

      expect(mockGit.merge).toHaveBeenCalledWith(['--ff-only', 'feature-branch']);
      expect(result).toEqual({ success: true });
    });

    it('should throw if branch name is empty', async () => {
      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });

      await expect(adapter.mergeFastForward('')).rejects.toThrow('Branch name is required');
    });

    it('should report failure if merge fails', async () => {
      mockGit.merge.mockRejectedValue(new Error('Not possible to fast-forward'));

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });

      await expect(adapter.mergeFastForward('diverged-branch')).rejects.toThrow(
        'Not possible to fast-forward',
      );
    });
  });

  describe('add', () => {
    it('should add files to staging', async () => {
      mockGit.add.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.add(['file1.ts', 'file2.ts']);

      expect(mockGit.add).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
    });

    it('should accept a single file string', async () => {
      mockGit.add.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.add('file.ts');

      expect(mockGit.add).toHaveBeenCalledWith('file.ts');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      mockGit.revparse.mockResolvedValue('main\n');

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const branch = await adapter.getCurrentBranch();

      expect(mockGit.revparse).toHaveBeenCalledWith(['--abbrev-ref', 'HEAD']);
      expect(branch).toBe('main');
    });
  });

  describe('branchExists', () => {
    it('should return true if branch exists', async () => {
      mockGit.raw.mockResolvedValue('abc123\n');

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const exists = await adapter.branchExists('feature');

      expect(mockGit.raw).toHaveBeenCalledWith(['rev-parse', '--verify', 'feature']);
      expect(exists).toBe(true);
    });

    it('should return false if branch does not exist', async () => {
      mockGit.raw.mockRejectedValue(new Error('unknown revision'));

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const exists = await adapter.branchExists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('fetch', () => {
    it('should fetch from remote', async () => {
      mockGit.fetch.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.fetch();

      expect(mockGit.fetch).toHaveBeenCalled();
    });

    it('should fetch specific remote and branch', async () => {
      mockGit.fetch.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.fetch({ remote: 'origin', branch: 'main' });

      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'main');
    });
  });

  describe('isClean', () => {
    it('should return true when working tree is clean', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(true),
        modified: [],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        created: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const clean = await adapter.isClean();

      expect(clean).toBe(true);
    });

    it('should return false when there are changes', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(false),
        modified: ['file.ts'],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        created: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const clean = await adapter.isClean();

      expect(clean).toBe(false);
    });
  });
});

describe('createGitAdapter', () => {
  it('should create a GitAdapter with default options', () => {
    // Note: This will use actual simple-git in integration tests
    // For unit tests, we just verify the factory function exists
    expect(typeof createGitAdapter).toBe('function');
  });
});

describe('GitAdapter - additional coverage', () => {
  let mockGit: {
    status: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
    branch: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
    raw: ReturnType<typeof vi.fn>;
    revparse: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGit = {
      status: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      merge: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      fetch: vi.fn(),
      raw: vi.fn(),
      revparse: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch - remote only', () => {
    it('should fetch with only remote specified', async () => {
      mockGit.fetch.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.fetch({ remote: 'upstream' });

      expect(mockGit.fetch).toHaveBeenCalledWith('upstream');
    });
  });

  describe('getCommitHash', () => {
    it('should return commit hash for HEAD', async () => {
      mockGit.revparse.mockResolvedValue('abc123def456\n');

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const hash = await adapter.getCommitHash();

      expect(mockGit.revparse).toHaveBeenCalledWith(['HEAD']);
      expect(hash).toBe('abc123def456');
    });

    it('should return commit hash for specific ref', async () => {
      mockGit.revparse.mockResolvedValue('xyz789\n');

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const hash = await adapter.getCommitHash('origin/main');

      expect(mockGit.revparse).toHaveBeenCalledWith(['origin/main']);
      expect(hash).toBe('xyz789');
    });
  });

  describe('createBranch', () => {
    it('should create and checkout a new branch', async () => {
      mockGit.checkout.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.createBranch('feature/new-feature');

      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', 'feature/new-feature']);
    });

    it('should create branch from a start point', async () => {
      mockGit.checkout.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.createBranch('hotfix/bug', 'main');

      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', 'hotfix/bug', 'main']);
    });
  });

  describe('checkout', () => {
    it('should checkout an existing branch', async () => {
      mockGit.checkout.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.checkout('develop');

      expect(mockGit.checkout).toHaveBeenCalledWith('develop');
    });
  });

  describe('deleteBranch', () => {
    it('should delete a branch', async () => {
      mockGit.branch.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.deleteBranch('old-feature');

      expect(mockGit.branch).toHaveBeenCalledWith(['-d', 'old-feature']);
    });

    it('should force delete a branch', async () => {
      mockGit.branch.mockResolvedValue({});

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      await adapter.deleteBranch('unmerged-feature', { force: true });

      expect(mockGit.branch).toHaveBeenCalledWith(['-D', 'unmerged-feature']);
    });
  });

  describe('raw', () => {
    it('should execute raw git commands', async () => {
      mockGit.raw.mockResolvedValue('command output\n');

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const output = await adapter.raw(['log', '--oneline', '-5']);

      expect(mockGit.raw).toHaveBeenCalledWith(['log', '--oneline', '-5']);
      expect(output).toBe('command output\n');
    });
  });

  describe('getStatus - renamed files', () => {
    it('should report renamed files correctly', async () => {
      const mockStatus: Partial<StatusResult> = {
        isClean: vi.fn().mockReturnValue(false),
        modified: [],
        staged: [],
        not_added: [],
        deleted: [],
        renamed: [{ from: 'old.ts', to: 'new.ts' }],
        conflicted: [],
        created: [],
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const adapter = new GitAdapter({ git: mockGit as unknown as SimpleGit });
      const status = await adapter.getStatus();

      expect(status.renamed).toContain('new.ts');
    });
  });
});
