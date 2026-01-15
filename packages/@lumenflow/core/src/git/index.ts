/**
 * @file git/index.ts
 * @description Git utilities for LumenFlow workflow management
 *
 * Exports:
 * - GitAdapter: Core git operations wrapper
 * - WorktreeManager: Git worktree lifecycle management
 */

export {
  GitAdapter,
  createGitAdapter,
  type GitAdapterOptions,
  type GitStatus,
  type PushOptions,
  type FetchOptions,
  type CommitResult,
  type MergeResult,
} from './git-adapter.js';

export {
  WorktreeManager,
  createWorktreeManager,
  type WorktreeManagerOptions,
  type WorktreeInfo,
  type WorktreeCreateOptions,
  type WorktreeRemoveOptions,
  type WorktreeCreateResult,
} from './worktree-manager.js';
