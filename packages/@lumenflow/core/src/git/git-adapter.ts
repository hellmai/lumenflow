/**
 * @file git-adapter.ts
 * @description Core git operations wrapper using simple-git
 *
 * Provides type-safe, dependency-injectable git operations for LumenFlow tooling.
 * Designed for use in wu:claim, wu:done, and other workflow commands.
 */

import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';

/**
 * Normalized git status information
 */
export interface GitStatus {
  /** True if working tree has no changes */
  isClean: boolean;
  /** Files with unstaged modifications */
  modified: string[];
  /** Files staged for commit */
  staged: string[];
  /** Untracked files */
  untracked: string[];
  /** Deleted files */
  deleted: string[];
  /** Renamed files */
  renamed: string[];
  /** Files with merge conflicts */
  conflicted: string[];
}

/**
 * Options for creating a GitAdapter
 */
export interface GitAdapterOptions {
  /** Simple-git instance for dependency injection (testing) */
  git?: SimpleGit;
  /** Base directory for git operations */
  baseDir?: string;
}

/**
 * Options for push operation
 */
export interface PushOptions {
  /** Remote name (default: 'origin') */
  remote?: string;
  /** Branch name */
  branch?: string;
  /** Set upstream tracking (-u flag) */
  setUpstream?: boolean;
}

/**
 * Options for fetch operation
 */
export interface FetchOptions {
  /** Remote name */
  remote?: string;
  /** Branch name */
  branch?: string;
}

/**
 * Result of a commit operation
 */
export interface CommitResult {
  /** Commit hash */
  hash: string;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  /** Whether merge succeeded */
  success: boolean;
}

/** simple-git TaskOptions compatible type */
type GitTaskOptions = Record<string, string | number | null | (string | number)[]>;

/**
 * GitAdapter - Core git operations with type safety and DI support
 *
 * @example
 * \`\`\`ts
 * const git = createGitAdapter({ baseDir: '/path/to/repo' });
 * const status = await git.getStatus();
 * if (!status.isClean) {
 *   await git.add('.');
 *   await git.commit('chore: update files');
 *   await git.push();
 * }
 * \`\`\`
 */
export class GitAdapter {
  private readonly git: SimpleGit;

  constructor(options: GitAdapterOptions = {}) {
    this.git = options.git ?? simpleGit(options.baseDir);
  }

  /**
   * Get current git status
   * @returns Normalized status information
   */
  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();
    return {
      isClean: status.isClean(),
      modified: status.modified,
      staged: status.staged,
      untracked: [...status.not_added, ...status.created],
      deleted: status.deleted,
      renamed: status.renamed.map((r) => r.to),
      conflicted: status.conflicted,
    };
  }

  /**
   * Check if working tree is clean
   * @returns True if no uncommitted changes
   */
  async isClean(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isClean;
  }

  /**
   * Add files to staging area
   * @param files - File path(s) to add
   */
  async add(files: string | string[]): Promise<void> {
    await this.git.add(files);
  }

  /**
   * Commit staged changes
   * @param message - Commit message
   * @returns Commit result with hash
   * @throws Error if message is empty
   */
  async commit(message: string): Promise<CommitResult> {
    if (!message) {
      throw new Error('Commit message is required');
    }
    const result = await this.git.commit(message);
    return { hash: result.commit };
  }

  /**
   * Push to remote repository
   * @param options - Push options
   */
  async push(options: PushOptions = {}): Promise<void> {
    const remote = options.remote ?? 'origin';
    const pushFlags: GitTaskOptions = {};

    if (options.setUpstream) {
      pushFlags['-u'] = null;
    }

    await this.git.push(remote, options.branch, pushFlags);
  }

  /**
   * Perform fast-forward only merge
   * @param branch - Branch to merge
   * @returns Merge result
   * @throws Error if branch is empty or merge fails
   */
  async mergeFastForward(branch: string): Promise<MergeResult> {
    if (!branch) {
      throw new Error('Branch name is required');
    }
    await this.git.merge(['--ff-only', branch]);
    return { success: true };
  }

  /**
   * Get current branch name
   * @returns Branch name
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  /**
   * Check if a branch exists
   * @param branch - Branch name to check
   * @returns True if branch exists
   */
  async branchExists(branch: string): Promise<boolean> {
    try {
      await this.git.raw(['rev-parse', '--verify', branch]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch from remote
   * @param options - Fetch options
   */
  async fetch(options: FetchOptions = {}): Promise<void> {
    if (options.remote && options.branch) {
      await this.git.fetch(options.remote, options.branch);
    } else if (options.remote) {
      await this.git.fetch(options.remote);
    } else {
      await this.git.fetch();
    }
  }

  /**
   * Get commit hash for a ref
   * @param ref - Git ref (default: HEAD)
   * @returns Commit hash
   */
  async getCommitHash(ref = 'HEAD'): Promise<string> {
    const result = await this.git.revparse([ref]);
    return result.trim();
  }

  /**
   * Create and checkout a new branch
   * @param branch - Branch name
   * @param startPoint - Starting commit (optional)
   */
  async createBranch(branch: string, startPoint?: string): Promise<void> {
    const args = ['-b', branch];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.git.checkout(args);
  }

  /**
   * Checkout an existing branch
   * @param branch - Branch name
   */
  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  /**
   * Delete a branch
   * @param branch - Branch name
   * @param options - Delete options
   */
  async deleteBranch(branch: string, options: { force?: boolean } = {}): Promise<void> {
    const flag = options.force ? '-D' : '-d';
    await this.git.branch([flag, branch]);
  }

  /**
   * Execute raw git command
   * @param args - Command arguments
   * @returns Command output
   */
  async raw(args: string[]): Promise<string> {
    return this.git.raw(args);
  }
}

/**
 * Factory function to create a GitAdapter
 * @param options - Adapter options
 * @returns New GitAdapter instance
 */
export function createGitAdapter(options: GitAdapterOptions = {}): GitAdapter {
  return new GitAdapter(options);
}
